import axios from 'axios';
import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { v2 as cloudinary } from 'cloudinary';
import { synthesizeVoice } from '../notifications/dispatcher.js';
import { env } from '../config/env.js';
import type { VideoIdea } from './market-research.js';
import type { Car } from '../integrations/supabase.js';

export interface VideoResult {
  video_url:        string;
  caption:          string;
  hashtags:         string[];
  car_name:         string;
  duration_seconds: number;
  script:           string;
}

// ── Configure Cloudinary ─────────────────────────────────────

function configCloudinary() {
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME ?? '',
    api_key:    env.CLOUDINARY_API_KEY    ?? '',
    api_secret: env.CLOUDINARY_API_SECRET ?? '',
    secure: true,
  });
}

// ── FFprobe: get audio duration ───────────────────────────────

function getAudioDuration(audioFile: string): Promise<number> {
  return new Promise(resolve => {
    const proc = spawn('ffprobe', [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      audioFile,
    ]);
    let out = '';
    proc.stdout.on('data', (d: { toString(): string }) => { out += d.toString(); });
    proc.on('close', () => {
      try {
        const info = JSON.parse(out) as { format?: { duration?: string } };
        resolve(parseFloat(info.format?.duration ?? '15'));
      } catch {
        resolve(15);
      }
    });
    proc.on('error', () => resolve(15));
  });
}

// ── FFmpeg: image + audio → TikTok vertical MP4 ──────────────

function buildVideoWithFFmpeg(
  imagePath: string,
  audioPath: string,
  outputPath: string,
  duration: number,
  brandText: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    // Scale image to fill 1080x1920 (9:16 TikTok), add brand text overlay
    const escaped = brandText.replace(/'/g, "\\'").replace(/:/g, '\\:');
    const drawtext = [
      `drawtext=text='${escaped}'`,
      `fontsize=52`,
      `fontcolor=white`,
      `x=(w-text_w)/2`,
      `y=h-120`,
      `box=1`,
      `boxcolor=black@0.55`,
      `boxborderw=14`,
    ].join(':');

    const vf = [
      'scale=1080:1920:force_original_aspect_ratio=increase',
      'crop=1080:1920',
      drawtext,
    ].join(',');

    const args = [
      '-y',
      '-loop', '1',
      '-i', imagePath,
      '-i', audioPath,
      '-c:v', 'libx264',
      '-t',   String(duration),
      '-pix_fmt', 'yuv420p',
      '-vf',  vf,
      '-c:a', 'aac',
      '-b:a', '128k',
      '-shortest',
      '-movflags', '+faststart',
      outputPath,
    ];

    const proc = spawn('ffmpeg', args, { stdio: 'pipe' });
    proc.on('close', (code: number | null) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}`));
    });
    proc.on('error', (err: Error) => {
      console.warn('[video-creator] ffmpeg not found, trying fallback:', err.message);
      reject(err);
    });
  });
}

// Fallback: image-only video (no audio, just for preview)
function buildImageOnlyVideoWithFFmpeg(
  imagePath: string,
  outputPath: string,
  duration: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = [
      '-y',
      '-loop', '1',
      '-i',   imagePath,
      '-c:v', 'libx264',
      '-t',   String(duration),
      '-pix_fmt', 'yuv420p',
      '-vf',  'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920',
      '-r',   '25',
      '-movflags', '+faststart',
      outputPath,
    ];
    const proc = spawn('ffmpeg', args, { stdio: 'pipe' });
    proc.on('close', (code: number | null) => { if (code === 0) resolve(); else reject(new Error(`ffmpeg ${code}`)); });
    proc.on('error', (err: Error) => reject(err));
  });
}

// ── Main: create full marketing video ────────────────────────

export async function createMarketingVideo(car: Car, idea: VideoIdea): Promise<VideoResult> {
  configCloudinary();
  const tmpDir     = await fs.mkdtemp(path.join(os.tmpdir(), 'dzaryx-mkt-'));
  const imagePath  = path.join(tmpDir, 'car.jpg');
  const audioPath  = path.join(tmpDir, 'voice.mp3');
  const videoPath  = path.join(tmpDir, 'output.mp4');

  try {
    // 1. Download car image
    const imgResponse = await axios.get<ArrayBuffer>(car.image_url, { responseType: 'arraybuffer', timeout: 15_000 });
    await fs.writeFile(imagePath, Buffer.from(imgResponse.data));

    // 2. Generate voiceover with ElevenLabs
    const audioBuffer = await synthesizeVoice(idea.voiceover_script);
    const hasAudio = audioBuffer !== null && audioBuffer.length > 0;
    if (hasAudio) {
      await fs.writeFile(audioPath, audioBuffer!);
    }

    // 3. Determine duration
    const duration = hasAudio
      ? Math.min(Math.max(await getAudioDuration(audioPath) + 1, 12), 60)
      : 20;

    // 4. Build video
    const brandLabel = `Fik Conciergerie Oran — ${car.base_price.toLocaleString()} DZD/j`;
    try {
      if (hasAudio) {
        await buildVideoWithFFmpeg(imagePath, audioPath, videoPath, duration, brandLabel);
      } else {
        await buildImageOnlyVideoWithFFmpeg(imagePath, videoPath, duration);
      }
    } catch {
      // ffmpeg not available — upload image directly and return image URL with audio separately
      const imgUpload = await cloudinary.uploader.upload(imagePath, {
        folder:    'dzaryx-marketing',
        public_id: `tiktok_img_${Date.now()}`,
      });
      return {
        video_url:        imgUpload.secure_url,
        caption:          idea.caption,
        hashtags:         idea.hashtags,
        car_name:         car.name,
        duration_seconds: 0,
        script:           idea.voiceover_script,
      };
    }

    // 5. Upload video to Cloudinary
    const upload = await cloudinary.uploader.upload(videoPath, {
      resource_type: 'video',
      folder:        'dzaryx-marketing',
      public_id:     `tiktok_${Date.now()}`,
    });

    return {
      video_url:        upload.secure_url,
      caption:          idea.caption,
      hashtags:         idea.hashtags,
      car_name:         car.name,
      duration_seconds: duration,
      script:           idea.voiceover_script,
    };
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}
