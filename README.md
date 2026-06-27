# Smart Khata Database

PostgreSQL database migrations for the Smart Khata accounting SaaS app.

This schema is designed for:

- Android app + web admin panel
- Multi-business accounts
- Multi-user/staff per business
- Customer ledger / khata
- Sales invoices
- Payments and allocations
- PDF/WhatsApp invoice sharing logs
- Quotations
- Inventory and stock transactions
- Purchases and suppliers
- Expenses
- Reminders
- Subscription control
- Super admin control

## Recommended Railway setup

Use this project with a Railway PostgreSQL database service.

Railway provides PostgreSQL database services and exposes connection variables to your services. Use `DATABASE_URL` as the PostgreSQL connection string.

## Local setup

```bash
npm install
cp .env.example .env
# Add DATABASE_URL in .env
npm run db:migrate
```

## Railway CLI setup

```bash
npm install
railway login
railway link
railway run npm run db:migrate
```

`railway run` injects your Railway service variables into the command, including `DATABASE_URL` when configured.

## Railway pre-deploy setup

For your backend API service, you can set this as the pre-deploy command:

```bash
npm run db:migrate
```

Pre-deploy migration is useful because it runs before the application starts and has access to Railway environment variables.

## Migration files

```text
migrations/001_init_schema.sql
migrations/002_seed_default_data.sql
```

The migration runner creates a `schema_migrations` table and only applies each SQL file once.

## Important backend rule

Do not connect the Flutter app directly to PostgreSQL. Use this flow:

```text
Flutter Android App -> Backend API -> PostgreSQL
Super Admin Web Panel -> Backend API -> PostgreSQL
```

## Important multi-business rule

Almost all business data tables have `business_id`. Always filter by `business_id` in APIs so one business cannot see another business's data.

## Important transaction rule

For invoice/payment/stock operations, use database transactions in the backend API:

- Create sales invoice
- Insert invoice items
- Reduce stock
- Add inventory transaction
- Add customer ledger debit
- Insert received payment if any
- Allocate payment to invoice
- Add customer ledger credit
- Update balances

All steps must succeed or all must roll back.
