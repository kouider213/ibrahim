import axios from 'axios';
import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
// @ts-ignore — ffmpeg-static has no bundled type declarations
import ffmpegPath from 'ffmpeg-static';
import { v2 as cloudinary } from 'cloudinary';
import { env } from '../config/env.js';
import { synthesizeVoice } from '../notifications/dispatcher.js';
import type { VideoIdea } from './market-research.js';
import type { Car } from '../integrations/supabase.js';

cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME ?? '',
  api_key:    env.CLOUDINARY_API_KEY    ?? '',
  api_secret: env.CLOUDINARY_API_SECRET ?? '',
  secure: true,
});

export interface VideoResult {
  video_url:        string;
  buffer:           Buffer;
  caption:          string;
  hashtags:         string[];
  car_name:         string;
  script:           string;
}

function buildVideo(
  imagePath: string,
  audioPath: string | null,
  outputPath: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const bin: string | null = ffmpegPath as string | null;
    if (!bin) { reject(new Error('ffmpeg-static binary not found')); return; }

    const args: string[] = ['-y', '-loop', '1', '-i', imagePath];
    if (audioPath) args.push('-i', audioPath);

    args.push(
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-pix_fmt', 'yuv420p',
      '-vf', 'scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280',
      '-r', '25',
    );

    if (audioPath) {
      args.push('-c:a', 'aac', '-b:a', '128k', '-shortest');
    } else {
      args.push('-t', '20');
    }

    args.push('-movflags', '+faststart', outputPath);

    const proc = spawn(bin, args, { stdio: 'pipe' });
    let stderr = '';
    proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });
    proc.on('close', (code: number | null) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-300)}`));
    });
    proc.on('error', (err: Error) => reject(err));
  });
}

export async function createMarketingVideo(car: Car, idea: VideoIdea): Promise<VideoResult> {
  const tmpDir    = await fs.mkdtemp(path.join(os.tmpdir(), 'dzaryx-mkt-'));
  const imagePath = path.join(tmpDir, 'car.jpg');
  const audioPath = path.join(tmpDir, 'voice.mp3');
  const videoPath = path.join(tmpDir, 'output.mp4');

  try {
    // 1. Download car image
    const imgResp = await axios.get<ArrayBuffer>(car.image_url, {
      responseType: 'arraybuffer',
      timeout: 15_000,
    });
    await fs.writeFile(imagePath, Buffer.from(imgResp.data));

    // 2. Generate ElevenLabs voiceover
    const audioBuffer = await synthesizeVoice(idea.voiceover_script).catch(() => null);
    let hasAudio = false;
    if (audioBuffer && audioBuffer.length > 0) {
      await fs.writeFile(audioPath, audioBuffer);
      hasAudio = true;
    }

    // 3. Encode MP4 (image + audio via -shortest, or 20s silent)
    await buildVideo(imagePath, hasAudio ? audioPath : null, videoPath);

    // 4. Read buffer
    const buffer = await fs.readFile(videoPath);

    // 5. Upload to Cloudinary → get persistent URL
    const cloudUrl = await new Promise<string>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { resource_type: 'video', folder: 'dzaryx-marketing', format: 'mp4' },
        (err, result) => err ? reject(err) : resolve(result!.secure_url),
      );
      stream.end(buffer);
    });

    return {
      video_url: cloudUrl,
      buffer,
      caption:  idea.caption,
      hashtags: idea.hashtags,
      car_name: car.name,
      script:   idea.voiceover_script,
    };
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}
