-- Daily huddle pins per department + EOD reporting support
CREATE TABLE IF NOT EXISTS daily_focus_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "focusDate" DATE NOT NULL,
  "departmentKey" VARCHAR(64) NOT NULL,
  "taskId" UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  rank INT NOT NULL,
  "createdById" UUID REFERENCES users(id) ON DELETE SET NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_daily_focus_rank CHECK (rank >= 1 AND rank <= 50),
  CONSTRAINT uq_daily_focus_date_dept_rank UNIQUE ("focusDate", "departmentKey", rank),
  CONSTRAINT uq_daily_focus_date_task UNIQUE ("focusDate", "taskId")
);

CREATE INDEX IF NOT EXISTS idx_daily_focus_items_date ON daily_focus_items ("focusDate");
