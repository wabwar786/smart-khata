# Railway Healthcheck Fix

Railway was running `npm run start:railway`, but the old command executed migrations and the demo seed before starting the API server. During that time `/health` was unavailable, so Railway healthcheck failed.

This package changes `start:railway` to:

```bash
node scripts/start-railway.js
```

The new startup script:

1. Starts the Express API immediately on `0.0.0.0:$PORT`.
2. Makes `/health` available immediately.
3. Runs migrations and the demo mobile-shop seed in the background.
4. Adds `/startup-status` so you can check seed progress.

## After deploy

Open:

```text
https://smart-khata-production.up.railway.app/health
```

Then check:

```text
https://smart-khata-production.up.railway.app/startup-status
```

Expected statuses:

- `running` = migrations/seed still running
- `completed` = demo data added
- `failed:<code>` = API is live but DB setup failed; check Railway logs

## Demo login

```text
Email: demo.owner@smartkhata.pk
Password: Demo@12345
Business: Smart Mobile Center Demo
Currency: PKR
```

To disable automatic demo seed later, add Railway variable:

```text
DEMO_SEED_ENABLED=false
```
