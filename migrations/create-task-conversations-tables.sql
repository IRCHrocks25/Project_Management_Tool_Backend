BEGIN;

-- Create task_questions table
CREATE TABLE IF NOT EXISTS task_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "taskId" UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  "userId" UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  "mentionedUserIds" TEXT, -- Simple array format: "id1,id2,id3"
  "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create task_comments table
CREATE TABLE IF NOT EXISTS task_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "questionId" UUID NOT NULL REFERENCES task_questions(id) ON DELETE CASCADE,
  "userId" UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  "mentionedUserIds" TEXT, -- Simple array format: "id1,id2,id3"
  "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for faster queries on task_questions
CREATE INDEX IF NOT EXISTS idx_task_questions_task_id ON task_questions("taskId");
CREATE INDEX IF NOT EXISTS idx_task_questions_user_id ON task_questions("userId");
CREATE INDEX IF NOT EXISTS idx_task_questions_created_at ON task_questions("createdAt");

-- Create indexes for faster queries on task_comments
CREATE INDEX IF NOT EXISTS idx_task_comments_question_id ON task_comments("questionId");
CREATE INDEX IF NOT EXISTS idx_task_comments_user_id ON task_comments("userId");
CREATE INDEX IF NOT EXISTS idx_task_comments_created_at ON task_comments("createdAt");

COMMIT;

