const express = require('express');
const Joi = require('joi');
const asyncHandler = require('../utils/async-handler');
const { validate } = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { requireBusiness } = require('../middleware/business');
const { query, withTransaction } = require('../db');
const { ApiError } = require('../utils/api-error');

const router = express.Router();
const s = (value) => (value === undefined || value === null || value === '' ? null : String(value).trim());
const n = (value, fallback = 0) => { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback; };

const shopSchema = Joi.object({
  shopName: Joi.string().trim().min(2).max(200).required(),
  logoUrl: Joi.string().uri().allow('', null),
  address: Joi.string().allow('', null),
  contactNumber: Joi.string().max(30).allow('', null),
  whatsappNumber: Joi.string().max(30).allow('', null),
  businessCategory: Joi.string().max(100).allow('', null),
  description: Joi.string().allow('', null),
  deliveryAvailable: Joi.boolean().default(false),
});

const orderSchema = Joi.object({
  customerName: Joi.string().trim().min(2).max(150).required(),
  customerPhone: Joi.string().trim().min(8).max(30).required(),
  customerAddress: Joi.string().allow('', null),
  items: Joi.array().items(Joi.object({ itemName: Joi.string().required(), qty: Joi.number().positive().required(), unitPrice: Joi.number().min(0).required(), productPublicId: Joi.string().allow('', null) })).min(1).required(),
  notes: Joi.string().allow('', null),
});

function mapShop(row) {
  if (!row) return null;
  return {
    publicId: row.public_id,
    shopName: row.shop_name,
    shopCode: row.shop_code,
    logoUrl: row.logo_url,
    address: row.address,
    contactNumber: row.contact_number,
    whatsappNumber: row.whatsapp_number,
    businessCategory: row.business_category,
    description: row.description,
    deliveryAvailable: row.delivery_available,
    status: row.status,
    createdAt: row.created_at,
  };
}
function mapOrder(row) {
  return {
    publicId: row.public_id,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    customerAddress: row.customer_address,
    items: row.items,
    totalAmount: row.total_amount,
    status: row.status,
    notes: row.notes,
    createdAt: row.created_at,
  };
}
function codeFromName(name) {
  const slug = String(name || 'SHOP').replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 6) || 'SHOP';
  return `${slug}${Math.floor(1000 + Math.random() * 9000)}`;
}

router.get('/public/:shopCode', asyncHandler(async (req, res) => {
  const shop = await query(
    `SELECT * FROM business_online_shops WHERE LOWER(shop_code)=LOWER($1) AND is_deleted=FALSE AND status='ACTIVE' LIMIT 1`,
    [req.params.shopCode]
  );
  if (shop.rowCount === 0) throw new ApiError(404, 'Shop not found.');
  const products = await query(
    `SELECT public_id, product_name, sale_price, current_stock, product_image_url, description
     FROM products WHERE business_id=$1 AND is_deleted=FALSE AND is_active=TRUE ORDER BY product_name LIMIT 200`,
    [shop.rows[0].business_id]
  );
  res.json({ success: true, data: { shop: mapShop(shop.rows[0]), products: products.rows.map((p) => ({ publicId: p.public_id, productName: p.product_name, salePrice: p.sale_price, currentStock: p.current_stock, productImageUrl: p.product_image_url, description: p.description })) } });
}));

router.post('/public/:shopCode/orders', validate(orderSchema), asyncHandler(async (req, res) => {
  const shop = await query(`SELECT * FROM business_online_shops WHERE LOWER(shop_code)=LOWER($1) AND is_deleted=FALSE AND status='ACTIVE' LIMIT 1`, [req.params.shopCode]);
  if (shop.rowCount === 0) throw new ApiError(404, 'Shop not found.');
  const total = req.body.items.reduce((sum, item) => sum + n(item.qty) * n(item.unitPrice), 0);
  const row = await query(
    `INSERT INTO online_shop_orders(shop_id, business_id, customer_name, customer_phone, customer_address, items, total_amount, notes)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [shop.rows[0].shop_id, shop.rows[0].business_id, req.body.customerName, req.body.customerPhone, s(req.body.customerAddress), JSON.stringify(req.body.items), total, s(req.body.notes)]
  );
  res.status(201).json({ success: true, data: mapOrder(row.rows[0]) });
}));

router.use(requireAuth, requireBusiness);

router.get('/profile', asyncHandler(async (req, res) => {
  const row = await query(`SELECT * FROM business_online_shops WHERE business_id=$1 AND is_deleted=FALSE LIMIT 1`, [req.business.business_id]);
  res.json({ success: true, data: mapShop(row.rows[0]) });
}));

router.post('/profile', validate(shopSchema), asyncHandler(async (req, res) => {
  const result = await withTransaction(async (client) => {
    const existing = await client.query(`SELECT * FROM business_online_shops WHERE business_id=$1 AND is_deleted=FALSE LIMIT 1`, [req.business.business_id]);
    if (existing.rowCount > 0) {
      const upd = await client.query(
        `UPDATE business_online_shops SET shop_name=$2, logo_url=$3, address=$4, contact_number=$5, whatsapp_number=$6, business_category=$7, description=$8, delivery_available=$9, status='ACTIVE'
         WHERE shop_id=$1 RETURNING *`,
        [existing.rows[0].shop_id, req.body.shopName, s(req.body.logoUrl), s(req.body.address), s(req.body.contactNumber), s(req.body.whatsappNumber), s(req.body.businessCategory), s(req.body.description), !!req.body.deliveryAvailable]
      );
      return upd.rows[0];
    }
    let shopCode = codeFromName(req.body.shopName);
    for (let i = 0; i < 5; i += 1) {
      const dup = await client.query(`SELECT shop_id FROM business_online_shops WHERE LOWER(shop_code)=LOWER($1) AND is_deleted=FALSE`, [shopCode]);
      if (dup.rowCount === 0) break;
      shopCode = codeFromName(req.body.shopName);
    }
    const ins = await client.query(
      `INSERT INTO business_online_shops(business_id, shop_name, shop_code, logo_url, address, contact_number, whatsapp_number, business_category, description, delivery_available, created_by)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [req.business.business_id, req.body.shopName, shopCode, s(req.body.logoUrl), s(req.body.address), s(req.body.contactNumber), s(req.body.whatsappNumber), s(req.body.businessCategory), s(req.body.description), !!req.body.deliveryAvailable, req.user.user_id]
    );
    return ins.rows[0];
  });
  res.status(201).json({ success: true, data: mapShop(result) });
}));

router.get('/orders', asyncHandler(async (req, res) => {
  const rows = await query(`SELECT * FROM online_shop_orders WHERE business_id=$1 AND is_deleted=FALSE ORDER BY created_at DESC LIMIT 200`, [req.business.business_id]);
  res.json({ success: true, data: rows.rows.map(mapOrder) });
}));

router.patch('/orders/:publicId/status', asyncHandler(async (req, res) => {
  const status = String(req.body.status || '').toUpperCase();
  if (!['NEW','ACCEPTED','REJECTED','COMPLETED','CANCELLED'].includes(status)) throw new ApiError(400, 'Invalid order status.');
  const row = await query(
    `UPDATE online_shop_orders SET status=$3 WHERE public_id=$1 AND business_id=$2 AND is_deleted=FALSE RETURNING *`,
    [req.params.publicId, req.business.business_id, status]
  );
  if (row.rowCount === 0) throw new ApiError(404, 'Order not found.');
  res.json({ success: true, data: mapOrder(row.rows[0]) });
}));

module.exports = router;
