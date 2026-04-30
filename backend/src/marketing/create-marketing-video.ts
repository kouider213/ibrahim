/**
 * create-marketing-video.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Génération complète d'une vidéo marketing 9:16 (1080×1920) :
 *   1. Chercher la voiture dans la flotte Supabase (photos réelles)
 *   2. Générer un script IA via Claude si pas de custom_script
 *   3. Synthèse voix française ElevenLabs
 *   4. Montage FFmpeg : image voiture + voix + musique + overlays texte
 *   5. Upload dans Supabase Storage bucket "videos"
 *   6. Envoyer la vidéo MP4 dans le chat Telegram via bot
 *   7. Retourner l'URL publique + metadata
 * ─────────────────────────────────────────────────────────────────────────────
 */

import axios from 'axios';
import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
// @ts-ignore — ffmpeg-static has no bundled type declarations
import ffmpegPath from 'ffmpeg-static';

import { supabase } from '../integrations/supabase.js';
import { env } from '../config/env.js';
import { synthesizeVoice } from '../notifications/dispatcher.js';
import { chat as claudeChat } from '../integrations/claude-api.js';
import { getPricingForVehicle } from '../config/pricing.js';
import {
  sendMessage as tgText,
  sendPhoto as tgPhoto,
  sendVideoBuffer as tgVideo,
  sendVoiceBuffer as tgVoice,
} from '../integrations/telegram.js';
import { savePendingVideo } from './approval-store.js';
import type { Car } from '../integrations/supabase.js';

// ─── Types publics ────────────────────────────────────────────

export interface MarketingVideoInput {
  car_name?:          string;
  style?:             'reveal' | 'prix' | 'lifestyle' | 'temoignage';
  custom_script?:     string;
  background_effect?: string;
}

export interface MarketingVideoResult {
  public_url:  string;
  car_name:    string;
  script:      string;
  caption:     string;
  hashtags:    string[];
  pending_id:  string;
  method:      'ffmpeg' | 'photo_fallback';
}

// ─── Constantes ───────────────────────────────────────────────

/** Résolution cible : 9:16 TikTok full-HD */
const W = 1080;
const H = 1920;

const HASHTAGS = ['#locationvoiture', '#oran', '#algerie', '#fikconcierge', '#mre', '#tiktokalgerie'];

const STYLE_DESC: Record<string, string> = {
  reveal:     'dévoilement dramatique, suspense puis révélation prix',
  prix:       'choc du prix en premier, insister sur le rapport qualité/prix',
  lifestyle:  'émotion, voyage, liberté, week-end parfait',
  temoignage: 'témoignage client enthousiaste, très authentique',
};

/** Queries Pexels par effet de fond */
const BG_QUERIES: Record<string, string> = {
  plage:    'beach sea summer blue sky Algeria',
  ville:    'Oran Algeria city urban night lights bokeh',
  montagne: 'Algeria mountain landscape scenic dramatic',
  desert:   'sahara desert sand dunes sunset Algeria',
  route:    'Algeria coastal highway road trip asphalt',
  luxe:     'luxury hotel lifestyle premium elegant',
  foret:    'forest nature green trees dappled light',
  coucher:  'golden hour sunset sky orange clouds warm',
  nuit:     'night city lights bokeh dark atmosphere',
};

// ─── Helpers ──────────────────────────────────────────────────

/** Nettoyage texte pour filtres FFmpeg drawtext */
function dt(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/:/g, '\\:')
    .replace(/[[\]{}%]/g, '')
    .slice(0, 60);
}

/** Téléchargement d'un buffer depuis une URL */
async function downloadBuffer(url: string, timeout = 30_000): Promise<Buffer> {
  const resp = await axios.get<ArrayBuffer>(url, { responseType: 'arraybuffer', timeout });
  return Buffer.from(resp.data);
}

/** Durée audio via ffprobe stderr */
function getAudioDuration(bin: string, audioPath: string): Promise<number> {
  return new Promise(resolve => {
    const proc = spawn(bin, ['-i', audioPath, '-f', 'null', '-'], { stdio: 'pipe' });
    let stderr = '';
    proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });
    proc.on('close', () => {
      const m = /Duration:\s*(\d+):(\d+):(\d+\.?\d*)/.exec(stderr);
      resolve(m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : 22);
    });
    proc.on('error', () => resolve(22));
  });
}

/** Cache local de la font Montserrat Bold */
const FONT_CACHE_PATH = path.join(os.tmpdir(), 'dzaryx-font-hd.ttf');

async function ensureFont(): Promise<string | null> {
  try {
    await fs.access(FONT_CACHE_PATH);
    return FONT_CACHE_PATH;
  } catch {
    const urls = [
      'https://github.com/google/fonts/raw/main/ofl/montserrat/static/Montserrat-Bold.ttf',
      'https://fonts.gstatic.com/s/montserrat/v26/JTUHjIg1_i6t8kCHKm4532VJOt5-QNFgpCuM73w5aXp-p7K4KLg.woff2',
    ];
    for (const url of urls) {
      try {
        const buf = await downloadBuffer(url, 12_000);
        await fs.writeFile(FONT_CACHE_PATH, buf);
        console.log('[mktg-video] Font cached OK');
        return FONT_CACHE_PATH;
      } catch { continue; }
    }
    console.warn('[mktg-video] Font download failed — text overlays disabled');
    return null;
  }
}

/** Télécharger une image de fond Pexels en portrait */
async function downloadPexelsBg(keyword: string, destPath: string): Promise<boolean> {
  const apiKey = env.PEXELS_API_KEY;
  if (!apiKey) return false;
  const query = BG_QUERIES[keyword.toLowerCase()] ?? keyword;
  try {
    const { data } = await axios.get('https://api.pexels.com/v1/search', {
      headers: { Authorization: apiKey },
      params: { query, per_page: 5, orientation: 'portrait' },
      timeout: 10_000,
    });
    const photos: Array<{ src: { portrait: string; large2x: string } }> = (data as any).photos ?? [];
    if (!photos.length) return false;
    const photo = photos[Math.floor(Math.random() * photos.length)];
    const imgBuf = await downloadBuffer(photo.src.portrait || photo.src.large2x, 20_000);
    await fs.writeFile(destPath, imgBuf);
    return true;
  } catch (err) {
    console.warn('[mktg-video] Pexels bg failed:', err instanceof Error ? err.message : err);
    return false;
  }
}

// ─── Encodeur FFmpeg 1080×1920 ────────────────────────────────

interface FFmpegParams {
  carImagePath:    string;
  audioPath:       string | null;
  outputPath:      string;
  backgroundPath?: string;
  fontPath:        string | null;
  carName:         string;
  priceText:       string;
  duration:        number;
}

function buildVideo1080(params: FFmpegParams): Promise<void> {
  const {
    carImagePath, audioPath, outputPath,
    backgroundPath, fontPath, carName, priceText, duration,
  } = params;

  return new Promise((resolve, reject) => {
    const bin = ffmpegPath as string | null;
    if (!bin) { reject(new Error('ffmpeg-static not found')); return; }

    const frames       = Math.max(Math.ceil(duration * 25), 50);
    const fadeStart    = Math.max(duration - 0.8, 0.5).toFixed(2);
    const hasFont      = Boolean(fontPath);
    const fp           = fontPath ? `'${fontPath}'` : '';

    // Tailles de police adaptées au 1080p
    const nameText  = dt(carName);
    const priceT    = dt(priceText);
    const ctaText   = dt('Fik Conciergerie — Reservez maintenant');
    const brandText = dt('Oran • Algerie');

    const textFilters = hasFont ? [
      // Fond semi-transparent derrière les textes (haut)
      `drawbox=x=0:y=0:w=${W}:h=180:color=black@0.55:t=fill`,
      // Nom voiture
      `drawtext=fontfile=${fp}:text='${nameText}':fontsize=72:fontcolor=white:x=(w-tw)/2:y=40:shadowx=4:shadowy=4:shadowcolor=black@0.9`,
      // Prix
      `drawtext=fontfile=${fp}:text='${priceT}':fontsize=110:fontcolor=FFD700:x=(w-tw)/2:y=120:shadowx=6:shadowy=6:shadowcolor=black@0.9`,
      // Fond bas + CTA
      `drawbox=x=0:y=${H - 160}:w=${W}:h=160:color=black@0.6:t=fill`,
      `drawtext=fontfile=${fp}:text='${ctaText}':fontsize=44:fontcolor=white:x=(w-tw)/2:y=${H - 120}:shadowx=3:shadowy=3:shadowcolor=black@0.8`,
      `drawtext=fontfile=${fp}:text='${brandText}':fontsize=34:fontcolor=white@0.75:x=(w-tw)/2:y=${H - 65}`,
    ].join(',') : '';

    const args: string[] = ['-y'];

    if (backgroundPath) {
      // ── Mode fond Pexels + voiture superposée ──────────────
      args.push('-loop', '1', '-i', backgroundPath);   // [0] fond
      args.push('-loop', '1', '-i', carImagePath);      // [1] voiture
      if (audioPath) args.push('-i', audioPath);         // [2] audio

      // Fond : scale + Ken Burns doux + color grade
      const bgFilter = [
        `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase`,
        `crop=${W}:${H}`,
        `zoompan=z='min(zoom+0.0002,1.05)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${W}x${H}:fps=25`,
        `eq=saturation=1.1:contrast=1.03[bg]`,
      ].join(',');

      // Voiture : scale large, boost couleurs
      const carFilter = [
        `[1:v]scale=${W - 60}:-1`,
        `eq=saturation=1.7:contrast=1.25:brightness=0.07[car]`,
      ].join(',');

      // Superposition voiture centrée verticalement à 42%
      const overlayF = `[bg][car]overlay=(W-w)/2:(H-h)*0.42[ov]`;

      // Effets finaux + textes + fades
      const finalFilters = [
        `[ov]vignette=angle=PI/5`,
        hasFont ? textFilters : '',
        `fade=t=in:st=0:d=0.6`,
        `fade=t=out:st=${fadeStart}:d=0.8[vout]`,
      ].filter(Boolean).join(',');

      args.push('-filter_complex', `${bgFilter};${carFilter};${overlayF};${finalFilters}`);
      args.push('-map', '[vout]');
      if (audioPath) {
        args.push('-map', '2:a', '-c:a', 'aac', '-b:a', '192k', '-shortest');
      } else {
        args.push('-t', String(duration));
      }
    } else {
      // ── Mode voiture plein écran + Ken Burns ────────────────
      args.push('-loop', '1', '-i', carImagePath);
      if (audioPath) args.push('-i', audioPath);

      const videoFilters = [
        `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase`,
        `crop=${W}:${H}`,
        `zoompan=z='min(zoom+0.0008,1.15)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${W}x${H}:fps=25`,
        `eq=saturation=1.6:contrast=1.18:brightness=0.06:gamma=1.1`,
        `vignette=angle=PI/4`,
        hasFont ? textFilters : '',
        `fade=t=in:st=0:d=0.6`,
        `fade=t=out:st=${fadeStart}:d=0.8[vout]`,
      ].filter(Boolean).join(',');

      args.push('-filter_complex', videoFilters);
      args.push('-map', '[vout]');
      if (audioPath) {
        args.push('-map', '1:a', '-c:a', 'aac', '-b:a', '192k', '-shortest');
      } else {
        args.push('-t', String(duration));
      }
    }

    // Sortie H.264 1080p optimisée pour mobile
    args.push(
      '-c:v',    'libx264',
      '-preset', 'fast',
      '-crf',    '22',
      '-profile:v', 'high',
      '-level',  '4.1',
      '-pix_fmt', 'yuv420p',
      '-r',      '25',
      '-movflags', '+faststart',
      outputPath,
    );

    console.log('[mktg-video] FFmpeg 1080p args:', args.join(' ').slice(0, 400));

    const proc = spawn(bin, args, { stdio: 'pipe' });
    let stderr = '';
    proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });
    proc.on('close', code => {
      if (code === 0) resolve();
      else {
        console.error('[mktg-video] FFmpeg stderr (last 600):', stderr.slice(-600));
        reject(new Error(`ffmpeg exit ${code}: ${stderr.slice(-300)}`));
      }
    });
    proc.on('error', reject);
  });
}

/** Fallback simple sans Ken Burns ni texte (ultra-rapide) */
function buildVideoSimple(
  carImagePath: string,
  audioPath: string | null,
  outputPath: string,
  bgPath?: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const bin = ffmpegPath as string | null;
    if (!bin) { reject(new Error('ffmpeg-static not found')); return; }

    const args: string[] = ['-y'];

    if (bgPath) {
      args.push('-loop', '1', '-i', bgPath);
      args.push('-loop', '1', '-i', carImagePath);
      if (audioPath) args.push('-i', audioPath);
      args.push(
        '-filter_complex',
        `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}[bg];` +
        `[1:v]scale=${W - 100}:-1[car];[bg][car]overlay=(W-w)/2:(H-h)*0.42[out]`,
        '-map', '[out]',
      );
      if (audioPath) args.push('-map', '2:a', '-c:a', 'aac', '-b:a', '128k', '-shortest');
      else args.push('-t', '22');
    } else {
      args.push('-loop', '1', '-i', carImagePath);
      if (audioPath) args.push('-i', audioPath);
      args.push(
        '-vf',
        `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},eq=saturation=1.5:contrast=1.12`,
      );
      if (audioPath) args.push('-c:a', 'aac', '-b:a', '128k', '-shortest');
      else args.push('-t', '22');
    }

    args.push('-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-r', '25', '-movflags', '+faststart', outputPath);

    const proc = spawn(bin, args, { stdio: 'pipe' });
    let stderr = '';
    proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });
    proc.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg simple exit ${code}: ${stderr.slice(-300)}`));
    });
    proc.on('error', reject);
  });
}

// ─── Upload Supabase Storage "videos" ─────────────────────────

async function uploadToSupabaseVideos(
  buffer: Buffer,
  filename: string,
): Promise<string> {
  const { error } = await supabase.storage
    .from('videos')
    .upload(filename, buffer, {
      contentType:  'video/mp4',
      upsert:       true,
      cacheControl: '3600',
    });

  if (error) throw new Error(`Supabase Storage upload failed: ${error.message}`);

  const { data: publicData } = supabase.storage
    .from('videos')
    .getPublicUrl(filename);

  return publicData.publicUrl;
}

// ─── Fonction principale exportée ─────────────────────────────

export async function executeCreateMarketingVideo(
  input: MarketingVideoInput,
  chatId: string,
): Promise<MarketingVideoResult> {
  const carNameFilter    = input.car_name?.toLowerCase();
  const style            = input.style ?? 'reveal';
  const customScript     = input.custom_script;
  const backgroundEffect = input.background_effect;

  // ── 1. Chercher la voiture dans Supabase ─────────────────────
  const { data: carsRaw } = await supabase
    .from('cars')
    .select('*')
    .eq('available', true);

  const cars = (carsRaw ?? []) as Car[];
  if (!cars.length) throw new Error('Aucune voiture disponible dans la flotte.');

  const carsWithImage = cars.filter(c => c.image_url);
  if (!carsWithImage.length) throw new Error('Aucune voiture avec photo — ajoute des images dans le tableau de bord.');

  const car = carNameFilter
    ? (carsWithImage.find(c => c.name.toLowerCase().includes(carNameFilter))
      ?? carsWithImage[Math.floor(Math.random() * carsWithImage.length)])
    : carsWithImage[Math.floor(Math.random() * carsWithImage.length)];

  // ── 2. Prix depuis la grille tarifaire ────────────────────────
  const pricing      = getPricingForVehicle(car.name);
  const priceKouider = pricing?.kouiderPrice ?? null;
  const priceHouari  = pricing?.houariPrice  ?? null;
  const priceDisplay = priceKouider
    ? `${priceKouider}€/j`
    : priceHouari
      ? `${priceHouari}€/j`
      : 'prix sur demande';

  const priceFFmpeg = priceKouider
    ? `${priceKouider} EUR/jour`
    : priceHouari
      ? `${priceHouari} EUR/jour`
      : `${car.base_price.toLocaleString()} DZD/j`;

  // ── 3. Script IA ou personnalisé ─────────────────────────────
  let script: string;
  if (customScript) {
    script = customScript;
  } else {
    const month  = new Date().getMonth() + 1;
    const season =
      month >= 6 && month <= 8 ? 'Saison MRE (forte demande diaspora)' :
      month === 3 || month === 4 ? 'Ramadan (sorties nocturnes, famille)' :
      'Période standard (clients locaux + professionnels)';

    const sr = await claudeChat([{
      role: 'user',
      content: `Script voix-off TikTok, 20-25 secondes, FRANÇAIS uniquement, style "${style}" (${STYLE_DESC[style] ?? style}).
VOITURE: ${car.name} (${car.category}) | PRIX: ${priceDisplay} | CONTEXTE: ${season}
Instructions: accrocheur, prix + "Fik Conciergerie Oran" mentionnés, CTA fort à la fin.
RÉPONDS UNIQUEMENT avec le script, sans guillemets ni commentaires.`,
    }], undefined);
    script = sr.text.trim().replace(/^["']|["']$/g, '');
  }

  const caption  = `🚗 ${car.name} à Oran — ${priceDisplay} | Fik Conciergerie`;

  // ── 4. Progression Telegram ──────────────────────────────────
  await tgText(
    chatId,
    `🎬 *Vidéo marketing — ${car.name}*\n_FFmpeg HD 1080×1920${backgroundEffect ? ` · fond ${backgroundEffect}` : ''}_\n⏳ Montage en cours...`,
  ).catch(() => {});

  // ── 5. Montage FFmpeg dans un répertoire temporaire ───────────
  const tmpDir    = await fs.mkdtemp(path.join(os.tmpdir(), 'dzaryx-mktg-'));
  const imagePath = path.join(tmpDir, 'car.jpg');
  const audioPath = path.join(tmpDir, 'voice.mp3');
  const bgPath    = path.join(tmpDir, 'background.jpg');
  const videoPath = path.join(tmpDir, 'output.mp4');

  let videoBuffer: Buffer | null = null;

  try {
    // 5a. Télécharger l'image de la voiture
    const imgBuf = await downloadBuffer(car.image_url, 20_000);
    await fs.writeFile(imagePath, imgBuf);

    // 5b. Voix ElevenLabs (ELEVENLABS_API_KEY déjà dans env)
    const audioBuffer = await synthesizeVoice(script).catch(() => null);
    let hasAudio = false;
    if (audioBuffer && audioBuffer.length > 0) {
      await fs.writeFile(audioPath, audioBuffer);
      hasAudio = true;
    }

    // 5c. Fond Pexels (optionnel)
    let hasBg = false;
    if (backgroundEffect) {
      hasBg = await downloadPexelsBg(backgroundEffect, bgPath);
    }

    // 5d. Font pour text overlays
    const fontPath = await ensureFont();

    // 5e. Durée = durée audio + 0.8s marge
    const bin      = ffmpegPath as string;
    const duration = hasAudio ? (await getAudioDuration(bin, audioPath)) + 0.8 : 22;

    // 5f. Encodage HD 1080×1920 avec Ken Burns + color + text + fade
    try {
      await buildVideo1080({
        carImagePath:   imagePath,
        audioPath:      hasAudio ? audioPath : null,
        outputPath:     videoPath,
        backgroundPath: hasBg ? bgPath : undefined,
        fontPath,
        carName:        car.name,
        priceText:      priceFFmpeg,
        duration,
      });
      console.log('[mktg-video] ✅ HD 1080p video built');
    } catch (advErr) {
      console.warn('[mktg-video] HD build failed, fallback simple:', advErr instanceof Error ? advErr.message : advErr);
      await buildVideoSimple(imagePath, hasAudio ? audioPath : null, videoPath, hasBg ? bgPath : undefined);
      console.log('[mktg-video] ✅ Simple fallback video built');
    }

    videoBuffer = await fs.readFile(videoPath);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }

  // ── 6. Upload dans Supabase Storage bucket "videos" ──────────
  const filename  = `mktg_${car.name.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.mp4`;
  let publicUrl   = '';
  let uploadError = '';

  if (videoBuffer) {
    try {
      publicUrl = await uploadToSupabaseVideos(videoBuffer, filename);
      console.log('[mktg-video] ✅ Uploaded to Supabase Storage:', publicUrl);
    } catch (err) {
      uploadError = err instanceof Error ? err.message : String(err);
      console.error('[mktg-video] Storage upload failed:', uploadError);
      // Continuer quand même — on a le buffer pour Telegram
    }
  }

  // ── 7. Envoyer la vidéo dans le chat Telegram ─────────────────
  const approvalMsg = [
    `🎬 *Vidéo TikTok — ${car.name}*`,
    ``,
    `📋 ${caption}`,
    `🏷️ ${HASHTAGS.join(' ')}`,
    publicUrl ? `\n🔗 ${publicUrl}` : '',
    ``,
    `✅ Réponds *Oke* pour publier | ❌ *Non* pour annuler`,
  ].filter(l => l !== undefined).join('\n');

  // Sauvegarder pour le workflow approbation
  const pendingId = await savePendingVideo({
    video_url: publicUrl || car.image_url,
    caption,
    hashtags: HASHTAGS,
    car_name: car.name,
    car_id:   car.id,
    script,
  });

  if (videoBuffer) {
    await tgVideo(chatId, videoBuffer, approvalMsg).catch(async (err: unknown) => {
      // Fallback : envoyer la photo + message si la vidéo est trop lourde
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[mktg-video] tgVideo failed:', msg);
      await tgPhoto(chatId, car.image_url, approvalMsg).catch(() => {});
    });

    // Envoyer la voix séparément si disponible
    const voiceBuffer = await synthesizeVoice(script).catch(() => null);
    if (voiceBuffer) {
      await tgVoice(chatId, voiceBuffer).catch(() => {});
    }
  } else {
    // Aucune vidéo générée — envoyer la photo avec le message
    await tgPhoto(chatId, car.image_url, approvalMsg).catch(() => {});
    const voiceBuffer = await synthesizeVoice(script).catch(() => null);
    if (voiceBuffer) await tgVoice(chatId, voiceBuffer).catch(() => {});
  }

  return {
    public_url: publicUrl || car.image_url,
    car_name:   car.name,
    script,
    caption,
    hashtags:   HASHTAGS,
    pending_id: pendingId,
    method:     videoBuffer ? 'ffmpeg' : 'photo_fallback',
  };
}
