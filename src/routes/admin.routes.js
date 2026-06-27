const express = require('express');
const Joi = require('joi');
const bcrypt = require('bcryptjs');
const asyncHandler = require('../utils/async-handler');
const { query, withTransaction } = require('../db');
const { validate } = require('../middleware/validate');
const { requireAuth, requireSuperAdmin } = require('../middleware/auth');
const { getPagination, paged } = require('../utils/pagination');
const { ApiError } = require('../utils/api-error');

const router = express.Router();
router.use(requireAuth, requireSuperAdmin);

function rowToBusiness(row) {
  return {
    publicId: row.public_id,
    businessName: row.business_name,
    businessType: row.business_type,
    phoneNumber: row.phone_number,
    whatsAppNumber: row.whatsapp_number,
    email: row.email,
    address: row.address,
    city: row.city,
    country: row.country,
    logoUrl: row.logo_url,
    ntn: row.ntn,
    strn: row.strn,
    currencyCode: row.currency_code,
    timezone: row.timezone,
    isActive: row.is_active,
    isBlocked: row.is_blocked,
    blockReason: row.block_reason,
    createdAt: row.created_at,
    ownerName: row.owner_name,
    ownerEmail: row.owner_email,
    ownerPhone: row.owner_phone,
    planName: row.plan_name,
    planId: row.plan_id,
    subscriptionStatus: row.subscription_status,
    subscriptionEndDate: row.subscription_end_date,
    daysLeft: row.days_left,
    totalSales: row.total_sales,
    totalInvoices: row.total_invoices,
    totalCustomers: row.total_customers,
    totalProducts: row.total_products,
  };
}

async function getBusinessByPublicId(publicId, client = { query }) {
  const result = await client.query(
    `SELECT business_id, public_id, business_name FROM businesses WHERE public_id=$1 AND is_deleted=FALSE`,
    [publicId]
  );
  if (result.rowCount === 0) throw new ApiError(404, 'Business not found.');
  return result.rows[0];
}

async function getOwnerRoleId(client) {
  const role = await client.query(`SELECT role_id FROM roles WHERE role_code='OWNER' LIMIT 1`);
  if (role.rowCount === 0) throw new ApiError(500, 'OWNER role is missing. Run seed migration.');
  return role.rows[0].role_id;
}

async function createBusinessDefaults(client, businessId, createdBy) {
  await client.query(`INSERT INTO business_settings(business_id) VALUES($1) ON CONFLICT (business_id) DO NOTHING`, [businessId]);
  await client.query(
    `INSERT INTO document_sequences(business_id, document_type, prefix, next_number)
     VALUES ($1, 'SALE_INVOICE', 'INV', 1), ($1, 'QUOTATION', 'QT', 1), ($1, 'PURCHASE_BILL', 'PUR', 1)
     ON CONFLICT (business_id, document_type) DO NOTHING`,
    [businessId]
  );
  await client.query(
    `INSERT INTO warehouses(business_id, warehouse_name, is_default, created_by)
     VALUES($1, 'Default Warehouse', TRUE, $2)
     ON CONFLICT DO NOTHING`,
    [businessId, createdBy || null]
  );
}

router.get('/dashboard', asyncHandler(async (req, res) => {
  const [summary, dailySales, topBusinesses, nearExpiry] = await Promise.all([
    query(`
      SELECT
        (SELECT COUNT(*) FROM businesses WHERE is_deleted=FALSE) AS total_businesses,
        (SELECT COUNT(*) FROM businesses WHERE is_deleted=FALSE AND is_blocked=TRUE) AS blocked_businesses,
        (SELECT COUNT(*) FROM app_users WHERE is_deleted=FALSE) AS total_users,
        (SELECT COUNT(*) FROM subscription_payments WHERE payment_status='PENDING') AS pending_subscription_payments,
        (SELECT COUNT(*) FROM business_subscriptions WHERE subscription_status IN ('ACTIVE','TRIAL') AND end_date >= CURRENT_DATE) AS active_subscriptions,
        (SELECT COUNT(*) FROM business_subscriptions WHERE subscription_status IN ('ACTIVE','TRIAL') AND end_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days') AS expiring_in_7_days,
        (SELECT COALESCE(SUM(amount),0) FROM subscription_payments WHERE payment_status='APPROVED' AND approved_at >= date_trunc('month', NOW())) AS monthly_subscription_revenue,
        (SELECT COUNT(*) FROM sales_invoices WHERE is_deleted=FALSE AND invoice_status <> 'CANCELLED' AND invoice_date >= date_trunc('month', NOW())) AS invoices_this_month,
        (SELECT COALESCE(SUM(grand_total),0) FROM sales_invoices WHERE is_deleted=FALSE AND invoice_status <> 'CANCELLED' AND invoice_date >= date_trunc('month', NOW())) AS sales_this_month
    `),
    query(`
      SELECT to_char(day::date, 'DD Mon') AS label, day::date AS sale_date,
             COALESCE(SUM(si.grand_total),0)::numeric(18,2) AS total_sales,
             COUNT(si.sales_invoice_id)::int AS invoice_count
      FROM generate_series(CURRENT_DATE - INTERVAL '6 days', CURRENT_DATE, INTERVAL '1 day') AS day
      LEFT JOIN sales_invoices si ON si.invoice_date::date = day::date AND si.is_deleted=FALSE AND si.invoice_status <> 'CANCELLED'
      GROUP BY day
      ORDER BY day
    `),
    query(`
      SELECT b.public_id, b.business_name, COALESCE(SUM(si.grand_total),0)::numeric(18,2) AS total_sales, COUNT(si.sales_invoice_id)::int AS invoice_count
      FROM businesses b
      LEFT JOIN sales_invoices si ON si.business_id=b.business_id AND si.is_deleted=FALSE AND si.invoice_status <> 'CANCELLED' AND si.invoice_date >= NOW() - INTERVAL '30 days'
      WHERE b.is_deleted=FALSE
      GROUP BY b.business_id
      ORDER BY total_sales DESC, invoice_count DESC
      LIMIT 8
    `),
    query(`
      SELECT b.public_id, b.business_name, bs.end_date, bs.subscription_status, sp.plan_name,
             (bs.end_date - CURRENT_DATE)::int AS days_left
      FROM business_subscriptions bs
      JOIN businesses b ON b.business_id=bs.business_id
      JOIN subscription_plans sp ON sp.plan_id=bs.plan_id
      WHERE b.is_deleted=FALSE AND bs.subscription_status IN ('ACTIVE','TRIAL')
        AND bs.end_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '14 days'
      ORDER BY bs.end_date ASC
      LIMIT 10
    `)
  ]);
  const s = summary.rows[0];
  res.json({ success: true, data: {
    totalBusinesses: Number(s.total_businesses || 0),
    blockedBusinesses: Number(s.blocked_businesses || 0),
    totalUsers: Number(s.total_users || 0),
    pendingSubscriptionPayments: Number(s.pending_subscription_payments || 0),
    activeSubscriptions: Number(s.active_subscriptions || 0),
    expiringIn7Days: Number(s.expiring_in_7_days || 0),
    monthlySubscriptionRevenue: Number(s.monthly_subscription_revenue || 0),
    invoicesThisMonth: Number(s.invoices_this_month || 0),
    salesThisMonth: Number(s.sales_this_month || 0),
    dailySales: dailySales.rows,
    topBusinesses: topBusinesses.rows.map(r => ({ publicId: r.public_id, businessName: r.business_name, totalSales: Number(r.total_sales || 0), invoiceCount: Number(r.invoice_count || 0) })),
    nearExpiry: nearExpiry.rows.map(r => ({ publicId: r.public_id, businessName: r.business_name, endDate: r.end_date, status: r.subscription_status, planName: r.plan_name, daysLeft: Number(r.days_left || 0) }))
  }});
}));

router.get('/businesses', asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req.query);
  const search = req.query.search ? `%${req.query.search.toLowerCase()}%` : null;
  const result = await query(
    `SELECT b.public_id, b.business_name, b.business_type, b.phone_number, b.whatsapp_number, b.email, b.city, b.country, b.currency_code,
            b.is_active, b.is_blocked, b.block_reason, b.created_at,
            u.full_name AS owner_name, u.email AS owner_email, u.phone_number AS owner_phone,
            sp.plan_id, sp.plan_name, bs.subscription_status, bs.end_date AS subscription_end_date,
            CASE WHEN bs.end_date IS NULL THEN NULL ELSE (bs.end_date - CURRENT_DATE)::int END AS days_left,
            COALESCE(stats.total_sales,0) AS total_sales,
            COALESCE(stats.total_invoices,0) AS total_invoices,
            COALESCE(c.total_customers,0) AS total_customers,
            COALESCE(p.total_products,0) AS total_products
     FROM businesses b
     JOIN app_users u ON u.user_id = b.owner_user_id
     LEFT JOIN LATERAL (
       SELECT bs2.* FROM business_subscriptions bs2 WHERE bs2.business_id=b.business_id ORDER BY bs2.created_at DESC LIMIT 1
     ) bs ON TRUE
     LEFT JOIN subscription_plans sp ON sp.plan_id=bs.plan_id
     LEFT JOIN LATERAL (
       SELECT COALESCE(SUM(grand_total),0) AS total_sales, COUNT(*) AS total_invoices
       FROM sales_invoices si WHERE si.business_id=b.business_id AND si.is_deleted=FALSE AND si.invoice_status <> 'CANCELLED'
     ) stats ON TRUE
     LEFT JOIN LATERAL (SELECT COUNT(*) AS total_customers FROM customers c WHERE c.business_id=b.business_id AND c.is_deleted=FALSE) c ON TRUE
     LEFT JOIN LATERAL (SELECT COUNT(*) AS total_products FROM products p WHERE p.business_id=b.business_id AND p.is_deleted=FALSE) p ON TRUE
     WHERE b.is_deleted=FALSE AND ($1::TEXT IS NULL OR LOWER(b.business_name) LIKE $1 OR LOWER(COALESCE(u.full_name,'')) LIKE $1 OR LOWER(COALESCE(u.email,'')) LIKE $1 OR COALESCE(b.phone_number,'') LIKE $1)
     ORDER BY b.created_at DESC LIMIT $2 OFFSET $3`,
    [search, limit, offset]
  );
  const count = await query(
    `SELECT COUNT(*) FROM businesses b JOIN app_users u ON u.user_id=b.owner_user_id WHERE b.is_deleted=FALSE AND ($1::TEXT IS NULL OR LOWER(b.business_name) LIKE $1 OR LOWER(COALESCE(u.full_name,'')) LIKE $1 OR LOWER(COALESCE(u.email,'')) LIKE $1 OR COALESCE(b.phone_number,'') LIKE $1)`,
    [search]
  );
  res.json({ success: true, ...paged(result.rows.map(rowToBusiness), count.rows[0].count, page, limit) });
}));

router.post('/businesses', validate(Joi.object({
  ownerFullName: Joi.string().trim().min(2).max(150).required(),
  ownerEmail: Joi.string().trim().email().required(),
  ownerPhone: Joi.string().allow('', null).max(30),
  ownerPassword: Joi.string().min(6).max(100).required(),
  businessName: Joi.string().trim().min(2).max(200).required(),
  businessType: Joi.string().allow('', null).max(100),
  phoneNumber: Joi.string().allow('', null).max(30),
  whatsappNumber: Joi.string().allow('', null).max(30),
  email: Joi.string().allow('', null).email().max(150),
  address: Joi.string().allow('', null).max(1000),
  city: Joi.string().allow('', null).max(100),
  country: Joi.string().allow('', null).max(100),
  currencyCode: Joi.string().allow('', null).max(10),
  planId: Joi.number().integer().positive().required(),
  startDate: Joi.date().iso().required(),
  endDate: Joi.date().iso().required(),
  subscriptionStatus: Joi.string().valid('ACTIVE','TRIAL','EXPIRED','CANCELLED','BLOCKED').default('ACTIVE'),
  isTrial: Joi.boolean().default(false),
})), asyncHandler(async (req, res) => {
  const body = req.body;
  const email = body.ownerEmail.toLowerCase().trim();
  const result = await withTransaction(async (client) => {
    let user;
    const existing = await client.query(`SELECT * FROM app_users WHERE LOWER(email)=$1 AND is_deleted=FALSE LIMIT 1`, [email]);
    if (existing.rowCount > 0) {
      user = existing.rows[0];
    } else {
      const passwordHash = await bcrypt.hash(body.ownerPassword, 12);
      const userRes = await client.query(
        `INSERT INTO app_users(full_name, email, phone_number, password_hash, is_active) VALUES($1,$2,$3,$4,TRUE) RETURNING *`,
        [body.ownerFullName, email, body.ownerPhone || null, passwordHash]
      );
      user = userRes.rows[0];
    }

    const businessRes = await client.query(
      `INSERT INTO businesses(owner_user_id, business_name, business_type, phone_number, whatsapp_number, email, address, city, country, currency_code)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [user.user_id, body.businessName, body.businessType || null, body.phoneNumber || body.ownerPhone || null, body.whatsappNumber || body.ownerPhone || null, body.email || email, body.address || null, body.city || null, body.country || 'Pakistan', body.currencyCode || 'PKR']
    );
    const business = businessRes.rows[0];
    const roleId = await getOwnerRoleId(client);
    await client.query(
      `INSERT INTO business_users(business_id, user_id, role_id, is_owner, created_by) VALUES($1,$2,$3,TRUE,$4) ON CONFLICT DO NOTHING`,
      [business.business_id, user.user_id, roleId, req.user.user_id]
    );
    await createBusinessDefaults(client, business.business_id, req.user.user_id);
    await client.query(
      `INSERT INTO business_subscriptions(business_id, plan_id, start_date, end_date, subscription_status, is_trial)
       VALUES($1,$2,$3,$4,$5,$6)`,
      [business.business_id, body.planId, body.startDate, body.endDate, body.subscriptionStatus, body.isTrial]
    );
    return { user, business };
  });
  res.status(201).json({ success: true, message: 'Business and owner user created.', data: { businessPublicId: result.business.public_id, ownerPublicId: result.user.public_id } });
}));

router.get('/businesses/near-expiry', asyncHandler(async (req, res) => {
  const days = Math.max(1, Math.min(90, Number(req.query.days || 14)));
  const result = await query(
    `SELECT b.public_id, b.business_name, b.phone_number, b.whatsapp_number, u.full_name AS owner_name, u.email AS owner_email,
            sp.plan_name, bs.subscription_status, bs.end_date, (bs.end_date - CURRENT_DATE)::int AS days_left
     FROM business_subscriptions bs
     JOIN businesses b ON b.business_id=bs.business_id
     JOIN app_users u ON u.user_id=b.owner_user_id
     JOIN subscription_plans sp ON sp.plan_id=bs.plan_id
     WHERE b.is_deleted=FALSE AND bs.subscription_status IN ('ACTIVE','TRIAL') AND bs.end_date BETWEEN CURRENT_DATE AND CURRENT_DATE + ($1 || ' days')::interval
     ORDER BY bs.end_date ASC`,
    [days]
  );
  res.json({ success: true, data: result.rows.map(r => ({ publicId: r.public_id, businessName: r.business_name, phoneNumber: r.phone_number, whatsAppNumber: r.whatsapp_number, ownerName: r.owner_name, ownerEmail: r.owner_email, planName: r.plan_name, subscriptionStatus: r.subscription_status, endDate: r.end_date, daysLeft: Number(r.days_left || 0) })) });
}));

router.get('/businesses/:publicId', asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT b.*, u.full_name AS owner_name, u.email AS owner_email, u.phone_number AS owner_phone,
            sp.plan_id, sp.plan_name, bs.business_subscription_id, bs.start_date, bs.end_date AS subscription_end_date, bs.subscription_status, bs.is_trial,
            CASE WHEN bs.end_date IS NULL THEN NULL ELSE (bs.end_date - CURRENT_DATE)::int END AS days_left
     FROM businesses b
     JOIN app_users u ON u.user_id=b.owner_user_id
     LEFT JOIN LATERAL (SELECT * FROM business_subscriptions bs2 WHERE bs2.business_id=b.business_id ORDER BY bs2.created_at DESC LIMIT 1) bs ON TRUE
     LEFT JOIN subscription_plans sp ON sp.plan_id=bs.plan_id
     WHERE b.public_id=$1 AND b.is_deleted=FALSE`,
    [req.params.publicId]
  );
  if (result.rowCount === 0) throw new ApiError(404, 'Business not found.');
  const b = result.rows[0];
  const stats = await query(
    `SELECT
       (SELECT COUNT(*) FROM customers WHERE business_id=$1 AND is_deleted=FALSE) AS customers,
       (SELECT COUNT(*) FROM products WHERE business_id=$1 AND is_deleted=FALSE) AS products,
       (SELECT COUNT(*) FROM sales_invoices WHERE business_id=$1 AND is_deleted=FALSE AND invoice_status <> 'CANCELLED') AS invoices,
       (SELECT COALESCE(SUM(grand_total),0) FROM sales_invoices WHERE business_id=$1 AND is_deleted=FALSE AND invoice_status <> 'CANCELLED') AS sales,
       (SELECT COALESCE(SUM(balance_amount),0) FROM sales_invoices WHERE business_id=$1 AND is_deleted=FALSE AND invoice_status <> 'CANCELLED') AS receivable,
       (SELECT COUNT(*) FROM reminders WHERE business_id=$1 AND is_deleted=FALSE AND reminder_status='PENDING') AS pending_reminders`,
    [b.business_id]
  );
  res.json({ success: true, data: { business: rowToBusiness(b), subscription: { businessSubscriptionId: b.business_subscription_id, planId: b.plan_id, planName: b.plan_name, startDate: b.start_date, endDate: b.subscription_end_date, status: b.subscription_status, isTrial: b.is_trial, daysLeft: b.days_left }, stats: stats.rows[0] } });
}));

router.patch('/businesses/:publicId', validate(Joi.object({
  businessName: Joi.string().trim().min(2).max(200), businessType: Joi.string().allow('', null).max(100), phoneNumber: Joi.string().allow('', null).max(30), whatsAppNumber: Joi.string().allow('', null).max(30), email: Joi.string().allow('', null).email().max(150), address: Joi.string().allow('', null).max(1000), city: Joi.string().allow('', null).max(100), country: Joi.string().allow('', null).max(100), ntn: Joi.string().allow('', null).max(50), strn: Joi.string().allow('', null).max(50), currencyCode: Joi.string().allow('', null).max(10), isActive: Joi.boolean()
}).min(1)), asyncHandler(async (req, res) => {
  const b = await getBusinessByPublicId(req.params.publicId);
  const fields = [];
  const values = [];
  const map = { businessName: 'business_name', businessType: 'business_type', phoneNumber: 'phone_number', whatsAppNumber: 'whatsapp_number', email: 'email', address: 'address', city: 'city', country: 'country', ntn: 'ntn', strn: 'strn', currencyCode: 'currency_code', isActive: 'is_active' };
  Object.entries(map).forEach(([key, col]) => {
    if (Object.prototype.hasOwnProperty.call(req.body, key)) { values.push(req.body[key] === '' ? null : req.body[key]); fields.push(`${col}=$${values.length}`); }
  });
  values.push(b.business_id);
  const result = await query(`UPDATE businesses SET ${fields.join(', ')} WHERE business_id=$${values.length} RETURNING public_id, business_name`, values);
  res.json({ success: true, message: 'Business updated.', data: result.rows[0] });
}));

router.patch('/businesses/:publicId/block', validate(Joi.object({ isBlocked: Joi.boolean().required(), reason: Joi.string().allow('', null) })), asyncHandler(async (req, res) => {
  const result = await query(
    `UPDATE businesses SET is_blocked=$2, block_reason=$3 WHERE public_id=$1 AND is_deleted=FALSE RETURNING public_id, is_blocked`,
    [req.params.publicId, req.body.isBlocked, req.body.reason || null]
  );
  if (result.rowCount === 0) throw new ApiError(404, 'Business not found.');
  res.json({ success: true, data: result.rows[0] });
}));

router.patch('/businesses/:publicId/subscription', validate(Joi.object({
  planId: Joi.number().integer().positive().required(),
  startDate: Joi.date().iso().required(),
  endDate: Joi.date().iso().required(),
  subscriptionStatus: Joi.string().valid('ACTIVE','TRIAL','EXPIRED','CANCELLED','BLOCKED').required(),
  isTrial: Joi.boolean().default(false),
  autoRenew: Joi.boolean().default(false)
})), asyncHandler(async (req, res) => {
  const b = await getBusinessByPublicId(req.params.publicId);
  await withTransaction(async (client) => {
    const current = await client.query(`SELECT business_subscription_id FROM business_subscriptions WHERE business_id=$1 ORDER BY created_at DESC LIMIT 1`, [b.business_id]);
    if (current.rowCount > 0) {
      await client.query(
        `UPDATE business_subscriptions SET plan_id=$2, start_date=$3, end_date=$4, subscription_status=$5, is_trial=$6, auto_renew=$7 WHERE business_subscription_id=$1`,
        [current.rows[0].business_subscription_id, req.body.planId, req.body.startDate, req.body.endDate, req.body.subscriptionStatus, req.body.isTrial, req.body.autoRenew]
      );
    } else {
      await client.query(
        `INSERT INTO business_subscriptions(business_id, plan_id, start_date, end_date, subscription_status, is_trial, auto_renew) VALUES($1,$2,$3,$4,$5,$6,$7)`,
        [b.business_id, req.body.planId, req.body.startDate, req.body.endDate, req.body.subscriptionStatus, req.body.isTrial, req.body.autoRenew]
      );
    }
  });
  res.json({ success: true, message: 'Subscription attached/updated.' });
}));

router.get('/businesses/:publicId/billing-history', asyncHandler(async (req, res) => {
  const b = await getBusinessByPublicId(req.params.publicId);
  const result = await query(
    `SELECT sp.subscription_payment_id, sp.amount, sp.currency_code, sp.payment_method, sp.transaction_reference, sp.payment_status, sp.paid_at, sp.approved_at, sp.reject_reason, sp.created_at,
            spl.plan_name, bs.start_date, bs.end_date, bs.subscription_status
     FROM subscription_payments sp
     LEFT JOIN business_subscriptions bs ON bs.business_subscription_id=sp.business_subscription_id
     LEFT JOIN subscription_plans spl ON spl.plan_id=bs.plan_id
     WHERE sp.business_id=$1 ORDER BY sp.created_at DESC`,
    [b.business_id]
  );
  res.json({ success: true, data: result.rows });
}));

router.get('/businesses/:publicId/whatsapp', asyncHandler(async (req, res) => {
  const b = await getBusinessByPublicId(req.params.publicId);
  const result = await query(`SELECT provider, api_url, api_key, sender_phone, is_active, updated_at FROM business_whatsapp_settings WHERE business_id=$1`, [b.business_id]);
  res.json({ success: true, data: result.rows[0] || { provider: 'custom', apiUrl: '', apiKey: '', senderPhone: '', isActive: false } });
}));

router.put('/businesses/:publicId/whatsapp', validate(Joi.object({
  provider: Joi.string().allow('', null).max(50), apiUrl: Joi.string().allow('', null).max(1000), apiKey: Joi.string().allow('', null).max(1000), senderPhone: Joi.string().allow('', null).max(50), isActive: Joi.boolean().default(false)
})), asyncHandler(async (req, res) => {
  const b = await getBusinessByPublicId(req.params.publicId);
  await query(
    `INSERT INTO business_whatsapp_settings(business_id, provider, api_url, api_key, sender_phone, is_active)
     VALUES($1,$2,$3,$4,$5,$6)
     ON CONFLICT (business_id) DO UPDATE SET provider=EXCLUDED.provider, api_url=EXCLUDED.api_url, api_key=EXCLUDED.api_key, sender_phone=EXCLUDED.sender_phone, is_active=EXCLUDED.is_active, updated_at=NOW()`,
    [b.business_id, req.body.provider || 'custom', req.body.apiUrl || null, req.body.apiKey || null, req.body.senderPhone || null, req.body.isActive]
  );
  res.json({ success: true, message: 'WhatsApp API settings saved.' });
}));

router.get('/businesses/:publicId/users', asyncHandler(async (req, res) => {
  const b = await getBusinessByPublicId(req.params.publicId);
  const result = await query(
    `SELECT u.public_id, u.full_name, u.email, u.phone_number, u.is_active, u.is_super_admin, bu.is_owner, bu.can_login, r.role_name, r.role_code, bu.joined_at
     FROM business_users bu JOIN app_users u ON u.user_id=bu.user_id JOIN roles r ON r.role_id=bu.role_id
     WHERE bu.business_id=$1 AND bu.is_deleted=FALSE AND u.is_deleted=FALSE ORDER BY bu.is_owner DESC, u.full_name`,
    [b.business_id]
  );
  res.json({ success: true, data: result.rows });
}));

router.get('/businesses/:publicId/customers', asyncHandler(async (req, res) => {
  const b = await getBusinessByPublicId(req.params.publicId);
  const result = await query(`SELECT public_id, customer_name, phone_number, whatsapp_number, city, opening_balance, current_balance, credit_limit, is_active, created_at FROM customers WHERE business_id=$1 AND is_deleted=FALSE ORDER BY created_at DESC LIMIT 500`, [b.business_id]);
  res.json({ success: true, data: result.rows });
}));

router.get('/businesses/:publicId/products', asyncHandler(async (req, res) => {
  const b = await getBusinessByPublicId(req.params.publicId);
  const result = await query(
    `SELECT p.public_id, p.product_name, p.sku, p.barcode, p.product_type, p.purchase_price, p.sale_price, p.current_stock, p.low_stock_qty, p.is_active, u.unit_code, pc.category_name
     FROM products p JOIN units u ON u.unit_id=p.unit_id LEFT JOIN product_categories pc ON pc.product_category_id=p.product_category_id
     WHERE p.business_id=$1 AND p.is_deleted=FALSE ORDER BY p.product_name LIMIT 1000`,
    [b.business_id]
  );
  res.json({ success: true, data: result.rows });
}));

router.get('/businesses/:publicId/sales', asyncHandler(async (req, res) => {
  const b = await getBusinessByPublicId(req.params.publicId);
  const result = await query(
    `SELECT si.public_id, si.invoice_no, si.invoice_date, si.customer_name_snapshot, si.customer_phone_snapshot, si.sub_total, si.discount_amount, si.tax_amount, si.grand_total, si.paid_amount, si.balance_amount, si.payment_status, si.invoice_status
     FROM sales_invoices si WHERE si.business_id=$1 AND si.is_deleted=FALSE ORDER BY si.invoice_date DESC LIMIT 500`,
    [b.business_id]
  );
  res.json({ success: true, data: result.rows });
}));

router.get('/businesses/:publicId/inventory', asyncHandler(async (req, res) => {
  const b = await getBusinessByPublicId(req.params.publicId);
  const result = await query(
    `SELECT p.product_name, p.sku, p.barcode, p.product_type, u.unit_code, p.purchase_price, p.sale_price, p.current_stock, p.low_stock_qty,
            CASE WHEN p.low_stock_qty IS NOT NULL AND p.current_stock <= p.low_stock_qty THEN TRUE ELSE FALSE END AS is_low_stock
     FROM products p JOIN units u ON u.unit_id=p.unit_id
     WHERE p.business_id=$1 AND p.is_deleted=FALSE ORDER BY p.product_name`,
    [b.business_id]
  );
  res.json({ success: true, data: result.rows });
}));

router.get('/businesses/:publicId/performance', asyncHandler(async (req, res) => {
  const b = await getBusinessByPublicId(req.params.publicId);
  const [summary, dailySales, topProducts] = await Promise.all([
    query(`SELECT
        COUNT(*) FILTER (WHERE invoice_date >= date_trunc('month', NOW())) AS invoices_this_month,
        COALESCE(SUM(grand_total) FILTER (WHERE invoice_date >= date_trunc('month', NOW())),0) AS sales_this_month,
        COALESCE(SUM(paid_amount) FILTER (WHERE invoice_date >= date_trunc('month', NOW())),0) AS collected_this_month,
        COALESCE(SUM(balance_amount),0) AS total_receivable
      FROM sales_invoices WHERE business_id=$1 AND is_deleted=FALSE AND invoice_status <> 'CANCELLED'`, [b.business_id]),
    query(`SELECT to_char(day::date, 'DD Mon') AS label, COALESCE(SUM(si.grand_total),0)::numeric(18,2) AS total_sales
       FROM generate_series(CURRENT_DATE - INTERVAL '13 days', CURRENT_DATE, INTERVAL '1 day') day
       LEFT JOIN sales_invoices si ON si.business_id=$1 AND si.invoice_date::date=day::date AND si.is_deleted=FALSE AND si.invoice_status <> 'CANCELLED'
       GROUP BY day ORDER BY day`, [b.business_id]),
    query(`SELECT sii.item_name_snapshot AS product_name, SUM(sii.qty)::numeric(18,3) AS qty, SUM(sii.line_total)::numeric(18,2) AS total
       FROM sales_invoice_items sii JOIN sales_invoices si ON si.sales_invoice_id=sii.sales_invoice_id
       WHERE sii.business_id=$1 AND si.is_deleted=FALSE AND si.invoice_status <> 'CANCELLED'
       GROUP BY sii.item_name_snapshot ORDER BY total DESC LIMIT 10`, [b.business_id])
  ]);
  res.json({ success: true, data: { summary: summary.rows[0], dailySales: dailySales.rows, topProducts: topProducts.rows } });
}));

router.get('/users', asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req.query);
  const search = req.query.search ? `%${req.query.search.toLowerCase()}%` : null;
  const result = await query(
    `SELECT u.public_id, u.full_name, u.email, u.phone_number, u.is_super_admin, u.is_support_admin, u.is_active, u.created_at, u.last_login_at,
            COUNT(bu.business_user_id)::int AS business_count
     FROM app_users u LEFT JOIN business_users bu ON bu.user_id=u.user_id AND bu.is_deleted=FALSE
     WHERE u.is_deleted=FALSE AND ($1::TEXT IS NULL OR LOWER(COALESCE(u.full_name,'')) LIKE $1 OR LOWER(COALESCE(u.email,'')) LIKE $1 OR COALESCE(u.phone_number,'') LIKE $1)
     GROUP BY u.user_id ORDER BY u.created_at DESC LIMIT $2 OFFSET $3`,
    [search, limit, offset]
  );
  const count = await query(`SELECT COUNT(*) FROM app_users u WHERE u.is_deleted=FALSE AND ($1::TEXT IS NULL OR LOWER(COALESCE(u.full_name,'')) LIKE $1 OR LOWER(COALESCE(u.email,'')) LIKE $1 OR COALESCE(u.phone_number,'') LIKE $1)`, [search]);
  res.json({ success: true, ...paged(result.rows, count.rows[0].count, page, limit) });
}));

router.post('/super-users', validate(Joi.object({
  fullName: Joi.string().trim().min(2).max(150).required(),
  email: Joi.string().trim().email().required(),
  phoneNumber: Joi.string().allow('', null).max(30),
  password: Joi.string().min(6).max(100).required(),
  isSupportAdmin: Joi.boolean().default(false)
})), asyncHandler(async (req, res) => {
  const email = req.body.email.toLowerCase().trim();
  const existing = await query(`SELECT user_id FROM app_users WHERE LOWER(email)=$1 AND is_deleted=FALSE`, [email]);
  if (existing.rowCount > 0) throw new ApiError(409, 'User with this email already exists.');
  const passwordHash = await bcrypt.hash(req.body.password, 12);
  const result = await query(
    `INSERT INTO app_users(full_name, email, phone_number, password_hash, is_super_admin, is_support_admin, is_active)
     VALUES($1,$2,$3,$4,TRUE,$5,TRUE) RETURNING public_id, full_name, email, is_super_admin, is_support_admin`,
    [req.body.fullName, email, req.body.phoneNumber || null, passwordHash, req.body.isSupportAdmin]
  );
  res.status(201).json({ success: true, message: 'Super user created.', data: result.rows[0] });
}));

router.patch('/users/:publicId/block', validate(Joi.object({ isActive: Joi.boolean().required() })), asyncHandler(async (req, res) => {
  const result = await query(`UPDATE app_users SET is_active=$2 WHERE public_id=$1 AND is_deleted=FALSE RETURNING public_id, full_name, email, is_active`, [req.params.publicId, req.body.isActive]);
  if (result.rowCount === 0) throw new ApiError(404, 'User not found.');
  res.json({ success: true, data: result.rows[0] });
}));

router.delete('/users/:publicId', asyncHandler(async (req, res) => {
  const target = await query(
    `SELECT user_id, public_id, full_name, email, is_super_admin
     FROM app_users
     WHERE public_id=$1 AND is_deleted=FALSE`,
    [req.params.publicId]
  );

  if (target.rowCount === 0) throw new ApiError(404, 'User not found.');

  const user = target.rows[0];

  if (Number(user.user_id) === Number(req.user.user_id)) {
    throw new ApiError(400, 'You cannot delete your own logged-in Super Admin account.');
  }

  if (user.is_super_admin) {
    const remaining = await query(
      `SELECT COUNT(*)::int AS total
       FROM app_users
       WHERE is_super_admin=TRUE
         AND is_active=TRUE
         AND is_deleted=FALSE
         AND user_id <> $1`,
      [user.user_id]
    );

    if (Number(remaining.rows[0].total || 0) < 1) {
      throw new ApiError(400, 'Cannot delete the last active Super Admin account. Create another Super Admin first.');
    }
  }

  await withTransaction(async (client) => {
    await client.query(
      `UPDATE app_users
       SET is_deleted=TRUE, is_active=FALSE, updated_at=NOW()
       WHERE user_id=$1`,
      [user.user_id]
    );

    await client.query(
      `UPDATE business_users
       SET is_deleted=TRUE, is_active=FALSE, can_login=FALSE, updated_at=NOW()
       WHERE user_id=$1 AND is_deleted=FALSE`,
      [user.user_id]
    );

    await client.query(
      `INSERT INTO audit_logs(user_id, action_name, entity_name, entity_id, new_values, created_at)
       VALUES($1, 'USER_DELETE', 'app_users', $2, $3, NOW())`,
      [req.user.user_id, user.user_id, JSON.stringify({ deletedUserPublicId: user.public_id, deletedUserEmail: user.email })]
    );
  });

  res.json({ success: true, message: 'User deleted successfully. This is a safe soft-delete and historical records are preserved.' });
}));

router.get('/plans', asyncHandler(async (req, res) => {
  const result = await query(`SELECT plan_id, plan_name, plan_code, monthly_price, currency_code, max_businesses, max_users, max_customers, max_products, max_invoices_per_month, has_inventory, has_quotation, has_reports, has_whatsapp_sharing, has_multi_user, is_active FROM subscription_plans ORDER BY monthly_price, plan_id`);
  res.json({ success: true, data: result.rows });
}));

router.get('/subscription-payments', asyncHandler(async (req, res) => {
  const status = req.query.status || null;
  const result = await query(
    `SELECT sp.subscription_payment_id, sp.amount, sp.currency_code, sp.payment_method, sp.transaction_reference,
            sp.payment_screenshot_url, sp.payment_status, sp.paid_at, sp.approved_at, sp.reject_reason, sp.created_at,
            b.business_name, b.public_id AS business_public_id, spl.plan_name
     FROM subscription_payments sp
     JOIN businesses b ON b.business_id = sp.business_id
     LEFT JOIN business_subscriptions bs ON bs.business_subscription_id=sp.business_subscription_id
     LEFT JOIN subscription_plans spl ON spl.plan_id=bs.plan_id
     WHERE ($1::TEXT IS NULL OR sp.payment_status=$1)
     ORDER BY sp.created_at DESC LIMIT 500`,
    [status]
  );
  res.json({ success: true, data: result.rows });
}));

router.post('/subscription-payments/:id/approve', asyncHandler(async (req, res) => {
  await withTransaction(async (client) => {
    const payment = await client.query(`SELECT * FROM subscription_payments WHERE subscription_payment_id=$1 FOR UPDATE`, [req.params.id]);
    if (payment.rowCount === 0) throw new ApiError(404, 'Payment not found.');
    const p = payment.rows[0];
    await client.query(`UPDATE subscription_payments SET payment_status='APPROVED', approved_by=$2, approved_at=NOW() WHERE subscription_payment_id=$1`, [p.subscription_payment_id, req.user.user_id]);
    await client.query(`UPDATE business_subscriptions SET subscription_status='ACTIVE', is_trial=FALSE, start_date=CURRENT_DATE, end_date=(GREATEST(end_date, CURRENT_DATE) + INTERVAL '1 month')::date WHERE business_subscription_id=$1`, [p.business_subscription_id]);
  });
  res.json({ success: true, message: 'Subscription payment approved.' });
}));

router.post('/subscription-payments/:id/reject', validate(Joi.object({ reason: Joi.string().trim().max(500).required() })), asyncHandler(async (req, res) => {
  const result = await query(`UPDATE subscription_payments SET payment_status='REJECTED', reject_reason=$2 WHERE subscription_payment_id=$1 RETURNING subscription_payment_id`, [req.params.id, req.body.reason]);
  if (result.rowCount === 0) throw new ApiError(404, 'Payment not found.');
  res.json({ success: true, message: 'Subscription payment rejected.' });
}));

module.exports = router;
