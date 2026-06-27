# Railway deploy fix: No start command detected

Railway deploys GitHub repositories as services. The first DB-only package contained migrations, but no long-running web process, so Railpack could not infer a start command.

This version fixes that by adding:

- `index.js` health/status server
- `package.json` start script: `npm start`
- `railway.json` config:
  - `startCommand`: `npm start`
  - `preDeployCommand`: `npm run db:migrate`
  - `healthcheckPath`: `/health`

## Railway variable needed

In the service variables, add or confirm:

```text
DATABASE_URL=${{Postgres.DATABASE_URL}}
```

Use the exact PostgreSQL service name from your Railway project. If your database service name is different, Railway will show the correct variable reference in the Variables tab.

## After pushing to GitHub

```bash
git add .
git commit -m "Fix Railway start command and migration deploy config"
git push
```

Railway will redeploy. During deploy it should run migrations first, then start the small health server.
