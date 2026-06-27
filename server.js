require('dotenv').config();
const app = require('./src/app');
const { env } = require('./src/config/env');
const { pool } = require('./src/db');

const server = app.listen(env.PORT, () => {
  console.log(`Smart Khata API listening on port ${env.PORT}`);
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
