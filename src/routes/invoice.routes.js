const express = require('express');
const Joi = require('joi');
const asyncHandler = require('../utils/async-handler');
const { validate } = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { requireBusiness, canOwnerOrPermission } = require('../middleware/business');
const service = require('../services/invoice.service');

const router = express.Router();

const invoiceItemSchema = Joi.object({
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
  items: Joi.array().items(invoiceItemSchema).min(1).required(),
  paidAmount: Joi.number().min(0).default(0),
  paymentMethod: Joi.string().trim().max(50).default('Cash'),
  paymentReferenceNo: Joi.string().trim().max(150).allow('', null),
  notes: Joi.string().allow('', null),
  terms: Joi.string().allow('', null),
});

router.use(requireAuth, requireBusiness);

router.get('/', canOwnerOrPermission('SALE_VIEW'), asyncHandler(async (req, res) => {
  res.json({ success: true, ...(await service.listInvoices(req.business.business_id, req.query)) });
}));

router.post('/', canOwnerOrPermission('SALE_CREATE'), validate(createSchema), asyncHandler(async (req, res) => {
  res.status(201).json({ success: true, data: await service.createInvoice(req.business.business_id, req.user.user_id, req.body) });
}));

router.get('/:publicId', canOwnerOrPermission('SALE_VIEW'), asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.getInvoiceByPublicId(req.business.business_id, req.params.publicId) });
}));


router.post('/:publicId/whatsapp-log', canOwnerOrPermission('SALE_VIEW'), validate(Joi.object({
  phoneNumber: Joi.string().trim().max(30).required(),
  messageText: Joi.string().allow('', null),
  fileUrl: Joi.string().uri().allow('', null),
  shareStatus: Joi.string().valid('OPENED','SENT_MANUAL','FAILED').default('OPENED'),
})), asyncHandler(async (req, res) => {
  const inv = await service.getInvoiceByPublicId(req.business.business_id, req.params.publicId);
  const { query } = require('../db');
  await query(
    `INSERT INTO whatsapp_share_logs(business_id, document_type, document_id, phone_number, message_text, file_url, share_status, shared_by)
     SELECT $1, 'SALES_INVOICE', sales_invoice_id, $3, $4, $5, $6, $7
     FROM sales_invoices WHERE business_id=$1 AND public_id=$2`,
    [req.business.business_id, req.params.publicId, req.body.phoneNumber, req.body.messageText || null, req.body.fileUrl || inv.pdfUrl || null, req.body.shareStatus, req.user.user_id]
  );
  res.json({ success: true, message: 'WhatsApp share logged.' });
}));

router.post('/:publicId/cancel', canOwnerOrPermission('SALE_CANCEL'), asyncHandler(async (req, res) => {
  await service.cancelInvoice(req.business.business_id, req.user.user_id, req.params.publicId);
  res.json({ success: true, message: 'Invoice cancelled.' });
}));

module.exports = router;
