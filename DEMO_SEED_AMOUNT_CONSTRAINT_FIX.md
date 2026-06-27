# Demo Seed Amount Constraint Fix

Railway log error fixed:

```text
new row for relation "sales_invoices" violates check constraint "ck_sales_invoices_amounts"
```

Cause:
Some small accessory invoices had subtotal around Rs. 900 while the demo generator sometimes applied a fixed Rs. 1000 discount. This created negative `grand_total`, `paid_amount`, and `balance_amount`, so PostgreSQL rejected the invoice.

Fix:
The mobile shop demo seed now caps invoice discounts to a maximum of 10% of the subtotal and clamps paid/balance values so all sales invoices satisfy:

```sql
sub_total >= 0
AND discount_amount >= 0
AND tax_amount >= 0
AND grand_total >= 0
AND paid_amount >= 0
AND balance_amount >= 0
```

Deploy this package to Railway. The seed should complete and create:

```text
Business: Smart Mobile Center Demo
Currency: PKR
Login: demo.owner@smartkhata.pk / Demo@12345
```
