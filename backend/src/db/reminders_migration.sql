-- P15 — Reminders persistence table
-- Run this in Supabase SQL Editor before deploying P15

CREATE TABLE IF NOT EXISTS reminders (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title             TEXT,
  message           TEXT        NOT NULL,
  remind_at         TIMESTAMPTZ NOT NULL,
  timezone          TEXT        NOT NULL DEFAULT 'Europe/Brussels',
  status            TEXT        NOT NULL DEFAULT 'PENDING'
                                CHECK (status IN ('PENDING','SENT','FAILED','CANCELLED','DUPLICATE')),
  sent_at           TIMESTAMPTZ,
  failed_reason     TEXT,
  retry_count       INTEGER     NOT NULL DEFAULT 0,
  created_by        TEXT,
  session_id        TEXT,
  telegram_target   TEXT,
  pushover_target   BOOLEAN     NOT NULL DEFAULT true,
  dedup_key         TEXT        UNIQUE,
  provider_response TEXT,
  job_id            TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast lookup: pending reminders due now
CREATE INDEX IF NOT EXISTS reminders_status_remind_at
  ON reminders(status, remind_at)
  WHERE status = 'PENDING';

-- Dedup lookup
CREATE INDEX IF NOT EXISTS reminders_dedup_key
  ON reminders(dedup_key)
  WHERE dedup_key IS NOT NULL;

-- Row Level Security — allow service role full access
ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Service role full access"
  ON reminders
  FOR ALL
  USING (true)
  WITH CHECK (true);
