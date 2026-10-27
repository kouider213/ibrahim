/**
 * PRÉDICTIONS (27/10/2026) — Dzaryx prévient AVANT que ça arrive : jours où il va manquer des voitures, entretien / papiers
 * qui tombent bientôt (au rythme réel des km), clients à risque (retard, impayé), saisons qui arrivent (MRE, Aïd, été).
 * Calculs sur les vraies données (réservations, voitures, saisons), puis Sonnet en tire 3 à 6 prédictions avec l'action
 * à faire. Chaque prédiction dit sur quoi elle repose ; peu d'historique = il le dit. Lundi 9h sur Telegram + outil.
 */
import { supabase } from './supabase.js';
import { createAnthropic, CLAUDE_MAIN, QUALITY } from './anthropic-compat.js';
import { queueTelegramMessage } from '../notifications/tg-outbox.js';
import { kvSet } from './app-store.js';

const DAY = 86_400_000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const daysUntil = (d?: string | null) => d ? Math.round((Date.parse(d) - Date.now()) / DAY) : null;

async function facts(horizon: number): Promise<string> {
  const now = Date.now(), to = iso(now + horizon * DAY);
  const [{ data: cars }, { data: bookings }] = await Promise.all([
    supabase.from('cars').select('id, name, available, current_km, last_service_km, next_service_km, next_service_date, service_interval_km, insurance_expiry, technical_expiry, vignette_expiry, last_service_date'),
    supabase.from('bookings').select('car_id, client_name, client_phone, start_date, end_date, status, payment_status, amount_remaining, created_at, cars(name)').order('start_date'),
  ]);
  const fleet = (cars ?? []) as Array<Record<string, unknown>>;
  const all = (bookings ?? []) as unknown as Array<{ car_id: string; client_name: string; client_phone?: string; start_date: string; end_date: string; status: string; payment_status?: string; amount_remaining?: number; created_at: string; cars?: { name?: string } }>;
  const live = all.filter(b => !/REJECT|CANCEL/i.test(b.status));
  const usable = fleet.filter(c => c['available'] !== false).length;

  // 1. Occupation jour par jour (réservations connues) → jours tendus
  const tight: string[] = [];
  for (let d = 0; d < horizon; d++) {
    const day = iso(now + d * DAY);
    const n = live.filter(b => b.start_date.slice(0, 10) <= day && b.end_date.slice(0, 10) >= day).length;
    if (usable && n / usable >= 0.8) tight.push(`${day} : ${n}/${usable} voitures prises`);
  }
  // 2. Rythme de réservation : combien de jours à l'avance les clients réservent
  const leads = live.map(b => (Date.parse(b.start_date) - Date.parse(b.created_at)) / DAY).filter(x => x >= 0 && x < 365);
  const lead = leads.length ? Math.round(leads.reduce((a, b) => a + b, 0) / leads.length) : null;
  // 3. Même période l'an dernier
  const ly = all.filter(b => b.start_date.slice(5, 10) >= iso(now).slice(5, 10) && b.start_date.slice(5, 10) <= to.slice(5, 10) && b.start_date.slice(0, 4) < iso(now).slice(0, 4));
  // 4. Entretien / papiers
  const upkeep = fleet.map(c => {
    const out: string[] = [];
    const kmLeft = Number(c['next_service_km'] ?? 0) - Number(c['current_km'] ?? 0);
    if (Number(c['next_service_km']) > 0 && Number(c['current_km']) > 0) out.push(`vidange dans ${kmLeft} km`);
    const svc = daysUntil(c['next_service_date'] as string);
    if (svc !== null && svc < 60) out.push(`entretien prévu dans ${svc} j`);
    for (const [k, label] of [['insurance_expiry', 'assurance'], ['technical_expiry', 'contrôle technique'], ['vignette_expiry', 'vignette']] as const) {
      const d = daysUntil(c[k] as string);
      if (d !== null && d < 60) out.push(`${label} ${d < 0 ? `EXPIRÉE depuis ${-d} j` : `expire dans ${d} j`}`);
    }
    // km par jour de location réels → date probable de la vidange
    const rentDays = live.filter(b => b.car_id === c['id'] && b.end_date < iso(now)).reduce((a, b) => a + Math.max(1, Math.round((Date.parse(b.end_date) - Date.parse(b.start_date)) / DAY)), 0);
    const driven = Number(c['current_km'] ?? 0) - Number(c['last_service_km'] ?? 0);
    if (rentDays > 0 && driven > 0 && kmLeft > 0) out.push(`≈ ${Math.round(driven / rentDays)} km par jour de location → vidange dans ≈ ${Math.round(kmLeft / (driven / rentDays))} jours de location`);
    return out.length ? `• ${c['name']} : ${out.join(', ')}` : '';
  }).filter(Boolean);
  // 5. Clients : retards / impayés passés, et ceux qui reviennent bientôt
  const unpaid = live.filter(b => Number(b.amount_remaining ?? 0) > 0 && b.end_date < iso(now)).map(b => `${b.client_name} (reste ${b.amount_remaining})`);
  const upcoming = live.filter(b => b.start_date >= iso(now) && b.start_date <= to).map(b => {
    const past = all.filter(x => x.client_name === b.client_name && x.start_date < iso(now));
    return `• ${b.start_date.slice(0, 10)} → ${b.end_date.slice(0, 10)} ${b.cars?.name ?? '?'} — ${b.client_name}${past.length ? ` (déjà ${past.length} location(s)${past.some(x => Number(x.amount_remaining ?? 0) > 0) ? ', a déjà laissé un impayé' : ''})` : ' (nouveau client)'}${b.payment_status ? `, paiement ${b.payment_status}` : ''}`;
  });
  const { executeTool } = await import('./tool-executor.js');
  const seasons = await executeTool('get_upcoming_seasons', {}, 'predictions').catch(() => '');
  return [
    `Aujourd'hui ${iso(now)}, horizon ${horizon} jours. Flotte : ${fleet.length} voitures (${usable} utilisables). Historique : ${all.length} réservation(s) en tout (${live.length} valides).`,
    `Réservations à venir :\n${upcoming.join('\n') || '(aucune)'}`,
    `Jours tendus (≥ 80 % de la flotte prise) :\n${tight.join('\n') || '(aucun pour le moment)'}`,
    `Délai moyen entre réservation et départ : ${lead !== null ? `${lead} jours` : 'inconnu'}.`,
    `Même période les années précédentes : ${ly.length} location(s).`,
    `Entretien / papiers :\n${upkeep.join('\n') || '(rien de proche, ou km pas renseignés)'}`,
    `Impayés passés : ${unpaid.join(', ') || 'aucun'}.`,
    `Saisons / fêtes qui arrivent :\n${String(seasons).slice(0, 1500)}`,
  ].join('\n\n');
}

export async function buildPredictions(horizon = 30): Promise<string> {
  const f = await facts(horizon);
  const r = await createAnthropic().messages.create({
    model: CLAUDE_MAIN, max_tokens: 1200, messages: [{ role: 'user', content:
`Tu es Dzaryx, l'associé de Kouider (FIK Conciergerie, location de voitures à Oran). Voici les VRAIES données :

${f}

Donne 3 à 6 PRÉDICTIONS utiles pour les ${horizon} prochains jours, de la plus importante à la moins importante. Pour chacune :
🔮 ce qui va probablement arriver (avec une date ou un délai) — « parce que » + le chiffre qui le montre — 👉 l'action à faire maintenant.
Types : voitures qui vont manquer (demande vs flotte, saisons MRE / Aïd / vacances), entretien ou papiers qui tombent, client à risque (retard, impayé), creux à remplir (offre flash), prix à monter les jours tendus.
Règles : n'invente aucun chiffre ; si l'historique est trop mince pour une prédiction, dis-le en une phrase plutôt que d'inventer. Tutoie-le, français simple, pas de tableau.` }],
  }, QUALITY);
  return r.content.map(b => (b.type === 'text' ? b.text : '')).join('').trim();
}

/** Lundi 9h : les prédictions de la semaine sur Telegram. */
export async function jobPredictions(): Promise<string> {
  const text = await buildPredictions(30);
  await kvSet('predictions:last', JSON.stringify({ at: new Date().toISOString(), text }), 8 * 86_400);
  await queueTelegramMessage(`🔮 Mes prédictions pour les 30 prochains jours\n\n${text.replace(/\*\*/g, '')}`).catch(() => {});
  return 'ok';
}

export async function predictionsTool(input: Record<string, unknown>): Promise<string> {
  const h = Math.min(Math.max(Number(input['days']) || 30, 7), 120);
  return `🔮 Prédictions (${h} jours) — à partir des vraies réservations, voitures et saisons :\n\n${await buildPredictions(h)}`;
}
