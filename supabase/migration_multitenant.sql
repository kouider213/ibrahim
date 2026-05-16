-- ════════════════════════════════════════════════════════════════
-- Migration Multi-Tenant Phase 1
-- Date    : 2026-05-16
-- Objectif: Identity resolution Telegram → org member
-- ════════════════════════════════════════════════════════════════

-- ── TABLE 1: organizations ──────────────────────────────────────
-- Une entrée par business (Fik Conciergerie, client SaaS futur…)

CREATE TABLE IF NOT EXISTS organizations (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_key   TEXT        UNIQUE NOT NULL,  -- 'kouider', 'fik_paris', etc.
  name        TEXT        NOT NULL,
  plan        TEXT        NOT NULL DEFAULT 'pro',  -- starter | pro | enterprise
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fik Conciergerie = org de Kouider
INSERT INTO organizations (owner_key, name, plan)
VALUES ('kouider', 'Fik Conciergerie', 'pro')
ON CONFLICT (owner_key) DO NOTHING;

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_all_orgs" ON organizations;
CREATE POLICY "service_role_all_orgs"
  ON organizations FOR ALL USING (true) WITH CHECK (true);

-- ── TABLE 2: organization_members ───────────────────────────────
-- Qui a accès à quelle org, via quel Telegram ID

CREATE TABLE IF NOT EXISTS organization_members (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id       UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  owner_key    TEXT        NOT NULL,   -- dénormalisé depuis org (lookup rapide)
  telegram_id  TEXT        UNIQUE,     -- chat_id Telegram (string)
  email        TEXT,                   -- futur: Supabase Auth
  display_name TEXT        NOT NULL DEFAULT 'Utilisateur',
  role         TEXT        NOT NULL DEFAULT 'member',
  -- owner | admin | member
  is_active    BOOLEAN     NOT NULL DEFAULT TRUE,
  joined_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_org_members_telegram
  ON organization_members(telegram_id) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_org_members_org
  ON organization_members(org_id, is_active);
CREATE INDEX IF NOT EXISTS idx_org_members_owner_key
  ON organization_members(owner_key, is_active);

ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_all_members" ON organization_members;
CREATE POLICY "service_role_all_members"
  ON organization_members FOR ALL USING (true) WITH CHECK (true);

-- ════════════════════════════════════════════════════════════════
-- NOTE: Kouider est auto-enregistré au premier message Telegram.
-- Pour ajouter Houari MANUELLEMENT une fois que tu as son telegram_id:
--
-- INSERT INTO organization_members (org_id, owner_key, telegram_id, display_name, role)
-- SELECT id, 'kouider', '<TELEGRAM_ID_HOUARI>', 'Houari', 'admin'
-- FROM organizations WHERE owner_key = 'kouider';
--
-- ════════════════════════════════════════════════════════════════

-- Vérification
SELECT 'organizations'        AS table_name, COUNT(*) AS rows FROM organizations
UNION ALL
SELECT 'organization_members', COUNT(*) FROM organization_members;
