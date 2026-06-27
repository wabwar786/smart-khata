-- ================================================================
-- Smart Khata Demo Seed Data - Mobile Shop (PKR)
-- Business: Smart Mobile Center Demo
-- Period: last 30 days from the date you run this script
-- Login: demo.owner@smartkhata.pk / Demo@12345
-- Run after deploying migrations 001 to 005.
-- ================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Re-run safe cleanup for this demo business/user.
DELETE FROM audit_logs
WHERE business_id IN (SELECT business_id FROM businesses WHERE business_name = 'Smart Mobile Center Demo')
   OR user_id IN (SELECT user_id FROM app_users WHERE LOWER(email) IN (
     'demo.owner@smartkhata.pk',
     'demo.salesman@smartkhata.pk',
     'demo.accountant@smartkhata.pk'
   ));

DELETE FROM businesses WHERE business_name = 'Smart Mobile Center Demo';
DELETE FROM app_users WHERE LOWER(email) IN (
  'demo.owner@smartkhata.pk',
  'demo.salesman@smartkhata.pk',
  'demo.accountant@smartkhata.pk'
);

-- Ensure core defaults exist.
INSERT INTO roles(role_name, role_code, description, is_system_role, is_active)
VALUES
('Business Owner', 'OWNER', 'Full business access', TRUE, TRUE),
('Manager', 'MANAGER', 'Manage sales, customers, inventory and reports', TRUE, TRUE),
('Salesman', 'SALESMAN', 'Create customers, quotations and sales', TRUE, TRUE),
('Accountant', 'ACCOUNTANT', 'Manage payments, ledger and reports', TRUE, TRUE),
('Inventory Staff', 'INVENTORY', 'Manage products and stock', TRUE, TRUE)
ON CONFLICT (role_code) DO NOTHING;

INSERT INTO units(unit_name, unit_code, is_active)
VALUES
('Piece', 'PCS', TRUE),
('Service', 'SERVICE', TRUE),
('Box', 'BOX', TRUE)
ON CONFLICT (unit_code) DO UPDATE SET unit_name = EXCLUDED.unit_name, is_active = TRUE;

INSERT INTO subscription_plans(plan_name, plan_code, monthly_price, currency_code, max_businesses, max_users, max_customers, max_products, max_invoices_per_month, has_inventory, has_quotation, has_reports, has_whatsapp_sharing, has_multi_user, is_active)
VALUES
('Basic', 'BASIC', 1000, 'PKR', 1, 1, NULL, NULL, NULL, TRUE, TRUE, TRUE, TRUE, FALSE, TRUE),
('Standard', 'STANDARD', 2000, 'PKR', 1, 3, NULL, NULL, NULL, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE),
('Premium', 'PREMIUM', 3000, 'PKR', NULL, 10, NULL, NULL, NULL, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE)
ON CONFLICT (plan_code) DO UPDATE SET monthly_price = EXCLUDED.monthly_price, currency_code = 'PKR', is_active = TRUE;

DO $$
DECLARE
  v_start DATE := (CURRENT_DATE - INTERVAL '29 days')::DATE;
  v_end DATE := CURRENT_DATE;
  v_owner_id BIGINT;
  v_salesman_user_id BIGINT;
  v_accountant_user_id BIGINT;
  v_business_id BIGINT;
  v_branch_id BIGINT;
  v_warehouse_id BIGINT;
  v_cash_id BIGINT;
  v_bank_id BIGINT;
  v_jazz_id BIGINT;
  v_easy_id BIGINT;
  v_owner_role_id INT;
  v_sales_role_id INT;
  v_accountant_role_id INT;
  v_plan_id INT;
  v_sub_id BIGINT;
  v_pcs_unit_id INT;
  v_service_unit_id INT;
  v_cat_phone BIGINT;
  v_cat_acc BIGINT;
  v_cat_repair BIGINT;
  v_cat_sim BIGINT;
  v_exp_rent BIGINT;
  v_exp_salary BIGINT;
  v_exp_util BIGINT;
  v_exp_marketing BIGINT;
  v_exp_transport BIGINT;
  v_exp_misc BIGINT;
  v_customer_ids BIGINT[];
  v_supplier_ids BIGINT[];
  v_product_ids BIGINT[];
  v_phone_ids BIGINT[];
  v_acc_ids BIGINT[];
  v_staff_ids BIGINT[];
  v_customer_id BIGINT;
  v_supplier_id BIGINT;
  v_product_id BIGINT;
  v_product2_id BIGINT;
  v_invoice_id BIGINT;
  v_payment_id BIGINT;
  v_purchase_id BIGINT;
  v_quotation_id BIGINT;
  v_staff_id BIGINT;
  v_payroll_run_id BIGINT;
  v_pname TEXT;
  v_sku TEXT;
  v_pname2 TEXT;
  v_sku2 TEXT;
  v_qty NUMERIC(18,3);
  v_qty2 NUMERIC(18,3);
  v_price NUMERIC(18,2);
  v_price2 NUMERIC(18,2);
  v_cost NUMERIC(18,2);
  v_cost2 NUMERIC(18,2);
  v_subtotal NUMERIC(18,2);
  v_discount NUMERIC(18,2);
  v_total NUMERIC(18,2);
  v_paid NUMERIC(18,2);
  v_balance NUMERIC(18,2);
  v_cust_bal NUMERIC(18,2);
  v_supp_bal NUMERIC(18,2);
  v_method TEXT;
  v_account_id BIGINT;
  v_date TIMESTAMPTZ;
  i INT;
  j INT;
  v_temp BIGINT;
BEGIN
  SELECT role_id INTO v_owner_role_id FROM roles WHERE role_code='OWNER' LIMIT 1;
  SELECT role_id INTO v_sales_role_id FROM roles WHERE role_code='SALESMAN' LIMIT 1;
  SELECT role_id INTO v_accountant_role_id FROM roles WHERE role_code='ACCOUNTANT' LIMIT 1;
  SELECT unit_id INTO v_pcs_unit_id FROM units WHERE unit_code='PCS' LIMIT 1;
  SELECT unit_id INTO v_service_unit_id FROM units WHERE unit_code='SERVICE' LIMIT 1;
  SELECT plan_id INTO v_plan_id FROM subscription_plans WHERE plan_code='PREMIUM' LIMIT 1;

  -- Demo users. Password for all users: Demo@12345
  INSERT INTO app_users(full_name, phone_number, email, password_hash, is_phone_verified, is_email_verified, is_active)
  VALUES('Ali Raza', '03001234567', 'demo.owner@smartkhata.pk', crypt('Demo@12345', gen_salt('bf', 10)), TRUE, TRUE, TRUE)
  RETURNING user_id INTO v_owner_id;

  INSERT INTO app_users(full_name, phone_number, email, password_hash, is_phone_verified, is_email_verified, is_active)
  VALUES('Usman Salesman', '03011234567', 'demo.salesman@smartkhata.pk', crypt('Demo@12345', gen_salt('bf', 10)), TRUE, TRUE, TRUE)
  RETURNING user_id INTO v_salesman_user_id;

  INSERT INTO app_users(full_name, phone_number, email, password_hash, is_phone_verified, is_email_verified, is_active)
  VALUES('Sara Accountant', '03021234567', 'demo.accountant@smartkhata.pk', crypt('Demo@12345', gen_salt('bf', 10)), TRUE, TRUE, TRUE)
  RETURNING user_id INTO v_accountant_user_id;

  INSERT INTO businesses(owner_user_id, business_name, business_type, phone_number, whatsapp_number, email, address, city, country, ntn, currency_code, timezone, is_active)
  VALUES(v_owner_id, 'Smart Mobile Center Demo', 'Mobile Shop', '051-5550101', '03001234567', 'demo.owner@smartkhata.pk', 'Shop #12, Mobile Market, Saddar', 'Rawalpindi', 'Pakistan', '1234567-8', 'PKR', 'Asia/Karachi', TRUE)
  RETURNING business_id INTO v_business_id;

  INSERT INTO business_users(business_id, user_id, role_id, is_owner, created_by)
  VALUES
  (v_business_id, v_owner_id, v_owner_role_id, TRUE, v_owner_id),
  (v_business_id, v_salesman_user_id, v_sales_role_id, FALSE, v_owner_id),
  (v_business_id, v_accountant_user_id, v_accountant_role_id, FALSE, v_owner_id);

  INSERT INTO business_settings(business_id, invoice_prefix, quotation_prefix, purchase_prefix, show_logo_on_invoice, show_tax_on_invoice, default_tax_percent, invoice_terms, invoice_footer_text, allow_negative_stock, low_stock_alert)
  VALUES(v_business_id, 'SMC', 'QT', 'PUR', TRUE, FALSE, 0, 'Goods once sold can be returned within 7 days with original packing and receipt.', 'Thank you for shopping at Smart Mobile Center.', FALSE, TRUE);

  INSERT INTO document_sequences(business_id, document_type, prefix, next_number, padding_length)
  VALUES
  (v_business_id, 'SALE_INVOICE', 'SMC', 61, 5),
  (v_business_id, 'QUOTATION', 'QT', 6, 5),
  (v_business_id, 'PURCHASE_BILL', 'PUR', 9, 5);

  INSERT INTO branches(business_id, branch_name, phone_number, address, city, is_main, is_active, created_by)
  VALUES(v_business_id, 'Main Branch - Saddar', '051-5550101', 'Shop #12, Mobile Market, Saddar', 'Rawalpindi', TRUE, TRUE, v_owner_id)
  RETURNING branch_id INTO v_branch_id;

  INSERT INTO warehouses(business_id, warehouse_name, address, is_default, is_active, created_by)
  VALUES(v_business_id, 'Main Stock Room', 'Back side stock room, Saddar shop', TRUE, TRUE, v_owner_id)
  RETURNING warehouse_id INTO v_warehouse_id;

  -- Insert all demo financial accounts. Do not use multi-row INSERT ... RETURNING INTO a scalar
  -- variable, because PostgreSQL raises "query returned more than one row".
  INSERT INTO financial_accounts(business_id, account_name, account_type, account_number, opening_balance, current_balance, is_default, is_active, created_by)
  VALUES
  (v_business_id, 'Cash Counter', 'CASH', NULL, 250000, 250000, TRUE, TRUE, v_owner_id),
  (v_business_id, 'Meezan Bank Current', 'BANK', 'PK00-MEEZAN-123456789', 550000, 550000, FALSE, TRUE, v_owner_id),
  (v_business_id, 'JazzCash Business', 'JAZZCASH', '03001234567', 85000, 85000, FALSE, TRUE, v_owner_id),
  (v_business_id, 'Easypaisa Wallet', 'EASYPAISA', '03001234567', 60000, 60000, FALSE, TRUE, v_owner_id);

  SELECT financial_account_id INTO v_cash_id FROM financial_accounts WHERE business_id=v_business_id AND account_name='Cash Counter' ORDER BY financial_account_id LIMIT 1;
  SELECT financial_account_id INTO v_bank_id FROM financial_accounts WHERE business_id=v_business_id AND account_name='Meezan Bank Current' ORDER BY financial_account_id LIMIT 1;
  SELECT financial_account_id INTO v_jazz_id FROM financial_accounts WHERE business_id=v_business_id AND account_name='JazzCash Business' ORDER BY financial_account_id LIMIT 1;
  SELECT financial_account_id INTO v_easy_id FROM financial_accounts WHERE business_id=v_business_id AND account_name='Easypaisa Wallet' ORDER BY financial_account_id LIMIT 1;

  INSERT INTO cash_book_entries(business_id, financial_account_id, entry_date, entry_type, amount, title, description, reference_type, created_by)
  VALUES
  (v_business_id, v_cash_id, v_start::TIMESTAMPTZ, 'OPENING', 250000, 'Opening cash balance', 'Demo opening cash for one month mobile shop data', 'OPENING', v_owner_id),
  (v_business_id, v_bank_id, v_start::TIMESTAMPTZ, 'OPENING', 550000, 'Opening bank balance', 'Demo opening bank balance', 'OPENING', v_owner_id),
  (v_business_id, v_jazz_id, v_start::TIMESTAMPTZ, 'OPENING', 85000, 'Opening JazzCash balance', 'Demo opening JazzCash balance', 'OPENING', v_owner_id),
  (v_business_id, v_easy_id, v_start::TIMESTAMPTZ, 'OPENING', 60000, 'Opening Easypaisa balance', 'Demo opening Easypaisa balance', 'OPENING', v_owner_id);

  -- Product categories
  INSERT INTO product_categories(business_id, category_name, description, created_by)
  VALUES(v_business_id, 'Smartphones', 'New and used Android/iPhone handsets', v_owner_id) RETURNING product_category_id INTO v_cat_phone;
  INSERT INTO product_categories(business_id, category_name, description, created_by)
  VALUES(v_business_id, 'Mobile Accessories', 'Chargers, cables, covers, handsfree and protectors', v_owner_id) RETURNING product_category_id INTO v_cat_acc;
  INSERT INTO product_categories(business_id, category_name, description, created_by)
  VALUES(v_business_id, 'Repair Services', 'Software and hardware repair services', v_owner_id) RETURNING product_category_id INTO v_cat_repair;
  INSERT INTO product_categories(business_id, category_name, description, created_by)
  VALUES(v_business_id, 'SIM & Digital Services', 'SIM activation, top-up and digital services', v_owner_id) RETURNING product_category_id INTO v_cat_sim;

  -- Expense categories
  INSERT INTO expense_categories(business_id, category_name) VALUES(v_business_id, 'Shop Rent') RETURNING expense_category_id INTO v_exp_rent;
  INSERT INTO expense_categories(business_id, category_name) VALUES(v_business_id, 'Salary') RETURNING expense_category_id INTO v_exp_salary;
  INSERT INTO expense_categories(business_id, category_name) VALUES(v_business_id, 'Utilities') RETURNING expense_category_id INTO v_exp_util;
  INSERT INTO expense_categories(business_id, category_name) VALUES(v_business_id, 'Marketing') RETURNING expense_category_id INTO v_exp_marketing;
  INSERT INTO expense_categories(business_id, category_name) VALUES(v_business_id, 'Transport') RETURNING expense_category_id INTO v_exp_transport;
  INSERT INTO expense_categories(business_id, category_name) VALUES(v_business_id, 'Miscellaneous') RETURNING expense_category_id INTO v_exp_misc;

  -- Products and services
  INSERT INTO products(business_id, product_category_id, unit_id, product_name, sku, barcode, product_type, purchase_price, sale_price, opening_stock, current_stock, low_stock_qty, description, created_by)
  VALUES
  (v_business_id, v_cat_phone, v_pcs_unit_id, 'Samsung Galaxy A15 128GB', 'SMC-PH-001', '890001001', 'PRODUCT', 47500, 52500, 8, 8, 2, 'New box packed PTA approved', v_owner_id),
  (v_business_id, v_cat_phone, v_pcs_unit_id, 'Vivo Y03 64GB', 'SMC-PH-002', '890001002', 'PRODUCT', 28500, 32500, 10, 10, 3, 'Budget Android phone', v_owner_id),
  (v_business_id, v_cat_phone, v_pcs_unit_id, 'Oppo A38 128GB', 'SMC-PH-003', '890001003', 'PRODUCT', 39500, 44500, 7, 7, 2, 'New box packed', v_owner_id),
  (v_business_id, v_cat_phone, v_pcs_unit_id, 'Infinix Hot 40 128GB', 'SMC-PH-004', '890001004', 'PRODUCT', 34500, 39200, 9, 9, 3, 'Popular gaming phone', v_owner_id),
  (v_business_id, v_cat_phone, v_pcs_unit_id, 'Tecno Spark 20 128GB', 'SMC-PH-005', '890001005', 'PRODUCT', 31500, 35800, 8, 8, 2, 'New stock demo item', v_owner_id),
  (v_business_id, v_cat_phone, v_pcs_unit_id, 'Redmi 13C 128GB', 'SMC-PH-006', '890001006', 'PRODUCT', 32500, 36900, 12, 12, 4, 'High demand model', v_owner_id),
  (v_business_id, v_cat_phone, v_pcs_unit_id, 'iPhone 11 64GB Used', 'SMC-PH-007', '890001007', 'PRODUCT', 85000, 97500, 3, 3, 1, 'Used phone with warranty', v_owner_id),
  (v_business_id, v_cat_phone, v_pcs_unit_id, 'iPhone 12 128GB Used', 'SMC-PH-008', '890001008', 'PRODUCT', 125000, 142000, 2, 2, 1, 'Used phone PTA approved', v_owner_id),
  (v_business_id, v_cat_acc, v_pcs_unit_id, 'Fast Charger 25W Type-C', 'SMC-AC-001', '890002001', 'PRODUCT', 950, 1500, 45, 45, 10, 'Fast charging adapter', v_owner_id),
  (v_business_id, v_cat_acc, v_pcs_unit_id, 'Type-C Data Cable', 'SMC-AC-002', '890002002', 'PRODUCT', 280, 600, 70, 70, 15, '1 meter data cable', v_owner_id),
  (v_business_id, v_cat_acc, v_pcs_unit_id, 'AirPods Copy Premium', 'SMC-AC-003', '890002003', 'PRODUCT', 1800, 3200, 30, 30, 8, 'Bluetooth earbuds', v_owner_id),
  (v_business_id, v_cat_acc, v_pcs_unit_id, 'Tempered Glass Protector', 'SMC-AC-004', '890002004', 'PRODUCT', 120, 300, 120, 120, 30, 'Screen protector', v_owner_id),
  (v_business_id, v_cat_acc, v_pcs_unit_id, 'Silicon Back Cover', 'SMC-AC-005', '890002005', 'PRODUCT', 180, 500, 90, 90, 25, 'Mobile back cover', v_owner_id),
  (v_business_id, v_cat_acc, v_pcs_unit_id, 'Power Bank 10000mAh', 'SMC-AC-006', '890002006', 'PRODUCT', 3200, 4800, 16, 16, 4, 'Portable power bank', v_owner_id),
  (v_business_id, v_cat_acc, v_pcs_unit_id, 'Memory Card 64GB', 'SMC-AC-007', '890002007', 'PRODUCT', 1350, 2200, 25, 25, 5, 'MicroSD card', v_owner_id),
  (v_business_id, v_cat_acc, v_pcs_unit_id, 'Handsfree 3.5mm', 'SMC-AC-008', '890002008', 'PRODUCT', 300, 750, 40, 40, 8, 'Wired handsfree', v_owner_id),
  (v_business_id, v_cat_repair, v_service_unit_id, 'Mobile Repair Service', 'SMC-SV-001', NULL, 'SERVICE', 0, 1500, 0, 0, NULL, 'General mobile repair labour', v_owner_id),
  (v_business_id, v_cat_repair, v_service_unit_id, 'Screen Replacement Labour', 'SMC-SV-002', NULL, 'SERVICE', 0, 2500, 0, 0, NULL, 'Screen replacement service charges only', v_owner_id),
  (v_business_id, v_cat_repair, v_service_unit_id, 'Software Flashing Service', 'SMC-SV-003', NULL, 'SERVICE', 0, 1000, 0, 0, NULL, 'Software flashing and reset', v_owner_id),
  (v_business_id, v_cat_sim, v_service_unit_id, 'SIM Activation Service', 'SMC-SV-004', NULL, 'SERVICE', 0, 500, 0, 0, NULL, 'SIM activation commission/service', v_owner_id);

  -- Opening stock records
  INSERT INTO product_stock(business_id, warehouse_id, product_id, current_qty)
  SELECT v_business_id, v_warehouse_id, p.product_id, p.opening_stock
  FROM products p WHERE p.business_id = v_business_id AND p.product_type = 'PRODUCT';

  INSERT INTO inventory_transactions(business_id, warehouse_id, product_id, transaction_type, qty_in, unit_cost, notes, transaction_date, created_by)
  SELECT v_business_id, v_warehouse_id, p.product_id, 'OPENING', p.opening_stock, p.purchase_price, 'Demo opening stock', v_start::TIMESTAMPTZ, v_owner_id
  FROM products p WHERE p.business_id=v_business_id AND p.product_type='PRODUCT' AND p.opening_stock > 0;

  -- Suppliers
  INSERT INTO suppliers(business_id, supplier_name, phone_number, whatsapp_number, email, address, city, opening_balance, current_balance, notes, created_by)
  VALUES
  (v_business_id, 'Mobicom Wholesale Lahore', '042-111222333', '03005550101', 'accounts@mobicom.example', 'Hall Road Lahore', 'Lahore', 75000, 75000, 'Main smartphone supplier', v_owner_id),
  (v_business_id, 'Saddar Accessories Market', '051-5552201', '03005550102', NULL, 'Saddar Rawalpindi', 'Rawalpindi', 18000, 18000, 'Covers/cables/protectors', v_owner_id),
  (v_business_id, 'Karachi Used Phones Hub', '021-5552202', '03005550103', NULL, 'Saddar Karachi', 'Karachi', 125000, 125000, 'Used iPhones supplier', v_owner_id),
  (v_business_id, 'Digital Parts Supplier', '051-5552203', '03005550104', NULL, 'College Road Rawalpindi', 'Rawalpindi', 0, 0, 'Repair parts supplier', v_owner_id),
  (v_business_id, 'Power Accessories PK', '042-5552204', '03005550105', NULL, 'Shah Alam Market Lahore', 'Lahore', 30000, 30000, 'Power banks and chargers', v_owner_id),
  (v_business_id, 'SIM Distribution Partner', '051-5552205', '03005550106', NULL, 'Blue Area Islamabad', 'Islamabad', 0, 0, 'SIM and recharge partner', v_owner_id);

  FOR v_supplier_id, v_supp_bal IN SELECT supplier_id, opening_balance FROM suppliers WHERE business_id=v_business_id LOOP
    IF v_supp_bal > 0 THEN
      INSERT INTO supplier_ledger(business_id, supplier_id, ledger_date, entry_type, reference_type, debit_amount, credit_amount, balance_after, description, created_by)
      VALUES(v_business_id, v_supplier_id, v_start::TIMESTAMPTZ, 'OPENING', 'OPENING', 0, v_supp_bal, v_supp_bal, 'Opening supplier payable balance', v_owner_id);
    END IF;
  END LOOP;

  -- Customers
  INSERT INTO customers(business_id, customer_name, phone_number, whatsapp_number, email, address, city, customer_type, opening_balance, current_balance, credit_limit, notes, created_by)
  VALUES
  (v_business_id, 'Walk-in Cash Customer', '03000000000', '03000000000', NULL, 'General cash sales', 'Rawalpindi', 'Retail', 0, 0, 0, 'Default cash customer', v_owner_id),
  (v_business_id, 'Ahmed Mobile Reseller', '03014561234', '03014561234', NULL, 'Commercial Market', 'Rawalpindi', 'Wholesale', 32000, 32000, 150000, 'Regular reseller', v_owner_id),
  (v_business_id, 'Bilal Traders', '03024561234', '03024561234', NULL, 'Raja Bazaar', 'Rawalpindi', 'Wholesale', 55000, 55000, 200000, 'Accessories reseller', v_owner_id),
  (v_business_id, 'Hassan Khan', '03034561234', '03034561234', NULL, 'Satellite Town', 'Rawalpindi', 'Retail', 12000, 12000, 50000, 'Retail credit customer', v_owner_id),
  (v_business_id, 'Ayesha Electronics', '03044561234', '03044561234', NULL, 'G-9 Markaz', 'Islamabad', 'Wholesale', 78000, 78000, 250000, 'Dealer customer', v_owner_id),
  (v_business_id, 'Usman Ali', '03054561234', '03054561234', NULL, 'Bahria Town', 'Rawalpindi', 'Retail', 0, 0, 40000, 'New customer', v_owner_id),
  (v_business_id, 'Fatima Zahra', '03064561234', '03064561234', NULL, 'PWD', 'Islamabad', 'Retail', 4500, 4500, 30000, 'Retail accessories customer', v_owner_id),
  (v_business_id, 'Sana Mobile Mart', '03074561234', '03074561234', NULL, 'Chaklala Scheme 3', 'Rawalpindi', 'Wholesale', 100000, 100000, 300000, 'High-volume mobile shop', v_owner_id),
  (v_business_id, 'Imran Repair Shop', '03084561234', '03084561234', NULL, 'Tench Bhatta', 'Rawalpindi', 'Wholesale', 23000, 23000, 100000, 'Repair parts customer', v_owner_id),
  (v_business_id, 'Noman Student', '03094561234', '03094561234', NULL, '6th Road', 'Rawalpindi', 'Retail', 0, 0, 20000, 'Installment style demo customer', v_owner_id),
  (v_business_id, 'Arslan Accessories', '03104561234', '03104561234', NULL, 'Blue Area', 'Islamabad', 'Wholesale', 67000, 67000, 150000, 'Accessories dealer', v_owner_id),
  (v_business_id, 'Maryam Khan', '03114561234', '03114561234', NULL, 'DHA Phase 2', 'Islamabad', 'Retail', 0, 0, 50000, 'iPhone customer', v_owner_id);

  FOR v_customer_id, v_cust_bal IN SELECT customer_id, opening_balance FROM customers WHERE business_id=v_business_id LOOP
    IF v_cust_bal > 0 THEN
      INSERT INTO customer_ledger(business_id, customer_id, ledger_date, entry_type, reference_type, debit_amount, credit_amount, balance_after, description, created_by)
      VALUES(v_business_id, v_customer_id, v_start::TIMESTAMPTZ, 'OPENING', 'OPENING', v_cust_bal, 0, v_cust_bal, 'Opening customer receivable balance', v_owner_id);
    END IF;
  END LOOP;

  SELECT array_agg(customer_id ORDER BY customer_id) INTO v_customer_ids FROM customers WHERE business_id=v_business_id;
  SELECT array_agg(supplier_id ORDER BY supplier_id) INTO v_supplier_ids FROM suppliers WHERE business_id=v_business_id;
  SELECT array_agg(product_id ORDER BY product_id) INTO v_product_ids FROM products WHERE business_id=v_business_id;
  SELECT array_agg(product_id ORDER BY product_id) INTO v_phone_ids FROM products WHERE business_id=v_business_id AND product_category_id=v_cat_phone;
  SELECT array_agg(product_id ORDER BY product_id) INTO v_acc_ids FROM products WHERE business_id=v_business_id AND product_category_id=v_cat_acc;

  -- One month purchase records: 8 supplier purchase bills.
  FOR i IN 1..8 LOOP
    v_date := (v_start + ((i-1) * 3))::TIMESTAMPTZ + TIME '11:00';
    v_supplier_id := v_supplier_ids[((i - 1) % array_length(v_supplier_ids, 1)) + 1];
    v_product_id := CASE WHEN i IN (1,2,4,6) THEN v_phone_ids[((i - 1) % array_length(v_phone_ids, 1)) + 1] ELSE v_acc_ids[((i - 1) % array_length(v_acc_ids, 1)) + 1] END;
    SELECT product_name, purchase_price INTO v_pname, v_cost FROM products WHERE product_id=v_product_id;
    v_qty := CASE WHEN v_product_id = ANY(v_phone_ids) THEN 4 + (i % 3) ELSE 20 + (i * 2) END;
    v_discount := CASE WHEN i % 4 = 0 THEN 1500 ELSE 0 END;
    v_subtotal := ROUND(v_qty * v_cost, 2);
    v_total := v_subtotal - v_discount;
    v_paid := CASE WHEN i % 3 = 0 THEN ROUND(v_total * 0.50, 2) WHEN i % 5 = 0 THEN 0 ELSE ROUND(v_total * 0.75, 2) END;
    v_balance := v_total - v_paid;

    INSERT INTO purchase_bills(business_id, supplier_id, purchase_no, purchase_date, supplier_name_snapshot, supplier_phone_snapshot, sub_total, discount_amount, tax_amount, grand_total, paid_amount, balance_amount, payment_status, bill_status, notes, created_by)
    SELECT v_business_id, supplier_id, 'PUR-' || LPAD(i::TEXT, 5, '0'), v_date, supplier_name, phone_number, v_subtotal, v_discount, 0, v_total, v_paid, v_balance,
           CASE WHEN v_balance = 0 THEN 'PAID' WHEN v_paid = 0 THEN 'UNPAID' ELSE 'PARTIAL' END, 'POSTED', 'Demo monthly stock purchase', v_owner_id
    FROM suppliers WHERE supplier_id=v_supplier_id
    RETURNING purchase_bill_id INTO v_purchase_id;

    INSERT INTO purchase_bill_items(business_id, purchase_bill_id, product_id, item_name_snapshot, qty, unit_cost, discount_amount, tax_percent, tax_amount, line_total)
    VALUES(v_business_id, v_purchase_id, v_product_id, v_pname, v_qty, v_cost, v_discount, 0, 0, v_total);

    UPDATE products SET current_stock=current_stock+v_qty WHERE product_id=v_product_id;
    UPDATE product_stock SET current_qty=current_qty+v_qty WHERE business_id=v_business_id AND warehouse_id=v_warehouse_id AND product_id=v_product_id;
    INSERT INTO inventory_transactions(business_id, warehouse_id, product_id, transaction_type, reference_type, reference_id, qty_in, unit_cost, notes, transaction_date, created_by)
    VALUES(v_business_id, v_warehouse_id, v_product_id, 'PURCHASE', 'PURCHASE_BILL', v_purchase_id, v_qty, v_cost, 'Purchase stock in', v_date, v_owner_id);

    SELECT current_balance INTO v_supp_bal FROM suppliers WHERE supplier_id=v_supplier_id;
    v_supp_bal := v_supp_bal + v_total;
    UPDATE suppliers SET current_balance=v_supp_bal WHERE supplier_id=v_supplier_id;
    INSERT INTO supplier_ledger(business_id, supplier_id, ledger_date, entry_type, reference_type, reference_id, debit_amount, credit_amount, balance_after, description, created_by)
    VALUES(v_business_id, v_supplier_id, v_date, 'PURCHASE', 'PURCHASE_BILL', v_purchase_id, 0, v_total, v_supp_bal, 'Purchase bill ' || 'PUR-' || LPAD(i::TEXT, 5, '0'), v_owner_id);

    IF v_paid > 0 THEN
      INSERT INTO supplier_payments(business_id, supplier_id, payment_date, amount, payment_method, reference_no, description, created_by)
      VALUES(v_business_id, v_supplier_id, v_date + INTERVAL '20 minutes', v_paid, CASE WHEN i % 2 = 0 THEN 'Bank' ELSE 'Cash' END, 'SUPPAY-' || LPAD(i::TEXT, 5, '0'), 'Payment against purchase bill', v_accountant_user_id);

      SELECT current_balance INTO v_supp_bal FROM suppliers WHERE supplier_id=v_supplier_id;
      v_supp_bal := v_supp_bal - v_paid;
      UPDATE suppliers SET current_balance=v_supp_bal WHERE supplier_id=v_supplier_id;
      INSERT INTO supplier_ledger(business_id, supplier_id, ledger_date, entry_type, reference_type, reference_id, debit_amount, credit_amount, balance_after, description, created_by)
      VALUES(v_business_id, v_supplier_id, v_date + INTERVAL '20 minutes', 'PAYMENT', 'SUPPLIER_PAYMENT', v_purchase_id, v_paid, 0, v_supp_bal, 'Supplier payment against purchase', v_accountant_user_id);

      v_account_id := CASE WHEN i % 2 = 0 THEN v_bank_id ELSE v_cash_id END;
      INSERT INTO cash_book_entries(business_id, financial_account_id, entry_date, entry_type, amount, title, description, reference_type, reference_id, created_by)
      VALUES(v_business_id, v_account_id, v_date + INTERVAL '20 minutes', 'CASH_OUT', v_paid, 'Supplier payment', 'Payment to supplier for demo purchase', 'PURCHASE_BILL', v_purchase_id, v_accountant_user_id);
    END IF;
  END LOOP;

  -- One month sales: 60 invoices, 2 invoices per day.
  FOR i IN 1..60 LOOP
    v_date := (v_start + ((i-1) / 2))::TIMESTAMPTZ + (TIME '10:00' + ((i % 9) || ' hours')::INTERVAL);
    v_customer_id := v_customer_ids[((i - 1) % array_length(v_customer_ids, 1)) + 1];
    v_product_id := CASE WHEN i % 5 IN (0,1) THEN v_phone_ids[((i - 1) % array_length(v_phone_ids, 1)) + 1] ELSE v_acc_ids[((i - 1) % array_length(v_acc_ids, 1)) + 1] END;
    v_product2_id := CASE WHEN i % 3 = 0 THEN v_acc_ids[((i + 2) % array_length(v_acc_ids, 1)) + 1] ELSE NULL END;

    SELECT product_name, sku, sale_price, purchase_price INTO v_pname, v_sku, v_price, v_cost FROM products WHERE product_id=v_product_id;
    v_qty := CASE WHEN v_product_id = ANY(v_phone_ids) THEN 1 ELSE 1 + (i % 3) END;
    v_subtotal := ROUND(v_qty * v_price, 2);

    IF v_product2_id IS NOT NULL THEN
      SELECT product_name, sku, sale_price, purchase_price INTO v_pname2, v_sku2, v_price2, v_cost2 FROM products WHERE product_id=v_product2_id;
      v_qty2 := 1 + (i % 2);
      v_subtotal := v_subtotal + ROUND(v_qty2 * v_price2, 2);
    ELSE
      v_qty2 := 0;
      v_price2 := 0;
    END IF;

    v_discount := CASE WHEN i % 7 = 0 THEN 500 WHEN i % 11 = 0 THEN 1000 ELSE 0 END;
    -- Keep demo discounts realistic and ensure invoice totals never go negative.
    -- Some accessory invoices are small (e.g. Rs. 900), so a fixed Rs. 1000 discount
    -- violates ck_sales_invoices_amounts. Cap discount to max 10% of subtotal.
    v_discount := LEAST(v_discount, ROUND(v_subtotal * 0.10, 2));
    v_total := GREATEST(v_subtotal - v_discount, 0);
    v_paid := CASE WHEN i % 4 = 0 THEN ROUND(v_total * 0.50, 2) WHEN i % 9 = 0 THEN 0 ELSE v_total END;
    v_paid := LEAST(GREATEST(v_paid, 0), v_total);
    v_balance := GREATEST(v_total - v_paid, 0);
    v_method := CASE WHEN i % 5 = 0 THEN 'JazzCash' WHEN i % 6 = 0 THEN 'Easypaisa' WHEN i % 4 = 0 THEN 'Bank' ELSE 'Cash' END;
    v_account_id := CASE WHEN v_method='JazzCash' THEN v_jazz_id WHEN v_method='Easypaisa' THEN v_easy_id WHEN v_method='Bank' THEN v_bank_id ELSE v_cash_id END;

    INSERT INTO sales_invoices(business_id, customer_id, invoice_no, invoice_date, customer_name_snapshot, customer_phone_snapshot, customer_address_snapshot, sub_total, discount_amount, tax_amount, grand_total, paid_amount, balance_amount, payment_status, invoice_status, notes, terms, created_by)
    SELECT v_business_id, customer_id, 'SMC-' || LPAD(i::TEXT, 5, '0'), v_date, customer_name, phone_number, address, v_subtotal, v_discount, 0, v_total, v_paid, v_balance,
           CASE WHEN v_balance = 0 THEN 'PAID' WHEN v_paid = 0 THEN 'UNPAID' ELSE 'PARTIAL' END, 'POSTED', 'Demo mobile shop sale', 'Warranty as per brand/company policy.', v_salesman_user_id
    FROM customers WHERE customer_id=v_customer_id
    RETURNING sales_invoice_id INTO v_invoice_id;

    INSERT INTO sales_invoice_items(business_id, sales_invoice_id, product_id, item_name_snapshot, sku_snapshot, qty, unit_price, discount_amount, tax_percent, tax_amount, line_total)
    VALUES(v_business_id, v_invoice_id, v_product_id, v_pname, v_sku, v_qty, v_price, 0, 0, 0, ROUND(v_qty * v_price, 2));

    IF v_product_id IS NOT NULL AND NOT (SELECT product_type='SERVICE' FROM products WHERE product_id=v_product_id) THEN
      UPDATE products SET current_stock = current_stock - v_qty WHERE product_id=v_product_id;
      UPDATE product_stock SET current_qty = current_qty - v_qty WHERE business_id=v_business_id AND warehouse_id=v_warehouse_id AND product_id=v_product_id;
      INSERT INTO inventory_transactions(business_id, warehouse_id, product_id, transaction_type, reference_type, reference_id, qty_out, unit_cost, notes, transaction_date, created_by)
      VALUES(v_business_id, v_warehouse_id, v_product_id, 'SALE', 'SALE_INVOICE', v_invoice_id, v_qty, v_cost, 'Sale stock out', v_date, v_salesman_user_id);
    END IF;

    IF v_product2_id IS NOT NULL THEN
      INSERT INTO sales_invoice_items(business_id, sales_invoice_id, product_id, item_name_snapshot, sku_snapshot, qty, unit_price, discount_amount, tax_percent, tax_amount, line_total)
      VALUES(v_business_id, v_invoice_id, v_product2_id, v_pname2, v_sku2, v_qty2, v_price2, 0, 0, 0, ROUND(v_qty2 * v_price2, 2));
      UPDATE products SET current_stock = current_stock - v_qty2 WHERE product_id=v_product2_id;
      UPDATE product_stock SET current_qty = current_qty - v_qty2 WHERE business_id=v_business_id AND warehouse_id=v_warehouse_id AND product_id=v_product2_id;
      INSERT INTO inventory_transactions(business_id, warehouse_id, product_id, transaction_type, reference_type, reference_id, qty_out, unit_cost, notes, transaction_date, created_by)
      VALUES(v_business_id, v_warehouse_id, v_product2_id, 'SALE', 'SALE_INVOICE', v_invoice_id, v_qty2, v_cost2, 'Sale stock out', v_date, v_salesman_user_id);
    END IF;

    SELECT current_balance INTO v_cust_bal FROM customers WHERE customer_id=v_customer_id;
    v_cust_bal := v_cust_bal + v_total;
    UPDATE customers SET current_balance=v_cust_bal WHERE customer_id=v_customer_id;
    INSERT INTO customer_ledger(business_id, customer_id, ledger_date, entry_type, reference_type, reference_id, debit_amount, credit_amount, balance_after, description, created_by)
    VALUES(v_business_id, v_customer_id, v_date, 'SALE', 'SALE_INVOICE', v_invoice_id, v_total, 0, v_cust_bal, 'Sale invoice SMC-' || LPAD(i::TEXT, 5, '0'), v_salesman_user_id);

    IF v_paid > 0 THEN
      INSERT INTO payments_received(business_id, customer_id, payment_date, amount, payment_method, reference_no, description, created_by)
      VALUES(v_business_id, v_customer_id, v_date + INTERVAL '5 minutes', v_paid, v_method, 'PAY-' || LPAD(i::TEXT, 5, '0'), 'Payment received against invoice', v_salesman_user_id)
      RETURNING payment_received_id INTO v_payment_id;

      INSERT INTO payment_allocations(business_id, payment_received_id, sales_invoice_id, allocated_amount)
      VALUES(v_business_id, v_payment_id, v_invoice_id, v_paid);

      SELECT current_balance INTO v_cust_bal FROM customers WHERE customer_id=v_customer_id;
      v_cust_bal := v_cust_bal - v_paid;
      UPDATE customers SET current_balance=v_cust_bal WHERE customer_id=v_customer_id;
      INSERT INTO customer_ledger(business_id, customer_id, ledger_date, entry_type, reference_type, reference_id, debit_amount, credit_amount, balance_after, description, created_by)
      VALUES(v_business_id, v_customer_id, v_date + INTERVAL '5 minutes', 'PAYMENT', 'PAYMENT_RECEIVED', v_payment_id, 0, v_paid, v_cust_bal, 'Payment received for invoice SMC-' || LPAD(i::TEXT, 5, '0'), v_salesman_user_id);

      INSERT INTO cash_book_entries(business_id, financial_account_id, entry_date, entry_type, amount, title, description, reference_type, reference_id, created_by)
      VALUES(v_business_id, v_account_id, v_date + INTERVAL '5 minutes', 'CASH_IN', v_paid, 'Customer payment received', 'Payment method: ' || v_method, 'PAYMENT_RECEIVED', v_payment_id, v_salesman_user_id);
    END IF;

    IF i % 5 = 0 THEN
      INSERT INTO whatsapp_share_logs(business_id, document_type, document_id, phone_number, message_text, share_status, shared_by, shared_at)
      SELECT v_business_id, 'SALE_INVOICE', v_invoice_id, whatsapp_number, 'Your invoice SMC-' || LPAD(i::TEXT,5,'0') || ' amount is Rs. ' || v_total::TEXT, 'SENT_MANUAL', v_salesman_user_id, v_date + INTERVAL '10 minutes'
      FROM customers WHERE customer_id=v_customer_id;
    END IF;
  END LOOP;

  -- Five quotations in the demo month.
  FOR i IN 1..5 LOOP
    v_date := (v_start + (i * 5))::TIMESTAMPTZ + TIME '15:00';
    v_customer_id := v_customer_ids[((i + 3) % array_length(v_customer_ids, 1)) + 1];
    v_product_id := v_phone_ids[((i + 1) % array_length(v_phone_ids, 1)) + 1];
    SELECT product_name, sku, sale_price INTO v_pname, v_sku, v_price FROM products WHERE product_id=v_product_id;
    v_total := v_price;

    INSERT INTO quotations(business_id, customer_id, quotation_no, quotation_date, valid_until, customer_name_snapshot, customer_phone_snapshot, customer_address_snapshot, sub_total, discount_amount, tax_amount, grand_total, quotation_status, notes, terms, created_by)
    SELECT v_business_id, customer_id, 'QT-' || LPAD(i::TEXT,5,'0'), v_date, (v_date::DATE + 7), customer_name, phone_number, address, v_total, 0, 0, v_total,
           CASE WHEN i=1 THEN 'ACCEPTED' WHEN i=2 THEN 'CONVERTED' WHEN i=5 THEN 'PENDING' ELSE 'PENDING' END,
           'Demo quotation for mobile shop customer', 'Prices valid for 7 days only.', v_salesman_user_id
    FROM customers WHERE customer_id=v_customer_id
    RETURNING quotation_id INTO v_quotation_id;

    INSERT INTO quotation_items(business_id, quotation_id, product_id, item_name_snapshot, sku_snapshot, qty, unit_price, discount_amount, tax_percent, tax_amount, line_total)
    VALUES(v_business_id, v_quotation_id, v_product_id, v_pname, v_sku, 1, v_price, 0, 0, 0, v_total);
  END LOOP;

  -- Expenses over the month.
  INSERT INTO expenses(business_id, expense_category_id, expense_date, title, amount, payment_method, description, created_by)
  VALUES
  (v_business_id, v_exp_rent, v_start + INTERVAL '1 day', 'Monthly shop rent', 85000, 'Bank', 'Rent for Saddar mobile shop', v_accountant_user_id),
  (v_business_id, v_exp_util, v_start + INTERVAL '3 days', 'Electricity bill', 18500, 'Cash', 'Monthly electricity bill', v_accountant_user_id),
  (v_business_id, v_exp_util, v_start + INTERVAL '5 days', 'Internet package', 5500, 'JazzCash', 'Shop internet and router package', v_accountant_user_id),
  (v_business_id, v_exp_transport, v_start + INTERVAL '7 days', 'Stock delivery charges', 4500, 'Cash', 'Delivery charges from Lahore stock shipment', v_accountant_user_id),
  (v_business_id, v_exp_marketing, v_start + INTERVAL '10 days', 'Facebook ad boost', 12000, 'Bank', 'Promotion for Eid mobile offers', v_accountant_user_id),
  (v_business_id, v_exp_misc, v_start + INTERVAL '12 days', 'Shop cleaning supplies', 2800, 'Cash', 'Cleaning and packing material', v_accountant_user_id),
  (v_business_id, v_exp_transport, v_start + INTERVAL '15 days', 'Courier charges', 3600, 'Cash', 'Courier to customer and suppliers', v_accountant_user_id),
  (v_business_id, v_exp_util, v_start + INTERVAL '17 days', 'UPS repair', 9500, 'Cash', 'UPS battery and repair work', v_accountant_user_id),
  (v_business_id, v_exp_marketing, v_start + INTERVAL '20 days', 'Printed flyers', 6500, 'Cash', 'Flyers for mobile sale promotion', v_accountant_user_id),
  (v_business_id, v_exp_misc, v_start + INTERVAL '22 days', 'Tea and staff food', 7200, 'Cash', 'Monthly tea and refreshment', v_accountant_user_id),
  (v_business_id, v_exp_transport, v_start + INTERVAL '25 days', 'Market visit fuel', 8500, 'Cash', 'Fuel for supplier visits', v_accountant_user_id),
  (v_business_id, v_exp_misc, v_start + INTERVAL '27 days', 'Minor shop maintenance', 11000, 'Cash', 'Counter repair and light replacement', v_accountant_user_id);

  INSERT INTO cash_book_entries(business_id, financial_account_id, entry_date, entry_type, amount, title, description, reference_type, reference_id, created_by)
  SELECT v_business_id,
         CASE WHEN payment_method='Bank' THEN v_bank_id WHEN payment_method='JazzCash' THEN v_jazz_id ELSE v_cash_id END,
         expense_date, 'CASH_OUT', amount, 'Expense: ' || title, description, 'EXPENSE', expense_id, created_by
  FROM expenses WHERE business_id=v_business_id;

  -- Staff, attendance and payroll.
  INSERT INTO staff_members(business_id, user_id, full_name, phone_number, role_title, salary_type, salary_amount, joining_date, cnic, address, can_login, is_active, created_by)
  VALUES
  (v_business_id, v_salesman_user_id, 'Usman Salesman', '03011234567', 'Salesman', 'MONTHLY', 45000, v_start - 100, '37405-1111111-1', 'Rawalpindi', TRUE, TRUE, v_owner_id),
  (v_business_id, v_accountant_user_id, 'Sara Accountant', '03021234567', 'Accountant', 'MONTHLY', 60000, v_start - 130, '37405-2222222-2', 'Islamabad', TRUE, TRUE, v_owner_id),
  (v_business_id, NULL, 'Kashif Inventory Helper', '03031234567', 'Inventory Helper', 'MONTHLY', 38000, v_start - 90, '37405-3333333-3', 'Rawalpindi', FALSE, TRUE, v_owner_id),
  (v_business_id, NULL, 'Nabeel Repair Technician', '03041234567', 'Repair Technician', 'MONTHLY', 55000, v_start - 180, '37405-4444444-4', 'Rawalpindi', FALSE, TRUE, v_owner_id);

  SELECT array_agg(staff_member_id ORDER BY staff_member_id) INTO v_staff_ids FROM staff_members WHERE business_id=v_business_id;
  FOREACH v_staff_id IN ARRAY v_staff_ids LOOP
    FOR i IN 0..29 LOOP
      INSERT INTO attendance_records(business_id, staff_member_id, attendance_date, status, check_in_time, check_out_time, overtime_hours, notes, created_by)
      VALUES(v_business_id, v_staff_id, v_start + i,
             CASE WHEN EXTRACT(DOW FROM (v_start+i))=0 THEN 'LEAVE' WHEN (i + v_staff_id) % 13 = 0 THEN 'LATE' WHEN (i + v_staff_id) % 17 = 0 THEN 'HALF_DAY' ELSE 'PRESENT' END,
             CASE WHEN EXTRACT(DOW FROM (v_start+i))=0 THEN NULL ELSE TIME '10:00' END,
             CASE WHEN EXTRACT(DOW FROM (v_start+i))=0 THEN NULL ELSE TIME '20:00' END,
             CASE WHEN (i + v_staff_id) % 6 = 0 THEN 1.5 ELSE 0 END,
             'Demo attendance record', v_accountant_user_id)
      ON CONFLICT (business_id, staff_member_id, attendance_date) DO NOTHING;
    END LOOP;
  END LOOP;

  INSERT INTO payroll_runs(business_id, payroll_month, title, gross_amount, deduction_amount, net_amount, paid_amount, status, created_by)
  SELECT v_business_id, DATE_TRUNC('month', v_start)::DATE, 'Demo payroll for mobile shop month', SUM(salary_amount), 5000, SUM(salary_amount) - 5000, SUM(salary_amount) - 5000, 'PAID', v_accountant_user_id
  FROM staff_members WHERE business_id=v_business_id
  RETURNING payroll_run_id INTO v_payroll_run_id;

  INSERT INTO payroll_items(payroll_run_id, business_id, staff_member_id, basic_salary, overtime_amount, bonus_amount, advance_amount, deduction_amount, net_payable, paid_amount, status)
  SELECT v_payroll_run_id, v_business_id, staff_member_id, salary_amount, 2000, 1000, CASE WHEN full_name='Usman Salesman' THEN 5000 ELSE 0 END, 1250,
         salary_amount + 2000 + 1000 - CASE WHEN full_name='Usman Salesman' THEN 5000 ELSE 0 END - 1250,
         salary_amount + 2000 + 1000 - CASE WHEN full_name='Usman Salesman' THEN 5000 ELSE 0 END - 1250, 'PAID'
  FROM staff_members WHERE business_id=v_business_id;

  INSERT INTO cash_book_entries(business_id, financial_account_id, entry_date, entry_type, amount, title, description, reference_type, reference_id, created_by)
  SELECT v_business_id, v_bank_id, v_end::TIMESTAMPTZ + TIME '18:00', 'CASH_OUT', paid_amount, 'Salary paid', 'Monthly payroll paid from bank', 'PAYROLL_RUN', v_payroll_run_id, v_accountant_user_id
  FROM payroll_runs WHERE payroll_run_id=v_payroll_run_id;

  -- Cheques
  INSERT INTO cheque_records(business_id, party_type, customer_id, supplier_id, cheque_no, bank_name, amount, cheque_date, status, notes, created_by)
  VALUES
  (v_business_id, 'CUSTOMER', v_customer_ids[2], NULL, 'CHQ-778801', 'HBL', 45000, v_start + 8, 'CLEARED', 'Customer cheque cleared', v_accountant_user_id),
  (v_business_id, 'CUSTOMER', v_customer_ids[5], NULL, 'CHQ-778802', 'Meezan Bank', 68000, v_start + 16, 'PENDING', 'Pending customer cheque', v_accountant_user_id),
  (v_business_id, 'SUPPLIER', NULL, v_supplier_ids[1], 'CHQ-778803', 'UBL', 95000, v_start + 20, 'PENDING', 'Cheque issued to supplier', v_accountant_user_id),
  (v_business_id, 'CUSTOMER', v_customer_ids[8], NULL, 'CHQ-778804', 'Bank Alfalah', 30000, v_start + 23, 'BOUNCED', 'Demo bounced cheque record', v_accountant_user_id);

  -- Reminders and notifications
  INSERT INTO reminders(business_id, customer_id, supplier_id, reminder_type, title, description, reminder_datetime, reminder_status, reference_type, created_by)
  VALUES
  (v_business_id, v_customer_ids[2], NULL, 'PAYMENT_DUE', 'Payment reminder - Ahmed Mobile Reseller', 'Follow up for pending khata balance', v_end + INTERVAL '1 day 11 hours', 'PENDING', 'CUSTOMER_LEDGER', v_salesman_user_id),
  (v_business_id, v_customer_ids[5], NULL, 'PAYMENT_DUE', 'Payment reminder - Ayesha Electronics', 'Large customer balance reminder', v_end + INTERVAL '2 days 12 hours', 'PENDING', 'CUSTOMER_LEDGER', v_salesman_user_id),
  (v_business_id, NULL, v_supplier_ids[1], 'GENERAL', 'Supplier payment planning', 'Plan next supplier payment', v_end + INTERVAL '3 days 10 hours', 'PENDING', 'SUPPLIER_LEDGER', v_accountant_user_id),
  (v_business_id, NULL, NULL, 'LOW_STOCK', 'Low stock check', 'Review low stock mobile accessories', v_end + INTERVAL '1 day 17 hours', 'PENDING', 'STOCK', v_owner_id),
  (v_business_id, v_customer_ids[8], NULL, 'CHEQUE', 'Bounced cheque follow-up', 'Contact customer regarding bounced cheque', v_end + INTERVAL '1 day 14 hours', 'PENDING', 'CHEQUE', v_accountant_user_id);

  INSERT INTO notifications(business_id, user_id, title, message, notification_type, reference_type, is_read, created_at)
  VALUES
  (v_business_id, v_owner_id, 'Demo data loaded', 'Mobile shop demo data for one month is ready.', 'SYSTEM', 'DEMO', FALSE, NOW()),
  (v_business_id, v_owner_id, 'Low stock alert', 'Some accessories are near low stock level.', 'LOW_STOCK', 'PRODUCT', FALSE, NOW()),
  (v_business_id, v_accountant_user_id, 'Pending cheques', 'There are pending cheques to review.', 'CHEQUE', 'CHEQUE_RECORD', FALSE, NOW()),
  (v_business_id, v_salesman_user_id, 'Payment reminders', 'Customer payment follow-ups are pending.', 'REMINDER', 'CUSTOMER_LEDGER', FALSE, NOW());

  INSERT INTO support_tickets(business_id, user_id, subject, message, status, priority, created_at)
  VALUES
  (v_business_id, v_owner_id, 'Need WhatsApp invoice template setup', 'Please configure branded WhatsApp invoice message for mobile shop.', 'OPEN', 'NORMAL', v_start + INTERVAL '18 days'),
  (v_business_id, v_accountant_user_id, 'Excel export testing', 'Need to test inventory export after demo data load.', 'IN_PROGRESS', 'LOW', v_start + INTERVAL '24 days');

  INSERT INTO backup_export_requests(business_id, export_type, status, requested_by, requested_at, completed_at, notes)
  VALUES(v_business_id, 'ALL', 'COMPLETED', v_owner_id, v_end::TIMESTAMPTZ + TIME '09:00', v_end::TIMESTAMPTZ + TIME '09:05', 'Demo backup/export request completed');

  INSERT INTO business_whatsapp_settings(business_id, provider, api_url, api_key, sender_phone, is_active)
  VALUES(v_business_id, 'custom', 'https://example-whatsapp-provider.test/send', 'demo-api-key-123456', '923001234567', TRUE)
  ON CONFLICT (business_id) DO UPDATE SET provider=EXCLUDED.provider, api_url=EXCLUDED.api_url, api_key=EXCLUDED.api_key, sender_phone=EXCLUDED.sender_phone, is_active=TRUE;

  -- Subscription and billing history
  INSERT INTO business_subscriptions(business_id, plan_id, start_date, end_date, subscription_status, is_trial, auto_renew)
  VALUES(v_business_id, v_plan_id, v_start, v_start + INTERVAL '90 days', 'ACTIVE', FALSE, TRUE)
  RETURNING business_subscription_id INTO v_sub_id;

  INSERT INTO subscription_payments(business_subscription_id, business_id, amount, currency_code, payment_method, transaction_reference, payment_status, paid_at, approved_by, approved_at)
  VALUES(v_sub_id, v_business_id, 3000, 'PKR', 'Bank Transfer', 'DEMO-SUB-' || TO_CHAR(NOW(), 'YYYYMMDDHH24MISS'), 'APPROVED', NOW(), v_owner_id, NOW());

  -- Audit logs
  INSERT INTO audit_logs(business_id, user_id, action_name, entity_name, entity_id, old_values, new_values, ip_address, user_agent, created_at)
  VALUES
  (v_business_id, v_owner_id, 'DEMO_DATA_SEEDED', 'Business', v_business_id, NULL, jsonb_build_object('business','Smart Mobile Center Demo','currency','PKR','period_start',v_start,'period_end',v_end), '127.0.0.1', 'Railway SQL Console', NOW()),
  (v_business_id, v_salesman_user_id, 'SALE_INVOICE_CREATED', 'SalesInvoice', NULL, NULL, jsonb_build_object('count',60), '127.0.0.1', 'Demo Seed', NOW()),
  (v_business_id, v_accountant_user_id, 'PAYROLL_POSTED', 'PayrollRun', v_payroll_run_id, NULL, jsonb_build_object('status','PAID'), '127.0.0.1', 'Demo Seed', NOW());

  -- Recalculate final account balances from cash book after all cash in/out.
  UPDATE financial_accounts fa
  SET current_balance = fa.opening_balance + COALESCE((
    SELECT SUM(CASE
      WHEN cbe.entry_type IN ('CASH_IN','TRANSFER_IN') THEN cbe.amount
      WHEN cbe.entry_type IN ('CASH_OUT','TRANSFER_OUT') THEN -cbe.amount
      ELSE 0
    END)
    FROM cash_book_entries cbe
    WHERE cbe.financial_account_id = fa.financial_account_id
      AND cbe.business_id = v_business_id
      AND cbe.is_deleted = FALSE
  ), 0)
  WHERE fa.business_id = v_business_id;

  -- Final safety recalculation for product stock table from product current stock.
  UPDATE product_stock ps
  SET current_qty = p.current_stock, updated_at = NOW()
  FROM products p
  WHERE p.product_id=ps.product_id AND ps.business_id=v_business_id;

  RAISE NOTICE 'Smart Khata mobile shop demo data inserted. Login: demo.owner@smartkhata.pk / Demo@12345. Business ID: %, Period: % to %', v_business_id, v_start, v_end;
END $$;

COMMIT;

-- Quick verification queries
SELECT b.business_name, b.currency_code, b.city, u.email AS owner_email
FROM businesses b
JOIN app_users u ON u.user_id = b.owner_user_id
WHERE b.business_name = 'Smart Mobile Center Demo';

SELECT
  (SELECT COUNT(*) FROM customers c JOIN businesses b ON b.business_id=c.business_id WHERE b.business_name='Smart Mobile Center Demo') AS customers,
  (SELECT COUNT(*) FROM suppliers s JOIN businesses b ON b.business_id=s.business_id WHERE b.business_name='Smart Mobile Center Demo') AS suppliers,
  (SELECT COUNT(*) FROM products p JOIN businesses b ON b.business_id=p.business_id WHERE b.business_name='Smart Mobile Center Demo') AS products,
  (SELECT COUNT(*) FROM sales_invoices si JOIN businesses b ON b.business_id=si.business_id WHERE b.business_name='Smart Mobile Center Demo') AS sales_invoices,
  (SELECT COUNT(*) FROM purchase_bills pb JOIN businesses b ON b.business_id=pb.business_id WHERE b.business_name='Smart Mobile Center Demo') AS purchase_bills,
  (SELECT COUNT(*) FROM expenses e JOIN businesses b ON b.business_id=e.business_id WHERE b.business_name='Smart Mobile Center Demo') AS expenses,
  (SELECT COUNT(*) FROM attendance_records ar JOIN businesses b ON b.business_id=ar.business_id WHERE b.business_name='Smart Mobile Center Demo') AS attendance_records;
