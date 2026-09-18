-- Performance indexes for the post-login dashboard load.
--
-- CREATE INDEX CONCURRENTLY cannot run inside a transaction block, so this file
-- deliberately has no BEGIN/COMMIT and must be executed one statement at a time.
-- Use `npm run migrate:performance-indexes`, which handles that.

-- notifications: main list query (findAll filters by userId, orders by createdAt DESC)
CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_notifications_userId_createdAt"
  ON "notifications" ("userId", "createdAt" DESC);

-- notifications: unread-count only ever counts unread rows for one user
CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_notifications_userId_unread"
  ON "notifications" ("userId")
  WHERE "isRead" = false;

-- notifications: joins onto task/project (Postgres does not auto-index foreign keys)
CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_notifications_taskId"
  ON "notifications" ("taskId");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_notifications_projectId"
  ON "notifications" ("projectId");

-- tasks: per-project task loading in ProjectsService.findAll
CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_tasks_projectId_isArchived"
  ON "tasks" ("projectId", "isArchived");

-- tasks: filtering by assignee
CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_tasks_assignedToId"
  ON "tasks" ("assignedToId");

-- tasks: default ordering in TasksService.findAll
CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_tasks_createdAt"
  ON "tasks" ("createdAt" DESC);

-- projects: PM project list excludes archived and completed
CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_projects_pmId_isArchived_isCompleted"
  ON "projects" ("pmId", "isArchived", "isCompleted");
