-- Migration: vrais champs financiers normalisés sur bookings
-- Run in Supabase SQL Editor

-- 1. Ajouter colonnes financières réelles
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS client_price_per_day  NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS owner_price_per_day   NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS owner_total           NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS profit_kouider        NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS discount_applied      NUMERIC(10,2) DEFAULT 0;

-- 2. Backfill client_price_per_day pour réservations existantes
--    (final_price / nb_days, avec nb_days calculé depuis dates)
UPDATE bookings
SET client_price_per_day = ROUND(
  final_price::NUMERIC /
  GREATEST(1, (end_date::date - start_date::date)),
  2
)
WHERE client_price_per_day IS NULL
  AND final_price IS NOT NULL
  AND final_price > 0
  AND end_date > start_date;

-- 3. Index pour les requêtes financières fréquentes
CREATE INDEX IF NOT EXISTS idx_bookings_status_start
  ON bookings (status, start_date DESC);

CREATE INDEX IF NOT EXISTS idx_bookings_status_end
  ON bookings (status, end_date DESC);

CREATE INDEX IF NOT EXISTS idx_bookings_payment_status
  ON bookings (payment_status, status);

-- 4. Vérifier le résultat
SELECT
  COUNT(*)                                  AS total_bookings,
  COUNT(client_price_per_day)               AS with_client_price,
  COUNT(owner_price_per_day)                AS with_owner_price,
  COUNT(profit_kouider)                     AS with_profit,
  ROUND(AVG(client_price_per_day), 2)      AS avg_client_price_day,
  SUM(final_price)                          AS total_final_price
FROM bookings
WHERE status IN ('CONFIRMED', 'ACTIVE', 'COMPLETED');
