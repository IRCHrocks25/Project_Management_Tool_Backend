// Migration script to add TASK_AVAILABLE notification type and update existing notifications
// Run with: npm run migrate:task-available-type

const { Client } = require('pg');
require('dotenv').config();

async function addTaskAvailableNotificationType() {
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

    // Step 1: Find the actual enum type name used in the database
    const typeNameCheck = await client.query(`
      SELECT DISTINCT t.typname 
      FROM pg_type t 
      JOIN pg_enum e ON t.oid = e.enumtypid 
      JOIN pg_class c ON c.reltype = t.oid
      JOIN information_schema.columns col ON col.udt_name = t.typname
      WHERE col.table_name = 'notifications' 
      AND col.column_name = 'type'
      LIMIT 1;
    `);
    
    if (typeNameCheck.rows.length === 0) {
      // Fallback: find by enum label
      const fallbackCheck = await client.query(`
        SELECT DISTINCT t.typname 
        FROM pg_type t 
        JOIN pg_enum e ON t.oid = e.enumtypid 
        WHERE e.enumlabel = 'task' 
        LIMIT 1;
      `);
      
      if (fallbackCheck.rows.length === 0) {
        throw new Error('Could not find notification type enum in database');
      }
      var enumTypeName = fallbackCheck.rows[0].typname;
    } else {
      var enumTypeName = typeNameCheck.rows[0].typname;
    }
    
    console.log(`Found enum type name: ${enumTypeName}`);

    // Step 2: Check current enum values
    const enumCheck = await client.query(`
      SELECT unnest(enum_range(NULL::${enumTypeName}))::text AS enum_value;
    `);
    
    const existingValues = enumCheck.rows.map(r => r.enum_value);
    console.log('Current notification type enum values:', existingValues);

    // Step 3: Add 'task_available' to enum if it doesn't exist
    if (!existingValues.includes('task_available')) {
      // PostgreSQL doesn't support IF NOT EXISTS for ADD VALUE, so we check first
      // Also, ADD VALUE cannot be run in a transaction, so we do it separately
      try {
        await client.query(`
          ALTER TYPE ${enumTypeName} ADD VALUE 'task_available';
        `);
        console.log(`✓ Added task_available to ${enumTypeName} enum`);
      } catch (error) {
        if (error.message.includes('already exists')) {
          console.log('✓ task_available already exists in enum (from previous run)');
        } else {
          throw error;
        }
      }
    } else {
      console.log('✓ task_available already exists in enum');
    }

    // Step 3: Update existing notifications that should be TASK_AVAILABLE
    // These are notifications with:
    // - type = 'task' (TASK_ASSIGNED)
    // - assignedToId IS NULL (unassigned)
    // - taskId IS NOT NULL (has a related task)
    const updateResult = await client.query(`
      UPDATE notifications
      SET type = 'task_available'
      WHERE type = 'task'
      AND "assignedToId" IS NULL
      AND "taskId" IS NOT NULL;
    `);
    
    console.log(`✓ Updated ${updateResult.rowCount} existing notifications from 'task' to 'task_available'`);

    // Step 4: Verify the update
    const verifyResult = await client.query(`
      SELECT type, COUNT(*) as count
      FROM notifications
      WHERE type IN ('task', 'task_available')
      GROUP BY type;
    `);
    
    console.log('\nNotification type distribution:');
    verifyResult.rows.forEach(row => {
      console.log(`  - ${row.type}: ${row.count}`);
    });

    // Step 5: Check for any remaining problematic notifications
    const problematicCheck = await client.query(`
      SELECT COUNT(*) as count
      FROM notifications
      WHERE type = 'task'
      AND "assignedToId" IS NULL
      AND "taskId" IS NOT NULL;
    `);
    
    if (parseInt(problematicCheck.rows[0].count) > 0) {
      console.log(`\n⚠ Warning: ${problematicCheck.rows[0].count} notifications still have type='task' with assignedToId=NULL`);
      console.log('   These should be reviewed manually.');
    } else {
      console.log('\n✓ All unassigned task notifications have been migrated to task_available');
    }

    console.log('\n✅ Migration completed successfully!');
    console.log('\nNext steps:');
    console.log('1. Restart the backend server to pick up the new enum value');
    console.log('2. Test creating an unassigned task to verify TASK_AVAILABLE notifications are created');
    console.log('3. Verify notification count matches notification list in frontend');
  } catch (error) {
    console.error('❌ Error running migration:', error);
    console.error('\nIf you see an error about enum type, you may need to:');
    console.error('1. Check the actual enum type name in your database');
    console.error('2. Manually add the value: ALTER TYPE <enum_name> ADD VALUE \'task_available\';');
    process.exit(1);
  } finally {
    await client.end();
  }
}

addTaskAvailableNotificationType();

