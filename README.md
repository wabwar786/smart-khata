# Smart Khata API - Enhanced Admin Version

Railway-ready Node.js/Express API for Smart Khata.

## Important update

This version adds the enhanced Super Admin API:

- Edit any business details
- Create business + owner/admin user + subscription in one step
- Create super users
- Block/unblock any user
- Block/unblock any business
- Attach/update business subscriptions
- Near-expiry businesses
- Business overview/performance
- Business customers, products, sales, inventory, users, billing history
- WhatsApp API settings per business
- Subscription payment approval/rejection

## Deploy update on Railway

Push this repo to your existing `smart-khata` API GitHub repo. Railway will run:

```bash
npm run db:migrate
npm start
```

Migration `004_admin_portal_features.sql` creates `business_whatsapp_settings`.

Required Railway variables:

```text
DATABASE_URL=${{Postgres.DATABASE_URL}}
JWT_SECRET=your-long-random-secret
NODE_ENV=production
CORS_ORIGIN=*
```

## Test

```text
GET /health
GET /api/admin/dashboard
```

Use a super admin JWT token for `/api/admin/*` routes.
