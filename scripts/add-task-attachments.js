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
    console.log('[migrate:task-attachments] Connected to database');

    const sql = fs.readFileSync(
      path.join(__dirname, '../migrations/add-task-attachments.sql'),
      'utf8',
    );

    await client.query(sql);
    console.log('[migrate:task-attachments] Migration completed successfully');

    // Report how many rows were backfilled
    const { rows } = await client.query(
      `SELECT COUNT(*) AS count FROM task_attachments WHERE "cloudinaryPublicId" IS NULL`,
    );
    console.log(`[migrate:task-attachments] Backfilled ${rows[0].count} legacy fileUrl row(s)`);
  } catch (error) {
    console.error('[migrate:task-attachments] Migration failed:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigration();
