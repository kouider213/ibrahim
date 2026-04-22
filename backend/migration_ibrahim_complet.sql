-- Migration Ibrahim Complet — à exécuter dans Supabase SQL Editor
-- https://supabase.com/dashboard/project/febrrgqpyqqrewcohomx/sql/new

-- 1. Table pricing (grille tarifaire Houari/Kouider)
CREATE TABLE IF NOT EXISTS pricing (
  id            SERIAL PRIMARY KEY,
  vehicle_name  TEXT NOT NULL UNIQUE,
  houari_price  DECIMAL(10,2) NOT NULL,
  kouider_price DECIMAL(10,2) NOT NULL,
  benefit       DECIMAL(10,2) GENERATED ALWAYS AS (kouider_price - houari_price) STORED,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- 2. Ajout colonnes sur bookings
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS rented_by    TEXT DEFAULT 'Kouider',
  ADD COLUMN IF NOT EXISTS owner_profit DECIMAL(10,2) DEFAULT 0;

-- 3. Table client_documents (si pas encore créée)
CREATE TABLE IF NOT EXISTS client_documents (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id   UUID REFERENCES bookings(id) ON DELETE SET NULL,
  client_phone TEXT NOT NULL,
  client_name  TEXT NOT NULL,
  type         TEXT NOT NULL CHECK (type IN ('passport', 'license', 'contract', 'other')),
  file_url     TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  notes        TEXT,
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- 4. RLS policies pour client_documents
ALTER TABLE client_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "Service role full access on client_documents"
  ON client_documents FOR ALL TO service_role USING (true);

-- 5. Seed pricing table
INSERT INTO pricing (vehicle_name, houari_price, kouider_price) VALUES
  ('Jumpy 9p',      44, 55),
  ('Berlingo',      44, 55),
  ('Jogger',        37, 50),
  ('Sandero',       22, 35),
  ('Clio 5',        37, 45),
  ('Clio 5 Alpine', 44, 50),
  ('Clio 4 v1',     18, 35),
  ('Clio 4 v2',     24, 35),
  ('i10',           19, 25),
  ('Fiat 500',      24, 35),
  ('R.Duster',      31, 45),
  ('D.Duster',      44, 50),
  ('Creta',         24, 45),
  ('Fiat 500 XL',   37, 45)
ON CONFLICT (vehicle_name) DO UPDATE
  SET houari_price  = EXCLUDED.houari_price,
      kouider_price = EXCLUDED.kouider_price;

-- 6. Index pour performance
CREATE INDEX IF NOT EXISTS idx_bookings_rented_by ON bookings(rented_by);
CREATE INDEX IF NOT EXISTS idx_bookings_start_date ON bookings(start_date);
CREATE INDEX IF NOT EXISTS idx_client_docs_phone ON client_documents(client_phone);
