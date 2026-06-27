# Railway Auto Demo Seed Fix

This package uses a guaranteed Railway start command:

```bash
npm run start:railway
```

That command runs:

```bash
npm run db:migrate
npm run db:seed:demo
node server.js
```

Why: Railway logs showed only `npm start`, so the previous `preDeployCommand` was not being applied in the deployment. This version moves the setup into the Railway start command so migrations and demo seed definitely run when the service starts.

Demo login after deploy:

```text
demo.owner@smartkhata.pk
Demo@12345
```

Important: every restart/deploy recreates only the demo business named `Smart Mobile Center Demo`. Real businesses are not deleted.

Later, to disable automatic seeding, change `railway.json` startCommand back to:

```json
"startCommand": "npm start"
```
