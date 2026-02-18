// Script to create deliverable_team_members table
// Run with: node scripts/create-deliverable-team-members-table.js

const { Client } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function createDeliverableTeamMembersTable() {
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

    // Check if table already exists
    const tableCheck = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_name='deliverable_team_members';
    `);

    if (tableCheck.rows.length > 0) {
      console.log('✓ deliverable_team_members table already exists');
    } else {
      // Create the table
      await client.query(`
        CREATE TABLE deliverable_team_members (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          "deliverableId" uuid NOT NULL REFERENCES deliverables(id) ON DELETE CASCADE,
          "userId" uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          "assignedAt" timestamp DEFAULT CURRENT_TIMESTAMP,
          UNIQUE("deliverableId", "userId")
        );
      `);
      console.log('✓ Created deliverable_team_members table');
    }

    // Create index for faster queries
    try {
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_deliverable_team_members_deliverable 
        ON deliverable_team_members("deliverableId");
      `);
      console.log('✓ Created index on deliverableId');
    } catch (err) {
      console.log('Index may already exist:', err.message);
    }

    try {
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_deliverable_team_members_user 
        ON deliverable_team_members("userId");
      `);
      console.log('✓ Created index on userId');
    } catch (err) {
      console.log('Index may already exist:', err.message);
    }

    console.log('\n✅ Migration completed successfully!');
  } catch (error) {
    console.error('❌ Error running migration:', error.message);
    console.error('Full error:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

createDeliverableTeamMembersTable();

