// Script to create tickets table
// Run with: node scripts/create-tickets-table.js
// Or: npm run migrate:tickets

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function runMigration() {
  const client = new Client({
    connectionString:
      process.env.DATABASE_URL ||
      `postgresql://${process.env.DB_USERNAME || 'postgres'}:${process.env.DB_PASSWORD || 'postgres'}@${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || 5432}/${process.env.DB_DATABASE || 'katalyst_pm'}`,
    ssl:
      process.env.DATABASE_URL &&
      (process.env.DATABASE_URL.includes('railway') ||
        process.env.DATABASE_URL.includes('sslmode=require') ||
        process.env.DATABASE_URL.includes('trolley.proxy.rlwy.net'))
        ? { rejectUnauthorized: false }
        : false,
  });

  try {
    await client.connect();
    console.log('[migrate:tickets] Connected to database');

    const sql = fs.readFileSync(
      path.join(__dirname, '../migrations/create-tickets-table.sql'),
      'utf8'
    );

    await client.query(sql);
    console.log('[migrate:tickets] Migration completed successfully');
  } catch (error) {
    console.error('[migrate:tickets] Migration failed:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigration();
