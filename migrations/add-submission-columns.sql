-- Add submissionData and submissionType columns to tasks table
-- These columns are used for onboarding task submissions (URL or text)

BEGIN;

-- Add submissionData column (nullable text field for URL or text submission)
ALTER TABLE tasks 
ADD COLUMN IF NOT EXISTS "submissionData" TEXT;

-- Add submissionType column (nullable text field: 'url' or 'text')
ALTER TABLE tasks 
ADD COLUMN IF NOT EXISTS "submissionType" TEXT;

COMMIT;

