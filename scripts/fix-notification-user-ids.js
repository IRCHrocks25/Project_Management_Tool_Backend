// Script to fix userId in notifications based on assignedToId for task notifications
// Run with: node scripts/fix-notification-user-ids.js

const { Client } = require('pg');
require('dotenv').config();

async function fixNotificationUserIds() {
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

    // For task notifications, update userId from assignedToId if they don't match
    const updateResult = await client.query(`
      UPDATE notifications n
      SET "userId" = COALESCE(n."assignedToId", t."assignedToId", n."userId")
      FROM tasks t
      WHERE n."taskId" = t.id
      AND n.type IN ('task', 'task_completed')
      AND (
        n."assignedToId" IS NOT NULL 
        OR t."assignedToId" IS NOT NULL
      )
      AND (
        n."userId" != COALESCE(n."assignedToId", t."assignedToId")
        OR n."userId" IS NULL
      );
    `);
    console.log(`✓ Updated ${updateResult.rowCount} task notification userIds from assignedToId`);

    // Also update assignedToId for task_completed notifications from the task
    const updateAssignedToId = await client.query(`
      UPDATE notifications n
      SET "assignedToId" = t."assignedToId"
      FROM tasks t
      WHERE n."taskId" = t.id
      AND n.type = 'task_completed'
      AND n."assignedToId" IS NULL
      AND t."assignedToId" IS NOT NULL;
    `);
    console.log(`✓ Updated ${updateAssignedToId.rowCount} task_completed notification assignedToIds from tasks`);

    // Show sample of notifications after update
    const sample = await client.query(`
      SELECT id, type, "userId", "assignedToId", "taskId"
      FROM notifications
      WHERE type IN ('task', 'task_completed')
      LIMIT 5;
    `);
    console.log('Sample notifications after update:', sample.rows);

    console.log('\n✅ Notification userId fix completed successfully!');
  } catch (error) {
    console.error('❌ Error running fix:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

fixNotificationUserIds();

