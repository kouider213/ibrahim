-- P15 v2 — Add timezone enrichment columns to reminders table
-- Run AFTER reminders_migration.sql (idempotent — IF NOT EXISTS)

ALTER TABLE reminders ADD COLUMN IF NOT EXISTS utc_offset    TEXT;
ALTER TABLE reminders ADD COLUMN IF NOT EXISTS local_time_iso TEXT;
ALTER TABLE reminders ADD COLUMN IF NOT EXISTS timezone_source TEXT;
