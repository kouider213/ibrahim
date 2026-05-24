-- Phase 3 SaaS: sector-specific data tables
-- Apply in Supabase SQL editor

-- ── saas_bookings: reservations/appointments/orders for all sectors ──
CREATE TABLE IF NOT EXISTS saas_bookings (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  customer_name  TEXT NOT NULL,
  customer_phone TEXT,
  customer_email TEXT,
  item_name      TEXT,           -- car model / room name / table number / service
  item_id        UUID,           -- references saas_items.id (optional)
  start_date     TIMESTAMPTZ NOT NULL,
  end_date       TIMESTAMPTZ,
  status         TEXT NOT NULL DEFAULT 'confirmed',  -- confirmed | pending | cancelled | completed
  notes          TEXT,
  amount         DECIMAL(12,2),
  currency       TEXT DEFAULT 'DZD',
  guests         INTEGER DEFAULT 1,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ── saas_items: fleet/rooms/tables/products/services per org ──────────
CREATE TABLE IF NOT EXISTS saas_items (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  type           TEXT,           -- car | room | table | service | product | property
  status         TEXT NOT NULL DEFAULT 'available',  -- available | unavailable | maintenance
  price_per_day  DECIMAL(12,2),
  price_per_unit DECIMAL(12,2),
  currency       TEXT DEFAULT 'DZD',
  capacity       INTEGER,        -- seats/passengers/guests
  metadata       JSONB DEFAULT '{}',   -- color, plate, floor, surface, etc.
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_saas_bookings_org_id    ON saas_bookings(org_id);
CREATE INDEX IF NOT EXISTS idx_saas_bookings_start     ON saas_bookings(org_id, start_date DESC);
CREATE INDEX IF NOT EXISTS idx_saas_bookings_status    ON saas_bookings(org_id, status);
CREATE INDEX IF NOT EXISTS idx_saas_items_org_id       ON saas_items(org_id);

-- RLS
ALTER TABLE saas_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas_items    ENABLE ROW LEVEL SECURITY;

-- Backend uses service_role key — bypass RLS
CREATE POLICY IF NOT EXISTS "service_role_saas_bookings" ON saas_bookings
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "service_role_saas_items" ON saas_items
  FOR ALL TO service_role USING (true) WITH CHECK (true);
