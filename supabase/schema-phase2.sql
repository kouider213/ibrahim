-- ============================================================
-- IBRAHIM — Phase 2 Schema
-- ============================================================

-- ── client_documents ─────────────────────────────────────────
-- Store passport, license, contract scans per client

CREATE TABLE IF NOT EXISTS client_documents (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id   UUID REFERENCES bookings(id) ON DELETE SET NULL,
  client_phone TEXT NOT NULL,
  client_name  TEXT NOT NULL,
  type         TEXT NOT NULL CHECK (type IN ('passport','license','contract','other')),
  file_url     TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_client_docs_phone ON client_documents(client_phone);
CREATE INDEX IF NOT EXISTS idx_client_docs_booking ON client_documents(booking_id);

-- ── calendar_events ───────────────────────────────────────────
-- Track Google Calendar sync status for bookings

CREATE TABLE IF NOT EXISTS calendar_events (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id       UUID REFERENCES bookings(id) ON DELETE CASCADE,
  google_event_id  TEXT UNIQUE,
  calendar_id      TEXT NOT NULL DEFAULT 'primary',
  title            TEXT NOT NULL,
  start_datetime   TIMESTAMPTZ NOT NULL,
  end_datetime     TIMESTAMPTZ NOT NULL,
  status           TEXT NOT NULL DEFAULT 'synced' CHECK (status IN ('synced','pending','failed','deleted')),
  sync_error       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_calendar_booking ON calendar_events(booking_id);

-- ── whatsapp_messages ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  from_phone   TEXT NOT NULL,
  to_phone     TEXT,
  client_name  TEXT,
  body         TEXT NOT NULL,
  direction    TEXT NOT NULL DEFAULT 'inbound' CHECK (direction IN ('inbound','outbound')),
  booking_id   UUID REFERENCES bookings(id) ON DELETE SET NULL,
  processed    BOOLEAN NOT NULL DEFAULT FALSE,
  ai_reply     TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_phone ON whatsapp_messages(from_phone);

-- ── google_oauth_tokens ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS google_oauth_tokens (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email         TEXT NOT NULL UNIQUE,
  access_token  TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_type    TEXT NOT NULL DEFAULT 'Bearer',
  expires_at    TIMESTAMPTZ NOT NULL,
  scope         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Updated_at triggers ───────────────────────────────────────

DO $$
DECLARE tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['calendar_events','google_oauth_tokens']
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

-- ── Storage bucket for client documents ───────────────────────
-- Run this in Supabase Dashboard → Storage → Create bucket "client-documents" (private)
-- Or via API:
-- INSERT INTO storage.buckets (id, name, public) VALUES ('client-documents', 'client-documents', false);
