const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
require('dotenv').config();

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is missing. Configure it in Railway Variables.');
  process.exit(1);
}

const client = new Client({
  connectionString: databaseUrl,
  ssl: process.env.PGSSLMODE === 'require' ? { rejectUnauthorized: false } : undefined,
});

async function main() {
  const seedPath = path.join(__dirname, '..', 'seeds', 'mobile_shop_demo_seed.sql');
  if (!fs.existsSync(seedPath)) {
    console.error(`Seed file not found: ${seedPath}`);
    process.exit(1);
  }

  const sql = fs.readFileSync(seedPath, 'utf8');
  await client.connect();
  console.log('Seeding Smart Mobile Center Demo data...');
  try {
    await client.query(sql);
    console.log('Demo seed completed.');
    console.log('Demo login: demo.owner@smartkhata.pk / Demo@12345');
  } finally {
    await client.end();
  }
}

main().catch(async (error) => {
  console.error('Demo seed failed.');
  console.error(error.message);
  try { await client.end(); } catch (_) {}
  process.exit(1);
});
