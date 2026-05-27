"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildSharePackage = buildSharePackage;
exports.publishVideo = publishVideo;
const axios_1 = __importDefault(require("axios"));
const env_js_1 = require("../config/env.js");
// ── TikTok Content Posting API (Direct Post) ─────────────────
// Docs: https://developers.tiktok.com/doc/content-posting-api-reference-direct-post
async function postToTikTokDirect(video) {
    const accessToken = env_js_1.env.TIKTOK_ACCESS_TOKEN;
    const openId = env_js_1.env.TIKTOK_OPEN_ID;
    if (!accessToken || !openId) {
        return { platform: 'tiktok', success: false, message: 'TikTok API non configuré — clés manquantes' };
    }
    const caption = `${video.caption} ${video.hashtags.join(' ')}`.slice(0, 2200);
    try {
        // Step 1: Init upload
        const initRes = await axios_1.default.post('https://open.tiktokapis.com/v2/post/publish/video/init/', {
            post_info: {
                title: caption,
                privacy_level: 'PUBLIC_TO_EVERYONE',
                disable_duet: false,
                disable_comment: false,
                disable_stitch: false,
                video_cover_timestamp_ms: 1000,
            },
            source_info: {
                source: 'PULL_FROM_URL',
                video_url: video.video_url,
            },
        }, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json; charset=UTF-8',
            },
        });
        if (initRes.data.error?.code && initRes.data.error.code !== 'ok') {
            throw new Error(initRes.data.error.message);
        }
        const publishId = initRes.data.data.publish_id;
        // Step 2: Poll until published
        for (let i = 0; i < 20; i++) {
            await new Promise(r => setTimeout(r, 5000));
            const statusRes = await axios_1.default.post('https://open.tiktokapis.com/v2/post/publish/status/fetch/', { publish_id: publishId }, { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json; charset=UTF-8' } });
            const status = statusRes.data.data?.status;
            if (status === 'PUBLISH_COMPLETE') {
                const postId = statusRes.data.data.publicaly_available_post_id?.[0];
                return {
                    platform: 'tiktok',
                    success: true,
                    post_id: postId,
                    url: postId ? `https://www.tiktok.com/@fikconcierge/video/${postId}` : undefined,
                    message: `✅ Vidéo publiée sur TikTok !`,
                };
            }
            if (status === 'FAILED')
                throw new Error('TikTok publishing failed');
        }
        throw new Error('TikTok publish timeout');
    }
    catch (err) {
        return {
            platform: 'tiktok',
            success: false,
            message: `❌ TikTok API: ${err instanceof Error ? err.message : String(err)}`,
        };
    }
}
// ── Package prêt à poster manuellement sur TikTok ────────────
function buildSharePackage(video) {
    const caption = `${video.caption}\n\n${video.hashtags.join(' ')}`;
    return [
        `✅ *Vidéo validée — prête pour TikTok !*`,
        ``,
        `📥 *1. Télécharge la vidéo:*`,
        video.video_url,
        ``,
        `📝 *2. Copie cette légende:*`,
        `\`\`\``,
        caption,
        `\`\`\``,
        ``,
        `📱 *3. Ouvre TikTok → + → Upload → colle la légende → Publier*`,
        ``,
        `⏰ *Meilleur moment:* maintenant ou ce soir 19h-22h`,
        ``,
        `💡 Épingle ce post pour qu'il reste en haut de ton profil !`,
    ].join('\n');
}
// ── Publish (TikTok API si configuré, sinon package manuel) ──
async function publishVideo(video) {
    return postToTikTokDirect(video);
}
//# sourceMappingURL=social-poster.js.map