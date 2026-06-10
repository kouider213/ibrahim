/**
 * image-to-image.ts
 *
 * Pipeline image-to-image avec conservation du visage / identité.
 *
 * PROVIDERS (par ordre de préférence):
 *  1. fal-ai/ip-adapter-face-id   — face preservation forte (fal.ai)
 *  2. fal-ai/flux/dev/image-to-image — style transfer avec prompt (fal.ai)
 *  3. Replicate — tencentarc/photomaker — photo réaliste portrait (Replicate)
 *
 * Le pipeline:
 *  1. Reçoit une image (Telegram file_id OU URL publique)
 *  2. Télécharge et encode en base64
 *  3. Envoie au provider avec le prompt de transformation
 *  4. Retourne l'URL de l'image résultante
 */

import axios from 'axios';
import { env } from '../config/env.js';
import { emitProactive } from '../notifications/mobile-push.js';
import { redis } from '../queue/queue.js';
import { supabase } from './supabase.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ImageToImageOptions {
  /** URL publique de l'image source (Telegram, Supabase, etc.) */
  sourceImageUrl: string;
  /** Prompt de transformation en anglais */
  prompt: string;
  /** Intensité de la transformation 0-1 (0=fidèle source, 1=libre) */
  strength?: number;
  /** Style prédéfini */
  style?: 'realistic' | 'anime' | 'warrior' | 'background_only' | 'cinematic';
  /** Provider forcé */
  provider?: 'auto' | 'fal_ip_adapter' | 'fal_flux' | 'replicate';
}

export interface ImageToImageResult {
  url: string;
  provider: string;
  mode: string;
}

// ── Style presets → prompt enrichi ────────────────────────────────────────────

const STYLE_PRESETS: Record<string, string> = {
  realistic:       'ultra-realistic photography, natural lighting, photorealistic, 4K, DSLR quality',
  anime:           'anime style, vibrant colors, cel shading, Studio Ghibli quality, detailed illustration',
  warrior:         'Algerian warrior costume, traditional North African attire, dramatic lighting, cinematic, epic portrait',
  background_only: 'keep the person exactly as-is, change only the background environment, photorealistic',
  cinematic:       'cinematic photography, film grain, dramatic lighting, movie scene, professional camera',
};

function buildPrompt(userPrompt: string, style?: string): string {
  const styleModifier = style ? (STYLE_PRESETS[style] ?? '') : '';
  const combined = styleModifier ? `${userPrompt}, ${styleModifier}` : userPrompt;
  return combined;
}

// ── Télécharger une image en base64 ──────────────────────────────────────────

export async function downloadImageAsBase64(imageUrl: string): Promise<{ base64: string; mimeType: string; sizeKb: number }> {
  const resp = await axios.get(imageUrl, {
    responseType: 'arraybuffer',
    timeout: 30_000,
  });
  const buf = Buffer.from(resp.data as ArrayBuffer);
  const sizeKb = Math.round(buf.length / 1024);
  const contentType = (resp.headers['content-type'] as string) ?? 'image/jpeg';
  const mimeType = contentType.split(';')[0].trim();
  const base64 = buf.toString('base64');
  return { base64, mimeType, sizeKb };
}

// ── fal.ai queue helper (réutilisé depuis tool-executor) ─────────────────────

async function falGenerate(
  modelId: string,
  input: Record<string, unknown>,
  falKey: string,
  maxMs = 180_000,
): Promise<string> {
  let submitResp;
  try {
    submitResp = await axios.post(
      `https://queue.fal.run/${modelId}`,
      input,
      { headers: { Authorization: `Key ${falKey}`, 'Content-Type': 'application/json' }, timeout: 30_000 },
    );
  } catch (err: any) {
    if (err.response) {
      throw new Error(`fal.ai (${modelId}): HTTP ${err.response.status} — ${JSON.stringify(err.response.data).slice(0, 300)}`);
    }
    throw err;
  }

  type FalQueue = { request_id: string; response_url?: string; status_url?: string };
  const queued = submitResp.data as FalQueue;
  const { request_id, response_url, status_url } = queued;
  const pollUrl   = status_url   ?? `https://queue.fal.run/${modelId}/requests/${request_id}/status`;
  const resultUrl = response_url ?? `https://queue.fal.run/${modelId}/requests/${request_id}`;

  const start = Date.now();
  while (Date.now() - start < maxMs) {
    await new Promise(r => setTimeout(r, 5000));
    const statusResp = await axios.get(pollUrl, {
      headers: { Authorization: `Key ${falKey}` },
      timeout: 15_000,
      validateStatus: () => true,
    });
    const jobStatus: string = (statusResp.data as any)?.status ?? '';
    if (jobStatus === 'COMPLETED') break;
    if (jobStatus === 'FAILED' || jobStatus === 'ERROR') {
      throw new Error(`fal.ai: job échoué (status=${jobStatus})`);
    }
  }

  const resultResp = await axios.get(resultUrl, {
    headers: { Authorization: `Key ${falKey}` },
    timeout: 15_000,
  });
  const result = resultResp.data as Record<string, unknown>;
  const images = result['images'] as any[] | undefined;
  if (images?.[0]?.url) return images[0].url as string;
  const singleImage = (result['image'] as any)?.url as string | undefined;
  if (singleImage) return singleImage;
  throw new Error(`fal.ai: aucune image dans la réponse — ${JSON.stringify(result).slice(0, 300)}`);
}

// ── Replicate helper ──────────────────────────────────────────────────────────

async function replicateGenerate(
  model: string,
  input: Record<string, unknown>,
  token: string,
  maxMs = 180_000,
): Promise<string> {
  const createResp = await axios.post(
    `https://api.replicate.com/v1/models/${model}/predictions`,
    { input },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Prefer: 'wait=10',
      },
      timeout: 30_000,
    },
  );

  type Pred = { id: string; status: string; output: unknown; error?: string };
  let pred = createResp.data as Pred;

  if (pred.status === 'succeeded') {
    const out = Array.isArray(pred.output) ? pred.output[0] : pred.output;
    return String(out);
  }

  const start = Date.now();
  while (Date.now() - start < maxMs) {
    await new Promise(r => setTimeout(r, 3000));
    const poll = await axios.get(`https://api.replicate.com/v1/predictions/${pred.id}`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 15_000,
    });
    pred = poll.data;
    if (pred.status === 'succeeded') {
      const out = Array.isArray(pred.output) ? pred.output[0] : pred.output;
      return String(out);
    }
    if (pred.status === 'failed' || pred.status === 'canceled') {
      throw new Error(`Replicate: ${pred.error ?? 'prediction failed'}`);
    }
  }
  throw new Error('Replicate: timeout après 3 minutes');
}

// ── PROVIDER 1: fal-ai/ip-adapter-face-id ────────────────────────────────────
// Conserve le visage exact de la personne, applique le prompt pour le reste

async function transformWithIpAdapter(
  sourceImageUrl: string,
  prompt: string,
  falKey: string,
): Promise<string> {
  console.log(`[i2i:ip-adapter] prompt="${prompt.slice(0, 80)}" sourceUrl=${sourceImageUrl.slice(0, 80)}`);

  // fal-ai/ip-adapter-face-id utilise des images de référence visage
  // Le modèle garde le visage et génère l'environnement selon le prompt
  const url = await falGenerate(
    'fal-ai/ip-adapter-face-id',
    {
      face_image_url: sourceImageUrl,
      prompt,
      negative_prompt: 'deformed face, distorted features, ugly, blurry, low quality, cartoon, anime, painting, sketch',
      num_inference_steps: 30,
      guidance_scale: 7.5,
      face_strength: 1.0,   // 1.0 = conservation maximale du visage
      image_strength: 0.6,  // 0.6 = liberté de génération du décor
      num_images: 1,
    },
    falKey,
    180_000,
  );
  console.log(`[i2i:ip-adapter] ✅ url=${url.slice(0, 80)}`);
  return url;
}

// ── PROVIDER 2: fal-ai/flux/dev/image-to-image ────────────────────────────────
// Style transfer fort avec fidélité variable au source

async function transformWithFlux(
  sourceImageUrl: string,
  prompt: string,
  strength: number,
  falKey: string,
): Promise<string> {
  console.log(`[i2i:flux] strength=${strength} prompt="${prompt.slice(0, 80)}"`);

  const url = await falGenerate(
    'fal-ai/flux/dev/image-to-image',
    {
      image_url: sourceImageUrl,
      prompt,
      strength,           // 0.0 = copie exacte, 1.0 = libre, 0.7 recommandé pour face
      num_inference_steps: 28,
      guidance_scale: 3.5,
      num_images: 1,
      output_format: 'jpeg',
    },
    falKey,
    180_000,
  );
  console.log(`[i2i:flux] ✅ url=${url.slice(0, 80)}`);
  return url;
}

// ── PROVIDER 3: Replicate — tencentarc/photomaker ────────────────────────────
// Modèle portrait haute fidélité — garde l'identité visuelle du sujet

async function transformWithPhotomaker(
  sourceImageUrl: string,
  prompt: string,
  replicateToken: string,
): Promise<string> {
  console.log(`[i2i:photomaker] prompt="${prompt.slice(0, 80)}"`);

  // PhotoMaker a besoin du token [img] dans le prompt pour marquer le sujet
  const photomakerPrompt = prompt.includes('[img]') ? prompt : `img ${prompt}`;

  const url = await replicateGenerate(
    'tencentarc/photomaker',
    {
      prompt: photomakerPrompt,
      input_image: sourceImageUrl,
      num_steps: 20,
      style_strength_ratio: 20,   // 20 = fidélité identité forte
      num_outputs: 1,
      guidance_scale: 5,
    },
    replicateToken,
    180_000,
  );
  console.log(`[i2i:photomaker] ✅ url=${url.slice(0, 80)}`);
  return url;
}

// ── Fonction principale exportée ──────────────────────────────────────────────

export async function transformImage(
  opts: ImageToImageOptions,
): Promise<ImageToImageResult> {
  const falKey        = env.FAL_KEY;
  const replicateKey  = env.REPLICATE_API_TOKEN;
  const strength      = opts.strength ?? 0.65;
  const forceProvider = opts.provider ?? 'auto';
  const fullPrompt    = buildPrompt(opts.prompt, opts.style);

  console.log(`[i2i] sourceUrl=${opts.sourceImageUrl.slice(0, 80)}`);
  console.log(`[i2i] prompt="${fullPrompt.slice(0, 120)}" strength=${strength} provider=${forceProvider}`);

  // Vérifier l'image source
  try {
    await axios.head(opts.sourceImageUrl, { timeout: 8_000 });
  } catch (err: any) {
    throw new Error(`Image source inaccessible: ${err.message}`);
  }

  // ── PROVIDER FORCÉ ────────────────────────────────────────────────────────
  if (forceProvider === 'fal_ip_adapter') {
    if (!falKey) throw new Error('FAL_KEY non configurée dans Railway');
    const url = await transformWithIpAdapter(opts.sourceImageUrl, fullPrompt, falKey);
    return { url, provider: 'fal.ai IP-Adapter FaceID', mode: 'face-preservation' };
  }
  if (forceProvider === 'fal_flux') {
    if (!falKey) throw new Error('FAL_KEY non configurée dans Railway');
    const url = await transformWithFlux(opts.sourceImageUrl, fullPrompt, strength, falKey);
    return { url, provider: 'fal.ai Flux Dev I2I', mode: 'image-to-image' };
  }
  if (forceProvider === 'replicate') {
    if (!replicateKey) throw new Error('REPLICATE_API_TOKEN non configuré dans Railway');
    const url = await transformWithPhotomaker(opts.sourceImageUrl, fullPrompt, replicateKey);
    return { url, provider: 'Replicate PhotoMaker', mode: 'face-preservation' };
  }

  // ── AUTO: cascade IP-Adapter → Flux → PhotoMaker ─────────────────────────
  const errors: string[] = [];

  // 1. IP-Adapter FaceID (meilleure conservation visage)
  if (falKey) {
    try {
      const url = await transformWithIpAdapter(opts.sourceImageUrl, fullPrompt, falKey);
      return { url, provider: 'fal.ai IP-Adapter FaceID', mode: 'face-preservation' };
    } catch (err: any) {
      errors.push(`IP-Adapter: ${err.message}`);
      console.warn(`[i2i] IP-Adapter échoué → Flux fallback: ${err.message}`);
    }
  }

  // 2. Flux Dev image-to-image (bon équilibre fidélité/créativité)
  if (falKey) {
    try {
      const url = await transformWithFlux(opts.sourceImageUrl, fullPrompt, strength, falKey);
      return { url, provider: 'fal.ai Flux Dev I2I', mode: 'image-to-image' };
    } catch (err: any) {
      errors.push(`Flux: ${err.message}`);
      console.warn(`[i2i] Flux échoué → PhotoMaker fallback: ${err.message}`);
    }
  }

  // 3. PhotoMaker via Replicate (portrait haute fidélité)
  if (replicateKey) {
    try {
      const url = await transformWithPhotomaker(opts.sourceImageUrl, fullPrompt, replicateKey);
      return { url, provider: 'Replicate PhotoMaker', mode: 'face-preservation' };
    } catch (err: any) {
      errors.push(`PhotoMaker: ${err.message}`);
      console.error(`[i2i] PhotoMaker aussi échoué: ${err.message}`);
    }
  }

  if (!falKey && !replicateKey) {
    throw new Error('Aucun provider configuré. Ajoute FAL_KEY ou REPLICATE_API_TOKEN dans Railway → Variables.');
  }

  throw new Error(`Tous les providers ont échoué:\n${errors.join('\n')}`);
}

// ── Outil Telegram ─────────────────────────────────────────────────────────────
// Reçoit le file_id Telegram d'une image, la télécharge via Bot API, la transforme, renvoie

export async function downloadTelegramImage(fileId: string): Promise<string> {
  const botToken = env.TELEGRAM_BOT_TOKEN;
  if (!botToken) throw new Error('TELEGRAM_BOT_TOKEN non configuré');

  const fileResp = await axios.get(
    `https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`,
    { timeout: 15_000 },
  );
  const filePath: string = (fileResp.data as any)?.result?.file_path;
  if (!filePath) throw new Error('Impossible de récupérer le chemin du fichier Telegram');

  return `https://api.telegram.org/file/bot${botToken}/${filePath}`;
}

// ── Tool handler exporté (appelé depuis tool-executor.ts) ────────────────────

export async function executeImageToImage(
  input: Record<string, unknown>,
  _sessionId?: string,
): Promise<string> {

  // Récupérer l'image source
  let sourceImageUrl = input['image_url'] as string | undefined;
  const telegramFileId = input['telegram_file_id'] as string | undefined;

  // Si Telegram file_id fourni → convertir en URL
  if (!sourceImageUrl && telegramFileId) {
    try {
      sourceImageUrl = await downloadTelegramImage(telegramFileId);
    } catch (err: any) {
      return `❌ Impossible de télécharger l'image Telegram: ${err.message}`;
    }
  }

  // Voiture de la flotte : si car_name fourni → on récupère la VRAIE photo Supabase
  // comme base → l'image générée garde la couleur/finition EXACTE de notre véhicule.
  const carName = input['car_name'] as string | undefined;
  if (!sourceImageUrl && carName) {
    try {
      const { data: cars } = await supabase
        .from('cars')
        .select('name, image_url')
        .ilike('name', `%${carName.trim()}%`)
        .not('image_url', 'is', null)
        .limit(1);
      const url = (cars as { image_url?: string }[] | null)?.[0]?.image_url;
      if (url) {
        sourceImageUrl = url;
        console.log(`[executeImageToImage] photo voiture flotte récupérée: ${carName} → ${url.slice(0, 80)}`);
      }
    } catch (e) {
      console.warn('[executeImageToImage] lookup voiture échoué:', e);
    }
  }

  // App mobile : la photo envoyée dans le chat est mise en cache Redis par l'orchestrateur
  // (session:image:<sessionId>). On la récupère, on l'upload en storage → URL publique.
  if (!sourceImageUrl && _sessionId) {
    try {
      const cached = await redis.get(`session:image:${_sessionId}`);
      if (cached) {
        const { base64, mime } = JSON.parse(cached) as { base64: string; mime?: string };
        const buf  = Buffer.from(base64, 'base64');
        const ext  = (mime ?? 'image/jpeg').includes('png') ? 'png' : 'jpg';
        const path = `edits/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        await supabase.storage.createBucket('generated-images', { public: true }).catch(() => {});
        await supabase.storage.from('generated-images').upload(path, buf, { contentType: mime ?? 'image/jpeg', upsert: false });
        sourceImageUrl = supabase.storage.from('generated-images').getPublicUrl(path).data?.publicUrl;
        console.log(`[executeImageToImage] image récupérée du cache session → ${sourceImageUrl?.slice(0, 80)}`);
      }
    } catch (e) {
      console.warn('[executeImageToImage] fallback image cache échoué:', e);
    }
  }

  if (!sourceImageUrl) {
    return '❌ image_url ou telegram_file_id requis — envoie une photo puis utilise cet outil.';
  }

  const userPrompt = (input['prompt'] as string | undefined) ?? '';
  if (!userPrompt) {
    return '❌ prompt requis — décris la transformation souhaitée (ex: "enfant dans une savane avec un lion, ambiance cinématique réaliste")';
  }

  const styleInput = input['style'] as string | undefined;
  let openaiEditError = '';

  // ── OpenAI gpt-image-1 EDIT — PRIMARY (le système de retouche le + puissant) ───
  // Édite la VRAIE photo en gardant le sujet et en l'intégrant à la scène (lumière,
  // ombres, réalisme). Pour un changement de décor on insiste pour garder le sujet identique.
  if (env.OPENAI_API_KEY) {
    try {
      const imgResp = await fetch(sourceImageUrl);
      const imgBuf  = Buffer.from(await imgResp.arrayBuffer());
      // Mime RÉEL de la photo (sinon OpenAI rejette un JPEG déclaré en PNG).
      const ct  = (imgResp.headers.get('content-type') || '').toLowerCase();
      const mt  = ct.includes('png') ? 'image/png' : ct.includes('webp') ? 'image/webp' : 'image/jpeg';
      const ext = mt === 'image/png' ? 'png' : mt === 'image/webp' ? 'webp' : 'jpg';
      const editPrompt = styleInput === 'background_only'
        ? `Keep the main subject (the car or person) EXACTLY identical — same model, exact same color, finish, license plate and every detail. Do NOT change the subject. Only replace the background/scene with: ${userPrompt}. Photorealistic, blend lighting, reflections and shadows naturally so it looks like a real photo.`
        : userPrompt;
      const form = new FormData();
      form.append('model', 'gpt-image-1');
      form.append('image', new Blob([imgBuf], { type: mt }), `source.${ext}`);
      form.append('prompt', editPrompt);
      form.append('size', '1024x1024');
      const ed = await fetch('https://api.openai.com/v1/images/edits', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
        body: form,
      });
      if (ed.ok) {
        const j = await ed.json() as { data?: { b64_json?: string }[] };
        const b64 = j?.data?.[0]?.b64_json;
        if (b64) {
          const buf  = Buffer.from(b64, 'base64');
          const path = `edits/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;
          await supabase.storage.createBucket('generated-images', { public: true }).catch(() => {});
          await supabase.storage.from('generated-images').upload(path, buf, { contentType: 'image/png', upsert: false });
          const url = supabase.storage.from('generated-images').getPublicUrl(path).data?.publicUrl;
          if (url) {
            emitProactive('Photo modifiée', 'info', `✅ Photo modifiée\n📹 ${url}`);
            return `✅ Photo modifiée (gpt-image-1) et envoyée dans l'app\nURL: ${url}`;
          }
        }
      } else {
        openaiEditError = (await ed.text()).slice(0, 300);
        console.warn(`[executeImageToImage] OpenAI edit status=${ed.status}:`, openaiEditError, '→ fallback');
      }
    } catch (e) {
      openaiEditError = e instanceof Error ? e.message : String(e);
      console.warn('[executeImageToImage] OpenAI edit échoué → fallback:', e);
    }
  }

  // ── FALLBACK : compositing sujet exact (si gpt-image-1 edit a échoué) ──────────
  // Détourage + recompose sur fond généré → sujet pixel-exact (rendu plus "collage").
  if (styleInput === 'background_only' && env.OPENAI_API_KEY && env.CLOUDINARY_CLOUD_NAME) {
    try {
      const bgRes = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'gpt-image-1', prompt: `${userPrompt}, empty scenic background plate, no car, no people, wide photorealistic shot`, n: 1, size: '1024x1024', quality: 'high' }),
      });
      if (bgRes.ok) {
        const bgB64 = (await bgRes.json() as { data?: { b64_json?: string }[] })?.data?.[0]?.b64_json;
        if (bgB64) {
          const { compositeOnBackground } = await import('./media-processing.js');
          const finalUrl = await compositeOnBackground(sourceImageUrl, `data:image/png;base64,${bgB64}`);
          if (finalUrl) {
            emitProactive('Image composée', 'info', `✅ Sujet exact sur nouveau fond\n📹 ${finalUrl}`);
            return `✅ Image créée — sujet EXACT sur le nouveau décor\nURL: ${finalUrl}`;
          }
        }
      }
    } catch (e) {
      console.warn('[executeImageToImage] composite fallback échoué:', e);
    }
  }

  const style    = (input['style']    as ImageToImageOptions['style']  | undefined);
  const strength = input['strength']  ? Number(input['strength'])        : undefined;
  const provider = (input['provider'] as ImageToImageOptions['provider'] | undefined) ?? 'auto';

  emitProactive(
    `🎨 Transformation image en cours…`,
    'info',
    `🎨 Transformation image IA\n"${userPrompt.slice(0, 80)}"\n${style ? `Style: ${style} | ` : ''}Provider: ${provider}\n⏳ 20-60 secondes...`,
  );

  console.log(`[executeImageToImage] sourceUrl=${sourceImageUrl.slice(0, 80)} prompt="${userPrompt.slice(0, 80)}" style=${style} provider=${provider}`);

  let result: ImageToImageResult;
  try {
    result = await transformImage({
      sourceImageUrl,
      prompt: userPrompt,
      strength,
      style,
      provider,
    });
  } catch (err: any) {
    const errMsg = err.message as string;
    console.error('[executeImageToImage] FAILED:', errMsg);
    return `❌ Transformation image échouée. ${openaiEditError ? `OpenAI: ${openaiEditError}` : errMsg.slice(0, 300)}`;
  }

  console.log(`[executeImageToImage] ✅ provider=${result.provider} mode=${result.mode} url=${result.url.slice(0, 80)}`);

  const notifText = [
    `🎨 Image transformée — ${result.provider}`,
    `Mode: ${result.mode}`,
    `Prompt: "${userPrompt.slice(0, 80)}"`,
    ``,
    `📎 ${result.url}`,
  ].join('\n');

  emitProactive(`🎨 Image transformée — ${result.provider}`, 'info', notifText);

  return [
    `✅ Image transformée par ${result.provider} (${result.mode})`,
    `🖼️ Notifié dans l'app ↑`,
    ``,
    `📊 Détails:`,
    `- Provider: ${result.provider}`,
    `- Mode: ${result.mode}`,
    `- Prompt: "${userPrompt.slice(0, 100)}"`,
    `- Style: ${style ?? 'aucun'}`,
    `- URL: ${result.url}`,
  ].join('\n');
}
