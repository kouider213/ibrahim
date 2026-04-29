/**
 * Kling AI — Génération de vidéo IA depuis une image (image-to-video)
 * API: https://klingai.com/api
 * Documentation: https://docs.klingai.com
 */

import axios from 'axios';
import crypto from 'crypto';
import { env } from '../config/env.js';

const KLING_BASE = 'https://api.klingai.com';

export interface KlingVideoOptions {
  /** URL publique de l'image source */
  imageUrl: string;
  /** Prompt décrivant le mouvement / scène souhaitée */
  prompt: string;
  /** Durée en secondes: 5 ou 10 (défaut: 5) */
  duration?: 5 | 10;
  /** Ratio: "16:9", "9:16", "1:1" (défaut: "9:16" pour TikTok) */
  aspectRatio?: '16:9' | '9:16' | '1:1';
  /** Mode: "std" (standard) ou "pro" (défaut: "std") */
  mode?: 'std' | 'pro';
  /** Négatif prompt */
  negativePrompt?: string;
  /** Seed (optionnel) */
  seed?: number;
}

export interface KlingVideoResult {
  taskId: string;
  status: 'submitted' | 'processing' | 'succeed' | 'failed';
  videoUrl?: string;
  buffer?: Buffer;
  error?: string;
}

/**
 * Génère un JWT HS256 pour l'API Kling AI
 * Format clé attendu: "access_key_id:access_key_secret"
 */
function buildKlingAuthHeader(): string {
  const apiKey = env.KLING_API_KEY;
  if (!apiKey) throw new Error('KLING_API_KEY non configurée dans Railway');

  // Format "id:secret" → JWT HS256
  if (apiKey.includes(':')) {
    const colonIdx = apiKey.indexOf(':');
    const id       = apiKey.slice(0, colonIdx);
    const secret   = apiKey.slice(colonIdx + 1);

    const header  = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const now     = Math.floor(Date.now() / 1000);
    const payload = Buffer.from(JSON.stringify({ iss: id, exp: now + 1800, nbf: now - 5 })).toString('base64url');
    const sig     = crypto.createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');

    return `Bearer ${header}.${payload}.${sig}`;
  }

  // Clé directe (Bearer token simple)
  return `Bearer ${apiKey}`;
}

/**
 * Soumettre une tâche image-to-video sur Kling AI
 */
export async function createKlingVideoTask(opts: KlingVideoOptions): Promise<string> {
  const auth = buildKlingAuthHeader();

  const body: Record<string, unknown> = {
    model_name:   'kling-v1',
    image_url:    opts.imageUrl,
    prompt:       opts.prompt,
    duration:     String(opts.duration ?? 5),
    aspect_ratio: opts.aspectRatio ?? '9:16',
    mode:         opts.mode ?? 'std',
  };

  if (opts.negativePrompt) body['negative_prompt'] = opts.negativePrompt;
  if (opts.seed !== undefined) body['seed'] = opts.seed;

  const resp = await axios.post<{ code: number; message: string; data: { task_id: string } }>(
    `${KLING_BASE}/v1/videos/image2video`,
    body,
    {
      headers: {
        Authorization: auth,
        'Content-Type': 'application/json',
      },
      timeout: 30_000,
    },
  );

  if (resp.data.code !== 0) {
    throw new Error(`Kling AI erreur ${resp.data.code}: ${resp.data.message}`);
  }

  return resp.data.data.task_id;
}

/**
 * Vérifier le statut d'une tâche Kling AI
 */
export async function getKlingTaskStatus(taskId: string): Promise<KlingVideoResult> {
  const auth = buildKlingAuthHeader();

  const resp = await axios.get<{
    code: number;
    message: string;
    data: {
      task_id: string;
      task_status: string;
      task_result?: {
        videos?: Array<{ url: string; duration: string }>;
      };
    };
  }>(
    `${KLING_BASE}/v1/videos/image2video/${taskId}`,
    {
      headers: { Authorization: auth },
      timeout: 15_000,
    },
  );

  if (resp.data.code !== 0) {
    throw new Error(`Kling status erreur ${resp.data.code}: ${resp.data.message}`);
  }

  const d = resp.data.data;
  const statusMap: Record<string, KlingVideoResult['status']> = {
    submitted:  'submitted',
    processing: 'processing',
    succeed:    'succeed',
    failed:     'failed',
  };

  const status  = statusMap[d.task_status] ?? 'processing';
  const videos  = d.task_result?.videos ?? [];

  return {
    taskId,
    status,
    videoUrl: videos[0]?.url,
    error: status === 'failed' ? 'Génération échouée côté Kling AI' : undefined,
  };
}

/**
 * Attendre la fin d'une tâche Kling AI (polling, timeout 4min)
 */
export async function waitForKlingVideo(taskId: string, timeoutMs = 240_000): Promise<KlingVideoResult> {
  const start         = Date.now();
  const POLL_INTERVAL = 8_000;

  while (Date.now() - start < timeoutMs) {
    const result = await getKlingTaskStatus(taskId);

    if (result.status === 'succeed') {
      if (result.videoUrl) {
        const resp = await axios.get<ArrayBuffer>(result.videoUrl, {
          responseType: 'arraybuffer',
          timeout:      60_000,
        });
        result.buffer = Buffer.from(resp.data);
      }
      return result;
    }

    if (result.status === 'failed') return result;

    await new Promise<void>(resolve => setTimeout(resolve, POLL_INTERVAL));
  }

  return {
    taskId,
    status: 'failed',
    error:  `Timeout: génération Kling AI > ${timeoutMs / 1000}s`,
  };
}

/**
 * Pipeline complet: soumettre + attendre + retourner buffer vidéo
 */
export async function generateKlingVideo(opts: KlingVideoOptions): Promise<Buffer> {
  const taskId = await createKlingVideoTask(opts);
  console.log(`[kling] Task submitted: ${taskId}`);

  const result = await waitForKlingVideo(taskId);

  if (result.status !== 'succeed' || !result.buffer) {
    throw new Error(result.error ?? 'Génération Kling AI échouée');
  }

  console.log(`[kling] ✅ Vidéo générée (${result.buffer.length} bytes)`);
  return result.buffer;
}

/** Vérifie si Kling AI est configuré */
export function isKlingAvailable(): boolean {
  return Boolean(env.KLING_API_KEY);
}
