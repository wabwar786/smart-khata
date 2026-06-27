const jwt = require('jsonwebtoken');
const { query } = require('../db');
const { env } = require('../config/env');
const { ApiError } = require('../utils/api-error');

async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw new ApiError(401, 'Authorization token is required.');

    const payload = jwt.verify(token, env.JWT_SECRET);
    const result = await query(
      `SELECT user_id, public_id, full_name, email, phone_number, is_super_admin, is_support_admin, is_active
       FROM app_users
       WHERE user_id = $1 AND is_deleted = FALSE`,
      [payload.userId]
    );

    if (result.rowCount === 0 || !result.rows[0].is_active) {
      throw new ApiError(401, 'User is not active or does not exist.');
    }

    req.user = result.rows[0];
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return next(new ApiError(401, 'Invalid or expired token.'));
    }
    next(error);
  }
}

function requireSuperAdmin(req, res, next) {
  if (!req.user || !req.user.is_super_admin) {
    return next(new ApiError(403, 'Super admin access required.'));
  }
  next();
}

module.exports = { requireAuth, requireSuperAdmin };
