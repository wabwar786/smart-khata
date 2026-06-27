const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query, withTransaction } = require('../db');
const { env } = require('../config/env');
const { ApiError } = require('../utils/api-error');

function signToken(user) {
  return jwt.sign({ userId: user.user_id, publicId: user.public_id }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
  });
}

function safeUser(row) {
  return {
    publicId: row.public_id,
    fullName: row.full_name,
    email: row.email,
    phoneNumber: row.phone_number,
    isSuperAdmin: row.is_super_admin,
    isSupportAdmin: row.is_support_admin,
  };
}

async function signup(payload) {
  const email = payload.email ? payload.email.toLowerCase().trim() : null;
  const phoneNumber = payload.phoneNumber || null;

  if (!email && !phoneNumber) {
    throw new ApiError(400, 'Email or phone number is required.');
  }

  return withTransaction(async (client) => {
    const existing = await client.query(
      `SELECT user_id FROM app_users
       WHERE is_deleted = FALSE AND (($1::TEXT IS NOT NULL AND LOWER(email) = $1) OR ($2::TEXT IS NOT NULL AND phone_number = $2))`,
      [email, phoneNumber]
    );
    if (existing.rowCount > 0) throw new ApiError(409, 'User already exists.');

    const passwordHash = await bcrypt.hash(payload.password, 12);
    const userRes = await client.query(
      `INSERT INTO app_users(full_name, email, phone_number, password_hash, is_phone_verified, is_email_verified)
       VALUES($1, $2, $3, $4, FALSE, FALSE)
       RETURNING user_id, public_id, full_name, email, phone_number, is_super_admin, is_support_admin`,
      [payload.fullName, email, phoneNumber, passwordHash]
    );
    const user = userRes.rows[0];

    const businessRes = await client.query(
      `INSERT INTO businesses(owner_user_id, business_name, business_type, phone_number, whatsapp_number, email, city, currency_code)
       VALUES($1, $2, $3, $4, $5, $6, $7, 'PKR')
       RETURNING business_id, public_id, business_name, currency_code`,
      [
        user.user_id,
        payload.businessName,
        payload.businessType || null,
        phoneNumber,
        phoneNumber,
        email,
        payload.city || null,
      ]
    );
    const business = businessRes.rows[0];

    const ownerRole = await client.query(`SELECT role_id FROM roles WHERE role_code = 'OWNER' LIMIT 1`);
    if (ownerRole.rowCount === 0) throw new ApiError(500, 'OWNER role is missing. Run seed migration.');

    await client.query(
      `INSERT INTO business_users(business_id, user_id, role_id, is_owner, created_by)
       VALUES($1, $2, $3, TRUE, $2)`,
      [business.business_id, user.user_id, ownerRole.rows[0].role_id]
    );

    await client.query(
      `INSERT INTO business_settings(business_id) VALUES($1)`,
      [business.business_id]
    );

    await client.query(
      `INSERT INTO document_sequences(business_id, document_type, prefix, next_number)
       VALUES
       ($1, 'SALE_INVOICE', 'INV', 1),
       ($1, 'QUOTATION', 'QT', 1),
       ($1, 'PURCHASE_BILL', 'PUR', 1)`,
      [business.business_id]
    );

    await client.query(
      `INSERT INTO warehouses(business_id, warehouse_name, is_default, created_by)
       VALUES($1, 'Default Warehouse', TRUE, $2)`,
      [business.business_id, user.user_id]
    );

    const basicPlan = await client.query(`SELECT plan_id FROM subscription_plans WHERE plan_code = 'BASIC' LIMIT 1`);
    if (basicPlan.rowCount > 0) {
      await client.query(
        `INSERT INTO business_subscriptions(business_id, plan_id, start_date, end_date, subscription_status, is_trial)
         VALUES($1, $2, CURRENT_DATE, CURRENT_DATE + INTERVAL '14 days', 'TRIAL', TRUE)`,
        [business.business_id, basicPlan.rows[0].plan_id]
      );
    }

    return {
      token: signToken(user),
      user: safeUser(user),
      business: {
        publicId: business.public_id,
        businessName: business.business_name,
        currencyCode: business.currency_code,
      },
    };
  });
}

async function login(payload) {
  const loginId = payload.emailOrPhone.toLowerCase().trim();
  const result = await query(
    `SELECT user_id, public_id, full_name, email, phone_number, password_hash, is_super_admin, is_support_admin, is_active
     FROM app_users
     WHERE is_deleted = FALSE AND (LOWER(email) = $1 OR phone_number = $2)
     LIMIT 1`,
    [loginId, payload.emailOrPhone.trim()]
  );

  if (result.rowCount === 0) throw new ApiError(401, 'Invalid login details.');
  const user = result.rows[0];
  if (!user.is_active) throw new ApiError(403, 'Your account is inactive.');

  const ok = await bcrypt.compare(payload.password, user.password_hash);
  if (!ok) throw new ApiError(401, 'Invalid login details.');

  await query(`UPDATE app_users SET last_login_at = NOW() WHERE user_id = $1`, [user.user_id]);

  return {
    token: signToken(user),
    user: safeUser(user),
  };
}

async function listBusinesses(userId) {
  const result = await query(
    `SELECT b.public_id, b.business_name, b.business_type, b.city, b.currency_code, b.is_blocked,
            bu.is_owner, r.role_code, r.role_name
     FROM business_users bu
     JOIN businesses b ON b.business_id = bu.business_id
     JOIN roles r ON r.role_id = bu.role_id
     WHERE bu.user_id = $1
       AND bu.is_deleted = FALSE
       AND b.is_deleted = FALSE
     ORDER BY bu.is_owner DESC, b.business_name`,
    [userId]
  );
  return result.rows.map((row) => ({
    publicId: row.public_id,
    businessName: row.business_name,
    businessType: row.business_type,
    city: row.city,
    currencyCode: row.currency_code,
    isBlocked: row.is_blocked,
    isOwner: row.is_owner,
    roleCode: row.role_code,
    roleName: row.role_name,
  }));
}

module.exports = { signup, login, safeUser, listBusinesses };
