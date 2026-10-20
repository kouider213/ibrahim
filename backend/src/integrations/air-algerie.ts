import { browserTaskTool } from './browser-relay.js';

// Recherche de vols AIR ALGÉRIE uniquement, dans le Chrome du PC cloud (browser_task) : aucune clé ni API.
// Règles fixes de Kouider (2026-10-20) : départ Lille → Oran par défaut, et TOUJOURS UN SEUL bagage en soute
// en plus pour tout le groupe, quel que soit le nombre de passagers. Jamais de réservation ni de paiement.
//
// Le formulaire du site (airalgerie.dz) est un widget que l'agent navigateur n'arrive pas à remplir : on
// rejoue ici son POST (champs du bloc « flight-booking », dates AAAAMMJJ0000) et le site répond par un 302
// vers la grille Amadeus « FlexPricer » (±3 jours, prix TOTAL pour tous les passagers, taxes incluses).
// Cette page est derrière Imperva (anti-robot) : seul un vrai navigateur la lit → l'agent ouvre le lien.
// Tarifs vus le 2026-10-20 : Light = SANS bagage en soute, Economique Promo = 1 × 23 kg par passager.

const SITE = 'https://airalgerie.dz/';
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const fr = (iso: string) => iso.split('-').reverse().join('/');
const amadeus = (iso: string) => iso.replace(/-/g, '') + '0000';

async function resultsUrl(p: { from: string; to: string; depart: string; ret: string; adults: number; children: number; infants: number }): Promise<string | null> {
  const body = new URLSearchParams({
    'flight-booking': p.ret ? 'aller-Retour' : 'aller-simple',
    depart: p.from, arrivee: p.to,
    startDate: amadeus(p.depart), startDateSingle: amadeus(p.depart), endDate: p.ret ? amadeus(p.ret) : '',
    'flight-classe': 'economique',
    adultsNumber: String(p.adults), kidsNumber: String(p.children), babiesNumber: String(p.infants),
    'flight-booking-send': '1',
  });
  try {
    const r = await fetch(SITE, { method: 'POST', body, redirect: 'manual', signal: AbortSignal.timeout(20_000),
      headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130 Safari/537.36' } });
    const loc = r.headers.get('location') ?? '';
    return /^https:\/\/fly\.airalgerie\.dz\//.test(loc) ? loc : null;
  } catch { return null; }
}

export async function airAlgerieSearchTool(input: Record<string, unknown>, sessionId?: string): Promise<string> {
  const depart = String(input['depart_date'] ?? '').trim();
  const ret = String(input['return_date'] ?? '').trim();
  if (!isDate(depart)) return '❌ Il me faut la date de départ (AAAA-MM-JJ).';
  if (ret && !isDate(ret)) return '❌ Date de retour invalide (AAAA-MM-JJ).';
  if (ret && ret < depart) return '❌ Le retour est avant le départ.';

  const adults = Math.max(1, Math.round(Number(input['adults'] ?? 1)));
  const children = Math.max(0, Math.round(Number(input['children'] ?? 0)));   // 2-11 ans
  const infants = Math.max(0, Math.round(Number(input['infants'] ?? 0)));     // moins de 2 ans
  if (adults + children > 9) return '❌ 9 passagers maximum par recherche sur le site.';
  if (infants > adults) return '❌ Un bébé par adulte au maximum.';
  const from = (String(input['from'] ?? '').trim() || 'LIL').toUpperCase();
  const to = (String(input['to'] ?? '').trim() || 'ORN').toUpperCase();
  if (!/^[A-Z]{3}$/.test(from) || !/^[A-Z]{3}$/.test(to)) return '❌ Aéroports en code IATA (ex. LIL, ORN, ALG, CDG).';

  const n = adults + children;   // les bébés n'ont pas de siège ni de bagage en soute à eux
  const pax = [`${adults} adulte${adults > 1 ? 's' : ''}`,
    children ? `${children} enfant${children > 1 ? 's' : ''} (2-11 ans)` : '',
    infants ? `${infants} bébé${infants > 1 ? 's' : ''} (moins de 2 ans)` : ''].filter(Boolean).join(', ');
  const trip = ret ? `aller-retour ${from} → ${to}, aller le ${fr(depart)}, retour le ${fr(ret)}` : `aller simple ${from} → ${to} le ${fr(depart)}`;

  const url = await resultsUrl({ from, to, depart, ret, adults, children, infants });
  const open = url
    ? `1. navigate DIRECTEMENT vers ce lien (résultats officiels Air Algérie, déjà remplis — ne passe PAS par le formulaire de airalgerie.dz), ` +
      `puis wait 10 secondes et encore wait 5 (la page charge lentement) et read_page : tous les prix sont dans le texte, inutile de faire défiler. Lien :\n${url}\n`
    : `1. Va sur https://airalgerie.dz, onglet « Réserver un vol », et fais la recherche (aéroports ${from} et ${to}, dates, passagers).\n`;

  const task =
    `RECHERCHE DE VOL AIR ALGÉRIE (uniquement Air Algérie — jamais un comparateur ni une autre compagnie).\n` +
    `Vol : ${trip}. Passagers : ${pax}.\n` +
    `BAGAGE : il faut TOUJOURS UN SEUL bagage en soute EN PLUS pour tout le groupe (1 au total, pas un par personne).\n` +
    `Méthode (utilise read_page, pas de screenshot sauf captcha) :\n` +
    open +
    `2. La page « DATES DE VOYAGES » montre une grille ±3 jours : prix « à partir de » = TOTAL pour tous les passagers, taxes incluses ` +
    `(c'est le tarif Light, sans bagage en soute). Note les 3 combinaisons de dates les moins chères (ou les 3 dates en aller simple).\n` +
    `3. Clique la combinaison la moins chère, puis CONTINUER. Sur la page « VOLS », pour le vol le moins cher ${ret ? 'à l\'aller ET au retour' : ''} note : ` +
    `horaires, direct ou escale, prix « Light » et prix « Economique Promo » (prix avec réduction, totaux du groupe).\n` +
    `4. Calcul du bagage en plus : Light = 0 bagage en soute, Economique Promo = 1 × 23 kg par passager. Pour ${n > 1 ? `ce groupe de ${n} passagers` : 'ce passager'}, ` +
    (n > 1
      ? `le moins cher pour avoir UN seul bagage = ${n - 1} passager(s) en Light + 1 passager en Economique Promo (2 réservations séparées), ` +
        `soit par trajet ≈ prix Light du groupe + (prix Promo du groupe − prix Light du groupe) ÷ ${n}. Donne aussi le prix « tout le groupe en Economique Promo » ` +
        `(1 bagage chacun) pour comparer.\n`
      : `le prix avec bagage = prix Economique Promo.\n`) +
    `5. Ne clique sur rien d'autre qu'un tarif / CONTINUER sur la page des dates : ne va PAS jusqu'à la saisie des passagers, ne réserve rien, ne paie rien. ` +
    `Captcha ou page bloquée → ask_kouider.\n` +
    `Termine par done, en français, court : 🥇 meilleure option (dates, horaires, direct ou non) avec le PRIX TOTAL du groupe AVEC 1 bagage en soute ` +
    `(détail : prix Light sans bagage + supplément bagage), puis les 2 autres combinaisons de dates moins chères (prix Light du groupe), et ce que tu n'as pas pu vérifier. Monnaie : celle du site (€).`;

  const res = await browserTaskTool({ task }, sessionId);
  if (res.startsWith('⏳') || res.startsWith('❌')) return res;
  return `✈️ Recherche Air Algérie lancée sur le PC cloud : ${trip}, ${pax}, + 1 bagage en soute pour le groupe, avec les dates à ±3 jours. ` +
    `Je t'envoie le prix total sur Telegram dès que c'est fini ; tu peux regarder en direct : MON PC → PC cloud.`;
}
