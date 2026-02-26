// Script to add Premium and Powered-Up to the client_type_enum in PostgreSQL
// Run with: node scripts/add-premium-powered-up-client-types.js
// Or: npm run migrate:premium-powered-up

const { Client } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function addPremiumPoweredUpClientTypes() {
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

    // First, check what the actual column type is
    const columnInfo = await client.query(`
      SELECT 
        data_type,
        udt_name
      FROM information_schema.columns 
      WHERE table_name = 'projects' AND column_name = 'clientType';
    `);

    if (columnInfo.rows.length === 0) {
      console.error('❌ Column "clientType" not found in projects table');
      process.exit(1);
    }

    const columnType = columnInfo.rows[0].data_type;
    const udtName = columnInfo.rows[0].udt_name;
    console.log(`Current column type: ${columnType}, UDT name: ${udtName}`);

    let enumTypeName = null;
    let currentClientTypes = [];

    // Check if it's an enum type
    if (columnType === 'USER-DEFINED' || udtName.includes('enum')) {
      // Try to find the enum type name
      const enumTypeQuery = await client.query(`
        SELECT t.typname as enum_name
        FROM pg_type t 
        JOIN pg_enum e ON t.oid = e.enumtypid
        WHERE t.typname LIKE '%client%type%' OR t.typname LIKE '%clienttype%'
        GROUP BY t.typname
        LIMIT 1;
      `);

      if (enumTypeQuery.rows.length > 0) {
        enumTypeName = enumTypeQuery.rows[0].enum_name;
        console.log(`Found enum type: ${enumTypeName}`);
        
        // Get current enum values
        try {
          const enumValuesQuery = await client.query(`
            SELECT unnest(enum_range(NULL::${enumTypeName}))::text as enum_value;
          `);
          currentClientTypes = enumValuesQuery.rows.map(r => r.enum_value);
          console.log('Current enum values:', currentClientTypes);
        } catch (e) {
          console.log('Could not read enum values, will create new enum');
        }
      } else {
        // Check if column is using an enum but we need to find it differently
        const directEnumCheck = await client.query(`
          SELECT 
            t.typname as enum_name,
            array_agg(e.enumlabel ORDER BY e.enumsortorder) as enum_values
          FROM pg_type t 
          JOIN pg_enum e ON t.oid = e.enumtypid
          JOIN information_schema.columns c ON c.udt_name = t.typname
          WHERE c.table_name = 'projects' AND c.column_name = 'clientType'
          GROUP BY t.typname;
        `);
        
        if (directEnumCheck.rows.length > 0) {
          enumTypeName = directEnumCheck.rows[0].enum_name;
          currentClientTypes = directEnumCheck.rows[0].enum_values;
          console.log(`Found enum type via column: ${enumTypeName}`);
          console.log('Current enum values:', currentClientTypes);
        }
      }
    } else {
      // Column is not an enum, might be text or varchar
      console.log(`Column is ${columnType}, will convert to enum`);
      
      // Get distinct values from the column to see what we're working with
      const distinctValues = await client.query(`
        SELECT DISTINCT "clientType" as value 
        FROM projects 
        WHERE "clientType" IS NOT NULL
        ORDER BY "clientType";
      `);
      currentClientTypes = distinctValues.rows.map(r => r.value);
      console.log('Current distinct values in column:', currentClientTypes);
    }

    const newClientTypes = ['Premium', 'Powered-Up'];
    const missingClientTypes = newClientTypes.filter(type => !currentClientTypes.includes(type));

    if (missingClientTypes.length > 0 || !enumTypeName) {
      console.log('Adding new client types:', missingClientTypes.length > 0 ? missingClientTypes : 'Creating enum from scratch');
      
      // Use a standard enum name
      const targetEnumName = 'client_type_enum';
      
      // Drop default constraint first if it exists
      try {
        await client.query(`
          ALTER TABLE projects ALTER COLUMN "clientType" DROP DEFAULT;
        `);
        console.log('✓ Dropped default constraint on projects.clientType');
      } catch (e) {
        console.log('No default constraint to drop (or already dropped)');
      }

      // Convert column to text temporarily if it's not already
      if (enumTypeName) {
        try {
          await client.query(`
            ALTER TABLE projects ALTER COLUMN "clientType" TYPE text;
          `);
          console.log('✓ Converted projects.clientType to text');
        } catch (e) {
          console.log('Column might already be text or conversion failed:', e.message);
        }
      }

      // Drop old enum if it exists
      if (enumTypeName && enumTypeName !== targetEnumName) {
        try {
          await client.query(`
            DROP TYPE IF EXISTS ${enumTypeName} CASCADE;
          `);
          console.log(`✓ Dropped old enum type: ${enumTypeName}`);
        } catch (e) {
          console.log('Could not drop old enum (might not exist):', e.message);
        }
      }

      // Drop target enum if it exists (we'll recreate it)
      await client.query(`
        DROP TYPE IF EXISTS ${targetEnumName} CASCADE;
      `);
      console.log(`✓ Dropped ${targetEnumName} if it existed`);

      // Create new enum with all client types
      await client.query(`
        CREATE TYPE ${targetEnumName} AS ENUM (
          'ICON',
          'STAR',
          'Katalyst',
          'Private',
          'Premium',
          'Powered-Up'
        );
      `);
      console.log(`✓ Created new ${targetEnumName} with all types`);

      // Alter column back to enum
      await client.query(`
        ALTER TABLE projects ALTER COLUMN "clientType" TYPE ${targetEnumName} USING "clientType"::${targetEnumName};
      `);
      console.log('✓ Updated projects.clientType column to use new enum');

      enumTypeName = targetEnumName;
    } else {
      console.log('✓ All new client types already exist in enum');
    }

    // Verify the enum values
    if (enumTypeName) {
      const finalCheck = await client.query(`
        SELECT unnest(enum_range(NULL::${enumTypeName}))::text as enum_value;
      `);
      console.log(`\nFinal ${enumTypeName} values:`, finalCheck.rows.map(r => r.enum_value));
    }

    console.log('\n✅ Client type enum migration completed successfully!');
  } catch (error) {
    console.error('❌ Error running migration:', error.message);
    console.error('Full error:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

addPremiumPoweredUpClientTypes();

