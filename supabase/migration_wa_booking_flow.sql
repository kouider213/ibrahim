-- ════════════════════════════════════════════════════════════════
-- Migration WhatsApp Booking Flow — Demandes réservation WhatsApp
-- Date : 2026-05-28
-- ════════════════════════════════════════════════════════════════

-- Table des demandes de réservation WhatsApp en attente de validation
CREATE TABLE IF NOT EXISTS wa_booking_requests (
  id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone            TEXT        NOT NULL,           -- numéro WhatsApp client
  lang             TEXT        NOT NULL DEFAULT 'fr',

  -- Infos collectées
  client_name      TEXT,
  start_date       DATE,
  end_date         DATE,
  vehicle_wanted   TEXT,
  delivery_location TEXT,
  return_location  TEXT,
  num_persons      INTEGER,
  has_flight       BOOLEAN     DEFAULT FALSE,
  flight_number    TEXT,
  arrival_time     TEXT,
  arrival_airport  TEXT,
  notes            TEXT,

  -- Statut du flow
  status           TEXT        NOT NULL DEFAULT 'pending_info',
  -- pending_info → pending_approval → payment_requested → docs_requested → confirmed → cancelled

  -- Validation Kouider
  validated_by     TEXT,
  validated_at     TIMESTAMPTZ,
  rejection_reason TEXT,

  -- Paiement acompte (3 jours × tarif)
  daily_rate       NUMERIC,
  deposit_amount   NUMERIC,
  deposit_paid     BOOLEAN     DEFAULT FALSE,
  deposit_paid_at  TIMESTAMPTZ,

  -- Documents client
  passport_url     TEXT,
  ticket_url       TEXT,
  license_url      TEXT,
  passport_number  TEXT,
  passport_expiry  DATE,
  nationality      TEXT,
  flight_date      DATE,

  -- Réservation finale créée
  booking_id       UUID,       -- lien vers bookings si confirmée

  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wa_booking_phone   ON wa_booking_requests(phone, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_booking_status  ON wa_booking_requests(status, created_at DESC);

ALTER TABLE wa_booking_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_all_wa_bookings" ON wa_booking_requests;
CREATE POLICY "service_role_all_wa_bookings"
  ON wa_booking_requests FOR ALL USING (true) WITH CHECK (true);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION update_wa_booking_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS wa_booking_updated_at ON wa_booking_requests;
CREATE TRIGGER wa_booking_updated_at
  BEFORE UPDATE ON wa_booking_requests
  FOR EACH ROW EXECUTE FUNCTION update_wa_booking_updated_at();

-- Vérification
SELECT 'wa_booking_requests' AS table_name, COUNT(*) AS rows FROM wa_booking_requests;
