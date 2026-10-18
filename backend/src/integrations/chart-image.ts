import { v2 as cloudinary } from 'cloudinary';
import { env } from '../config/env.js';

// Graphiques en IMAGE (PNG) : pour les dossiers Google Docs et pour Telegram, qui ne savent pas afficher
// les blocs ```chart de l'app. On dessine un SVG ici, Cloudinary le convertit en PNG et rend un lien public.

cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME ?? '',
  api_key:    env.CLOUDINARY_API_KEY    ?? '',
  api_secret: env.CLOUDINARY_API_SECRET ?? '',
});

export interface ChartSpec {
  type: 'bar' | 'pie' | 'line';
  title: string;
  unit?: string;
  data: Array<{ label: string; value: number }>;
}

const W = 1200, H = 700;
const FONT = 'DejaVu Sans, Arial, Helvetica, sans-serif';
const INK = '#1f1f1f', GREY = '#6b6b6b', GRID = '#e6e2d8', GOLD = '#9e7a21';
// Doré FIK d'abord, puis des teintes distinctes pour les parts de camembert
const COLORS = ['#9e7a21', '#2f4858', '#c9a54a', '#5b7f95', '#7a5c14', '#8fb3c4', '#b5651d', '#4a6b3a'];

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function fmt(v: number, unit = ''): string {
  const abs = Math.abs(v);
  const n = abs >= 10_000 ? Math.round(v) : Math.round(v * 10) / 10;
  const s = n.toLocaleString('fr-FR').replace(/[  ]/g, ' ');
  return unit ? (unit === '%' ? `${s} %` : `${s} ${unit}`) : s;
}

/** Valide et nettoie un graphique venant de l'IA (null si inutilisable). */
export function cleanChart(raw: unknown): ChartSpec | null {
  const r = raw as Partial<ChartSpec> | null;
  if (!r || typeof r !== 'object') return null;
  const data = (Array.isArray(r.data) ? r.data : [])
    .map(d => ({ label: String(d?.label ?? '').trim(), value: Number(d?.value) }))
    .filter(d => d.label && Number.isFinite(d.value))
    .slice(0, 24);
  if (!data.length) return null;
  const type = r.type === 'pie' || r.type === 'line' ? r.type : 'bar';
  return { type, title: String(r.title ?? '').trim() || 'Graphique', unit: String(r.unit ?? '').trim() || undefined, data };
}

function wrap(label: string, per: number): string[] {
  if (label.length <= per) return [label];
  const words = label.split(/\s+/);
  let first = '';
  while (words.length && (first ? `${first} ${words[0]}` : words[0]!).length <= per) first = first ? `${first} ${words.shift()}` : words.shift()!;
  if (!first) return [cut(label, per)];
  return words.length ? [first, cut(words.join(' '), per)] : [first];
}

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].map(m => m * p).find(m => m >= v) ?? 10 * p;
}

function axisChart(c: ChartSpec): string {
  const L = 130, R = 50, T = 120, B = 120;
  const pw = W - L - R, ph = H - T - B;
  const min = Math.min(0, ...c.data.map(d => d.value));
  const max = niceMax(Math.max(...c.data.map(d => d.value)));
  const y = (v: number) => T + ph - ((v - min) / (max - min || 1)) * ph;
  const out: string[] = [];
  for (let i = 0; i <= 5; i++) {
    const v = min + ((max - min) * i) / 5, yy = y(v);
    out.push(`<line x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}" stroke="${GRID}" stroke-width="2"/>`);
    out.push(`<text x="${L - 14}" y="${yy + 8}" text-anchor="end" font-size="22" fill="${GREY}">${esc(fmt(v, c.unit))}</text>`);
  }
  const n = c.data.length, slot = pw / n;
  const labelSize = n > 12 ? 16 : n > 8 ? 18 : 22;
  const rotate = n > 8;
  c.data.forEach((d, i) => {
    const cx = L + slot * (i + 0.5);
    if (rotate) {
      out.push(`<text transform="translate(${cx},${T + ph + 22}) rotate(-35)" text-anchor="end" font-size="${labelSize}" fill="${INK}">${esc(cut(d.label, 16))}</text>`);
      return;
    }
    // Nom long → 2 lignes (coupées aux espaces) plutôt que tronqué
    const per = Math.max(6, Math.floor(slot / (labelSize * 0.58)));
    const lines = wrap(d.label, per);
    lines.forEach((ln, k) => out.push(`<text x="${cx}" y="${T + ph + 38 + k * (labelSize + 4)}" text-anchor="middle" font-size="${labelSize}" fill="${INK}">${esc(ln)}</text>`));
  });
  if (c.type === 'bar') {
    const bw = Math.min(110, slot * 0.62);
    c.data.forEach((d, i) => {
      const cx = L + slot * (i + 0.5), y0 = y(0), yv = y(d.value);
      const top = Math.min(y0, yv), h = Math.max(2, Math.abs(y0 - yv));
      out.push(`<rect x="${cx - bw / 2}" y="${top}" width="${bw}" height="${h}" rx="6" fill="${GOLD}"/>`);
      if (n <= 14) out.push(`<text x="${cx}" y="${top - 12}" text-anchor="middle" font-size="${n > 8 ? 17 : 21}" font-weight="bold" fill="${INK}">${esc(fmt(d.value, c.unit))}</text>`);
    });
  } else {
    const pts = c.data.map((d, i) => [L + slot * (i + 0.5), y(d.value)] as const);
    const line = pts.map(([px, py], i) => `${i ? 'L' : 'M'}${px},${py}`).join(' ');
    out.push(`<path d="${line} L${pts[pts.length - 1]![0]},${y(min)} L${pts[0]![0]},${y(min)} Z" fill="${GOLD}" fill-opacity="0.12"/>`);
    out.push(`<path d="${line}" fill="none" stroke="${GOLD}" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/>`);
    pts.forEach(([px, py], i) => {
      out.push(`<circle cx="${px}" cy="${py}" r="8" fill="#fff" stroke="${GOLD}" stroke-width="4"/>`);
      if (n <= 12) out.push(`<text x="${px}" y="${py - 20}" text-anchor="middle" font-size="19" font-weight="bold" fill="${INK}">${esc(fmt(c.data[i]!.value, c.unit))}</text>`);
    });
  }
  out.push(`<line x1="${L}" x2="${W - R}" y1="${y(Math.max(0, min))}" y2="${y(Math.max(0, min))}" stroke="${GREY}" stroke-width="2"/>`);
  return out.join('');
}

function pieChart(c: ChartSpec): string {
  const data = c.data.filter(d => d.value > 0).slice(0, 8);
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const cx = 360, cy = 405, r = 230, ri = 125;
  const out: string[] = [];
  let a = -Math.PI / 2;
  data.forEach((d, i) => {
    const frac = d.value / total, b = a + frac * Math.PI * 2;
    const col = COLORS[i % COLORS.length]!;
    if (frac >= 0.9999) {
      out.push(`<circle cx="${cx}" cy="${cy}" r="${(r + ri) / 2}" fill="none" stroke="${col}" stroke-width="${r - ri}"/>`);
    } else {
      const large = b - a > Math.PI ? 1 : 0;
      const p = (ang: number, rad: number) => `${cx + rad * Math.cos(ang)},${cy + rad * Math.sin(ang)}`;
      out.push(`<path d="M${p(a, r)} A${r},${r} 0 ${large} 1 ${p(b, r)} L${p(b, ri)} A${ri},${ri} 0 ${large} 0 ${p(a, ri)} Z" fill="${col}" stroke="#fff" stroke-width="4"/>`);
    }
    a = b;
  });
  out.push(`<text x="${cx}" y="${cy - 4}" text-anchor="middle" font-size="34" font-weight="bold" fill="${INK}">${esc(fmt(total, c.unit))}</text>`);
  out.push(`<text x="${cx}" y="${cy + 32}" text-anchor="middle" font-size="20" fill="${GREY}">total</text>`);
  const rowH = Math.min(62, 440 / data.length), top = cy - (rowH * data.length) / 2;
  data.forEach((d, i) => {
    const yy = top + rowH * i + rowH / 2;
    out.push(`<rect x="680" y="${yy - 14}" width="28" height="28" rx="6" fill="${COLORS[i % COLORS.length]}"/>`);
    out.push(`<text x="724" y="${yy - 2}" font-size="23" fill="${INK}">${esc(cut(d.label, 30))}</text>`);
    out.push(`<text x="724" y="${yy + 24}" font-size="19" fill="${GREY}">${esc(fmt(d.value, c.unit))} · ${Math.round((d.value / total) * 100)} %</text>`);
  });
  return out.join('');
}

export function chartSvg(c: ChartSpec): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT}">`
    + `<rect width="${W}" height="${H}" fill="#ffffff"/>`
    + `<rect x="0" y="0" width="${W}" height="8" fill="${GOLD}"/>`
    + `<text x="60" y="72" font-size="34" font-weight="bold" fill="${INK}">${esc(cut(c.title, 60))}</text>`
    + (c.type === 'pie' ? pieChart(c) : axisChart(c))
    + `<text x="${W - 40}" y="${H - 22}" text-anchor="end" font-size="17" fill="${GREY}">FIK Conciergerie · Dzaryx</text>`
    + `</svg>`;
}

/** Lien public d'un PNG du graphique (null si Cloudinary indisponible). */
export async function chartPngUrl(c: ChartSpec): Promise<string | null> {
  if (!env.CLOUDINARY_API_KEY) return null;
  try {
    const svg = Buffer.from(chartSvg(c)).toString('base64');
    const up = await cloudinary.uploader.upload(`data:image/svg+xml;base64,${svg}`, { folder: 'dzaryx-charts', format: 'png' });
    return up.secure_url;
  } catch (err) {
    console.warn('[chart] PNG:', err instanceof Error ? err.message : JSON.stringify(err).slice(0, 200));
    return null;
  }
}

const CHART_BLOCK = /```chart\s*\n?([\s\S]*?)```/g;

/** Texte de réponse → texte sans les blocs ```chart + liens PNG des graphiques (pour Telegram). */
export async function extractCharts(text: string): Promise<{ text: string; images: Array<{ url: string; title: string }> }> {
  const specs: ChartSpec[] = [];
  const stripped = text.replace(CHART_BLOCK, (_, body: string) => {
    try {
      const c = cleanChart(JSON.parse(body.trim()));
      if (c) { specs.push(c); return `📊 ${c.title} (graphique ci-dessous)`; }
    } catch { /* bloc illisible : retiré quand même */ }
    return '';
  });
  if (!specs.length) return { text, images: [] };
  const urls = await Promise.all(specs.map(chartPngUrl));
  const images = specs.flatMap((c, i) => (urls[i] ? [{ url: urls[i]!, title: c.title }] : []));
  // Image impossible → on remet les chiffres en texte plutôt que rien
  const fallback = specs.filter((_, i) => !urls[i])
    .map(c => `📊 ${c.title}\n${c.data.map(d => `• ${d.label} : ${fmt(d.value, c.unit)}`).join('\n')}`).join('\n\n');
  return { text: `${stripped.replace(/\n{3,}/g, '\n\n').trim()}${fallback ? `\n\n${fallback}` : ''}`, images };
}
