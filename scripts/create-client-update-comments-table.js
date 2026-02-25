// Script to create client_update_comments table
// Run with: node scripts/create-client-update-comments-table.js
// Or: npm run migrate:client-update-comments

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

    // Check if table already exists
    const checkQuery = `
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'client_update_comments';
    `;
    
    const checkResult = await client.query(checkQuery);
    
    if (checkResult.rows.length > 0) {
      console.log('⚠️  Table client_update_comments already exists');
      console.log('🔄 Running migration anyway (CREATE TABLE IF NOT EXISTS will skip existing table)...');
    }

    // Read SQL file
    const sqlPath = path.join(__dirname, '../migrations/create-client-update-comments-table.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    // Run migration
    console.log('🔄 Creating client_update_comments table...');
    await client.query(sql);
    
    console.log('✅ Migration completed successfully!');
    console.log('📋 Created table:');
    console.log('   - client_update_comments');
    console.log('   - Indexes for updateId, userId, and createdAt');
    
    await client.end();
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error(error);
    await client.end();
    process.exit(1);
  }
}

runMigration();

