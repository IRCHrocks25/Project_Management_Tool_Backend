-- Katalyst Hub core: team, links, domains, updates, comments, files.
-- Requires hub-01 (products). Idempotent.
BEGIN;

CREATE TABLE IF NOT EXISTS product_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "productId" UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  "userId" UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  area VARCHAR(120) NOT NULL,
  "askAbout" TEXT,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_product_members_product_user UNIQUE ("productId", "userId")
);
CREATE INDEX IF NOT EXISTS idx_product_members_user ON product_members("userId");

CREATE TABLE IF NOT EXISTS product_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "productId" UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  kind VARCHAR(20) NOT NULL DEFAULT 'link' CHECK (kind IN ('environment', 'link')),
  label VARCHAR(120) NOT NULL,
  url VARCHAR(1000) NOT NULL,
  "sortOrder" INT NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_product_links_product ON product_links("productId");

CREATE TABLE IF NOT EXISTS product_domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "productId" UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  domain VARCHAR(253) NOT NULL,
  registrar VARCHAR(120),
  "dnsProvider" VARCHAR(120),
  "renewsOn" DATE NOT NULL,
  "sslExpiresOn" DATE NOT NULL,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_product_domains_product ON product_domains("productId");

CREATE TABLE IF NOT EXISTS product_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "productId" UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  "authorId" UUID REFERENCES users(id) ON DELETE SET NULL,
  type VARCHAR(20) NOT NULL DEFAULT 'progress'
    CHECK (type IN ('progress', 'release', 'heads_up', 'blocker', 'question')),
  body TEXT NOT NULL,
  "editedAt" TIMESTAMP WITH TIME ZONE,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_product_updates_product_created ON product_updates("productId", "createdAt" DESC);

CREATE TABLE IF NOT EXISTS product_update_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "updateId" UUID NOT NULL REFERENCES product_updates(id) ON DELETE CASCADE,
  "authorId" UUID REFERENCES users(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_product_update_comments_update ON product_update_comments("updateId");

CREATE TABLE IF NOT EXISTS product_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "productId" UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  "updateId" UUID REFERENCES product_updates(id) ON DELETE SET NULL,
  name VARCHAR(255) NOT NULL,
  folder VARCHAR(120) NOT NULL DEFAULT 'General',
  url VARCHAR(1000) NOT NULL,
  "storageKey" VARCHAR(1000) NOT NULL,
  "contentType" VARCHAR(255),
  "sizeBytes" BIGINT,
  "uploadedById" UUID REFERENCES users(id) ON DELETE SET NULL,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_product_files_product ON product_files("productId");
CREATE INDEX IF NOT EXISTS idx_product_files_update ON product_files("updateId");

COMMIT;
