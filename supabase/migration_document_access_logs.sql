-- Document access audit log table
-- Run in Supabase SQL editor or via supabase db push

CREATE TABLE IF NOT EXISTS document_access_logs (
  id            bigserial    PRIMARY KEY,
  user_id       bigint       NOT NULL,
  action        text         NOT NULL CHECK (action IN ('view', 'store', 'refused', 'masked_preview')),
  doc_type      text         NOT NULL,
  client_name   text,
  client_phone  text,
  is_admin      boolean      NOT NULL DEFAULT false,
  masked        boolean      NOT NULL DEFAULT true,
  ip            text,
  created_at    timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_doc_access_user_id    ON document_access_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_doc_access_created_at ON document_access_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_doc_access_action      ON document_access_logs (action);

-- Row-level security: service key only (backend reads/writes)
ALTER TABLE document_access_logs ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
CREATE POLICY "service_role_all" ON document_access_logs
  FOR ALL TO service_role USING (true) WITH CHECK (true);
