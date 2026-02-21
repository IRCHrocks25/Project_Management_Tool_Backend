// Quick script to add secondaryClientTypes column to projects table
// Run with: node scripts/add-secondary-client-types.js
// Or: npm run migrate:secondary-client-types

const { Client } = require('pg');
require('dotenv').config();

async function addSecondaryClientTypes() {
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

    // Check if column already exists
    const checkColumn = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'projects' AND column_name = 'secondaryClientTypes';
    `);

    if (checkColumn.rows.length > 0) {
      console.log('✓ secondaryClientTypes column already exists');
    } else {
      // Add secondaryClientTypes column as text (TypeORM simple-array stores as comma-separated text)
      await client.query(`
        ALTER TABLE projects 
        ADD COLUMN "secondaryClientTypes" TEXT;
      `);
      console.log('✓ Added secondaryClientTypes column to projects');
    }

    console.log('\n✅ Secondary client types migration completed successfully!');
  } catch (error) {
    console.error('❌ Error running migration:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

addSecondaryClientTypes();

