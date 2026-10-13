// Soin des clients et du parc, avec les appels de Dzaryx quand ça compte :
// - clientRisk : historique d'un client (notes, impayés, dégâts) affiché à chaque nouvelle réservation
// - recordCarKm : kilométrage relevé (état des lieux / dicté) → prochaine vidange, alerte + appel si proche
// - jobBirthdays : anniversaires des clients (date de naissance lue sur passeport/permis) → message WhatsApp prêt + appel
// - jobReviewWhatsapp : demande d'avis Google prête à envoyer sur WhatsApp pour les clients SANS email
//   (ceux avec email la reçoivent déjà par le site, cron reminders)
import { supabase } from '../integrations/supabase.js';
import { kvGet, kvSet } from '../integrations/app-store.js';
import { emitProactive } from './mobile-push.js';
import { autoCall } from './auto-call.js';

const TZ = 'Africa/Algiers';
const SITE = 'https://fikconciergerie.com';
const GOOGLE_REVIEW_URL = 'https://g.page/r/CSluTI58e1CwEBM/review';  // même lien que le site (lib/google.js)
export const BIRTHDAY_DISCOUNT = 10;  // % proposé dans le message d'anniversaire
const SERVICE_WARN_KM = 1000;

const phoneKey = (p?: string | null) => { const d = (p ?? '').replace(/\D/g, ''); return d.length >= 8 ? d.slice(-9) : ''; };

/** Lien wa.me avec message pré-rempli (numéro local algérien 0X… → +213). '' si pas de numéro. */
export function waLink(phone: string | null | undefined, text: string): string {
  let d = (phone ?? '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  else if (d.length === 10 && d.startsWith('0')) d = `213${d.slice(1)}`;
  if (d.length < 9) return '';
  return `https://wa.me/${d}?text=${encodeURIComponent(text)}`;
}

function today(): { ymd: string; dd: number; mm: number; yyyy: number } {
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
  const [yyyy, mm, dd] = ymd.split('-').map(Number) as [number, number, number];
  return { ymd, dd, mm, yyyy };
}

// ── 1. Client à risque ───────────────────────────────────────────────────────

type PastBooking = { id: string; client_name: string; client_phone: string | null; status: string; end_date: string; payment_status: string | null; notes: string | null; cars?: { name: string } | { name: string }[] | null };

export interface ClientRisk { level: 'nouveau' | 'ok' | 'attention' | 'risque'; text: string; spoken: string }

export async function clientRisk(name: string, phone?: string | null): Promise<ClientRisk> {
  if (!name?.trim()) return { level: 'nouveau', text: '', spoken: '' };
  const pk = phoneKey(phone);
  const cleanName = name.replace(/[,()"%*]/g, ' ').replace(/\s+/g, ' ').trim();
  const { data } = await supabase.from('bookings')
    .select('id, client_name, client_phone, status, end_date, payment_status, notes, cars(name)')
    .in('status', ['CONFIRMED', 'ACTIVE', 'COMPLETED'])
    .or(pk ? `client_phone.ilike.%${pk},client_name.ilike.${cleanName}` : `client_name.ilike.${cleanName}`)
    .order('start_date', { ascending: false }).limit(30);
  const past = (data ?? []) as PastBooking[];
  if (!past.length) return { level: 'nouveau', text: `🆕 ${cleanName} : nouveau client (aucune location passée).`, spoken: '' };

  const { ymd } = today();
  const issues: string[] = [];
  const unpaid = past.filter(b => b.end_date < ymd && (b.payment_status ?? 'UNPAID') !== 'PAID');
  if (unpaid.length) issues.push(`${unpaid.length} location(s) terminée(s) pas soldée(s)`);

  const stars: number[] = [];
  for (const b of past) {
    const m = (b.notes ?? '').match(/\[NOTE CLIENT\]\s*(⭐+)/u);
    if (m) stars.push([...m[1]!].filter(c => c === '⭐').length);
  }
  const low = stars.filter(s => s <= 2).length;
  if (low) issues.push(`${low} mauvaise(s) note(s)`);

  // Mots inquiétants dans les notes, sauf si la note client est bonne (≥ 4 ⭐ : « sans retard, caution rendue »…)
  const flagged = past.filter(b => {
    const n = b.notes ?? '';
    const s = n.match(/\[NOTE CLIENT\]\s*(⭐+)/u);
    if (s && [...s[1]!].filter(c => c === '⭐').length >= 4) return false;
    return /retard|impay|d[ée]g[âa]t|accident|probl[eè]me|arnaque/i.test(n.replace(/sans (retard|probl[eè]me|d[ée]g[âa]t)|aucun (retard|probl[eè]me|d[ée]g[âa]t)/gi, ''));
  });
  const { data: states } = await supabase.from('vehicle_states').select('id').eq('state_type', 'after').eq('damage_detected', true).ilike('client_name', cleanName);
  if (states?.length) issues.push(`${states.length} dégât(s) constaté(s) au retour`);

  const avg = stars.length ? (stars.reduce((a, b) => a + b, 0) / stars.length).toFixed(1) : null;
  const history = `${past.length} location(s)${avg ? `, note moyenne ${avg}/5` : ''}`;
  if (issues.length) {
    return {
      level: 'risque',
      text: `⚠️ CLIENT À RISQUE — ${cleanName} : ${history}. ${issues.join(', ')}.\n👉 Conseil : caution plus haute ou paiement d'avance avant de remettre les clés.`,
      spoken: `Attention, ${cleanName} est un client à risque : ${issues.join(', ')}.`,
    };
  }
  if (flagged.length) {
    const notes = flagged.slice(0, 2).map(b => (b.notes ?? '').slice(0, 80)).join(' | ');
    return { level: 'attention', text: `🟡 ${cleanName} : ${history}. Remarques passées : ${notes}`, spoken: `Petite remarque sur ${cleanName} dans ses anciennes locations.` };
  }
  return { level: 'ok', text: `✅ ${cleanName} : client connu, ${history}, rien à signaler.`,
    spoken: past.length > 1 ? `C'est un client fidèle, ${past.length} locations sans problème.` : `Il a déjà loué une fois chez toi, sans problème.` };
}

// ── 2. Kilométrage → prochaine vidange ───────────────────────────────────────

type CarKm = { id: string; name: string; current_km: number | null; last_service_km: number | null; next_service_km: number | null; service_interval_km: number | null };

/** Enregistre le km au compteur et retourne une ligne sur la prochaine vidange (alerte + appel si ≤ 1000 km ou dépassée). */
export async function recordCarKm(carName: string, km: number): Promise<string> {
  if (!Number.isFinite(km) || km <= 0) return '';
  const { data } = await supabase.from('cars').select('id, name, current_km, last_service_km, next_service_km, service_interval_km').ilike('name', `%${carName.trim()}%`).limit(5);
  const cars = (data ?? []) as CarKm[];
  const car = cars.find(c => c.name.toLowerCase() === carName.trim().toLowerCase()) ?? (cars.length === 1 ? cars[0] : undefined);
  if (!car) return cars.length ? `⚠️ Km non enregistré : plusieurs voitures « ${carName} » (${cars.map(c => c.name).join(', ')}). Laquelle ?` : `⚠️ Km non enregistré : voiture « ${carName} » introuvable.`;
  if (car.current_km && km < car.current_km - 50) return `⚠️ Km non enregistré : ${km.toLocaleString('fr-FR')} km est inférieur au dernier relevé (${car.current_km.toLocaleString('fr-FR')} km). Vérifie le compteur.`;

  const { error } = await supabase.from('cars').update({ current_km: Math.round(km) }).eq('id', car.id);
  if (error) return `⚠️ Km non enregistré : ${error.message}`;
  const kmTxt = `${Math.round(km).toLocaleString('fr-FR')} km`;

  const nextKm = car.next_service_km ?? (car.last_service_km != null ? car.last_service_km + (car.service_interval_km ?? 10_000) : null);
  if (nextKm == null) return `🔧 ${car.name} : ${kmTxt} enregistrés. Je ne connais pas sa dernière vidange : dis-moi à combien de km elle a été faite pour que je te prévienne de la prochaine.`;

  const left = nextKm - km;
  if (left > SERVICE_WARN_KM) return `🔧 ${car.name} : ${kmTxt} enregistrés. Prochaine vidange dans ${Math.round(left).toLocaleString('fr-FR')} km.`;
  const line = left <= 0
    ? `🔴 ${car.name} : ${kmTxt} — vidange DÉPASSÉE de ${Math.round(-left).toLocaleString('fr-FR')} km (prévue à ${nextKm.toLocaleString('fr-FR')} km).`
    : `🟡 ${car.name} : ${kmTxt} — vidange dans ${Math.round(left).toLocaleString('fr-FR')} km (à ${nextKm.toLocaleString('fr-FR')} km).`;
  emitProactive(line, 'alert', `${line}\nPrévois-la avant la prochaine location. Une fois faite, dis-moi « vidange faite sur la ${car.name} à X km ».`, 'kouider', 'fleet');
  void autoCall(`service-km:${car.id}:${nextKm}`, left <= 0
    ? `La ${car.name} a dépassé sa vidange de ${Math.round(-left)} kilomètres. Il faut la faire avant de la relouer.`
    : `La ${car.name} arrive à sa vidange, il reste ${Math.round(left)} kilomètres. Pense à la prévoir.`);
  return line;
}

// ── 3. Anniversaires ─────────────────────────────────────────────────────────

/** Jour/mois d'une date de naissance lue par OCR : 07.12.1987, 07/12/1987, 1987-12-07. */
export function parseDob(s: unknown): { dd: number; mm: number; yyyy: number } | null {
  const v = String(s ?? '').trim();
  let m = v.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return { yyyy: +m[1]!, mm: +m[2]!, dd: +m[3]! };
  m = v.match(/^(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{2,4})/);
  if (m) { const y = +m[3]!; return { dd: +m[1]!, mm: +m[2]!, yyyy: y < 100 ? (y > 30 ? 1900 + y : 2000 + y) : y }; }
  return null;
}

function birthdayText(first: string, lang: string): string {
  if (lang === 'ar') return `عيد ميلاد سعيد ${first}! 🎂 كل فريق Fik Conciergerie يتمنى لك يوماً رائعاً. بهذه المناسبة: خصم ${BIRTHDAY_DISCOUNT}% على إيجارك القادم. — Kouider, Fik Conciergerie`;
  if (lang === 'en') return `Happy birthday ${first}! 🎂 The whole Fik Conciergerie team wishes you a great day. As a gift: ${BIRTHDAY_DISCOUNT}% off your next rental. — Kouider, Fik Conciergerie`;
  return `Joyeux anniversaire ${first} ! 🎂 Toute l'équipe Fik Conciergerie vous souhaite une excellente journée. Pour l'occasion : -${BIRTHDAY_DISCOUNT}% sur votre prochaine location. — Kouider, Fik Conciergerie`;
}

const titleCase = (s: string) => s.toLowerCase().replace(/(^|[\s-])\p{L}/gu, c => c.toUpperCase());

export async function jobBirthdays(): Promise<void> {
  const { dd, mm, yyyy } = today();
  const { data } = await supabase.from('client_documents').select('client_name, client_phone, booking_id, extracted_data').not('extracted_data', 'is', null).limit(2000);
  const seen = new Set<string>();
  const found: Array<{ name: string; first: string; age: number | null; phone: string | null; lang: string }> = [];
  for (const d of (data ?? []) as Array<{ client_name: string; client_phone: string | null; booking_id: string | null; extracted_data: Record<string, unknown> | string | null }>) {
    const x = (typeof d.extracted_data === 'string' ? (() => { try { return JSON.parse(d.extracted_data as string); } catch { return {}; } })() : d.extracted_data ?? {}) as Record<string, unknown>;
    const dob = parseDob(x['date_naissance'] ?? x['dob'] ?? x['birth_date']);
    if (!dob || dob.dd !== dd || dob.mm !== mm) continue;
    const surname = String(x['nom'] ?? '').trim();
    const first = titleCase(String(x['prénom'] ?? x['prenom'] ?? d.client_name).split(/[,\s]/)[0] || d.client_name);
    const key = `${dob.dd}-${dob.mm}-${dob.yyyy}|${first}`.toLowerCase();  // passeport + permis du même client = 1 seul
    if (seen.has(key)) continue;
    seen.add(key);

    // Téléphone + langue : réservation liée, sinon dernière réservation au même nom
    let phone = phoneKey(d.client_phone) ? d.client_phone : null;
    let lang = 'fr';
    const q = d.booking_id
      ? supabase.from('bookings').select('client_phone, client_lang').eq('id', d.booking_id)
      : supabase.from('bookings').select('client_phone, client_lang').ilike('client_name', `%${surname || d.client_name}%`).order('start_date', { ascending: false });
    const { data: bk } = await q.limit(1);
    const b = (bk ?? [])[0] as { client_phone: string | null; client_lang: string | null } | undefined;
    if (b) { phone ??= b.client_phone; lang = b.client_lang ?? 'fr'; }
    found.push({ name: titleCase(`${first} ${surname}`.trim()), first, age: dob.yyyy > 1900 ? yyyy - dob.yyyy : null, phone, lang });
  }
  if (!found.length) return;

  const fresh = [];
  for (const f of found) {
    const k = `birthday:${yyyy}:${f.name.toLowerCase()}`;
    if (await kvGet(k)) continue;
    await kvSet(k, '1', 2 * 86_400);
    fresh.push(f);
  }
  if (!fresh.length) return;

  const lines = fresh.map(f => {
    const link = waLink(f.phone, birthdayText(f.first, f.lang));
    return `🎂 ${f.name}${f.age ? ` (${f.age} ans)` : ''}\n${link ? `👉 Envoyer sur WhatsApp : ${link}` : `Pas de numéro connu — message :\n${birthdayText(f.first, f.lang)}`}`;
  });
  const text = [`🎂 Anniversaire${fresh.length > 1 ? 's' : ''} de client${fresh.length > 1 ? 's' : ''} aujourd'hui — message prêt (-${BIRTHDAY_DISCOUNT}% sur la prochaine location) :`, ...lines].join('\n\n');
  emitProactive(`🎂 Anniversaire : ${fresh.map(f => f.name).join(', ')}`, 'reminder', text, 'kouider');
  const names = fresh.map(f => f.name);
  void autoCall(`birthdays:${yyyy}-${mm}-${dd}`,
    `Aujourd'hui c'est l'anniversaire de ${names.length > 1 ? `${names.slice(0, -1).join(', ')} et ${names.at(-1)}` : names[0]}, un de tes clients. Je t'ai préparé le message WhatsApp avec ${BIRTHDAY_DISCOUNT} pour cent de remise, tu n'as qu'à l'envoyer.`);
}

// ── 4. Demande d'avis par WhatsApp (clients sans email) ──────────────────────

function reviewText(first: string, id: string, lang: string): string {
  const link = `${GOOGLE_REVIEW_URL}`;
  if (lang === 'ar') return `مرحباً ${first}، شكراً لاختيارك Fik Conciergerie! تقييمك على Google يساعدنا كثيراً — لا يستغرق سوى 30 ثانية: ${link}\nأو على موقعنا: ${SITE}/avis/${id}`;
  if (lang === 'en') return `Hello ${first}, thank you for choosing Fik Conciergerie! A Google review helps us a lot — it takes 30 seconds: ${link}\nOr on our site: ${SITE}/avis/${id}`;
  return `Bonjour ${first}, merci d'avoir choisi Fik Conciergerie ! Un avis Google nous aide énormément, ça prend 30 secondes : ${link}\nOu sur notre site : ${SITE}/avis/${id}`;
}

export async function jobReviewWhatsapp(): Promise<void> {
  const y = new Date(Date.now() - 86_400_000);
  const yesterday = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(y);
  const { data } = await supabase.from('bookings')
    .select('id, client_name, client_phone, client_email, client_lang, cars(name)')
    .eq('end_date', yesterday).is('review_request_sent_at', null)
    .in('status', ['CONFIRMED', 'ACTIVE', 'COMPLETED']);
  const todo = ((data ?? []) as Array<{ id: string; client_name: string; client_phone: string | null; client_email: string | null; client_lang: string | null; cars?: { name: string } | { name: string }[] | null }>)
    .filter(b => !/@/.test(b.client_email ?? '') && phoneKey(b.client_phone));
  if (!todo.length) return;

  const lines: string[] = [];
  for (const b of todo) {
    const first = titleCase(b.client_name.split(/\s/)[0] ?? b.client_name);
    const link = waLink(b.client_phone, reviewText(first, b.id, b.client_lang ?? 'fr'));
    if (!link) continue;
    const car = Array.isArray(b.cars) ? b.cars[0]?.name : b.cars?.name;
    lines.push(`⭐ ${b.client_name}${car ? ` (${car})` : ''}\n👉 ${link}`);
    await supabase.from('bookings').update({ review_request_sent_at: new Date().toISOString() }).eq('id', b.id);
  }
  if (!lines.length) return;
  emitProactive(`⭐ ${lines.length} demande(s) d'avis prête(s) à envoyer sur WhatsApp`, 'info',
    [`⭐ Locations terminées hier, clients sans email : demande d'avis Google prête. Appuie sur le lien, WhatsApp s'ouvre avec le message :`, ...lines].join('\n\n'), 'kouider', 'bookings');
}
