// Quick script to add assignedToId column to notifications table
// Run with: node scripts/add-notification-assigned-to-id.js

const { Client } = require('pg');
require('dotenv').config();

async function addNotificationAssignedToId() {
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

    // Check if column already exists and what type it is
    const columnCheck = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'notifications' 
      AND column_name = 'assignedToId'
    `);

    if (columnCheck.rows.length > 0) {
      const columnType = columnCheck.rows[0].data_type;
      if (columnType === 'uuid') {
        console.log('✓ Column assignedToId already exists with correct type (UUID)');
      } else {
        console.log(`⚠ Column assignedToId exists but has wrong type (${columnType}). Dropping and recreating...`);
        // Drop the column if it has wrong type
        await client.query(`
          ALTER TABLE notifications 
          DROP COLUMN IF EXISTS "assignedToId";
        `);
        // Add it back with correct type
        await client.query(`
          ALTER TABLE notifications 
          ADD COLUMN "assignedToId" UUID;
        `);
        console.log('✓ Recreated assignedToId column with correct type (UUID)');
      }
    } else {
      // Add assignedToId column to notifications table as UUID
      await client.query(`
        ALTER TABLE notifications 
        ADD COLUMN "assignedToId" UUID;
      `);
      console.log('✓ Added assignedToId column to notifications table (UUID)');
    }

    // Optional: Add foreign key constraint to users table
    const fkCheck = await client.query(`
      SELECT 1 FROM pg_constraint 
      WHERE conname = 'FK_notifications_assignedToId'
    `);
    
    if (fkCheck.rows.length === 0) {
      await client.query(`
        ALTER TABLE notifications 
        ADD CONSTRAINT "FK_notifications_assignedToId" 
        FOREIGN KEY ("assignedToId") 
        REFERENCES users(id) 
        ON DELETE SET NULL;
      `);
      console.log('✓ Added foreign key constraint for assignedToId');
    } else {
      console.log('✓ Foreign key constraint already exists');
    }

    // Update existing task notifications with assignedToId from the task
    const updateResult = await client.query(`
      UPDATE notifications n
      SET "assignedToId" = t."assignedToId"
      FROM tasks t
      WHERE n."taskId" = t.id
      AND n.type IN ('task', 'task_completed')
      AND n."assignedToId" IS NULL
      AND t."assignedToId" IS NOT NULL;
    `);
    console.log(`✓ Updated ${updateResult.rowCount} existing task notifications with assignedToId`);

    console.log('\n✅ Notification assignedToId migration completed successfully!');
  } catch (error) {
    console.error('❌ Error running migration:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

addNotificationAssignedToId();

