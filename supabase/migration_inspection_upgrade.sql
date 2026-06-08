-- ════════════════════════════════════════════════════════════════
-- Migration Inspection Upgrade — photos stockées + marqueurs dégâts + accident + immo
-- Date    : 2026-06-08
-- But     : 1) vehicle_states : marqueurs (boîtes) des dégâts, flag accident, sévérité
--           2) property_states : même système d'inspection avant/après pour l'immobilier
-- Non destructif. À exécuter dans Supabase > SQL Editor.
-- ════════════════════════════════════════════════════════════════

-- ── 1. vehicle_states : nouvelles colonnes ──────────────────────
-- damage_boxes = [{ "label","severity","location","box":{"x","y","w","h"} }]  (x,y,w,h normalisés 0..1)
ALTER TABLE vehicle_states ADD COLUMN IF NOT EXISTS damage_boxes JSONB    NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE vehicle_states ADD COLUMN IF NOT EXISTS accident     BOOLEAN  NOT NULL DEFAULT FALSE;
ALTER TABLE vehicle_states ADD COLUMN IF NOT EXISTS severity     TEXT;     -- 'aucun'|'leger'|'moyen'|'grave'
-- (photos TEXT[] et booking_id UUID existent déjà — voir migration_vehicle_states.sql)

-- ── 2. property_states : inspection avant/après des biens immobiliers ──
CREATE TABLE IF NOT EXISTS property_states (
  id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_key         TEXT        NOT NULL DEFAULT 'kouider',

  -- Identité
  client_name       TEXT        NOT NULL,   -- locataire
  property_name     TEXT        NOT NULL,   -- titre du bien
  property_id       UUID,                   -- lien properties (optionnel)

  -- Type d'état
  state_type        TEXT        NOT NULL,   -- 'before' | 'after'

  -- Photos (URLs Cloudinary)
  photos            TEXT[]      NOT NULL DEFAULT ARRAY[]::TEXT[],

  -- Analyse IA
  ai_description    TEXT,
  damages           TEXT[],
  damage_boxes      JSONB       NOT NULL DEFAULT '[]'::jsonb,
  damage_detected   BOOLEAN     NOT NULL DEFAULT FALSE,
  severity          TEXT,

  -- Comparaison (rempli sur l'état 'after')
  comparison_report TEXT,

  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_property_states_client
  ON property_states(owner_key, client_name, property_name, state_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_property_states_property
  ON property_states(property_id) WHERE property_id IS NOT NULL;

ALTER TABLE property_states ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_all_property_states" ON property_states;
CREATE POLICY "service_role_all_property_states"
  ON property_states FOR ALL USING (true) WITH CHECK (true);

-- Vérification
SELECT 'vehicle_states'  AS t, COUNT(*) AS rows FROM vehicle_states
UNION ALL
SELECT 'property_states' AS t, COUNT(*) AS rows FROM property_states;
