-- Phase EXTRAS — charges, expirations documents, compteur location, signature électronique
-- À exécuter dans Supabase SQL editor. Idempotent (IF NOT EXISTS).

-- 1. Charges / dépenses par voiture (carburant, réparation, assurance, vignette…)
CREATE TABLE IF NOT EXISTS car_expenses (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  car_id       uuid REFERENCES cars(id) ON DELETE SET NULL,
  car_name     text,
  type         text NOT NULL DEFAULT 'autre',
  amount       numeric NOT NULL,
  currency     text NOT NULL DEFAULT 'DZD',
  note         text,
  expense_date date NOT NULL DEFAULT current_date,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_car_expenses_car ON car_expenses(car_id);

-- 2. Dates d'expiration documents véhicule
ALTER TABLE cars ADD COLUMN IF NOT EXISTS insurance_expiry          date;
ALTER TABLE cars ADD COLUMN IF NOT EXISTS technical_control_expiry  date;
ALTER TABLE cars ADD COLUMN IF NOT EXISTS vignette_expiry           date;

-- 3. Compteur km + carburant par location
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS km_start   integer;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS km_end     integer;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS fuel_start text;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS fuel_end   text;

-- 4. Signatures électroniques de contrat
CREATE TABLE IF NOT EXISTS contract_signatures (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token        text UNIQUE NOT NULL,
  booking_id   uuid REFERENCES bookings(id) ON DELETE SET NULL,
  client_name  text,
  status       text NOT NULL DEFAULT 'pending',   -- pending | signed
  details      jsonb,
  signature_url text,
  signed_at    timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_contract_signatures_token ON contract_signatures(token);
