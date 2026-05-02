const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function runMigration() {
  const client = new Client({
    connectionString:
      process.env.DATABASE_URL ||
      `postgresql://${process.env.DB_USERNAME}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_DATABASE}`,
  });

  try {
    await client.connect();
    console.log('[migrate:user-email-notifications-enabled] Connected to database');

    const sql = fs.readFileSync(
      path.join(__dirname, '../migrations/add-user-email-notifications-enabled.sql'),
      'utf8',
    );

    await client.query(sql);
    console.log('[migrate:user-email-notifications-enabled] Migration completed successfully');
  } catch (error) {
    console.error('[migrate:user-email-notifications-enabled] Migration failed:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigration();
