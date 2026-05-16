-- ════════════════════════════════════════════════════════════════
-- Migration Deep Memory — Mood + Client Intelligence
-- Date    : 2026-05-16
-- ════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════
-- TABLE 1 — mood_sessions
-- Humeur détectée par message/session
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS mood_sessions (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      TEXT        NOT NULL DEFAULT 'kouider',
  session_id   TEXT        NOT NULL,

  -- Humeur détectée
  mood         TEXT        NOT NULL DEFAULT 'normal',
  -- normal | stressed | angry | happy | tired | rushed | anxious | focused

  intensity    INT         NOT NULL DEFAULT 3,
  -- 1 (léger) → 5 (fort)

  signals      TEXT[]      NOT NULL DEFAULT ARRAY[]::TEXT[],
  -- ex: ['messages_courts', 'majuscules', 'heure_tardive']

  raw_message  TEXT,       -- extrait du message analysé (50 chars)
  dzaryx_tone  TEXT        NOT NULL DEFAULT 'normal',
  -- ton recommandé: normal | soft | direct | motivational | silent

  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mood_user_recent
  ON mood_sessions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mood_session
  ON mood_sessions(session_id, created_at DESC);

ALTER TABLE mood_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_all_mood" ON mood_sessions;
CREATE POLICY "service_role_all_mood"
  ON mood_sessions FOR ALL USING (true) WITH CHECK (true);

-- ════════════════════════════════════════════════════════════════
-- TABLE 2 — client_intelligence
-- Fiche comportementale par client
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS client_intelligence (
  id                    UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id              TEXT        NOT NULL DEFAULT 'kouider',

  -- Identité
  client_name           TEXT        NOT NULL,
  client_phone          TEXT,

  -- Préférences véhicules
  preferred_cars        TEXT[]      NOT NULL DEFAULT ARRAY[]::TEXT[],
  avoided_cars          TEXT[]      NOT NULL DEFAULT ARRAY[]::TEXT[],

  -- Patterns de réservation
  typical_duration_days NUMERIC,      -- durée moyenne
  typical_months        INT[]        DEFAULT ARRAY[]::INT[],  -- mois où il réserve
  typical_day_of_week   INT[]        DEFAULT ARRAY[]::INT[],  -- jours de semaine (0=lundi)
  always_weekend        BOOLEAN      DEFAULT FALSE,
  always_airport        BOOLEAN      DEFAULT FALSE,

  -- Comportement financier
  negotiation_style     TEXT         DEFAULT 'normal',
  -- never_negotiates | light_negotiation | heavy_negotiation | always_asks_discount
  avg_discount_asked    NUMERIC      DEFAULT 0,   -- % moyen de remise demandée
  payment_reliability   TEXT         DEFAULT 'unknown',
  -- always_on_time | sometimes_late | often_late | unknown
  avg_paid_pct          NUMERIC      DEFAULT 100,  -- % moyen encaissé

  -- Comportement général
  communication_style   TEXT         DEFAULT 'normal',
  -- formal | casual | very_casual | arabic_only | french_only | mixed
  typical_lead_days     INT          DEFAULT 3,   -- combien de jours avant il réserve
  cancellation_count    INT          DEFAULT 0,
  notes                 TEXT,

  -- Stats
  total_bookings        INT          NOT NULL DEFAULT 0,
  total_spent           NUMERIC      NOT NULL DEFAULT 0,
  last_booking_date     DATE,
  score                 TEXT         DEFAULT 'NEW',
  -- VIP | FREQUENT | REGULAR | NEW | RISKY

  -- Timestamps
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT unique_client_intel UNIQUE(owner_id, client_name)
);

CREATE INDEX IF NOT EXISTS idx_client_intel_owner
  ON client_intelligence(owner_id);
CREATE INDEX IF NOT EXISTS idx_client_intel_name
  ON client_intelligence(client_name);
CREATE INDEX IF NOT EXISTS idx_client_intel_score
  ON client_intelligence(owner_id, score);
CREATE INDEX IF NOT EXISTS idx_client_intel_phone
  ON client_intelligence(client_phone);

ALTER TABLE client_intelligence ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_all_client_intel" ON client_intelligence;
CREATE POLICY "service_role_all_client_intel"
  ON client_intelligence FOR ALL USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS trg_client_intel_updated_at ON client_intelligence;
CREATE TRIGGER trg_client_intel_updated_at
  BEFORE UPDATE ON client_intelligence
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ════════════════════════════════════════════════════════════════
-- Vérification
-- ════════════════════════════════════════════════════════════════

SELECT 'mood_sessions'       AS table_name, COUNT(*) AS rows FROM mood_sessions
UNION ALL
SELECT 'client_intelligence', COUNT(*) FROM client_intelligence;

SELECT 'Migration Deep Memory ✅' AS status;
