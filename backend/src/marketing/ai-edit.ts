/**
 * ai-edit.ts — « Modifier par l'IA » (page MONTAGE) : Kouider envoie SA photo ou SA vidéo + une phrase
 * (« remplace la voiture par une Ferrari Purosangue ») et Dzaryx la modifie en gardant tout le reste.
 *  • Photo  : FLUX.1 Kontext (Hugging Face, gratuit) → secours / qualité max : Nano Banana (fal.ai, ≈ 0,04 $).
 *  • Vidéo  : Kling O1 « video edit » (fal.ai) par tranches de ≤ 10 s, toutes guidées par la même image
 *             de référence (1re image modifiée) pour que la voiture reste identique → recollées + son d'origine.
 * Aussi : recollage des gros fichiers envoyés en morceaux (> 45 Mo, limite Supabase 50 Mo) + compression.
 */

import axios from 'axios';
import * as fs from 'fs/promises';
import { createWriteStream } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { randomUUID } from 'crypto';

import { env } from '../config/env.js';
import { supabase } from '../integrations/supabase.js';
import { askJson } from '../integrations/pro-doc.js';
import { queueTelegramMessage } from '../notifications/tg-outbox.js';
import { emitProactive } from '../notifications/mobile-push.js';
import { falRun, hfGradio, hfFail, addSpent, falEmptyNow, markFalEmpty, run, probe, saveJob, launchJob, type StudioJob } from './video-studio.js';

const HF_QWEN_VIDEO = 'https://hugging-apps-qwen-video-edit.hf.space/gradio_api';
const FREE_CHUNK = 2.8;   // le Space gratuit rend ≈ 45 images (2,8 s à 16 i/s) par appel
const isCredit = (m: string) => /crédit|balance|exhausted|locked|402|403/i.test(m);
const HF_KONTEXT = 'https://black-forest-labs-flux-1-kontext-dev.hf.space/gradio_api';
const FAL_IMG_EDIT = 'fal-ai/nano-banana/edit';
const FAL_VID_EDIT = 'fal-ai/kling-video/o1/video-to-video/edit';
const IMG_COST = 0.04;
export const VIDEO_EDIT_PER_SEC = 0.168;
export const VIDEO_EDIT_MAX_SEC = 30;

export interface AiEditRequest { url: string; type: 'image' | 'video'; prompt: string; quality?: 'gratuit' | 'max'; seconds?: number }

export function estimateAiEdit(type: 'image' | 'video', seconds = 10, quality: 'gratuit' | 'max' = 'gratuit', falEmpty = false): number {
  if (falEmpty) return 0;
  if (type === 'image') return quality === 'max' ? IMG_COST : 0;
  return Math.round(Math.min(VIDEO_EDIT_MAX_SEC, Math.max(3, seconds)) * VIDEO_EDIT_PER_SEC * 100) / 100;
}

async function download(url: string, file: string): Promise<void> {
  const r = await axios.get(url, { responseType: 'stream', timeout: 300_000 });
  await new Promise<void>((res, rej) => { const w = createWriteStream(file); r.data.pipe(w); w.on('finish', () => res()); w.on('error', rej); r.data.on('error', rej); });
}

async function putPublic(key: string, file: string, contentType: string): Promise<string> {
  const { error } = await supabase.storage.from('videos').upload(key, await fs.readFile(file), { contentType, upsert: true, cacheControl: '3600' });
  if (error) throw new Error(`stockage : ${error.message}`);
  return supabase.storage.from('videos').getPublicUrl(key).data.publicUrl;
}

/** Les modèles d'édition comprennent mieux l'anglais : on traduit la demande de Kouider (sinon on garde son texte). */
async function toEnglish(prompt: string): Promise<string> {
  try {
    const r = await askJson<{ prompt_en: string }>(
      'Tu traduis une demande de retouche photo/vidéo en une instruction anglaise courte et précise pour un modèle d\'édition d\'image (style « Replace the car with a black Ferrari Purosangue, keep everything else identical »). Garde les marques et modèles exacts (corrige l\'orthographe : « purosongo » = Purosangue). Ajoute toujours qu\'il faut garder le reste identique (personnes, mains, décor, lumière, cadrage). Réponds en JSON {"prompt_en": "..."}.',
      prompt, 400, { type: 'object', properties: { prompt_en: { type: 'string' } }, required: ['prompt_en'], additionalProperties: false });
    return r.prompt_en?.trim() || prompt;
  } catch { return prompt; }
}

/** Retouche d'une photo → URL d'une image (Hugging Face ou fal). */
async function editImageUrl(imageUrl: string, promptEn: string, quality: 'gratuit' | 'max'): Promise<{ url: string; cost: number; engine: string }> {
  if (quality === 'gratuit' || !env.FAL_KEY) {
    try {
      const out = await hfGradio(HF_KONTEXT, 'infer', [{ path: imageUrl, meta: { _type: 'gradio.FileData' } }, promptEn, 0, true, 2.5, 28], 300_000);
      const u = (out[0] as { url?: string } | undefined)?.url;
      if (u) return { url: u, cost: 0, engine: 'FLUX Kontext (gratuit)' };
    } catch (e) { await hfFail(e); if (!env.FAL_KEY) throw e; }
  }
  try {
    if (await falEmptyNow()) throw new Error('crédit fal.ai épuisé');
    const r = await falRun(FAL_IMG_EDIT, { prompt: promptEn, image_urls: [imageUrl], num_images: 1, output_format: 'jpeg' }, 300_000);
    const u = (r['images'] as Array<{ url: string }> | undefined)?.[0]?.url;
    if (!u) throw new Error('fal.ai : pas d\'image en retour');
    return { url: u, cost: IMG_COST, engine: 'Nano Banana (fal.ai)' };
  } catch (e) {
    // Plus de crédit (ou fal en panne) → version gratuite, toute seule
    if (isCredit(String(e))) await markFalEmpty();
    if (quality === 'gratuit') throw e;
    return editImageUrl(imageUrl, promptEn, 'gratuit');
  }
}

export async function startAiEdit(req: AiEditRequest, actor = 'kouider'): Promise<StudioJob> {
  if (!/^https?:\/\//.test(req.url ?? '')) throw new Error('Envoie d\'abord ta photo ou ta vidéo.');
  if (!req.prompt?.trim()) throw new Error('Dis ce qu\'il faut changer (ex. « remplace la voiture par une Ferrari Purosangue »).');
  const quality = req.quality === 'max' ? 'max' : 'gratuit';
  const noCredit = await falEmptyNow();
  const now = new Date().toISOString();
  const job: StudioJob = {
    id: randomUUID().slice(0, 8), planId: 'ai-edit', title: `🪄 ${req.prompt.trim().slice(0, 70)}`,
    model: !noCredit && (req.type === 'video' || quality === 'max') ? 'kling3' : 'gratuit', status: 'queued', step: 'En file…', progress: 2,
    estimateUsd: estimateAiEdit(req.type, req.seconds, quality, noCredit), costUsd: 0, shotsDone: 0, shotsTotal: 1, createdAt: now, updatedAt: now, actor,
  };
  await launchJob(job, () => renderAiEdit(job, { ...req, quality }));
  return job;
}

async function renderAiEdit(job: StudioJob, req: AiEditRequest): Promise<void> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), `aiedit-${job.id}-`));
  const step = async (status: StudioJob['status'], text: string, progress: number) => { Object.assign(job, { status, step: text, progress }); await saveJob(job); };
  try {
    await step('shots', 'Dzaryx comprend ta demande…', 5);
    const promptEn = await toEnglish(req.prompt);
    let url: string, kind: string, engine = '';

    if (req.type === 'image') {
      await step('shots', 'Retouche de la photo (≈ 30 s à 1 min)…', 20);
      const r = await editImageUrl(req.url, promptEn, req.quality ?? 'gratuit');
      job.costUsd += r.cost; engine = r.engine;
      const raw = path.join(dir, 'out.img'), jpg = path.join(dir, 'out.jpg');
      await download(r.url, raw);
      await run(['-i', raw, '-q:v', '2', jpg]);
      await step('montage', 'Enregistrement…', 90);
      url = await putPublic(`studio/${job.id}.jpg`, jpg, 'image/jpeg');
      kind = 'photo';
    } else {
      await step('shots', 'Préparation de ta vidéo…', 5);
      const src = path.join(dir, 'src');
      await download(req.url, src);
      const info = await probe(src);
      const total = Math.min(VIDEO_EDIT_MAX_SEC, info.duration || 0);
      if (total < 3) throw new Error('vidéo trop courte (minimum 3 s)');
      const n = Math.ceil(total / 10), seg = total / n;
      job.shotsTotal = n; job.estimateUsd = estimateAiEdit('video', total);

      // Image de référence : 1re image de la vidéo, retouchée → même voiture dans toutes les tranches
      await step('shots', 'Création de l\'image de référence…', 10);
      let ref: string | null = null;
      try {
        const f0 = path.join(dir, 'f0.jpg');
        await run(['-ss', '0.4', '-i', src, '-frames:v', '1', '-q:v', '2', f0]);
        const f0url = await putPublic(`rushes/aiedit/${job.id}-f0.jpg`, f0, 'image/jpeg');
        const r = await editImageUrl(f0url, promptEn, 'gratuit');
        const refRaw = path.join(dir, 'ref.img'), refJpg = path.join(dir, 'ref.jpg');
        await download(r.url, refRaw);
        await run(['-i', refRaw, '-q:v', '2', refJpg]);
        ref = await putPublic(`rushes/aiedit/${job.id}-ref.jpg`, refJpg, 'image/jpeg');
        job.costUsd += r.cost;
      } catch (e) { console.warn('[ai-edit] référence', e instanceof Error ? e.message : e); }

      // Tranches ≤ 10 s, petit côté 1080 px (Kling : 3–10 s, 720–2160 px)
      const klingChunks = async (): Promise<string[]> => {
      const parts: string[] = [];
      for (let i = 0; i < n; i++) {
        const p = path.join(dir, `in${i}.mp4`);
        await run(['-ss', (i * seg).toFixed(3), '-t', seg.toFixed(3), '-i', src, '-an',
          '-vf', "scale='if(gt(iw,ih),-2,1080)':'if(gt(iw,ih),1080,-2)',fps=30,format=yuv420p", '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '19', p]);
        parts.push(await putPublic(`rushes/aiedit/${job.id}-in${i}.mp4`, p, 'video/mp4'));
      }
      await step('shots', `Kling modifie ta vidéo (${n} partie${n > 1 ? 's' : ''}, ≈ 3 à 8 min)…`, 20);
      const prompt = ref ? `${promptEn} The edited subject must look exactly like in @Image1. Keep the same camera motion, people, hands and timing.` : promptEn;
      const outs = await Promise.all(parts.map(async (video_url, i) => {
        const r = await falRun(FAL_VID_EDIT, { prompt, video_url, keep_audio: false, ...(ref ? { image_urls: [ref] } : {}) }, 1_200_000);
        const u = (r['video'] as { url?: string } | undefined)?.url;
        if (!u) throw new Error(`Kling : pas de vidéo pour la partie ${i + 1}`);
        const f = path.join(dir, `out${i}.mp4`);
        await download(u, f);
        job.shotsDone++; job.costUsd += seg * VIDEO_EDIT_PER_SEC; job.progress = 20 + Math.round(65 * job.shotsDone / n); await saveJob(job);
        return f;
      }));
      return outs;
      };

      // Version gratuite : Space Hugging Face « Qwen video edit », tranches de 2,8 s, même graine partout
      const freeChunks = async (): Promise<string[]> => {
        const m = Math.ceil(total / FREE_CHUNK), len = total / m;
        job.shotsTotal = m; job.shotsDone = 0;
        await step('shots', `Retouche GRATUITE (${m} morceaux, ≈ 2 min chacun)…`, 20);
        const res: string[] = new Array(m);
        const one = async (i: number) => {
          const p = path.join(dir, `fin${i}.mp4`);
          await run(['-ss', (i * len).toFixed(3), '-t', len.toFixed(3), '-i', src, '-an',
            '-vf', "scale='if(gt(iw,ih),-2,720)':'if(gt(iw,ih),720,-2)',format=yuv420p", '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', p]);
          const u = await putPublic(`rushes/aiedit/${job.id}-fin${i}.mp4`, p, 'video/mp4');
          let out: unknown[] | null = null;
          for (let a = 0; a < 2 && !out; a++) {
            try { out = await hfGradio(HF_QWEN_VIDEO, 'edit_video', [{ path: u, meta: { _type: 'gradio.FileData' } }, promptEn, 16, 1.0, ' ', 42, false, 245760], 600_000); }
            catch (e) {
              await hfFail(e);
              if (a === 1 || /quota|exceeded|ZeroGPU|GPU task/i.test(String(e))) throw new Error(`quota gratuit Hugging Face du jour épuisé (${i}/${m} morceaux faits) — réessaie demain ou recharge fal.ai pour Kling`);
            }
          }
          const ou = (out?.[0] as { url?: string } | undefined)?.url;
          if (!ou) throw new Error(`morceau ${i + 1} : pas de vidéo en retour`);
          const f = path.join(dir, `fout${i}.mp4`);
          await download(ou, f);
          // retour à la durée d'origine du morceau (le Space rend à 16 i/s)
          const d = (await probe(f)).duration || len;
          const f2 = path.join(dir, `fout${i}b.mp4`);
          await run(['-i', f, '-vf', `setpts=${(len / d).toFixed(4)}*PTS,fps=30`, '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', f2]);
          res[i] = f2;
          job.shotsDone++; job.progress = 20 + Math.round(65 * job.shotsDone / m); await saveJob(job);
        };
        for (let i = 0; i < m; i += 2) await Promise.all([one(i), ...(i + 1 < m ? [one(i + 1)] : [])]);
        return res;
      };
      let outs: string[] | null = null;
      if (!(await falEmptyNow())) {
        try { outs = await klingChunks(); engine = 'Kling O1 (fal.ai)'; }
        catch (e) {
          if (!isCredit(String(e))) throw e;
          await markFalEmpty();   // plus de crédit → on continue gratuitement, tout seul
        }
      }
      if (!outs) {
        job.model = 'gratuit'; job.estimateUsd = 0;
        outs = await freeChunks();
        engine = 'Qwen vidéo (Hugging Face, gratuit — qualité plus basse)';
      }
      await step('montage', 'Recollage + son d\'origine…', 88);
      const out = path.join(dir, 'final.mp4');
      const inputs = outs.flatMap(f => ['-i', f]);
      // Format de sortie = celui de la vidéo d'origine (portrait 1080×1920 ou paysage 1920×1080)
      const dims = /, (\d{3,4})x(\d{3,4})/.exec(await run(['-i', outs[0]!, '-f', 'null', '-t', '0.01', '-']).catch(e => String(e)));
      const [W, H] = dims && Number(dims[1]) > Number(dims[2]) ? [1920, 1080] : [1080, 1920];
      const filt = outs.map((_, i) => `[${i}:v]scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p[v${i}]`).join(';') +
        `;${outs.map((_, i) => `[v${i}]`).join('')}concat=n=${outs.length}:v=1:a=0[v]`;
      const audio = info.audio ? ['-ss', '0', '-t', total.toFixed(3), '-i', src] : [];
      await run([...inputs, ...audio, '-filter_complex', filt, '-map', '[v]', ...(info.audio ? ['-map', `${outs.length}:a`, '-c:a', 'aac', '-b:a', '160k'] : []),
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-movflags', '+faststart', '-shortest', out]);
      url = await putPublic(`studio/${job.id}.mp4`, out, 'video/mp4');
      kind = 'vidéo';
    }

    job.costUsd = Math.round(job.costUsd * 100) / 100;
    if (job.costUsd) await addSpent(job.costUsd);
    Object.assign(job, { status: 'done', step: 'Terminé ✅', progress: 100, url, caption: '' });
    await saveJob(job);
    const msg = `🪄 Ta ${kind} modifiée est prête — « ${req.prompt.trim().slice(0, 120)} » (${engine}, ${job.costUsd ? `≈ ${job.costUsd.toFixed(2)} $` : '0 €'})`;
    await queueTelegramMessage(msg, undefined, job.actor, { url, name: `dzaryx-${job.id}.${kind === 'photo' ? 'jpg' : 'mp4'}` }).catch(() => {});
    emitProactive(`🪄 ${kind === 'photo' ? 'Photo' : 'Vidéo'} modifiée prête (page MONTAGE)`, 'info', msg, 'kouider');
  } catch (e) {
    let m = e instanceof Error ? e.message : String(e);
    if (/crédit|balance|exhausted|locked|403/i.test(m)) m = `crédit fal.ai épuisé — recharge sur https://fal.ai/dashboard/billing (${m.slice(0, 150)})`;
    console.error(`[ai-edit] job ${job.id}:`, m);
    job.costUsd = Math.round(job.costUsd * 100) / 100;
    if (job.costUsd) await addSpent(job.costUsd);
    Object.assign(job, { status: 'error', step: 'Échec', error: m.slice(0, 400) });
    await saveJob(job);
    emitProactive(`❌ Retouche IA : ${m.slice(0, 160)}`, 'alert', undefined, 'kouider');
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    void supabase.storage.from('videos').list('rushes/aiedit', { search: job.id }).then(({ data }) => {
      const keys = (data ?? []).map(f => `rushes/aiedit/${f.name}`);
      if (keys.length) void supabase.storage.from('videos').remove(keys);
    }).catch(() => {});
  }
}

/**
 * Gros fichier du téléphone (> 45 Mo) : l'app l'envoie en morceaux de 40 Mo → on les recolle ici,
 * on compresse (vidéo 1080p) pour passer sous la limite de 50 Mo, et on renvoie le lien final.
 */
export async function joinUploadParts(urls: string[], fileName: string): Promise<{ publicUrl: string; type: 'video' | 'image' | 'audio' }> {
  const ok = urls.filter(u => /\/storage\/v1\/object\/public\/videos\/rushes\//.test(u));
  if (!ok.length || ok.length !== urls.length || ok.length > 40) throw new Error('morceaux invalides');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'join-'));
  try {
    const whole = path.join(dir, 'whole');
    const fh = await fs.open(whole, 'w');
    try {
      for (const u of ok) { const r = await axios.get<ArrayBuffer>(u, { responseType: 'arraybuffer', timeout: 300_000 }); await fh.write(Buffer.from(r.data)); }
    } finally { await fh.close(); }
    const ext = path.extname(fileName).toLowerCase().replace('.', '');
    const type = /^(mp3|m4a|wav|aac|ogg)$/.test(ext) ? 'audio' : /^(jpe?g|png|webp|heic)$/.test(ext) ? 'image' : 'video';
    const key = `rushes/${new Date().toISOString().slice(0, 10)}/${randomUUID()}`;
    let publicUrl: string;
    if (type === 'video') {
      const out = path.join(dir, 'out.mp4');
      for (const crf of [23, 28, 32]) {
        await run(['-i', whole, '-vf', "scale='if(gt(iw,ih),-2,min(1080,iw))':'if(gt(iw,ih),min(1080,ih),-2)',format=yuv420p",
          '-c:v', 'libx264', '-preset', 'veryfast', '-crf', String(crf), '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', out], 900_000);
        if ((await fs.stat(out)).size < 48 * 1024 * 1024) break;
      }
      publicUrl = await putPublic(`${key}.mp4`, out, 'video/mp4');
    } else if (type === 'audio') {
      const out = path.join(dir, 'out.m4a');
      await run(['-i', whole, '-vn', '-c:a', 'aac', '-b:a', '160k', out]);
      publicUrl = await putPublic(`${key}.m4a`, out, 'audio/mp4');
    } else {
      const out = path.join(dir, 'out.jpg');
      await run(['-i', whole, '-vf', "scale='min(3000,iw)':-2", '-q:v', '3', out]);
      publicUrl = await putPublic(`${key}.jpg`, out, 'image/jpeg');
    }
    void supabase.storage.from('videos').remove(ok.map(u => decodeURIComponent(u.split('/object/public/videos/')[1]!.split('?')[0]!)));
    return { publicUrl, type };
  } finally { await fs.rm(dir, { recursive: true, force: true }).catch(() => {}); }
}
