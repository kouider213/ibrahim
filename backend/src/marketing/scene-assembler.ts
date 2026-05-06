/**
 * scene-assembler.ts
 * ──────────────────────────────────────────────────────────────────────────────
 * Multi-scene video assembly engine for Fik Conciergerie marketing videos.
 *
 * Car scenes  → Runway Gen-4 Turbo / Kling 1.6 (photorealistic AI video)
 * UI scenes   → FFmpeg synthetic  (phone, WhatsApp, TikTok, CTA)
 *               Instant generation, text always readable, zero AI cost.
 * Assembly    → FFmpeg concat + text overlays + voice + optional music
 * ──────────────────────────────────────────────────────────────────────────────
 */

import axios from 'axios';
import { spawn } from 'child_process';
import * as fs   from 'fs/promises';
import * as path from 'path';
import * as os   from 'os';
// @ts-ignore
import ffmpegPath from 'ffmpeg-static';
import { mergeVideoWithAudio } from './create-marketing-video.js';

const W   = 1080;
const H   = 1920;
const FPS = 25;

const FONT_URL   = 'https://github.com/google/fonts/raw/main/ofl/montserrat/static/Montserrat-Bold.ttf';
const FONT_CACHE = path.join(os.tmpdir(), 'dzaryx-scene-font.ttf');

const SYSTEM_FONT_PATHS = [
  '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
  '/usr/share/fonts/liberation/LiberationSans-Bold.ttf',
  '/usr/share/fonts/truetype/freefont/FreeSansBold.ttf',
  '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
  '/usr/share/fonts/truetype/ubuntu/Ubuntu-B.ttf',
  '/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf',
];

// ── Types ─────────────────────────────────────────────────────────────────────

export type SceneType =
  | 'car_reveal'       // cinematic car reveal — Runway/Kling
  | 'car_drive'        // car driving — Runway/Kling
  | 'car_airport'      // car at airport — Runway/Kling
  | 'ui_phone_search'  // iOS-style search — FFmpeg
  | 'ui_whatsapp'      // WhatsApp chat — FFmpeg
  | 'ui_tiktok'        // TikTok feed — FFmpeg
  | 'ui_problem'       // frustration text — FFmpeg
  | 'ui_cta';          // call-to-action — FFmpeg

export interface SceneSpec {
  type:         SceneType;
  label:        string;       // "Hook", "Galère", "Découverte", "WhatsApp", "CTA"
  duration:     number;       // seconds
  overlayText?: string;       // bottom text caption on car scenes
  prompt?:      string;       // override Runway/Kling prompt for this scene
  ui_title?:    string;       // search bar text (ui_phone_search)
  ui_lines?:    string[];     // text lines / chat lines shown on UI scenes
  ui_color?:    string;       // background hex for ui_problem / ui_cta
}

// ── Font helper ───────────────────────────────────────────────────────────────

export async function ensureSceneFont(): Promise<string | null> {
  // 1. Try cached downloaded font
  try {
    await fs.access(FONT_CACHE);
    console.log('[scene-assembler] Font: using cached', FONT_CACHE);
    return FONT_CACHE;
  } catch { /* not cached yet */ }

  // 2. Try to download Montserrat Bold
  try {
    const { data } = await axios.get<ArrayBuffer>(FONT_URL, {
      responseType: 'arraybuffer', timeout: 15_000,
    });
    await fs.writeFile(FONT_CACHE, Buffer.from(data));
    console.log('[scene-assembler] Font: downloaded Montserrat →', FONT_CACHE);
    return FONT_CACHE;
  } catch (err: any) {
    console.warn('[scene-assembler] Font download failed:', err.message);
  }

  // 3. Try system fonts (available on most Linux servers including Railway)
  for (const fp of SYSTEM_FONT_PATHS) {
    try {
      await fs.access(fp);
      console.log('[scene-assembler] Font: using system font', fp);
      return fp;
    } catch { /* not found */ }
  }

  console.warn('[scene-assembler] No font found — drawtext will use FFmpeg default');
  return null;
}

// ── FFmpeg capability probe ───────────────────────────────────────────────────

type FFmpegCaps = { drawtext: boolean; roundedBox: boolean };
let _capsCache: FFmpegCaps | null = null;

export async function probeFFmpegCaps(fontPath: string | null): Promise<FFmpegCaps> {
  if (_capsCache) return _capsCache;
  const bin = ffmpegPath as string | null;
  if (!bin) {
    _capsCache = { drawtext: false, roundedBox: false };
    console.warn('[scene-assembler] ffmpeg-static binary not found');
    return _capsCache;
  }

  const probe = (vf: string): Promise<boolean> => new Promise(resolve => {
    const p = spawn(bin, [
      '-y', '-f', 'lavfi', '-i', `color=c=black:s=64x64:r=1:d=0.04`,
      '-vf', vf, '-frames:v', '1', '-f', 'null', '-',
    ], { stdio: 'pipe' });
    let ok = false;
    p.on('close', code => { ok = code === 0; resolve(ok); });
    p.on('error', () => resolve(false));
  });

  const dtVf = fontPath
    ? `drawtext=fontfile='${fontPath}'\\:text='ok'\\:fontsize=10\\:fontcolor=white`
    : `drawtext=text='ok':fontsize=10:fontcolor=white`;

  const [drawtext, roundedBox] = await Promise.all([
    probe(dtVf),
    probe('drawbox=x=5:y=5:w=20:h=20:color=white:t=fill:r=4'),
  ]);

  _capsCache = { drawtext, roundedBox };
  console.log(`[scene-assembler] FFmpeg caps: drawtext=${drawtext} roundedBox=${roundedBox} font=${fontPath ?? 'none'}`);
  return _capsCache;
}

// ── Text escape for FFmpeg drawtext ──────────────────────────────────────────

function esc(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/'/g,  "\\'")
    .replace(/:/g,  '\\:')
    .replace(/[[\]{}%!,]/g, '')
    .replace(/[éèêë]/g, 'e').replace(/[àâä]/g, 'a')
    .replace(/[ùûü]/g,  'u').replace(/[ôö]/g,  'o')
    .replace(/[îï]/g,   'i').replace(/ç/g,     'c')
    .replace(/[ÉÈÊ]/g,  'E').replace(/[ÀÂ]/g,  'A')
    .replace(/[ÙÛ]/g,   'U').replace(/Ô/g,     'O')
    .replace(/Î/g,      'I').replace(/Ç/g,     'C')
    .slice(0, 85);
}

function dt(text: string, fontPath: string | null, extra = ''): string {
  const fp = fontPath ? `fontfile='${fontPath}':` : '';
  return `drawtext=${fp}text='${esc(text)}':${extra}`;
}

// ── FFmpeg spawn helper ───────────────────────────────────────────────────────

function runFFmpeg(args: string[]): Promise<void> {
  const bin = ffmpegPath as string | null;
  if (!bin) throw new Error('ffmpeg-static binary not found');
  console.log('[scene-assembler] ffmpeg', args.slice(0, 6).join(' '), '...');
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args, { stdio: 'pipe' });
    let stderr = '';
    proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });
    proc.on('close', code => {
      if (code === 0) {
        resolve();
      } else {
        console.error('[scene-assembler] ffmpeg error:', stderr.slice(-600));
        reject(new Error(`ffmpeg exit ${code}: ${stderr.slice(-400)}`));
      }
    });
    proc.on('error', (err) => {
      console.error('[scene-assembler] ffmpeg spawn error:', err.message);
      reject(err);
    });
  });
}

const BASE_OUT_ARGS = [
  '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '26',
  '-pix_fmt', 'yuv420p', '-r', String(FPS), '-movflags', '+faststart',
];

// ── UI Scene: Phone Search ────────────────────────────────────────────────────

async function genPhoneSearch(
  spec: SceneSpec, out: string, fp: string | null,
): Promise<void> {
  const title = esc(spec.ui_title ?? 'location voiture oran');
  const lines = (spec.ui_lines ?? [
    'location voiture oran',
    'location oran aeroport',
    'voiture oran sans caution',
    'location pas cher oran',
    'fik conciergerie oran',
  ]).slice(0, 5);

  const vf: string[] = [
    // Search bar
    `drawbox=x=60:y=90:w=960:h=110:color=0x2c2c2e:t=fill`,
    dt(title, fp, `fontsize=42:fontcolor=0x8e8e93:x=110:y=132`),
    // Magnifier icon placeholder
    `drawbox=x=80:y=120:w=28:h=28:color=0x8e8e93:t=fill`,
    // Results list
    ...lines.flatMap((l, i) => {
      const y = 260 + i * 105;
      return [
        dt(l, fp, `fontsize=44:fontcolor=white:x=90:y=${y}`),
        `drawbox=x=0:y=${y + 82}:w=${W}:h=1:color=0x2c2c2e:t=fill`,
      ];
    }),
  ];

  await runFFmpeg([
    '-y', '-f', 'lavfi', '-i', `color=c=0x1c1c1e:s=${W}x${H}:r=${FPS}`,
    '-t', String(spec.duration), '-vf', vf.join(','),
    ...BASE_OUT_ARGS, out,
  ]);
}

// ── UI Scene: WhatsApp ────────────────────────────────────────────────────────

async function genWhatsApp(
  spec: SceneSpec, out: string, fp: string | null,
): Promise<void> {
  const all   = spec.ui_lines ?? [
    'Bonjour avez-vous une voiture',
    'disponible ce weekend ?',
    '|||',
    'Oui bien sur ! Quelle date ?',
    'Reponse sous 5 min garantie',
  ];
  const sep   = all.indexOf('|||');
  const client = sep > 0 ? all.slice(0, sep) : all.slice(0, 2);
  const agent  = sep > 0 ? all.slice(sep + 1) : all.slice(2, 4);

  const cH  = 40 + client.length * 65;
  const aH  = 40 + agent.length  * 65;
  const cY  = 210;
  const aY  = cY + cH + 50;

  const vf: string[] = [
    // Header
    `drawbox=x=0:y=0:w=${W}:h=170:color=0x075e54:t=fill`,
    `drawbox=x=60:y=50:w=110:h=110:color=0x128c7e:t=fill`,
    dt('Fik Conciergerie', fp, `fontsize=48:fontcolor=white:x=200:y=58`),
    dt('En ligne', fp, `fontsize=34:fontcolor=0x9de0d4:x=200:y=118`),
    // Background
    `drawbox=x=0:y=170:w=${W}:h=${H - 170}:color=0xece5dd:t=fill`,
    // Client bubble
    `drawbox=x=50:y=${cY}:w=720:h=${cH}:color=white:t=fill`,
    ...client.map((l, i) =>
      dt(l, fp, `fontsize=36:fontcolor=0x303030:x=78:y=${cY + 20 + i * 65}`)
    ),
    // Agent bubble
    `drawbox=x=${W - 770}:y=${aY}:w=720:h=${aH}:color=0xdcf8c6:t=fill`,
    ...agent.map((l, i) =>
      dt(l, fp, `fontsize=36:fontcolor=0x303030:x=${W - 742}:y=${aY + 20 + i * 65}`)
    ),
    // Read tick
    dt('Lu ✓✓', fp, `fontsize=28:fontcolor=0x53bdeb:x=${W - 200}:y=${aY + aH + 8}`),
  ];

  await runFFmpeg([
    '-y', '-f', 'lavfi', '-i', `color=c=0xece5dd:s=${W}x${H}:r=${FPS}`,
    '-t', String(spec.duration), '-vf', vf.join(','),
    ...BASE_OUT_ARGS, out,
  ]);
}

// ── UI Scene: TikTok feed ─────────────────────────────────────────────────────

async function genTikTok(
  spec: SceneSpec, out: string, fp: string | null,
): Promise<void> {
  const query = esc(spec.ui_title ?? 'location voiture oran');
  const lines = (spec.ui_lines ?? [
    '@fikconcierge',
    'Location Voiture Oran',
    'Livraison Aeroport',
    'Reponse rapide WhatsApp',
  ]).map(esc);

  const vf: string[] = [
    // Top bar
    `drawbox=x=0:y=0:w=${W}:h=108:color=0x010101:t=fill`,
    dt(query, fp, `fontsize=46:fontcolor=white:x=80:y=42`),
    `drawbox=x=0:y=110:w=${W}:h=3:color=0x333333:t=fill`,
    // Video card
    `drawbox=x=0:y=113:w=${W}:h=${H - 113}:color=0x111111:t=fill`,
    // Right sidebar icons
    `drawbox=x=${W - 130}:y=400:w=100:h=100:color=0x222222:t=fill`,
    dt('Like', fp, `fontsize=28:fontcolor=0xaaaaaa:x=${W - 120}:y=515`),
    `drawbox=x=${W - 130}:y=560:w=100:h=100:color=0x222222:t=fill`,
    dt('Comm.', fp, `fontsize=28:fontcolor=0xaaaaaa:x=${W - 125}:y=675`),
    // Bottom info
    `drawbox=x=0:y=${H - 350}:w=${W}:h=350:color=0x000000@0.6:t=fill`,
    ...lines.map((l, i) => {
      const y     = H - 320 + i * 90;
      const color = i === 0 ? 'white' : (i < 2 ? 'white' : '0xaaaaaa');
      const fsize = i === 0 ? 52 : (i < 2 ? 42 : 38);
      return dt(l, fp, `fontsize=${fsize}:fontcolor=${color}:x=60:y=${y}`);
    }),
  ];

  await runFFmpeg([
    '-y', '-f', 'lavfi', '-i', `color=c=0x010101:s=${W}x${H}:r=${FPS}`,
    '-t', String(spec.duration), '-vf', vf.join(','),
    ...BASE_OUT_ARGS, out,
  ]);
}

// ── UI Scene: Problem (red text) ──────────────────────────────────────────────

async function genProblem(
  spec: SceneSpec, out: string, fp: string | null,
): Promise<void> {
  const lines = (spec.ui_lines ?? [
    'Personne ne repond.',
    'Prix trop eleves.',
    'Plus de disponibilite.',
    'Pas serieux.',
  ]).map(esc);

  const totalH = lines.length * 130;
  const startY = Math.floor((H - totalH) / 2);

  const vf: string[] = lines.map((l, i) =>
    dt(l, fp, `fontsize=60:fontcolor=0xff4444:x=(w-tw)/2:y=${startY + i * 130}:shadowcolor=black@0.8:shadowx=4:shadowy=4`)
  );

  await runFFmpeg([
    '-y', '-f', 'lavfi', '-i', `color=c=${spec.ui_color ?? '0x0d0d0d'}:s=${W}x${H}:r=${FPS}`,
    '-t', String(spec.duration), '-vf', vf.join(','),
    ...BASE_OUT_ARGS, out,
  ]);
}

// ── UI Scene: CTA ─────────────────────────────────────────────────────────────

async function genCTA(
  spec: SceneSpec, out: string, fp: string | null,
): Promise<void> {
  const lines  = (spec.ui_lines ?? [
    'FIK CONCIERGERIE',
    'Location Voiture Oran',
    'Livraison Aeroport',
    'WhatsApp +213 XX XX XX XX',
    'Reponse garantie',
  ]).map(esc);

  const yPos   = [370, 500, 600, 820, 940];
  const fSizes = [80,  52,  48,  52,  40];
  const colors = ['0xFFD700', 'white', 'white', '0x25D366', '0x25D366'];

  const vf: string[] = [
    // Gold line top
    `drawbox=x=80:y=300:w=${W - 160}:h=4:color=0xFFD700:t=fill`,
    ...lines.map((l, i) =>
      dt(l, fp, `fontsize=${fSizes[i] ?? 44}:fontcolor=${colors[i] ?? 'white'}:x=(w-tw)/2:y=${yPos[i] ?? (370 + i * 120)}:shadowcolor=black@0.7:shadowx=4:shadowy=4`)
    ),
    // Gold line bottom
    `drawbox=x=80:y=1030:w=${W - 160}:h=4:color=0xFFD700:t=fill`,
  ];

  await runFFmpeg([
    '-y', '-f', 'lavfi', '-i', `color=c=0x0a0a0a:s=${W}x${H}:r=${FPS}`,
    '-t', String(spec.duration), '-vf', vf.join(','),
    ...BASE_OUT_ARGS, out,
  ]);
}

// ── Plain background fallback (when drawtext is unavailable) ─────────────────

async function genPlainBg(spec: SceneSpec, outPath: string, roundedBox: boolean): Promise<void> {
  const bgColor =
    spec.type === 'ui_cta'         ? '0x0a0a0a' :
    spec.type === 'ui_problem'     ? '0x1a0000' :
    spec.type === 'ui_whatsapp'    ? '0xece5dd' :
    spec.type === 'ui_tiktok'      ? '0x010101' :
    '0x1c1c1e';

  const rb = roundedBox ? ':r=12' : '';
  const vf = [
    `drawbox=x=60:y=90:w=960:h=110:color=0x2c2c2e:t=fill${rb}`,
    `drawbox=x=60:y=260:w=960:h=3:color=0x444444:t=fill`,
    `drawbox=x=60:y=1700:w=960:h=80:color=0xFFD700:t=fill${rb}`,
  ].join(',');

  await runFFmpeg([
    '-y', '-f', 'lavfi', '-i', `color=c=${bgColor}:s=${W}x${H}:r=${FPS}`,
    '-t', String(spec.duration), '-vf', vf,
    ...BASE_OUT_ARGS, outPath,
  ]);
}

// ── Generate one UI scene to file ─────────────────────────────────────────────

export async function generateUISceneFile(
  spec: SceneSpec, outPath: string, fontPath: string | null,
): Promise<void> {
  const caps = await probeFFmpegCaps(fontPath);

  if (!caps.drawtext) {
    console.warn(`[scene-assembler] drawtext unavailable — plain bg for ${spec.type}`);
    return genPlainBg(spec, outPath, caps.roundedBox);
  }

  try {
    switch (spec.type) {
      case 'ui_phone_search': return await genPhoneSearch(spec, outPath, fontPath);
      case 'ui_whatsapp':     return await genWhatsApp(spec, outPath, fontPath);
      case 'ui_tiktok':       return await genTikTok(spec, outPath, fontPath);
      case 'ui_problem':      return await genProblem(spec, outPath, fontPath);
      case 'ui_cta':          return await genCTA(spec, outPath, fontPath);
      default:
        throw new Error(`Unknown UI scene type: ${(spec as SceneSpec).type}`);
    }
  } catch (err: any) {
    // drawtext may fail at runtime (font issue, filter not compiled) → degrade gracefully
    console.error(`[scene-assembler] UI scene ${spec.type} failed (${err.message}) — falling back to plain bg`);
    _capsCache = null; // reset caps so next call re-probes
    await genPlainBg(spec, outPath, caps.roundedBox);
  }
}

// ── Add text overlay caption to an existing car clip ─────────────────────────

export async function addOverlayToClip(
  inputBuffer: Buffer,
  overlayText: string,
  fontPath: string | null,
): Promise<Buffer> {
  const bin = ffmpegPath as string | null;
  if (!bin) return inputBuffer;

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dzaryx-ov-'));
  const inPath  = path.join(tmpDir, 'in.mp4');
  const outPath = path.join(tmpDir, 'out.mp4');
  try {
    await fs.writeFile(inPath, inputBuffer);
    const fp = fontPath ? `'${fontPath}'` : undefined;
    const t  = esc(overlayText);

    const vf = [
      `drawbox=x=0:y=h-190:w=w:h=190:color=black@0.65:t=fill`,
      fp
        ? `drawtext=fontfile=${fp}:text='${t}':fontsize=54:fontcolor=white:x=(w-tw)/2:y=h-140:shadowcolor=black@0.9:shadowx=3:shadowy=3`
        : `drawtext=text='${t}':fontsize=54:fontcolor=white:x=(w-tw)/2:y=h-140`,
    ].join(',');

    await runFFmpeg([
      '-y', '-i', inPath, '-vf', vf,
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '22',
      '-c:a', 'copy', '-movflags', '+faststart', outPath,
    ]);
    return await fs.readFile(outPath);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

// ── Concat scene buffers into one video with voice ────────────────────────────

export async function concatScenesWithVoice(
  scenePaths: string[],
  voiceBuffer: Buffer | null,
  tmpDir: string,
): Promise<Buffer> {
  if (scenePaths.length === 0) throw new Error('No scene files to concat');

  // Single scene — skip concat, just merge audio
  if (scenePaths.length === 1) {
    const buf = await fs.readFile(scenePaths[0]);
    return voiceBuffer ? mergeVideoWithAudio(buf, voiceBuffer) : buf;
  }

  const listPath   = path.join(tmpDir, 'concat.txt');
  const concatPath = path.join(tmpDir, 'concat_raw.mp4');
  const finalPath  = path.join(tmpDir, 'final.mp4');

  // Normalise each scene to same dimensions + fps before concat
  const normPaths: string[] = [];
  for (let i = 0; i < scenePaths.length; i++) {
    const normPath = path.join(tmpDir, `norm_${i}.mp4`);
    await runFFmpeg([
      '-y', '-i', scenePaths[i],
      '-vf', `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,setsar=1`,
      '-r', String(FPS), '-c:v', 'libx264', '-preset', 'ultrafast',
      '-crf', '26', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', normPath,
    ]);
    normPaths.push(normPath);
  }

  await fs.writeFile(listPath, normPaths.map(p => `file '${p}'`).join('\n'));

  await runFFmpeg([
    '-y', '-f', 'concat', '-safe', '0', '-i', listPath,
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '22',
    '-pix_fmt', 'yuv420p', '-r', String(FPS), '-movflags', '+faststart',
    concatPath,
  ]);

  if (!voiceBuffer) {
    return fs.readFile(concatPath);
  }

  // Merge with voice
  const voicePath = path.join(tmpDir, 'voice.mp3');
  await fs.writeFile(voicePath, voiceBuffer);

  await runFFmpeg([
    '-y', '-i', concatPath, '-i', voicePath,
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k', '-shortest',
    '-movflags', '+faststart', finalPath,
  ]);

  return fs.readFile(finalPath);
}
