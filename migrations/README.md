# Database Migrations

## Add Head PM Flag

Adds `isHeadPM` to the `users` table for designating a Project Manager as "Head PM" (birds-eye view of all notifications).

### To apply:
```bash
cd Project_Management_Tool_Backend
npm run migrate:head-pm-flag
```

Or with psql:
```bash
psql -d your_database_name -f migrations/add-head-pm-flag.sql
```

Or run manually:
```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS "isHeadPM" BOOLEAN NOT NULL DEFAULT FALSE;
```

---

## Make Email Body Nullable

This migration makes the `body` column in the `emails` table nullable, allowing email logging without requiring a body field.

### To apply the migration:

**Option 1: Using the npm script (Recommended)**
```bash
cd backend
npm run migrate:email-body-nullable
```

**Option 2: Using the SQL script directly**
```bash
psql -d your_database_name -f migrations/make-email-body-nullable.sql
```

**Option 3: Manual SQL execution**
```sql
ALTER TABLE emails 
ALTER COLUMN body DROP NOT NULL;
```

### What this migration does:

- Makes the `body` column nullable in the `emails` table
- Allows creating email records without a body field
- Existing emails with body content remain unchanged

### Important:

**You must run this migration before the email logging feature will work.** The backend code expects the `body` column to be nullable. Without this migration, you'll get a 400 error when trying to log emails.

---

## Daily focus items (huddle pins + EOD)

Creates `daily_focus_items` for per-department daily task pins and end-of-day reporting.

### To apply

```bash
cd Project_Management_Tool_Backend
npm run migrate:daily-focus-items
```

### End-of-day rules

- **Completed tasks** included in the report are those with `isCompleted = true` **or** `status = Completed`, and `updatedAt` within the **org timezone** calendar day for the selected date (see `ORG_TIMEZONE` in `env.example`; default `UTC`).

---

## Daily focus — raise rank limit (existing DBs)

If you created `daily_focus_items` when the rank check was `<= 3`, run:

```bash
cd Project_Management_Tool_Backend
npm run migrate:daily-focus-rank-limit
```

This allows up to **50** ranks per department at the database level (the app uses `DAILY_FOCUS_MAX_RANK`, default 20).

---

## Department project focus (per-dept daily client priorities)

Creates `department_project_focus_items` so each department can pin which **client projects** deserve focus for a given calendar day (separate from **Daily focus**, which pins tasks).

### To apply

```bash
cd Project_Management_Tool_Backend
npm run migrate:department-project-focus
```

Or run the SQL directly: `migrations/create-department-project-focus-items.sql`.

### Team add-ons (override) table

Stores extra client pins when the team is also working on work not on the PM list. Merged into `GET` with `source: 'pm' | 'override'`.

```bash
npm run migrate:department-project-focus-override
```

SQL: `migrations/create-department-project-focus-override-items.sql`.

### API

- `GET /department-project-focus?date=YYYY-MM-DD&departmentKey=...` — merged PM pins + team add-ons (authenticated).
- `PUT /department-project-focus` — body `{ date, departmentKey, projectIds: string[] }` — **PM or Head PM only** (canonical priorities).
- `PUT /department-project-focus/team-override` — same body — **team lead for that department**, or PM / Head PM (max 15; cannot duplicate PM pins).

