BEGIN;

-- Add notes column to client_updates table
ALTER TABLE client_updates 
ADD COLUMN IF NOT EXISTS notes TEXT;

-- Add links column to client_updates table (using TEXT array)
ALTER TABLE client_updates 
ADD COLUMN IF NOT EXISTS links TEXT;

COMMIT;

