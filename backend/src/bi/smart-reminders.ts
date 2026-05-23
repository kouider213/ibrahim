import { supabase } from '../integrations/supabase.js';

export interface SmartReminder {
  id:       string;  // unique key for dismissal: `${type}_${client_name}_${date}`
  type:     'arrival_tomorrow' | 'missing_passport' | 'missing_deposit' | 'return_soon' | 'vehicle_prep' | 'age_alert' | 'overdue_payment';
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  client_name:  string;
  client_phone: string | null;
  car_name:     string;
  date:         string;
  message:      string;
  action:       string;
}

type BookingRow = {
  id: string;
  client_name: string;
  client_phone?: string;
  client_age?: number;
  client_passport?: string;
  start_date: string;
  end_date: string;
  final_price: number;
  paid_amount?: number;
  payment_status?: string;
  status: string;
  cars?: { name: string };
};

export async function getSmartReminders(actor?: string): Promise<SmartReminder[]> {
  const today    = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const in3days  = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
  const in48h    = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);

  // Houari only sees reminders for his own bookings
  const rentedByFilter = actor === 'houari' ? 'Houari' : null;

  const reminders: Omit<SmartReminder, 'id'>[] = [];

  // 1. Arrivals tomorrow
  let q1 = supabase
    .from('bookings')
    .select('id, client_name, client_phone, client_age, client_passport, start_date, end_date, final_price, paid_amount, payment_status, cars(name)')
    .in('status', ['CONFIRMED'])
    .eq('start_date', tomorrow);
  if (rentedByFilter) q1 = q1.eq('rented_by', rentedByFilter);
  const { data: arrivingTomorrow } = await q1;

  for (const b of (arrivingTomorrow ?? []) as unknown as BookingRow[]) {
    const car = b.cars?.name ?? '?';

    // Arrival reminder
    reminders.push({
      type:         'arrival_tomorrow',
      priority:     'HIGH',
      client_name:  b.client_name,
      client_phone: b.client_phone ?? null,
      car_name:     car,
      date:         b.start_date,
      message:      `${b.client_name} prend ${car} demain`,
      action:       'Préparer le véhicule et vérifier les documents',
    });

    // Vehicle prep reminder
    reminders.push({
      type:         'vehicle_prep',
      priority:     'HIGH',
      client_name:  b.client_name,
      client_phone: b.client_phone ?? null,
      car_name:     car,
      date:         b.start_date,
      message:      `${car} doit être prêt pour ${b.client_name} demain`,
      action:       'Laver, vérifier niveaux, plein carburant, état extérieur',
    });

    // Missing passport
    if (!b.client_passport) {
      reminders.push({
        type:         'missing_passport',
        priority:     'HIGH',
        client_name:  b.client_name,
        client_phone: b.client_phone ?? null,
        car_name:     car,
        date:         b.start_date,
        message:      `Passeport manquant pour ${b.client_name} (arrivée demain)`,
        action:       'Demander scan passeport avant remise des clés',
      });
    }

    // Age alert
    if (b.client_age && b.client_age < 35) {
      reminders.push({
        type:         'age_alert',
        priority:     'HIGH',
        client_name:  b.client_name,
        client_phone: b.client_phone ?? null,
        car_name:     car,
        date:         b.start_date,
        message:      `⚠️ ${b.client_name} a ${b.client_age} ans — politique Fik: refus <35 ans`,
        action:       'Vérifier avec Houari avant confirmation',
      });
    }
  }

  // 2. Missing deposit — booking in ≤3 days, 0€ paid
  let q2 = supabase
    .from('bookings')
    .select('id, client_name, client_phone, start_date, final_price, paid_amount, cars(name)')
    .eq('status', 'CONFIRMED')
    .eq('paid_amount', 0)
    .lte('start_date', in3days)
    .gt('start_date', today);
  if (rentedByFilter) q2 = q2.eq('rented_by', rentedByFilter);
  const { data: noDeposit } = await q2;

  for (const b of (noDeposit ?? []) as unknown as BookingRow[]) {
    const car      = b.cars?.name ?? '?';
    const daysLeft = Math.ceil((new Date(b.start_date).getTime() - Date.now()) / 86_400_000);
    reminders.push({
      type:         'missing_deposit',
      priority:     daysLeft <= 1 ? 'HIGH' : 'MEDIUM',
      client_name:  b.client_name,
      client_phone: b.client_phone ?? null,
      car_name:     car,
      date:         b.start_date,
      message:      `Acompte 0€ — ${b.client_name} arrive dans ${daysLeft}j pour ${car} (total ${b.final_price}€)`,
      action:       'Contacter le client pour acompte 30% minimum',
    });
  }

  // 3. Vehicles returning soon (next 48h)
  let q3 = supabase
    .from('bookings')
    .select('id, client_name, client_phone, end_date, cars(name)')
    .in('status', ['CONFIRMED', 'ACTIVE'])
    .gte('end_date', today)
    .lte('end_date', in48h);
  if (rentedByFilter) q3 = q3.eq('rented_by', rentedByFilter);
  const { data: returningSoon } = await q3;

  for (const b of (returningSoon ?? []) as unknown as BookingRow[]) {
    if (b.end_date === today) continue; // already handled elsewhere
    const car = b.cars?.name ?? '?';
    reminders.push({
      type:         'return_soon',
      priority:     'MEDIUM',
      client_name:  b.client_name,
      client_phone: b.client_phone ?? null,
      car_name:     car,
      date:         b.end_date,
      message:      `${b.client_name} rend ${car} le ${b.end_date}`,
      action:       'Confirmer heure de retour et état du véhicule',
    });
  }

  // 4. Overdue unpaid — completed/active bookings with end_date past and payment not PAID
  let q4 = supabase
    .from('bookings')
    .select('id, client_name, client_phone, end_date, final_price, paid_amount, cars(name)')
    .in('status', ['COMPLETED', 'ACTIVE'])
    .neq('payment_status', 'PAID')
    .lt('end_date', today);
  if (rentedByFilter) q4 = q4.eq('rented_by', rentedByFilter);
  const { data: overdueUnpaid } = await q4;

  for (const b of (overdueUnpaid ?? []) as unknown as BookingRow[]) {
    const car     = b.cars?.name ?? '?';
    const owed    = (b.final_price ?? 0) - (b.paid_amount ?? 0);
    if (owed <= 0) continue;
    reminders.push({
      type:         'overdue_payment',
      priority:     'HIGH',
      client_name:  b.client_name,
      client_phone: b.client_phone ?? null,
      car_name:     car,
      date:         b.end_date,
      message:      `Paiement en retard : ${b.client_name} doit ${owed}€ pour ${car} (terminé le ${b.end_date})`,
      action:       'Contacter le client immédiatement pour récupérer le solde',
    });
  }

  // Deduplicate by type + client + date, assign id
  const seen = new Set<string>();
  return reminders.reduce<SmartReminder[]>((acc, r) => {
    const key = `${r.type}:${r.client_name}:${r.date}`;
    if (seen.has(key)) return acc;
    seen.add(key);
    acc.push({ ...r, id: key });
    return acc;
  }, []);
}
