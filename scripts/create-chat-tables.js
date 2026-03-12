// Script to create chat_rooms, chat_room_participants, chat_messages tables
// Run with: node scripts/create-chat-tables.js
// Or: npm run migrate:chat-tables

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

    const sqlPath = path.join(__dirname, '../migrations/create-chat-tables.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    console.log('🔄 Creating chat tables...');
    await client.query(sql);

    console.log('✅ Migration completed successfully!');
    console.log('📋 Created tables: chat_rooms, chat_room_participants, chat_messages');

    await client.end();
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    await client.end();
    process.exit(1);
  }
}

runMigration();
