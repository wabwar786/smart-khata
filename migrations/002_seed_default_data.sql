-- Smart Khata default seed data
-- Version: 002

INSERT INTO roles (role_name, role_code, description, is_system_role, is_active)
VALUES
('Business Owner', 'OWNER', 'Full business access', TRUE, TRUE),
('Manager', 'MANAGER', 'Manage sales, customers, inventory and reports', TRUE, TRUE),
('Salesman', 'SALESMAN', 'Create customers, quotations and sales', TRUE, TRUE),
('Accountant', 'ACCOUNTANT', 'Manage payments, ledger and reports', TRUE, TRUE),
('Inventory Staff', 'INVENTORY', 'Manage products and stock', TRUE, TRUE)
ON CONFLICT (role_code) DO UPDATE SET
  role_name = EXCLUDED.role_name,
  description = EXCLUDED.description,
  is_active = EXCLUDED.is_active;

INSERT INTO permissions (permission_code, permission_name, module_name, description, is_active)
VALUES
('CUSTOMER_VIEW', 'View Customers', 'Customers', NULL, TRUE),
('CUSTOMER_CREATE', 'Create Customer', 'Customers', NULL, TRUE),
('CUSTOMER_EDIT', 'Edit Customer', 'Customers', NULL, TRUE),
('CUSTOMER_DELETE', 'Delete Customer', 'Customers', NULL, TRUE),

('SUPPLIER_VIEW', 'View Suppliers', 'Suppliers', NULL, TRUE),
('SUPPLIER_CREATE', 'Create Supplier', 'Suppliers', NULL, TRUE),
('SUPPLIER_EDIT', 'Edit Supplier', 'Suppliers', NULL, TRUE),
('SUPPLIER_DELETE', 'Delete Supplier', 'Suppliers', NULL, TRUE),

('SALE_VIEW', 'View Sales', 'Sales', NULL, TRUE),
('SALE_CREATE', 'Create Sale Invoice', 'Sales', NULL, TRUE),
('SALE_EDIT', 'Edit Sale Invoice', 'Sales', NULL, TRUE),
('SALE_DELETE', 'Delete Sale Invoice', 'Sales', NULL, TRUE),
('SALE_CANCEL', 'Cancel Sale Invoice', 'Sales', NULL, TRUE),

('PAYMENT_VIEW', 'View Payments', 'Payments', NULL, TRUE),
('PAYMENT_CREATE', 'Receive Payment', 'Payments', NULL, TRUE),
('PAYMENT_EDIT', 'Edit Payment', 'Payments', NULL, TRUE),
('PAYMENT_DELETE', 'Delete Payment', 'Payments', NULL, TRUE),

('PRODUCT_VIEW', 'View Products', 'Inventory', NULL, TRUE),
('PRODUCT_CREATE', 'Create Product', 'Inventory', NULL, TRUE),
('PRODUCT_EDIT', 'Edit Product', 'Inventory', NULL, TRUE),
('PRODUCT_DELETE', 'Delete Product', 'Inventory', NULL, TRUE),
('STOCK_ADJUST', 'Adjust Stock', 'Inventory', NULL, TRUE),
('STOCK_VIEW', 'View Stock', 'Inventory', NULL, TRUE),

('PURCHASE_VIEW', 'View Purchases', 'Purchases', NULL, TRUE),
('PURCHASE_CREATE', 'Create Purchase Bill', 'Purchases', NULL, TRUE),
('PURCHASE_EDIT', 'Edit Purchase Bill', 'Purchases', NULL, TRUE),
('PURCHASE_DELETE', 'Delete Purchase Bill', 'Purchases', NULL, TRUE),

('QUOTATION_VIEW', 'View Quotations', 'Quotations', NULL, TRUE),
('QUOTATION_CREATE', 'Create Quotation', 'Quotations', NULL, TRUE),
('QUOTATION_EDIT', 'Edit Quotation', 'Quotations', NULL, TRUE),
('QUOTATION_DELETE', 'Delete Quotation', 'Quotations', NULL, TRUE),
('QUOTATION_CONVERT', 'Convert Quotation to Invoice', 'Quotations', NULL, TRUE),

('EXPENSE_VIEW', 'View Expenses', 'Expenses', NULL, TRUE),
('EXPENSE_CREATE', 'Create Expense', 'Expenses', NULL, TRUE),
('EXPENSE_EDIT', 'Edit Expense', 'Expenses', NULL, TRUE),
('EXPENSE_DELETE', 'Delete Expense', 'Expenses', NULL, TRUE),

('REMINDER_VIEW', 'View Reminders', 'Reminders', NULL, TRUE),
('REMINDER_CREATE', 'Create Reminder', 'Reminders', NULL, TRUE),
('REMINDER_EDIT', 'Edit Reminder', 'Reminders', NULL, TRUE),
('REMINDER_DELETE', 'Delete Reminder', 'Reminders', NULL, TRUE),

('REPORT_VIEW', 'View Reports', 'Reports', NULL, TRUE),
('PROFIT_VIEW', 'View Profit / Purchase Price', 'Reports', 'Allows seeing purchase price and profit reports', TRUE),

('STAFF_MANAGE', 'Manage Staff Users', 'Settings', NULL, TRUE),
('BUSINESS_SETTINGS', 'Manage Business Settings', 'Settings', NULL, TRUE),
('SUBSCRIPTION_VIEW', 'View Subscription', 'Subscription', NULL, TRUE),
('SUBSCRIPTION_PAY', 'Pay Subscription', 'Subscription', NULL, TRUE),
('DATA_EXPORT', 'Export Business Data', 'Settings', NULL, TRUE)
ON CONFLICT (permission_code) DO UPDATE SET
  permission_name = EXCLUDED.permission_name,
  module_name = EXCLUDED.module_name,
  description = EXCLUDED.description,
  is_active = EXCLUDED.is_active;

-- Owner: all permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.role_id, p.permission_id
FROM roles r
CROSS JOIN permissions p
WHERE r.role_code = 'OWNER'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Manager: almost all except subscription payment, data export, staff deletion-level control can be adjusted in app layer
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.role_id, p.permission_id
FROM roles r
JOIN permissions p ON p.permission_code IN (
  'CUSTOMER_VIEW','CUSTOMER_CREATE','CUSTOMER_EDIT',
  'SUPPLIER_VIEW','SUPPLIER_CREATE','SUPPLIER_EDIT',
  'SALE_VIEW','SALE_CREATE','SALE_EDIT','SALE_CANCEL',
  'PAYMENT_VIEW','PAYMENT_CREATE','PAYMENT_EDIT',
  'PRODUCT_VIEW','PRODUCT_CREATE','PRODUCT_EDIT','STOCK_ADJUST','STOCK_VIEW',
  'PURCHASE_VIEW','PURCHASE_CREATE','PURCHASE_EDIT',
  'QUOTATION_VIEW','QUOTATION_CREATE','QUOTATION_EDIT','QUOTATION_CONVERT',
  'EXPENSE_VIEW','EXPENSE_CREATE','EXPENSE_EDIT',
  'REMINDER_VIEW','REMINDER_CREATE','REMINDER_EDIT',
  'REPORT_VIEW','SUBSCRIPTION_VIEW'
)
WHERE r.role_code = 'MANAGER'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Salesman: customer, sale, quotation, reminders, limited product view
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.role_id, p.permission_id
FROM roles r
JOIN permissions p ON p.permission_code IN (
  'CUSTOMER_VIEW','CUSTOMER_CREATE','CUSTOMER_EDIT',
  'PRODUCT_VIEW','STOCK_VIEW',
  'SALE_VIEW','SALE_CREATE',
  'PAYMENT_VIEW','PAYMENT_CREATE',
  'QUOTATION_VIEW','QUOTATION_CREATE','QUOTATION_EDIT','QUOTATION_CONVERT',
  'REMINDER_VIEW','REMINDER_CREATE','REMINDER_EDIT'
)
WHERE r.role_code = 'SALESMAN'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Accountant: payments, ledgers, sales/purchase view, expenses and reports
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.role_id, p.permission_id
FROM roles r
JOIN permissions p ON p.permission_code IN (
  'CUSTOMER_VIEW','SUPPLIER_VIEW',
  'SALE_VIEW','PAYMENT_VIEW','PAYMENT_CREATE','PAYMENT_EDIT',
  'PURCHASE_VIEW','EXPENSE_VIEW','EXPENSE_CREATE','EXPENSE_EDIT',
  'REMINDER_VIEW','REMINDER_CREATE','REMINDER_EDIT',
  'REPORT_VIEW','PROFIT_VIEW'
)
WHERE r.role_code = 'ACCOUNTANT'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Inventory staff: products, stock and purchase operations
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.role_id, p.permission_id
FROM roles r
JOIN permissions p ON p.permission_code IN (
  'PRODUCT_VIEW','PRODUCT_CREATE','PRODUCT_EDIT','STOCK_VIEW','STOCK_ADJUST',
  'SUPPLIER_VIEW','SUPPLIER_CREATE',
  'PURCHASE_VIEW','PURCHASE_CREATE','PURCHASE_EDIT',
  'REPORT_VIEW'
)
WHERE r.role_code = 'INVENTORY'
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO units (unit_name, unit_code, is_active)
VALUES
('Piece', 'PCS', TRUE),
('Kilogram', 'KG', TRUE),
('Gram', 'GM', TRUE),
('Liter', 'LTR', TRUE),
('Meter', 'MTR', TRUE),
('Box', 'BOX', TRUE),
('Dozen', 'DOZEN', TRUE),
('Service', 'SERVICE', TRUE)
ON CONFLICT (unit_code) DO UPDATE SET
  unit_name = EXCLUDED.unit_name,
  is_active = EXCLUDED.is_active;

INSERT INTO subscription_plans
(
  plan_name,
  plan_code,
  monthly_price,
  currency_code,
  max_businesses,
  max_users,
  max_customers,
  max_products,
  max_invoices_per_month,
  has_inventory,
  has_quotation,
  has_reports,
  has_whatsapp_sharing,
  has_multi_user,
  is_active
)
VALUES
('Basic', 'BASIC', 1000, 'PKR', 1, 1, NULL, NULL, NULL, TRUE, TRUE, TRUE, TRUE, FALSE, TRUE),
('Standard', 'STANDARD', 2000, 'PKR', 1, 3, NULL, NULL, NULL, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE),
('Premium', 'PREMIUM', 3000, 'PKR', NULL, 10, NULL, NULL, NULL, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE)
ON CONFLICT (plan_code) DO UPDATE SET
  plan_name = EXCLUDED.plan_name,
  monthly_price = EXCLUDED.monthly_price,
  currency_code = EXCLUDED.currency_code,
  max_businesses = EXCLUDED.max_businesses,
  max_users = EXCLUDED.max_users,
  max_customers = EXCLUDED.max_customers,
  max_products = EXCLUDED.max_products,
  max_invoices_per_month = EXCLUDED.max_invoices_per_month,
  has_inventory = EXCLUDED.has_inventory,
  has_quotation = EXCLUDED.has_quotation,
  has_reports = EXCLUDED.has_reports,
  has_whatsapp_sharing = EXCLUDED.has_whatsapp_sharing,
  has_multi_user = EXCLUDED.has_multi_user,
  is_active = EXCLUDED.is_active;
