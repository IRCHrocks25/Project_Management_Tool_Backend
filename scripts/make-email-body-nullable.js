// Script to make email body column nullable
// Run with: node scripts/make-email-body-nullable.js

const { Client } = require('pg');
require('dotenv').config();

async function runMigration() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL || 
      `postgresql://${process.env.DB_USERNAME || 'postgres'}:${process.env.DB_PASSWORD || 'postgres'}@${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || 5432}/${process.env.DB_DATABASE || 'katalyst_pm'}`,
    ssl: process.env.DATABASE_URL && (
      process.env.DATABASE_URL.includes('railway') || 
      process.env.DATABASE_URL.includes('sslmode=require')
    ) ? { rejectUnauthorized: false } : false,
  });

  try {
    await client.connect();
    console.log('✅ Connected to database');

    // Check if column is already nullable
    const checkQuery = `
      SELECT is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'emails' 
      AND column_name = 'body';
    `;
    
    const checkResult = await client.query(checkQuery);
    
    if (checkResult.rows.length === 0) {
      console.log('❌ emails table or body column not found');
      process.exit(1);
    }

    if (checkResult.rows[0].is_nullable === 'YES') {
      console.log('✅ body column is already nullable. No migration needed.');
      await client.end();
      return;
    }

    // Run migration
    console.log('🔄 Making body column nullable...');
    await client.query(`
      ALTER TABLE emails 
      ALTER COLUMN body DROP NOT NULL;
    `);
    
    console.log('✅ Migration completed successfully!');
    await client.end();
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    await client.end();
    process.exit(1);
  }
}

runMigration();

