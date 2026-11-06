-- Recordings of meetings, made in the host's browser and stored as private videos in Iceberg.
BEGIN;

CREATE TABLE IF NOT EXISTS meeting_recordings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "meetingId" UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  "startedById" UUID REFERENCES users(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'recording',
  "uploadId" VARCHAR(120),
  "assetId" VARCHAR(120),
  "assetKey" VARCHAR(300),
  "contentType" VARCHAR(80),
  "sizeBytes" BIGINT,
  "durationSeconds" INT,
  "startedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  "endedAt" TIMESTAMP WITH TIME ZONE,
  CONSTRAINT meeting_recordings_status_check CHECK (status IN ('recording', 'uploading', 'ready', 'failed'))
);
CREATE INDEX IF NOT EXISTS idx_meeting_recordings_meeting ON meeting_recordings("meetingId", status);
CREATE INDEX IF NOT EXISTS idx_meeting_recordings_started ON meeting_recordings("startedAt" DESC);

COMMIT;
