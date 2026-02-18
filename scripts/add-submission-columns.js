// Quick script to add submission columns to tasks table
// Run with: node scripts/add-submission-columns.js

const { Client } = require('pg');
require('dotenv').config();

async function addColumns() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL || {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      user: process.env.DB_USERNAME || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      database: process.env.DB_DATABASE || 'katalyst_pm',
    },
    ssl: process.env.DATABASE_URL && (process.env.DATABASE_URL.includes('railway') || process.env.DATABASE_URL.includes('trolley.proxy.rlwy.net'))
      ? { rejectUnauthorized: false }
      : false,
  });

  try {
    await client.connect();
    console.log('Connected to database');

    // Add submissionData column
    await client.query(`
      ALTER TABLE tasks 
      ADD COLUMN IF NOT EXISTS "submissionData" TEXT;
    `);
    console.log('✓ Added submissionData column');

    // Add submissionType column
    await client.query(`
      ALTER TABLE tasks 
      ADD COLUMN IF NOT EXISTS "submissionType" TEXT;
    `);
    console.log('✓ Added submissionType column');

    console.log('\n✅ Migration completed successfully!');
  } catch (error) {
    console.error('❌ Error running migration:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

addColumns();

