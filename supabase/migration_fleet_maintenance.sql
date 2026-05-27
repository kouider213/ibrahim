-- ════════════════════════════════════════════════════════════════
-- Migration Fleet Maintenance — Suivi entretien parc auto
-- Date    : 2026-05-27
-- ════════════════════════════════════════════════════════════════

-- Ajoute les colonnes d'entretien à la table cars
ALTER TABLE cars
  ADD COLUMN IF NOT EXISTS current_km           INTEGER,
  ADD COLUMN IF NOT EXISTS last_service_date    DATE,
  ADD COLUMN IF NOT EXISTS last_service_km      INTEGER,
  ADD COLUMN IF NOT EXISTS next_service_date    DATE,
  ADD COLUMN IF NOT EXISTS next_service_km      INTEGER,
  ADD COLUMN IF NOT EXISTS service_interval_km  INTEGER DEFAULT 10000,
  ADD COLUMN IF NOT EXISTS service_notes        TEXT;

-- Ajoute les colonnes de documents clients à la table bookings
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS passport_expiry  DATE,
  ADD COLUMN IF NOT EXISTS license_expiry   DATE;

-- Index pour les alertes d'entretien (recherche par date)
CREATE INDEX IF NOT EXISTS idx_cars_next_service
  ON cars(next_service_date) WHERE next_service_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bookings_doc_expiry
  ON bookings(passport_expiry, license_expiry)
  WHERE passport_expiry IS NOT NULL OR license_expiry IS NOT NULL;

-- Vérification
SELECT 'cars columns added' AS status,
  column_name
FROM information_schema.columns
WHERE table_name = 'cars'
  AND column_name IN ('current_km','last_service_date','next_service_date','service_interval_km')
ORDER BY column_name;

SELECT 'bookings columns added' AS status,
  column_name
FROM information_schema.columns
WHERE table_name = 'bookings'
  AND column_name IN ('passport_expiry','license_expiry')
ORDER BY column_name;
