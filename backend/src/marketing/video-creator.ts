import axios from 'axios';
import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
// @ts-ignore — ffmpeg-static has no bundled type declarations
import ffmpegPath from 'ffmpeg-static';
import { synthesizeVoice } from '../notifications/dispatcher.js';
import { env } from '../config/env.js';
import type { VideoIdea } from './market-research.js';
import type { Car } from '../integrations/supabase.js';

export interface VideoResult {
  buffer:   Buffer;
  caption:  string;
  hashtags: string[];
  car_name: string;
  script:   string;
}

export interface VideoOptions {
  customScript?:     string;
  backgroundEffect?: string;
}

// ── Font management (pour text overlays dans FFmpeg) ─────────

const FONT_CACHE_PATH = path.join(os.tmpdir(), 'dzaryx-font.ttf');

async function ensureFont(): Promise<string | null> {
  try {
    await fs.access(FONT_CACHE_PATH);
    return FONT_CACHE_PATH;
  } catch {
    // Essayer de télécharger Montserrat Bold (Google Fonts)
    const urls = [
      'https://github.com/google/fonts/raw/main/ofl/montserrat/static/Montserrat-Bold.ttf',
      'https://fonts.gstatic.com/s/montserrat/v26/JTUHjIg1_i6t8kCHKm4532VJOt5-QNFgpCuM73w5aXp-p7K4KLg.woff2',
    ];
    for (const url of urls) {
      try {
        const resp = await axios.get<ArrayBuffer>(url, { responseType: 'arraybuffer', timeout: 12_000 });
        await fs.writeFile(FONT_CACHE_PATH, Buffer.from(resp.data));
        console.log('[video] Font downloaded OK');
        return FONT_CACHE_PATH;
      } catch {
        continue;
      }
    }
    console.warn('[video] Font download failed — text overlays disabled');
    return null;
  }
}

// ── Pexels background ─────────────────────────────────────────

const BG_QUERIES: Record<string, string> = {
  plage:    'beach sea summer blue sky',
  ville:    'city urban night lights bokeh',
  montagne: 'mountain landscape scenic dramatic',
  desert:   'sahara desert sand dunes sunset',
  route:    'highway road trip asphalt speed',
  luxe:     'luxury hotel lifestyle premium',
  foret:    'forest nature green trees',
  coucher:  'sunset sky orange clouds golden',
  nuit:     'night sky stars dark atmosphere',
};

async function downloadPexelsBackground(keyword: string, destPath: string): Promise<boolean> {
  const apiKey = env.PEXELS_API_KEY;
  if (!apiKey) return false;
  const query = BG_QUERIES[keyword.toLowerCase()] ?? keyword;
  try {
    const { data } = await axios.get('https://api.pexels.com/v1/search', {
      headers: { Authorization: apiKey },
      params: { query, per_page: 5, orientation: 'portrait' },
      timeout: 10_000,
    });
    const photos: Array<{ src: { portrait: string; large2x: string } }> = data.photos ?? [];
    if (photos.length === 0) return false;
    const photo = photos[Math.floor(Math.random() * photos.length)];
    const imageUrl = photo.src.portrait || photo.src.large2x;
    const imgResp = await axios.get<ArrayBuffer>(imageUrl, { responseType: 'arraybuffer', timeout: 20_000 });
    await fs.writeFile(destPath, Buffer.from(imgResp.data));
    return true;
  } catch (err) {
    console.warn('[video] Pexels bg failed:', err instanceof Error ? err.message : err);
    return false;
  }
}

// ── Durée audio via ffprobe ───────────────────────────────────

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

// ── Text sanitizer pour drawtext ─────────────────────────────

function dt(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/:/g, '\\:')
    .replace(/[[\]{}%]/g, '');
}

// ── Encodeur FFmpeg avancé ────────────────────────────────────

function buildVideoAdvanced(params: {
  carImagePath:   string;
  audioPath:      string | null;
  outputPath:     string;
  backgroundPath?: string;
  fontPath:       string | null;
  carName:        string;
  priceText:      string;
  duration:       number;
}): Promise<void> {
  const { carImagePath, audioPath, outputPath, backgroundPath, fontPath, carName, priceText, duration } = params;

  return new Promise((resolve, reject) => {
    const bin = ffmpegPath as string | null;
    if (!bin) { reject(new Error('ffmpeg-static not found')); return; }

    const frames       = Math.max(Math.ceil(duration * 25), 50);
    const fadeOutStart = Math.max(duration - 0.8, 0.5).toFixed(2);
    const hasFont      = Boolean(fontPath);
    const fp           = fontPath ? `'${fontPath}'` : '';

    const nameText  = dt(carName);
    const priceT    = dt(priceText);
    const ctaText   = dt('Fik Conciergerie - Reservez');

    // Text overlay filters (only if font available)
    const textF = hasFont ? [
      `drawtext=fontfile=${fp}:text='${nameText}':fontsize=50:fontcolor=white:x=(w-tw)/2:y=55:shadowx=3:shadowy=3:shadowcolor=black@0.85`,
      `drawtext=fontfile=${fp}:text='${priceT}':fontsize=82:fontcolor=FFD700:x=(w-tw)/2:y=120:shadowx=5:shadowy=5:shadowcolor=black@0.85`,
      `drawtext=fontfile=${fp}:text='${ctaText}':fontsize=30:fontcolor=white@0.92:x=(w-tw)/2:y=h-80:borderw=2:bordercolor=black@0.6`,
    ].join(',') : '';

    const args: string[] = ['-y'];

    if (backgroundPath) {
      // ── Mode fond + voiture superposée ─────────────────────
      args.push('-loop', '1', '-i', backgroundPath);  // [0] fond
      args.push('-loop', '1', '-i', carImagePath);     // [1] voiture
      if (audioPath) args.push('-i', audioPath);        // [2] audio

      const bgFilters = [
        `[0:v]scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280`,
        `zoompan=z='min(zoom+0.0003,1.06)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=720x1280:fps=25`,
        `eq=saturation=1.15:contrast=1.05[bg]`,
      ].join(',');

      const carFilters = [
        `[1:v]scale=640:-1`,
        `eq=saturation=1.6:contrast=1.2:brightness=0.06[car]`,
      ].join(',');

      const overlayFilter = `[bg][car]overlay=(W-w)/2:(H-h)*0.42[ov]`;

      const finalFilters = [
        `[ov]vignette=angle=PI/5`,
        hasFont ? textF : '',
        `fade=t=in:st=0:d=0.5`,
        `fade=t=out:st=${fadeOutStart}:d=0.7[vout]`,
      ].filter(Boolean).join(',');

      args.push('-filter_complex', `${bgFilters};${carFilters};${overlayFilter};${finalFilters}`);
      args.push('-map', '[vout]');
      if (audioPath) {
        args.push('-map', '2:a', '-c:a', 'aac', '-b:a', '128k', '-shortest');
      } else {
        args.push('-t', String(duration));
      }
    } else {
      // ── Mode voiture plein écran + Ken Burns ───────────────
      args.push('-loop', '1', '-i', carImagePath);
      if (audioPath) args.push('-i', audioPath);

      const videoFilters = [
        `[0:v]scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280`,
        `zoompan=z='min(zoom+0.0009,1.18)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=720x1280:fps=25`,
        `eq=saturation=1.55:contrast=1.14:brightness=0.05:gamma=1.08`,
        `vignette=angle=PI/5`,
        hasFont ? textF : '',
        `fade=t=in:st=0:d=0.5`,
        `fade=t=out:st=${fadeOutStart}:d=0.7[vout]`,
      ].filter(Boolean).join(',');

      args.push('-filter_complex', videoFilters);
      args.push('-map', '[vout]');
      if (audioPath) {
        args.push('-map', '1:a', '-c:a', 'aac', '-b:a', '128k', '-shortest');
      } else {
        args.push('-t', String(duration));
      }
    }

    args.push(
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-pix_fmt', 'yuv420p',
      '-r', '25',
      '-movflags', '+faststart',
      outputPath,
    );

    console.log('[video] FFmpeg args:', args.join(' ').slice(0, 300));

    const proc = spawn(bin, args, { stdio: 'pipe' });
    let stderr = '';
    proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });
    proc.on('close', code => {
      if (code === 0) resolve();
      else {
        console.error('[video] FFmpeg stderr:', stderr.slice(-600));
        reject(new Error(`ffmpeg exit ${code}: ${stderr.slice(-300)}`));
      }
    });
    proc.on('error', reject);
  });
}

// ── Fallback simple (sans Ken Burns) ─────────────────────────

function buildVideoSimple(
  carImagePath: string,
  audioPath: string | null,
  outputPath: string,
  backgroundPath?: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const bin = ffmpegPath as string | null;
    if (!bin) { reject(new Error('ffmpeg-static not found')); return; }

    const args: string[] = ['-y'];

    if (backgroundPath) {
      args.push('-loop', '1', '-i', backgroundPath);
      args.push('-loop', '1', '-i', carImagePath);
      if (audioPath) args.push('-i', audioPath);
      const filter = [
        '[0:v]scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280[bg]',
        '[1:v]scale=620:465[car]',
        '[bg][car]overlay=(720-620)/2:((1280-465)/2)[out]',
      ].join(';');
      args.push('-filter_complex', filter, '-map', '[out]');
      if (audioPath) args.push('-map', '2:a', '-c:a', 'aac', '-b:a', '128k', '-shortest');
      else args.push('-t', '20');
    } else {
      args.push('-loop', '1', '-i', carImagePath);
      if (audioPath) args.push('-i', audioPath);
      args.push('-vf', 'scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,eq=saturation=1.4:contrast=1.1');
      if (audioPath) args.push('-c:a', 'aac', '-b:a', '128k', '-shortest');
      else args.push('-t', '20');
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

// ── Main: createMarketingVideo ────────────────────────────────

export async function createMarketingVideo(
  car: Car,
  idea: VideoIdea,
  options?: VideoOptions,
): Promise<VideoResult> {
  const tmpDir    = await fs.mkdtemp(path.join(os.tmpdir(), 'dzaryx-mkt-'));
  const imagePath = path.join(tmpDir, 'car.jpg');
  const audioPath = path.join(tmpDir, 'voice.mp3');
  const bgPath    = path.join(tmpDir, 'background.jpg');
  const videoPath = path.join(tmpDir, 'output.mp4');

  try {
    // 1. Télécharger image voiture
    const imgResp = await axios.get<ArrayBuffer>(car.image_url, { responseType: 'arraybuffer', timeout: 15_000 });
    await fs.writeFile(imagePath, Buffer.from(imgResp.data));

    // 2. Voix ElevenLabs
    const script = options?.customScript ?? idea.voiceover_script;
    const audioBuffer = await synthesizeVoice(script).catch(() => null);
    let hasAudio = false;
    if (audioBuffer && audioBuffer.length > 0) {
      await fs.writeFile(audioPath, audioBuffer);
      hasAudio = true;
    }

    // 3. Fond Pexels (optionnel)
    let hasBackground = false;
    if (options?.backgroundEffect) {
      hasBackground = await downloadPexelsBackground(options.backgroundEffect, bgPath);
    }

    // 4. Font pour text overlays
    const fontPath = await ensureFont();

    // 5. Durée audio
    const bin = ffmpegPath as string;
    const duration = hasAudio ? await getAudioDuration(bin, audioPath) + 0.8 : 22;

    // 6. Prix affiché sur la vidéo
    const priceText = car.resale_price ? `${car.resale_price}EUR/jour` : `${car.base_price.toLocaleString()} DZD/j`;

    // 7. Encodage avancé (Ken Burns + color + text + fade)
    try {
      await buildVideoAdvanced({
        carImagePath:   imagePath,
        audioPath:      hasAudio ? audioPath : null,
        outputPath:     videoPath,
        backgroundPath: hasBackground ? bgPath : undefined,
        fontPath,
        carName:        car.name,
        priceText,
        duration,
      });
      console.log('[video] ✅ Advanced video built');
    } catch (advErr) {
      // Fallback au mode simple si le mode avancé échoue
      console.warn('[video] Advanced failed, fallback simple:', advErr instanceof Error ? advErr.message : advErr);
      await buildVideoSimple(imagePath, hasAudio ? audioPath : null, videoPath, hasBackground ? bgPath : undefined);
      console.log('[video] ✅ Simple fallback video built');
    }

    const buffer = await fs.readFile(videoPath);
    return {
      buffer,
      caption:  idea.caption,
      hashtags: idea.hashtags,
      car_name: car.name,
      script,
    };
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

// ── Merge multiple videos ─────────────────────────────────────

function normalizeVideo(bin: string, inputPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = [
      '-y',
      '-i', inputPath,
      '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo',
      '-filter_complex',
      '[0:v]scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,fps=25,setsar=1[vn];' +
      '[0:a][1:a]amix=inputs=2:dropout_transition=0[an]',
      '-map', '[vn]',
      '-map', '[an]',
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-movflags', '+faststart',
      outputPath,
    ];
    const proc = spawn(bin, args, { stdio: 'pipe' });
    let stderr = '';
    proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });
    proc.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`normalize failed ${code}: ${stderr.slice(-200)}`));
    });
    proc.on('error', reject);
  });
}

export async function mergeVideos(videoBuffers: Buffer[]): Promise<Buffer> {
  const bin = ffmpegPath as string | null;
  if (!bin) throw new Error('ffmpeg-static not found');
  if (videoBuffers.length < 2) throw new Error('Au moins 2 vidéos requises');

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dzaryx-merge-'));

  try {
    const rawPaths: string[] = [];
    for (let i = 0; i < videoBuffers.length; i++) {
      const p = path.join(tmpDir, `raw_${i}.mp4`);
      await fs.writeFile(p, videoBuffers[i]);
      rawPaths.push(p);
    }

    const normPaths: string[] = [];
    for (let i = 0; i < rawPaths.length; i++) {
      const np = path.join(tmpDir, `norm_${i}.mp4`);
      await normalizeVideo(bin, rawPaths[i], np);
      normPaths.push(np);
    }

    const listPath = path.join(tmpDir, 'list.txt');
    await fs.writeFile(listPath, normPaths.map(p => `file '${p}'`).join('\n'));

    const outputPath = path.join(tmpDir, 'merged.mp4');
    await new Promise<void>((resolve, reject) => {
      const args = ['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', '-movflags', '+faststart', outputPath];
      const proc = spawn(bin, args, { stdio: 'pipe' });
      let stderr = '';
      proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });
      proc.on('close', code => {
        if (code === 0) resolve();
        else reject(new Error(`concat failed ${code}: ${stderr.slice(-300)}`));
      });
      proc.on('error', reject);
    });

    return await fs.readFile(outputPath);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}
