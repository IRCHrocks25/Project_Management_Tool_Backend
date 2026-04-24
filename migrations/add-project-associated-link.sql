-- Add a project-level associated link field for quick navigation in Project Detail
ALTER TABLE projects
ADD COLUMN IF NOT EXISTS "associatedLink" text;
