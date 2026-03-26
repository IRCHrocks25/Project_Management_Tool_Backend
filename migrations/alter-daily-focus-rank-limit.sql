-- Relax rank limit so PMs can add more than 3 priorities per department (matches app DAILY_FOCUS_MAX_RANK up to 50).
ALTER TABLE daily_focus_items DROP CONSTRAINT IF EXISTS chk_daily_focus_rank;
ALTER TABLE daily_focus_items ADD CONSTRAINT chk_daily_focus_rank CHECK (rank >= 1 AND rank <= 50);
