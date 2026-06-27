const express = require('express');
const Joi = require('joi');
const asyncHandler = require('../utils/async-handler');
const { validate } = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { requireBusiness, canOwnerOrPermission } = require('../middleware/business');
const service = require('../services/customer.service');

const router = express.Router();

const schema = Joi.object({
  customerName: Joi.string().trim().min(2).max(200),
  phoneNumber: Joi.string().trim().max(30).allow('', null),
  whatsAppNumber: Joi.string().trim().max(30).allow('', null),
  email: Joi.string().trim().email().allow('', null),
  address: Joi.string().trim().allow('', null),
  city: Joi.string().trim().max(100).allow('', null),
  customerType: Joi.string().trim().max(50).allow('', null),
  openingBalance: Joi.number(),
  creditLimit: Joi.number().allow(null),
  notes: Joi.string().allow('', null),
  isActive: Joi.boolean(),
});

router.use(requireAuth, requireBusiness);

router.get('/', canOwnerOrPermission('CUSTOMER_VIEW'), asyncHandler(async (req, res) => {
  res.json({ success: true, ...(await service.listCustomers(req.business.business_id, req.query)) });
}));

router.post('/', canOwnerOrPermission('CUSTOMER_CREATE'), validate(schema.keys({ customerName: Joi.string().trim().min(2).max(200).required() })), asyncHandler(async (req, res) => {
  res.status(201).json({ success: true, data: await service.createCustomer(req.business.business_id, req.user.user_id, req.body) });
}));

router.get('/:publicId', canOwnerOrPermission('CUSTOMER_VIEW'), asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.getCustomer(req.business.business_id, req.params.publicId) });
}));

router.put('/:publicId', canOwnerOrPermission('CUSTOMER_EDIT'), validate(schema), asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.updateCustomer(req.business.business_id, req.params.publicId, req.body) });
}));

router.delete('/:publicId', canOwnerOrPermission('CUSTOMER_DELETE'), asyncHandler(async (req, res) => {
  await service.deleteCustomer(req.business.business_id, req.params.publicId);
  res.json({ success: true, message: 'Customer deleted.' });
}));

router.get('/:publicId/ledger', canOwnerOrPermission('CUSTOMER_VIEW'), asyncHandler(async (req, res) => {
  res.json({ success: true, ...(await service.getLedger(req.business.business_id, req.params.publicId, req.query)) });
}));

module.exports = router;
