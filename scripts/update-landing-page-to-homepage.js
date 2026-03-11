// Script to update any old "Landing Page" deliverables to "Home Page" 
// This ensures all deliverables use the correct enum value
// Run with: node scripts/update-landing-page-to-Home Page.js

const { Client } = require('pg');
require('dotenv').config();

async function updateLandingPageToHomepage() {
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

    // First, check what enum values actually exist in the database
    const enumCheckResult = await client.query(`
      SELECT DISTINCT type, COUNT(*) as count
      FROM deliverables
      GROUP BY type
      ORDER BY type;
    `);
    
    console.log('Current deliverable types in database:');
    enumCheckResult.rows.forEach(row => {
      console.log(`  - ${row.type}: ${row.count} deliverables`);
    });

    // Check current enum values
    const enumValuesCheck = await client.query(`
      SELECT unnest(enum_range(NULL::deliverables_type_enum))::text as enum_value;
    `);
    const currentEnumValues = enumValuesCheck.rows.map(r => r.enum_value);
    console.log('\nCurrent enum values:', currentEnumValues);

    // Check if "Home Page" already exists in enum
    const hasHomePage = currentEnumValues.includes('Home Page');
    const hasLandingPage = currentEnumValues.includes('Landing Page');
    const hasCopyOfHomePage = currentEnumValues.includes('Copy of Home Page');
    const hasCopyOfLandingPage = currentEnumValues.includes('Copy of Landing Page');

    // Check how many records need updating
    const checkResult = await client.query(`
      SELECT COUNT(*) as count 
      FROM deliverables 
      WHERE type::text = 'Landing Page';
    `);
    const oldCount = parseInt(checkResult.rows[0].count);
    
    const checkCopyResult = await client.query(`
      SELECT COUNT(*) as count 
      FROM deliverables 
      WHERE type::text = 'Copy of Landing Page';
    `);
    const oldCopyCount = parseInt(checkCopyResult.rows[0].count);

    console.log(`\nFound ${oldCount} deliverables with "Landing Page" type`);
    console.log(`Found ${oldCopyCount} deliverables with "Copy of Landing Page" type`);

    // Only proceed if we need to update the enum or data
    if (!hasHomePage || hasLandingPage || oldCount > 0 || oldCopyCount > 0) {
      console.log('\nUpdating enum and data...');

      // Step 1: Convert column to text temporarily
      await client.query(`
        ALTER TABLE deliverables ALTER COLUMN type TYPE text;
      `);
      console.log('✓ Converted deliverables.type to text');

      // Step 2: Update all existing data
      if (oldCount > 0) {
        await client.query(`
          UPDATE deliverables SET type = 'Home Page' WHERE type = 'Landing Page';
        `);
        console.log(`✓ Updated ${oldCount} deliverables from "Landing Page" to "Home Page"`);
      }

      if (oldCopyCount > 0) {
        await client.query(`
          UPDATE deliverables SET type = 'Copy of Home Page' WHERE type = 'Copy of Landing Page';
        `);
        console.log(`✓ Updated ${oldCopyCount} deliverables from "Copy of Landing Page" to "Copy of Home Page"`);
      }

      // Step 3: Drop the old enum type
      await client.query(`
        DROP TYPE IF EXISTS deliverables_type_enum CASCADE;
      `);
      console.log('✓ Dropped old enum type');

      // Step 4: Create new enum type with correct values
      await client.query(`
        CREATE TYPE deliverables_type_enum AS ENUM (
          'Logo', 
          'Brand Book', 
          'Home Page', 
          'Copy of Home Page', 
          'Speaker Kit', 
          'Social Banners', 
          'Other'
        );
      `);
      console.log('✓ Created new enum type with "Home Page" and "Copy of Home Page"');

      // Step 5: Alter the column back to use the new enum type
      await client.query(`
        ALTER TABLE deliverables ALTER COLUMN type TYPE deliverables_type_enum USING type::deliverables_type_enum;
      `);
      console.log('✓ Updated deliverables.type column to use new enum');

      // Verify final enum values
      const finalEnumCheck = await client.query(`
        SELECT unnest(enum_range(NULL::deliverables_type_enum))::text as enum_value;
      `);
      console.log('\nFinal enum values:', finalEnumCheck.rows.map(r => r.enum_value));
    } else {
      console.log('\n✓ No updates needed - enum already has correct values and no old data found');
    }

    console.log('Migration completed successfully!');
  } catch (error) {
    console.error('Error updating deliverables:', error);
    throw error;
  } finally {
    await client.end();
  }
}

updateLandingPageToHomepage()
  .then(() => {
    console.log('Script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  });

