CREATE TABLE IF NOT EXISTS monthly_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "projectId" UUID NULL REFERENCES projects(id) ON DELETE SET NULL,
  "clientName" VARCHAR(255) NOT NULL,
  "reminderDay" INTEGER NOT NULL CHECK ("reminderDay" >= 1 AND "reminderDay" <= 31),
  note TEXT NOT NULL,
  "createdById" UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  "updatedById" UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_monthly_reminders_reminder_day ON monthly_reminders("reminderDay");
CREATE INDEX IF NOT EXISTS idx_monthly_reminders_project_id ON monthly_reminders("projectId");

