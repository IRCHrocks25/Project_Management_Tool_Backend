-- Meetings: video calls inside the platform. Contract: docs/meetings.md.
-- ALTER TYPE ... ADD VALUE cannot run inside a transaction block on older Postgres, so it comes first.
ALTER TYPE notifications_type_enum ADD VALUE IF NOT EXISTS 'meeting_invite';

BEGIN;

CREATE TABLE IF NOT EXISTS meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(200) NOT NULL,
  notes TEXT,
  "startsAt" TIMESTAMP WITH TIME ZONE NOT NULL,
  "durationMinutes" INT NOT NULL DEFAULT 30,
  status VARCHAR(20) NOT NULL DEFAULT 'scheduled',
  "hostId" UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "projectId" UUID REFERENCES projects(id) ON DELETE SET NULL,
  "roomName" VARCHAR(64) NOT NULL UNIQUE,
  "guestCode" VARCHAR(64) NOT NULL UNIQUE,
  "guestLinkEnabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "startedAt" TIMESTAMP WITH TIME ZONE,
  "endedAt" TIMESTAMP WITH TIME ZONE,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT meetings_status_check CHECK (status IN ('scheduled', 'live', 'ended', 'cancelled')),
  CONSTRAINT meetings_duration_check CHECK ("durationMinutes" BETWEEN 5 AND 480)
);
CREATE INDEX IF NOT EXISTS idx_meetings_host ON meetings("hostId");
CREATE INDEX IF NOT EXISTS idx_meetings_starts_at ON meetings("startsAt");
CREATE INDEX IF NOT EXISTS idx_meetings_project ON meetings("projectId");

-- Teammates invited to a meeting. joinedAt is when they first joined, so it doubles as attendance.
CREATE TABLE IF NOT EXISTS meeting_invitees (
  "meetingId" UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  "userId" UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "joinedAt" TIMESTAMP WITH TIME ZONE,
  PRIMARY KEY ("meetingId", "userId")
);
CREATE INDEX IF NOT EXISTS idx_meeting_invitees_user ON meeting_invitees("userId");

-- People without an account who opened the guest link. They wait until the host admits them.
CREATE TABLE IF NOT EXISTS meeting_guests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "meetingId" UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  name VARCHAR(80) NOT NULL,
  "secretHash" VARCHAR(64) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'waiting',
  "lastSeenAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  "admittedAt" TIMESTAMP WITH TIME ZONE,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT meeting_guests_status_check CHECK (status IN ('waiting', 'admitted', 'denied'))
);
CREATE INDEX IF NOT EXISTS idx_meeting_guests_meeting ON meeting_guests("meetingId", status);

COMMIT;
