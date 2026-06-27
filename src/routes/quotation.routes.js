const express = require('express');
const Joi = require('joi');
const asyncHandler = require('../utils/async-handler');
const { validate } = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { requireBusiness, canOwnerOrPermission } = require('../middleware/business');
const service = require('../services/quotation.service');

const router = express.Router();

const itemSchema = Joi.object({
  productPublicId: Joi.string().guid({ version: 'uuidv4' }).allow('', null),
  itemName: Joi.string().trim().max(200).allow('', null),
  qty: Joi.number().positive().required(),
  unitPrice: Joi.number().min(0).required(),
  discountAmount: Joi.number().min(0).default(0),
  taxPercent: Joi.number().min(0).max(100).default(0),
}).custom((value, helpers) => {
  if (!value.productPublicId && !value.itemName) {
    return helpers.error('any.custom', { message: 'productPublicId or itemName is required.' });
  }
  return value;
});

const createSchema = Joi.object({
  customerPublicId: Joi.string().guid({ version: 'uuidv4' }).allow('', null),
  customerName: Joi.string().trim().max(200).allow('', null),
  customerPhone: Joi.string().trim().max(30).allow('', null),
  customerAddress: Joi.string().allow('', null),
  validUntil: Joi.date().allow(null),
  items: Joi.array().items(itemSchema).min(1).required(),
  notes: Joi.string().allow('', null),
  terms: Joi.string().allow('', null),
});

router.use(requireAuth, requireBusiness);

router.get('/', canOwnerOrPermission('QUOTATION_VIEW'), asyncHandler(async (req, res) => {
  res.json({ success: true, ...(await service.listQuotations(req.business.business_id, req.query)) });
}));

router.post('/', canOwnerOrPermission('QUOTATION_CREATE'), validate(createSchema), asyncHandler(async (req, res) => {
  res.status(201).json({ success: true, data: await service.createQuotation(req.business.business_id, req.user.user_id, req.body) });
}));

router.get('/:publicId', canOwnerOrPermission('QUOTATION_VIEW'), asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.getQuotation(req.business.business_id, req.params.publicId) });
}));

router.patch('/:publicId/status', canOwnerOrPermission('QUOTATION_EDIT'), validate(Joi.object({ status: Joi.string().valid('PENDING','ACCEPTED','REJECTED','EXPIRED','CONVERTED').required() })), asyncHandler(async (req, res) => {
  await service.updateStatus(req.business.business_id, req.params.publicId, req.body.status);
  res.json({ success: true, message: 'Quotation status updated.' });
}));

module.exports = router;
