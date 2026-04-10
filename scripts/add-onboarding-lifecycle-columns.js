// Script to add onboarding lifecycle columns to projects table
// Run with: node scripts/add-onboarding-lifecycle-columns.js

const { Client } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function addOnboardingLifecycleColumns() {
  const config = process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl:
          process.env.DATABASE_URL.includes('railway') ||
          process.env.DATABASE_URL.includes('trolley.proxy.rlwy.net')
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

  const phaseEnum = 'projects_onboardingphase_enum';
  const statusEnum = 'projects_onboardingphasestatus_enum';

  try {
    await client.connect();
    console.log('Connected to database');

    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = '${phaseEnum}') THEN
          CREATE TYPE ${phaseEnum} AS ENUM (
            'Payment Confirmed',
            'Welcome + Call Booking',
            'Onboarding Call',
            'Credential Collection',
            'Follow-Up Call',
            'Soft Launch',
            'Background QA Monitoring',
            'Full Go-Live'
          );
        END IF;
      END$$;
    `);
    console.log(`✓ Ensured ${phaseEnum} exists`);

    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = '${statusEnum}') THEN
          CREATE TYPE ${statusEnum} AS ENUM (
            'Not Started',
            'In Progress',
            'Completed',
            'Blocked'
          );
        END IF;
      END$$;
    `);
    console.log(`✓ Ensured ${statusEnum} exists`);

    await client.query(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS "onboardingPhase" ${phaseEnum}`);
    await client.query(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS "onboardingPhaseStatus" ${statusEnum}`);
    await client.query(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS "onboardingStartedAt" TIMESTAMP`);
    await client.query(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS "onboardingCompletedAt" TIMESTAMP`);
    await client.query(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS "onboardingMilestones" JSONB`);
    await client.query(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS "onboardingManagerId" UUID`);
    await client.query(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS "automationSpecialistId" UUID`);
    await client.query(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS "qaSpecialistId" UUID`);

    console.log('✓ Added onboarding lifecycle columns to projects');
    console.log('\n✅ Migration completed successfully!');
  } catch (error) {
    console.error('❌ Error running migration:', error.message);
    console.error('Full error:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

addOnboardingLifecycleColumns();
