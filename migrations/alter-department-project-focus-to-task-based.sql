ALTER TABLE department_project_focus_items
  ADD COLUMN IF NOT EXISTS "taskId" UUID NULL,
  ALTER COLUMN "projectId" DROP NOT NULL;

ALTER TABLE department_project_focus_override_items
  ADD COLUMN IF NOT EXISTS "taskId" UUID NULL,
  ALTER COLUMN "projectId" DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_dept_focus_task'
      AND table_name = 'department_project_focus_items'
  ) THEN
    ALTER TABLE department_project_focus_items
      ADD CONSTRAINT fk_dept_focus_task
      FOREIGN KEY ("taskId") REFERENCES tasks(id) ON DELETE CASCADE;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_dept_focus_override_task'
      AND table_name = 'department_project_focus_override_items'
  ) THEN
    ALTER TABLE department_project_focus_override_items
      ADD CONSTRAINT fk_dept_focus_override_task
      FOREIGN KEY ("taskId") REFERENCES tasks(id) ON DELETE CASCADE;
  END IF;
END$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_dept_focus_task
  ON department_project_focus_items ("focusDate", "departmentKey", "taskId")
  WHERE "taskId" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_dept_focus_override_task
  ON department_project_focus_override_items ("focusDate", "departmentKey", "taskId")
  WHERE "taskId" IS NOT NULL;
