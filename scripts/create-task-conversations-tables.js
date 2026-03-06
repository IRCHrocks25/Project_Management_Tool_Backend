// Script to create task_questions and task_comments tables
// Run with: node scripts/create-task-conversations-tables.js
// Or: npm run migrate:task-conversations

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

    // Check if tables already exist
    const checkQuestionsQuery = `
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'task_questions';
    `;
    
    const checkCommentsQuery = `
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'task_comments';
    `;
    
    const checkQuestionsResult = await client.query(checkQuestionsQuery);
    const checkCommentsResult = await client.query(checkCommentsQuery);
    
    if (checkQuestionsResult.rows.length > 0) {
      console.log('⚠️  Table task_questions already exists');
    }
    
    if (checkCommentsResult.rows.length > 0) {
      console.log('⚠️  Table task_comments already exists');
    }

    if (checkQuestionsResult.rows.length > 0 && checkCommentsResult.rows.length > 0) {
      console.log('🔄 Running migration anyway (CREATE TABLE IF NOT EXISTS will skip existing tables)...');
    }

    // Read SQL file
    const sqlPath = path.join(__dirname, '../migrations/create-task-conversations-tables.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    // Run migration
    console.log('🔄 Creating task_questions and task_comments tables...');
    await client.query(sql);
    
    console.log('✅ Migration completed successfully!');
    console.log('📋 Created tables:');
    console.log('   - task_questions');
    console.log('   - task_comments');
    console.log('📋 Created indexes:');
    console.log('   - idx_task_questions_task_id');
    console.log('   - idx_task_questions_user_id');
    console.log('   - idx_task_questions_created_at');
    console.log('   - idx_task_comments_question_id');
    console.log('   - idx_task_comments_user_id');
    console.log('   - idx_task_comments_created_at');
    
    await client.end();
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error(error);
    await client.end();
    process.exit(1);
  }
}

runMigration();

