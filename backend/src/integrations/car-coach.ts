import { kvJson, kvPut, ai } from './ai-util.js';
import { localNow } from './morning-routine.js';

// 🚗 « BONJOUR KOUIDER » EN MONTANT EN VOITURE (Kouider 02/11) : à chaque fois que CarPlay se branche, son coach de vie
// lui dit bonjour, lui fait un court discours de motivation BUSINESS, puis une citation — avant le point pratique (trajet,
// clients…). Citations : uniquement des phrases vérifiées avec leur vraie source (jamais de citation « Internet » douteuse).

export const QUOTES: Array<{ q: string; who: string; src: string }> = [
  { q: 'Avec la difficulté vient la facilité.', who: 'le Coran', src: 'sourate 94, verset 6' },
  { q: 'Allah n\'impose à aucune âme une charge supérieure à sa capacité.', who: 'le Coran', src: 'sourate 2, verset 286' },
  { q: 'Attache ton chameau, puis place ta confiance en Dieu.', who: 'le Prophète, paix sur lui', src: 'hadith rapporté par At-Tirmidhi' },
  { q: 'Le prix, c\'est ce que tu paies. La valeur, c\'est ce que tu obtiens.', who: 'Warren Buffett', src: 'lettre aux actionnaires de Berkshire Hathaway, 2008' },
  { q: 'Règle numéro un : ne jamais perdre d\'argent. Règle numéro deux : ne jamais oublier la règle numéro un.', who: 'Warren Buffett', src: 'citée dans ses interviews et biographies' },
  { q: 'Il faut vingt ans pour bâtir une réputation et cinq minutes pour la détruire.', who: 'Warren Buffett', src: 'citée par Berkshire Hathaway' },
  { q: 'Quelqu\'un est assis à l\'ombre aujourd\'hui parce que quelqu\'un a planté un arbre il y a longtemps.', who: 'Warren Buffett', src: 'citée dans sa biographie « The Snowball »' },
  { q: 'Le gros argent ne se fait pas en achetant ou en vendant, mais en attendant.', who: 'Charlie Munger', src: 'associé de Warren Buffett' },
  { q: 'Reste affamé, reste fou.', who: 'Steve Jobs', src: 'discours de Stanford, 2005' },
  { q: 'Ton temps est limité, ne le gâche pas à vivre la vie de quelqu\'un d\'autre.', who: 'Steve Jobs', src: 'discours de Stanford, 2005' },
  { q: 'La moitié de ce qui sépare les entrepreneurs qui réussissent des autres, c\'est la persévérance pure.', who: 'Steve Jobs', src: 'interview Computerworld, 1995' },
  { q: 'Fais une offre tellement bonne que les gens se sentent bêtes de dire non.', who: 'Alex Hormozi', src: 'livre « $100M Offers »' },
  { q: 'Douleur plus réflexion égale progrès.', who: 'Ray Dalio', src: 'livre « Principes »' },
  { q: 'Les lâches ne sont jamais partis, les faibles sont morts en chemin. Il ne reste que nous.', who: 'Phil Knight, fondateur de Nike', src: 'livre « L\'art de la victoire » (Shoe Dog)' },
  { q: 'Apprends à vendre. Apprends à construire. Si tu sais faire les deux, tu seras inarrêtable.', who: 'Naval Ravikant', src: 'publié en 2018' },
  { q: 'La concurrence, c\'est pour les perdants.', who: 'Peter Thiel', src: 'Wall Street Journal, 2014' },
  { q: 'Ce n\'est pas parce que les choses sont difficiles que nous n\'osons pas, c\'est parce que nous n\'osons pas qu\'elles sont difficiles.', who: 'Sénèque', src: 'Lettres à Lucilius, lettre 104' },
  { q: 'Ce qui fait obstacle à l\'action fait avancer l\'action. Ce qui barre la route devient la route.', who: 'Marc Aurèle', src: 'Pensées, livre 5' },
  { q: 'Si tu n\'es pas têtu, tu abandonnes trop tôt. Si tu n\'es pas flexible, tu te cognes la tête contre le mur.', who: 'Jeff Bezos', src: 'assemblée des actionnaires d\'Amazon, 2011' },
  { q: 'Il n\'y a qu\'un seul patron : le client. Il peut licencier tout le monde dans l\'entreprise, du président jusqu\'en bas, simplement en dépensant son argent ailleurs.', who: 'Sam Walton, fondateur de Walmart', src: 'citée par Walmart' },
];

// 02/11 : dans la voiture = philosophie, business, sport, avenir en Algérie… tout SAUF médicament / Liberté.
const THEMES = [
  'business : FIK, ses clients, une priorité concrète du jour',
  'philosophie stoïque appliquée à sa journée (Marc Aurèle, Sénèque)',
  'sport et discipline : le corps qu\'il forge, la régularité',
  'son AVENIR EN ALGÉRIE : la maison à Oran, s\'installer là-bas avec sa femme et Ibrahim, chaque jour en Belgique le rapproche du retour',
  'devenir un grand businessman en Algérie : la vision à 5 ans',
  'être un père et un mari solide : ce qu\'il construit pour sa femme et Ibrahim',
];

const REBOOST = [
  'Content de vous revoir à bord. Chaque trajet vous rapproche d\'Oran, monsieur. On continue.',
  'De retour aux commandes. Les grands ne s\'arrêtent pas au premier effort, ils enchaînent. Allons-y.',
  'Encore un trajet, encore un pas. La régularité bat le talent, et vous avez les deux.',
  'Tous les systèmes sont toujours opérationnels. Votre famille compte sur l\'homme que vous devenez aujourd\'hui.',
  'Vous êtes déjà en mouvement, c\'est ce qui sépare ceux qui rêvent de ceux qui construisent.',
];

const LAST_K = 'car:greet:last', USED_K = 'car:quotes:used';

// 04/11 (2) Kouider après l'exemple : « le truc sur le Coran c'est incroyable, c'est magique, il faut qu'il fasse ça à
// chaque fois, et qu'il récite la sourate pour nous protéger sur la route ». → à CHAQUE démarrage : le verset du jour
// (sens en français dit par Jarvis, puis la VRAIE récitation de Mishary Alafasy) + l'invocation du voyage
// (sourate 43, versets 13-14). Versets courts uniquement (la récitation suit), traductions de sens (Hamidullah).
export const VERSES: Array<{ a: string; fr: string; ref: string; courage?: boolean }> = [
  { a: '094005,094006', fr: 'À côté de la difficulté est, certes, une facilité. À côté de la difficulté, est certes une facilité.', ref: 'sourate 94, versets 5 et 6', courage: true },
  { a: '093003', fr: 'Ton Seigneur ne t\'a ni abandonné, ni détesté.', ref: 'sourate 93, verset 3', courage: true },
  { a: '093004,093005', fr: 'La vie dernière t\'est, certes, meilleure que la vie présente. Ton Seigneur t\'accordera certes Ses faveurs, et alors tu seras satisfait.', ref: 'sourate 93, versets 4 et 5', courage: true },
  { a: '053039', fr: 'Et qu\'en vérité, l\'homme n\'obtient que le fruit de ses efforts.', ref: 'sourate 53, verset 39' },
  { a: '094007,094008', fr: 'Quand tu te libères, donc, lève-toi. Et à ton Seigneur, aspire.', ref: 'sourate 94, versets 7 et 8' },
  { a: '002153', fr: 'Ô les croyants, cherchez secours dans l\'endurance et la prière. Car Allah est avec ceux qui sont endurants.', ref: 'sourate 2, verset 153', courage: true },
  { a: '003139', fr: 'Ne vous laissez pas abattre, ne vous affligez pas, alors que vous êtes les supérieurs, si vous êtes de vrais croyants.', ref: 'sourate 3, verset 139', courage: true },
  { a: '013028', fr: 'Ceux qui ont cru, et dont les cœurs se tranquillisent à l\'évocation d\'Allah. N\'est-ce point par l\'évocation d\'Allah que se tranquillisent les cœurs ?', ref: 'sourate 13, verset 28', courage: true },
  { a: '029069', fr: 'Et quant à ceux qui luttent pour Notre cause, Nous les guiderons certes sur Nos sentiers. Et Allah est en vérité avec les bienfaisants.', ref: 'sourate 29, verset 69' },
  { a: '003200', fr: 'Ô les croyants, soyez endurants, incitez-vous à l\'endurance, luttez constamment, et craignez Allah, afin que vous réussissiez.', ref: 'sourate 3, verset 200' },
];
const VUSED_K = 'car:verses:used', PUSED_K = 'car:protect:n';
// 04/11 (3) Kouider : « faut que la sourate change à chaque fois » → le verset suit un CYCLE (jamais deux fois le même
// avant d'avoir fait tout le tour) et la récitation de protection tourne aussi : invocation du voyage, Al-Falaq,
// An-Nas, Ayat al-Kursi.
const PROTECT: Array<{ a: string; say: string }> = [
  { a: '043013,043014', say: 'l\'invocation du voyage : « Gloire à Celui qui nous a soumis tout cela, alors que nous n\'étions pas capables de le dominer. Et c\'est vers notre Seigneur que nous retournerons. » Sourate 43' },
  { a: '113001,113002,113003,113004,113005', say: 'la sourate Al-Falaq, l\'Aube naissante : « Dis : je cherche protection auprès du Seigneur de l\'aube naissante, contre le mal de ce qu\'Il a créé. »' },
  { a: '114001,114002,114003,114004,114005,114006', say: 'la sourate An-Nas, les Hommes : « Dis : je cherche protection auprès du Seigneur des hommes, le Souverain des hommes, Dieu des hommes. »' },
  { a: '002255', say: 'Ayat al-Kursi, le verset du Trône : « Allah, point de divinité à part Lui, le Vivant, Celui qui subsiste par Lui-même. Ni somnolence ni sommeil ne Le saisissent. »' },
];
/** Fin de chaque démarrage : verset du jour + récitation de protection, annoncés et traduits, puis les vraies récitations
 *  ([[Q:…]] → jarvis-audio.ts les joue après la voix, dans l'ordre). Aussi dit tel quel par « Énoncer » (sans [[ ]]). */
export async function carBlessing(courage = false): Promise<string> {
  const used = await kvJson<number[]>(VUSED_K, []);
  const all = VERSES.map((_, i) => i).filter(i => !courage || VERSES[i]!.courage);
  const last = used.at(-1);
  let free = all.filter(i => !used.includes(i));
  if (!free.length) free = all.filter(i => i !== last);           // tour complet fait → on recommence, sans répéter le dernier
  const i = free[Math.floor(Math.random() * free.length)]!;
  await kvPut(VUSED_K, (all.every(k => used.includes(k)) ? [] : used).concat(i).slice(-VERSES.length));
  const pn = await kvJson<number>(PUSED_K, 0);
  await kvPut(PUSED_K, pn + 1);
  const pr = PROTECT[pn % PROTECT.length]!;
  const v = VERSES[i]!;
  return `Pour la route, le verset du jour : « ${v.fr} » Le Coran, ${v.ref}. Et pour votre protection, ${pr.say}. Je reste en veille, dites simplement : « Dis Siri, Jarvis ». Écoutez. [[Q:${v.a}]] [[Q:${pr.a}]]`;
}

// 04/11 (3) : « le lundi après le sport et le jeudi après le travail, je ne suis pas seul, je suis avec ma femme et mon fils »
// → MODE FAMILLE : bonjour à tous, heure, météo, et la protection — aucun discours business, aucun point travail/clients.
export async function isFamilyRide(_homeward: boolean): Promise<boolean> {
  const { weekday, hhmm } = localNow();
  if (weekday === 1) {
    const { getRoutineConfig } = await import('./morning-routine.js');
    const end = (await getRoutineConfig().catch(() => null))?.days?.[1]?.sport?.[1] ?? '08:50';
    const [h, m] = end.split(':').map(Number);
    const t = `${String(Math.floor(((h! * 60 + m!) - 15) / 60)).padStart(2, '0')}:${String(((h! * 60 + m!) - 15) % 60).padStart(2, '0')}`;
    return hhmm >= t && hhmm < '23:00';                           // lundi : dès la fin de la séance (le retour de la salle compris)
  }
  if (weekday === 4) return hhmm >= '13:30' && hhmm < '23:00';     // jeudi : à partir de 13h30 (Kouider 04/11), même s'il part plus tôt
  return false;
}
export async function familyGreeting(): Promise<string> {
  const { hhmm } = localNow();
  const h = Number(hhmm.slice(0, 2));
  const loc = await import('./location.js').then(m => m.getLocation('kouider')).catch(() => null);
  const meteo = loc ? await import('./forme-runs-pro.js').then(m => m.weatherAt(loc.lat, loc.lng, Date.now())).catch(() => null) : null;
  const time = `Il est ${hhmm.replace(':', ' heures ').replace(/ 00$/, '')}`;
  const weather = meteo ? `, ${Math.round(meteo.temp)} degrés dehors, ${meteo.label.toLowerCase()}${meteo.rain ? ', prudence sur la route' : ''}` : '';
  return `${h < 5 || h >= 18 ? 'Bonsoir' : 'Bonjour'} à toute la famille. ${time}${weather}. Protocole famille activé : aujourd'hui, rien d'autre ne compte que vous trois. Profitez de ce moment ensemble.`;
}

// 04/11 « encore plus fou, plus futuriste, style Jarvis même en mieux » : séquence de démarrage dite AVANT le bonjour
// (le son de démarrage est ajouté par jarvis-audio.ts). Vraie, jamais inventée : il synchronise vraiment ces données.
const BOOTS = [
  'Dzaryx en ligne. Liaison avec l\'Audi établie. Météo, trafic, agenda et flotte synchronisés.',
  'Initialisation terminée. Habitacle connecté, toutes vos données sont à jour.',
  'Systèmes de bord en ligne. Je viens de tout analyser pour vous : agenda, route, clients.',
  'Connexion établie. Votre copilote est réveillé, et il a déjà lu votre journée.',
];
export function bootLine(mode: 'retour' | 'famille' | 'douceur' | 'jumua' | 'matin' | 'mission'): string {
  const p = { retour: 'Protocole retour au foyer activé.', famille: 'Protocole famille activé.', douceur: 'Protocole journée douce activé.', jumua: 'Protocole vendredi activé. Jumu\'a moubaraka, monsieur.', matin: 'Protocole mission du matin activé.', mission: 'Protocole mission activé.' }[mode];
  return `${BOOTS[Math.floor(Math.random() * BOOTS.length)]} ${p}`;
}

// 03/11 : en RENTRANT à la maison il lui donnait encore « des trucs à faire avant 12 h ». Kouider : « là je rentre, je me
// repose jusqu'à demain, il doit me dire tu as tenu le coup, tu as passé le pire — le pire dans ma vie c'est le travail où
// je suis et le pays où je suis, il doit trouver un truc pour me donner du courage ». → mode RETOUR : zéro tâche, du courage.
const COURAGE_QUOTES = [0, 1, 2, 6, 13, 16, 17];   // indices dans QUOTES : patience, épreuve, persévérance

/** Il rentre chez lui ? Après 11 h, pas déjà à la maison, et (près du travail OU plus aucune étape réelle dans les 4 h
 *  hors « Maison »). Sans position fraîche : après 11 h et rien de prévu → retour aussi. */
export async function isHomeward(pos: { lat?: number; lng?: number } = {}): Promise<boolean> {
  const h = Number(localNow().hhmm.slice(0, 2));
  if (h < 11 || h >= 23) return false;
  let here: { lat: number; lng: number } | null = Number.isFinite(pos.lat) && pos.lat ? { lat: pos.lat!, lng: pos.lng! } : null;
  if (!here) { const loc = await import('./location.js').then(m => m.getLocation('kouider')).catch(() => null); if (loc && Date.now() - Date.parse(loc.updated_at) < 2 * 3600_000) here = { lat: loc.lat, lng: loc.lng }; }
  const [{ geocode }, { getRoutineConfig }, { haversine }] = await Promise.all([import('./departures.js'), import('./morning-routine.js'), import('./forme-runs.js')]);
  const a = (await getRoutineConfig()).addresses;
  const [home, work] = await Promise.all([geocode(a.home).catch(() => null), geocode(a.work).catch(() => null)]);
  const dist = (p: { lat: number; lng: number } | null) => (here && p ? haversine([here.lat, here.lng], [p.lat, p.lng]) : Infinity);
  if (dist(home) < 600) return false;                      // déjà devant chez lui : il part, il ne rentre pas
  if (dist(work) < 2500) return true;                      // il quitte le boulot
  const evs = await import('./google-calendar.js').then(m => m.listAgendaRange(new Date().toISOString(), new Date(Date.now() + 4 * 3600_000).toISOString())).catch(() => null);
  const real = ((evs ?? []) as Array<{ summary?: string; start?: { dateTime?: string } }>)
    .filter(e => !/libre|rdv possibles|disponible|🏠|maison|repos|famille|dîner|diner|repas/i.test(e.summary ?? '') && (!e.start?.dateTime || Date.parse(e.start.dateTime) > Date.now()));
  return real.length === 0;
}

/** Discours du RETOUR : il a tenu, le plus dur de la journée est derrière lui ; le boulot et l'exil en Belgique sont
 *  une étape, pas sa vie — courage, sens (Oran, sa femme, Ibrahim), repos mérité. Aucune tâche, aucun « avant midi ». */
async function homewardSpeech(hello: string, time: string, weather: string): Promise<string> {
  const used = await kvJson<number[]>(USED_K, []);
  const pool = COURAGE_QUOTES.filter(i => !used.slice(-4).includes(i));
  const qi = (pool.length ? pool : COURAGE_QUOTES)[Math.floor(Math.random() * (pool.length || COURAGE_QUOTES.length))]!;
  await kvPut(USED_K, used.concat(qi).slice(-QUOTES.length + 1));
  const quote = QUOTES[qi]!;
  const speech = await ai(`Tu es JARVIS, l'intelligence artificielle majordome de Kouider (comme le Jarvis d'Iron Man) : voix calme, chaleureuse, VOUVOIEMENT, phrases élégantes. Kouider vient de finir sa journée de travail et RENTRE CHEZ LUI se reposer jusqu'à demain. Tu lui as déjà dit bonjour, l'heure et la météo.
Dis-lui un discours de COURAGE de 4 à 5 phrases (25 secondes à l'oral), sincère, qui touche le cœur :
- il a TENU LE COUP aujourd'hui, le plus dur de la journée est derrière lui, il peut relâcher maintenant ;
- ce qui lui pèse le plus dans sa vie aujourd'hui, c'est ce travail et ce pays (la Belgique, loin de l'Algérie) : reconnais-le avec respect, sans le juger ni minimiser ; ce travail et cet exil sont une ÉTAPE, un passage, pas sa vie — chaque journée tenue est une brique de la maison à Oran, de sa liberté future, de la vie qu'il prépare pour sa femme et Ibrahim ;
- trouve UNE image forte et nouvelle pour lui donner du courage (ex. le marin qui traverse la tempête, la graine sous la neige, l'athlète dans le dernier kilomètre, l'homme qui porte sa famille sur le dos et ne plie pas…) ;
- termine en douceur : ce soir c'est repos, sa famille, il l'a mérité ; demain il repart plus fort. Dernière phrase qui réchauffe.
⛔ INTERDIT : toute tâche, tout « avant midi », tout client à rappeler, tout chiffre à faire, toute action — c'est l'heure du repos. ⛔ Jamais médicament, pharmacie, santé, sevrage, programme Liberté (privé).
Ne redis pas bonjour, ni son prénom en premier mot. Pas d'emoji, pas de liste, pas de citation ni de verset (le verset vient après). N'invente aucun fait.`, { max: 450, emergency: 'voix' }).catch(() => '');
  const fallback = 'Journée accomplie, monsieur. Vous avez tenu, encore une fois, et le plus dur est derrière vous. Ce travail et ce pays ne sont qu\'une étape : chaque jour que vous tenez ici pose une pierre de votre maison à Oran. Ce soir, rien à faire, seulement vous reposer auprès des vôtres. Vous l\'avez mérité.';
  const { carPrivacy } = await import('./jarvis4.js');
  void quote;
  return [`${hello} ${time}${weather}.`, carPrivacy(speech || '') || fallback, 'Rien d\'autre à faire aujourd\'hui. Reposez-vous, bonne route jusqu\'à la maison.'].join(' ');
}

export async function pickQuote() {   // citations business : gardées pour d'autres usages
  const used = await kvJson<number[]>(USED_K, []);
  const free = QUOTES.map((_, i) => i).filter(i => !used.includes(i));
  const pool = free.length ? free : QUOTES.map((_, i) => i);
  const i = pool[Math.floor(Math.random() * pool.length)]!;
  await kvPut(USED_K, (free.length ? used : []).concat(i).slice(-QUOTES.length + 1));
  return QUOTES[i]!;
}

/** Style JARVIS (Kouider 02/11 : « je veux qu'il me parle comme le vrai Jarvis ») : majordome IA calme, précis, élégant,
 *  vouvoiement, une pointe d'humour — heure, météo réelle, état de la journée, puis motivation business et citation.
 *  Court si déjà dit il y a moins de 30 min (arrêt rapide). */
export async function carGreeting(pos: { lat?: number; lng?: number } = {}, homeward = false): Promise<string> {
  const { hhmm } = localNow();
  const h = Number(hhmm.slice(0, 2));
  const hello = h < 5 || h >= 18 ? 'Bonsoir Kouider.' : 'Bonjour Kouider.';
  const last = await kvJson<number>(LAST_K, 0);
  if (Date.now() - last < 30 * 60_000) {
    // 02/11 : même un 2e démarrage = un coup de motivation (Kouider : « il doit aussi me donner des discours motivants »)
    if (homeward) return 'Re-bonjour Kouider. Cap sur la maison, monsieur. La journée est faite, vous avez tenu, le reste peut attendre demain.';
    const pep = REBOOST[Math.floor(Math.random() * REBOOST.length)]!;
    return `Re-bonjour Kouider. ${pep}`;
  }
  await kvPut(LAST_K, Date.now());
  let here: { lat: number; lng: number } | null = Number.isFinite(pos.lat) && pos.lat ? { lat: pos.lat!, lng: pos.lng! } : null;
  if (!here) { const loc = await import('./location.js').then(m => m.getLocation('kouider')).catch(() => null); if (loc && Date.now() - Date.parse(loc.updated_at) < 6 * 3600_000) here = { lat: loc.lat, lng: loc.lng }; }
  const [, off, hard, coach, meteo] = await Promise.all([
    Promise.resolve(null),
    import('./kouider-dossier.js').then(m => m.isDayOff()).catch(() => false),
    import('./kouider-dossier.js').then(m => m.isHardDay()).catch(() => false),
    import('./grand-coach.js').then(m => m.grandCoachText()).catch(() => ''),
    here ? import('./forme-runs-pro.js').then(m => m.weatherAt(here!.lat, here!.lng, Date.now())).catch(() => null) : Promise.resolve(null),
  ]);
  const time = `Il est ${hhmm.replace(':', ' heures ').replace(/ 00$/, '')}`;
  const weather = meteo ? `, ${Math.round(meteo.temp)} degrés dehors, ${meteo.label.toLowerCase()}${meteo.rain ? ', prudence sur la route' : ''}` : '';
  const boot = bootLine(homeward ? 'retour' : hard ? 'douceur' : off ? 'famille' : new Date().getUTCDay() === 5 && h < 14 ? 'jumua' : h < 12 ? 'matin' : 'mission');
  if (homeward) return `${boot} ${await homewardSpeech(hello, time, weather)}`;
  const tone = hard ? 'Il a demandé une JOURNÉE DURE : doux, rassurant, aucune pression business.'
    : off ? 'Jour de congé (famille) : rappelle le sens de ce qu\'il construit (sa femme, Ibrahim, leur avenir en Algérie), sans lui donner de travail.'
    : 'Journée de travail : motive-le sur son business (FIK, ses clients, son objectif du mois, devenir un grand businessman en Algérie) avec UNE priorité concrète pour aujourd\'hui.';
  const speech = await ai(`Tu es JARVIS, l'intelligence artificielle majordome de Kouider (comme le Jarvis d'Iron Man) : voix calme, phrases précises et élégantes, VOUVOIEMENT, assurance tranquille, une petite pointe d'humour fin. Kouider vient de monter dans sa voiture ; tu lui as déjà dit bonjour, l'heure et la météo.
Dis maintenant un VRAI DISCOURS DE MOTIVATION de 4 à 5 phrases (25 secondes à l'oral) : ne redis PAS « tous les systèmes sont opérationnels » ni « protocole » (la séquence de démarrage vient d'être dite) ; glisse une ou deux tournures d'IA du futur façon Jarvis (« mes projections indiquent… », « j'ai recalculé la trajectoire de votre journée », « analyse terminée : … ») SANS inventer aucun chiffre ; puis un discours qui donne la chair de poule — rythmé, puissant, avec une image forte, une montée en intensité et une phrase finale qui claque et donne envie de tout donner aujourd'hui. Parle à l'homme qu'il est en train de devenir. ${tone}
THÈMES (varie chaque fois) : ${THEMES[Math.floor(Math.random() * THEMES.length)]}.
SA VIE : Kouider vit en BELGIQUE avec sa femme et leur fils Ibrahim, loin de l'Algérie. Il travaille et construit ici, à distance, l'avenir de sa famille EN ALGÉRIE (Oran) : la maison, la voiture, son business, pour pouvoir aller y vivre tous les trois. Ce sacrifice de l'exil a un but, tu peux le lui rappeler avec respect.
⛔ STRICTEMENT INTERDIT dans la voiture : médicament, pharmacie, santé, sevrage, programme Liberté, dose, envie — pas même une allusion. C'est privé.
Ne redis pas bonjour, ni son prénom en premier mot. Il CONDUIT : aucune action à faire au téléphone maintenant (dis « en arrivant » si besoin). Pas d'emoji, pas de liste, pas de citation ni de verset (le verset vient après). N'invente aucun chiffre ni nom : seulement ce qui est dans le contexte, sinon reste général.
Contexte (Grand Coach) : ${coach.slice(0, 1500)}`, { max: 450, emergency: 'voix' }).catch(() => '');
  const fallback = off ? 'Tous les systèmes sont opérationnels. Profitez des vôtres aujourd\'hui, c\'est pour eux que vous construisez tout cela.' : 'Tous les systèmes sont opérationnels. Une seule priorité aujourd\'hui, monsieur : un pas concret pour votre entreprise. Les grands se construisent dans la régularité.';
  const { carPrivacy } = await import('./jarvis4.js');
  return [boot, `${hello} ${time}${weather}.`, carPrivacy(speech || '') || fallback].join(' ');   // 04/11 : la citation → verset du Coran à la fin (carBlessing)
}
