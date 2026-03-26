CREATE TABLE IF NOT EXISTS department_project_focus_override_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "focusDate" DATE NOT NULL,
  "departmentKey" VARCHAR(64) NOT NULL,
  "projectId" UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  "sortOrder" INT NOT NULL DEFAULT 0,
  "createdById" UUID REFERENCES users(id) ON DELETE SET NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_dept_project_focus_override UNIQUE ("focusDate", "departmentKey", "projectId")
);

CREATE INDEX IF NOT EXISTS idx_dept_project_focus_override_date_key
  ON department_project_focus_override_items ("focusDate", "departmentKey");
