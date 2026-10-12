-- Prospection B2B FIK Conciergerie (appliquée automatiquement au boot par ensureProspectsTable)
CREATE TABLE IF NOT EXISTS prospects (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company           TEXT NOT NULL,
  contact_name      TEXT,
  email             TEXT,
  phone             TEXT,
  segment           TEXT NOT NULL DEFAULT 'autre',
  city              TEXT NOT NULL DEFAULT 'Oran',
  source            TEXT,
  status            TEXT NOT NULL DEFAULT 'a_contacter',
  notes             TEXT,
  last_contacted_at TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS prospects_email_uniq ON prospects (lower(email)) WHERE email IS NOT NULL;
ALTER TABLE prospects ENABLE ROW LEVEL SECURITY;

-- Démarchage automatique (appliqué au boot par ensureProspectsTable) : suivi Gmail + réglages
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS gmail_thread_id  TEXT;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS last_subject     TEXT;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS reply_message_id TEXT;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS reply_seen_id    TEXT;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS last_reply_text  TEXT;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS suggested_reply  TEXT;
CREATE INDEX IF NOT EXISTS prospects_thread_idx ON prospects (gmail_thread_id);
CREATE TABLE IF NOT EXISTS prospect_autopilot (
  id         INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  enabled    BOOLEAN NOT NULL DEFAULT true,
  per_day    INT NOT NULL DEFAULT 5,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO prospect_autopilot (id) VALUES (1) ON CONFLICT DO NOTHING;
ALTER TABLE prospect_autopilot ENABLE ROW LEVEL SECURITY;
