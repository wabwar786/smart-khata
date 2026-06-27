const express = require('express');
const Joi = require('joi');
const asyncHandler = require('../utils/async-handler');
const { query } = require('../db');
const { validate } = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { requireBusiness, canOwnerOrPermission } = require('../middleware/business');
const { getPagination, paged } = require('../utils/pagination');
const { ApiError } = require('../utils/api-error');

const router = express.Router();

const schema = Joi.object({
  reminderType: Joi.string().valid('PAYMENT_DUE','QUOTATION_FOLLOWUP','CHEQUE','LOW_STOCK','GENERAL').required(),
  title: Joi.string().trim().min(2).max(200).required(),
  description: Joi.string().allow('', null),
  reminderDateTime: Joi.date().required(),
  customerPublicId: Joi.string().guid({ version: 'uuidv4' }).allow('', null),
  supplierPublicId: Joi.string().guid({ version: 'uuidv4' }).allow('', null),
  referenceType: Joi.string().trim().max(50).allow('', null),
  referenceId: Joi.number().integer().allow(null),
});

router.use(requireAuth, requireBusiness);

router.get('/', canOwnerOrPermission('REMINDER_VIEW'), asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req.query);
  const status = req.query.status || null;
  const result = await query(
    `SELECT r.public_id, r.reminder_type, r.title, r.description, r.reminder_datetime, r.reminder_status,
            c.customer_name, s.supplier_name
     FROM reminders r
     LEFT JOIN customers c ON c.customer_id = r.customer_id
     LEFT JOIN suppliers s ON s.supplier_id = r.supplier_id
     WHERE r.business_id=$1 AND r.is_deleted=FALSE AND ($2::TEXT IS NULL OR r.reminder_status=$2)
     ORDER BY r.reminder_datetime ASC LIMIT $3 OFFSET $4`,
    [req.business.business_id, status, limit, offset]
  );
  const count = await query(`SELECT COUNT(*) FROM reminders WHERE business_id=$1 AND is_deleted=FALSE AND ($2::TEXT IS NULL OR reminder_status=$2)`, [req.business.business_id, status]);
  res.json({ success: true, ...paged(result.rows, count.rows[0].count, page, limit) });
}));

router.post('/', canOwnerOrPermission('REMINDER_CREATE'), validate(schema), asyncHandler(async (req, res) => {
  let customerId = null;
  if (req.body.customerPublicId) {
    const c = await query(`SELECT customer_id FROM customers WHERE business_id=$1 AND public_id=$2 AND is_deleted=FALSE`, [req.business.business_id, req.body.customerPublicId]);
    if (c.rowCount === 0) throw new ApiError(400, 'Customer not found.');
    customerId = c.rows[0].customer_id;
  }
  let supplierId = null;
  if (req.body.supplierPublicId) {
    const s = await query(`SELECT supplier_id FROM suppliers WHERE business_id=$1 AND public_id=$2 AND is_deleted=FALSE`, [req.business.business_id, req.body.supplierPublicId]);
    if (s.rowCount === 0) throw new ApiError(400, 'Supplier not found.');
    supplierId = s.rows[0].supplier_id;
  }
  const result = await query(
    `INSERT INTO reminders(business_id, customer_id, supplier_id, reminder_type, title, description, reminder_datetime, reference_type, reference_id, created_by)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING public_id, reminder_type, title, reminder_datetime, reminder_status`,
    [req.business.business_id, customerId, supplierId, req.body.reminderType, req.body.title, req.body.description || null, req.body.reminderDateTime, req.body.referenceType || null, req.body.referenceId || null, req.user.user_id]
  );
  res.status(201).json({ success: true, data: result.rows[0] });
}));

router.patch('/:publicId/status', canOwnerOrPermission('REMINDER_EDIT'), validate(Joi.object({ status: Joi.string().valid('PENDING','DONE','SNOOZED','CANCELLED').required() })), asyncHandler(async (req, res) => {
  const result = await query(
    `UPDATE reminders SET reminder_status=$3 WHERE business_id=$1 AND public_id=$2 AND is_deleted=FALSE RETURNING public_id`,
    [req.business.business_id, req.params.publicId, req.body.status]
  );
  if (result.rowCount === 0) throw new ApiError(404, 'Reminder not found.');
  res.json({ success: true, message: 'Reminder updated.' });
}));

module.exports = router;
