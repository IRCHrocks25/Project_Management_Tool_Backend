// Quick script to add landingPageRevisionCount column to projects table
// Run with: node scripts/add-landing-page-revision-count.js

const { Client } = require('pg');
require('dotenv').config();

async function addLandingPageRevisionCount() {
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

    // Add landingPageRevisionCount column
    await client.query(`
      ALTER TABLE projects 
      ADD COLUMN IF NOT EXISTS "landingPageRevisionCount" INTEGER DEFAULT 0;
    `);
    console.log('✓ Added landingPageRevisionCount column to projects');

    // Set default values for existing rows
    await client.query(`
      UPDATE projects 
      SET "landingPageRevisionCount" = 0 
      WHERE "landingPageRevisionCount" IS NULL;
    `);
    console.log('✓ Set default landingPageRevisionCount values for existing projects');

    console.log('\n✅ Landing page revision count migration completed successfully!');
  } catch (error) {
    console.error('❌ Error running migration:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

addLandingPageRevisionCount();

