-- ════════════════════════════════════════════════════════════════
-- Migration P12a — Memory Engine Foundation
-- Date    : 2026-05-10
-- Branch  : feat/p12a-memory-engine
-- Prereq  : schema-phase1.sql (set_updated_at function must exist)
--           migration_phase3_4.sql (ibrahim_memory must exist)
-- Reverse : migration_p12a_memory_engine_rollback.sql
-- ════════════════════════════════════════════════════════════════
-- Non-destructive: ibrahim_memory preserved intact.
-- All CREATE statements use IF NOT EXISTS / ON CONFLICT DO NOTHING.
-- ════════════════════════════════════════════════════════════════

-- ── Ensure set_updated_at() exists (idempotent re-define) ──────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ════════════════════════════════════════════════════════════════
-- TABLE 1 — user_profile
-- One row per owner (singleton for 'kouider')
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS user_profile (
  id                    UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id               TEXT        NOT NULL DEFAULT 'kouider',

  -- Identité
  name                  TEXT        DEFAULT 'Kouider',
  languages             TEXT[]      DEFAULT ARRAY['fr', 'ar'],
  location_primary      TEXT        DEFAULT 'Bruxelles',
  location_secondary    TEXT        DEFAULT 'Oran',
  timezone_primary      TEXT        DEFAULT 'Europe/Brussels',
  timezone_secondary    TEXT        DEFAULT 'Africa/Algiers',

  -- Horaires travail
  work_days             INT[]       DEFAULT ARRAY[1,2,3,4,5],
  work_start            TIME        DEFAULT '09:00',
  work_end              TIME        DEFAULT '17:30',
  flex_hours            BOOLEAN     DEFAULT TRUE,
  commute_mode          TEXT        DEFAULT 'car',
  commute_minutes_avg   INT         DEFAULT 25,

  -- Routine matin
  wake_time             TIME        DEFAULT '07:00',
  morning_vitamins      BOOLEAN     DEFAULT FALSE,
  morning_coffee        BOOLEAN     DEFAULT TRUE,
  breakfast             BOOLEAN     DEFAULT TRUE,

  -- Routine soir
  sleep_time            TIME        DEFAULT '23:30',
  wind_down_minutes     INT         DEFAULT 30,

  -- Famille
  family_members        JSONB       DEFAULT '[]',
  quality_time_gap_days INT         DEFAULT 3,

  -- Santé
  medications           TEXT[]      DEFAULT ARRAY[]::TEXT[],
  supplements           TEXT[]      DEFAULT ARRAY[]::TEXT[],
  health_reminders      BOOLEAN     DEFAULT FALSE,

  -- Préférences Dzaryx
  preferred_channel     TEXT        DEFAULT 'telegram',
  response_style        TEXT        DEFAULT 'concise',
  voice_mode            BOOLEAN     DEFAULT TRUE,
  language_auto         BOOLEAN     DEFAULT TRUE,

  -- Business
  business_name         TEXT        DEFAULT 'Fik Conciergerie',
  business_role         TEXT        DEFAULT 'owner',
  business_partner      TEXT        DEFAULT 'Houari',
  business_location     TEXT        DEFAULT 'Oran',
  profit_split_pct      NUMERIC     DEFAULT 0.5,

  -- Timestamps
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT unique_user_profile UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_profile_user_id
  ON user_profile(user_id);

ALTER TABLE user_profile ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "service_role_all_user_profile"
  ON user_profile FOR ALL USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS trg_user_profile_updated_at ON user_profile;
CREATE TRIGGER trg_user_profile_updated_at
  BEFORE UPDATE ON user_profile
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ════════════════════════════════════════════════════════════════
-- TABLE 2 — memory_facts
-- L2 Semantic Memory — structured permanent facts
-- Replaces the flat ibrahim_memory for new writes.
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS memory_facts (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     TEXT        NOT NULL DEFAULT 'kouider',

  domain      TEXT        NOT NULL,
  -- identity | habit | routine | preference | goal | health |
  -- family | business | vehicle | client | finance | learning | general

  key         TEXT        NOT NULL,
  value       TEXT        NOT NULL,
  value_type  TEXT        NOT NULL DEFAULT 'text',
  -- text | boolean | number | json | date

  value_json  JSONB,

  -- Contexte
  confidence  NUMERIC     NOT NULL DEFAULT 1.0,
  source      TEXT        NOT NULL DEFAULT 'explicit',
  -- explicit | inferred | learned | migrated

  verified    BOOLEAN     NOT NULL DEFAULT FALSE,

  -- Temporalité
  is_current  BOOLEAN     NOT NULL DEFAULT TRUE,
  valid_from  DATE,
  valid_until DATE,

  -- Timestamps
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_facts_domain CHECK (
    domain IN ('identity', 'habit', 'routine', 'preference', 'goal',
               'health', 'family', 'business', 'vehicle', 'client',
               'finance', 'learning', 'general')
  ),
  CONSTRAINT chk_facts_value_type CHECK (
    value_type IN ('text', 'boolean', 'number', 'json', 'date')
  ),
  CONSTRAINT chk_facts_confidence CHECK (confidence BETWEEN 0.0 AND 1.0),
  CONSTRAINT unique_fact UNIQUE(user_id, domain, key)
);

CREATE INDEX IF NOT EXISTS idx_facts_user_domain
  ON memory_facts(user_id, domain);
CREATE INDEX IF NOT EXISTS idx_facts_current
  ON memory_facts(user_id, is_current) WHERE is_current = TRUE;
CREATE INDEX IF NOT EXISTS idx_facts_created
  ON memory_facts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_facts_importance
  ON memory_facts(user_id, confidence DESC);

ALTER TABLE memory_facts ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "service_role_all_memory_facts"
  ON memory_facts FOR ALL USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS trg_memory_facts_updated_at ON memory_facts;
CREATE TRIGGER trg_memory_facts_updated_at
  BEFORE UPDATE ON memory_facts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ════════════════════════════════════════════════════════════════
-- TABLE 3 — memory_episodes
-- L1 Episodic Memory — rolling 30-day window, auto-expires
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS memory_episodes (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),

  episode_type  TEXT        NOT NULL,
  -- conversation_summary | booking_event | calendar_event |
  -- financial_event | vehicle_event | notification_sent |
  -- user_request | proactive_trigger | document_scan | manual

  summary       TEXT        NOT NULL,
  entities      JSONB       NOT NULL DEFAULT '{}',
  sentiment     TEXT        NOT NULL DEFAULT 'neutral',
  importance    INT         NOT NULL DEFAULT 3,
  session_id    TEXT,
  source        TEXT        NOT NULL DEFAULT 'system',
  -- telegram | app | cron | nexus | system | manual

  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at    TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),

  search_vector TSVECTOR,

  CONSTRAINT chk_episodes_importance CHECK (importance BETWEEN 1 AND 5),
  CONSTRAINT chk_episodes_sentiment  CHECK (
    sentiment IN ('positive', 'neutral', 'negative', 'urgent')
  ),
  CONSTRAINT chk_episodes_source CHECK (
    source IN ('telegram', 'app', 'cron', 'nexus', 'system', 'manual')
  )
);

CREATE INDEX IF NOT EXISTS idx_episodes_type
  ON memory_episodes(episode_type, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_episodes_importance
  ON memory_episodes(importance DESC, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_episodes_source
  ON memory_episodes(source, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_episodes_expires
  ON memory_episodes(expires_at);
CREATE INDEX IF NOT EXISTS idx_episodes_fts
  ON memory_episodes USING gin(search_vector);

-- Auto-populate search_vector on insert/update
CREATE OR REPLACE FUNCTION update_episode_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector = to_tsvector(
    'french',
    COALESCE(NEW.summary, '') || ' ' || COALESCE(NEW.entities::text, '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_episode_search_vector ON memory_episodes;
CREATE TRIGGER trg_episode_search_vector
  BEFORE INSERT OR UPDATE ON memory_episodes
  FOR EACH ROW EXECUTE FUNCTION update_episode_search_vector();

ALTER TABLE memory_episodes ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "service_role_all_memory_episodes"
  ON memory_episodes FOR ALL USING (true) WITH CHECK (true);

-- ════════════════════════════════════════════════════════════════
-- TABLE 4 — memory_habits
-- Recurring behavioral patterns & routines
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS memory_habits (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       TEXT        NOT NULL DEFAULT 'kouider',
  habit_name    TEXT        NOT NULL,

  -- Quand
  schedule_type TEXT        NOT NULL,
  -- daily | weekly | interval | condition
  schedule_cron TEXT,
  interval_hours INT,
  condition     TEXT,

  -- Quoi
  description   TEXT        NOT NULL,
  action_type   TEXT        NOT NULL,
  -- remind | check | notify | auto_do
  action_data   JSONB       NOT NULL DEFAULT '{}',

  -- Suivi
  last_done_at  TIMESTAMPTZ,
  streak_days   INT         NOT NULL DEFAULT 0,
  missed_count  INT         NOT NULL DEFAULT 0,
  active        BOOLEAN     NOT NULL DEFAULT TRUE,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_habits_schedule CHECK (
    schedule_type IN ('daily', 'weekly', 'interval', 'condition')
  ),
  CONSTRAINT chk_habits_action CHECK (
    action_type IN ('remind', 'check', 'notify', 'auto_do')
  ),
  CONSTRAINT unique_habit UNIQUE(user_id, habit_name)
);

CREATE INDEX IF NOT EXISTS idx_habits_user_active
  ON memory_habits(user_id, active) WHERE active = TRUE;
CREATE INDEX IF NOT EXISTS idx_habits_schedule
  ON memory_habits(user_id, schedule_type);

ALTER TABLE memory_habits ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "service_role_all_memory_habits"
  ON memory_habits FOR ALL USING (true) WITH CHECK (true);

-- ════════════════════════════════════════════════════════════════
-- ENRICH — ibrahim_rules (P12 columns, non-destructive)
-- ════════════════════════════════════════════════════════════════

ALTER TABLE ibrahim_rules
  ADD COLUMN IF NOT EXISTS priority     INT         DEFAULT 5,
  ADD COLUMN IF NOT EXISTS trigger_type TEXT        DEFAULT 'any',
  ADD COLUMN IF NOT EXISTS auto_apply   BOOLEAN     DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS last_applied TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS apply_count  INT         DEFAULT 0;

-- ════════════════════════════════════════════════════════════════
-- MIGRATION — ibrahim_memory → memory_facts
-- Non-destructive: original table untouched.
-- key = 'migrated:' || original UUID (guaranteed unique)
-- ════════════════════════════════════════════════════════════════

INSERT INTO memory_facts (
  user_id,
  domain,
  key,
  value,
  value_type,
  source,
  confidence,
  verified,
  is_current,
  created_at,
  updated_at
)
SELECT
  'kouider'                        AS user_id,
  CASE category
    WHEN 'personal'   THEN 'identity'
    WHEN 'business'   THEN 'business'
    WHEN 'rule'       THEN 'business'
    WHEN 'preference' THEN 'preference'
    WHEN 'fact'       THEN 'identity'
    WHEN 'health'     THEN 'health'
    WHEN 'family'     THEN 'family'
    ELSE                   'general'
  END                              AS domain,
  'migrated:' || id::text          AS key,
  content                          AS value,
  'text'                           AS value_type,
  'migrated'                       AS source,
  1.0                              AS confidence,
  TRUE                             AS verified,
  TRUE                             AS is_current,
  created_at,
  COALESCE(updated_at, created_at) AS updated_at
FROM ibrahim_memory
ON CONFLICT (user_id, domain, key) DO NOTHING;

-- ════════════════════════════════════════════════════════════════
-- SEED — user_profile (Kouider initial)
-- ════════════════════════════════════════════════════════════════

INSERT INTO user_profile (
  user_id, name, languages,
  location_primary, location_secondary,
  timezone_primary, timezone_secondary,
  work_days, work_start, work_end, flex_hours,
  commute_mode, commute_minutes_avg,
  wake_time, morning_vitamins, morning_coffee, breakfast,
  sleep_time, family_members,
  preferred_channel, response_style, voice_mode, language_auto,
  business_name, business_role, business_partner,
  business_location, profit_split_pct
)
VALUES (
  'kouider', 'Kouider', ARRAY['fr', 'ar'],
  'Bruxelles', 'Oran',
  'Europe/Brussels', 'Africa/Algiers',
  ARRAY[1,2,3,4,5], '09:00', '17:30', TRUE,
  'car', 25,
  '07:00', FALSE, TRUE, TRUE,
  '23:30', '[]'::jsonb,
  'telegram', 'concise', TRUE, TRUE,
  'Fik Conciergerie', 'owner', 'Houari',
  'Oran', 0.5
)
ON CONFLICT (user_id) DO NOTHING;

-- ════════════════════════════════════════════════════════════════
-- SEED — memory_facts (profil initial Kouider)
-- ════════════════════════════════════════════════════════════════

INSERT INTO memory_facts (user_id, domain, key, value, value_type, source, verified, confidence)
VALUES
  -- Identité
  ('kouider', 'identity',    'full_name',          'Kouider',                                             'text', 'explicit', TRUE, 1.0),
  ('kouider', 'identity',    'location',           'Bruxelles (résidence principale) / Oran (famille + business)', 'text', 'explicit', TRUE, 1.0),
  ('kouider', 'identity',    'languages',          'français (principal), arabe (famille + clients)',     'text', 'explicit', TRUE, 1.0),

  -- Business
  ('kouider', 'business',    'company_name',       'Fik Conciergerie',                                    'text', 'explicit', TRUE, 1.0),
  ('kouider', 'business',    'business_type',      'Location de voitures — Oran, Algérie',                'text', 'explicit', TRUE, 1.0),
  ('kouider', 'business',    'partner',            'Houari — confirmations requises pour toute remise',   'text', 'explicit', TRUE, 1.0),
  ('kouider', 'business',    'deposit_policy',     'Acompte 30% minimum à la réservation',                'text', 'explicit', TRUE, 1.0),
  ('kouider', 'business',    'dzaryx_role',        'Dzaryx = assistant mobile, vocal et Telegram de Kouider', 'text', 'explicit', TRUE, 1.0),
  ('kouider', 'business',    'nexus_role',         'Nexus = agent autonome sur PC Windows à Bruxelles',   'text', 'explicit', TRUE, 1.0),

  -- Objectifs
  ('kouider', 'goal',        'assistant_mission',  'Assistant personnel + business proactif — anticipe, n''attend pas qu''on demande', 'text', 'explicit', TRUE, 1.0),
  ('kouider', 'goal',        'tiktok_target',      '2 vidéos TikTok minimum par semaine',                 'text', 'explicit', TRUE, 1.0),

  -- Préférences
  ('kouider', 'preference',  'response_style',     'Direct, concis, pas de blabla. Style caveman si possible.', 'text', 'explicit', TRUE, 1.0),
  ('kouider', 'preference',  'primary_channel',    'Telegram (canal principal) + app mobile (secondaire)', 'text', 'explicit', TRUE, 1.0)
ON CONFLICT (user_id, domain, key) DO NOTHING;

-- ════════════════════════════════════════════════════════════════
-- VERIFICATION — Row counts after migration
-- ════════════════════════════════════════════════════════════════

SELECT 'user_profile'    AS table_name, COUNT(*) AS rows FROM user_profile
UNION ALL
SELECT 'memory_facts',   COUNT(*) FROM memory_facts
UNION ALL
SELECT 'memory_episodes', COUNT(*) FROM memory_episodes
UNION ALL
SELECT 'memory_habits',   COUNT(*) FROM memory_habits
UNION ALL
SELECT 'ibrahim_memory (source)', COUNT(*) FROM ibrahim_memory;

SELECT 'Migration P12a terminée ✅' AS status;
