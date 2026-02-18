// Script to add new roles to the users_role_enum in PostgreSQL
// Run with: node scripts/add-new-roles-enum.js

const { Client } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function addNewRolesEnum() {
  const config = process.env.DATABASE_URL 
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: (process.env.DATABASE_URL.includes('railway') || process.env.DATABASE_URL.includes('trolley.proxy.rlwy.net'))
          ? { rejectUnauthorized: false }
          : false,
      }
    : {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432'),
        user: process.env.DB_USERNAME || 'postgres',
        password: process.env.DB_PASSWORD || 'postgres',
        database: process.env.DB_DATABASE || 'katalyst_pm',
      };
  
  const client = new Client(config);

  try {
    await client.connect();
    console.log('Connected to database');

    // Check current enum values
    const enumCheck = await client.query(`
      SELECT unnest(enum_range(NULL::users_role_enum))::text as enum_value;
    `);
    const currentEnumValues = enumCheck.rows.map(r => r.enum_value);
    console.log('Current role enum values:', currentEnumValues);

    const newRoles = ['AI Developer', 'Social Media', 'CRM', 'SEO/GEO'];
    const missingRoles = newRoles.filter(role => !currentEnumValues.includes(role));

    if (missingRoles.length === 0) {
      console.log('✓ All new roles already exist in enum');
    } else {
      console.log('Adding new roles:', missingRoles);
      
      // Drop default constraint first if it exists
      await client.query(`
        ALTER TABLE users ALTER COLUMN role DROP DEFAULT;
      `);
      console.log('✓ Dropped default constraint on users.role');
      
      // Convert column to text temporarily
      await client.query(`
        ALTER TABLE users ALTER COLUMN role TYPE text;
      `);
      console.log('✓ Converted users.role to text');

      // Drop old enum
      await client.query(`
        DROP TYPE IF EXISTS users_role_enum CASCADE;
      `);
      console.log('✓ Dropped old enum type');

      // Create new enum with all roles
      await client.query(`
        CREATE TYPE users_role_enum AS ENUM (
          'FOUNDER/CEO',
          'Project Manager',
          'Copy Writing',
          'Designer',
          'Developer',
          'AI Developer',
          'Social Media',
          'CRM',
          'SEO/GEO'
        );
      `);
      console.log('✓ Created new enum type with all roles');

      // Alter column back to enum
      await client.query(`
        ALTER TABLE users ALTER COLUMN role TYPE users_role_enum USING role::users_role_enum;
      `);
      console.log('✓ Updated users.role column to use new enum');

      // Re-add default constraint if needed
      // Note: Check your schema to see if there was a default value
      console.log('✓ Migration complete');
    }

    // Verify the enum values
    const finalCheck = await client.query(`
      SELECT unnest(enum_range(NULL::users_role_enum))::text as enum_value;
    `);
    console.log('\nFinal role enum values:', finalCheck.rows.map(r => r.enum_value));

    console.log('\n✅ Role enum migration completed successfully!');
  } catch (error) {
    console.error('❌ Error running migration:', error.message);
    console.error('Full error:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

addNewRolesEnum();

