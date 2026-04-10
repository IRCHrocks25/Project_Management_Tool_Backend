// Script to add Rapid Prospect to client_type_enum in PostgreSQL
// Run with: node scripts/add-rapid-prospect-client-type.js

const { Client } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function addRapidProspectClientType() {
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

  try {
    await client.connect();
    console.log('Connected to database');

    const enumTypeName = 'client_type_enum';
    const newValue = 'Rapid Prospect';

    const existsQuery = await client.query(
      `
      SELECT 1
      FROM pg_type t
      JOIN pg_enum e ON t.oid = e.enumtypid
      WHERE t.typname = $1 AND e.enumlabel = $2
      LIMIT 1
      `,
      [enumTypeName, newValue],
    );

    if (existsQuery.rows.length > 0) {
      console.log(`✓ "${newValue}" already exists in ${enumTypeName}`);
      console.log('\n✅ Migration completed successfully!');
      return;
    }

    await client.query(`ALTER TYPE ${enumTypeName} ADD VALUE '${newValue}'`);
    console.log(`✓ Added "${newValue}" to ${enumTypeName}`);

    const values = await client.query(
      `SELECT unnest(enum_range(NULL::${enumTypeName}))::text as enum_value`,
    );
    console.log(`Current ${enumTypeName} values:`, values.rows.map((r) => r.enum_value));

    console.log('\n✅ Migration completed successfully!');
  } catch (error) {
    console.error('❌ Error running migration:', error.message);
    console.error('Full error:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

addRapidProspectClientType();
