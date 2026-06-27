const express = require('express');
const Joi = require('joi');
const asyncHandler = require('../utils/async-handler');
const { validate } = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { requireBusiness, canOwnerOrPermission } = require('../middleware/business');
const service = require('../services/payment.service');

const router = express.Router();

const schema = Joi.object({
  customerPublicId: Joi.string().guid({ version: 'uuidv4' }).required(),
  paymentDate: Joi.date().allow(null),
  amount: Joi.number().positive().required(),
  paymentMethod: Joi.string().trim().max(50).default('Cash'),
  referenceNo: Joi.string().trim().max(150).allow('', null),
  description: Joi.string().allow('', null),
  attachmentUrl: Joi.string().uri().allow('', null),
  allocations: Joi.array().items(Joi.object({
    invoicePublicId: Joi.string().guid({ version: 'uuidv4' }).required(),
    amount: Joi.number().positive().required(),
  })).optional(),
});

router.use(requireAuth, requireBusiness);

router.get('/', canOwnerOrPermission('PAYMENT_VIEW'), asyncHandler(async (req, res) => {
  res.json({ success: true, ...(await service.listPayments(req.business.business_id, req.query)) });
}));

router.post('/', canOwnerOrPermission('PAYMENT_CREATE'), validate(schema), asyncHandler(async (req, res) => {
  res.status(201).json({ success: true, data: await service.receivePayment(req.business.business_id, req.user.user_id, req.body) });
}));

module.exports = router;
