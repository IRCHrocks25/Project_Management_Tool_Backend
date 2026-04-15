ALTER TABLE users
ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;

UPDATE users
SET "isActive" = true
WHERE "isActive" IS NULL;

