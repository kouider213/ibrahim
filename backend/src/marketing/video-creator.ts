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
  backgroundEffect?: string; // plage, ville, montagne, desert, route, luxe
}

// ── Pexels background queries ─────────────────────────────────

const BG_QUERIES: Record<string, string> = {
  plage:    'beach sea summer sand',
  ville:    'city urban night lights',
  montagne: 'mountain landscape scenic',
  desert:   'sahara desert sand dunes',
  route:    'highway road trip driving',
  luxe:     'luxury hotel lifestyle',
  foret:    'forest nature green',
  coucher:  'sunset sky orange clouds',
  nuit:     'night sky stars dark',
};

async function downloadPexelsBackground(keyword: string, destPath: string): Promise<boolean> {
  const apiKey = env.PEXELS_API_KEY;
  if (!apiKey) return false;

  const query = BG_QUERIES[keyword.toLowerCase()] ?? keyword;

  try {
    const { data } = await axios.get('https://api.pexels.com/v1/search', {
      headers: { Authorization: apiKey },
      params: { query, per_page: 3, orientation: 'portrait' },
      timeout: 10_000,
    });

    const photos: Array<{ src: { portrait: string; large2x: string } }> = data.photos ?? [];
    if (photos.length === 0) return false;

    const photo = photos[Math.floor(Math.random() * photos.length)];
    const imageUrl = photo.src.portrait || photo.src.large2x;

    const imgResp = await axios.get<ArrayBuffer>(imageUrl, {
      responseType: 'arraybuffer',
      timeout: 20_000,
    });
    await fs.writeFile(destPath, Buffer.from(imgResp.data));
    return true;
  } catch (err) {
    console.warn('[video-creator] Pexels background failed:', err instanceof Error ? err.message : err);
    return false;
  }
}

// ── FFmpeg encoder ────────────────────────────────────────────

function buildVideo(
  carImagePath: string,
  audioPath: string | null,
  outputPath: string,
  backgroundPath?: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const bin = ffmpegPath as string | null;
    if (!bin) { reject(new Error('ffmpeg-static binary not found')); return; }

    const args: string[] = ['-y'];

    if (backgroundPath) {
      // Composition: background image + car overlay
      args.push('-loop', '1', '-i', backgroundPath);   // input 0
      args.push('-loop', '1', '-i', carImagePath);      // input 1
      if (audioPath) args.push('-i', audioPath);         // input 2

      const filter = [
        '[0:v]scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280[bg]',
        '[1:v]scale=620:465[car]',
        '[bg][car]overlay=(720-620)/2:((1280-465)/2)[out]',
      ].join(';');

      args.push('-filter_complex', filter, '-map', '[out]');
      if (audioPath) args.push('-map', '2:a', '-c:a', 'aac', '-b:a', '128k', '-shortest');
      else args.push('-t', '20');
    } else {
      // Simple: car image (full frame) + audio
      args.push('-loop', '1', '-i', carImagePath);
      if (audioPath) args.push('-i', audioPath);

      args.push('-vf', 'scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280');
      if (audioPath) args.push('-c:a', 'aac', '-b:a', '128k', '-shortest');
      else args.push('-t', '20');
    }

    args.push(
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-pix_fmt', 'yuv420p',
      '-r', '25',
      '-movflags', '+faststart',
      outputPath,
    );

    const proc = spawn(bin, args, { stdio: 'pipe' });
    let stderr = '';
    proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });
    proc.on('close', (code: number | null) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-300)}`));
    });
    proc.on('error', reject);
  });
}

// ── Main: create marketing video ─────────────────────────────

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
    // 1. Download car image
    const imgResp = await axios.get<ArrayBuffer>(car.image_url, {
      responseType: 'arraybuffer',
      timeout: 15_000,
    });
    await fs.writeFile(imagePath, Buffer.from(imgResp.data));

    // 2. ElevenLabs voiceover — French only
    const script = options?.customScript ?? idea.voiceover_script;
    const audioBuffer = await synthesizeVoice(script).catch(() => null);
    let hasAudio = false;
    if (audioBuffer && audioBuffer.length > 0) {
      await fs.writeFile(audioPath, audioBuffer);
      hasAudio = true;
    }

    // 3. Pexels background effect (optional)
    let hasBackground = false;
    if (options?.backgroundEffect) {
      hasBackground = await downloadPexelsBackground(options.backgroundEffect, bgPath);
    }

    // 4. Encode MP4
    await buildVideo(
      imagePath,
      hasAudio ? audioPath : null,
      videoPath,
      hasBackground ? bgPath : undefined,
    );

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
    proc.on('close', (code) => {
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

    // Normalize each video to same format
    const normPaths: string[] = [];
    for (let i = 0; i < rawPaths.length; i++) {
      const np = path.join(tmpDir, `norm_${i}.mp4`);
      await normalizeVideo(bin, rawPaths[i], np);
      normPaths.push(np);
    }

    // Write concat list and merge with stream copy
    const listPath = path.join(tmpDir, 'list.txt');
    await fs.writeFile(listPath, normPaths.map(p => `file '${p}'`).join('\n'));

    const outputPath = path.join(tmpDir, 'merged.mp4');
    await new Promise<void>((resolve, reject) => {
      const args = [
        '-y', '-f', 'concat', '-safe', '0', '-i', listPath,
        '-c', 'copy', '-movflags', '+faststart', outputPath,
      ];
      const proc = spawn(bin, args, { stdio: 'pipe' });
      let stderr = '';
      proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });
      proc.on('close', (code) => {
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
