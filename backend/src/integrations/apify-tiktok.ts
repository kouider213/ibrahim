import axios from 'axios';
import { env } from '../config/env.js';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface TikTokVideo {
  id:              string;
  author:          string;
  authorFollowers: number | null;
  description:     string;
  hashtags:        string[];
  views:           number | null;
  likes:           number | null;
  comments:        number | null;
  shares:          number | null;
  publishedAt:     string | null;
  engagementRate:  number | null; // (likes+comments+shares)/views * 100
}

export interface TikTokRealData {
  source:        'apify' | 'unavailable';
  scrapedAt:     string;
  hashtags:      string[];
  profiles:      string[];
  videos:        TikTokVideo[];
  topHashtags:   Array<{ tag: string; avgViews: number; count: number }>;
  topAuthors:    Array<{ handle: string; followers: number | null; totalViews: number; videoCount: number }>;
  avgEngagement: number | null; // mean across videos that have metrics
  error?:        string;
}

// ── APIFY runner ──────────────────────────────────────────────────────────────

async function apifyRun(actorId: string, input: Record<string, unknown>): Promise<unknown[]> {
  const apiKey = env.APIFY_API_KEY;
  if (!apiKey) return [];

  type ApifyRunResp  = { data: { id: string } };
  type ApifyPollResp = { data: { status: string; defaultDatasetId: string } };

  const runResp = await axios.post<ApifyRunResp>(
    `https://api.apify.com/v2/acts/${actorId}/runs?token=${apiKey}`,
    input,
    { timeout: 30_000 },
  );

  const runId = runResp.data?.data?.id ?? '';
  if (!runId) return [];

  let datasetId = '';
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 5_000));
    const poll = await axios.get<ApifyPollResp>(
      `https://api.apify.com/v2/actor-runs/${runId}?token=${apiKey}`,
      { timeout: 10_000 },
    );
    const status = poll.data?.data?.status ?? '';
    if (status === 'SUCCEEDED') { datasetId = poll.data?.data?.defaultDatasetId ?? ''; break; }
    if (status === 'FAILED' || status === 'ABORTED') return [];
  }

  if (!datasetId) return [];

  const items = await axios.get<unknown[]>(
    `https://api.apify.com/v2/datasets/${datasetId}/items?token=${apiKey}&limit=60`,
    { timeout: 15_000 },
  );
  return items.data ?? [];
}

// ── Parser ─────────────────────────────────────────────────────────────────────

function parseVideo(raw: unknown): TikTokVideo {
  const v = raw as Record<string, unknown>;
  const am  = ((v['authorMeta'] ?? v['author']) as Record<string, unknown> | undefined) ?? {};
  const st  = (v['stats']  as Record<string, unknown> | undefined) ?? {};

  const views    = (v['playCount']    as number | undefined) ?? (st['playCount']    as number | undefined) ?? null;
  const likes    = (v['diggCount']    as number | undefined) ?? (st['diggCount']    as number | undefined) ?? null;
  const comments = (v['commentCount'] as number | undefined) ?? (st['commentCount'] as number | undefined) ?? null;
  const shares   = (v['shareCount']   as number | undefined) ?? (st['shareCount']   as number | undefined) ?? null;
  const followers = (am['fans'] as number | undefined) ?? (am['followerCount'] as number | undefined) ?? null;

  let engagementRate: number | null = null;
  if (views && views > 0) {
    engagementRate = Math.round(((likes ?? 0) + (comments ?? 0) + (shares ?? 0)) / views * 1000) / 10;
  }

  const rawTags = (v['hashtags'] as Array<Record<string, unknown>> | undefined) ?? [];
  const hashtags = rawTags.map(h => (h['name'] as string | undefined) ?? '').filter(Boolean);

  const ct = v['createTime'] as number | undefined;
  const publishedAt = (v['createTimeISO'] as string | undefined)
    ?? (ct ? new Date(ct * 1000).toISOString() : null);

  return {
    id:              (v['id'] as string | undefined) ?? '',
    author:          (am['name'] as string | undefined)
                     ?? (am['uniqueId'] as string | undefined)
                     ?? (v['authorUniqueId'] as string | undefined)
                     ?? 'unknown',
    authorFollowers: followers,
    description:     ((v['text'] as string | undefined) ?? (v['desc'] as string | undefined) ?? '').slice(0, 200),
    hashtags,
    views,
    likes,
    comments,
    shares,
    publishedAt,
    engagementRate,
  };
}

// ── Aggregation ───────────────────────────────────────────────────────────────

function aggregate(videos: TikTokVideo[], hashtags: string[], profiles: string[]): TikTokRealData {
  const tagStats: Record<string, { totalViews: number; count: number }> = {};
  for (const v of videos) {
    for (const tag of v.hashtags) {
      if (!tagStats[tag]) tagStats[tag] = { totalViews: 0, count: 0 };
      tagStats[tag].totalViews += v.views ?? 0;
      tagStats[tag].count += 1;
    }
  }
  const topHashtags = Object.entries(tagStats)
    .map(([tag, s]) => ({ tag, avgViews: s.count ? Math.round(s.totalViews / s.count) : 0, count: s.count }))
    .sort((a, b) => b.avgViews - a.avgViews)
    .slice(0, 12);

  const authorStats: Record<string, { followers: number | null; totalViews: number; videoCount: number }> = {};
  for (const v of videos) {
    if (!authorStats[v.author]) authorStats[v.author] = { followers: v.authorFollowers, totalViews: 0, videoCount: 0 };
    authorStats[v.author].totalViews += v.views ?? 0;
    authorStats[v.author].videoCount += 1;
  }
  const topAuthors = Object.entries(authorStats)
    .map(([handle, s]) => ({ handle, ...s }))
    .sort((a, b) => b.totalViews - a.totalViews)
    .slice(0, 8);

  const withEng = videos.filter(v => v.engagementRate !== null);
  const avgEngagement = withEng.length
    ? Math.round(withEng.reduce((s, v) => s + (v.engagementRate ?? 0), 0) / withEng.length * 10) / 10
    : null;

  return {
    source: 'apify', scrapedAt: new Date().toISOString(),
    hashtags, profiles, videos, topHashtags, topAuthors, avgEngagement,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

const HASHTAGS  = ['locationoran', 'locationvoitureoran', 'voitureoran', 'locationvoiture', 'oranalgerie', 'algerie'];
const PROFILES  = ['didanolocation', 'locationoranalgerie', 'orancar', 'autolocationoran'];

export async function scrapeTikTokForOranCars(): Promise<TikTokRealData> {
  if (!env.APIFY_API_KEY) {
    return {
      source: 'unavailable', scrapedAt: new Date().toISOString(),
      hashtags: HASHTAGS, profiles: PROFILES,
      videos: [], topHashtags: [], topAuthors: [], avgEngagement: null,
      error: 'APIFY_API_KEY absent — données TikTok réelles non disponibles',
    };
  }

  // Hashtags + profils concurrents en parallèle
  const [hashItems, profItems] = await Promise.all([
    apifyRun('clockworks~tiktok-scraper', {
      hashtags: HASHTAGS, resultsPerPage: 20,
      shouldDownloadVideos: false, shouldDownloadCovers: false,
    }).catch((): unknown[] => []),
    apifyRun('clockworks~tiktok-scraper', {
      profiles: PROFILES, resultsPerPage: 10,
      shouldDownloadVideos: false, shouldDownloadCovers: false,
    }).catch((): unknown[] => []),
  ]);

  const all = [...hashItems, ...profItems];
  if (!all.length) {
    return {
      source: 'unavailable', scrapedAt: new Date().toISOString(),
      hashtags: HASHTAGS, profiles: PROFILES,
      videos: [], topHashtags: [], topAuthors: [], avgEngagement: null,
      error: 'APIFY run retourné 0 résultats (TikTok anti-scraping actif ou acteur épuisé)',
    };
  }

  return aggregate(all.map(parseVideo), HASHTAGS, PROFILES);
}

// ── Formatter for Claude prompt ───────────────────────────────────────────────

export function formatTikTokDataForReport(data: TikTokRealData): string {
  if (data.source === 'unavailable') {
    return `⚠️ DONNÉES RÉELLES INDISPONIBLES\nRaison: ${data.error ?? 'inconnue'}\nN'invente aucune donnée — signale l'indisponibilité.`;
  }

  const topVideos = [...data.videos]
    .sort((a, b) => (b.views ?? 0) - (a.views ?? 0))
    .slice(0, 12);

  return [
    `📊 DONNÉES TIKTOK RÉELLES — scrapé ${new Date(data.scrapedAt).toLocaleString('fr-FR')}`,
    `Vidéos analysées: ${data.videos.length} | Engagement moyen: ${data.avgEngagement !== null ? `${data.avgEngagement}%` : 'N/A'}`,
    '',
    '🔥 TOP HASHTAGS (vues moyennes réelles):',
    ...data.topHashtags.slice(0, 8).map(h =>
      `  #${h.tag}: ~${h.avgViews.toLocaleString('fr-FR')} vues moy. (${h.count} vidéos)`,
    ),
    '',
    '👥 TOP COMPTES (vues totales réelles):',
    ...data.topAuthors.slice(0, 6).map(a =>
      `  @${a.handle}: ${a.totalViews.toLocaleString('fr-FR')} vues | abonnés: ${a.followers !== null ? a.followers.toLocaleString('fr-FR') : '?'} | ${a.videoCount} vidéo(s)`,
    ),
    '',
    '📹 TOP 12 VIDÉOS PAR VUES:',
    ...topVideos.map(v => [
      `  @${v.author}: "${v.description.slice(0, 90)}"`,
      `  👁 ${(v.views ?? '?').toLocaleString()} | ❤️ ${(v.likes ?? '?').toLocaleString()} | 💬 ${(v.comments ?? '?').toLocaleString()} | eng: ${v.engagementRate !== null ? `${v.engagementRate}%` : '?'}`,
      `  Tags: ${v.hashtags.slice(0, 5).map(t => `#${t}`).join(' ')} | ${v.publishedAt ? new Date(v.publishedAt).toLocaleDateString('fr-FR') : '?'}`,
    ].join('\n')),
  ].join('\n');
}

// ── Raw JSON export (for audit proof) ────────────────────────────────────────

export function serializeTikTokData(data: TikTokRealData): string {
  return JSON.stringify({
    source:        data.source,
    scrapedAt:     data.scrapedAt,
    videoCount:    data.videos.length,
    avgEngagement: data.avgEngagement,
    topHashtags:   data.topHashtags,
    topAuthors:    data.topAuthors,
    sampleVideos:  data.videos.slice(0, 5),
    error:         data.error,
  }, null, 2);
}
