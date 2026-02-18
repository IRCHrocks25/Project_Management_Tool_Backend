const { Client } = require('pg');
require('dotenv').config();

async function addCustomPackageEnum() {
  const config = process.env.DATABASE_URL 
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DATABASE_URL.includes('railway') || process.env.DATABASE_URL.includes('trolley.proxy.rlwy.net')
          ? { rejectUnauthorized: false }
          : false,
      }
    : {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432', 10),
        user: process.env.DB_USERNAME || 'postgres',
        password: process.env.DB_PASSWORD || 'postgres',
        database: process.env.DB_DATABASE || 'katalyst_pm',
      };

  const client = new Client(config);

  try {
    await client.connect();
    console.log('Connected to database');

    // Check if projects_package_enum exists and if it has 'Custom'
    const enumCheck = await client.query(`
      SELECT unnest(enum_range(NULL::projects_package_enum))::text as enum_value;
    `);
    const currentEnumValues = enumCheck.rows.map(r => r.enum_value);
    console.log('Current package enum values:', currentEnumValues);

    const hasCustom = currentEnumValues.includes('Custom');
    
    if (!hasCustom) {
      console.log('"Custom" not found in enum, updating...');
      
      // Convert column to text temporarily
      await client.query(`
        ALTER TABLE projects ALTER COLUMN package TYPE text;
      `);
      console.log('✓ Converted projects.package to text');

      // Drop old enum
      await client.query(`
        DROP TYPE IF EXISTS projects_package_enum;
      `);
      console.log('✓ Dropped old enum type');

      // Create new enum with Custom
      await client.query(`
        CREATE TYPE projects_package_enum AS ENUM ('Starter', 'Standard', 'Premium', 'ICON Package', 'Custom');
      `);
      console.log('✓ Created new enum type with "Custom"');

      // Alter column back to enum
      await client.query(`
        ALTER TABLE projects ALTER COLUMN package TYPE projects_package_enum USING package::projects_package_enum;
      `);
      console.log('✓ Updated projects.package column to use new enum');
    } else {
      console.log('✓ Enum already has "Custom", no changes needed');
    }

    // Verify the enum values
    const finalCheck = await client.query(`
      SELECT unnest(enum_range(NULL::projects_package_enum))::text as enum_value;
    `);
    console.log('\nFinal enum values:', finalCheck.rows.map(r => r.enum_value));

    console.log('\n✅ Migration completed successfully!');
  } catch (error) {
    console.error('❌ Error running migration:', error.message);
    console.error('Full error:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

addCustomPackageEnum();

