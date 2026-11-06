-- Drively: the company's Drive. Folders, Docs, Grid, Slides, PDFs and uploaded files.
-- Everything a file holds is a private Iceberg asset: Docs, Grid and Slides, uploads, PDFs and pictures placed
-- in a document. These tables hold names, folders, sharing and a small card preview.
BEGIN;

CREATE TABLE IF NOT EXISTS drive_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind VARCHAR(20) NOT NULL CHECK (kind IN ('folder', 'doc', 'grid', 'slides', 'pdf', 'file')),
  name VARCHAR(255) NOT NULL,
  "parentId" UUID REFERENCES drive_items(id) ON DELETE SET NULL,
  "ownerId" UUID REFERENCES users(id) ON DELETE SET NULL,
  -- A small sample of the content, drawn on the file's card.
  preview JSONB,
  revision INTEGER NOT NULL DEFAULT 1,
  -- True once the asset holds live co-editing state rather than plain JSON.
  "hasLiveState" BOOLEAN NOT NULL DEFAULT FALSE,
  -- The file's Iceberg asset. Folders have none.
  "assetId" VARCHAR(100),
  "storageKey" VARCHAR(1000),
  "contentType" VARCHAR(255),
  "sizeBytes" BIGINT NOT NULL DEFAULT 0,
  -- Trashing a folder trashes everything inside it; "trashRootId" is the item the person trashed.
  "trashedAt" TIMESTAMP WITH TIME ZONE,
  "trashRootId" UUID,
  "updatedById" UUID REFERENCES users(id) ON DELETE SET NULL,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CHECK ("parentId" IS NULL OR "parentId" <> id)
);
CREATE INDEX IF NOT EXISTS idx_drive_items_parent ON drive_items("parentId");
CREATE INDEX IF NOT EXISTS idx_drive_items_owner ON drive_items("ownerId");
CREATE INDEX IF NOT EXISTS idx_drive_items_trash_root ON drive_items("trashRootId") WHERE "trashRootId" IS NOT NULL;

CREATE TABLE IF NOT EXISTS drive_item_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "itemId" UUID NOT NULL REFERENCES drive_items(id) ON DELETE CASCADE,
  kind VARCHAR(20) NOT NULL CHECK (kind IN ('everyone', 'department', 'user')),
  target VARCHAR(100),
  permission VARCHAR(10) NOT NULL CHECK (permission IN ('view', 'edit')),
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_drive_item_shares ON drive_item_shares("itemId", kind, COALESCE(target, ''));
CREATE INDEX IF NOT EXISTS idx_drive_item_shares_target ON drive_item_shares(kind, target);

-- Per person: stars and when they last opened the item.
CREATE TABLE IF NOT EXISTS drive_item_user_state (
  "itemId" UUID NOT NULL REFERENCES drive_items(id) ON DELETE CASCADE,
  "userId" UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  starred BOOLEAN NOT NULL DEFAULT FALSE,
  "lastOpenedAt" TIMESTAMP WITH TIME ZONE,
  PRIMARY KEY ("itemId", "userId")
);
CREATE INDEX IF NOT EXISTS idx_drive_item_user_state_user ON drive_item_user_state("userId");

-- Pictures placed inside a Doc or Slides file. Copies of a file get their own rows for the same asset,
-- so an asset leaves Iceberg only when its last row goes.
CREATE TABLE IF NOT EXISTS drive_item_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "itemId" UUID NOT NULL REFERENCES drive_items(id) ON DELETE CASCADE,
  "assetId" VARCHAR(100) NOT NULL,
  "storageKey" VARCHAR(1000) NOT NULL,
  name VARCHAR(255) NOT NULL,
  "contentType" VARCHAR(255),
  "sizeBytes" BIGINT NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_drive_item_assets ON drive_item_assets("itemId", "assetId");
CREATE INDEX IF NOT EXISTS idx_drive_item_assets_key ON drive_item_assets("storageKey");

COMMIT;
