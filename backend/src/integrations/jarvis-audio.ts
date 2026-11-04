/**
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

/** Séquence de démarrage ~2,2 s (souffle + basse + scan + carillon). Pseudo-aléatoire fixe = même « signature » chaque jour. */
function bootSequence(L: Float32Array, R: Float32Array) {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  const dur = Math.round(2.2 * SR);
  let lpL = 0, lpR = 0, ph = 0;
  for (let i = 0; i < dur; i++) {
    const t = i / SR;
    // souffle filtré qui s'ouvre (200 → 5000 Hz) puis retombe
    const cut = 200 + 4800 * Math.min(1, t / 1.3), a = 1 - Math.exp(-2 * Math.PI * cut / SR);
    lpL += a * (rnd() - lpL); lpR += a * (rnd() - lpR);
    const wEnv = Math.sin(Math.PI * Math.min(1, t / 1.7)) ** 2 * 0.11;
    // basse qui s'allume 45 → 90 Hz
    ph += 2 * Math.PI * (45 + 45 * Math.min(1, t / 1.4)) / SR;
    const sub = Math.sin(ph) * 0.2 * Math.min(1, t / 0.9) * Math.max(0, 1 - Math.max(0, t - 1.5) / 0.7);
    L[i]! += lpL * wEnv + sub; R[i]! += lpR * wEnv + sub;
  }
  // bips de scan gauche ↔ droite
  for (let k = 0; k < 7; k++) {
    const t0 = 0.45 + k * 0.075, f = 1700 + ((k * 389) % 900), s0 = Math.round(t0 * SR), len = Math.round(0.028 * SR);
    const pan = k % 2 ? 0.75 : -0.75;
    for (let i = 0; i < len; i++) {
      const v = Math.sin(2 * Math.PI * f * i / SR) * Math.sin(Math.PI * i / len) * 0.07;
      L[s0 + i]! += v * (1 - pan) / 2 * 1.4; R[s0 + i]! += v * (1 + pan) / 2 * 1.4;
    }
  }
  // carillon « en ligne » : mi – si – mi aigu
  chime(L, R, 1.35, 659.25, 0.16, -0.3); chime(L, R, 1.45, 987.77, 0.13, 0.3); chime(L, R, 1.56, 1318.5, 0.11, 0, 0.9);
}

/** Habille la voix : démarrage, écho stéréo, nappage grave, fin de veille. */
export function jarvisMaster(voice: Float32Array): Buffer {
  let peak = 0;
  for (const v of voice) peak = Math.max(peak, Math.abs(v));
  const g = peak > 0 ? 0.78 / peak : 1;
  const start = Math.round(2.05 * SR), tail = Math.round(2.4 * SR);
  const n = start + voice.length + tail;
  const L = new Float32Array(n), R = new Float32Array(n);
  bootSequence(L, R);
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

/** Coupe en ~3 morceaux sur les fins de phrase (pour synthétiser en parallèle). */
export function splitForTts(text: string, parts = 3): string[] {
  const sentences = text.split(/(?<=[.!?…])\s+/).filter(Boolean);
  if (sentences.length < 4) return [text];
  const target = text.length / parts, out: string[] = [];
  let cur = '';
  for (const s of sentences) {
    cur = cur ? `${cur} ${s}` : s;
    if (cur.length >= target && out.length < parts - 1) { out.push(cur); cur = ''; }
  }
  if (cur) out.push(cur);
  return out;
}

/** Texte → WAV stéréo Jarvis (null si Gemini TTS indisponible). */
export async function jarvisCinemaVoice(text: string, voice: string, style: string): Promise<Buffer | null> {
  const { synthesizeVoiceGemini } = await import('../notifications/dispatcher.js');
  const one = async (t: string) => (await synthesizeVoiceGemini(t, { voice, style })) ?? (await new Promise(r => setTimeout(r, 1500)), synthesizeVoiceGemini(t, { voice, style }));
  const chunks = splitForTts(text);
  const wavs = await Promise.all(chunks.map(one));
  if (wavs.some(w => !w)) return null;
  const pcs = wavs.map(w => wavToFloat(w!));
  const gap = Math.round(0.18 * SR);
  const all = new Float32Array(pcs.reduce((s, p) => s + p.length, 0) + gap * (pcs.length - 1));
  let o = 0;
  for (const [i, p] of pcs.entries()) { all.set(p, o); o += p.length + (i < pcs.length - 1 ? gap : 0); }
  return jarvisMaster(all);
}
