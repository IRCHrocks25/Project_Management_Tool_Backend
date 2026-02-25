BEGIN;

-- Create client_update_comments table
CREATE TABLE IF NOT EXISTS client_update_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "updateId" UUID NOT NULL REFERENCES client_updates(id) ON DELETE CASCADE,
  "userId" UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  "mentionedUserIds" TEXT, -- Simple array format: "id1,id2,id3"
  "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_client_update_comments_update_id ON client_update_comments("updateId");
CREATE INDEX IF NOT EXISTS idx_client_update_comments_user_id ON client_update_comments("userId");
CREATE INDEX IF NOT EXISTS idx_client_update_comments_created_at ON client_update_comments("createdAt");

COMMIT;

