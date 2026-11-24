// ── 🏠 Séance MAISON quand il ne va pas à la salle (Kouider 23/11) ────────────────────────────────────────────────
// « je vais pas aller demain à la salle, il faut quand même qu'il me fasse des exercices maison : 2 haltères de 7 kg et une
// planche à pompes avec 2 poignées ; pecs = aussi le BAS, pas seulement le haut ; et les abdos ».
// Sans IA (toujours dispo, gratuit) : la séance prévue ce jour-là (HAUT A / B / C, ABDOS + CARDIO) traduite avec SON matériel.
// Ses règles : pas de jambes · élévations latérales ≤ 5 kg (→ bouteilles d'eau) · curls bras DROIT d'abord.
import { kvGet, kvSet } from './app-store.js';

export interface HomeGear { dumbbellKg: number; dumbbells: number; pushupBoard: boolean; note?: string }
const GEAR_K = 'kouider:forme:home_gear';
const DEFAULT_GEAR: HomeGear = { dumbbellKg: 7, dumbbells: 2, pushupBoard: true };

export async function homeGear(): Promise<HomeGear> {
  try { return { ...DEFAULT_GEAR, ...JSON.parse((await kvGet(GEAR_K)) ?? '{}') as Partial<HomeGear> }; } catch { return DEFAULT_GEAR; }
}
export async function setHomeGear(p: Partial<HomeGear>): Promise<HomeGear> {
  const g = { ...await homeGear(), ...p };
  await kvSet(GEAR_K, JSON.stringify(g));
  return g;
}

interface HomeEx { name: string; sets: number; reps: string; tip: string; zone: string }

function blocks(kind: 'A' | 'B' | 'C' | 'core', g: HomeGear): HomeEx[] {
  const kg = `${g.dumbbellKg} kg`;
  const board = g.pushupBoard;
  const pomp = (pos: string) => board ? `planche à pompes, poignées ${pos}` : `mains ${pos}`;
  const chestLow: HomeEx[] = [
    { name: 'Pompes mains surélevées (canapé / lit)', sets: 3, reps: 'max − 2', zone: 'BAS des pecs', tip: 'Corps en ligne, descends la poitrine vers le bord, coudes à 45°. Les mains plus HAUTES que les pieds = bas des pecs.' },
    { name: 'Dips entre 2 chaises stables, buste penché', sets: 3, reps: '8-12', zone: 'BAS des pecs', tip: 'Chaises dos au mur, buste penché en avant, descends jusqu\'à 90° au coude. Pas de chaises solides → 1 série de plus de pompes mains surélevées.' },
  ];
  const chestHigh: HomeEx = { name: 'Pompes pieds surélevés (pieds sur le canapé)', sets: 3, reps: 'max − 2', zone: 'HAUT des pecs', tip: 'Pieds plus HAUTS que les mains = haut des pecs. Descente en 3 s.' };
  const chestMain: HomeEx = { name: `Pompes ${pomp('position « pecs » (larges)')}`, sets: 4, reps: 'max − 2', zone: 'pecs (milieu)', tip: 'Descente 3 s, 1 s en bas, remonte fort. Arrête 2 reps avant l\'échec.' };
  const fly: HomeEx = { name: `Écarté haltères au sol (${kg})`, sets: 3, reps: '12-15', zone: 'pecs', tip: 'Allongé au sol, coudes légèrement fléchis, ouvre lentement jusqu\'à ce que les coudes touchent le sol, serre les pecs en haut.' };
  const row: HomeEx = { name: `Rowing haltère 1 bras, appui sur le canapé (${kg})`, sets: 4, reps: '12-15 / bras', zone: 'dos', tip: 'Tire le coude vers la hanche, 1 s serré en haut, descente 3 s. 7 kg c\'est léger → lent et jusqu\'à 1-2 reps de l\'échec.' };
  const pullover: HomeEx = { name: `Pull-over au sol (1 haltère ${kg} à 2 mains)`, sets: 3, reps: '12-15', zone: 'dos + pecs', tip: 'Bras presque tendus, descends derrière la tête en 3 s, ramène au-dessus de la poitrine.' };
  const lat: HomeEx = { name: 'Élévations latérales avec 2 bouteilles d\'eau pleines (≈ 1,5 kg)', sets: 3, reps: '15-20', zone: 'épaules', tip: `Ta règle : max 5 kg → pas les haltères de ${kg}. Monte jusqu'aux épaules, descente lente.` };
  const abs: HomeEx[] = [
    { name: 'Crunch au sol', sets: 3, reps: '15-20', zone: 'abdos', tip: 'Enroule le haut du dos, souffle en montant, ne tire pas sur la nuque.' },
    { name: 'Relevés de jambes allongé', sets: 3, reps: '12-15', zone: 'bas des abdos', tip: 'Bas du dos collé au sol, jambes descendent lentement sans toucher le sol.' },
    { name: 'Gainage planche (sur la planche à pompes ou les avant-bras)', sets: 3, reps: '45 s', zone: 'abdos', tip: 'Fesses serrées, ventre rentré, corps droit.' },
  ];
  if (kind === 'A') return [chestMain, ...chestLow, row, fly, pullover, lat, abs[0]!, abs[2]!];
  if (kind === 'C') return [chestHigh, chestLow[0]!, row, pullover,
    { name: `Curl concentré (${kg}) — bras DROIT d'abord`, sets: 3, reps: '12-15', zone: 'biceps', tip: 'Coude contre la cuisse, bras droit en premier, puis le gauche avec le même nombre de reps (jamais plus).' },
    { name: `Pompes ${pomp('position « triceps » (serrées)')}`, sets: 3, reps: 'max − 2', zone: 'triceps + bas des pecs', tip: 'Coudes collés au corps.' }, abs[1]!, abs[2]!];
  if (kind === 'B') return [
    { name: `Développé épaules assis (2 × ${kg})`, sets: 4, reps: '12-15', zone: 'épaules', tip: 'Dos droit, descends jusqu\'aux oreilles, pousse sans verrouiller.' },
    lat,
    { name: `Oiseau penché (2 × ${kg})`, sets: 3, reps: '15', zone: 'arrière d\'épaule', tip: 'Buste penché, ouvre les bras sur le côté, coudes légèrement fléchis.' },
    { name: `Curl haltère 1 bras (${kg}) — bras DROIT d'abord`, sets: 4, reps: '12-15', zone: 'biceps', tip: 'Supination en haut, descente 3 s. Le gauche : même poids, mêmes reps.' },
    { name: `Curl marteau (${kg}) — bras DROIT d'abord`, sets: 3, reps: '12-15', zone: 'biceps + avant-bras', tip: 'Pouces vers le haut, coudes fixes.' },
    { name: `Extension triceps derrière la tête (1 haltère ${kg} à 2 mains)`, sets: 3, reps: '12-15', zone: 'triceps', tip: 'Coudes serrés vers le plafond.' },
    { name: `Pompes ${pomp('position « triceps » (serrées)')}`, sets: 3, reps: 'max − 2', zone: 'triceps', tip: 'Coudes collés au corps.' },
    { name: `Curl poignets assis (${kg})`, sets: 3, reps: '20', zone: 'avant-bras (veines)', tip: 'Avant-bras posés sur les cuisses, seuls les poignets bougent.' },
  ];
  // ABDOS + CARDIO (pas de jambes : le cardio = marche rapide, il marche déjà beaucoup)
  return [
    { name: 'Marche rapide dehors (ou montée/descente d\'escaliers)', sets: 1, reps: '25-30 min', zone: 'cardio', tip: 'Allure où tu peux parler mais pas chanter.' },
    ...abs,
    { name: `Bûcheron debout (1 haltère ${kg} à 2 mains)`, sets: 3, reps: '12 / côté', zone: 'obliques', tip: 'Rotation du buste, bras tendus, de la hanche vers l\'épaule opposée.' },
    { name: 'Gainage latéral', sets: 3, reps: '30 s / côté', zone: 'obliques', tip: 'Hanches hautes, corps aligné.' },
    chestLow[0]!,
  ];
}

const kindOf = (label: string): 'A' | 'B' | 'C' | 'core' =>
  /abdo|cardio|bas\b/i.test(label) ? 'core' : /\bB\b|[ée]paules|bras/i.test(label) && !/pecs/i.test(label) ? 'B' : /\bC\b/.test(label) ? 'C' : 'A';

// ── 24/11 Kouider : « tout dans l'app doit être comme quand je vais à la salle, exactement pareil, sauf une version maison »
// → CHAQUE exercice de SA séance de salle est traduit 1 pour 1 (même ordre, même muscle, mêmes séries, même repos) avec son matériel.
// Les ids commencent par « home_ » : la progression maison (7 kg) ne touche jamais aux charges de la salle.
type GymEx = { id: string; name: string; muscle: string; sets: number; reps: string; rest: number; tip?: string };
export interface HomeAppEx { id: string; name: string; muscle: string; sets: number; reps: string; rest: number; tip: string; alt: string[]; kg: number | null; from: string }

function homeOf(e: GymEx, g: HomeGear, used: Set<string>): HomeAppEx {
  const kg = g.dumbbellKg, n = e.name.toLowerCase();
  const board = g.pushupBoard ? 'sur la planche, poignées' : 'mains au sol,';
  const mk = (id: string, name: string, reps: string, tip: string, w: number | null, muscle = e.muscle): HomeAppEx =>
    ({ id: `home_${id}`, name, muscle, sets: e.sets, reps, rest: Math.min(e.rest, 90), tip, alt: [], kg: w, from: e.name });
  const pick = (...c: Array<() => HomeAppEx>) => { for (const f of c) { const x = f(); if (!used.has(x.id)) { used.add(x.id); return x; } } const x = c[c.length - 1]!(); return x; };
  // PECS
  if (/inclin/.test(n) && /(d[ée]velopp|press)/.test(n)) return pick(() => mk('pompes_pieds_sureleves', 'Pompes pieds surélevés (haut des pecs)', 'max − 2', 'Pieds sur le canapé, mains plus BASSES que les pieds = haut des pecs. Descente 3 s.', null, 'pecs'));
  if (/(d[ée]velopp|press).*(couch|pec)|bench|pompes/.test(n) && !/[ée]paule|militaire/.test(n)) return pick(() => mk('pompes_planche_larges', `Pompes ${board} larges`, 'max − 2', 'Descente 3 s, 1 s en bas, remonte fort. Arrête 2 reps avant l\'échec.', null, 'pecs'), () => mk('pompes_mains_surelevees', 'Pompes mains surélevées (bas des pecs)', 'max − 2', 'Mains sur le canapé, plus HAUTES que les pieds = bas des pecs.', null, 'pecs'));
  if (/dips/.test(n)) return pick(() => mk('dips_chaises', 'Dips entre 2 chaises, buste penché (bas des pecs)', '8-12', 'Chaises stables dos au mur, buste penché en avant, descends jusqu\'à 90° au coude.', null, 'pecs'));
  if (/[ée]cart[ée]|pec.?deck|papillon|fly|vis-[àa]-vis/.test(n)) return /haut|bas\b|vers le bas/.test(n)
    ? pick(() => mk('pompes_mains_surelevees', 'Pompes mains surélevées (bas des pecs)', 'max − 2', 'Mains sur le canapé, plus HAUTES que les pieds : même travail que l\'écarté poulie haute vers le bas.', null, 'pecs'), () => mk('ecarte_sol', `Écarté haltères au sol (${kg} kg)`, '12-15', 'Coudes légèrement fléchis, ouvre lentement, serre les pecs en haut.', kg, 'pecs'))
    : pick(() => mk('ecarte_sol', `Écarté haltères au sol (${kg} kg)`, '12-15', 'Coudes légèrement fléchis, ouvre jusqu\'à ce que les coudes touchent le sol, serre les pecs en haut.', kg, 'pecs'), () => mk('pompes_mains_surelevees', 'Pompes mains surélevées (bas des pecs)', 'max − 2', 'Mains plus HAUTES que les pieds = bas des pecs.', null, 'pecs'));
  // DOS
  if (/pull.?over/.test(n)) return pick(() => mk('pullover_sol', `Pull-over au sol (1 haltère ${kg} kg à 2 mains)`, '12-15', 'Bras presque tendus, descends derrière la tête en 3 s, ramène au-dessus de la poitrine.', kg, 'dos'));
  if (/traction|tirage.*(haut|vertical)|lat.?pull/.test(n) && !/triceps|biceps/.test(n)) return pick(
    () => mk('rowing_coude_large', `Rowing 1 bras coude écarté (${kg} kg) — largeur du dos`, '12-15 / bras', 'Appui sur le canapé, tire le coude vers le plafond et sur le côté, 1 s serré en haut, descente 3 s.', kg, 'dos'),
    () => mk('rowing_2_bras_penche', `Rowing 2 haltères buste penché (2 × ${kg} kg)`, '12-15', 'Buste penché à 45°, dos plat, tire les coudes vers les hanches, 1 s serré.', kg, 'dos'),
    () => mk('pullover_sol', `Pull-over au sol (1 haltère ${kg} kg à 2 mains)`, '12-15', 'Bras presque tendus, descente 3 s derrière la tête.', kg, 'dos'));
  if (/rowing|tirage|row\b/.test(n) && !/triceps|biceps/.test(n)) return pick(
    () => mk('rowing_1_bras', `Rowing haltère 1 bras, appui canapé (${kg} kg)`, '12-15 / bras', 'Tire le coude vers la hanche, 1 s serré, descente 3 s. 7 kg c\'est léger → lent et jusqu\'à 1-2 reps de l\'échec.', kg, 'dos'),
    () => mk('rowing_2_bras_penche', `Rowing 2 haltères buste penché (2 × ${kg} kg)`, '12-15', 'Buste penché à 45°, dos plat, tire les coudes vers les hanches.', kg, 'dos'),
    () => mk('rowing_coude_large', `Rowing 1 bras coude écarté (${kg} kg)`, '12-15 / bras', 'Coude vers le côté, 1 s serré en haut.', kg, 'dos'));
  // ÉPAULES
  if (/[ée]l[ée]vation.*lat|lateral/.test(n)) return pick(() => mk('lat_bouteilles', 'Élévations latérales avec 2 bouteilles d\'eau pleines (≈ 1,5 kg)', '15-20', `Ta règle : max 5 kg → pas les haltères de ${kg} kg. Monte jusqu'aux épaules, descente lente.`, 1.5, 'epaules'));
  if (/post[ée]rieur|oiseau|arri[èe]re|face.?pull|reverse/.test(n)) return pick(() => mk('oiseau', `Oiseau buste penché (2 × ${kg} kg)`, '12-15', 'Buste penché, ouvre les bras sur le côté, coudes légèrement fléchis, serre les omoplates.', kg, 'epaules'));
  if (/[ée]paule|militaire|shoulder/.test(n)) return pick(() => mk('dev_epaules', `Développé épaules assis (2 × ${kg} kg)`, '12-15', 'Dos droit, descends jusqu\'aux oreilles, pousse sans verrouiller.', kg, 'epaules'));
  // BRAS (bras DROIT d'abord)
  if (/marteau|hammer/.test(n)) return pick(() => mk('curl_marteau', `Curl marteau (${kg} kg) — bras DROIT d'abord`, '12-15', 'Pouces vers le haut, coudes fixes. Le gauche : mêmes reps, jamais plus.', kg, 'bras'));
  if (/curl/.test(n) && !/poignet|jambe|leg/.test(n)) return pick(
    () => mk('curl_1_bras', `Curl haltère 1 bras (${kg} kg) — bras DROIT d'abord`, '10-15', 'Supination en haut, descente 3 s. Le gauche : même poids, mêmes reps.', kg, 'bras'),
    () => mk('curl_concentre', `Curl concentré (${kg} kg) — bras DROIT d'abord`, '10-15', 'Coude contre la cuisse, serre 1 s en haut.', kg, 'bras'),
    () => mk('curl_marteau', `Curl marteau (${kg} kg) — bras DROIT d'abord`, '12-15', 'Pouces vers le haut, coudes fixes.', kg, 'bras'));
  if (/extension|derri[èe]re la t[êe]te|overhead|skull|barre au front/.test(n)) return pick(() => mk('ext_triceps_tete', `Extension triceps derrière la tête (1 haltère ${kg} kg à 2 mains)`, '12-15', 'Coudes serrés vers le plafond, descente lente.', kg, 'bras'), () => mk('kickback', `Kickback triceps (${kg} kg) — bras DROIT d'abord`, '12-15', 'Buste penché, coude collé au corps, tends le bras derrière.', kg, 'bras'));
  if (/triceps|pushdown|corde/.test(n)) return pick(() => mk('pompes_serrees', `Pompes ${board} serrées (triceps)`, 'max − 2', 'Coudes collés au corps.', null, 'bras'), () => mk('kickback', `Kickback triceps (${kg} kg) — bras DROIT d'abord`, '12-15', 'Buste penché, coude collé au corps, tends le bras derrière.', kg, 'bras'), () => mk('ext_triceps_tete', `Extension triceps derrière la tête (${kg} kg)`, '12-15', 'Coudes serrés.', kg, 'bras'));
  if (/poignet|avant-bras|wrist|farmer|fermier/.test(n)) return pick(() => mk('curl_poignets', `Curl poignets assis (${kg} kg)`, '20', 'Avant-bras posés sur les cuisses, seuls les poignets bougent.', kg, 'bras'));
  // ABDOS / CARDIO
  if (e.muscle === 'cardio' || /tapis|v[ée]lo|elliptique|rameur|marche|course/.test(n)) return pick(() => mk('marche_rapide', 'Marche rapide dehors (ou escaliers)', /\d+\s*min/.exec(e.reps)?.[0] ?? '20 min', 'Allure où tu peux parler mais pas chanter. Pas de jambes lourdes : juste marcher vite.', null, 'cardio'));
  if (/b[ûu]cheron|rotation|woodchop|oblique/.test(n)) return pick(() => mk('bucheron', `Bûcheron debout (1 haltère ${kg} kg à 2 mains)`, e.reps, 'Rotation du buste, bras tendus, de la hanche vers l\'épaule opposée.', kg, 'abdos'));
  if (/relev[ée]|genou|leg raise|jambes/.test(n)) return pick(() => mk('releves_jambes', 'Relevés de jambes allongé', '12-15', 'Bas du dos collé au sol, descente lente sans toucher le sol.', null, 'abdos'));
  if (/gainage lat|side plank/.test(n)) return pick(() => mk('gainage_lateral', 'Gainage latéral', e.reps, 'Hanches hautes, corps aligné.', null, 'abdos'));
  if (/gainage|planche|plank/.test(n)) return pick(() => mk('gainage', 'Gainage planche', e.reps, 'Fesses serrées, ventre rentré, corps droit.', null, 'abdos'));
  if (e.muscle === 'abdos' || /crunch|abdo/.test(n)) return pick(() => mk('crunch', 'Crunch au sol', '15-20', 'Enroule le haut du dos, souffle en montant, ne tire pas sur la nuque.', null, 'abdos'), () => mk('crunch_leste', `Crunch lesté (haltère ${kg} kg sur la poitrine)`, '12-15', 'Haltère tenu contre la poitrine, enroule lentement.', kg, 'abdos'), () => mk('releves_jambes', 'Relevés de jambes allongé', '12-15', 'Bas du dos collé au sol.', null, 'abdos'));
  // Inconnu → par muscle
  const byM: Record<string, () => HomeAppEx> = {
    pecs: () => mk('pompes_planche_larges', `Pompes ${board} larges`, 'max − 2', 'Descente 3 s, remonte fort.', null, 'pecs'),
    dos: () => mk('rowing_1_bras', `Rowing haltère 1 bras (${kg} kg)`, '12-15 / bras', 'Tire le coude vers la hanche.', kg, 'dos'),
    epaules: () => mk('dev_epaules', `Développé épaules assis (2 × ${kg} kg)`, '12-15', 'Dos droit.', kg, 'epaules'),
    bras: () => mk('curl_1_bras', `Curl haltère 1 bras (${kg} kg) — bras DROIT d'abord`, '10-15', 'Descente 3 s.', kg, 'bras'),
  };
  return pick(byM[e.muscle] ?? (() => mk('crunch', 'Crunch au sol', '15-20', 'Enroule le haut du dos.', null, 'abdos')));
}

const WARM_HOME = (): HomeAppEx => ({ id: 'warmup_maison', name: 'Échauffement maison', muscle: 'cardio', sets: 1, reps: '5 min', rest: 0, alt: [], kg: null, from: 'Échauffement',
  tip: 'Cercles de bras, 20 pompes contre le mur, 1 série très légère du 1er exercice. Tu dois avoir chaud, pas être essoufflé.' });
const ABS_FINISH = (): HomeAppEx[] => [
  { id: 'home_crunch', name: 'Crunch au sol', muscle: 'abdos', sets: 3, reps: '15-20', rest: 45, alt: [], kg: null, from: 'Abdos (tu l\'as demandé)', tip: 'Enroule le haut du dos, souffle en montant.' },
  { id: 'home_gainage', name: 'Gainage planche', muscle: 'abdos', sets: 3, reps: '45 s', rest: 45, alt: [], kg: null, from: 'Abdos (tu l\'as demandé)', tip: 'Fesses serrées, ventre rentré, corps droit.' },
];

/** La séance de salle de ce jour-là (ou la prochaine) traduite exercice par exercice, prête pour l'app (même format que /api/sport). */
export async function homeSportSession(date?: string) {
  const sc = await import('./sport-coach.js');
  const o = await sc.sportOverview();
  const all = [o.today, o.next, ...(o.planned ?? [])].filter(Boolean) as Array<NonNullable<typeof o.today>>;
  const base = (date ? all.find(x => x.date === date) : null) ?? o.today ?? o.next ?? all[0];
  if (!base) return null;
  const g = await homeGear();
  const used = new Set<string>();
  const list = base.exercises.filter(e => !String(e.id).startsWith('warmup_')).map(e => homeOf(e as GymEx, g, used));
  if (!list.some(e => e.muscle === 'abdos')) list.push(...ABS_FINISH());
  const exs = [WARM_HOME(), ...list];
  const dec = await sc.decorateExercises(exs.map(({ kg: _k, from: _f, ...e }) => ({ ...e, muscle: e.muscle as never })), date ?? base.date);
  const exercises = dec.map((e, i) => {
    const kg = exs[i]!.kg;
    const sug = kg == null ? { kg: null, ...(e.suggestion.last ? { last: e.suggestion.last } : {}), ...(e.suggestion.prev ? { prev: e.suggestion.prev } : {}) }
      : { ...e.suggestion, kg, plan: Array(e.sets).fill(kg), goal: `À la maison : ${kg} kg → monte les reps, descente lente.` };
    return { ...e, suggestion: sug, tip: `${e.tip}${exs[i]!.from && !e.id.startsWith('warmup_') ? ` (remplace « ${exs[i]!.from} »)` : ''}` };
  });
  const sets = exercises.reduce((a, e) => a + e.sets, 0);
  const estMin = Math.round(5 + sets * 2.3 + (exercises.some(e => e.muscle === 'cardio' && e.id !== 'warmup_maison') ? 20 : 0));
  return { ...base, date: date ?? base.date, label: `🏠 ${base.label}`, emoji: '🏠', focus: `${base.focus} · à la maison`, custom: `Ta séance de salle traduite avec 2 haltères de ${g.dumbbellKg} kg + planche à pompes`, home: true, exercises, finisher: null, estMin, warmup: 'Échauffement maison 5 min' };
}

export interface HomeSession { date: string; from: string; label: string; minutes: number; kcal: number; exercises: HomeEx[] }

export async function homeSessionFor(date: string): Promise<HomeSession> {
  const sc = await import('./sport-coach.js');
  const { label } = await sc.plannedSessionLabel(date);
  const g = await homeGear();
  const kind = kindOf(label);
  // 24/11 : même traduction 1 pour 1 que l'app (bras + dos compris) ; ancienne liste fixe seulement si pas de séance trouvée
  const app = await homeSportSession(date).catch(() => null);
  const exercises: HomeEx[] = app ? app.exercises.filter(e => !e.id.startsWith('warmup_')).map(e => ({ name: e.name, sets: e.sets, reps: e.reps, zone: e.muscle === 'epaules' ? 'épaules' : e.muscle, tip: e.tip })) : blocks(kind, g);
  const from = app ? app.label.replace(/^🏠 /, '') : label;
  const sets = exercises.reduce((a, e) => a + e.sets, 0);
  const minutes = app ? app.estMin : Math.round(5 + sets * 2.2 + (kind === 'core' ? 25 : 0));
  const kg = await import('./forme.js').then(m => m.getFormeProfile('kouider')).then(p => p.weightKg).catch(() => 77);
  const kcal = Math.round(((kind === 'core' ? 4.5 : 4) - 1) * kg * minutes / 60);   // muscu haltères légers ≈ MET 4 (honnête, la montre corrige)
  const s: HomeSession = { date, from, label: `🏠 MAISON · ${from.replace(/^HAUT [ABC] · /, '')}`, minutes, kcal, exercises };
  await kvSet(`kouider:forme:home:${date}`, JSON.stringify(s), 8 * 86400).catch(() => {});
  return s;
}

export function homeSessionText(s: HomeSession): string {
  const d = new Date(`${s.date}T12:00:00Z`).toLocaleDateString('fr-FR', { timeZone: 'Europe/Brussels', weekday: 'long', day: 'numeric', month: 'long' });
  return [
    `🏠 Séance MAISON du ${d} — à la place de « ${s.from} » (≈ ${s.minutes} min, ≈ ${s.kcal} kcal)`,
    'Échauffement 5 min : cercles de bras, 20 pompes contre le mur, 1 série de rowing très légère.',
    ...s.exercises.map((e, i) => `${i + 1}. ${e.name} — ${e.sets} × ${e.reps} (${e.zone})\n   ${e.tip}`),
    'Repos 60-90 s entre les séries. Haltères légers → chaque série doit finir DUR (1-2 reps en réserve).',
    '⌚ Lance « Renforcement musculaire » sur la montre : tes calories brûlées seront mesurées, pas estimées.',
    'Elle est aussi dans l\'app FORME → Entraînement → bouton 🏠 Maison (séries, kg, chrono, comme à la salle).',
    'Quand c\'est fini, dis-moi « séance maison faite » et je la note.',
  ].join('\n');
}
