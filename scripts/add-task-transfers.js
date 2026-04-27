const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function runMigration() {
  const connectionString =
    process.env.DATABASE_URL ||
    `postgresql://${process.env.DB_USERNAME}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_DATABASE}`;

  const client = new Client({
    connectionString,
    ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
  });

  try {
    await client.connect();
    console.log('[migrate:task-transfers] Connected to database');

    const sql = fs.readFileSync(
      path.join(__dirname, '../migrations/add-task-transfers.sql'),
      'utf8',
    );

    await client.query(sql);
    console.log('[migrate:task-transfers] Migration completed successfully');
  } catch (error) {
    console.error('[migrate:task-transfers] Migration failed:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigration();
