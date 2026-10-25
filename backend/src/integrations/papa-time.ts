import { kvGet, kvSet } from './app-store.js';
import { localNow } from './morning-routine.js';
import { isDayOff } from './kouider-dossier.js';
import { queueTelegramMessage } from '../notifications/tg-outbox.js';

// TEMPS AVEC LE PETIT (Kouider 25/10) : son fils a son propre compagnon de jeu (« Fennou » dans l'app) et Dzaryx
// rappelle à Kouider de passer du temps avec lui : idée d'activité au retour à la maison, idée de sortie les jours off,
// petit rappel s'il n'y a rien eu depuis 2 jours, bilan le dimanche. Les parties jouées dans l'app comptent toutes seules.
// VIE PRIVÉE : dépôt PUBLIC → prénom, goûts et journal uniquement dans app_kv, jamais dans le code.

const PROFILE_KEY = 'kouider:kid:profile';
const LOG_KEY = 'kouider:kid:log';
const NUDGE_KEY = (date: string) => `kouider:kid:nudged:${date}`;

export interface KidProfile { name: string; mascot: string; born?: string; likes: string[] }
interface LogEntry { at: number; date: string; kind: 'jeu' | 'papa' | 'maman'; minutes: number; what: string; wins?: number }

export async function getKidProfile(): Promise<KidProfile> {
  try {
    const p = JSON.parse((await kvGet(PROFILE_KEY)) ?? '{}') as Partial<KidProfile>;
    return { name: p.name || 'le petit', mascot: p.mascot || 'Fennou', born: p.born, likes: p.likes ?? [] };
  } catch { return { name: 'le petit', mascot: 'Fennou', likes: [] }; }
}

async function readLog(): Promise<LogEntry[]> {
  try { return JSON.parse((await kvGet(LOG_KEY)) ?? '[]') as LogEntry[]; } catch { return []; }
}

export async function logKidTime(e: Omit<LogEntry, 'at' | 'date'>): Promise<void> {
  const log = await readLog();
  log.push({ ...e, at: Date.now(), date: localNow().date, minutes: Math.max(1, Math.min(240, Math.round(e.minutes))), what: e.what.slice(0, 120) });
  await kvSet(LOG_KEY, JSON.stringify(log.slice(-400)));
}

const ageMonths = (born?: string) => {
  if (!born || !/^\d{4}-\d{2}/.test(born)) return 18;
  const [y, m] = born.split('-').map(Number), n = localNow().date.split('-').map(Number);
  return (n[0]! - y!) * 12 + (n[1]! - m!);
};

// Idées sans écran, adaptées à l'âge (tirées au hasard, pas deux fois de suite)
const IDEAS: Array<{ max: number; home: string[]; out: string[] }> = [
  { max: 24, home: [
    'bulles de savon : il essaie de les attraper',
    'un imagier : tu montres les animaux, il les touche, vous faites les bruits ensemble',
    'coucou-caché avec son doudou sous un tissu',
    'empiler des cubes ou des gobelets… et tout faire tomber',
    'danser ensemble sur sa chanson préférée',
    'une balle à rouler entre vous deux, assis par terre',
    'le bain avec des gobelets à remplir et vider',
    'gros crayons sur une grande feuille par terre',
    'une chanson à gestes (« Ainsi font font font »)',
    'cache-cache : tu te caches derrière la porte, il te trouve',
  ], out: [
    'le parc : toboggan, balançoire, courir après les pigeons',
    'une balade en poussette en nommant tout ce que vous voyez (chien, bus, arbre…)',
    'la ferme ou le petit zoo pour voir les vrais animaux de ses jeux',
    'un tour au marché ou à la boulangerie, il tient le pain',
    'la plaine de jeux couverte s\'il pleut',
  ] },
  { max: 999, home: [
    'construire une cabane avec des coussins et une couverture',
    'pâte à modeler : faire les animaux de ses jeux',
    'un puzzle de 4 à 6 pièces ensemble',
    'compter les marches, les voitures rouges, les pommes',
    'une histoire où c\'est lui qui choisit la suite',
    'faire un gâteau ensemble, il verse et il mélange',
  ], out: [
    'le parc avec un ballon',
    'la piscine (bassin pour petits)',
    'la ferme pédagogique',
    'une balade en vélo draisienne',
  ] },
];

let lastIdea = '';
function idea(kind: 'home' | 'out', born?: string): string {
  const band = IDEAS.find(b => ageMonths(born) < b.max) ?? IDEAS[IDEAS.length - 1]!;
  const list = band[kind].filter(i => i !== lastIdea);
  lastIdea = list[Math.floor(Math.random() * list.length)]!;
  return lastIdea;
}

const sinceDays = (log: LogEntry[], days: number) => log.filter(e => e.at > Date.now() - days * 86_400_000);
const together = (log: LogEntry[]) => log.filter(e => e.kind !== 'maman');

/** Ligne ajoutée au message « bien rentré » (presence) — vide s'il a déjà passé du temps avec lui aujourd'hui ou s'il est tard. */
export async function homeEveningLine(): Promise<string> {
  const hour = Number(localNow().hhmm.slice(0, 2));
  if (hour >= 20) return '';
  const [p, log] = await Promise.all([getKidProfile(), readLog()]);
  if (together(log).some(e => e.date === localNow().date)) return '';
  return `\n🦊 15 min avec ${p.name} avant le bain ? Idée : ${idea('home', p.born)}.`;
}

/** 9h30 jours off : idée de sortie ; 18h30 les autres jours : rien depuis 2 jours → petit rappel. Une fois par jour max. */
export async function jobPapaTime(): Promise<string> {
  const now = localNow(), hour = Number(now.hhmm.slice(0, 2));
  if (await kvGet(NUDGE_KEY(now.date)).catch(() => null)) return 'déjà fait aujourd\'hui';
  const [p, log, off] = await Promise.all([getKidProfile(), readLog(), isDayOff()]);
  let msg = '';
  if (hour < 12 && off) {
    msg = `☀️ Jour off ! Une idée pour toi et ${p.name} aujourd'hui : ${idea('out', p.born)}.\nEt ce soir, une partie avec ${p.mascot} dans l'app (page ${p.mascot.toUpperCase()}).`;
  } else if (hour >= 12 && !off) {
    const last = together(log).sort((a, b) => b.at - a.at)[0];
    if (last && last.at > Date.now() - 2 * 86_400_000) return 'temps passé récemment';
    msg = `💛 Ça fait ${last ? `${Math.floor((Date.now() - last.at) / 86_400_000)} jours` : 'un moment'} que je n'ai rien noté avec ${p.name}. Ce soir, même 15 minutes : ${idea('home', p.born)} ?\n(Dis-moi « j'ai joué avec ${p.name} » et je le note.)`;
  }
  if (!msg) return 'rien à dire';
  await kvSet(NUDGE_KEY(now.date), '1', 36 * 3600);
  await queueTelegramMessage(msg, undefined, 'kouider', undefined, true);
  return 'envoyé';
}

function weekText(p: KidProfile, log: LogEntry[]): string {
  const w = sinceDays(log, 7);
  const games = w.filter(e => e.kind === 'jeu'), papa = w.filter(e => e.kind === 'papa'), maman = w.filter(e => e.kind === 'maman');
  const mins = (l: LogEntry[]) => l.reduce((s, e) => s + e.minutes, 0);
  const days = new Set(together(w).map(e => e.date)).size;
  const byGame = new Map<string, number>();
  for (const g of games) byGame.set(g.what, (byGame.get(g.what) ?? 0) + 1);
  const fav = [...byGame.entries()].sort((a, b) => b[1] - a[1])[0];
  return [
    `🦊 La semaine de ${p.name}`,
    `• Jeux avec ${p.mascot} : ${games.length} partie${games.length > 1 ? 's' : ''} (${mins(games)} min)${fav ? `, son préféré : ${fav[0]}` : ''}${games.some(g => g.wins) ? `, ${games.reduce((s, g) => s + (g.wins ?? 0), 0)} réussites` : ''}`,
    `• Moments avec papa notés : ${papa.length}${papa.length ? ` (${papa.map(e => e.what).slice(-3).join(', ')})` : ''}`,
    ...(maman.length ? [`• Avec maman : ${maman.length}`] : []),
    `• Jours où vous avez partagé quelque chose : ${days}/7`,
    days >= 5 ? '👏 Super semaine de papa.' : days >= 3 ? 'Belle semaine. La semaine prochaine, on vise un petit moment chaque jour ?' : 'Semaine chargée. On se fixe 15 minutes par jour cette semaine ? Je te le rappellerai.',
  ].join('\n');
}

/** Dimanche soir : bilan de la semaine du petit. */
export async function jobPapaWeekly(): Promise<string> {
  const [p, log] = await Promise.all([getKidProfile(), readLog()]);
  await queueTelegramMessage(weekText(p, log), undefined, 'kouider', undefined, true);
  return 'envoyé';
}

/** Outil papa_time (Kouider seulement). */
export async function papaTimeTool(input: Record<string, unknown>, sessionId?: string): Promise<string> {
  if (/houari/i.test(sessionId ?? '')) return '❌ Réservé à Kouider.';
  const action = String(input['action'] ?? 'status');
  const p = await getKidProfile();
  if (action === 'log') {
    const minutes = Number(input['minutes']) || 20;
    const who = input['who'] === 'maman' ? 'maman' : 'papa';
    await logKidTime({ kind: who, minutes, what: String(input['what'] ?? 'jeu ensemble').trim() || 'jeu ensemble' });
    if (input['now'] === true) {
      const { setDnd } = await import('../notifications/dnd.js');
      await setDnd({ until: Date.now() + minutes * 60_000, why: `moment avec ${p.name}` });
      return `✅ Noté. Je ne te dérange pas pendant ${minutes} min, profite de ${p.name} 💛`;
    }
    return `✅ Noté : ${minutes} min avec ${p.name} (${who}).`;
  }
  if (action === 'idea') return `Idée pour ${p.name} : ${idea(input['outside'] === true ? 'out' : 'home', p.born)}.`;
  if (action === 'profile') {
    const like = String(input['like'] ?? '').trim();
    const next: KidProfile = { ...p, likes: like ? [...p.likes.filter(l => l.toLowerCase() !== like.toLowerCase()), like.slice(0, 80)].slice(-30) : p.likes };
    if (typeof input['name'] === 'string' && input['name'].trim()) next.name = input['name'].trim().slice(0, 30);
    if (typeof input['born'] === 'string' && /^\d{4}-\d{2}$/.test(input['born'])) next.born = input['born'];
    await kvSet(PROFILE_KEY, JSON.stringify(next));
    return `✅ Profil de ${next.name} : ${next.likes.length ? `aime ${next.likes.join(', ')}` : 'pas encore de goûts notés'}.`;
  }
  const log = await readLog();
  return `${weekText(p, log)}\nCe qu'il aime : ${p.likes.join(', ') || '(rien noté)'}.`;
}
