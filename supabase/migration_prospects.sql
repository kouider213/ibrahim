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
