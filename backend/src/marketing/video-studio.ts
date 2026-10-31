/**
 * video-studio.ts — STUDIO VIDÉO (niveau Higgsfield, sans Higgsfield)
 * ─────────────────────────────────────────────────────────────────────────────
 * Idée → plan viral (Claude) → plans IA réalistes (fal.ai : Kling 3.0, Veo 3.1, Seedance 2.0)
 * → montage ffmpeg 9:16 : transitions, voix off ElevenLabs, sous-titres mot par mot,
 *   musique IA, accroche + appel à l'action, logo → Supabase « videos » + Telegram + app.
 * Les rendus tournent en tâche de fond ; l'état de chaque rendu vit dans app_kv.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import axios from 'axios';
import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { randomUUID } from 'crypto';
// @ts-ignore — ffmpeg-static has no bundled type declarations
import ffmpegStatic from 'ffmpeg-static';

import { env } from '../config/env.js';
import { supabase } from '../integrations/supabase.js';
import { kvGet, kvSet } from '../integrations/app-store.js';
import { askJson } from '../integrations/pro-doc.js';
import { synthesizeVoice, synthesizeVoiceGemini, synthesizeVoiceFree } from '../notifications/dispatcher.js';
import { queueTelegramMessage } from '../notifications/tg-outbox.js';
import { emitProactive } from '../notifications/mobile-push.js';

// ─── Catalogue ────────────────────────────────────────────────

export type ModelId = 'gratuit' | 'kling3' | 'veo31fast' | 'veo31' | 'seedance2';

interface ModelDef {
  label: string; t2v: string; i2v: string;
  perSec: number; perSecAudio: number;          // $ / seconde (fal.ai, 720p)
  durations: number[]; note: string;
}

export const STUDIO_MODELS: Record<ModelId, ModelDef> = {
  gratuit:   { label: 'Gratuit (images IA animées)', t2v: '', i2v: '', perSec: 0, perSecAudio: 0, durations: [3, 4, 5, 6, 7, 8],
               note: '0 €. Une image IA par plan, animée au montage (zoom, travelling). Plus lent (≈ 1 min par plan), pas de vrai mouvement.' },
  kling3:    { label: 'Kling 3.0 Pro', t2v: 'fal-ai/kling-video/v3/pro/text-to-video', i2v: 'fal-ai/kling-video/v3/pro/image-to-video',
               perSec: 0.112, perSecAudio: 0.168, durations: [3, 4, 5, 6, 7, 8, 9, 10], note: 'Le meilleur rapport qualité/prix. Mouvements très réalistes.' },
  veo31fast: { label: 'Veo 3.1 Fast', t2v: 'fal-ai/veo3.1/fast', i2v: 'fal-ai/veo3.1/fast/image-to-video',
               perSec: 0.10, perSecAudio: 0.15, durations: [4, 6, 8], note: 'Google, rapide et pas cher. Très bon son natif.' },
  veo31:     { label: 'Veo 3.1', t2v: 'fal-ai/veo3.1', i2v: 'fal-ai/veo3.1/image-to-video',
               perSec: 0.20, perSecAudio: 0.40, durations: [4, 6, 8], note: 'Le plus réaliste (cinéma). Le plus cher.' },
  seedance2: { label: 'Seedance 2.0', t2v: 'bytedance/seedance-2.0/text-to-video', i2v: 'bytedance/seedance-2.0/image-to-video',
               perSec: 0.30, perSecAudio: 0.30, durations: [4, 5, 6, 7, 8, 9, 10], note: 'ByteDance (TikTok). Son toujours inclus, plans dynamiques.' },
};

export const STUDIO_CAMERAS: Record<string, { label: string; prompt: string }> = {
  auto:       { label: 'Auto', prompt: '' },
  drone:      { label: 'Drone', prompt: 'aerial drone shot, smooth cinematic flyover' },
  fpv:        { label: 'Drone FPV', prompt: 'FPV drone shot, fast dive and weave, high energy' },
  travelling: { label: 'Travelling', prompt: 'tracking shot following the subject, steady gimbal' },
  orbit:      { label: 'Rotation 360°', prompt: '360-degree orbit camera around the subject' },
  dolly_in:   { label: 'Approche lente', prompt: 'slow dolly-in push toward the subject' },
  crash_zoom: { label: 'Zoom rapide', prompt: 'fast crash zoom in on the subject' },
  low_angle:  { label: 'Contre-plongée', prompt: 'low-angle hero shot, dramatic perspective' },
  slowmo:     { label: 'Ralenti', prompt: 'slow motion, 120fps look, every detail visible' },
  handheld:   { label: 'Caméra à l\'épaule', prompt: 'handheld camera, natural shake, documentary feel' },
};

export const STUDIO_TEMPLATES: Record<string, { label: string; brand: string; brief: string }> = {
  autolux:    { label: 'Pub location Autolux', brand: 'AUTOLUX · ORAN',
                brief: 'Publicité virale pour Autolux, location de voitures à Oran (Algérie) : liberté, corniche, soleil, prix clairs, réservation facile sur WhatsApp. Public : diaspora et Algériens.' },
  voiture:    { label: 'Voiture vedette', brand: 'AUTOLUX · ORAN',
                brief: 'Présentation cinéma d\'une voiture précise de la flotte Autolux à Oran, comme une pub constructeur : détails, route, lumière dorée.' },
  fik_sites:  { label: 'Pub FIK Sites', brand: 'FIK SITES',
                brief: 'Publicité pour FIK Sites : on crée le site internet des petits commerces (France et Algérie) en quelques jours, sans prise de tête. Montrer un commerçant débordé puis serein avec son site qui ramène des clients.' },
  temoignage: { label: 'Témoignage client', brand: 'AUTOLUX · ORAN',
                brief: 'Faux-vrai témoignage style UGC : un client raconte face caméra son expérience. Ton naturel, crédible, pas de promesse exagérée.' },
  avant_apres:{ label: 'Avant / Après', brand: '',
                brief: 'Format avant/après très viral : situation galère au début, transformation spectaculaire à la fin.' },
  libre:      { label: 'Idée libre', brand: '', brief: '' },
};

export const STUDIO_LANGS: Record<string, string> = {
  fr: 'français', darija: 'darija algérienne écrite en lettres latines (arabizi simple, compréhensible)', ar: 'arabe', en: 'anglais',
};

const MUSIC_MODEL = 'CassetteAI/music-generator';
const MUSIC_COST = 0.02;
/** Règle 31/10 : Dzaryx 100 % gratuit — les modèles payants seulement si Kouider les demande lui-même. */
export const FREE_MODEL: ModelId = 'gratuit';
const isFree = (m: ModelId) => m === 'gratuit';

// ─── Types ────────────────────────────────────────────────────

export interface StudioShot { prompt: string; camera: string; duration: number; use_image?: boolean }
export interface StudioPlan {
  id: string; title: string; hook: string; voiceover: string; cta: string; music_prompt: string;
  post_caption: string; brand: string; lang: string; template: string; image_url?: string | null;
  shots: StudioShot[]; createdAt: string;
}
export interface RenderOptions { model: ModelId; nativeAudio: boolean; voice: boolean; music: boolean; subtitles: boolean; outro?: boolean }
export interface StudioJob {
  id: string; planId: string; title: string; model: ModelId; status: 'queued' | 'shots' | 'audio' | 'montage' | 'done' | 'error';
  step: string; progress: number; estimateUsd: number; costUsd: number; url?: string; caption?: string; error?: string;
  shotsDone: number; shotsTotal: number; createdAt: string; updatedAt: string; actor: string;
  /** Vidéo automatique de la semaine : à valider par Kouider (« Oke ») avant publication. */
  approval?: { car_name: string; car_id: string; label: string };
}

const PLAN_KEY = (id: string) => `studio:plan:${id}`;
const JOB_KEY = (id: string) => `studio:job:${id}`;
const JOBS_INDEX = 'studio:jobs';
const SPENT_KEY = 'studio:spent_usd';
const KEEP = 30 * 24 * 3600;

// ─── Coût ─────────────────────────────────────────────────────

function snapDuration(model: ModelId, d: number): number {
  const allowed = STUDIO_MODELS[model].durations;
  return allowed.reduce((best, v) => (Math.abs(v - d) < Math.abs(best - d) ? v : best), allowed[0]!);
}

export function estimateCost(shots: StudioShot[], o: Pick<RenderOptions, 'model' | 'nativeAudio' | 'music'>): number {
  const m = STUDIO_MODELS[o.model];
  const rate = o.nativeAudio ? m.perSecAudio : m.perSec;
  const video = shots.reduce((s, sh) => s + snapDuration(o.model, sh.duration) * rate, 0);
  return Math.round((video + (o.music && !isFree(o.model) ? MUSIC_COST : 0)) * 100) / 100;
}

// ─── Plan viral (Claude) ──────────────────────────────────────

export async function createStudioPlan(input: {
  idea: string; template?: string; lang?: string; seconds?: number; imageUrl?: string | null; carName?: string | null;
}): Promise<StudioPlan> {
  const tpl = STUDIO_TEMPLATES[input.template ?? 'libre'] ?? STUDIO_TEMPLATES['libre']!;
  const lang = STUDIO_LANGS[input.lang ?? 'fr'] ? (input.lang ?? 'fr') : 'fr';
  const seconds = Math.min(45, Math.max(8, input.seconds ?? 20));
  const cameras = Object.keys(STUDIO_CAMERAS).join(', ');
  const system = `Tu es un réalisateur de pubs virales TikTok/Reels (style Higgsfield) et un expert en prompts pour modèles vidéo IA (Kling 3, Veo 3.1, Seedance 2).
Tu réponds UNIQUEMENT avec un JSON valide, sans texte autour.`;
  const user = `Brief : ${tpl.brief || '(aucun, suis l\'idée)'}
Idée de Kouider : ${input.idea}
${input.carName ? `Voiture : ${input.carName} (une vraie photo de cette voiture sera utilisée comme image de départ des plans où use_image=true).` : ''}
${input.imageUrl && !input.carName ? 'Une photo de départ est fournie : mets use_image=true sur les plans qui doivent montrer ce sujet précis.' : ''}
Durée totale visée : ${seconds} secondes, format vertical 9:16.

Rends ce JSON :
{
 "title": "titre court",
 "hook": "accroche écran des 2 premières secondes, 3 à 6 mots, choc ou curiosité",
 "voiceover": "texte de la voix off en ${STUDIO_LANGS[lang]}, environ ${Math.round(seconds * 2.4)} mots, phrases courtes, rythme TikTok, termine par l'appel à l'action",
 "cta": "appel à l'action écran final, 2 à 5 mots",
 "music_prompt": "description en anglais de la musique de fond (genre, tempo, ambiance), sans voix",
 "post_caption": "légende du post en ${STUDIO_LANGS[lang]} avec 5 hashtags",
 "shots": [ { "prompt": "...", "camera": "une valeur parmi : ${cameras}", "duration": 5, "use_image": false } ]
}
Règles des plans (3 à 6 plans, somme des durées ≈ ${seconds} s, chaque durée entre 3 et 8) :
- "prompt" en ANGLAIS, très visuel et précis : sujet, action, décor, lumière, objectif, style "ultra realistic, cinematic, shot on ARRI, 35mm, natural skin, vertical 9:16".
- Un seul mouvement clair par plan. Pas de texte ni de logo dans l'image (les textes sont ajoutés au montage).
- Décors cohérents avec Oran / l'Algérie quand c'est le sujet (corniche, Santa Cruz, front de mer, ruelles blanches, soleil méditerranéen).
- Personnes : apparence maghrébine/méditerranéenne réaliste, vêtements modernes.
- Le plan 1 doit accrocher immédiatement (mouvement fort ou image surprenante).
- RÉALISME AVANT TOUT (on ne doit pas voir que c'est de l'IA) : écris chaque prompt comme une vraie photo/vidéo prise sur le vif (« candid », « shot on iPhone / Sony A7 », lumière naturelle, imperfections réelles). Évite les visages en gros plan, les mains et le texte (ce qui trahit l'IA) : préfère voitures, routes, paysages, détails, personnes de dos ou de loin.
- Ne mets PAS de logo de fin : la signature vidéo FIK (clé dorée) est ajoutée automatiquement après le dernier plan.`;

  const raw = await askJson<Partial<StudioPlan> & { shots?: Partial<StudioShot>[] }>(system, user, 2500);
  const shots = (raw.shots ?? []).slice(0, 6).map(s => ({
    prompt: String(s.prompt ?? '').slice(0, 1500),
    camera: STUDIO_CAMERAS[String(s.camera)] ? String(s.camera) : 'auto',
    duration: Math.min(8, Math.max(3, Math.round(Number(s.duration) || 5))),
    use_image: !!(input.imageUrl && s.use_image),
  })).filter(s => s.prompt);
  if (!shots.length) throw new Error('Plan vide — reformule l\'idée.');

  const plan: StudioPlan = {
    id: randomUUID().slice(0, 8), title: String(raw.title ?? 'Vidéo studio').slice(0, 80),
    hook: String(raw.hook ?? '').slice(0, 80), voiceover: String(raw.voiceover ?? '').slice(0, 1200), cta: String(raw.cta ?? '').slice(0, 60),
    music_prompt: String(raw.music_prompt ?? 'upbeat modern trap beat, energetic, no vocals').slice(0, 300),
    post_caption: String(raw.post_caption ?? '').slice(0, 600), brand: tpl.brand, lang, template: input.template ?? 'libre',
    image_url: input.imageUrl ?? null, shots, createdAt: new Date().toISOString(),
  };
  await kvSet(PLAN_KEY(plan.id), JSON.stringify(plan), KEEP);
  return plan;
}

export async function getStudioPlan(id: string): Promise<StudioPlan | null> {
  try { return JSON.parse((await kvGet(PLAN_KEY(id))) ?? 'null') as StudioPlan | null; } catch { return null; }
}

/** Plan manuel (1 plan façon Higgsfield) : prompt en français → prompt cinéma en anglais. */
export async function manualPlan(input: { prompt: string; camera?: string; duration?: number; imageUrl?: string | null }): Promise<StudioPlan> {
  const camera = STUDIO_CAMERAS[input.camera ?? 'auto'] ? (input.camera ?? 'auto') : 'auto';
  let prompt = input.prompt.trim();
  try {
    const r = await askJson<{ prompt: string }>(
      'Tu écris des prompts pour modèles vidéo IA (Kling 3, Veo 3.1). Réponds UNIQUEMENT en JSON.',
      `Réécris cette demande en un prompt vidéo en ANGLAIS, très visuel et précis (sujet, action, décor, lumière, objectif), style "ultra realistic, cinematic, vertical 9:16", sans texte à l'écran. Garde exactement le sens.
${input.imageUrl ? 'Une photo de départ est fournie : décris le mouvement à partir de cette image.' : ''}
Demande : ${prompt}
JSON : {"prompt": "..."}`, 800);
    if (r.prompt) prompt = r.prompt;
  } catch { /* garde le texte brut */ }
  const plan: StudioPlan = {
    id: randomUUID().slice(0, 8), title: input.prompt.slice(0, 60), hook: '', voiceover: '', cta: '', music_prompt: '', post_caption: '',
    brand: '', lang: 'fr', template: 'manuel', image_url: input.imageUrl ?? null,
    shots: [{ prompt, camera, duration: Math.min(10, Math.max(3, input.duration ?? 5)), use_image: !!input.imageUrl }],
    createdAt: new Date().toISOString(),
  };
  await kvSet(PLAN_KEY(plan.id), JSON.stringify(plan), KEEP);
  return plan;
}

// ─── fal.ai ───────────────────────────────────────────────────

async function falRun(modelId: string, input: Record<string, unknown>, maxMs = 600_000): Promise<Record<string, unknown>> {
  const key = env.FAL_KEY;
  if (!key) throw new Error('FAL_KEY absente dans Railway');
  const headers = { Authorization: `Key ${key}`, 'Content-Type': 'application/json' };
  let sub;
  try {
    sub = await axios.post(`https://queue.fal.run/${modelId}`, input, { headers, timeout: 30_000 });
  } catch (err: any) {
    const body = JSON.stringify(err.response?.data ?? err.message).slice(0, 300);
    if (err.response?.status === 403 || /balance|credit|exhausted|locked/i.test(body)) throw new Error(`crédit fal.ai épuisé ou compte bloqué — recharge sur https://fal.ai/dashboard/billing (${body})`);
    throw new Error(`fal.ai ${modelId} : HTTP ${err.response?.status ?? '?'} ${body}`);
  }
  const q = sub.data as { request_id: string; status_url?: string; response_url?: string };
  const statusUrl = q.status_url ?? `https://queue.fal.run/${modelId}/requests/${q.request_id}/status`;
  const resultUrl = q.response_url ?? `https://queue.fal.run/${modelId}/requests/${q.request_id}`;
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    await new Promise(r => setTimeout(r, 6000));
    const st = await axios.get(statusUrl, { headers, timeout: 15_000, validateStatus: () => true });
    if (st.status === 401 || st.status === 403) throw new Error(`fal.ai : accès refusé (${st.status})`);
    const s = String((st.data as any)?.status ?? '');
    if (s === 'COMPLETED') {
      const res = await axios.get(resultUrl, { headers, timeout: 30_000, validateStatus: () => true });
      if (res.status >= 400) throw new Error(`fal.ai ${modelId} : ${JSON.stringify(res.data).slice(0, 300)}`);
      return res.data as Record<string, unknown>;
    }
    if (s === 'FAILED' || s === 'ERROR') throw new Error(`fal.ai ${modelId} : échec`);
  }
  throw new Error(`fal.ai ${modelId} : trop long (${Math.round(maxMs / 60000)} min)`);
}

function shotInput(model: ModelId, shot: StudioShot, imageUrl: string | null, nativeAudio: boolean): { endpoint: string; input: Record<string, unknown> } {
  const m = STUDIO_MODELS[model];
  const cam = STUDIO_CAMERAS[shot.camera]?.prompt;
  const prompt = cam ? `${shot.prompt}. Camera: ${cam}.` : shot.prompt;
  const d = snapDuration(model, shot.duration);
  const img = shot.use_image && imageUrl ? imageUrl : null;
  const negative = 'blur, distortion, warped hands, extra fingers, text, watermark, logo, low quality, cartoon';
  if (model === 'kling3') {
    return img
      ? { endpoint: m.i2v, input: { start_image_url: img, prompt, duration: String(d), generate_audio: nativeAudio, negative_prompt: negative } }
      : { endpoint: m.t2v, input: { prompt, duration: String(d), aspect_ratio: '9:16', generate_audio: nativeAudio, negative_prompt: negative } };
  }
  if (model === 'seedance2') {
    return { endpoint: img ? m.i2v : m.t2v, input: { prompt, duration: String(d), aspect_ratio: '9:16', resolution: '720p', generate_audio: nativeAudio, ...(img ? { image_url: img } : {}) } };
  }
  return { endpoint: img ? m.i2v : m.t2v, input: { prompt, duration: `${d}s`, aspect_ratio: '9:16', resolution: '720p', generate_audio: nativeAudio, negative_prompt: negative, ...(img ? { image_url: img } : {}) } };
}

// ─── Mode gratuit : image IA (Pollinations, sans clé) + animation ffmpeg ───

let lastImageAt = 0;
/** Pollinations gratuit = 1 image / 45 s par IP : on espace les appels et on réessaie quand il dit d'attendre. */
async function freeImage(prompt: string, seed: number): Promise<Buffer> {
  const full = `${prompt}, ultra realistic photo, cinematic light, vertical composition, no text, no watermark`;
  let lastErr = '';
  for (let attempt = 0; attempt < 10; attempt++) {
    const wait = lastImageAt + 50_000 - Date.now();
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    lastImageAt = Date.now();
    const r = await axios.get<ArrayBuffer>(`https://image.pollinations.ai/prompt/${encodeURIComponent(full.slice(0, 900))}`, {
      params: { width: 1080, height: 1920, nologo: true, model: 'flux', seed }, responseType: 'arraybuffer', timeout: 120_000, validateStatus: () => true,
    }).catch(e => ({ status: 0, data: Buffer.from(String(e?.message ?? e)) }));
    const buf = Buffer.from(r.data as ArrayBuffer);
    if (r.status === 200 && buf[0] === 0xff && buf[1] === 0xd8 || (r.status === 200 && buf.subarray(1, 4).toString() === 'PNG')) return buf;
    lastErr = `${r.status} ${buf.toString().slice(0, 160)}`;
    const after = Number(/Retry after (\d+)s/i.exec(buf.toString())?.[1] ?? 0);
    if (after) lastImageAt = Date.now() + (after + 2) * 1000 - 50_000;
  }
  throw new Error(`image gratuite impossible (Pollinations) : ${lastErr}`);
}

/** Mouvement de caméra simulé sur une image fixe (effet Ken Burns), 1080×1920 30 i/s. */
export async function kenBurns(img: string, camera: string, seconds: number, out: string, k: number): Promise<void> {
  const n = Math.round(seconds * 30);
  const c = 'iw/2-(iw/zoom/2)', m = 'ih/2-(ih/zoom/2)';
  const moves: Record<string, [string, string, string]> = {
    dolly_in:   [`1+0.15*on/${n}`, c, m],
    crash_zoom: [`1+0.45*pow(on/${n},2)`, c, m],
    slowmo:     [`1+0.06*on/${n}`, c, m],
    drone:      [`1.25-0.2*on/${n}`, c, `(ih-ih/zoom)*(1-on/${n})`],
    fpv:        [`1+0.3*on/${n}`, `${c}+sin(on/9)*20`, m],
    travelling: ['1.2', `(iw-iw/zoom)*on/${n}`, m],
    orbit:      [`1.2+0.05*sin(on/${n}*3.14)`, `(iw-iw/zoom)*(1-on/${n})`, m],
    low_angle:  [`1.15+0.05*on/${n}`, c, `(ih-ih/zoom)*(1-on/${n})`],
    handheld:   ['1.12', `${c}+sin(on/7)*12`, `${m}+cos(on/9)*12`],
  };
  const auto = [moves['dolly_in']!, moves['travelling']!, moves['drone']!, moves['handheld']!][k % 4]!;
  const [z, x, y] = moves[camera] ?? auto;
  await run(['-i', img, '-filter_complex',
    // bas de l'image coupé (filigrane du service gratuit), puis grain + vignette légère : rendu « vraie caméra »
    `[0:v]crop=iw:ih*0.93:0:0,scale=2160:3840:force_original_aspect_ratio=increase,crop=2160:3840,zoompan=z='${z}':x='${x}':y='${y}':d=${n}:s=1080x1920:fps=30,` +
    `eq=contrast=1.04:saturation=0.96,vignette=angle=PI/6,noise=alls=4:allf=t,format=yuv420p[v]`,
    '-map', '[v]', '-frames:v', String(n), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', out]);
}

export async function freeShot(shot: StudioShot, imageUrl: string | null, dir: string, i: number, seed: number): Promise<string> {
  const img = path.join(dir, `img${i}.jpg`);
  if (shot.use_image && imageUrl) {
    await fs.writeFile(img, Buffer.from((await axios.get<ArrayBuffer>(imageUrl, { responseType: 'arraybuffer', timeout: 60_000 })).data));
  } else {
    try { await fs.writeFile(img, await freeImage(shot.prompt, seed + i)); }
    catch (e) {
      // Service gratuit saturé : on réutilise une image déjà faite avec un autre mouvement plutôt que de perdre le plan
      const prev = (await fs.readdir(dir)).filter(f => /^img\d+\.jpg$/.test(f) && f !== `img${i}.jpg`).sort().pop();
      if (!prev) throw e;
      console.warn(`[studio] plan ${i + 1} : image gratuite indisponible, réutilise ${prev}`);
      await fs.copyFile(path.join(dir, prev), img);
    }
  }
  const out = path.join(dir, `raw${i}.mp4`);
  await kenBurns(img, shot.camera, shot.duration, out, i);
  return out;
}

// ─── ffmpeg ───────────────────────────────────────────────────

let ffmpegBin: string | null = null;
async function getFfmpeg(): Promise<string> {
  if (ffmpegBin) return ffmpegBin;
  const ok = await new Promise<boolean>(res => { const p = spawn('ffmpeg', ['-version']); p.on('error', () => res(false)); p.on('close', c => res(c === 0)); });
  ffmpegBin = ok ? 'ffmpeg' : (ffmpegStatic as string);
  return ffmpegBin;
}

function run(args: string[], timeoutMs = 600_000): Promise<string> {
  return getFfmpeg().then(bin => new Promise((resolve, reject) => {
    const p = spawn(bin, ['-hide_banner', '-y', ...args], { stdio: 'pipe' });
    let err = '';
    p.stderr.on('data', (d: Buffer) => { err = (err + d.toString()).slice(-6000); });
    const t = setTimeout(() => p.kill('SIGKILL'), timeoutMs);
    p.on('close', c => { clearTimeout(t); c === 0 ? resolve(err) : reject(new Error(`ffmpeg : ${err.slice(-600)}`)); });
    p.on('error', e => { clearTimeout(t); reject(e); });
  }));
}

async function probe(file: string): Promise<{ duration: number; audio: boolean }> {
  const out = await run(['-i', file, '-f', 'null', '-t', '0.01', '-']).catch(e => String(e));
  const m = /Duration:\s*(\d+):(\d+):(\d+\.?\d*)/.exec(out);
  return { duration: m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : 0, audio: /Stream #.*Audio:/.test(out) };
}

const FONT_DIR = path.join(os.tmpdir(), 'dzaryx-studio-fonts');
async function ensureFonts(): Promise<void> {
  await fs.mkdir(FONT_DIR, { recursive: true });
  const fonts: Array<[string, string]> = [
    ['Montserrat-Black.ttf', 'https://raw.githubusercontent.com/JulietaUla/Montserrat/master/fonts/ttf/Montserrat-Black.ttf'],
    ['Cairo.ttf', 'https://github.com/google/fonts/raw/main/ofl/cairo/Cairo%5Bslnt,wght%5D.ttf'],
  ];
  for (const [name, url] of fonts) {
    const f = path.join(FONT_DIR, name);
    try { await fs.access(f); continue; } catch { /* à télécharger */ }
    try {
      const r = await axios.get<ArrayBuffer>(url, { responseType: 'arraybuffer', timeout: 20_000 });
      await fs.writeFile(f, Buffer.from(r.data));
    } catch (e) { console.warn(`[studio] police ${name} indisponible:`, e instanceof Error ? e.message : e); }
  }
}

// ─── Sous-titres ASS (mot par mot, style CapCut/Hormozi) ──────

const ARABIC = /[؀-ۿ]/;
function assTime(t: number): string {
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  return `${h}:${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`;
}
const assText = (t: string) => t.replace(/[{}]/g, '').replace(/\\/g, '').replace(/\n/g, ' ');

function buildAss(o: { voiceover: string; voiceStart: number; voiceDur: number; hook: string; cta: string; brand: string; total: number; subtitles: boolean }): string {
  const arabic = ARABIC.test(o.voiceover + o.hook + o.cta);
  const font = arabic ? 'Cairo' : 'Montserrat Black';
  const up = (t: string) => (arabic ? t : t.toUpperCase());
  const lines = [
    '[Script Info]', 'ScriptType: v4.00+', 'PlayResX: 1080', 'PlayResY: 1920', 'WrapStyle: 0', 'ScaledBorderAndShadow: yes', '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Sub,${font},86,&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,7,4,2,70,70,520,1`,
    `Style: Hook,${font},96,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,3,24,0,8,70,70,300,1`,
    `Style: Cta,${font},92,&H00000000,&H00000000,&H0000D7FF,&H00000000,-1,0,0,0,100,100,0,0,3,26,0,5,80,80,0,1`,
    `Style: Brand,${font},38,&H40FFFFFF,&H40FFFFFF,&H80000000,&H00000000,-1,0,0,0,100,100,3,0,1,2,0,9,50,50,70,1`,
    '', '[Events]', 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];
  const ev = (start: number, end: number, style: string, text: string) =>
    lines.push(`Dialogue: 0,${assTime(Math.max(0, start))},${assTime(Math.max(start + 0.05, end))},${style},,0,0,0,,${text}`);

  if (o.brand) ev(0, o.total, 'Brand', assText(o.brand));
  if (o.hook) ev(0.1, Math.min(2.6, o.total), 'Hook', `{\\fad(120,200)\\t(0,180,\\fscx106\\fscy106)}${assText(up(o.hook))}`);
  if (o.cta) ev(Math.max(0, o.total - 2.6), o.total, 'Cta', `{\\fad(200,0)\\t(0,220,\\fscx108\\fscy108)}${assText(up(o.cta))}`);

  if (o.subtitles && o.voiceover && o.voiceDur > 0) {
    // Pas d'horodatage mot à mot côté TTS : on répartit selon la longueur des mots (≈ débit réel)
    const words = o.voiceover.split(/\s+/).filter(Boolean);
    const weights = words.map(w => w.length + 2 + (/[.,!?;:…]$/.test(w) ? 3 : 0));
    const total = weights.reduce((a, b) => a + b, 0);
    let t = o.voiceStart;
    const times = words.map((_, i) => { const s = t; t += (weights[i]! / total) * o.voiceDur; return [s, t] as const; });
    for (let i = 0; i < words.length; i += 3) {
      const group = words.slice(i, i + 3);
      group.forEach((_, j) => {
        const [s, e] = times[i + j]!;
        const text = group.map((w, k) => k === j
          ? `{\\c&H0000D7FF&\\fscx112\\fscy112}${assText(up(w))}{\\r}`
          : assText(up(w))).join(' ');
        ev(s, e, 'Sub', text);
      });
    }
  }
  return lines.join('\n') + '\n';
}

const TRANSITIONS = ['fade', 'smoothup', 'slideleft', 'fadeblack', 'circleopen', 'smoothleft'];
const XF = 0.35;


/** Montage final 1080×1920 : recadrage, transitions, sous-titres/accroche/CTA/logo, mixage voix + musique + son natif. */
export async function montage(o: {
  dir: string; clips: Array<{ file: string; duration: number }>; voiceFile: string | null; voiceDur: number; musicFile: string | null;
  plan: Pick<StudioPlan, 'voiceover' | 'hook' | 'cta' | 'brand'>; opts: Pick<RenderOptions, 'nativeAudio' | 'subtitles'>;
}): Promise<{ final: string; total: number }> {
  const { dir, voiceFile, voiceDur, musicFile, plan, opts } = o;
  await ensureFonts();
  // ── 3. Normalisation 1080×1920 30 i/s + piste audio sur chaque plan ──
  const norm: Array<{ f: string; d: number }> = [];
  for (const [i, { file: c, duration: want }] of o.clips.entries()) {
    const info = await probe(c);
    const d = Math.max(1.5, Math.min(info.duration || want, want + 0.5));
    const out = path.join(dir, `n${i}.mp4`);
    const vf = 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30,setsar=1,format=yuv420p';
    await run([
      '-i', c, ...(info.audio ? [] : ['-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo']), '-t', d.toFixed(2),
      '-filter_complex', `[0:v]${vf}[v];[${info.audio ? '0:a' : '1:a'}]aresample=44100,aformat=channel_layouts=stereo[a]`,
      '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-c:a', 'aac', '-b:a', '160k', out,
    ]);
    norm.push({ f: out, d });
  }

  // ── 4. Enchaînement avec transitions ──
  const base = path.join(dir, 'base.mp4');
  if (norm.length === 1) await fs.copyFile(norm[0]!.f, base);
  else {
    const parts: string[] = [];
    let vPrev = '0:v', aPrev = '0:a', offset = 0;
    for (let k = 1; k < norm.length; k++) {
      offset += norm[k - 1]!.d - XF;
      const vo = `v${k}`, ao = `a${k}`;
      parts.push(`[${vPrev}][${k}:v]xfade=transition=${TRANSITIONS[(k - 1) % TRANSITIONS.length]}:duration=${XF}:offset=${offset.toFixed(2)}[${vo}]`);
      parts.push(`[${aPrev}][${k}:a]acrossfade=d=${XF}[${ao}]`);
      vPrev = vo; aPrev = ao;
    }
    await run([...norm.flatMap(n => ['-i', n.f]), '-filter_complex', parts.join(';'), '-map', `[${vPrev}]`, '-map', `[${aPrev}]`,
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-c:a', 'aac', '-b:a', '160k', base]);
  }
  const videoDur = norm.reduce((s, n) => s + n.d, 0) - XF * (norm.length - 1);

  // ── 5. Final : sous-titres + accroche + CTA + logo, mixage voix/musique, volume TikTok ──
  const voiceStart = 0.3;
  const total = Math.max(videoDur, voiceFile ? voiceStart + voiceDur + 0.6 : 0);
  const assFile = path.join(dir, 'subs.ass');
  await fs.writeFile(assFile, buildAss({ voiceover: plan.voiceover, voiceStart, voiceDur, hook: plan.hook, cta: plan.cta, brand: plan.brand, total, subtitles: opts.subtitles }));
  const inputs = ['-i', base];
  const mix: string[] = [`[0:a]volume=${voiceFile ? (opts.nativeAudio ? 0.35 : 0.15) : 1}[na]`];
  const labels = ['[na]'];
  let idx = 1;
  if (voiceFile) { inputs.push('-i', voiceFile); mix.push(`[${idx}:a]aresample=44100,adelay=${voiceStart * 1000}|${voiceStart * 1000},volume=1.6[vo]`); labels.push('[vo]'); idx++; }
  if (musicFile) {
    inputs.push('-stream_loop', '-1', '-i', musicFile);
    mix.push(`[${idx}:a]aresample=44100,volume=${voiceFile ? 0.16 : 0.45},afade=t=out:st=${Math.max(0, total - 1.5).toFixed(2)}:d=1.5[mu]`); labels.push('[mu]'); idx++;
  }
  const pad = total - videoDur > 0.05 ? `,tpad=stop_mode=clone:stop_duration=${(total - videoDur).toFixed(2)}` : '';
  const esc = (p: string) => p.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");
  const filter = [
    `[0:v]${pad ? pad.slice(1) + ',' : ''}ass='${esc(assFile)}':fontsdir='${esc(FONT_DIR)}'[v]`,
    ...mix,
    `${labels.join('')}amix=inputs=${labels.length}:normalize=0:duration=longest,loudnorm=I=-14:TP=-1.5:LRA=11[a]`,
  ].join(';');
  const final = path.join(dir, 'final.mp4');
  await run([...inputs, '-filter_complex', filter, '-map', '[v]', '-map', '[a]', '-t', total.toFixed(2),
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-profile:v', 'high', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '192k', '-ar', '44100', '-movflags', '+faststart', final]);
  return { final, total };
}

// ─── Signature FIK (clé dorée) en fin de vidéo ────────────────

/** Logo animé FIK nettoyé (sans filigrane, 1080×1920, fin de son en fondu) — remplaçable via app_kv studio:outro_url. */
const OUTRO_URL = 'https://febrrgqpyqqrewcohomx.supabase.co/storage/v1/object/public/videos/brand/fik-outro.mp4';

export async function appendOutro(dir: string, main: string, mainDur: number): Promise<{ final: string; total: number }> {
  const url = (await kvGet('studio:outro_url').catch(() => null)) || OUTRO_URL;
  const outro = path.join(dir, 'outro.mp4');
  await fs.writeFile(outro, Buffer.from((await axios.get<ArrayBuffer>(url, { responseType: 'arraybuffer', timeout: 60_000 })).data));
  const od = (await probe(outro)).duration || 4.3;
  const fx = 0.45, off = Math.max(0.5, mainDur - fx);
  const out = path.join(dir, 'final_sig.mp4');
  await run(['-i', main, '-i', outro, '-filter_complex',
    `[0:v]fps=30,format=yuv420p,setsar=1[v0];[1:v]fps=30,format=yuv420p,setsar=1[v1];` +
    `[v0][v1]xfade=transition=fadeblack:duration=${fx}:offset=${off.toFixed(2)}[v];` +
    `[0:a]aresample=44100[a0];[1:a]aresample=44100,volume=0.9[a1];[a0][a1]acrossfade=d=${fx}[a]`,
    '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '192k', '-ar', '44100', '-movflags', '+faststart', out]);
  return { final: out, total: off + od };
}

// ─── Jobs ─────────────────────────────────────────────────────

async function saveJob(job: StudioJob): Promise<void> {
  job.updatedAt = new Date().toISOString();
  await kvSet(JOB_KEY(job.id), JSON.stringify(job), KEEP).catch(e => console.error('[studio] save job', e));
}

export async function getStudioJob(id: string): Promise<StudioJob | null> {
  try {
    const job = JSON.parse((await kvGet(JOB_KEY(id))) ?? 'null') as StudioJob | null;
    // Rendu coupé par un redéploiement Railway : on le marque, sinon il resterait « en cours » pour toujours
    if (job && !['done', 'error'].includes(job.status) && !running.has(job.id) && Date.now() - new Date(job.updatedAt).getTime() > 15 * 60_000) {
      job.status = 'error'; job.error = 'Rendu interrompu (redémarrage du serveur). Relance-le.'; await saveJob(job);
    }
    return job;
  } catch { return null; }
}

export async function listStudioJobs(): Promise<{ jobs: StudioJob[]; spentUsd: number }> {
  const ids = JSON.parse((await kvGet(JOBS_INDEX).catch(() => null)) ?? '[]') as string[];
  const jobs = (await Promise.all(ids.map(getStudioJob))).filter((j): j is StudioJob => !!j);
  return { jobs, spentUsd: Number((await kvGet(SPENT_KEY).catch(() => null)) ?? 0) };
}

async function addSpent(usd: number): Promise<void> {
  const cur = Number((await kvGet(SPENT_KEY).catch(() => null)) ?? 0);
  await kvSet(SPENT_KEY, String(Math.round((cur + usd) * 100) / 100)).catch(() => {});
}

const running = new Set<string>();

export async function startStudioRender(plan: StudioPlan, opts: RenderOptions, actor = 'kouider', approval?: StudioJob['approval']): Promise<StudioJob> {
  if (!isFree(opts.model) && !env.FAL_KEY) throw new Error('FAL_KEY absente dans Railway — impossible de générer.');
  if (!STUDIO_MODELS[opts.model]) throw new Error(`modèle inconnu : ${opts.model}`);
  if (running.size >= 2) throw new Error('Déjà 2 vidéos en cours de rendu — attends qu\'une se termine.');
  const now = new Date().toISOString();
  const job: StudioJob = {
    id: randomUUID().slice(0, 8), planId: plan.id, title: plan.title, model: opts.model, status: 'queued', step: 'En file…', progress: 2,
    estimateUsd: estimateCost(plan.shots, opts), costUsd: 0, shotsDone: 0, shotsTotal: plan.shots.length, createdAt: now, updatedAt: now, actor, ...(approval ? { approval } : {}),
  };
  await saveJob(job);
  const ids = JSON.parse((await kvGet(JOBS_INDEX).catch(() => null)) ?? '[]') as string[];
  await kvSet(JOBS_INDEX, JSON.stringify([job.id, ...ids].slice(0, 30)));
  running.add(job.id);
  void renderJob(job, plan, opts).finally(() => running.delete(job.id));
  return job;
}

async function renderJob(job: StudioJob, plan: StudioPlan, opts: RenderOptions): Promise<void> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), `studio-${job.id}-`));
  const rate = opts.nativeAudio ? STUDIO_MODELS[opts.model].perSecAudio : STUDIO_MODELS[opts.model].perSec;
  try {
    // ── 1. Plans IA (2 en parallèle) + voix + musique pendant ce temps ──
    const free = isFree(opts.model);
    job.status = 'shots'; job.step = free ? 'Images IA gratuites (≈ 1 min par plan)…' : `Génération des plans IA (${STUDIO_MODELS[opts.model].label})…`; job.progress = 5; await saveJob(job);
    const seed = Math.floor(Math.random() * 1e6);
    const clips: Array<string | null> = new Array(plan.shots.length).fill(null);
    let cursor = 0;
    const worker = async () => {
      while (cursor < plan.shots.length) {
        const i = cursor++;
        const shot = plan.shots[i]!;
        for (let attempt = 0; attempt < 2 && !clips[i]; attempt++) {
          try {
            if (free) { clips[i] = await freeShot(shot, plan.image_url ?? null, dir, i, seed); break; }
            const { endpoint, input } = shotInput(opts.model, shot, plan.image_url ?? null, opts.nativeAudio);
            const res = await falRun(endpoint, input);
            const url = (res['video'] as { url?: string } | undefined)?.url;
            if (!url) throw new Error(`pas de vidéo dans la réponse : ${JSON.stringify(res).slice(0, 200)}`);
            const buf = Buffer.from((await axios.get<ArrayBuffer>(url, { responseType: 'arraybuffer', timeout: 120_000 })).data);
            const f = path.join(dir, `raw${i}.mp4`);
            await fs.writeFile(f, buf);
            clips[i] = f;
            job.costUsd += snapDuration(opts.model, shot.duration) * rate;
          } catch (e) {
            console.error(`[studio] plan ${i + 1} essai ${attempt + 1}:`, e instanceof Error ? e.message : e);
            if (e instanceof Error && /crédit|refusé/.test(e.message)) throw e;
          }
        }
        job.shotsDone++; job.progress = 5 + Math.round((job.shotsDone / job.shotsTotal) * 65);
        job.step = `Plans IA : ${job.shotsDone}/${job.shotsTotal}`; await saveJob(job);
      }
    };
    const voiceP = opts.voice && plan.voiceover
      ? (free
        ? (async () => (await synthesizeVoiceGemini(plan.voiceover)) ?? (await synthesizeVoiceFree(plan.voiceover)))()
        : (async () => (await synthesizeVoice(plan.voiceover)) ?? (await synthesizeVoiceGemini(plan.voiceover)))()).catch(() => null)
      : Promise.resolve(null);
    const musicP = opts.music && plan.music_prompt && !free
      ? falRun(MUSIC_MODEL, { prompt: plan.music_prompt, duration: Math.min(90, plan.shots.reduce((s, x) => s + x.duration, 0) + 8) }, 240_000)
        .then(r => (r['audio_file'] as { url?: string } | undefined)?.url ?? null).catch(e => { console.warn('[studio] musique:', e.message); return null; })
      : Promise.resolve(null);
    await Promise.all(free ? [worker()] : [worker(), worker()]);

    const ok = clips.map((c, i) => ({ c, i })).filter((x): x is { c: string; i: number } => !!x.c);
    if (!ok.length) throw new Error(free ? 'aucune image gratuite n\'a pu être générée (Pollinations indisponible, réessaie plus tard)' : 'aucun plan IA n\'a pu être généré (voir crédit fal.ai)');

    // ── 2. Audio ──
    job.status = 'audio'; job.step = 'Voix off et musique…'; job.progress = 74; await saveJob(job);
    const [voiceBuf, musicUrl] = await Promise.all([voiceP, musicP]);
    let voiceFile: string | null = null, voiceDur = 0;
    if (voiceBuf) {
      voiceFile = path.join(dir, voiceBuf.subarray(0, 4).toString() === 'RIFF' ? 'voice.wav' : 'voice.mp3');
      await fs.writeFile(voiceFile, voiceBuf);
      voiceDur = (await probe(voiceFile)).duration;
    }
    let musicFile: string | null = null;
    if (musicUrl) {
      musicFile = path.join(dir, 'music.wav');
      await fs.writeFile(musicFile, Buffer.from((await axios.get<ArrayBuffer>(musicUrl, { responseType: 'arraybuffer', timeout: 60_000 })).data));
      job.costUsd += MUSIC_COST;
    }

    job.status = 'montage'; job.step = 'Montage : recadrage 9:16, transitions, sous-titres…'; job.progress = 80; await saveJob(job);
    let { final, total } = await montage({ dir, clips: ok.map(x => ({ file: x.c, duration: plan.shots[x.i]!.duration })), voiceFile, voiceDur, musicFile, plan, opts });
    if (opts.outro !== false) {
      job.step = 'Signature FIK en fin de vidéo…'; job.progress = 93; await saveJob(job);
      try { ({ final, total } = await appendOutro(dir, final, total)); }
      catch (e) { console.warn('[studio] signature FIK non ajoutée :', e instanceof Error ? e.message : e); }
    }

    // ── 6. Upload + livraison ──
    job.step = 'Envoi…'; job.progress = 96; await saveJob(job);
    const buf = await fs.readFile(final);
    const name = `studio/${job.id}.mp4`;
    const { error } = await supabase.storage.from('videos').upload(name, buf, { contentType: 'video/mp4', upsert: true, cacheControl: '3600' });
    if (error) throw new Error(`upload Supabase : ${error.message}`);
    const url = supabase.storage.from('videos').getPublicUrl(name).data.publicUrl;

    job.costUsd = Math.round(job.costUsd * 100) / 100;
    await addSpent(job.costUsd);
    Object.assign(job, { status: 'done', step: 'Terminé ✅', progress: 100, url, caption: plan.post_caption });
    await saveJob(job);
    if (job.approval) {
      const { savePendingVideo } = await import('./approval-store.js');
      const tags = (plan.post_caption.match(/#[\p{L}\d_]+/gu) ?? []).slice(0, 8);
      await savePendingVideo({ video_url: url, caption: plan.post_caption.replace(/#[\p{L}\d_]+/gu, '').trim(), hashtags: tags,
        car_name: job.approval.car_name, car_id: job.approval.car_id, script: plan.voiceover }).catch(e => console.error('[studio] pending', e));
    }
    const missed = plan.shots.length - ok.length;
    const msg = `🎬 Studio vidéo — « ${plan.title} » est prête (${Math.round(total)} s, ${STUDIO_MODELS[opts.model].label}, ${free ? '0 €' : `coût ≈ ${job.costUsd.toFixed(2)} $`})` +
      (missed ? `\n⚠️ ${missed} plan(s) n'ont pas pu être générés, montage fait sans eux.` : '') +
      (plan.post_caption ? `\n\nLégende à poster :\n${plan.post_caption}` : '') +
      (job.approval ? `\n\n${job.approval.label} — ✅ Réponds Oke pour publier` : '');
    await queueTelegramMessage(msg, undefined, job.actor, { url, name: `${plan.title.replace(/[^\w\- ]+/g, '').slice(0, 50) || 'video'}.mp4` }).catch(() => {});
    emitProactive(`🎬 Vidéo « ${plan.title} » prête dans STUDIO VIDÉO`, 'info', msg, job.actor === 'houari' ? 'houari' : 'kouider');
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    console.error(`[studio] job ${job.id}:`, m);
    job.costUsd = Math.round(job.costUsd * 100) / 100;
    if (job.costUsd) await addSpent(job.costUsd);
    Object.assign(job, { status: 'error', step: 'Échec', error: m.slice(0, 400) });
    await saveJob(job);
    emitProactive(`❌ Studio vidéo « ${plan.title} » : ${m.slice(0, 160)}`, 'alert', undefined, job.actor === 'houari' ? 'houari' : 'kouider');
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

// ─── Vidéos automatiques de la semaine (mercredi, vendredi, idée TikTok) ───

/** Les tâches planifiées passent par le moteur MONTAGE gratuit : scénario → rendu → Telegram, publication après « Oke ». */
export async function autoStudioVideo(o: { idea: string; template: string; car: { id: string; name: string; image_url: string | null }; label: string }): Promise<StudioJob> {
  const plan = await createStudioPlan({ idea: o.idea, template: o.template, lang: 'fr', seconds: 20, imageUrl: o.car.image_url, carName: o.car.name });
  return startStudioRender(plan, { model: FREE_MODEL, nativeAudio: false, voice: !!plan.voiceover, music: false, subtitles: true, outro: true }, 'kouider',
    { car_name: o.car.name, car_id: o.car.id, label: o.label });
}

// ─── Outil Dzaryx (Telegram / appel / chat) ───────────────────

async function fleetPhoto(carName: string): Promise<{ name: string; url: string } | null> {
  const { data } = await supabase.from('cars').select('name, image_url').ilike('name', `%${carName}%`).limit(1);
  const car = (data ?? [])[0] as { name: string; image_url: string | null } | undefined;
  return car?.image_url ? { name: car.name, url: car.image_url } : null;
}

export async function videoStudioTool(input: Record<string, unknown>, actor = 'kouider'): Promise<string> {
  const action = String(input['action'] ?? 'plan');
  if (action === 'status') {
    const { jobs, spentUsd } = await listStudioJobs();
    if (!jobs.length) return 'Aucune vidéo studio pour l\'instant.';
    return `Studio vidéo (dépensé au total ≈ ${spentUsd.toFixed(2)} $) :\n` + jobs.slice(0, 5).map(j =>
      `• ${j.title} — ${j.status === 'done' ? `✅ ${j.url}` : j.status === 'error' ? `❌ ${j.error}` : `⏳ ${j.step} (${j.progress} %)`}`).join('\n');
  }
  const model = (STUDIO_MODELS[String(input['model']) as ModelId] ? String(input['model']) : FREE_MODEL) as ModelId;
  const opts: RenderOptions = { model, nativeAudio: !!input['native_audio'], voice: input['voice'] !== false, music: input['music'] !== false, subtitles: true, outro: input['outro'] !== false };
  if (action === 'render') {
    const plan = await getStudioPlan(String(input['plan_id'] ?? ''));
    if (!plan) return '❌ Plan introuvable — refais d\'abord action="plan".';
    if (!plan.voiceover) { opts.voice = false; opts.music = !!input['music']; }
    const job = await startStudioRender(plan, opts, actor);
    return isFree(model)
      ? `🎬 Rendu gratuit lancé (0 €, ${plan.shots.length} plans ≈ ${plan.shots.length + 2} min). La vidéo arrivera sur Telegram et dans l'app (page MONTAGE).`
      : `🎬 Rendu lancé (${STUDIO_MODELS[model].label}, ≈ ${job.estimateUsd.toFixed(2)} $). Compter 5 à 15 minutes ; la vidéo arrivera sur Telegram et dans l'app (page MONTAGE).`;
  }
  // plan
  const carName = input['car_name'] ? String(input['car_name']) : null;
  const car = carName ? await fleetPhoto(carName) : null;
  const imageUrl = input['image_url'] ? String(input['image_url']) : car?.url ?? null;
  const plan = input['manual_prompt']
    ? await manualPlan({ prompt: String(input['manual_prompt']), camera: String(input['camera'] ?? 'auto'), duration: Number(input['seconds']) || 5, imageUrl })
    : await createStudioPlan({ idea: String(input['idea'] ?? ''), template: String(input['template'] ?? 'libre'), lang: String(input['lang'] ?? 'fr'),
        seconds: Number(input['seconds']) || 20, imageUrl, carName: car?.name ?? null });
  const costs = (Object.keys(STUDIO_MODELS) as ModelId[]).map(m => `${STUDIO_MODELS[m].label} ≈ ${estimateCost(plan.shots, { ...opts, model: m }).toFixed(2)} $`).join(' · ');
  return `Plan prêt (plan_id=${plan.id}) — « ${plan.title} »${car ? ` avec la vraie photo de ${car.name}` : ''}
Accroche : ${plan.hook || '—'}
${plan.shots.map((s, i) => `${i + 1}. [${STUDIO_CAMERAS[s.camera]?.label ?? s.camera}, ${s.duration} s] ${s.prompt.slice(0, 140)}`).join('\n')}
Voix off : ${plan.voiceover.slice(0, 300) || '—'}
Mode par défaut : GRATUIT (0 €) — tu peux lancer tout de suite action="render" avec ce plan_id (sans model), pas besoin d'accord.
Modèles payants (seulement si Kouider demande lui-même Kling/Veo/Seedance, et après son accord sur le prix) : ${costs.split(' · ').filter(x => !x.startsWith('Gratuit')).join(' · ')}`;
}
