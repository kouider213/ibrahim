// Carte live — le parc AutoLux vu comme un jeu : agence, parking, ville, atelier.
// Chaque voiture est posée là où elle est « logiquement » (dispo → parking, louée → en ville,
// sans résa et indispo → atelier). Pas de GPS : la position est symbolique, le statut est réel.
import { useState, useEffect, useCallback, useMemo, useRef, type ReactNode } from 'react';
import { business, type Car, type Booking, type SmartReminder, type TodayItem } from '../../services/api.ts';

const C = {
  bg: '#0a0a0c', surface: '#16161c', border: 'rgba(255,255,255,0.08)',
  accent: '#10b981', gold: '#fbbf24', red: '#ef4444', blue: '#60a5fa', orange: '#fb923c', text: '#f5f5f7', muted: '#9b9ba6',
  font: '-apple-system, "Segoe UI", Roboto, sans-serif',
};

const ACTIVE = ['ACCEPTED', 'CONFIRMED', 'ACTIVE', 'COMPLETED'];

type Status = 'dispo' | 'depart' | 'loue' | 'retour' | 'atelier';
const STATUS: Record<Status, { label: string; body: string; dark: string; badge: string }> = {
  dispo:   { label: 'Disponible',       body: '#34d399', dark: '#059669', badge: '#10b981' },
  depart:  { label: 'Départ aujourd\'hui', body: '#fcd34d', dark: '#d97706', badge: '#f59e0b' },
  loue:    { label: 'En location',      body: '#60a5fa', dark: '#2563eb', badge: '#3b82f6' },
  retour:  { label: 'Retour aujourd\'hui', body: '#fdba74', dark: '#ea580c', badge: '#f97316' },
  atelier: { label: 'Indisponible',     body: '#a1a1aa', dark: '#52525b', badge: '#71717a' },
};

interface MapCar {
  car: Car; status: Status; booking: Booking | null;
  due: number; alerts: SmartReminder[];
  x: number; y: number;
}

// ── Projection isométrique ───────────────────────────────────────────────────
const TW = 56, TH = 28, OX = 400, OY = 40;
const VW = { cx: 403, cy: 222, w: 690, h: 420 };
const P = (x: number, y: number, z = 0) => `${(x - y) * TW / 2 + OX},${(x + y) * TH / 2 - z + OY}`;
const SX = (x: number, y: number) => (x - y) * TW / 2 + OX;
const SY = (x: number, y: number, z = 0) => (x + y) * TH / 2 - z + OY;

function Box({ x, y, w, d, h, top, left, right, z = 0 }: { x: number; y: number; w: number; d: number; h: number; top: string; left: string; right: string; z?: number }) {
  return (
    <g>
      <polygon points={`${P(x, y + d, z)} ${P(x + w, y + d, z)} ${P(x + w, y + d, z + h)} ${P(x, y + d, z + h)}`} fill={left} />
      <polygon points={`${P(x + w, y, z)} ${P(x + w, y + d, z)} ${P(x + w, y + d, z + h)} ${P(x + w, y, z + h)}`} fill={right} />
      <polygon points={`${P(x, y, z + h)} ${P(x + w, y, z + h)} ${P(x + w, y + d, z + h)} ${P(x, y + d, z + h)}`} fill={top} />
    </g>
  );
}

const Tile = ({ x, y, w, d, fill, stroke }: { x: number; y: number; w: number; d: number; fill: string; stroke?: string }) => (
  <polygon points={`${P(x, y)} ${P(x + w, y)} ${P(x + w, y + d)} ${P(x, y + d)}`} fill={fill} stroke={stroke} strokeWidth={stroke ? 1 : 0} />
);

function Tree({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  const cx = SX(x, y), cy = SY(x, y);
  return (
    <g>
      <ellipse cx={cx} cy={cy + 2} rx={9 * s} ry={4 * s} fill="rgba(0,0,0,0.12)" />
      <rect x={cx - 1.5 * s} y={cy - 10 * s} width={3 * s} height={10 * s} fill="#92400e" />
      <circle cx={cx} cy={cy - 16 * s} r={9 * s} fill="#4ade80" />
      <circle cx={cx - 3 * s} cy={cy - 19 * s} r={5 * s} fill="#86efac" />
    </g>
  );
}

function Palm({ x, y }: { x: number; y: number }) {
  const cx = SX(x, y), cy = SY(x, y);
  return (
    <g>
      <ellipse cx={cx} cy={cy + 2} rx={8} ry={3} fill="rgba(0,0,0,0.12)" />
      <path d={`M${cx},${cy} q3,-14 1,-28`} stroke="#a16207" strokeWidth={3} fill="none" />
      {[-60, -20, 20, 60, 160].map(a => (
        <ellipse key={a} cx={cx + 1 + Math.cos(a * Math.PI / 180) * 9} cy={cy - 28 + Math.sin(a * Math.PI / 180) * 4} rx={10} ry={3}
          transform={`rotate(${a / 2} ${cx + 1} ${cy - 28})`} fill="#22c55e" />
      ))}
    </g>
  );
}

function CarSprite({ m, selected, onClick }: { m: MapCar; selected: boolean; onClick: () => void }) {
  const s = STATUS[m.status];
  const { x, y } = m;
  const badge = m.alerts.some(a => a.priority === 'HIGH') ? { t: '!', c: C.red }
    : m.due > 0 ? { t: '€', c: C.gold }
    : m.status === 'retour' ? { t: '↩', c: s.badge }
    : m.status === 'depart' ? { t: '🔑', c: s.badge }
    : m.alerts.length ? { t: '•', c: C.orange } : null;
  const bx = SX(x + 0.35, y + 0.2), by = SY(x + 0.35, y + 0.2, 34);
  return (
    <g onClick={onClick} style={{ cursor: 'pointer' }} className={m.status === 'loue' ? 'dz-bob' : undefined}>
      {selected && <ellipse cx={SX(x + 0.35, y + 0.2)} cy={SY(x + 0.35, y + 0.2)} rx={26} ry={13} fill="none" stroke="#fff" strokeWidth={2.5} className="dz-pulse" />}
      <ellipse cx={SX(x + 0.35, y + 0.2)} cy={SY(x + 0.35, y + 0.2) + 2} rx={20} ry={8} fill="rgba(0,0,0,0.18)" />
      <Box x={x} y={y} w={0.7} d={0.4} h={6} z={2} top={s.body} left={s.dark} right={s.body} />
      <Box x={x + 0.15} y={y + 0.05} w={0.38} d={0.3} h={6} z={8} top="#e0f2fe" left="#334155" right="#475569" />
      {[[x + 0.12, y + 0.4], [x + 0.55, y + 0.4]].map(([wx, wy], i) => (
        <ellipse key={i} cx={SX(wx, wy)} cy={SY(wx, wy) + 1} rx={3} ry={2.5} fill="#18181b" />
      ))}
      {badge && (
        <g>
          <line x1={bx} y1={by + 9} x2={bx} y2={SY(x + 0.35, y + 0.2, 16)} stroke={badge.c} strokeWidth={1.5} />
          <circle cx={bx} cy={by} r={9} fill={badge.c} stroke="#fff" strokeWidth={2} className={badge.c === C.red ? 'dz-pulse' : undefined} />
          <text x={bx} y={by + 3.5} textAnchor="middle" fontSize={badge.t === '🔑' ? 8 : 11} fontWeight={800} fill="#fff">{badge.t}</text>
        </g>
      )}
    </g>
  );
}

// ── Emplacements : parking (devant l'agence), ville (rues), atelier ─────────
const PARKING = Array.from({ length: 24 }, (_, i) => ({ x: 6.15 + (i % 6) * 0.95, y: 1.25 + Math.floor(i / 6) * 0.75 }));
const CITY = [
  [1.2, 7.3], [3.0, 7.0], [5.6, 7.4], [7.6, 6.9], [9.6, 7.3], [11.0, 8.6], [8.3, 9.0], [6.2, 9.4], [3.9, 9.2],
  [1.5, 9.6], [2.6, 11.2], [5.0, 11.3], [7.4, 11.1], [9.8, 10.7], [11.2, 11.4], [4.3, 8.2], [10.4, 9.6], [0.8, 11.0],
].map(([x, y]) => ({ x, y }));
const GARAGE = [{ x: 0.6, y: 1.3 }, { x: 0.6, y: 2.1 }, { x: 0.6, y: 2.9 }, { x: 1.5, y: 3.6 }, { x: 0.6, y: 3.7 }, { x: 1.5, y: 4.2 }];

function place(list: MapCar[]) {
  const take = (pool: Array<{ x: number; y: number }>, i: number) => pool[i % pool.length]!;
  let p = 0, c = 0, g = 0;
  for (const m of list) {
    const spot = m.status === 'loue' || m.status === 'retour' ? take(CITY, c++)
      : m.status === 'atelier' ? take(GARAGE, g++) : take(PARKING, p++);
    m.x = spot.x; m.y = spot.y;
  }
  return list;
}

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fmtD = (s: string) => new Date(s + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();

type Today = { departures: TodayItem[]; returns: TodayItem[]; toCollect: Array<TodayItem & { due: number }> };

export default function CarteScreen({ onAsk, onOpen }: { onAsk: (prompt: string) => void; onOpen: (page: string) => void }) {
  const [cars, setCars] = useState<Car[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [reminders, setReminders] = useState<SmartReminder[]>([]);
  const [today, setToday] = useState<Today | null>(null);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState<string | null>(null);
  const [filter, setFilter] = useState<Status | null>(null);
  // Caméra : centre + zoom, animée vers la voiture touchée (façon jeu)
  const [view, setView] = useState({ cx: VW.cx, cy: VW.cy, z: 1 });
  const viewRef = useRef(view); viewRef.current = view;
  const anim = useRef(0);
  const flyTo = useCallback((cx: number, cy: number, z: number) => {
    cancelAnimationFrame(anim.current);
    const from = viewRef.current, t0 = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / 450), e = 1 - Math.pow(1 - k, 3);
      setView({ cx: from.cx + (cx - from.cx) * e, cy: from.cy + (cy - from.cy) * e, z: from.z + (z - from.z) * e });
      if (k < 1) anim.current = requestAnimationFrame(step);
    };
    anim.current = requestAnimationFrame(step);
  }, []);
  useEffect(() => () => cancelAnimationFrame(anim.current), []);
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, b, r, t] = await Promise.all([
        business.fetchCars().catch(() => ({ cars: [] as Car[] })),
        business.fetchBookingsWindow().catch(() => ({ bookings: [] as Booking[] })),
        business.fetchReminders().catch(() => ({ reminders: [] as SmartReminder[] })),
        business.insightsToday().catch(() => null),
      ]);
      setCars(c.cars ?? []); setBookings(b.bookings ?? []); setReminders(r.reminders ?? []); setToday(t);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const map = useMemo<MapCar[]>(() => {
    const t = ymd(new Date());
    const live = bookings.filter(b => ACTIVE.includes((b.status ?? '').toUpperCase()) && b.start_date <= t && b.end_date >= t);
    const dueById = new Map((today?.toCollect ?? []).map(x => [x.id, x.due]));
    const list = cars.map<MapCar>(car => {
      const mine = live.filter(b => (b.car_id ? b.car_id === car.id : norm(b.cars?.name) === norm(car.name)));
      const running = mine.find(b => b.start_date < t || (b.start_date === t && b.end_date === t)) ?? mine.find(b => b.end_date === t);
      const leaving = mine.find(b => b.start_date === t && b !== running);
      const booking = running ?? leaving ?? null;
      const status: Status = running ? (running.end_date === t ? 'retour' : 'loue') : leaving ? 'depart' : car.available ? 'dispo' : 'atelier';
      return {
        car, status, booking,
        due: booking ? (dueById.get(booking.id) ?? 0) : 0,
        alerts: reminders.filter(r => norm(r.car_name) === norm(car.name)),
        x: 0, y: 0,
      };
    });
    return place(list);
  }, [cars, bookings, reminders, today]);

  const counts = useMemo(() => {
    const o: Record<Status, number> = { dispo: 0, depart: 0, loue: 0, retour: 0, atelier: 0 };
    map.forEach(m => { o[m.status]++; });
    return o;
  }, [map]);
  const total = map.length || 1;
  const out = counts.loue + counts.retour;
  const selected = map.find(m => m.car.id === sel) ?? null;
  const shown = (filter ? map.filter(m => m.status === filter) : map).slice().sort((a, b) => (a.x + a.y) - (b.x + b.y));
  const urgent = reminders.filter(r => r.priority === 'HIGH').length;

  const pick = (id: string | null) => {
    if (drag.current?.moved) return;
    setSel(id);
    const m = id ? map.find(x => x.car.id === id) : null;
    if (m) { const z = 2.4; flyTo(SX(m.x + 0.35, m.y + 0.2), SY(m.x + 0.35, m.y + 0.2) + 6, z); }
    else flyTo(VW.cx, VW.cy, 1);
  };
  const vb = `${view.cx - VW.w / (2 * view.z)} ${view.cy - VW.h / (2 * view.z)} ${VW.w / view.z} ${VW.h / view.z}`;
  const onDown = (e: React.PointerEvent) => { drag.current = { x: e.clientX, y: e.clientY, moved: false }; };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current; if (!d || view.z <= 1.01) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 6) return;
    d.moved = true; d.x = e.clientX; d.y = e.clientY;
    const k = (VW.w / view.z) / (svgRef.current?.clientWidth || 360);
    cancelAnimationFrame(anim.current);
    setView(v => ({ ...v, cx: v.cx - dx * k, cy: v.cy - dy * k }));
  };
  const onUp = () => { setTimeout(() => { drag.current = null; }, 0); };

  const wa = (phone: string | null) => { const p = (phone || '').replace(/\D/g, ''); if (p) window.open(`https://wa.me/${p}`, '_blank'); };

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: C.bg, color: C.text, fontFamily: C.font, padding: '18px 14px 30px' }}>
      <style>{`
        @keyframes dzBob { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-2px) } }
        .dz-bob { animation: dzBob 2.4s ease-in-out infinite }
        @keyframes dzPulse { 0%,100% { opacity: 1 } 50% { opacity: .45 } }
        .dz-pulse { animation: dzPulse 1.3s ease-in-out infinite }
                @keyframes dzWave { 0%,100% { opacity: .35 } 50% { opacity: .7 } }
        .dz-wave { animation: dzWave 3s ease-in-out infinite }
      `}</style>

      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: '0.18em', color: C.accent, fontWeight: 600, textTransform: 'uppercase' }}>Dzaryx · Carte live</div>
          <div style={{ fontSize: 26, fontWeight: 800 }}>Mon parc</div>
        </div>
        <button onClick={() => void load()} style={{ background: `${C.accent}12`, border: `1px solid ${C.accent}33`, borderRadius: 10, padding: '7px 12px', cursor: 'pointer', color: C.accent, fontWeight: 700 }}>↻</button>
      </div>

      {/* Jauge de la journée */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: '11px 13px', marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: C.muted, fontWeight: 700, letterSpacing: '0.08em', marginBottom: 7 }}>
          <span>JAUGE DE LA JOURNÉE</span><span style={{ color: C.text }}>{out}/{map.length} dehors · {Math.round(out / total * 100)}%</span>
        </div>
        <div style={{ display: 'flex', height: 9, borderRadius: 6, overflow: 'hidden', background: '#27272a' }}>
          {(['loue', 'retour', 'depart', 'dispo', 'atelier'] as Status[]).map(k => counts[k] > 0 && (
            <div key={k} style={{ width: `${counts[k] / total * 100}%`, background: STATUS[k].badge }} />
          ))}
        </div>
        <div style={{ display: 'flex', gap: 14, marginTop: 9, fontSize: 12 }}>
          <span>🔑 <b>{today?.departures.length ?? counts.depart}</b> départs</span>
          <span>↩️ <b>{today?.returns.length ?? counts.retour}</b> retours</span>
          <span>💰 <b>{(today?.toCollect ?? []).reduce((s, x) => s + x.due, 0).toLocaleString('fr-FR')}</b></span>
        </div>
      </div>

      {/* La carte */}
      <div style={{ position: 'relative', borderRadius: 18, overflow: 'hidden', background: 'linear-gradient(180deg,#bae6fd 0%,#e0f2fe 100%)', border: `1px solid ${C.border}` }}>
        {loading && <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: '#0f172a', fontSize: 13, fontWeight: 600, background: 'rgba(255,255,255,0.4)', zIndex: 2 }}>Chargement du parc…</div>}
        <svg ref={svgRef} viewBox={vb} preserveAspectRatio="xMidYMid slice" style={{ width: '100%', aspectRatio: '690 / 420', display: 'block', touchAction: view.z > 1.01 ? 'none' : 'pan-y' }}
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp}>
          {/* mer + plage (côté Oran) */}
          <polygon points={`${P(-3, -3)} ${P(16, -3)} ${P(16, 16)} ${P(-3, 16)}`} fill="#7dd3fc" />
          {[0, 1, 2].map(i => <path key={i} className="dz-wave" style={{ animationDelay: `${i}s` }} d={`M${SX(13.6 + i * 0.6, -1)},${SY(13.6 + i * 0.6, -1)} l60,30`} stroke="#fff" strokeWidth={2} strokeLinecap="round" />)}
          <Tile x={-0.6} y={-0.6} w={13.4} d={13.4} fill="#fde68a" />
          <Tile x={0} y={0} w={12.2} d={12.2} fill="#86efac" />
          {/* routes */}
          <Tile x={0} y={5.1} w={12.2} d={1.1} fill="#64748b" />
          <Tile x={5.1} y={0} w={0.8} d={12.2} fill="#64748b" />
          {Array.from({ length: 12 }, (_, i) => <Tile key={i} x={i + 0.3} y={5.6} w={0.45} d={0.08} fill="#f8fafc" />)}
          <Tile x={0} y={8.4} w={12.2} d={0.6} fill="#94a3b8" />
          {/* parking */}
          <Tile x={5.95} y={0.95} w={5.9} d={3.2} fill="#cbd5e1" />
          {PARKING.map((s, i) => <Tile key={i} x={s.x - 0.08} y={s.y - 0.1} w={0.86} d={0.6} fill="none" stroke="#f8fafc" />)}
          {/* atelier */}
          <Tile x={0.3} y={0.9} w={2} d={3.9} fill="#d4d4d8" />
          <Box x={1.5} y={1.0} w={0.8} d={2.3} h={26} top="#a1a1aa" left="#71717a" right="#d4d4d8" />
          {/* agence AutoLux */}
          <Tile x={2.6} y={0.6} w={3.1} d={3.6} fill="#e5e7eb" />
          <Box x={2.9} y={0.9} w={2.5} d={2.6} h={46} top="#f1f5f9" left="#0f766e" right="#14b8a6" />
          <Box x={2.9} y={0.9} w={2.5} d={2.6} h={6} z={46} top="#fbbf24" left="#d97706" right="#f59e0b" />
          <g>
            <rect x={SX(4.15, 2.2) - 30} y={SY(4.15, 2.2, 78)} width={60} height={15} rx={4} fill="#0f766e" />
            <text x={SX(4.15, 2.2)} y={SY(4.15, 2.2, 78) + 11} textAnchor="middle" fontSize={10} fontWeight={900} fill="#fff" letterSpacing="0.08em">AUTOLUX</text>
          </g>
          {/* petite voiture d'ambiance qui roule sur l'avenue */}
          <g>
            <animateTransform attributeName="transform" type="translate" from="0 0" to={`${13 * TW / 2} ${13 * TH / 2}`} dur="16s" repeatCount="indefinite" />
            <Box x={-0.8} y={5.25} w={0.7} d={0.4} h={6} z={2} top="#fb7185" left="#be123c" right="#f43f5e" />
            <Box x={-0.65} y={5.3} w={0.38} d={0.3} h={6} z={8} top="#e0f2fe" left="#334155" right="#475569" />
          </g>
          {/* ville */}
          {[
            [0.4, 6.6, 1.3, 1.3, 38, '#fca5a5', '#ef4444'], [2.4, 6.5, 1.2, 1.4, 54, '#c4b5fd', '#8b5cf6'],
            [6.6, 6.5, 1.6, 1.2, 30, '#fdba74', '#f97316'], [8.8, 6.4, 1.2, 1.5, 62, '#93c5fd', '#3b82f6'],
            [0.5, 9.5, 1.1, 1.1, 34, '#f9a8d4', '#ec4899'], [3.0, 9.9, 1.4, 1.0, 44, '#fde68a', '#eab308'],
            [6.6, 9.6, 1.0, 1.3, 70, '#a5b4fc', '#6366f1'], [8.6, 9.9, 1.5, 1.2, 28, '#fecaca', '#f87171'],
            [10.6, 6.8, 1.2, 1.2, 40, '#bbf7d0', '#16a34a'],
          ].map(([x, y, w, d, h, a, b], i) => (
            <Box key={i} x={x as number} y={y as number} w={w as number} d={d as number} h={h as number} top="#f8fafc" left={b as string} right={a as string} />
          ))}
          {[[11.5, 0.6], [11.6, 2.2], [11.4, 4.3], [0.2, 5.0], [4.9, 8.0], [10.4, 12.0], [1.8, 12.0], [5.6, 12.0], [8.0, 8.0]].map(([x, y], i) => <Tree key={i} x={x!} y={y!} s={0.9} />)}
          {[[12.6, 1.2], [12.6, 4.0], [12.6, 7.5], [12.6, 10.4]].map(([x, y], i) => <Palm key={i} x={x!} y={y!} />)}
          {/* étiquettes de zones */}
          {([['PARKING', 9, 0.4], ['ATELIER', 0.2, 4.7], ['EN VILLE', 6, 12.4]] as const).map(([t, x, y]) => (
            <text key={t} x={SX(x, y)} y={SY(x, y)} textAnchor="middle" fontSize={10} fontWeight={800} fill="#0f172a" opacity={0.55} letterSpacing="0.1em">{t}</text>
          ))}
          {shown.map(m => <CarSprite key={m.car.id} m={m} selected={m.car.id === sel} onClick={() => pick(m.car.id === sel ? null : m.car.id)} />)}
        </svg>

        <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', flexDirection: 'column', gap: 5 }}>
          {[['+', () => flyTo(view.cx, view.cy, Math.min(4, view.z * 1.6))], ['−', () => flyTo(view.cx, view.cy, Math.max(1, view.z / 1.6))], ['⤢', () => pick(null)]].map(([t, fn]) => (
            <button key={t as string} onClick={fn as () => void} style={{ width: 30, height: 30, borderRadius: 9, border: 'none', background: 'rgba(255,255,255,0.92)', color: '#0f172a', fontSize: 16, fontWeight: 800, cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>{t as string}</button>
          ))}
        </div>

      </div>

        {/* Fiche voiture */}
      {selected && (
        <div style={{ marginTop: 8, background: '#fff', color: '#0f172a', borderRadius: 14, padding: '11px 12px', boxShadow: '0 8px 30px rgba(0,0,0,0.25)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 10, fontWeight: 800, color: '#fff', background: STATUS[selected.status].badge, borderRadius: 6, padding: '2px 7px' }}>{STATUS[selected.status].label.toUpperCase()}</span>
            <span style={{ fontSize: 14.5, fontWeight: 800, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selected.car.name}</span>
            <button onClick={() => pick(null)} style={{ background: 'none', border: 'none', fontSize: 16, cursor: 'pointer', color: '#64748b' }}>✕</button>
          </div>
          {selected.booking ? (
            <div style={{ fontSize: 12.5, marginTop: 6, color: '#334155' }}>
              👤 <b>{selected.booking.client_name}</b> · {fmtD(selected.booking.start_date)} → {fmtD(selected.booking.end_date)}
              {selected.due > 0 && <span style={{ color: '#b45309', fontWeight: 700 }}> · {selected.due.toLocaleString('fr-FR')} à encaisser</span>}
            </div>
          ) : (
            <div style={{ fontSize: 12.5, marginTop: 6, color: '#334155' }}>{selected.status === 'atelier' ? 'Marquée indisponible, aucune location en cours.' : 'Libre — prête à partir.'}</div>
          )}
          {selected.alerts.slice(0, 2).map(a => (
            <div key={a.id} style={{ fontSize: 11.5, marginTop: 5, color: a.priority === 'HIGH' ? '#b91c1c' : '#9a3412' }}>⚠️ {a.message}</div>
          ))}
          <div style={{ display: 'flex', gap: 6, marginTop: 9, flexWrap: 'wrap' }}>
            {selected.booking?.client_phone && <>
              <Btn bg="#dcfce7" fg="#15803d" onClick={() => wa(selected.booking!.client_phone)}>💬 WhatsApp</Btn>
              <Btn bg="#e0f2fe" fg="#0369a1" onClick={() => { window.location.href = `tel:${selected.booking!.client_phone}`; }}>📞 Appeler</Btn>
            </>}
            <Btn bg="#ede9fe" fg="#6d28d9" onClick={() => onAsk(selected.booking
              ? `Fais le point sur la ${selected.car.name} louée par ${selected.booking.client_name} (${selected.booking.start_date} → ${selected.booking.end_date}) : paiement, retour, et ce que je dois faire.`
              : `La ${selected.car.name} est ${STATUS[selected.status].label.toLowerCase()}. Quelles sont les prochaines réservations et comment la louer plus vite ?`)}>✨ Demander à Dzaryx</Btn>
            <Btn bg="#f1f5f9" fg="#334155" onClick={() => onOpen('fleet')}>🚗 Parc</Btn>
          </div>
        </div>
      )}

      {/* Légende / filtres */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '10px 0 14px' }}>
        {(Object.keys(STATUS) as Status[]).map(k => (
          <button key={k} onClick={() => setFilter(filter === k ? null : k)} style={{
            display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 600, cursor: 'pointer', borderRadius: 20, padding: '5px 10px',
            background: filter === k ? `${STATUS[k].badge}30` : C.surface, color: C.text, border: `1px solid ${filter === k ? STATUS[k].badge : C.border}`,
          }}>
            <span style={{ width: 8, height: 8, borderRadius: 4, background: STATUS[k].badge }} />{STATUS[k].label} <b>{counts[k]}</b>
          </button>
        ))}
      </div>

      {/* Assistant */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: '12px 13px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 800 }}>✨ Assistant {urgent > 0 && <span style={{ color: C.red, fontSize: 11 }}>· {urgent} urgent{urgent > 1 ? 's' : ''}</span>}</div>
          <button onClick={() => onAsk('Fais-moi le briefing du jour du parc : départs, retours, paiements à encaisser, voitures libres à pousser, et les urgences dans l\'ordre.')}
            style={{ background: `${C.accent}18`, border: `1px solid ${C.accent}44`, borderRadius: 9, padding: '5px 10px', cursor: 'pointer', color: C.accent, fontWeight: 700, fontSize: 11.5 }}>Briefing du jour</button>
        </div>
        {reminders.length === 0 ? <div style={{ fontSize: 12, color: C.muted }}>Rien d'urgent sur le parc.</div> : reminders.slice(0, 4).map(r => (
          <div key={r.id} onClick={() => { const m = map.find(x => norm(x.car.name) === norm(r.car_name)); if (m) pick(m.car.id); }}
            style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '7px 0', borderTop: `1px solid ${C.border}`, cursor: 'pointer' }}>
            <span style={{ width: 7, height: 7, borderRadius: 4, marginTop: 5, flexShrink: 0, background: r.priority === 'HIGH' ? C.red : r.priority === 'MEDIUM' ? C.orange : C.muted }} />
            <div style={{ fontSize: 12, lineHeight: 1.35 }}><b>{r.car_name}</b> · {r.client_name}<div style={{ color: C.muted }}>{r.message}</div></div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Btn({ bg, fg, onClick, children }: { bg: string; fg: string; onClick: () => void; children: ReactNode }) {
  return <button onClick={onClick} style={{ background: bg, color: fg, border: 'none', borderRadius: 9, padding: '7px 10px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>{children}</button>;
}
