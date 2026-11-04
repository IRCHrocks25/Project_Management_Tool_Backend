-- AI assistant: conversations, messages, per-user memory and files attached in chat.
-- Idempotent, safe to run again.
CREATE TABLE IF NOT EXISTS assistant_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title varchar(200) NOT NULL DEFAULT 'New chat',
  -- Tool calls waiting for the user's confirmation, plus results already produced in that turn
  "pendingState" jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_assistant_conversations_user
  ON assistant_conversations ("userId", "updatedAt" DESC);

CREATE TABLE IF NOT EXISTS assistant_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "conversationId" uuid NOT NULL REFERENCES assistant_conversations(id) ON DELETE CASCADE,
  role varchar(20) NOT NULL,
  -- Exact API content. Append-only: earlier turns must never be edited.
  content jsonb NOT NULL,
  -- What the chat shows for this row; NULL for rows with nothing to show (tool results)
  "displayText" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  seq bigserial NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_assistant_messages_conversation
  ON assistant_messages ("conversationId", seq);

CREATE TABLE IF NOT EXISTS assistant_memories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_assistant_memories_user ON assistant_memories ("userId");

CREATE TABLE IF NOT EXISTS assistant_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "fileName" varchar(255) NOT NULL,
  "mimeType" varchar(120) NOT NULL,
  size integer NOT NULL,
  data bytea NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_assistant_files_user ON assistant_files ("userId");
