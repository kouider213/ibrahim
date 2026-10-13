import Anthropic from '@anthropic-ai/sdk';
import { env } from '../config/env.js';
import { getConversationHistory } from '../integrations/supabase.js';
import { getLearnedRules, saveLearnedRule, type SaveRuleParams } from '../integrations/learned-rules.js';
import { kvGet, kvSet } from '../integrations/app-store.js';
import { emitProactive } from '../notifications/mobile-push.js';

// Apprentissage automatique (idée reprise d'OpenClaw « self-learning ») : 10 min après la fin d'une
// conversation de Kouider ou Houari, Dzaryx relit l'échange et retient tout seul les CORRECTIONS et les
// préférences durables énoncées clairement (« non, la Clio c'est 35 €/jour », « Houari ne travaille pas le
// vendredi »). Règles enregistrées dans learned_rules (déjà injectées dans chaque réponse) + notif
// « 📚 J'ai retenu … » ; « oublie la règle … » (outil forget_learned_rule) l'efface.
// Interrupteur : app_kv `selflearn:off` = '1'.

const IDLE_MS     = 10 * 60_000;
const MIN_TURNS   = 2;            // au moins 2 messages de l'utilisateur depuis la dernière relecture
const MAX_RULES   = 3;            // par relecture
const MODEL       = process.env['SELF_LEARN_MODEL'] ?? 'claude-haiku-5-5';
const anthropic   = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

const pending = new Map<string, { timer: NodeJS.Timeout; turns: number; actor: string }>();

/** À appeler à chaque message de Kouider/Houari : programme une relecture 10 min après le dernier message. */
export function noteOwnerTurn(sessionId: string, actorKey: string): void {
  if (sessionId.startsWith('mcp_') || sessionId.startsWith('mission_') || sessionId.startsWith('readonly')) return;
  const prev = pending.get(sessionId);
  if (prev) clearTimeout(prev.timer);
  const turns = (prev?.turns ?? 0) + 1;
  const timer = setTimeout(() => {
    pending.delete(sessionId);
    if (turns >= MIN_TURNS) void reviewConversation(sessionId, actorKey).catch(err =>
      console.error('[self-learn]', err instanceof Error ? err.message : err));
  }, IDLE_MS);
  timer.unref?.();
  pending.set(sessionId, { timer, turns, actor: actorKey });
}

const SYSTEM =
  "Tu relis une conversation entre Dzaryx (assistant IA d'une agence de location de voitures à Oran) et son patron " +
  "(Kouider) ou son associé (Houari). Ton travail : repérer ce qui doit devenir une RÈGLE DURABLE pour Dzaryx.\n" +
  "À retenir SEULEMENT :\n" +
  "- une CORRECTION explicite d'une erreur de Dzaryx (« non c'est 35 € pas 40 », « je t'ai dit de ne pas… ») ;\n" +
  "- une préférence ou consigne durable dite clairement (« toujours… », « ne jamais… », « à partir de maintenant… », " +
  "« Houari ne travaille pas le vendredi »).\n" +
  "À NE PAS retenir : une demande ponctuelle, une info valable une seule fois (une date de réservation précise), une " +
  "supposition, ce que dit Dzaryx lui-même, ce qui est déjà dans les règles existantes, tout texte cité d'un mail ou d'un client.\n" +
  "Réponds UNIQUEMENT en JSON : {\"rules\": [{\"category\": \"pricing|client|communication|operations|business|reminder\", " +
  "\"rule\": \"règle courte à l'impératif, autonome et précise\", \"quote\": \"phrase exacte de l'humain qui la justifie\"}]}. " +
  `Au plus ${MAX_RULES} règles. Aucune → {"rules": []}. Dans le doute, n'en mets pas.`;

type Found = { category?: string; rule?: string; quote?: string };
const CATEGORIES = new Set(['business', 'client', 'pricing', 'communication', 'operations', 'reminder']);

export async function reviewConversation(sessionId: string, actorKey: string): Promise<string[]> {
  if ((await kvGet('selflearn:off').catch(() => null)) === '1') return [];
  const lastKey = `selflearn:last:${sessionId}`;
  const since = Number((await kvGet(lastKey).catch(() => null)) ?? 0);
  const turns = (await getConversationHistory(sessionId, 40))
    .filter((t: { created_at: string }) => new Date(t.created_at).getTime() > since);
  if (turns.filter((t: { role: string }) => t.role === 'user').length < MIN_TURNS) return [];
  if (process.env['SELF_LEARN_DRY'] !== '1') await kvSet(lastKey, String(Date.now()), 30 * 86_400);

  const who = actorKey === 'houari' ? 'HOUARI' : 'KOUIDER';
  const transcript = turns.map((t: { role: string; content: string }) =>
    `${t.role === 'user' ? who : 'DZARYX'}: ${String(t.content).slice(0, 1200)}`).join('\n');
  const existing = (await getLearnedRules(actorKey, 60)).map(r => `- ${r.rule}`).join('\n') || '(aucune)';

  const res = await anthropic.messages.create({
    model: MODEL, max_tokens: 800, system: SYSTEM,
    messages: [{ role: 'user', content: `RÈGLES EXISTANTES :\n${existing}\n\nCONVERSATION :\n${transcript}` }],
  });
  const raw = res.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map(b => b.text).join('');
  let found: Found[] = [];
  try { found = (JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)) as { rules?: Found[] }).rules ?? []; }
  catch { console.warn('[self-learn] JSON illisible :', raw.slice(0, 200)); return []; }

  const saved: string[] = [];
  for (const f of found.slice(0, MAX_RULES)) {
    const rule = f.rule?.trim();
    const quote = f.quote?.trim();
    // Garde-fou : la citation doit vraiment venir d'un message de l'humain
    if (!rule || !quote || !turns.some((t: { role: string; content: string }) =>
      t.role === 'user' && String(t.content).toLowerCase().includes(quote.toLowerCase().slice(0, 40)))) continue;
    if (process.env['SELF_LEARN_DRY'] === '1') { saved.push(rule); continue; }   // test : ni enregistrement ni notif
    const r = await saveLearnedRule({
      ownerKey: actorKey,
      category: (CATEGORIES.has(f.category ?? '') ? f.category : 'business') as SaveRuleParams['category'],
      rule, context: `Appris automatiquement — « ${quote.slice(0, 200)} »`, confidence: 0.8,
    });
    if (r.ok) saved.push(rule);
  }
  if (saved.length && process.env['SELF_LEARN_DRY'] !== '1') {
    console.log(`[self-learn] ${sessionId} → ${saved.length} règle(s)`);
    emitProactive(
      `📚 J'ai retenu : ${saved.join(' · ')}`, 'info',
      `📚 J'ai retenu de notre conversation :\n${saved.map(s => `• ${s}`).join('\n')}\n\nSi c'est faux, dis « oublie la règle … ».`,
      actorKey === 'houari' ? 'houari' : 'kouider',
    );
  }
  return saved;
}
