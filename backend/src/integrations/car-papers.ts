// Papiers des voitures : assurance, contrôle technique, vignette (cars.insurance_expiry / technical_expiry / vignette_expiry).
// Rouler sans assurance avec un client = le pire risque → Dzaryx APPELLE Kouider 7 jours avant l'échéance
// et le jour où c'est expiré (notif simple à 30 jours). Les dates se donnent à l'oral ou dans le chat (set_car_papers).
import { supabase } from './supabase.js';
import { findCar } from './expenses.js';
import { kvGet, kvSet } from './app-store.js';
import { autoCall } from '../notifications/auto-call.js';
import { emitProactive } from '../notifications/mobile-push.js';

const PAPERS = [
  { col: 'insurance_expiry', label: 'l\'assurance', input: 'insurance_expiry' },
  { col: 'technical_expiry', label: 'le contrôle technique', input: 'technical_expiry' },
  { col: 'vignette_expiry',  label: 'la vignette', input: 'vignette_expiry' },
] as const;
type PaperCol = typeof PAPERS[number]['col'];
type CarPapers = { id: string; name: string } & Record<PaperCol, string | null>;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;
const todayOran = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Algiers' });
const daysUntil = (d: string, from = todayOran()) => Math.round((Date.parse(d) - Date.parse(from)) / DAY_MS);
const frDate = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

/** Enregistre les dates d'échéance des papiers d'une voiture. */
export async function setCarPapers(input: Record<string, unknown>): Promise<string> {
  const name = String(input['car_name'] ?? '').trim();
  if (!name) return '❌ Quelle voiture ?';
  const found = await findCar(name);
  if (!found) return `❌ Aucune voiture « ${name} » dans le parc.`;
  if (Array.isArray(found)) return `❓ Plusieurs voitures correspondent à « ${name} » : ${found.map(c => c.name).join(', ')}. Laquelle ?`;
  const updates: Record<string, string> = {};
  for (const p of PAPERS) {
    const v = String(input[p.input] ?? '').trim();
    if (!v) continue;
    if (!DATE.test(v) || Number.isNaN(Date.parse(v))) return `❌ Date invalide pour ${p.label} : « ${v} » (format YYYY-MM-DD).`;
    updates[p.col] = v;
  }
  if (!Object.keys(updates).length) return '❌ Donne au moins une date : assurance, contrôle technique ou vignette.';
  const { error } = await supabase.from('cars').update(updates).eq('id', found.id);
  if (error) return `❌ Dates non enregistrées : ${error.message}`;
  const said = PAPERS.filter(p => updates[p.col]).map(p => {
    const left = daysUntil(updates[p.col]!);
    return `${p.label} jusqu'au ${frDate(updates[p.col]!)}${left < 0 ? ' ⚠️ DÉJÀ EXPIRÉ' : left <= 7 ? ` ⚠️ dans ${left} jour(s)` : ''}`;
  });
  return `✅ ${found.name} : ${said.join(', ')}. Je t'appellerai 7 jours avant chaque échéance.`;
}

/** État des papiers de tout le parc (ou d'une voiture). */
export async function getCarPapers(input: Record<string, unknown>): Promise<string> {
  const name = String(input['car_name'] ?? '').trim();
  let q = supabase.from('cars').select('id, name, insurance_expiry, technical_expiry, vignette_expiry').order('name');
  if (name) q = q.ilike('name', `%${name.replace(/[,()"%*]/g, ' ').trim()}%`);
  const { data, error } = await q;
  if (error) return `❌ Papiers indisponibles : ${error.message}`;
  const cars = (data ?? []) as CarPapers[];
  if (!cars.length) return `Aucune voiture « ${name} ».`;
  const missing: string[] = [];
  const lines = cars.map(c => {
    const parts = PAPERS.map(p => {
      const d = c[p.col];
      if (!d) { missing.push(`${c.name} (${p.label})`); return null; }
      const left = daysUntil(d);
      return `${p.label} ${left < 0 ? `EXPIRÉ depuis le ${frDate(d)} ⛔` : left <= 7 ? `expire dans ${left} j (${frDate(d)}) ⚠️` : `jusqu'au ${frDate(d)}`}`;
    }).filter(Boolean);
    return parts.length ? `🚗 ${c.name} : ${parts.join(', ')}` : null;
  }).filter(Boolean) as string[];
  const out = lines.length ? ['📄 PAPIERS DES VOITURES', ...lines] : ['📄 Aucune date de papiers enregistrée.'];
  if (missing.length) out.push(`Dates inconnues (à me donner) : ${missing.length > 6 ? `${missing.length} papiers sur ${cars.length} voiture(s)` : missing.join(', ')}.`);
  return out.join('\n');
}

/** Pour une relecture de réservation : un papier de cette voiture expire-t-il avant la fin de la location ? */
export async function paperWarning(carId: string, endDate: string): Promise<string> {
  const { data } = await supabase.from('cars').select('id, name, insurance_expiry, technical_expiry, vignette_expiry').eq('id', carId).maybeSingle();
  const c = data as CarPapers | null;
  if (!c) return '';
  const bad = PAPERS.filter(p => c[p.col] && c[p.col]! <= endDate).map(p => `${p.label} expire le ${frDate(c[p.col]!)}`);
  return bad.length ? `⚠️ PAPIERS : ${bad.join(', ')}, avant la fin de la location.` : '';
}

/**
 * Tâche quotidienne : papiers qui expirent. 30 jours → notification ; 7 jours et jour J / expiré → APPEL.
 * Chaque palier n'est annoncé qu'une fois par papier et par date d'échéance.
 */
export async function jobCarPapersCall(): Promise<void> {
  const { data } = await supabase.from('cars').select('id, name, insurance_expiry, technical_expiry, vignette_expiry');
  const today = todayOran();
  const { data: rentals } = await supabase.from('bookings').select('car_id, client_name')
    .in('status', ['CONFIRMED', 'ACTIVE']).lte('start_date', today).gte('end_date', today);
  const rentedTo = new Map(((rentals ?? []) as { car_id: string; client_name: string }[]).map(r => [r.car_id, r.client_name]));

  const toCall: string[] = [], toNotify: string[] = [];
  for (const c of (data ?? []) as CarPapers[]) {
    for (const p of PAPERS) {
      const d = c[p.col];
      if (!d) continue;
      const left = daysUntil(d, today);
      const step = left <= 0 ? 'expire' : left <= 7 ? '7j' : left <= 30 ? '30j' : null;
      if (!step) continue;
      const key = `carpaper:said:${c.id}:${p.col}:${d}:${step}`;
      if (await kvGet(key)) continue;
      await kvSet(key, '1', 60 * 86_400);
      const rented = rentedTo.get(c.id);
      const sentence = left < 0
        ? `${p.label} de la ${c.name} est expiré${p.col === 'technical_expiry' ? '' : 'e'} depuis le ${frDate(d)}.${rented ? ` Elle est en location chez ${rented} !` : ' Elle ne doit pas sortir.'}`
        : left === 0
          ? `${p.label} de la ${c.name} expire aujourd'hui.${rented ? ` Elle est en location chez ${rented}.` : ''}`
          : `${p.label} de la ${c.name} expire dans ${left} jour${left > 1 ? 's' : ''}, le ${frDate(d)}.${rented ? ` Elle est en location chez ${rented}.` : ''}`;
      const txt = sentence.charAt(0).toUpperCase() + sentence.slice(1);
      (step === '30j' ? toNotify : toCall).push(txt);
    }
  }
  if (toNotify.length) emitProactive(`Papiers à renouveler ce mois-ci : ${toNotify.join(' ')}`, 'reminder', `📄 Papiers à renouveler (30 jours)\n${toNotify.map(t => `• ${t}`).join('\n')}`, 'kouider', 'fleet');
  if (toCall.length) {
    emitProactive(`Papiers urgents : ${toCall.join(' ')}`, 'alert', `🚨 PAPIERS DES VOITURES\n${toCall.map(t => `• ${t}`).join('\n')}`, 'kouider', 'fleet');
    await autoCall(`car-papers:${today}`, `Attention aux papiers des voitures. ${toCall.join(' ')} Pense à les renouveler.`);
  }
  console.log(`[car-papers] ${toCall.length} appel(s), ${toNotify.length} notif(s)`);
}
