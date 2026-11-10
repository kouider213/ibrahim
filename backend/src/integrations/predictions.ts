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

async function facts(horizon: number): Promise<{ text: string; amounts: number[] }> {
  const now = Date.now(), to = iso(now + horizon * DAY);
  const [{ data: cars }, { data: bookings }] = await Promise.all([
    supabase.from('cars').select('id, name, available, resale_price, currency, current_km, last_service_km, next_service_km, next_service_date, service_interval_km, insurance_expiry, technical_expiry, vignette_expiry, last_service_date'),
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
  // 09/11 : la colonne amount_remaining n'est pas remise à zéro quand une location est notée payée → Dzaryx « prédisait » sept
  // impayés (Sophia, Boufraine…) sur des locations réglées depuis des mois. Un impayé = reste > 0 ET statut de paiement ≠ payé.
  const owes = (b: { amount_remaining?: number | null; payment_status?: string | null }) => Number(b.amount_remaining ?? 0) > 0 && !/^(paid|pay[ée]|complet)/i.test(b.payment_status ?? '');
  const unpaid = live.filter(b => owes(b) && b.end_date < iso(now)).map(b => `${b.client_name} (reste ${b.amount_remaining})`);
  const upcoming = live.filter(b => b.start_date >= iso(now) && b.start_date <= to).map(b => {
    const past = all.filter(x => x.client_name === b.client_name && x.start_date < iso(now));
    return `• ${b.start_date.slice(0, 10)} → ${b.end_date.slice(0, 10)} ${b.cars?.name ?? '?'} — ${b.client_name}${past.length ? ` (déjà ${past.length} location(s)${past.some(x => owes(x)) ? ', a déjà laissé un impayé' : ''})` : ' (nouveau client)'}${b.payment_status ? `, paiement ${b.payment_status}` : ''}`;
  });
  const { executeTool } = await import('./tool-executor.js');
  const seasons = await executeTool('get_upcoming_seasons', {}, 'predictions').catch(() => '');
  // 10/11 : sans les vrais tarifs sous les yeux, le cerveau gratuit en inventait un (« 35 000 DA/jour »).
  const priced = fleet.filter(c => Number(c['resale_price']) > 0);
  const tariffs = priced.map(c => `• ${c['name']} : ${Number(c['resale_price'])} ${c['currency'] === 'DZD' || c['currency'] === 'DA' ? 'DA' : '€'} par jour`);
  const amounts = [...priced.map(c => Number(c['resale_price'])), ...live.filter(owes).map(b => Number(b.amount_remaining))];
  const text = [
    `Aujourd'hui ${iso(now)}, horizon ${horizon} jours. Flotte : ${fleet.length} voitures (${usable} utilisables). Historique : ${all.length} réservation(s) en tout (${live.length} valides).`,
    `Réservations à venir :\n${upcoming.join('\n') || '(aucune)'}`,
    `Jours tendus (≥ 80 % de la flotte prise) :\n${tight.join('\n') || '(aucun pour le moment)'}`,
    `Délai moyen entre réservation et départ : ${lead !== null ? `${lead} jours` : 'inconnu'}.`,
    `Même période les années précédentes : ${ly.length} location(s).`,
    `Entretien / papiers :\n${upkeep.join('\n') || '(rien de proche, ou km pas renseignés)'}`,
    `Impayés passés : ${unpaid.join(', ') || 'aucun'}.`,
    `Tarifs client actuels (les SEULS prix que tu as le droit de citer) :\n${tariffs.join('\n') || '(inconnus)'}`,
    `Saisons / fêtes qui arrivent :\n${String(seasons).slice(0, 1500)}`,
  ].join('\n\n');
  return { text, amounts };
}

/**
 * Garde-fou (10/11) — le texte régénéré cette nuit contenait un prix inventé (« 35 000 DA/jour ») et « Facebook/Insta »
 * alors que les pubs de Kouider sont sur TikTok uniquement. Une consigne ne suffit pas avec les cerveaux gratuits :
 * le code retire tout montant qui ne vient pas des vraies données et ramène les réseaux à TikTok.
 */
const money = (raw: string, k?: string): number => {
  const t = raw.replace(/[\s\u00a0\u202f]/g, '');
  const n = /^\d{1,3}([.,]\d{3})+$/.test(t) ? Number(t.replace(/[.,]/g, '')) : Number(t.replace(',', '.'));
  return k ? n * 1000 : n;
};
const PRICE = /(?:[≈~]\s*)?(\d[\d\u00a0\u202f .,]*\d|\d)\s*(k)?\s*(?:DA|DZD|dinars?|€|euros?)(?![A-Za-zÀ-ÿ])(?:\s*(?:\/|par)\s*(?:jours?|j|semaines?|mois)(?![A-Za-zÀ-ÿ]))?/gi;
const NET = '(?:Facebook(?:\\s+(?:Marketplace|Ads))?|Instagram|Insta|Snapchat|Meta(?:\\s+Ads)?)';
export function guardPredictions(text: string, amounts: number[]): { text: string; removed: string[] } {
  const ok = new Set(amounts.map(a => Math.round(a * 100)));
  const removed: string[] = [];
  let out = text.replace(PRICE, (m: string, num: string, k?: string) => {
    if (ok.has(Math.round(money(num, k) * 100))) return m;
    removed.push(m.trim());
    return 'un montant à fixer toi-même';
  });
  out = out
    .replace(/(?:en\s+)?(?<![A-Za-zÀ-ÿ])statuts?\s+WhatsApp/gi, 'sur TikTok')
    .replace(new RegExp(`(?<![A-Za-zÀ-ÿ])${NET}(?![A-Za-zÀ-ÿ])`, 'gi'), 'TikTok')
    .replace(/TikTok(?:\s*(?:\/|,|et|ou|&|\+)\s*TikTok)+/gi, 'TikTok');
  return { text: out, removed };
}

export async function buildPredictions(horizon = 30): Promise<string> {
  const { text: f, amounts } = await facts(horizon);
  const r = await createAnthropic().messages.create({
    model: CLAUDE_MAIN, max_tokens: 1200, messages: [{ role: 'user', content:
`Tu es Dzaryx, l'associé de Kouider (FIK Conciergerie, location de voitures à Oran). Voici les VRAIES données :

${f}

Donne 3 à 6 PRÉDICTIONS utiles pour les ${horizon} prochains jours, de la plus importante à la moins importante. Pour chacune :
🔮 ce qui va probablement arriver (avec une date ou un délai) — « parce que » + le chiffre qui le montre — 👉 l'action à faire maintenant.
Types : voitures qui vont manquer (demande vs flotte, saisons MRE / Aïd / vacances), entretien ou papiers qui tombent, client à risque (retard, impayé), creux à remplir (offre flash), prix à monter les jours tendus.
Règles : n'invente aucun chiffre ; aucun prix en € ou en DA qui ne soit pas écrit tel quel dans les données ci-dessus (pour une hausse ou une offre, parle en pourcentage ou laisse Kouider fixer le montant) ; ses pubs passent sur TikTok UNIQUEMENT — jamais Facebook, Instagram ni statut WhatsApp ; si l'historique est trop mince pour une prédiction, dis-le en une phrase plutôt que d'inventer. Tutoie-le, français simple, pas de tableau.` }],
  }, QUALITY);
  const g = guardPredictions(r.content.map(b => (b.type === 'text' ? b.text : '')).join('').trim(), amounts);
  if (g.removed.length) console.warn('[predictions] montants inventés retirés :', g.removed.join(' | '));
  return g.text;
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
