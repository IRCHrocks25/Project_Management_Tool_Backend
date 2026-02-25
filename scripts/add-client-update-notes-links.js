// Script to add notes and links columns to client_updates table
// Run with: node scripts/add-client-update-notes-links.js
// Or: npm run migrate:client-update-notes-links

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function runMigration() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL || 
      `postgresql://${process.env.DB_USERNAME || 'postgres'}:${process.env.DB_PASSWORD || 'postgres'}@${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || 5432}/${process.env.DB_DATABASE || 'katalyst_pm'}`,
    ssl: process.env.DATABASE_URL && (
      process.env.DATABASE_URL.includes('railway') || 
      process.env.DATABASE_URL.includes('sslmode=require') ||
      process.env.DATABASE_URL.includes('trolley.proxy.rlwy.net')
    ) ? { rejectUnauthorized: false } : false,
  });

  try {
    await client.connect();
    console.log('✅ Connected to database');

    // Check if columns already exist
    const checkQuery = `
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'client_updates' 
      AND column_name IN ('notes', 'links');
    `;
    
    const checkResult = await client.query(checkQuery);
    const existingColumns = checkResult.rows.map(row => row.column_name);
    
    if (existingColumns.length > 0) {
      console.log(`⚠️  Some columns already exist: ${existingColumns.join(', ')}`);
      console.log('🔄 Running migration anyway (ADD COLUMN IF NOT EXISTS will skip existing columns)...');
    }

    // Read SQL file
    const sqlPath = path.join(__dirname, '../migrations/add-client-update-notes-links.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    // Run migration
    console.log('🔄 Adding notes and links columns to client_updates table...');
    await client.query(sql);
    
    console.log('✅ Migration completed successfully!');
    console.log('📋 Added columns to client_updates table:');
    console.log('   - notes (TEXT)');
    console.log('   - links (TEXT)');
    
    await client.end();
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error(error);
    await client.end();
    process.exit(1);
  }
}

runMigration();

