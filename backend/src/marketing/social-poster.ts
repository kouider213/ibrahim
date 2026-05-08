import axios from 'axios';
import { env } from '../config/env.js';
import type { PendingVideo } from './approval-store.js';

// ── Instagram Reels posting (Graph API) ──────────────────────

async function postToInstagramReels(video: PendingVideo): Promise<PostResult> {
  const userId = env.INSTAGRAM_USER_ID;
  const token  = env.INSTAGRAM_ACCESS_TOKEN;

  if (!userId || !token) {
    return { platform: 'instagram', success: false, message: 'Instagram non configuré — clés manquantes' };
  }
  if (!video.video_url?.startsWith('http')) {
    return { platform: 'instagram', success: false, message: 'URL vidéo non publique — Instagram Reels impossible' };
  }

  const caption = `${video.caption}\n\n${video.hashtags.join(' ')}`.slice(0, 2200);
  const BASE = 'https://graph.facebook.com/v19.0';

  try {
    // Step 1: Create Reels container
    const { data: container } = await axios.post<{ id: string }>(
      `${BASE}/${userId}/media`,
      null,
      {
        params: {
          media_type:  'REELS',
          video_url:   video.video_url,
          caption,
          access_token: token,
        },
        timeout: 20_000,
      },
    );
    const containerId = container.id;

    // Step 2: Poll until container ready (max ~100s)
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 5_000));
      const { data: status } = await axios.get<{ status_code: string }>(
        `${BASE}/${containerId}`,
        { params: { fields: 'status_code', access_token: token }, timeout: 10_000 },
      );
      if (status.status_code === 'FINISHED') break;
      if (status.status_code === 'ERROR') throw new Error('Container Instagram — statut ERROR');
    }

    // Step 3: Publish
    const { data: pub } = await axios.post<{ id: string }>(
      `${BASE}/${userId}/media_publish`,
      null,
      { params: { creation_id: containerId, access_token: token }, timeout: 15_000 },
    );

    return {
      platform: 'instagram',
      success:  true,
      post_id:  pub.id,
      message:  `✅ Reel Instagram publié !`,
    };
  } catch (err) {
    return {
      platform: 'instagram',
      success:  false,
      message:  `❌ Instagram API: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export interface PostResult {
  platform: string;
  success:  boolean;
  post_id?: string;
  url?:     string;
  message:  string;
}

// ── TikTok Content Posting API (Direct Post) ─────────────────
// Docs: https://developers.tiktok.com/doc/content-posting-api-reference-direct-post

async function postToTikTokDirect(video: PendingVideo): Promise<PostResult> {
  const accessToken = env.TIKTOK_ACCESS_TOKEN;
  const openId      = env.TIKTOK_OPEN_ID;

  if (!accessToken || !openId) {
    return { platform: 'tiktok', success: false, message: 'TikTok API non configuré — clés manquantes' };
  }

  const caption = `${video.caption} ${video.hashtags.join(' ')}`.slice(0, 2200);

  try {
    // Step 1: Init upload
    const initRes = await axios.post<{
      data: { publish_id: string; upload_url: string };
      error: { code: string; message: string };
    }>(
      'https://open.tiktokapis.com/v2/post/publish/video/init/',
      {
        post_info: {
          title:             caption,
          privacy_level:     'PUBLIC_TO_EVERYONE',
          disable_duet:      false,
          disable_comment:   false,
          disable_stitch:    false,
          video_cover_timestamp_ms: 1000,
        },
        source_info: {
          source:    'PULL_FROM_URL',
          video_url: video.video_url,
        },
      },
      {
        headers: {
          Authorization:  `Bearer ${accessToken}`,
          'Content-Type': 'application/json; charset=UTF-8',
        },
      },
    );

    if (initRes.data.error?.code && initRes.data.error.code !== 'ok') {
      throw new Error(initRes.data.error.message);
    }

    const publishId = initRes.data.data.publish_id;

    // Step 2: Poll until published
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 5000));
      const statusRes = await axios.post<{
        data: { status: string; publicaly_available_post_id?: string[] };
        error: { code: string };
      }>(
        'https://open.tiktokapis.com/v2/post/publish/status/fetch/',
        { publish_id: publishId },
        { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json; charset=UTF-8' } },
      );

      const status = statusRes.data.data?.status;
      if (status === 'PUBLISH_COMPLETE') {
        const postId = statusRes.data.data.publicaly_available_post_id?.[0];
        return {
          platform: 'tiktok',
          success:  true,
          post_id:  postId,
          url:      postId ? `https://www.tiktok.com/@fikconcierge/video/${postId}` : undefined,
          message:  `✅ Vidéo publiée sur TikTok !`,
        };
      }
      if (status === 'FAILED') throw new Error('TikTok publishing failed');
    }
    throw new Error('TikTok publish timeout');
  } catch (err) {
    return {
      platform: 'tiktok',
      success:  false,
      message:  `❌ TikTok API: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ── Package prêt à poster manuellement sur TikTok ────────────

export function buildSharePackage(video: PendingVideo): string {
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

// ── Publish to all configured platforms ──────────────────────

export async function publishVideo(video: PendingVideo): Promise<PostResult> {
  const tiktok = await postToTikTokDirect(video);

  // Instagram Reels en parallèle si configuré + URL publique disponible
  if (env.INSTAGRAM_USER_ID && env.INSTAGRAM_ACCESS_TOKEN && video.video_url?.startsWith('http')) {
    const ig = await postToInstagramReels(video);
    const parts = [tiktok.message, ig.success ? ig.message : `⚠️ IG: ${ig.message}`];
    return {
      platform: tiktok.success || ig.success ? 'tiktok+instagram' : 'none',
      success:  tiktok.success || ig.success,
      post_id:  tiktok.post_id ?? ig.post_id,
      url:      tiktok.url,
      message:  parts.join('\n'),
    };
  }

  return tiktok;
}
