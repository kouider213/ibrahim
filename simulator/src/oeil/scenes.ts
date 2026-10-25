import { ART, shade, hueShift, type G } from './art.ts';
import { rng, type Rng } from '../games/net.ts';

// L'ŒIL — décors + placement des objets + choix des différences, tout à partir d'une graine :
// même graine + même niveau de difficulté = exactement la même image sur les deux téléphones.

export const W = 1200, H = 900;
export type Mode = 'facile' | 'normal' | 'difficile';
export interface Obj { kind: string; x: number; y: number; s: number; c: string; v: number; f: boolean; r: number }
export type DiffKind = 'remove' | 'add' | 'color' | 'flip' | 'size' | 'variant' | 'move' | 'bg';
export interface Diff { kind: DiffKind; x: number; y: number; r: number; idx: number }
export interface Puzzle { theme: Theme; seed: number; mode: Mode; a: Obj[]; b: Obj[]; diffs: Diff[]; bgMods: Record<string, number> }

type Region = 'sky' | 'ground' | 'water' | 'wall' | 'shelf' | 'any';
interface Item { kind: string; w: number; region: Region; s: [number, number]; colors?: string[] }
export interface Theme {
  id: string; name: string; nameAr: string; emoji: string; horizon: number;   // y du sol (0-1)
  bg: (g: G, R: Rng, mods: Record<string, number>) => void; items: Item[]; count: [number, number, number]; palette: string[];
  bgDiffs: Array<{ key: string; x: number; y: number; r: number }>;
}

const P_WARM = ['#e8333a', '#ff8a00', '#ffcc33', '#2fbf71', '#1f9bf0', '#8b5cf6', '#ff5fa2', '#14b8a6'];
const P_SEA = ['#ff8a00', '#ffcc33', '#ff5fa2', '#8b5cf6', '#14b8a6', '#e8333a', '#1f9bf0'];

function sky(g: G, top: string, bot: string, h: number) { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, top); gr.addColorStop(1, bot); g.fillStyle = gr; g.fillRect(0, 0, W, h); }
function band(g: G, y: number, h: number, a: string, b: string) { const gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, a); gr.addColorStop(1, b); g.fillStyle = gr; g.fillRect(0, y, W, h); }
function hills(g: G, y: number, amp: number, col: string, R: Rng, f = 0.006) { const ph = R() * 10; g.fillStyle = col; g.beginPath(); g.moveTo(0, H); for (let x = 0; x <= W; x += 20) g.lineTo(x, y - Math.sin(x * f + ph) * amp - Math.sin(x * f * 2.3 + ph) * amp * 0.4); g.lineTo(W, H); g.fill(); }
function speckle(g: G, R: Rng, y0: number, y1: number, n: number, col: string, size = 3) { g.fillStyle = col; for (let i = 0; i < n; i++) { g.beginPath(); g.arc(R() * W, y0 + R() * (y1 - y0), R() * size + 0.5, 0, Math.PI * 2); g.fill(); } }

export const THEMES: Theme[] = [
  { id: 'plage', name: 'La plage d\'Oran', nameAr: 'شاطئ وهران', emoji: '🏖️', horizon: 0.5, palette: P_WARM, count: [16, 22, 30],
    bgDiffs: [{ key: 'sunX', x: 980, y: 140, r: 90 }, { key: 'buoy', x: 300, y: 395, r: 50 }],
    bg: (g, R, m) => {
      sky(g, '#4aa8ff', '#bfe6ff', 380);
      g.fillStyle = 'rgba(255,240,180,.9)'; g.beginPath(); g.arc(m.sunX ? 820 : 980, 140, 70, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(255,240,180,.25)'; g.beginPath(); g.arc(m.sunX ? 820 : 980, 140, 110, 0, Math.PI * 2); g.fill();
      hills(g, 380, 18, '#6c8fb3', R, 0.004); // montagnes au loin (Santa Cruz)
      g.fillStyle = '#f4f1ea'; g.fillRect(140, 300, 16, 40); g.beginPath(); g.moveTo(130, 300); g.lineTo(148, 270); g.lineTo(166, 300); g.fill();
      band(g, 380, 90, '#1f8fd6', '#5cc8f0');
      g.strokeStyle = 'rgba(255,255,255,.6)'; g.lineWidth = 3; for (let i = 0; i < 26; i++) { const x = R() * W, y = 390 + R() * 70; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 12, y - 5, x + 24, y); g.stroke(); }
      g.fillStyle = m.buoy ? '#ffcc33' : '#e8333a'; g.beginPath(); g.arc(300, 405, 14, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#26232b'; g.lineWidth = 3; g.stroke();
      band(g, 450, 30, '#f8f2dc', '#f3e2b5');
      band(g, 470, 430, '#f6dca2', '#e9c27c'); speckle(g, R, 480, 900, 500, 'rgba(160,110,50,.25)', 2.5);
    },
    items: [
      { kind: 'umbrella', w: 3, region: 'ground', s: [120, 190] }, { kind: 'towel', w: 3, region: 'ground', s: [110, 160] }, { kind: 'ball', w: 3, region: 'ground', s: [50, 80] },
      { kind: 'castle', w: 2, region: 'ground', s: [80, 120], colors: ['#e8c27c', '#d9ad62'] }, { kind: 'crab', w: 3, region: 'ground', s: [45, 70] }, { kind: 'shell', w: 3, region: 'ground', s: [30, 50] },
      { kind: 'starfish', w: 3, region: 'ground', s: [35, 55] }, { kind: 'ice', w: 2, region: 'ground', s: [60, 85] }, { kind: 'palm', w: 2, region: 'ground', s: [200, 260], colors: ['#3ea84a', '#2f8f3a'] },
      { kind: 'boat', w: 3, region: 'water', s: [80, 130] }, { kind: 'seagull', w: 3, region: 'sky', s: [40, 70] }, { kind: 'cloud', w: 2, region: 'sky', s: [120, 200] }, { kind: 'kite', w: 2, region: 'sky', s: [60, 90] },
      { kind: 'cup', w: 1, region: 'ground', s: [40, 55] },
    ] },
  { id: 'cuisine', name: 'La cuisine de maman', nameAr: 'مطبخ أمي', emoji: '🍲', horizon: 0.62, palette: ['#e8333a', '#1f9bf0', '#2fbf71', '#ffcc33', '#ff8a00', '#8b5cf6', '#14b8a6'], count: [16, 22, 30],
    bgDiffs: [{ key: 'tile', x: 600, y: 470, r: 60 }, { key: 'handle', x: 1040, y: 700, r: 50 }],
    bg: (g, R, m) => {
      band(g, 0, 560, '#fff4e3', '#ffe8cc');
      for (let y = 380; y < 560; y += 46) for (let x = (y / 46) % 2 ? -23 : 0; x < W; x += 46) { g.fillStyle = (x + y) % 3 ? '#e7f3ff' : '#d4eaff'; if (m.tile && Math.abs(x - 590) < 30 && Math.abs(y - 460) < 30) g.fillStyle = '#ffd6e0'; g.fillRect(x + 2, y + 2, 42, 42); }
      g.fillStyle = '#c98d52'; g.fillRect(0, 210, W, 16); g.fillStyle = '#b07a48'; g.fillRect(0, 226, W, 6);   // étagère
      g.fillStyle = '#d9a066'; g.fillRect(0, 548, W, 26); g.fillStyle = '#8b5a3c'; g.fillRect(0, 574, W, 326);   // plan de travail + placards
      for (let x = 20; x < W; x += 240) { g.fillStyle = '#9c6a46'; g.beginPath(); g.roundRect(x, 600, 220, 280, 12); g.fill(); g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 3; g.stroke(); g.fillStyle = '#ffd98a'; g.fillRect(x + (x === 980 && m.handle ? 30 : 180), 690, 12, 40); }
    },
    items: [
      { kind: 'jar', w: 3, region: 'shelf', s: [60, 90] }, { kind: 'book', w: 1, region: 'shelf', s: [60, 90] }, { kind: 'pot', w: 2, region: 'shelf', s: [70, 100] }, { kind: 'clock', w: 1, region: 'wall', s: [90, 120] },
      { kind: 'window', w: 1, region: 'wall', s: [150, 190], colors: ['#ffffff', '#f4efe6'] }, { kind: 'teapot', w: 3, region: 'ground', s: [80, 120] }, { kind: 'cup', w: 3, region: 'ground', s: [50, 75] },
      { kind: 'plate', w: 3, region: 'ground', s: [90, 130] }, { kind: 'fruit', w: 4, region: 'ground', s: [45, 70] }, { kind: 'cat', w: 1, region: 'ground', s: [100, 130], colors: ['#f0a85a', '#9aa3ad', '#2d2a33'] },
      { kind: 'lantern', w: 1, region: 'wall', s: [70, 100] },
    ] },
  { id: 'jardin', name: 'Le jardin enchanté', nameAr: 'الحديقة المسحورة', emoji: '🌳', horizon: 0.48, palette: P_WARM, count: [16, 23, 32],
    bgDiffs: [{ key: 'path', x: 600, y: 760, r: 70 }, { key: 'hill', x: 250, y: 380, r: 70 }],
    bg: (g, R, m) => {
      sky(g, '#7cc6ff', '#e6f6ff', 440);
      hills(g, m.hill ? 420 : 400, 40, '#8fd18a', R, 0.005); hills(g, 450, 25, '#6cc070', R, 0.008);
      band(g, 450, 450, '#79c96f', '#4fa456'); speckle(g, R, 460, 900, 380, 'rgba(255,255,255,.18)', 2);
      g.fillStyle = '#e8d7b0'; g.beginPath(); g.moveTo(520, 900); g.quadraticCurveTo(560, 650, 640, 450); g.lineTo(680, 450); g.quadraticCurveTo(650, 650, m.path ? 820 : 760, 900); g.fill();
    },
    items: [
      { kind: 'tree', w: 3, region: 'ground', s: [170, 240], colors: ['#3ea84a', '#2f8f3a', '#6cc070'] }, { kind: 'flower', w: 5, region: 'ground', s: [45, 75] }, { kind: 'mushroom', w: 3, region: 'ground', s: [45, 75] },
      { kind: 'bush', w: 3, region: 'ground', s: [80, 120], colors: ['#3ea84a', '#2f8f3a'] }, { kind: 'butterfly', w: 3, region: 'sky', s: [45, 65] }, { kind: 'bird', w: 2, region: 'sky', s: [45, 65] },
      { kind: 'bench', w: 1, region: 'ground', s: [120, 160] }, { kind: 'house', w: 1, region: 'ground', s: [170, 220] }, { kind: 'cloud', w: 2, region: 'sky', s: [120, 200] }, { kind: 'kite', w: 1, region: 'sky', s: [60, 90] },
      { kind: 'cat', w: 1, region: 'ground', s: [80, 110], colors: ['#f0a85a', '#9aa3ad'] }, { kind: 'duck', w: 2, region: 'ground', s: [50, 70], colors: ['#ffd84a', '#ffffff'] }, { kind: 'rock', w: 1, region: 'ground', s: [50, 80], colors: ['#9aa3ad'] },
    ] },
  { id: 'mer', name: 'Le monde sous la mer', nameAr: 'عالم تحت البحر', emoji: '🐠', horizon: 0.78, palette: P_SEA, count: [16, 23, 32],
    bgDiffs: [{ key: 'ray', x: 300, y: 120, r: 80 }, { key: 'sand', x: 900, y: 820, r: 60 }],
    bg: (g, R, m) => {
      band(g, 0, 900, '#2bb3e8', '#0b3b73');
      g.fillStyle = 'rgba(255,255,255,.12)'; for (const x of [m.ray ? 420 : 300, 650, 980]) { g.beginPath(); g.moveTo(x - 40, 0); g.lineTo(x + 40, 0); g.lineTo(x + 160, 900); g.lineTo(x + 20, 900); g.fill(); }
      hills(g, 720, 30, '#d9b878', R, 0.01); band(g, 760, 140, '#d9b878', '#b8955a'); speckle(g, R, 730, 900, 300, 'rgba(255,255,255,.2)', 2);
      if (m.sand) { g.fillStyle = '#8a6a3a'; g.beginPath(); g.ellipse(900, 830, 50, 14, 0, 0, Math.PI * 2); g.fill(); }
    },
    items: [
      { kind: 'fish', w: 6, region: 'any', s: [60, 110] }, { kind: 'jelly', w: 2, region: 'any', s: [60, 90], colors: ['#ff8fd6', '#c4b5fd', '#7dd3fc'] }, { kind: 'bubble', w: 3, region: 'any', s: [25, 45] },
      { kind: 'coral', w: 3, region: 'ground', s: [100, 150], colors: ['#ff5fa2', '#ff8a00', '#8b5cf6'] }, { kind: 'weed', w: 3, region: 'ground', s: [110, 160], colors: ['#2fbf71', '#14b8a6'] }, { kind: 'starfish', w: 2, region: 'ground', s: [45, 65] },
      { kind: 'shell', w: 2, region: 'ground', s: [35, 55] }, { kind: 'crab', w: 2, region: 'ground', s: [50, 75] }, { kind: 'gift', w: 1, region: 'ground', s: [70, 90], colors: ['#c98d52'] }, { kind: 'rock', w: 1, region: 'ground', s: [60, 100], colors: ['#6b7280'] },
    ] },
  { id: 'espace', name: 'Voyage dans l\'espace', nameAr: 'رحلة إلى الفضاء', emoji: '🚀', horizon: 0.8, palette: ['#ff5fa2', '#8b5cf6', '#1f9bf0', '#14b8a6', '#ffcc33', '#ff8a00', '#e8333a'], count: [15, 22, 30],
    bgDiffs: [{ key: 'neb', x: 850, y: 300, r: 90 }, { key: 'crater', x: 300, y: 820, r: 50 }],
    bg: (g, R, m) => {
      band(g, 0, 900, '#0a0626', '#26104f');
      const gr = g.createRadialGradient(m.neb ? 700 : 850, 300, 0, m.neb ? 700 : 850, 300, 260); gr.addColorStop(0, 'rgba(255,95,162,.35)'); gr.addColorStop(1, 'rgba(255,95,162,0)'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
      speckle(g, R, 0, 700, 260, 'rgba(255,255,255,.85)', 1.8);
      hills(g, 740, 20, '#b8b3c9', R, 0.01); band(g, 760, 140, '#a9a3bd', '#7d7694');
      g.fillStyle = 'rgba(0,0,0,.18)'; for (const [x, y, r] of [[300, 820, m.crater ? 50 : 30], [700, 860, 22], [1000, 810, 34]]) { g.beginPath(); g.ellipse(x!, y!, r!, r! * 0.35, 0, 0, Math.PI * 2); g.fill(); }
    },
    items: [
      { kind: 'planet', w: 3, region: 'sky', s: [90, 170] }, { kind: 'rocket', w: 2, region: 'sky', s: [100, 140], colors: ['#e8333a', '#1f9bf0', '#8b5cf6'] }, { kind: 'ufo', w: 2, region: 'sky', s: [100, 140], colors: ['#9aa3ad', '#c4b5fd'] },
      { kind: 'star', w: 5, region: 'sky', s: [30, 60], colors: ['#ffcc33', '#fff3b0', '#ff8fd6'] }, { kind: 'moon', w: 1, region: 'sky', s: [80, 110], colors: ['#fff3b0'] }, { kind: 'alien', w: 3, region: 'ground', s: [70, 100], colors: ['#7ddc6f', '#5eead4', '#c4b5fd'] },
      { kind: 'rock', w: 2, region: 'ground', s: [50, 80], colors: ['#8b85a1'] }, { kind: 'flower', w: 1, region: 'ground', s: [40, 60] },
    ] },
  { id: 'souk', name: 'Le souk aux trésors', nameAr: 'سوق الكنوز', emoji: '🏮', horizon: 0.55, palette: ['#e8333a', '#ff8a00', '#ffcc33', '#14b8a6', '#8b5cf6', '#1f6feb', '#c2410c'], count: [16, 23, 32],
    bgDiffs: [{ key: 'arch', x: 600, y: 230, r: 80 }, { key: 'awn', x: 180, y: 300, r: 70 }],
    bg: (g, R, m) => {
      sky(g, '#ffb36b', '#ffe3b0', 520);
      g.fillStyle = '#f2dcc0'; g.fillRect(0, 120, W, 420);
      g.fillStyle = '#d9b48a'; for (let x = 0; x < W; x += 300) { g.beginPath(); g.moveTo(x + 40, 540); g.lineTo(x + 40, 280); g.quadraticCurveTo(x + 150, m.arch && x === 600 ? 150 : 180, x + 260, 280); g.lineTo(x + 260, 540); g.fill(); }
      g.fillStyle = '#6b3f1f'; for (let x = 0; x < W; x += 300) { g.beginPath(); g.moveTo(x + 70, 540); g.lineTo(x + 70, 300); g.quadraticCurveTo(x + 150, 220, x + 230, 300); g.lineTo(x + 230, 540); g.fill(); }
      for (let x = 0; x < W; x += 300) { for (let k = 0; k < 6; k++) { g.fillStyle = k % 2 ? '#fff' : (m.awn && x === 0 ? '#1f6feb' : '#e8333a'); g.beginPath(); g.moveTo(x + 50 + k * 34, 300); g.lineTo(x + 84 + k * 34, 300); g.lineTo(x + 84 + k * 34, 340); g.quadraticCurveTo(x + 67 + k * 34, 355, x + 50 + k * 34, 340); g.fill(); } }
      band(g, 520, 380, '#c9a27a', '#a8825c'); speckle(g, R, 530, 900, 260, 'rgba(255,255,255,.15)', 2);
    },
    items: [
      { kind: 'lantern', w: 4, region: 'sky', s: [60, 95], colors: ['#ff8a00', '#e8333a', '#14b8a6', '#8b5cf6'] }, { kind: 'rug', w: 3, region: 'ground', s: [130, 180] }, { kind: 'teapot', w: 3, region: 'ground', s: [70, 100], colors: ['#e5c07b', '#c0c6cf'] },
      { kind: 'jar', w: 3, region: 'ground', s: [60, 90], colors: ['#ff8a00', '#e8333a', '#ffcc33', '#2fbf71'] }, { kind: 'fruit', w: 3, region: 'ground', s: [45, 65] }, { kind: 'cat', w: 2, region: 'ground', s: [80, 110], colors: ['#f0a85a', '#2d2a33', '#ffffff'] },
      { kind: 'cup', w: 2, region: 'ground', s: [40, 60] }, { kind: 'pot', w: 2, region: 'ground', s: [80, 110], colors: ['#c2410c', '#e5c07b'] }, { kind: 'plate', w: 2, region: 'ground', s: [80, 110] }, { kind: 'bird', w: 1, region: 'sky', s: [40, 55] },
    ] },
  { id: 'chambre', name: 'La chambre d\'Ibrahim', nameAr: 'غرفة إبراهيم', emoji: '🧸', horizon: 0.6, palette: ['#ff5fa2', '#1f9bf0', '#ffcc33', '#2fbf71', '#8b5cf6', '#ff8a00', '#e8333a'], count: [16, 23, 32],
    bgDiffs: [{ key: 'wall', x: 950, y: 120, r: 70 }, { key: 'rugc', x: 600, y: 760, r: 80 }],
    bg: (g, R, m) => {
      band(g, 0, 540, '#cfe9ff', '#e8f4ff');
      g.fillStyle = 'rgba(255,255,255,.7)'; for (let i = 0; i < 18; i++) { const x = (i * 157) % W, y = 60 + ((i * 97) % 400); if (m.wall && i === 5) continue; g.beginPath(); for (let k = 0; k < 10; k++) { const r = k % 2 ? 7 : 16, a = k * Math.PI / 5 - Math.PI / 2; g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } g.fill(); }
      g.fillStyle = '#ffffff'; g.fillRect(0, 520, W, 24);
      band(g, 540, 360, '#e8c9a0', '#d4b083'); g.strokeStyle = 'rgba(120,80,40,.18)'; g.lineWidth = 2; for (let y = 560; y < 900; y += 40) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
      g.fillStyle = m.rugc ? '#c4b5fd' : '#ffb3c7'; g.beginPath(); g.ellipse(600, 760, 330, 90, 0, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 6; g.setLineDash([16, 12]); g.stroke(); g.setLineDash([]);
      g.fillStyle = '#c98d52'; g.fillRect(60, 220, 360, 14); g.fillRect(780, 300, 360, 14);
    },
    items: [
      { kind: 'teddy', w: 3, region: 'ground', s: [90, 130], colors: ['#c98d52', '#f0a85a', '#ffd6e8'] }, { kind: 'blocks', w: 3, region: 'ground', s: [80, 110] }, { kind: 'ball', w: 3, region: 'ground', s: [55, 85] },
      { kind: 'balloon', w: 3, region: 'sky', s: [80, 120] }, { kind: 'book', w: 2, region: 'shelf', s: [50, 80] }, { kind: 'duck', w: 2, region: 'ground', s: [50, 70], colors: ['#ffd84a'] }, { kind: 'car', w: 2, region: 'ground', s: [80, 120] },
      { kind: 'rocket', w: 1, region: 'shelf', s: [70, 90] }, { kind: 'clock', w: 1, region: 'wall', s: [80, 100] }, { kind: 'gift', w: 2, region: 'ground', s: [60, 90] }, { kind: 'star', w: 2, region: 'wall', s: [40, 60], colors: ['#ffcc33'] },
    ] },
  { id: 'ville', name: 'La ville la nuit', nameAr: 'المدينة ليلًا', emoji: '🌃', horizon: 0.68, palette: ['#e8333a', '#1f9bf0', '#ffcc33', '#2fbf71', '#8b5cf6', '#ff8a00', '#ffffff'], count: [15, 22, 30],
    bgDiffs: [{ key: 'win', x: 420, y: 330, r: 50 }, { key: 'antenna', x: 860, y: 140, r: 60 }],
    bg: (g, R, m) => {
      band(g, 0, 620, '#0b1236', '#3b2a6b'); speckle(g, R, 0, 300, 120, 'rgba(255,255,255,.8)', 1.6);
      const bld: Array<[number, number, number]> = [[20, 260, 180], [210, 340, 150], [370, 220, 170], [550, 300, 140], [700, 180, 190], [900, 280, 150], [1060, 230, 140]];
      for (const [x, y, w] of bld) {
        g.fillStyle = '#1b1e3d'; g.fillRect(x, y, w, 620 - y);
        for (let yy = y + 20; yy < 600; yy += 44) for (let xx = x + 16; xx < x + w - 20; xx += 36) { const lit = ((xx * 7 + yy * 3) % 5) < 2; let col = lit ? '#ffd98a' : '#2b2f55'; if (m.win && Math.abs(xx - 420) < 20 && Math.abs(yy - 330) < 25) col = lit ? '#2b2f55' : '#ffd98a'; g.fillStyle = col; g.fillRect(xx, yy, 20, 26); }
      }
      g.strokeStyle = '#8b8fb5'; g.lineWidth = 6; g.beginPath(); g.moveTo(795, 180); g.lineTo(795, m.antenna ? 70 : 110); g.stroke(); g.fillStyle = '#ff3d6e'; g.beginPath(); g.arc(795, m.antenna ? 66 : 106, 8, 0, Math.PI * 2); g.fill();
      band(g, 610, 290, '#3a3550', '#24203a'); g.fillStyle = '#ffd400'; for (let x = 0; x < W; x += 120) g.fillRect(x, 760, 60, 10);
    },
    items: [
      { kind: 'car', w: 4, region: 'ground', s: [120, 170] }, { kind: 'lamp', w: 3, region: 'ground', s: [180, 230], colors: ['#ffd98a'] }, { kind: 'cat', w: 2, region: 'ground', s: [70, 100], colors: ['#2d2a33', '#f0a85a', '#ffffff'] },
      { kind: 'moon', w: 1, region: 'sky', s: [90, 120], colors: ['#fff3b0'] }, { kind: 'star', w: 4, region: 'sky', s: [25, 45], colors: ['#fff3b0', '#ffcc33'] }, { kind: 'balloon', w: 1, region: 'sky', s: [60, 90] },
      { kind: 'bench', w: 1, region: 'ground', s: [110, 150], colors: ['#8b5a3c'] }, { kind: 'pot', w: 1, region: 'ground', s: [70, 100] }, { kind: 'ufo', w: 1, region: 'sky', s: [90, 120], colors: ['#9aa3ad'] },
    ] },
  { id: 'hiver', name: 'Le village sous la neige', nameAr: 'القرية تحت الثلج', emoji: '⛄', horizon: 0.5, palette: ['#e8333a', '#1f9bf0', '#2fbf71', '#ffcc33', '#8b5cf6', '#ff8a00'], count: [15, 22, 30],
    bgDiffs: [{ key: 'peak', x: 300, y: 200, r: 80 }, { key: 'ice', x: 850, y: 600, r: 80 }],
    bg: (g, R, m) => {
      sky(g, '#8fc0ff', '#eef6ff', 460);
      g.fillStyle = '#c7d6ea'; g.beginPath(); g.moveTo(0, 460); g.lineTo(m.peak ? 380 : 300, 160); g.lineTo(600, 460); g.fill(); g.beginPath(); g.moveTo(450, 460); g.lineTo(800, 120); g.lineTo(1200, 460); g.fill();
      g.fillStyle = '#fff'; g.beginPath(); g.moveTo(m.peak ? 330 : 250, 210); g.lineTo(m.peak ? 380 : 300, 160); g.lineTo(m.peak ? 430 : 350, 210); g.fill(); g.beginPath(); g.moveTo(740, 180); g.lineTo(800, 120); g.lineTo(860, 180); g.fill();
      band(g, 450, 450, '#ffffff', '#dfe9f7');
      g.fillStyle = '#a8d4f5'; g.beginPath(); g.ellipse(850, 600, m.ice ? 160 : 120, 40, 0, 0, Math.PI * 2); g.fill();
      speckle(g, R, 0, 900, 220, 'rgba(255,255,255,.9)', 3);
    },
    items: [
      { kind: 'snowman', w: 3, region: 'ground', s: [110, 150], colors: ['#e8333a', '#1f9bf0', '#2fbf71'] }, { kind: 'pine', w: 5, region: 'ground', s: [150, 230], colors: ['#2f6b45', '#3b7d52'] }, { kind: 'house', w: 2, region: 'ground', s: [170, 220], colors: ['#c98d52', '#e8c9a0'] },
      { kind: 'gift', w: 2, region: 'ground', s: [60, 85] }, { kind: 'bird', w: 2, region: 'sky', s: [40, 60], colors: ['#e8333a', '#1f9bf0'] }, { kind: 'cloud', w: 2, region: 'sky', s: [120, 200] }, { kind: 'lamp', w: 1, region: 'ground', s: [170, 210], colors: ['#ffd98a'] },
      { kind: 'cat', w: 1, region: 'ground', s: [70, 100], colors: ['#9aa3ad', '#f0a85a'] }, { kind: 'cup', w: 1, region: 'ground', s: [45, 60] }, { kind: 'rock', w: 1, region: 'ground', s: [50, 70], colors: ['#9aa6b5'] },
    ] },
  { id: 'desert', name: 'L\'oasis du Sahara', nameAr: 'واحة الصحراء', emoji: '🐪', horizon: 0.52, palette: ['#e8333a', '#1f6feb', '#14b8a6', '#ffcc33', '#8b5cf6', '#ff8a00'], count: [15, 22, 30],
    bgDiffs: [{ key: 'oasis', x: 600, y: 560, r: 80 }, { key: 'dune', x: 1000, y: 430, r: 80 }],
    bg: (g, R, m) => {
      sky(g, '#2f86e0', '#ffe9c2', 480);
      g.fillStyle = 'rgba(255,250,220,.95)'; g.beginPath(); g.arc(220, 140, 60, 0, Math.PI * 2); g.fill();
      hills(g, m.dune ? 400 : 440, 40, '#f0c27a', R, 0.004); hills(g, 480, 30, '#e8b56a', R, 0.007);
      band(g, 480, 420, '#eec07e', '#d9a05a'); speckle(g, R, 490, 900, 300, 'rgba(160,100,40,.25)', 2);
      g.fillStyle = '#3fb0c9'; g.beginPath(); g.ellipse(600, 570, m.oasis ? 220 : 160, 50, 0, 0, Math.PI * 2); g.fill(); g.strokeStyle = 'rgba(255,255,255,.6)'; g.lineWidth = 3; g.stroke();
    },
    items: [
      { kind: 'camel', w: 3, region: 'ground', s: [150, 200], colors: ['#c98d52', '#d9a066'] }, { kind: 'palm', w: 4, region: 'ground', s: [190, 250], colors: ['#3ea84a', '#2f8f3a'] }, { kind: 'cactus', w: 3, region: 'ground', s: [80, 130], colors: ['#3f8f4f', '#4caf50'] },
      { kind: 'tent', w: 2, region: 'ground', s: [150, 200] }, { kind: 'rock', w: 2, region: 'ground', s: [50, 80], colors: ['#b07a48'] }, { kind: 'jar', w: 2, region: 'ground', s: [60, 85], colors: ['#c2410c', '#e5c07b'] },
      { kind: 'teapot', w: 1, region: 'ground', s: [60, 85], colors: ['#e5c07b'] }, { kind: 'bird', w: 1, region: 'sky', s: [40, 55] }, { kind: 'rug', w: 2, region: 'ground', s: [130, 170] }, { kind: 'lantern', w: 1, region: 'ground', s: [60, 80] },
    ] },
];

const MAX: Record<string, number> = { moon: 1, sun: 1, clock: 1, ufo: 1, window: 2, house: 2, tent: 2, camel: 3, bench: 1 };
// ── Génération ───────────────────────────────────────────────────────────────
function yRange(t: Theme, r: Region, s: number): [number, number] {
  const h = t.horizon * H;
  if (r === 'sky') return [s * 0.6, h - s * 0.4];
  if (r === 'water') return [h - 40, h + 10];
  if (r === 'wall') return [80, h - s * 0.6];
  if (r === 'shelf') return [140, h - 120];
  if (r === 'any') return [s * 0.5, H - s * 0.5];
  return [h + s * 0.25, H - s * 0.42];
}

export function makePuzzle(seed: number, mode: Mode, themeIdx?: number): Puzzle {
  const R = rng(seed);
  const theme = THEMES[themeIdx ?? Math.floor(R() * THEMES.length)]!;
  const n = Math.round(theme.count[mode === 'facile' ? 0 : mode === 'normal' ? 1 : 2] * 1.25);
  const K = 1.5;   // échelle des objets (images bien remplies)
  const objs: Obj[] = [];
  const total = theme.items.reduce((a, i) => a + i.w, 0);
  const pick = () => { let r = R() * total; for (const it of theme.items) { r -= it.w; if (r <= 0) return it; } return theme.items[0]!; };
  for (let tries = 0; objs.length < n && tries < n * 60; tries++) {
    const it = pick(); if ((MAX[it.kind] ?? 99) <= objs.filter(o => o.kind === it.kind).length) continue;
    const s = R.range(it.s[0], it.s[1]) * K * (mode === 'difficile' ? 0.88 : 1);
    const [y0, y1] = yRange(theme, it.region, s); if (y1 <= y0) continue;
    const x = R.range(s * 0.5 + 10, W - s * 0.5 - 10), y = R.range(y0, y1);
    if (objs.some(o => Math.hypot(o.x - x, o.y - y) < (o.s + s) * 0.37)) continue;
    const c = R.pick(it.colors ?? theme.palette);
    objs.push({ kind: it.kind, x, y, s, c, v: R.int(0, 5), f: R.chance(0.5), r: 0 });
  }
  objs.sort((a, b) => (a.kind === 'cloud' ? -1 : 0) - (b.kind === 'cloud' ? -1 : 0) || a.y + a.s * 0.5 - (b.y + b.s * 0.5));
  const b = objs.map(o => ({ ...o }));
  const nd = mode === 'facile' ? 5 : mode === 'normal' ? 7 : 10;
  const minS = mode === 'facile' ? 95 : mode === 'normal' ? 70 : 45;
  const diffs: Diff[] = []; const bgMods: Record<string, number> = {};
  const far = (x: number, y: number, r: number) => diffs.every(d => Math.hypot(d.x - x, d.y - y) > d.r + r + 30);
  // différence de décor (normal/difficile)
  const bgN = mode === 'facile' ? 0 : mode === 'normal' ? 1 : 2;
  for (const bd of [...theme.bgDiffs].sort(() => R() - 0.5).slice(0, bgN)) { if (far(bd.x, bd.y, bd.r) && !objs.some(o => Math.hypot(o.x - bd.x, o.y - bd.y) < o.s * 0.5 + bd.r * 0.5)) { bgMods[bd.key] = 1; diffs.push({ kind: 'bg', x: bd.x, y: bd.y, r: bd.r, idx: -1 }); } }
  const order = objs.map((_, i) => i).sort(() => R() - 0.5);
  for (const i of order) {
    if (diffs.length >= nd) break;
    const o = b[i]!; if (o.s < minS) continue;
    const r = Math.max(o.s * 0.55, mode === 'difficile' ? 34 : 46);
    if (!far(o.x, o.y, r)) continue;
    const art = ART[o.kind]!;
    // n'oublie pas : l'objet ne doit pas être caché par un autre plus devant
    const kinds: DiffKind[] = ['remove', 'color', 'size', 'move'];
    if (art.asym) kinds.push('flip', 'flip');
    if (art.variants > 1) kinds.push('variant', 'variant');
    if (!art.colorable) kinds.splice(kinds.indexOf('color'), 1);
    if (mode === 'facile') kinds.push('remove', 'color');
    const k = R.pick(kinds);
    if (k === 'remove') o.s = 0;
    else if (k === 'color') o.c = mode === 'difficile' ? hueShift(o.c, R.chance(0.5) ? 40 : -40) : R.pick(theme.palette.filter(c => c !== o.c).length ? theme.palette.filter(c => c !== o.c) : ['#e8333a']);
    else if (k === 'size') o.s *= mode === 'difficile' ? (R.chance(0.5) ? 1.22 : 0.8) : R.chance(0.5) ? 1.4 : 0.65;
    else if (k === 'move') { const a = R() * Math.PI * 2, d = o.s * (mode === 'difficile' ? 0.35 : 0.55); o.x += Math.cos(a) * d; o.y += Math.sin(a) * d * 0.6; }
    else if (k === 'flip') o.f = !o.f;
    else if (k === 'variant') { const vs = art.variants; o.v = (o.v % vs + 1 + R.int(0, vs - 2)) % vs; }
    if (k === 'color' && o.kind === 'cloud') continue;
    diffs.push({ kind: k, x: (o.x + objs[i]!.x) / 2, y: (o.y + objs[i]!.y) / 2, r: k === 'move' ? r + o.s * 0.3 : r, idx: i });
  }
  // ajouts (un objet en plus dans B) si on manque de différences
  for (let tries = 0; diffs.length < nd && tries < 200; tries++) {
    const it = pick(); if ((MAX[it.kind] ?? 99) <= b.filter(o => o.kind === it.kind && o.s > 0).length) continue;
    const s = R.range(Math.max(it.s[0] * K, minS), Math.max(it.s[1] * K, minS + 10));
    const [y0, y1] = yRange(theme, it.region, s); if (y1 <= y0) continue;
    const x = R.range(s * 0.5 + 10, W - s * 0.5 - 10), y = R.range(y0, y1);
    if (objs.some(o => Math.hypot(o.x - x, o.y - y) < (o.s + s) * 0.5) || !far(x, y, s * 0.55)) continue;
    b.push({ kind: it.kind, x, y, s, c: R.pick(it.colors ?? theme.palette), v: R.int(0, 5), f: R.chance(0.5), r: 0 });
    diffs.push({ kind: 'add', x, y, r: Math.max(s * 0.55, 46), idx: b.length - 1 });
  }
  return { theme, seed, mode, a: objs, b, diffs, bgMods };
}

export function render(g: G, p: Puzzle, side: 'a' | 'b') {
  const R = rng(p.seed ^ 0x9e3779b9);
  g.save(); g.clearRect(0, 0, W, H);
  p.theme.bg(g, R, side === 'b' ? p.bgMods : {});
  const list = side === 'a' ? p.a : p.b;
  for (const o of list) {
    if (o.s <= 0) continue;
    g.save(); g.translate(o.x, o.y); if (o.f) g.scale(-1, 1); if (o.r) g.rotate(o.r);
    ART[o.kind]!.draw(g, o.s, o.c, o.v);
    g.restore();
  }
  // léger vignettage = rendu plus « pro »
  const vg = g.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.85); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.18)'); g.fillStyle = vg; g.fillRect(0, 0, W, H);
  g.restore();
}

// ── Mode photo : différences créées sur VOS photos (restent sur le téléphone) ─────
export interface PhotoPuzzle { a: HTMLCanvasElement; b: HTMLCanvasElement; diffs: Diff[]; mode: Mode }
export function photoPuzzle(img: CanvasImageSource & { width: number; height: number }, mode: Mode, seed: number): PhotoPuzzle {
  const R = rng(seed);
  const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
  const a = mk(), b = mk(); const ga = a.getContext('2d', { willReadFrequently: true })!, gb = b.getContext('2d', { willReadFrequently: true })!;
  const sc = Math.max(W / img.width, H / img.height), dw = img.width * sc, dh = img.height * sc;
  ga.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh); gb.drawImage(a, 0, 0);
  const nd = mode === 'facile' ? 5 : mode === 'normal' ? 7 : 9;
  const rad = mode === 'facile' ? [60, 85] : mode === 'normal' ? [45, 70] : [32, 52];
  const diffs: Diff[] = [];
  const data = ga.getImageData(0, 0, W, H).data;
  const detail = (x: number, y: number, r: number) => { let sum = 0, sq = 0, n = 0; for (let k = 0; k < 60; k++) { const px = Math.floor(x + (R() - 0.5) * r * 1.6), py = Math.floor(y + (R() - 0.5) * r * 1.6); if (px < 0 || py < 0 || px >= W || py >= H) continue; const i = (py * W + px) * 4; const l = data[i]! * 0.3 + data[i + 1]! * 0.59 + data[i + 2]! * 0.11; sum += l; sq += l * l; n++; } const m = sum / n; return Math.sqrt(Math.max(0, sq / n - m * m)); };
  for (let tries = 0; diffs.length < nd && tries < 400; tries++) {
    const r = R.range(rad[0]!, rad[1]!), x = R.range(r + 20, W - r - 20), y = R.range(r + 20, H - r - 20);
    if (diffs.some(d => Math.hypot(d.x - x, d.y - y) < d.r + r + 40)) continue;
    if (detail(x, y, r) < (tries < 250 ? 22 : 8)) continue;   // zone avec des détails : sinon la différence ne se voit pas
    const kind = R.pick(['color', 'color', 'flip', 'clone', 'clone', 'erase', 'bright'] as const);
    const x0 = Math.floor(x - r), y0 = Math.floor(y - r), sz = Math.ceil(r * 2);
    const wgt = (px: number, py: number) => { const d = Math.hypot(px - x, py - y); return Math.max(0, Math.min(1, (r - d) / (r * 0.3))); };
    if (kind === 'color' || kind === 'bright') {
      // pixels un par un (marche sur tous les iPhone, sans ctx.filter)
      const im = gb.getImageData(x0, y0, sz, sz), d = im.data, dh = (R.chance(0.5) ? 1 : -1) * (mode === 'difficile' ? 0.22 : 0.4), k = R.chance(0.5) ? 1.55 : 0.55;
      for (let j = 0; j < sz; j++) for (let i = 0; i < sz; i++) {
        const w = wgt(x0 + i, y0 + j); if (!w) continue; const q = (j * sz + i) * 4;
        let rr = d[q]! / 255, gg = d[q + 1]! / 255, bb = d[q + 2]! / 255;
        if (kind === 'bright') { rr = Math.min(1, rr * k); gg = Math.min(1, gg * k); bb = Math.min(1, bb * k); }
        else {
          const mx = Math.max(rr, gg, bb), mn = Math.min(rr, gg, bb), l = (mx + mn) / 2; let h = 0, sat = 0;
          if (mx !== mn) { const dd = mx - mn; sat = l > 0.5 ? dd / (2 - mx - mn) : dd / (mx + mn); h = mx === rr ? (gg - bb) / dd + (gg < bb ? 6 : 0) : mx === gg ? (bb - rr) / dd + 2 : (rr - gg) / dd + 4; h /= 6; }
          h = (h + dh + 1) % 1; sat = Math.min(1, sat * 1.3 + 0.12);
          const f = (n: number) => { const kk = (n + h * 12) % 12, a2 = sat * Math.min(l, 1 - l); return l - a2 * Math.max(-1, Math.min(kk - 3, 9 - kk, 1)); };
          rr = f(0); gg = f(8); bb = f(4);
        }
        d[q] = d[q]! * (1 - w) + rr * 255 * w; d[q + 1] = d[q + 1]! * (1 - w) + gg * 255 * w; d[q + 2] = d[q + 2]! * (1 - w) + bb * 255 * w;
      }
      gb.putImageData(im, x0, y0);
    } else {
      // retourné / cloné / gommé dans un calque, puis fondu sur un bord doux
      const tmp = document.createElement('canvas'); tmp.width = sz; tmp.height = sz; const tg = tmp.getContext('2d')!;
      if (kind === 'flip') { tg.translate(sz, 0); tg.scale(-1, 1); tg.drawImage(a, x0, y0, sz, sz, 0, 0, sz, sz); }
      else if (kind === 'clone') { const ang = R() * Math.PI * 2, dd = r * 2.3; const sx = Math.max(0, Math.min(W - sz, x0 + Math.cos(ang) * dd)), sy = Math.max(0, Math.min(H - sz, y0 + Math.sin(ang) * dd)); tg.drawImage(a, sx, sy, sz, sz, 0, 0, sz, sz); }
      else { const sm = document.createElement('canvas'); sm.width = 5; sm.height = 5; const sg = sm.getContext('2d')!; sg.drawImage(a, x0, y0, sz, sz, 0, 0, 5, 5); tg.imageSmoothingEnabled = true; tg.drawImage(sm, 0, 0, 5, 5, 0, 0, sz, sz); }
      tg.globalCompositeOperation = 'destination-in';
      const gr = tg.createRadialGradient(sz / 2, sz / 2, r * 0.6, sz / 2, sz / 2, r); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); tg.fillStyle = gr; tg.fillRect(0, 0, sz, sz);
      gb.drawImage(tmp, x0, y0);
    }
    diffs.push({ kind: kind === 'flip' ? 'flip' : kind === 'color' ? 'color' : 'move', x, y, r: r + 10, idx: diffs.length });
  }
  return { a, b, diffs, mode };
}
export { shade };
