/* eslint-disable no-console */
/*
 * One-off verification for the /board-view endpoint (Phase 2 checkpoint).
 *
 * - Bootstraps a NestApplicationContext from the compiled dist so the
 *   BoardViewService can be resolved with its real DI graph (no HTTP, no
 *   JWT needed; we call svc.getBoardView() as if we were the controller).
 * - Picks a single real project that exercises the interesting code paths
 *   (multi-deliverable, mixed statuses, ≥1 orphan, real PM, ideally marker
 *   tasks). Falls back to closest match if no project hits everything.
 * - Dumps single-project + global responses to scripts/output/.
 * - Spot-checks getTaskColumn parity between the backend mirror and the
 *   frontend canonical helper (ts-node-loaded).
 * - Re-derives rollups in raw SQL and asserts they match the service.
 * - Reports null-rate stats so we know which fallbacks the UI will hit.
 *
 * Read-only. No writes to the database. Only ever runs SELECT.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const OUTPUT_DIR = path.join(__dirname, 'output');
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const BACKEND_DIST = path.join(__dirname, '..', 'dist');
const FRONTEND_UTIL = path.join(__dirname, '..', '..', 'frontend', 'src', 'utils', 'taskKanbanColumn.ts');

function getPgClient() {
  return new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
  });
}

function redactClientName(s) {
  if (!s) return s;
  return `<${s.length}-char-name>`;
}

function redactProjectsTree(tree) {
  return tree.map((p) => ({ ...p, name: redactClientName(p.name) }));
}

function redactResponse(response) {
  return { ...response, projects: redactProjectsTree(response.projects) };
}

async function pickProject(pg) {
  const sql = `
    SELECT
      p.id,
      p."clientName",
      p."pmId",
      COUNT(DISTINCT d.id)                                   AS deliverable_count,
      COUNT(DISTINCT t.id)                                   AS task_count,
      COUNT(DISTINCT t.id) FILTER (WHERE t."deliverableId" IS NULL)   AS orphan_count,
      COUNT(DISTINCT t.status)                               AS distinct_statuses,
      COUNT(DISTINCT t.id) FILTER (WHERE t.description LIKE '%--- Column:%') AS marker_tasks,
      (p."pmId" IS NOT NULL)                                 AS has_pm
    FROM projects p
    LEFT JOIN deliverables d ON d."projectId" = p.id
    LEFT JOIN tasks t        ON t."projectId" = p.id AND t."isArchived" = false
    WHERE p."isArchived" = false AND p."isCompleted" = false
    GROUP BY p.id
    ORDER BY
      (COUNT(DISTINCT d.id) >= 2)::int DESC,
      (COUNT(DISTINCT t.id) >= 5)::int DESC,
      (COUNT(DISTINCT t.id) FILTER (WHERE t."deliverableId" IS NULL) >= 1)::int DESC,
      (COUNT(DISTINCT t.status) >= 2)::int DESC,
      (p."pmId" IS NOT NULL)::int DESC,
      marker_tasks DESC,
      task_count DESC
    LIMIT 5
  `;
  const { rows } = await pg.query(sql);
  if (rows.length === 0) throw new Error('No active projects in database');
  const top = rows[0];
  const missing = [];
  if (top.deliverable_count < 2) missing.push(`deliverables<2 (got ${top.deliverable_count})`);
  if (top.task_count < 5) missing.push(`tasks<5 (got ${top.task_count})`);
  if (top.orphan_count < 1) missing.push(`orphans<1 (got ${top.orphan_count})`);
  if (top.distinct_statuses < 2) missing.push(`distinct_statuses<2 (got ${top.distinct_statuses})`);
  if (!top.has_pm) missing.push('no pm');
  if (top.marker_tasks < 1) missing.push(`no description-marker tasks`);
  return { top, missing, candidates: rows };
}

async function loadFrontendGetTaskColumn() {
  // Compile the frontend util on the fly so we can call its getTaskColumn
  // alongside the backend mirror. We do NOT use ts-node's hooked require
  // because the frontend file lives outside backend/'s tsconfig. Instead
  // we transpile once in-process and eval into a fresh module.
  const ts = require('typescript');
  const src = fs.readFileSync(FRONTEND_UTIL, 'utf8');
  const out = ts.transpileModule(src, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2019,
      esModuleInterop: true,
    },
  });
  const m = { exports: {} };
  // eslint-disable-next-line no-new-func
  new Function('module', 'exports', 'require', out.outputText)(m, m.exports, require);
  return m.exports;
}

async function rollupCheck(pg, projectId, response) {
  const project = response[0];
  if (!project) return { ok: false, reason: 'service returned empty array' };

  // Project totals
  const totalsSql = `
    SELECT
      COUNT(*)::int AS total_tasks,
      COUNT(*) FILTER (WHERE "isCompleted" = true OR status = 'Completed')::int AS done_tasks,
      COUNT(*) FILTER (WHERE "deliverableId" IS NULL)::int AS orphans
    FROM tasks
    WHERE "projectId" = $1 AND "isArchived" = false
  `;
  const { rows: [totals] } = await pg.query(totalsSql, [projectId]);

  const projectIssues = [];
  if (totals.total_tasks !== project.rollup.total) {
    projectIssues.push(`project.rollup.total=${project.rollup.total} but SQL=${totals.total_tasks}`);
  }
  if (totals.done_tasks !== project.rollup.done) {
    projectIssues.push(`project.rollup.done=${project.rollup.done} but SQL=${totals.done_tasks}`);
  }

  // Per-deliverable
  const perDelivSql = `
    SELECT
      d.id::text AS id,
      COUNT(t.id)::int AS total,
      COUNT(t.id) FILTER (WHERE t."isCompleted" = true OR t.status = 'Completed')::int AS done
    FROM deliverables d
    LEFT JOIN tasks t ON t."deliverableId" = d.id AND t."isArchived" = false
    WHERE d."projectId" = $1
    GROUP BY d.id
  `;
  const { rows: perDeliv } = await pg.query(perDelivSql, [projectId]);
  const sqlByDeliv = new Map(perDeliv.map((r) => [r.id, r]));

  const delivIssues = [];
  for (const d of project.deliverables) {
    if (d.id === '__unassigned__') {
      // Compare to the SQL "orphans" count
      if (d.rollup.total !== totals.orphans) {
        delivIssues.push(`__unassigned__ total=${d.rollup.total} but SQL orphans=${totals.orphans}`);
      }
      continue;
    }
    const sqlRow = sqlByDeliv.get(d.id);
    if (!sqlRow) {
      delivIssues.push(`deliverable ${d.id}: no matching SQL row`);
      continue;
    }
    if (sqlRow.total !== d.rollup.total) {
      delivIssues.push(`deliverable ${d.id}: rollup.total=${d.rollup.total} but SQL=${sqlRow.total}`);
    }
    if (sqlRow.done !== d.rollup.done) {
      delivIssues.push(`deliverable ${d.id}: rollup.done=${d.rollup.done} but SQL=${sqlRow.done}`);
    }
  }

  return {
    ok: projectIssues.length === 0 && delivIssues.length === 0,
    project: { ...totals, response: project.rollup, issues: projectIssues },
    deliverables: { issues: delivIssues, count: project.deliverables.length },
  };
}

function pickThreeTasks(project) {
  const allTasks = [];
  for (const d of project.deliverables) {
    for (const t of d.tasks) allTasks.push({ ...t, _deliverableId: d.id });
  }
  const completed = allTasks.find((t) => t.kanbanColumnId === 'approved_completed');
  const marker = allTasks.find(
    (t) => t.description && /--- Column: [^-]+ ---/.test(t.description) && !t.isCompleted,
  );
  const todoUnassigned = allTasks.find(
    (t) => t.kanbanColumnId === 'not_started' && (!t.assignees || t.assignees.length === 0),
  );
  const fallback = allTasks[0];
  const picks = [completed, marker, todoUnassigned].map((t) => t || fallback);
  // De-dup if fallbacks collapsed to one task
  const seen = new Set();
  return picks.filter((t) => t && !seen.has(t.id) && seen.add(t.id));
}

async function parityCheck(picks, frontendGetCol, backendGetCol) {
  const results = [];
  for (const t of picks) {
    const input = {
      status: t.status,
      isCompleted: t.isCompleted,
      description: t.description,
      assignedToId: (t.assignees && t.assignees[0] && t.assignees[0].id) || null,
    };
    const fe = frontendGetCol(input);
    const be = backendGetCol(input);
    const same = fe.id === be.id && fe.label === be.label && fe.color === be.color;
    results.push({
      taskId: t.id,
      input: { status: input.status, isCompleted: input.isCompleted, hasMarker: !!(input.description || '').match(/--- Column:/), assigned: !!input.assignedToId },
      frontend: { id: fe.id, label: fe.label, color: fe.color },
      backend: { id: be.id, label: be.label, color: be.color },
      endpoint: { id: t.kanbanColumnId, label: t.kanbanColumnLabel },
      pass: same && t.kanbanColumnId === be.id,
    });
  }
  return results;
}

function nullRateStats(global) {
  const totals = { projects: 0, tasks: 0 };
  const counts = {
    project_no_clientStartDate: 0,
    project_no_pm: 0,
    task_no_deliverableId: 0,
    task_no_dueDate: 0,
    task_no_assignees: 0,
  };
  for (const p of global) {
    totals.projects += 1;
    if (!p.clientStartDate) counts.project_no_clientStartDate += 1;
    if (!p.pm) counts.project_no_pm += 1;
    for (const d of p.deliverables) {
      for (const t of d.tasks) {
        totals.tasks += 1;
        if (!t.deliverableId) counts.task_no_deliverableId += 1;
        if (!t.dueDate) counts.task_no_dueDate += 1;
        if (!t.assignees || t.assignees.length === 0) counts.task_no_assignees += 1;
      }
    }
  }
  const pct = (n, total) => (total === 0 ? '0.0%' : `${((n / total) * 100).toFixed(1)}%`);
  return {
    totals,
    rates: {
      project_no_clientStartDate: `${counts.project_no_clientStartDate}/${totals.projects} (${pct(counts.project_no_clientStartDate, totals.projects)})`,
      project_no_pm:              `${counts.project_no_pm}/${totals.projects} (${pct(counts.project_no_pm, totals.projects)})`,
      task_no_deliverableId:      `${counts.task_no_deliverableId}/${totals.tasks} (${pct(counts.task_no_deliverableId, totals.tasks)})`,
      task_no_dueDate:            `${counts.task_no_dueDate}/${totals.tasks} (${pct(counts.task_no_dueDate, totals.tasks)})`,
      task_no_assignees:          `${counts.task_no_assignees}/${totals.tasks} (${pct(counts.task_no_assignees, totals.tasks)})`,
    },
  };
}

async function main() {
  console.log('[verify] Bootstrapping NestApplicationContext from dist...');
  const { NestFactory } = require('@nestjs/core');
  const { AppModule } = require(path.join(BACKEND_DIST, 'app.module'));
  const { BoardViewService } = require(path.join(BACKEND_DIST, 'board-view', 'board-view.service'));
  const backendKanban = require(path.join(BACKEND_DIST, 'board-view', 'utils', 'task-kanban-column'));

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const svc = app.get(BoardViewService);

    const pg = getPgClient();
    await pg.connect();

    console.log('\n[verify] STEP 1 — picking a project...');
    const { top, missing, candidates } = await pickProject(pg);
    console.log(`  Picked project: ${top.id}`);
    console.log(`    deliverables=${top.deliverable_count}, tasks=${top.task_count}, orphans=${top.orphan_count}, distinct_statuses=${top.distinct_statuses}, marker_tasks=${top.marker_tasks}, has_pm=${top.has_pm}`);
    if (missing.length > 0) {
      console.log(`  ⚠ Missing criteria: ${missing.join(', ')}`);
    } else {
      console.log('  ✓ All criteria satisfied');
    }
    console.log(`  (Top-5 candidates also written to console below for transparency)`);
    console.log(JSON.stringify(candidates.map((c) => ({ id: c.id, deliv: c.deliverable_count, tasks: c.task_count, orphans: c.orphan_count, statuses: c.distinct_statuses, markers: c.marker_tasks })), null, 2));

    console.log('\n[verify] STEP 2 — single-project response...');
    // PM-gate dropped (Phase 5b decision): all authenticated callers see
    // every active project. This script doesn't authenticate (it calls
    // the service directly) — just provide a projectId filter.
    const single = await svc.getBoardView({ page: 1, pageSize: 50, projectId: top.id });
    const singlePath = path.join(OUTPUT_DIR, 'board-view-single.json');
    fs.writeFileSync(singlePath, JSON.stringify(redactResponse(single), null, 2));
    console.log(`  Wrote ${singlePath} (${(fs.statSync(singlePath).size / 1024).toFixed(2)} KB)`);
    console.log(`  totalCount=${single.totalCount} page=${single.page}/${single.totalPages} pageSize=${single.pageSize}`);
    if (single.projects.length === 0) throw new Error('Single-project query returned empty');
    const project = single.projects[0];

    console.log('\n[verify] STEP 3 — paginated page-1 response stats...');
    const t0 = Date.now();
    const page1 = await svc.getBoardView({ page: 1, pageSize: 50 });
    const elapsedMs = Date.now() - t0;
    const page1Json = JSON.stringify(redactResponse(page1));
    const page1Path = path.join(OUTPUT_DIR, 'board-view-global.json');
    fs.writeFileSync(page1Path, page1Json);
    console.log(`  Page 1 projects: ${page1.projects.length}`);
    console.log(`  totalCount: ${page1.totalCount} (across ${page1.totalPages} pages of ${page1.pageSize})`);
    console.log(`  JSON size (page only): ${(page1Json.length / 1024).toFixed(2)} KB`);
    console.log(`  Wall time: ${elapsedMs} ms`);
    console.log(`  Wrote ${page1Path}`);

    console.log('\n[verify] STEP 4 — parity check (3 tasks)...');
    const frontendKanban = await loadFrontendGetTaskColumn();
    const picks = pickThreeTasks(project);
    if (picks.length === 0) console.log('  ⚠ No tasks to spot-check');
    const parity = await parityCheck(picks, frontendKanban.getTaskColumn, backendKanban.getTaskColumn);
    for (const r of parity) {
      console.log(`  Task ${r.taskId}: ${r.pass ? 'PASS' : 'FAIL'}`);
      console.log(`    input: status=${r.input.status} isCompleted=${r.input.isCompleted} hasMarker=${r.input.hasMarker} assigned=${r.input.assigned}`);
      console.log(`    frontend: ${r.frontend.id}/${r.frontend.label}`);
      console.log(`    backend:  ${r.backend.id}/${r.backend.label}`);
      console.log(`    endpoint: ${r.endpoint.id}/${r.endpoint.label}`);
    }

    console.log('\n[verify] STEP 5 — rollup math...');
    const rollup = await rollupCheck(pg, top.id, single.projects);
    if (rollup.ok) {
      console.log('  ✓ Project total/done match SQL');
      console.log(`  ✓ All ${rollup.deliverables.count} deliverable rollups match SQL`);
    } else {
      console.log('  ✗ MISMATCH');
      if (rollup.project.issues.length) console.log('    project:', rollup.project.issues);
      if (rollup.deliverables.issues.length) console.log('    deliverables:', rollup.deliverables.issues);
    }

    console.log('\n[verify] STEP 6 — null-rate stats (page 1 sample)...');
    const stats = nullRateStats(page1.projects);
    console.log(`  totals (page-1 sample): projects=${stats.totals.projects}, tasks=${stats.totals.tasks}`);
    for (const [k, v] of Object.entries(stats.rates)) console.log(`    ${k}: ${v}`);

    // ── Phase 5b verifications ────────────────────────────────────────────
    console.log('\n[verify] STEP 7 — Department=[Design] filter (SQL path)...');
    const t7 = Date.now();
    const deptFiltered = await svc.getBoardView({ page: 1, pageSize: 50, dept: ['Design'] });
    const elapsed7 = Date.now() - t7;
    console.log(`  totalCount=${deptFiltered.totalCount} page=${deptFiltered.page}/${deptFiltered.totalPages}`);
    console.log(`  Wall time: ${elapsed7} ms`);
    // Sanity: every returned project must have at least one Design-type task
    let deptSanity = { ok: true, offending: null };
    for (const p of deptFiltered.projects) {
      const hasDesign = p.deliverables.some((d) => d.tasks.some((t) => t.type === 'Design'));
      if (!hasDesign) { deptSanity = { ok: false, offending: p.id }; break; }
    }
    console.log(`  Sanity (every project has ≥1 Design task): ${deptSanity.ok ? '✓ PASS' : `✗ FAIL — ${deptSanity.offending} has no Design task`}`);
    if (deptFiltered.totalCount >= page1.totalCount) {
      console.log(`  ⚠ Filter did not reduce count (got ${deptFiltered.totalCount} >= unfiltered ${page1.totalCount})`);
    } else {
      console.log(`  ✓ Filter reduced count from ${page1.totalCount} → ${deptFiltered.totalCount}`);
    }

    console.log('\n[verify] STEP 8 — status=[for_approval] filter (in-memory path)...');
    const t8 = Date.now();
    const statusFiltered = await svc.getBoardView({ page: 1, pageSize: 50, status: ['for_approval'] });
    const elapsed8 = Date.now() - t8;
    console.log(`  totalCount=${statusFiltered.totalCount} page=${statusFiltered.page}/${statusFiltered.totalPages}`);
    console.log(`  Wall time: ${elapsed8} ms`);
    let statusSanity = { ok: true, offending: null };
    for (const p of statusFiltered.projects) {
      const hasForApproval = p.deliverables.some((d) => d.tasks.some((t) => t.kanbanColumnId === 'for_approval'));
      if (!hasForApproval) { statusSanity = { ok: false, offending: p.id }; break; }
    }
    console.log(`  Sanity (every project has ≥1 for_approval task): ${statusSanity.ok ? '✓ PASS' : `✗ FAIL — ${statusSanity.offending} has none`}`);
    if (statusFiltered.totalCount >= page1.totalCount) {
      console.log(`  ⚠ Status filter did not reduce count`);
    } else {
      console.log(`  ✓ Status filter reduced count from ${page1.totalCount} → ${statusFiltered.totalCount}`);
    }

    console.log('\n[verify] DONE');
    await pg.end();
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error('[verify] FAILED:', err);
  process.exit(1);
});
