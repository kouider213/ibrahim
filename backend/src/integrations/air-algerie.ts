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
const addDays = (iso: string, d: number) => new Date(Date.parse(iso + 'T12:00:00Z') + d * 86_400_000).toISOString().slice(0, 10);
const today = () => new Date().toISOString().slice(0, 10);
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

// Catégories du site : Adultes = 12 ans et plus, Enfants = 2 à 11 ans, Bébés = moins de 2 ans.
type Cat = 'adulte' | 'enfant' | 'bébé';
const catOfAge = (age: number): Cat => age < 2 ? 'bébé' : age < 12 ? 'enfant' : 'adulte';
/** Âge (années pleines) à une date, depuis une date de naissance. */
function ageAt(birth: string, iso: string): number {
  const [by, bm, bd] = birth.split('-').map(Number), [y, m, d] = iso.split('-').map(Number);
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
}

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
  let depart = String(input['depart_date'] ?? '').trim();
  let ret = String(input['return_date'] ?? '').trim();
  const month = String(input['month'] ?? '').trim();               // AAAA-MM : « une date en janvier »
  const stay = Math.round(Number(input['stay_days'] ?? 0));        // nb de jours sur place (aller-retour)
  const oneWay = input['one_way'] === true;
  if (month && !/^\d{4}-\d{2}$/.test(month)) return '❌ Mois invalide (AAAA-MM).';
  if (!month && !isDate(depart)) return '❌ Il me faut la date de départ (AAAA-MM-JJ) ou le mois (AAAA-MM).';
  if (ret && !isDate(ret)) return '❌ Date de retour invalide (AAAA-MM-JJ).';
  if (month && !ret && !stay && !oneWay) return '❓ Demande à Kouider : aller simple, ou aller-retour et combien de jours sur place ? (puis rappelle avec one_way=true ou stay_days)';
  if (!month && !ret && stay > 0) ret = addDays(depart, stay);
  if (!month && ret && ret < depart) return '❌ Le retour est avant le départ.';
  if (!month && depart < today()) return '❌ Cette date est déjà passée.';

  // Départs à chercher : une date (grille ±3 j) ou tout le mois (une grille par semaine : centres 4, 11, 18, 25 et fin de mois)
  let centers: string[] = [depart];
  if (month) {
    const [y, m] = month.split('-').map(Number);
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    centers = [...new Set([4, 11, 18, 25, last - 3])].map(d => `${month}-${String(d).padStart(2, '0')}`)
      .filter(c => addDays(c, 3) >= today());
    if (!centers.length) return '❌ Ce mois est déjà passé.';
    if (centers[0] < today()) centers[0] = addDays(today(), 3);
  }
  const tripDays = month ? (oneWay ? 0 : stay) : (ret ? Math.round((Date.parse(ret) - Date.parse(depart)) / 86_400_000) : 0);

  // Passagers : de préférence la liste des âges (ou dates de naissance) → bonne catégorie toute seule.
  // On prend l'âge au jour du RETOUR (dernier vol) : un bébé qui a 2 ans au retour doit avoir un siège enfant.
  const lastFlight = month ? addDays(centers.at(-1)!, 3 + tripDays) : (ret || depart);
  const people = Array.isArray(input['passengers']) ? (input['passengers'] as unknown[]).map(x => String(x).trim()).filter(Boolean) : [];
  let adults: number, children: number, infants: number;
  const notes: string[] = [];
  if (people.length) {
    const cats: Cat[] = [];
    for (const p of people) {
      if (isDate(p)) {
        const a = ageAt(p, lastFlight), a0 = ageAt(p, month ? centers[0] : depart);
        if (a < 0) return `❌ Date de naissance ${fr(p)} après le voyage ?`;
        cats.push(catOfAge(a));
        if (catOfAge(a0) !== catOfAge(a)) notes.push(`né(e) le ${fr(p)} : ${a0} an(s) au départ mais ${a} au retour → compté ${catOfAge(a)}`);
      } else if (/^\d{1,3}$/.test(p)) {
        const a = Number(p); cats.push(catOfAge(a));
        if (a === 1 || a === 11) notes.push(`${a} an${a > 1 ? 's' : ''} : compté ${catOfAge(a)} — s'il a ${a + 1} ans avant le dernier vol, la catégorie change (donne sa date de naissance pour être sûr)`);
      } else return `❌ Passager « ${p} » : donne un âge (ex. 24) ou une date de naissance (AAAA-MM-JJ).`;
    }
    adults = cats.filter(c => c === 'adulte').length; children = cats.filter(c => c === 'enfant').length; infants = cats.filter(c => c === 'bébé').length;
  } else {
    adults = Math.round(Number(input['adults'] ?? 1));
    children = Math.max(0, Math.round(Number(input['children'] ?? 0)));   // 2-11 ans
    infants = Math.max(0, Math.round(Number(input['infants'] ?? 0)));     // moins de 2 ans
  }
  if (adults < 1) return '❌ Il faut au moins un adulte (12 ans ou plus) dans la réservation.';
  if (adults + children > 9) return '❌ 9 passagers maximum par recherche sur le site.';
  if (infants > adults) return '❌ Un bébé par adulte au maximum.';
  const from = (String(input['from'] ?? '').trim() || 'LIL').toUpperCase();
  const to = (String(input['to'] ?? '').trim() || 'ORN').toUpperCase();
  if (!/^[A-Z]{3}$/.test(from) || !/^[A-Z]{3}$/.test(to)) return '❌ Aéroports en code IATA (ex. LIL, ORN, ALG, CDG).';

  const n = adults + children;   // les bébés n'ont pas de siège ni de bagage en soute à eux
  const pax = [`${adults} adulte${adults > 1 ? 's' : ''}`,
    children ? `${children} enfant${children > 1 ? 's' : ''} (2-11 ans)` : '',
    infants ? `${infants} bébé${infants > 1 ? 's' : ''} (moins de 2 ans, sur les genoux)` : ''].filter(Boolean).join(', ');
  const trip = month
    ? `${tripDays ? `aller-retour (${tripDays} jours sur place)` : 'aller simple'} ${from} → ${to}, départ n'importe quel jour de ${MOIS[Number(month.slice(5)) - 1]} ${month.slice(0, 4)}`
    : ret ? `aller-retour ${from} → ${to}, aller le ${fr(depart)}, retour le ${fr(ret)}` : `aller simple ${from} → ${to} le ${fr(depart)}`;

  const urls: string[] = [];
  for (const c of centers) {
    const u = await resultsUrl({ from, to, depart: c, ret: tripDays ? addDays(c, tripDays) : '', adults, children, infants });
    if (u) urls.push(u);
  }
  const open = !urls.length
    ? `1. Va sur https://airalgerie.dz, onglet « Réserver un vol », et fais la recherche (aéroports ${from} et ${to}, dates, passagers : ${adults} adultes, ${children} enfants, ${infants} bébés).\n`
    : urls.length === 1
      ? `1. navigate DIRECTEMENT vers ce lien (résultats officiels Air Algérie, déjà remplis — ne passe PAS par le formulaire de airalgerie.dz), ` +
        `puis wait 10 secondes et encore wait 5 (la page charge lentement) et read_page : tous les prix sont dans le texte, inutile de faire défiler. Lien :\n${urls[0]}\n`
      : `1. Pour couvrir tout le mois, ouvre UN PAR UN ces ${urls.length} liens (résultats officiels Air Algérie déjà remplis, une semaine chacun — ne passe PAS ` +
        `par le formulaire) : navigate, wait 10, read_page (si les prix ne sont pas encore là : wait 5 et read_page). Pas de défilement, pas de capture. ` +
        `Note les prix de chaque semaine, puis à la fin reviens (navigate) sur le lien de la semaine la moins chère pour l'étape 3.\n` +
        urls.map((u, i) => `Semaine ${i + 1} : ${u}`).join('\n') + '\n';

  const task =
    `RECHERCHE DE VOL AIR ALGÉRIE (uniquement Air Algérie — jamais un comparateur ni une autre compagnie).\n` +
    `Vol : ${trip}. Passagers : ${pax} (catégories déjà réglées dans les liens, ne les change pas).\n` +
    `BAGAGE : il faut TOUJOURS UN SEUL bagage en soute EN PLUS pour tout le groupe (1 au total, pas un par personne).\n` +
    `Méthode (utilise read_page, pas de screenshot sauf captcha) :\n` +
    open +
    `2. Deux pages possibles (tous les prix = TOTAL pour tous les passagers, taxes incluses ; « à partir de » = tarif Light, sans bagage en soute) :\n` +
    `   a) Titre « Calendrier » / « DATES DE VOYAGES » : grille ±3 jours départ × retour, tout est lisible directement.\n` +
    `   b) Titre « vols » : barre de 7 jours « à partir de » pour l'ALLER + liste des vols. ` +
    (tripDays ? `Les prix du RETOUR n'apparaissent qu'après avoir choisi un aller : clique le prix « Light » (sinon le moins cher) du vol aller le moins cher, ` +
      `wait 5, read_page → la barre de 7 jours du retour et ses vols s'affichent. Note les deux barres.\n` : `Note la barre.\n`) +
    `   Note les 3 ${tripDays ? 'combinaisons de dates' : 'dates'} les moins chères${month ? ' du mois' : ''}` +
    `${month && tripDays ? ` en gardant environ ${tripDays} jours sur place (prix aller du jour + prix retour du jour +${tripDays})` : ''}.\n` +
    `3. Sur la grille (a) : clique la combinaison la moins chère, puis CONTINUER. Sur la page « vols » (b) : clique le jour le moins cher dans la barre si besoin. Pour le vol le moins cher ${tripDays ? 'à l\'aller ET au retour' : ''} note : ` +
    `horaires, direct ou escale, prix « Light » et prix « Economique Promo » (prix avec réduction, totaux du groupe).\n` +
    `4. Calcul du bagage en plus : Light = 0 bagage en soute, Economique Promo = 1 × 23 kg par passager (les bébés ne comptent pas). Pour ${n > 1 ? `ce groupe de ${n} passagers avec siège` : 'ce passager'}, ` +
    (n > 1
      ? `le moins cher pour avoir UN seul bagage = ${n - 1} passager(s) en Light + 1 passager en Economique Promo (2 réservations séparées), ` +
        `soit par trajet ≈ prix Light du groupe + (prix Promo du groupe − prix Light du groupe) ÷ ${n}. Donne aussi le prix « tout le groupe en Economique Promo » ` +
        `(1 bagage chacun) pour comparer.\n`
      : `le prix avec bagage = prix Economique Promo.\n`) +
    `5. Ne clique sur rien d'autre qu'un tarif / CONTINUER sur la page des dates : ne va PAS jusqu'à la saisie des passagers, ne réserve rien, ne paie rien. ` +
    `Captcha ou page bloquée → ask_kouider.\n` +
    `Termine par done, en français, court : 🥇 meilleure option (dates, horaires, direct ou non) avec le PRIX TOTAL du groupe AVEC 1 bagage en soute ` +
    `(détail : prix Light sans bagage + supplément bagage), puis les 2 autres ${tripDays ? 'combinaisons de dates' : 'dates'} moins chères (prix Light du groupe), et ce que tu n'as pas pu vérifier. Monnaie : celle du site (€).`;

  const res = await browserTaskTool({ task }, sessionId);
  if (res.startsWith('⏳') || res.startsWith('❌')) return res;
  return `✈️ Recherche Air Algérie lancée sur le PC cloud : ${trip}, ${pax}, + 1 bagage en soute pour le groupe` +
    `${month ? '' : ', avec les dates à ±3 jours'}.${notes.length ? `\n⚠️ ${notes.join(' ; ')}.` : ''}\n` +
    `Je t'envoie le prix total sur Telegram dès que c'est fini${month ? ' (tout le mois : ~5 min)' : ''} ; tu peux regarder en direct : MON PC → PC cloud.`;
}
