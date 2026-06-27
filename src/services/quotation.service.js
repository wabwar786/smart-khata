const { query, withTransaction } = require('../db');
const { ApiError } = require('../utils/api-error');
const { getPagination, paged } = require('../utils/pagination');
const { toNumber, round2 } = require('../utils/money');

function mapQuotation(row) {
  return {
    publicId: row.public_id,
    quotationNo: row.quotation_no,
    quotationDate: row.quotation_date,
    validUntil: row.valid_until,
    customerName: row.customer_name_snapshot,
    customerPhone: row.customer_phone_snapshot,
    grandTotal: row.grand_total,
    quotationStatus: row.quotation_status,
    pdfUrl: row.pdf_url,
    createdAt: row.created_at,
  };
}

function calculateItems(items) {
  let subTotal = 0, discountAmount = 0, taxAmount = 0;
  const calculated = items.map((item) => {
    const qty = toNumber(item.qty, 1);
    const unitPrice = toNumber(item.unitPrice, 0);
    const discount = toNumber(item.discountAmount, 0);
    const taxPercent = toNumber(item.taxPercent, 0);
    const base = round2(qty * unitPrice);
    const taxable = Math.max(base - discount, 0);
    const tax = round2(taxable * taxPercent / 100);
    const lineTotal = round2(taxable + tax);
    subTotal += base; discountAmount += discount; taxAmount += tax;
    return { ...item, qty, unitPrice, discountAmount: discount, taxPercent, taxAmount: tax, lineTotal };
  });
  return { items: calculated, subTotal: round2(subTotal), discountAmount: round2(discountAmount), taxAmount: round2(taxAmount), grandTotal: round2(subTotal - discountAmount + taxAmount) };
}

async function listQuotations(businessId, params) {
  const { page, limit, offset } = getPagination(params);
  const status = params.status || null;
  const result = await query(
    `SELECT * FROM quotations
     WHERE business_id=$1 AND is_deleted=FALSE AND ($2::TEXT IS NULL OR quotation_status=$2)
     ORDER BY quotation_date DESC, quotation_id DESC LIMIT $3 OFFSET $4`,
    [businessId, status, limit, offset]
  );
  const count = await query(`SELECT COUNT(*) FROM quotations WHERE business_id=$1 AND is_deleted=FALSE AND ($2::TEXT IS NULL OR quotation_status=$2)`, [businessId, status]);
  return paged(result.rows.map(mapQuotation), count.rows[0].count, page, limit);
}

async function getQuotation(businessId, publicId, client) {
  const db = client || { query };
  const q = await db.query(`SELECT * FROM quotations WHERE business_id=$1 AND public_id=$2 AND is_deleted=FALSE`, [businessId, publicId]);
  if (q.rowCount === 0) throw new ApiError(404, 'Quotation not found.');
  const items = await db.query(
    `SELECT item_name_snapshot, sku_snapshot, qty, unit_price, discount_amount, tax_percent, tax_amount, line_total FROM quotation_items WHERE business_id=$1 AND quotation_id=$2 ORDER BY quotation_item_id`,
    [businessId, q.rows[0].quotation_id]
  );
  return { ...mapQuotation(q.rows[0]), notes: q.rows[0].notes, terms: q.rows[0].terms, items: items.rows };
}

async function createQuotation(businessId, userId, payload) {
  return withTransaction(async (client) => {
    let customer = null;
    if (payload.customerPublicId) {
      const c = await client.query(`SELECT * FROM customers WHERE business_id=$1 AND public_id=$2 AND is_deleted=FALSE`, [businessId, payload.customerPublicId]);
      if (c.rowCount === 0) throw new ApiError(400, 'Customer not found.');
      customer = c.rows[0];
    }
    const calc = calculateItems(payload.items);
    const docNo = await client.query(`SELECT next_document_no($1, 'QUOTATION') AS quotation_no`, [businessId]);
    const quotationNo = docNo.rows[0].quotation_no;
    const q = await client.query(
      `INSERT INTO quotations(business_id, customer_id, quotation_no, valid_until, customer_name_snapshot, customer_phone_snapshot, customer_address_snapshot,
                              sub_total, discount_amount, tax_amount, grand_total, quotation_status, notes, terms, created_by)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'PENDING',$12,$13,$14) RETURNING *`,
      [businessId, customer ? customer.customer_id : null, quotationNo, payload.validUntil || null,
       customer ? customer.customer_name : payload.customerName || null, customer ? customer.phone_number : payload.customerPhone || null, customer ? customer.address : payload.customerAddress || null,
       calc.subTotal, calc.discountAmount, calc.taxAmount, calc.grandTotal, payload.notes || null, payload.terms || null, userId]
    );
    for (const item of calc.items) {
      let product = null;
      if (item.productPublicId) {
        const p = await client.query(`SELECT * FROM products WHERE business_id=$1 AND public_id=$2 AND is_deleted=FALSE`, [businessId, item.productPublicId]);
        if (p.rowCount === 0) throw new ApiError(400, 'Product not found.');
        product = p.rows[0];
      }
      await client.query(
        `INSERT INTO quotation_items(business_id, quotation_id, product_id, item_name_snapshot, sku_snapshot, qty, unit_price, discount_amount, tax_percent, tax_amount, line_total)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [businessId, q.rows[0].quotation_id, product ? product.product_id : null, product ? product.product_name : item.itemName, product ? product.sku : null, item.qty, item.unitPrice, item.discountAmount, item.taxPercent, item.taxAmount, item.lineTotal]
      );
    }
    return getQuotation(businessId, q.rows[0].public_id, client);
  });
}

async function updateStatus(businessId, publicId, status) {
  const result = await query(
    `UPDATE quotations SET quotation_status=$3 WHERE business_id=$1 AND public_id=$2 AND is_deleted=FALSE RETURNING public_id`,
    [businessId, publicId, status]
  );
  if (result.rowCount === 0) throw new ApiError(404, 'Quotation not found.');
}

module.exports = { listQuotations, getQuotation, createQuotation, updateStatus };
