import Anthropic from '@anthropic-ai/sdk';
import { env } from '../config/env.js';
import { supabase } from './supabase.js';
import { getLearnedRules, deactivateRule, type LearnedRule } from './learned-rules.js';
import { kvGet, kvSet } from './app-store.js';
import { emitProactive } from '../notifications/mobile-push.js';

// Ménage de la mémoire la nuit (idée reprise d'OpenClaw « dreaming ») : maintenant que Dzaryx apprend tout seul,
// les règles peuvent se répéter ou se contredire (« Clio 35 € » en octobre, « Clio 40 € » en décembre).
// Chaque nuit : doublons → on garde la plus claire ; contradictions → on garde la PLUS RÉCENTE. Rien n'est
// supprimé : les règles écartées sont seulement désactivées, et « annule le ménage de la mémoire » les remet.

const MODEL = process.env['MEMORY_CLEAN_MODEL'] ?? 'claude-haiku-5-5';
const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
const LOG_KEY = 'memclean:last';

const SYSTEM =
  'Tu fais le ménage dans les règles apprises par un assistant (agence de location de voitures). Repère UNIQUEMENT :\n' +
  '- les DOUBLONS : deux règles qui disent la même chose ;\n' +
  '- les CONTRADICTIONS : deux règles incompatibles sur le même sujet (ex : deux prix différents pour la même voiture).\n' +
  'Des règles sur des sujets proches mais compatibles ne sont NI doublons NI contradictions. Dans le doute, ne touche à rien.\n' +
  'Réponds UNIQUEMENT en JSON : {"groups": [{"type": "duplicate|contradiction", "ids": ["id1", "id2"], "why": "courte raison"}]}. ' +
  'Aucun → {"groups": []}.';

type Group = { type?: string; ids?: string[]; why?: string };

export async function consolidateRules(owner: 'kouider' | 'houari', dryRun = false): Promise<Array<{ kept: string; dropped: LearnedRule[]; type: string }>> {
  const rules = (await getLearnedRules(owner, 200)).filter(r => r.owner_key === owner);
  if (rules.length < 2) return [];
  const byId = new Map(rules.map(r => [r.id, r]));
  const listing = rules.map(r => `${r.id} | ${r.created_at.slice(0, 10)} | ${r.rule}`).join('\n');
  const res = await anthropic.messages.create({
    model: MODEL, max_tokens: 1500, system: SYSTEM,
    messages: [{ role: 'user', content: `RÈGLES (id | date | règle) :\n${listing}` }],
  });
  const raw = res.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map(b => b.text).join('');
  let groups: Group[] = [];
  try { groups = (JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)) as { groups?: Group[] }).groups ?? []; }
  catch { console.warn('[memclean] JSON illisible'); return []; }

  const out: Array<{ kept: string; dropped: LearnedRule[]; type: string }> = [];
  const touched = new Set<string>();
  for (const g of groups) {
    const members = [...new Set(g.ids ?? [])].map(id => byId.get(id)).filter((r): r is LearnedRule => !!r && !touched.has(r.id));
    if (members.length < 2) continue;
    // Toujours garder la plus récente (contradiction : la dernière consigne gagne ; doublon : la plus à jour)
    members.sort((a, b) => b.created_at.localeCompare(a.created_at));
    const [keep, ...drop] = members;
    for (const d of drop) { touched.add(d.id); if (!dryRun) await deactivateRule(d.id); }
    touched.add(keep!.id);
    out.push({ kept: keep!.rule, dropped: drop, type: g.type === 'contradiction' ? 'contradiction' : 'doublon' });
  }
  return out;
}

/** Job chaque nuit (3h Bruxelles). */
export async function jobMemoryConsolidation(): Promise<void> {
  for (const owner of ['kouider', 'houari'] as const) {
    try {
      const changes = await consolidateRules(owner);
      if (!changes.length) continue;
      const droppedIds = changes.flatMap(c => c.dropped.map(d => d.id));
      await kvSet(`${LOG_KEY}:${owner}`, JSON.stringify({ at: new Date().toISOString(), ids: droppedIds }), 14 * 86_400);
      const lines = changes.map(c => `• ${c.type === 'contradiction' ? 'Contradiction' : 'Doublon'} : je garde « ${c.kept} »`
        + ` — écarté : ${c.dropped.map(d => `« ${d.rule} »`).join(', ')}`);
      emitProactive(`🧹 Mémoire rangée : ${changes.length} correction(s)`, 'info',
        `🧹 Cette nuit j'ai rangé ma mémoire :\n${lines.join('\n')}\n\nSi je me suis trompé, dis « annule le ménage de la mémoire ».`, owner);
      console.log(`[memclean] ${owner} : ${droppedIds.length} règle(s) écartée(s)`);
    } catch (err) {
      console.error('[memclean]', owner, err instanceof Error ? err.message : err);
    }
  }
}

/** Outil undo_memory_cleanup : réactive les règles écartées au dernier ménage. */
export async function undoMemoryCleanupTool(_input: Record<string, unknown>, sessionId?: string): Promise<string> {
  const owner = sessionId?.toLowerCase().includes('houari') ? 'houari' : 'kouider';
  const log = JSON.parse((await kvGet(`${LOG_KEY}:${owner}`)) ?? 'null') as { at: string; ids: string[] } | null;
  if (!log?.ids.length) return 'Aucun ménage récent à annuler.';
  const { error } = await supabase.from('learned_rules').update({ active: true, updated_at: new Date().toISOString() }).in('id', log.ids);
  if (error) return `❌ ${error.message}`;
  await kvSet(`${LOG_KEY}:${owner}`, 'null', 60);
  return `↩️ Ménage annulé : ${log.ids.length} règle(s) remise(s).`;
}
