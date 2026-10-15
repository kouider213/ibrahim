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
