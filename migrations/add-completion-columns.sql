-- Add completion columns to projects table
-- This enables marking projects as complete: completed projects are hidden from default pipeline views
-- but remain accessible via the "Completed Projects" view

BEGIN;

-- Add completion columns to projects table
ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS "isCompleted" BOOLEAN DEFAULT false;

ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP;

ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS "completedByUserId" UUID;

-- Add foreign key constraint for completedByUserId
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'FK_projects_completedByUserId'
  ) THEN
    ALTER TABLE projects 
    ADD CONSTRAINT "FK_projects_completedByUserId" 
    FOREIGN KEY ("completedByUserId") 
    REFERENCES users(id) 
    ON DELETE SET NULL;
  END IF;
END $$;

-- Set default values for existing rows (should already be false, but ensure consistency)
UPDATE projects SET "isCompleted" = false WHERE "isCompleted" IS NULL;

COMMIT;

