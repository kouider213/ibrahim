-- ============================================================
-- IBRAHIM — Migration Phase 3/4
-- Exécuter dans: https://supabase.com/dashboard/project/febrrgqpyqqrewcohomx/sql/new
-- ============================================================

-- ── BUG 2: Fix bookings status constraint ─────────────────────
-- Ajoute ACTIVE et COMPLETED au check existant

ALTER TABLE bookings
  DROP CONSTRAINT IF EXISTS bookingsstatuscheck;

ALTER TABLE bookings
  ADD CONSTRAINT bookingsstatuscheck
  CHECK (status IN ('PENDING', 'CONFIRMED', 'ACTIVE', 'COMPLETED', 'REJECTED'));

-- ── BUG 4: Fix UUID Clio 4 (lettre O → chiffre 0) ────────────
-- Désactiver la contrainte FK temporairement, corriger l'UUID, réactiver

-- D'abord vérifier si la ligne existe
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cars WHERE id::text = 'ef23c9b3-d8b9-4834-a71b-abObe28f4a97') THEN
    -- Si l'UUID corrompu existe (peu probable car UUID invalide), le corriger
    UPDATE cars
    SET id = 'ef23c9b3-d8b9-4834-a71b-ab0be28f4a97'
    WHERE id::text = 'ef23c9b3-d8b9-4834-a71b-abObe28f4a97';
    RAISE NOTICE 'UUID Clio 4 corrigé';
  ELSE
    RAISE NOTICE 'UUID Clio 4 non trouvé avec O (peut être déjà correct avec 0)';
  END IF;
END;
$$;

-- Vérifier les UUIDs de la table cars
SELECT id, name FROM cars ORDER BY name;

-- ── BUG 1: Ajouter colonnes manquantes sur bookings ───────────
-- rented_by et owner_profit (migration_ibrahim_complet.sql non exécutée)

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS rented_by TEXT DEFAULT 'Kouider',
  ADD COLUMN IF NOT EXISTS owner_profit NUMERIC DEFAULT 0;

-- ── Pricing table ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pricing (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  car_name     TEXT NOT NULL,
  daily_kouider NUMERIC NOT NULL,
  daily_houari  NUMERIC NOT NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── ÉTAPE 4: Table mémoire permanente Ibrahim ─────────────────
CREATE TABLE IF NOT EXISTS ibrahim_memory (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  content    TEXT NOT NULL,
  category   TEXT NOT NULL DEFAULT 'general',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ibrahim_memory_category ON ibrahim_memory(category);
CREATE INDEX IF NOT EXISTS idx_ibrahim_memory_created ON ibrahim_memory(created_at DESC);

-- RLS: service role bypasse toujours
ALTER TABLE ibrahim_memory ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "service_role_all" ON ibrahim_memory
  FOR ALL USING (true) WITH CHECK (true);

-- ── ibrahim_rules (si pas encore créée) ──────────────────────
CREATE TABLE IF NOT EXISTS ibrahim_rules (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category   TEXT NOT NULL DEFAULT 'general',
  rule       TEXT NOT NULL,
  conditions JSONB NOT NULL DEFAULT '{}',
  action     JSONB NOT NULL DEFAULT '{}',
  confidence NUMERIC DEFAULT 1.0,
  source     TEXT DEFAULT 'learned',
  active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE ibrahim_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "service_role_all_rules" ON ibrahim_rules
  FOR ALL USING (true) WITH CHECK (true);

-- ── client_documents (si pas encore créée) ───────────────────
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

-- ── Résumé ────────────────────────────────────────────────────
SELECT 'Migration Phase 3/4 terminée' AS status;
