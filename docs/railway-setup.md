# Railway + GitHub Setup Guide

## 1. Create GitHub repository

```bash
git init
git add .
git commit -m "Initial Smart Khata PostgreSQL schema"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/smart-khata-db.git
git push -u origin main
```

## 2. Create Railway project

1. Open Railway dashboard.
2. Create a new project.
3. Add a PostgreSQL database service.
4. Add/deploy your backend API service from GitHub.
5. In the backend service variables, add:

```text
DATABASE_URL=${{Postgres.DATABASE_URL}}
```

The exact service name may be different if you renamed the PostgreSQL service.

## 3. Run migrations

Option A: Run from your computer using Railway CLI:

```bash
railway login
railway link
railway run npm install
railway run npm run db:migrate
```

Option B: Configure backend service pre-deploy command:

```bash
npm run db:migrate
```

## 4. Confirm tables

After migration, check Railway PostgreSQL data tab or connect using any PostgreSQL client and run:

```sql
SELECT version FROM schema_migrations ORDER BY applied_at;
SELECT COUNT(*) FROM roles;
SELECT COUNT(*) FROM permissions;
SELECT COUNT(*) FROM subscription_plans;
```

## 5. Backend connection

Your backend must read PostgreSQL connection from:

```text
DATABASE_URL
```

Do not hard-code username/password in source code.
