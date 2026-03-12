BEGIN;

-- Create chat_rooms table
CREATE TABLE IF NOT EXISTS chat_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type VARCHAR(50) DEFAULT 'dm',
  name VARCHAR(255),
  "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create chat_room_participants table
CREATE TABLE IF NOT EXISTS chat_room_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "roomId" UUID NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
  "userId" UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "lastReadAt" TIMESTAMP,
  "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE("roomId", "userId")
);

-- Create chat_messages table
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "roomId" UUID NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
  "senderId" UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_chat_room_participants_room_id ON chat_room_participants("roomId");
CREATE INDEX IF NOT EXISTS idx_chat_room_participants_user_id ON chat_room_participants("userId");
CREATE INDEX IF NOT EXISTS idx_chat_messages_room_id ON chat_messages("roomId");
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages("createdAt");

COMMIT;
