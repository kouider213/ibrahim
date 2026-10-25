// L'ŒIL — bibliothèque de dessins (style dessin animé : dégradés, contour sombre, reflets).
// Chaque dessin est centré sur (0,0), taille ≈ s (diamètre), couleur principale c, variante v.
// `asym` = le dessin n'est pas symétrique (le retourner se voit), `colorable` = la couleur principale change l'objet.

export type G = CanvasRenderingContext2D;
export interface Drawer { draw: (g: G, s: number, c: string, v: number) => void; asym: boolean; colorable: boolean; variants: number }

// ── Couleurs ─────────────────────────────────────────────────────────────────
export function hsl(c: string): [number, number, number] {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(c); if (!m) return [0, 0, 50];
  const r = parseInt(m[1]!, 16) / 255, gg = parseInt(m[2]!, 16) / 255, b = parseInt(m[3]!, 16) / 255;
  const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b), l = (mx + mn) / 2; let h = 0, s = 0;
  if (mx !== mn) { const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (gg - b) / d + (gg < b ? 6 : 0) : mx === gg ? (b - r) / d + 2 : (r - gg) / d + 4; h *= 60; }
  return [h, s * 100, l * 100];
}
export function hex(h: number, s: number, l: number) {
  h = ((h % 360) + 360) % 360; s = Math.max(0, Math.min(100, s)) / 100; l = Math.max(0, Math.min(100, l)) / 100;
  const k = (n: number) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = (n: number) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1)))).toString(16).padStart(2, '0');
  return `#${f(0)}${f(8)}${f(4)}`;
}
export const shade = (c: string, dl: number, ds = 0) => { const [h, s, l] = hsl(c); return hex(h, s + ds, l + dl); };
export const hueShift = (c: string, dh: number) => { const [h, s, l] = hsl(c); return hex(h + dh, s, l); };

const INK = 'rgba(38,24,44,.9)';
function outline(g: G, s: number, w = 0.045) { g.lineWidth = Math.max(1.5, s * w); g.strokeStyle = INK; g.lineJoin = 'round'; g.lineCap = 'round'; g.stroke(); }
function fillGrad(g: G, c: string, x0: number, y0: number, x1: number, y1: number, light = 14, dark = -14) {
  const gr = g.createLinearGradient(x0, y0, x1, y1); gr.addColorStop(0, shade(c, light)); gr.addColorStop(1, shade(c, dark)); g.fillStyle = gr;
}
function radial(g: G, c: string, r: number, ox = -0.3, oy = -0.35) {
  const gr = g.createRadialGradient(r * ox, r * oy, r * 0.1, 0, 0, r * 1.05); gr.addColorStop(0, shade(c, 18)); gr.addColorStop(1, shade(c, -16)); g.fillStyle = gr;
}
function circle(g: G, x: number, y: number, r: number) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); }
function ell(g: G, x: number, y: number, rx: number, ry: number, rot = 0) { g.beginPath(); g.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); }
function rr(g: G, x: number, y: number, w: number, h: number, r: number) { g.beginPath(); g.roundRect(x, y, w, h, r); }
function shine(g: G, x: number, y: number, rx: number, ry: number, a = 0.55) { g.fillStyle = `rgba(255,255,255,${a})`; ell(g, x, y, rx, ry, -0.5); g.fill(); }
function eye(g: G, x: number, y: number, r: number) { g.fillStyle = '#fff'; circle(g, x, y, r); g.fill(); g.fillStyle = '#1d1420'; circle(g, x + r * 0.2, y + r * 0.1, r * 0.55); g.fill(); g.fillStyle = '#fff'; circle(g, x + r * 0.35, y - r * 0.15, r * 0.2); g.fill(); }
function ground(g: G, s: number, a = 0.18) { g.fillStyle = `rgba(20,10,30,${a})`; ell(g, 0, s * 0.48, s * 0.42, s * 0.08); g.fill(); }

const D: Record<string, Drawer> = {};
const def = (name: string, draw: Drawer['draw'], o: Partial<Omit<Drawer, 'draw'>> = {}) => { D[name] = { draw, asym: false, colorable: true, variants: 1, ...o }; };

// ── Nature ───────────────────────────────────────────────────────────────────
def('tree', (g, s, c, v) => {
  ground(g, s);
  g.fillStyle = '#8a5a3b'; rr(g, -s * 0.07, 0, s * 0.14, s * 0.46, s * 0.03); g.fill(); outline(g, s);
  const r = s * 0.3;
  g.beginPath(); for (const [x, y, k] of [[-0.18, -0.05, 0.75], [0.18, -0.05, 0.75], [0, -0.22, 0.9], [0, 0.02, 0.7]] as const) g.arc(x * s, y * s, r * k, 0, Math.PI * 2);
  fillGrad(g, c, 0, -s * 0.5, 0, s * 0.2); g.fill();
  for (const [x, y, k] of [[-0.18, -0.05, 0.75], [0.18, -0.05, 0.75], [0, -0.22, 0.9], [0, 0.02, 0.7]] as const) { circle(g, x * s, y * s, r * k); outline(g, s, 0.03); }
  g.beginPath(); for (const [x, y, k] of [[-0.18, -0.05, 0.75], [0.18, -0.05, 0.75], [0, -0.22, 0.9], [0, 0.02, 0.7]] as const) g.arc(x * s, y * s, r * k - s * 0.01, 0, Math.PI * 2); g.fill();
  shine(g, -s * 0.1, -s * 0.3, s * 0.08, s * 0.04, 0.4);
  if (v % 3 === 1) for (const [x, y] of [[-0.15, -0.1], [0.12, -0.2], [0.05, 0.02], [-0.02, -0.3]]) { g.fillStyle = '#e8333a'; circle(g, x! * s, y! * s, s * 0.035); g.fill(); outline(g, s, 0.02); }
  if (v % 3 === 2) for (const [x, y] of [[-0.15, -0.1], [0.12, -0.2], [0.05, 0.02]]) { g.fillStyle = '#ffd6e8'; circle(g, x! * s, y! * s, s * 0.04); g.fill(); }
}, { variants: 3 });
def('palm', (g, s, c) => {
  ground(g, s);
  g.beginPath(); g.moveTo(-s * 0.04, s * 0.5); g.quadraticCurveTo(s * 0.08, 0, s * 0.02, -s * 0.28); g.lineTo(s * 0.08, -s * 0.28); g.quadraticCurveTo(s * 0.16, 0, s * 0.06, s * 0.5); g.closePath();
  fillGrad(g, '#a87b4f', -s * 0.05, 0, s * 0.1, 0); g.fill(); outline(g, s, 0.03);
  for (let i = 0; i < 6; i++) { g.strokeStyle = 'rgba(60,30,10,.4)'; g.lineWidth = s * 0.012; g.beginPath(); g.moveTo(s * 0.0 + i * 0.012 * s, s * (0.4 - i * 0.12)); g.lineTo(s * 0.09 + i * 0.008 * s, s * (0.38 - i * 0.12)); g.stroke(); }
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI / 2 + (i - 2.5) * 0.55;
    g.save(); g.translate(s * 0.05, -s * 0.28); g.rotate(a + Math.PI / 2);
    g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(s * 0.18, -s * 0.12, s * 0.38, s * 0.06); g.quadraticCurveTo(s * 0.18, -s * 0.02, 0, 0);
    fillGrad(g, c, 0, -s * 0.1, s * 0.3, s * 0.1); g.fill(); outline(g, s, 0.025); g.restore();
  }
  g.fillStyle = '#6b3f1f'; for (const x of [-0.01, 0.07, 0.03]) { circle(g, x * s, -s * 0.25, s * 0.035); g.fill(); }
}, { asym: true });
def('pine', (g, s, c, v) => {
  ground(g, s);
  g.fillStyle = '#7a4a2e'; g.fillRect(-s * 0.05, s * 0.3, s * 0.1, s * 0.18);
  for (let i = 0; i < 3; i++) {
    const y = s * (0.32 - i * 0.24), w = s * (0.38 - i * 0.09);
    g.beginPath(); g.moveTo(-w, y); g.lineTo(0, y - s * 0.32); g.lineTo(w, y); g.closePath(); fillGrad(g, c, 0, y - s * 0.3, 0, y); g.fill(); outline(g, s, 0.03);
    if (v % 2) { g.beginPath(); g.moveTo(-w * 0.45, y - s * 0.18); g.lineTo(0, y - s * 0.32); g.lineTo(w * 0.45, y - s * 0.18); g.quadraticCurveTo(0, y - s * 0.14, -w * 0.45, y - s * 0.18); g.fillStyle = '#fff'; g.fill(); }
  }
  if (v % 3 === 2) { g.fillStyle = '#ffd400'; g.beginPath(); for (let k = 0; k < 10; k++) { const r = k % 2 ? s * 0.03 : s * 0.07, a = k * Math.PI / 5 - Math.PI / 2; g.lineTo(Math.cos(a) * r, -s * 0.47 + Math.sin(a) * r); } g.closePath(); g.fill(); outline(g, s, 0.02); }
}, { variants: 3 });
def('flower', (g, s, c, v) => {
  g.strokeStyle = '#3f8f4f'; g.lineWidth = s * 0.05; g.beginPath(); g.moveTo(0, s * 0.5); g.quadraticCurveTo(s * 0.06, s * 0.2, 0, 0); g.stroke();
  g.fillStyle = '#4caf50'; ell(g, s * 0.1, s * 0.3, s * 0.1, s * 0.04, -0.5); g.fill(); outline(g, s, 0.02);
  const n = 5 + (v % 3);
  for (let i = 0; i < n; i++) { g.save(); g.rotate((i / n) * Math.PI * 2); ell(g, 0, -s * 0.15, s * 0.09, s * 0.15); radial(g, c, s * 0.15); g.fill(); outline(g, s, 0.025); g.restore(); }
  g.fillStyle = '#ffcc33'; circle(g, 0, 0, s * 0.09); g.fill(); outline(g, s, 0.025);
}, { variants: 3 });
def('mushroom', (g, s, c, v) => {
  ground(g, s);
  g.fillStyle = '#fff4e0'; rr(g, -s * 0.12, -s * 0.02, s * 0.24, s * 0.48, s * 0.1); g.fill(); outline(g, s);
  g.beginPath(); g.ellipse(0, 0, s * 0.42, s * 0.34, 0, Math.PI, 0); g.closePath(); fillGrad(g, c, 0, -s * 0.3, 0, 0); g.fill(); outline(g, s);
  g.fillStyle = '#fff'; for (const [x, y, r] of (v % 2 ? [[-0.2, -0.12, 0.06], [0.05, -0.24, 0.07], [0.22, -0.1, 0.05]] : [[-0.12, -0.18, 0.08], [0.18, -0.16, 0.06]]) as Array<[number, number, number]>) { circle(g, x * s, y * s, r * s); g.fill(); }
}, { variants: 2 });
def('bush', (g, s, c, v) => {
  ground(g, s, 0.12);
  g.beginPath(); for (const [x, y, r] of [[-0.25, 0.15, 0.22], [0, 0.05, 0.28], [0.25, 0.15, 0.22]] as const) g.arc(x * s, y * s, r * s, 0, Math.PI * 2);
  fillGrad(g, c, 0, -s * 0.2, 0, s * 0.35); g.fill(); outline(g, s, 0.03);
  if (v % 2) for (const [x, y] of [[-0.2, 0.08], [0.1, -0.05], [0.25, 0.15]]) { g.fillStyle = '#ff6fa5'; circle(g, x! * s, y! * s, s * 0.045); g.fill(); }
}, { variants: 2 });
def('rock', (g, s, c) => {
  ground(g, s, 0.15);
  g.beginPath(); g.moveTo(-s * 0.42, s * 0.35); g.lineTo(-s * 0.3, -s * 0.05); g.lineTo(-s * 0.05, -s * 0.25); g.lineTo(s * 0.25, -s * 0.15); g.lineTo(s * 0.42, s * 0.35); g.closePath();
  fillGrad(g, c, -s * 0.3, -s * 0.2, s * 0.3, s * 0.3); g.fill(); outline(g, s);
  shine(g, -s * 0.12, -s * 0.08, s * 0.08, s * 0.03, 0.35);
}, { asym: true });
def('cloud', (g, s, c) => {
  g.beginPath(); for (const [x, y, r] of [[-0.25, 0.05, 0.2], [0, -0.06, 0.27], [0.25, 0.05, 0.2], [0.05, 0.1, 0.2]] as const) g.arc(x * s, y * s, r * s, 0, Math.PI * 2);
  const gr = g.createLinearGradient(0, -s * 0.3, 0, s * 0.3); gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, '#dfe8f5'); g.fillStyle = gr; g.fill(); void c;
}, { colorable: false });
def('sun', (g, s, c) => {
  g.fillStyle = shade(c, 10); for (let i = 0; i < 12; i++) { g.save(); g.rotate(i * Math.PI / 6); g.beginPath(); g.moveTo(-s * 0.05, -s * 0.3); g.lineTo(0, -s * 0.48); g.lineTo(s * 0.05, -s * 0.3); g.fill(); g.restore(); }
  circle(g, 0, 0, s * 0.3); radial(g, c, s * 0.3); g.fill(); outline(g, s, 0.03);
  eye(g, -s * 0.1, -s * 0.04, s * 0.05); eye(g, s * 0.1, -s * 0.04, s * 0.05);
  g.beginPath(); g.arc(0, s * 0.06, s * 0.1, 0.2, Math.PI - 0.2); g.lineWidth = s * 0.025; g.strokeStyle = INK; g.stroke();
});
def('moon', (g, s, c) => {
  g.beginPath(); g.arc(0, 0, s * 0.4, 0, Math.PI * 2); g.arc(s * 0.18, -s * 0.1, s * 0.34, 0, Math.PI * 2, true); radial(g, c, s * 0.4); g.fill('evenodd');
}, { asym: true });
def('star', (g, s, c, v) => {
  const n = v % 2 ? 6 : 5; g.beginPath();
  for (let k = 0; k < n * 2; k++) { const r = k % 2 ? s * 0.2 : s * 0.46, a = k * Math.PI / n - Math.PI / 2; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
  g.closePath(); radial(g, c, s * 0.45); g.fill(); outline(g, s, 0.03); shine(g, -s * 0.08, -s * 0.12, s * 0.06, s * 0.03);
}, { variants: 2 });
def('butterfly', (g, s, c, v) => {
  for (const sd of [-1, 1]) {
    ell(g, sd * s * 0.2, -s * 0.12, s * 0.2, s * 0.17, sd * 0.3); radial(g, c, s * 0.2); g.fill(); outline(g, s, 0.03);
    ell(g, sd * s * 0.16, s * 0.14, s * 0.14, s * 0.12, -sd * 0.3); radial(g, shade(c, -10, 0), s * 0.14); g.fill(); outline(g, s, 0.03);
    g.fillStyle = v % 2 ? '#fff' : '#1d1420'; circle(g, sd * s * 0.22, -s * 0.13, s * 0.05); g.fill();
  }
  g.fillStyle = '#2d1f33'; ell(g, 0, 0, s * 0.05, s * 0.25); g.fill();
  g.strokeStyle = '#2d1f33'; g.lineWidth = s * 0.02; for (const sd of [-1, 1]) { g.beginPath(); g.moveTo(0, -s * 0.22); g.quadraticCurveTo(sd * s * 0.06, -s * 0.36, sd * s * 0.12, -s * 0.38); g.stroke(); }
}, { variants: 2 });
def('bird', (g, s, c, v) => {
  ell(g, 0, 0, s * 0.3, s * 0.24); radial(g, c, s * 0.3); g.fill(); outline(g, s);
  ell(g, -s * 0.05, s * 0.05, s * 0.16, s * 0.1, 0.4); g.fillStyle = shade(c, -12); g.fill(); outline(g, s, 0.03);
  g.fillStyle = '#ffb02e'; g.beginPath(); g.moveTo(s * 0.27, -s * 0.05); g.lineTo(s * 0.44, 0); g.lineTo(s * 0.27, s * 0.06); g.closePath(); g.fill(); outline(g, s, 0.03);
  eye(g, s * 0.14, -s * 0.08, s * 0.06);
  if (v % 2) { g.fillStyle = '#e8333a'; ell(g, s * 0.02, -s * 0.24, s * 0.05, s * 0.08, -0.3); g.fill(); }
  g.strokeStyle = '#ffb02e'; g.lineWidth = s * 0.03; for (const x of [-0.04, 0.06]) { g.beginPath(); g.moveTo(x * s, s * 0.22); g.lineTo(x * s, s * 0.34); g.stroke(); }
}, { asym: true, variants: 2 });
def('seagull', (g, s) => {
  g.strokeStyle = INK; g.lineWidth = s * 0.06; g.lineCap = 'round';
  g.beginPath(); g.moveTo(-s * 0.4, -s * 0.05); g.quadraticCurveTo(-s * 0.2, -s * 0.25, 0, 0); g.quadraticCurveTo(s * 0.15, -s * 0.2, s * 0.4, -s * 0.1); g.stroke();
  g.strokeStyle = '#fff'; g.lineWidth = s * 0.03; g.stroke();
}, { asym: true, colorable: false });
def('fish', (g, s, c, v) => {
  g.beginPath(); g.moveTo(-s * 0.22, 0); g.lineTo(-s * 0.46, -s * 0.2); g.lineTo(-s * 0.42, 0); g.lineTo(-s * 0.46, s * 0.2); g.closePath(); g.fillStyle = shade(c, -10); g.fill(); outline(g, s, 0.03);
  ell(g, 0, 0, s * 0.32, s * 0.22); radial(g, c, s * 0.32); g.fill(); outline(g, s);
  if (v % 3 === 1) { g.save(); ell(g, 0, 0, s * 0.32, s * 0.22); g.clip(); g.fillStyle = 'rgba(255,255,255,.8)'; for (const x of [-0.1, 0.06]) g.fillRect(x * s, -s * 0.3, s * 0.06, s * 0.6); g.restore(); }
  if (v % 3 === 2) { g.fillStyle = 'rgba(30,20,40,.35)'; for (const [x, y] of [[-0.08, -0.06], [0.04, 0.06], [-0.12, 0.08]]) { circle(g, x! * s, y! * s, s * 0.035); g.fill(); } }
  eye(g, s * 0.16, -s * 0.04, s * 0.07);
  g.beginPath(); g.moveTo(-s * 0.02, -s * 0.2); g.quadraticCurveTo(s * 0.04, -s * 0.34, s * 0.12, -s * 0.2); g.fillStyle = shade(c, -10); g.fill(); outline(g, s, 0.025);
}, { asym: true, variants: 3 });
def('crab', (g, s, c) => {
  g.strokeStyle = shade(c, -18); g.lineWidth = s * 0.04; for (const sd of [-1, 1]) for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(sd * s * 0.2, s * (0.02 + i * 0.07)); g.lineTo(sd * s * (0.36 + i * 0.02), s * (0.12 + i * 0.09)); g.stroke(); }
  for (const sd of [-1, 1]) { circle(g, sd * s * 0.36, -s * 0.2, s * 0.1); radial(g, c, s * 0.1); g.fill(); outline(g, s, 0.03); }
  ell(g, 0, 0, s * 0.3, s * 0.2); radial(g, c, s * 0.3); g.fill(); outline(g, s);
  for (const sd of [-1, 1]) { g.strokeStyle = INK; g.lineWidth = s * 0.025; g.beginPath(); g.moveTo(sd * s * 0.08, -s * 0.15); g.lineTo(sd * s * 0.1, -s * 0.26); g.stroke(); eye(g, sd * s * 0.1, -s * 0.28, s * 0.05); }
});
def('shell', (g, s, c, v) => {
  g.beginPath(); g.moveTo(0, s * 0.35); g.lineTo(-s * 0.38, -s * 0.05); g.quadraticCurveTo(0, -s * 0.5, s * 0.38, -s * 0.05); g.closePath(); radial(g, c, s * 0.4); g.fill(); outline(g, s);
  g.strokeStyle = shade(c, -20); g.lineWidth = s * 0.02; for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(0, s * 0.33); g.lineTo(i * s * (v % 2 ? 0.14 : 0.1), -s * 0.22); g.stroke(); }
}, { variants: 2 });
def('starfish', (g, s, c) => {
  g.beginPath(); for (let k = 0; k < 10; k++) { const r = k % 2 ? s * 0.17 : s * 0.45, a = k * Math.PI / 5 - Math.PI / 2; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); radial(g, c, s * 0.45); g.fill(); outline(g, s, 0.03);
  g.fillStyle = 'rgba(255,255,255,.55)'; for (let k = 0; k < 5; k++) { const a = k * Math.PI * 2 / 5 - Math.PI / 2; circle(g, Math.cos(a) * s * 0.22, Math.sin(a) * s * 0.22, s * 0.025); g.fill(); }
});
def('jelly', (g, s, c) => {
  g.strokeStyle = shade(c, 10); g.lineWidth = s * 0.03; for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(i * s * 0.08, 0); g.bezierCurveTo(i * s * 0.08 + s * 0.06, s * 0.15, i * s * 0.08 - s * 0.06, s * 0.3, i * s * 0.08, s * 0.45); g.stroke(); }
  g.beginPath(); g.ellipse(0, 0, s * 0.3, s * 0.28, 0, Math.PI, 0); g.closePath(); g.globalAlpha = 0.9; radial(g, c, s * 0.3); g.fill(); g.globalAlpha = 1; outline(g, s, 0.03);
  eye(g, -s * 0.09, -s * 0.08, s * 0.045); eye(g, s * 0.09, -s * 0.08, s * 0.045);
});
def('coral', (g, s, c, v) => {
  g.strokeStyle = c; g.lineCap = 'round'; const br = (x: number, y: number, a: number, l: number, d: number) => { if (d === 0) return; const x2 = x + Math.cos(a) * l, y2 = y + Math.sin(a) * l; g.lineWidth = s * 0.05 * (d / 3 + 0.4); g.beginPath(); g.moveTo(x, y); g.lineTo(x2, y2); g.stroke(); br(x2, y2, a - 0.5, l * 0.72, d - 1); br(x2, y2, a + 0.5, l * 0.72, d - 1); };
  br(0, s * 0.45, -Math.PI / 2, s * 0.25, 3 + (v % 2));
}, { asym: true, variants: 2 });
def('weed', (g, s, c) => {
  for (const [x, h] of [[-0.1, 0.9], [0.05, 1], [0.15, 0.7]] as const) { g.beginPath(); g.moveTo(x * s, s * 0.5); for (let i = 1; i <= 6; i++) g.quadraticCurveTo(x * s + (i % 2 ? 1 : -1) * s * 0.1, s * 0.5 - (i - 0.5) * s * h / 6, x * s, s * 0.5 - i * s * h / 6); g.strokeStyle = c; g.lineWidth = s * 0.06; g.stroke(); }
}, { asym: true });
def('bubble', (g, s) => { circle(g, 0, 0, s * 0.4); g.fillStyle = 'rgba(200,240,255,.25)'; g.fill(); g.lineWidth = s * 0.04; g.strokeStyle = 'rgba(255,255,255,.85)'; g.stroke(); shine(g, -s * 0.15, -s * 0.15, s * 0.1, s * 0.05, 0.8); }, { colorable: false });

// ── Objets ───────────────────────────────────────────────────────────────────
def('ball', (g, s, c, v) => {
  ground(g, s, 0.15);
  circle(g, 0, 0, s * 0.4); radial(g, c, s * 0.4); g.fill();
  g.save(); circle(g, 0, 0, s * 0.4); g.clip(); g.fillStyle = v % 2 ? '#fff' : '#ffd400';
  g.beginPath(); g.ellipse(0, 0, s * 0.14, s * 0.42, 0, 0, Math.PI * 2); g.fill(); g.restore();
  circle(g, 0, 0, s * 0.4); outline(g, s); shine(g, -s * 0.14, -s * 0.16, s * 0.1, s * 0.06);
}, { variants: 2 });
def('balloon', (g, s, c) => {
  g.strokeStyle = INK; g.lineWidth = s * 0.015; g.beginPath(); g.moveTo(0, s * 0.2); g.bezierCurveTo(s * 0.08, s * 0.3, -s * 0.08, s * 0.4, 0, s * 0.5); g.stroke();
  ell(g, 0, -s * 0.1, s * 0.25, s * 0.3); radial(g, c, s * 0.3); g.fill(); outline(g, s);
  g.fillStyle = shade(c, -10); g.beginPath(); g.moveTo(-s * 0.04, s * 0.22); g.lineTo(s * 0.04, s * 0.22); g.lineTo(0, s * 0.18); g.fill();
  shine(g, -s * 0.09, -s * 0.22, s * 0.06, s * 0.1);
});
def('umbrella', (g, s, c, v) => {
  g.strokeStyle = '#6b4a2e'; g.lineWidth = s * 0.035; g.beginPath(); g.moveTo(0, -s * 0.2); g.lineTo(s * 0.04, s * 0.5); g.stroke();
  const n = 6; for (let i = 0; i < n; i++) {
    g.beginPath(); g.moveTo(0, -s * 0.4); const a0 = Math.PI + (i / n) * Math.PI, a1 = Math.PI + ((i + 1) / n) * Math.PI;
    g.lineTo(Math.cos(a0) * s * 0.48, -s * 0.12 + Math.sin(a0) * s * 0.02); g.quadraticCurveTo(Math.cos((a0 + a1) / 2) * s * 0.42, -s * 0.06, Math.cos(a1) * s * 0.48, -s * 0.12); g.closePath();
    g.fillStyle = i % 2 ? (v % 2 ? '#ffffff' : '#ffd400') : c; g.fill(); outline(g, s, 0.025);
  }
}, { variants: 2 });
def('boat', (g, s, c, v) => {
  g.beginPath(); g.moveTo(-s * 0.45, 0); g.lineTo(s * 0.45, 0); g.lineTo(s * 0.32, s * 0.2); g.lineTo(-s * 0.32, s * 0.2); g.closePath(); fillGrad(g, c, 0, 0, 0, s * 0.2); g.fill(); outline(g, s);
  g.fillStyle = '#fff'; g.fillRect(-s * 0.4, s * 0.04, s * 0.8, s * 0.03);
  g.strokeStyle = '#6b4a2e'; g.lineWidth = s * 0.03; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -s * 0.48); g.stroke();
  g.beginPath(); g.moveTo(s * 0.02, -s * 0.45); g.lineTo(s * 0.32, -s * 0.05); g.lineTo(s * 0.02, -s * 0.05); g.closePath(); g.fillStyle = v % 2 ? '#ffdede' : '#fffaf0'; g.fill(); outline(g, s, 0.025);
  if (v % 3 === 2) { g.beginPath(); g.moveTo(-s * 0.02, -s * 0.38); g.lineTo(-s * 0.24, -s * 0.05); g.lineTo(-s * 0.02, -s * 0.05); g.closePath(); g.fillStyle = '#ffd400'; g.fill(); outline(g, s, 0.025); }
  g.fillStyle = '#e8333a'; g.beginPath(); g.moveTo(0, -s * 0.48); g.lineTo(s * 0.12, -s * 0.44); g.lineTo(0, -s * 0.4); g.fill();
}, { asym: true, variants: 3 });
def('car', (g, s, c, v) => {
  ground(g, s, 0.2);
  g.beginPath(); g.moveTo(-s * 0.45, s * 0.12); g.lineTo(-s * 0.45, -s * 0.02); g.quadraticCurveTo(-s * 0.4, -s * 0.08, -s * 0.25, -s * 0.08); g.lineTo(-s * 0.15, -s * 0.24); g.lineTo(s * 0.18, -s * 0.24); g.lineTo(s * 0.3, -s * 0.08); g.quadraticCurveTo(s * 0.46, -s * 0.06, s * 0.46, s * 0.04); g.lineTo(s * 0.46, s * 0.12); g.closePath();
  fillGrad(g, c, 0, -s * 0.24, 0, s * 0.12); g.fill(); outline(g, s);
  g.fillStyle = '#bfe3ff'; g.beginPath(); g.moveTo(-s * 0.12, -s * 0.2); g.lineTo(s * 0.0, -s * 0.2); g.lineTo(s * 0.0, -s * 0.09); g.lineTo(-s * 0.21, -s * 0.09); g.closePath(); g.fill(); outline(g, s, 0.02);
  g.beginPath(); g.moveTo(s * 0.04, -s * 0.2); g.lineTo(s * 0.16, -s * 0.2); g.lineTo(s * 0.25, -s * 0.09); g.lineTo(s * 0.04, -s * 0.09); g.closePath(); g.fill(); outline(g, s, 0.02);
  for (const x of [-0.27, 0.27]) { circle(g, x * s, s * 0.13, s * 0.09); g.fillStyle = '#26232b'; g.fill(); outline(g, s, 0.02); g.fillStyle = '#c9ced6'; circle(g, x * s, s * 0.13, s * 0.04); g.fill(); }
  g.fillStyle = '#ffe9a8'; circle(g, s * 0.42, -s * 0.0, s * 0.03); g.fill();
  if (v % 2) { g.fillStyle = '#fff'; g.fillRect(-s * 0.45, s * 0.0, s * 0.91, s * 0.03); }
}, { asym: true, variants: 2 });
def('house', (g, s, c, v) => {
  ground(g, s, 0.15);
  rr(g, -s * 0.36, -s * 0.1, s * 0.72, s * 0.58, s * 0.02); fillGrad(g, c, 0, -s * 0.1, 0, s * 0.48); g.fill(); outline(g, s);
  g.beginPath(); g.moveTo(-s * 0.45, -s * 0.08); g.lineTo(0, -s * 0.46); g.lineTo(s * 0.45, -s * 0.08); g.closePath(); fillGrad(g, '#d9534f', 0, -s * 0.46, 0, -s * 0.08); g.fill(); outline(g, s);
  g.fillStyle = '#7a4a2e'; rr(g, -s * 0.08, s * 0.18, s * 0.16, s * 0.3, s * 0.02); g.fill(); outline(g, s, 0.025);
  const wins = v % 3 === 0 ? [[-0.24, 0.02], [0.12, 0.02]] : v % 3 === 1 ? [[-0.24, 0.02]] : [[-0.24, 0.02], [0.12, 0.02], [-0.06, -0.26]];
  for (const [x, y] of wins) { g.fillStyle = '#bfe3ff'; rr(g, x! * s, y! * s, s * 0.13, s * 0.12, s * 0.015); g.fill(); outline(g, s, 0.02); g.strokeStyle = INK; g.lineWidth = s * 0.012; g.beginPath(); g.moveTo(x! * s + s * 0.065, y! * s); g.lineTo(x! * s + s * 0.065, y! * s + s * 0.12); g.stroke(); }
  g.fillStyle = '#ffcc33'; circle(g, s * 0.05, s * 0.33, s * 0.015); g.fill();
}, { variants: 3, asym: true });
def('lamp', (g, s, c) => {
  ground(g, s, 0.12);
  g.strokeStyle = '#3a3440'; g.lineWidth = s * 0.04; g.beginPath(); g.moveTo(0, s * 0.5); g.lineTo(0, -s * 0.3); g.quadraticCurveTo(0, -s * 0.42, s * 0.14, -s * 0.42); g.stroke();
  g.beginPath(); g.moveTo(s * 0.06, -s * 0.38); g.lineTo(s * 0.24, -s * 0.38); g.lineTo(s * 0.2, -s * 0.3); g.lineTo(s * 0.1, -s * 0.3); g.closePath(); g.fillStyle = '#3a3440'; g.fill();
  g.fillStyle = c; circle(g, s * 0.15, -s * 0.27, s * 0.05); g.fill();
  const gr = g.createRadialGradient(s * 0.15, -s * 0.25, 0, s * 0.15, -s * 0.25, s * 0.25); gr.addColorStop(0, shade(c, 10).replace('#', '#') + '88'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; circle(g, s * 0.15, -s * 0.25, s * 0.25); g.fill();
}, { asym: true });
def('bench', (g, s, c) => {
  ground(g, s, 0.15);
  g.fillStyle = '#3a3440'; for (const x of [-0.32, 0.28]) g.fillRect(x * s, -s * 0.05, s * 0.04, s * 0.35);
  for (const y of [-0.28, -0.16, 0.0]) { rr(g, -s * 0.42, y * s, s * 0.84, s * 0.08, s * 0.02); fillGrad(g, c, 0, y * s, 0, y * s + s * 0.08); g.fill(); outline(g, s, 0.025); }
});
def('kite', (g, s, c, v) => {
  g.strokeStyle = INK; g.lineWidth = s * 0.012; g.beginPath(); g.moveTo(0, s * 0.3); g.bezierCurveTo(s * 0.1, s * 0.4, -s * 0.15, s * 0.45, s * 0.05, s * 0.6); g.stroke();
  for (let i = 0; i < 3; i++) { g.fillStyle = i % 2 ? '#ffd400' : '#e8333a'; g.beginPath(); g.moveTo(s * 0.02 + i * 0.02 * s, s * (0.38 + i * 0.07)); g.lineTo(s * (0.08 + i * 0.01), s * (0.36 + i * 0.07)); g.lineTo(s * (0.05 + i * 0.01), s * (0.42 + i * 0.07)); g.fill(); }
  g.beginPath(); g.moveTo(0, -s * 0.45); g.lineTo(s * 0.26, -s * 0.05); g.lineTo(0, s * 0.3); g.lineTo(-s * 0.26, -s * 0.05); g.closePath(); radial(g, c, s * 0.4); g.fill(); outline(g, s);
  g.strokeStyle = 'rgba(255,255,255,.8)'; g.lineWidth = s * 0.02; g.beginPath(); g.moveTo(0, -s * 0.45); g.lineTo(0, s * 0.3); g.moveTo(-s * 0.26, -s * 0.05); g.lineTo(s * 0.26, -s * 0.05); g.stroke();
  if (v % 2) { g.fillStyle = '#fff'; circle(g, 0, -s * 0.05, s * 0.06); g.fill(); }
}, { asym: true, variants: 2 });
def('gift', (g, s, c, v) => {
  ground(g, s, 0.15);
  rr(g, -s * 0.34, -s * 0.12, s * 0.68, s * 0.56, s * 0.04); fillGrad(g, c, 0, -s * 0.1, 0, s * 0.44); g.fill(); outline(g, s);
  rr(g, -s * 0.38, -s * 0.24, s * 0.76, s * 0.14, s * 0.03); g.fillStyle = shade(c, 8); g.fill(); outline(g, s);
  g.fillStyle = v % 2 ? '#ffd400' : '#ffffff'; g.fillRect(-s * 0.05, -s * 0.24, s * 0.1, s * 0.68);
  for (const sd of [-1, 1]) { ell(g, sd * s * 0.1, -s * 0.3, s * 0.1, s * 0.07, sd * 0.5); g.fill(); outline(g, s, 0.025); }
}, { variants: 2 });
def('cup', (g, s, c, v) => {
  g.beginPath(); g.arc(s * 0.26, 0, s * 0.11, -Math.PI / 2, Math.PI / 2); g.lineWidth = s * 0.06; g.strokeStyle = c; g.stroke();
  g.beginPath(); g.moveTo(-s * 0.28, -s * 0.22); g.lineTo(s * 0.28, -s * 0.22); g.lineTo(s * 0.2, s * 0.3); g.quadraticCurveTo(0, s * 0.38, -s * 0.2, s * 0.3); g.closePath(); fillGrad(g, c, -s * 0.3, 0, s * 0.3, 0, 16, -12); g.fill(); outline(g, s);
  g.fillStyle = '#6b3f1f'; ell(g, 0, -s * 0.2, s * 0.25, s * 0.05); g.fill();
  if (v % 2) { g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = s * 0.025; for (const x of [-0.08, 0.06]) { g.beginPath(); g.moveTo(x * s, -s * 0.3); g.bezierCurveTo(x * s + s * 0.06, -s * 0.38, x * s - s * 0.06, -s * 0.44, x * s, -s * 0.5); g.stroke(); } }
  else { g.fillStyle = '#fff'; circle(g, 0, s * 0.05, s * 0.06); g.fill(); }
}, { asym: true, variants: 2 });
def('teapot', (g, s, c, v) => {
  g.beginPath(); g.moveTo(s * 0.22, s * 0.05); g.quadraticCurveTo(s * 0.45, -s * 0.05, s * 0.46, -s * 0.22); g.lineWidth = s * 0.07; g.strokeStyle = shade(c, -8); g.stroke();
  g.beginPath(); g.arc(-s * 0.3, 0, s * 0.12, Math.PI / 2, -Math.PI / 2); g.lineWidth = s * 0.05; g.stroke();
  ell(g, 0, s * 0.06, s * 0.3, s * 0.26); fillGrad(g, c, -s * 0.3, 0, s * 0.3, 0, 22, -16); g.fill(); outline(g, s);
  g.beginPath(); g.moveTo(-s * 0.14, -s * 0.18); g.lineTo(0, -s * 0.36); g.lineTo(s * 0.14, -s * 0.18); g.closePath(); g.fillStyle = shade(c, 6); g.fill(); outline(g, s, 0.03);
  g.fillStyle = '#ffd400'; circle(g, 0, -s * 0.38, s * 0.04); g.fill();
  g.strokeStyle = v % 2 ? '#ffd400' : '#ffffff'; g.lineWidth = s * 0.025; g.beginPath(); g.moveTo(-s * 0.26, s * 0.06); g.quadraticCurveTo(0, s * 0.14, s * 0.26, s * 0.06); g.stroke();
}, { asym: true, variants: 2 });
def('plate', (g, s, c, v) => {
  ell(g, 0, 0, s * 0.45, s * 0.18); g.fillStyle = '#fbfbfb'; g.fill(); outline(g, s, 0.03);
  ell(g, 0, 0, s * 0.3, s * 0.11); g.strokeStyle = shade(c, 0); g.lineWidth = s * 0.02; g.stroke();
  if (v % 3 === 1) { g.fillStyle = '#e8b04a'; for (const x of [-0.12, 0, 0.12]) { ell(g, x * s, -s * 0.04, s * 0.08, s * 0.05); g.fill(); outline(g, s, 0.02); } }
  if (v % 3 === 2) { g.fillStyle = '#e8333a'; circle(g, -s * 0.06, -s * 0.03, s * 0.06); g.fill(); g.fillStyle = '#4caf50'; circle(g, s * 0.08, -s * 0.03, s * 0.05); g.fill(); }
}, { variants: 3 });
def('jar', (g, s, c, v) => {
  rr(g, -s * 0.25, -s * 0.2, s * 0.5, s * 0.62, s * 0.12); g.fillStyle = 'rgba(220,240,255,.55)'; g.fill(); outline(g, s, 0.03);
  rr(g, -s * 0.22, -s * 0.02 + (v % 2 ? s * 0.12 : 0), s * 0.44, s * (0.42 - (v % 2 ? 0.12 : 0)), s * 0.1); fillGrad(g, c, 0, 0, 0, s * 0.4); g.fill();
  rr(g, -s * 0.2, -s * 0.34, s * 0.4, s * 0.14, s * 0.03); g.fillStyle = shade(c, -20, -20); g.fill(); outline(g, s, 0.03);
  shine(g, -s * 0.12, s * 0.05, s * 0.04, s * 0.12, 0.6);
}, { variants: 2 });
def('pot', (g, s, c, v) => {
  for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (i - 2) * 0.45; g.save(); g.translate(0, -s * 0.05); g.rotate(a + Math.PI / 2); ell(g, 0, -s * 0.2, s * 0.07, s * 0.2); g.fillStyle = i % 2 ? '#3ea84a' : '#2f8f3a'; g.fill(); outline(g, s, 0.02); g.restore(); }
  if (v % 2) { g.fillStyle = '#ff6fa5'; circle(g, 0, -s * 0.4, s * 0.07); g.fill(); outline(g, s, 0.02); }
  g.beginPath(); g.moveTo(-s * 0.24, -s * 0.02); g.lineTo(s * 0.24, -s * 0.02); g.lineTo(s * 0.18, s * 0.42); g.lineTo(-s * 0.18, s * 0.42); g.closePath(); fillGrad(g, c, -s * 0.2, 0, s * 0.2, 0); g.fill(); outline(g, s);
  rr(g, -s * 0.28, -s * 0.06, s * 0.56, s * 0.1, s * 0.02); g.fillStyle = shade(c, 8); g.fill(); outline(g, s, 0.03);
}, { variants: 2 });
def('clock', (g, s, c, v) => {
  circle(g, 0, 0, s * 0.42); radial(g, c, s * 0.42); g.fill(); outline(g, s);
  circle(g, 0, 0, s * 0.34); g.fillStyle = '#fffaf0'; g.fill(); outline(g, s, 0.02);
  g.fillStyle = INK; for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; circle(g, Math.cos(a) * s * 0.28, Math.sin(a) * s * 0.28, s * (i % 3 ? 0.012 : 0.025)); g.fill(); }
  const hA = (v % 4) * Math.PI / 2 - Math.PI / 2;
  g.strokeStyle = INK; g.lineWidth = s * 0.035; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(hA) * s * 0.16, Math.sin(hA) * s * 0.16); g.stroke();
  g.lineWidth = s * 0.02; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -s * 0.25); g.stroke();
}, { variants: 4 });
def('book', (g, s, c, v) => {
  rr(g, -s * 0.3, -s * 0.4, s * 0.6, s * 0.8, s * 0.04); fillGrad(g, c, -s * 0.3, 0, s * 0.3, 0); g.fill(); outline(g, s);
  g.fillStyle = 'rgba(255,255,255,.85)'; g.fillRect(s * 0.22, -s * 0.36, s * 0.05, s * 0.72);
  g.fillStyle = v % 2 ? '#ffd400' : '#ffffff'; rr(g, -s * 0.18, -s * 0.22, s * 0.32, s * 0.12, s * 0.02); g.fill();
  if (v % 3 === 2) { g.fillStyle = '#e8333a'; g.beginPath(); g.moveTo(-s * 0.1, s * 0.4); g.lineTo(-s * 0.1, s * 0.52); g.lineTo(-s * 0.04, s * 0.47); g.lineTo(s * 0.02, s * 0.52); g.lineTo(s * 0.02, s * 0.4); g.fill(); }
}, { variants: 3 });
def('lantern', (g, s, c, v) => {
  g.strokeStyle = '#3a2a1a'; g.lineWidth = s * 0.025; g.beginPath(); g.moveTo(0, -s * 0.5); g.lineTo(0, -s * 0.36); g.stroke();
  g.beginPath(); g.moveTo(-s * 0.1, -s * 0.36); g.lineTo(s * 0.1, -s * 0.36); g.lineTo(s * 0.24, -s * 0.18); g.lineTo(s * 0.2, s * 0.22); g.lineTo(0, s * 0.36); g.lineTo(-s * 0.2, s * 0.22); g.lineTo(-s * 0.24, -s * 0.18); g.closePath();
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, s * 0.3); gr.addColorStop(0, '#fff6c2'); gr.addColorStop(1, c); g.fillStyle = gr; g.fill(); outline(g, s, 0.035);
  g.strokeStyle = shade(c, -30); g.lineWidth = s * 0.02; for (const x of [-0.1, 0, 0.1]) { g.beginPath(); g.moveTo(x * s, -s * 0.34); g.lineTo(x * s * 1.4, s * 0.25); g.stroke(); }
  if (v % 2) { g.fillStyle = '#e8b04a'; g.beginPath(); g.moveTo(-s * 0.04, s * 0.36); g.lineTo(s * 0.04, s * 0.36); g.lineTo(0, s * 0.5); g.fill(); }
}, { variants: 2 });
def('rug', (g, s, c, v) => {
  rr(g, -s * 0.46, -s * 0.28, s * 0.92, s * 0.56, s * 0.03); g.fillStyle = c; g.fill(); outline(g, s, 0.03);
  rr(g, -s * 0.38, -s * 0.2, s * 0.76, s * 0.4, s * 0.02); g.lineWidth = s * 0.03; g.strokeStyle = '#ffd98a'; g.stroke();
  g.fillStyle = v % 2 ? '#1f6feb' : '#ffd98a'; g.beginPath(); g.moveTo(0, -s * 0.14); g.lineTo(s * 0.18, 0); g.lineTo(0, s * 0.14); g.lineTo(-s * 0.18, 0); g.closePath(); g.fill();
  g.strokeStyle = '#ffd98a'; g.lineWidth = s * 0.015; for (let x = -0.44; x <= 0.44; x += 0.06) { g.beginPath(); g.moveTo(x * s, s * 0.28); g.lineTo(x * s, s * 0.34); g.stroke(); }
}, { variants: 2 });
def('cat', (g, s, c, v) => {
  ground(g, s, 0.15);
  g.beginPath(); g.moveTo(-s * 0.2, s * 0.3); g.bezierCurveTo(-s * 0.5, s * 0.35, -s * 0.5, -s * 0.1, -s * 0.36, -s * 0.15); g.lineWidth = s * 0.07; g.strokeStyle = c; g.stroke();
  ell(g, 0, s * 0.18, s * 0.26, s * 0.24); fillGrad(g, c, 0, 0, 0, s * 0.4); g.fill(); outline(g, s);
  circle(g, s * 0.05, -s * 0.15, s * 0.2); fillGrad(g, c, 0, -s * 0.35, 0, 0); g.fill(); outline(g, s);
  for (const sd of [-1, 1]) { g.beginPath(); g.moveTo(s * 0.05 + sd * s * 0.06, -s * 0.3); g.lineTo(s * 0.05 + sd * s * 0.17, -s * 0.42); g.lineTo(s * 0.05 + sd * s * 0.19, -s * 0.22); g.closePath(); g.fillStyle = c; g.fill(); outline(g, s, 0.03); }
  eye(g, -s * 0.03, -s * 0.16, s * 0.045); eye(g, s * 0.13, -s * 0.16, s * 0.045);
  g.fillStyle = '#ff8fa3'; circle(g, s * 0.05, -s * 0.08, s * 0.025); g.fill();
  g.strokeStyle = INK; g.lineWidth = s * 0.01; for (const sd of [-1, 1]) { g.beginPath(); g.moveTo(s * 0.05 + sd * s * 0.05, -s * 0.07); g.lineTo(s * 0.05 + sd * s * 0.2, -s * 0.09); g.stroke(); }
  if (v % 2) { g.strokeStyle = shade(c, -22); g.lineWidth = s * 0.03; for (const x of [-0.08, 0.02, 0.12]) { g.beginPath(); g.moveTo(x * s, s * 0.0); g.lineTo(x * s + s * 0.02, s * 0.12); g.stroke(); } }
}, { asym: true, variants: 2 });
def('duck', (g, s, c) => {
  ell(g, 0, s * 0.12, s * 0.34, s * 0.22); radial(g, c, s * 0.34); g.fill(); outline(g, s);
  circle(g, s * 0.16, -s * 0.18, s * 0.16); radial(g, c, s * 0.16); g.fill(); outline(g, s);
  g.fillStyle = '#ff9d2e'; ell(g, s * 0.34, -s * 0.15, s * 0.1, s * 0.05); g.fill(); outline(g, s, 0.025);
  eye(g, s * 0.2, -s * 0.22, s * 0.04);
  ell(g, -s * 0.06, s * 0.08, s * 0.14, s * 0.08, -0.3); g.fillStyle = shade(c, -10); g.fill(); outline(g, s, 0.025);
}, { asym: true });
def('teddy', (g, s, c, v) => {
  ground(g, s, 0.15);
  for (const sd of [-1, 1]) { circle(g, sd * s * 0.17, -s * 0.36, s * 0.08); g.fillStyle = c; g.fill(); outline(g, s, 0.03); }
  ell(g, 0, s * 0.18, s * 0.24, s * 0.26); fillGrad(g, c, 0, 0, 0, s * 0.4); g.fill(); outline(g, s);
  for (const sd of [-1, 1]) { circle(g, sd * s * 0.2, s * 0.36, s * 0.09); g.fillStyle = c; g.fill(); outline(g, s, 0.03); }
  circle(g, 0, -s * 0.2, s * 0.2); fillGrad(g, c, 0, -s * 0.4, 0, 0); g.fill(); outline(g, s);
  ell(g, 0, -s * 0.13, s * 0.09, s * 0.06); g.fillStyle = shade(c, 20); g.fill();
  g.fillStyle = INK; circle(g, 0, -s * 0.15, s * 0.025); g.fill(); circle(g, -s * 0.07, -s * 0.23, s * 0.02); g.fill(); circle(g, s * 0.07, -s * 0.23, s * 0.02); g.fill();
  if (v % 2) { g.fillStyle = '#e8333a'; g.beginPath(); g.moveTo(0, -s * 0.02); g.lineTo(-s * 0.1, -s * 0.07); g.lineTo(-s * 0.1, s * 0.03); g.closePath(); g.moveTo(0, -s * 0.02); g.lineTo(s * 0.1, -s * 0.07); g.lineTo(s * 0.1, s * 0.03); g.closePath(); g.fill(); }
}, { variants: 2 });
def('blocks', (g, s, c, v) => {
  ground(g, s, 0.15);
  const L = ['A', 'B', 'C', 'D'];
  const cub = (x: number, y: number, col: string, ch: string) => { rr(g, x - s * 0.16, y - s * 0.16, s * 0.32, s * 0.32, s * 0.03); fillGrad(g, col, x, y - s * 0.16, x, y + s * 0.16); g.fill(); outline(g, s, 0.03); g.fillStyle = '#fff'; g.font = `900 ${s * 0.22}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(ch, x, y + s * 0.01); };
  cub(-s * 0.17, s * 0.28, c, L[v % 4]!); cub(s * 0.17, s * 0.28, hueShift(c, 120), 'B'); cub(0, -s * 0.05, hueShift(c, 240), 'C');
}, { variants: 4 });
def('rocket', (g, s, c, v) => {
  g.save(); g.rotate(0.35);
  g.fillStyle = '#ffb02e'; g.beginPath(); g.moveTo(-s * 0.08, s * 0.3); g.lineTo(0, s * 0.52); g.lineTo(s * 0.08, s * 0.3); g.fill();
  for (const sd of [-1, 1]) { g.beginPath(); g.moveTo(sd * s * 0.1, s * 0.1); g.lineTo(sd * s * 0.22, s * 0.32); g.lineTo(sd * s * 0.1, s * 0.3); g.closePath(); g.fillStyle = shade(c, -10); g.fill(); outline(g, s, 0.03); }
  g.beginPath(); g.moveTo(0, -s * 0.46); g.bezierCurveTo(s * 0.18, -s * 0.3, s * 0.14, s * 0.1, s * 0.1, s * 0.3); g.lineTo(-s * 0.1, s * 0.3); g.bezierCurveTo(-s * 0.14, s * 0.1, -s * 0.18, -s * 0.3, 0, -s * 0.46); g.fillStyle = '#f4f6fb'; g.fill(); outline(g, s);
  g.beginPath(); g.moveTo(0, -s * 0.46); g.bezierCurveTo(s * 0.1, -s * 0.38, s * 0.13, -s * 0.3, s * 0.14, -s * 0.24); g.lineTo(-s * 0.14, -s * 0.24); g.bezierCurveTo(-s * 0.13, -s * 0.3, -s * 0.1, -s * 0.38, 0, -s * 0.46); g.fillStyle = c; g.fill();
  circle(g, 0, -s * 0.05, s * 0.07); g.fillStyle = '#7cc6ff'; g.fill(); outline(g, s, 0.025);
  if (v % 2) { g.fillStyle = c; g.fillRect(-s * 0.12, s * 0.12, s * 0.24, s * 0.05); }
  g.restore();
}, { asym: true, variants: 2 });
def('planet', (g, s, c, v) => {
  circle(g, 0, 0, s * 0.3); radial(g, c, s * 0.3); g.fill(); outline(g, s, 0.03);
  g.save(); circle(g, 0, 0, s * 0.3); g.clip(); g.fillStyle = 'rgba(255,255,255,.18)'; for (const y of [-0.12, 0.05, 0.18]) g.fillRect(-s * 0.3, y * s, s * 0.6, s * 0.05); g.restore();
  if (v % 2 === 0) { g.beginPath(); g.ellipse(0, 0, s * 0.48, s * 0.12, -0.35, 0.15, Math.PI - 0.15, true); g.lineWidth = s * 0.05; g.strokeStyle = shade(c, 25); g.stroke(); }
}, { variants: 2 });
def('ufo', (g, s, c, v) => {
  g.fillStyle = 'rgba(160,255,200,.25)'; g.beginPath(); g.moveTo(-s * 0.15, s * 0.05); g.lineTo(s * 0.15, s * 0.05); g.lineTo(s * 0.3, s * 0.5); g.lineTo(-s * 0.3, s * 0.5); g.fill();
  ell(g, 0, -s * 0.08, s * 0.18, s * 0.16); g.fillStyle = 'rgba(180,230,255,.85)'; g.fill(); outline(g, s, 0.03);
  ell(g, 0, 0, s * 0.45, s * 0.12); fillGrad(g, c, 0, -s * 0.1, 0, s * 0.1); g.fill(); outline(g, s);
  g.fillStyle = v % 2 ? '#ffd400' : '#ff3d6e'; for (const x of [-0.3, -0.1, 0.1, 0.3]) { circle(g, x * s, s * 0.02, s * 0.03); g.fill(); }
  g.fillStyle = '#7ddc6f'; circle(g, 0, -s * 0.1, s * 0.07); g.fill(); eye(g, 0, -s * 0.12, s * 0.035);
}, { variants: 2 });
def('alien', (g, s, c, v) => {
  ground(g, s, 0.15);
  ell(g, 0, s * 0.22, s * 0.18, s * 0.22); fillGrad(g, c, 0, 0, 0, s * 0.44); g.fill(); outline(g, s);
  circle(g, 0, -s * 0.15, s * 0.22); fillGrad(g, c, 0, -s * 0.37, 0, 0); g.fill(); outline(g, s);
  for (const sd of [-1, 1]) { g.strokeStyle = INK; g.lineWidth = s * 0.02; g.beginPath(); g.moveTo(sd * s * 0.08, -s * 0.34); g.lineTo(sd * s * 0.14, -s * 0.46); g.stroke(); g.fillStyle = '#ffd400'; circle(g, sd * s * 0.14, -s * 0.47, s * 0.035); g.fill(); }
  if (v % 2) eye(g, 0, -s * 0.16, s * 0.1); else { eye(g, -s * 0.08, -s * 0.16, s * 0.06); eye(g, s * 0.08, -s * 0.16, s * 0.06); }
}, { variants: 2 });
def('snowman', (g, s, c, v) => {
  ground(g, s, 0.12);
  for (const [y, r] of [[0.25, 0.24], [-0.05, 0.18], [-0.3, 0.13]] as const) { circle(g, 0, y * s, r * s); const gr = g.createRadialGradient(-r * s * 0.3, y * s - r * s * 0.3, 0, 0, y * s, r * s); gr.addColorStop(0, '#fff'); gr.addColorStop(1, '#cfdcef'); g.fillStyle = gr; g.fill(); outline(g, s, 0.03); }
  g.fillStyle = c; g.fillRect(-s * 0.14, -s * 0.2, s * 0.28, s * 0.05);
  if (v % 2) { rr(g, -s * 0.1, -s * 0.56, s * 0.2, s * 0.16, s * 0.02); g.fillStyle = '#26232b'; g.fill(); g.fillRect(-s * 0.15, -s * 0.42, s * 0.3, s * 0.03); }
  g.fillStyle = '#ff8a00'; g.beginPath(); g.moveTo(0, -s * 0.3); g.lineTo(s * 0.14, -s * 0.28); g.lineTo(0, -s * 0.26); g.fill();
  g.fillStyle = INK; circle(g, -s * 0.05, -s * 0.34, s * 0.02); g.fill(); circle(g, s * 0.05, -s * 0.34, s * 0.02); g.fill();
  for (const y of [-0.08, 0.0, 0.18]) { circle(g, 0, y * s, s * 0.022); g.fill(); }
}, { asym: true, variants: 2 });
def('camel', (g, s, c, v) => {
  ground(g, s, 0.15);
  g.strokeStyle = shade(c, -10); g.lineWidth = s * 0.06; for (const x of [-0.25, -0.12, 0.12, 0.25]) { g.beginPath(); g.moveTo(x * s, s * 0.1); g.lineTo(x * s, s * 0.45); g.stroke(); }
  g.beginPath(); g.moveTo(-s * 0.32, s * 0.12); g.quadraticCurveTo(-s * 0.32, -s * 0.05, -s * 0.18, -s * 0.05);
  g.quadraticCurveTo(-s * 0.1, -s * (v % 2 ? 0.22 : 0.28), 0, -s * 0.06); if (v % 2) g.quadraticCurveTo(s * 0.1, -s * 0.24, s * 0.2, -s * 0.05); else g.lineTo(s * 0.2, -s * 0.05);
  g.quadraticCurveTo(s * 0.3, -s * 0.04, s * 0.3, s * 0.12); g.closePath(); fillGrad(g, c, 0, -s * 0.25, 0, s * 0.12); g.fill(); outline(g, s);
  g.beginPath(); g.moveTo(s * 0.26, 0); g.quadraticCurveTo(s * 0.34, -s * 0.2, s * 0.36, -s * 0.3); g.lineWidth = s * 0.08; g.strokeStyle = c; g.stroke();
  ell(g, s * 0.42, -s * 0.32, s * 0.09, s * 0.06); g.fillStyle = c; g.fill(); outline(g, s, 0.03);
  g.fillStyle = INK; circle(g, s * 0.42, -s * 0.35, s * 0.015); g.fill();
}, { asym: true, variants: 2 });
def('tent', (g, s, c, v) => {
  ground(g, s, 0.15);
  g.beginPath(); g.moveTo(-s * 0.45, s * 0.4); g.lineTo(0, -s * 0.35); g.lineTo(s * 0.45, s * 0.4); g.closePath(); fillGrad(g, c, -s * 0.4, 0, s * 0.4, 0); g.fill(); outline(g, s);
  g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.moveTo(-s * 0.1, s * 0.4); g.lineTo(0, s * 0.05); g.lineTo(s * 0.1, s * 0.4); g.fill();
  g.strokeStyle = v % 2 ? '#ffd98a' : '#fff'; g.lineWidth = s * 0.025; g.beginPath(); g.moveTo(-s * 0.32, s * 0.22); g.lineTo(s * 0.32, s * 0.22); g.stroke();
  g.fillStyle = '#e8333a'; g.beginPath(); g.moveTo(0, -s * 0.35); g.lineTo(0, -s * 0.5); g.lineTo(s * 0.1, -s * 0.45); g.lineTo(0, -s * 0.42); g.fill();
}, { variants: 2 });
def('cactus', (g, s, c, v) => {
  ground(g, s, 0.15);
  const seg = (x: number, y: number, w: number, h: number) => { rr(g, x - w / 2, y - h, w, h, w / 2); fillGrad(g, c, x - w / 2, 0, x + w / 2, 0); g.fill(); outline(g, s, 0.03); };
  seg(-s * 0.2, s * 0.05, s * 0.12, s * 0.28); seg(s * 0.2, -s * 0.05, s * 0.12, s * 0.25);
  g.fillStyle = c; g.fillRect(-s * 0.2, -s * 0.05, s * 0.1, s * 0.1); g.fillRect(s * 0.1, -s * 0.12, s * 0.1, s * 0.1);
  seg(0, s * 0.45, s * 0.2, s * 0.85);
  if (v % 2) { g.fillStyle = '#ff6fa5'; circle(g, 0, -s * 0.42, s * 0.06); g.fill(); outline(g, s, 0.02); }
}, { variants: 2, asym: true });
def('ice', (g, s, c, v) => {
  g.beginPath(); g.moveTo(-s * 0.16, -s * 0.02); g.lineTo(0, s * 0.48); g.lineTo(s * 0.16, -s * 0.02); g.closePath(); fillGrad(g, '#e3a55a', 0, 0, 0, s * 0.5); g.fill(); outline(g, s, 0.03);
  g.strokeStyle = 'rgba(120,60,20,.5)'; g.lineWidth = s * 0.012; for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(-s * 0.14 + i * s * 0.05, 0); g.lineTo(s * 0.06 + i * s * 0.03, s * 0.3); g.stroke(); }
  const scoops = v % 2 ? 2 : 1;
  for (let i = 0; i < scoops; i++) { circle(g, 0, -s * (0.1 + i * 0.2), s * 0.17); radial(g, i ? hueShift(c, 160) : c, s * 0.17); g.fill(); outline(g, s, 0.03); }
  g.fillStyle = '#e8333a'; circle(g, 0, -s * (0.26 + (scoops - 1) * 0.2), s * 0.04); g.fill();
}, { variants: 2 });
def('castle', (g, s, c, v) => {
  ground(g, s, 0.12);
  g.fillStyle = c; g.fillRect(-s * 0.36, -s * 0.05, s * 0.72, s * 0.45);
  for (const x of [-0.36, -0.12, 0.12]) { g.fillRect(x * s, -s * 0.15, s * 0.1, s * 0.1); }
  rr(g, -s * 0.12, -s * 0.38, s * 0.24, s * 0.35, s * 0.02); g.fill();
  for (const x of [-0.12, 0.02]) g.fillRect(x * s, -s * 0.46, s * 0.08, s * 0.08);
  g.beginPath(); g.rect(-s * 0.36, -s * 0.05, s * 0.72, s * 0.45); outline(g, s, 0.03);
  g.fillStyle = shade(c, -25); rr(g, -s * 0.07, s * 0.18, s * 0.14, s * 0.22, s * 0.07); g.fill();
  if (v % 2) { g.fillStyle = '#e8333a'; g.beginPath(); g.moveTo(0, -s * 0.46); g.lineTo(0, -s * 0.6); g.lineTo(s * 0.12, -s * 0.55); g.lineTo(0, -s * 0.5); g.fill(); }
}, { variants: 2 });
def('towel', (g, s, c, v) => {
  g.save(); g.transform(1, 0, -0.4, 0.5, 0, 0);
  rr(g, -s * 0.4, -s * 0.5, s * 0.8, s * 1.0, s * 0.03); g.fillStyle = c; g.fill(); outline(g, s, 0.05);
  g.fillStyle = v % 2 ? '#ffffff' : '#ffd400'; for (let i = 0; i < 4; i++) g.fillRect(-s * 0.4, -s * 0.4 + i * s * 0.25, s * 0.8, s * 0.08);
  g.restore();
}, { variants: 2 });
def('window', (g, s, c, v) => {
  rr(g, -s * 0.4, -s * 0.4, s * 0.8, s * 0.8, s * 0.04); g.fillStyle = shade(c, 0); g.fill(); outline(g, s);
  const gr = g.createLinearGradient(0, -s * 0.34, 0, s * 0.34); gr.addColorStop(0, '#8fd0ff'); gr.addColorStop(1, '#e6f5ff'); g.fillStyle = gr; rr(g, -s * 0.33, -s * 0.33, s * 0.66, s * 0.66, s * 0.02); g.fill();
  g.fillStyle = '#fff'; circle(g, s * 0.12, -s * 0.12, s * 0.08); g.fill();
  g.strokeStyle = shade(c, 0); g.lineWidth = s * 0.05; g.beginPath(); g.moveTo(0, -s * 0.34); g.lineTo(0, s * 0.34); if (v % 2) { g.moveTo(-s * 0.34, 0); g.lineTo(s * 0.34, 0); } g.stroke();
}, { variants: 2 });
def('fruit', (g, s, c, v) => {
  const k = v % 4;
  if (k === 0) { circle(g, 0, s * 0.04, s * 0.32); radial(g, c, s * 0.32); g.fill(); outline(g, s); g.strokeStyle = '#6b3f1f'; g.lineWidth = s * 0.04; g.beginPath(); g.moveTo(0, -s * 0.24); g.lineTo(s * 0.04, -s * 0.38); g.stroke(); g.fillStyle = '#4caf50'; ell(g, s * 0.13, -s * 0.32, s * 0.1, s * 0.05, -0.5); g.fill(); outline(g, s, 0.02); shine(g, -s * 0.12, -s * 0.08, s * 0.07, s * 0.04); }
  if (k === 1) { g.beginPath(); g.moveTo(-s * 0.4, -s * 0.15); g.quadraticCurveTo(-s * 0.1, s * 0.45, s * 0.42, -s * 0.12); g.quadraticCurveTo(s * 0.0, s * 0.18, -s * 0.4, -s * 0.15); g.fillStyle = '#ffd84a'; g.fill(); outline(g, s); }
  if (k === 2) { for (const [x, y] of [[-0.12, -0.15], [0.12, -0.15], [0, -0.15], [-0.07, 0.02], [0.07, 0.02], [0, 0.18], [-0.18, -0.02], [0.18, -0.02]]) { circle(g, x! * s, y! * s, s * 0.1); radial(g, c, s * 0.1); g.fill(); outline(g, s, 0.02); } }
  if (k === 3) { ell(g, 0, s * 0.08, s * 0.24, s * 0.3); radial(g, c, s * 0.3); g.fill(); outline(g, s); g.fillStyle = '#4caf50'; for (let i = -1; i <= 1; i++) { g.beginPath(); g.moveTo(0, -s * 0.2); g.lineTo(i * s * 0.12, -s * 0.42); g.lineTo(i * s * 0.05 + s * 0.03, -s * 0.2); g.fill(); } }
}, { variants: 4 });

export const ART = D;
export const DRAWER_NAMES = Object.keys(D);
