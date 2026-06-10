-- Phase EXTRAS — signature électronique du contrat
-- À exécuter dans Supabase → SQL Editor. Idempotent.
-- (L'estimation de dégât et le pricing dynamique n'ont besoin d'AUCUNE table.)

CREATE TABLE IF NOT EXISTS contract_signatures (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token         text UNIQUE NOT NULL,
  booking_id    uuid REFERENCES bookings(id) ON DELETE SET NULL,
  client_name   text,
  status        text NOT NULL DEFAULT 'pending',   -- pending | signed
  details       jsonb,
  signature_url text,
  signed_at     timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_contract_signatures_token ON contract_signatures(token);
