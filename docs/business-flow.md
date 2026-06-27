# Smart Khata Business Flow

## Signup and business creation

1. Create app user.
2. Create business.
3. Insert owner into `business_users` with role `OWNER`.
4. Insert default `business_settings`.
5. Insert default `document_sequences`:
   - SALE_INVOICE / INV
   - QUOTATION / QT
   - PURCHASE_BILL / PUR
6. Create default warehouse.
7. Start trial or subscription record.

## Sales invoice creation

Use one backend transaction.

1. Generate invoice number using `next_document_no(business_id, 'SALE_INVOICE')`.
2. Insert `sales_invoices`.
3. Insert `sales_invoice_items`.
4. For product items, reduce `products.current_stock` and `product_stock.current_qty`.
5. Insert `inventory_transactions` with type `SALE`.
6. Insert `customer_ledger` debit entry.
7. If payment received, insert `payments_received`.
8. Insert `payment_allocations`.
9. Insert `customer_ledger` credit entry.
10. Update `customers.current_balance`.
11. Update invoice paid/balance/payment status.
12. Generate PDF and update `pdf_url`.

## Payment received

Use one backend transaction.

1. Insert `payments_received`.
2. Allocate payment to selected/open invoices in `payment_allocations`.
3. Update invoices paid/balance/status.
4. Insert `customer_ledger` credit entry.
5. Update `customers.current_balance`.

## Purchase bill

Use one backend transaction.

1. Generate purchase number.
2. Insert `purchase_bills`.
3. Insert `purchase_bill_items`.
4. Increase product stock.
5. Insert `inventory_transactions` with type `PURCHASE`.
6. Insert `supplier_ledger` entry.
7. Update `suppliers.current_balance`.

## WhatsApp invoice sharing

1. Generate invoice PDF.
2. Open native WhatsApp share from Android app.
3. Insert log in `whatsapp_share_logs`.
