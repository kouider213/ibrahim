/**
 * 04/11 (2) Kouider : « le son du début et le souffle c'est pas beau, enlève-le » → plus de séquence de démarrage.
 * « Le truc sur le Coran c'est magique, à chaque fois + qu'il récite la sourate pour nous protéger sur la route » →
 * [[Q:043013,043014]] dans le texte = VRAIE récitation (Mishary Alafasy, everyayah.com) insérée dans l'audio.
 * Quota Gemini TTS gratuit minuscule (~10/jour/modèle) → UNE seule synthèse par démarrage (les phrases fixes sont en
 * cache), secours ElevenLabs / voix Google décodés par ffmpeg puis habillés pareil.
 *
 * 🎬 VOIX JARVIS « CINÉMA » POUR CARPLAY (04/11/2026, Kouider : « encore plus fou, plus futuriste, style Jarvis même en mieux »)
 * Tout est calculé ici en pur code (0 €, aucune librairie) sur le PCM de Gemini TTS :
 *  - séquence de DÉMARRAGE : souffle qui monte, basse qui s'allume, bips de scan gauche/droite, carillon à 3 notes ;
 *  - la voix au centre avec un écho stéréo court (effet « IA dans l'habitacle ») et un nappage grave très bas dessous ;
 *  - fin : 2 notes qui redescendent = « je passe en veille ».
 * Synthèse découpée en morceaux générés EN PARALLÈLE (3× plus rapide qu'un seul gros texte, et un morceau raté ne tue
 * pas tout) puis recollés.
 */

const SR = 24_000;

/** WAV PCM16 mono (Gemini) → échantillons -1..1 */
export function wavToFloat(wav: Buffer): Float32Array {
  let off = 12, data: Buffer | null = null;
  while (off + 8 <= wav.length) {
    const id = wav.toString('ascii', off, off + 4), size = wav.readUInt32LE(off + 4);
    if (id === 'data') { data = wav.subarray(off + 8, Math.min(wav.length, off + 8 + size)); break; }
    off += 8 + size + (size & 1);
  }
  if (!data) data = wav.subarray(44);
  const out = new Float32Array(data.length >> 1);
  for (let i = 0; i < out.length; i++) out[i] = data.readInt16LE(i * 2) / 32768;
  return out;
}

function stereoWav(L: Float32Array, R: Float32Array): Buffer {
  const n = L.length, buf = Buffer.alloc(44 + n * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    buf.writeInt16LE(Math.round(Math.tanh(L[i]!) * 32000), 44 + i * 4);
    buf.writeInt16LE(Math.round(Math.tanh(R[i]!) * 32000), 46 + i * 4);
  }
  return buf;
}

/** Note de carillon (fondamentale + harmoniques, décroissance douce), posée à t (s), panoramique -1..1 */
function chime(L: Float32Array, R: Float32Array, t: number, f: number, amp: number, pan = 0, tau = 0.7) {
  const s0 = Math.round(t * SR), len = Math.round(tau * 5 * SR);
  const gl = amp * Math.cos((pan + 1) * Math.PI / 4), gr = amp * Math.sin((pan + 1) * Math.PI / 4);
  for (let i = 0; i < len && s0 + i < L.length; i++) {
    const x = i / SR, env = Math.min(1, x / 0.004) * Math.exp(-x / tau);
    const v = (Math.sin(2 * Math.PI * f * x) + 0.35 * Math.sin(2 * Math.PI * f * 2.01 * x) * Math.exp(-x / (tau / 2)) + 0.12 * Math.sin(2 * Math.PI * f * 3 * x) * Math.exp(-x / (tau / 4))) * env;
    L[s0 + i]! += v * gl; R[s0 + i]! += v * gr;
  }
}

/** Habille la voix : démarrage, écho stéréo, nappage grave, fin de veille. */
export function jarvisMaster(voice: Float32Array): Buffer {
  let peak = 0;
  for (const v of voice) peak = Math.max(peak, Math.abs(v));
  const g = peak > 0 ? 0.78 / peak : 1;
  const start = Math.round(0.25 * SR), tail = Math.round(2.4 * SR);
  const n = start + voice.length + tail;
  const L = new Float32Array(n), R = new Float32Array(n);
  // voix + écho stéréo court (gauche 110 ms, droite 170 ms, 2e rebond plus faible)
  const taps: Array<[number, number, number]> = [[0.11, 0.15, 0.04], [0.17, 0.04, 0.15], [0.26, 0.05, 0.02], [0.37, 0.02, 0.05]];
  for (let i = 0; i < voice.length; i++) {
    const v = voice[i]! * g, j = start + i;
    L[j]! += v; R[j]! += v;
    for (const [d, gl, gr] of taps) { const k = j + Math.round(d * SR); if (k < n) { L[k]! += v * gl; R[k]! += v * gr; } }
  }
  // nappage grave sous la voix (la / mi, très bas, respire lentement)
  const padEnd = start + voice.length + Math.round(1.2 * SR);
  for (let j = start - Math.round(0.4 * SR); j < Math.min(n, padEnd + Math.round(1.5 * SR)); j++) {
    const t = j / SR, fin = Math.max(0, Math.min(1, (j - (start - 0.4 * SR)) / SR, (padEnd + 1.5 * SR - j) / (1.5 * SR)));
    const lfo = 0.7 + 0.3 * Math.sin(2 * Math.PI * 0.13 * t);
    const a = 0.022 * fin * lfo;
    L[j]! += a * (Math.sin(2 * Math.PI * 110 * t) + 0.6 * Math.sin(2 * Math.PI * 164.81 * t) + 0.25 * Math.sin(2 * Math.PI * 220.4 * t));
    R[j]! += a * (Math.sin(2 * Math.PI * 110.3 * t) + 0.6 * Math.sin(2 * Math.PI * 164.6 * t) + 0.25 * Math.sin(2 * Math.PI * 219.7 * t));
  }
  // fin : « veille » (mi aigu → si), doux
  const t1 = (start + voice.length) / SR + 0.35;
  chime(L, R, t1, 1318.5, 0.07, 0.2, 0.5); chime(L, R, t1 + 0.16, 987.77, 0.07, -0.2, 0.8);
  return stereoWav(L, R);
}

// ── Récitation (Mishary Alafasy, fichiers publics par verset) → PCM 24 kHz mono, en mémoire ──
const RECIT = new Map<string, Float32Array>();
export async function decodeToPcm(audio: Buffer): Promise<Float32Array | null> {
  const { spawn } = await import('node:child_process');
  return new Promise(resolve => {
    const ff = spawn('ffmpeg', ['-v', 'error', '-i', 'pipe:0', '-f', 's16le', '-ac', '1', '-ar', String(SR), 'pipe:1']);
    const out: Buffer[] = [];
    ff.stdout.on('data', (d: Buffer) => out.push(d));
    ff.on('error', () => resolve(null));
    ff.on('close', code => {
      const b = Buffer.concat(out);
      if (code !== 0 || b.length < 2000) return resolve(null);
      const f = new Float32Array(b.length >> 1);
      for (let i = 0; i < f.length; i++) f[i] = b.readInt16LE(i * 2) / 32768;
      resolve(f);
    });
    ff.stdin.on('error', () => {});
    ff.stdin.end(audio);
  });
}
async function recitation(ayah: string): Promise<Float32Array | null> {
  if (!/^\d{6}$/.test(ayah)) return null;
  const hit = RECIT.get(ayah);
  if (hit) return hit;
  const r = await fetch(`https://everyayah.com/data/Alafasy_128kbps/${ayah}.mp3`, { signal: AbortSignal.timeout(20_000) }).catch(() => null);
  if (!r?.ok) return null;
  const pcm = await decodeToPcm(Buffer.from(await r.arrayBuffer()));
  if (pcm) RECIT.set(ayah, pcm);
  return pcm;
}
const norm = (p: Float32Array, to = 0.8) => { let m = 0; for (const v of p) m = Math.max(m, Math.abs(v)); const g = m ? to / m : 1; return p.map(v => v * g); };

// Phrases déjà dites (fixes) : gardées en mémoire → aucune synthèse en plus
const TTS_CACHE = new Map<string, Float32Array>();
async function speak(text: string, voice: string, style: string): Promise<Float32Array | null> {
  const key = `${voice}|${text}`;
  const hit = TTS_CACHE.get(key);
  if (hit) return hit;
  const { synthesizeVoiceGemini, synthesizeVoice } = await import('../notifications/dispatcher.js');
  let pcm: Float32Array | null = null;
  const wav = await synthesizeVoiceGemini(text, { voice, style }).catch(() => null);
  if (wav) pcm = wavToFloat(wav);
  else {
    // Kouider 04/11 : « si il a pas la voix Gemini, passe à une autre » → ElevenLabs, puis voix Google gratuite (MP3)
    const mp3 = await synthesizeVoice(text).catch(() => null);
    if (mp3) pcm = await decodeToPcm(mp3);
  }
  if (pcm && text.length < 400) { if (TTS_CACHE.size > 40) TTS_CACHE.clear(); TTS_CACHE.set(key, pcm); }
  return pcm;
}

/** Comment la voix doit LIRE certains mots (« Dzaryx » sortait « Daryx »). Réglable : app_kv jarvis:say:dzaryx. */
async function phonetic(text: string): Promise<string> {
  const { kvGet } = await import('./app-store.js');
  const dz = (await kvGet('jarvis:say:dzaryx').catch(() => null))?.trim() || "D'zarix";
  return text.replace(/\bDzaryx\b/gi, dz);
}

/** Texte (avec [[Q:043013,043014]] pour une récitation) → WAV stéréo Jarvis. null si aucune voix n'a marché.
 *  04/11 (3) Kouider : « il a 2 voix différentes » (3 morceaux synthétisés à part = 3 timbres) → TOUT le texte en UNE
 *  seule synthèse = une seule voix ; les récitations sont jouées APRÈS, dans l'ordre (le texte annonce et traduit avant). */
export async function jarvisCinemaVoice(text: string, voice: string, style: string): Promise<Buffer | null> {
  const ayahs = [...text.matchAll(/\[\[Q:([\d,]+)\]\]/g)].map(m => m[1]!.split(','));
  const spoken = text.replace(/\s*\[\[Q:[\d,]+\]\]\s*/g, ' ').replace(/\s{2,}/g, ' ').trim();
  const [tts, ...recits] = await Promise.all([
    phonetic(spoken).then(t => speak(t, voice, style)),
    ...ayahs.map(async list => (await Promise.all(list.map(recitation))).filter((x): x is Float32Array => !!x)),
  ]);
  if (!tts) return null;
  const pieces: Float32Array[] = [norm(tts)];
  for (const r of recits as Float32Array[][]) for (const a of r) pieces.push(norm(a, 0.75));
  const gap = Math.round(0.7 * SR);
  const all = new Float32Array(pieces.reduce((s2, x) => s2 + x.length, 0) + gap * (pieces.length - 1));
  let o = 0;
  for (const [i, x] of pieces.entries()) { all.set(x, o); o += x.length + (i < pieces.length - 1 ? gap : 0); }
  return jarvisMaster(all);
}
