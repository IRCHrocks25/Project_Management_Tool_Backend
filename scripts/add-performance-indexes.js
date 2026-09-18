const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const LOG_PREFIX = '[migrate:performance-indexes]';

/**
 * CREATE INDEX CONCURRENTLY cannot run inside a transaction block, and node-pg
 * wraps a multi-statement query string in an implicit one. So the file is split
 * and each statement is sent on its own.
 */
function readStatements() {
  const sql = fs.readFileSync(
    path.join(__dirname, '../migrations/add-performance-indexes.sql'),
    'utf8',
  );

  return sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean);
}

async function runMigration() {
  const connectionString =
    process.env.DATABASE_URL ||
    `postgresql://${process.env.DB_USERNAME}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_DATABASE}`;

  const client = new Client({
    connectionString,
    ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
  });

  const statements = readStatements();
  let failures = 0;

  try {
    await client.connect();
    console.log(`${LOG_PREFIX} Connected to database`);
    console.log(`${LOG_PREFIX} Applying ${statements.length} indexes`);

    for (const [index, statement] of statements.entries()) {
      const name = statement.match(/"(IDX_[^"]+)"/)?.[1] || `statement ${index + 1}`;
      const startedAt = Date.now();

      try {
        await client.query(statement);
        console.log(`${LOG_PREFIX} ${name} (${Date.now() - startedAt}ms)`);
      } catch (error) {
        // Keep going: a failure on one index should not block the rest.
        failures += 1;
        console.error(`${LOG_PREFIX} ${name} FAILED: ${error.message}`);
      }
    }

    // A cancelled or failed CONCURRENTLY build leaves an unusable index behind.
    const { rows: invalid } = await client.query(`
      SELECT c.relname AS index_name
      FROM pg_index i
      JOIN pg_class c ON c.oid = i.indexrelid
      WHERE NOT i.indisvalid AND c.relname LIKE 'IDX_%'
    `);

    if (invalid.length > 0) {
      console.warn(
        `${LOG_PREFIX} Invalid indexes left behind, drop and re-run: ${invalid
          .map((row) => row.index_name)
          .join(', ')}`,
      );
    }

    if (failures > 0) {
      console.error(`${LOG_PREFIX} Migration finished with ${failures} failure(s)`);
      process.exit(1);
    }

    console.log(`${LOG_PREFIX} Migration completed successfully`);
  } catch (error) {
    console.error(`${LOG_PREFIX} Migration failed:`, error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigration();
