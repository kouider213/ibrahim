-- ════════════════════════════════════════════════════════════════
-- Migration : prix Houari en DZD (par voiture) — flotte partagée
-- Date : 2026-06-08
-- Kouider loue en EUR (base_price/resale_price = inchangés).
-- Houari loue en DINARS avec SES propres prix par voiture :
--   houari_base_price   = prix proprio/jour en DZD
--   houari_resale_price = prix client/jour en DZD
-- Les réservations de Houari se font en DZD (bookings.currency='DZD' existe déjà),
-- son CA est donc en dinars. Rien ne change pour Kouider.
-- Non destructif.
-- ════════════════════════════════════════════════════════════════

ALTER TABLE cars ADD COLUMN IF NOT EXISTS houari_base_price   NUMERIC;
ALTER TABLE cars ADD COLUMN IF NOT EXISTS houari_resale_price NUMERIC;

-- Vérif
SELECT 'cars' AS t, COUNT(*) AS total,
       COUNT(*) FILTER (WHERE houari_resale_price IS NOT NULL) AS avec_prix_dzd
FROM cars;
