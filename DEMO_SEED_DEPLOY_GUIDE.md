# Smart Khata Demo Data Auto Seed Guide

This API package includes automatic demo data seeding for a PKR mobile shop.

## What was added

- `seeds/mobile_shop_demo_seed.sql`
- `scripts/seed-mobile-shop-demo.js`
- `scripts/setup-db.js`
- package scripts:
  - `npm run db:seed:demo`
  - `npm run db:setup`
  - `npm run db:setup:demo`

## Railway automatic deploy behavior

`railway.json` is configured with:

```json
"preDeployCommand": "npm run db:setup:demo"
```

This means Railway will run migrations first and then insert the mobile-shop demo data automatically before starting the API.

## Demo login

```text
Email: demo.owner@smartkhata.pk
Password: Demo@12345
Business: Smart Mobile Center Demo
Currency: PKR
```

Staff users:

```text
demo.salesman@smartkhata.pk / Demo@12345
demo.accountant@smartkhata.pk / Demo@12345
```

## Important safety note

The demo seed is re-run safe, but it resets only this demo business and demo users:

- Smart Mobile Center Demo
- demo.owner@smartkhata.pk
- demo.salesman@smartkhata.pk
- demo.accountant@smartkhata.pk

When you want to stop automatic demo reseeding, change `railway.json` back to:

```json
"preDeployCommand": "npm run db:migrate"
```

or use:

```json
"preDeployCommand": "npm run db:setup"
```

and set Railway variable `DEMO_SEED_ENABLED=false`.
