BEGIN;

ALTER TABLE "tasks"
  ADD COLUMN IF NOT EXISTS "movedDueDate" date,
  ADD COLUMN IF NOT EXISTS "movedDueDateComment" text,
  ADD COLUMN IF NOT EXISTS "movedDueDateUpdatedAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "movedDueDateUpdatedById" uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'FK_tasks_movedDueDateUpdatedBy'
  ) THEN
    ALTER TABLE "tasks"
      ADD CONSTRAINT "FK_tasks_movedDueDateUpdatedBy"
      FOREIGN KEY ("movedDueDateUpdatedById") REFERENCES "users"("id") ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "task_due_date_moves" (
  "id"           uuid        NOT NULL DEFAULT uuid_generate_v4(),
  "taskId"       uuid        NOT NULL,
  "movedDate"    date        NOT NULL,
  "comment"      text,
  "movedById"    uuid,
  "movedAt"      timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt"    timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PK_task_due_date_moves" PRIMARY KEY ("id"),
  CONSTRAINT "FK_task_due_date_moves_task"
    FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE,
  CONSTRAINT "FK_task_due_date_moves_user"
    FOREIGN KEY ("movedById") REFERENCES "users"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "IDX_task_due_date_moves_taskId_movedAt"
  ON "task_due_date_moves"("taskId", "movedAt" DESC);

COMMIT;
