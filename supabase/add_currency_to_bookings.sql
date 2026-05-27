-- Add currency column to bookings (EUR or DZD)
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'EUR'
  CHECK (currency IN ('EUR', 'DZD'));

-- Backfill: Houari's existing bookings are in DZD
UPDATE bookings SET currency = 'DZD' WHERE rented_by = 'Houari' AND currency IS NULL;
