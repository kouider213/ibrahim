"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.apifyRun = apifyRun;
exports.parseVideo = parseVideo;
exports.scrapeTikTokForOranCars = scrapeTikTokForOranCars;
exports.formatTikTokDataForReport = formatTikTokDataForReport;
exports.serializeTikTokData = serializeTikTokData;
const axios_1 = __importDefault(require("axios"));
const env_js_1 = require("../config/env.js");
// ── APIFY runner ──────────────────────────────────────────────────────────────
async function apifyRun(actorId, input) {
    const apiKey = env_js_1.env.APIFY_API_KEY;
    if (!apiKey)
        return [];
    const runResp = await axios_1.default.post(`https://api.apify.com/v2/acts/${actorId}/runs?token=${apiKey}`, input, { timeout: 30_000 });
    const runId = runResp.data?.data?.id ?? '';
    if (!runId)
        return [];
    let datasetId = '';
    for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 5_000));
        const poll = await axios_1.default.get(`https://api.apify.com/v2/actor-runs/${runId}?token=${apiKey}`, { timeout: 10_000 });
        const status = poll.data?.data?.status ?? '';
        if (status === 'SUCCEEDED') {
            datasetId = poll.data?.data?.defaultDatasetId ?? '';
            break;
        }
        if (status === 'FAILED' || status === 'ABORTED')
            return [];
    }
    if (!datasetId)
        return [];
    const items = await axios_1.default.get(`https://api.apify.com/v2/datasets/${datasetId}/items?token=${apiKey}&limit=60`, { timeout: 15_000 });
    return items.data ?? [];
}
// ── Parser ─────────────────────────────────────────────────────────────────────
// Strip lone Unicode surrogates that APIFY sometimes emits (truncated emoji sequences).
// Claude's JSON parser rejects them with "no low surrogate" errors.
function stripSurrogates(s) {
    return s.replace(/[\uD800-\uDFFF]/g, '');
}
function parseVideo(raw) {
    const v = raw;
    const am = (v['authorMeta'] ?? v['author']) ?? {};
    const st = v['stats'] ?? {};
    const views = v['playCount'] ?? st['playCount'] ?? null;
    const likes = v['diggCount'] ?? st['diggCount'] ?? null;
    const comments = v['commentCount'] ?? st['commentCount'] ?? null;
    const shares = v['shareCount'] ?? st['shareCount'] ?? null;
    const followers = am['fans'] ?? am['followerCount'] ?? null;
    let engagementRate = null;
    if (views && views > 0) {
        engagementRate = Math.round(((likes ?? 0) + (comments ?? 0) + (shares ?? 0)) / views * 1000) / 10;
    }
    const rawTags = v['hashtags'] ?? [];
    const hashtags = rawTags.map(h => h['name'] ?? '').filter(Boolean);
    const ct = v['createTime'];
    const publishedAt = v['createTimeISO']
        ?? (ct ? new Date(ct * 1000).toISOString() : null);
    return {
        id: v['id'] ?? '',
        author: am['name']
            ?? am['uniqueId']
            ?? v['authorUniqueId']
            ?? 'unknown',
        authorFollowers: followers,
        description: stripSurrogates((v['text'] ?? v['desc'] ?? '').slice(0, 200)),
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
function aggregate(videos, hashtags, profiles) {
    const tagStats = {};
    for (const v of videos) {
        for (const tag of v.hashtags) {
            if (!tagStats[tag])
                tagStats[tag] = { totalViews: 0, count: 0 };
            tagStats[tag].totalViews += v.views ?? 0;
            tagStats[tag].count += 1;
        }
    }
    const topHashtags = Object.entries(tagStats)
        .map(([tag, s]) => ({ tag, avgViews: s.count ? Math.round(s.totalViews / s.count) : 0, count: s.count }))
        .sort((a, b) => b.avgViews - a.avgViews)
        .slice(0, 12);
    const authorStats = {};
    for (const v of videos) {
        if (!authorStats[v.author])
            authorStats[v.author] = { followers: v.authorFollowers, totalViews: 0, videoCount: 0 };
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
const HASHTAGS = [
    'locationoran', 'locationvoitureoran', 'voitureoran', 'locationvoiture',
    'oranalgerie', 'algerie', 'locationaeroport', 'mre2025', 'oranete2025',
    'voitureoranalgerie', 'mreoran', 'locationalgerie', 'fikconcierge',
];
const PROFILES = ['didanolocation', 'locationoranalgerie', 'orancar', 'autolocationoran'];
async function scrapeTikTokForOranCars(carFocus, extraHashtags) {
    // Build contextual hashtag list
    const carTags = carFocus
        ? [carFocus.toLowerCase().replace(/\s+/g, ''), `${carFocus.toLowerCase().replace(/\s+/g, '')}oran`]
        : [];
    const allHashtags = [...new Set([...HASHTAGS, ...carTags, ...(extraHashtags ?? [])])];
    if (!env_js_1.env.APIFY_API_KEY) {
        return {
            source: 'unavailable', scrapedAt: new Date().toISOString(),
            hashtags: allHashtags, profiles: PROFILES,
            videos: [], topHashtags: [], topAuthors: [], avgEngagement: null,
            error: 'APIFY_API_KEY absent — données TikTok réelles non disponibles',
        };
    }
    // Hashtags + profils concurrents en parallèle
    const [hashItems, profItems] = await Promise.all([
        apifyRun('clockworks~tiktok-scraper', {
            hashtags: allHashtags, resultsPerPage: 20,
            shouldDownloadVideos: false, shouldDownloadCovers: false,
        }).catch(() => []),
        apifyRun('clockworks~tiktok-scraper', {
            profiles: PROFILES, resultsPerPage: 10,
            shouldDownloadVideos: false, shouldDownloadCovers: false,
        }).catch(() => []),
    ]);
    const all = [...hashItems, ...profItems];
    if (!all.length) {
        return {
            source: 'unavailable', scrapedAt: new Date().toISOString(),
            hashtags: allHashtags, profiles: PROFILES,
            videos: [], topHashtags: [], topAuthors: [], avgEngagement: null,
            error: 'APIFY run retourné 0 résultats (TikTok anti-scraping actif ou acteur épuisé)',
        };
    }
    return aggregate(all.map(parseVideo), allHashtags, PROFILES);
}
// ── Formatter for Claude prompt ───────────────────────────────────────────────
function formatTikTokDataForReport(data) {
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
        ...data.topHashtags.slice(0, 8).map(h => `  #${h.tag}: ~${h.avgViews.toLocaleString('fr-FR')} vues moy. (${h.count} vidéos)`),
        '',
        '👥 TOP COMPTES (vues totales réelles):',
        ...data.topAuthors.slice(0, 6).map(a => `  @${a.handle}: ${a.totalViews.toLocaleString('fr-FR')} vues | abonnés: ${a.followers !== null ? a.followers.toLocaleString('fr-FR') : '?'} | ${a.videoCount} vidéo(s)`),
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
function serializeTikTokData(data) {
    return JSON.stringify({
        source: data.source,
        scrapedAt: data.scrapedAt,
        videoCount: data.videos.length,
        avgEngagement: data.avgEngagement,
        topHashtags: data.topHashtags,
        topAuthors: data.topAuthors,
        sampleVideos: data.videos.slice(0, 5),
        error: data.error,
    }, null, 2);
}
//# sourceMappingURL=apify-tiktok.js.map