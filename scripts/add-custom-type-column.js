const { Client } = require('pg');
require('dotenv').config();

async function addCustomTypeColumn() {
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

    // Check if customType column exists
    const res = await client.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name='deliverables' and column_name='customType';
    `);

    if (res.rows.length === 0) {
      await client.query(`
        ALTER TABLE deliverables ADD COLUMN "customType" TEXT;
      `);
      console.log('✓ Added customType column');
    } else {
      console.log('✓ customType column already exists');
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

addCustomTypeColumn();

