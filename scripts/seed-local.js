/**
 * Seed a LOCAL development database with test users and sample projects.
 *
 * Local test logins (all share the password below; local DB only):
 *   head.pm@telos.local     Project Manager + Head PM
 *   pm@telos.local          Project Manager
 *   founder@telos.local     FOUNDER/CEO
 *   designer@telos.local    Designer
 *   copy@telos.local        Copy Writing
 *   dev@telos.local         Developer
 *   Password: telos-local-2026
 *
 * Usage (backend must be running against the same local DB, default http://localhost:3000):
 *   LOCAL_DATABASE_URL=postgresql://$USER@localhost:5432/telos_local node scripts/seed-local.js
 *
 * Refuses to run against any non-localhost database.
 */
const { Client } = require('pg');
const bcrypt = require('bcryptjs');

const DB_URL = process.env.LOCAL_DATABASE_URL || `postgresql://${process.env.USER}@localhost:5432/telos_local`;
const API = process.env.LOCAL_API_URL || 'http://localhost:3000';
const PASSWORD = 'telos-local-2026';

const host = new URL(DB_URL).hostname;
if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
  console.error(`Refusing to seed non-local database host: ${host}`);
  process.exit(1);
}

const USERS = [
  { name: 'Local Head PM', email: 'head.pm@telos.local', role: 'Project Manager', isHeadPM: true },
  { name: 'Local PM', email: 'pm@telos.local', role: 'Project Manager' },
  { name: 'Local Founder', email: 'founder@telos.local', role: 'FOUNDER/CEO' },
  { name: 'Dana Designer', email: 'designer@telos.local', role: 'Designer' },
  { name: 'Cory Copy', email: 'copy@telos.local', role: 'Copy Writing' },
  { name: 'Devon Dev', email: 'dev@telos.local', role: 'Developer' },
];

const PROJECTS = [
  ['Amanda Lopez', 'ICON', 'Standard', 'Medium', 'Onboarding'],
  ['Amanda Reyes', 'STAR', 'Premium', 'High', 'Copy'],
  ['Ronnie Barnard', 'Katalyst', 'Standard', 'Urgent', 'Design'],
  ['Veronica Redmond', 'ICON', 'ICON Package', 'High', 'Design Revision'],
  ['Rita Conerton', 'Private', 'Starter', 'Low', 'Copy Revision'],
  ['Helge Rynning', 'STAR', 'Standard', 'Medium', 'Dev'],
  ['Mike Fortier', 'Premium', 'Premium', 'Medium', 'AI Team'],
  ['Ann Evans', 'Powered-Up', 'Standard', 'High', 'Social Media Team'],
  ['Jorge Mercado', 'Katalyst', 'Starter', 'Low', 'CRM'],
  ['Sonia Hart', 'ICON', 'Standard', 'Medium', 'SEO/GEO Team'],
  ['Leo Brandt', 'STAR', 'Starter', 'Low', 'Ready to Close'],
  ['Mia Chen', 'Rapid Prospect', 'Starter', 'Medium', 'Onboarding'],
];

const api = async (path, { method = 'GET', token, body } = {}) => {
  const res = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
};

(async () => {
  const db = new Client({ connectionString: DB_URL });
  await db.connect();

  const hash = await bcrypt.hash(PASSWORD, 10);
  const ids = {};
  for (const u of USERS) {
    const { rows } = await db.query(
      `INSERT INTO users (name, email, password, role, "isHeadPM")
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [u.name, u.email, hash, u.role, !!u.isHeadPM],
    );
    ids[u.email] = rows[0].id;
  }
  console.log(`users: ${USERS.length}`);

  const { token } = await api('/auth/login', { method: 'POST', body: { email: 'head.pm@telos.local', password: PASSWORD } });

  const { rows: existing } = await db.query('SELECT count(*)::int AS n FROM projects');
  if (existing[0].n > 0) {
    console.log(`projects already present (${existing[0].n}); skipping project seed`);
  } else {
    await seedProjects(db, token, ids);
  }

  const { rows: existingDeliverables } = await db.query('SELECT count(*)::int AS n FROM deliverables');
  if (existingDeliverables[0].n > 0) {
    console.log(`deliverables already present (${existingDeliverables[0].n}); skipping deliverable seed`);
  } else {
    await seedDeliverables(db, token, ids);
  }

  await db.end();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});

async function seedProjects(db, token, ids) {
  const month = new Date();
  month.setMonth(month.getMonth() + 2);
  const targetCloseMonth = month.toISOString().slice(0, 7);

  for (const [i, [clientName, clientType, pkg, priority, stage]] of PROJECTS.entries()) {
    const project = await api('/projects', {
      method: 'POST',
      token,
      body: {
        clientName, clientType, package: pkg, priority, targetCloseMonth,
        pmId: i % 2 ? ids['pm@telos.local'] : ids['head.pm@telos.local'],
        notes: 'Seeded for local testing.',
      },
    });
    await db.query('UPDATE projects SET stage = $1 WHERE id = $2', [stage, project.id]);
  }
  console.log(`projects: ${PROJECTS.length}`);

  // Spread due dates (some overdue, some due soon) and assignees so dashboards have content
  const workers = [ids['designer@telos.local'], ids['copy@telos.local'], ids['dev@telos.local']];
  const { rows: tasks } = await db.query('SELECT id FROM tasks ORDER BY "createdAt", id');
  for (const [i, t] of tasks.entries()) {
    await db.query(
      `UPDATE tasks SET "dueDate" = CURRENT_DATE + ($1::int), "assignedToId" = $2 WHERE id = $3`,
      [(i % 14) - 4, i % 4 === 3 ? null : workers[i % workers.length], t.id],
    );
  }
  console.log(`tasks updated: ${tasks.length}`);
}

// Deliverables are added manually by PMs in the app, so new projects start with none.
// Give every non-Onboarding project a realistic set, with linked work tasks so the
// Deliverables board, Unassigned Tasks and Files & Links have content.
const DELIVERABLE_STATUSES = ['Not Started', 'In Progress', 'Ready for Review', 'Client Review', 'Approved', 'Revision'];
const TASKS_FOR_DELIVERABLE = {
  Logo: [['Design', 'Logo concepts']],
  'Brand Book': [['Copy', 'Brand book copy'], ['Design', 'Brand book layout']],
  'Home Page': [['Design', 'Homepage design'], ['Dev', 'Homepage build']],
  'Copy of Home Page': [['Copy', 'Homepage copy']],
  'Speaker Kit': [['Copy', 'Speaker kit copy'], ['Design', 'Speaker kit design']],
  'Social Banners': [['Design', 'Social media banners']],
  Other: [['Design', 'Pitch deck slides']],
};

async function seedDeliverables(db, token, ids) {
  const { rows: projects } = await db.query(
    `SELECT id, "clientName", "clientType", stage FROM projects WHERE stage <> 'Onboarding' ORDER BY "clientName"`,
  );
  const workers = { Copy: ids['copy@telos.local'], Design: ids['designer@telos.local'], Dev: ids['dev@telos.local'] };
  let deliverableCount = 0;
  let taskCount = 0;

  for (const [pi, project] of projects.entries()) {
    const types = ['Logo', 'Brand Book', 'Home Page', 'Copy of Home Page'];
    if (['ICON', 'Premium', 'STAR'].includes(project.clientType)) types.push('Speaker Kit', 'Social Banners');
    if (pi % 3 === 0) types.push('Other');

    for (const [di, type] of types.entries()) {
      const deliverable = await api('/deliverables', {
        method: 'POST',
        token,
        body: { projectId: project.id, type, ...(type === 'Other' ? { customType: 'Pitch Deck' } : {}) },
      });
      deliverableCount++;

      const status = DELIVERABLE_STATUSES[(pi + di) % DELIVERABLE_STATUSES.length];
      if (status !== 'Not Started') {
        await api(`/deliverables/${deliverable.id}/status`, { method: 'PATCH', token, body: { status } });
      }

      for (const [ti, [taskType, title]] of TASKS_FOR_DELIVERABLE[type].entries()) {
        const done = status === 'Approved';
        const task = await api('/tasks', {
          method: 'POST',
          token,
          body: {
            title: `${title} — ${project.clientName}`,
            projectId: project.id,
            type: taskType,
            deliverableId: deliverable.id,
            assignedToId: (pi + di + ti) % 5 === 4 ? undefined : workers[taskType],
            status: done ? 'Completed' : status === 'Not Started' ? 'Todo' : 'In Progress',
          },
        });
        taskCount++;
        // Due dates around today; some work already has a shared file
        await db.query(
          `UPDATE tasks SET "dueDate" = CURRENT_DATE + ($1::int), "isCompleted" = $2, "fileUrl" = $3 WHERE id = $4`,
          [((pi * 3 + di + ti) % 12) - 3, done, ['Ready for Review', 'Client Review', 'Approved'].includes(status)
            ? `https://www.figma.com/file/local-seed-${task.id.slice(0, 8)}` : null, task.id],
        );
      }
    }

    // One stray task per project with no deliverable, for the Unassigned Tasks tab
    await api('/tasks', {
      method: 'POST',
      token,
      body: { title: `Quick fixes — ${project.clientName}`, projectId: project.id, type: 'Design', status: 'Todo' },
    });
    taskCount++;
  }
  console.log(`deliverables: ${deliverableCount} across ${projects.length} projects; work tasks: ${taskCount}`);
}
