BEGIN;

-- Create task_assignees junction table
CREATE TABLE IF NOT EXISTS "task_assignees" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "taskId" uuid NOT NULL,
  "userId" uuid NOT NULL,
  "assignedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PK_task_assignees" PRIMARY KEY ("id"),
  CONSTRAINT "FK_task_assignees_task" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE,
  CONSTRAINT "FK_task_assignees_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "UQ_task_assignees_task_user" UNIQUE ("taskId", "userId")
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS "IDX_task_assignees_taskId" ON "task_assignees"("taskId");
CREATE INDEX IF NOT EXISTS "IDX_task_assignees_userId" ON "task_assignees"("userId");

-- Migrate existing assignedToId data to task_assignees table
INSERT INTO "task_assignees" ("taskId", "userId", "assignedAt")
SELECT "id", "assignedToId", "createdAt"
FROM "tasks"
WHERE "assignedToId" IS NOT NULL
ON CONFLICT ("taskId", "userId") DO NOTHING;

COMMIT;

