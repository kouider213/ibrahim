import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { forme, errText, vibrate, type RunType, type RunPt, type RunStats, type RunSummary, type RunDetail, type RunCfg } from './api.ts';
import { F, card, btn, ghostBtn, input, Sheet, Spinner, Chip, Ring } from './ui.tsx';

// 🏃 COURSE GPS — FORME (Kouider 01/11, « comme Strava ») : footing, marche, vélo, rando.
// Chaque profil (Kouider, sa femme, son ami) a SES sorties. Le téléphone enregistre les points GPS bruts
// (gardés aussi sur le téléphone toutes les 5 s : un crash ou une fermeture ne fait rien perdre), le serveur recalcule tout.
// En direct : carte, chrono, distance, allure instantanée/moyenne, dénivelé, pause auto, tours, voix tous les X km,
// allure cible, objectif distance/temps, course contre son « fantôme » (une sortie précédente sur le même parcours).
// Après : carte colorée par l'allure, splits, courbes allure/altitude au doigt, meilleurs efforts + records, image à partager.
// Limite iPhone honnête : une page web ne reçoit PAS le GPS écran verrouillé → écran gardé allumé (Wake Lock) + mode poche noir.

const TYPES: Array<{ id: RunType; e: string; l: string }> = [
  { id: 'run', e: '🏃', l: 'Course' }, { id: 'walk', e: '🚶', l: 'Marche' }, { id: 'bike', e: '🚴', l: 'Vélo' }, { id: 'hike', e: '🥾', l: 'Rando' },
];
const TYPE_E: Record<RunType, string> = { run: '🏃', walk: '🚶', bike: '🚴', hike: '🥾' };
const TYPE_L: Record<RunType, string> = { run: 'Course', walk: 'Marche', bike: 'Vélo', hike: 'Rando' };
const LIVE_K = 'forme:run:live';
const MOVE_MIN: Record<RunType, number> = { run: 0.8, walk: 0.45, hike: 0.35, bike: 1.6 };
const JUMP_MAX: Record<RunType, number> = { run: 9, walk: 4.5, hike: 4.5, bike: 25 };
// Fond OpenStreetMap (gratuit, sans clé — CARTO exige une clé depuis 2025, vu au test du 01/11)
const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILES_ATTR = '© OpenStreetMap';

export const fmtPace = (s: number | null | undefined) => { if (!s || !Number.isFinite(s) || s <= 0 || s >= 3600) return '–:––'; const r = Math.round(s); return `${Math.floor(r / 60)}:${String(r % 60).padStart(2, '0')}`; };
export const fmtDur = (s: number) => { s = Math.max(0, Math.round(s)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`; };
const fmtDurLong = (s: number) => { const h = Math.floor(s / 3600), m = Math.round(s % 3600 / 60); return h ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`; };
const km = (m: number, d = 2) => (m / 1000).toFixed(d).replace('.', ',');
const isBike = (t: RunType) => t === 'bike';
/** Allure (course/marche) ou vitesse (vélo) */
const paceOrSpeed = (t: RunType, pace: number | null, kmh: number) => isBike(t) ? `${kmh.toFixed(1).replace('.', ',')}` : fmtPace(pace);
const unitPS = (t: RunType) => isBike(t) ? 'km/h' : '/km';
const fmtDate = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('fr-BE', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

function hav(a: [number, number], b: [number, number]) {
  const R = 6371e3, r = Math.PI / 180, dLat = (b[0] - a[0]) * r, dLng = (b[1] - a[1]) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

let voiceOn = true;
function say(t: string) {
  if (!voiceOn) return;
  try { const u = new SpeechSynthesisUtterance(t); u.lang = 'fr-FR'; u.rate = 1.04; speechSynthesis.cancel(); speechSynthesis.speak(u); } catch { /* */ }
}
const sayPace = (s: number | null) => { if (!s) return ''; const r = Math.round(s); return `${Math.floor(r / 60)} minutes ${r % 60} au kilomètre`; };
const sayDur = (s: number) => { const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = Math.round(s % 60); return `${h ? `${h} heure${h > 1 ? 's' : ''} ` : ''}${m} minute${m > 1 ? 's' : ''}${h ? '' : ` ${x} secondes`}`; };

/** Couleur d'allure : vert (rapide) → jaune → rouge (lent), relatif à la sortie */
function paceColor(p: number | null, lo: number, hi: number): string {
  if (p == null) return '#9a95a8';
  const x = Math.max(0, Math.min(1, hi > lo ? (p - lo) / (hi - lo) : 0.5));
  const hue = 135 - x * 135;
  return `hsl(${hue.toFixed(0)}, 78%, 44%)`;
}

// ───────────────────────────────── Mini-trace SVG (liste) ─────────────────────────────────
function MiniRoute({ poly, size = 64, color = F.accent }: { poly: Array<[number, number]>; size?: number; color?: string }) {
  if (poly.length < 2) return <div style={{ width: size, height: size, borderRadius: 14, background: F.tile, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>📍</div>;
  const lat0 = poly[0]![0] * Math.PI / 180;
  const xy = poly.map(([a, b]) => [b * Math.cos(lat0), -a] as const);
  const xs = xy.map(p => p[0]), ys = xy.map(p => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const s = Math.max(maxX - minX, maxY - minY) || 1, pad = 8, w = size - pad * 2;
  const ox = (w - (maxX - minX) / s * w) / 2, oy = (w - (maxY - minY) / s * w) / 2;
  const d = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${(pad + ox + (x - minX) / s * w).toFixed(1)},${(pad + oy + (y - minY) / s * w).toFixed(1)}`).join(' ');
  const last = xy[xy.length - 1]!, first = xy[0]!;
  const P = ([x, y]: readonly [number, number]) => [pad + ox + (x - minX) / s * w, pad + oy + (y - minY) / s * w];
  const [fx, fy] = P(first), [lx, ly] = P(last);
  return (
    <svg width={size} height={size} style={{ borderRadius: 14, background: '#eef1f6', flexShrink: 0 }}>
      <path d={d} fill="none" stroke={color} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={fx} cy={fy} r={3} fill={F.green} /><circle cx={lx} cy={ly} r={3} fill={F.red} />
    </svg>
  );
}

// ───────────────────────────────── Carte Leaflet ─────────────────────────────────
function useLeaflet(el: React.RefObject<HTMLDivElement>, interactive = true) {
  const map = useRef<L.Map | null>(null);
  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { zoomControl: false, attributionControl: true, dragging: interactive, scrollWheelZoom: interactive, touchZoom: interactive, doubleClickZoom: interactive });
    L.tileLayer(TILES, { attribution: TILES_ATTR, maxZoom: 19 }).addTo(m);
    m.attributionControl.setPrefix(false);
    m.setView([50.85, 4.35], 13);
    map.current = m;
    const ro = new ResizeObserver(() => m.invalidateSize()); ro.observe(el.current);
    return () => { ro.disconnect(); m.remove(); map.current = null; };
  }, [el, interactive]);
  return map;
}
const dot = (color: string, size = 14, ring = '#fff') => L.divIcon({ className: '', iconSize: [size, size], iconAnchor: [size / 2, size / 2],
  html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:3px solid ${ring};box-shadow:0 2px 6px rgba(0,0,0,.35);box-sizing:border-box"></div>` });
const kmIcon = (n: number) => L.divIcon({ className: '', iconSize: [22, 22], iconAnchor: [11, 11],
  html: `<div style="width:22px;height:22px;border-radius:11px;background:#17151c;color:#fff;font:700 11px -apple-system,sans-serif;display:flex;align-items:center;justify-content:center;border:2px solid #fff">${n}</div>` });

/** Carte d'une sortie terminée : trace colorée par l'allure, départ/arrivée, bornes km, point « curseur » du graphique */
function RouteMap({ d, h = 300, cursor }: { d: RunDetail; h?: number; cursor?: [number, number] | null }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useLeaflet(el);
  const cur = useRef<L.Marker | null>(null);
  useEffect(() => {
    const m = map.current; if (!m || d.track.length < 2) return;
    const group = L.layerGroup().addTo(m);
    const ps = d.track.map(p => p[2]).filter((x): x is number => x != null).sort((a, b) => a - b);
    const lo = ps[Math.floor(ps.length * 0.1)] ?? 0, hi = ps[Math.floor(ps.length * 0.9)] ?? 0;
    // ombre puis segments colorés
    L.polyline(d.track.map(p => [p[0], p[1]] as L.LatLngTuple), { color: '#000', weight: 8, opacity: 0.18 }).addTo(group);
    let seg: L.LatLngTuple[] = [], col = '';
    d.track.forEach((p, i) => {
      const c = isBike(d.run.type) ? paceColor(p[2], lo, hi) : paceColor(p[2], lo, hi);
      if (c !== col && seg.length) { L.polyline(seg, { color: col, weight: 5, opacity: 0.95, lineCap: 'round' }).addTo(group); seg = [seg[seg.length - 1]!]; }
      col = c; seg.push([p[0], p[1]]);
      if (i === d.track.length - 1 && seg.length > 1) L.polyline(seg, { color: col, weight: 5, opacity: 0.95, lineCap: 'round' }).addTo(group);
    });
    // bornes kilométriques
    const step = isBike(d.run.type) ? 5000 : 1000;
    let next = step;
    for (let i = 0; i < d.series.length && i < 2000; i++) {
      const s = d.series[i]!;
      if (s.d >= next) {
        const frac = s.d / Math.max(1, d.run.dist); const tp = d.track[Math.min(d.track.length - 1, Math.round(frac * (d.track.length - 1)))]!;
        L.marker([tp[0], tp[1]], { icon: kmIcon(next / 1000) }).addTo(group); next += step;
      }
    }
    const a = d.track[0]!, z = d.track[d.track.length - 1]!;
    L.marker([a[0], a[1]], { icon: dot(F.green) }).addTo(group);
    L.marker([z[0], z[1]], { icon: dot(F.red) }).addTo(group);
    m.fitBounds(L.latLngBounds(d.track.map(p => [p[0], p[1]] as L.LatLngTuple)), { padding: [24, 24] });
    return () => { group.remove(); };
  }, [d, map]);
  useEffect(() => {
    const m = map.current; if (!m) return;
    if (!cursor) { cur.current?.remove(); cur.current = null; return; }
    if (!cur.current) cur.current = L.marker(cursor, { icon: dot(F.accent, 18), zIndexOffset: 1000 }).addTo(m); else cur.current.setLatLng(cursor);
  }, [cursor, map]);
  return <div ref={el} style={{ height: h, borderRadius: 20, overflow: 'hidden', background: '#e8ecf2' }} />;
}

// ───────────────────────────────── Graphique allure/vitesse + altitude (doigt) ─────────────────────────────────
function RunChart({ d, onCursor }: { d: RunDetail; onCursor: (i: number | null) => void }) {
  const [i, setI] = useState<number | null>(null);
  const bike = isBike(d.run.type);
  // courbe lissée (moyenne glissante 5 points) : le GPS d'un téléphone tremble
  const s = useMemo(() => d.series.map((p, i, a) => { const w = a.slice(Math.max(0, i - 2), i + 3);
    const w2 = w.filter(x => Math.abs(x.t - p.t) < 40);   // jamais à travers une pause
    const ps = w2.map(x => x.pace).filter((x): x is number => x != null); const ks = w2.map(x => x.kmh);
    return { ...p, pace: p.pace == null ? null : Math.round(ps.reduce((x, y) => x + y, 0) / ps.length), kmh: Math.round(ks.reduce((x, y) => x + y, 0) / ks.length * 10) / 10 }; }), [d.series]);
  if (s.length < 3) return null;
  const W = 340, H = 170, top = 14, bot = 22, maxD = s[s.length - 1]!.d || 1;
  const X = (dd: number) => dd / maxD * W;
  const vals = s.map(p => bike ? p.kmh : p.pace).filter((x): x is number => x != null && x > 0);
  const sorted = [...vals].sort((a, b) => a - b);
  const lo0 = sorted[Math.floor(sorted.length * 0.05)] ?? 0, hi0 = sorted[Math.floor(sorted.length * 0.95)] ?? 1, padV = Math.max((hi0 - lo0) * 0.25, bike ? 2 : 15), lo = lo0 - padV, hi = hi0 + padV;
  // allure : plus rapide = plus haut (axe inversé), comme Strava
  const Yp = (v: number) => { const x = Math.max(lo, Math.min(hi, v)); const f = hi > lo ? (x - lo) / (hi - lo) : 0.5; return top + (bike ? 1 - f : f) * (H - top - bot); };
  const alts = s.map(p => p.alt).filter((x): x is number => x != null);
  const aMin = alts.length ? Math.min(...alts) : 0, aMax = alts.length ? Math.max(...alts) : 1, aR = Math.max(15, aMax - aMin);
  const Ya = (v: number) => top + (1 - (v - aMin) / aR) * (H - top - bot) * 0.9 + (H - top - bot) * 0.1;
  // ligne coupée aux pauses (trou de temps) et aux points sans allure, et on ignore le point juste après une pause
  let pd = '', brk = true; s.forEach((p, k) => { const v = bike ? p.kmh : p.pace; const gap = k > 0 && p.t - s[k - 1]!.t > 25;
    if (v == null || v <= 0 || gap) { brk = true; return; } pd += `${brk ? 'M' : 'L'}${X(p.d).toFixed(1)},${Yp(v).toFixed(1)}`; brk = false; });
  let ad = ''; if (alts.length > 2) { s.forEach(p => { if (p.alt == null) return; ad += `${ad ? 'L' : 'M'}${X(p.d).toFixed(1)},${Ya(p.alt).toFixed(1)}`; }); ad += `L${W},${H - bot}L0,${H - bot}Z`; }
  const avg = bike ? d.run.speed : d.run.pace;
  const touch = (clientX: number, rect: DOMRect) => { const dd = (clientX - rect.left) / rect.width * maxD; let k = 0; while (k < s.length - 1 && s[k]!.d < dd) k++; setI(k); onCursor(k); };
  const p = i != null ? s[i] : null;
  return (
    <div style={{ ...card, padding: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <div style={{ fontWeight: 700 }}>{bike ? 'Vitesse' : 'Allure'} <span style={{ color: '#9a95a8', fontWeight: 600 }}>& altitude</span></div>
        <div style={{ fontSize: 12.5, color: F.muted, fontVariantNumeric: 'tabular-nums' }}>{p ? `${km(p.d)} km · ${fmtDur(p.t)} · ${bike ? `${p.kmh} km/h` : `${fmtPace(p.pace)}/km`}${p.alt != null ? ` · ${p.alt} m` : ''}` : 'Glisse le doigt sur la courbe'}</div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: H, touchAction: 'none', display: 'block' }}
        onPointerMove={e => touch(e.clientX, e.currentTarget.getBoundingClientRect())} onPointerDown={e => touch(e.clientX, e.currentTarget.getBoundingClientRect())}
        onPointerLeave={() => { setI(null); onCursor(null); }}>
        <defs><linearGradient id="altg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#9aa3b5" stopOpacity="0.45" /><stop offset="1" stopColor="#9aa3b5" stopOpacity="0.08" /></linearGradient></defs>
        {ad && <path d={ad} fill="url(#altg)" />}
        {avg ? <><line x1={0} x2={W} y1={Yp(avg)} y2={Yp(avg)} stroke={F.accent} strokeDasharray="4 4" strokeOpacity={0.6} /><text x={4} y={Yp(avg) - 4} fontSize="10" fill={F.accent} fontWeight="700">moy. {bike ? `${avg} km/h` : fmtPace(avg)}</text></> : null}
        <path d={pd} fill="none" stroke={F.accent} strokeWidth={2} strokeLinejoin="round" />
        {Array.from({ length: Math.floor(maxD / (bike ? 5000 : 1000)) }, (_, k) => (k + 1) * (bike ? 5000 : 1000)).filter((_, k, a) => a.length < 12 || k % 2 === 1).map(m => <text key={m} x={X(m)} y={H - 6} fontSize="9.5" fill={F.muted} textAnchor="middle">{m / 1000}</text>)}
        {p && <><line x1={X(p.d)} x2={X(p.d)} y1={top - 6} y2={H - bot} stroke={F.ink} strokeWidth={1} />{(bike ? p.kmh : p.pace) ? <circle cx={X(p.d)} cy={Yp((bike ? p.kmh : p.pace)!)} r={4.5} fill={F.accent} stroke="#fff" strokeWidth={2} /> : null}</>}
      </svg>
    </div>
  );
}

// ───────────────────────────────── Détail d'une sortie ─────────────────────────────────
const statCell = (v: ReactNode, l: string, big = false): JSX.Element => (
  <div style={{ minWidth: 0 }}><div style={{ fontSize: big ? 26 : 19, fontWeight: 800, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>{v}</div><div style={{ fontSize: 11.5, color: F.muted, fontWeight: 600, marginTop: 1 }}>{l}</div></div>
);

function Splits({ r }: { r: RunSummary }) {
  if (!r.splits.length) return null;
  const bike = isBike(r.type);
  const full = r.splits.filter(s => s.dist >= (bike ? 4000 : 800));
  const best = full.length ? Math.min(...full.map(s => s.pace)) : 0, worst = full.length ? Math.max(...full.map(s => s.pace)) : 1;
  return (
    <div style={{ ...card, padding: 14 }}>
      <div style={{ fontWeight: 700, marginBottom: 8 }}>Splits <span style={{ color: '#9a95a8', fontWeight: 600 }}>{bike ? 'tous les 5 km' : 'par km'}</span></div>
      <div style={{ display: 'grid', gridTemplateColumns: '34px 64px 1fr 44px', gap: '6px 8px', alignItems: 'center', fontSize: 13.5, fontVariantNumeric: 'tabular-nums' }}>
        <div style={{ color: F.muted, fontSize: 11.5, fontWeight: 700 }}>KM</div><div style={{ color: F.muted, fontSize: 11.5, fontWeight: 700 }}>{bike ? 'KM/H' : 'ALLURE'}</div><div /><div style={{ color: F.muted, fontSize: 11.5, fontWeight: 700, textAlign: 'end' }}>D±</div>
        {r.splits.map(s => {
          const partial = s.dist < (bike ? 4000 : 800);
          const w = worst > best ? 0.35 + 0.65 * (1 - (s.pace - best) / (worst - best)) : 1;
          return [
            <div key={`k${s.km}`} style={{ fontWeight: 700 }}>{partial ? km(s.dist + (s.km - 1) * (bike ? 5000 : 1000), 1) : s.km * (bike ? 5 : 1)}</div>,
            <div key={`p${s.km}`} style={{ fontWeight: 700 }}>{bike ? (s.dist / s.sec * 3.6).toFixed(1) : fmtPace(s.pace)}</div>,
            <div key={`b${s.km}`} style={{ height: 14, borderRadius: 7, background: F.bg2, overflow: 'hidden' }}><motion.div initial={{ width: 0 }} animate={{ width: `${Math.round(Math.max(0.1, Math.min(1, partial ? 0.3 : w)) * 100)}%` }} transition={{ duration: 0.6 }} style={{ height: '100%', borderRadius: 7, background: !partial && s.pace === best ? F.green : F.accent, opacity: partial ? 0.4 : 1 }} /></div>,
            <div key={`e${s.km}`} style={{ textAlign: 'end', color: s.elev > 0 ? F.red : s.elev < 0 ? F.green : F.muted }}>{s.elev > 0 ? '+' : ''}{s.elev}</div>,
          ];
        })}
      </div>
    </div>
  );
}

/** Image à partager (story 1080×1350) dessinée en canvas : trace + chiffres */
async function shareImage(d: RunDetail, name: string): Promise<string> {
  const W = 1080, H = 1350, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  const grd = g.createLinearGradient(0, 0, 0, H); grd.addColorStop(0, '#1d1b26'); grd.addColorStop(1, '#0d0c12'); g.fillStyle = grd; g.fillRect(0, 0, W, H);
  const r = d.run; const tr = d.track;
  if (tr.length > 1) {
    const lat0 = tr[0]![0] * Math.PI / 180;
    const xy = tr.map(p => [p[1] * Math.cos(lat0), -p[0]] as const);
    const xs = xy.map(p => p[0]), ys = xy.map(p => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const box = 820, s = Math.max(maxX - minX, maxY - minY) || 1;
    const ox = (W - (maxX - minX) / s * box) / 2, oy = 150 + (box - (maxY - minY) / s * box) / 2;
    const P = (i: number) => [ox + (xy[i]![0] - minX) / s * box, oy + (xy[i]![1] - minY) / s * box] as const;
    const ps = tr.map(p => p[2]).filter((x): x is number => x != null).sort((a, b) => a - b);
    const lo = ps[Math.floor(ps.length * 0.1)] ?? 0, hi = ps[Math.floor(ps.length * 0.9)] ?? 0;
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.strokeStyle = 'rgba(255,255,255,0.08)'; g.lineWidth = 26; g.beginPath(); tr.forEach((_, i) => { const [x, y] = P(i); if (i) g.lineTo(x, y); else g.moveTo(x, y); }); g.stroke();
    g.lineWidth = 12;
    for (let i = 1; i < tr.length; i++) { const [x1, y1] = P(i - 1), [x2, y2] = P(i); g.strokeStyle = paceColor(tr[i]![2], lo, hi); g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); }
    const [sx, sy] = P(0), [ex, ey] = P(tr.length - 1);
    g.fillStyle = '#1f9d5c'; g.beginPath(); g.arc(sx, sy, 18, 0, 7); g.fill(); g.fillStyle = '#e5322d'; g.beginPath(); g.arc(ex, ey, 18, 0, 7); g.fill();
  }
  g.fillStyle = '#fff'; g.font = '800 54px -apple-system, "SF Pro Display", sans-serif'; g.fillText(`${TYPE_E[r.type]} ${r.title}`, 70, 100);
  g.fillStyle = 'rgba(255,255,255,0.55)'; g.font = '600 32px -apple-system, sans-serif'; g.fillText(`${fmtDate(r.date)}${name ? ` · ${name}` : ''}`, 70, 145);
  const cols: Array<[string, string]> = [[`${km(r.dist)}`, 'km'], [fmtDur(r.moving), 'temps'], [isBike(r.type) ? `${r.speed}` : fmtPace(r.pace), isBike(r.type) ? 'km/h' : 'allure /km'], [`${r.elevGain} m`, 'dénivelé']];
  cols.forEach(([v, l], i) => { const x = 70 + i * 245; g.fillStyle = '#fff'; g.font = '800 64px -apple-system, sans-serif'; g.fillText(v, x, 1150); g.fillStyle = 'rgba(255,255,255,0.55)'; g.font = '600 28px -apple-system, sans-serif'; g.fillText(l, x, 1195); });
  if (r.prs.length) { g.fillStyle = '#e09a12'; g.font = '700 32px -apple-system, sans-serif'; g.fillText(`🏆 ${r.prs.slice(0, 2).join(' · ')}`.slice(0, 60), 70, 1265); }
  g.fillStyle = 'rgba(255,255,255,0.35)'; g.font = '700 28px -apple-system, sans-serif'; g.textAlign = 'right'; g.fillText('FORME', W - 70, 1310);
  return c.toDataURL('image/png');
}

function RunDetailSheet({ id, onClose, onChanged, onGhost, toast, name }: { id: string | null; onClose: () => void; onChanged: () => void; onGhost: (r: RunDetail) => void; toast: (t: string) => void; name: string }) {
  const [d, setD] = useState<RunDetail | null>(null);
  const [err, setErr] = useState('');
  const [cursorI, setCursorI] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(''); const [note, setNote] = useState('');
  useEffect(() => { setD(null); setErr(''); setCursorI(null); setEditing(false); if (id) forme.run(id).then(x => { setD(x); setTitle(x.run.title); setNote(x.run.note ?? ''); }).catch(e => setErr(errText(e))); }, [id]);
  const cursor = useMemo<[number, number] | null>(() => {
    if (!d || cursorI == null) return null;
    const s = d.series[cursorI]; if (!s) return null;
    const tp = d.track[Math.min(d.track.length - 1, Math.round(s.d / Math.max(1, d.run.dist) * (d.track.length - 1)))];
    return tp ? [tp[0], tp[1]] : null;
  }, [d, cursorI]);
  const r = d?.run;
  const save = async (patch: { title?: string; note?: string; feel?: number; type?: RunType }) => {
    if (!r) return;
    try { const x = await forme.editRun(r.id, patch); setD(v => v ? { ...v, run: x.run } : v); onChanged(); } catch (e) { toast(errText(e)); }
  };
  const share = async () => {
    if (!d) return;
    try {
      const url = await shareImage(d, name);
      const blob = await (await fetch(url)).blob(); const file = new File([blob], 'forme-sortie.png', { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: d.run.title });
      else { const a = document.createElement('a'); a.href = url; a.download = 'forme-sortie.png'; a.click(); }
    } catch { /* annulé */ }
  };
  return (
    <Sheet open={!!id} onClose={onClose} z={60} title={r ? <div><div style={{ fontSize: 12.5, color: F.muted, fontWeight: 600 }}>{TYPE_E[r.type]} {fmtDate(r.date)} · {new Date(r.startedAt).toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' })}</div><div style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em', marginTop: 2 }}>{r.title}</div></div> : 'Sortie'}>
      {err && <div style={{ color: F.red, fontWeight: 700 }}>{err}</div>}
      {!d && !err && <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spinner /></div>}
      {d && r && <div style={{ display: 'grid', gap: 12 }}>
        <RouteMap d={d} cursor={cursor} />
        {r.prs.length > 0 && <div style={{ ...card, background: 'linear-gradient(135deg,#fff6e0,#fff)', border: `1px solid ${F.gold}55`, padding: 12 }}>
          <div style={{ fontWeight: 800, color: '#a86b00' }}>🏆 {r.prs.length} record{r.prs.length > 1 ? 's' : ''} battu{r.prs.length > 1 ? 's' : ''} !</div>
          <div style={{ fontSize: 13.5, marginTop: 4 }}>{r.prs.join(' · ')}</div></div>}
        <div style={{ ...card, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
          {statCell(km(r.dist), 'km', true)}{statCell(fmtDur(r.moving), 'temps en mouvement', true)}{statCell(paceOrSpeed(r.type, r.pace, r.speed), isBike(r.type) ? 'km/h moyenne' : 'allure /km', true)}
          {statCell(`${r.elevGain} m`, 'dénivelé +')}{statCell(`${r.kcal}`, 'kcal')}{statCell(isBike(r.type) ? `${r.maxSpeed}` : fmtPace(r.maxSpeed ? 3600 / r.maxSpeed : null), isBike(r.type) ? 'km/h max' : 'allure max')}
          {statCell(fmtDur(r.elapsed), 'temps total')}{statCell(isBike(r.type) ? fmtPace(r.pace) : `${r.speed}`, isBike(r.type) ? 'min/km' : 'km/h moy.')}{statCell(r.altMax != null ? `${r.altMin}–${r.altMax} m` : '—', 'altitude')}
        </div>
        <RunChart d={d} onCursor={setCursorI} />
        <Splits r={r} />
        {r.efforts.length > 0 && <div style={{ ...card, padding: 14 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Meilleurs efforts</div>
          {r.efforts.map(e => <div key={e.m} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderTop: `1px solid ${F.line}` }}>
            <div style={{ flex: 1, fontWeight: 600 }}>{e.label}</div>
            {e.pr && <span style={{ fontSize: 11.5, fontWeight: 800, color: '#a86b00', background: '#fff1cc', padding: '3px 8px', borderRadius: 8 }}>🏆 RECORD</span>}
            <div style={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{fmtDur(e.sec)}</div>
            <div style={{ width: 62, textAlign: 'end', fontSize: 12.5, color: F.muted, fontVariantNumeric: 'tabular-nums' }}>{fmtPace(e.sec / (e.m / 1000))}/km</div>
          </div>)}
        </div>}
        {r.laps.length > 0 && <div style={{ ...card, padding: 14 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Tours</div>
          {r.laps.map(l => <div key={l.n} style={{ display: 'flex', gap: 10, padding: '6px 0', borderTop: `1px solid ${F.line}`, fontVariantNumeric: 'tabular-nums', fontSize: 14 }}><b style={{ width: 28 }}>{l.n}</b><span style={{ flex: 1 }}>{km(l.dist)} km</span><span>{fmtDur(l.sec)}</span><span style={{ width: 70, textAlign: 'end', color: F.muted }}>{fmtPace(l.pace)}/km</span></div>)}
        </div>}
        <div style={{ ...card, padding: 14 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Ressenti</div>
          <div style={{ display: 'flex', gap: 6 }}>{['😫', '😕', '🙂', '😀', '🔥'].map((e, i) => <button key={e} onClick={() => void save({ feel: i + 1 })} style={{ flex: 1, fontSize: 24, padding: '8px 0', borderRadius: 14, border: `2px solid ${r.feel === i + 1 ? F.accent : 'transparent'}`, background: F.bg2, cursor: 'pointer' }}>{e}</button>)}</div>
          {editing ? <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
            <input value={title} onChange={e => setTitle(e.target.value)} style={input} placeholder="Titre" />
            <textarea value={note} onChange={e => setNote(e.target.value)} style={{ ...input, minHeight: 70, resize: 'vertical' }} placeholder="Note (comment c'était, météo, chaussures…)" />
            <div style={{ display: 'flex', gap: 6 }}>{TYPES.map(t => <Chip key={t.id} on={r.type === t.id} onClick={() => void save({ type: t.id })}>{t.e}</Chip>)}</div>
            <button onClick={() => { void save({ title, note }); setEditing(false); }} style={btn}>Enregistrer</button>
          </div> : <>{r.note && <div style={{ fontSize: 14, marginTop: 10, lineHeight: 1.45 }}>{r.note}</div>}<button onClick={() => setEditing(true)} style={{ ...ghostBtn, marginTop: 10, width: '100%' }}>✏️ Modifier titre / note / type</button></>}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => void share()} style={{ ...btn, flex: 1 }}>📤 Partager</button>
          <button onClick={() => onGhost(d)} style={{ ...btn, flex: 1, background: F.dark, boxShadow: 'none' }}>👻 Refaire ce parcours</button>
        </div>
        <button onClick={async () => { if (!confirm('Supprimer cette sortie ?')) return; try { await forme.delRun(r.id); onChanged(); onClose(); toast('Sortie supprimée'); } catch (e) { toast(errText(e)); } }} style={{ ...ghostBtn, color: F.red }}>Supprimer la sortie</button>
      </div>}
    </Sheet>
  );
}

// ───────────────────────────────── Enregistreur en direct ─────────────────────────────────
interface Live { type: RunType; startedAt: number; points: RunPt[]; pauses: Array<[number, number]>; laps: number[]; ghostOf?: string; goal?: { kind: 'km' | 'min'; v: number } | null; paused?: number | null }
const readLive = (): Live | null => { try { const x = JSON.parse(localStorage.getItem(LIVE_K) || 'null') as Live | null; return x && Array.isArray(x.points) ? x : null; } catch { return null; } };
const writeLive = (l: Live | null) => { try { if (l) localStorage.setItem(LIVE_K, JSON.stringify(l)); else localStorage.removeItem(LIVE_K); } catch { /* plein */ } };

interface Ghost { title: string; cum: number[]; t: number[]; track: Array<[number, number, number | null]> }
const ghostTimeAt = (g: Ghost, m: number): number | null => {
  const { cum, t } = g;
  for (let i = 1; i < cum.length; i++) if (cum[i]! >= m) { const f = (m - cum[i - 1]!) / ((cum[i]! - cum[i - 1]!) || 1); return t[i - 1]! + f * (t[i]! - t[i - 1]!); }
  return null;
};

function Recorder({ type, cfg, ghost, goal, resume, onDone, onCancel }: { type: RunType; cfg: RunCfg; ghost: Ghost | null; goal: Live['goal']; resume: Live | null; onDone: (l: Live) => void; onCancel: () => void }) {
  const live = useRef<Live>(resume ?? { type, startedAt: Date.now(), points: [], pauses: [], laps: [], ghostOf: undefined, goal, paused: null });
  const [, force] = useState(0);
  const [count, setCount] = useState(resume ? 0 : 3);
  const [acc, setAcc] = useState<number | null>(null);
  const [pocket, setPocket] = useState(false);
  const [hold, setHold] = useState(0);
  const [gpsErr, setGpsErr] = useState('');
  const dist = useRef(0); const lastPt = useRef<RunPt | null>(null);
  const autoPausedAt = useRef<number | null>(null); const stillSince = useRef<number | null>(null);
  const nextVoice = useRef(0); const lastSplitT = useRef(0); const lastSplitD = useRef(0);
  const mapEl = useRef<HTMLDivElement>(null); const map = useLeaflet(mapEl);
  const line = useRef<L.Polyline | null>(null); const me = useRef<L.Marker | null>(null); const ghostMk = useRef<L.Marker | null>(null);
  const follow = useRef(true);
  const L0 = live.current;
  const now = () => (Date.now() - L0.startedAt) / 1000;
  const pausedNow = () => L0.paused != null;
  const voiceStep = cfg.voiceEvery * 1000;

  // reprise après crash : recalcule la distance
  useEffect(() => {
    if (!resume) return;
    let d = 0, prev: RunPt | null = null;
    const inPause = (t: number) => resume.pauses.some(([a, b]) => t > a && t <= b);
    for (const p of resume.points) { if (prev && !inPause(p[2])) d += hav([prev[0], prev[1]], [p[0], p[1]]); prev = p; }
    dist.current = d; lastPt.current = prev; nextVoice.current = voiceStep ? Math.ceil((d + 1) / voiceStep) * voiceStep : Infinity;
    lastSplitD.current = Math.floor(d / 1000) * 1000; lastSplitT.current = now();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!resume) nextVoice.current = voiceStep || Infinity; }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // compte à rebours 3-2-1
  useEffect(() => {
    if (count <= 0) return;
    vibrate(40); const t = setTimeout(() => { setCount(c => c - 1); if (count === 1) { L0.startedAt = Date.now(); say(`C'est parti ! ${TYPE_L[type]} lancée.${goal ? ` Objectif ${goal.v} ${goal.kind === 'km' ? 'kilomètres' : 'minutes'}.` : ''}${ghost ? ' Tu cours contre ton fantôme.' : ''}`); } }, 1000);
    return () => clearTimeout(t);
  }, [count]); // eslint-disable-line react-hooks/exhaustive-deps

  // écran allumé
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const get = async () => { try { lock = await (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request('screen') ?? null; } catch { /* */ } };
    void get();
    const vis = () => { if (document.visibilityState === 'visible') void get(); };
    document.addEventListener('visibilitychange', vis);
    return () => { document.removeEventListener('visibilitychange', vis); void lock?.release().catch(() => {}); };
  }, []);

  // fantôme sur la carte
  useEffect(() => {
    const m = map.current; if (!m || !ghost) return;
    const gl = L.polyline(ghost.track.map(p => [p[0], p[1]] as L.LatLngTuple), { color: '#7b5cf0', weight: 5, opacity: 0.35, dashArray: '6 8' }).addTo(m);
    if (!L0.points.length && ghost.track.length) m.fitBounds(gl.getBounds(), { padding: [30, 30] });
    return () => { gl.remove(); };
  }, [ghost, map]); // eslint-disable-line react-hooks/exhaustive-deps

  const pause = useCallback((auto = false) => { if (pausedNow()) return; L0.paused = now(); if (auto) autoPausedAt.current = L0.paused; vibrate(60); say(auto ? 'Pause automatique' : 'Pause'); writeLive(L0); force(x => x + 1); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const resumeRun = useCallback((auto = false) => { if (!pausedNow()) return; L0.pauses.push([L0.paused!, now()]); L0.paused = null; autoPausedAt.current = null; vibrate(60); say(auto ? 'Reprise' : 'On repart'); writeLive(L0); force(x => x + 1); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // GPS
  useEffect(() => {
    if (!('geolocation' in navigator)) { setGpsErr('GPS indisponible sur cet appareil'); return; }
    const id = navigator.geolocation.watchPosition(pos => {
      const c = pos.coords; setAcc(Math.round(c.accuracy)); setGpsErr('');
      const m = map.current;
      const ll: L.LatLngTuple = [c.latitude, c.longitude];
      if (m) {
        if (!me.current) { me.current = L.marker(ll, { icon: dot(F.accent, 20) }).addTo(m); m.setView(ll, 16); } else me.current.setLatLng(ll);
        if (follow.current && L0.points.length) m.panTo(ll, { animate: true });
      }
      if (count > 0) return;                          // pas encore parti
      const t = now();
      const p: RunPt = [Math.round(c.latitude * 1e6) / 1e6, Math.round(c.longitude * 1e6) / 1e6, Math.round(t * 10) / 10, c.altitude != null ? Math.round(c.altitude * 10) / 10 : null, Math.round(c.accuracy)];
      const prev = lastPt.current;
      const seg = prev ? hav([prev[0], prev[1]], [p[0], p[1]]) : 0, dt = prev ? t - prev[2] : 0;
      const v = dt > 0 ? seg / dt : 0;
      // pause auto : immobile ≥ 8 s → pause ; repart (≥ 2× vitesse mini sur 2 points) → reprise
      if (cfg.autoPause && prev && c.accuracy <= 35) {
        if (!pausedNow()) { if (v < MOVE_MIN[type] * 0.6) { stillSince.current ??= t; if (t - stillSince.current >= 8) pause(true); } else stillSince.current = null; }
        else if (autoPausedAt.current != null && v > MOVE_MIN[type] * 1.5 && seg > 6) { stillSince.current = null; resumeRun(true); }
      }
      if (c.accuracy > 50 && L0.points.length > 3) return;          // point trop imprécis
      if (prev && dt > 0 && v > JUMP_MAX[type] && dt < 60) return;    // saut GPS
      if (prev && seg < 2 && dt < 15) return;                         // bruit à l'arrêt
      L0.points.push(p);
      if (!pausedNow() && prev) dist.current += seg;
      lastPt.current = p;
      if (m) { if (!line.current) line.current = L.polyline([ll], { color: F.accent, weight: 6, opacity: 0.95, lineCap: 'round' }).addTo(m); else line.current.addLatLng(ll); }
      // fantôme : où il était au même temps de course
      if (ghost && m) {
        const mov = movingSec();
        let k = 0; while (k < ghost.t.length - 1 && ghost.t[k]! < mov) k++;
        const gp = ghost.track[Math.min(ghost.track.length - 1, Math.round(k / Math.max(1, ghost.t.length - 1) * (ghost.track.length - 1)))];
        if (gp) { if (!ghostMk.current) ghostMk.current = L.marker([gp[0], gp[1]], { icon: dot('#7b5cf0', 16) }).addTo(m); else ghostMk.current.setLatLng([gp[0], gp[1]]); }
      }
      // annonces vocales
      const d = dist.current;
      if (d >= nextVoice.current) {
        const mov = movingSec(); const splitSec = mov - lastSplitT.current, splitD = d - lastSplitD.current;
        const splitPace = splitD > 100 ? splitSec / (splitD / 1000) : null;
        let txt = `${km(d, d % 1000 < 50 ? 0 : 1).replace(',', ' virgule ')} kilomètre${d >= 2000 ? 's' : ''}. Temps ${sayDur(mov)}.`;
        txt += isBike(type) ? ` Vitesse moyenne ${(d / mov * 3.6).toFixed(0)} kilomètres heure.` : ` Dernier kilomètre ${sayPace(splitPace)}. Moyenne ${sayPace(mov / (d / 1000))}.`;
        if (cfg.targetPace && !isBike(type) && splitPace) { const diff = Math.round(splitPace - cfg.targetPace); txt += Math.abs(diff) <= 5 ? ' Pile dans ton allure cible.' : diff > 0 ? ` ${diff} secondes plus lent que ta cible, accélère un peu.` : ` ${-diff} secondes plus rapide que ta cible.`; }
        if (ghost) { const gt = ghostTimeAt(ghost, d); if (gt != null) { const diff = Math.round(gt - mov); txt += diff >= 0 ? ` ${diff} secondes d'avance sur ton fantôme.` : ` ${-diff} secondes de retard sur ton fantôme.`; } }
        if (goal?.kind === 'km') { const left = goal.v * 1000 - d; if (left > 0) txt += ` Encore ${km(left, 1).replace(',', ' virgule ')} kilomètres.`; }
        say(txt); vibrate(120);
        lastSplitT.current = mov; lastSplitD.current = d;
        nextVoice.current += voiceStep || Infinity;
      }
      if (goal?.kind === 'km' && d >= goal.v * 1000 && !(L0 as Live & { goalSaid?: boolean }).goalSaid) { (L0 as Live & { goalSaid?: boolean }).goalSaid = true; say(`Objectif atteint ! ${goal.v} kilomètres. Bravo !`); vibrate(400); }
      force(x => x + 1);
    }, e => setGpsErr(e.code === 1 ? 'Autorise la localisation pour FORME (Réglages → Safari → Position → Autoriser)' : 'Recherche du signal GPS…'), { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
    return () => navigator.geolocation.clearWatch(id);
  }, [count, map]); // eslint-disable-line react-hooks/exhaustive-deps

  // sauvegarde sur le téléphone toutes les 5 s + tic du chrono
  useEffect(() => { const t = setInterval(() => { if (count <= 0) writeLive(L0); force(x => x + 1);
    if (goal?.kind === 'min' && count <= 0 && movingSec() >= goal.v * 60 && !(L0 as Live & { goalSaid?: boolean }).goalSaid) { (L0 as Live & { goalSaid?: boolean }).goalSaid = true; say(`Objectif atteint ! ${goal.v} minutes. Bravo !`); vibrate(400); }
  }, 1000); return () => clearInterval(t); }, [count]); // eslint-disable-line react-hooks/exhaustive-deps

  const movingSec = () => { const t = count > 0 ? 0 : now(); const pz = L0.pauses.reduce((a, [x, y]) => a + (y - x), 0) + (L0.paused != null ? t - L0.paused : 0); return Math.max(0, t - pz); };
  const mov = movingSec(); const d = dist.current;
  const avgPace = d > 50 ? mov / (d / 1000) : null;
  // allure instantanée : 30 dernières secondes
  const instPace = (() => { const ps = L0.points; if (ps.length < 2 || pausedNow()) return null; const last = ps[ps.length - 1]!; let j = ps.length - 1; while (j > 0 && last[2] - ps[j]![2] < 30) j--; let dd = 0; for (let k = j + 1; k < ps.length; k++) dd += hav([ps[k - 1]![0], ps[k - 1]![1]], [ps[k]![0], ps[k]![1]]); const dt = last[2] - ps[j]![2]; return dd > 15 && dt > 0 ? dt / (dd / 1000) : null; })();
  const kmh = mov > 0 ? d / mov * 3.6 : 0;
  const elev = (() => { let g = 0, ref: number | null = null; for (const p of L0.points) { if (p[3] == null) continue; if (ref == null) { ref = p[3]; continue; } if (p[3] - ref >= 4) { g += p[3] - ref; ref = p[3]; } else if (ref - p[3] >= 4) ref = p[3]; } return Math.round(g); })();
  const gDiff = ghost ? (() => { const gt = ghostTimeAt(ghost, d); return gt != null ? Math.round(gt - mov) : null; })() : null;
  const goalPct = goal ? Math.min(1, goal.kind === 'km' ? d / (goal.v * 1000) : mov / (goal.v * 60)) : 0;
  const paused = pausedNow();
  const sig = acc == null ? 0 : acc <= 10 ? 3 : acc <= 25 ? 2 : 1;

  // bouton FIN = appui long (pas d'arrêt par erreur en courant)
  useEffect(() => { if (!hold) return; if (hold >= 100) { setHold(0); finish(); return; } const t = setTimeout(() => setHold(h => h > 0 ? h + 10 : 0), 60); return () => clearTimeout(t); }, [hold]); // eslint-disable-line react-hooks/exhaustive-deps
  const finish = () => {
    if (L0.paused != null) { L0.pauses.push([L0.paused, now()]); L0.paused = null; }
    writeLive(L0); vibrate(200);
    say(`Bravo ! ${km(d, 2).replace(',', ' virgule ')} kilomètres en ${sayDur(mov)}.`);
    onDone({ ...L0 });
  };
  const big: CSSProperties = { fontSize: 44, fontWeight: 800, letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums', lineHeight: 1 };
  const lbl: CSSProperties = { fontSize: 11.5, fontWeight: 700, color: 'rgba(255,255,255,0.55)', letterSpacing: '0.06em', textTransform: 'uppercase', marginTop: 4 };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 70, background: F.dark, color: '#fff', display: 'flex', flexDirection: 'column', fontFamily: F.sans }}>
      <div style={{ position: 'relative', flex: '1 1 40%', minHeight: 180 }}>
        <div ref={mapEl} style={{ position: 'absolute', inset: '0 0 20px 0' }} onPointerDown={() => { follow.current = false; }} />
        <div style={{ position: 'absolute', top: 'calc(10px + env(safe-area-inset-top))', left: 12, right: 12, display: 'flex', gap: 8, zIndex: 500, pointerEvents: 'none' }}>
          <div style={{ background: 'rgba(23,21,28,0.82)', borderRadius: 999, padding: '7px 12px', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ display: 'inline-flex', gap: 2, alignItems: 'flex-end' }}>{[1, 2, 3].map(k => <span key={k} style={{ width: 4, height: 4 + k * 3, borderRadius: 1, background: sig >= k ? (sig === 3 ? '#3ad07a' : sig === 2 ? '#f1c232' : '#ff5a4f') : 'rgba(255,255,255,0.25)' }} />)}</span>
            GPS {acc != null ? `±${acc} m` : '…'}
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ background: 'rgba(23,21,28,0.82)', borderRadius: 999, padding: '7px 12px', fontSize: 13, fontWeight: 700 }}>{TYPE_E[type]} {TYPE_L[type]}</div>
        </div>
        <button onClick={() => { follow.current = true; const ll = me.current?.getLatLng(); if (ll) map.current?.setView(ll, 16); }} style={{ position: 'absolute', right: 12, bottom: 32, zIndex: 500, width: 44, height: 44, borderRadius: 22, border: 'none', background: '#fff', boxShadow: '0 4px 12px rgba(0,0,0,0.25)', fontSize: 18, cursor: 'pointer' }}>◎</button>
        <button onClick={() => setPocket(true)} style={{ position: 'absolute', left: 12, bottom: 32, zIndex: 500, height: 44, padding: '0 14px', borderRadius: 22, border: 'none', background: '#fff', color: F.ink, boxShadow: '0 4px 12px rgba(0,0,0,0.25)', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>🌙 Mode poche</button>
        {gpsErr && <div style={{ position: 'absolute', left: 12, right: 12, top: 'calc(56px + env(safe-area-inset-top))', zIndex: 500, background: F.red, borderRadius: 14, padding: '10px 12px', fontSize: 13.5, fontWeight: 700 }}>{gpsErr}</div>}
      </div>
      <div style={{ padding: '16px 18px calc(16px + env(safe-area-inset-bottom))', background: `linear-gradient(180deg, ${F.dark2}, ${F.dark})`, borderRadius: '24px 24px 0 0', marginTop: -20, position: 'relative', zIndex: 600 }}>
        {paused && <div style={{ textAlign: 'center', fontWeight: 800, color: '#f1c232', marginBottom: 8, letterSpacing: '0.08em' }}>{autoPausedAt.current != null ? 'PAUSE AUTO — reprend dès que tu bouges' : 'EN PAUSE'}</div>}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, textAlign: 'center' }}>
          <div><div style={{ ...big, fontSize: 56 }}>{fmtDur(mov)}</div><div style={lbl}>Temps</div></div>
          <div><div style={{ ...big, fontSize: 56 }}>{km(d)}</div><div style={lbl}>Kilomètres</div></div>
          <div><div style={big}>{isBike(type) ? kmh.toFixed(1).replace('.', ',') : fmtPace(instPace)}</div><div style={lbl}>{isBike(type) ? 'km/h moyenne' : 'Allure actuelle'}</div></div>
          <div><div style={big}>{isBike(type) ? `${elev}` : fmtPace(avgPace)}</div><div style={lbl}>{isBike(type) ? 'Dénivelé + (m)' : 'Allure moyenne'}</div></div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 10, fontSize: 13, color: 'rgba(255,255,255,0.7)', fontWeight: 600, flexWrap: 'wrap' }}>
          {!isBike(type) && <span>⛰ {elev} m</span>}
          {cfg.targetPace && !isBike(type) && <span>🎯 cible {fmtPace(cfg.targetPace)}</span>}
          {L0.laps.length > 0 && <span>🔁 {L0.laps.length} tour{L0.laps.length > 1 ? 's' : ''}</span>}
          {gDiff != null && <span style={{ color: gDiff >= 0 ? '#3ad07a' : '#ff8a80', fontWeight: 800 }}>👻 {gDiff >= 0 ? `+${gDiff} s d'avance` : `${gDiff} s de retard`}</span>}
        </div>
        {goal && <div style={{ marginTop: 10 }}><div style={{ height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.12)', overflow: 'hidden' }}><div style={{ width: `${goalPct * 100}%`, height: '100%', background: goalPct >= 1 ? '#3ad07a' : F.accent2, transition: 'width .5s' }} /></div><div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 4, textAlign: 'center' }}>Objectif {goal.v} {goal.kind === 'km' ? 'km' : 'min'} · {Math.round(goalPct * 100)} %</div></div>}
        <div style={{ display: 'flex', gap: 10, marginTop: 16, alignItems: 'center' }}>
          <button onClick={() => { L0.laps.push(now()); vibrate(50); say(`Tour ${L0.laps.length}`); force(x => x + 1); }} disabled={paused || count > 0} style={{ width: 62, height: 62, borderRadius: 31, border: 'none', background: 'rgba(255,255,255,0.12)', color: '#fff', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>Tour</button>
          <button onClick={() => paused ? resumeRun() : pause()} disabled={count > 0} style={{ flex: 1, height: 66, borderRadius: 33, border: 'none', background: paused ? F.green : '#fff', color: paused ? '#fff' : F.ink, fontWeight: 800, fontSize: 18, cursor: 'pointer' }}>{paused ? '▶ Reprendre' : '❚❚ Pause'}</button>
          <button onPointerDown={() => setHold(10)} onPointerUp={() => setHold(0)} onPointerLeave={() => setHold(0)} disabled={count > 0}
            style={{ position: 'relative', width: 62, height: 62, borderRadius: 31, border: 'none', background: F.red, color: '#fff', fontWeight: 800, fontSize: 12, cursor: 'pointer', overflow: 'hidden', touchAction: 'none' }}>
            <span style={{ position: 'absolute', left: 0, bottom: 0, right: 0, height: `${hold}%`, background: 'rgba(0,0,0,0.3)' }} /><span style={{ position: 'relative' }}>FIN<br /><span style={{ fontSize: 9, opacity: 0.8 }}>maintenir</span></span>
          </button>
        </div>
        {d < 30 && count <= 0 && <button onClick={() => { if (confirm('Annuler cette sortie ?')) { writeLive(null); onCancel(); } }} style={{ ...ghostBtn, width: '100%', marginTop: 10, background: 'transparent', color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.15)' }}>Annuler</button>}
      </div>
      <AnimatePresence>{count > 0 && <motion.div key={count} initial={{ scale: 1.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.6, opacity: 0 }} style={{ position: 'fixed', inset: 0, zIndex: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(13,12,18,0.82)', fontSize: 150, fontWeight: 900 }}>{count}</motion.div>}</AnimatePresence>
      {pocket && <div onDoubleClick={() => setPocket(false)} onClick={e => { if (e.detail >= 2) setPocket(false); }} style={{ position: 'fixed', inset: 0, zIndex: 950, background: '#000', color: '#555', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, userSelect: 'none' }}>
        <div style={{ fontSize: 64, fontWeight: 800, color: '#333', fontVariantNumeric: 'tabular-nums' }}>{km(d)} km</div>
        <div style={{ fontSize: 34, fontWeight: 700, color: '#2a2a2a', fontVariantNumeric: 'tabular-nums' }}>{fmtDur(mov)}</div>
        <div style={{ fontSize: 13, marginTop: 30, color: '#3a3a3a', textAlign: 'center', padding: '0 30px' }}>Mode poche : écran noir mais le GPS continue.<br />Ne verrouille pas le téléphone. Touche 2× pour revenir.</div>
      </div>}
    </div>
  );
}

// ───────────────────────────────── Fin de sortie : enregistrer ─────────────────────────────────
function FinishSheet({ live, onSaved, onDiscard, toast }: { live: Live | null; onSaved: (r: RunSummary) => void; onDiscard: () => void; toast: (t: string) => void }) {
  const [title, setTitle] = useState(''); const [note, setNote] = useState(''); const [feel, setFeel] = useState<number | null>(null); const [busy, setBusy] = useState(false);
  useEffect(() => { setTitle(''); setNote(''); setFeel(null); }, [live]);
  const save = async () => {
    if (!live) return;
    setBusy(true);
    try {
      const r = await forme.saveRun({ type: live.type, startedAt: live.startedAt, points: live.points, pauses: live.pauses, laps: live.laps, title: title.trim() || undefined, note: note.trim() || undefined, feel: feel ?? undefined, ghostOf: live.ghostOf });
      writeLive(null); onSaved(r.run);
    } catch (e) { toast(`${errText(e)} — la sortie reste gardée sur le téléphone, réessaie.`); } finally { setBusy(false); }
  };
  return (
    <Sheet open={!!live} onClose={() => {}} z={80} title="Bravo ! 🎉">
      {live && <>
        <div style={{ fontSize: 14, color: F.muted, marginBottom: 12 }}>{live.points.length} points GPS · tout est recalculé proprement à l'enregistrement.</div>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder={`Titre (sinon « ${TYPE_L[live.type]} du … »)`} style={{ ...input, marginBottom: 8 }} />
        <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Comment c'était ? (jambes, météo, chaussures…)" style={{ ...input, minHeight: 64, resize: 'vertical' }} />
        <div style={{ fontWeight: 700, margin: '12px 2px 8px' }}>Ressenti</div>
        <div style={{ display: 'flex', gap: 6 }}>{['😫', '😕', '🙂', '😀', '🔥'].map((e, i) => <button key={e} onClick={() => setFeel(i + 1)} style={{ flex: 1, fontSize: 26, padding: '8px 0', borderRadius: 14, border: `2px solid ${feel === i + 1 ? F.accent : 'transparent'}`, background: '#fff', cursor: 'pointer' }}>{e}</button>)}</div>
        <button disabled={busy} onClick={() => void save()} style={{ ...btn, width: '100%', marginTop: 16 }}>{busy ? 'Enregistrement…' : '💾 Enregistrer la sortie'}</button>
        <button onClick={() => { if (confirm('Supprimer cette sortie sans l\'enregistrer ?')) { writeLive(null); onDiscard(); } }} style={{ ...ghostBtn, width: '100%', marginTop: 8, color: F.red }}>Ne pas enregistrer</button>
      </>}
    </Sheet>
  );
}

// ───────────────────────────────── Réglages course ─────────────────────────────────
function RunSettings({ open, onClose, cfg, onCfg, toast }: { open: boolean; onClose: () => void; cfg: RunCfg; onCfg: (c: RunCfg) => void; toast: (t: string) => void }) {
  const set = async (p: Partial<RunCfg>) => { try { onCfg((await forme.runCfg(p)).cfg); } catch (e) { toast(errText(e)); } };
  const [paceTxt, setPaceTxt] = useState(fmtPace(cfg.targetPace));
  useEffect(() => { if (open) setPaceTxt(cfg.targetPace ? fmtPace(cfg.targetPace) : ''); }, [open, cfg.targetPace]);
  const row: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 0', borderBottom: `1px solid ${F.line}` };
  return (
    <Sheet open={open} onClose={onClose} title="Réglages course">
      <div style={{ ...card, padding: '4px 14px' }}>
        <div style={row}><span style={{ fontWeight: 600 }}>Objectif / semaine</span><div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>{[5, 10, 15, 20, 30, 50].map(v => <Chip key={v} on={cfg.weekGoalKm === v} onClick={() => void set({ weekGoalKm: v })}>{v} km</Chip>)}</div></div>
        <div style={row}><span style={{ fontWeight: 600 }}>Pause automatique</span><Chip on={cfg.autoPause} onClick={() => void set({ autoPause: !cfg.autoPause })}>{cfg.autoPause ? 'Oui' : 'Non'}</Chip></div>
        <div style={row}><span style={{ fontWeight: 600 }}>Voix tous les</span><div style={{ display: 'flex', gap: 4 }}>{[0, 0.5, 1, 2, 5].map(v => <Chip key={v} on={cfg.voiceEvery === v} onClick={() => void set({ voiceEvery: v })}>{v ? `${String(v).replace('.', ',')} km` : 'off'}</Chip>)}</div></div>
        <div style={{ ...row, borderBottom: 'none' }}><span style={{ fontWeight: 600 }}>Allure cible (min/km)</span>
          <input value={paceTxt} onChange={e => setPaceTxt(e.target.value)} placeholder="ex. 5:30" inputMode="numeric" onBlur={() => { const m = /^(\d{1,2})[:.,h](\d{1,2})$/.exec(paceTxt.trim()); void set({ targetPace: m ? Number(m[1]) * 60 + Number(m[2]) : null }); }} style={{ ...input, width: 100, textAlign: 'right', padding: '9px 12px' }} /></div>
      </div>
      <div style={{ fontSize: 13, color: F.muted, marginTop: 12, lineHeight: 1.5 }}>
        📱 <b>iPhone</b> : une appli web ne reçoit pas le GPS quand l'écran est verrouillé. Pendant la sortie, FORME garde l'écran allumé — utilise le <b>mode poche</b> (écran noir) et mets le téléphone dans un brassard ou ta poche sans le verrouiller.
        Si l'appli se ferme, ta sortie n'est pas perdue : elle est gardée sur le téléphone et FORME te propose de la reprendre.
      </div>
    </Sheet>
  );
}

// ───────────────────────────────── Écran principal ─────────────────────────────────
function Heatmap({ days }: { days: Record<string, number> }) {
  const today = new Date(); const cells: Array<{ d: string; v: number }> = [];
  const start = new Date(today); start.setDate(start.getDate() - 7 * 26 + 1 - ((today.getDay() + 6) % 7) + 6);
  for (let i = 0; i < 26 * 7; i++) { const x = new Date(start); x.setDate(start.getDate() + i - 6); const d = x.toLocaleDateString('sv-SE'); cells.push({ d, v: days[d] ?? 0 }); }
  const max = Math.max(1, ...Object.values(days));
  return (
    <div style={{ display: 'grid', gridTemplateRows: 'repeat(7, 1fr)', gridAutoFlow: 'column', gap: 3, overflowX: 'auto' }}>
      {cells.map(c => <div key={c.d} title={`${c.d} : ${c.v} km`} style={{ width: 11, height: 11, borderRadius: 3, background: c.v ? `rgba(31,99,240,${0.25 + 0.75 * Math.min(1, c.v / max)})` : F.bg2 }} />)}
    </div>
  );
}

function WeekBars({ weeks }: { weeks: RunStats['weeks'] }) {
  const max = Math.max(1, ...weeks.map(w => w.km));
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, height: 110 }}>
      {weeks.map((w, i) => (
        <div key={w.week} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, height: '100%', justifyContent: 'flex-end' }}>
          {w.km > 0 && <div style={{ fontSize: 9.5, fontWeight: 700, color: i === weeks.length - 1 ? F.accent : F.muted }}>{Math.round(w.km)}</div>}
          <motion.div initial={{ height: 0 }} animate={{ height: `${Math.max(w.km ? 6 : 2, w.km / max * 80)}%` }} transition={{ duration: 0.6, delay: i * 0.03 }} style={{ width: '100%', borderRadius: 5, background: i === weeks.length - 1 ? F.accent : w.km ? '#9db8f5' : F.bg2 }} />
          <div style={{ fontSize: 9, color: F.muted }}>{w.week.slice(8)}/{w.week.slice(5, 7)}</div>
        </div>
      ))}
    </div>
  );
}

export default function RunScreen({ toast, name = '' }: { toast: (t: string) => void; name?: string }) {
  const [s, setS] = useState<RunStats | null>(null);
  const [err, setErr] = useState('');
  const [type, setType] = useState<RunType>('run');
  const [filter, setFilter] = useState<RunType | 'all'>('all');
  const [recording, setRecording] = useState<{ ghost: Ghost | null; goal: Live['goal']; resume: Live | null; type: RunType } | null>(null);
  const [done, setDone] = useState<Live | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [settings, setSettings] = useState(false);
  const [goalSheet, setGoalSheet] = useState(false);
  const [goal, setGoal] = useState<Live['goal']>(null);
  const [pending, setPending] = useState<Live | null>(() => { const l = readLive(); return l && l.points.length > 1 && Date.now() - l.startedAt < 12 * 3600_000 ? l : null; });
  const [voice, setVoice] = useState(() => { try { return localStorage.getItem('forme:run:voice') !== '0'; } catch { return true; } });
  useEffect(() => { voiceOn = voice; try { localStorage.setItem('forme:run:voice', voice ? '1' : '0'); } catch { /* */ } }, [voice]);
  const load = useCallback(() => forme.runs(filter === 'all' ? undefined : filter).then(x => { setS(x); setErr(''); setType(t => x.recent.length || t !== 'run' ? t : x.cfg.type); }).catch(e => setErr(errText(e))), [filter]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (s) setType(s.cfg.type); }, [s?.cfg.type]); // eslint-disable-line react-hooks/exhaustive-deps

  const start = (ghost: Ghost | null = null, t: RunType = type) => {
    try { speechSynthesis.speak(new SpeechSynthesisUtterance('')); } catch { /* débloque la voix sur iPhone (geste utilisateur) */ }
    if (s && t !== s.cfg.type) void forme.runCfg({ type: t }).catch(() => {});
    setRecording({ ghost, goal, resume: null, type: t });
  };
  const startGhost = (d: RunDetail) => { setOpenId(null); setType(d.run.type); start({ title: d.run.title, cum: d.ghost.cum, t: d.ghost.t, track: d.track }, d.run.type); };

  if (recording && s) return <Recorder type={recording.type} cfg={s.cfg} ghost={recording.ghost} goal={recording.goal} resume={recording.resume}
    onCancel={() => setRecording(null)} onDone={l => { setRecording(null); setDone(l); }} />;

  const wk = s?.week; const trend = s?.paceTrend;
  const trendTxt = trend?.last4 && trend.prev4 ? (trend.prev4 - trend.last4 >= 3 ? `🚀 Tu as gagné ${fmtPace(trend.prev4 - trend.last4).replace(/^0:/, '')} s/km en 4 semaines` : trend.last4 - trend.prev4 >= 3 ? `Allure un peu plus lente que le mois d'avant (${fmtPace(trend.last4)} vs ${fmtPace(trend.prev4)})` : `Allure stable : ${fmtPace(trend.last4)}/km`) : null;

  return (
    <div style={{ padding: '6px 14px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 2px 12px' }}>
        <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.025em', flex: 1 }}>Course</div>
        <button onClick={() => setVoice(v => !v)} aria-label="Voix" style={{ ...ghostBtn, width: 40, height: 40, padding: 0 }}>{voice ? '🔊' : '🔇'}</button>
        <button onClick={() => setSettings(true)} aria-label="Réglages" style={{ ...ghostBtn, width: 40, height: 40, padding: 0 }}>⚙️</button>
      </div>

      {pending && <div style={{ ...card, background: '#fff6e0', border: `1px solid ${F.gold}66`, marginBottom: 12 }}>
        <div style={{ fontWeight: 800 }}>⚠️ Sortie non terminée</div>
        <div style={{ fontSize: 13.5, color: F.muted, margin: '4px 0 10px' }}>{TYPE_L[pending.type]} commencée à {new Date(pending.startedAt).toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' })} · {pending.points.length} points GPS gardés sur le téléphone.</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => { const l = pending; setPending(null); setRecording({ ghost: null, goal: l.goal ?? null, resume: l, type: l.type }); }} style={{ ...btn, flex: 1, padding: '11px 12px' }}>▶ Reprendre</button>
          <button onClick={() => { setDone(pending); setPending(null); }} style={{ ...ghostBtn, flex: 1 }}>💾 Terminer</button>
        </div>
      </div>}

      {/* Démarrer */}
      <div style={{ background: `linear-gradient(160deg, ${F.dark2}, ${F.dark})`, color: '#fff', borderRadius: 26, padding: 18, boxShadow: '0 14px 30px rgba(30,25,60,0.25)' }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>{TYPES.map(t => <button key={t.id} onClick={() => { setType(t.id); vibrate(8); }} style={{ flex: 1, padding: '10px 0', borderRadius: 14, border: 'none', background: type === t.id ? '#fff' : 'rgba(255,255,255,0.08)', color: type === t.id ? F.ink : '#fff', fontWeight: 700, fontSize: 12.5, cursor: 'pointer', fontFamily: F.sans }}><div style={{ fontSize: 20 }}>{t.e}</div>{t.l}</button>)}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {wk && <Ring value={wk.km} max={wk.goalKm || 1} size={104} stroke={10} color="#5b8cff"><div style={{ fontSize: 22, fontWeight: 800 }}>{String(wk.km).replace('.', ',')}</div><div style={{ fontSize: 10.5, opacity: 0.6, fontWeight: 600 }}>/ {wk.goalKm} km</div></Ring>}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, opacity: 0.6, fontWeight: 600 }}>Cette semaine</div>
            <div style={{ fontSize: 15, fontWeight: 700, marginTop: 2 }}>{wk ? `${wk.n} sortie${wk.n > 1 ? 's' : ''} · ${fmtDurLong(wk.sec)} · ${wk.elev} m D+` : '…'}</div>
            {s && s.streakWeeks > 1 && <div style={{ fontSize: 13, marginTop: 4, color: '#f1c232', fontWeight: 700 }}>🔥 {s.streakWeeks} semaines d'affilée</div>}
            <button onClick={() => setGoalSheet(true)} style={{ marginTop: 8, background: 'rgba(255,255,255,0.1)', color: '#fff', border: 'none', borderRadius: 999, padding: '7px 12px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: F.sans }}>🎯 {goal ? `Objectif ${goal.v} ${goal.kind === 'km' ? 'km' : 'min'}` : 'Objectif de la sortie'}</button>
          </div>
        </div>
        <motion.button whileTap={{ scale: 0.96 }} onClick={() => start()} disabled={!s} style={{ ...btn, width: '100%', marginTop: 16, padding: '18px 20px', fontSize: 18, background: '#ff5a1f', boxShadow: '0 10px 24px rgba(255,90,31,0.4)' }}>▶ Démarrer {TYPE_L[type].toLowerCase()}</motion.button>
      </div>

      {err && <div style={{ color: F.red, fontWeight: 700, marginTop: 12 }}>{err} <button onClick={() => void load()} style={{ ...ghostBtn, padding: '6px 10px' }}>Réessayer</button></div>}
      {!s && !err && <div style={{ display: 'flex', justifyContent: 'center', padding: 30 }}><Spinner /></div>}

      {s && <>
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', margin: '18px 0 10px' }}>
          <Chip on={filter === 'all'} onClick={() => setFilter('all')}>Tout</Chip>
          {TYPES.map(t => <Chip key={t.id} on={filter === t.id} onClick={() => setFilter(t.id)}>{t.e} {t.l}</Chip>)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {([['Mois', s.month], ['Année', s.year], ['Total', s.total]] as const).map(([l, t]) => (
            <div key={l} style={{ ...card, padding: 12 }}>
              <div style={{ fontSize: 11.5, color: F.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{l}</div>
              <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', marginTop: 2 }}>{String(t.km).replace('.', ',')}<span style={{ fontSize: 12, color: F.muted }}> km</span></div>
              <div style={{ fontSize: 11.5, color: F.muted, marginTop: 2 }}>{t.n} sorties · {fmtDurLong(t.sec)}</div>
              <div style={{ fontSize: 11.5, color: F.muted }}>{t.elev} m D+ · {t.kcal} kcal</div>
            </div>
          ))}
        </div>
        {trendTxt && <div style={{ ...card, marginTop: 10, padding: 12, fontSize: 14, fontWeight: 600 }}>{trendTxt}</div>}

        <div style={{ ...card, marginTop: 10 }}>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>12 dernières semaines <span style={{ color: '#9a95a8', fontWeight: 600 }}>(km)</span></div>
          <WeekBars weeks={s.weeks} />
        </div>
        <div style={{ ...card, marginTop: 10 }}>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>6 mois d'activité</div>
          <Heatmap days={s.days} />
        </div>

        {(s.records.length > 0 || s.longest.length > 0) && <div style={{ ...card, marginTop: 10 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>🏆 Mes records</div>
          {TYPES.filter(t => s.records.some(r => r.type === t.id) || s.longest.some(r => r.type === t.id)).map(t => (
            <div key={t.id} style={{ marginTop: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: F.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{t.e} {t.l}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 6 }}>
                {s.records.filter(r => r.type === t.id).map(r => <button key={r.label} onClick={() => setOpenId(r.runId)} style={{ background: F.bg, border: 'none', borderRadius: 12, padding: '8px 10px', textAlign: 'start', cursor: 'pointer', fontFamily: F.sans, color: F.ink }}><div style={{ fontSize: 11.5, color: F.muted, fontWeight: 700 }}>{r.label}</div><div style={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{fmtDur(r.sec)}</div><div style={{ fontSize: 10.5, color: F.muted }}>{fmtPace(r.sec / (r.m / 1000))}/km</div></button>)}
                {s.longest.filter(r => r.type === t.id).map(r => <button key="long" onClick={() => setOpenId(r.runId)} style={{ background: F.bg, border: 'none', borderRadius: 12, padding: '8px 10px', textAlign: 'start', cursor: 'pointer', fontFamily: F.sans, color: F.ink }}><div style={{ fontSize: 11.5, color: F.muted, fontWeight: 700 }}>Plus longue</div><div style={{ fontWeight: 800 }}>{String(r.km).replace('.', ',')} km</div><div style={{ fontSize: 10.5, color: F.muted }}>{fmtDate(r.date)}</div></button>)}
              </div>
            </div>
          ))}
        </div>}

        <div style={{ fontSize: 19, fontWeight: 700, margin: '22px 2px 10px' }}>Mes sorties</div>
        {!s.recent.length && <div style={{ ...card, textAlign: 'center', color: F.muted, padding: 26 }}>
          <div style={{ fontSize: 40 }}>🗺️</div><div style={{ fontWeight: 700, color: F.ink, marginTop: 6 }}>Pas encore de sortie</div>
          <div style={{ fontSize: 13.5, marginTop: 4, lineHeight: 1.45 }}>Appuie sur « Démarrer » : parcours sur la carte, allure, splits, dénivelé, records… tout est enregistré.</div></div>}
        <div style={{ display: 'grid', gap: 8 }}>
          {s.recent.map(r => (
            <motion.button key={r.id} whileTap={{ scale: 0.98 }} onClick={() => setOpenId(r.id)} style={{ ...card, display: 'flex', gap: 12, alignItems: 'center', border: 'none', cursor: 'pointer', textAlign: 'start', fontFamily: F.sans, color: F.ink, padding: 12 }}>
              <MiniRoute poly={r.poly} color={r.prs.length ? F.gold : F.accent} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, color: F.muted, fontWeight: 600 }}>{TYPE_E[r.type]} {fmtDate(r.date)}{r.feel ? ` · ${['😫', '😕', '🙂', '😀', '🔥'][r.feel - 1]}` : ''}</div>
                <div style={{ fontWeight: 700, fontSize: 15.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.title}{r.ghostOf ? ' 👻' : ''}</div>
                <div style={{ display: 'flex', gap: 12, fontSize: 13, marginTop: 3, fontVariantNumeric: 'tabular-nums' }}>
                  <span><b>{km(r.dist)}</b> km</span><span><b>{fmtDur(r.moving)}</b></span><span><b>{paceOrSpeed(r.type, r.pace, r.speed)}</b> {unitPS(r.type)}</span>{r.elevGain > 5 && <span>⛰ {r.elevGain} m</span>}
                </div>
                {r.prs.length > 0 && <div style={{ fontSize: 12, color: '#a86b00', fontWeight: 700, marginTop: 3 }}>🏆 {r.prs[0]}{r.prs.length > 1 ? ` +${r.prs.length - 1}` : ''}</div>}
              </div>
            </motion.button>
          ))}
        </div>
        <RunSettings open={settings} onClose={() => setSettings(false)} cfg={s.cfg} onCfg={c => setS(x => x ? { ...x, cfg: c, week: { ...x.week, goalKm: c.weekGoalKm, pct: c.weekGoalKm ? Math.min(100, Math.round(x.week.km / c.weekGoalKm * 100)) : 0 } } : x)} toast={toast} />
      </>}

      <Sheet open={goalSheet} onClose={() => setGoalSheet(false)} title="Objectif de la sortie">
        <div style={{ fontSize: 13.5, color: F.muted, marginBottom: 10 }}>La voix te dit ce qu'il reste et la barre se remplit.</div>
        <div style={{ fontWeight: 700, margin: '4px 2px 8px' }}>Distance</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{[3, 5, 8, 10, 15, 21.1, 42.2].map(v => <Chip key={v} on={goal?.kind === 'km' && goal.v === v} onClick={() => { setGoal({ kind: 'km', v }); setGoalSheet(false); }}>{String(v).replace('.', ',')} km</Chip>)}</div>
        <div style={{ fontWeight: 700, margin: '14px 2px 8px' }}>Durée</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{[15, 20, 30, 45, 60, 90].map(v => <Chip key={v} on={goal?.kind === 'min' && goal.v === v} onClick={() => { setGoal({ kind: 'min', v }); setGoalSheet(false); }}>{v} min</Chip>)}</div>
        <button onClick={() => { setGoal(null); setGoalSheet(false); }} style={{ ...ghostBtn, width: '100%', marginTop: 16 }}>Sans objectif</button>
      </Sheet>
      <RunDetailSheet id={openId} onClose={() => setOpenId(null)} onChanged={() => void load()} onGhost={startGhost} toast={toast} name={name} />
      <FinishSheet live={done} toast={toast} onDiscard={() => setDone(null)} onSaved={r => { setDone(null); void load(); setOpenId(r.id); if (r.prs.length) { toast(`🏆 ${r.prs[0]}`); say(`Nouveau record : ${r.prs[0]}`); } }} />
    </div>
  );
}
