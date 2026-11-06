-- Otter-style meeting notes: one person's browser captures the call audio, then it is transcribed and summarised.
-- Audio chunks are deleted as soon as the transcript is saved.
BEGIN;

ALTER TABLE meetings ADD COLUMN IF NOT EXISTS "notesBlocked" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS meeting_note_preferences (
  "userId" UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  "autoNotes" BOOLEAN NOT NULL DEFAULT false,
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS meeting_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "meetingId" UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'capturing',
  "capturerId" UUID REFERENCES users(id) ON DELETE SET NULL,
  "capturerLeaseAt" TIMESTAMP WITH TIME ZONE,
  segments JSONB NOT NULL DEFAULT '[]',
  "speakerSpans" JSONB NOT NULL DEFAULT '[]',
  transcript JSONB,
  language VARCHAR(20),
  "durationSeconds" INT,
  overview TEXT,
  topics JSONB,
  attempts INT NOT NULL DEFAULT 0,
  "lastActivityAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  "closingAt" TIMESTAMP WITH TIME ZONE,
  "processingAt" TIMESTAMP WITH TIME ZONE,
  "startedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  "readyAt" TIMESTAMP WITH TIME ZONE,
  CONSTRAINT meeting_notes_status_check CHECK (status IN ('capturing', 'closing', 'processing', 'ready', 'empty', 'failed'))
);
-- One set of notes at a time per call, so several people with Auto notes on don't pay for the same transcript.
CREATE UNIQUE INDEX IF NOT EXISTS uq_meeting_notes_capturing ON meeting_notes("meetingId") WHERE status = 'capturing';
CREATE INDEX IF NOT EXISTS idx_meeting_notes_status ON meeting_notes(status, "closingAt");

CREATE TABLE IF NOT EXISTS meeting_note_recipients (
  "noteId" UUID NOT NULL REFERENCES meeting_notes(id) ON DELETE CASCADE,
  "userId" UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "lastSeenAt" TIMESTAMP WITH TIME ZONE,
  "emailedAt" TIMESTAMP WITH TIME ZONE,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  PRIMARY KEY ("noteId", "userId")
);
CREATE INDEX IF NOT EXISTS idx_meeting_note_recipients_user ON meeting_note_recipients("userId", "createdAt" DESC);

CREATE TABLE IF NOT EXISTS meeting_note_chunks (
  "noteId" UUID NOT NULL REFERENCES meeting_notes(id) ON DELETE CASCADE,
  segment INT NOT NULL,
  seq INT NOT NULL,
  data BYTEA NOT NULL,
  PRIMARY KEY ("noteId", segment, seq)
);

CREATE TABLE IF NOT EXISTS meeting_note_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "noteId" UUID NOT NULL REFERENCES meeting_notes(id) ON DELETE CASCADE,
  position INT NOT NULL,
  text TEXT NOT NULL,
  "ownerName" VARCHAR(120),
  done BOOLEAN NOT NULL DEFAULT false,
  "taskId" UUID REFERENCES tasks(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_meeting_note_items_note ON meeting_note_items("noteId", position);

COMMIT;
