-- Workspace: company and personal vault items, Pages and My Day. Contract: docs/workspace.md.
-- ALTER TYPE ... ADD VALUE cannot run inside a transaction block on older Postgres, so it comes first.
ALTER TYPE notifications_type_enum ADD VALUE IF NOT EXISTS 'vault_updated';
ALTER TYPE notifications_type_enum ADD VALUE IF NOT EXISTS 'page_shared';

BEGIN;

-- Vault: company and personal logins share product_credentials so encryption, events and share links are reused.
ALTER TABLE product_credentials ALTER COLUMN "productId" DROP NOT NULL;
ALTER TABLE product_credentials ADD COLUMN IF NOT EXISTS scope VARCHAR(20) NOT NULL DEFAULT 'product';
ALTER TABLE product_credentials ADD COLUMN IF NOT EXISTS "ownerId" UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE product_credentials ADD COLUMN IF NOT EXISTS "notesEncrypted" TEXT;
ALTER TABLE product_credentials ADD COLUMN IF NOT EXISTS "accessEveryone" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE product_credentials ADD COLUMN IF NOT EXISTS "accessDepartments" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE product_credentials ADD COLUMN IF NOT EXISTS "accessUserIds" UUID[] NOT NULL DEFAULT '{}';
ALTER TABLE product_credentials ADD COLUMN IF NOT EXISTS "passwordChangedAt" TIMESTAMP WITH TIME ZONE;
ALTER TABLE product_credentials ADD COLUMN IF NOT EXISTS "passwordChangedById" UUID REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE product_credentials DROP CONSTRAINT IF EXISTS product_credentials_scope_check;
ALTER TABLE product_credentials ADD CONSTRAINT product_credentials_scope_check
  CHECK (scope IN ('product', 'company', 'personal'));
-- A product login always has a product; company and personal items never do. Product routes rely on this.
ALTER TABLE product_credentials DROP CONSTRAINT IF EXISTS product_credentials_scope_product_check;
ALTER TABLE product_credentials ADD CONSTRAINT product_credentials_scope_product_check
  CHECK ((scope = 'product') = ("productId" IS NOT NULL));
CREATE INDEX IF NOT EXISTS idx_product_credentials_scope_owner ON product_credentials(scope, "ownerId");

ALTER TABLE product_credential_events DROP CONSTRAINT IF EXISTS product_credential_events_action_check;
ALTER TABLE product_credential_events ADD CONSTRAINT product_credential_events_action_check
  CHECK (action IN ('created', 'edited', 'revealed', 'copied', 'shared', 'share_viewed', 'share_revoked', 'restored', 'version_revealed'));

-- An internal link works even when the item isn't shareable. Only the assistant creates these.
ALTER TABLE product_credential_shares ADD COLUMN IF NOT EXISTS internal BOOLEAN NOT NULL DEFAULT FALSE;

-- Previous passwords, kept for 30 days.
CREATE TABLE IF NOT EXISTS product_credential_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "credentialId" UUID NOT NULL REFERENCES product_credentials(id) ON DELETE CASCADE,
  "secretEncrypted" TEXT NOT NULL,
  -- Who replaced this password.
  "changedById" UUID REFERENCES users(id) ON DELETE SET NULL,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_product_credential_versions_cred ON product_credential_versions("credentialId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_product_credential_versions_expires ON product_credential_versions("expiresAt");

-- Pages: TipTap documents with sharing.
CREATE TABLE IF NOT EXISTS workspace_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "ownerId" UUID REFERENCES users(id) ON DELETE SET NULL,
  title VARCHAR(200) NOT NULL DEFAULT 'Untitled',
  content JSONB NOT NULL,
  -- Derived from content on every write, so lists and search never have to load documents.
  "contentText" TEXT NOT NULL DEFAULT '',
  "checklistDone" INT NOT NULL DEFAULT 0,
  "checklistTotal" INT NOT NULL DEFAULT 0,
  revision INT NOT NULL DEFAULT 1,
  "updatedById" UUID REFERENCES users(id) ON DELETE SET NULL,
  "deletedAt" TIMESTAMP WITH TIME ZONE,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_workspace_pages_owner ON workspace_pages("ownerId", "updatedAt" DESC) WHERE "deletedAt" IS NULL;

CREATE TABLE IF NOT EXISTS workspace_page_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "pageId" UUID NOT NULL REFERENCES workspace_pages(id) ON DELETE CASCADE,
  kind VARCHAR(20) NOT NULL CHECK (kind IN ('everyone', 'department', 'user')),
  -- NULL for everyone, a UserRole value for department, a user id for user.
  target VARCHAR(255),
  permission VARCHAR(10) NOT NULL CHECK (permission IN ('view', 'edit')),
  "createdById" UUID REFERENCES users(id) ON DELETE SET NULL,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_workspace_page_shares ON workspace_page_shares("pageId", kind, COALESCE(target, ''));
CREATE INDEX IF NOT EXISTS idx_workspace_page_shares_target ON workspace_page_shares(kind, target);

CREATE TABLE IF NOT EXISTS workspace_page_opens (
  "pageId" UUID NOT NULL REFERENCES workspace_pages(id) ON DELETE CASCADE,
  "userId" UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "openedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  PRIMARY KEY ("pageId", "userId")
);
CREATE INDEX IF NOT EXISTS idx_workspace_page_opens_user ON workspace_page_opens("userId", "openedAt" DESC);

COMMIT;
