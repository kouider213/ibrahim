// Petits sons de jeu (WebAudio, aucun fichier) : toucher, pièce, fanfare. Coupables avec 🔊.
let ctx: AudioContext | null = null;
const KEY = 'dz:carte:sound';
export const soundOn = () => { try { return localStorage.getItem(KEY) !== '0'; } catch { return true; } };
export const setSound = (on: boolean) => { try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* ignore */ } };

function note(freq: number, at: number, dur: number, type: OscillatorType = 'sine', vol = 0.12) {
  if (!ctx) return;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, ctx.currentTime + at);
  g.gain.setValueAtTime(0, ctx.currentTime + at);
  g.gain.linearRampToValueAtTime(vol, ctx.currentTime + at + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + dur);
  o.connect(g).connect(ctx.destination);
  o.start(ctx.currentTime + at); o.stop(ctx.currentTime + at + dur + 0.02);
}
function ready() {
  if (!soundOn()) return false;
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return false;
    ctx ??= new AC();
    if (ctx.state === 'suspended') void ctx.resume();
    return true;
  } catch { return false; }
}
export const sfx = {
  tap: () => { if (ready()) note(880, 0, 0.07, 'triangle', 0.06); },
  coin: () => { if (ready()) { note(988, 0, 0.09, 'square', 0.05); note(1319, 0.08, 0.28, 'square', 0.05); } },
  fanfare: () => { if (ready()) [523, 659, 784, 1047].forEach((f, i) => note(f, i * 0.11, i === 3 ? 0.5 : 0.14, 'triangle', 0.09)); },
  whoosh: () => { if (ready()) { note(330, 0, 0.18, 'sine', 0.04); note(495, 0.05, 0.18, 'sine', 0.03); } },
};

// Voix (visite guidée) : voix française du téléphone
export function speak(text: string, onEnd?: () => void): boolean {
  if (!soundOn() || !('speechSynthesis' in window)) return false;
  try {
    const u = new SpeechSynthesisUtterance(text.replace(/[^\p{L}\p{N}\s.,:;!?'’€-]/gu, ''));
    u.lang = 'fr-FR'; u.rate = 1.05;
    const v = speechSynthesis.getVoices().find(x => x.lang.startsWith('fr'));
    if (v) u.voice = v;
    if (onEnd) u.onend = onEnd;
    speechSynthesis.cancel(); speechSynthesis.speak(u);
    return true;
  } catch { return false; }
}
export const hush = () => { try { speechSynthesis.cancel(); } catch { /* ignore */ } };

// ── Ambiance de la ville (tout synthétisé) : vagues, circulation, mouettes le jour, grillons la nuit, pluie ──
let amb: { master: GainNode; waves: GainNode; traffic: GainNode; rain: GainNode; srcs: AudioBufferSourceNode[]; timers: number[]; mood: { night: number; wet: boolean } } | null = null;
function noiseBuf(c: AudioContext, brown: boolean) {
  const b = c.createBuffer(1, c.sampleRate * 3, c.sampleRate), d = b.getChannelData(0);
  let last = 0;
  for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w; }
  return b;
}
function loop(c: AudioContext, buf: AudioBuffer, filter: BiquadFilterNode, gain: GainNode, dest: AudioNode) {
  const s = c.createBufferSource(); s.buffer = buf; s.loop = true;
  s.connect(filter).connect(gain).connect(dest); s.start(); return s;
}
function chirp(c: AudioContext, dest: AudioNode, f0: number, f1: number, at: number, dur: number, vol: number, type: OscillatorType = 'sine') {
  const o = c.createOscillator(), g = c.createGain(), t = c.currentTime + at;
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(dest); o.start(t); o.stop(t + dur + 0.05);
}
export function ambientStart() {
  if (amb || !ready() || !ctx) return;
  const c = ctx, master = c.createGain();
  master.gain.setValueAtTime(0, c.currentTime); master.gain.linearRampToValueAtTime(0.9, c.currentTime + 2.5);
  master.connect(c.destination);
  const brown = noiseBuf(c, true), white = noiseBuf(c, false);
  const mk = (type: BiquadFilterType, f: number, q = 0.7) => { const x = c.createBiquadFilter(); x.type = type; x.frequency.value = f; x.Q.value = q; return x; };
  const waves = c.createGain(), traffic = c.createGain(), rain = c.createGain();
  waves.gain.value = 0.05; traffic.gain.value = 0.03; rain.gain.value = 0;
  const srcs = [loop(c, brown, mk('lowpass', 520), waves, master), loop(c, brown, mk('lowpass', 160), traffic, master), loop(c, white, mk('bandpass', 2600, 0.6), rain, master)];
  amb = { master, waves, traffic, rain, srcs, timers: [], mood: { night: 0, wet: false } };
  const a = amb;
  // Houle : le volume des vagues monte et descend toutes les ~7 s
  a.timers.push(window.setInterval(() => {
    const t = c.currentTime, base = 0.035 + (a.mood.wet ? 0.02 : 0);
    a.waves.gain.cancelScheduledValues(t); a.waves.gain.setTargetAtTime(base + 0.05, t, 1.4); a.waves.gain.setTargetAtTime(base, t + 3.5, 1.6);
  }, 7000));
  // Vie de la ville : mouettes et klaxons le jour, grillons la nuit
  a.timers.push(window.setInterval(() => {
    const night = a.mood.night > 0.6;
    if (night) { if (Math.random() < 0.8) for (let i = 0; i < 3; i++) chirp(c, a.master, 4300, 4100, i * 0.09, 0.05, 0.012, 'triangle'); }
    else if (!a.mood.wet && Math.random() < 0.22) { chirp(c, a.master, 1500, 950, 0, 0.32, 0.018, 'sawtooth'); chirp(c, a.master, 1450, 900, 0.38, 0.28, 0.014, 'sawtooth'); }
    else if (Math.random() < 0.05) { chirp(c, a.master, 420, 410, 0, 0.25, 0.012, 'square'); }
  }, 1600));
}
export function ambientMood(m: { night: number; wet: boolean }) {
  if (!amb || !ctx) return;
  amb.mood = m;
  const t = ctx.currentTime;
  amb.traffic.gain.setTargetAtTime(0.012 + (1 - m.night) * 0.03, t, 2);
  amb.rain.gain.setTargetAtTime(m.wet ? 0.06 : 0, t, 2);
}
export function ambientStop() {
  if (!amb || !ctx) return;
  const a = amb; amb = null;
  a.timers.forEach(clearInterval);
  a.master.gain.setTargetAtTime(0, ctx.currentTime, 0.4);
  setTimeout(() => { a.srcs.forEach(s => { try { s.stop(); } catch { /* déjà arrêté */ } }); a.master.disconnect(); }, 1500);
}
