BEGIN;

CREATE TABLE IF NOT EXISTS "task_transfers" (
  "id"               uuid           NOT NULL DEFAULT uuid_generate_v4(),
  "taskId"           uuid           NOT NULL,
  "fromDepartment"   text           NOT NULL,
  "toDepartment"     text           NOT NULL,
  "fromAssigneeIds"  jsonb          NOT NULL DEFAULT '[]'::jsonb,
  "toAssigneeIds"    jsonb          NOT NULL DEFAULT '[]'::jsonb,
  "transferredById"  uuid,
  "kind"             varchar(16)    NOT NULL,
  "note"             text,
  "transferredAt"    timestamptz    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt"        timestamptz    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PK_task_transfers" PRIMARY KEY ("id"),
  CONSTRAINT "FK_task_transfers_task"
    FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE,
  CONSTRAINT "FK_task_transfers_user"
    FOREIGN KEY ("transferredById") REFERENCES "users"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "IDX_task_transfers_taskId_transferredAt"
  ON "task_transfers"("taskId", "transferredAt" DESC);

COMMIT;
