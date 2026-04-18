-- ============================================================
-- IBRAHIM — Tables à créer (n'écrase pas les tables existantes)
-- Exécuter dans : https://supabase.com/dashboard/project/febrrgqpyqqrewcohomx/sql
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS tasks (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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

CREATE TABLE IF NOT EXISTS notifications (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type       TEXT NOT NULL,
  channel    TEXT NOT NULL,
  title      TEXT NOT NULL,
  message    TEXT NOT NULL,
  priority   INTEGER NOT NULL DEFAULT 0,
  payload    JSONB DEFAULT '{}',
  sent_at    TIMESTAMPTZ,
  status     TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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

CREATE TABLE IF NOT EXISTS user_preferences (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key        TEXT NOT NULL UNIQUE,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS integrations (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       TEXT NOT NULL UNIQUE,
  type       TEXT NOT NULL,
  config     JSONB NOT NULL DEFAULT '{}',
  status     TEXT NOT NULL DEFAULT 'active',
  last_sync  TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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

CREATE TABLE IF NOT EXISTS ibrahim_rules (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category    TEXT NOT NULL,
  rule        TEXT NOT NULL,
  conditions  JSONB DEFAULT '{}',
  action      JSONB DEFAULT '{}',
  confidence  NUMERIC(3,2) NOT NULL DEFAULT 1.00,
  source      TEXT NOT NULL DEFAULT 'manual',
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed règles métier Ibrahim
INSERT INTO ibrahim_rules (category, rule, conditions, action, source) VALUES
  ('reservation','Durée minimum 2 jours','{"min_days":2}','{"reject_if_less":true}','manual'),
  ('reservation','Pas de livraison vendredi','{"day_of_week":5}','{"block_delivery":true}','manual'),
  ('reservation','Ramadan +20%','{"period":"ramadan"}','{"rate_multiplier":1.20}','manual'),
  ('reservation','Client VIP remise 10%','{"is_vip":true}','{"discount_pct":10}','manual'),
  ('reservation','Aéroport Es-Sénia +1500 DZD','{"location":"aeroport_es_senia"}','{"surcharge":1500}','manual'),
  ('validation','Toujours valider réponse client','{"action":"client_reply"}','{"require_validation":true}','manual'),
  ('validation','Valider engagement >50000 DZD','{"financial_threshold":50000}','{"require_validation":true}','manual')
ON CONFLICT DO NOTHING;

-- Seed intégrations
INSERT INTO integrations (name, type, config, status) VALUES
  ('supabase','database','{"description":"Main database"}','active'),
  ('elevenlabs','voice','{"description":"TTS"}','active'),
  ('pushover','notification','{"description":"iPhone push"}','active'),
  ('claude','ai','{"description":"Claude AI"}','active'),
  ('pc-agent','websocket','{"description":"PC agent"}','active')
ON CONFLICT (name) DO NOTHING;

SELECT 'Ibrahim tables created successfully!' as result;
