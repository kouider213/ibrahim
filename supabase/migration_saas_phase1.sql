-- ════════════════════════════════════════════════════════════════
-- Migration SaaS Phase 1 — Multi-tenant data isolation
-- Date    : 2026-05-24
-- Objectif: org_id sur bookings/cars + org_configs (secteur/langue/outils)
-- SÉCURITÉ: toutes les colonnes ajoutées avec DEFAULT → zéro casse Kouider
-- ════════════════════════════════════════════════════════════════

-- ── TABLE org_configs ────────────────────────────────────────────
-- Config dynamique par organisation (secteur, langue, persona AI)

CREATE TABLE IF NOT EXISTS org_configs (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id          UUID        NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,

  -- Identité business
  business_name   TEXT        NOT NULL DEFAULT 'Mon Business',
  city            TEXT        NOT NULL DEFAULT 'Algérie',
  country         TEXT        NOT NULL DEFAULT 'Algeria',
  timezone        TEXT        NOT NULL DEFAULT 'Africa/Algiers',

  -- Localisation
  language        TEXT        NOT NULL DEFAULT 'fr',  -- fr | en | es | ar | ...
  currency        TEXT        NOT NULL DEFAULT 'DZD', -- DZD | EUR | USD | MAD ...

  -- Secteur métier
  sector          TEXT        NOT NULL DEFAULT 'car_rental',
  -- car_rental | restaurant | lawyer | doctor | real_estate | hotel | retail | custom

  -- Persona AI
  ai_name         TEXT        NOT NULL DEFAULT 'Dzaryx',
  ai_personality  TEXT        NOT NULL DEFAULT '',

  -- Outils actifs (JSON array des tool names Claude)
  tools_enabled   JSONB       NOT NULL DEFAULT '[]'::jsonb,
  -- [] = tous les outils du secteur activés par défaut

  -- Plan
  plan            TEXT        NOT NULL DEFAULT 'starter',
  -- starter | pro | enterprise

  -- Limites usage
  messages_limit  INTEGER     NOT NULL DEFAULT 200,  -- par mois
  messages_used   INTEGER     NOT NULL DEFAULT 0,
  reset_at        TIMESTAMPTZ NOT NULL DEFAULT (date_trunc('month', NOW()) + INTERVAL '1 month'),

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE org_configs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_all_org_configs" ON org_configs;
CREATE POLICY "service_role_all_org_configs"
  ON org_configs FOR ALL USING (true) WITH CHECK (true);

-- Config Kouider (pro, outils illimités, car_rental)
INSERT INTO org_configs (org_id, business_name, city, country, timezone, language, currency, sector, ai_name, plan, messages_limit)
SELECT id, 'Fik Conciergerie', 'Oran', 'Algeria', 'Africa/Algiers', 'fr', 'DZD', 'car_rental', 'Dzaryx', 'pro', 99999
FROM organizations WHERE owner_key = 'kouider'
ON CONFLICT (org_id) DO NOTHING;

-- ── COLONNE org_id sur bookings ──────────────────────────────────
-- Défaut = org de Kouider → données existantes intactes

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);

-- Backfill: toutes les lignes existantes → org Kouider
UPDATE bookings
SET org_id = (SELECT id FROM organizations WHERE owner_key = 'kouider' LIMIT 1)
WHERE org_id IS NULL;

-- Index pour lookup rapide par org
CREATE INDEX IF NOT EXISTS idx_bookings_org_id ON bookings(org_id);

-- ── COLONNE org_id sur cars ──────────────────────────────────────

ALTER TABLE cars
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);

UPDATE cars
SET org_id = (SELECT id FROM organizations WHERE owner_key = 'kouider' LIMIT 1)
WHERE org_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_cars_org_id ON cars(org_id);

-- ── TABLE saas_auth ──────────────────────────────────────────────
-- Comptes SaaS (email/password hash) — séparé de Supabase Auth
-- Pour les nouveaux clients qui s'inscrivent via le portail web

CREATE TABLE IF NOT EXISTS saas_auth (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id          UUID        NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  email           TEXT        NOT NULL UNIQUE,
  password_hash   TEXT        NOT NULL,
  email_verified  BOOLEAN     NOT NULL DEFAULT FALSE,
  last_login_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE saas_auth ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_all_saas_auth" ON saas_auth;
CREATE POLICY "service_role_all_saas_auth"
  ON saas_auth FOR ALL USING (true) WITH CHECK (true);

-- ── Vérification finale ──────────────────────────────────────────
SELECT 'org_configs'  AS table_name, COUNT(*) AS rows FROM org_configs
UNION ALL
SELECT 'saas_auth',                  COUNT(*) FROM saas_auth
UNION ALL
SELECT 'bookings avec org_id',       COUNT(*) FROM bookings WHERE org_id IS NOT NULL
UNION ALL
SELECT 'cars avec org_id',           COUNT(*) FROM cars WHERE org_id IS NOT NULL;
