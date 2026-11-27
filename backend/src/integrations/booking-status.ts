// Changer le statut d'une réservation du site (accepter / refuser) — partagé par DEMANDES et la boîte de réception d'Aujourd'hui.
// Proxy serveur→serveur vers l'API du site (qui envoie lui-même l'email / WhatsApp au client).
import { supabase } from './supabase.js';
import { createCalendarEvent } from './google-calendar.js';

const SITE = process.env['FIK_SITE_URL'] || 'https://fikconciergerie.com';

export async function setBookingStatus(id: string, status: string): Promise<void> {
  const r = await fetch(`${SITE}/api/update-booking`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-service-key': process.env['SUPABASE_SERVICE_KEY'] || '' },
    body: JSON.stringify({ bookingId: id, patch: { status } }),
  });
  if (!r.ok) throw new Error(`site update-booking ${r.status}`);
  // Accepter crée aussi l'événement Google Agenda (comme le site).
  if (status === 'ACCEPTED' || status === 'CONFIRMED') {
    try {
      const { data: bk } = await supabase.from('bookings').select('client_name, start_date, end_date, notes, cars(name)').eq('id', id).single();
      const b = bk as (Record<string, unknown> & { cars?: { name?: string } }) | null;
      if (b && b['start_date'] && b['end_date']) {
        await createCalendarEvent(id, (b['client_name'] as string) || 'Client', b.cars?.name || 'Véhicule', b['start_date'] as string, b['end_date'] as string, (b['notes'] as string) || undefined);
      }
    } catch (e) { console.warn('[booking-status] calendar', (e as Error).message); }
  }
}
