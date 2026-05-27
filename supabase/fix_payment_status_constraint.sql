-- Fix bookings_payment_status_check to accept UNPAID + PENDING + PARTIAL + PAID
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_payment_status_check;
ALTER TABLE bookings ADD CONSTRAINT bookings_payment_status_check
  CHECK (payment_status IN ('UNPAID', 'PENDING', 'PARTIAL', 'PAID'));
