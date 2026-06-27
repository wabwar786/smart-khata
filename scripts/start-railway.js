require('dotenv').config();

const { spawn } = require('child_process');
const app = require('../src/app');
const { env } = require('../src/config/env');
const { pool } = require('../src/db');

let dbSetupStatus = 'pending';
let dbSetupStartedAt = null;
let dbSetupFinishedAt = null;

function runDbSetupInBackground() {
  dbSetupStartedAt = new Date().toISOString();
  dbSetupStatus = 'running';
  console.log('[startup] Starting database migrations + demo seed in background...');

  const child = spawn(process.execPath, ['scripts/setup-db.js'], {
    cwd: process.cwd(),
    env: { ...process.env, DEMO_SEED_ENABLED: process.env.DEMO_SEED_ENABLED || 'true' },
    stdio: 'inherit',
  });

  child.on('exit', (code) => {
    dbSetupFinishedAt = new Date().toISOString();
    if (code === 0) {
      dbSetupStatus = 'completed';
      console.log('[startup] Database migrations + demo seed completed successfully.');
    } else {
      dbSetupStatus = `failed:${code}`;
      console.error(`[startup] Database setup failed with exit code ${code}. API is still running so Railway healthcheck can pass. Check logs above.`);
    }
  });
}

app.get('/startup-status', (req, res) => {
  res.json({
    success: true,
    status: 'running',
    dbSetupStatus,
    dbSetupStartedAt,
    dbSetupFinishedAt,
  });
});

const host = '0.0.0.0';
const server = app.listen(env.PORT, host, () => {
  console.log(`Smart Khata API listening on ${host}:${env.PORT}`);
  console.log('[startup] /health is available. Railway healthcheck should pass now.');
  setTimeout(runDbSetupInBackground, 1000);
});

async function shutdown(signal) {
  console.log(`${signal} received. Closing server...`);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
