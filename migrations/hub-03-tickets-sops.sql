-- Katalyst Hub: product tickets and SOPs (steps + per-user progress).
BEGIN;

CREATE TABLE IF NOT EXISTS product_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "productId" UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  number INT NOT NULL,
  key VARCHAR(20) NOT NULL,
  title VARCHAR(200) NOT NULL,
  type VARCHAR(20) NOT NULL DEFAULT 'task' CHECK (type IN ('bug', 'feature', 'request', 'task')),
  priority VARCHAR(20) NOT NULL DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
  status VARCHAR(20) NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'in_review', 'done')),
  "assigneeId" UUID REFERENCES users(id) ON DELETE SET NULL,
  "reporterId" UUID REFERENCES users(id) ON DELETE SET NULL,
  description TEXT,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_product_tickets_product_number UNIQUE ("productId", number)
);
CREATE INDEX IF NOT EXISTS idx_product_tickets_product ON product_tickets("productId");
CREATE INDEX IF NOT EXISTS idx_product_tickets_assignee ON product_tickets("assigneeId");

CREATE TABLE IF NOT EXISTS product_sops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "productId" UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  audience VARCHAR(200),
  "ownerId" UUID REFERENCES users(id) ON DELETE SET NULL,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_product_sops_product ON product_sops("productId");

CREATE TABLE IF NOT EXISTS product_sop_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "sopId" UUID NOT NULL REFERENCES product_sops(id) ON DELETE CASCADE,
  position INT NOT NULL,
  text TEXT NOT NULL,
  links JSONB NOT NULL DEFAULT '[]'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_product_sop_steps_sop ON product_sop_steps("sopId", position);

CREATE TABLE IF NOT EXISTS product_sop_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "stepId" UUID NOT NULL REFERENCES product_sop_steps(id) ON DELETE CASCADE,
  "userId" UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_product_sop_progress_step_user UNIQUE ("stepId", "userId")
);
CREATE INDEX IF NOT EXISTS idx_product_sop_progress_user ON product_sop_progress("userId");

COMMIT;
