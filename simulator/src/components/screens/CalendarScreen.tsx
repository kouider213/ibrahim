import { useState, useEffect, useMemo } from 'react';
import { business, type Booking } from '../../services/api.ts';

const STATUS_COL: Record<string, string> = {
  CONFIRMED: '#00e676',
  PENDING:   '#ffb347',
  ACTIVE:    '#00d4ff',
  COMPLETED: '#ffffff33',
  REJECTED:  '#ff3366',
};
const DAY_LABELS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const MONTH_FR = ['Jan','Fév','Mar','Avr','Mai','Juin','Juil','Aoû','Sep','Oct','Nov','Déc'];

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default function CalendarScreen() {
  const [bookings, setBookings]   = useState<Booking[]>([]);
  const [loading, setLoad]        = useState(true);
  const [selected, setSelected]   = useState<string | null>(null);
  const [viewDate, setViewDate]   = useState(new Date());

  const today = useMemo(() => isoDate(new Date()), []);

  const load = async () => {
    setLoad(true);
    try { setBookings((await business.fetchBookings()).bookings ?? []); }
    catch { setBookings([]); }
    finally { setLoad(false); }
  };

  useEffect(() => { void load(); }, []);

  const year  = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const monthStart   = new Date(year, month, 1);
  const daysInMonth  = new Date(year, month + 1, 0).getDate();
  // weekday of 1st day: 0=Sun → remap to Mon=0 … Sun=6
  const startDow = (monthStart.getDay() + 6) % 7;

  // Map: isoDate → bookings that overlap this day
  const bookingsByDay = useMemo(() => {
    const map: Record<string, Booking[]> = {};
    for (const b of bookings) {
      if (b.status === 'REJECTED') continue;
      const start = new Date(b.start_date);
      const end   = new Date(b.end_date);
      const cur   = new Date(start);
      while (cur <= end) {
        const key = isoDate(cur);
        if (!map[key]) map[key] = [];
        map[key].push(b);
        cur.setDate(cur.getDate() + 1);
      }
    }
    return map;
  }, [bookings]);

  const prevMonth = () => setViewDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  const nextMonth = () => setViewDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1));

  const selectedBookings = selected ? (bookingsByDay[selected] ?? []) : [];

  // Build grid cells: leading empty + days
  const cells: Array<{ day: number | null; iso: string | null }> = [];
  for (let i = 0; i < startDow; i++) cells.push({ day: null, iso: null });
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, iso: isoDate(new Date(year, month, d)) });
  }

  const fmtDate = (iso: string) => {
    const d = new Date(iso);
    return `${d.getDate()} ${MONTH_FR[d.getMonth()]}`;
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#020810', color: '#fff', fontFamily: 'Share Tech Mono', position: 'relative', overflow: 'hidden' }}>
      <Corner pos="tl" /><Corner pos="tr" /><Corner pos="bl" /><Corner pos="br" />

      {/* Header */}
      <div style={{ padding: '10px 14px 8px', borderBottom: '1px solid #00d4ff12', flexShrink: 0, background: 'rgba(2,8,16,0.97)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
          <div style={{ fontFamily: 'Orbitron', fontSize: 11, color: '#00d4ff', letterSpacing: '0.3em', fontWeight: 700, textShadow: '0 0 12px #00d4ff55' }}>
            CALENDRIER
          </div>
          <button onClick={() => void load()} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#00d4ff55' }}>↻</button>
        </div>
        <div style={{ height: 1, background: 'linear-gradient(90deg, transparent, #00d4ff44, transparent)' }} />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 8 }}>

        {/* Month navigation */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 2px' }}>
          <button onClick={prevMonth} style={navBtn}>‹</button>
          <span style={{ fontFamily: 'Orbitron', fontSize: 10, color: '#00d4ff', letterSpacing: '0.2em' }}>
            {MONTH_FR[month].toUpperCase()} {year}
          </span>
          <button onClick={nextMonth} style={navBtn}>›</button>
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {Object.entries(STATUS_COL).map(([s, c]) => (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: c }} />
              <span style={{ fontSize: 6, color: `${c}99`, letterSpacing: '0.1em' }}>{s}</span>
            </div>
          ))}
        </div>

        {/* Day labels */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
          {DAY_LABELS.map((l, i) => (
            <div key={i} style={{ textAlign: 'center', fontSize: 7, color: '#00d4ff44', fontFamily: 'Orbitron', letterSpacing: '0.1em', padding: '2px 0' }}>
              {l}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 20, fontSize: 8, color: '#00d4ff33', fontFamily: 'Orbitron', letterSpacing: '0.2em' }}>CHARGEMENT…</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
            {cells.map((cell, i) => {
              if (!cell.day || !cell.iso) {
                return <div key={i} style={{ aspectRatio: '1', borderRadius: 4 }} />;
              }
              const bks  = bookingsByDay[cell.iso] ?? [];
              const isToday = cell.iso === today;
              const isSel   = cell.iso === selected;
              const dotCols = [...new Set(bks.map(b => STATUS_COL[b.status] ?? '#ffffff44'))].slice(0, 3);

              return (
                <div
                  key={cell.iso}
                  onClick={() => setSelected(isSel ? null : cell.iso)}
                  style={{
                    aspectRatio: '1',
                    borderRadius: 6,
                    background: isSel ? '#00d4ff18' : isToday ? '#00d4ff0a' : bks.length > 0 ? '#ffffff05' : 'transparent',
                    border: isSel ? '1px solid #00d4ff55' : isToday ? '1px solid #00d4ff33' : '1px solid transparent',
                    cursor: bks.length > 0 ? 'pointer' : 'default',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
                    padding: '3px 1px',
                    position: 'relative',
                  }}
                >
                  <span style={{
                    fontSize: 9,
                    color: isToday ? '#00d4ff' : isSel ? '#e8f4ff' : bks.length > 0 ? '#c8e8ff' : '#ffffff33',
                    fontFamily: isToday ? 'Orbitron' : undefined,
                    fontWeight: isToday ? 700 : undefined,
                    lineHeight: 1,
                  }}>
                    {cell.day}
                  </span>
                  {dotCols.length > 0 && (
                    <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                      {dotCols.map((c, di) => (
                        <div key={di} style={{ width: 4, height: 4, borderRadius: '50%', background: c, boxShadow: `0 0 3px ${c}` }} />
                      ))}
                      {bks.length > 3 && (
                        <span style={{ fontSize: 5, color: '#ffffff44' }}>+</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Selected day detail */}
        {selected && selectedBookings.length > 0 && (
          <div style={{ background: 'rgba(0,212,255,0.04)', borderRadius: 12, padding: '10px', border: '1px solid #00d4ff1a' }}>
            <div style={{ fontFamily: 'Orbitron', fontSize: 7, color: '#00d4ff66', letterSpacing: '0.2em', marginBottom: 8 }}>
              {fmtDate(selected)} — {selectedBookings.length} RÉSA{selectedBookings.length > 1 ? 'S' : ''}
            </div>
            {selectedBookings.map(b => {
              const col = STATUS_COL[b.status] ?? '#ffffff44';
              return (
                <div key={b.id} style={{
                  padding: '7px 9px', borderRadius: 8, marginBottom: 5,
                  background: `${col}08`, border: `1px solid ${col}22`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                    <span style={{ fontSize: 10, color: '#e8f4ff', fontWeight: 600 }}>{b.client_name}</span>
                    <span style={{ fontSize: 6, color: col, fontFamily: 'Orbitron', letterSpacing: '0.1em',
                      background: `${col}18`, padding: '2px 5px', borderRadius: 4 }}>
                      {b.status}
                    </span>
                  </div>
                  <div style={{ fontSize: 7, color: '#ffffff44', marginBottom: 2 }}>
                    {b.cars?.name ?? '—'} · {b.start_date.slice(5)} → {b.end_date.slice(5)}
                    {b.rented_by ? ` · ${b.rented_by}` : ''}
                  </div>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    {b.client_price_per_day != null && (
                      <span style={{ fontSize: 7, color: '#00d4ff77' }}>{b.client_price_per_day}€/j</span>
                    )}
                    <span style={{ fontSize: 7, color: b.payment_status === 'PAID' ? '#00e67699' : '#ffb34799' }}>
                      {b.payment_status}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {selected && selectedBookings.length === 0 && (
          <div style={{ textAlign: 'center', padding: '10px', fontSize: 8, color: '#ffffff22' }}>
            Aucune réservation ce jour
          </div>
        )}

        {/* Monthly summary */}
        {!loading && (
          <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 10, padding: '10px 12px', border: '1px solid #ffffff08' }}>
            <div style={{ fontFamily: 'Orbitron', fontSize: 7, color: '#ffffff33', letterSpacing: '0.2em', marginBottom: 8 }}>
              MOIS EN COURS
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {(['CONFIRMED','PENDING','ACTIVE'] as const).map(s => {
                const count = bookings.filter(b => b.status === s && (
                  b.start_date.startsWith(`${year}-${String(month+1).padStart(2,'0')}`) ||
                  b.end_date.startsWith(`${year}-${String(month+1).padStart(2,'0')}`)
                )).length;
                return (
                  <div key={s} style={{ flex: 1, textAlign: 'center', background: `${STATUS_COL[s]}0a`, borderRadius: 8, padding: '6px 4px', border: `1px solid ${STATUS_COL[s]}22` }}>
                    <div style={{ fontFamily: 'Orbitron', fontSize: 14, color: STATUS_COL[s] }}>{count}</div>
                    <div style={{ fontSize: 5, color: `${STATUS_COL[s]}66`, letterSpacing: '0.1em', marginTop: 1 }}>{s.slice(0,4)}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const navBtn: React.CSSProperties = {
  background: 'rgba(0,212,255,0.08)', border: '1px solid #00d4ff22', borderRadius: 6,
  width: 28, height: 28, cursor: 'pointer', color: '#00d4ffaa',
  fontFamily: 'Orbitron', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
};

function Corner({ pos }: { pos: 'tl' | 'tr' | 'bl' | 'br' }) {
  const s = 12, t = 1.5, col = '#00d4ff';
  const bT = pos.startsWith('t') ? `${t}px solid ${col}33` : 'none';
  const bB = pos.startsWith('b') ? `${t}px solid ${col}33` : 'none';
  const bL = pos.endsWith('l')   ? `${t}px solid ${col}33` : 'none';
  const bR = pos.endsWith('r')   ? `${t}px solid ${col}33` : 'none';
  const h  = pos.endsWith('l')   ? { left: 4 }  : { right: 4 };
  const v  = pos.startsWith('t') ? { top: 4 }   : { bottom: 4 };
  return <div style={{ position: 'absolute', zIndex: 1, width: s, height: s, borderTop: bT, borderBottom: bB, borderLeft: bL, borderRight: bR, ...h, ...v }} />;
}
