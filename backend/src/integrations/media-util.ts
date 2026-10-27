// Petits outils image/vidéo partagés (mémoire photo, anti-arnaque, état des lieux vidéo) : ffmpeg + vision Claude.
import { spawn } from 'child_process';
import { existsSync } from 'fs';
// @ts-ignore — ffmpeg-static n'a pas de types
import ffmpegStatic from 'ffmpeg-static';
import { createAnthropic, CLAUDE_FAST, CLAUDE_MAIN, QUALITY } from './anthropic-compat.js';

const anthropic = createAnthropic();
const bin = (): string => (ffmpegStatic as string | null) && existsSync(ffmpegStatic as string) ? ffmpegStatic as string : 'ffmpeg';

/** Lance ffmpeg (entrée optionnelle sur stdin) et renvoie stdout. */
export function ffmpeg(args: string[], input?: Buffer, timeoutMs = 120_000): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const p = spawn(bin(), ['-hide_banner', '-loglevel', 'error', ...args]);
    const out: Buffer[] = [];
    let err = '';
    const t = setTimeout(() => { p.kill('SIGKILL'); reject(new Error('ffmpeg trop long')); }, timeoutMs);
    p.stdout.on('data', d => out.push(d as Buffer));
    p.stderr.on('data', d => { err += String(d); });
    p.on('error', e => { clearTimeout(t); reject(e); });
    p.on('close', code => { clearTimeout(t); code === 0 ? resolve(Buffer.concat(out)) : reject(new Error(`ffmpeg ${code}: ${err.slice(0, 200)}`)); });
    p.stdin.on('error', () => { /* ffmpeg a fermé l'entrée avant la fin */ });
    if (input) p.stdin.end(input); else p.stdin.end();
  });
}

/** Empreinte visuelle 64 bits (moyenne 8×8 en gris) : deux captures quasi identiques → peu de bits différents. */
export async function imageHash(base64: string): Promise<string> {
  const px = await ffmpeg(['-i', 'pipe:0', '-vf', 'scale=8:8:flags=area,format=gray', '-frames:v', '1', '-f', 'rawvideo', 'pipe:1'], Buffer.from(base64, 'base64'), 20_000);
  if (px.length < 64) throw new Error('empreinte illisible');
  const avg = px.subarray(0, 64).reduce((a, b) => a + b, 0) / 64;
  let bits = '';
  for (let i = 0; i < 64; i++) bits += px[i] >= avg ? '1' : '0';
  return BigInt(`0b${bits}`).toString(16).padStart(16, '0');
}

export function hashDistance(a: string, b: string): number {
  let x = BigInt(`0x${a}`) ^ BigInt(`0x${b}`), n = 0;
  while (x) { n += Number(x & 1n); x >>= 1n; }
  return n;
}

export type Img = { base64: string; mime: string };

/** Vision Claude → texte (JSON demandé dans le prompt). quality = Sonnet, sinon Haiku. Secours gratuit via compatFetch. */
export async function vision(images: Img[], prompt: string, opts: { quality?: boolean; system?: string; maxTokens?: number } = {}): Promise<string> {
  const content = [
    ...images.map(i => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: (/png|webp|gif/.test(i.mime) ? i.mime : 'image/jpeg') as 'image/jpeg', data: i.base64 } })),
    { type: 'text' as const, text: prompt },
  ];
  const r = await anthropic.messages.create({
    model: opts.quality ? CLAUDE_MAIN : CLAUDE_FAST, max_tokens: opts.maxTokens ?? 900,
    ...(opts.system ? { system: opts.system } : {}),
    messages: [{ role: 'user', content }],
  }, opts.quality ? QUALITY : undefined);
  return r.content.map(b => (b.type === 'text' ? b.text : '')).join('').trim();
}

export function jsonOf<T>(text: string): T | null {
  const a = text.indexOf('{'), z = text.lastIndexOf('}');
  if (a < 0 || z <= a) return null;
  try { return JSON.parse(text.slice(a, z + 1)) as T; } catch { return null; }
}

export const normText = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
