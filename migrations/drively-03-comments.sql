-- Drively comments, and a "can comment" level between view and edit for team members and clients.
ALTER TYPE notifications_type_enum ADD VALUE IF NOT EXISTS 'drive_comment';

BEGIN;

ALTER TABLE drive_item_shares DROP CONSTRAINT IF EXISTS drive_item_shares_permission_check;
ALTER TABLE drive_item_shares ADD CONSTRAINT drive_item_shares_permission_check CHECK (permission IN ('view', 'comment', 'edit'));

ALTER TABLE drive_client_shares DROP CONSTRAINT IF EXISTS drive_client_shares_permission_check;
ALTER TABLE drive_client_shares ADD CONSTRAINT drive_client_shares_permission_check CHECK (permission IN ('view', 'comment'));

ALTER TABLE drive_client_links ADD COLUMN IF NOT EXISTS permission VARCHAR(10) NOT NULL DEFAULT 'comment';
ALTER TABLE drive_client_links DROP CONSTRAINT IF EXISTS drive_client_links_permission_check;
ALTER TABLE drive_client_links ADD CONSTRAINT drive_client_links_permission_check CHECK (permission IN ('view', 'comment'));

-- A thread is a comment with no parent; its replies point at it. Replies take the thread's visibility.
CREATE TABLE IF NOT EXISTS drive_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "itemId" UUID NOT NULL REFERENCES drive_items(id) ON DELETE CASCADE,
  "parentId" UUID REFERENCES drive_comments(id) ON DELETE CASCADE,
  -- Exactly one author. The name is kept so a comment still reads properly after an account is removed.
  "authorUserId" UUID REFERENCES users(id) ON DELETE SET NULL,
  "authorClientId" UUID REFERENCES drive_clients(id) ON DELETE SET NULL,
  "authorIsClient" BOOLEAN NOT NULL,
  "authorName" VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  -- 'team' is hidden from every client. Clients' own threads are always 'everyone'.
  visibility VARCHAR(10) NOT NULL DEFAULT 'team' CHECK (visibility IN ('team', 'everyone')),
  -- Where a thread points in the file. No anchor means it's about the whole file.
  anchor JSONB,
  "resolvedAt" TIMESTAMP WITH TIME ZONE,
  "resolvedByName" VARCHAR(255),
  "editedAt" TIMESTAMP WITH TIME ZONE,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_drive_comments_item ON drive_comments("itemId", "createdAt");
CREATE INDEX IF NOT EXISTS idx_drive_comments_parent ON drive_comments("parentId") WHERE "parentId" IS NOT NULL;

COMMIT;
