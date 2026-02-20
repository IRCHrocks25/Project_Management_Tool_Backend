// Quick script to add completion columns to projects table
// Run with: node scripts/add-completion-columns.js

const { Client } = require('pg');
require('dotenv').config();

async function addCompletionColumns() {
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

    // Add completion columns to projects table
    await client.query(`
      ALTER TABLE projects 
      ADD COLUMN IF NOT EXISTS "isCompleted" BOOLEAN DEFAULT false;
    `);
    console.log('✓ Added isCompleted column to projects');

    await client.query(`
      ALTER TABLE projects 
      ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP;
    `);
    console.log('✓ Added completedAt column to projects');

    await client.query(`
      ALTER TABLE projects 
      ADD COLUMN IF NOT EXISTS "completedByUserId" UUID;
    `);
    console.log('✓ Added completedByUserId column to projects');

    // Add foreign key constraint for completedByUserId if it doesn't exist
    const fkCheck = await client.query(`
      SELECT 1 FROM pg_constraint 
      WHERE conname = 'FK_projects_completedByUserId'
    `);
    
    if (fkCheck.rows.length === 0) {
      await client.query(`
        ALTER TABLE projects 
        ADD CONSTRAINT "FK_projects_completedByUserId" 
        FOREIGN KEY ("completedByUserId") 
        REFERENCES users(id) 
        ON DELETE SET NULL;
      `);
      console.log('✓ Added foreign key constraint for completedByUserId');
    } else {
      console.log('✓ Foreign key constraint already exists');
    }

    // Set default values for existing rows (ensure consistency)
    await client.query(`
      UPDATE projects SET "isCompleted" = false WHERE "isCompleted" IS NULL;
    `);
    console.log('✓ Set default isCompleted values for existing projects');

    console.log('\n✅ Completion columns migration completed successfully!');
  } catch (error) {
    console.error('❌ Error running migration:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

addCompletionColumns();

