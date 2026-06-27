const { query, withTransaction } = require('../db');
const { ApiError } = require('../utils/api-error');
const { getPagination, paged } = require('../utils/pagination');
const { toNumber, round2 } = require('../utils/money');

function mapPayment(row) {
  return {
    publicId: row.public_id,
    paymentDate: row.payment_date,
    customerName: row.customer_name,
    customerPublicId: row.customer_public_id,
    amount: row.amount,
    paymentMethod: row.payment_method,
    referenceNo: row.reference_no,
    description: row.description,
    attachmentUrl: row.attachment_url,
    createdAt: row.created_at,
  };
}

async function listPayments(businessId, params) {
  const { page, limit, offset } = getPagination(params);
  const result = await query(
    `SELECT pr.*, c.customer_name, c.public_id AS customer_public_id
     FROM payments_received pr
     JOIN customers c ON c.customer_id = pr.customer_id
     WHERE pr.business_id=$1 AND pr.is_deleted=FALSE
     ORDER BY pr.payment_date DESC, pr.payment_received_id DESC
     LIMIT $2 OFFSET $3`,
    [businessId, limit, offset]
  );
  const count = await query(`SELECT COUNT(*) FROM payments_received WHERE business_id=$1 AND is_deleted=FALSE`, [businessId]);
  return paged(result.rows.map(mapPayment), count.rows[0].count, page, limit);
}

async function receivePayment(businessId, userId, payload) {
  return withTransaction(async (client) => {
    const customerRes = await client.query(`SELECT * FROM customers WHERE business_id=$1 AND public_id=$2 AND is_deleted=FALSE`, [businessId, payload.customerPublicId]);
    if (customerRes.rowCount === 0) throw new ApiError(400, 'Customer not found.');
    const customer = customerRes.rows[0];
    const amount = toNumber(payload.amount, 0);
    if (amount <= 0) throw new ApiError(400, 'Payment amount must be greater than zero.');

    const pay = await client.query(
      `INSERT INTO payments_received(business_id, customer_id, payment_date, amount, payment_method, reference_no, description, attachment_url, created_by)
       VALUES($1,$2,COALESCE($3,NOW()),$4,$5,$6,$7,$8,$9) RETURNING *`,
      [businessId, customer.customer_id, payload.paymentDate || null, amount, payload.paymentMethod || 'Cash', payload.referenceNo || null, payload.description || null, payload.attachmentUrl || null, userId]
    );
    const payment = pay.rows[0];

    let remaining = amount;
    if (Array.isArray(payload.allocations) && payload.allocations.length > 0) {
      for (const allocation of payload.allocations) {
        const inv = await client.query(`SELECT * FROM sales_invoices WHERE business_id=$1 AND public_id=$2 AND customer_id=$3 AND is_deleted=FALSE FOR UPDATE`, [businessId, allocation.invoicePublicId, customer.customer_id]);
        if (inv.rowCount === 0) throw new ApiError(400, 'Invoice for allocation not found.');
        const invoice = inv.rows[0];
        const allocAmount = Math.min(toNumber(allocation.amount, 0), toNumber(invoice.balance_amount), remaining);
        if (allocAmount <= 0) continue;
        await allocate(client, businessId, payment.payment_received_id, invoice, allocAmount);
        remaining = round2(remaining - allocAmount);
      }
    } else {
      const invoices = await client.query(
        `SELECT * FROM sales_invoices
         WHERE business_id=$1 AND customer_id=$2 AND is_deleted=FALSE AND invoice_status='POSTED' AND balance_amount > 0
         ORDER BY invoice_date, sales_invoice_id FOR UPDATE`,
        [businessId, customer.customer_id]
      );
      for (const invoice of invoices.rows) {
        if (remaining <= 0) break;
        const allocAmount = Math.min(toNumber(invoice.balance_amount), remaining);
        await allocate(client, businessId, payment.payment_received_id, invoice, allocAmount);
        remaining = round2(remaining - allocAmount);
      }
    }

    const newBalance = round2(toNumber(customer.current_balance) - amount);
    await client.query(`UPDATE customers SET current_balance=$3 WHERE business_id=$1 AND customer_id=$2`, [businessId, customer.customer_id, newBalance]);
    await client.query(
      `INSERT INTO customer_ledger(business_id, customer_id, ledger_date, entry_type, reference_type, reference_id, debit_amount, credit_amount, balance_after, description, created_by)
       VALUES($1,$2,COALESCE($3,NOW()),'PAYMENT','PAYMENT_RECEIVED',$4,0,$5,$6,$7,$8)`,
      [businessId, customer.customer_id, payload.paymentDate || null, payment.payment_received_id, amount, newBalance, payload.description || 'Payment received', userId]
    );

    return { publicId: payment.public_id, amount: payment.amount, unallocatedAmount: remaining };
  });
}

async function allocate(client, businessId, paymentReceivedId, invoice, amount) {
  await client.query(
    `INSERT INTO payment_allocations(business_id, payment_received_id, sales_invoice_id, allocated_amount)
     VALUES($1,$2,$3,$4)`,
    [businessId, paymentReceivedId, invoice.sales_invoice_id, amount]
  );
  const paid = round2(toNumber(invoice.paid_amount) + amount);
  const balance = round2(toNumber(invoice.grand_total) - paid);
  const status = balance <= 0 ? 'PAID' : paid > 0 ? 'PARTIAL' : 'UNPAID';
  await client.query(
    `UPDATE sales_invoices SET paid_amount=$3, balance_amount=$4, payment_status=$5 WHERE business_id=$1 AND sales_invoice_id=$2`,
    [businessId, invoice.sales_invoice_id, paid, balance, status]
  );
}

module.exports = { listPayments, receivePayment };
