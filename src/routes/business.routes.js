const express = require('express');
const Joi = require('joi');
const asyncHandler = require('../utils/async-handler');
const { validate } = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { requireBusiness, canOwnerOrPermission } = require('../middleware/business');
const { createBusiness, getBusiness, updateSettings } = require('../services/business.service');
const { listBusinesses } = require('../services/auth.service');

const router = express.Router();

const createSchema = Joi.object({
  businessName: Joi.string().trim().min(2).max(200).required(),
  businessType: Joi.string().trim().max(100).allow('', null),
  phoneNumber: Joi.string().trim().max(30).allow('', null),
  whatsAppNumber: Joi.string().trim().max(30).allow('', null),
  email: Joi.string().trim().email().allow('', null),
  address: Joi.string().trim().max(1000).allow('', null),
  city: Joi.string().trim().max(100).allow('', null),
  country: Joi.string().trim().max(100).allow('', null),
  currencyCode: Joi.string().trim().max(10).allow('', null),
});

const settingsSchema = Joi.object({
  invoicePrefix: Joi.string().trim().max(20),
  quotationPrefix: Joi.string().trim().max(20),
  purchasePrefix: Joi.string().trim().max(20),
  showLogoOnInvoice: Joi.boolean(),
  showTaxOnInvoice: Joi.boolean(),
  defaultTaxPercent: Joi.number().min(0).max(100),
  invoiceTerms: Joi.string().allow('', null),
  invoiceFooterText: Joi.string().max(500).allow('', null),
  allowNegativeStock: Joi.boolean(),
  lowStockAlert: Joi.boolean(),
});

router.use(requireAuth);

router.get('/', asyncHandler(async (req, res) => {
  const data = await listBusinesses(req.user.user_id);
  res.json({ success: true, data });
}));

router.post('/', validate(createSchema), asyncHandler(async (req, res) => {
  const data = await createBusiness(req.user.user_id, req.body);
  res.status(201).json({ success: true, data });
}));

router.get('/:businessPublicId', asyncHandler(async (req, res) => {
  const data = await getBusiness(req.params.businessPublicId, req.user.user_id);
  res.json({ success: true, data });
}));

router.put('/settings/current', requireBusiness, canOwnerOrPermission('BUSINESS_SETTINGS'), validate(settingsSchema), asyncHandler(async (req, res) => {
  const data = await updateSettings(req.business.business_id, req.body);
  res.json({ success: true, data });
}));

module.exports = router;
