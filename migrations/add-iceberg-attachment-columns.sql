BEGIN;

-- Iceberg replaces Cloudinary as the upload target. Deletes key off the
-- tenant-relative key rather than a public_id + resource_type pair, so both
-- identifiers are stored: the asset id builds the delivery URL, the key is
-- what DELETE /assets/<key> needs.
ALTER TABLE "task_attachments"
  ADD COLUMN IF NOT EXISTS "icebergAssetId" text,
  ADD COLUMN IF NOT EXISTS "icebergKey"     text;

-- The cloudinary* columns are intentionally left in place. Their account is
-- disabled and the values are unusable, but dropping them would discard the
-- only record of what a pre-migration row pointed at.

COMMIT;
