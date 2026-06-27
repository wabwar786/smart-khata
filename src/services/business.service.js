const { query, withTransaction } = require('../db');
const { ApiError } = require('../utils/api-error');

async function createBusiness(userId, payload) {
  return withTransaction(async (client) => {
    const businessRes = await client.query(
      `INSERT INTO businesses(owner_user_id, business_name, business_type, phone_number, whatsapp_number, email, address, city, country, currency_code)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,COALESCE($9,'Pakistan'),COALESCE($10,'PKR'))
       RETURNING business_id, public_id, business_name, currency_code`,
      [userId, payload.businessName, payload.businessType || null, payload.phoneNumber || null, payload.whatsAppNumber || payload.phoneNumber || null, payload.email || null, payload.address || null, payload.city || null, payload.country || 'Pakistan', payload.currencyCode || 'PKR']
    );
    const business = businessRes.rows[0];
    const ownerRole = await client.query(`SELECT role_id FROM roles WHERE role_code='OWNER' LIMIT 1`);
    if (ownerRole.rowCount === 0) throw new ApiError(500, 'OWNER role is missing.');

    await client.query(
      `INSERT INTO business_users(business_id, user_id, role_id, is_owner, created_by) VALUES($1,$2,$3,TRUE,$2)`,
      [business.business_id, userId, ownerRole.rows[0].role_id]
    );
    await client.query(`INSERT INTO business_settings(business_id) VALUES($1)`, [business.business_id]);
    await client.query(
      `INSERT INTO document_sequences(business_id, document_type, prefix)
       VALUES ($1,'SALE_INVOICE','INV'),($1,'QUOTATION','QT'),($1,'PURCHASE_BILL','PUR')`,
      [business.business_id]
    );
    await client.query(
      `INSERT INTO warehouses(business_id, warehouse_name, is_default, created_by) VALUES($1,'Default Warehouse',TRUE,$2)`,
      [business.business_id, userId]
    );
    const plan = await client.query(`SELECT plan_id FROM subscription_plans WHERE plan_code='BASIC' LIMIT 1`);
    if (plan.rowCount > 0) {
      await client.query(
        `INSERT INTO business_subscriptions(business_id, plan_id, start_date, end_date, subscription_status, is_trial)
         VALUES($1,$2,CURRENT_DATE,CURRENT_DATE + INTERVAL '14 days','TRIAL',TRUE)`,
        [business.business_id, plan.rows[0].plan_id]
      );
    }
    return { publicId: business.public_id, businessName: business.business_name, currencyCode: business.currency_code };
  });
}

async function getBusiness(publicId, userId) {
  const result = await query(
    `SELECT b.public_id, b.business_name, b.business_type, b.phone_number, b.whatsapp_number, b.email,
            b.address, b.city, b.country, b.logo_url, b.ntn, b.strn, b.currency_code, b.timezone,
            b.is_active, b.is_blocked, bu.is_owner, r.role_code, r.role_name
     FROM businesses b
     JOIN business_users bu ON bu.business_id = b.business_id
     JOIN roles r ON r.role_id = bu.role_id
     WHERE b.public_id=$1 AND bu.user_id=$2 AND b.is_deleted=FALSE AND bu.is_deleted=FALSE`,
    [publicId, userId]
  );
  if (result.rowCount === 0) throw new ApiError(404, 'Business not found.');
  return result.rows[0];
}

async function updateSettings(businessId, payload) {
  const result = await query(
    `UPDATE business_settings
     SET invoice_prefix = COALESCE($2, invoice_prefix),
         quotation_prefix = COALESCE($3, quotation_prefix),
         purchase_prefix = COALESCE($4, purchase_prefix),
         show_logo_on_invoice = COALESCE($5, show_logo_on_invoice),
         show_tax_on_invoice = COALESCE($6, show_tax_on_invoice),
         default_tax_percent = COALESCE($7, default_tax_percent),
         invoice_terms = COALESCE($8, invoice_terms),
         invoice_footer_text = COALESCE($9, invoice_footer_text),
         allow_negative_stock = COALESCE($10, allow_negative_stock),
         low_stock_alert = COALESCE($11, low_stock_alert)
     WHERE business_id=$1
     RETURNING *`,
    [businessId, payload.invoicePrefix, payload.quotationPrefix, payload.purchasePrefix, payload.showLogoOnInvoice, payload.showTaxOnInvoice, payload.defaultTaxPercent, payload.invoiceTerms, payload.invoiceFooterText, payload.allowNegativeStock, payload.lowStockAlert]
  );
  return result.rows[0];
}

module.exports = { createBusiness, getBusiness, updateSettings };
