-- ============================================================
-- IBRAHIM — Phase 1 Schema — Fik Conciergerie
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- PROJECTS
-- ============================================================
CREATE TABLE IF NOT EXISTS projects (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name         TEXT NOT NULL,
  description  TEXT,
  status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','archived')),
  metadata     JSONB DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TASKS
-- ============================================================
CREATE TABLE IF NOT EXISTS tasks (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id   UUID REFERENCES projects(id) ON DELETE SET NULL,
  title        TEXT NOT NULL,
  description  TEXT,
  action_type  TEXT NOT NULL,
  payload      JSONB NOT NULL DEFAULT '{}',
  status       TEXT NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending','queued','running','waiting_validation','completed','failed','cancelled')),
  priority     INTEGER NOT NULL DEFAULT 5,
  created_by   TEXT NOT NULL DEFAULT 'ibrahim',
  result       JSONB,
  error        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- ============================================================
-- TASK RUNS
-- ============================================================
CREATE TABLE IF NOT EXISTS task_runs (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id    UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  attempt    INTEGER NOT NULL DEFAULT 1,
  status     TEXT NOT NULL CHECK (status IN ('running','completed','failed')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at   TIMESTAMPTZ,
  log        TEXT,
  output     JSONB
);

-- ============================================================
-- VALIDATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS validations (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id      UUID REFERENCES tasks(id) ON DELETE CASCADE,
  type         TEXT NOT NULL CHECK (type IN ('client_reply','financial','other')),
  context      JSONB NOT NULL DEFAULT '{}',
  proposed     JSONB NOT NULL DEFAULT '{}',
  status       TEXT NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending','approved','rejected','expired')),
  decision_by  TEXT,
  decision_at  TIMESTAMPTZ,
  note         TEXT,
  expires_at   TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '1 hour',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- NOTIFICATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS notifications (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type       TEXT NOT NULL,
  channel    TEXT NOT NULL CHECK (channel IN ('pushover','socket','email')),
  title      TEXT NOT NULL,
  message    TEXT NOT NULL,
  priority   INTEGER NOT NULL DEFAULT 0,
  payload    JSONB DEFAULT '{}',
  sent_at    TIMESTAMPTZ,
  status     TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- CONVERSATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS conversations (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id TEXT NOT NULL,
  role       TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
  content    TEXT NOT NULL,
  audio_url  TEXT,
  metadata   JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_conversations_session ON conversations(session_id, created_at DESC);

-- ============================================================
-- USER PREFERENCES
-- ============================================================
CREATE TABLE IF NOT EXISTS user_preferences (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key        TEXT NOT NULL UNIQUE,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- INTEGRATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS integrations (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       TEXT NOT NULL UNIQUE,
  type       TEXT NOT NULL,
  config     JSONB NOT NULL DEFAULT '{}',
  status     TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','error')),
  last_sync  TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- AUDIT LOGS
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor      TEXT NOT NULL DEFAULT 'ibrahim',
  action     TEXT NOT NULL,
  target     TEXT,
  target_id  UUID,
  before     JSONB,
  after      JSONB,
  ip         TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);

-- ============================================================
-- IBRAHIM RULES — Learned rules / memory
-- ============================================================
CREATE TABLE IF NOT EXISTS ibrahim_rules (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category    TEXT NOT NULL,
  rule        TEXT NOT NULL,
  conditions  JSONB DEFAULT '{}',
  action      JSONB DEFAULT '{}',
  confidence  NUMERIC(3,2) NOT NULL DEFAULT 1.00 CHECK (confidence BETWEEN 0 AND 1),
  source      TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','learned','imported')),
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- RESERVATIONS — Fik Conciergerie vehicles
-- ============================================================
CREATE TABLE IF NOT EXISTS reservations (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_name     TEXT NOT NULL,
  client_phone    TEXT,
  client_email    TEXT,
  vehicle_id      TEXT NOT NULL,
  vehicle_name    TEXT NOT NULL,
  start_date      DATE NOT NULL,
  end_date        DATE NOT NULL,
  pickup_location TEXT NOT NULL DEFAULT 'agency',
  return_location TEXT NOT NULL DEFAULT 'agency',
  daily_rate      NUMERIC(10,2) NOT NULL,
  total_amount    NUMERIC(10,2) NOT NULL,
  deposit         NUMERIC(10,2),
  is_vip          BOOLEAN NOT NULL DEFAULT FALSE,
  discount_pct    NUMERIC(5,2) DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'confirmed'
                  CHECK (status IN ('pending','confirmed','active','completed','cancelled')),
  notes           TEXT,
  created_by      TEXT NOT NULL DEFAULT 'ibrahim',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT no_past_start CHECK (start_date >= CURRENT_DATE - INTERVAL '1 day'),
  CONSTRAINT min_duration  CHECK (end_date - start_date >= 2)
);
CREATE INDEX IF NOT EXISTS idx_reservations_dates   ON reservations(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_reservations_vehicle ON reservations(vehicle_id, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_reservations_client  ON reservations(client_phone);

-- ============================================================
-- VEHICLES
-- ============================================================
CREATE TABLE IF NOT EXISTS vehicles (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  brand       TEXT NOT NULL,
  model       TEXT NOT NULL,
  year        INTEGER,
  category    TEXT NOT NULL CHECK (category IN ('sedan','suv','luxury','sport','van')),
  daily_rate  NUMERIC(10,2) NOT NULL,
  available   BOOLEAN NOT NULL DEFAULT TRUE,
  image_url   TEXT,
  metadata    JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- SEED — Business rules
-- ============================================================
INSERT INTO ibrahim_rules (category, rule, conditions, action, source) VALUES
  ('reservation', 'Minimum rental duration is 2 days', '{"min_days": 2}', '{"reject_if_less": true}', 'manual'),
  ('reservation', 'No delivery on Fridays', '{"day_of_week": 5}', '{"block_delivery": true}', 'manual'),
  ('reservation', 'Ramadan pricing +20%', '{"period": "ramadan"}', '{"rate_multiplier": 1.20}', 'manual'),
  ('reservation', 'VIP clients get automatic discount', '{"is_vip": true}', '{"discount_pct": 10}', 'manual'),
  ('reservation', 'Airport Es-Senia delivery available', '{"location": "aeroport_es_senia"}', '{"surcharge": 1500}', 'manual'),
  ('validation', 'Always validate before replying to external client', '{"action": "client_reply"}', '{"require_validation": true}', 'manual'),
  ('validation', 'Always validate significant financial commitments', '{"financial_threshold": 50000}', '{"require_validation": true}', 'manual')
ON CONFLICT DO NOTHING;

-- ============================================================
-- SEED — Default integrations
-- ============================================================
INSERT INTO integrations (name, type, config, status) VALUES
  ('supabase',    'database',      '{"description": "Main database"}', 'active'),
  ('elevenlabs',  'voice',         '{"description": "TTS voice synthesis"}', 'active'),
  ('pushover',    'notification',  '{"description": "iPhone push notifications"}', 'active'),
  ('claude',      'ai',            '{"description": "Claude AI reasoning engine"}', 'active'),
  ('pc-agent',    'websocket',     '{"description": "PC desktop agent"}', 'active')
ON CONFLICT (name) DO NOTHING;

-- ============================================================
-- Updated_at trigger helper
-- ============================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['projects','tasks','integrations','reservations','ibrahim_rules','user_preferences']
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_updated_at ON %I;
       CREATE TRIGGER trg_updated_at BEFORE UPDATE ON %I
       FOR EACH ROW EXECUTE FUNCTION set_updated_at();',
      tbl, tbl
    );
  END LOOP;
END;
$$;
