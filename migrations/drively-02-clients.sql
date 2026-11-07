-- Drively clients: people outside the company who open files through a one-time link, then come back with their
-- name and a 6-digit code. They live apart from `users` on purpose. Nothing that lists, assigns or authorizes
-- team members can reach them, and "Everyone at the company" shares never apply to them.
BEGIN;

CREATE TABLE IF NOT EXISTS drive_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(120) NOT NULL,
  -- Optional. With it, a client can reset a forgotten code themselves.
  email VARCHAR(255),
  "codeHash" VARCHAR(100) NOT NULL,
  -- Raised when the code changes, which ends every session signed with the old value.
  "tokenVersion" INTEGER NOT NULL DEFAULT 1,
  "failedAttempts" INTEGER NOT NULL DEFAULT 0,
  "lockedUntil" TIMESTAMP WITH TIME ZONE,
  "resetCodeHash" VARCHAR(64),
  "resetExpires" TIMESTAMP WITH TIME ZONE,
  "resetSentAt" TIMESTAMP WITH TIME ZONE,
  "resetAttempts" INTEGER NOT NULL DEFAULT 0,
  "createdById" UUID REFERENCES users(id) ON DELETE SET NULL,
  "lastSeenAt" TIMESTAMP WITH TIME ZONE,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_drive_clients_name ON drive_clients (lower(name));
CREATE UNIQUE INDEX IF NOT EXISTS uq_drive_clients_email ON drive_clients (lower(email)) WHERE email IS NOT NULL;

-- Kept out of drive_item_shares so company sharing rules and client access can't affect each other.
CREATE TABLE IF NOT EXISTS drive_client_shares (
  "itemId" UUID NOT NULL REFERENCES drive_items(id) ON DELETE CASCADE,
  "clientId" UUID NOT NULL REFERENCES drive_clients(id) ON DELETE CASCADE,
  permission VARCHAR(10) NOT NULL DEFAULT 'view' CHECK (permission IN ('view')),
  "createdById" UUID REFERENCES users(id) ON DELETE SET NULL,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  PRIMARY KEY ("itemId", "clientId")
);
CREATE INDEX IF NOT EXISTS idx_drive_client_shares_client ON drive_client_shares("clientId");

-- One-time links. Only a hash of the token is stored. "clientId" set means the link sets a new code for that client.
CREATE TABLE IF NOT EXISTS drive_client_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tokenHash" VARCHAR(64) NOT NULL UNIQUE,
  "itemId" UUID NOT NULL REFERENCES drive_items(id) ON DELETE CASCADE,
  "clientId" UUID REFERENCES drive_clients(id) ON DELETE CASCADE,
  "createdById" UUID REFERENCES users(id) ON DELETE SET NULL,
  "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL,
  "usedAt" TIMESTAMP WITH TIME ZONE,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_drive_client_links_item ON drive_client_links("itemId") WHERE "usedAt" IS NULL;

COMMIT;
