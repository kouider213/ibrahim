import axios from 'axios';
import { env } from '../config/env.js';
import type { PendingVideo } from './approval-store.js';

export interface PostResult {
  platform: string;
  success:  boolean;
  post_id?: string;
  url?:     string;
  message:  string;
}

// ── Instagram Graph API (Reels) ───────────────────────────────

async function waitForContainer(containerId: string, accessToken: string): Promise<void> {
  for (let i = 0; i < 15; i++) {
    await new Promise(r => setTimeout(r, 5000));
    const { data } = await axios.get<{ status_code: string }>(
      `https://graph.facebook.com/v19.0/${containerId}?fields=status_code&access_token=${accessToken}`,
    );
    if (data.status_code === 'FINISHED') return;
    if (data.status_code === 'ERROR') throw new Error('Instagram container processing failed');
  }
  throw new Error('Instagram processing timeout');
}

export async function postToInstagram(video: PendingVideo): Promise<PostResult> {
  const accessToken = env.INSTAGRAM_ACCESS_TOKEN;
  const igUserId    = env.INSTAGRAM_USER_ID;

  if (!accessToken || !igUserId) {
    return { platform: 'instagram', success: false, message: 'Instagram API non configuré — clés manquantes' };
  }

  try {
    const caption = `${video.caption}\n\n${video.hashtags.join(' ')}`;

    const container = await axios.post<{ id: string }>(
      `https://graph.facebook.com/v19.0/${igUserId}/media`,
      { video_url: video.video_url, caption, media_type: 'REELS', access_token: accessToken },
    );
    const containerId = container.data.id;
    await waitForContainer(containerId, accessToken);

    const publish = await axios.post<{ id: string }>(
      `https://graph.facebook.com/v19.0/${igUserId}/media_publish`,
      { creation_id: containerId, access_token: accessToken },
    );

    return {
      platform: 'instagram',
      success:  true,
      post_id:  publish.data.id,
      url:      `https://www.instagram.com/reel/${publish.data.id}`,
      message:  `✅ Reel Instagram publié !`,
    };
  } catch (err) {
    return {
      platform: 'instagram',
      success:  false,
      message:  `❌ Instagram: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ── Generate ready-to-post package (fallback) ─────────────────

export function buildSharePackage(video: PendingVideo): string {
  const caption  = `${video.caption}\n\n${video.hashtags.join(' ')}`;
  const lines: string[] = [
    `🎬 *Vidéo prête à publier !*`,
    ``,
    `🚗 *Voiture:* ${video.car_name}`,
    ``,
    `📝 *Légende à copier:*`,
    `\`\`\``,
    caption,
    `\`\`\``,
    ``,
    `🔗 *Lien vidéo (télécharge et publie):*`,
    video.video_url,
    ``,
    `📱 *Meilleure heure pour TikTok/Instagram:* maintenant ou ce soir 20h-22h`,
    ``,
    `💡 *Astuce:* Publie en Reel Instagram ET TikTok en même temps pour doubler la portée !`,
  ];
  return lines.join('\n');
}

// ── Try all configured platforms ─────────────────────────────

export async function publishVideo(video: PendingVideo): Promise<PostResult[]> {
  const results: PostResult[] = [];

  const igResult = await postToInstagram(video);
  results.push(igResult);

  return results;
}
