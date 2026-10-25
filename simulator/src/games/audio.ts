// Son des jeux, 100 % synthétisé (Web Audio) : pas de fichier à télécharger, marche hors-ligne.
// Musique = séquenceur 16 pas (kick, charley, basse, arpège) dont le tempo suit la vitesse du jeu.

type Style = 'rush' | 'calm';
let ctx: AudioContext | null = null;
let master: GainNode, musicBus: GainNode, sfxBus: GainNode, comp: DynamicsCompressorNode;
let muted = (() => { try { return localStorage.getItem('jeux:mute') === '1'; } catch { return false; } })();
let musicOn = false, style: Style = 'rush', bpm = 112, step = 0, nextT = 0, timer = 0, chord = 0;
let noiseBuf: AudioBuffer | null = null;

export function audioUnlock() {
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.9;
    musicBus = ctx.createGain(); musicBus.gain.value = 0.5;
    sfxBus = ctx.createGain(); sfxBus.gain.value = 0.8;
    musicBus.connect(comp); sfxBus.connect(comp); comp.connect(master); master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') void ctx.resume();
}
export const isMuted = () => muted;
export function setMuted(m: boolean) {
  muted = m; try { localStorage.setItem('jeux:mute', m ? '1' : '0'); } catch { /* */ }
  if (ctx) master.gain.setTargetAtTime(m ? 0 : 0.9, ctx.currentTime, 0.05);
}

function tone(freq: number, t: number, dur: number, o: { type?: OscillatorType; vol?: number; bus?: GainNode; slide?: number; attack?: number; filter?: number; detune?: number } = {}) {
  if (!ctx) return;
  const osc = ctx.createOscillator(), g = ctx.createGain();
  osc.type = o.type ?? 'sine'; osc.frequency.setValueAtTime(freq, t);
  if (o.detune) osc.detune.value = o.detune;
  if (o.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq * o.slide), t + dur);
  const v = o.vol ?? 0.3, a = o.attack ?? 0.005;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let node: AudioNode = osc;
  if (o.filter) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.filter; osc.connect(f); node = f; }
  node.connect(g); g.connect(o.bus ?? sfxBus); osc.start(t); osc.stop(t + dur + 0.05);
}
function noise(t: number, dur: number, o: { vol?: number; hp?: number; lp?: number; bus?: GainNode } = {}) {
  if (!ctx || !noiseBuf) return;
  const s = ctx.createBufferSource(); s.buffer = noiseBuf;
  const g = ctx.createGain(); const f = ctx.createBiquadFilter();
  f.type = o.hp ? 'highpass' : 'lowpass'; f.frequency.value = o.hp ?? o.lp ?? 2000;
  g.gain.setValueAtTime(o.vol ?? 0.2, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(o.bus ?? sfxBus); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
}
const now = () => (ctx ? ctx.currentTime : 0);
const N = (semi: number) => 220 * Math.pow(2, semi / 12);   // la 220 Hz = 0

export const sfx = {
  coin(combo = 0) { const t = now(), f = 1320 * Math.pow(2, Math.min(combo, 12) / 24); tone(f, t, 0.09, { type: 'square', vol: 0.07 }); tone(f * 1.5, t + 0.05, 0.14, { type: 'square', vol: 0.06 }); },
  jump() { tone(260, now(), 0.22, { type: 'triangle', vol: 0.18, slide: 2.4 }); noise(now(), 0.12, { hp: 3000, vol: 0.05 }); },
  slide() { noise(now(), 0.3, { lp: 900, vol: 0.18 }); },
  lane() { noise(now(), 0.09, { hp: 2500, vol: 0.06 }); },
  land() { tone(90, now(), 0.12, { type: 'sine', vol: 0.25, slide: 0.5 }); },
  crash() { const t = now(); noise(t, 0.7, { lp: 1200, vol: 0.5 }); tone(140, t, 0.6, { type: 'sawtooth', vol: 0.25, slide: 0.25, filter: 900 }); },
  power() { const t = now(); [0, 4, 7, 12, 16].forEach((s, i) => tone(N(s + 12), t + i * 0.06, 0.25, { type: 'triangle', vol: 0.12 })); },
  shield() { tone(600, now(), 0.4, { type: 'sine', vol: 0.18, slide: 0.4 }); noise(now(), 0.3, { hp: 1500, vol: 0.12 }); },
  jet() { noise(now(), 1.2, { lp: 500, vol: 0.25 }); },
  find(combo = 0) { const t = now(); const base = [0, 4, 7, 11, 12, 16, 19][Math.min(combo, 6)]!; tone(N(base + 24), t, 0.18, { type: 'triangle', vol: 0.16 }); tone(N(base + 31), t + 0.07, 0.3, { type: 'sine', vol: 0.14 }); },
  wrong() { const t = now(); tone(180, t, 0.18, { type: 'square', vol: 0.09, filter: 700 }); tone(150, t + 0.1, 0.22, { type: 'square', vol: 0.09, filter: 600 }); },
  hint() { const t = now(); [0, 7, 12].forEach((s, i) => tone(N(s + 19), t + i * 0.08, 0.35, { type: 'sine', vol: 0.1 })); },
  win() { const t = now(); [0, 4, 7, 12, 7, 12, 16, 19].forEach((s, i) => tone(N(s + 12), t + i * 0.09, 0.4, { type: 'triangle', vol: 0.13 })); },
  lose() { const t = now(); [7, 4, 0, -5].forEach((s, i) => tone(N(s + 12), t + i * 0.16, 0.4, { type: 'triangle', vol: 0.12 })); },
  tick() { tone(1800, now(), 0.04, { type: 'square', vol: 0.04 }); },
  go() { const t = now(); tone(N(24), t, 0.5, { type: 'square', vol: 0.12 }); tone(N(31), t, 0.5, { type: 'square', vol: 0.08 }); },
  click() { tone(900, now(), 0.04, { type: 'triangle', vol: 0.08 }); },
};

// ── Musique ──────────────────────────────────────────────────────────────────
const PROG = [[0, 3, 7], [-4, 0, 3], [-7, -4, 0], [-2, 2, 5]];   // la mineur → fa → ré mineur → sol (épique)
function schedule() {
  if (!ctx || !musicOn) return;
  const spb = 60 / bpm / 4;
  while (nextT < ctx.currentTime + 0.12) {
    const s = step % 16, t = nextT;
    if (s === 0) chord = Math.floor(step / 16) % PROG.length;
    const ch = PROG[chord]!;
    if (style === 'rush') {
      if (s % 4 === 0) tone(110, t, 0.22, { type: 'sine', vol: 0.55, slide: 0.35, bus: musicBus });
      if (s % 2 === 1) noise(t, 0.04, { hp: 7000, vol: 0.07, bus: musicBus });
      if (s === 4 || s === 12) noise(t, 0.16, { hp: 1200, vol: 0.13, bus: musicBus });
      if (s % 2 === 0) tone(N(ch[0]! - 12), t, spb * 1.8, { type: 'sawtooth', vol: 0.09, filter: 600, bus: musicBus });
      tone(N(ch[s % 3]! + 12 + (s >= 8 ? 12 : 0)), t, spb * 0.9, { type: 'square', vol: 0.025, filter: 2400, bus: musicBus });
    } else {
      if (s === 0 || s === 10) tone(N(ch[0]! - 12), t, spb * 6, { type: 'sine', vol: 0.12, bus: musicBus });
      if (s % 4 === 2) tone(N(ch[(s / 2) % 3]! + 12), t, spb * 3, { type: 'triangle', vol: 0.035, bus: musicBus });
      if (s === 6 || s === 14) tone(N(ch[2]! + 24), t, spb * 2, { type: 'sine', vol: 0.025, bus: musicBus });
    }
    nextT += spb; step++;
  }
}
export function music(on: boolean, s: Style = style) {
  style = s;
  if (!ctx) return;
  if (on && !musicOn) { musicOn = true; nextT = ctx.currentTime + 0.05; step = 0; timer = window.setInterval(schedule, 25); }
  if (!on && musicOn) { musicOn = false; clearInterval(timer); }
}
export const setTempo = (b: number) => { bpm = Math.max(80, Math.min(170, b)); };
export const duck = (v: number) => { if (ctx) musicBus.gain.setTargetAtTime(v, ctx.currentTime, 0.1); };
