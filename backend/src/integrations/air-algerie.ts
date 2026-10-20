import { browserTaskTool } from './browser-relay.js';

// Recherche de vols AIR ALGÉRIE uniquement, sur le site officiel, dans le Chrome du PC cloud (browser_task) :
// aucune clé ni API. Règles fixes de Kouider (2026-10-20) : départ Lille → Oran par défaut, et TOUJOURS
// UN SEUL bagage en soute en plus pour tout le groupe, quel que soit le nombre de passagers.
// Jamais de réservation ni de paiement : le navigateur s'arrête avant.

const DEFAULT_FROM = 'Lille (LIL)';
const DEFAULT_TO = 'Oran (ORN)';

const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const fr = (iso: string) => iso.split('-').reverse().join('/');

export async function airAlgerieSearchTool(input: Record<string, unknown>, sessionId?: string): Promise<string> {
  const depart = String(input['depart_date'] ?? '').trim();
  const ret = String(input['return_date'] ?? '').trim();
  if (!isDate(depart)) return '❌ Il me faut la date de départ (AAAA-MM-JJ).';
  if (ret && !isDate(ret)) return '❌ Date de retour invalide (AAAA-MM-JJ).';
  if (ret && ret < depart) return '❌ Le retour est avant le départ.';

  const adults = Math.max(1, Math.round(Number(input['adults'] ?? 1)));
  const children = Math.max(0, Math.round(Number(input['children'] ?? 0)));   // 2-11 ans
  const infants = Math.max(0, Math.round(Number(input['infants'] ?? 0)));     // moins de 2 ans
  if (adults + children + infants > 9) return '❌ 9 passagers maximum par recherche sur le site.';
  if (infants > adults) return '❌ Un bébé par adulte au maximum.';
  const flex = Math.min(3, Math.max(0, Math.round(Number(input['flex_days'] ?? 3))));
  const from = String(input['from'] ?? '').trim() || DEFAULT_FROM;
  const to = String(input['to'] ?? '').trim() || DEFAULT_TO;

  const pax = [`${adults} adulte${adults > 1 ? 's' : ''}`,
    children ? `${children} enfant${children > 1 ? 's' : ''} (2-11 ans)` : '',
    infants ? `${infants} bébé${infants > 1 ? 's' : ''} (moins de 2 ans)` : ''].filter(Boolean).join(', ');
  const trip = ret ? `aller-retour ${from} → ${to}, aller le ${fr(depart)}, retour le ${fr(ret)}`
    : `aller simple ${from} → ${to} le ${fr(depart)}`;

  const task =
    `RECHERCHE DE VOL AIR ALGÉRIE (uniquement Air Algérie, sur son site officiel https://airalgerie.dz — jamais un comparateur ni une autre compagnie).\n` +
    `Vol : ${trip}. Passagers : ${pax}.\n` +
    `BAGAGE : il faut TOUJOURS UN SEUL bagage en soute EN PLUS pour tout le groupe (1 bagage au total, pas un par personne).\n` +
    `Méthode :\n` +
    `1. Fais la recherche avec exactement ces passagers. Si le site propose un calendrier des prix / « dates flexibles », regarde ` +
    (flex ? `aussi ±${flex} jours autour de chaque date et repère le jour le moins cher.\n` : `uniquement les dates données.\n`) +
    `2. Pour chaque vol intéressant, note les horaires, s'il est direct, le tarif (Light / Classic / Flex…) et la franchise bagage incluse.\n` +
    `3. Prix du bagage en plus : cherche-le sur le site (étape « options / bagages » si on y arrive sans données personnelles, sinon la page ` +
    `officielle Air Algérie des bagages supplémentaires / excédents pour la France ↔ Algérie). Compare avec l'option de passer UN seul ` +
    `passager sur le tarif supérieur qui inclut un bagage de plus, et garde la solution la moins chère.\n` +
    `4. Ne saisis JAMAIS de vraies données personnelles, ne réserve rien et ne paie rien : arrête-toi avant. Captcha ou site bloqué → ask_kouider.\n` +
    `Termine par done avec : le vol le moins cher (date, horaires, tarif), le PRIX TOTAL pour tout le groupe AVEC le bagage en plus ` +
    `(détail : billets + bagage), 2 ou 3 autres dates/options moins chères ou proches, et ce que tu n'as pas pu vérifier.`;

  const res = await browserTaskTool({ task }, sessionId);
  if (res.startsWith('⏳') || res.startsWith('❌')) return res;
  return `✈️ Recherche Air Algérie lancée sur le PC cloud : ${trip}, ${pax}, + 1 bagage en soute pour le groupe` +
    `${flex ? ` (±${flex} jours)` : ''}. Je t'envoie le prix total sur Telegram dès que c'est fini ; tu peux regarder en direct : MON PC → PC cloud.`;
}
