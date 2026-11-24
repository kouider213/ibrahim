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

export interface HomeSession { date: string; from: string; label: string; minutes: number; kcal: number; exercises: HomeEx[] }

export async function homeSessionFor(date: string): Promise<HomeSession> {
  const sc = await import('./sport-coach.js');
  const { label } = await sc.plannedSessionLabel(date);
  const g = await homeGear();
  const kind = kindOf(label);
  const exercises = blocks(kind, g);
  const sets = exercises.reduce((a, e) => a + e.sets, 0);
  const minutes = Math.round(5 + sets * 2.2 + (kind === 'core' ? 25 : 0));
  const kg = await import('./forme.js').then(m => m.getFormeProfile('kouider')).then(p => p.weightKg).catch(() => 77);
  const kcal = Math.round(((kind === 'core' ? 4.5 : 4) - 1) * kg * minutes / 60);   // muscu haltères légers ≈ MET 4 (honnête, la montre corrige)
  const s: HomeSession = { date, from: label, label: `🏠 MAISON · ${label.replace(/^HAUT [ABC] · /, '')}`, minutes, kcal, exercises };
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
    'Quand c\'est fini, dis-moi « séance maison faite » et je la note.',
  ].join('\n');
}
