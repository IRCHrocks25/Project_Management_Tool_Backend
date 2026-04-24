ALTER TABLE monthly_reminders
ADD COLUMN IF NOT EXISTS "reminderLink" text,
ADD COLUMN IF NOT EXISTS "currentMonthKey" varchar(7),
ADD COLUMN IF NOT EXISTS "currentMonthStatus" varchar(12) NOT NULL DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS "nextMonthStatus" varchar(12);

UPDATE monthly_reminders
SET "currentMonthKey" = TO_CHAR(NOW(), 'YYYY-MM')
WHERE "currentMonthKey" IS NULL;
