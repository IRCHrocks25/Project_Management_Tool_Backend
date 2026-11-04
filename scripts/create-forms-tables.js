// Creates the Forms tables by running every migrations/forms-*.sql file in order.
// Every file is idempotent, so it is safe to run again after adding a new one.
// Run with: node scripts/create-forms-tables.js
// Or: npm run migrate:forms

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function runMigration() {
  const connectionString =
    process.env.DATABASE_URL ||
    `postgresql://${process.env.DB_USERNAME || 'postgres'}:${process.env.DB_PASSWORD || 'postgres'}@${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || 5432}/${process.env.DB_DATABASE || 'katalyst_pm'}`;
  const client = new Client({
    connectionString,
    ssl:
      process.env.DATABASE_URL &&
      (process.env.DATABASE_URL.includes('railway') ||
        process.env.DATABASE_URL.includes('sslmode=require') ||
        process.env.DATABASE_URL.includes('trolley.proxy.rlwy.net'))
        ? { rejectUnauthorized: false }
        : false,
  });

  const dir = path.join(__dirname, '../migrations');
  const files = fs
    .readdirSync(dir)
    .filter((f) => /^forms-\d+.*\.sql$/.test(f))
    .sort();

  try {
    await client.connect();
    console.log(`[migrate:forms] Connected to ${new URL(connectionString).hostname}`);
    for (const file of files) {
      await client.query(fs.readFileSync(path.join(dir, file), 'utf8'));
      console.log(`[migrate:forms] Applied ${file}`);
    }
    console.log('[migrate:forms] Migration completed successfully');
  } catch (error) {
    console.error('[migrate:forms] Migration failed:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigration();
