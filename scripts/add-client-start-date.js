// Quick script to add clientStartDate column to projects table
// Run with: node scripts/add-client-start-date.js

const { Client } = require('pg');
require('dotenv').config();

async function addClientStartDate() {
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

    // Add clientStartDate column
    await client.query(`
      ALTER TABLE projects 
      ADD COLUMN IF NOT EXISTS "clientStartDate" TIMESTAMP;
    `);
    console.log('✓ Added clientStartDate column to projects');

    console.log('\n✅ Client start date migration completed successfully!');
  } catch (error) {
    console.error('❌ Error running migration:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

addClientStartDate();

