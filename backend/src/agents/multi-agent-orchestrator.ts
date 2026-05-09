/**
 * Multi-Agent Orchestrator — Exécution parallèle de plusieurs agents LLM spécialisés.
 *
 * FLUX :
 *   1. needsMultiAgent(msg) → détecte si la requête est cross-domaine
 *   2. selectAgents(msg)    → choisit quels agents sont pertinents
 *   3. runMultiAgent(...)   → Promise.allSettled en parallèle (timeout par agent)
 *   4. fuseResponses(...)   → Claude synthétise toutes les réponses en une seule
 *
 * Chaque agent a son propre provider/model/temperature — le fallback est automatique
 * si le provider n'est pas configuré.
 */
import { callProvider } from '../providers/provider-manager.js';
import { BUSINESS_AGENT }     from './definitions/business-agent.js';
import { FINANCE_AGENT }      from './definitions/finance-agent.js';
import { SOCIAL_AGENT }       from './definitions/social-agent.js';
import { COMPETITOR_AGENT }   from './definitions/competitor-agent.js';
import { DEVELOPER_AGENT }    from './definitions/developer-agent.js';
import { CODE_REVIEWER_AGENT }from './definitions/code-reviewer-agent.js';

// ── Agent catalog (pour multi-agent seulement) ────────────────────────────────
const MULTI_AGENTS = [
  BUSINESS_AGENT,
  FINANCE_AGENT,
  SOCIAL_AGENT,
  COMPETITOR_AGENT,
  DEVELOPER_AGENT,
  CODE_REVIEWER_AGENT,
] as const;

type AgentId = typeof MULTI_AGENTS[number]['id'];

const AGENT_MAP = new Map(MULTI_AGENTS.map(a => [a.id, a]));

// ── Result types ──────────────────────────────────────────────────────────────

export interface AgentTaskResult {
  agentId:       string;
  agentName:     string;
  desiredProvider: string;
  actualProvider:  string;
  model:           string;
  usedFallback:    boolean;
  text:            string;
  inputTokens:     number;
  outputTokens:    number;
  latencyMs:       number;
  costEstUsd:      number;
  success:         boolean;
  error?:          string;
  timedOut?:       boolean;
}

export interface MultiAgentReport {
  requestId:        string;
  userMessage:      string;
  agentsRequested:  string[];
  agentsSucceeded:  number;
  agentsFailed:     number;
  totalLatencyMs:   number;
  totalCostUsd:     number;
  totalInputTokens: number;
  totalOutputTokens:number;
  agentResults:     AgentTaskResult[];
  fusedResponse:    string;
  fusionLatencyMs:  number;
}

// ── Multi-agent trigger detection ─────────────────────────────────────────────
const MULTI_AGENT_TRIGGERS = /\b(analyse[rz]?|bilan|évaluation|stratégi|amélioration|plan\s+(d'|pour\s+l'|d'action)|optimis|rapport\s+(?:complet|global)|résumé\s+(?:complet|global)|points?\s+(?:forts?|faibles?)|swot|recommand|que\s+(?:manque|peux[- ]tu|peut[- ]on)|état\s+(?:général|des\s+lieux))\b/i;
const BUSINESS_CONTEXT     = /\b(fik|conciergerie|oran|l'entreprise|notre|mon\s+(?:entreprise|business|agence)|dzaryx)\b/i;

export function needsMultiAgent(userMessage: string): boolean {
  return MULTI_AGENT_TRIGGERS.test(userMessage) && BUSINESS_CONTEXT.test(userMessage);
}

// ── Agent selection based on message content ──────────────────────────────────
export function selectAgents(userMessage: string): AgentId[] {
  const lower = userMessage.toLowerCase();
  const selected = new Set<AgentId>();

  // Business always included for cross-domain analysis
  selected.add('business');

  if (/finance|argent|ca\b|chiffre|revenu|bénéfice|marge|tarif|paiement|été.*prix|prix.*été/.test(lower))
    selected.add('finance');

  if (/tiktok|instagram|social|contenu|viral|hashtag|publication|réseaux/.test(lower))
    selected.add('social');

  if (/concurrent|marché|veille|benchmark|compétiteur|position/.test(lower))
    selected.add('competitor');

  if (/code|tech|système|bug|infra|performance|sécurité\s+(?:du\s+)?sys/.test(lower))
    selected.add('developer');

  if (/audit|review|faille|dette\s+tech/.test(lower))
    selected.add('code_reviewer');

  // For generic "analyse/amélioration" → include finance + competitor by default
  if (selected.size <= 1) {
    selected.add('finance');
    selected.add('competitor');
  }

  // Summer strategy → add social
  if (/été|saison|estival|mre|vacation|vacance/.test(lower))
    selected.add('social');

  const ordered: AgentId[] = ['business', 'finance', 'competitor', 'social', 'developer', 'code_reviewer'];
  return ordered.filter(id => selected.has(id));
}

// ── Run a single agent with timeout ──────────────────────────────────────────
async function runSingleAgent(
  agentId:       AgentId,
  userMessage:   string,
  businessCtx:   string,
  requestId:     string,
  agentTimeoutMs: number,
): Promise<AgentTaskResult> {
  const agent = AGENT_MAP.get(agentId);
  if (!agent) {
    return {
      agentId, agentName: agentId, desiredProvider: 'unknown', actualProvider: 'unknown',
      model: '', usedFallback: false, text: '', inputTokens: 0, outputTokens: 0,
      latencyMs: 0, costEstUsd: 0, success: false, error: `Agent ${agentId} not found`,
    };
  }

  const agentRequestId = `${requestId}_${agentId}`;
  console.log(`[multi-agent:${agentRequestId}] ▶ ${agent.name} (${agent.provider}/${agent.model})`);

  // Build system prompt: agent speciality + business context
  const systemPrompt = [
    agent.systemPrompt,
    businessCtx ? `\n\n--- CONTEXTE MÉTIER ACTUEL ---\n${businessCtx.slice(0, 3000)}` : '',
  ].join('');

  const question = `${userMessage}\n\nDonne une analyse concise et actionnable depuis ta spécialité (${agent.name}).`;

  try {
    const result = await callProvider(
      { provider: agent.provider, model: agent.model, temperature: agent.temperature, maxTokens: agent.maxTokens, fallback: agent.fallback as any },
      question,
      systemPrompt,
      agentTimeoutMs,
    );

    console.log(
      `[multi-agent:${agentRequestId}] ✅ ${agent.name} ` +
      `provider=${result.provider} model=${result.model} ` +
      `fallback=${result.usedFallback} ${result.latencyMs}ms $${result.costEstUsd.toFixed(6)}`,
    );

    return {
      agentId,
      agentName:       agent.name,
      desiredProvider: agent.provider,
      actualProvider:  result.provider,
      model:           result.model,
      usedFallback:    result.usedFallback,
      text:            result.text,
      inputTokens:     result.inputTokens,
      outputTokens:    result.outputTokens,
      latencyMs:       result.latencyMs,
      costEstUsd:      result.costEstUsd,
      success:         true,
    };
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const timedOut = errMsg.includes('timeout');
    console.error(`[multi-agent:${agentRequestId}] ❌ ${agent.name} FAILED: ${errMsg}`);
    return {
      agentId,
      agentName:       agent.name,
      desiredProvider: agent.provider,
      actualProvider:  agent.provider,
      model:           agent.model,
      usedFallback:    false,
      text:            '',
      inputTokens:     0,
      outputTokens:    0,
      latencyMs:       agentTimeoutMs,
      costEstUsd:      0,
      success:         false,
      error:           errMsg,
      timedOut,
    };
  }
}

// ── Fuse agent responses into a single coherent answer ────────────────────────
async function fuseResponses(
  userMessage:   string,
  agentResults:  AgentTaskResult[],
  requestId:     string,
): Promise<{ text: string; latencyMs: number }> {
  const t0 = Date.now();
  const successful = agentResults.filter(r => r.success && r.text.trim().length > 50);

  if (successful.length === 0) {
    return { text: '❌ Aucun agent n\'a produit de réponse exploitable.', latencyMs: 0 };
  }

  if (successful.length === 1) {
    return { text: successful[0]!.text, latencyMs: Date.now() - t0 };
  }

  const agentSection = successful
    .map(r => `### ${r.agentName} (${r.actualProvider}/${r.model})\n${r.text}`)
    .join('\n\n---\n\n');

  const fusionPrompt = `Tu es Dzaryx. Tes agents spécialisés ont analysé la demande suivante :
"${userMessage}"

Voici leurs analyses :

${agentSection}

CONSIGNE :
1. Fusionne ces analyses en UNE réponse cohérente, structurée et directement actionnable.
2. Ne répète pas "l'Agent X dit que..." — intègre les insights directement.
3. Commence par les recommandations les plus impactantes.
4. Format : bullet points clairs, section par domaine si pertinent.
5. Conclusion : les 3 actions prioritaires à lancer en premier.
6. Réponse en français (ou darija si approprié).`;

  console.log(`[multi-agent:${requestId}] FUSION — ${successful.length} agents → Claude claude-sonnet-4-6`);

  const fused = await callProvider(
    { provider: 'claude', model: 'claude-sonnet-4-6', temperature: 0.6, maxTokens: 2000 },
    fusionPrompt,
    'Tu es Dzaryx, assistant IA de Fik Conciergerie Oran. Synthétise les analyses de tes agents spécialisés.',
    60_000,
  );

  console.log(`[multi-agent:${requestId}] FUSION ✅ ${fused.text.length} chars ${Date.now() - t0}ms`);
  return { text: fused.text, latencyMs: Date.now() - t0 };
}

// ── Main entry point ──────────────────────────────────────────────────────────
export async function runMultiAgent(
  userMessage:    string,
  businessContext:string,
  agentIds:       AgentId[],
  requestId:      string,
  agentTimeoutMs  = 30_000,
): Promise<MultiAgentReport> {
  const t0 = Date.now();

  console.log(
    `[multi-agent:${requestId}] ▶ START ` +
    `agents=[${agentIds.join(',')}] ` +
    `providers: ${agentIds.map(id => AGENT_MAP.get(id)?.provider ?? '?').join(',')}`,
  );

  // Run all agents in parallel — never let one failure block others
  const settled = await Promise.allSettled(
    agentIds.map(id => runSingleAgent(id, userMessage, businessContext, requestId, agentTimeoutMs)),
  );

  const agentResults: AgentTaskResult[] = settled.map((s, i) => {
    if (s.status === 'fulfilled') return s.value;
    const id = agentIds[i]!;
    return {
      agentId: id, agentName: id, desiredProvider: '?', actualProvider: '?',
      model: '', usedFallback: false, text: '', inputTokens: 0, outputTokens: 0,
      latencyMs: agentTimeoutMs, costEstUsd: 0, success: false, error: s.reason?.message ?? 'unknown',
    };
  });

  const { text: fusedResponse, latencyMs: fusionLatencyMs } = await fuseResponses(userMessage, agentResults, requestId);

  const totalLatencyMs    = Date.now() - t0;
  const agentsSucceeded   = agentResults.filter(r => r.success).length;
  const agentsFailed      = agentResults.filter(r => !r.success).length;
  const totalCostUsd      = agentResults.reduce((s, r) => s + r.costEstUsd, 0);
  const totalInputTokens  = agentResults.reduce((s, r) => s + r.inputTokens, 0);
  const totalOutputTokens = agentResults.reduce((s, r) => s + r.outputTokens, 0);

  console.log(
    `[multi-agent:${requestId}] DONE ` +
    `succeeded=${agentsSucceeded}/${agentIds.length} ` +
    `totalMs=${totalLatencyMs} totalCost=$${totalCostUsd.toFixed(6)}`,
  );

  // Structured execution trace
  console.log(`[multi-agent-trace] {` +
    `"request_id":"${requestId}",` +
    `"agents_requested":${JSON.stringify(agentIds)},` +
    `"agents_succeeded":${agentsSucceeded},` +
    `"agents_failed":${agentsFailed},` +
    `"total_latency_ms":${totalLatencyMs},` +
    `"total_cost_usd":${totalCostUsd.toFixed(6)},` +
    `"providers_used":${JSON.stringify(agentResults.map(r => ({ id: r.agentId, p: r.actualProvider, m: r.model, ok: r.success })))}` +
    `}`);

  return {
    requestId,
    userMessage,
    agentsRequested:   agentIds,
    agentsSucceeded,
    agentsFailed,
    totalLatencyMs,
    totalCostUsd,
    totalInputTokens,
    totalOutputTokens,
    agentResults,
    fusedResponse,
    fusionLatencyMs,
  };
}

// ── Re-export for convenience ─────────────────────────────────────────────────
export { MULTI_AGENTS, AGENT_MAP };
export type { AgentId };
