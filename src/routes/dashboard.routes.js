const express = require('express');
const asyncHandler = require('../utils/async-handler');
const { query } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { requireBusiness, canOwnerOrPermission } = require('../middleware/business');

const router = express.Router();
router.use(requireAuth, requireBusiness);

router.get('/summary', canOwnerOrPermission('REPORT_VIEW'), asyncHandler(async (req, res) => {
  const businessId = req.business.business_id;
  const [sales, receivable, customers, products, lowStock, reminders] = await Promise.all([
    query(`SELECT COALESCE(SUM(grand_total),0) today_sales, COUNT(*) today_invoices FROM sales_invoices WHERE business_id=$1 AND is_deleted=FALSE AND invoice_status <> 'CANCELLED' AND invoice_date::DATE = CURRENT_DATE`, [businessId]),
    query(`SELECT COALESCE(SUM(current_balance),0) receivable FROM customers WHERE business_id=$1 AND is_deleted=FALSE`, [businessId]),
    query(`SELECT COUNT(*) total_customers FROM customers WHERE business_id=$1 AND is_deleted=FALSE`, [businessId]),
    query(`SELECT COUNT(*) total_products FROM products WHERE business_id=$1 AND is_deleted=FALSE`, [businessId]),
    query(`SELECT COUNT(*) low_stock FROM products WHERE business_id=$1 AND is_deleted=FALSE AND product_type='PRODUCT' AND low_stock_qty IS NOT NULL AND current_stock <= low_stock_qty`, [businessId]),
    query(`SELECT COUNT(*) due_reminders FROM reminders WHERE business_id=$1 AND is_deleted=FALSE AND reminder_status='PENDING' AND reminder_datetime <= NOW()`, [businessId]),
  ]);
  res.json({
    success: true,
    data: {
      todaySales: sales.rows[0].today_sales,
      todayInvoices: sales.rows[0].today_invoices,
      receivable: receivable.rows[0].receivable,
      totalCustomers: customers.rows[0].total_customers,
      totalProducts: products.rows[0].total_products,
      lowStock: lowStock.rows[0].low_stock,
      dueReminders: reminders.rows[0].due_reminders,
    },
  });
}));

router.get('/sales-daily', canOwnerOrPermission('REPORT_VIEW'), asyncHandler(async (req, res) => {
  const days = Math.min(Math.max(Number(req.query.days || 30), 1), 365);
  const result = await query(
    `SELECT sale_date, total_invoices, total_sales, total_paid, total_balance
     FROM vw_sales_summary_daily
     WHERE business_id=$1 AND sale_date >= CURRENT_DATE - $2::INT
     ORDER BY sale_date`,
    [req.business.business_id, days]
  );
  res.json({ success: true, data: result.rows });
}));

module.exports = router;
