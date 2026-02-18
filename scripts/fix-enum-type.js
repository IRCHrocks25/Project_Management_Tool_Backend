// Script to fix the enum type to include "Onboarding" instead of "Intake"
// Run with: node scripts/fix-enum-type.js

const { Client } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function fixEnum() {
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
      SELECT unnest(enum_range(NULL::tasks_type_enum))::text as enum_value;
    `);
    console.log('Current enum values:', enumCheck.rows.map(r => r.enum_value));

    // Check if "Onboarding" already exists
    const hasOnboarding = enumCheck.rows.some(r => r.enum_value === 'Onboarding');
    
    if (!hasOnboarding) {
      console.log('"Onboarding" not found in enum, updating...');
      
      // Step 1: Convert column to text temporarily
      await client.query(`
        ALTER TABLE tasks ALTER COLUMN type TYPE text;
      `);
      console.log('✓ Converted tasks.type to text');

      // Step 2: Update all existing data from "Intake" to "Onboarding"
      await client.query(`
        UPDATE tasks SET type = 'Onboarding' WHERE type = 'Intake';
      `);
      console.log('✓ Updated existing "Intake" values to "Onboarding"');

      // Step 3: Drop the old enum type
      await client.query(`
        DROP TYPE IF EXISTS tasks_type_enum;
      `);
      console.log('✓ Dropped old enum type');

      // Step 4: Create new enum type with "Onboarding"
      await client.query(`
        CREATE TYPE tasks_type_enum AS ENUM ('Onboarding', 'Copy', 'Design', 'Dev', 'General');
      `);
      console.log('✓ Created new enum type with "Onboarding"');

      // Step 5: Alter the column back to use the new enum type
      await client.query(`
        ALTER TABLE tasks ALTER COLUMN type TYPE tasks_type_enum USING type::tasks_type_enum;
      `);
      console.log('✓ Updated tasks.type column to use new enum');
    } else {
      console.log('✓ Enum already has "Onboarding", no changes needed');
    }

    // Verify the enum values
    const finalCheck = await client.query(`
      SELECT unnest(enum_range(NULL::tasks_type_enum))::text as enum_value;
    `);
    console.log('\nFinal enum values:', finalCheck.rows.map(r => r.enum_value));

    // Also fix project_stage_enum - first check if it exists
    const enumTypeCheck = await client.query(`
      SELECT EXISTS (
        SELECT 1 FROM pg_type WHERE typname = 'project_stage_enum'
      ) as exists;
    `);
    const enumExists = enumTypeCheck.rows[0].exists;
    
    if (enumExists) {
      const projectEnumCheck = await client.query(`
        SELECT unnest(enum_range(NULL::project_stage_enum))::text as enum_value;
      `);
      console.log('\nCurrent project_stage_enum values:', projectEnumCheck.rows.map(r => r.enum_value));

      const projectHasOnboarding = projectEnumCheck.rows.some(r => r.enum_value === 'Onboarding');
      
      if (!projectHasOnboarding) {
      console.log('"Onboarding" not found in project_stage_enum, updating...');
      
      // Convert column to text temporarily
      await client.query(`
        ALTER TABLE projects ALTER COLUMN stage TYPE text;
      `);
      console.log('✓ Converted projects.stage to text');

      // Update existing data
      await client.query(`
        UPDATE projects SET stage = 'Onboarding' WHERE stage = 'Intake';
      `);
      console.log('✓ Updated existing project "Intake" values to "Onboarding"');

      // Drop old enum
      await client.query(`
        DROP TYPE IF EXISTS project_stage_enum;
      `);
      console.log('✓ Dropped old project_stage_enum');

      // Create new enum
      await client.query(`
        CREATE TYPE project_stage_enum AS ENUM ('Onboarding', 'Copy', 'Copy Revision', 'Design', 'Design Revision', 'Dev', 'Ready to Close', 'Closed');
      `);
      console.log('✓ Created new project_stage_enum with "Onboarding"');

      // Alter column back to enum
      await client.query(`
        ALTER TABLE projects ALTER COLUMN stage TYPE project_stage_enum USING stage::project_stage_enum;
      `);
      console.log('✓ Updated projects.stage column to use new enum');
      } else {
        console.log('✓ project_stage_enum already has "Onboarding", no changes needed');
      }
    } else {
      // Check if projects.stage is text or another type
      const columnCheck = await client.query(`
        SELECT data_type FROM information_schema.columns 
        WHERE table_name = 'projects' AND column_name = 'stage';
      `);
      
      if (columnCheck.rows.length > 0) {
        const dataType = columnCheck.rows[0].data_type;
        console.log(`\nprojects.stage is of type: ${dataType}`);
        
        if (dataType === 'USER-DEFINED') {
          // It's an enum but with a different name, find it
          const enumNameCheck = await client.query(`
            SELECT udt_name FROM information_schema.columns 
            WHERE table_name = 'projects' AND column_name = 'stage';
          `);
          const enumName = enumNameCheck.rows[0].udt_name;
          console.log(`Found enum type: ${enumName}`);
          
          // Drop default constraint first
          await client.query(`ALTER TABLE projects ALTER COLUMN stage DROP DEFAULT;`);
          console.log('✓ Dropped default constraint');
          
          // Convert to text, update values, recreate enum
          await client.query(`ALTER TABLE projects ALTER COLUMN stage TYPE text;`);
          await client.query(`UPDATE projects SET stage = 'Onboarding' WHERE stage = 'Intake';`);
          await client.query(`DROP TYPE IF EXISTS ${enumName} CASCADE;`);
          await client.query(`
            CREATE TYPE project_stage_enum AS ENUM ('Onboarding', 'Copy', 'Copy Revision', 'Design', 'Design Revision', 'Dev', 'Ready to Close', 'Closed');
          `);
          await client.query(`ALTER TABLE projects ALTER COLUMN stage TYPE project_stage_enum USING stage::project_stage_enum;`);
          await client.query(`ALTER TABLE projects ALTER COLUMN stage SET DEFAULT 'Onboarding'::project_stage_enum;`);
          console.log('✓ Fixed projects.stage enum');
        } else if (dataType === 'text' || dataType === 'character varying') {
          // It's already text, drop default first, update values, create enum
          await client.query(`ALTER TABLE projects ALTER COLUMN stage DROP DEFAULT;`);
          await client.query(`UPDATE projects SET stage = 'Onboarding' WHERE stage = 'Intake';`);
          await client.query(`
            CREATE TYPE project_stage_enum AS ENUM ('Onboarding', 'Copy', 'Copy Revision', 'Design', 'Design Revision', 'Dev', 'Ready to Close', 'Closed');
          `);
          await client.query(`ALTER TABLE projects ALTER COLUMN stage TYPE project_stage_enum USING stage::project_stage_enum;`);
          await client.query(`ALTER TABLE projects ALTER COLUMN stage SET DEFAULT 'Onboarding'::project_stage_enum;`);
          console.log('✓ Created project_stage_enum and converted projects.stage');
        } else {
          console.log(`⚠ projects.stage is ${dataType}, skipping enum conversion`);
        }
      }
    }

    console.log('\n✅ Enum migration completed successfully!');
  } catch (error) {
    console.error('❌ Error running migration:', error.message);
    console.error('Full error:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

fixEnum();

