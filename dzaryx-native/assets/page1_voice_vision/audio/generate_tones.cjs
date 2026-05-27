/**
 * Generates futuristic WAV tones using pure Node.js stdlib.
 * PCM 16-bit, 44100 Hz, mono.
 */
const { writeFileSync } = require('fs');
const { join } = require('path');

const SR = 44100;

function makeWav(samples) {
  const dataLen = samples.length * 2;
  const buf = Buffer.alloc(44 + dataLen);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataLen, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);        // PCM
  buf.writeUInt16LE(1, 22);        // mono
  buf.writeUInt32LE(SR, 24);       // sample rate
  buf.writeUInt32LE(SR * 2, 28);   // byte rate
  buf.writeUInt16LE(2, 32);        // block align
  buf.writeUInt16LE(16, 34);       // bits per sample
  buf.write('data', 36);
  buf.writeUInt32LE(dataLen, 40);
  for (let i = 0; i < samples.length; i++) {
    buf.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(samples[i]))), 44 + i * 2);
  }
  return buf;
}

function env(t, attack, decay, sustain, release, dur) {
  if (t < attack) return t / attack;
  if (t < attack + decay) return 1 - (1 - sustain) * (t - attack) / decay;
  if (t < dur - release) return sustain;
  return sustain * Math.max(0, 1 - (t - (dur - release)) / release);
}

// ── startup.wav — soft IA boot chord (1.2 sec) ───────────────────────────────
{
  const dur = 1.2;
  const n = Math.floor(SR * dur);
  const s = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const e = env(t, 0.05, 0.1, 0.6, 0.4, dur);
    // Chord: root 220 Hz + 5th 330 Hz + octave 440 Hz + shimmer 880 Hz
    const sig =
      0.45 * Math.sin(2 * Math.PI * 220 * t) +
      0.30 * Math.sin(2 * Math.PI * 330 * t) +
      0.18 * Math.sin(2 * Math.PI * 440 * t) +
      0.07 * Math.sin(2 * Math.PI * 880 * t);
    // Frequency sweep shimmer on top
    const sweep = 0.06 * Math.sin(2 * Math.PI * (440 + 200 * (t / dur)) * t);
    s[i] = (sig + sweep) * e * 30000;
  }
  writeFileSync(join(__dirname, 'startup.wav'), makeWav(s));
  process.stdout.write(`✓ startup.wav — chord boot (${dur}s) — ${Math.round(n * 2 / 1024)} KB\n`);
}

// ── listening.wav — short bip écoute (0.35 sec, rising tone) ─────────────────
{
  const dur = 0.35;
  const n = Math.floor(SR * dur);
  const s = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const e = env(t, 0.02, 0.05, 0.7, 0.12, dur);
    // Rising sweep 800 → 1200 Hz
    const freq = 800 + 400 * (t / dur);
    const sig = 0.7 * Math.sin(2 * Math.PI * freq * t) +
                0.3 * Math.sin(2 * Math.PI * freq * 2 * t) * 0.3;
    s[i] = sig * e * 28000;
  }
  writeFileSync(join(__dirname, 'listening.wav'), makeWav(s));
  process.stdout.write(`✓ listening.wav — rising bip (${dur}s) — ${Math.round(n * 2 / 1024)} KB\n`);
}

// ── speaking.wav — double bip parole (0.4 sec) ───────────────────────────────
{
  const dur = 0.4;
  const n = Math.floor(SR * dur);
  const s = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    // Two short pips: pip1 at t=0, pip2 at t=0.18
    const pip = (t0, f) => {
      const dt = t - t0;
      if (dt < 0 || dt > 0.12) return 0;
      const e = env(dt, 0.01, 0.03, 0.6, 0.04, 0.12);
      return e * (0.7 * Math.sin(2 * Math.PI * f * dt) + 0.3 * Math.sin(2 * Math.PI * f * 1.5 * dt));
    };
    s[i] = (pip(0, 880) + pip(0.18, 1100)) * 28000;
  }
  writeFileSync(join(__dirname, 'speaking.wav'), makeWav(s));
  process.stdout.write(`✓ speaking.wav — double bip (${dur}s) — ${Math.round(n * 2 / 1024)} KB\n`);
}

process.stdout.write('\nAudio tones generated.\n');
