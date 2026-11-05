-- Board views: the fields a task table needs, plus columns a project adds for itself. Contract: docs/board-views.md.
BEGIN;

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS priority VARCHAR(16);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS "startDate" DATE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS "customFields" JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS board_columns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "projectId" UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name VARCHAR(80) NOT NULL,
  type VARCHAR(20) NOT NULL,
  labels JSONB NOT NULL DEFAULT '[]'::jsonb,
  position INT NOT NULL DEFAULT 0,
  "createdById" UUID REFERENCES users(id) ON DELETE SET NULL,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT board_columns_type_check CHECK (type IN ('text', 'number', 'status', 'date', 'people', 'checkbox', 'link'))
);
CREATE INDEX IF NOT EXISTS idx_board_columns_project ON board_columns("projectId", position);

COMMIT;
