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
    console.log('[migrate:eod-report-snapshots] Connected to database');

    const sql = fs.readFileSync(
      path.join(__dirname, '../migrations/create-eod-report-snapshots.sql'),
      'utf8'
    );

    await client.query(sql);
    console.log('[migrate:eod-report-snapshots] Migration completed successfully');
  } catch (error) {
    console.error('[migrate:eod-report-snapshots] Migration failed:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigration();

