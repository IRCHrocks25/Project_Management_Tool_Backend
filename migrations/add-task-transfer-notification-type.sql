-- Add TASK_TRANSFER value to notifications_type_enum
-- IF NOT EXISTS guards against re-running this migration
-- Note: ALTER TYPE ... ADD VALUE cannot run inside a transaction block in Postgres < 12.
-- Run without BEGIN/COMMIT wrapping if the server rejects it.

ALTER TYPE notifications_type_enum ADD VALUE IF NOT EXISTS 'TASK_TRANSFER';
