-- Migration: Make email body column nullable
-- This allows logging emails without requiring a body field

ALTER TABLE emails 
ALTER COLUMN body DROP NOT NULL;

