-- Forms: Google-Forms-style forms built by the team and filled in by clients through a public link.
-- Files (builder images and respondent uploads) live in Iceberg under forms/<formId>.
-- ALTER TYPE ... ADD VALUE cannot run inside a transaction block on older Postgres, so it comes first.
ALTER TYPE notifications_type_enum ADD VALUE IF NOT EXISTS 'form_response';

BEGIN;

CREATE TABLE IF NOT EXISTS forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(200) NOT NULL,
  description TEXT,
  "ownerId" UUID REFERENCES users(id) ON DELETE SET NULL,
  "projectId" UUID REFERENCES projects(id) ON DELETE SET NULL,
  "isTemplate" BOOLEAN NOT NULL DEFAULT FALSE,
  status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'open', 'closed')),
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Set on first publish; the token is the credential for the public link.
  "publicToken" VARCHAR(64) UNIQUE,
  "publishedAt" TIMESTAMP WITH TIME ZONE,
  "deletedAt" TIMESTAMP WITH TIME ZONE,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_forms_owner ON forms("ownerId");
CREATE INDEX IF NOT EXISTS idx_forms_project ON forms("projectId");
CREATE INDEX IF NOT EXISTS idx_forms_template ON forms("isTemplate") WHERE "deletedAt" IS NULL;

CREATE TABLE IF NOT EXISTS form_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "formId" UUID NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  answers JSONB NOT NULL DEFAULT '[]'::jsonb,
  "respondentName" VARCHAR(200),
  "respondentEmail" VARCHAR(320),
  "submittedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_form_responses_form ON form_responses("formId", "submittedAt" DESC);

CREATE TABLE IF NOT EXISTS form_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "formId" UUID NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  "responseId" UUID REFERENCES form_responses(id) ON DELETE SET NULL,
  source VARCHAR(20) NOT NULL CHECK (source IN ('builder', 'respondent')),
  name VARCHAR(255) NOT NULL,
  url VARCHAR(1000) NOT NULL,
  -- Iceberg key, needed to delete the asset. Copies of a form share keys, so delete only the last reference.
  "storageKey" VARCHAR(1000) NOT NULL,
  "contentType" VARCHAR(255),
  "sizeBytes" BIGINT,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_form_files_form ON form_files("formId", source, "createdAt");
CREATE INDEX IF NOT EXISTS idx_form_files_response ON form_files("responseId");
CREATE INDEX IF NOT EXISTS idx_form_files_key ON form_files("storageKey");

-- Starter template: the CTA Links Form. Image items have no file yet; the team adds each page's screenshot.
INSERT INTO forms (title, description, "isTemplate", items, settings)
SELECT
  'CTA Links Form',
  'Review your design. For each page below, tell us where every highlighted button (call to action) should link to: a page on your site, a booking link, an email address, or a URL.',
  TRUE,
  '[
    {"id": "intro", "type": "text", "title": "How to fill this in", "body": "Each section shows one page of your new website with the buttons highlighted. Under each screenshot, list the buttons in order and where each one should go. Example: 1) Book a call → https://calendly.com/you"},
    {"id": "s-home", "type": "section", "title": "Home page", "description": ""},
    {"id": "img-home", "type": "image", "fileId": null, "url": null, "alt": "Home page with buttons highlighted", "caption": ""},
    {"id": "q-home", "type": "question", "kind": "long_text", "title": "Where should each highlighted button on the Home page link to?", "description": "", "required": true, "options": [], "allowOther": false},
    {"id": "s-about", "type": "section", "title": "About page", "description": ""},
    {"id": "img-about", "type": "image", "fileId": null, "url": null, "alt": "About page with buttons highlighted", "caption": ""},
    {"id": "q-about", "type": "question", "kind": "long_text", "title": "Where should each highlighted button on the About page link to?", "description": "", "required": true, "options": [], "allowOther": false},
    {"id": "s-services", "type": "section", "title": "Services page", "description": ""},
    {"id": "img-services", "type": "image", "fileId": null, "url": null, "alt": "Services page with buttons highlighted", "caption": ""},
    {"id": "q-services", "type": "question", "kind": "long_text", "title": "Where should each highlighted button on the Services page link to?", "description": "", "required": true, "options": [], "allowOther": false},
    {"id": "s-contact", "type": "section", "title": "Contact page", "description": ""},
    {"id": "img-contact", "type": "image", "fileId": null, "url": null, "alt": "Contact page with buttons highlighted", "caption": ""},
    {"id": "q-contact", "type": "question", "kind": "long_text", "title": "Where should each highlighted button on the Contact page link to?", "description": "", "required": true, "options": [], "allowOther": false},
    {"id": "q-notes", "type": "question", "kind": "long_text", "title": "Anything else we should know about your links?", "description": "", "required": false, "options": [], "allowOther": false}
  ]'::jsonb,
  '{"collectName": true, "collectEmail": false, "confirmationMessage": "Thank you! We have your links and will update your website."}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM forms WHERE "isTemplate" = TRUE AND title = 'CTA Links Form');

COMMIT;
