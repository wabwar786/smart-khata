const bcrypt = require('bcryptjs');
const { Client } = require('pg');
require('dotenv').config();

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is missing.');

  const fullName = process.env.SUPER_ADMIN_NAME || 'Smart Khata Admin';
  const email = (process.env.SUPER_ADMIN_EMAIL || '').toLowerCase().trim() || null;
  const phone = process.env.SUPER_ADMIN_PHONE || null;
  const password = process.env.SUPER_ADMIN_PASSWORD || '';

  if (!email && !phone) throw new Error('Set SUPER_ADMIN_EMAIL or SUPER_ADMIN_PHONE.');
  if (password.length < 8) throw new Error('SUPER_ADMIN_PASSWORD must be at least 8 characters.');

  const client = new Client({
    connectionString: databaseUrl,
    ssl: process.env.PGSSLMODE === 'require' ? { rejectUnauthorized: false } : undefined,
  });
  await client.connect();
  const passwordHash = await bcrypt.hash(password, 12);

  const existing = await client.query(
    `SELECT user_id FROM app_users
     WHERE is_deleted=FALSE AND (($1::TEXT IS NOT NULL AND LOWER(email)=$1) OR ($2::TEXT IS NOT NULL AND phone_number=$2))
     LIMIT 1`,
    [email, phone]
  );

  let result;
  if (existing.rowCount > 0) {
    result = await client.query(
      `UPDATE app_users
       SET full_name=$2, email=COALESCE($3,email), phone_number=COALESCE($4,phone_number), password_hash=$5,
           is_super_admin=TRUE, is_support_admin=TRUE, is_active=TRUE, is_email_verified=TRUE, is_phone_verified=TRUE
       WHERE user_id=$1
       RETURNING public_id, email, phone_number`,
      [existing.rows[0].user_id, fullName, email, phone, passwordHash]
    );
  } else {
    result = await client.query(
      `INSERT INTO app_users(full_name, email, phone_number, password_hash, is_super_admin, is_support_admin, is_active, is_email_verified, is_phone_verified)
       VALUES($1,$2,$3,$4,TRUE,TRUE,TRUE,TRUE,TRUE)
       RETURNING public_id, email, phone_number`,
      [fullName, email, phone, passwordHash]
    );
  }

  console.log('Super admin ready:', result.rows[0]);
  await client.end();
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
