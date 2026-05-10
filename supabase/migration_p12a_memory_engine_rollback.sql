-- ════════════════════════════════════════════════════════════════
-- Rollback P12a — Memory Engine Foundation
-- Date    : 2026-05-10
-- Applies : migration_p12a_memory_engine.sql
-- Safety  : ibrahim_memory is NOT touched (source data preserved)
-- ════════════════════════════════════════════════════════════════

-- ── Remove enrichment columns from ibrahim_rules ───────────────
ALTER TABLE ibrahim_rules
  DROP COLUMN IF EXISTS priority,
  DROP COLUMN IF EXISTS trigger_type,
  DROP COLUMN IF EXISTS auto_apply,
  DROP COLUMN IF EXISTS last_applied,
  DROP COLUMN IF EXISTS apply_count;

-- ── Drop triggers + functions ──────────────────────────────────
DROP TRIGGER IF EXISTS trg_episode_search_vector ON memory_episodes;
DROP FUNCTION IF EXISTS update_episode_search_vector();

DROP TRIGGER IF EXISTS trg_memory_facts_updated_at ON memory_facts;
DROP TRIGGER IF EXISTS trg_user_profile_updated_at ON user_profile;

-- ── Drop tables (reverse dependency order) ─────────────────────
DROP TABLE IF EXISTS memory_habits;
DROP TABLE IF EXISTS memory_episodes;
DROP TABLE IF EXISTS memory_facts;
DROP TABLE IF EXISTS user_profile;

-- NOTE: set_updated_at() function is NOT dropped — shared with
--       other tables (created in schema-phase1.sql).

SELECT 'Rollback P12a terminé ✅ — ibrahim_memory intacte' AS status;
