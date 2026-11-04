-- Katalyst Hub: credential vault, client share links and demo accounts.
-- Secrets are stored encrypted (AES-256-GCM, see src/product-vault/vault-crypto.service.ts).
-- Share tokens are never stored, only their sha256.
BEGIN;

CREATE TABLE IF NOT EXISTS product_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "productId" UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  label VARCHAR(160) NOT NULL,
  environment VARCHAR(20) NOT NULL DEFAULT 'production' CHECK (environment IN ('production', 'staging', 'demo')),
  "loginUrl" VARCHAR(500),
  username VARCHAR(255) NOT NULL,
  "secretEncrypted" TEXT NOT NULL,
  shareable BOOLEAN NOT NULL DEFAULT false,
  "createdById" UUID REFERENCES users(id) ON DELETE SET NULL,
  "updatedById" UUID REFERENCES users(id) ON DELETE SET NULL,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_product_credentials_product ON product_credentials("productId");

CREATE TABLE IF NOT EXISTS product_credential_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "credentialId" UUID NOT NULL REFERENCES product_credentials(id) ON DELETE CASCADE,
  -- NULL means a client opened the item through a share link.
  "userId" UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(20) NOT NULL CHECK (action IN ('created', 'edited', 'revealed', 'copied', 'shared', 'share_viewed', 'share_revoked')),
  detail VARCHAR(500),
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_product_credential_events_cred ON product_credential_events("credentialId", "createdAt" DESC);

CREATE TABLE IF NOT EXISTS product_credential_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "credentialId" UUID NOT NULL REFERENCES product_credentials(id) ON DELETE CASCADE,
  "tokenHash" CHAR(64) NOT NULL UNIQUE,
  "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL,
  "oneTime" BOOLEAN NOT NULL DEFAULT true,
  "viewedAt" TIMESTAMP WITH TIME ZONE,
  "revokedAt" TIMESTAMP WITH TIME ZONE,
  "createdById" UUID REFERENCES users(id) ON DELETE SET NULL,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_product_credential_shares_cred ON product_credential_shares("credentialId");

CREATE TABLE IF NOT EXISTS product_demo_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "productId" UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  "clientName" VARCHAR(160) NOT NULL,
  "loginEmail" VARCHAR(255) NOT NULL,
  purpose TEXT,
  "credentialId" UUID REFERENCES product_credentials(id) ON DELETE SET NULL,
  "avatarStatus" VARCHAR(20) NOT NULL DEFAULT 'not_started' CHECK ("avatarStatus" IN ('not_started', 'in_progress', 'done', 'not_needed')),
  "transcriptStatus" VARCHAR(20) NOT NULL DEFAULT 'not_started' CHECK ("transcriptStatus" IN ('not_started', 'in_progress', 'done', 'not_needed')),
  "ownerId" UUID REFERENCES users(id) ON DELETE SET NULL,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_product_demo_accounts_product ON product_demo_accounts("productId");

COMMIT;
