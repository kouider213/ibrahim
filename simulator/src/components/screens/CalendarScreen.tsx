import { useState, useEffect, useMemo } from 'react';
import { business, apiFetch, getSimActor, type Booking } from '../../services/api.ts';

type Source = 'fik' | 'kouider' | 'houari';
type Filter = 'all' | Source;

interface CalEvent {
  id?: string;
  summary: string;
  description?: string;
  start: { dateTime?: string; date?: string };
  end:   { dateTime?: string; date?: string };
  source: Source;
}

const SOURCE_COL: Record<Source, string> = {
  fik:     '#00d4ff',
  kouider: '#00e676',
  houari:  '#b388ff',
};

const SOURCE_LABEL: Record<Source, string> = {
  fik:     'FIK',
  kouider: 'KOUIDER',
  houari:  'HOUARI',
};

const STATUS_COL: Record<string, string> = {
  CONFIRMED: '#00e676',
  PENDING:   '#ffb347',
  ACTIVE:    '#00d4ff',
  COMPLETED: '#ffffff33',
  REJECTED:  '#ff3366',
};

const DAY_LABELS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const MONTH_FR   = ['Jan','Fév','Mar','Avr','Mai','Juin','Juil','Aoû','Sep','Oct','Nov','Déc'];

function isoDate(d: Date): string { return d.toISOString().slice(0, 10); }

function eventDate(e: CalEvent): string {
  return (e.start.dateTime ?? e.start.date ?? '').slice(0, 10);
}

function fmtTime(e: CalEvent): string {
  if (!e.start.dateTime) return 'Journée';
  const d = new Date(e.start.dateTime);
  return `${String(d.getHours()).padStart(2,'0')}h${String(d.getMinutes()).padStart(2,'0')}`;
}

export default function CalendarScreen() {
  const actor = getSimActor();

  const [bookings, setBookings]     = useState<Booking[]>([]);
  const [calEvents, setCalEvents]   = useState<CalEvent[]>([]);
  const [loading, setLoading]       = useState(true);
  const [selected, setSelected]     = useState<string | null>(null);
  const [viewDate, setViewDate]     = useState(new Date());
  const [filter, setFilter]         = useState<Filter>('all');
  const [showAdd, setShowAdd]       = useState(false);
  const [addForm, setAddForm]       = useState({ title: '', date: '', time: '09:00', duration: '1', calendar: (actor === 'houari' ? 'houari' : 'kouider') as 'fik' | 'kouider' | 'houari', allDay: false });
  const [addSaving, setAddSaving]   = useState(false);
  const [toast, setToast]           = useState<string | null>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 2500); };

  const today = useMemo(() => isoDate(new Date()), []);

  const tabs: Array<{ id: Filter; label: string; col: string }> = useMemo(() => {
    const base: Array<{ id: Filter; label: string; col: string }> = [
      { id: 'all',     label: 'TOUT',    col: '#ffffff' },
      { id: 'fik',     label: 'FIK',     col: SOURCE_COL.fik },
      { id: 'houari',  label: 'HOUARI',  col: SOURCE_COL.houari },
    ];
    if (actor === 'kouider') {
      base.splice(2, 0, { id: 'kouider', label: 'KOUIDER', col: SOURCE_COL.kouider });
    }
    return base;
  }, [actor]);

  const load = async () => {
    setLoading(true);
    try {
      const [bkRes, gcRes] = await Promise.all([
        business.fetchBookings(),
        apiFetch<{ events: CalEvent[] }>(`/api/calendar/all?actor=${actor}`),
      ]);
      setBookings(bkRes.bookings ?? []);
      setCalEvents(gcRes.events ?? []);
    } catch {
      setBookings([]);
      setCalEvents([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const year      = viewDate.getFullYear();
  const month     = viewDate.getMonth();
  const monthStart   = new Date(year, month, 1);
  const daysInMonth  = new Date(year, month + 1, 0).getDate();
  const startDow     = (monthStart.getDay() + 6) % 7;

  // booking dots by day (Supabase)
  const bookingsByDay = useMemo(() => {
    const map: Record<string, Booking[]> = {};
    for (const b of bookings) {
      if (b.status === 'REJECTED') continue;
      const cur = new Date(b.start_date);
      const end = new Date(b.end_date);
      while (cur <= end) {
        const k = isoDate(cur);
        (map[k] ??= []).push(b);
        cur.setDate(cur.getDate() + 1);
      }
    }
    return map;
  }, [bookings]);

  // Google Calendar events by day
  const gcByDay = useMemo(() => {
    const map: Record<string, CalEvent[]> = {};
    for (const e of calEvents) {
      const k = eventDate(e);
      if (k) (map[k] ??= []).push(e);
    }
    return map;
  }, [calEvents]);

  const filteredGcByDay = useMemo(() => {
    if (filter === 'all') return gcByDay;
    const map: Record<string, CalEvent[]> = {};
    for (const [day, evts] of Object.entries(gcByDay)) {
      const f = evts.filter(e => e.source === filter);
      if (f.length) map[day] = f;
    }
    return map;
  }, [gcByDay, filter]);

  const cells: Array<{ day: number | null; iso: string | null }> = [];
  for (let i = 0; i < startDow; i++) cells.push({ day: null, iso: null });
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, iso: isoDate(new Date(year, month, d)) });
  }

  const selectedBookings = selected ? (bookingsByDay[selected] ?? []) : [];
  const selectedGc = selected
    ? (filter === 'all' ? (gcByDay[selected] ?? []) : (filteredGcByDay[selected] ?? []))
    : [];

  const prevMonth = () => setViewDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  const nextMonth = () => setViewDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1));

  const handleAddSubmit = async () => {
    if (!addForm.title || !addForm.date) return;
    setAddSaving(true);
    try {
      let startDateTime: string;
      let endDateTime: string;
      if (addForm.allDay) {
        startDateTime = addForm.date;
        endDateTime   = addForm.date;
      } else {
        startDateTime = `${addForm.date}T${addForm.time}:00`;
        const endMs   = new Date(startDateTime).getTime() + parseFloat(addForm.duration) * 3600_000;
        endDateTime   = new Date(endMs).toISOString().slice(0, 16);
      }
      await apiFetch('/api/calendar/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          calendar: addForm.calendar,
          title: addForm.title,
          startDateTime,
          endDateTime,
          allDay: addForm.allDay,
        }),
      });
      setShowAdd(false);
      setAddForm({ title: '', date: '', time: '09:00', duration: '1', calendar: actor === 'houari' ? 'houari' : 'kouider', allDay: false });
      showToast('✅ Événement ajouté');
      void load();
    } catch {
      showToast('❌ Erreur lors de l\'ajout');
    } finally {
      setAddSaving(false);
    }
  };

  const fmtDate = (iso: string) => {
    const d = new Date(iso);
    return `${d.getDate()} ${MONTH_FR[d.getMonth()]}`;
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#020810', color: '#fff', fontFamily: 'Share Tech Mono', position: 'relative', overflow: 'hidden' }}>
      <Corner pos="tl" /><Corner pos="tr" /><Corner pos="bl" /><Corner pos="br" />

      {/* Header */}
      <div style={{ padding: '10px 14px 8px', borderBottom: '1px solid #00d4ff12', flexShrink: 0, background: 'rgba(2,8,16,0.97)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <div style={{ fontFamily: 'Orbitron', fontSize: 11, color: '#00d4ff', letterSpacing: '0.3em', fontWeight: 700, textShadow: '0 0 12px #00d4ff55' }}>
            CALENDRIER
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button onClick={() => void load()} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#00d4ff55' }}>↻</button>
            <button
              onClick={() => setShowAdd(true)}
              style={{ background: 'rgba(0,212,255,0.1)', border: '1px solid #00d4ff44', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontFamily: 'Orbitron', fontSize: 7, color: '#00d4ff', letterSpacing: '0.1em' }}
            >
              + AJOUTER
            </button>
          </div>
        </div>

        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: 4 }}>
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setFilter(t.id)}
              style={{
                flex: 1, padding: '4px 2px',
                background: filter === t.id ? `${t.col}18` : 'transparent',
                border: `1px solid ${filter === t.id ? t.col + '66' : '#ffffff11'}`,
                borderRadius: 6, cursor: 'pointer',
                fontFamily: 'Orbitron', fontSize: 6, letterSpacing: '0.08em',
                color: filter === t.id ? t.col : '#ffffff33',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 8 }}>

        {/* Month navigation */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '2px 2px' }}>
          <button onClick={prevMonth} style={navBtn}>‹</button>
          <span style={{ fontFamily: 'Orbitron', fontSize: 10, color: '#00d4ff', letterSpacing: '0.2em' }}>
            {MONTH_FR[month].toUpperCase()} {year}
          </span>
          <button onClick={nextMonth} style={navBtn}>›</button>
        </div>

        {/* Source legend */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {(Object.entries(SOURCE_COL) as Array<[Source, string]>).map(([s, c]) => (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: c, boxShadow: `0 0 4px ${c}` }} />
              <span style={{ fontSize: 6, color: `${c}99`, letterSpacing: '0.1em' }}>{SOURCE_LABEL[s]}</span>
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
              if (!cell.day || !cell.iso) return <div key={i} style={{ aspectRatio: '1', borderRadius: 4 }} />;
              const bks     = bookingsByDay[cell.iso] ?? [];
              const gcEvts  = filteredGcByDay[cell.iso] ?? [];
              const hasAny  = bks.length > 0 || gcEvts.length > 0;
              const isToday = cell.iso === today;
              const isSel   = cell.iso === selected;

              // dots: up to 3 booking dots + gc source dots
              const bkDots  = [...new Set(bks.map(b => STATUS_COL[b.status] ?? '#ffffff44'))].slice(0, 2);
              const gcDots  = [...new Set(gcEvts.map(e => SOURCE_COL[e.source]))].slice(0, 2);

              return (
                <div
                  key={cell.iso}
                  onClick={() => setSelected(isSel ? null : cell.iso)}
                  style={{
                    aspectRatio: '1', borderRadius: 6,
                    background: isSel ? '#00d4ff18' : isToday ? '#00d4ff0a' : hasAny ? '#ffffff05' : 'transparent',
                    border: isSel ? '1px solid #00d4ff55' : isToday ? '1px solid #00d4ff33' : '1px solid transparent',
                    cursor: hasAny ? 'pointer' : 'default',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
                    padding: '3px 1px',
                  }}
                >
                  <span style={{
                    fontSize: 9, lineHeight: 1,
                    color: isToday ? '#00d4ff' : isSel ? '#e8f4ff' : hasAny ? '#c8e8ff' : '#ffffff33',
                    fontFamily: isToday ? 'Orbitron' : undefined,
                    fontWeight: isToday ? 700 : undefined,
                  }}>
                    {cell.day}
                  </span>
                  {(bkDots.length > 0 || gcDots.length > 0) && (
                    <div style={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
                      {bkDots.map((c, di) => (
                        <div key={`b${di}`} style={{ width: 3, height: 3, borderRadius: '50%', background: c }} />
                      ))}
                      {gcDots.map((c, di) => (
                        <div key={`g${di}`} style={{ width: 3, height: 3, borderRadius: '50%', background: c, boxShadow: `0 0 3px ${c}` }} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Selected day detail */}
        {selected && (selectedBookings.length > 0 || selectedGc.length > 0) && (
          <div style={{ background: 'rgba(0,212,255,0.04)', borderRadius: 12, padding: '10px', border: '1px solid #00d4ff1a' }}>
            <div style={{ fontFamily: 'Orbitron', fontSize: 7, color: '#00d4ff66', letterSpacing: '0.2em', marginBottom: 8 }}>
              {fmtDate(selected)}
            </div>

            {/* Google Calendar events */}
            {selectedGc.map((e, idx) => {
              const col = SOURCE_COL[e.source];
              return (
                <div key={e.id ?? idx} style={{
                  padding: '7px 9px', borderRadius: 8, marginBottom: 5,
                  background: `${col}08`, border: `1px solid ${col}22`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                    <span style={{
                      fontSize: 5, color: col, fontFamily: 'Orbitron', letterSpacing: '0.1em',
                      background: `${col}18`, padding: '1px 4px', borderRadius: 3,
                    }}>
                      {SOURCE_LABEL[e.source]}
                    </span>
                    <span style={{ fontSize: 9, color: '#e8f4ff', fontWeight: 600 }}>{e.summary}</span>
                  </div>
                  <div style={{ fontSize: 7, color: '#ffffff44' }}>{fmtTime(e)}</div>
                  {e.description && (
                    <div style={{ fontSize: 6, color: '#ffffff33', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {e.description}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Supabase booking entries (only when filter is all or fik) */}
            {(filter === 'all' || filter === 'fik') && selectedBookings.map(b => {
              const col = STATUS_COL[b.status] ?? '#ffffff44';
              return (
                <div key={b.id} style={{
                  padding: '7px 9px', borderRadius: 8, marginBottom: 5,
                  background: `${col}08`, border: `1px solid ${col}22`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                    <span style={{
                      fontSize: 5, color: SOURCE_COL.fik, fontFamily: 'Orbitron', letterSpacing: '0.1em',
                      background: `${SOURCE_COL.fik}18`, padding: '1px 4px', borderRadius: 3,
                    }}>
                      RÉSA
                    </span>
                    <span style={{ fontSize: 9, color: '#e8f4ff', fontWeight: 600 }}>{b.client_name}</span>
                    <span style={{ marginLeft: 'auto', fontSize: 6, color: col, fontFamily: 'Orbitron', letterSpacing: '0.1em',
                      background: `${col}18`, padding: '2px 5px', borderRadius: 4 }}>
                      {b.status}
                    </span>
                  </div>
                  <div style={{ fontSize: 7, color: '#ffffff44' }}>
                    {b.cars?.name ?? '—'} · {b.start_date.slice(5)} → {b.end_date.slice(5)}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {selected && selectedBookings.length === 0 && selectedGc.length === 0 && (
          <div style={{ textAlign: 'center', padding: '10px', fontSize: 8, color: '#ffffff22' }}>
            Aucun événement ce jour
          </div>
        )}

        {/* Monthly summary */}
        {!loading && (
          <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 10, padding: '10px 12px', border: '1px solid #ffffff08' }}>
            <div style={{ fontFamily: 'Orbitron', fontSize: 7, color: '#ffffff33', letterSpacing: '0.2em', marginBottom: 8 }}>
              MOIS EN COURS
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              {(['CONFIRMED','PENDING','ACTIVE'] as const).map(s => {
                const pfx = `${year}-${String(month + 1).padStart(2, '0')}`;
                const count = bookings.filter(b =>
                  b.status === s && (b.start_date.startsWith(pfx) || b.end_date.startsWith(pfx))
                ).length;
                return (
                  <div key={s} style={{ flex: 1, textAlign: 'center', background: `${STATUS_COL[s]}0a`, borderRadius: 8, padding: '6px 4px', border: `1px solid ${STATUS_COL[s]}22` }}>
                    <div style={{ fontFamily: 'Orbitron', fontSize: 14, color: STATUS_COL[s] }}>{count}</div>
                    <div style={{ fontSize: 5, color: `${STATUS_COL[s]}66`, letterSpacing: '0.1em', marginTop: 1 }}>{s.slice(0,4)}</div>
                  </div>
                );
              })}
              <div style={{ flex: 1, textAlign: 'center', background: '#b388ff0a', borderRadius: 8, padding: '6px 4px', border: '1px solid #b388ff22' }}>
                <div style={{ fontFamily: 'Orbitron', fontSize: 14, color: '#b388ff' }}>
                  {calEvents.filter(e => eventDate(e).startsWith(`${year}-${String(month+1).padStart(2,'0')}`)).length}
                </div>
                <div style={{ fontSize: 5, color: '#b388ff66', letterSpacing: '0.1em', marginTop: 1 }}>GCAL</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'absolute', bottom: 80, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(0,212,255,0.15)', border: '1px solid #00d4ff44',
          borderRadius: 20, padding: '8px 18px', fontSize: 9, color: '#00d4ff',
          fontFamily: 'Orbitron', letterSpacing: '0.1em', zIndex: 100,
          backdropFilter: 'blur(10px)',
        }}>
          {toast}
        </div>
      )}

      {/* Add event modal */}
      {showAdd && (
        <div
          onClick={() => setShowAdd(false)}
          style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 50, display: 'flex', alignItems: 'flex-end' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ width: '100%', background: '#061220', borderTop: '1px solid #00d4ff33', borderRadius: '16px 16px 0 0', padding: '16px 14px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}
          >
            <div style={{ fontFamily: 'Orbitron', fontSize: 9, color: '#00d4ff', letterSpacing: '0.2em', marginBottom: 4 }}>
              + NOUVEL ÉVÉNEMENT
            </div>

            {/* Calendar selector */}
            <div style={{ display: 'flex', gap: 4 }}>
              {(['fik', actor === 'houari' ? 'houari' : 'kouider'] as const).map(cal => {
                const col = SOURCE_COL[cal as Source];
                return (
                  <button
                    key={cal}
                    onClick={() => setAddForm(f => ({ ...f, calendar: cal }))}
                    style={{
                      flex: 1, padding: '6px 4px',
                      background: addForm.calendar === cal ? `${col}20` : 'transparent',
                      border: `1px solid ${addForm.calendar === cal ? col + '66' : '#ffffff11'}`,
                      borderRadius: 8, cursor: 'pointer',
                      fontFamily: 'Orbitron', fontSize: 7, letterSpacing: '0.1em',
                      color: addForm.calendar === cal ? col : '#ffffff33',
                    }}
                  >
                    {SOURCE_LABEL[cal as Source]}
                  </button>
                );
              })}
            </div>

            {/* Title */}
            <input
              type="text"
              placeholder="Titre de l'événement"
              value={addForm.title}
              onChange={e => setAddForm(f => ({ ...f, title: e.target.value }))}
              style={inputStyle}
            />

            {/* Date + allDay toggle */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="date"
                value={addForm.date}
                onChange={e => setAddForm(f => ({ ...f, date: e.target.value }))}
                style={{ ...inputStyle, flex: 1, colorScheme: 'dark' }}
              />
              <button
                onClick={() => setAddForm(f => ({ ...f, allDay: !f.allDay }))}
                style={{
                  padding: '6px 10px', borderRadius: 8, cursor: 'pointer',
                  background: addForm.allDay ? 'rgba(0,212,255,0.15)' : 'transparent',
                  border: `1px solid ${addForm.allDay ? '#00d4ff66' : '#ffffff11'}`,
                  fontFamily: 'Orbitron', fontSize: 6, color: addForm.allDay ? '#00d4ff' : '#ffffff33',
                  letterSpacing: '0.1em', whiteSpace: 'nowrap',
                }}
              >
                JOURNÉE
              </button>
            </div>

            {/* Time + Duration (hidden if allDay) */}
            {!addForm.allDay && (
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="time"
                  value={addForm.time}
                  onChange={e => setAddForm(f => ({ ...f, time: e.target.value }))}
                  style={{ ...inputStyle, flex: 1, colorScheme: 'dark' }}
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1 }}>
                  <input
                    type="number"
                    min="0.5"
                    max="24"
                    step="0.5"
                    value={addForm.duration}
                    onChange={e => setAddForm(f => ({ ...f, duration: e.target.value }))}
                    style={{ ...inputStyle, flex: 1, textAlign: 'center' }}
                  />
                  <span style={{ fontSize: 7, color: '#ffffff33', whiteSpace: 'nowrap' }}>h</span>
                </div>
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button
                onClick={() => setShowAdd(false)}
                style={{ flex: 1, padding: '10px', background: 'transparent', border: '1px solid #ffffff11', borderRadius: 10, cursor: 'pointer', fontFamily: 'Orbitron', fontSize: 8, color: '#ffffff33' }}
              >
                ANNULER
              </button>
              <button
                onClick={() => void handleAddSubmit()}
                disabled={addSaving || !addForm.title || !addForm.date}
                style={{
                  flex: 2, padding: '10px', borderRadius: 10, cursor: addSaving ? 'default' : 'pointer',
                  background: addSaving ? 'rgba(0,212,255,0.05)' : 'rgba(0,212,255,0.15)',
                  border: '1px solid #00d4ff44',
                  fontFamily: 'Orbitron', fontSize: 8, color: '#00d4ff', letterSpacing: '0.1em',
                }}
              >
                {addSaving ? '...' : '✓ AJOUTER'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)', border: '1px solid #ffffff11',
  borderRadius: 8, padding: '8px 10px', color: '#e8f4ff',
  fontFamily: 'Share Tech Mono', fontSize: 10, outline: 'none', width: '100%', boxSizing: 'border-box',
};

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
