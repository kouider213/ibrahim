import * as THREE from 'three';

// Textures dessinées au canvas au lancement (rien à télécharger) : voie ferrée, façades, wagons tagués, panneaux, ciel lointain.

const canvas = (w: number, h: number) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')!] as const; };
const toTex = (c: HTMLCanvasElement, repeat = false, srgb = true) => {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = 8;
  return t;
};

/** Sol des 3 voies : gravier, traverses en bois, rails brillants. La texture couvre 9 m de large × 8 m de long. */
export function trackTexture(gravel = '#7b6f66', wood = '#5b3d2a') {
  const [c, g] = canvas(512, 512);
  g.fillStyle = gravel; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 9000; i++) {
    const v = Math.random();
    g.fillStyle = `rgba(${v > 0.5 ? 255 : 0},${v > 0.5 ? 245 : 0},${v > 0.5 ? 230 : 0},${0.04 + Math.random() * 0.12})`;
    const s = 1 + Math.random() * 4; g.fillRect(Math.random() * 512, Math.random() * 512, s, s * 0.8);
  }
  const laneW = 512 / 9 * 2.4, x0 = 512 / 2 - laneW * 1.5;
  for (let l = 0; l < 3; l++) {
    const cx = x0 + laneW * (l + 0.5);
    for (let k = 0; k < 8; k++) {   // traverses (une par mètre)
      const y = k * 64 + 18;
      const gr = g.createLinearGradient(0, y, 0, y + 22);
      gr.addColorStop(0, '#00000055'); gr.addColorStop(0.15, wood); gr.addColorStop(0.85, wood); gr.addColorStop(1, '#00000077');
      g.fillStyle = gr; g.fillRect(cx - laneW * 0.42, y, laneW * 0.84, 22);
      g.fillStyle = 'rgba(0,0,0,.18)'; for (let j = 0; j < 4; j++) g.fillRect(cx - laneW * 0.4 + Math.random() * laneW * 0.8, y + 3 + Math.random() * 14, 18 + Math.random() * 30, 1.5);
    }
    for (const s of [-1, 1]) {   // rails
      const rx = cx + s * laneW * 0.27;
      g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(rx - 6, 0, 12, 512);
      const gr = g.createLinearGradient(rx - 4, 0, rx + 4, 0);
      gr.addColorStop(0, '#4a4f57'); gr.addColorStop(0.5, '#e9edf2'); gr.addColorStop(1, '#5a6068');
      g.fillStyle = gr; g.fillRect(rx - 4, 0, 8, 512);
    }
  }
  const t = toTex(c, true); t.repeat.set(1, 1);
  return t;
}

/** Façade d'immeuble : fenêtres (certaines allumées la nuit) + volets. Renvoie [couleur, émission]. */
export function facadeTextures(night: boolean, style: 'oran' | 'brick' | 'neon' | 'chalet' | 'adobe') {
  const [c, g] = canvas(256, 512); const [e, ge] = canvas(256, 512);
  ge.fillStyle = '#000'; ge.fillRect(0, 0, 256, 512);
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 256, 512);
  if (style === 'brick') {
    for (let y = 0; y < 512; y += 10) for (let x = (y / 10) % 2 ? -12 : 0; x < 256; x += 24) { g.fillStyle = `hsl(${8 + Math.random() * 10},${40 + Math.random() * 20}%,${48 + Math.random() * 14}%)`; g.fillRect(x + 1, y + 1, 22, 8); }
  } else if (style === 'adobe' || style === 'oran') {
    for (let i = 0; i < 1600; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.05})`; g.fillRect(Math.random() * 256, Math.random() * 512, 3, 3); }
  } else if (style === 'chalet') {
    for (let x = 0; x < 256; x += 16) { g.fillStyle = `hsl(25,${35 + Math.random() * 10}%,${88 - Math.random() * 8}%)`; g.fillRect(x, 0, 15, 512); }
  } else {
    g.fillStyle = '#d9dde6'; g.fillRect(0, 0, 256, 512);
  }
  const cols = 3, rows = 7, ww = 46, wh = 44;
  for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
    const x = 26 + k * 78, y = 30 + r * 68;
    const lit = night ? Math.random() < 0.55 : false;
    if (style === 'oran') { g.fillStyle = '#2b6cb0'; g.fillRect(x - 9, y - 2, 8, wh + 4); g.fillRect(x + ww + 1, y - 2, 8, wh + 4); }
    if (style === 'adobe') { g.fillStyle = '#5a3a22'; g.beginPath(); g.ellipse(x + ww / 2, y + 10, ww / 2, 14, 0, Math.PI, 0); g.fill(); }
    const gr = g.createLinearGradient(x, y, x + ww, y + wh);
    gr.addColorStop(0, lit ? '#ffe2a0' : '#3a4a62'); gr.addColorStop(1, lit ? '#ffb85c' : '#1b2433');
    g.fillStyle = gr; g.fillRect(x, y, ww, wh);
    g.fillStyle = 'rgba(255,255,255,.28)'; g.fillRect(x + 3, y + 3, ww * 0.35, wh * 0.4);
    g.fillStyle = style === 'neon' ? '#9aa3b5' : '#f4efe6'; g.fillRect(x - 3, y + wh, ww + 6, 5);
    if (lit) { ge.fillStyle = `hsl(${35 + Math.random() * 15},100%,${55 + Math.random() * 15}%)`; ge.fillRect(x, y, ww, wh); }
    if (style === 'neon' && Math.random() < 0.18) { const hue = Math.floor(Math.random() * 360); ge.fillStyle = `hsl(${hue},100%,60%)`; ge.fillRect(x - 6, y + wh + 8, ww + 12, 6); g.fillStyle = ge.fillStyle; g.fillRect(x - 6, y + wh + 8, ww + 12, 6); }
  }
  if (style === 'neon') {   // enseignes verticales
    const hue = Math.floor(Math.random() * 360);
    for (const gg of [g, ge]) { gg.fillStyle = `hsl(${hue},100%,58%)`; gg.fillRect(8, 40, 10, 380); }
  }
  return [toTex(c, true), toTex(e, true)] as const;
}

const GRAFF = ['RUSH', 'DZ', '213', 'ORAN', 'K♥F', 'WOW', 'GO!', 'BOOM', 'YALLA', '♥'];
/** Flanc de wagon tagué (graffitis colorés façon Subway Surfers). */
export function trainSideTexture(base: string, stripe: string) {
  const [c, g] = canvas(1024, 256);
  const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.06, base); gr.addColorStop(0.92, base); gr.addColorStop(1, '#00000088');
  g.fillStyle = gr; g.fillRect(0, 0, 1024, 256);
  g.fillStyle = stripe; g.fillRect(0, 176, 1024, 26);
  // fenêtres
  for (let x = 40; x < 1000; x += 120) {
    const w = g.createLinearGradient(0, 40, 0, 120); w.addColorStop(0, '#9fc8ff'); w.addColorStop(1, '#22344f');
    g.fillStyle = '#1a1f29'; g.fillRect(x - 4, 36, 88, 88); g.fillStyle = w; g.fillRect(x, 40, 80, 80);
    g.fillStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.moveTo(x + 6, 46); g.lineTo(x + 40, 46); g.lineTo(x + 6, 90); g.fill();
  }
  // tags
  const n = 1 + Math.floor(Math.random() * 2);
  for (let i = 0; i < n; i++) {
    const word = GRAFF[Math.floor(Math.random() * GRAFF.length)]!;
    const hue = Math.floor(Math.random() * 360), x = 60 + Math.random() * 600, y = 150 + Math.random() * 60;
    g.save(); g.translate(x, y); g.rotate(-0.08 + Math.random() * 0.16);
    g.font = `900 ${70 + Math.random() * 40}px "Lilita One", Impact, sans-serif`;
    g.lineJoin = 'round'; g.lineWidth = 16; g.strokeStyle = '#111'; g.strokeText(word, 0, 0);
    g.lineWidth = 7; g.strokeStyle = '#fff'; g.strokeText(word, 0, 0);
    const fg = g.createLinearGradient(0, -80, 0, 0); fg.addColorStop(0, `hsl(${hue},100%,65%)`); fg.addColorStop(1, `hsl(${(hue + 60) % 360},100%,50%)`);
    g.fillStyle = fg; g.fillText(word, 0, 0);
    g.restore();
  }
  for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.08})`; g.fillRect(Math.random() * 1024, Math.random() * 256, 2 + Math.random() * 6, 1 + Math.random() * 3); }
  return toTex(c);
}
export function trainFrontTexture(base: string) {
  const [c, g] = canvas(256, 256);
  g.fillStyle = base; g.fillRect(0, 0, 256, 256);
  const w = g.createLinearGradient(0, 30, 0, 130); w.addColorStop(0, '#bfe0ff'); w.addColorStop(1, '#203048');
  g.fillStyle = '#111'; g.fillRect(28, 26, 200, 108); g.fillStyle = w; g.fillRect(34, 32, 188, 96);
  g.fillStyle = 'rgba(255,255,255,.4)'; g.beginPath(); g.moveTo(40, 38); g.lineTo(120, 38); g.lineTo(40, 110); g.fill();
  g.fillStyle = '#ffe9a8'; for (const x of [52, 204]) { g.beginPath(); g.arc(x, 186, 18, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = '#222'; g.fillRect(90, 170, 76, 34);
  g.fillStyle = '#ffd400'; for (let x = 0; x < 256; x += 32) { g.beginPath(); g.moveTo(x, 256); g.lineTo(x + 16, 226); g.lineTo(x + 32, 226); g.lineTo(x + 16, 256); g.fill(); }
  return toTex(c);
}
/** Bandes de chantier jaune/noir ou rouge/blanc. */
export function stripeTexture(a: string, b: string, n = 6) {
  const [c, g] = canvas(256, 64); g.fillStyle = a; g.fillRect(0, 0, 256, 64);
  g.fillStyle = b; const w = 256 / n;
  for (let i = -1; i < n + 1; i++) { g.beginPath(); g.moveTo(i * w, 64); g.lineTo(i * w + w / 2, 0); g.lineTo(i * w + w, 0); g.lineTo(i * w + w / 2, 64); g.fill(); }
  const t = toTex(c, true); return t;
}
/** Silhouette lointaine (montagnes, ville, dunes) en bandeau autour de la scène. */
export function skylineTexture(kind: 'city' | 'mountains' | 'dunes' | 'neon' | 'sea', color: string, color2: string) {
  const [c, g] = canvas(2048, 256);
  g.clearRect(0, 0, 2048, 256);
  const layer = (col: string, h: number, rough: number, base: number) => {
    g.fillStyle = col; g.beginPath(); g.moveTo(0, 256);
    if (kind === 'city' || kind === 'neon') {
      let x = 0; while (x < 2048) { const w = 30 + Math.random() * 70, hh = base + Math.random() * h; g.lineTo(x, 256 - hh); g.lineTo(x + w, 256 - hh); if (Math.random() < 0.15) { g.lineTo(x + w / 2, 256 - hh - 40); } x += w; }
    } else {
      for (let x = 0; x <= 2048; x += 16) { const y = base + h * (0.5 + 0.5 * Math.sin(x / (rough * 1.7)) * Math.sin(x / rough + 1.3)) + (kind === 'mountains' ? Math.random() * 8 : 0); g.lineTo(x, 256 - y); }
    }
    g.lineTo(2048, 256); g.fill();
  };
  if (kind === 'sea') { layer(color, 30, 90, 10); }
  else { layer(color2, kind === 'mountains' ? 170 : 120, 140, 40); layer(color, kind === 'mountains' ? 110 : 80, 70, 10); }
  if (kind === 'neon' || kind === 'city') {
    for (let i = 0; i < 900; i++) { g.fillStyle = kind === 'neon' ? `hsla(${Math.random() * 360},100%,70%,.9)` : 'rgba(255,220,150,.7)'; g.fillRect(Math.random() * 2048, 120 + Math.random() * 136, 2, 2); }
  }
  const t = toTex(c, true); t.wrapT = THREE.ClampToEdgeWrapping; return t;
}
/** Halo doux (soleil, lueurs, particules). */
export function glowTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  const [c, g] = canvas(128, 128);
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, inner); gr.addColorStop(0.25, inner.replace(/,\s*[\d.]+\)$/, ',.6)')); gr.addColorStop(1, outer);
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return toTex(c);
}
/** Nuage cotonneux. */
export function cloudTexture() {
  const [c, g] = canvas(256, 128);
  for (let i = 0; i < 18; i++) {
    const x = 40 + Math.random() * 176, y = 50 + Math.random() * 40, r = 18 + Math.random() * 30;
    const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,.95)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  return toTex(c);
}
/** Étiquette de nom (joueur à deux). */
export function labelTexture(text: string, color: string) {
  const [c, g] = canvas(512, 128);
  g.font = '900 64px "Lilita One", Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const w = Math.min(500, g.measureText(text).width + 70);
  g.fillStyle = color; g.beginPath(); g.roundRect(256 - w / 2, 20, w, 88, 44); g.fill();
  g.fillStyle = '#fff'; g.fillText(text, 256, 66);
  return toTex(c);
}
/** Lettre à ramasser (chasse au mot du jour). */
export function letterTexture(ch: string) {
  const [c, g] = canvas(128, 128);
  const gr = g.createRadialGradient(64, 64, 10, 64, 64, 62); gr.addColorStop(0, '#fff6c2'); gr.addColorStop(1, '#ff9d00');
  g.fillStyle = gr; g.beginPath(); g.arc(64, 64, 58, 0, Math.PI * 2); g.fill();
  g.lineWidth = 6; g.strokeStyle = '#fff'; g.stroke();
  g.font = '900 78px "Lilita One", Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#7a2d00'; g.fillText(ch, 64, 70);
  return toTex(c);
}
/** Icône de bonus (aimant, jetpack…) sur un disque brillant. */
export function badgeTexture(emoji: string, hue: number) {
  const [c, g] = canvas(128, 128);
  const gr = g.createRadialGradient(50, 44, 6, 64, 64, 62); gr.addColorStop(0, `hsl(${hue},100%,85%)`); gr.addColorStop(1, `hsl(${hue},90%,45%)`);
  g.fillStyle = gr; g.beginPath(); g.arc(64, 64, 58, 0, Math.PI * 2); g.fill();
  g.lineWidth = 6; g.strokeStyle = 'rgba(255,255,255,.9)'; g.stroke();
  g.font = '64px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(emoji, 64, 70);
  return toTex(c);
}
