import { randomUUID } from 'crypto';
import { browserTaskTool } from './browser-relay.js';
import { kvGet, kvSet } from './app-store.js';
import { emitProactive } from '../notifications/mobile-push.js';
import { API_BASE } from './client-sites.js';

// Recherche de vols AIR ALGÉRIE uniquement, dans le Chrome du PC cloud (browser_task) : aucune clé ni API.
// Règles fixes de Kouider (2026-10-20) : départ Lille → Oran par défaut. BAGAGES (précisé le 20/10 au soir) : 1 valise en
// soute PAR PERSONNE (tarif Economique Promo) + 1 bagage en soute ACHETÉ EN PLUS pour tout le groupe + 1 bagage à main par
// personne (2 adultes + 1 bébé → 4 en soute, 3 à main). Jamais de réservation ni de paiement.
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

/** GET /api/vol?f=LIL&t=ORN&d=AAAA-MM-JJ&r=AAAA-MM-JJ&a=2&c=0&i=0 → lien Air Algérie tout frais (celui du site expire). */
export async function airAlgerieLink(q: Record<string, unknown>): Promise<string> {
  const v = (k: string) => String(q[k] ?? '').trim();
  const iata = (x: string, d: string) => /^[A-Za-z]{3}$/.test(x) ? x.toUpperCase() : d;
  const num = (x: string, d: number) => /^\d$/.test(x) ? Number(x) : d;
  const depart = v('d'), ret = v('r');
  if (isDate(depart) && depart >= today() && (!ret || (isDate(ret) && ret >= depart))) {
    const u = await resultsUrl({ from: iata(v('f'), 'LIL'), to: iata(v('t'), 'ORN'), depart, ret,
      adults: Math.max(1, num(v('a'), 1)), children: num(v('c'), 0), infants: num(v('i'), 0) });
    if (u) return u;
  }
  return SITE;
}

export async function airAlgerieSearchTool(input: Record<string, unknown>, sessionId?: string, watchTag = ''): Promise<string> {
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

  const n = adults + children;   // passagers avec siège (tarif Economique Promo = 1 × 23 kg chacun)
  const persons = n + infants;     // Kouider compte une valise et un bagage à main par personne, bébé compris
  const hold = persons + 1, cabin = persons;
  const bags = `${hold} bagage${hold > 1 ? 's' : ''} en soute (1 par personne + 1 en plus pour le groupe) et ${cabin} bagage${cabin > 1 ? 's' : ''} à main`;
  const pax = [`${adults} adulte${adults > 1 ? 's' : ''}`,
    children ? `${children} enfant${children > 1 ? 's' : ''} (2-11 ans)` : '',
    infants ? `${infants} bébé${infants > 1 ? 's' : ''} (moins de 2 ans, sur les genoux)` : ''].filter(Boolean).join(', ');
  const trip = month
    ? `${tripDays ? `aller-retour (${tripDays} jours sur place)` : 'aller simple'} ${from} → ${to}, départ n'importe quel jour de ${MOIS[Number(month.slice(5)) - 1]} ${month.slice(0, 4)}`
    : ret ? `aller-retour ${from} → ${to}, aller le ${fr(depart)}, retour le ${fr(ret)}` : `aller simple ${from} → ${to} le ${fr(depart)}`;

  const watchHours = Math.round(Number(input['watch_hours'] ?? 0));
  if (watchHours > 0 && !watchTag) return startWatch(input, sessionId, watchHours, `${trip}, ${pax}`);

  const link = `${API_BASE()}/api/vol?f=${from}&t=${to}&a=${adults}&c=${children}&i=${infants}&d=AAAA-MM-JJ${tripDays ? '&r=AAAA-MM-JJ' : ''}`;
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
    `RECHERCHE DE VOL AIR ALGÉRIE (uniquement Air Algérie — jamais un comparateur ni une autre compagnie).${watchTag ? ' ' + watchTag : ''}\n` +
    `BUT : le vol direct LE MOINS CHER possible.\n` +
    `Vol : ${trip}. Passagers : ${pax} (catégories déjà réglées dans les liens, ne les change pas).\n` +
    `BAGAGES : 1 valise en soute PAR PERSONNE + 1 bagage en soute ACHETÉ EN PLUS pour tout le groupe + 1 bagage à main par personne → au total ${bags}.\n` +
    `VOLS DIRECTS SEULEMENT : ne propose QUE des vols directs sans escale (aller ET retour), le moins cher parmi eux. Un vol avec escale ne compte jamais, ` +
    `même moins cher. Attention : les prix « à partir de » des grilles/barres peuvent venir d'un vol avec escale — vérifie sur la page « vols » que le vol ` +
    `retenu est marqué « DIRECT » (et prends son prix à lui) ; un jour qui n'a que des vols avec escale est écarté.\n` +
    `Méthode (utilise read_page, pas de screenshot sauf captcha) :\n` +
    open +
    `2. Deux pages possibles (tous les prix = TOTAL pour tous les passagers, taxes incluses ; « à partir de » = tarif Light, sans bagage en soute) :\n` +
    `   a) Titre « Calendrier » / « DATES DE VOYAGES » : grille ±3 jours départ × retour, tout est lisible directement.\n` +
    `   b) Titre « vols » : barre de 7 jours « à partir de » pour l'ALLER + liste des vols. ` +
    (tripDays ? `Les prix du RETOUR n'apparaissent qu'après avoir choisi un aller : clique le prix « Light » (sinon le moins cher) du vol aller le moins cher, ` +
      `wait 5, read_page → la barre de 7 jours du retour et ses vols s'affichent. Note les deux barres.\n` : `Note la barre.\n`) +
    `   Note les 3 ${tripDays ? 'combinaisons de dates' : 'dates'} les moins chères${month ? ' du mois' : ''}` +
    `${month && tripDays ? ` en gardant environ ${tripDays} jours sur place (prix aller du jour + prix retour du jour +${tripDays})` : ''}.\n` +
    `3. Sur la grille (a) : clique la combinaison la moins chère, puis CONTINUER. Sur la page « vols » (b) : clique le jour le moins cher dans la barre si besoin. Pour le vol DIRECT le moins cher ${tripDays ? 'à l\'aller ET au retour' : ''} note : ` +
    `horaires, direct ou escale, prix « Light » et prix « Economique Promo » (prix avec réduction, totaux du groupe).\n` +
    `4. Calcul des bagages : Light = 0 bagage en soute, donc il faut le tarif Economique Promo (1 × 23 kg par passager) pour TOUT le groupe — c'est le prix de base. ` +
    (infants ? `Bébé : regarde ce que son billet inclut (franchise bébé, souvent 1 × 10 kg + poussette) ; s'il n'a pas de valise à lui, compte une valise de plus à acheter. ` : '') +
    `Puis le bagage en soute SUPPLÉMENTAIRE (1 pour le groupe) : il s'achète en option à la réservation ou après (« bagage supplémentaire », airalgerie.dz). ` +
    `Si le prix est affiché quelque part sans aller jusqu'aux passagers (page « Bagages » / « Franchise bagages » du site airalgerie.dz), note-le par trajet ; sinon écris « prix du bagage en plus non vérifié ».\n` +
    `5. Ne clique sur rien d'autre qu'un tarif / CONTINUER sur la page des dates : ne va PAS jusqu'à la saisie des passagers, ne réserve rien, ne paie rien. ` +
    `Captcha ou page bloquée → ask_kouider.\n` +
    `6. Juste avant done : reviens sur la page de la MEILLEURE option et laisse-y le vol aller proposé sélectionné (tarif Light cliqué) avec les vols retour visibles — ` +
    `une capture de cette page est envoyée à Kouider sur Telegram.\n` +
    `Termine par done, en français, avec EXACTEMENT cette fiche (texte simple, sans ** ni #, une info par ligne ; « non vérifié » si tu ne l'as pas vue) :\n` +
    `🎫 FICHE BILLET — Air Algérie, vols directs\n` +
    `✈️ Trajet : ${from} → ${to}, ${tripDays ? 'aller-retour' : 'aller simple'}\n` +
    `👥 Passagers : ${pax}\n` +
    `🧳 Bagages : ${bags} — <franchise exacte : kg en soute par passager, kg du bagage à main, bébé>\n` +
    `🛫 Aller : <jour JJ/MM/AAAA>, <départ HH:MM> → <arrivée HH:MM>, vol <n° AH…>, direct, <durée>\n` +
    (tripDays ? `🛬 Retour : <jour JJ/MM/AAAA>, <départ HH:MM> → <arrivée HH:MM>, vol <n° AH…>, direct, <durée>\n` +
      `🗓️ Séjour : <nb> jours sur place\n` : '') +
    `💶 PRIX TOTAL AVEC BAGAGES : <montant> €\n` +
    `   Détail : tout le groupe en Economique Promo (1 valise chacun) <montant> € + 1 bagage en plus <montant> € par trajet (ou « non vérifié »)\n` +
    `   Pour info, sans aucune valise (Light) : <montant> €\n` +
    `🔗 Voir et réserver sur Air Algérie : ${link}  (remplace AAAA-MM-JJ par la date ${tripDays ? 'aller puis la date retour' : 'aller'} de la meilleure option)\n` +
    `💡 Autres dates moins chères : <les 2 suivantes, dates + prix Light du groupe>\n` +
    `⚠️ Non vérifié : <ce que tu n'as pas pu vérifier, ou « rien »>\n` +
    `Monnaie : celle du site (€). Tous les prix = total du groupe, taxes incluses.`;

  const res = await browserTaskTool({ task }, sessionId);
  if (res.startsWith('⏳') || res.startsWith('❌')) return res;
  return `✈️ Recherche Air Algérie lancée sur le PC cloud : ${trip}, ${pax}, ${bags}` +
    `${month ? '' : ', avec les dates à ±3 jours'}.${notes.length ? `\n⚠️ ${notes.join(' ; ')}.` : ''}\n` +
    `Je t'envoie le prix total + une capture du site sur Telegram dès que c'est fini${month ? ' (tout le mois : ~5 min)' : ''} ; tu peux regarder en direct : MON PC → PC cloud.`;
}

// ── Surveillance : « surveille pendant 3 jours / 1 semaine / 12 heures » ─────────────────────────────
// La même recherche est relancée toutes les every_hours jusqu'à la fin (job « flight-watch »). Kouider n'est
// prévenu (Telegram + app) qu'au 1er prix, quand le prix baisse, et à la fin (meilleur prix vu). app_kv `flight:watches`.
interface FlightWatch {
  id: string; label: string; input: Record<string, unknown>; sessionId?: string;
  created_at: string; until: string; every_h: number; next_at: string; runs: number;
  status: 'active' | 'done' | 'stopped';
  best?: { price: number; at: string }; last_price?: number;
  // La nuit (22h-7h, Paris) : on cherche sans déranger, et à 7h une recherche fraîche + récap de la nuit
  night?: { runs: number; first?: number; low?: number; final?: boolean }; morning?: boolean;
}
const parisHour = () => Number(new Date().toLocaleString('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', hour12: false }));
const isNight = () => { const h = parisHour(); return h >= 22 || h < 7; };
const WKEY = 'flight:watches';
async function loadWatches(): Promise<FlightWatch[]> {
  try { return JSON.parse((await kvGet(WKEY)) ?? '[]') as FlightWatch[]; } catch { return []; }
}
const saveWatches = (l: FlightWatch[]) => kvSet(WKEY, JSON.stringify(l.slice(-20)));
const tagOf = (id: string) => `[SURVEILLANCE ${id}]`;
const euro = (x: number) => x.toFixed(2).replace('.', ',') + ' €';
const whenFr = (iso: string) => new Date(iso).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/** Prix de la fiche (« PRIX TOTAL AVEC BAGAGES : 403,20 € », anciennes fiches « AVEC 1 BAGAGE ») → 403.2 */
export function fichePrice(text: string): number | null {
  const m = /PRIX TOTAL AVEC (?:1 )?BAGAGES?\s*:\s*([\d\s .,]+)\s*€/i.exec(text);
  if (!m) return null;
  const x = Number(m[1].replace(/[\s ]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.'));
  return Number.isFinite(x) && x > 0 ? x : null;
}

async function startWatch(input: Record<string, unknown>, sessionId: string | undefined, hours: number, label: string): Promise<string> {
  if (hours > 24 * 60) return '❌ Surveillance : 60 jours maximum.';
  // Fréquence par défaut : toutes les 2 h sur une journée, 6 h sur une semaine, 12 h au-delà (chaque recherche coûte des crédits Claude)
  const every = Math.max(1, Math.round(Number(input['every_hours'] ?? 0)) || (hours <= 24 ? 2 : hours <= 24 * 7 ? 6 : 12));
  const list = await loadWatches();
  if (list.filter(w => w.status === 'active').length >= 3) return '❌ Déjà 3 surveillances de vols en cours : arrête-en une d\'abord (air_algerie_watch stop).';
  const now = new Date();
  const { watch_hours: _h, every_hours: _e, ...search } = input;
  const w: FlightWatch = { id: randomUUID().slice(0, 6), label, input: search, sessionId, created_at: now.toISOString(),
    until: new Date(now.getTime() + hours * 3_600_000).toISOString(), every_h: every, next_at: now.toISOString(), runs: 0, status: 'active' };
  list.push(w); await saveWatches(list);
  const first = await runWatch(w);
  await saveWatches((await loadWatches()).map(x => x.id === w.id ? w : x));
  const runs = Math.max(1, Math.ceil(hours / every));
  return `👀 Surveillance Air Algérie lancée (n° ${w.id}) : ${label}, 1 valise par personne + 1 bagage en plus, vols directs.\n` +
    `Je refais la recherche toutes les ${every} h jusqu'au ${whenFr(w.until)} (≈ ${runs} recherche${runs > 1 ? 's' : ''}). ` +
    `Je t'envoie la fiche du 1er prix, puis je ne te préviens que si le prix BAISSE, et à la fin le meilleur prix vu. ` +
    `La nuit (22h-7h) je cherche sans te déranger, et à 7h je t'envoie le récap de la nuit avec le vol le moins cher du moment.` +
    (first ? '' : '\n⏳ Le navigateur est occupé : la 1re recherche part dans quelques minutes.');
}

/** Lance une recherche de la surveillance ; false si le navigateur est occupé (on réessaie au prochain passage). */
async function runWatch(w: FlightWatch): Promise<boolean> {
  const r = await airAlgerieSearchTool(w.input, w.sessionId, tagOf(w.id));
  if (r.startsWith('⏳')) return false;
  if (r.startsWith('❌') || r.startsWith('❓')) {
    w.status = 'stopped';
    emitProactive('✈️ Surveillance arrêtée', 'alert', `✈️ Surveillance Air Algérie ${w.label} arrêtée : ${r}`);
    return true;
  }
  w.runs++;
  w.next_at = new Date(Date.now() + w.every_h * 3_600_000).toISOString();
  return true;
}

/** Job toutes les 10 min : relance les surveillances dues. */
export async function jobFlightWatch(): Promise<void> {
  const list = await loadWatches();
  const now = new Date().toISOString();
  let changed = false;
  const h = parisHour();
  for (const w of list) {
    if (w.status !== 'active') continue;
    if (w.night && !w.morning && h >= 7 && h < 12) {
      // 7h : recherche fraîche, son résultat part avec le récap de la nuit
      if (await runWatch(w)) w.morning = true;
      changed = true; break;
    }
    if (w.next_at > now || w.morning) continue;
    if (w.next_at >= w.until && !w.night) { w.status = 'done'; changed = true; continue; }   // filet : la dernière recherche n'a jamais répondu
    if (w.next_at >= w.until) continue;   // fin pendant la nuit : on attend le récap de 7h
    await runWatch(w); changed = true;
    break;   // une seule recherche à la fois (un seul navigateur)
  }
  if (changed) await saveWatches(list);
}

/** Fin d'une recherche (appelé par browser-relay) → décide si on prévient Kouider, et avec quel texte. */
export async function flightSearchDone(task: string, text: string): Promise<{ notify: boolean; text: string }> {
  const id = /\[SURVEILLANCE (\w+)\]/.exec(task)?.[1];
  if (!id) return { notify: true, text };
  const list = await loadWatches();
  const w = list.find(x => x.id === id);
  if (!w) return { notify: true, text };
  const price = fichePrice(text);
  let final = w.status === 'active' && w.next_at >= w.until;
  const prevBest = w.best?.price;
  if (price) { w.last_price = price; if (!prevBest || price < prevBest) w.best = { price, at: new Date().toISOString() }; }
  if (w.status === 'active' && !w.morning && isNight()) {
    // Nuit : on note sans prévenir (récap à 7h)
    const n = w.night ?? { runs: 0 };
    n.runs++;
    if (price) { n.first ??= prevBest ?? price; n.low = Math.min(n.low ?? price, price); }
    if (final) n.final = true;
    w.night = n;
    await saveWatches(list);
    return { notify: false, text };
  }
  let head = '';
  if (w.morning) {
    const n = w.night ?? { runs: 0 };
    final = final || !!n.final;
    const low = Math.min(n.low ?? Infinity, price ?? Infinity);
    head = `🌅 Récap de la nuit — surveillance Air Algérie : ${n.runs} recherche${n.runs > 1 ? 's' : ''} pendant la nuit` +
      (n.first && Number.isFinite(low) ? `, prix ${euro(n.first)} hier soir → ${price ? euro(price) : '?'} ce matin, le plus bas vu cette nuit : ${euro(low)}` : '') +
      (price && n.first ? (price < n.first ? ` 📉 (−${euro(n.first - price)})` : price > n.first ? ` 📈 (+${euro(price - n.first)})` : ' (pas de changement)') : '') +
      `.${final ? ` C'était la dernière recherche — meilleur prix vu sur toute la surveillance : ${w.best ? euro(w.best.price) : '?'}.` : ''}\nLe vol le moins cher ce matin :\n`;
    w.night = undefined; w.morning = false;
    if (final) w.status = 'done';
  } else if (final || w.status !== 'active') {
    w.status = w.status === 'active' ? 'done' : w.status;
    head = `🏁 Fin de la surveillance Air Algérie (${w.runs} recherche${w.runs > 1 ? 's' : ''}) — ` +
      (w.best ? `meilleur prix vu : ${euro(w.best.price)} (${whenFr(w.best.at)})` : 'aucun prix trouvé') + `.\nDernier relevé :\n`;
  } else if (price && !prevBest) {
    head = `👀 Surveillance Air Algérie — 1er prix. Je te repréviens seulement s'il baisse (jusqu'au ${whenFr(w.until)}, toutes les ${w.every_h} h).\n`;
  } else if (price && prevBest && price < prevBest) {
    head = `📉 PRIX EN BAISSE : ${euro(price)} au lieu de ${euro(prevBest)} (−${euro(prevBest - price)}) !\n`;
  }
  await saveWatches(list);
  return head ? { notify: true, text: head + text } : { notify: false, text };
}

export async function airAlgerieWatchTool(input: Record<string, unknown>): Promise<string> {
  const list = await loadWatches();
  const action = String(input['action'] ?? 'list');
  if (action === 'stop') {
    const id = String(input['id'] ?? '').trim();
    const act = list.filter(w => w.status === 'active' && (!id || w.id === id || id === 'all'));
    if (!act.length) return 'Aucune surveillance de vol en cours.';
    if (act.length > 1 && !id) return `Laquelle arrêter ? ${act.map(w => `n° ${w.id} (${w.label})`).join(' ; ')} — ou id « all ».`;
    act.forEach(w => { w.status = 'stopped'; });
    await saveWatches(list);
    return `🛑 Surveillance arrêtée : ${act.map(w => `${w.label}${w.best ? ` — meilleur prix vu ${euro(w.best.price)}` : ''}`).join(' ; ')}.`;
  }
  const act = list.filter(w => w.status === 'active');
  if (!act.length) return 'Aucune surveillance de vol en cours.';
  return act.map(w => `👀 n° ${w.id} : ${w.label} — toutes les ${w.every_h} h jusqu'au ${whenFr(w.until)}, ${w.runs} recherche(s), ` +
    `${w.best ? `meilleur prix ${euro(w.best.price)}, dernier ${euro(w.last_price ?? w.best.price)}` : 'pas encore de prix'}, prochaine ${whenFr(w.next_at)}.`).join('\n');
}
