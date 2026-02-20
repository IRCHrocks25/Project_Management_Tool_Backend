-- Create client_updates table
CREATE TABLE IF NOT EXISTS client_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "projectId" UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  "pmId" UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "emailSentAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'responded')),
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create client_update_forms table
CREATE TABLE IF NOT EXISTS client_update_forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "updateId" UUID NOT NULL REFERENCES client_updates(id) ON DELETE CASCADE,
  "publicToken" VARCHAR(255) NOT NULL UNIQUE,
  "isPublished" BOOLEAN NOT NULL DEFAULT false,
  blocks JSONB NOT NULL DEFAULT '[]'::jsonb,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create client_update_form_submissions table
CREATE TABLE IF NOT EXISTS client_update_form_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "formId" UUID NOT NULL REFERENCES client_update_forms(id) ON DELETE CASCADE,
  responses JSONB NOT NULL DEFAULT '[]'::jsonb,
  "clientName" VARCHAR(255),
  "clientEmail" VARCHAR(255),
  "submittedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_client_updates_project_id ON client_updates("projectId");
CREATE INDEX IF NOT EXISTS idx_client_updates_pm_id ON client_updates("pmId");
CREATE INDEX IF NOT EXISTS idx_client_update_forms_update_id ON client_update_forms("updateId");
CREATE INDEX IF NOT EXISTS idx_client_update_forms_public_token ON client_update_forms("publicToken");
CREATE INDEX IF NOT EXISTS idx_client_update_forms_is_published ON client_update_forms("isPublished");
CREATE INDEX IF NOT EXISTS idx_client_update_form_submissions_form_id ON client_update_form_submissions("formId");

