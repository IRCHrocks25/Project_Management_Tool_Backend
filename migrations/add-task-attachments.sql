BEGIN;

-- 1. Create task_attachments table
CREATE TABLE IF NOT EXISTS "task_attachments" (
  "id"                    uuid         NOT NULL DEFAULT uuid_generate_v4(),
  "taskId"                uuid         NOT NULL,
  "url"                   text         NOT NULL,
  "kind"                  varchar(16)  NOT NULL DEFAULT 'file',
  "filename"              text,
  "mimeType"              text,
  "sizeBytes"             bigint,
  "cloudinaryPublicId"    text,
  "cloudinaryResourceType" text,
  "uploadedById"          uuid,
  "uploadedAt"            timestamptz  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt"             timestamptz  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PK_task_attachments"
    PRIMARY KEY ("id"),
  CONSTRAINT "FK_task_attachments_task"
    FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE,
  CONSTRAINT "FK_task_attachments_user"
    FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE SET NULL
);

-- 2. Indexes
CREATE INDEX IF NOT EXISTS "IDX_task_attachments_taskId"
  ON "task_attachments"("taskId");

CREATE INDEX IF NOT EXISTS "IDX_task_attachments_taskId_uploadedAt"
  ON "task_attachments"("taskId", "uploadedAt" DESC);

-- 3. Backfill from tasks.fileUrl.
--    kind: Cloudinary-hosted URLs are 'file'; everything else (Drive, Figma, etc.) is 'link'.
--    uploadedById: NULL — tasks have no createdById column; assignedToId would be misleading.
--    uploadedAt: task.createdAt as best-effort approximation.
--    filename: last meaningful path/query segment of the URL, or NULL if not parseable.
INSERT INTO "task_attachments"
  ("taskId", "url", "kind", "filename", "mimeType", "sizeBytes",
   "cloudinaryPublicId", "cloudinaryResourceType",
   "uploadedById", "uploadedAt", "createdAt")
SELECT
  t.id,
  t."fileUrl",
  CASE
    WHEN t."fileUrl" LIKE '%res.cloudinary.com%' THEN 'file'
    ELSE 'link'
  END,
  NULLIF(
    regexp_replace(t."fileUrl", '^.*[/=]([^/?#&]+)(\?.*)?$', E'\\1'),
    t."fileUrl"
  ),
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  t."createdAt",
  NOW()
FROM tasks t
WHERE t."fileUrl" IS NOT NULL
  AND t."fileUrl" != ''
ON CONFLICT DO NOTHING;

COMMIT;
