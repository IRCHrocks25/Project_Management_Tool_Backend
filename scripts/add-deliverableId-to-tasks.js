// Script to add deliverableId column to tasks table
// Run with: node scripts/add-deliverableId-to-tasks.js

const { Client } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function addDeliverableIdColumn() {
  const config = process.env.DATABASE_URL 
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: (process.env.DATABASE_URL.includes('railway') || process.env.DATABASE_URL.includes('trolley.proxy.rlwy.net'))
          ? { rejectUnauthorized: false }
          : false,
      }
    : {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432'),
        user: process.env.DB_USERNAME || 'postgres',
        password: process.env.DB_PASSWORD || 'postgres',
        database: process.env.DB_DATABASE || 'katalyst_pm',
      };
  
  const client = new Client(config);

  try {
    await client.connect();
    console.log('Connected to database');

    // Check if column already exists
    const columnCheck = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='tasks' AND column_name='deliverableId';
    `);

    if (columnCheck.rows.length > 0) {
      console.log('✓ deliverableId column already exists');
    } else {
      // Add the column
      await client.query(`
        ALTER TABLE tasks 
        ADD COLUMN "deliverableId" uuid;
      `);
      console.log('✓ Added deliverableId column to tasks table');
    }

    console.log('\n✅ Migration completed successfully!');
  } catch (error) {
    console.error('❌ Error running migration:', error.message);
    console.error('Full error:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

addDeliverableIdColumn();

