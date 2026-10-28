/**
 * DZARYX SE CODE LUI-MÊME (28/10/2026) — demande de Kouider : « je dois pouvoir lui demander de se coder quelque chose,
 * et quand il voit un bug ou une amélioration, il le fait seul, la nuit pendant que je dors, puis il me dit ce qu'il a fait ».
 *
 * Ce module ne fait que tenir la FILE (app_kv `dev:queue`). Le vrai travail est fait sur le VPS par
 * scripts/night-dev.mjs (pm2 dzaryx-dev) : Claude Code en mode auto dans /root/dzaryx — code, tests, mise en ligne
 * (skill dzaryx-livraison), puis rapport sur Telegram (le matin pour la nuit, tout de suite pour « maintenant »).
 * Sources : Kouider (outil se_coder), l'auto-critique de la nuit (bugs trouvés), la veille hebdo (nuit de samedi à dimanche).
 */
import { kvJson, kvPut } from './ai-util.js';

export interface DevTask {
  id: string; text: string; source: 'kouider' | 'auto' | 'veille'; now: boolean;
  status: 'todo' | 'running' | 'done' | 'failed' | 'cancelled'; at: string; done_at?: string; summary?: string;
  kind?: 'code' | 'undo'; from_sha?: string; to_sha?: string;   // commits du chantier (notés par l'atelier) → « annule »
}
const KEY = 'dev:queue';

export async function readDevQueue(): Promise<DevTask[]> { return kvJson<DevTask[]>(KEY, []); }

export async function addDevTask(text: string, source: DevTask['source'], now = false, extra: Partial<DevTask> = {}): Promise<DevTask> {
  const q = await readDevQueue();
  const same = q.find(t => t.status === 'todo' && t.text.trim().toLowerCase() === text.trim().toLowerCase());
  if (same) return same;
  const t: DevTask = { id: Math.random().toString(36).slice(2, 7), text: text.trim(), source, now, status: 'todo', at: new Date().toISOString(), ...extra };
  q.push(t);
  await kvPut(KEY, q.slice(-80));
  return t;
}

const label = (t: DevTask) => `${t.id} ${t.source === 'kouider' ? '👤' : t.source === 'veille' ? '🔭' : '🐞'} ${t.text.slice(0, 160)}`;

export async function selfDevTool(input: Record<string, unknown>): Promise<string> {
  const action = String(input['action'] ?? 'add');
  const q = await readDevQueue();
  if (action === 'add') {
    const req = String(input['request'] ?? '').trim();
    if (!req) return '❌ Il me faut la demande complète (ce qu\'il veut que je code).';
    const now = input['now'] === true;
    const t = await addDevTask(req, 'kouider', now);
    return now
      ? `🛠️ C'est lancé (n° ${t.id}) : je code ça tout de suite, je teste, je mets en ligne et je t'envoie le rapport sur Telegram dès que c'est fini (en général 10 à 40 min).`
      : `🛠️ Noté (n° ${t.id}) : je le code cette nuit pendant que tu dors, je teste, je mets en ligne, et tu as le rapport au réveil. Dis « fais-le maintenant » si c'est pressé.`;
  }
  if (action === 'list') {
    const open = q.filter(t => t.status === 'todo' || t.status === 'running');
    return open.length ? `🛠️ À coder :\n${open.map(t => `• ${label(t)}${t.status === 'running' ? ' (en cours)' : t.now ? ' (maintenant)' : ' (cette nuit)'}`).join('\n')}` : 'Rien en attente de code.';
  }
  if (action === 'report') {
    const done = q.filter(t => t.status === 'done' || t.status === 'failed').slice(-8);
    return done.length ? done.map(t => `${t.status === 'done' ? '✅' : '❌'} ${t.done_at?.slice(0, 10) ?? ''} ${t.text.slice(0, 100)}\n   → ${t.summary ?? ''}`).join('\n') : 'Je n\'ai encore rien codé seul.';
  }
  if (action === 'now' || action === 'cancel') {
    const id = String(input['id'] ?? '').trim();
    const t = q.find(x => x.id === id && x.status === 'todo') ?? (action === 'now' && !id ? q.filter(x => x.status === 'todo').pop() : undefined);
    if (!t) return `❌ Pas de tâche en attente ${id ? `n° ${id}` : ''}.`;
    if (action === 'cancel') t.status = 'cancelled'; else t.now = true;
    await kvPut(KEY, q);
    return action === 'cancel' ? `🗑️ Annulé : ${t.text.slice(0, 100)}` : `🛠️ Je m'y mets tout de suite : ${t.text.slice(0, 100)}`;
  }
  if (action === 'undo') {   // « annule ce que tu as codé cette nuit » / « annule le chantier abc12 »
    const id = String(input['id'] ?? '').trim();
    const done = q.filter(t => t.status === 'done' && t.kind !== 'undo' && t.from_sha && t.to_sha);
    const targets = id ? done.filter(t => t.id === id) : done.filter(t => t.done_at && Date.now() - Date.parse(t.done_at) < 20 * 3600_000);
    if (!targets.length) return id ? `❌ Pas de chantier terminé n° ${id} avec des commits à annuler.` : '❌ Rien codé dans les dernières 20 h à annuler.';
    for (const t of targets) await addDevTask(`ANNULER le chantier n° ${t.id} (« ${t.text.slice(0, 120)} ») : revenir à la version d'avant`, 'kouider', true, { kind: 'undo', from_sha: t.from_sha, to_sha: t.to_sha });
    return `↩️ J'annule ${targets.length > 1 ? `les ${targets.length} chantiers` : 'le chantier'} : ${targets.map(t => `« ${t.text.slice(0, 60)} »`).join(', ')}. Je reviens à la version d'avant, je remets en ligne et je te confirme sur Telegram (quelques minutes).`;
  }
  if (action === 'veille') {
    const t = await addDevTask(WEEKLY_WATCH, 'veille', input['now'] === true);
    return `🔭 Veille ajoutée (n° ${t.id}) ${t.now ? 'tout de suite' : 'pour cette nuit'}.`;
  }
  return '❌ action : add, list, report, now, cancel, undo, veille';
}

export const WEEKLY_WATCH = 'VEILLE HEBDO : cherche ce qui est sorti cette semaine chez Anthropic (API Claude, Claude Code, Agent SDK, nouveaux modèles et outils), '
  + 'sur GitHub (agents IA open source : Hermes Agent de Nous Research, OpenClaw, et les autres agents personnels/assistants qui montent), '
  + 'et dans les assistants vocaux. Compare avec ce que Dzaryx sait déjà faire (grep avant de proposer). Choisis au maximum 3 nouveautés '
  + 'VRAIMENT utiles à Kouider (FIK location à Oran, FIK Sites, sa vie perso, appels/vocal), jamais une idée qu\'il a déjà refusée (mémoire), '
  + 'implémente-les proprement, teste, mets en ligne. Dans le rapport : ce que tu as ajouté, comment s\'en servir en une phrase, et les autres idées repérées mais pas faites.';

/** GRAND MÉNAGE (1er du mois) : outils toujours chargés jamais utilisés en 30 jours → proposés au rangement (pas supprimés :
 *  sortis des outils toujours chargés, ils restent trouvables par la recherche d'outils). Moins d'hésitation, moins de jetons. */
export async function jobToolCleanup(): Promise<string> {
  const { supabase } = await import('./supabase.js');
  const { CORE_TOOL_NAMES } = await import('./claude-api.js');
  const from = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const used = new Set<string>();
  for (let page = 0; page < 20; page++) {
    const { data } = await supabase.from('conversations').select('metadata').eq('role', 'assistant').gte('created_at', from)
      .not('metadata', 'is', null).range(page * 1000, page * 1000 + 999);
    for (const r of (data ?? []) as Array<{ metadata: { tools?: unknown } | null }>) {
      for (const t of Array.isArray(r.metadata?.tools) ? r.metadata!.tools as unknown[] : []) used.add(String(typeof t === 'string' ? t : (t as { name?: string })?.name ?? '').split(/\s/)[0]!);   // « whatsapp_web ✅ »
    }
    if ((data ?? []).length < 1000) break;
  }
  if (used.size < 10) return 'pas assez de données d\'usage';
  const unused = CORE_TOOL_NAMES.filter(n => !used.has(n));
  if (!unused.length) return 'tous les outils servent';
  await kvPut('dev:cleanup_candidates', unused, 10 * 86_400);
  const { tg } = await import('./ai-util.js');
  await tg(`🧹 Grand ménage du mois : ${unused.length} outils toujours chargés n'ont jamais servi en 30 jours :\n${unused.join(', ')}\n\nSi je les range (ils restent utilisables, je les cherche quand il faut), je suis plus rapide et je me trompe moins d'outil. Dis « fais le ménage » (ou « garde X »).`);
  return `${unused.length} proposés`;
}
