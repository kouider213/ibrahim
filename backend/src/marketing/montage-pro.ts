/**
 * montage-pro.ts — MONTAGE PRO (façon CapCut, 100 % gratuit et illimité)
 * ─────────────────────────────────────────────────────────────────────────────
 * Kouider donne SES rushes (vidéos + photos du téléphone) et dit ce qu'il veut en une phrase.
 * Dzaryx : transcription mot à mot (Groq Whisper, gratuit) → coupe les silences (jump cuts) → zooms
 * « punch-in » → recadrage 9:16 / 1:1 / 16:9 (fond flouté si besoin) → look couleur → sous-titres
 * animés → voix off écrite par Dzaryx si les rushes sont muets → musique (la sienne) baissée sous la
 * voix → signature FIK → Supabase + Telegram + page MONTAGE.
 * Réponses aux avis CapCut : jamais de filigrane, rien de payant, export toujours possible,
 * ses vidéos restent chez lui (stockage FIK), pas de limite.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import axios from 'axios';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { randomUUID } from 'crypto';

import { env } from '../config/env.js';
import { supabase } from '../integrations/supabase.js';
import { askJson } from '../integrations/pro-doc.js';
import { synthesizeVoiceGemini, synthesizeVoiceFree } from '../notifications/dispatcher.js';
import { queueTelegramMessage } from '../notifications/tg-outbox.js';
import { emitProactive } from '../notifications/mobile-push.js';
import {
  run, probe, ensureFonts, FONT_DIR, assTime, assText, saveJob, launchJob, kenBurns, appendOutro, type StudioJob,
} from './video-studio.js';

// ─── Réglages proposés dans l'app ─────────────────────────────

export const EDIT_FORMATS = { '9:16': [1080, 1920], '1:1': [1080, 1080], '16:9': [1920, 1080] } as const;
export type EditFormat = keyof typeof EDIT_FORMATS;

export const EDIT_LOOKS: Record<string, { label: string; vf: string }> = {
  naturel:    { label: 'Naturel', vf: 'eq=contrast=1.03:saturation=1.04' },
  cinema:     { label: 'Cinéma', vf: "eq=contrast=1.08:saturation=0.9:gamma=0.97,colorbalance=rs=0.04:bs=-0.04:rh=-0.03:bh=0.05,vignette=angle=PI/5" },
  chaud:      { label: 'Soleil d\'Oran', vf: 'eq=contrast=1.05:saturation=1.12,colorbalance=rs=0.06:gs=0.02:bs=-0.06:rm=0.04:bm=-0.04' },
  froid:      { label: 'Froid / luxe', vf: 'eq=contrast=1.07:saturation=0.92,colorbalance=rs=-0.04:bs=0.06:bh=0.03' },
  vif:        { label: 'Vif TikTok', vf: 'eq=contrast=1.1:saturation=1.3,unsharp=5:5:0.6' },
  noir_blanc: { label: 'Noir & blanc', vf: 'hue=s=0,eq=contrast=1.15' },
};

export const EDIT_CAPTIONS: Record<string, { label: string }> = {
  tiktok:  { label: 'TikTok (mot en jaune)' },
  karaoke: { label: 'Karaoké (phrase qui se remplit)' },
  minimal: { label: 'Sobre (bas de l\'écran)' },
  aucun:   { label: 'Sans sous-titres' },
};

export interface EditMedia { url: string; type: 'video' | 'image' }
/** Mode éditeur (Kouider monte lui-même) : chaque plan avec son début/fin, sa vitesse, son volume. */
export interface TimelineClip { url: string; type: 'video' | 'image'; start: number; end: number; speed?: number; volume?: number }
export interface TimelineText { text: string; start: number; end: number; pos?: 'haut' | 'milieu' | 'bas'; style?: 'titre' | 'bandeau' | 'simple' }
export interface EditRequest {
  media: EditMedia[]; brief?: string; format?: EditFormat; look?: string; captions?: string;
  cutSilences?: boolean; maxSeconds?: number; voiceover?: boolean; musicUrl?: string | null; outro?: boolean; lang?: string;
  timeline?: TimelineClip[]; texts?: TimelineText[]; musicVolume?: number;
}

interface Word { w: string; s: number; e: number }
interface Seg { src: string; kind: 'video' | 'image'; start: number; end: number; words: Word[]; punch: boolean; speed?: number; volume?: number }

// ─── Transcription mot à mot (Groq Whisper, gratuit) ──────────

async function transcribeWords(file: string, dir: string, i: number): Promise<Word[]> {
  const key = env.GROQ_API_KEY;
  if (!key) return [];
  const mp3 = path.join(dir, `a${i}.mp3`);
  try { await run(['-i', file, '-vn', '-ac', '1', '-ar', '16000', '-b:a', '48k', mp3]); } catch { return []; }
  const form = new FormData();
  form.append('file', new Blob([await fs.readFile(mp3)], { type: 'audio/mpeg' }), 'a.mp3');
  form.append('model', 'whisper-large-v3-turbo');
  form.append('response_format', 'verbose_json');
  form.append('timestamp_granularities[]', 'word');
  try {
    const r = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form });
    if (!r.ok) { console.warn('[montage] whisper', r.status, (await r.text()).slice(0, 200)); return []; }
    const j = await r.json() as { words?: Array<{ word: string; start: number; end: number }>; text?: string };
    const words = (j.words ?? []).map(x => ({ w: x.word.trim(), s: x.start, e: x.end })).filter(x => x.w);
    // Whisper « entend » parfois du texte dans le bruit : on ignore les rushes sans vraie parole
    return words.length >= 3 ? words : [];
  } catch (e) { console.warn('[montage] whisper', e instanceof Error ? e.message : e); return []; }
}

/** Garde les passages parlés (coupe les blancs > 0,45 s), avec un petit souffle avant/après chaque phrase. */
function speechSegments(words: Word[], dur: number): Array<{ start: number; end: number; words: Word[] }> {
  const out: Array<{ start: number; end: number; words: Word[] }> = [];
  for (const w of words) {
    const last = out[out.length - 1];
    if (last && w.s - last.end < 0.45) { last.end = w.e; last.words.push(w); }
    else out.push({ start: w.s, end: w.e, words: [w] });
  }
  return out.map(g => ({ start: Math.max(0, g.start - 0.12), end: Math.min(dur, g.end + 0.18), words: g.words }))
    .filter(g => g.end - g.start > 0.35);
}

// ─── Rendu d'un segment : recadrage, look, zoom ───────────────

function frameFilter(W: number, H: number, srcW: number, srcH: number, look: string, punch: boolean): string {
  const lookVf = EDIT_LOOKS[look]?.vf ?? EDIT_LOOKS['naturel']!.vf;
  const zoom = punch ? `,scale=iw*1.09:ih*1.09,crop=${W}:${H}` : '';
  const srcRatio = srcW / Math.max(1, srcH), dstRatio = W / H;
  // Format très différent (ex. paysage → vertical) : image entière sur fond flouté, comme les pros ; sinon recadrage plein écran
  if (Math.abs(srcRatio - dstRatio) / dstRatio > 0.45) {
    return `split[a][b];[a]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},boxblur=30:2,eq=brightness=-0.08[bg];` +
      `[b]scale=${W}:${H}:force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,${lookVf},fps=30,setsar=1,format=yuv420p`;
  }
  return `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}${zoom},${lookVf},fps=30,setsar=1,format=yuv420p`;
}

async function videoSize(file: string): Promise<[number, number]> {
  const out = await run(['-i', file, '-f', 'null', '-t', '0.01', '-']).catch(e => String(e));
  const m = /Stream #.*Video:.*?(\d{2,5})x(\d{2,5})/.exec(out);
  let w = m ? Number(m[1]) : 1080, h = m ? Number(m[2]) : 1920;
  if (/rotate\s*:\s*-?90|displaymatrix: rotation of -?90/.test(out)) [w, h] = [h, w];
  return [w, h];
}

// ─── Sous-titres ──────────────────────────────────────────────

function captionsAss(words: Word[], style: string, W: number, H: number, hook: string, cta: string, total: number, texts: TimelineText[] = []): string {
  const arabic = /[؀-ۿ]/.test(words.map(w => w.w).join(' ') + hook + cta);
  const font = arabic ? 'Cairo' : 'Montserrat Black';
  const up = (t: string) => (arabic ? t : t.toUpperCase());
  const big = Math.round(W * (style === 'minimal' ? 0.05 : 0.08));
  const subV = style === 'minimal' ? Math.round(H * 0.08) : Math.round(H * 0.27);
  const lines = [
    '[Script Info]', 'ScriptType: v4.00+', `PlayResX: ${W}`, `PlayResY: ${H}`, 'WrapStyle: 0', 'ScaledBorderAndShadow: yes', '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Sub,${font},${big},&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,${style === 'minimal' ? 3 : 7},${style === 'minimal' ? 1 : 4},2,60,60,${subV},1`,
    `Style: Kar,${font},${big},&H0000D7FF,&H00FFFFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,7,4,2,60,60,${subV},1`,
    `Style: Hook,${font},${Math.round(W * 0.085)},&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,3,24,0,8,60,60,${Math.round(H * 0.15)},1`,
    `Style: Cta,${font},${Math.round(W * 0.08)},&H00000000,&H00000000,&H0000D7FF,&H00000000,-1,0,0,0,100,100,0,0,3,26,0,5,70,70,0,1`,
    '', '[Events]', 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];
  const ev = (s: number, e: number, st: string, t: string) => lines.push(`Dialogue: 0,${assTime(Math.max(0, s))},${assTime(Math.max(s + 0.05, e))},${st},,0,0,0,,${t}`);
  for (const t of texts) {
    const an = t.pos === 'haut' ? 8 : t.pos === 'milieu' ? 5 : 2;
    const tag = `{\\an${an}\\fad(150,150)}`;
    const st = t.style === 'bandeau' ? 'Hook' : t.style === 'titre' ? 'Sub' : 'Sub';
    ev(t.start, t.end, st, tag + assText(t.style === 'simple' ? t.text : up(t.text)));
  }
  if (hook) ev(0.05, Math.min(2.4, total), 'Hook', `{\\fad(100,200)\\t(0,160,\\fscx106\\fscy106)}${assText(up(hook))}`);
  if (cta) ev(Math.max(0, total - 2.4), total, 'Cta', `{\\fad(200,0)\\t(0,220,\\fscx108\\fscy108)}${assText(up(cta))}`);
  if (style !== 'aucun') {
    const per = style === 'minimal' ? 6 : 3;
    for (let i = 0; i < words.length; i += per) {
      const g = words.slice(i, i + per);
      const end = Math.min((words[i + per]?.s ?? g[g.length - 1]!.e + 0.3), g[g.length - 1]!.e + 0.6);
      if (style === 'tiktok') {
        g.forEach((w, j) => ev(w.s, j < g.length - 1 ? g[j + 1]!.s : end, 'Sub',
          g.map((x, k) => k === j ? `{\\c&H0000D7FF&\\fscx112\\fscy112}${assText(up(x.w))}{\\r}` : assText(up(x.w))).join(' ')));
      } else if (style === 'karaoke') {
        ev(g[0]!.s, end, 'Kar', g.map(x => `{\\kf${Math.max(5, Math.round((x.e - x.s) * 100))}}${assText(up(x.w))}`).join(' '));
      } else {
        ev(g[0]!.s, end, 'Sub', assText(g.map(x => x.w).join(' ')));
      }
    }
  }
  return lines.join('\n') + '\n';
}

// ─── Rendu complet ────────────────────────────────────────────

async function download(url: string, file: string): Promise<void> {
  const r = await axios.get<ArrayBuffer>(url, { responseType: 'arraybuffer', timeout: 180_000, maxContentLength: 400 * 1024 * 1024 });
  await fs.writeFile(file, Buffer.from(r.data));
}

type FullReq = Required<Omit<EditRequest, 'musicUrl' | 'brief' | 'timeline' | 'texts' | 'musicVolume'>> & { musicUrl: string | null; brief: string; timeline: TimelineClip[] | null; texts: TimelineText[]; musicVolume: number };
export async function renderEdit(job: StudioJob, req: FullReq, dryOut?: string): Promise<void> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), `montage-${job.id}-`));
  const [W, H] = EDIT_FORMATS[req.format];
  const step = async (s: string, p: number) => { job.step = s; job.progress = p; if (!dryOut) await saveJob(job); else console.log(`[montage] ${p}% ${s}`); };
  try {
    await ensureFonts();
    // ── 1. Rushes + transcription ──
    job.status = 'shots'; await step('Lecture de tes rushes…', 5);
    const segs: Seg[] = [];
    const transcript: string[] = [];
    if (req.timeline) {
      // ── Mode éditeur : on respecte exactement ses coupes ; transcription seulement pour les sous-titres ──
      const cache = new Map<string, string>();
      for (const [i, c] of req.timeline.entries()) {
        let f = cache.get(c.url);
        if (!f) { f = path.join(dir, `src${i}.${c.type === 'image' ? 'jpg' : 'mp4'}`); await download(c.url, f); cache.set(c.url, f); }
        const speed = Math.min(4, Math.max(0.25, Number(c.speed) || 1));
        let words: Word[] = [];
        if (c.type === 'video' && req.captions !== 'aucun' && (c.volume ?? 1) > 0) {
          words = (await transcribeWords(f, dir, i)).filter(w => w.s >= c.start && w.e <= c.end)
            .map(w => ({ w: w.w, s: c.start + (w.s - c.start) / speed, e: c.start + (w.e - c.start) / speed }));
          if (words.length) transcript.push(words.map(w => w.w).join(' '));
        }
        segs.push({ src: f, kind: c.type, start: c.start, end: Math.max(c.start + 0.3, c.end), words, punch: false, speed, volume: c.volume ?? 1 });
        await step(`Plans préparés : ${i + 1}/${req.timeline.length}`, 5 + Math.round(((i + 1) / req.timeline.length) * 30));
      }
    }
    for (const [i, m] of (req.timeline ? [] : req.media).entries()) {
      const ext = m.type === 'image' ? 'jpg' : 'mp4';
      const f = path.join(dir, `src${i}.${ext}`);
      await download(m.url, f);
      if (m.type === 'image') { segs.push({ src: f, kind: 'image', start: 0, end: 2.6, words: [], punch: false }); continue; }
      const info = await probe(f);
      const dur = info.duration || 5;
      const words = info.audio ? await transcribeWords(f, dir, i) : [];
      if (words.length) transcript.push(words.map(w => w.w).join(' '));
      if (words.length && req.cutSilences) {
        speechSegments(words, dur).forEach((g, k) => segs.push({ src: f, kind: 'video', start: g.start, end: g.end, words: g.words, punch: k % 2 === 1 }));
      } else if (words.length) {
        segs.push({ src: f, kind: 'video', start: 0, end: dur, words, punch: false });
      } else {
        // Rush sans parole = plan d'illustration : on garde le cœur du plan (le début est souvent flou/tremblé)
        const len = Math.min(dur, Math.max(2, Math.min(5, req.maxSeconds / Math.max(1, req.media.length))));
        const st = Math.max(0, Math.min(dur - len, dur * 0.25));
        segs.push({ src: f, kind: 'video', start: st, end: st + len, words: [], punch: false });
      }
      await step(`Rushes analysés : ${i + 1}/${req.media.length}`, 5 + Math.round(((i + 1) / req.media.length) * 30));
    }
    if (!segs.length) throw new Error('aucun rush exploitable');

    // ── 2. Dzaryx écrit accroche, CTA, légende (+ voix off si rushes muets) ──
    await step('Dzaryx écrit l\'accroche et la légende…', 38);
    const hasSpeech = segs.some(s => s.words.length);
    const lang = req.lang === 'darija' ? 'darija algérienne en lettres latines' : req.lang === 'ar' ? 'arabe' : req.lang === 'en' ? 'anglais' : 'français';
    const silentTotal = segs.filter(s => !s.words.length).reduce((a, s) => a + (s.end - s.start), 0);
    let txt: { hook?: string; cta?: string; caption?: string; voiceover?: string; title?: string } = {};
    try {
      txt = await askJson('Tu es monteur vidéo TikTok/Reels pour FIK Conciergerie (location de voitures à Oran) et ses projets. Réponds UNIQUEMENT en JSON.',
        `Demande de Kouider : ${req.brief || '(aucune, fais au mieux)'}
${transcript.length ? `Ce qui est dit dans ses rushes : ${transcript.join(' / ').slice(0, 2500)}` : 'Rushes sans parole.'}
Langue : ${lang}.
JSON : {"title":"titre court","hook":"accroche écran 3 à 6 mots","cta":"appel à l'action 2 à 5 mots ou vide","caption":"légende du post avec 5 hashtags"${!hasSpeech && req.voiceover ? `,"voiceover":"voix off d'environ ${Math.round(Math.min(req.maxSeconds, Math.max(6, silentTotal)) * 2.3)} mots, phrases courtes, naturelle, finit par l'appel à l'action"` : ''}}
Ne promets rien de faux, ne cite jamais Bruxelles/Belgique.`, 900);
    } catch (e) { console.warn('[montage] textes', e instanceof Error ? e.message : e); }
    job.title = String(txt.title || req.brief || 'Montage').slice(0, 80); if (!dryOut) await saveJob(job);

    // Durée maximale : on coupe la fin plutôt que d'accélérer
    let budget = req.timeline ? 600 : req.maxSeconds;
    const kept: Seg[] = [];
    for (const s of segs) { if (budget <= 0.4) break; const d = Math.min(s.end - s.start, budget); kept.push({ ...s, end: s.start + d, words: s.words.filter(w => w.s < s.start + d) }); budget -= d; }

    // ── 3. Rendu des segments ──
    job.status = 'montage';
    const parts: string[] = [];
    const words: Word[] = [];
    let t = 0;
    for (const [i, s] of kept.entries()) {
      const out = path.join(dir, `p${i}.mp4`);
      const sp = s.speed ?? 1;
      const srcD = s.end - s.start;
      const d = s.kind === 'image' ? srcD : srcD / sp;
      if (s.kind === 'image') {
        const raw = path.join(dir, `kb${i}.mp4`);
        await kenBurns(s.src, 'auto', d, raw, i);
        const [w, h] = await videoSize(raw);
        await run(['-i', raw, '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo', '-filter_complex', `[0:v]${frameFilter(W, H, w, h, req.look, false)}[v]`,
          '-map', '[v]', '-map', '1:a', '-t', d.toFixed(2), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-c:a', 'aac', '-ar', '44100', '-ac', '2', out]);
      } else {
        const [w, h] = await videoSize(s.src);
        const hasA = (await probe(s.src)).audio;
        const atempo = sp === 1 ? '' : sp < 0.5 ? `,atempo=0.5,atempo=${(sp / 0.5).toFixed(3)}` : sp > 2 ? `,atempo=2,atempo=${(sp / 2).toFixed(3)}` : `,atempo=${sp}`;
        const vol = s.volume !== undefined ? `,volume=${s.volume}` : (s.words.length ? '' : ',volume=0.35');
        await run(['-ss', s.start.toFixed(3), '-t', srcD.toFixed(3), '-i', s.src, ...(hasA ? [] : ['-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo']),
          '-filter_complex', `[0:v]setpts=PTS/${sp},${frameFilter(W, H, w, h, req.look, s.punch)}[v];[${hasA ? '0:a' : '1:a'}]aresample=44100,aformat=channel_layouts=stereo${atempo}${s.words.length ? ',highpass=f=80,acompressor=threshold=-20dB:ratio=3:attack=5:release=80' : ''}${vol}[a]`,
          '-map', '[v]', '-map', '[a]', '-t', d.toFixed(3), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-c:a', 'aac', '-ar', '44100', '-ac', '2', out]);
      }
      for (const w of s.words) words.push({ w: w.w, s: t + Math.max(0, w.s - s.start), e: t + Math.max(0, w.e - s.start) });
      t += d;
      parts.push(out);
      await step(`Montage : plan ${i + 1}/${kept.length}`, 40 + Math.round(((i + 1) / kept.length) * 35));
    }
    const list = path.join(dir, 'list.txt');
    await fs.writeFile(list, parts.map(p => `file '${p}'`).join('\n'));
    const base = path.join(dir, 'base.mp4');
    await run(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', base]);
    const baseDur = (await probe(base)).duration || t;

    // ── 4. Voix off (rushes muets) ──
    let voiceFile: string | null = null;
    if (!hasSpeech && req.voiceover && txt.voiceover) {
      await step('Voix off…', 78);
      const buf = (await synthesizeVoiceGemini(txt.voiceover).catch(() => null)) ?? (await synthesizeVoiceFree(txt.voiceover).catch(() => null));
      if (buf) {
        voiceFile = path.join(dir, buf.subarray(0, 4).toString() === 'RIFF' ? 'voice.wav' : 'voice.mp3');
        await fs.writeFile(voiceFile, buf);
        const vd = (await probe(voiceFile)).duration;
        const vw = txt.voiceover.split(/\s+/).filter(Boolean);
        const wt = vw.map(w => w.length + 2 + (/[.,!?;:…]$/.test(w) ? 3 : 0));
        const sum = wt.reduce((a, b) => a + b, 0);
        let c = 0.3;
        vw.forEach((w, k) => { const s = c; c += (wt[k]! / sum) * vd; words.push({ w, s, e: c }); });
      }
    }

    // ── 5. Final : sous-titres, musique baissée sous la voix, volume TikTok ──
    await step('Sous-titres, musique et mixage…', 84);
    const total = Math.max(baseDur, voiceFile ? (words[words.length - 1]?.e ?? 0) + 0.6 : 0);
    const ass = path.join(dir, 'subs.ass');
    await fs.writeFile(ass, captionsAss(words, req.captions, W, H, req.timeline ? '' : (txt.hook ?? ''), req.timeline ? '' : (txt.cta ?? ''), total, req.texts));
    const inputs = ['-i', base];
    const mix: string[] = ['[0:a]aresample=44100[na]'];
    let speech = '[na]', idx = 1;
    if (voiceFile) { inputs.push('-i', voiceFile); mix.push(`[${idx}:a]aresample=44100,adelay=300|300,volume=1.5[vo]`, `[na][vo]amix=inputs=2:normalize=0:duration=longest[sp]`); speech = '[sp]'; idx++; }
    let audioOut = speech;
    if (req.musicUrl) {
      const mf = path.join(dir, 'music.audio');
      try {
        await download(req.musicUrl, mf);
        inputs.push('-stream_loop', '-1', '-i', mf);
        // « ducking » : la musique baisse automatiquement quand quelqu'un parle
        mix.push(`[${idx}:a]aresample=44100,aformat=channel_layouts=stereo,volume=${(hasSpeech || voiceFile ? 0.5 : 0.9) * req.musicVolume},afade=t=out:st=${Math.max(0, total - 1.5).toFixed(2)}:d=1.5[mu]`,
          `${speech}asplit=2[sa][sb]`, `[mu][sa]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=400[duck]`, `[sb][duck]amix=inputs=2:normalize=0:duration=longest[mx]`);
        audioOut = '[mx]'; idx++;
      } catch (e) { console.warn('[montage] musique', e instanceof Error ? e.message : e); }
    }
    const esc = (p: string) => p.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");
    const pad = total - baseDur > 0.05 ? `tpad=stop_mode=clone:stop_duration=${(total - baseDur).toFixed(2)},` : '';
    let final = path.join(dir, 'final.mp4');
    await run([...inputs, '-filter_complex', [`[0:v]${pad}ass='${esc(ass)}':fontsdir='${esc(FONT_DIR)}'[v]`, ...mix, `${audioOut}loudnorm=I=-14:TP=-1.5:LRA=11[a]`].join(';'),
      '-map', '[v]', '-map', '[a]', '-t', total.toFixed(2), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '192k', '-ar', '44100', '-movflags', '+faststart', final]);
    let finalDur = total;

    if (req.outro) {
      await step('Signature FIK…', 92);
      try {
        if (req.format === '9:16') ({ final, total: finalDur } = await appendOutro(dir, final, total));
        else {
          // Signature pour les autres formats : logo centré sur fond noir
          const sq = path.join(dir, 'final_fmt.mp4');
          await run(['-i', final, '-i', 'https://febrrgqpyqqrewcohomx.supabase.co/storage/v1/object/public/videos/brand/fik-outro.mp4', '-filter_complex',
            `[1:v]scale=-2:${H},crop=min(iw\\,${W}):${H},pad=${W}:${H}:(ow-iw)/2:0:black,fps=30,setsar=1,format=yuv420p[o];[0:v]fps=30,setsar=1,format=yuv420p[m];` +
            `[m][o]xfade=transition=fadeblack:duration=0.45:offset=${Math.max(0.5, total - 0.45).toFixed(2)}[v];[0:a][1:a]acrossfade=d=0.45[a]`,
            '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-c:a', 'aac', '-ar', '44100', '-movflags', '+faststart', sq]);
          final = sq; finalDur = total + 3.85;
        }
      } catch (e) { console.warn('[montage] signature', e instanceof Error ? e.message : e); }
    }

    // ── 6. Livraison ──
    if (dryOut) { await fs.copyFile(final, dryOut); console.log('[montage] test', { title: job.title, txt, finalDur }); return; }
    await step('Envoi…', 96);
    const name = `studio/${job.id}.mp4`;
    const { error } = await supabase.storage.from('videos').upload(name, await fs.readFile(final), { contentType: 'video/mp4', upsert: true, cacheControl: '3600' });
    if (error) throw new Error(`upload Supabase : ${error.message}`);
    const url = supabase.storage.from('videos').getPublicUrl(name).data.publicUrl;
    Object.assign(job, { status: 'done', step: 'Terminé ✅', progress: 100, url, caption: txt.caption ?? '' });
    await saveJob(job);
    const msg = `✂️ Montage — « ${job.title} » est prêt (${Math.round(finalDur)} s, ${req.format}, 0 €)` + (txt.caption ? `\n\nLégende à poster :\n${txt.caption}` : '');
    await queueTelegramMessage(msg, undefined, job.actor, { url, name: `${job.title.replace(/[^\w\- ]+/g, '').slice(0, 50) || 'montage'}.mp4` }).catch(() => {});
    emitProactive(`✂️ Montage « ${job.title} » prêt dans MONTAGE`, 'info', msg, 'kouider');
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    console.error(`[montage] job ${job.id}:`, m);
    if (dryOut) throw e;
    Object.assign(job, { status: 'error', step: 'Échec', error: m.slice(0, 400) });
    await saveJob(job);
    emitProactive(`❌ Montage « ${job.title} » : ${m.slice(0, 160)}`, 'alert', undefined, 'kouider');
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function startEdit(input: EditRequest, actor = 'kouider'): Promise<StudioJob> {
  const okUrl = (u: unknown) => typeof u === 'string' && /^https?:\/\//.test(u);
  const timeline = Array.isArray(input.timeline) && input.timeline.length
    ? input.timeline.filter(c => okUrl(c.url)).slice(0, 60).map(c => ({ url: c.url, type: c.type === 'image' ? 'image' as const : 'video' as const,
        start: Math.max(0, Number(c.start) || 0), end: Math.max(0.3, Number(c.end) || 3), speed: Number(c.speed) || 1, volume: c.volume === undefined ? 1 : Math.min(2, Math.max(0, Number(c.volume))) }))
    : null;
  const media = timeline ? timeline.map(c => ({ url: c.url, type: c.type })) : (input.media ?? []).filter(m => okUrl(m.url)).slice(0, 20);
  if (!media.length) throw new Error('Ajoute au moins une vidéo ou une photo.');
  const texts = (input.texts ?? []).slice(0, 30).map(t => ({ text: String(t.text ?? '').slice(0, 120), start: Math.max(0, Number(t.start) || 0),
    end: Math.max(0.3, Number(t.end) || 2), pos: (['haut', 'milieu', 'bas'].includes(String(t.pos)) ? t.pos : 'milieu') as TimelineText['pos'],
    style: (['titre', 'bandeau', 'simple'].includes(String(t.style)) ? t.style : 'titre') as TimelineText['style'] })).filter(t => t.text);
  const req = {
    media, brief: String(input.brief ?? '').slice(0, 800),
    format: (EDIT_FORMATS[input.format as EditFormat] ? input.format : '9:16') as EditFormat,
    look: EDIT_LOOKS[String(input.look)] ? String(input.look) : 'naturel',
    captions: EDIT_CAPTIONS[String(input.captions)] ? String(input.captions) : 'tiktok',
    cutSilences: input.cutSilences !== false, maxSeconds: Math.min(180, Math.max(5, Number(input.maxSeconds) || 45)),
    voiceover: timeline ? false : input.voiceover !== false, musicUrl: input.musicUrl ?? null, outro: input.outro !== false, lang: String(input.lang ?? 'fr'),
    timeline, texts, musicVolume: Math.min(1.5, Math.max(0, Number(input.musicVolume ?? 1))),
  };
  const now = new Date().toISOString();
  const job: StudioJob = {
    id: randomUUID().slice(0, 8), planId: 'montage', title: req.brief.slice(0, 60) || (timeline ? 'Mon montage' : 'Montage de tes rushes'), model: 'gratuit', status: 'queued',
    step: 'En file…', progress: 2, estimateUsd: 0, costUsd: 0, shotsDone: 0, shotsTotal: media.length, createdAt: now, updatedAt: now, actor,
  };
  await launchJob(job, () => renderEdit(job, req));
  return job;
}

/** Lien d'envoi direct (téléphone → stockage FIK) pour les gros rushes, sans passer par le serveur. */
export async function uploadUrl(fileName: string): Promise<{ uploadUrl: string; publicUrl: string; type: 'video' | 'image' | 'audio' }> {
  const ext = (path.extname(fileName).toLowerCase().replace('.', '') || 'mp4').replace(/[^a-z0-9]/g, '').slice(0, 5);
  const type = /^(jpe?g|png|webp|heic)$/.test(ext) ? 'image' : /^(mp3|m4a|wav|aac|ogg)$/.test(ext) ? 'audio' : 'video';
  const key = `rushes/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${ext}`;
  const { data, error } = await supabase.storage.from('videos').createSignedUploadUrl(key);
  if (error || !data) throw new Error(`lien d'envoi : ${error?.message ?? 'inconnu'}`);
  return { uploadUrl: data.signedUrl, publicUrl: supabase.storage.from('videos').getPublicUrl(key).data.publicUrl, type };
}
