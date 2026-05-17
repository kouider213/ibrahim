-- Migration: add dedup_key column to memory_facts
-- Purpose: SHA256 hash for fast exact-duplicate detection in memory writes.
--          Without this column, memory-engine.ts falls back to slower ILIKE search.
-- Run in Supabase SQL Editor: Projects → SQL Editor → paste → Run

ALTER TABLE memory_facts
  ADD COLUMN IF NOT EXISTS dedup_key TEXT;

-- Unique index for hash-based dedup lookup
CREATE UNIQUE INDEX IF NOT EXISTS idx_facts_dedup_key
  ON memory_facts(dedup_key)
  WHERE dedup_key IS NOT NULL;

-- Backfill existing rows with a stable hash based on normalized value + domain + user_id
-- (matches the logic in memory-engine.ts buildDedupKey)
UPDATE memory_facts
SET dedup_key = encode(
  digest(
    lower(regexp_replace(regexp_replace(trim(value), '[.!?;:]', '', 'g'), '\s+', ' ', 'g'))
    || '|' || domain || '|' || user_id,
    'sha256'
  ),
  'hex'
)
WHERE dedup_key IS NULL;

-- Verify
SELECT
  COUNT(*) FILTER (WHERE dedup_key IS NOT NULL) AS with_dedup_key,
  COUNT(*) FILTER (WHERE dedup_key IS NULL)     AS without_dedup_key
FROM memory_facts;
