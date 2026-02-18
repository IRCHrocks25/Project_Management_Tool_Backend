// Script to add new stages to the project_stage_enum and tasks_type_enum in PostgreSQL
// Run with: node scripts/add-new-stages-enum.js

const { Client } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function addNewStagesEnum() {
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

    // --- Fix project_stage_enum ---
    const projectStageCheck = await client.query(`
      SELECT unnest(enum_range(NULL::project_stage_enum))::text as enum_value;
    `);
    const currentProjectStages = projectStageCheck.rows.map(r => r.enum_value);
    console.log('Current project_stage_enum values:', currentProjectStages);

    const newStages = ['AI Team', 'Social Media Team', 'CRM', 'SEO/GEO Team'];
    const missingProjectStages = newStages.filter(stage => !currentProjectStages.includes(stage));

    if (missingProjectStages.length > 0) {
      console.log('Adding new project stages:', missingProjectStages);
      
      // Drop default constraint first if it exists
      await client.query(`
        ALTER TABLE projects ALTER COLUMN stage DROP DEFAULT;
      `);
      console.log('✓ Dropped default constraint on projects.stage');

      // Convert column to text temporarily
      await client.query(`
        ALTER TABLE projects ALTER COLUMN stage TYPE text;
      `);
      console.log('✓ Converted projects.stage to text');

      // Drop old enum
      await client.query(`
        DROP TYPE IF EXISTS project_stage_enum;
      `);
      console.log('✓ Dropped old project_stage_enum');

      // Create new enum with all stages
      await client.query(`
        CREATE TYPE project_stage_enum AS ENUM (
          'Onboarding',
          'Copy',
          'Copy Revision',
          'Design',
          'Design Revision',
          'Dev',
          'AI Team',
          'Social Media Team',
          'CRM',
          'SEO/GEO Team',
          'Ready to Close',
          'Closed'
        );
      `);
      console.log('✓ Created new project_stage_enum with all stages');

      // Alter column back to enum
      await client.query(`
        ALTER TABLE projects ALTER COLUMN stage TYPE project_stage_enum USING stage::project_stage_enum;
      `);
      console.log('✓ Updated projects.stage column to use new enum');

      // Re-add default constraint
      await client.query(`
        ALTER TABLE projects ALTER COLUMN stage SET DEFAULT 'Onboarding'::project_stage_enum;
      `);
      console.log('✓ Re-added default constraint on projects.stage');
    } else {
      console.log('✓ All new project stages already exist in enum');
    }

    // --- Fix tasks_type_enum ---
    const taskTypeCheck = await client.query(`
      SELECT unnest(enum_range(NULL::tasks_type_enum))::text as enum_value;
    `);
    const currentTaskTypes = taskTypeCheck.rows.map(r => r.enum_value);
    console.log('\nCurrent tasks_type_enum values:', currentTaskTypes);

    const newTaskTypes = ['AI', 'Social Media', 'CRM', 'SEO/GEO'];
    const missingTaskTypes = newTaskTypes.filter(type => !currentTaskTypes.includes(type));

    if (missingTaskTypes.length > 0) {
      console.log('Adding new task types:', missingTaskTypes);
      
      // Convert column to text temporarily
      await client.query(`
        ALTER TABLE tasks ALTER COLUMN type TYPE text;
      `);
      console.log('✓ Converted tasks.type to text');

      // Drop old enum
      await client.query(`
        DROP TYPE IF EXISTS tasks_type_enum;
      `);
      console.log('✓ Dropped old tasks_type_enum');

      // Create new enum with all task types
      await client.query(`
        CREATE TYPE tasks_type_enum AS ENUM (
          'Onboarding',
          'Copy',
          'Design',
          'Dev',
          'AI',
          'Social Media',
          'CRM',
          'SEO/GEO',
          'General'
        );
      `);
      console.log('✓ Created new tasks_type_enum with all types');

      // Alter column back to enum
      await client.query(`
        ALTER TABLE tasks ALTER COLUMN type TYPE tasks_type_enum USING type::tasks_type_enum;
      `);
      console.log('✓ Updated tasks.type column to use new enum');
    } else {
      console.log('✓ All new task types already exist in enum');
    }

    // Verify the enum values
    const finalProjectCheck = await client.query(`
      SELECT unnest(enum_range(NULL::project_stage_enum))::text as enum_value;
    `);
    console.log('\nFinal project_stage_enum values:', finalProjectCheck.rows.map(r => r.enum_value));

    const finalTaskCheck = await client.query(`
      SELECT unnest(enum_range(NULL::tasks_type_enum))::text as enum_value;
    `);
    console.log('\nFinal tasks_type_enum values:', finalTaskCheck.rows.map(r => r.enum_value));

    console.log('\n✅ Stage enum migration completed successfully!');
  } catch (error) {
    console.error('❌ Error running migration:', error.message);
    console.error('Full error:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

addNewStagesEnum();

