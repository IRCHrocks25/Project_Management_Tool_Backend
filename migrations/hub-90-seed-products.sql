-- Katalyst Hub: the six internal products, names only. Owners fill in the details in the Hub.
BEGIN;

INSERT INTO products (slug, name, code, status) VALUES
  ('courseforge', 'CourseForge', 'CF', 'live'),
  ('sopmaster', 'SOPMaster', 'SOP', 'building'),
  ('maistro', 'Maistro', 'MAI', 'building'),
  ('cms', 'CMS', 'CMS', 'building'),
  ('project-management-tool', 'Project Management Tool', 'PM', 'live'),
  ('iceberg', 'Iceberg', 'ICE', 'live')
ON CONFLICT DO NOTHING;

COMMIT;
