import { kvGet, kvSet } from './app-store.js';
import { createAnthropic, QUALITY } from './anthropic-compat.js';
import { localNow } from './morning-routine.js';
import { queueTelegramMessage } from '../notifications/tg-outbox.js';

// ── 🔥 VITALITÉ (Kouider 02/11) : désir, testostérone, sommeil, couple — PRIVÉ, Kouider seulement ─────────────────
// Son coach de vie le connaît moralement ET physiquement : il croise TOUT (app FORME, montre via les Raccourcis,
// LIBERTÉ, sommeil, moral) pour lui dire où il en est, ce qui freine et quoi faire. Règle n°1 : JAMAIS rien d'inventé.
//  - Le désir n'a pas de « chiffre dans le sang » : on le mesure par ce qu'il déclare (questionnaire validé IIEF,
//    domaine désir, 2 questions → 2 à 10), ses rapports par semaine et ses érections du matin, comparés à LUI-MÊME.
//  - La testostérone ne se connaît QUE par une prise de sang : on n'affiche un chiffre que s'il l'a donné.
//  - Chaque conseil vient de la base FAITS ci-dessous (source citée). Rien d'autre.
// Repo PUBLIC : aucune donnée perso ici (nom du médicament, âge, valeurs) → tout est dans app_kv.

const LOG_K = 'kouider:vitalite:log';
const SET_K = 'kouider:vitalite:settings';
const SENT_K = (k: string) => `kouider:vitalite:sent:${k}`;

export type VitKind = 'rapport' | 'bilan' | 'iief' | 'labo' | 'note';
export interface VitLog {
  at: string; date: string; kind: VitKind;
  n?: number;                       // rapport : nombre (1 par défaut)
  desir?: number;                   // bilan : désir de la semaine 1-10
  matins?: number;                  // bilan : matins avec érection sur 7
  energie?: number;                 // bilan : 1-10
  q1?: number; q2?: number;         // iief : fréquence / niveau du désir, 1-5 chacun
  testo?: number; unit?: 'ng/dL' | 'nmol/L'; heure?: string; shbg?: number; lh?: number; prolactine?: number; vitd?: number; ferritine?: number;
  note?: string;
}
interface VitSettings { goalPerWeek: [number, number]; weekly: boolean; daily: boolean; dailyAt: string }
// daily (03/11, il l'a demandé) : un rappel chaque soir = UN geste concret du jour (sommeil, assiette, sport, couple, médecin)
const DEFAULT_SET: VitSettings = { goalPerWeek: [1, 2], weekly: true, daily: true, dailyAt: '20:30' };

const parse = <T,>(raw: string | null, fb: T): T => { try { return raw ? JSON.parse(raw) as T : fb; } catch { return fb; } };
export async function readVitLog(): Promise<VitLog[]> { return parse<VitLog[]>(await kvGet(LOG_K).catch(() => null), []); }
async function writeLog(l: VitLog[]) { textCache = null; await kvSet(LOG_K, JSON.stringify(l.slice(-600))); }
async function settings(): Promise<VitSettings> { return { ...DEFAULT_SET, ...parse<Partial<VitSettings>>(await kvGet(SET_K).catch(() => null), {}) }; }
const addDays = (d: string, n: number) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const addMin = (hhmm: string, m: number) => { const [h, mi] = hhmm.split(':').map(Number); const t = Math.min(23 * 60 + 59, (h ?? 0) * 60 + (mi ?? 0) + m); return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; };
const r1 = (x: number) => Math.round(x * 10) / 10;
const avg = (a: number[]) => a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;

// ── 📚 FAITS VÉRIFIÉS (seule base autorisée pour les conseils) ────────────────────────────────────────────────────
export const FACTS: Array<{ id: string; theme: string; fait: string; source: string }> = [
  { id: 'opio', theme: 'médicament', fait: "Les antidouleurs opioïdes pris au long cours, dont {MED}, peuvent faire baisser la testostérone (« déficit androgénique induit par les opioïdes ») : baisse du désir, troubles de l'érection, fatigue, humeur basse. Le plus souvent, ça remonte après l'arrêt (en quelques semaines à quelques mois).", source: "Endocrine Society, recommandation 2018 « Testosterone Therapy in Men With Hypogonadism » (Bhasin et al., JCEM) — les opioïdes font partie des causes à rechercher ; revues sur l'OPIAD." },
  { id: 'opio-sero', theme: 'médicament', fait: "Ce type d'antidouleur ({MED}) agit aussi sur la sérotonine : il peut retarder l'éjaculation et diminuer l'envie. C'est un effet du médicament, pas un défaut de l'homme.", source: "Notice (RCP) du médicament, effets indésirables." },
  { id: 'sevrage', theme: 'médicament', fait: "Pendant la baisse, le sommeil et le moral peuvent être moins bons quelques jours après chaque palier (manque). C'est passager ; le désir revient souvent APRÈS l'arrêt complet, pas pendant les premiers paliers. Ne jamais arrêter d'un coup ni changer le plan sans son médecin.", source: "CDC 2022, Clinical Practice Guideline for Prescribing Opioids for Pain (réduction progressive)." },
  { id: 'sommeil', theme: 'sommeil', fait: "Dormir 5 h par nuit pendant une semaine fait baisser la testostérone de jour de 10 à 15 % chez des hommes jeunes en bonne santé. 7-9 h de sommeil par nuit = la base.", source: "Leproult & Van Cauter, JAMA 2011 ; recommandations AASM/SRS 2015 (7 h+ pour l'adulte)." },
  { id: 'poids', theme: 'poids', fait: "Le surpoids fait baisser la testostérone ; perdre du poids la fait remonter, d'autant plus que la perte est grande.", source: "Corona et al., European Journal of Endocrinology 2013 (méta-analyse)." },
  { id: 'deficit', theme: 'poids', fait: "Un déficit calorique trop fort et trop long (manque d'énergie) fait baisser la testostérone et le désir. Une perte de 0,5 à 1 % du poids par semaine protège mieux les hormones et le muscle.", source: "Consensus du CIO sur le déficit énergétique relatif (RED-S), Br J Sports Med 2018/2023 ; Helms et al. 2014." },
  { id: 'sport', theme: 'sport', fait: "La musculation régulière et l'activité physique améliorent l'érection, l'humeur et la composition du corps ; l'effet direct sur la testostérone au repos est modeste. Le surentraînement sans récupération la fait baisser.", source: "Revue Hackney 2020 (surentraînement) ; Silva et al. 2017 et méta-analyses sur l'exercice et la fonction érectile." },
  { id: 'norme-t', theme: 'testostérone', fait: "Testostérone totale chez l'homme de 19 à 39 ans non obèse : plage de référence 264 à 916 ng/dL (9,2 à 31,8 nmol/L). En dessous d'environ 264-300 ng/dL (≈ 9,2-10,4 nmol/L) sur DEUX prises de sang le matin, avec des symptômes, on parle de testostérone basse.", source: "Travison et al., JCEM 2017 (valeurs harmonisées CDC) ; Endocrine Society 2018 ; AUA 2018 (seuil 300 ng/dL)." },
  { id: 'prise-sang', theme: 'testostérone', fait: "La testostérone se mesure par une prise de sang LE MATIN (avant 10 h), idéalement à jeun, et se répète un autre jour si elle est basse. Avec : LH, FSH, prolactine, SHBG (pour la testostérone libre), TSH, ferritine, vitamine D, glycémie/HbA1c. Dire au médecin qu'il prend un antidouleur opioïde et un traitement pour maigrir.", source: "Endocrine Society 2018 ; AUA 2018." },
  { id: 'trt', theme: 'testostérone', fait: "Jamais de testostérone ou de « produits de salle » sans médecin : la testostérone donnée de l'extérieur coupe la fabrication de spermatozoïdes (infertilité) et freine ses propres hormones.", source: "Endocrine Society 2018 ; AUA 2018." },
  { id: 'boosters', theme: 'compléments', fait: "La plupart des « boosters de testostérone » vendus en ligne n'ont pas de preuve sérieuse ; certains ingrédients peuvent même nuire, et on y trouve parfois des produits non déclarés. Le tribulus ne fait pas monter la testostérone.", source: "Clemesha et al., World Journal of Men's Health 2020 ; Qureshi et al. 2014 (tribulus)." },
  { id: 'vitd-zinc', theme: 'compléments', fait: "Vitamine D et zinc n'aident la testostérone QUE s'il y a un manque prouvé par la prise de sang. Sans manque, en prendre ne change rien.", source: "Méta-analyses sur la vitamine D et la testostérone (ex. Lerchbaum 2017, essai contrôlé) ; Prasad 1996 (zinc et carence)." },
  { id: 'interactions', theme: 'compléments', fait: "AVEC TON ANTIDOULEUR, DANGER : millepertuis, 5-HTP, tryptophane, SAMe (et certains antidépresseurs) → risque de syndrome sérotoninergique. Ne rien prendre de « naturel » pour le moral ou la libido sans l'accord du pharmacien ou du médecin.", source: "Notice (RCP) du médicament, interactions sérotoninergiques ; ANSM / AFMPS." },
  { id: 'ashwa', theme: 'compléments', fait: "L'ashwagandha a quelques petits essais avec une hausse modeste de la testostérone chez des hommes en surpoids, mais il y a des cas d'atteinte du foie et il est sédatif : seulement après accord du médecin, pas pendant la baisse du médicament.", source: "Lopresti et al., Am J Mens Health 2019 ; rapports d'hépatotoxicité (LiverTox, NIH)." },
  { id: 'aliments', theme: 'alimentation', fait: "Aucun aliment « aphrodisiaque » n'a de preuve solide. Ce qui marche : manger équilibré type méditerranéen (légumes, fruits, poisson, huile d'olive, noix, légumineuses), assez de protéines, ne pas descendre trop bas en graisses — c'est lié à une meilleure érection.", source: "Esposito et al., JAMA 2004 (régime méditerranéen et fonction érectile) ; Di Francesco & Tenaglia 2017." },
  { id: 'moral', theme: 'moral', fait: "La déprime et le stress font baisser le désir ; soigner le moral (psychologue, activité, sommeil) fait souvent revenir l'envie.", source: "DSM-5 ; revues sur dépression et dysfonction sexuelle (Atlantis & Sullivan 2012)." },
  { id: 'erection-matin', theme: 'repères', fait: "Les érections du matin (ou de la nuit) régulières sont un bon signe que la « mécanique » et les hormones fonctionnent ; quand elles disparaissent, c'est un signe à signaler au médecin.", source: "Questionnaires de dépistage (EMAS, Wu et al., NEJM 2010 : désir bas + moins d'érections du matin + troubles de l'érection = trio le plus lié à la testostérone basse)." },
  { id: 'frequence', theme: 'repères', fait: "Il n'y a pas de fréquence « normale » obligatoire. Aux États-Unis, les adultes de 20 à 29 ans déclarent en moyenne environ 80 rapports par an (≈ 1,5 par semaine). L'important est ce que LUI et sa femme veulent : son objectif = 1 à 2 par semaine.", source: "Twenge, Sherman & Wells, Archives of Sexual Behavior 2017 (General Social Survey)." },
  { id: 'iief', theme: 'repères', fait: "Le désir se mesure par questionnaire, pas par une prise de sang. Le domaine « désir » du questionnaire international IIEF = 2 questions (fréquence et niveau du désir sur les 4 dernières semaines), noté de 2 à 10 : plus c'est haut, plus le désir est présent. Il n'existe pas de « bon chiffre pour son âge » officiel : on le compare à lui-même dans le temps.", source: "Rosen et al., Urology 1997 (IIEF, validé en français)." },
  { id: 'couple', theme: 'couple', fait: "Ce qui aide un couple à refaire l'amour plus souvent : du temps à deux protégé (sans écran), de la tendresse sans « obligation » de rapport, en parler simplement, et si ça bloque, un sexologue ou un thérapeute de couple (techniques type « focalisation sensorielle »).", source: "Masters & Johnson (sensate focus) ; recommandations de l'ISSM." },
  { id: 'erection-med', theme: 'médecin', fait: "Si l'érection pose problème, il existe des traitements efficaces sur ordonnance (ex. sildénafil, tadalafil) que le médecin peut prescrire après examen. Jamais acheter ça sur internet ou au marché (contrefaçons dangereuses).", source: "EAU Guidelines on Sexual and Reproductive Health 2024 ; AFMPS (médicaments contrefaits)." },
  { id: 'glp1', theme: 'médicament', fait: "Pour le traitement de perte de poids (GLP-1), il n'y a pas de preuve claire d'un effet direct sur la libido ; la perte de poids elle-même tend à améliorer la testostérone. Moins manger = parfois moins d'énergie : en parler au médecin si la fatigue est forte.", source: "Données des essais STEP (sémaglutide) ; Corona 2013." },
];
// Nom du médicament : lu dans la base privée (jamais dans ce dépôt public).
async function medName(): Promise<string> { const st = parse<{ med?: string }>(await kvGet('kouider:liberte:state').catch(() => null), {}); return st.med || 'ton antidouleur'; }
const withMed = (t: string, med: string) => t.replace(/\{MED\}/g, med);
const factTxt = (med: string) => FACTS.map(f => `[${f.id}] (${f.theme}) ${withMed(f.fait, med)} — Source : ${f.source}`).join('\n');
export async function factsFor(): Promise<typeof FACTS> { const med = await medName(); return FACTS.map(f => ({ ...f, fait: withMed(f.fait, med) })); }

// ── 📊 ÉTAT : tout ce qu'on SAIT vraiment, source par source ─────────────────────────────────────────────────────
type Week = { from: string; to: string; rapports: number };
export interface VitState {
  today: string; age: number | null;
  goal: [number, number];
  weeks: Week[];                       // 8 dernières semaines (lun→dim), la dernière = en cours
  thisWeek: number; avg4: number | null;
  desir: { last: number | null; date: string | null; trend: number[] };
  iief: { score: number | null; date: string | null; prev: number | null };
  matins: { last: number | null; date: string | null };
  labo: VitLog | null; testoTxt: string;
  sleep: { avg7: number | null; debt: number; short: number; last: number | null } | null;
  med: { allowed: number; taken: number; zero: string; day: number; totalDays: number; nextDrop: string | null } | null;
  comeback: { desir: number | null; energie: number | null } | null;
  phq2: number | null;
  body: { kg: number | null; rateWeek: number | null; deficit: number | null; sessions: string } | null;
  watch: { hrv: number | null; rhr: number | null; steps: number | null };
  mood: number | null;
  levers: Array<{ k: string; title: string; why: string; todo: string; fact: string }>;
  missing: string[];
}

function mondayOf(d: string): string { const x = new Date(`${d}T12:00:00Z`); const wd = (x.getUTCDay() + 6) % 7; return addDays(d, -wd); }

export async function vitaliteState(): Promise<VitState> {
  const today = localNow().date;
  const [log, set, profile] = await Promise.all([readVitLog(), settings(), kvGet('kouider:coach:profile').catch(() => null)]);
  const born = profile?.match(/né le (\d{1,2}) (\w+) (\d{4})/i);
  const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  let age: number | null = null;
  if (born) { const m = MONTHS.indexOf(born[2]!.toLowerCase()); if (m >= 0) { const [y, mo, d] = today.split('-').map(Number) as [number, number, number]; age = y - Number(born[3]) - ((mo - 1 < m || (mo - 1 === m && d < Number(born[1]))) ? 1 : 0); } }

  const mon = mondayOf(today);
  const weeks: Week[] = Array.from({ length: 8 }, (_, i) => { const from = addDays(mon, -7 * (7 - i)); const to = addDays(from, 6); return { from, to, rapports: log.filter(l => l.kind === 'rapport' && l.date >= from && l.date <= to).reduce((s, l) => s + (l.n ?? 1), 0) }; });
  const firstLog = log[0]?.date ?? today;
  const full = weeks.slice(0, -1).filter(w => w.to >= firstLog);
  const avg4 = full.length ? r1(avg(full.slice(-4).map(w => w.rapports))!) : null;
  const bilans = log.filter(l => l.kind === 'bilan');
  const lastB = [...bilans].reverse().find(b => b.desir != null);
  const lastM = [...bilans].reverse().find(b => b.matins != null);
  const iiefs = log.filter(l => l.kind === 'iief' && l.q1 && l.q2);
  const lastI = iiefs.at(-1), prevI = iiefs.at(-2);
  const labo = [...log].reverse().find(l => l.kind === 'labo' && l.testo) ?? null;

  const [sleep, lib, cut, ins, health, coachLog] = await Promise.all([
    import('./sleep-coach.js').then(m => m.sleepStats()).catch(() => null),
    import('./liberte.js').then(m => m.libOverview()).catch(() => null),
    import('./forme-cut.js').then(m => m.cutStatus('kouider')).catch(() => null),
    import('./forme-insights.js').then(m => m.formeInsights('kouider')).catch(() => null),
    kvGet('health:daily').then(r => parse<Array<{ date: string; hrv?: number; rhr?: number; steps?: number }>>(r, [])).catch(() => []),
    import('./life-coach.js').then(m => m.readLog()).catch(() => []),
  ]);
  const h7 = health.filter(h => h.date > addDays(today, -7));
  const mean = (k: 'hrv' | 'rhr' | 'steps') => { const v = h7.map(h => h[k]).filter((x): x is number => typeof x === 'number'); const a = avg(v); return a == null ? null : Math.round(a); };
  const moods = coachLog.filter(l => l.mood != null).slice(-5).map(l => l.mood!);
  const cb = lib?.comeback?.length ? lib.comeback.at(-1)! : null;

  // Testostérone : uniquement ce qu'il a donné (prise de sang)
  let testoTxt = 'inconnue — aucune prise de sang notée (la seule façon de la connaître)';
  if (labo?.testo) {
    const ng = labo.unit === 'nmol/L' ? labo.testo * 28.84 : labo.testo;
    const lvl = ng < 264 ? 'BASSE (sous la plage de référence 264-916 ng/dL des 19-39 ans) → à refaire un autre matin et à montrer au médecin' : ng < 400 ? 'dans la plage de référence, mais dans le bas (264-916 ng/dL)' : 'dans la plage de référence (264-916 ng/dL)';
    testoTxt = `${labo.testo} ${labo.unit ?? 'ng/dL'} le ${labo.date}${labo.heure ? ` à ${labo.heure}` : ''} (≈ ${Math.round(ng)} ng/dL) : ${lvl}${labo.heure && labo.heure > '10:30' ? ". ATTENTION : prise après 10 h 30, la valeur peut être plus basse que la vraie (elle baisse dans la journée)" : ''}.`;
  }

  const levers: VitState['levers'] = [];
  if (lib?.state?.active) levers.push({ k: 'med', title: 'Finir la baisse du médicament (programme LIBERTÉ)', why: `Aujourd'hui ${lib.taken}/${lib.allowed} demis, zéro prévu le ${lib.zero}. C'est probablement le frein n°1 de ta testostérone et de ton envie.`, todo: 'Suivre les paliers tels quels, avec ton médecin. Pas plus vite, pas moins vite.', fact: 'opio' });
  if (sleep?.avg7 != null && sleep.avg7 < 7) levers.push({ k: 'sleep', title: 'Dormir 7 h 30 et plus', why: `Moyenne de la montre sur 7 nuits : ${sleep.avg7} h (dette ${sleep.debt} h).`, todo: 'Coucher 30 min plus tôt, pas d\'écran au lit, réveil fixe.', fact: 'sommeil' });
  if (cut?.weight.ratePct != null && cut.weight.ratePct > 1.1) levers.push({ k: 'deficit', title: 'Déficit un peu moins fort', why: `Tu perds ${cut.weight.ratePct} % de ton poids par semaine (au-dessus de 1 %).`, todo: 'Remonter de 150 kcal/jour (bouton dans FORME → Sèche).', fact: 'deficit' });
  if (ins && ins.week.done < 3 && ins.week.target >= 3) levers.push({ k: 'sport', title: '3 séances de muscu par semaine', why: `${ins.week.done}/${ins.week.target} séances cette semaine.`, todo: 'Caler les séances qui restent dans l\'agenda (FORME).', fact: 'sport' });
  if (!labo) levers.push({ k: 'labo', title: 'Faire une prise de sang le matin', why: 'Sans ça, personne ne peut te dire ton vrai niveau de testostérone.', todo: 'Demander à ton médecin : testostérone totale avant 10 h, LH, FSH, prolactine, SHBG, TSH, ferritine, vitamine D, HbA1c. Puis me donner les chiffres.', fact: 'prise-sang' });
  if ((lib?.phq2 ?? 0) >= 3 || (moods.length >= 2 && avg(moods)! <= 4)) levers.push({ k: 'moral', title: 'Soigner le moral', why: 'Ton moral noté est bas ces derniers temps.', todo: 'Psychologue de 1re ligne (11 € la séance) — le désir suit souvent le moral.', fact: 'moral' });
  levers.push({ k: 'couple', title: 'Du temps à deux, protégé', why: `Objectif : ${set.goalPerWeek[0]} à ${set.goalPerWeek[1]} fois par semaine${avg4 != null ? ` (moyenne actuelle ${avg4})` : ''}.`, todo: '2 soirs par semaine sans téléphone après 21 h, tendresse sans pression, et le dire simplement à ta femme.', fact: 'couple' });

  const missing: string[] = [];
  if (!lastI) missing.push('questionnaire désir (2 questions, 30 s)');
  if (!lastM) missing.push('érections du matin cette semaine (sur 7)');
  if (!labo) missing.push('prise de sang (testostérone)');
  if (!log.some(l => l.kind === 'rapport')) missing.push('rapports : dis-moi juste « on l\'a fait » à chaque fois');

  return {
    today, age, goal: set.goalPerWeek, weeks, thisWeek: weeks.at(-1)!.rapports, avg4,
    desir: { last: lastB?.desir ?? null, date: lastB?.date ?? null, trend: bilans.filter(b => b.desir != null).slice(-8).map(b => b.desir!) },
    iief: { score: lastI ? lastI.q1! + lastI.q2! : null, date: lastI?.date ?? null, prev: prevI ? prevI.q1! + prevI.q2! : null },
    matins: { last: lastM?.matins ?? null, date: lastM?.date ?? null },
    labo, testoTxt,
    sleep: sleep ? { avg7: sleep.avg7 != null ? r1(sleep.avg7) : null, debt: sleep.debt, short: sleep.short, last: sleep.last } : null,
    med: lib?.state?.active ? { allowed: lib.allowed, taken: lib.taken, zero: lib.zero, day: lib.day, totalDays: lib.totalDays, nextDrop: lib.nextDrop ? `${lib.nextDrop.from} → ${lib.nextDrop.max} demis` : null } : null,
    comeback: cb ? { desir: cb.desir ?? null, energie: cb.energie ?? null } : null,
    phq2: lib?.phq2 ?? null,
    body: cut || ins ? { kg: cut?.weight.current ?? null, rateWeek: cut?.weight.rateWeek ?? null, deficit: cut?.deficit ?? null, sessions: ins ? `${ins.week.done}/${ins.week.target}` : '?' } : null,
    watch: { hrv: mean('hrv'), rhr: mean('rhr'), steps: mean('steps') },
    mood: moods.length ? r1(avg(moods)!) : null,
    levers, missing,
  };
}

function stateText(s: VitState): string {
  return [
    `Âge : ${s.age ?? '?'} ans.`,
    `Rapports : ${s.thisWeek} cette semaine ; moyenne 4 dernières semaines complètes ${s.avg4 ?? 'pas encore de données'} ; objectif ${s.goal[0]}-${s.goal[1]}/semaine. Par semaine (ancienne → récente) : ${s.weeks.map(w => w.rapports).join(', ')}.`,
    `Désir (sa note /10 de la semaine) : ${s.desir.last ?? 'pas noté'}${s.desir.trend.length > 1 ? ` (évolution ${s.desir.trend.join(' → ')})` : ''}. Questionnaire IIEF désir : ${s.iief.score != null ? `${s.iief.score}/10 le ${s.iief.date}${s.iief.prev != null ? ` (avant : ${s.iief.prev}/10)` : ''}` : 'pas encore fait'}. Érections du matin : ${s.matins.last != null ? `${s.matins.last}/7 matins (${s.matins.date})` : 'pas noté'}.`,
    `Testostérone : ${s.testoTxt}`,
    s.sleep ? `Sommeil (montre) : moyenne 7 nuits ${s.sleep.avg7 ?? '?'} h, dette ${s.sleep.debt} h, ${s.sleep.short} nuit(s) < 6 h.` : 'Sommeil : pas de données montre.',
    s.med ? `Programme d'arrêt du médicament (LIBERTÉ) : jour ${s.med.day}/${s.med.totalDays}, aujourd'hui ${s.med.taken}/${s.med.allowed} demis, prochain palier ${s.med.nextDrop ?? '—'}, zéro le ${s.med.zero}.` : 'Programme LIBERTÉ : pas actif.',
    s.comeback ? `LIBERTÉ « ce qui revient » : désir ${s.comeback.desir ?? '?'}/10, énergie ${s.comeback.energie ?? '?'}/10.` : '',
    s.phq2 != null ? `Moral (PHQ-2) : ${s.phq2}/6${s.phq2 >= 3 ? ' (à surveiller)' : ''}.` : '',
    s.body ? `Corps (FORME) : ${s.body.kg ?? '?'} kg${s.body.rateWeek != null ? `, ${s.body.rateWeek} kg/sem` : ''}, déficit visé ${s.body.deficit ?? '?'} kcal, séances ${s.body.sessions}.` : '',
    `Montre 7 j : VFC ${s.watch.hrv ?? '?'} ms, pouls repos ${s.watch.rhr ?? '?'}, ${s.watch.steps ?? '?'} pas/j.${s.mood != null ? ` Moral noté : ${s.mood}/10.` : ''}`,
    `Leviers (ordre de priorité) : ${s.levers.map((l, i) => `${i + 1}. ${l.title} — ${l.why} → ${l.todo} [${l.fact}]`).join(' | ')}`,
    s.missing.length ? `Il manque : ${s.missing.join(', ')}.` : '',
  ].filter(Boolean).join('\n');
}

const RULES = [
  'RÈGLES VITALITÉ (strictes) :',
  '- N\'INVENTE JAMAIS un chiffre ni un fait. Tu n\'utilises QUE ses données ci-dessus et la base FAITS (avec la source entre crochets si utile). Si tu ne sais pas : « je ne sais pas, il faut demander au médecin / faire la prise de sang ».',
  '- La libido n\'a PAS de chiffre dans le sang : sa « note » = le questionnaire IIEF désir (2-10), sa note /10, ses rapports et ses érections du matin, comparés à LUI. Ne donne jamais de « niveau normal de libido pour son âge » en chiffre : il n\'existe pas.',
  '- Testostérone : seulement la valeur de SA prise de sang ; plage de référence 19-39 ans = 264-916 ng/dL (9,2-31,8 nmol/L). Sans prise de sang → « inconnue ».',
  '- Médicament : JAMAIS de conseil de dose, jamais accélérer ni ralentir le plan LIBERTÉ sans son médecin. Jamais de testostérone, de produit de salle, ni de pilule achetée sur internet.',
  '- Compléments « naturels » : rappelle le risque d\'interaction avec son antidouleur (millepertuis, 5-HTP, tryptophane…) → pharmacien d\'abord.',
  '- Ton : grand frère, direct, sans gêne ni honte, jamais vulgaire. Tout ça est STRICTEMENT PRIVÉ : jamais à sa femme ni à personne. Tu ne contactes jamais sa femme. Tu respectes qu\'un rapport se fait à deux : conseils de couple, jamais de pression sur elle.',
  '- Termine par 1 à 3 actions concrètes pour aujourd\'hui/cette semaine.',
].join('\n');

/** Contexte pour tous les cerveaux (dossier Kouider). Court. */
let textCache: { at: number; text: string } | null = null;
export async function vitaliteText(): Promise<string> {
  if (textCache && Date.now() - textCache.at < 10 * 60_000) return textCache.text;
  const s = await vitaliteState().catch(() => null);
  if (!s) return '';
  const out = `VITALITÉ (privé : désir, couple, testostérone — outil \`vitalite\`) : rapports ${s.thisWeek} cette semaine (objectif ${s.goal[0]}-${s.goal[1]}, moyenne ${s.avg4 ?? '?'}) ; désir ${s.desir.last ?? '?'}/10 ; IIEF désir ${s.iief.score ?? '?'}/10 ; testostérone ${s.labo ? s.testoTxt.split(':')[0] : 'inconnue (pas de prise de sang)'} ; levier n°1 : ${s.levers[0]?.title ?? '—'}. Pour toute question sur libido / testostérone / sexualité / envie → outil vitalite action question (JAMAIS de réponse inventée). « on l'a fait » / « on a fait l'amour » → vitalite action rapport. Strictement privé.`;
  textCache = { at: Date.now(), text: out };
  return out;
}

/** Réponse du coach de vie à une question (libido, testo, que manger, que prendre…) — uniquement sur ses données + FAITS. */
export async function askVitalite(question: string): Promise<string> {
  const s = await vitaliteState();
  const physique = await import('./forme-cut.js').then(m => m.formeSnapshot()).catch(() => '');
  const res = await createAnthropic().messages.create({
    model: 'claude-sonnet-5-5', max_tokens: 1400,
    system: `Tu es le COACH DE VIE de Kouider (Dzaryx) : tu le connais moralement et physiquement. Il veut retrouver une vie de couple épanouie (1 à 2 rapports par semaine), du désir, de l'énergie, arrêter son antidouleur, mieux dormir, et changer de vie. Réponds en français simple, chaleureux et franc, sans détour, 25 lignes max.\n\n${RULES}\n\nFAITS VÉRIFIÉS (seule base autorisée) :\n${factTxt(await medName())}`,
    messages: [{ role: 'user', content: `SES DONNÉES RÉELLES :\n${stateText(s)}\n${physique}\n\nQUESTION DE KOUIDER : ${question.slice(0, 1200)}` }],
  }, QUALITY);
  const out = res.content.filter(b => b.type === 'text').map(b => (b as { text: string }).text).join('').trim();
  await kvSet('kouider:vitalite:lastqa', JSON.stringify({ at: new Date().toISOString(), q: question.slice(0, 300), a: out.slice(0, 3000) })).catch(() => {});
  return out;
}

/** Le plan complet (pour l'app et « fais-moi le point »), calculé sans IA : rien d'inventé. */
export function planText(s: VitState): string {
  const f = (id: string) => FACTS.find(x => x.id === id);
  return [
    `🔥 VITALITÉ — le point (${s.today})`,
    '',
    `❤️ Rapports : ${s.thisWeek} cette semaine · moyenne ${s.avg4 ?? '—'} · objectif ${s.goal[0]}-${s.goal[1]}/sem`,
    `🧠 Désir : ${s.iief.score != null ? `${s.iief.score}/10 (questionnaire IIEF)` : s.desir.last != null ? `${s.desir.last}/10 (ta note)` : 'pas encore mesuré'}`,
    `🌅 Érections du matin : ${s.matins.last != null ? `${s.matins.last}/7` : 'pas noté'}`,
    `🧪 Testostérone : ${s.testoTxt}`,
    s.sleep ? `😴 Sommeil : ${s.sleep.avg7 ?? '?'} h de moyenne (montre), dette ${s.sleep.debt} h` : '',
    s.med ? `💊 Médicament : ${s.med.taken}/${s.med.allowed} demis aujourd'hui, zéro le ${s.med.zero}` : '',
    '',
    'CE QUI FREINE ET QUOI FAIRE (par ordre) :',
    ...s.levers.map((l, i) => `${i + 1}. ${l.title}\n   Pourquoi : ${l.why}\n   À faire : ${l.todo}\n   Preuve : ${f(l.fact)?.source ?? ''}`),
    '',
    `⚠️ ${f('interactions')!.fait}`,
    s.missing.length ? `\nIl me manque : ${s.missing.join(' · ')}.` : '',
  ].filter(x => x !== '').join('\n');
}

// ── 🛠️ Outil (chat, Telegram, appels, app) ──────────────────────────────────────────────────────────────────────
export async function vitaliteTool(input: Record<string, unknown>, sessionId?: string): Promise<string> {
  if (/houari|femme|client/i.test(sessionId ?? '')) return '❌ Réservé à Kouider.';
  const a = String(input['action'] ?? 'etat');
  const today = localNow().date;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(input['date'] ?? '')) ? String(input['date']) : input['date'] === 'hier' ? addDays(today, -1) : today;
  const log = await readVitLog();
  const push = async (e: Omit<VitLog, 'at' | 'date'>) => { log.push({ at: new Date().toISOString(), date, ...e }); await writeLog(log); };
  const num = (k: string, lo: number, hi: number) => { const v = Number(input[k]); return Number.isFinite(v) && v >= lo && v <= hi ? v : undefined; };

  switch (a) {
    case 'etat': case 'plan': return planText(await vitaliteState());
    case 'question': {
      const q = String(input['question'] ?? '').trim();
      if (!q) return '❌ question manquante.';
      return askVitalite(q);
    }
    case 'rapport': {
      const n = num('n', 1, 5) ?? 1;
      const dup = log.find(l => l.kind === 'rapport' && l.date === date && Date.now() - new Date(l.at).getTime() < 2 * 3600_000);
      if (dup && !input['nouveau']) return `Déjà noté pour ${date === today ? "aujourd'hui" : date} il y a moins de 2 h (mets nouveau:true si c'en est un autre).`;
      await push({ kind: 'rapport', n });
      const s = await vitaliteState();
      return `❤️ Noté. Cette semaine : ${s.thisWeek} (objectif ${s.goal[0]}-${s.goal[1]}).${s.thisWeek >= s.goal[0] ? ' Objectif de la semaine atteint 💪' : ''}`;
    }
    case 'annuler': {
      const i = log.map(l => l.kind).lastIndexOf('rapport');
      if (i < 0) return 'Rien à annuler.';
      log.splice(i, 1); await writeLog(log); return 'Dernier rapport retiré.';
    }
    case 'bilan': {
      const e = { kind: 'bilan' as const, desir: num('desir', 1, 10), matins: num('matins', 0, 7), energie: num('energie', 1, 10), note: input['note'] ? String(input['note']).slice(0, 300) : undefined };
      if (e.desir == null && e.matins == null && e.energie == null) return '❌ desir (1-10), matins (0-7) ou energie (1-10).';
      if (input['rapports'] != null) {
        const r = num('rapports', 0, 21) ?? 0, from = mondayOf(date), have = log.filter(l => l.kind === 'rapport' && l.date >= from && l.date <= date).reduce((s, l) => s + (l.n ?? 1), 0);
        if (r > have) log.push({ at: new Date().toISOString(), date, kind: 'rapport', n: r - have, note: 'bilan de la semaine' });
      }
      await push(e);
      return planText(await vitaliteState());
    }
    case 'iief': {
      const q1 = num('q1', 1, 5), q2 = num('q2', 1, 5);
      if (!q1 || !q2) return "❌ q1 et q2 de 1 à 5.\nQ1 : Sur les 4 dernières semaines, à quelle fréquence as-tu ressenti du désir ? 1 presque jamais · 2 quelques fois · 3 parfois (la moitié du temps) · 4 la plupart du temps · 5 presque toujours.\nQ2 : Comment notes-tu ton niveau de désir ? 1 très bas/nul · 2 bas · 3 moyen · 4 élevé · 5 très élevé.";
      await push({ kind: 'iief', q1, q2 });
      const s = await vitaliteState();
      return `🧠 Désir (IIEF) : ${q1 + q2}/10${s.iief.prev != null ? ` (avant ${s.iief.prev}/10)` : ''}. Il n'y a pas de « bon chiffre officiel pour ton âge » : on suit TON évolution — le but, c'est qu'il monte vers 8-10 au fil des paliers.`;
    }
    case 'labo': {
      const testo = num('testo', 0.5, 2000);
      if (!testo) return '❌ testo = valeur de la testostérone totale (+ unit ng/dL ou nmol/L, date, heure de la prise de sang).';
      const unit = String(input['unit'] ?? '').toLowerCase().includes('nmol') || testo < 60 ? 'nmol/L' : 'ng/dL';
      await push({ kind: 'labo', testo, unit, heure: /^\d{1,2}:\d{2}$/.test(String(input['heure'] ?? '')) ? String(input['heure']).padStart(5, '0') : undefined,
        shbg: num('shbg', 1, 300), lh: num('lh', 0, 100), prolactine: num('prolactine', 0, 1000), vitd: num('vitd', 1, 300), ferritine: num('ferritine', 1, 3000), note: input['note'] ? String(input['note']).slice(0, 300) : undefined });
      const s = await vitaliteState();
      return `🧪 Prise de sang notée. Testostérone : ${s.testoTxt}\nMontre ces résultats à ton médecin — c'est lui qui interprète l'ensemble (LH, prolactine…).`;
    }
    case 'objectif': {
      const lo = num('min', 0, 14), hi = num('max', 0, 14);
      if (lo == null || hi == null || hi < lo) return '❌ min et max par semaine.';
      const st = await settings(); st.goalPerWeek = [lo, hi]; await kvSet(SET_K, JSON.stringify(st)); return `Objectif : ${lo} à ${hi} par semaine.`;
    }
    case 'rappel': {
      const st = await settings();
      const h = String(input['heure'] ?? '').replace('h', ':').trim(), hh = /^\d{1,2}(:\d{2})?$/.test(h) ? (h.includes(':') ? h : `${h}:00`).padStart(5, '0') : null;
      if (input['quotidien'] != null || hh) {
        st.daily = input['quotidien'] !== false; if (hh) st.dailyAt = hh;
        await kvSet(SET_K, JSON.stringify(st));
        return st.daily ? `Rappel Vitalité tous les soirs à ${st.dailyAt} : activé (un geste concret par jour).` : 'Rappel Vitalité du soir : coupé.';
      }
      st.weekly = input['on'] !== false; await kvSet(SET_K, JSON.stringify(st)); return st.weekly ? 'Bilan privé du dimanche 21 h 30 : activé.' : 'Bilan du dimanche : coupé.';
    }
    case 'jour': return (await dailyText()) ?? 'Rien à proposer aujourd\'hui.';
    case 'faits': return (await factsFor()).map(f => `• ${f.fait}\n  (${f.source})`).join('\n');
  }
  return '❌ action : etat | question | rapport | annuler | bilan | iief | labo | objectif | rappel | jour | faits';
}

// ── 🔁 Rappel du soir (03/11) : UN geste concret par jour, tiré de SES leviers + des FAITS (rien d'inventé, sans IA) ──
const PLATES = [
  'poisson (sardines, maquereau ou saumon) + légumes + filet d\'huile d\'olive',
  'une poignée de noix ou d\'amandes (30 g) en collation',
  'légumineuses : lentilles, pois chiches ou loubia',
  'poulet ou œufs + salade + huile d\'olive (assez de protéines, pas zéro gras)',
  'fruits et légumes de saison à chaque repas',
  'poisson au four ou grillé, pas frit',
];
const DAY_TIPS: Record<string, string[]> = {
  sleep: ['Ce soir au lit 30 min plus tôt que d\'habitude, téléphone hors de la chambre.', 'Pas d\'écran 30 min avant de dormir ce soir : c\'est la nuit qui fabrique ta testostérone.'],
  sport: ['Demain : ta séance de muscu est calée ? Sinon cale-la maintenant dans FORME.', '20 min de marche rapide demain, ça compte aussi pour l\'érection et le moral.'],
  couple: ['Ce soir : 30 min avec ta femme sans téléphone. Tendresse, sans « obligation » — c\'est comme ça que l\'envie revient.', 'Propose-lui une sortie à deux cette semaine (même un café). Le temps à deux protégé = la base.'],
  labo: ['Appelle ton médecin pour la prise de sang du matin (testostérone avant 10 h, LH, FSH, prolactine, SHBG, TSH, ferritine, vitamine D, HbA1c). Sans elle, personne ne connaît ton vrai niveau.'],
  moral: ['Comment va le moral ? Si c\'est lourd depuis plusieurs jours, un psychologue de 1re ligne (11 € la séance) aide souvent l\'envie à revenir.'],
  deficit: ['Tu perds vite : remonte de 150 kcal aujourd\'hui (ex. une poignée de noix). Un déficit trop fort fait baisser l\'envie.'],
  med: ['Continue ton programme palier par palier, sans rien accélérer : le désir revient surtout APRÈS l\'arrêt complet. Tu es sur le bon chemin.'],
};
export async function dailyText(date = localNow().date): Promise<string | null> {
  const s = await vitaliteState();
  const n = Math.floor(Date.parse(`${date}T12:00:00Z`) / 86_400_000);
  const levers = s.levers.filter(l => DAY_TIPS[l.k]);
  if (!levers.length) return null;
  const lv = levers[n % levers.length]!, tips = DAY_TIPS[lv.k]!;
  return [
    '🔥 Vitalité — ton geste du jour (privé)',
    `👉 ${tips[Math.floor(n / levers.length) % tips.length]}`,
    `🍽️ Dans l'assiette : ${PLATES[n % PLATES.length]}.`,
    'Rien à acheter : aucun « booster » ni aliment miracle n\'a de preuve, et avec ton traitement, aucun complément sans le pharmacien.',
    `Cette semaine : ${s.thisWeek} rapport(s) noté(s), objectif ${s.goal[0]}-${s.goal[1]}. Dis-moi juste « on l'a fait » quand c'est le cas.`,
  ].join('\n');
}

// ── ⏰ Job : bilan privé du dimanche 21 h 30 + questionnaire désir toutes les 4 semaines ─────────────────────────────
export async function jobVitalite(): Promise<void> {
  const st = await settings();
  const { date, hhmm: time } = localNow();
  const wd = new Date(`${date}T12:00:00Z`).getUTCDay();
  // Rappel quotidien du soir (pas le dimanche : c'est le bilan)
  if (st.daily && wd !== 0 && time >= st.dailyAt && time < addMin(st.dailyAt, 60) && !(await kvGet(SENT_K(`d:${date}`)).catch(() => null))) {
    await kvSet(SENT_K(`d:${date}`), '1');
    const t = await dailyText(date).catch(() => null);
    if (t) await queueTelegramMessage(t, undefined, 'kouider', undefined, true);
  }
  if (!st.weekly) return;
  if (wd !== 0 || time < '21:30' || time > '22:30') return;
  if (await kvGet(SENT_K(date)).catch(() => null)) return;
  await kvSet(SENT_K(date), '1');
  const s = await vitaliteState();
  const iiefDue = !s.iief.date || s.iief.date <= addDays(date, -28);
  await queueTelegramMessage([
    '🔥 Bilan privé de la semaine (que toi et moi)',
    `Rapports notés : ${s.thisWeek} (objectif ${s.goal[0]}-${s.goal[1]}).`,
    'Réponds juste en une ligne, ex. « désir 6, matins 3, énergie 5, rapports 1 ».',
    iiefDue ? '\nEt toutes les 4 semaines, 2 questions (1 à 5) :\nQ1 fréquence du désir (1 presque jamais → 5 presque toujours)\nQ2 niveau du désir (1 très bas → 5 très élevé)\nex. « iief 3 2 »' : '',
    s.levers[0] ? `\nLevier n°1 cette semaine : ${s.levers[0].title} — ${s.levers[0].todo}` : '',
  ].filter(Boolean).join('\n'), undefined, 'kouider', undefined, true);
}
