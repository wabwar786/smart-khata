const { query, withTransaction } = require('../db');
const { ApiError } = require('../utils/api-error');
const { getPagination, paged } = require('../utils/pagination');
const { toNumber, round2 } = require('../utils/money');
const { getCustomerByPublicId } = require('./customer.service');

function invoiceSummary(row) {
  return {
    publicId: row.public_id,
    invoiceNo: row.invoice_no,
    invoiceDate: row.invoice_date,
    customerName: row.customer_name_snapshot,
    customerPhone: row.customer_phone_snapshot,
    subTotal: row.sub_total,
    discountAmount: row.discount_amount,
    taxAmount: row.tax_amount,
    grandTotal: row.grand_total,
    paidAmount: row.paid_amount,
    balanceAmount: row.balance_amount,
    paymentStatus: row.payment_status,
    invoiceStatus: row.invoice_status,
    pdfUrl: row.pdf_url,
    createdAt: row.created_at,
  };
}

async function listInvoices(businessId, params) {
  const { page, limit, offset } = getPagination(params);
  const status = params.paymentStatus || null;
  const search = params.search ? `%${params.search.toLowerCase()}%` : null;
  const result = await query(
    `SELECT * FROM sales_invoices
     WHERE business_id=$1 AND is_deleted=FALSE
       AND ($2::TEXT IS NULL OR payment_status=$2)
       AND ($3::TEXT IS NULL OR LOWER(invoice_no) LIKE $3 OR LOWER(COALESCE(customer_name_snapshot,'')) LIKE $3 OR COALESCE(customer_phone_snapshot,'') LIKE $3)
     ORDER BY invoice_date DESC, sales_invoice_id DESC
     LIMIT $4 OFFSET $5`,
    [businessId, status, search, limit, offset]
  );
  const count = await query(
    `SELECT COUNT(*) FROM sales_invoices
     WHERE business_id=$1 AND is_deleted=FALSE
       AND ($2::TEXT IS NULL OR payment_status=$2)
       AND ($3::TEXT IS NULL OR LOWER(invoice_no) LIKE $3 OR LOWER(COALESCE(customer_name_snapshot,'')) LIKE $3 OR COALESCE(customer_phone_snapshot,'') LIKE $3)`,
    [businessId, status, search]
  );
  return paged(result.rows.map(invoiceSummary), count.rows[0].count, page, limit);
}

async function getInvoiceByPublicId(businessId, publicId, client) {
  const db = client || { query };
  const inv = await db.query(`SELECT * FROM sales_invoices WHERE business_id=$1 AND public_id=$2 AND is_deleted=FALSE`, [businessId, publicId]);
  if (inv.rowCount === 0) throw new ApiError(404, 'Invoice not found.');
  const items = await db.query(
    `SELECT item_name_snapshot, sku_snapshot, qty, unit_price, discount_amount, tax_percent, tax_amount, line_total
     FROM sales_invoice_items WHERE business_id=$1 AND sales_invoice_id=$2 ORDER BY sales_invoice_item_id`,
    [businessId, inv.rows[0].sales_invoice_id]
  );
  return { ...invoiceSummary(inv.rows[0]), notes: inv.rows[0].notes, terms: inv.rows[0].terms, items: items.rows };
}

function calculateItems(items) {
  let subTotal = 0;
  let discountAmount = 0;
  let taxAmount = 0;
  const calculated = items.map((item) => {
    const qty = toNumber(item.qty, 1);
    const unitPrice = toNumber(item.unitPrice, 0);
    const discount = toNumber(item.discountAmount, 0);
    const taxPercent = toNumber(item.taxPercent, 0);
    const base = round2(qty * unitPrice);
    const taxable = Math.max(base - discount, 0);
    const tax = round2(taxable * taxPercent / 100);
    const lineTotal = round2(taxable + tax);
    subTotal += base;
    discountAmount += discount;
    taxAmount += tax;
    return { ...item, qty, unitPrice, discountAmount: discount, taxPercent, taxAmount: tax, lineTotal };
  });
  return { items: calculated, subTotal: round2(subTotal), discountAmount: round2(discountAmount), taxAmount: round2(taxAmount), grandTotal: round2(subTotal - discountAmount + taxAmount) };
}

async function createInvoice(businessId, userId, payload) {
  return withTransaction(async (client) => {
    let customer = null;
    if (payload.customerPublicId) {
      const c = await client.query(`SELECT * FROM customers WHERE business_id=$1 AND public_id=$2 AND is_deleted=FALSE`, [businessId, payload.customerPublicId]);
      if (c.rowCount === 0) throw new ApiError(400, 'Customer not found.');
      customer = c.rows[0];
    }

    const calc = calculateItems(payload.items);
    const paidAmount = Math.min(toNumber(payload.paidAmount, 0), calc.grandTotal);
    const balanceAmount = round2(calc.grandTotal - paidAmount);
    const paymentStatus = balanceAmount <= 0 ? 'PAID' : paidAmount > 0 ? 'PARTIAL' : 'UNPAID';

    const docNo = await client.query(`SELECT next_document_no($1, 'SALE_INVOICE') AS invoice_no`, [businessId]);
    const invoiceNo = docNo.rows[0].invoice_no;

    const invRes = await client.query(
      `INSERT INTO sales_invoices(business_id, customer_id, invoice_no, customer_name_snapshot, customer_phone_snapshot, customer_address_snapshot,
                                  sub_total, discount_amount, tax_amount, grand_total, paid_amount, balance_amount, payment_status, invoice_status,
                                  notes, terms, created_by)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'POSTED',$14,$15,$16)
       RETURNING *`,
      [businessId, customer ? customer.customer_id : null, invoiceNo,
       customer ? customer.customer_name : payload.customerName || 'Cash Customer',
       customer ? customer.phone_number : payload.customerPhone || null,
       customer ? customer.address : payload.customerAddress || null,
       calc.subTotal, calc.discountAmount, calc.taxAmount, calc.grandTotal, paidAmount, balanceAmount, paymentStatus,
       payload.notes || null, payload.terms || null, userId]
    );
    const invoice = invRes.rows[0];

    const wh = await client.query(`SELECT warehouse_id FROM warehouses WHERE business_id=$1 AND is_default=TRUE AND is_deleted=FALSE LIMIT 1`, [businessId]);
    const warehouseId = wh.rowCount > 0 ? wh.rows[0].warehouse_id : null;
    const settings = await client.query(`SELECT allow_negative_stock FROM business_settings WHERE business_id=$1`, [businessId]);
    const allowNegative = settings.rowCount > 0 ? settings.rows[0].allow_negative_stock : false;

    for (const item of calc.items) {
      let product = null;
      if (item.productPublicId) {
        const p = await client.query(`SELECT * FROM products WHERE business_id=$1 AND public_id=$2 AND is_deleted=FALSE`, [businessId, item.productPublicId]);
        if (p.rowCount === 0) throw new ApiError(400, `Product not found: ${item.productPublicId}`);
        product = p.rows[0];
        if (product.product_type === 'PRODUCT' && !allowNegative && Number(product.current_stock) < Number(item.qty)) {
          throw new ApiError(400, `Not enough stock for ${product.product_name}. Available: ${product.current_stock}`);
        }
      }

      await client.query(
        `INSERT INTO sales_invoice_items(business_id, sales_invoice_id, product_id, item_name_snapshot, sku_snapshot, qty, unit_price, discount_amount, tax_percent, tax_amount, line_total)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [businessId, invoice.sales_invoice_id, product ? product.product_id : null, product ? product.product_name : item.itemName, product ? product.sku : null, item.qty, item.unitPrice, item.discountAmount, item.taxPercent, item.taxAmount, item.lineTotal]
      );

      if (product && product.product_type === 'PRODUCT' && warehouseId) {
        await client.query(`UPDATE products SET current_stock = current_stock - $3 WHERE business_id=$1 AND product_id=$2`, [businessId, product.product_id, item.qty]);
        await client.query(
          `INSERT INTO product_stock(business_id, warehouse_id, product_id, current_qty)
           VALUES($1,$2,$3,0)
           ON CONFLICT(business_id, warehouse_id, product_id) DO NOTHING`,
          [businessId, warehouseId, product.product_id]
        );
        await client.query(`UPDATE product_stock SET current_qty = current_qty - $4 WHERE business_id=$1 AND warehouse_id=$2 AND product_id=$3`, [businessId, warehouseId, product.product_id, item.qty]);
        await client.query(
          `INSERT INTO inventory_transactions(business_id, warehouse_id, product_id, transaction_type, reference_type, reference_id, qty_out, unit_cost, notes, created_by)
           VALUES($1,$2,$3,'SALE','SALES_INVOICE',$4,$5,$6,$7,$8)`,
          [businessId, warehouseId, product.product_id, invoice.sales_invoice_id, item.qty, product.purchase_price, `Sale invoice ${invoiceNo}`, userId]
        );
      }
    }

    if (customer) {
      const newBalance = round2(toNumber(customer.current_balance) + calc.grandTotal - paidAmount);
      await client.query(
        `INSERT INTO customer_ledger(business_id, customer_id, entry_type, reference_type, reference_id, debit_amount, credit_amount, balance_after, description, created_by)
         VALUES($1,$2,'SALE','SALES_INVOICE',$3,$4,0,$5,$6,$7)`,
        [businessId, customer.customer_id, invoice.sales_invoice_id, calc.grandTotal, toNumber(customer.current_balance) + calc.grandTotal, `Sale invoice ${invoiceNo}`, userId]
      );

      if (paidAmount > 0) {
        const payRes = await client.query(
          `INSERT INTO payments_received(business_id, customer_id, amount, payment_method, reference_no, description, created_by)
           VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING payment_received_id`,
          [businessId, customer.customer_id, paidAmount, payload.paymentMethod || 'Cash', payload.paymentReferenceNo || null, `Payment received for invoice ${invoiceNo}`, userId]
        );
        await client.query(
          `INSERT INTO payment_allocations(business_id, payment_received_id, sales_invoice_id, allocated_amount)
           VALUES($1,$2,$3,$4)`,
          [businessId, payRes.rows[0].payment_received_id, invoice.sales_invoice_id, paidAmount]
        );
        await client.query(
          `INSERT INTO customer_ledger(business_id, customer_id, entry_type, reference_type, reference_id, debit_amount, credit_amount, balance_after, description, created_by)
           VALUES($1,$2,'PAYMENT','PAYMENT_RECEIVED',$3,0,$4,$5,$6,$7)`,
          [businessId, customer.customer_id, payRes.rows[0].payment_received_id, paidAmount, newBalance, `Payment received for invoice ${invoiceNo}`, userId]
        );
      }
      await client.query(`UPDATE customers SET current_balance=$3 WHERE business_id=$1 AND customer_id=$2`, [businessId, customer.customer_id, newBalance]);
    }

    return getInvoiceByPublicId(businessId, invoice.public_id, client);
  });
}

async function cancelInvoice(businessId, userId, publicId) {
  // This MVP marks invoice cancelled only. Stock/payment reversal can be added as a controlled phase-2 feature.
  const invoice = await query(`UPDATE sales_invoices SET invoice_status='CANCELLED' WHERE business_id=$1 AND public_id=$2 AND is_deleted=FALSE RETURNING public_id`, [businessId, publicId]);
  if (invoice.rowCount === 0) throw new ApiError(404, 'Invoice not found.');
}

module.exports = { listInvoices, getInvoiceByPublicId, createInvoice, cancelInvoice };
