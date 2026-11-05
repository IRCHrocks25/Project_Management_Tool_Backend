-- Permanent record of task changes that leave nothing else behind, such as a removed
-- attachment or an edited description. taskId deliberately has no foreign key, so the
-- record outlives the task. actorName is a copy, so it outlives the user too.
CREATE TABLE IF NOT EXISTS task_activity_logs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  "taskId" uuid NOT NULL,
  action varchar(50) NOT NULL,
  "actorId" uuid,
  "actorName" text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_activity_logs_task_created
  ON task_activity_logs ("taskId", "createdAt" DESC);

-- Deleted deliverables have no task, and deleted items are listed per project.
ALTER TABLE task_activity_logs ALTER COLUMN "taskId" DROP NOT NULL;
ALTER TABLE task_activity_logs ADD COLUMN IF NOT EXISTS "projectId" uuid;
CREATE INDEX IF NOT EXISTS idx_task_activity_logs_project_created
  ON task_activity_logs ("projectId", "createdAt" DESC);
