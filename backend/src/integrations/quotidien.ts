/**
 * LE QUOTIDIEN (02/11/2026) — 10 petites options utiles tous les jours, auxquelles Kouider n'aurait pas pensé.
 * Tout est gratuit (Open-Meteo, GPS déjà partagé, taux square déjà suivi), 1 message max par option et par jour
 * (sauf pluie : 2), et chaque option se coupe seule : « coupe l'alerte pluie » → quotidien off option=pluie.
 *
 *  1 sac    — 21h veille de sport : météo du départ (5h30) → tenue + sac à préparer + séance de demain
 *  2 givre  — 4h50 : ≤ 1 °C au départ → pare-brise gelé, pars 5 min plus tôt
 *  3 pluie  — pluie dans les 30 min là où il est (et sec maintenant) → « prends la veste / rentre le linge »
 *  4 anglais — 10h : 1 phrase d'anglais pour ses clients FIK étrangers (location, clés, caution) + prononciation — remplace « courses »
 *  5 ibrahim — 18h30 : un mot de darija à apprendre à Ibrahim + un jeu de 10 min pour son âge
 *  6 dos    — au travail (GPS) : 2 h après l'arrivée puis 2 h plus tard, 1 minute pour le dos (max 2/jour)
 *  7 etirements — 21h45 : 5 min de mobilité avant de dormir (dos + muscles travaillés aujourd'hui) — remplace « poubelles » (sport/santé demandé)
 *  8 montre — 19h30 : mets ta montre en charge maintenant → batterie pleine pour mesurer ta nuit
 *  9 caisse — 21h15 les jours de travail : « combien tu as fait aujourd'hui ? » (1 chiffre → noté)
 * 10 taux   — 9h : 1 € = X DA (square) seulement s'il bouge de 1 % ou plus depuis le dernier envoi
 *
 * Job : 'quotidien' toutes les 15 min (scheduler.ts). Outil : quotidien (jarvis4-tools.ts). app_kv `quotidien:*`.
 */
import { kvGet, kvSet } from './app-store.js';
import { localNow, localTs, getRoutineConfig } from './morning-routine.js';
import { geocode, km } from './departures.js';
import { getLocation } from './location.js';

const OPTIONS = ['sac', 'givre', 'pluie', 'anglais', 'ibrahim', 'dos', 'etirements', 'montre', 'caisse', 'taux'] as const;
type Opt = typeof OPTIONS[number];
const LABEL: Record<Opt, string> = {
  sac: '🎒 Sac + tenue la veille du sport (21h)', givre: '🧊 Alerte givre au réveil', pluie: '🌧️ Pluie dans 30 min là où tu es',
  anglais: '🇬🇧 Phrase d\'anglais pour tes clients FIK (10h)', ibrahim: '👶 Mot de darija + jeu pour Ibrahim (18h30)', dos: '🧘 Pause dos au travail',
  etirements: '🤸 5 min d\'étirements avant de dormir (21h45)', montre: '⌚ Montre en charge avant la nuit (19h30)', caisse: '📒 Caisse du soir (21h15)', taux: '💱 Taux € → DA quand il bouge',
};

interface Cfg { off: Opt[] }
const CFG_K = 'quotidien:cfg';
const sentK = (what: string, date: string) => `quotidien:sent:${what}:${date}`;

async function cfg(): Promise<Cfg> {
  try { return { off: [], ...(JSON.parse((await kvGet(CFG_K)) ?? '{}') as Partial<Cfg>) }; } catch { return { off: [] }; }
}
const saveCfg = (c: Cfg) => kvSet(CFG_K, JSON.stringify(c));

async function tg(text: string): Promise<void> { await (await import('./ai-util.js')).tg(text); }
/** Une fois par jour (clé posée AVANT l'envoi : jamais deux fois). */
async function once(what: string, date: string, fn: () => Promise<string | null>): Promise<boolean> {
  if (await kvGet(sentK(what, date)).catch(() => '1')) return false;
  await kvSet(sentK(what, date), '1', 2 * 86_400);
  const msg = await fn().catch(() => null);
  if (!msg) return false;
  await tg(msg);
  return true;
}

const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

// ── Météo (Open-Meteo, gratuit) ─────────────────────────────────────────────
async function homePos(): Promise<{ lat: number; lng: number } | null> {
  return geocode((await getRoutineConfig()).addresses.home).catch(() => null);
}
async function hourly(pos: { lat: number; lng: number }, date: string): Promise<Array<{ hhmm: string; t: number; rain: number; code: number }>> {
  const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${pos.lat}&longitude=${pos.lng}&hourly=temperature_2m,precipitation_probability,weathercode&timezone=Europe%2FBrussels&start_date=${date}&end_date=${date}`, { signal: AbortSignal.timeout(8000) });
  const j = await r.json() as { hourly?: { time: string[]; temperature_2m: number[]; precipitation_probability: number[]; weathercode: number[] } };
  const h = j.hourly; if (!h) return [];
  return h.time.map((t, i) => ({ hhmm: t.slice(11, 16), t: h.temperature_2m[i] ?? 0, rain: h.precipitation_probability[i] ?? 0, code: h.weathercode[i] ?? 0 }));
}
function outfit(t: number, rain: number): string {
  const top = t <= 2 ? 'gros manteau + bonnet + gants' : t <= 8 ? 'veste chaude + sweat' : t <= 14 ? 'sweat ou veste légère' : 't-shirt, une veste fine pour le retour';
  return `${top}${rain >= 50 ? ' + capuche / parapluie (pluie probable)' : ''}`;
}

// ── 1 sac / 2 givre ─────────────────────────────────────────────────────────
async function sportTomorrow(date: string): Promise<string | null> {
  const tomorrow = addDays(date, 1);
  const day = (await getRoutineConfig()).days[localNow(localTs(tomorrow, '12:00')).weekday];
  if (!day || day.kind !== 'sport') return null;
  const s = await import('./sport-coach.js').then(m => m.sportSessionFor(tomorrow)).catch(() => null);
  if (s && /pas de séance|repos|skip/i.test(s.split('\n')[0] ?? '')) return null;
  return (s?.split('\n')[0] ?? 'Séance prévue').replace(/^[^\p{L}\p{N}]+/u, '').slice(0, 90);
}
async function sacText(date: string): Promise<string | null> {
  const séance = await sportTomorrow(date);
  if (!séance) return null;
  const tomorrow = addDays(date, 1);
  const day = (await getRoutineConfig()).days[localNow(localTs(tomorrow, '12:00')).weekday]!;
  const leave = day.leave ?? '05:30';
  const pos = await homePos();
  const h = pos ? await hourly(pos, tomorrow).catch(() => []) : [];
  const w = h.find(x => x.hhmm === `${leave.slice(0, 2)}:00`);
  const back = h.find(x => x.hhmm === '07:00');
  const météo = w ? `${Math.round(w.t)} °C à ${leave.replace(':', 'h')}${w.rain >= 40 ? `, ${w.rain} % de pluie` : ''}${back && Math.abs(back.t - w.t) >= 2 ? ` (${Math.round(back.t)} °C au retour)` : ''}` : '';
  return [`🎒 Pour demain matin (${séance})`,
    météo ? `🌡️ ${météo} → ${outfit(w!.t, Math.max(w!.rain, back?.rain ?? 0))}` : '',
    '✅ Ce soir dans le sac : serviette, gourde remplie, écouteurs chargés, cadenas, t-shirt de rechange, carte de la salle.',
    '🍳 Skyr + œufs au frigo pour le petit-déj du retour.',
    `⏰ Réveil ${day.wake?.replace(':', 'h') ?? '5h'} → départ ${leave.replace(':', 'h')}.`].filter(Boolean).join('\n');
}
async function givreText(date: string): Promise<string | null> {
  const day = (await getRoutineConfig()).days[localNow().weekday];
  if (!day?.leave) return null;
  const pos = await homePos();
  const h = pos ? await hourly(pos, date).catch(() => []) : [];
  const w = h.find(x => x.hhmm === `${day.leave!.slice(0, 2)}:00`);
  if (!w || w.t > 1) return null;
  const snow = [71, 73, 75, 77, 85, 86].includes(w.code);
  return `🧊 ${Math.round(w.t)} °C au moment de partir${snow ? ' et de la NEIGE' : ''} : pare-brise sûrement gelé. Prévois 5 min de plus (raclette, chauffage pare-brise), et roule doux sur les ponts et les ronds-points.`;
}

// ── 3 pluie ─────────────────────────────────────────────────────────────────
async function pluieCheck(date: string): Promise<boolean> {
  const n = Number((await kvGet(sentK('pluie', date)).catch(() => '9')) ?? 0);
  if (n >= 2) return false;
  const last = Number((await kvGet('quotidien:pluie:last').catch(() => '0')) ?? 0);
  if (Date.now() - last < 3 * 3600_000) return false;
  const loc = await getLocation('kouider').catch(() => null);
  const fresh = loc && Date.now() - Date.parse(loc.updated_at) < 45 * 60_000;
  const pos = fresh ? { lat: loc!.lat, lng: loc!.lng } : await homePos();
  if (!pos) return false;
  const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${pos.lat}&longitude=${pos.lng}&minutely_15=precipitation&forecast_minutely_15=4&timezone=Europe%2FBrussels`, { signal: AbortSignal.timeout(8000) }).catch(() => null);
  const j = await r?.json().catch(() => null) as { minutely_15?: { time: string[]; precipitation: number[] } } | null;
  const p = j?.minutely_15?.precipitation ?? [];
  if (p.length < 3 || (p[0] ?? 0) > 0.05) return false;               // il pleut déjà : rien à annoncer
  const idx = p.findIndex((x, i) => i > 0 && x >= 0.3);
  if (idx < 0) return false;
  await kvSet(sentK('pluie', date), String(n + 1), 2 * 86_400);
  await kvSet('quotidien:pluie:last', String(Date.now()), 86_400);
  const mins = idx * 15;
  await tg(`🌧️ Pluie dans ~${mins} min ${fresh ? 'là où tu es' : 'à la maison'}${(p[idx] ?? 0) >= 1.5 ? ' (forte)' : ''} : veste / parapluie, et rentre le linge s'il est dehors.`);
  return true;
}

// ── 4 anglais pour les clients FIK ─────────────────────────────────────────
const EN: Array<[string, string, string]> = [
  ['Hello, welcome! Here are the keys to your car.', 'hèlo, wèlkeum ! hir ar ze kiz tou yor kar', 'Bonjour, bienvenue ! Voici les clés de votre voiture.'],
  ['Could I see your driving licence and passport, please?', 'koud aï si yor draïving laïsseuns ènd passport, pliz', 'Je peux voir votre permis et votre passeport ?'],
  ['There is a deposit of five hundred euros.', 'zèr iz eu dipozit ov faïv heundred iourôz', 'Il y a une caution de 500 €.'],
  ['You will get the deposit back when you return the car.', 'you wil guèt ze dipozit bak wèn you ritern ze kar', 'La caution vous est rendue au retour de la voiture.'],
  ['Please return the car with a full tank.', 'pliz ritern ze kar wiz eu foul tank', 'Merci de rendre la voiture avec le plein.'],
  ['What time will you return the car?', 'wat taïm wil you ritern ze kar', 'À quelle heure vous rendez la voiture ?'],
  ['Let\'s check the car together before you leave.', 'lèts tchèk ze kar tougèzeur bifor you liv', 'On fait le tour de la voiture ensemble avant de partir.'],
  ['There is a small scratch here, I will note it.', 'zèr iz eu smol skratch hir, aï wil nôt it', 'Il y a une petite rayure ici, je la note.'],
  ['It runs on diesel, not petrol.', 'it reunz on dizel, not pètrol', 'Elle roule au diesel, pas à l\'essence.'],
  ['Smoking is not allowed in the car.', 'smôking iz not alaoud in ze kar', 'Interdit de fumer dans la voiture.'],
  ['If you have a problem, call me or send me a WhatsApp.', 'if you hav eu problem, kol mi or sènd mi eu watsap', 'Un problème ? Appelez-moi ou envoyez un WhatsApp.'],
  ['The price is forty euros per day, insurance included.', 'ze praïs iz forti iourôz peur dèï, inchourance inklouded', 'Le prix est de 40 € par jour, assurance comprise.'],
  ['How many days do you need the car?', 'haou mèni dèïz dou you nid ze kar', 'Vous avez besoin de la voiture combien de jours ?'],
  ['I can deliver the car to the airport.', 'aï kan dilivèr ze kar tou zi èrport', 'Je peux livrer la voiture à l\'aéroport.'],
  ['Where are you staying?', 'wèr ar you stèïing', 'Vous logez où ?'],
  ['You can pay cash or by bank transfer.', 'you kan pèï kash or baï bank transfeur', 'Vous pouvez payer en liquide ou par virement.'],
  ['Is everything okay with the car?', 'iz èvrissing okèï wiz ze kar', 'Tout va bien avec la voiture ?'],
  ['Thank you, have a safe trip!', 'thank you, hav eu sèïf trip', 'Merci, bonne route !'],
  ['Would you like to extend the rental?', 'woud you laïk tou ikstènd ze rèntal', 'Vous voulez prolonger la location ?'],
  ['Could you leave us a review on Google? It helps a lot.', 'koud you liv eus eu rivyou on gougueul ? it hèlps eu lot', 'Vous pouvez nous laisser un avis Google ? Ça aide beaucoup.'],
];
function enText(date: string): string {
  const n = Math.floor(Date.parse(`${date}T12:00:00Z`) / 86_400_000);
  const [en, say, fr] = EN[n % EN.length]!;
  const [en2, , fr2] = EN[(n + 7) % EN.length]!;
  return `🇬🇧 Anglais du jour pour tes clients FIK\n« ${en} »\n🗣️ ${say}\n= ${fr}\n\nRévision : « ${en2} » = ${fr2}`;
}

// ── 7 étirements du soir ────────────────────────────────────────────────────
const STRETCH: Record<string, string[]> = {
  dos: ['Enfant (genoux au sol, bras devant, fesses vers les talons) 45 s', 'Chat-vache à 4 pattes 10 fois lentement', 'Suspension à une porte / barre 20 s (ou bras tendus contre un mur)'],
  pecs: ['Pecs dans l\'encadrement de porte 30 s de chaque côté', 'Ouverture allongé : bras en croix, genoux tombent d\'un côté puis de l\'autre, 30 s'],
  epaules: ['Bras croisé devant la poitrine 30 s de chaque côté', 'Rotations d\'épaules lentes 10 vers l\'arrière'],
  bras: ['Biceps : main à plat contre le mur, bras tendu, tourne le buste 30 s', 'Triceps : coude derrière la tête 30 s de chaque côté'],
  jambes: ['Quadriceps debout, talon aux fesses 30 s de chaque côté', 'Ischios : jambe tendue sur une chaise, buste droit 30 s', 'Fessiers allongé : cheville sur le genou, tire la cuisse 30 s'],
  base: ['Genoux poitrine allongé sur le dos 45 s (bas du dos)', 'Torsion allongé : genoux d\'un côté, regard de l\'autre, 30 s de chaque côté', '5 grandes respirations ventre, expiration longue'],
};
async function etirementsText(date: string): Promise<string> {
  const s = (await import('./sport-coach.js').then(m => m.sportSessionFor(date)).catch(() => null))?.split('\n')[0]?.toLowerCase() ?? '';
  const did = /pas de séance|repos/.test(s) ? '' : s;
  const groups = [/dos|pull|tirage/.test(did) && 'dos', /pec|push|poitrine/.test(did) && 'pecs', /épaule|epaule|upper/.test(did) && 'epaules', /bras|biceps|triceps/.test(did) && 'bras', /jambe|leg|cuisse|fessier/.test(did) && 'jambes'].filter(Boolean) as string[];
  const list = [...groups.flatMap(g => STRETCH[g]!.slice(0, 2)), ...STRETCH['base']!].slice(0, 6);
  return `🤸 5 min avant de dormir${groups.length ? ` (séance du jour : ${groups.join(' + ')})` : ''} — sur le tapis, sans forcer :\n${list.map(x => `• ${x}`).join('\n')}\nRésultat : moins de courbatures demain, dos plus souple, et tu t'endors plus vite.`;
}

// ── 5 ibrahim ───────────────────────────────────────────────────────────────
// Darija algérienne (Oran) simple pour un enfant de ~1,5 an : mot, prononciation, sens
const MOTS: Array<[string, string]> = [
  ['lma', 'l\'eau'], ['khobz', 'le pain'], ['hlib', 'le lait'], ['kora', 'le ballon'], ['tonobil', 'la voiture'], ['bab', 'la porte'], ['dar', 'la maison'],
  ['ras', 'la tête'], ['nif', 'le nez'], ['aïnine', 'les yeux'], ['widnine', 'les oreilles'], ['fomm', 'la bouche'], ['yedd', 'la main'], ['rjel', 'le pied'],
  ['snane', 'les dents'], ['kerch', 'le ventre'], ['qatt', 'le chat'], ['kelb', 'le chien'], ['aoud', 'le cheval'], ['hout', 'le poisson'], ['djaja', 'la poule'],
  ['bagra', 'la vache'], ['fakroun', 'la tortue'], ['ttir', 'l\'oiseau'], ['chems', 'le soleil'], ['gmar', 'la lune'], ['nejma', 'l\'étoile'], ['chta', 'la pluie'],
  ['bhar', 'la mer'], ['toffaha', 'la pomme'], ['bortqal', 'l\'orange'], ['sbabet', 'les chaussures'], ['korsi', 'la chaise'], ['tabla', 'la table'], ['mefteh', 'la clé'],
  ['koul', 'mange'], ['echrob', 'bois'], ['aji', 'viens'], ['chouf', 'regarde'], ['khoud', 'prends'], ['aatini', 'donne-moi'], ['rqed', 'dors'], ['noud', 'lève-toi'],
  ['ih', 'oui'], ['lla', 'non'], ['saha', 'merci / bravo'], ['bslama', 'au revoir'], ['sbah lkhir', 'bonjour (matin)'], ['zine', 'beau'], ['skhoun', 'chaud'],
  ['bared', 'froid'], ['kbir', 'grand'], ['sghir', 'petit'], ['wahed', 'un'], ['zouj', 'deux'], ['tlata', 'trois'], ['hmer', 'rouge'], ['khdar', 'vert'], ['zreq', 'bleu'], ['sfer', 'jaune'],
];
const JEUX = [
  'Coucou-caché avec un tissu sur ta tête : « win baba ? » … « hah ! »', 'Bulles de savon : il les attrape, tu comptes « wahed, zouj, tlata »',
  'Tour de cubes (ou de boîtes) : il la construit avec toi et la fait tomber', 'Rouler un ballon par terre entre vous deux, assis jambes écartées',
  'Cacher un jouet sous un des 3 gobelets, il cherche', 'Imagier : tu montres, tu dis le mot, il pointe du doigt',
  'Transvaser : de l\'eau entre deux verres dans le bain', 'Danse puis « stop ! » : la musique s\'arrête, on se fige',
  'Nourrir une peluche avec une cuillère : « koul ! »', 'Tambour avec une casserole et une cuillère en bois',
  'Imiter les animaux : il fait le bruit, tu dis le mot en darija', 'Promener sa peluche dans une petite voiture à travers le salon',
  'Ranger les jouets dans une boîte en comptant à voix haute', 'Gommettes sur une feuille : il les décolle, tu nommes les couleurs',
  'Chatouilles-comptine : « la petite bête qui monte »', 'Trier : les balles rouges d\'un côté, les bleues de l\'autre',
];
function ibrahimText(date: string): string {
  const n = Math.floor(Date.parse(`${date}T12:00:00Z`) / 86_400_000);
  const [mot, sens] = MOTS[n % MOTS.length]!;
  const jeu = JEUX[n % JEUX.length]!;
  return `👶 Ce soir avec Ibrahim (10 min, téléphone posé)\n🗣️ Mot du jour : « ${mot} » = ${sens}. Dis-le en le montrant, 3 fois dans la soirée.\n🧸 Jeu : ${jeu}.`;
}

// ── 6 dos au travail ────────────────────────────────────────────────────────
const DOS = [
  'Extension debout : mains sur les reins, penche-toi doucement en arrière, 5 fois',
  'Chat-vache debout : mains sur les cuisses, dos rond puis creux, 8 fois lentement',
  'Fessiers : cheville posée sur le genou opposé, assis sur un tabouret, 20 s de chaque côté',
  'Rotation douce : bras croisés, tourne le buste lentement, 5 fois de chaque côté',
  'Mollets : monte sur la pointe des pieds 15 fois (jambes moins lourdes debout)',
  'Menton rentré : 10 fois, la nuque se relâche',
  'Pecs dans l\'encadrement de porte : avant-bras sur le cadre, avance doucement, 20 s',
];
async function dosCheck(date: string): Promise<boolean> {
  const loc = await getLocation('kouider').catch(() => null);
  if (!loc || Date.now() - Date.parse(loc.updated_at) > 40 * 60_000) return false;
  const work = await geocode((await getRoutineConfig()).addresses.work).catch(() => null);
  if (!work || km({ lat: loc.lat, lng: loc.lng }, work) * 1000 > 400) return false;
  const K = `quotidien:dos:${date}`;
  const st = JSON.parse((await kvGet(K).catch(() => null)) ?? 'null') as { since: number; n: number } | null;
  if (!st) { await kvSet(K, JSON.stringify({ since: Date.now(), n: 0 }), 2 * 86_400); return false; }
  if (st.n >= 2 || Date.now() < st.since + (st.n + 1) * 2 * 3600_000) return false;
  st.n += 1; await kvSet(K, JSON.stringify(st), 2 * 86_400);
  const n = Math.floor(Date.now() / 86_400_000) * 2 + st.n;
  await tg(`🧘 1 minute pour ton dos (debout depuis ${st.n * 2} h) :\n• ${DOS[n % DOS.length]}\n• ${DOS[(n + 3) % DOS.length]}\n💧 + un verre d'eau.`);
  return true;
}

// ── 9 caisse ────────────────────────────────────────────────────────────────
async function workedToday(): Promise<boolean> {
  const day = (await getRoutineConfig()).days[localNow().weekday];
  return /travail|magasin/i.test(day?.next ?? '') && !/congé/i.test(day?.next ?? '');
}

// ── 10 taux ─────────────────────────────────────────────────────────────────
async function tauxText(): Promise<string | null> {
  const g = await import('./gold.js').then(m => m.goldMarket()).catch(() => null);
  const rate = g?.eurDzd;
  if (!rate) return null;
  const prev = Number((await kvGet('quotidien:taux:last').catch(() => null)) ?? 0);
  if (prev && Math.abs(rate - prev) / prev < 0.01) return null;
  await kvSet('quotidien:taux:last', String(rate));
  if (!prev) return null;   // 1er relevé : on garde la référence, sans message
  const up = rate > prev;
  return `💱 1 € = ${Math.round(rate)} DA au square (${up ? '+' : ''}${Math.round(rate - prev)} DA depuis le dernier relevé, ${up ? 'en hausse' : 'en baisse'}). ${up ? 'Bon moment pour changer des € pour la maison en Algérie.' : 'Si tu peux, attends avant de changer.'} 100 € = ${Math.round(rate * 100).toLocaleString('fr-FR')} DA.`;
}

/** Toutes les 15 min, 4h-22h45 (Kouider seulement). */
export async function jobQuotidien(): Promise<string> {
  const c = await cfg();
  const { dndAllowsMessage } = await import('../notifications/dnd.js');
  const quiet = !(await dndAllowsMessage().catch(() => true));
  const { date, hhmm } = localNow();
  const on = (o: Opt) => !c.off.includes(o);
  const between = (a: string, b: string) => hhmm >= a && hhmm < b;
  const sent: string[] = [];
  // givre : avant le réveil, même en « ne pas déranger » de la nuit (c'est pour le matin)
  if (on('givre') && between('04:45', '05:30') && await once('givre', date, () => givreText(date))) sent.push('givre');
  if (quiet) return sent.join(', ') || 'silence';
  if (on('taux') && between('09:00', '10:00') && await once('taux', date, tauxText)) sent.push('taux');
  if (on('pluie') && between('07:00', '21:00') && await pluieCheck(date).catch(() => false)) sent.push('pluie');
  if (on('anglais') && between('10:00', '11:00') && await once('anglais', date, async () => enText(date))) sent.push('anglais');
  if (on('dos') && between('07:00', '20:00') && await dosCheck(date).catch(() => false)) sent.push('dos');
  if (on('ibrahim') && between('18:30', '19:30') && await once('ibrahim', date, async () => ibrahimText(date))) sent.push('ibrahim');
  if (on('montre') && between('19:30', '20:30') && await once('montre', date, async () => '⌚ Mets ta montre en charge maintenant (45 min) : batterie pleine pour mesurer ta nuit et ta récupération demain matin.')) sent.push('montre');
  if (on('etirements') && between('21:45', '22:45') && await once('etirements', date, () => etirementsText(date))) sent.push('étirements');
  if (on('sac') && between('21:00', '22:00') && await once('sac', date, () => sacText(date))) sent.push('sac');
  if (on('caisse') && between('21:15', '22:15') && await workedToday() && await once('caisse', date, async () => '📒 Caisse du jour : combien tu as fait aujourd\'hui ? Réponds juste le chiffre (ex. « 220 »), je le note dans ton argent.')) sent.push('caisse');
  return sent.join(', ') || 'rien';
}

export async function quotidienTool(input: Record<string, unknown>): Promise<string> {
  const action = String(input['action'] ?? 'status');
  const c = await cfg();
  const opt = String(input['option'] ?? '').toLowerCase() as Opt;
  if (action === 'off' || action === 'on') {
    if (!OPTIONS.includes(opt)) return `❌ option = ${OPTIONS.join(' | ')}`;
    c.off = action === 'off' ? [...new Set([...c.off, opt])] : c.off.filter(o => o !== opt);
    await saveCfg(c);
    return `${action === 'off' ? '🔕 Coupé' : '🔔 Activé'} : ${LABEL[opt]}.`;
  }
  if (action === 'test') {
    const { date } = localNow();
    const o = opt;
    if (o === 'sac') return (await sacText(date)) ?? 'Pas de sport demain : pas de message sac.';
    if (o === 'givre') return (await givreText(date)) ?? 'Pas de givre prévu au départ.';
    if (o === 'ibrahim') return ibrahimText(date);
    if (o === 'anglais') return enText(date);
    if (o === 'etirements') return etirementsText(date);
    if (o === 'taux') { const g = await import('./gold.js').then(m => m.goldMarket()).catch(() => null); return g ? `💱 1 € = ${Math.round(g.eurDzd)} DA au square.` : 'Taux indisponible.'; }
    return LABEL[o] ?? '❌ option inconnue';
  }
  return [`🗓️ LE QUOTIDIEN — 10 options :`, ...OPTIONS.map(o => `${c.off.includes(o) ? '🔕' : '✅'} ${LABEL[o]}`)].join('\n');
}
