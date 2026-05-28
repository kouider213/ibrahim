-- Module immobilier Houari — Douba Groupe Oran
-- Run once in Supabase SQL editor

CREATE TABLE IF NOT EXISTS properties (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  address      text,
  type         text NOT NULL DEFAULT 'appartement',
  -- appartement | villa | commercial | terrain | bureau
  status       text NOT NULL DEFAULT 'libre',
  -- libre | loué | en_travaux | à_vendre
  monthly_rent numeric(10,2),
  tenant_name  text,
  notes        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS (no row-level policies yet — access via service key)
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;

-- Sample data for Houari (remove or keep)
INSERT INTO properties (name, address, type, status, monthly_rent, tenant_name) VALUES
  ('F4 Cité Badr', 'Hay Badr, Oran', 'appartement', 'loué',   45000, 'Famille Benali'),
  ('F3 Ben Omar',  'Ben Omar, Oran', 'appartement', 'libre',   null,  null),
  ('Local com.',   'Centre Oran',    'commercial',  'loué',   120000, 'Commerce Hamid'),
  ('Terrain Bir',  'Bir El Djir',    'terrain',     'libre',   null,  null)
ON CONFLICT DO NOTHING;
