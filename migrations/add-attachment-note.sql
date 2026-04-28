-- Add optional note field to task_attachments
ALTER TABLE task_attachments
ADD COLUMN IF NOT EXISTS note text;
