-- Add archiving columns to projects and tasks tables
-- This enables soft-archiving: projects and tasks can be hidden from default views
-- but remain accessible via direct links and auditable in the database

BEGIN;

-- Add archiving columns to projects table
ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS "isArchived" BOOLEAN DEFAULT false;

ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP;

ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS "archivedByUserId" UUID;

-- Add foreign key constraint for archivedByUserId
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'FK_projects_archivedByUserId'
  ) THEN
    ALTER TABLE projects 
    ADD CONSTRAINT "FK_projects_archivedByUserId" 
    FOREIGN KEY ("archivedByUserId") 
    REFERENCES users(id) 
    ON DELETE SET NULL;
  END IF;
END $$;

-- Add archiving column to tasks table
ALTER TABLE tasks 
ADD COLUMN IF NOT EXISTS "isArchived" BOOLEAN DEFAULT false;

-- Set default values for existing rows (should already be false, but ensure consistency)
UPDATE projects SET "isArchived" = false WHERE "isArchived" IS NULL;
UPDATE tasks SET "isArchived" = false WHERE "isArchived" IS NULL;

COMMIT;

