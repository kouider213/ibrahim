import { kvJson, kvPut, ai } from './ai-util.js';
import { localNow } from './morning-routine.js';
import { supabase } from './supabase.js';

// MIROIR DU FUTUR (Kouider 31/10 : « le but c'est d'évoluer, être une meilleure personne, un meilleur entrepreneur ;
// si je continue comme ça, où se trouve mon évolution, je serai quoi dans 1 an, 2 ans… »).
//  • Chaque dimanche soir : photo de la semaine (score d'évolution /100 sur 4 piliers + chiffres) → courbe dans le temps.
//  • « Mon futur » : projection 1/2/3/5/10 ans À PARTIR DE SES VRAIS CHIFFRES — « si tu continues comme ça » contre
//    « ta meilleure version » (le chemin vers ses objectifs) + portrait de qui il sera + les 3 changements qui font la différence.
// Honnête : la fiabilité dépend du nombre de mois de données, toujours affichée.

type Row = Record<string, unknown>;
const S = (v: unknown) => String(v ?? '');
const N = (v: unknown) => Number(v ?? 0) || 0;
const eur = (n: number) => `${Math.round(n).toLocaleString('fr-FR')} €`;
const BARS = '▁▂▃▄▅▆▇█';
const EVO = 'gc:evo';

interface Snap { date: string; score: number; piliers: Record<string, number>; ca30: number; wins: number; principles: number; parole: number }

async function piliers(): Promise<Record<string, number>> {
  return import('./grand-coach.js').then(m => m.piliersNow()).catch(() => ({ Business: 0, Santé: 0, Famille: 0, Amis: 0 }));
}

/** CA et bénéfice des 12 derniers mois, mois par mois. */
export async function monthly(): Promise<{ months: Array<{ m: string; ca: number; pr: number }>; ca12: number; pr12: number; withData: number; firstMonth: string }> {
  const now = localNow().date;
  const from = new Date(Date.UTC(+now.slice(0, 4) - 1, +now.slice(5, 7), 1)).toISOString().slice(0, 7);
  const { data } = await supabase.from('bookings').select('start_date, final_price, total_price, profit, profit_kouider, status').gte('start_date', `${from}-01`);
  const B = ((data ?? []) as Row[]).filter(b => !/REJECT|CANCEL/i.test(S(b['status'])));
  const months: Array<{ m: string; ca: number; pr: number }> = [];
  for (let i = 0; i < 12; i++) {
    const m = new Date(Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1 + i, 1)).toISOString().slice(0, 7);
    const l = B.filter(b => S(b['start_date']).slice(0, 7) === m);
    months.push({ m, ca: l.reduce((s, b) => s + N(b['final_price'] ?? b['total_price']), 0), pr: l.reduce((s, b) => s + N(b['profit_kouider'] ?? b['profit']), 0) });
  }
  const first = months.find(x => x.ca > 0)?.m ?? now.slice(0, 7);
  const withData = months.filter(x => x.m >= first).length;
  return { months, ca12: months.reduce((s, x) => s + x.ca, 0), pr12: months.reduce((s, x) => s + x.pr, 0), withData, firstMonth: first };
}

/** Photo de la semaine (dimanche soir, silencieuse). */
export async function snapshot(): Promise<Snap> {
  const date = localNow().date;
  const [p, mo, wins, pr, parole] = await Promise.all([
    piliers(), monthly(), kvJson<unknown[]>('gc:wins', []), kvJson<unknown[]>('gc:principles', []),
    import('./grand-coach-plus.js').then(m => m.wordScore()).then(t => Number(/(\d+) %/.exec(t)?.[1] ?? 0)).catch(() => 0),
  ]);
  const snap: Snap = { date, score: Math.round(Object.values(p).reduce((s, v) => s + v, 0) * 2.5), piliers: p, ca30: mo.months.at(-1)?.ca ?? 0, wins: wins.length, principles: pr.length, parole };
  const l = (await kvJson<Snap[]>(EVO, [])).filter(x => x.date !== date);
  l.push(snap);
  await kvPut(EVO, l.slice(-520));
  return snap;
}

export async function evolution(): Promise<string> {
  const l = await kvJson<Snap[]>(EVO, []);
  const cur = l.at(-1) ?? await snapshot();
  const hist = l.length ? l : [cur];
  const curve = hist.slice(-12).map(x => BARS[Math.max(0, Math.min(7, Math.round(x.score / 100 * 7)))]).join('');
  const prev = hist.length > 1 ? hist[hist.length - 2]! : null;
  const first = hist[0]!;
  const delta = (a: number, b: number) => (a > b ? `+${a - b}` : `${a - b}`);
  if (hist.length < 2) return `📈 Score d'évolution — point de départ : ${cur.score}/100 (${Object.entries(cur.piliers).map(([k, v]) => `${k} ${v}/10`).join(' · ')}).\nC'est normal qu'il soit bas : je ne mesure que depuis aujourd'hui (actions cochées, victoires, examen du soir, moments en famille notés). Chaque dimanche j'ajoute un point à ta courbe : le seul but, c'est qu'elle monte.`;
  return [`📈 Ton score d'évolution : ${cur.score}/100${prev ? ` (${delta(cur.score, prev.score)} sur la semaine)` : ''}`,
    `Courbe (semaines) : ${curve}${hist.length < 3 ? '  ← elle se dessine chaque dimanche' : ''}`,
    ...Object.entries(cur.piliers).map(([k, v]) => `• ${k} : ${v}/10${prev ? ` (${delta(v, prev.piliers[k] ?? 0)})` : ''}`),
    `🫙 ${cur.wins} victoires · 📖 ${cur.principles} principes · 🤝 parole ${cur.parole} %`,
    hist.length > 4 ? `Depuis le ${first.date.slice(8)}/${first.date.slice(5, 7)} : ${delta(cur.score, first.score)} points. ${cur.score > first.score ? 'Tu évolues, c\'est mesuré.' : 'Tu stagnes : on change quelque chose cette semaine.'}` : ''].filter(Boolean).join('\n');
}

/** « Si je continue comme ça, je serai quoi dans 1 an, 2 ans… » */
export async function futur(): Promise<string> {
  const [mo, fortune, goals, vision, split, evo, p] = await Promise.all([
    monthly(), import('./brain-plus.js').then(m => m.fortune()).catch(() => null),
    kvJson<Array<{ name: string; target: number; unit: string; deadline: string; metric: string; history?: Array<{ value: number }> }>>('lifegps', []),
    kvJson<Record<string, string> | null>('gc:vision', null), kvJson<{ epargne: number }>('gc:split', { epargne: 30 }),
    kvJson<Snap[]>(EVO, []), piliers(),
  ]);
  const reliability = mo.withData >= 12 ? 'bonne (12 mois de données)' : mo.withData >= 6 ? `moyenne (${mo.withData} mois de données)` : `faible (${mo.withData} mois de données)`;
  // Année type = les 12 derniers mois (la saison d'été de la diaspora y est déjà)
  const caYear = mo.ca12, prYear = mo.pr12 || mo.ca12 * 0.25;
  const saveYear = prYear * split.epargne / 100;
  const goalCa = goals.find(g => g.metric === 'ca_mois');
  const targetYear = (goalCa?.target ?? 3000) * 12;
  const yearsToGoal = goalCa ? Math.max(0.5, (Date.parse(goalCa.deadline) - Date.now()) / (365 * 86_400_000)) : 2;
  const g = caYear > 0 ? Math.pow(targetYear / caYear, 1 / yearsToGoal) - 1 : 1;   // croissance annuelle nécessaire
  const H = [1, 2, 3, 5, 10];
  const fort0 = fortune?.total ?? 0;
  const rowsA = H.map(y => ({ y, ca: caYear, save: saveYear * y, fortune: fort0 + saveYear * y }));
  const rowsB = H.map(y => {
    let ca = caYear, cum = 0;
    // Croissance jusqu'à l'objectif (sans le dépasser), puis +15 %/an
    for (let k = 1; k <= y; k++) { ca = ca < targetYear ? Math.min(targetYear, ca * (1 + g)) : ca * 1.15; cum += ca * (prYear / Math.max(1, caYear)) * split.epargne / 100; }
    return { y, ca, save: cum, fortune: fort0 + cum };
  });
  const weight = goals.find(x => x.metric === 'poids');
  const habits = { piliers: p, streak: (await kvJson<{ n: number }>('gc:streak', { n: 0 })).n, evo: evo.slice(-6).map(x => x.score) };
  const y0 = +localNow().date.slice(0, 4);
  const known = fort0 > 0;
  const table = (r: typeof rowsA) => r.map(x => `• ${x.y} an${x.y > 1 ? 's' : ''} (${y0 + x.y}) : CA ${eur(x.ca)}/an (${eur(x.ca / 12)}/mois) · épargne FIK cumulée ${eur(x.save)}${known ? ` · patrimoine ≈ ${eur(x.fortune)}` : ''}`).join('\n');
  // Piliers mesurés seulement depuis le lancement du coach (31/10) : pas de verdict sur la famille / les amis avant 3 semaines
  const measuredWeeks = evo.length;
  const facts = `CA 12 derniers mois ${eur(caYear)} (mois : ${mo.months.map(x => `${x.m.slice(5)}:${Math.round(x.ca)}`).join(' ')}), bénéfice ${eur(prYear)}, ${known ? `patrimoine ${eur(fort0)}` : 'patrimoine non renseigné (ne dis pas qu\'il a 0)'}. Années : dans 1 an = ${y0 + 1}, 2 ans = ${y0 + 2}, 5 ans = ${y0 + 5}, 10 ans = ${y0 + 10} ; départ de Belgique visé fin 2028. Il est DÉJÀ salarié en Belgique (FIK est à côté) : le risque si rien ne change, c'est de rester salarié en Belgique, pas de « reprendre un emploi ». Objectif : ${eur(targetYear / 12)}/mois avant ${goalCa?.deadline ?? '2028'} → il faut +${Math.round(g * 100)} %/an. ${measuredWeeks >= 3 ? `Piliers mesurés (sur 10) : ${JSON.stringify(p)}.` : 'Piliers (business, santé, famille, amis) : PAS ENCORE MESURÉS (le coach vient de démarrer) — ne dis RIEN de négatif sur sa famille, ses amis ou sa santé.'} Série d'actions ${habits.streak} j (le suivi vient de démarrer). ${weight ? `Objectif poids ${weight.target} kg (actuel ${weight.history?.at(-1)?.value ?? '?'} kg).` : ''} Vision : ${vision ? JSON.stringify(vision) : 'grand businessman indépendant à Oran, quitter la Belgique fin 2028'}.`;
  const portrait = await ai(`${facts}\n\nÉcris le PORTRAIT DE SON FUTUR, honnête et motivant, tutoiement, français simple. Format exact :\n🛤️ SI TU CONTINUES COMME ÇA\n• Dans 1 an : …\n• Dans 2 ans : …\n• Dans 5 ans : …\n• Dans 10 ans : …\n(chaque ligne : l'entrepreneur ET la personne, 1 à 2 phrases, basées sur les chiffres : CA à peu près plat, départ d'Oran repoussé si rien ne change — lucide mais sans dramatiser, sans insulte, jamais de remarque sur son corps)\n\n🚀 TA MEILLEURE VERSION (si tu tiens le cap chaque jour)\n• Dans 1 an / 2 ans / 5 ans / 10 ans : … (même format, chemin vers sa vision)\n\n🔑 LES 3 CHANGEMENTS QUI FONT TOUTE LA DIFFÉRENCE\n1. … 2. … 3. … (concrets, à commencer cette semaine, chacun relié à un grand entrepreneur)\n\nN'invente aucun chiffre en dehors de ceux donnés. Pas de nutrition.`, { system: 'Tu es le Grand Coach de Kouider : lucide, exigeant, bienveillant, comme un grand frère. Tu dis la vérité des chiffres sans jamais l\'humilier (pas de « amateur », « nul », « à l\'agonie »), sans parler de son poids ou de son corps, sans inventer de solitude ou de problème familial. Pas d\'intro ni de conclusion longue : commence directement par 🛤️.', max: 1100 }).catch(() => '');
  return [`🔭 TON FUTUR — calculé sur tes vrais chiffres (fiabilité ${reliability})`, '',
    '🛤️ Si tu continues comme ça (même année qu\'aujourd\'hui) :', table(rowsA), '',
    `🚀 Ta meilleure version (le chemin vers ${eur(targetYear / 12)}/mois : +${Math.round(g * 100)} % par an${g > 1 ? ' — énorme : il faut changer d\'échelle, pas juste faire un peu plus' : ''}) :`, table(rowsB), '',
    portrait,
    '', `Hypothèses : épargne = ${split.epargne} % du bénéfice FIK (règle « répartition »), aucun crédit${known ? ', patrimoine d\'après « ta fortune »' : ' ; ton patrimoine n\'est pas encore renseigné (dis « ma fortune » pour l\'ajouter)'}. Ce n'est pas une promesse : c'est un miroir. Il se met à jour chaque mois.`].join('\n');
}
