const express = require('express');
const Joi = require('joi');
const asyncHandler = require('../utils/async-handler');
const { query } = require('../db');
const { validate } = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { requireBusiness, canOwnerOrPermission } = require('../middleware/business');
const { ApiError } = require('../utils/api-error');

const router = express.Router();

router.use(requireAuth);

router.get('/plans', asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT plan_id, plan_name, plan_code, monthly_price, currency_code, max_businesses, max_users,
            max_customers, max_products, max_invoices_per_month, has_inventory, has_quotation,
            has_reports, has_whatsapp_sharing, has_multi_user
     FROM subscription_plans WHERE is_active=TRUE ORDER BY monthly_price`,
  );
  res.json({ success: true, data: result.rows });
}));

router.get('/current', requireBusiness, canOwnerOrPermission('SUBSCRIPTION_VIEW'), asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT bs.business_subscription_id, bs.start_date, bs.end_date, bs.subscription_status, bs.is_trial,
            sp.plan_name, sp.plan_code, sp.monthly_price, sp.currency_code
     FROM business_subscriptions bs
     JOIN subscription_plans sp ON sp.plan_id = bs.plan_id
     WHERE bs.business_id=$1
     ORDER BY bs.business_subscription_id DESC LIMIT 1`,
    [req.business.business_id]
  );
  res.json({ success: true, data: result.rows[0] || null });
}));

router.post('/payment-request', requireBusiness, canOwnerOrPermission('SUBSCRIPTION_PAY'), validate(Joi.object({
  amount: Joi.number().positive().required(),
  paymentMethod: Joi.string().trim().max(50).required(),
  transactionReference: Joi.string().trim().max(150).allow('', null),
  paymentScreenshotUrl: Joi.string().uri().allow('', null),
})), asyncHandler(async (req, res) => {
  const sub = await query(`SELECT business_subscription_id FROM business_subscriptions WHERE business_id=$1 ORDER BY business_subscription_id DESC LIMIT 1`, [req.business.business_id]);
  if (sub.rowCount === 0) throw new ApiError(400, 'Subscription record not found.');
  const result = await query(
    `INSERT INTO subscription_payments(business_subscription_id, business_id, amount, payment_method, transaction_reference, payment_screenshot_url, payment_status, paid_at)
     VALUES($1,$2,$3,$4,$5,$6,'PENDING',NOW()) RETURNING subscription_payment_id, payment_status`,
    [sub.rows[0].business_subscription_id, req.business.business_id, req.body.amount, req.body.paymentMethod, req.body.transactionReference || null, req.body.paymentScreenshotUrl || null]
  );
  res.status(201).json({ success: true, data: result.rows[0] });
}));

module.exports = router;
