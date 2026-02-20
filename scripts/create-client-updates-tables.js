// Script to create client-updates tables
// Run with: node scripts/create-client-updates-tables.js
// Or: npm run migrate:client-updates

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

    // Read SQL file
    const sqlPath = path.join(__dirname, '../migrations/create-client-updates-tables.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    // Check if tables already exist
    const checkQuery = `
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('client_updates', 'client_update_forms', 'client_update_form_submissions');
    `;
    
    const checkResult = await client.query(checkQuery);
    const existingTables = checkResult.rows.map(row => row.table_name);
    
    if (existingTables.length > 0) {
      console.log(`⚠️  Some tables already exist: ${existingTables.join(', ')}`);
      console.log('🔄 Running migration anyway (CREATE TABLE IF NOT EXISTS will skip existing tables)...');
    }

    // Run migration
    console.log('🔄 Creating client-updates tables...');
    await client.query(sql);
    
    console.log('✅ Migration completed successfully!');
    console.log('📋 Created tables:');
    console.log('   - client_updates');
    console.log('   - client_update_forms');
    console.log('   - client_update_form_submissions');
    
    await client.end();
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error(error);
    await client.end();
    process.exit(1);
  }
}

runMigration();

