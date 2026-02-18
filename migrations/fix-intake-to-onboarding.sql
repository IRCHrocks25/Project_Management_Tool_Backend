-- Migration script to fix enum mismatch: "Intake" -> "Onboarding"
-- Run this script in your PostgreSQL database

-- Step 1: Update all existing tasks with "Intake" type to "Onboarding"
UPDATE tasks SET type = 'Onboarding' WHERE type = 'Intake';

-- Step 2: Update all existing projects with "Intake" stage to "Onboarding"  
UPDATE projects SET stage = 'Onboarding' WHERE stage = 'Intake';

-- Step 3: Drop and recreate the tasks_type_enum with correct values
-- First, alter the column to use text temporarily
ALTER TABLE tasks ALTER COLUMN type TYPE text;

-- Drop the old enum
DROP TYPE IF EXISTS tasks_type_enum;

-- Create the new enum with correct values
CREATE TYPE tasks_type_enum AS ENUM ('Onboarding', 'Copy', 'Design', 'Dev', 'General');

-- Alter the column back to use the enum
ALTER TABLE tasks ALTER COLUMN type TYPE tasks_type_enum USING type::tasks_type_enum;

-- Step 4: Fix projects_stage_enum if needed
-- Check if projects table uses an enum for stage
-- If it does, we need to update it too
DO $$
BEGIN
    -- Check if column is enum type
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'projects' 
        AND column_name = 'stage' 
        AND data_type = 'USER-DEFINED'
    ) THEN
        -- Alter to text temporarily
        ALTER TABLE projects ALTER COLUMN stage TYPE text;
        
        -- Drop old enum if exists
        DROP TYPE IF EXISTS projects_stage_enum;
        
        -- Create new enum
        CREATE TYPE projects_stage_enum AS ENUM (
            'Onboarding', 
            'Copy', 
            'Copy Revision', 
            'Design', 
            'Design Revision', 
            'Dev', 
            'Ready to Close', 
            'Closed'
        );
        
        -- Alter back to enum
        ALTER TABLE projects ALTER COLUMN stage TYPE projects_stage_enum USING stage::projects_stage_enum;
    END IF;
END $$;

