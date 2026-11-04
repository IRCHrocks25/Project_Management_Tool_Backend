-- Katalyst Hub: products table and notification support.
-- ALTER TYPE ... ADD VALUE cannot run inside a transaction block on older Postgres, so it comes first.
ALTER TYPE notifications_type_enum ADD VALUE IF NOT EXISTS 'product_mention';
ALTER TYPE notifications_type_enum ADD VALUE IF NOT EXISTS 'product_assigned';
ALTER TYPE notifications_type_enum ADD VALUE IF NOT EXISTS 'product_reply';

BEGIN;

CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(80) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  code VARCHAR(8) NOT NULL UNIQUE,
  description TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'building' CHECK (status IN ('live', 'beta', 'building', 'paused')),
  version VARCHAR(40),
  "ownerId" UUID REFERENCES users(id) ON DELETE SET NULL,
  "ticketSeq" INT NOT NULL DEFAULT 0,
  "archivedAt" TIMESTAMP WITH TIME ZONE,
  "createdById" UUID REFERENCES users(id) ON DELETE SET NULL,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_products_owner ON products("ownerId");

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS "productId" UUID REFERENCES products(id) ON DELETE CASCADE;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS link VARCHAR(500);
CREATE INDEX IF NOT EXISTS idx_notifications_product ON notifications("productId");

COMMIT;
