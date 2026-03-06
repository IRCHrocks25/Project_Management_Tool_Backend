// Migration script to add MENTION and TASK_UPDATE notification types
// Run with: npm run migrate:conversation-notification-types

const { Client } = require('pg');
require('dotenv').config();

async function addConversationNotificationTypes() {
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
    console.log('✅ Connected to database');

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
    
    console.log(`📋 Found enum type name: ${enumTypeName}`);

    // Step 2: Check current enum values
    const enumCheck = await client.query(`
      SELECT unnest(enum_range(NULL::${enumTypeName}))::text AS enum_value;
    `);
    
    const existingValues = enumCheck.rows.map(r => r.enum_value);
    console.log('📋 Current notification type enum values:', existingValues);

    // Step 3: Add 'mention' to enum if it doesn't exist
    if (!existingValues.includes('mention')) {
      try {
        await client.query(`
          ALTER TYPE ${enumTypeName} ADD VALUE 'mention';
        `);
        console.log(`✅ Added 'mention' to ${enumTypeName} enum`);
      } catch (error) {
        if (error.message.includes('already exists')) {
          console.log('✓ mention already exists in enum (from previous run)');
        } else {
          throw error;
        }
      }
    } else {
      console.log('✓ mention already exists in enum');
    }

    // Step 4: Add 'task_update' to enum if it doesn't exist
    if (!existingValues.includes('task_update')) {
      try {
        await client.query(`
          ALTER TYPE ${enumTypeName} ADD VALUE 'task_update';
        `);
        console.log(`✅ Added 'task_update' to ${enumTypeName} enum`);
      } catch (error) {
        if (error.message.includes('already exists')) {
          console.log('✓ task_update already exists in enum (from previous run)');
        } else {
          throw error;
        }
      }
    } else {
      console.log('✓ task_update already exists in enum');
    }

    // Step 5: Verify the update
    const verifyResult = await client.query(`
      SELECT unnest(enum_range(NULL::${enumTypeName}))::text AS enum_value;
    `);
    
    const updatedValues = verifyResult.rows.map(r => r.enum_value);
    console.log('\n📋 Updated notification type enum values:', updatedValues);

    if (updatedValues.includes('mention') && updatedValues.includes('task_update')) {
      console.log('\n✅ Migration completed successfully!');
      console.log('\n📝 Next steps:');
      console.log('1. Restart the backend server to pick up the new enum values');
      console.log('2. Test creating a question with @mentions to verify MENTION notifications');
      console.log('3. Test commenting on a question to verify TASK_UPDATE notifications');
    } else {
      console.log('\n⚠️  Warning: Some enum values may not have been added correctly');
    }
  } catch (error) {
    console.error('❌ Error running migration:', error);
    console.error('\nIf you see an error about enum type, you may need to:');
    console.error('1. Check the actual enum type name in your database');
    console.error('2. Manually add the values:');
    console.error('   ALTER TYPE <enum_name> ADD VALUE \'mention\';');
    console.error('   ALTER TYPE <enum_name> ADD VALUE \'task_update\';');
    process.exit(1);
  } finally {
    await client.end();
  }
}

addConversationNotificationTypes();

