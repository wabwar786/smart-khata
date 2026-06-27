const express = require('express');
const Joi = require('joi');
const asyncHandler = require('../utils/async-handler');
const { validate } = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { requireBusiness, canOwnerOrPermission } = require('../middleware/business');
const service = require('../services/product.service');

const router = express.Router();

const categorySchema = Joi.object({
  categoryName: Joi.string().trim().min(2).max(150).required(),
  description: Joi.string().allow('', null),
});

const productSchema = Joi.object({
  categoryPublicId: Joi.string().guid({ version: 'uuidv4' }).allow('', null),
  unitId: Joi.number().integer().positive(),
  productName: Joi.string().trim().min(2).max(200),
  sku: Joi.string().trim().max(100).allow('', null),
  barcode: Joi.string().trim().max(100).allow('', null),
  productType: Joi.string().valid('PRODUCT', 'SERVICE'),
  purchasePrice: Joi.number().min(0),
  salePrice: Joi.number().min(0),
  taxPercent: Joi.number().min(0).max(100),
  openingStock: Joi.number().min(0),
  lowStockQty: Joi.number().min(0).allow(null),
  productImageUrl: Joi.string().uri().allow('', null),
  description: Joi.string().allow('', null),
  isActive: Joi.boolean(),
});

const adjustSchema = Joi.object({
  adjustmentType: Joi.string().valid('IN', 'OUT').required(),
  qty: Joi.number().positive().required(),
  notes: Joi.string().allow('', null),
});

router.use(requireAuth, requireBusiness);

router.get('/units', canOwnerOrPermission('PRODUCT_VIEW'), asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.listUnits() });
}));

router.get('/categories', canOwnerOrPermission('PRODUCT_VIEW'), asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.listCategories(req.business.business_id) });
}));

router.post('/categories', canOwnerOrPermission('PRODUCT_CREATE'), validate(categorySchema), asyncHandler(async (req, res) => {
  res.status(201).json({ success: true, data: await service.createCategory(req.business.business_id, req.user.user_id, req.body) });
}));

router.get('/', canOwnerOrPermission('PRODUCT_VIEW'), asyncHandler(async (req, res) => {
  res.json({ success: true, ...(await service.listProducts(req.business.business_id, req.query)) });
}));

router.post('/', canOwnerOrPermission('PRODUCT_CREATE'), validate(productSchema.keys({ unitId: Joi.number().integer().positive().required(), productName: Joi.string().trim().min(2).max(200).required() })), asyncHandler(async (req, res) => {
  res.status(201).json({ success: true, data: await service.createProduct(req.business.business_id, req.user.user_id, req.body) });
}));

router.get('/:publicId', canOwnerOrPermission('PRODUCT_VIEW'), asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.getProduct(req.business.business_id, req.params.publicId) });
}));

router.put('/:publicId', canOwnerOrPermission('PRODUCT_EDIT'), validate(productSchema), asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.updateProduct(req.business.business_id, req.params.publicId, req.body) });
}));

router.delete('/:publicId', canOwnerOrPermission('PRODUCT_DELETE'), asyncHandler(async (req, res) => {
  await service.deleteProduct(req.business.business_id, req.params.publicId);
  res.json({ success: true, message: 'Product deleted.' });
}));

router.post('/:publicId/stock-adjustment', canOwnerOrPermission('STOCK_ADJUST'), validate(adjustSchema), asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.adjustStock(req.business.business_id, req.user.user_id, req.params.publicId, req.body) });
}));

module.exports = router;
