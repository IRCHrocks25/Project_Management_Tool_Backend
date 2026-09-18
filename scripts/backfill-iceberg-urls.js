/**
 * Rewrites stored Cloudinary URLs to their Iceberg equivalents.
 *
 * The Cloudinary account is disabled, so every stored res.cloudinary.com URL is
 * already broken. Only assets present in Iceberg's migration map can be fixed;
 * the rest are reported and left untouched so the dead URL still shows what the
 * row used to point at.
 *
 * Dry run by default. Pass --apply to write.
 */
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Iceberg's cloudinary_url -> iceberg_url map (docs/asset-url-map.csv in the
// katalyst-iceberg repo).
const MAP_CSV = process.env.ICEBERG_ASSET_MAP;

const URL_RE = /https?:\/\/res\.cloudinary\.com\/[^\s"'<>)\]]+/g;
const APPLY = process.argv.includes('--apply');

// Columns holding Cloudinary URLs, as found by scripts/audit-cloudinary-urls.js.
// jsonb columns are rewritten as text and cast back, which is safe here because
// only the URL substring changes.
const TARGETS = [
  { table: 'tasks', column: 'description', cast: 'text' },
  { table: 'tasks', column: 'fileUrl', cast: 'text' },
  { table: 'deliverable_history', column: 'fileUrl', cast: 'text' },
  { table: 'task_attachments', column: 'url', cast: 'text' },
  { table: 'deliverables', column: 'fileUrl', cast: 'text' },
  { table: 'users', column: 'avatarUrl', cast: 'text' },
  { table: 'client_update_forms', column: 'blocks', cast: 'jsonb' },
  { table: 'task_questions', column: 'text', cast: 'text' },
  { table: 'chat_messages', column: 'content', cast: 'text' },
];

// Strips transformation and version segments so a stored URL matches the
// version-less keys the migration map uses.
function toPath(url) {
  const m = url.match(
    /res\.cloudinary\.com\/[^/]+\/(image|video|raw)\/upload\/(?:[a-z]_[^/,]+(?:,[a-z]_[^/,]+)*\/)?(?:v\d+\/)?(.+)$/,
  );
  return m ? m[2] : null;
}

function loadMap() {
  const map = new Map(); // cloudinary path -> iceberg url
  const lines = fs.readFileSync(MAP_CSV, 'utf8').split('\n').slice(1);
  for (const line of lines) {
    const [cloudinaryUrl, icebergUrl] = line.split(',');
    if (!cloudinaryUrl || !icebergUrl) continue;
    const path = toPath(cloudinaryUrl.trim());
    if (path) map.set(path, icebergUrl.trim());
  }
  return map;
}

async function main() {
  if (!MAP_CSV) {
    console.error('Set ICEBERG_ASSET_MAP to the path of asset-url-map.csv');
    process.exit(1);
  }

  const map = loadMap();
  console.log(`[backfill] migration map: ${map.size} assets`);
  console.log(`[backfill] mode: ${APPLY ? 'APPLY (writing)' : 'DRY RUN (use --apply to write)'}\n`);

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  let totalRows = 0;
  let totalRewritten = 0;
  const unresolved = new Map(); // url -> occurrences

  if (APPLY) await client.query('BEGIN');

  try {
    for (const { table, column, cast } of TARGETS) {
      const ref = `"${table}"."${column}"`;
      const { rows } = await client.query(
        `SELECT id, ${ref}::text AS v FROM "${table}" WHERE ${ref}::text LIKE '%res.cloudinary.com%'`,
      );

      let changedRows = 0;
      let changedUrls = 0;

      for (const row of rows) {
        let next = row.v;
        for (const url of new Set(row.v.match(URL_RE) || [])) {
          const path = toPath(url);
          const replacement = path ? map.get(path) : null;
          if (!replacement) {
            unresolved.set(url, (unresolved.get(url) || 0) + 1);
            continue;
          }
          next = next.split(url).join(replacement);
          changedUrls++;
        }

        if (next === row.v) continue;
        changedRows++;
        if (APPLY) {
          await client.query(
            `UPDATE "${table}" SET ${ref} = $1::${cast} WHERE id = $2`,
            [next, row.id],
          );
        }
      }

      totalRows += changedRows;
      totalRewritten += changedUrls;
      console.log(
        `  ${`${table}.${column}`.padEnd(40)} ${String(rows.length).padStart(4)} matched  ` +
          `${String(changedRows).padStart(4)} rows rewritten  ${String(changedUrls).padStart(4)} urls`,
      );
    }

    if (APPLY) {
      await client.query('COMMIT');
      console.log('\n[backfill] committed');
    }
  } catch (error) {
    if (APPLY) await client.query('ROLLBACK');
    throw error;
  }

  console.log(`\n[backfill] rows rewritten: ${totalRows}  urls rewritten: ${totalRewritten}`);
  console.log(`[backfill] unresolvable urls (no Iceberg copy): ${unresolved.size}`);

  const report = [...unresolved.keys()].sort();
  if (report.length) {
    const out = path.join(__dirname, 'output', 'unresolvable-cloudinary-urls.txt');
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, report.join('\n') + '\n');
    console.log(`[backfill] wrote ${out}`);
  }

  await client.end();
}

main().catch((e) => {
  console.error('[backfill] failed:', e.message);
  process.exit(1);
});
