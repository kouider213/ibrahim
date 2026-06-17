/**
 * Competitor Agent Runner — Tool-aware Claude agent for Fik Conciergerie competitor intelligence.
 *
 * Authorized tools (allowlist strict):
 *   web_search           → Jina AI web search (returns real web page excerpts)
 *
 * Note: analyze_competitors is NOT used as a tool here because it calls Claude
 * internally — nesting Claude inside a Claude tool loop breaks the agentic loop.
 * Instead, we use targeted web_search calls and let Claude synthesize the raw results.
 *
 * Data sources (reality check):
 *   - Jina AI search (s.jina.ai) → real indexed web content, no key required
 *   - TikTok page fetches via Jina → often blocked by TikTok anti-bot
 *   - If TikTok is blocked → explicit NO_DATA, never invented metrics
 *
 * Verdict:
 *   VERIFIED → ≥3 web_search calls returned >300 chars of real data with competitor names
 *   PARTIAL  → some real data but limited coverage
 *   FAKE     → no real data fetched, all invented
 */

import Anthropic from '@anthropic-ai/sdk';
import { env } from '../config/env.js';
import { executeTool } from '../integrations/tool-executor.js';

// ── Authorized tools (allowlist) ──────────────────────────────────────────────

const COMPETITOR_ALLOWED = new Set(['web_search']);

const COMPETITOR_TOOLS: Anthropic.Tool[] = [
  {
    name: 'web_search',
    description: [
      'Recherche web en temps réel via Jina AI. Retourne le texte brut des pages trouvées.',
      'Utiliser pour: prix concurrents, agences location Oran, présence TikTok/Instagram,',
      'avis Google Maps, comparaison tarifaire. Retourne les vraies données sans filtre.',
      'Si TikTok est bloqué, le résultat le dira explicitement — ne pas inventer.',
    ].join(' '),
    input_schema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: 'La requête de recherche. Exemples: "location voiture oran prix 2025", "agences location voiture oran tiktok", "hertz oran algerie tarifs"',
        },
      },
      required: ['query'],
    },
  },
];

// ── Types ──────────────────────────────────────────────────────────────────────

export interface CompetitorToolCall {
  tool_name:    string;
  tool_input:   Record<string, unknown>;
  tool_result:  string;
  duration_ms:  number;
  blocked:      boolean;
  chars_returned: number;
  data_quality: 'real' | 'blocked' | 'empty' | 'error';
}

export interface CompetitorAgentResult {
  request_id:       string;
  agent_id:         'competitor';
  agent_name:       '🔎 Agent Concurrence';
  provider:         'claude';
  model:            string;
  system_prompt:    string;
  tools_allowed:    string[];
  tools_called:     CompetitorToolCall[];
  tool_count:       number;
  raw_data_chars:   number;
  competitors_found: string[];
  analysis:         string;
  input_tokens:     number;
  output_tokens:    number;
  total_ms:         number;
  verdict:          'VERIFIED' | 'PARTIAL' | 'FAKE';
  verdict_reason:   string;
  error?:           string;
}

// ── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Tu es l'Agent Analyse Concurrentielle de Fik Conciergerie Oran — spécialiste marché location voitures en Algérie.

CONTRAINTE ABSOLUE : Analyse uniquement les données réelles retournées par web_search.
N'invente AUCUN chiffre, compte TikTok, abonné, vue, hashtag ou prix.
Si web_search retourne peu de données, dis-le explicitement section par section.

SÉQUENCE OBLIGATOIRE — lance ces 8 recherches dans cet ordre :
1. "meilleures agences location voiture oran algerie avis 2025" → identifier les vrais concurrents
2. "agence location voiture oran algerie tarifs prix 2025" → prix marché réels
3. "location voiture oran google maps avis clients" → réputation concurrents
4. "tiktok #locationoran #locationvoitureoran location voiture oran algerie" → hashtags TikTok réels
5. "location voiture oran facebook instagram promo 2025" → présence réseaux sociaux
6. "youtube location voiture oran algerie 2025" → contenu YouTube concurrents
7. "location voiture aeroport ahmed ben bella oran algerie prix" → segment aéroport
8. "hertz sixt europcar avis enterprise oran algerie" → grandes enseignes

APRÈS COLLECTE — produis uniquement ce que les données confirment :
  - Concurrents identifiés avec source (ex: "trouvé sur Google Maps : [nom réel de l'agence]")
  - Prix réels trouvés (€/DZD — sinon "non disponible dans les données")
  - Hashtags réels trouvés dans les données (ex: #locationoran)
  - Présence digitale concrète (YouTube, Facebook, TikTok — si trouvée)
  - 3 recommandations basées sur ce qui a été réellement trouvé

FORMAT : cite toujours la source (ex: "selon web_search #4 : ...").
JAMAIS : inventer des concurrents, des prix, des abonnés, des vues ou des hashtags.`;

// ── Competitor name extractor (from raw text) ─────────────────────────────────

function extractCompetitorNames(text: string): string[] {
  const patterns = [
    /\b(location\s+oran\w*)\b/gi,
    /\b(oran\s*car\w*)\b/gi,
    /\b(auto\s*location\s*oran\w*)\b/gi,
    /\b(hertz\s+oran)\b/gi,
    /\b(sixt\s+oran|sixt\s+alg[eé]rie)\b/gi,
    /\b(avis\s+oran|avis\s+alg[eé]rie)\b/gi,
    /\b(enterprise\s+(?:oran|alg[eé]rie))\b/gi,
    /\b(europcar\s+(?:oran|alg[eé]rie))\b/gi,
    /\b(fik\s+concierge\w*)\b/gi,
  ];
  const found = new Set<string>();
  for (const p of patterns) {
    const matches = text.toLowerCase().match(p);
    if (matches) matches.forEach(m => found.add(m.trim()));
  }
  return [...found];
}

function classifyDataQuality(result: string): CompetitorToolCall['data_quality'] {
  if (!result || result.trim().length < 20) return 'empty';
  if (/inaccessible|blocked|erreur|timeout|no results/i.test(result)) return 'blocked';
  if (/erreur|exception/i.test(result)) return 'error';
  return 'real';
}

// ── Runner ─────────────────────────────────────────────────────────────────────

export async function runCompetitorAgentWithTools(
  userMessage: string,
  requestId:   string,
  timeoutMs    = 120_000,
): Promise<CompetitorAgentResult> {
  const t0    = Date.now();
  const model = 'claude-sonnet-4-6';

  const toolsCalled: CompetitorToolCall[] = [];
  let totalInputTokens  = 0;
  let totalOutputTokens = 0;
  let finalAnalysis     = '';

  console.log(`[competitor-agent:${requestId}] ▶ START model=${model} timeout=${timeoutMs}ms`);

  if (!env.ANTHROPIC_API_KEY) {
    return makeFailedResult(requestId, model, toolsCalled, 0, 0, Date.now() - t0, 'ANTHROPIC_API_KEY absent');
  }

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const messages: Anthropic.Messages.MessageParam[] = [
    { role: 'user', content: userMessage },
  ];

  const MAX_ITER = 8;
  let iterCount  = 0;

  try {
    while (iterCount < MAX_ITER && (Date.now() - t0) < timeoutMs) {
      iterCount++;

      const response = await client.messages.create({
        model,
        max_tokens:  2000,
        system:      SYSTEM_PROMPT,
        tools:       COMPETITOR_TOOLS,
        messages,
      });

      totalInputTokens  += response.usage.input_tokens;
      totalOutputTokens += response.usage.output_tokens;

      console.log(
        `[competitor-agent:${requestId}] iter=${iterCount} stop_reason=${response.stop_reason} ` +
        `blocks=${response.content.length} in=${response.usage.input_tokens} out=${response.usage.output_tokens}`,
      );

      const textBlocks = response.content
        .filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
        .map(b => b.text)
        .join('');

      if (response.stop_reason === 'end_turn' || response.stop_reason !== 'tool_use') {
        finalAnalysis = textBlocks || finalAnalysis;
        break;
      }

      const toolUseBlocks = response.content.filter(
        (b): b is Anthropic.Messages.ToolUseBlock => b.type === 'tool_use',
      );

      messages.push({ role: 'assistant', content: response.content });

      const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];

      for (const tb of toolUseBlocks) {
        const tStart  = Date.now();
        const input   = tb.input as Record<string, unknown>;
        const blocked = !COMPETITOR_ALLOWED.has(tb.name);

        let result: string;
        if (blocked) {
          result = `❌ Outil "${tb.name}" non autorisé pour competitor-agent. Outils autorisés: ${[...COMPETITOR_ALLOWED].join(', ')}`;
          console.warn(`[competitor-agent:${requestId}] BLOCKED tool=${tb.name}`);
        } else {
          try {
            result = await executeTool(tb.name, input);
            if (!result || result.trim() === '') result = 'no_data';
          } catch (err) {
            result = `Erreur outil ${tb.name}: ${err instanceof Error ? err.message : String(err)}`;
          }
        }

        const duration    = Date.now() - tStart;
        const dataQuality = classifyDataQuality(result);

        console.log(
          `[competitor-agent:${requestId}] ` +
          `tool=${tb.name} query="${(input['query'] as string ?? '').slice(0, 50)}" ` +
          `blocked=${blocked} quality=${dataQuality} chars=${result.length} ${duration}ms`,
        );

        toolsCalled.push({
          tool_name: tb.name, tool_input: input, tool_result: result,
          duration_ms: duration, blocked, chars_returned: result.length, data_quality: dataQuality,
        });
        toolResults.push({ type: 'tool_result', tool_use_id: tb.id, content: result });
      }

      messages.push({ role: 'user', content: toolResults });
    }

    const totalMs        = Date.now() - t0;
    const realCalls      = toolsCalled.filter(t => !t.blocked);
    const realDataCalls  = realCalls.filter(t => t.data_quality === 'real');
    const rawDataChars   = realCalls.reduce((s, t) => s + t.tool_result.length, 0);
    const allText        = toolsCalled.map(t => t.tool_result).join(' ');
    const competitorsFound = extractCompetitorNames(allText + ' ' + finalAnalysis);

    const verdict: CompetitorAgentResult['verdict'] =
      realDataCalls.length >= 3 && finalAnalysis.length > 200  ? 'VERIFIED' :
      realDataCalls.length >= 1                                 ? 'PARTIAL'  :
      'FAKE';

    const verdictReason =
      verdict === 'VERIFIED'
        ? `✅ ${realDataCalls.length} recherches web avec données réelles (${rawDataChars} chars), ${competitorsFound.length} concurrent(s) identifié(s)`
        : verdict === 'PARTIAL'
          ? `⚠️ ${realDataCalls.length}/${realCalls.length} recherche(s) avec données — couverture partielle`
          : `❌ Aucune donnée réelle récupérée — TikTok/web bloqué ou pas de données`;

    console.log(`[competitor-agent:${requestId}] DONE verdict=${verdict} tools=${realCalls.length} realData=${realDataCalls.length} competitors=${competitorsFound.length} ${totalMs}ms`);

    return {
      request_id:        requestId,
      agent_id:          'competitor',
      agent_name:        '🔎 Agent Concurrence',
      provider:          'claude',
      model,
      system_prompt:     SYSTEM_PROMPT,
      tools_allowed:     [...COMPETITOR_ALLOWED],
      tools_called:      toolsCalled,
      tool_count:        realCalls.length,
      raw_data_chars:    rawDataChars,
      competitors_found: competitorsFound,
      analysis:          finalAnalysis,
      input_tokens:      totalInputTokens,
      output_tokens:     totalOutputTokens,
      total_ms:          totalMs,
      verdict,
      verdict_reason:    verdictReason,
    };

  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`[competitor-agent:${requestId}] ❌ ${errMsg}`);
    return makeFailedResult(requestId, model, toolsCalled, totalInputTokens, totalOutputTokens, Date.now() - t0, errMsg);
  }
}

// ── Helper ────────────────────────────────────────────────────────────────────

function makeFailedResult(
  requestId: string, model: string, toolsCalled: CompetitorToolCall[],
  inp: number, out: number, ms: number, errMsg: string,
): CompetitorAgentResult {
  return {
    request_id: requestId, agent_id: 'competitor', agent_name: '🔎 Agent Concurrence',
    provider: 'claude', model, system_prompt: SYSTEM_PROMPT, tools_allowed: [...COMPETITOR_ALLOWED],
    tools_called: toolsCalled, tool_count: 0, raw_data_chars: 0, competitors_found: [],
    analysis: '', input_tokens: inp, output_tokens: out, total_ms: ms,
    verdict: 'FAKE', verdict_reason: `❌ ${errMsg}`, error: errMsg,
  };
}
