const { query, withTransaction } = require('../db');
const { ApiError } = require('../utils/api-error');
const { getPagination, paged } = require('../utils/pagination');
const { toNumber } = require('../utils/money');

function mapProduct(row) {
  return {
    publicId: row.public_id,
    productName: row.product_name,
    categoryName: row.category_name,
    unitId: row.unit_id,
    unitCode: row.unit_code,
    sku: row.sku,
    barcode: row.barcode,
    productType: row.product_type,
    purchasePrice: row.purchase_price,
    salePrice: row.sale_price,
    taxPercent: row.tax_percent,
    openingStock: row.opening_stock,
    currentStock: row.current_stock,
    lowStockQty: row.low_stock_qty,
    productImageUrl: row.product_image_url,
    description: row.description,
    isActive: row.is_active,
    createdAt: row.created_at,
  };
}

async function listUnits() {
  const result = await query(`SELECT unit_id, unit_name, unit_code FROM units WHERE is_active=TRUE ORDER BY unit_id`);
  return result.rows;
}

async function listCategories(businessId) {
  const result = await query(
    `SELECT public_id, product_category_id, category_name, description FROM product_categories WHERE business_id=$1 AND is_deleted=FALSE ORDER BY category_name`,
    [businessId]
  );
  return result.rows.map((r) => ({ publicId: r.public_id, categoryName: r.category_name, description: r.description }));
}

async function createCategory(businessId, userId, payload) {
  const result = await query(
    `INSERT INTO product_categories(business_id, category_name, description, created_by) VALUES($1,$2,$3,$4) RETURNING public_id, category_name, description`,
    [businessId, payload.categoryName, payload.description || null, userId]
  );
  return { publicId: result.rows[0].public_id, categoryName: result.rows[0].category_name, description: result.rows[0].description };
}

async function getCategoryId(businessId, publicId) {
  if (!publicId) return null;
  const result = await query(
    `SELECT product_category_id FROM product_categories WHERE business_id=$1 AND public_id=$2 AND is_deleted=FALSE`,
    [businessId, publicId]
  );
  if (result.rowCount === 0) throw new ApiError(400, 'Product category not found.');
  return result.rows[0].product_category_id;
}

async function listProducts(businessId, params) {
  const { page, limit, offset } = getPagination(params);
  const search = params.search ? `%${params.search.toLowerCase()}%` : null;
  const data = await query(
    `SELECT p.*, pc.category_name, u.unit_code
     FROM products p
     JOIN units u ON u.unit_id = p.unit_id
     LEFT JOIN product_categories pc ON pc.product_category_id = p.product_category_id
     WHERE p.business_id=$1 AND p.is_deleted=FALSE
       AND ($2::TEXT IS NULL OR LOWER(p.product_name) LIKE $2 OR LOWER(COALESCE(p.sku,'')) LIKE $2 OR LOWER(COALESCE(p.barcode,'')) LIKE $2)
     ORDER BY p.product_name
     LIMIT $3 OFFSET $4`,
    [businessId, search, limit, offset]
  );
  const count = await query(
    `SELECT COUNT(*) FROM products p
     WHERE p.business_id=$1 AND p.is_deleted=FALSE
       AND ($2::TEXT IS NULL OR LOWER(p.product_name) LIKE $2 OR LOWER(COALESCE(p.sku,'')) LIKE $2 OR LOWER(COALESCE(p.barcode,'')) LIKE $2)`,
    [businessId, search]
  );
  return paged(data.rows.map(mapProduct), count.rows[0].count, page, limit);
}

async function createProduct(businessId, userId, payload) {
  return withTransaction(async (client) => {
    const categoryId = payload.categoryPublicId ? await getCategoryId(businessId, payload.categoryPublicId) : null;
    const opening = toNumber(payload.openingStock, 0);
    const result = await client.query(
      `INSERT INTO products(business_id, product_category_id, unit_id, product_name, sku, barcode, product_type,
                            purchase_price, sale_price, tax_percent, opening_stock, current_stock, low_stock_qty,
                            product_image_url, description, created_by)
       VALUES($1,$2,$3,$4,$5,$6,COALESCE($7,'PRODUCT'),$8,$9,$10,$11,$11,$12,$13,$14,$15)
       RETURNING *`,
      [businessId, categoryId, payload.unitId, payload.productName, payload.sku || null, payload.barcode || null, payload.productType || 'PRODUCT', payload.purchasePrice || 0, payload.salePrice || 0, payload.taxPercent || 0, opening, payload.lowStockQty || null, payload.productImageUrl || null, payload.description || null, userId]
    );
    const product = result.rows[0];

    const wh = await client.query(`SELECT warehouse_id FROM warehouses WHERE business_id=$1 AND is_default=TRUE AND is_deleted=FALSE LIMIT 1`, [businessId]);
    if (wh.rowCount > 0 && product.product_type === 'PRODUCT') {
      await client.query(
        `INSERT INTO product_stock(business_id, warehouse_id, product_id, current_qty) VALUES($1,$2,$3,$4)`,
        [businessId, wh.rows[0].warehouse_id, product.product_id, opening]
      );
      if (opening > 0) {
        await client.query(
          `INSERT INTO inventory_transactions(business_id, warehouse_id, product_id, transaction_type, reference_type, qty_in, unit_cost, notes, created_by)
           VALUES($1,$2,$3,'OPENING','MANUAL',$4,$5,'Opening stock',$6)`,
          [businessId, wh.rows[0].warehouse_id, product.product_id, opening, product.purchase_price, userId]
        );
      }
    }

    const joined = await client.query(
      `SELECT p.*, pc.category_name, u.unit_code FROM products p JOIN units u ON u.unit_id=p.unit_id LEFT JOIN product_categories pc ON pc.product_category_id=p.product_category_id WHERE p.product_id=$1`,
      [product.product_id]
    );
    return mapProduct(joined.rows[0]);
  });
}

async function getProductByPublicId(businessId, publicId) {
  const result = await query(
    `SELECT p.*, pc.category_name, u.unit_code FROM products p JOIN units u ON u.unit_id=p.unit_id LEFT JOIN product_categories pc ON pc.product_category_id=p.product_category_id WHERE p.business_id=$1 AND p.public_id=$2 AND p.is_deleted=FALSE`,
    [businessId, publicId]
  );
  if (result.rowCount === 0) throw new ApiError(404, 'Product not found.');
  return result.rows[0];
}

async function getProduct(businessId, publicId) {
  return mapProduct(await getProductByPublicId(businessId, publicId));
}

async function updateProduct(businessId, publicId, payload) {
  const current = await getProductByPublicId(businessId, publicId);
  const categoryId = payload.categoryPublicId ? await getCategoryId(businessId, payload.categoryPublicId) : undefined;
  const result = await query(
    `UPDATE products SET
       product_category_id=COALESCE($3, product_category_id),
       unit_id=COALESCE($4, unit_id),
       product_name=COALESCE($5, product_name),
       sku=COALESCE($6, sku), barcode=COALESCE($7, barcode),
       product_type=COALESCE($8, product_type), purchase_price=COALESCE($9, purchase_price),
       sale_price=COALESCE($10, sale_price), tax_percent=COALESCE($11, tax_percent),
       low_stock_qty=COALESCE($12, low_stock_qty), product_image_url=COALESCE($13, product_image_url),
       description=COALESCE($14, description), is_active=COALESCE($15, is_active)
     WHERE product_id=$1 AND business_id=$2 RETURNING *`,
    [current.product_id, businessId, categoryId, payload.unitId, payload.productName, payload.sku, payload.barcode, payload.productType, payload.purchasePrice, payload.salePrice, payload.taxPercent, payload.lowStockQty, payload.productImageUrl, payload.description, payload.isActive]
  );
  return getProduct(businessId, result.rows[0].public_id);
}

async function deleteProduct(businessId, publicId) {
  const current = await getProductByPublicId(businessId, publicId);
  await query(`UPDATE products SET is_deleted=TRUE WHERE business_id=$1 AND product_id=$2`, [businessId, current.product_id]);
}

async function adjustStock(businessId, userId, publicId, payload) {
  return withTransaction(async (client) => {
    const prodRes = await client.query(`SELECT * FROM products WHERE business_id=$1 AND public_id=$2 AND is_deleted=FALSE`, [businessId, publicId]);
    if (prodRes.rowCount === 0) throw new ApiError(404, 'Product not found.');
    const product = prodRes.rows[0];
    if (product.product_type !== 'PRODUCT') throw new ApiError(400, 'Stock can only be adjusted for products.');

    const whRes = await client.query(`SELECT warehouse_id FROM warehouses WHERE business_id=$1 AND is_default=TRUE AND is_deleted=FALSE LIMIT 1`, [businessId]);
    if (whRes.rowCount === 0) throw new ApiError(400, 'Default warehouse not found.');
    const warehouseId = whRes.rows[0].warehouse_id;
    const qty = toNumber(payload.qty, 0);
    if (qty <= 0) throw new ApiError(400, 'Quantity must be greater than zero.');
    const isIn = payload.adjustmentType === 'IN';
    const type = isIn ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT';

    await client.query(
      `UPDATE products SET current_stock = current_stock ${isIn ? '+' : '-'} $3 WHERE business_id=$1 AND product_id=$2`,
      [businessId, product.product_id, qty]
    );
    await client.query(
      `INSERT INTO product_stock(business_id, warehouse_id, product_id, current_qty)
       VALUES($1,$2,$3,$4)
       ON CONFLICT(business_id, warehouse_id, product_id)
       DO UPDATE SET current_qty = product_stock.current_qty ${isIn ? '+' : '-'} EXCLUDED.current_qty`,
      [businessId, warehouseId, product.product_id, qty]
    );
    await client.query(
      `INSERT INTO inventory_transactions(business_id, warehouse_id, product_id, transaction_type, reference_type, qty_in, qty_out, notes, created_by)
       VALUES($1,$2,$3,$4,'MANUAL',$5,$6,$7,$8)`,
      [businessId, warehouseId, product.product_id, type, isIn ? qty : 0, isIn ? 0 : qty, payload.notes || null, userId]
    );
    return { message: 'Stock adjusted.' };
  });
}

module.exports = { listUnits, listCategories, createCategory, listProducts, createProduct, getProduct, updateProduct, deleteProduct, adjustStock, getProductByPublicId };
