const express = require('express');
const Joi = require('joi');
const asyncHandler = require('../utils/async-handler');
const { query, withTransaction } = require('../db');
const { validate } = require('../middleware/validate');
const { requireAuth, requireSuperAdmin } = require('../middleware/auth');
const { getPagination, paged } = require('../utils/pagination');
const { ApiError } = require('../utils/api-error');

const router = express.Router();
router.use(requireAuth, requireSuperAdmin);

router.get('/dashboard', asyncHandler(async (req, res) => {
  const [businesses, users, pendingPayments, activeSubs] = await Promise.all([
    query(`SELECT COUNT(*) count FROM businesses WHERE is_deleted=FALSE`),
    query(`SELECT COUNT(*) count FROM app_users WHERE is_deleted=FALSE`),
    query(`SELECT COUNT(*) count FROM subscription_payments WHERE payment_status='PENDING'`),
    query(`SELECT COUNT(*) count FROM business_subscriptions WHERE subscription_status IN ('ACTIVE','TRIAL') AND end_date >= CURRENT_DATE`),
  ]);
  res.json({ success: true, data: {
    totalBusinesses: businesses.rows[0].count,
    totalUsers: users.rows[0].count,
    pendingSubscriptionPayments: pendingPayments.rows[0].count,
    activeSubscriptions: activeSubs.rows[0].count,
  }});
}));

router.get('/businesses', asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req.query);
  const search = req.query.search ? `%${req.query.search.toLowerCase()}%` : null;
  const result = await query(
    `SELECT b.public_id, b.business_name, b.business_type, b.phone_number, b.city, b.is_active, b.is_blocked, b.created_at,
            u.full_name AS owner_name, u.email AS owner_email, u.phone_number AS owner_phone
     FROM businesses b
     JOIN app_users u ON u.user_id = b.owner_user_id
     WHERE b.is_deleted=FALSE AND ($1::TEXT IS NULL OR LOWER(b.business_name) LIKE $1 OR LOWER(COALESCE(u.full_name,'')) LIKE $1 OR COALESCE(b.phone_number,'') LIKE $1)
     ORDER BY b.created_at DESC LIMIT $2 OFFSET $3`,
    [search, limit, offset]
  );
  const count = await query(
    `SELECT COUNT(*) FROM businesses b JOIN app_users u ON u.user_id=b.owner_user_id WHERE b.is_deleted=FALSE AND ($1::TEXT IS NULL OR LOWER(b.business_name) LIKE $1 OR LOWER(COALESCE(u.full_name,'')) LIKE $1 OR COALESCE(b.phone_number,'') LIKE $1)`,
    [search]
  );
  res.json({ success: true, ...paged(result.rows, count.rows[0].count, page, limit) });
}));

router.patch('/businesses/:publicId/block', validate(Joi.object({ isBlocked: Joi.boolean().required(), reason: Joi.string().allow('', null) })), asyncHandler(async (req, res) => {
  const result = await query(
    `UPDATE businesses SET is_blocked=$2, block_reason=$3 WHERE public_id=$1 AND is_deleted=FALSE RETURNING public_id, is_blocked`,
    [req.params.publicId, req.body.isBlocked, req.body.reason || null]
  );
  if (result.rowCount === 0) throw new ApiError(404, 'Business not found.');
  res.json({ success: true, data: result.rows[0] });
}));

router.get('/subscription-payments', asyncHandler(async (req, res) => {
  const status = req.query.status || null;
  const result = await query(
    `SELECT sp.subscription_payment_id, sp.amount, sp.currency_code, sp.payment_method, sp.transaction_reference,
            sp.payment_screenshot_url, sp.payment_status, sp.paid_at, sp.created_at, b.business_name, b.public_id AS business_public_id
     FROM subscription_payments sp
     JOIN businesses b ON b.business_id = sp.business_id
     WHERE ($1::TEXT IS NULL OR sp.payment_status=$1)
     ORDER BY sp.created_at DESC LIMIT 200`,
    [status]
  );
  res.json({ success: true, data: result.rows });
}));

router.post('/subscription-payments/:id/approve', asyncHandler(async (req, res) => {
  await withTransaction(async (client) => {
    const payment = await client.query(`SELECT * FROM subscription_payments WHERE subscription_payment_id=$1 FOR UPDATE`, [req.params.id]);
    if (payment.rowCount === 0) throw new ApiError(404, 'Payment not found.');
    const p = payment.rows[0];
    await client.query(
      `UPDATE subscription_payments SET payment_status='APPROVED', approved_by=$2, approved_at=NOW() WHERE subscription_payment_id=$1`,
      [p.subscription_payment_id, req.user.user_id]
    );
    await client.query(
      `UPDATE business_subscriptions
       SET subscription_status='ACTIVE', is_trial=FALSE,
           start_date=CURRENT_DATE,
           end_date=(GREATEST(end_date, CURRENT_DATE) + INTERVAL '1 month')::date
       WHERE business_subscription_id=$1`,
      [p.business_subscription_id]
    );
  });
  res.json({ success: true, message: 'Subscription payment approved.' });
}));

router.post('/subscription-payments/:id/reject', validate(Joi.object({ reason: Joi.string().trim().max(500).required() })), asyncHandler(async (req, res) => {
  const result = await query(
    `UPDATE subscription_payments SET payment_status='REJECTED', reject_reason=$2 WHERE subscription_payment_id=$1 RETURNING subscription_payment_id`,
    [req.params.id, req.body.reason]
  );
  if (result.rowCount === 0) throw new ApiError(404, 'Payment not found.');
  res.json({ success: true, message: 'Subscription payment rejected.' });
}));

module.exports = router;
