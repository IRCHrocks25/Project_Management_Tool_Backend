// Read-only audit: finds every column holding a res.cloudinary.com URL and
// reports how many of those URLs the Iceberg migration map can resolve.
const { Client } = require('pg');
const fs = require('fs');
require('dotenv').config();

// Iceberg's cloudinary_url -> iceberg_url map (docs/asset-url-map.csv in the
// katalyst-iceberg repo). Override with ICEBERG_ASSET_MAP.
const MAP_CSV = process.env.ICEBERG_ASSET_MAP;
const URL_RE = /https?:\/\/res\.cloudinary\.com\/[^\s"'<>)\]]+/g;

// Strips transformation and version segments so a stored URL can be compared
// against the version-less keys the migration map uses.
function toKey(url) {
  const m = url.match(
    /res\.cloudinary\.com\/([^/]+)\/(image|video|raw)\/upload\/(?:[a-z]_[^/,]+(?:,[a-z]_[^/,]+)*\/)?(?:v\d+\/)?(.+)$/,
  );
  return m ? { type: m[2], path: m[3] } : null;
}

async function main() {
  if (!MAP_CSV) {
    console.error('Set ICEBERG_ASSET_MAP to the path of asset-url-map.csv');
    process.exit(1);
  }

  const migrated = new Set();
  for (const line of fs.readFileSync(MAP_CSV, 'utf8').split('\n').slice(1)) {
    const key = toKey(line.split(',')[0] || '');
    if (key) migrated.add(key.path);
  }
  console.log(`migration map: ${migrated.size} assets\n`);

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  const { rows: columns } = await client.query(`
    SELECT table_name, column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND data_type IN ('text','character varying','json','jsonb','ARRAY')
    ORDER BY table_name, column_name
  `);

  const found = [];
  const all = new Map(); // url -> occurrences

  for (const col of columns) {
    const ref = `"${col.table_name}"."${col.column_name}"`;
    let res;
    try {
      res = await client.query(
        `SELECT ${ref}::text AS v FROM "${col.table_name}" WHERE ${ref}::text LIKE '%res.cloudinary.com%'`,
      );
    } catch {
      continue; // column type won't cast to text
    }
    if (!res.rows.length) continue;

    let urls = 0;
    for (const r of res.rows) {
      for (const u of r.v.match(URL_RE) || []) {
        urls++;
        all.set(u, (all.get(u) || 0) + 1);
      }
    }
    found.push({ where: `${col.table_name}.${col.column_name}`, rows: res.rows.length, urls });
  }

  console.log('COLUMNS CONTAINING CLOUDINARY URLS');
  for (const f of found.sort((a, b) => b.urls - a.urls)) {
    console.log(`  ${f.where.padEnd(52)} ${String(f.rows).padStart(5)} rows  ${String(f.urls).padStart(5)} urls`);
  }

  const byType = {};
  let resolvable = 0;
  const missing = [];
  for (const u of all.keys()) {
    const k = toKey(u);
    const t = k ? k.type : 'unparseable';
    byType[t] = (byType[t] || 0) + 1;
    if (k && migrated.has(k.path)) resolvable++;
    else missing.push(u);
  }

  console.log(`\nDISTINCT URLS: ${all.size}`);
  for (const [t, n] of Object.entries(byType)) console.log(`  ${t.padEnd(14)} ${n}`);
  console.log(`\nresolvable via migration map: ${resolvable}`);
  console.log(`NOT in migration map:         ${missing.length}`);

  const missingByType = {};
  for (const u of missing) {
    const k = toKey(u);
    const t = k ? k.type : 'unparseable';
    missingByType[t] = (missingByType[t] || 0) + 1;
  }
  for (const [t, n] of Object.entries(missingByType)) console.log(`  missing ${t.padEnd(14)} ${n}`);
  console.log('\nsample missing:');
  missing.slice(0, 12).forEach((u) => console.log(`  ${u}`));

  await client.end();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
