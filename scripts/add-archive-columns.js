// Quick script to add archiving columns to projects and tasks tables
// Run with: node scripts/add-archive-columns.js

const { Client } = require('pg');
require('dotenv').config();

async function addArchiveColumns() {
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

    // Add archiving columns to projects table
    await client.query(`
      ALTER TABLE projects 
      ADD COLUMN IF NOT EXISTS "isArchived" BOOLEAN DEFAULT false;
    `);
    console.log('✓ Added isArchived column to projects');

    await client.query(`
      ALTER TABLE projects 
      ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP;
    `);
    console.log('✓ Added archivedAt column to projects');

    await client.query(`
      ALTER TABLE projects 
      ADD COLUMN IF NOT EXISTS "archivedByUserId" UUID;
    `);
    console.log('✓ Added archivedByUserId column to projects');

    // Add foreign key constraint for archivedByUserId if it doesn't exist
    const fkCheck = await client.query(`
      SELECT 1 FROM pg_constraint 
      WHERE conname = 'FK_projects_archivedByUserId'
    `);
    
    if (fkCheck.rows.length === 0) {
      await client.query(`
        ALTER TABLE projects 
        ADD CONSTRAINT "FK_projects_archivedByUserId" 
        FOREIGN KEY ("archivedByUserId") 
        REFERENCES users(id) 
        ON DELETE SET NULL;
      `);
      console.log('✓ Added foreign key constraint for archivedByUserId');
    } else {
      console.log('✓ Foreign key constraint already exists');
    }

    // Add archiving column to tasks table
    await client.query(`
      ALTER TABLE tasks 
      ADD COLUMN IF NOT EXISTS "isArchived" BOOLEAN DEFAULT false;
    `);
    console.log('✓ Added isArchived column to tasks');

    // Set default values for existing rows (ensure consistency)
    await client.query(`
      UPDATE projects SET "isArchived" = false WHERE "isArchived" IS NULL;
    `);
    console.log('✓ Set default isArchived values for existing projects');

    await client.query(`
      UPDATE tasks SET "isArchived" = false WHERE "isArchived" IS NULL;
    `);
    console.log('✓ Set default isArchived values for existing tasks');

    console.log('\n✅ Archive columns migration completed successfully!');
  } catch (error) {
    console.error('❌ Error running migration:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

addArchiveColumns();

