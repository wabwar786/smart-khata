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

function normalizePhone(phoneNumber) {
  let digits = String(phoneNumber || '').replace(/\D/g, '');
  if (digits.startsWith('0')) digits = digits.slice(1);
  if (!digits.startsWith('92')) digits = `92${digits}`;
  return digits;
}

async function sendWhatsAppOtp(phoneNumber, otp) {
  if (!env.WA_ENGINE_API_KEY) {
    console.log(`[otp] WA_ENGINE_API_KEY not configured. OTP for ${phoneNumber}: ${otp}`);
    return { sent: false, reason: 'WA_ENGINE_API_KEY missing' };
  }
  const response = await fetch(`${env.WA_ENGINE_BASE_URL}/api/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': env.WA_ENGINE_API_KEY },
    body: JSON.stringify({ to: phoneNumber, message: `Your Smart Khata OTP is ${otp}. It will expire in 5 minutes.` }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new ApiError(502, `WhatsApp OTP could not be sent. ${text}`.trim());
  }
  return { sent: true };
}

async function requestOtp(payload, meta = {}) {
  const phoneNumber = normalizePhone(payload.phoneNumber);
  if (phoneNumber.length < 12) throw new ApiError(400, 'Valid WhatsApp mobile number is required.');
  const otp = String(Math.floor(100000 + Math.random() * 900000));
  const otpHash = await bcrypt.hash(otp, 10);
  await query(
    `UPDATE whatsapp_otp_codes SET used_at=NOW() WHERE phone_number=$1 AND purpose='LOGIN' AND used_at IS NULL`,
    [phoneNumber]
  );
  await query(
    `INSERT INTO whatsapp_otp_codes(phone_number, otp_hash, purpose, expires_at, ip_address, user_agent)
     VALUES($1,$2,'LOGIN',NOW() + INTERVAL '5 minutes',$3,$4)`,
    [phoneNumber, otpHash, meta.ip || null, meta.userAgent || null]
  );
  const sendResult = await sendWhatsAppOtp(phoneNumber, otp);
  const allowDevOtp = env.NODE_ENV !== 'production' || env.ALLOW_DEMO_OTP || !env.WA_ENGINE_API_KEY;
  return { phoneNumber, sent: sendResult.sent, devOtp: allowDevOtp ? otp : undefined };
}

async function ensureOtpUserAndBusiness(client, phoneNumber) {
  let userRes = await client.query(
    `SELECT user_id, public_id, full_name, email, phone_number, is_super_admin, is_support_admin, is_active
     FROM app_users WHERE is_deleted=FALSE AND phone_number=$1 LIMIT 1`,
    [phoneNumber]
  );
  let user = userRes.rows[0];
  if (!user) {
    const passwordHash = await bcrypt.hash(`wa-${phoneNumber}-${Date.now()}-${Math.random()}`, 12);
    userRes = await client.query(
      `INSERT INTO app_users(full_name, phone_number, password_hash, is_phone_verified, is_email_verified)
       VALUES($1,$2,$3,TRUE,FALSE)
       RETURNING user_id, public_id, full_name, email, phone_number, is_super_admin, is_support_admin, is_active`,
      ['WhatsApp User', phoneNumber, passwordHash]
    );
    user = userRes.rows[0];
  } else if (!user.is_active) {
    throw new ApiError(403, 'Your account is inactive.');
  } else {
    await client.query(`UPDATE app_users SET is_phone_verified=TRUE, last_login_at=NOW() WHERE user_id=$1`, [user.user_id]);
  }

  let businessRes = await client.query(
    `SELECT b.business_id, b.public_id, b.business_name, b.currency_code
     FROM business_users bu JOIN businesses b ON b.business_id=bu.business_id
     WHERE bu.user_id=$1 AND bu.is_deleted=FALSE AND b.is_deleted=FALSE
     ORDER BY bu.is_owner DESC, b.business_id LIMIT 1`,
    [user.user_id]
  );
  let business = businessRes.rows[0];
  if (!business) {
    const bRes = await client.query(
      `INSERT INTO businesses(owner_user_id, business_name, business_type, phone_number, whatsapp_number, currency_code)
       VALUES($1,'My Business','Retail',$2,$2,'PKR')
       RETURNING business_id, public_id, business_name, currency_code`,
      [user.user_id, phoneNumber]
    );
    business = bRes.rows[0];
    const ownerRole = await client.query(`SELECT role_id FROM roles WHERE role_code='OWNER' LIMIT 1`);
    await client.query(
      `INSERT INTO business_users(business_id, user_id, role_id, is_owner, created_by) VALUES($1,$2,$3,TRUE,$2)`,
      [business.business_id, user.user_id, ownerRole.rows[0].role_id]
    );
    await client.query(`INSERT INTO business_settings(business_id) VALUES($1) ON CONFLICT DO NOTHING`, [business.business_id]);
    await client.query(
      `INSERT INTO document_sequences(business_id, document_type, prefix, next_number)
       VALUES($1,'SALE_INVOICE','INV',1),($1,'QUOTATION','QT',1),($1,'PURCHASE_BILL','PUR',1)
       ON CONFLICT DO NOTHING`,
      [business.business_id]
    );
    await client.query(
      `INSERT INTO warehouses(business_id, warehouse_name, is_default, created_by)
       VALUES($1,'Default Warehouse',TRUE,$2) ON CONFLICT DO NOTHING`,
      [business.business_id, user.user_id]
    );
  }
  return { user, business };
}

async function verifyOtp(payload) {
  const phoneNumber = normalizePhone(payload.phoneNumber);
  const otp = String(payload.otp || '').trim();
  if (!phoneNumber || !otp) throw new ApiError(400, 'Phone number and OTP are required.');
  return withTransaction(async (client) => {
    const codeRes = await client.query(
      `SELECT otp_id, otp_hash, attempts FROM whatsapp_otp_codes
       WHERE phone_number=$1 AND purpose='LOGIN' AND used_at IS NULL AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
      [phoneNumber]
    );
    if (codeRes.rowCount === 0) throw new ApiError(400, 'OTP expired or not found. Please resend OTP.');
    const code = codeRes.rows[0];
    if (code.attempts >= 5) throw new ApiError(429, 'Too many OTP attempts. Please resend OTP.');
    const ok = await bcrypt.compare(otp, code.otp_hash);
    await client.query(`UPDATE whatsapp_otp_codes SET attempts=attempts+1 WHERE otp_id=$1`, [code.otp_id]);
    if (!ok) throw new ApiError(400, 'Invalid OTP.');
    await client.query(`UPDATE whatsapp_otp_codes SET used_at=NOW() WHERE otp_id=$1`, [code.otp_id]);
    const { user, business } = await ensureOtpUserAndBusiness(client, phoneNumber);
    return {
      token: signToken(user),
      user: safeUser(user),
      business: { publicId: business.public_id, businessName: business.business_name, currencyCode: business.currency_code },
    };
  });
}

module.exports = { signup, login, requestOtp, verifyOtp, safeUser, listBusinesses };
