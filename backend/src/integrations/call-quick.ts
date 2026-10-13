// Outils RAPIDES des appels Telegram (voix temps réel) : réservation, paiement, devis, agenda en 1-2 s
// au lieu du cerveau complet (5-15 s). Réservation et paiement en deux temps : sans confirmed:true on
// renvoie seulement la relecture (« je crée ? »), rien n'est écrit.
// Prix (Kouider, en €) : cars.resale_price = prix client catalogue, cars.base_price = prix Houari (coût).
// Jours INCLUS (départ + retour comptent), comme create_booking.
import { supabase, checkCarAvailability as isCarFree } from './supabase.js';
import { findCar } from './expenses.js';
import { executeTool } from './tool-executor.js';
import { clientRisk } from '../notifications/client-care.js';
import { listUpcomingEvents, listPersonalEvents } from './google-calendar.js';

type CarRow = { id: string; name: string; base_price: number | null; resale_price: number | null; available: boolean | null };

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TZ = 'Europe/Brussels';
const eur = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(2).replace('.', ',')} €`;
const frDate = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const inclusiveDays = (a: string, b: string) => Math.max(1, Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000) + 1);
const todayYmd = (tz = TZ) => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());

async function carByName(name: string): Promise<CarRow | string> {
  const found = await findCar(name);
  if (!found) return `Aucune voiture « ${name} » dans le parc.`;
  if (Array.isArray(found)) return `Plusieurs voitures correspondent à « ${name} » : ${found.map(c => c.name).join(', ')}. Laquelle ?`;
  const { data } = await supabase.from('cars').select('id, name, base_price, resale_price, available').eq('id', found.id).single();
  return (data as CarRow | null) ?? `Voiture « ${name} » introuvable.`;
}

function checkDates(start: string, end: string): string | null {
  if (!DATE.test(start) || !DATE.test(end)) return 'Dates manquantes : donne le jour de départ et de retour (YYYY-MM-DD).';
  if (start > end) return 'La date de retour est avant le départ.';
  return null;
}

async function conflictText(carId: string, start: string, end: string): Promise<string> {
  const { data } = await supabase.from('bookings').select('client_name, start_date, end_date, rented_by')
    .eq('car_id', carId).in('status', ['PENDING', 'CONFIRMED', 'ACTIVE']).lt('start_date', end).gt('end_date', start).limit(3);
  return (data ?? []).map(b => `${b.client_name} du ${b.start_date} au ${b.end_date}${b.rented_by ? ` (${b.rented_by})` : ''}`).join(' ; ');
}

// ── 1. Réservation dictée ────────────────────────────────────────────────────

export async function quickBooking(input: Record<string, unknown>, actor: string, sessionId: string): Promise<string> {
  if (actor !== 'kouider') return 'Réservation rapide réservée à Kouider : passe par ask_dzaryx.';
  const client = String(input['client_name'] ?? '').trim();
  const start = String(input['start_date'] ?? ''), end = String(input['end_date'] ?? '');
  if (!client) return 'Il manque le nom du client.';
  const bad = checkDates(start, end); if (bad) return bad;
  const car = await carByName(String(input['car_name'] ?? ''));
  if (typeof car === 'string') return car;

  if (!(await isCarFree(car.id, start, end))) {
    return `❌ ${car.name} déjà prise sur ces dates : ${await conflictText(car.id, start, end) || 'réservation en cours'}. Propose une autre voiture ou d'autres dates (quick_quote sans voiture liste les libres).`;
  }
  const days = inclusiveDays(start, end);
  const total = input['total_price'] != null ? Number(input['total_price']) : null;
  const perDay = input['price_per_day'] != null ? Number(input['price_per_day'])
    : total != null ? Math.round(total / days * 100) / 100
    : car.resale_price;
  if (!perDay || perDay <= 0) return `Quel prix par jour pour ${car.name} ? (pas de prix catalogue)`;
  const finalPrice = total ?? Math.round(perDay * days * 100) / 100;
  const owner = input['owner_price_per_day'] != null ? Number(input['owner_price_per_day']) : car.base_price;
  const paid = input['paid_amount'] != null ? Number(input['paid_amount']) : 0;
  const profit = owner != null ? Math.round((perDay - owner) * days * 100) / 100 : null;
  const phone = String(input['client_phone'] ?? '').trim() || undefined;

  if (input['confirmed'] !== true) {
    const risk = await clientRisk(client, phone).catch(() => null);
    const priceSrc = input['price_per_day'] != null || total != null ? '' : ' (prix catalogue)';
    return [
      `À RELIRE à Kouider puis demander « je crée ? » : ${car.name} pour ${client}, du ${frDate(start)} au ${frDate(end)}, ${days} jours,`,
      `${eur(perDay)} par jour${priceSrc} = ${eur(finalPrice)}.`,
      owner != null ? `Prix Houari ${eur(owner)}/jour → bénéfice ${eur(profit!)}${profit! < 0 ? ' ⚠️ PERTE' : ''}.` : 'Prix Houari inconnu : bénéfice non calculé.',
      paid ? `Acompte déjà payé : ${eur(paid)}.` : '',
      `Voiture libre ✅.`,
      risk?.spoken || risk?.text ? `Client : ${risk.spoken || risk.text}` : '',
    ].filter(Boolean).join(' ');
  }

  const res = await executeTool('create_booking', {
    car_id: car.id, client_name: client, client_phone: phone, start_date: start, end_date: end,
    final_price: finalPrice, client_price_per_day: perDay, owner_price_per_day: owner ?? undefined,
    paid_amount: paid, rented_by: 'Kouider', status: 'CONFIRMED',
    notes: input['notes'] ? String(input['notes']) : undefined,
  }, sessionId);
  return res;
}

// ── 2. Paiement dicté ────────────────────────────────────────────────────────

type PayBooking = { id: string; client_name: string; start_date: string; end_date: string; final_price: number | null; paid_amount: number | null; currency: string | null; status: string; cars?: { name: string } | { name: string }[] | null };
const carOf = (b: PayBooking) => (Array.isArray(b.cars) ? b.cars[0]?.name : b.cars?.name) ?? 'voiture';

export async function quickPayment(input: Record<string, unknown>, sessionId: string): Promise<string> {
  const client = String(input['client_name'] ?? '').replace(/[,()"%*]/g, ' ').trim();
  const amount = Number(input['amount']);
  if (!client) return 'Quel client a payé ?';
  if (!amount || amount <= 0) return 'Quel montant ?';
  const { data } = await supabase.from('bookings')
    .select('id, client_name, start_date, end_date, final_price, paid_amount, currency, status, cars(name)')
    .ilike('client_name', `%${client}%`).in('status', ['PENDING', 'CONFIRMED', 'ACTIVE', 'COMPLETED'])
    .order('start_date', { ascending: false }).limit(20);
  let list = ((data ?? []) as PayBooking[]).filter(b => (Number(b.paid_amount) || 0) < (Number(b.final_price) || 0));
  const carName = String(input['car_name'] ?? '').trim().toLowerCase();
  if (carName) list = list.filter(b => carOf(b).toLowerCase().includes(carName));
  const startDate = String(input['start_date'] ?? '');
  if (DATE.test(startDate)) list = list.filter(b => b.start_date === startDate);
  if (!list.length) return `Aucune réservation de « ${client} » avec un reste à payer${carName ? ` sur ${carName}` : ''}. Vérifie le nom (ou ask_dzaryx).`;
  if (list.length > 1) {
    return `Plusieurs réservations de « ${client} » pas soldées : ${list.slice(0, 4).map(b => `${b.client_name}, ${carOf(b)} du ${b.start_date} (reste ${eur((b.final_price ?? 0) - (b.paid_amount ?? 0))})`).join(' ; ')}. Laquelle ? (rappelle l'outil avec car_name ou start_date)`;
  }
  const b = list[0]!;
  const cur = b.currency === 'DZD' ? ' DA' : ' €';
  const fmt = (n: number) => `${Math.round(n * 100) / 100}${cur}`;
  const left = (b.final_price ?? 0) - (b.paid_amount ?? 0) - amount;
  const type = (['acompte', 'solde', 'partiel'] as const).find(t => t === input['type']) ?? (left <= 0 ? 'solde' : 'partiel');

  if (input['confirmed'] !== true) {
    return `À RELIRE puis demander « je note ? » : ${fmt(amount)} de ${b.client_name} pour la ${carOf(b)} du ${frDate(b.start_date)} (total ${fmt(b.final_price ?? 0)}, déjà payé ${fmt(b.paid_amount ?? 0)}). ${left <= 0 ? `Ce sera soldé${left < 0 ? ` (⚠️ ${fmt(-left)} de trop)` : ''}.` : `Il restera ${fmt(left)}.`}`;
  }
  const res = await executeTool('record_payment', { booking_id: b.id, amount, type, note: input['note'] ? String(input['note']) : undefined }, sessionId);
  return /Paiement enregistré/.test(res)
    ? `${res}\n${left <= 0 ? '✅ Réservation soldée.' : `Reste à payer : ${fmt(left)}.`}`
    : res;
}

// ── 3. Devis express ─────────────────────────────────────────────────────────

export async function quickQuote(input: Record<string, unknown>, sessionId: string): Promise<string> {
  const start = String(input['start_date'] ?? ''), end = String(input['end_date'] ?? '');
  const bad = checkDates(start, end); if (bad) return bad;
  const days = inclusiveDays(start, end);
  const name = String(input['car_name'] ?? '').trim();
  const delivery = String(input['delivery_address'] ?? '').trim();
  const perDayOverride = input['price_per_day'] != null ? Number(input['price_per_day']) : null;

  let cars: CarRow[];
  if (name) {
    const car = await carByName(name);
    if (typeof car === 'string') return car;
    cars = [car];
  } else {
    const { data } = await supabase.from('cars').select('id, name, base_price, resale_price, available').eq('available', true).order('resale_price');
    cars = (data ?? []) as CarRow[];
  }
  const free: CarRow[] = [];
  for (const c of cars) if (c.available !== false && await isCarFree(c.id, start, end)) free.push(c);

  const deliveryLine = delivery
    ? (await executeTool('calculate_delivery_fee', { client_address: delivery, car_name: name || undefined }, sessionId)).match(/Frais livraison: \*\*(\d+) DZD\*\*/)?.[1]
    : null;
  const deliveryTxt = delivery ? (deliveryLine ? `Livraison à ${delivery} : ${Number(deliveryLine).toLocaleString('fr-FR')} DA.` : `Livraison à ${delivery} : adresse non reconnue, à voir avec Kouider.`) : '';

  if (!free.length) {
    if (name) return `❌ ${cars[0]!.name} pas libre du ${start} au ${end} : ${await conflictText(cars[0]!.id, start, end)}. Rappelle quick_quote sans car_name pour les voitures libres.`;
    return `❌ Aucune voiture libre du ${start} au ${end}.`;
  }
  const lines = free.slice(0, 8).map(c => {
    const pd = perDayOverride ?? c.resale_price ?? 0;
    return `${c.name} : ${eur(pd)}/jour → ${eur(Math.round(pd * days * 100) / 100)}`;
  });
  const best = free[0]!;
  const pd = perDayOverride ?? best.resale_price ?? 0;
  const quote = [
    `Bonjour, voici notre proposition FIK Conciergerie :`,
    `🚗 ${best.name}, du ${frDate(start)} au ${frDate(end)} (${days} jours)`,
    `💶 ${eur(pd)} par jour, soit ${eur(Math.round(pd * days * 100) / 100)} au total`,
    deliveryLine ? `📍 Livraison à ${delivery} : ${Number(deliveryLine).toLocaleString('fr-FR')} DA` : '',
    `Pour réserver, répondez simplement à ce message. Merci !`,
  ].filter(Boolean).join('\n');
  return [
    `${days} jours, du ${start} au ${end}. ${name ? 'Libre ✅' : `${free.length} voiture(s) libre(s)`} :`,
    ...lines, free.length > 8 ? `… et ${free.length - 8} autre(s).` : '', deliveryTxt,
    name ? `Devis prêt à envoyer (send_text_to_me pour Kouider, ou whatsapp_link si on a le nom du client) :\n${quote}` : 'Demande quelle voiture il veut, puis rappelle quick_quote avec car_name pour le devis prêt à envoyer.',
  ].filter(Boolean).join('\n');
}

// ── 4. Agenda d'un jour ──────────────────────────────────────────────────────

export async function quickAgenda(input: Record<string, unknown>, actor: string): Promise<string> {
  const day = DATE.test(String(input['date'] ?? '')) ? String(input['date']) : todayYmd();
  const out: string[] = [`📅 ${frDate(day)} :`];

  const [{ data: starts }, { data: ends }] = await Promise.all([
    supabase.from('bookings').select('client_name, cars(name)').eq('start_date', day).in('status', ['PENDING', 'CONFIRMED', 'ACTIVE']),
    supabase.from('bookings').select('client_name, cars(name)').eq('end_date', day).in('status', ['CONFIRMED', 'ACTIVE']),
  ]);
  const carName = (b: { cars?: unknown }) => { const c = b.cars as { name: string } | { name: string }[] | null; return (Array.isArray(c) ? c[0]?.name : c?.name) ?? 'voiture'; };
  for (const b of (starts ?? []) as { client_name: string; cars?: unknown }[]) out.push(`🔑 Départ : ${carName(b)} pour ${b.client_name}`);
  for (const b of (ends ?? []) as { client_name: string; cars?: unknown }[]) out.push(`↩️ Retour : ${carName(b)} de ${b.client_name}`);

  const sameDay = (iso?: string) => !!iso && new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(iso)) === day;
  const hhmm = (iso?: string) => iso && iso.length > 10 ? new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: TZ }) : 'journée';
  type Ev = { summary: string; start: { dateTime?: string; date?: string } };
  const [pro, perso] = await Promise.all([
    listUpcomingEvents(50).catch(() => [] as unknown[]),
    actor === 'kouider' ? listPersonalEvents(30).catch(() => [] as unknown[]) : Promise.resolve([] as unknown[]),
  ]);
  for (const e of pro as Ev[]) {   // les locations (« 🚗 … ») sont déjà listées en départs/retours
    const iso = e.start?.dateTime ?? e.start?.date;
    if ((e.start?.date === day || sameDay(iso)) && !(e.summary ?? '').startsWith('🚗')) out.push(`🗓 ${hhmm(e.start?.dateTime)} ${e.summary}`);
  }
  for (const e of perso as Ev[]) {
    const iso = e.start?.dateTime ?? e.start?.date;
    if (e.start?.date === day || sameDay(iso)) out.push(`👤 ${hhmm(e.start?.dateTime)} ${e.summary} (perso)`);
  }

  const from = new Date(`${day}T00:00:00Z`); from.setUTCHours(from.getUTCHours() - 3);
  const to = new Date(`${day}T23:59:59Z`); to.setUTCHours(to.getUTCHours() + 3);
  const { data: rem } = await supabase.from('reminders').select('message, remind_at, session_id')
    .eq('status', 'PENDING').gte('remind_at', from.toISOString()).lte('remind_at', to.toISOString()).order('remind_at');
  for (const r of (rem ?? []) as { message: string; remind_at: string; session_id: string | null }[]) {
    if (!sameDay(r.remind_at)) continue;
    if (r.session_id && /houari/i.test(r.session_id) !== (actor === 'houari')) continue;
    out.push(`⏰ ${hhmm(r.remind_at)} rappel : ${r.message.slice(0, 120)}`);
  }

  if (out.length === 1) out.push('Rien de prévu : aucun départ, retour, rendez-vous ni rappel.');
  return out.join('\n');
}
