CREATE TABLE IF NOT EXISTS eod_report_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "reportDate" DATE NOT NULL UNIQUE,
  timezone VARCHAR(64) NOT NULL,
  snapshot JSONB NOT NULL,
  "createdById" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_eod_report_snapshots_report_date
  ON eod_report_snapshots ("reportDate");

