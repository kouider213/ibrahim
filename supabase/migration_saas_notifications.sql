-- SaaS Notifications table — daily briefings + alerts per org
-- Apply in Supabase SQL editor

CREATE TABLE IF NOT EXISTS saas_notifications (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  type        TEXT        NOT NULL DEFAULT 'info',   -- daily_briefing | alert | info
  title       TEXT        NOT NULL,
  body        TEXT        NOT NULL,
  read        BOOLEAN     NOT NULL DEFAULT FALSE,
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_saas_notifications_org ON saas_notifications(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_saas_notifications_unread ON saas_notifications(org_id, read) WHERE read = FALSE;

ALTER TABLE saas_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "service_role_saas_notifications"
  ON saas_notifications FOR ALL TO service_role USING (true) WITH CHECK (true);
