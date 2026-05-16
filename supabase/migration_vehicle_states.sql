-- ════════════════════════════════════════════════════════════════
-- Migration Vehicle States — État véhicule avant/après location
-- Date    : 2026-05-16
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS vehicle_states (
  id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_key        TEXT        NOT NULL DEFAULT 'kouider',

  -- Identité
  client_name      TEXT        NOT NULL,
  car_name         TEXT        NOT NULL,
  booking_id       UUID,       -- lien réservation (optionnel)

  -- Type d'état
  state_type       TEXT        NOT NULL,  -- 'before' | 'after'

  -- Photos (URLs Supabase Storage)
  photos           TEXT[]      NOT NULL DEFAULT ARRAY[]::TEXT[],

  -- Analyse IA
  ai_description   TEXT,       -- description détaillée de l'état
  damages          TEXT[],     -- liste des dommages détectés
  damage_detected  BOOLEAN     NOT NULL DEFAULT FALSE,

  -- Comparaison (rempli sur l'état 'after')
  comparison_report TEXT,      -- rapport avant/après généré par Claude

  -- Métadonnées
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vehicle_states_client
  ON vehicle_states(owner_key, client_name, car_name, state_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_vehicle_states_booking
  ON vehicle_states(booking_id) WHERE booking_id IS NOT NULL;

ALTER TABLE vehicle_states ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_all_vehicle_states" ON vehicle_states;
CREATE POLICY "service_role_all_vehicle_states"
  ON vehicle_states FOR ALL USING (true) WITH CHECK (true);

-- Vérification
SELECT 'vehicle_states' AS table_name, COUNT(*) AS rows FROM vehicle_states;
