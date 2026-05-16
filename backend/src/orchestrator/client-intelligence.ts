import { supabase } from '../integrations/supabase.js';

export interface ClientProfile {
  client_name:          string;
  client_phone?:        string;
  preferred_cars:       string[];
  avoided_cars:         string[];
  typical_duration_days: number | null;
  typical_months:       number[];
  negotiation_style:    string;
  avg_discount_asked:   number;
  payment_reliability:  string;
  communication_style:  string;
  typical_lead_days:    number;
  cancellation_count:   number;
  total_bookings:       number;
  total_spent:          number;
  last_booking_date:    string | null;
  score:                string;
  notes:                string | null;
}

export interface ClientIntelSummary {
  exists:   boolean;
  profile:  ClientProfile | null;
  context:  string;  // texte injecté dans system prompt
}

// ── Lecture profil client ────────────────────────────────────────────────────

export async function getClientProfile(
  clientName: string,
  ownerId = 'kouider',
): Promise<ClientIntelSummary> {
  try {
    const { data } = await supabase
      .from('client_intelligence')
      .select('*')
      .eq('owner_id', ownerId)
      .ilike('client_name', `%${clientName}%`)
      .limit(5);

    if (!data || data.length === 0) return { exists: false, profile: null, context: '' };

    if (data.length > 1) {
      const names = data.map((r: ClientProfile) => r.client_name).join(', ');
      return {
        exists: true,
        profile: null,
        context: `⚠️ AMBIGUÏTÉ CLIENT: Plusieurs clients correspondent à "${clientName}": ${names}. Demande à Kouider de préciser le nom complet avant d'agir.`,
      };
    }

    const p = data[0] as ClientProfile;
    const context = buildClientContext(p);
    return { exists: true, profile: p, context };
  } catch {
    return { exists: false, profile: null, context: '' };
  }
}

// ── Construction contexte pour system prompt ─────────────────────────────────

function buildClientContext(p: ClientProfile): string {
  const lines: string[] = [`PROFIL CLIENT — ${p.client_name}:`];

  if (p.total_bookings > 0) {
    lines.push(`• ${p.total_bookings} réservation(s) | Total dépensé: ${p.total_spent}€ | Score: ${p.score}`);
  }
  if (p.preferred_cars.length > 0) {
    lines.push(`• Préfère: ${p.preferred_cars.join(', ')}`);
  }
  if (p.typical_duration_days) {
    lines.push(`• Durée typique: ${p.typical_duration_days} jours`);
  }
  if (p.negotiation_style !== 'normal' && p.negotiation_style !== 'never_negotiates') {
    const styles: Record<string, string> = {
      light_negotiation:  'négocie légèrement',
      heavy_negotiation:  'négocie beaucoup — reste ferme sur le prix',
      always_asks_discount: 'demande toujours une remise — prévoir marge',
    };
    lines.push(`• Négociation: ${styles[p.negotiation_style] ?? p.negotiation_style}`);
  }
  if (p.payment_reliability === 'sometimes_late' || p.payment_reliability === 'often_late') {
    lines.push(`• ⚠️ Paiement: ${p.payment_reliability === 'often_late' ? 'souvent en retard' : 'parfois en retard'} — demander acompte`);
  }
  if (p.cancellation_count > 1) {
    lines.push(`• ⚠️ ${p.cancellation_count} annulation(s) passée(s)`);
  }
  if (p.notes) {
    lines.push(`• Note: ${p.notes}`);
  }

  return lines.join('\n');
}

// ── Auto-update après une réservation ────────────────────────────────────────

export async function updateClientIntelFromBooking(booking: {
  client_name:          string;
  client_phone?:        string;
  car_name:             string;
  start_date:           string;
  end_date:             string;
  nb_days:              number;
  client_price_per_day: number | null;
  final_price:          number | null;
  discount_applied?:    number;
  status:               string;
  payment_status?:      string;
  paid_amount?:         number;
}, ownerId = 'kouider'): Promise<void> {
  try {
    const { data: existing } = await supabase
      .from('client_intelligence')
      .select('*')
      .eq('owner_id', ownerId)
      .ilike('client_name', booking.client_name)
      .maybeSingle();

    const bookingMonth = new Date(booking.start_date).getMonth() + 1;
    const bookingValue = booking.final_price ?? (booking.client_price_per_day ?? 0) * booking.nb_days;
    const discountPct  = booking.discount_applied
      ? Math.round((booking.discount_applied / bookingValue) * 100)
      : 0;

    if (!existing) {
      // Nouveau client → créer fiche
      await supabase.from('client_intelligence').insert({
        owner_id:             ownerId,
        client_name:          booking.client_name,
        client_phone:         booking.client_phone,
        preferred_cars:       booking.car_name ? [booking.car_name] : [],
        typical_duration_days: booking.nb_days,
        typical_months:       [bookingMonth],
        avg_discount_asked:   discountPct,
        negotiation_style:    discountPct > 15 ? 'heavy_negotiation' : discountPct > 0 ? 'light_negotiation' : 'never_negotiates',
        payment_reliability:  booking.paid_amount && bookingValue && booking.paid_amount >= bookingValue * 0.99
          ? 'always_on_time' : 'unknown',
        total_bookings:       1,
        total_spent:          bookingValue,
        last_booking_date:    booking.start_date,
        score:                'NEW',
      });
    } else {
      // Client existant → mise à jour
      const e = existing as ClientProfile & { id: string };

      const newTotal       = e.total_bookings + 1;
      const newSpent       = e.total_spent + bookingValue;
      const newDuration    = e.typical_duration_days
        ? Math.round(((e.typical_duration_days * e.total_bookings) + booking.nb_days) / newTotal * 10) / 10
        : booking.nb_days;

      const months = Array.from(new Set([...(e.typical_months ?? []), bookingMonth]));

      const cars = e.preferred_cars ?? [];
      if (booking.car_name && !cars.includes(booking.car_name)) cars.push(booking.car_name);

      const newAvgDiscount = Math.round(
        ((e.avg_discount_asked * e.total_bookings) + discountPct) / newTotal
      );
      const newNego = newAvgDiscount > 15
        ? 'heavy_negotiation'
        : newAvgDiscount > 5
          ? 'light_negotiation'
          : newAvgDiscount > 0
            ? 'always_asks_discount'
            : 'never_negotiates';

      const newScore = newTotal >= 5 || newSpent >= 1000 ? 'VIP'
        : newTotal >= 3 || newSpent >= 500 ? 'FREQUENT'
        : newTotal >= 2 ? 'REGULAR' : 'NEW';

      await supabase.from('client_intelligence').update({
        preferred_cars:        cars.slice(0, 5),
        typical_duration_days: newDuration,
        typical_months:        months,
        avg_discount_asked:    newAvgDiscount,
        negotiation_style:     newNego,
        total_bookings:        newTotal,
        total_spent:           newSpent,
        last_booking_date:     booking.start_date,
        score:                 newScore,
      }).eq('id', (existing as { id: string }).id);
    }
  } catch (err) {
    console.error('[client-intel] update failed:', err instanceof Error ? err.message : err);
  }
}

// ── Récupérer top clients pour contexte proactif ─────────────────────────────

export async function getTopClients(ownerId = 'kouider', limit = 5): Promise<ClientProfile[]> {
  try {
    const { data } = await supabase
      .from('client_intelligence')
      .select('*')
      .eq('owner_id', ownerId)
      .order('total_spent', { ascending: false })
      .limit(limit);

    return (data ?? []) as ClientProfile[];
  } catch {
    return [];
  }
}
