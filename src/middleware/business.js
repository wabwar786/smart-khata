const { query } = require('../db');
const { ApiError } = require('../utils/api-error');

async function requireBusiness(req, res, next) {
  try {
    const businessPublicId = req.headers['x-business-id'] || req.query.businessId;
    if (!businessPublicId) {
      throw new ApiError(400, 'x-business-id header is required.');
    }

    const result = await query(
      `SELECT
          b.business_id, b.public_id, b.business_name, b.currency_code, b.timezone,
          b.is_active AS business_active, b.is_blocked, b.block_reason,
          bu.business_user_id, bu.role_id, bu.is_owner, bu.is_active AS membership_active, bu.can_login,
          r.role_code, r.role_name
       FROM businesses b
       JOIN business_users bu ON bu.business_id = b.business_id
       JOIN roles r ON r.role_id = bu.role_id
       WHERE b.public_id = $1
         AND bu.user_id = $2
         AND b.is_deleted = FALSE
         AND bu.is_deleted = FALSE`,
      [businessPublicId, req.user.user_id]
    );

    if (result.rowCount === 0) {
      throw new ApiError(403, 'You do not have access to this business.');
    }

    const business = result.rows[0];
    if (!business.business_active || business.is_blocked) {
      throw new ApiError(403, business.block_reason || 'Business is blocked or inactive.');
    }
    if (!business.membership_active || !business.can_login) {
      throw new ApiError(403, 'Your business access is disabled.');
    }

    req.business = business;
    next();
  } catch (error) {
    next(error);
  }
}

function canOwnerOrPermission(permissionCode) {
  return async (req, res, next) => {
    try {
      if (req.business.is_owner) return next();
      const result = await query(
        `SELECT 1
         FROM role_permissions rp
         JOIN permissions p ON p.permission_id = rp.permission_id
         WHERE rp.role_id = $1 AND p.permission_code = $2 AND p.is_active = TRUE`,
        [req.business.role_id, permissionCode]
      );
      if (result.rowCount === 0) {
        throw new ApiError(403, `Permission required: ${permissionCode}`);
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

module.exports = { requireBusiness, canOwnerOrPermission };
