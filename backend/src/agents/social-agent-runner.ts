/**
 * Social Agent Runner — Tool-aware Claude agent for Fik Conciergerie social media.
 *
 * Authorized tools (allowlist strict):
 *   get_tiktok_market   → APIFY clockworks~tiktok-scraper: competitor hashtags + profiles
 *   get_tiktok_profile  → APIFY: stats d'un compte TikTok précis (Fik ou concurrent)
 *   web_search          → multi-provider (APIFY Google > DDG > Bing > Jina)
 *
 * Verdict:
 *   VERIFIED → APIFY a retourné ≥1 vidéo réelle + analyse >200 chars
 *   PARTIAL  → seulement web_search (pas de données TikTok directes)
 *   FAKE     → aucune donnée réelle récupérée
 *
 * Fik Conciergerie TikTok probe:
 *   Tente @fikconciergerie → si 0 vidéos: "compte non trouvé ou sans contenu public"
 */

import Anthropic from '@anthropic-ai/sdk';
import { env } from '../config/env.js';
import { executeTool } from '../integrations/tool-executor.js';
import {
  apifyRun,
  parseVideo as parseTikTokVideo,
  scrapeTikTokForOranCars,
  formatTikTokDataForReport,
  type TikTokVideo,
} from '../integrations/apify-tiktok.js';

// ── Authorized tools ──────────────────────────────────────────────────────────

const SOCIAL_ALLOWED = new Set(['get_tiktok_market', 'get_tiktok_profile', 'web_search']);

const SOCIAL_TOOLS: Anthropic.Tool[] = [
  {
    name: 'get_tiktok_market',
    description: [
      'Scrape les données TikTok du marché location voiture Oran via APIFY.',
      'Hashtags scrapés: #locationoran #locationvoitureoran #voitureoran #locationvoiture.',
      'Profils concurrents (à confirmer par recherche réelle): @locationoranalgerie @orancar @autolocationoran.',
      'Retourne: vues réelles, likes, engagement moyen, top hashtags, top comptes.',
      'DONNÉES RÉELLES UNIQUEMENT — si APIFY bloqué, résultat le dira.',
    ].join(' '),
    input_schema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'get_tiktok_profile',
    description: [
      'Scrape un profil TikTok spécifique via APIFY.',
      'Retourne: followers, vues totales, dernières vidéos avec métriques réelles.',
      'Si compte inexistant ou bloqué → résultat explicit "0 vidéos trouvées".',
      'Utiliser pour: vérifier si Fik Conciergerie a un compte, analyser un concurrent précis.',
    ].join(' '),
    input_schema: {
      type: 'object' as const,
      properties: {
        username: {
          type: 'string',
          description: 'Handle TikTok SANS @ (ex: fikconciergerie, locationoranalgerie)',
        },
      },
      required: ['username'],
    },
  },
  {
    name: 'web_search',
    description: [
      'Recherche web multi-provider (APIFY Google > DuckDuckGo > Bing > Jina).',
      'Utiliser si APIFY TikTok bloqué, ou pour chercher: présence Instagram,',
      'stats TikTok publiques, mentions presse, Google Maps avis.',
    ].join(' '),
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Requête de recherche' },
      },
      required: ['query'],
    },
  },
];

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SocialToolCall {
  tool_name:      string;
  tool_input:     Record<string, unknown>;
  tool_result:    string;
  duration_ms:    number;
  blocked:        boolean;
  data_quality:   'real' | 'partial' | 'no_data' | 'blocked' | 'error';
  tiktok_videos?: number;
}

export interface FikTikTokProfile {
  handle:       string;
  found:        boolean;
  followers:    number | null;
  total_views:  number;
  video_count:  number;
  top_videos:   Array<{
    description: string;
    views: number | null;
    likes: number | null;
    engagement_pct: number | null;
    published_at: string | null;
  }>;
  why_not_found?: string;
}

export interface SocialAgentResult {
  request_id:        string;
  agent_id:          'social';
  agent_name:        '📱 Agent Social Media';
  provider:          'claude';
  model:             string;
  system_prompt:     string;
  tools_allowed:     string[];
  tools_called:      SocialToolCall[];
  tool_count:        number;
  raw_data_chars:    number;
  tiktok_videos_found: number;
  fik_profile:       FikTikTokProfile | null;
  analysis:          string;
  input_tokens:      number;
  output_tokens:     number;
  total_ms:          number;
  verdict:           'VERIFIED' | 'PARTIAL' | 'FAKE';
  verdict_reason:    string;
  error?:            string;
}

// ── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Tu es l'Agent Social Media de Fik Conciergerie Oran — spécialiste TikTok/Instagram pour location voitures en Algérie.

CONTRAINTE ABSOLUE : Analyse uniquement les données réelles retournées par les outils.
N'invente AUCUN chiffre : vues, likes, abonnés, hashtag, engagement.
Si un outil retourne 0 résultats → dis-le explicitement.

SÉQUENCE OBLIGATOIRE :
1. get_tiktok_market → données marché (hashtags + concurrents Oran)
2. get_tiktok_profile("fikconciergerie") → vérifier si Fik a un compte TikTok actif
3. Si profil Fik retourne 0 vidéos → get_tiktok_profile("fik_conciergerie") → essai variante handle
4. web_search("fik conciergerie tiktok instagram oran") → compléter si APIFY insuffisant
5. web_search("location voiture oran tiktok instagram 2025") → contexte marché digital

APRÈS COLLECTE — produis uniquement ce que les données confirment :
  A) Marché TikTok réel : top hashtags (avgViews réels), top comptes (followers réels), vidéos performantes
  B) Fik Conciergerie TikTok : compte trouvé ou non, pourquoi, recommandation urgente
  C) Analyse concurrents : qui domine TikTok localement et comment
  D) 3 recommandations actionnables basées sur les données réelles (pas des suppositions)

FORMAT : cite la source pour chaque chiffre (ex: "selon get_tiktok_market : @[compte réel] 26K abonnés").
JAMAIS : inventer des followers, des vues, des hashtags ou des tendances.`;

// Strip lone surrogates before sending to Claude (defensive — already done in parseVideo)
function sanitizeForClaude(s: string): string {
  return s.replace(/[\uD800-\uDFFF]/g, '');
}

// ── Tool executors ─────────────────────────────────────────────────────────────

async function runGetTikTokMarket(): Promise<{ text: string; videos_count: number }> {
  try {
    const data = await scrapeTikTokForOranCars();
    const formatted = formatTikTokDataForReport(data);
    return { text: formatted.slice(0, 4000), videos_count: data.videos.length };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { text: `Erreur get_tiktok_market: ${msg}`, videos_count: 0 };
  }
}

async function runGetTikTokProfile(username: string): Promise<{ text: string; profile: FikTikTokProfile }> {
  const cleanHandle = username.replace(/^@/, '').trim();
  const emptyProfile: FikTikTokProfile = {
    handle: cleanHandle, found: false, followers: null,
    total_views: 0, video_count: 0, top_videos: [],
    why_not_found: '',
  };

  if (!env.APIFY_API_KEY) {
    emptyProfile.why_not_found = 'APIFY_API_KEY absent — scraping TikTok impossible';
    return {
      text: `@${cleanHandle}: APIFY non configuré — impossible de vérifier le profil TikTok.`,
      profile: emptyProfile,
    };
  }

  try {
    const items = await apifyRun('clockworks~tiktok-scraper', {
      profiles: [cleanHandle],
      resultsPerPage: 15,
      shouldDownloadVideos: false,
      shouldDownloadCovers: false,
    });

    if (!items || items.length === 0) {
      emptyProfile.why_not_found = 'APIFY a retourné 0 vidéos — compte inexistant, privé, ou TikTok anti-bot actif';
      return {
        text: `@${cleanHandle}: 0 vidéos trouvées. ${emptyProfile.why_not_found}`,
        profile: emptyProfile,
      };
    }

    const videos: TikTokVideo[] = items.map(parseTikTokVideo);

    // Aggregate
    const followers = videos[0]?.authorFollowers ?? null;
    const totalViews = videos.reduce((s, v) => s + (v.views ?? 0), 0);
    const topVids = [...videos].sort((a, b) => (b.views ?? 0) - (a.views ?? 0)).slice(0, 5);

    const profile: FikTikTokProfile = {
      handle:      cleanHandle,
      found:       true,
      followers,
      total_views: totalViews,
      video_count: videos.length,
      top_videos:  topVids.map(v => ({
        description:    v.description.slice(0, 100),
        views:          v.views,
        likes:          v.likes,
        engagement_pct: v.engagementRate,
        published_at:   v.publishedAt,
      })),
    };

    const lines = [
      `@${cleanHandle} — Profil TikTok RÉEL (APIFY clockworks~tiktok-scraper)`,
      `Abonnés: ${followers !== null ? followers.toLocaleString('fr-FR') : 'N/A'}`,
      `Vidéos analysées: ${videos.length}`,
      `Vues totales: ${totalViews.toLocaleString('fr-FR')}`,
      '',
      'Top vidéos:',
      ...topVids.map((v, i) =>
        `  ${i + 1}. "${v.description.slice(0, 80)}" — ${(v.views ?? '?').toLocaleString()} vues | ❤️ ${v.likes?.toLocaleString() ?? '?'} | eng: ${v.engagementRate ?? '?'}%`
      ),
    ];

    return { text: lines.join('\n').slice(0, 3000), profile };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    emptyProfile.why_not_found = `Erreur APIFY: ${msg}`;
    return {
      text: `@${cleanHandle}: Erreur scraping — ${msg}`,
      profile: emptyProfile,
    };
  }
}

function classifyDataQuality(result: string, videos: number): SocialToolCall['data_quality'] {
  if (videos > 0) return 'real';
  if (!result || result.trim().length < 20) return 'no_data';
  if (/inaccessible|bloqué|blocked|0 vidéos|0 résultats/i.test(result)) return 'no_data';
  if (/erreur|exception|error/i.test(result)) return 'error';
  if (result.length > 100) return 'partial';
  return 'no_data';
}

// ── Runner ────────────────────────────────────────────────────────────────────

export async function runSocialAgentWithTools(
  userMessage: string,
  requestId:   string,
  timeoutMs    = 180_000,
): Promise<SocialAgentResult> {
  const t0    = Date.now();
  const model = 'claude-sonnet-4-6';

  const toolsCalled: SocialToolCall[] = [];
  let totalInputTokens  = 0;
  let totalOutputTokens = 0;
  let finalAnalysis     = '';
  let totalTikTokVideos = 0;
  let fik_profile: FikTikTokProfile | null = null;

  console.log(`[social-agent:${requestId}] ▶ START model=${model} timeout=${timeoutMs}ms`);

  if (!env.ANTHROPIC_API_KEY) {
    return makeFailedResult(requestId, model, toolsCalled, 0, 0, Date.now() - t0, 'ANTHROPIC_API_KEY absent');
  }

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const messages: Anthropic.Messages.MessageParam[] = [
    { role: 'user', content: userMessage },
  ];

  const MAX_ITER = 10;
  let iterCount  = 0;

  try {
    while (iterCount < MAX_ITER && (Date.now() - t0) < timeoutMs) {
      iterCount++;

      const response = await client.messages.create({
        model,
        max_tokens:  2500,
        system:      SYSTEM_PROMPT,
        tools:       SOCIAL_TOOLS,
        messages,
      });

      totalInputTokens  += response.usage.input_tokens;
      totalOutputTokens += response.usage.output_tokens;

      console.log(
        `[social-agent:${requestId}] iter=${iterCount} stop_reason=${response.stop_reason} ` +
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
        const blocked = !SOCIAL_ALLOWED.has(tb.name);

        let result: string;
        let videosThisCall = 0;

        if (blocked) {
          result = `❌ Outil "${tb.name}" non autorisé pour social-agent. Autorisés: ${[...SOCIAL_ALLOWED].join(', ')}`;
          console.warn(`[social-agent:${requestId}] BLOCKED tool=${tb.name}`);
        } else if (tb.name === 'get_tiktok_market') {
          const r = await runGetTikTokMarket();
          result = r.text;
          videosThisCall = r.videos_count;
          totalTikTokVideos += r.videos_count;
        } else if (tb.name === 'get_tiktok_profile') {
          const username = (input['username'] as string) ?? '';
          const r = await runGetTikTokProfile(username);
          result = r.text;
          videosThisCall = r.profile.video_count;
          totalTikTokVideos += r.profile.video_count;
          // Capture Fik profile specifically
          if (/fik/i.test(username)) fik_profile = r.profile;
        } else {
          // web_search — route through executeTool (multi-provider)
          try {
            result = await executeTool(tb.name, input);
            if (!result || result.trim() === '') result = 'no_data';
          } catch (err) {
            result = `Erreur outil ${tb.name}: ${err instanceof Error ? err.message : String(err)}`;
          }
        }

        const duration    = Date.now() - tStart;
        const dataQuality = classifyDataQuality(result, videosThisCall);

        console.log(
          `[social-agent:${requestId}] ` +
          `tool=${tb.name} ` +
          `input="${JSON.stringify(input).slice(0, 60)}" ` +
          `blocked=${blocked} quality=${dataQuality} videos=${videosThisCall} chars=${result.length} ${duration}ms`,
        );

        toolsCalled.push({
          tool_name: tb.name, tool_input: input, tool_result: result,
          duration_ms: duration, blocked, data_quality: dataQuality,
          tiktok_videos: videosThisCall,
        });
        toolResults.push({ type: 'tool_result', tool_use_id: tb.id, content: sanitizeForClaude(result) });
      }

      messages.push({ role: 'user', content: toolResults });
    }

    const totalMs     = Date.now() - t0;
    const realCalls   = toolsCalled.filter(t => !t.blocked);
    const realData    = realCalls.filter(t => t.data_quality === 'real' || t.data_quality === 'partial');
    const rawDataChars = realCalls.reduce((s, t) => s + t.tool_result.length, 0);

    const verdict: SocialAgentResult['verdict'] =
      totalTikTokVideos > 0 && finalAnalysis.length > 200 ? 'VERIFIED' :
      realData.length >= 1 && finalAnalysis.length > 100   ? 'PARTIAL'  :
      'FAKE';

    const verdictReason =
      verdict === 'VERIFIED'
        ? `✅ APIFY TikTok réel — ${totalTikTokVideos} vidéos analysées, ${rawDataChars} chars données, analyse ${finalAnalysis.length} chars`
        : verdict === 'PARTIAL'
          ? `⚠️ Données partielles — TikTok scraping: ${totalTikTokVideos} vidéos, web_search: ${realData.length} source(s)`
          : `❌ Aucune donnée TikTok réelle — APIFY bloqué ou absent, web_search insuffisant`;

    console.log(
      `[social-agent:${requestId}] DONE verdict=${verdict} ` +
      `tools=${realCalls.length} tiktok_videos=${totalTikTokVideos} ` +
      `fik_found=${fik_profile?.found ?? false} ${totalMs}ms`,
    );

    return {
      request_id:          requestId,
      agent_id:            'social',
      agent_name:          '📱 Agent Social Media',
      provider:            'claude',
      model,
      system_prompt:       SYSTEM_PROMPT,
      tools_allowed:       [...SOCIAL_ALLOWED],
      tools_called:        toolsCalled,
      tool_count:          realCalls.length,
      raw_data_chars:      rawDataChars,
      tiktok_videos_found: totalTikTokVideos,
      fik_profile,
      analysis:            finalAnalysis,
      input_tokens:        totalInputTokens,
      output_tokens:       totalOutputTokens,
      total_ms:            totalMs,
      verdict,
      verdict_reason:      verdictReason,
    };

  } catch (err) {
    const errMsg  = err instanceof Error ? err.message : String(err);
    const totalMs = Date.now() - t0;
    console.error(`[social-agent:${requestId}] ❌ ${errMsg}`);
    // Preserve all tool calls + fik_profile even on crash
    const realCalls    = toolsCalled.filter(t => !t.blocked);
    const rawDataChars = realCalls.reduce((s, t) => s + t.tool_result.length, 0);
    return {
      request_id:          requestId,
      agent_id:            'social',
      agent_name:          '📱 Agent Social Media',
      provider:            'claude',
      model,
      system_prompt:       SYSTEM_PROMPT,
      tools_allowed:       [...SOCIAL_ALLOWED],
      tools_called:        toolsCalled,
      tool_count:          realCalls.length,
      raw_data_chars:      rawDataChars,
      tiktok_videos_found: totalTikTokVideos,
      fik_profile,
      analysis:            finalAnalysis,
      input_tokens:        totalInputTokens,
      output_tokens:       totalOutputTokens,
      total_ms:            totalMs,
      verdict:             'FAKE',
      verdict_reason:      `❌ ${errMsg}`,
      error:               errMsg,
    };
  }
}

// ── Helper ─────────────────────────────────────────────────────────────────────

function makeFailedResult(
  requestId: string, model: string, toolsCalled: SocialToolCall[],
  inp: number, out: number, ms: number, errMsg: string,
): SocialAgentResult {
  return {
    request_id:          requestId,
    agent_id:            'social',
    agent_name:          '📱 Agent Social Media',
    provider:            'claude',
    model,
    system_prompt:       SYSTEM_PROMPT,
    tools_allowed:       [...SOCIAL_ALLOWED],
    tools_called:        toolsCalled,
    tool_count:          0,
    raw_data_chars:      0,
    tiktok_videos_found: 0,
    fik_profile:         null,
    analysis:            '',
    input_tokens:        inp,
    output_tokens:       out,
    total_ms:            ms,
    verdict:             'FAKE',
    verdict_reason:      `❌ ${errMsg}`,
    error:               errMsg,
  };
}
