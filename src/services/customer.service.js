const { query, withTransaction } = require('../db');
const { ApiError } = require('../utils/api-error');
const { getPagination, paged } = require('../utils/pagination');
const { toNumber } = require('../utils/money');

function mapCustomer(row) {
  return {
    publicId: row.public_id,
    customerName: row.customer_name,
    phoneNumber: row.phone_number,
    whatsAppNumber: row.whatsapp_number,
    email: row.email,
    address: row.address,
    city: row.city,
    customerType: row.customer_type,
    openingBalance: row.opening_balance,
    currentBalance: row.current_balance,
    creditLimit: row.credit_limit,
    notes: row.notes,
    isActive: row.is_active,
    createdAt: row.created_at,
  };
}

async function listCustomers(businessId, params) {
  const { page, limit, offset } = getPagination(params);
  const search = params.search ? `%${params.search.toLowerCase()}%` : null;
  const values = [businessId, search, limit, offset];

  const data = await query(
    `SELECT * FROM customers
     WHERE business_id=$1 AND is_deleted=FALSE
       AND ($2::TEXT IS NULL OR LOWER(customer_name) LIKE $2 OR phone_number LIKE $2 OR whatsapp_number LIKE $2)
     ORDER BY customer_name
     LIMIT $3 OFFSET $4`,
    values
  );
  const count = await query(
    `SELECT COUNT(*) FROM customers
     WHERE business_id=$1 AND is_deleted=FALSE
       AND ($2::TEXT IS NULL OR LOWER(customer_name) LIKE $2 OR phone_number LIKE $2 OR whatsapp_number LIKE $2)`,
    [businessId, search]
  );
  return paged(data.rows.map(mapCustomer), count.rows[0].count, page, limit);
}

async function createCustomer(businessId, userId, payload) {
  return withTransaction(async (client) => {
    const opening = toNumber(payload.openingBalance, 0);
    const result = await client.query(
      `INSERT INTO customers(business_id, customer_name, phone_number, whatsapp_number, email, address, city,
                             customer_type, opening_balance, current_balance, credit_limit, notes, created_by)
       VALUES($1,$2,$3,$4,$5,$6,$7,COALESCE($8,'Retail'),$9,$9,$10,$11,$12)
       RETURNING *`,
      [businessId, payload.customerName, payload.phoneNumber || null, payload.whatsAppNumber || payload.phoneNumber || null, payload.email || null, payload.address || null, payload.city || null, payload.customerType || 'Retail', opening, payload.creditLimit || null, payload.notes || null, userId]
    );
    const customer = result.rows[0];
    if (opening !== 0) {
      await client.query(
        `INSERT INTO customer_ledger(business_id, customer_id, entry_type, reference_type, debit_amount, credit_amount, balance_after, description, created_by)
         VALUES($1,$2,'OPENING','MANUAL',$3,0,$3,'Opening balance',$4)`,
        [businessId, customer.customer_id, opening, userId]
      );
    }
    return mapCustomer(customer);
  });
}

async function getCustomerByPublicId(businessId, publicId) {
  const result = await query(
    `SELECT * FROM customers WHERE business_id=$1 AND public_id=$2 AND is_deleted=FALSE`,
    [businessId, publicId]
  );
  if (result.rowCount === 0) throw new ApiError(404, 'Customer not found.');
  return result.rows[0];
}

async function getCustomer(businessId, publicId) {
  return mapCustomer(await getCustomerByPublicId(businessId, publicId));
}

async function updateCustomer(businessId, publicId, payload) {
  const current = await getCustomerByPublicId(businessId, publicId);
  const result = await query(
    `UPDATE customers SET
       customer_name=COALESCE($3, customer_name),
       phone_number=COALESCE($4, phone_number),
       whatsapp_number=COALESCE($5, whatsapp_number),
       email=COALESCE($6, email),
       address=COALESCE($7, address),
       city=COALESCE($8, city),
       customer_type=COALESCE($9, customer_type),
       credit_limit=COALESCE($10, credit_limit),
       notes=COALESCE($11, notes),
       is_active=COALESCE($12, is_active)
     WHERE customer_id=$1 AND business_id=$2
     RETURNING *`,
    [current.customer_id, businessId, payload.customerName, payload.phoneNumber, payload.whatsAppNumber, payload.email, payload.address, payload.city, payload.customerType, payload.creditLimit, payload.notes, payload.isActive]
  );
  return mapCustomer(result.rows[0]);
}

async function deleteCustomer(businessId, publicId) {
  const current = await getCustomerByPublicId(businessId, publicId);
  await query(`UPDATE customers SET is_deleted=TRUE WHERE customer_id=$1 AND business_id=$2`, [current.customer_id, businessId]);
}

async function getLedger(businessId, publicId, params) {
  const customer = await getCustomerByPublicId(businessId, publicId);
  const { page, limit, offset } = getPagination(params);
  const data = await query(
    `SELECT ledger_date, entry_type, reference_type, reference_id, debit_amount, credit_amount, balance_after, description
     FROM customer_ledger
     WHERE business_id=$1 AND customer_id=$2
     ORDER BY ledger_date DESC, customer_ledger_id DESC
     LIMIT $3 OFFSET $4`,
    [businessId, customer.customer_id, limit, offset]
  );
  const count = await query(
    `SELECT COUNT(*) FROM customer_ledger WHERE business_id=$1 AND customer_id=$2`,
    [businessId, customer.customer_id]
  );
  return paged(data.rows, count.rows[0].count, page, limit);
}

module.exports = { listCustomers, createCustomer, getCustomer, updateCustomer, deleteCustomer, getLedger, getCustomerByPublicId, mapCustomer };
