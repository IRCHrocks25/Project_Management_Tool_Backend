-- Add landingPageRevisionCount column to projects table
ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS "landingPageRevisionCount" INTEGER DEFAULT 0;

-- Update existing projects to have 0 as default
UPDATE projects 
SET "landingPageRevisionCount" = 0 
WHERE "landingPageRevisionCount" IS NULL;

