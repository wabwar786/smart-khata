# Smart Khata API

Backend API for Smart Khata accounting SaaS app.

This API is designed for:

- Flutter Android app
- Web Super Admin Panel
- Railway deployment
- PostgreSQL database
- Multi-business accounts
- Multi-user business roles
- Customer ledger / khata
- Sales invoices
- Payments
- Products and inventory
- Quotations
- Reminders
- Subscription control

## Tech stack

- Node.js 18+
- Express
- PostgreSQL
- JWT authentication
- Railway-ready deployment

## Railway deployment

Create one Railway project with:

1. PostgreSQL service
2. API service from this GitHub repo

In the API service variables, add:

```text
DATABASE_URL=${{Postgres.DATABASE_URL}}
JWT_SECRET=your-long-random-secret
NODE_ENV=production
CORS_ORIGIN=*
```

If your database service name is not `Postgres`, use your actual Railway service name.

The included `railway.json` runs:

```bash
npm run db:migrate
npm start
```

The API health URL is:

```text
/health
```

## Local setup

```bash
npm install
cp .env.example .env
# add DATABASE_URL and JWT_SECRET
npm run db:migrate
npm run dev
```

## Create super admin

Set variables locally or in Railway shell:

```bash
SUPER_ADMIN_NAME="Smart Khata Admin"
SUPER_ADMIN_EMAIL="admin@example.com"
SUPER_ADMIN_PASSWORD="ChangeMe123!"
npm run create:admin
```

## Mobile app auth flow

1. `POST /api/auth/signup`
2. Save returned `token`
3. Save returned `business.publicId`
4. For business APIs, send headers:

```text
Authorization: Bearer YOUR_TOKEN
x-business-id: BUSINESS_PUBLIC_ID
```

## Main endpoints

### Auth

```text
POST /api/auth/signup
POST /api/auth/login
GET  /api/auth/me
GET  /api/auth/businesses
```

### Businesses

```text
GET  /api/businesses
POST /api/businesses
GET  /api/businesses/:businessPublicId
PUT  /api/businesses/settings/current
```

### Customers

```text
GET    /api/customers
POST   /api/customers
GET    /api/customers/:publicId
PUT    /api/customers/:publicId
DELETE /api/customers/:publicId
GET    /api/customers/:publicId/ledger
```

### Products

```text
GET  /api/products/units
GET  /api/products/categories
POST /api/products/categories
GET  /api/products
POST /api/products
GET  /api/products/:publicId
PUT  /api/products/:publicId
DELETE /api/products/:publicId
POST /api/products/:publicId/stock-adjustment
```

### Sales invoices

```text
GET  /api/sales-invoices
POST /api/sales-invoices
GET  /api/sales-invoices/:publicId
POST /api/sales-invoices/:publicId/cancel
```

### Payments

```text
GET  /api/payments
POST /api/payments
```

### Quotations

```text
GET   /api/quotations
POST  /api/quotations
GET   /api/quotations/:publicId
PATCH /api/quotations/:publicId/status
```

### Reminders

```text
GET   /api/reminders
POST  /api/reminders
PATCH /api/reminders/:publicId/status
```

### Subscription

```text
GET  /api/subscriptions/plans
GET  /api/subscriptions/current
POST /api/subscriptions/payment-request
```

### Dashboard

```text
GET /api/dashboard/summary
GET /api/dashboard/sales-daily?days=30
```

### Super Admin

```text
GET   /api/admin/dashboard
GET   /api/admin/businesses
PATCH /api/admin/businesses/:publicId/block
GET   /api/admin/subscription-payments
POST  /api/admin/subscription-payments/:id/approve
POST  /api/admin/subscription-payments/:id/reject
```

## Example signup request

```json
{
  "fullName": "Ahmed Khan",
  "email": "ahmed@example.com",
  "phoneNumber": "03001234567",
  "password": "12345678",
  "businessName": "Ahmed Mobile Shop",
  "businessType": "Mobile Shop",
  "city": "Islamabad"
}
```

## Example invoice request

```json
{
  "customerPublicId": "CUSTOMER_UUID",
  "items": [
    {
      "productPublicId": "PRODUCT_UUID",
      "qty": 2,
      "unitPrice": 1500,
      "discountAmount": 0,
      "taxPercent": 0
    }
  ],
  "paidAmount": 1000,
  "paymentMethod": "Cash"
}
```

## Security notes

- Do not connect Flutter directly to PostgreSQL.
- Use this API only over HTTPS.
- Keep `JWT_SECRET` private.
- Use `x-business-id` to isolate each business.
- All SQL queries are parameterized.
