const express = require('express');
const asyncHandler = require('../utils/async-handler');
const { query, withTransaction } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { requireBusiness } = require('../middleware/business');
const { ApiError } = require('../utils/api-error');

const router = express.Router();
router.use(requireAuth, requireBusiness);

const n = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const s = (value) => (value === undefined || value === null || value === '' ? null : String(value).trim());
const pageLimit = (value, fallback = 100) => Math.max(1, Math.min(500, n(value, fallback)));

async function getByPublicId(table, idColumn, publicId, businessId, client = { query }) {
  const result = await client.query(
    `SELECT ${idColumn} FROM ${table} WHERE public_id=$1 AND business_id=$2 AND is_deleted=FALSE`,
    [publicId, businessId]
  );
  if (result.rowCount === 0) throw new ApiError(404, `${table} record not found.`);
  return result.rows[0][idColumn];
}

async function defaultAccountId(businessId, client = { query }) {
  let result = await client.query(
    `SELECT financial_account_id FROM financial_accounts WHERE business_id=$1 AND is_deleted=FALSE ORDER BY is_default DESC, financial_account_id LIMIT 1`,
    [businessId]
  );
  if (result.rowCount === 0) {
    result = await client.query(
      `INSERT INTO financial_accounts(business_id, account_name, account_type, is_default, current_balance) VALUES($1,'Cash','CASH',TRUE,0) RETURNING financial_account_id`,
      [businessId]
    );
  }
  return result.rows[0].financial_account_id;
}

async function insertAudit(client, req, action, entity, entityId, values) {
  await client.query(
    `INSERT INTO audit_logs(business_id, user_id, action_name, entity_name, entity_id, new_values, ip_address, user_agent)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
    [req.business.business_id, req.user.user_id, action, entity, entityId || null, JSON.stringify(values || {}), req.ip || null, req.headers['user-agent'] || null]
  );
}

// ---------------------------------------------------------
// Lookups: units and product categories
// ---------------------------------------------------------
router.get('/lookups/units', asyncHandler(async (req, res) => {
  const result = await query(`SELECT unit_id, unit_name, unit_code, is_active FROM units WHERE is_active=TRUE ORDER BY unit_name`);
  res.json({ success: true, data: result.rows });
}));

router.get('/lookups/product-categories', asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT public_id, category_name, description, is_active, created_at
     FROM product_categories WHERE business_id=$1 AND is_deleted=FALSE ORDER BY category_name`,
    [req.business.business_id]
  );
  res.json({ success: true, data: result.rows });
}));

router.post('/lookups/product-categories', asyncHandler(async (req, res) => {
  if (!s(req.body.categoryName)) throw new ApiError(400, 'Category name is required.');
  const result = await query(
    `INSERT INTO product_categories(business_id, category_name, description, created_by)
     VALUES($1,$2,$3,$4)
     RETURNING public_id, category_name, description, is_active`,
    [req.business.business_id, s(req.body.categoryName), s(req.body.description), req.user.user_id]
  );
  res.status(201).json({ success: true, data: result.rows[0] });
}));

// ---------------------------------------------------------
// Suppliers and supplier khata
// ---------------------------------------------------------
router.get('/suppliers', asyncHandler(async (req, res) => {
  const search = req.query.search ? `%${String(req.query.search).toLowerCase()}%` : null;
  const result = await query(
    `SELECT public_id, supplier_name, phone_number, whatsapp_number, email, address, city, opening_balance, current_balance, notes, is_active, created_at
     FROM suppliers
     WHERE business_id=$1 AND is_deleted=FALSE
       AND ($2::TEXT IS NULL OR LOWER(supplier_name) LIKE $2 OR COALESCE(phone_number,'') LIKE $2 OR COALESCE(whatsapp_number,'') LIKE $2)
     ORDER BY supplier_name LIMIT $3`,
    [req.business.business_id, search, pageLimit(req.query.limit)]
  );
  res.json({ success: true, data: result.rows });
}));

router.post('/suppliers', asyncHandler(async (req, res) => {
  if (!s(req.body.supplierName)) throw new ApiError(400, 'Supplier name is required.');
  const opening = n(req.body.openingBalance);
  const result = await withTransaction(async (client) => {
    const supplier = await client.query(
      `INSERT INTO suppliers(business_id, supplier_name, phone_number, whatsapp_number, email, address, city, opening_balance, current_balance, notes, created_by)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$8,$9,$10) RETURNING *`,
      [req.business.business_id, s(req.body.supplierName), s(req.body.phoneNumber), s(req.body.whatsAppNumber), s(req.body.email), s(req.body.address), s(req.body.city), opening, s(req.body.notes), req.user.user_id]
    );
    if (opening > 0) {
      await client.query(
        `INSERT INTO supplier_ledger(business_id, supplier_id, entry_type, debit_amount, balance_after, description, created_by)
         VALUES($1,$2,'OPENING',$3,$3,'Opening payable balance',$4)`,
        [req.business.business_id, supplier.rows[0].supplier_id, opening, req.user.user_id]
      );
    }
    await insertAudit(client, req, 'SUPPLIER_CREATE', 'suppliers', supplier.rows[0].supplier_id, supplier.rows[0]);
    return supplier.rows[0];
  });
  res.status(201).json({ success: true, data: result });
}));

router.get('/suppliers/:publicId/ledger', asyncHandler(async (req, res) => {
  const supplierId = await getByPublicId('suppliers', 'supplier_id', req.params.publicId, req.business.business_id);
  const result = await query(
    `SELECT ledger_date, entry_type, reference_type, reference_id, debit_amount, credit_amount, balance_after, description, created_at
     FROM supplier_ledger WHERE business_id=$1 AND supplier_id=$2 ORDER BY ledger_date DESC, supplier_ledger_id DESC LIMIT $3`,
    [req.business.business_id, supplierId, pageLimit(req.query.limit, 200)]
  );
  res.json({ success: true, data: result.rows });
}));

router.post('/suppliers/:publicId/payment', asyncHandler(async (req, res) => {
  const supplierId = await getByPublicId('suppliers', 'supplier_id', req.params.publicId, req.business.business_id);
  const amount = n(req.body.amount);
  if (amount <= 0) throw new ApiError(400, 'Amount must be greater than zero.');
  const result = await withTransaction(async (client) => {
    const balanceRes = await client.query(`SELECT current_balance FROM suppliers WHERE supplier_id=$1 FOR UPDATE`, [supplierId]);
    const balance = n(balanceRes.rows[0].current_balance) - amount;
    const payment = await client.query(
      `INSERT INTO supplier_payments(business_id, supplier_id, amount, payment_method, reference_no, description, attachment_url, created_by)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.business.business_id, supplierId, amount, s(req.body.paymentMethod) || 'Cash', s(req.body.referenceNo), s(req.body.description), s(req.body.attachmentUrl), req.user.user_id]
    );
    await client.query(`UPDATE suppliers SET current_balance=$2 WHERE supplier_id=$1`, [supplierId, balance]);
    await client.query(
      `INSERT INTO supplier_ledger(business_id, supplier_id, entry_type, reference_type, reference_id, credit_amount, balance_after, description, created_by)
       VALUES($1,$2,'PAYMENT','SUPPLIER_PAYMENT',$3,$4,$5,$6,$7)`,
      [req.business.business_id, supplierId, payment.rows[0].supplier_payment_id, amount, balance, s(req.body.description) || 'Payment to supplier', req.user.user_id]
    );
    await insertAudit(client, req, 'SUPPLIER_PAYMENT', 'supplier_payments', payment.rows[0].supplier_payment_id, payment.rows[0]);
    return payment.rows[0];
  });
  res.status(201).json({ success: true, data: result });
}));

// ---------------------------------------------------------
// Financial accounts and cash book
// ---------------------------------------------------------
router.get('/accounts', asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT public_id, account_name, account_type, account_number, opening_balance, current_balance, is_default, is_active, created_at
     FROM financial_accounts WHERE business_id=$1 AND is_deleted=FALSE ORDER BY is_default DESC, account_name`,
    [req.business.business_id]
  );
  res.json({ success: true, data: result.rows });
}));

router.post('/accounts', asyncHandler(async (req, res) => {
  if (!s(req.body.accountName)) throw new ApiError(400, 'Account name is required.');
  const opening = n(req.body.openingBalance);
  const result = await query(
    `INSERT INTO financial_accounts(business_id, account_name, account_type, account_number, opening_balance, current_balance, is_default, created_by)
     VALUES($1,$2,$3,$4,$5,$5,$6,$7) RETURNING public_id, account_name, account_type, current_balance, is_default`,
    [req.business.business_id, s(req.body.accountName), s(req.body.accountType) || 'CASH', s(req.body.accountNumber), opening, !!req.body.isDefault, req.user.user_id]
  );
  res.status(201).json({ success: true, data: result.rows[0] });
}));

router.get('/cashbook', asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT c.public_id, c.entry_date, c.entry_type, c.amount, c.title, c.description, c.reference_type, fa.account_name, fa.account_type, c.created_at
     FROM cash_book_entries c LEFT JOIN financial_accounts fa ON fa.financial_account_id=c.financial_account_id
     WHERE c.business_id=$1 AND c.is_deleted=FALSE
     ORDER BY c.entry_date DESC, c.cash_book_entry_id DESC LIMIT $2`,
    [req.business.business_id, pageLimit(req.query.limit, 200)]
  );
  res.json({ success: true, data: result.rows });
}));

router.post('/cashbook', asyncHandler(async (req, res) => {
  const amount = n(req.body.amount);
  if (amount <= 0) throw new ApiError(400, 'Amount must be greater than zero.');
  const type = s(req.body.entryType) || 'CASH_IN';
  if (!['CASH_IN','CASH_OUT','TRANSFER_IN','TRANSFER_OUT','OPENING'].includes(type)) throw new ApiError(400, 'Invalid entry type.');
  const result = await withTransaction(async (client) => {
    const accountId = req.body.accountPublicId
      ? await getByPublicId('financial_accounts', 'financial_account_id', req.body.accountPublicId, req.business.business_id, client)
      : await defaultAccountId(req.business.business_id, client);
    const sign = ['CASH_IN','TRANSFER_IN','OPENING'].includes(type) ? 1 : -1;
    await client.query(`UPDATE financial_accounts SET current_balance=current_balance + $2 WHERE financial_account_id=$1`, [accountId, amount * sign]);
    const row = await client.query(
      `INSERT INTO cash_book_entries(business_id, financial_account_id, entry_date, entry_type, amount, title, description, reference_type, reference_id, created_by)
       VALUES($1,$2,COALESCE($3::TIMESTAMPTZ,NOW()),$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [req.business.business_id, accountId, s(req.body.entryDate), type, amount, s(req.body.title) || type.replace('_',' '), s(req.body.description), s(req.body.referenceType), req.body.referenceId || null, req.user.user_id]
    );
    await insertAudit(client, req, 'CASHBOOK_CREATE', 'cash_book_entries', row.rows[0].cash_book_entry_id, row.rows[0]);
    return row.rows[0];
  });
  res.status(201).json({ success: true, data: result });
}));

// ---------------------------------------------------------
// Expenses
// ---------------------------------------------------------
router.get('/expenses/categories', asyncHandler(async (req, res) => {
  const result = await query(`SELECT public_id, category_name, is_active FROM expense_categories WHERE business_id=$1 AND is_deleted=FALSE ORDER BY category_name`, [req.business.business_id]);
  res.json({ success: true, data: result.rows });
}));

router.post('/expenses/categories', asyncHandler(async (req, res) => {
  if (!s(req.body.categoryName)) throw new ApiError(400, 'Category name is required.');
  const result = await query(
    `INSERT INTO expense_categories(business_id, category_name) VALUES($1,$2)
     RETURNING public_id, category_name, is_active`,
    [req.business.business_id, s(req.body.categoryName)]
  );
  res.status(201).json({ success: true, data: result.rows[0] });
}));

router.get('/expenses', asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT e.public_id, e.expense_date, e.title, e.amount, e.payment_method, e.description, ec.category_name, e.created_at
     FROM expenses e LEFT JOIN expense_categories ec ON ec.expense_category_id=e.expense_category_id
     WHERE e.business_id=$1 AND e.is_deleted=FALSE ORDER BY e.expense_date DESC LIMIT $2`,
    [req.business.business_id, pageLimit(req.query.limit, 200)]
  );
  res.json({ success: true, data: result.rows });
}));

router.post('/expenses', asyncHandler(async (req, res) => {
  const amount = n(req.body.amount);
  if (!s(req.body.title) || amount <= 0) throw new ApiError(400, 'Expense title and positive amount are required.');
  const result = await withTransaction(async (client) => {
    let categoryId = null;
    if (req.body.categoryPublicId) categoryId = await getByPublicId('expense_categories', 'expense_category_id', req.body.categoryPublicId, req.business.business_id, client);
    const expense = await client.query(
      `INSERT INTO expenses(business_id, expense_category_id, expense_date, title, amount, payment_method, description, attachment_url, created_by)
       VALUES($1,$2,COALESCE($3::TIMESTAMPTZ,NOW()),$4,$5,$6,$7,$8,$9) RETURNING *`,
      [req.business.business_id, categoryId, s(req.body.expenseDate), s(req.body.title), amount, s(req.body.paymentMethod) || 'Cash', s(req.body.description), s(req.body.attachmentUrl), req.user.user_id]
    );
    const accountId = await defaultAccountId(req.business.business_id, client);
    await client.query(`UPDATE financial_accounts SET current_balance=current_balance-$2 WHERE financial_account_id=$1`, [accountId, amount]);
    await client.query(
      `INSERT INTO cash_book_entries(business_id, financial_account_id, entry_type, amount, title, description, reference_type, reference_id, created_by)
       VALUES($1,$2,'CASH_OUT',$3,$4,$5,'EXPENSE',$6,$7)`,
      [req.business.business_id, accountId, amount, s(req.body.title), s(req.body.description), expense.rows[0].expense_id, req.user.user_id]
    );
    await insertAudit(client, req, 'EXPENSE_CREATE', 'expenses', expense.rows[0].expense_id, expense.rows[0]);
    return expense.rows[0];
  });
  res.status(201).json({ success: true, data: result });
}));

// ---------------------------------------------------------
// Purchases
// ---------------------------------------------------------
router.get('/purchases', asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT pb.public_id, pb.purchase_no, pb.purchase_date, pb.supplier_name_snapshot, pb.sub_total, pb.discount_amount, pb.tax_amount, pb.grand_total, pb.paid_amount, pb.balance_amount, pb.payment_status, pb.bill_status
     FROM purchase_bills pb WHERE pb.business_id=$1 AND pb.is_deleted=FALSE ORDER BY pb.purchase_date DESC LIMIT $2`,
    [req.business.business_id, pageLimit(req.query.limit, 200)]
  );
  res.json({ success: true, data: result.rows });
}));

router.post('/purchases', asyncHandler(async (req, res) => {
  const items = Array.isArray(req.body.items) ? req.body.items : [];
  if (!items.length) throw new ApiError(400, 'At least one purchase item is required.');
  const result = await withTransaction(async (client) => {
    let supplierId = null;
    let supplierName = s(req.body.supplierName) || 'Walk-in Supplier';
    let supplierPhone = s(req.body.supplierPhone);
    if (req.body.supplierPublicId) {
      supplierId = await getByPublicId('suppliers', 'supplier_id', req.body.supplierPublicId, req.business.business_id, client);
      const supplier = await client.query(`SELECT supplier_name, phone_number FROM suppliers WHERE supplier_id=$1`, [supplierId]);
      supplierName = supplier.rows[0].supplier_name;
      supplierPhone = supplier.rows[0].phone_number;
    }
    const purchaseNo = `PUR-${Date.now().toString().slice(-8)}`;
    const totals = items.reduce((a, item) => {
      const qty = n(item.qty, 1), price = n(item.unitCost || item.purchasePrice), disc = n(item.discountAmount), tax = n(item.taxAmount);
      return a + Math.max(0, qty * price - disc + tax);
    }, 0);
    const paid = Math.min(n(req.body.paidAmount), totals);
    const balance = totals - paid;
    const bill = await client.query(
      `INSERT INTO purchase_bills(business_id, supplier_id, purchase_no, purchase_date, supplier_name_snapshot, supplier_phone_snapshot, sub_total, discount_amount, tax_amount, grand_total, paid_amount, balance_amount, payment_status, notes, created_by)
       VALUES($1,$2,$3,COALESCE($4::TIMESTAMPTZ,NOW()),$5,$6,$7,0,0,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [req.business.business_id, supplierId, purchaseNo, s(req.body.purchaseDate), supplierName, supplierPhone, totals, paid, balance, balance <= 0 ? 'PAID' : paid > 0 ? 'PARTIAL' : 'UNPAID', s(req.body.notes), req.user.user_id]
    );
    for (const item of items) {
      const productId = item.productPublicId ? await getByPublicId('products', 'product_id', item.productPublicId, req.business.business_id, client) : null;
      if (!productId) continue;
      const qty = n(item.qty, 1), unitCost = n(item.unitCost || item.purchasePrice);
      const line = Math.max(0, qty * unitCost - n(item.discountAmount) + n(item.taxAmount));
      const prod = await client.query(`SELECT product_name FROM products WHERE product_id=$1`, [productId]);
      await client.query(
        `INSERT INTO purchase_bill_items(purchase_bill_id, business_id, product_id, item_name_snapshot, qty, unit_cost, discount_amount, tax_percent, tax_amount, line_total)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [bill.rows[0].purchase_bill_id, req.business.business_id, productId, prod.rows[0].product_name, qty, unitCost, n(item.discountAmount), n(item.taxPercent), n(item.taxAmount), line]
      );
      await client.query(`UPDATE products SET current_stock=current_stock+$2 WHERE product_id=$1 AND product_type='PRODUCT'`, [productId, qty]);
      const wh = await client.query(`SELECT warehouse_id FROM warehouses WHERE business_id=$1 AND is_deleted=FALSE ORDER BY is_default DESC LIMIT 1`, [req.business.business_id]);
      if (wh.rowCount) {
        await client.query(
          `INSERT INTO inventory_transactions(business_id, warehouse_id, product_id, transaction_type, reference_type, reference_id, qty_in, unit_cost, notes, created_by)
           VALUES($1,$2,$3,'PURCHASE','PURCHASE_BILL',$4,$5,$6,$7,$8)`,
          [req.business.business_id, wh.rows[0].warehouse_id, productId, bill.rows[0].purchase_bill_id, qty, unitCost, s(req.body.notes), req.user.user_id]
        );
      }
    }
    if (supplierId && balance > 0) {
      const balRes = await client.query(`SELECT current_balance FROM suppliers WHERE supplier_id=$1 FOR UPDATE`, [supplierId]);
      const newBal = n(balRes.rows[0].current_balance) + balance;
      await client.query(`UPDATE suppliers SET current_balance=$2 WHERE supplier_id=$1`, [supplierId, newBal]);
      await client.query(
        `INSERT INTO supplier_ledger(business_id, supplier_id, entry_type, reference_type, reference_id, debit_amount, balance_after, description, created_by)
         VALUES($1,$2,'PURCHASE','PURCHASE_BILL',$3,$4,$5,$6,$7)`,
        [req.business.business_id, supplierId, bill.rows[0].purchase_bill_id, balance, newBal, `Purchase ${purchaseNo}`, req.user.user_id]
      );
    }
    await insertAudit(client, req, 'PURCHASE_CREATE', 'purchase_bills', bill.rows[0].purchase_bill_id, bill.rows[0]);
    return bill.rows[0];
  });
  res.status(201).json({ success: true, data: result });
}));

// ---------------------------------------------------------
// Branches, staff, attendance, payroll, cheques
// ---------------------------------------------------------
router.get('/branches', asyncHandler(async (req, res) => {
  const result = await query(`SELECT public_id, branch_name, phone_number, address, city, is_main, is_active, created_at FROM branches WHERE business_id=$1 AND is_deleted=FALSE ORDER BY is_main DESC, branch_name`, [req.business.business_id]);
  res.json({ success: true, data: result.rows });
}));
router.post('/branches', asyncHandler(async (req, res) => {
  if (!s(req.body.branchName)) throw new ApiError(400, 'Branch name is required.');
  const result = await query(`INSERT INTO branches(business_id, branch_name, phone_number, address, city, is_main, created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [req.business.business_id, s(req.body.branchName), s(req.body.phoneNumber), s(req.body.address), s(req.body.city), !!req.body.isMain, req.user.user_id]);
  res.status(201).json({ success: true, data: result.rows[0] });
}));

router.get('/staff', asyncHandler(async (req, res) => {
  const result = await query(`SELECT public_id, full_name, phone_number, role_title, salary_type, salary_amount, joining_date, can_login, is_active, created_at FROM staff_members WHERE business_id=$1 AND is_deleted=FALSE ORDER BY full_name`, [req.business.business_id]);
  res.json({ success: true, data: result.rows });
}));
router.post('/staff', asyncHandler(async (req, res) => {
  if (!s(req.body.fullName)) throw new ApiError(400, 'Staff name is required.');
  const result = await query(
    `INSERT INTO staff_members(business_id, full_name, phone_number, role_title, salary_type, salary_amount, joining_date, cnic, address, can_login, created_by)
     VALUES($1,$2,$3,$4,$5,$6,$7::DATE,$8,$9,$10,$11) RETURNING *`,
    [req.business.business_id, s(req.body.fullName), s(req.body.phoneNumber), s(req.body.roleTitle), s(req.body.salaryType) || 'MONTHLY', n(req.body.salaryAmount), s(req.body.joiningDate), s(req.body.cnic), s(req.body.address), !!req.body.canLogin, req.user.user_id]
  );
  res.status(201).json({ success: true, data: result.rows[0] });
}));

router.get('/attendance', asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT ar.public_id, ar.attendance_date, ar.status, ar.check_in_time, ar.check_out_time, ar.overtime_hours, ar.notes, sm.full_name
     FROM attendance_records ar JOIN staff_members sm ON sm.staff_member_id=ar.staff_member_id
     WHERE ar.business_id=$1 AND ar.is_deleted=FALSE ORDER BY ar.attendance_date DESC LIMIT $2`,
    [req.business.business_id, pageLimit(req.query.limit, 200)]
  );
  res.json({ success: true, data: result.rows });
}));
router.post('/attendance', asyncHandler(async (req, res) => {
  const staffId = await getByPublicId('staff_members', 'staff_member_id', req.body.staffPublicId, req.business.business_id);
  const result = await query(
    `INSERT INTO attendance_records(business_id, staff_member_id, attendance_date, status, check_in_time, check_out_time, overtime_hours, notes, created_by)
     VALUES($1,$2,COALESCE($3::DATE,CURRENT_DATE),$4,$5::TIME,$6::TIME,$7,$8,$9)
     ON CONFLICT (business_id, staff_member_id, attendance_date) DO UPDATE SET status=EXCLUDED.status, check_in_time=EXCLUDED.check_in_time, check_out_time=EXCLUDED.check_out_time, overtime_hours=EXCLUDED.overtime_hours, notes=EXCLUDED.notes, updated_at=NOW()
     RETURNING *`,
    [req.business.business_id, staffId, s(req.body.attendanceDate), s(req.body.status) || 'PRESENT', s(req.body.checkInTime), s(req.body.checkOutTime), n(req.body.overtimeHours), s(req.body.notes), req.user.user_id]
  );
  res.status(201).json({ success: true, data: result.rows[0] });
}));

router.get('/payroll', asyncHandler(async (req, res) => {
  const result = await query(`SELECT public_id, payroll_month, title, gross_amount, deduction_amount, net_amount, paid_amount, status, created_at FROM payroll_runs WHERE business_id=$1 AND is_deleted=FALSE ORDER BY payroll_month DESC LIMIT $2`, [req.business.business_id, pageLimit(req.query.limit, 100)]);
  res.json({ success: true, data: result.rows });
}));
router.post('/payroll', asyncHandler(async (req, res) => {
  const month = s(req.body.payrollMonth) || new Date().toISOString().slice(0, 10);
  const result = await query(
    `INSERT INTO payroll_runs(business_id, payroll_month, title, gross_amount, deduction_amount, net_amount, paid_amount, status, created_by)
     VALUES($1,$2::DATE,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [req.business.business_id, month, s(req.body.title) || `Salary ${month.slice(0,7)}`, n(req.body.grossAmount), n(req.body.deductionAmount), n(req.body.netAmount), n(req.body.paidAmount), s(req.body.status) || 'DRAFT', req.user.user_id]
  );
  res.status(201).json({ success: true, data: result.rows[0] });
}));

router.get('/cheques', asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT cr.public_id, cr.party_type, cr.cheque_no, cr.bank_name, cr.amount, cr.cheque_date, cr.status, cr.notes,
            c.customer_name, s.supplier_name
     FROM cheque_records cr
     LEFT JOIN customers c ON c.customer_id=cr.customer_id
     LEFT JOIN suppliers s ON s.supplier_id=cr.supplier_id
     WHERE cr.business_id=$1 AND cr.is_deleted=FALSE ORDER BY cr.cheque_date DESC NULLS LAST LIMIT $2`,
    [req.business.business_id, pageLimit(req.query.limit, 200)]
  );
  res.json({ success: true, data: result.rows });
}));
router.post('/cheques', asyncHandler(async (req, res) => {
  const result = await query(
    `INSERT INTO cheque_records(business_id, party_type, cheque_no, bank_name, amount, cheque_date, status, notes, created_by)
     VALUES($1,$2,$3,$4,$5,$6::DATE,$7,$8,$9) RETURNING *`,
    [req.business.business_id, s(req.body.partyType) || 'CUSTOMER', s(req.body.chequeNo), s(req.body.bankName), n(req.body.amount), s(req.body.chequeDate), s(req.body.status) || 'PENDING', s(req.body.notes), req.user.user_id]
  );
  res.status(201).json({ success: true, data: result.rows[0] });
}));

// ---------------------------------------------------------
// Notifications, settings, support, search, backup and sync
// ---------------------------------------------------------
router.get('/notifications', asyncHandler(async (req, res) => {
  const result = await query(`SELECT notification_id, title, message, notification_type, reference_type, reference_id, is_read, created_at FROM notifications WHERE business_id=$1 AND (user_id IS NULL OR user_id=$2) ORDER BY created_at DESC LIMIT $3`, [req.business.business_id, req.user.user_id, pageLimit(req.query.limit, 100)]);
  res.json({ success: true, data: result.rows });
}));

router.get('/settings', asyncHandler(async (req, res) => {
  const result = await query(`SELECT * FROM business_settings WHERE business_id=$1`, [req.business.business_id]);
  res.json({ success: true, data: result.rows[0] || {} });
}));
router.put('/settings', asyncHandler(async (req, res) => {
  const result = await query(
    `INSERT INTO business_settings(business_id, invoice_prefix, quotation_prefix, purchase_prefix, show_logo_on_invoice, show_tax_on_invoice, default_tax_percent, invoice_terms, invoice_footer_text, allow_negative_stock, low_stock_alert)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (business_id) DO UPDATE SET invoice_prefix=EXCLUDED.invoice_prefix, quotation_prefix=EXCLUDED.quotation_prefix, purchase_prefix=EXCLUDED.purchase_prefix, show_logo_on_invoice=EXCLUDED.show_logo_on_invoice, show_tax_on_invoice=EXCLUDED.show_tax_on_invoice, default_tax_percent=EXCLUDED.default_tax_percent, invoice_terms=EXCLUDED.invoice_terms, invoice_footer_text=EXCLUDED.invoice_footer_text, allow_negative_stock=EXCLUDED.allow_negative_stock, low_stock_alert=EXCLUDED.low_stock_alert, updated_at=NOW()
     RETURNING *`,
    [req.business.business_id, s(req.body.invoicePrefix) || 'INV', s(req.body.quotationPrefix) || 'QT', s(req.body.purchasePrefix) || 'PUR', req.body.showLogoOnInvoice !== false, !!req.body.showTaxOnInvoice, n(req.body.defaultTaxPercent), s(req.body.invoiceTerms), s(req.body.invoiceFooterText), !!req.body.allowNegativeStock, req.body.lowStockAlert !== false]
  );
  res.json({ success: true, data: result.rows[0] });
}));

router.get('/support-tickets', asyncHandler(async (req, res) => {
  const result = await query(`SELECT public_id, subject, message, status, priority, created_at, updated_at FROM support_tickets WHERE business_id=$1 AND is_deleted=FALSE ORDER BY created_at DESC LIMIT $2`, [req.business.business_id, pageLimit(req.query.limit, 100)]);
  res.json({ success: true, data: result.rows });
}));
router.post('/support-tickets', asyncHandler(async (req, res) => {
  if (!s(req.body.subject)) throw new ApiError(400, 'Subject is required.');
  const result = await query(`INSERT INTO support_tickets(business_id, user_id, subject, message, priority) VALUES($1,$2,$3,$4,$5) RETURNING *`, [req.business.business_id, req.user.user_id, s(req.body.subject), s(req.body.message), s(req.body.priority) || 'NORMAL']);
  res.status(201).json({ success: true, data: result.rows[0] });
}));

router.get('/search', asyncHandler(async (req, res) => {
  const term = `%${String(req.query.q || '').toLowerCase()}%`;
  if (term.length < 4) return res.json({ success: true, data: { customers: [], suppliers: [], products: [], invoices: [] } });
  const [customers, suppliers, products, invoices] = await Promise.all([
    query(`SELECT 'customer' AS type, public_id, customer_name AS title, phone_number AS subtitle, current_balance AS amount FROM customers WHERE business_id=$1 AND is_deleted=FALSE AND (LOWER(customer_name) LIKE $2 OR COALESCE(phone_number,'') LIKE $2) LIMIT 10`, [req.business.business_id, term]),
    query(`SELECT 'supplier' AS type, public_id, supplier_name AS title, phone_number AS subtitle, current_balance AS amount FROM suppliers WHERE business_id=$1 AND is_deleted=FALSE AND (LOWER(supplier_name) LIKE $2 OR COALESCE(phone_number,'') LIKE $2) LIMIT 10`, [req.business.business_id, term]),
    query(`SELECT 'product' AS type, public_id, product_name AS title, sku AS subtitle, sale_price AS amount FROM products WHERE business_id=$1 AND is_deleted=FALSE AND (LOWER(product_name) LIKE $2 OR COALESCE(sku,'') LIKE $2 OR COALESCE(barcode,'') LIKE $2) LIMIT 10`, [req.business.business_id, term]),
    query(`SELECT 'invoice' AS type, public_id, invoice_no AS title, customer_name_snapshot AS subtitle, grand_total AS amount FROM sales_invoices WHERE business_id=$1 AND is_deleted=FALSE AND (LOWER(invoice_no) LIKE $2 OR LOWER(COALESCE(customer_name_snapshot,'')) LIKE $2) LIMIT 10`, [req.business.business_id, term]),
  ]);
  res.json({ success: true, data: { customers: customers.rows, suppliers: suppliers.rows, products: products.rows, invoices: invoices.rows } });
}));

router.post('/backup/request', asyncHandler(async (req, res) => {
  const result = await query(`INSERT INTO backup_export_requests(business_id, export_type, requested_by, notes) VALUES($1,$2,$3,$4) RETURNING public_id, export_type, status, requested_at`, [req.business.business_id, s(req.body.exportType) || 'ALL', req.user.user_id, s(req.body.notes)]);
  res.status(201).json({ success: true, message: 'Backup/export request created.', data: result.rows[0] });
}));

router.get('/export/:type', asyncHandler(async (req, res) => {
  const type = req.params.type;
  const businessId = req.business.business_id;
  const queries = {
    customers: `SELECT customer_name, phone_number, whatsapp_number, city, opening_balance, current_balance FROM customers WHERE business_id=$1 AND is_deleted=FALSE ORDER BY customer_name`,
    suppliers: `SELECT supplier_name, phone_number, whatsapp_number, city, opening_balance, current_balance FROM suppliers WHERE business_id=$1 AND is_deleted=FALSE ORDER BY supplier_name`,
    products: `SELECT product_name, sku, barcode, product_type, purchase_price, sale_price, current_stock, low_stock_qty FROM products WHERE business_id=$1 AND is_deleted=FALSE ORDER BY product_name`,
    inventory: `SELECT product_name, sku, barcode, product_type, purchase_price, sale_price, current_stock, low_stock_qty FROM products WHERE business_id=$1 AND is_deleted=FALSE ORDER BY product_name`,
    sales: `SELECT invoice_no, invoice_date, customer_name_snapshot, grand_total, paid_amount, balance_amount, payment_status FROM sales_invoices WHERE business_id=$1 AND is_deleted=FALSE ORDER BY invoice_date DESC`,
    expenses: `SELECT expense_date, title, amount, payment_method, description FROM expenses WHERE business_id=$1 AND is_deleted=FALSE ORDER BY expense_date DESC`,
  };
  if (!queries[type]) throw new ApiError(400, 'Invalid export type.');
  const result = await query(queries[type], [businessId]);
  res.json({ success: true, data: result.rows });
}));

router.get('/sync/pull', asyncHandler(async (req, res) => {
  const businessId = req.business.business_id;
  const [customers, products, suppliers, settings] = await Promise.all([
    query(`SELECT * FROM customers WHERE business_id=$1 AND is_deleted=FALSE ORDER BY updated_at DESC NULLS LAST, created_at DESC LIMIT 500`, [businessId]),
    query(`SELECT * FROM products WHERE business_id=$1 AND is_deleted=FALSE ORDER BY updated_at DESC NULLS LAST, created_at DESC LIMIT 500`, [businessId]),
    query(`SELECT * FROM suppliers WHERE business_id=$1 AND is_deleted=FALSE ORDER BY updated_at DESC NULLS LAST, created_at DESC LIMIT 500`, [businessId]),
    query(`SELECT * FROM business_settings WHERE business_id=$1`, [businessId]),
  ]);
  res.json({ success: true, serverTime: new Date().toISOString(), data: { customers: customers.rows, products: products.rows, suppliers: suppliers.rows, settings: settings.rows[0] || {} } });
}));
router.post('/sync/push', asyncHandler(async (req, res) => {
  const changes = Array.isArray(req.body.changes) ? req.body.changes : [];
  await query(`INSERT INTO audit_logs(business_id, user_id, action_name, entity_name, new_values) VALUES($1,$2,'SYNC_PUSH','offline_changes',$3)`, [req.business.business_id, req.user.user_id, JSON.stringify({ count: changes.length, changes })]);
  res.json({ success: true, message: 'Sync payload received. Detailed conflict resolver can be enabled later.', synced: changes.length });
}));

// ---------------------------------------------------------
// Reports
// ---------------------------------------------------------
router.get('/reports/profit-loss', asyncHandler(async (req, res) => {
  const from = s(req.query.from) || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
  const to = s(req.query.to) || new Date().toISOString().slice(0, 10);
  const [sales, purchases, expenses] = await Promise.all([
    query(`SELECT COALESCE(SUM(grand_total),0) total FROM sales_invoices WHERE business_id=$1 AND is_deleted=FALSE AND invoice_status <> 'CANCELLED' AND invoice_date::DATE BETWEEN $2::DATE AND $3::DATE`, [req.business.business_id, from, to]),
    query(`SELECT COALESCE(SUM(grand_total),0) total FROM purchase_bills WHERE business_id=$1 AND is_deleted=FALSE AND bill_status <> 'CANCELLED' AND purchase_date::DATE BETWEEN $2::DATE AND $3::DATE`, [req.business.business_id, from, to]),
    query(`SELECT COALESCE(SUM(amount),0) total FROM expenses WHERE business_id=$1 AND is_deleted=FALSE AND expense_date::DATE BETWEEN $2::DATE AND $3::DATE`, [req.business.business_id, from, to]),
  ]);
  const totalSales = n(sales.rows[0].total), totalPurchases = n(purchases.rows[0].total), totalExpenses = n(expenses.rows[0].total);
  res.json({ success: true, data: { from, to, totalSales, totalPurchases, totalExpenses, estimatedProfit: totalSales - totalPurchases - totalExpenses } });
}));

router.get('/reports/receivables', asyncHandler(async (req, res) => {
  const result = await query(`SELECT customer_name, phone_number, whatsapp_number, current_balance, credit_limit FROM customers WHERE business_id=$1 AND is_deleted=FALSE AND current_balance>0 ORDER BY current_balance DESC`, [req.business.business_id]);
  res.json({ success: true, data: result.rows });
}));
router.get('/reports/payables', asyncHandler(async (req, res) => {
  const result = await query(`SELECT supplier_name, phone_number, whatsapp_number, current_balance FROM suppliers WHERE business_id=$1 AND is_deleted=FALSE AND current_balance>0 ORDER BY current_balance DESC`, [req.business.business_id]);
  res.json({ success: true, data: result.rows });
}));
router.get('/reports/stock', asyncHandler(async (req, res) => {
  const result = await query(`SELECT product_name, sku, barcode, current_stock, low_stock_qty, purchase_price, sale_price, (current_stock*purchase_price) AS stock_value FROM products WHERE business_id=$1 AND is_deleted=FALSE AND product_type='PRODUCT' ORDER BY product_name`, [req.business.business_id]);
  res.json({ success: true, data: result.rows });
}));
router.get('/reports/audit-logs', asyncHandler(async (req, res) => {
  const result = await query(`SELECT action_name, entity_name, entity_id, old_values, new_values, created_at FROM audit_logs WHERE business_id=$1 ORDER BY created_at DESC LIMIT $2`, [req.business.business_id, pageLimit(req.query.limit, 200)]);
  res.json({ success: true, data: result.rows });
}));

// WhatsApp settings/logs for APK and business web admin.
router.get('/whatsapp/settings', asyncHandler(async (req, res) => {
  const result = await query(`SELECT provider, api_url, sender_phone, is_active, updated_at FROM business_whatsapp_settings WHERE business_id=$1`, [req.business.business_id]);
  res.json({ success: true, data: result.rows[0] || { provider: 'custom', api_url: null, sender_phone: null, is_active: false } });
}));
router.get('/whatsapp/logs', asyncHandler(async (req, res) => {
  const result = await query(`SELECT document_type, phone_number, message_text, file_url, share_status, shared_at FROM whatsapp_share_logs WHERE business_id=$1 ORDER BY shared_at DESC LIMIT $2`, [req.business.business_id, pageLimit(req.query.limit, 200)]);
  res.json({ success: true, data: result.rows });
}));

module.exports = router;
