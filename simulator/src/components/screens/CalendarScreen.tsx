import { useState, useEffect, useMemo } from 'react';
import { business, apiFetch, getSimActor, type Booking } from '../../services/api.ts';
import { SkeletonCards } from '../ui/Premium.tsx';
import { T, tone, Screen, PageHeader, HeadBtn, Chips, Segmented, Card, Badge, Btn, SectionTitle, Kpi, KpiGrid, Sheet, Field, Toggle, inputStyle as kitInput } from '../ui/Kit.tsx';

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

const SOURCE_COL: Record<Source, string> = { fik: T.accent, kouider: T.ok, houari: T.violet };
const SOURCE_LABEL: Record<Source, string> = { fik: 'FIK', kouider: 'Kouider', houari: 'Houari' };
const STATUS_COL: Record<string, string> = { CONFIRMED: T.ok, PENDING: T.warn, ACTIVE: T.accent, COMPLETED: T.faint, REJECTED: T.bad };
const STATUS_FR: Record<string, string> = { CONFIRMED: 'Confirmée', PENDING: 'En attente', ACTIVE: 'En cours', COMPLETED: 'Terminée', REJECTED: 'Refusée' };
const stKey = (s: string) => (s ?? '').toUpperCase();

const DAY_LABELS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const MONTH_FR   = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

// Format une Date en YYYY-MM-DD dans le fuseau LOCAL (jamais toISOString = UTC,
// qui décale d'un jour en Algérie UTC+1). Source unique de vérité des jours.
function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Parse une date-only "YYYY-MM-DD" en minuit LOCAL (new Date(str) la lirait en UTC).
function parseYmd(s: string): Date {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

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
  const [selected, setSelected]     = useState<string | null>(() => isoDate(new Date()));
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
      { id: 'all',     label: 'Tout',    col: T.text },
      { id: 'fik',     label: 'FIK',     col: SOURCE_COL.fik },
      { id: 'houari',  label: 'Houari',  col: SOURCE_COL.houari },
    ];
    if (actor === 'kouider') {
      base.splice(2, 0, { id: 'kouider', label: 'Kouider', col: SOURCE_COL.kouider });
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
      const cur = parseYmd(b.start_date);
      const end = parseYmd(b.end_date);
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

  const dayTitle = (iso: string) => {
    const s = parseYmd(iso).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    return (iso === today ? "Aujourd'hui · " : '') + s.charAt(0).toUpperCase() + s.slice(1);
  };
  const shortD = (x: string) => parseYmd(x).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  const pfx = `${year}-${String(month + 1).padStart(2, '0')}`;
  const countSt = (st: string) => bookings.filter(b => stKey(b.status) === st && (b.start_date.startsWith(pfx) || b.end_date.startsWith(pfx))).length;
  const monthEvents = calEvents.filter(e => eventDate(e).startsWith(pfx)).length;
  const monthBks = bookings
    .filter(b => stKey(b.status) !== 'REJECTED' && (b.start_date.slice(0, 7) === pfx || b.end_date.slice(0, 7) === pfx || (b.start_date <= `${pfx}-31` && b.end_date >= `${pfx}-01`)))
    .sort((a, b) => a.start_date.localeCompare(b.start_date));
  const showBookings = filter === 'all' || filter === 'fik';
  const navBtn = { width: 40, height: 40, borderRadius: 12, border: `1px solid ${T.line}`, background: 'rgba(255,255,255,0.03)', color: T.accent, fontSize: 20, cursor: 'pointer' } as const;

  const BookingLine = ({ b, onClick }: { b: Booking; onClick?: () => void }) => {
    const col = STATUS_COL[stKey(b.status)] ?? T.faint;
    return (
      <Card accent={col} pad={12} onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 52, flexShrink: 0, textAlign: 'center' }}>
          <div style={{ fontSize: 18 }}>🚗</div>
          <div style={{ fontSize: 11.5, color: T.faint, marginTop: 2 }}>Location</div>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.client_name}</div>
          <div style={{ fontSize: 13, color: T.muted }}>{b.cars?.name ?? '—'} · {shortD(b.start_date)} → {shortD(b.end_date)}</div>
        </div>
        <Badge color={col}>{STATUS_FR[stKey(b.status)] ?? b.status}</Badge>
      </Card>
    );
  };

  return (
    <Screen toast={toast ?? ''} header={<>
      <PageHeader eyebrow="Agenda" title={`${MONTH_FR[month]} ${year}`}
        subtitle={loading ? 'Chargement…' : `${monthBks.length} location${monthBks.length > 1 ? 's' : ''} · ${monthEvents} rendez-vous ce mois-ci`}
        right={<div style={{ display: 'flex', gap: 8 }}>
          <HeadBtn icon="↻" label="Actualiser" onClick={() => void load()} busy={loading} />
          <HeadBtn icon="＋" label="Ajouter" onClick={() => { setAddForm(f => ({ ...f, date: selected ?? today })); setShowAdd(true); }} />
        </div>} />
      <div style={{ padding: '0 16px 10px' }}>
        <Chips<Filter> value={filter} onChange={setFilter} items={tabs.map(t => ({ id: t.id, label: t.label }))} />
      </div>
    </>}>
      {/* Calendrier du mois */}
      <Card style={{ marginBottom: 14 }} pad={12}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <button onClick={prevMonth} aria-label="Mois précédent" style={navBtn}>‹</button>
          <div style={{ flex: 1, textAlign: 'center', fontSize: 16, fontWeight: 800 }}>{MONTH_FR[month]} {year}</div>
          <button onClick={nextMonth} aria-label="Mois suivant" style={navBtn}>›</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0,1fr))', gap: 4, marginBottom: 4 }}>
          {DAY_LABELS.map((l, i) => <div key={i} style={{ textAlign: 'center', fontSize: 12, fontWeight: 700, color: i >= 5 ? T.faint : T.muted, padding: '2px 0' }}>{l}</div>)}
        </div>
        {loading && !bookings.length ? <SkeletonCards count={1} height={260} /> : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0,1fr))', gap: 4 }}>
            {cells.map((cell, i) => {
              if (!cell.day || !cell.iso) return <div key={i} />;
              const bks    = showBookings ? (bookingsByDay[cell.iso] ?? []) : [];
              const gcEvts = filteredGcByDay[cell.iso] ?? [];
              const isToday = cell.iso === today;
              const isSel   = cell.iso === selected;
              const bkDots = [...new Set(bks.map(b => STATUS_COL[stKey(b.status)] ?? T.faint))].slice(0, 2);
              const gcDots = [...new Set(gcEvts.map(e => SOURCE_COL[e.source]))].slice(0, 2);
              return (
                <button key={cell.iso} onClick={() => setSelected(cell.iso)} style={{
                  aspectRatio: '1', minHeight: 40, borderRadius: 12, cursor: 'pointer', fontFamily: T.font, padding: 0,
                  background: isSel ? `linear-gradient(135deg, ${T.accent}, ${T.accent2})` : isToday ? tone(T.accent, 0.12) : bks.length || gcEvts.length ? 'rgba(255,255,255,0.04)' : 'transparent',
                  border: isToday && !isSel ? `1px solid ${tone(T.accent, 0.55)}` : '1px solid transparent',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3,
                }}>
                  <span style={{ fontSize: 15, fontWeight: isToday || isSel ? 800 : 600, color: isSel ? '#04101f' : isToday ? T.accent : T.text, lineHeight: 1 }}>{cell.day}</span>
                  <span style={{ display: 'flex', gap: 3, height: 6 }}>
                    {[...bkDots, ...gcDots].slice(0, 3).map((c, di) => <span key={di} style={{ width: 6, height: 6, borderRadius: '50%', background: isSel ? '#04101f' : c }} />)}
                  </span>
                </button>
              );
            })}
          </div>
        )}
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 10, paddingTop: 10, borderTop: `1px solid ${T.line}` }}>
          {([['Location', T.ok], ['En attente', T.warn], ...((Object.entries(SOURCE_COL) as Array<[Source, string]>).map(([k, c]) => [`Agenda ${SOURCE_LABEL[k]}`, c]))] as Array<[string, string]>).map(([l, c]) => (
            <span key={l} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: T.muted }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: c }} />{l}</span>
          ))}
        </div>
      </Card>

      {/* Programme du jour sélectionné */}
      {selected && (
        <>
          <SectionTitle right={selected !== today ? <button onClick={() => setSelected(today)} style={{ background: 'none', border: 'none', color: T.accent, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: T.font }}>Aujourd'hui</button> : undefined}>{dayTitle(selected)}</SectionTitle>
          {selectedGc.length === 0 && (!showBookings || selectedBookings.length === 0) ? (
            <div style={{ fontSize: 14, color: T.faint, padding: '2px 2px 16px' }}>Rien de prévu ce jour-là.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              {selectedGc.map((e, idx) => {
                const col = SOURCE_COL[e.source];
                return (
                  <Card key={e.id ?? idx} accent={col} pad={12} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 52, flexShrink: 0, textAlign: 'center' }}>
                      <div style={{ fontSize: 15, fontWeight: 800, color: col }}>{fmtTime(e)}</div>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 700 }}>{e.summary}</div>
                      {e.description && <div style={{ fontSize: 13, color: T.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.description}</div>}
                    </div>
                    <Badge color={col}>{SOURCE_LABEL[e.source]}</Badge>
                  </Card>
                );
              })}
              {showBookings && selectedBookings.map(b => <BookingLine key={b.id} b={b} />)}
            </div>
          )}
        </>
      )}

      {!loading && <>
        <SectionTitle>Ce mois-ci</SectionTitle>
        <KpiGrid>
          <Kpi value={countSt('CONFIRMED')} label="Confirmées" color={T.ok} />
          <Kpi value={countSt('PENDING')} label="En attente" color={T.warn} />
          <Kpi value={countSt('ACTIVE')} label="En cours" color={T.accent} />
          <Kpi value={monthEvents} label="Rendez-vous" color={T.violet} />
        </KpiGrid>
        {showBookings && monthBks.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {monthBks.map(b => <BookingLine key={b.id} b={b} onClick={() => setSelected(b.start_date.slice(0, 10))} />)}
          </div>
        )}
      </>}

      {/* Nouvel événement */}
      {showAdd && (
        <Sheet title="Nouvel événement" onClose={() => setShowAdd(false)} footer={<>
          <Btn variant="ghost" onClick={() => setShowAdd(false)} style={{ flex: 1 }}>Annuler</Btn>
          <Btn variant="primary" onClick={() => void handleAddSubmit()} disabled={addSaving || !addForm.title || !addForm.date} style={{ flex: 2 }}>{addSaving ? 'Ajout…' : 'Ajouter à l\'agenda'}</Btn>
        </>}>
          <Field label="Agenda">
            <Segmented<'fik' | 'kouider' | 'houari'> value={addForm.calendar} onChange={cal => setAddForm(f => ({ ...f, calendar: cal }))}
              items={(['fik', actor === 'houari' ? 'houari' : 'kouider'] as const).map(c => ({ id: c, label: SOURCE_LABEL[c] }))} />
          </Field>
          <Field label="Titre"><input type="text" placeholder="Ex. Livraison Clio à l'aéroport" value={addForm.title} onChange={e => setAddForm(f => ({ ...f, title: e.target.value }))} style={kitInput} /></Field>
          <Field label="Date"><input type="date" value={addForm.date} onChange={e => setAddForm(f => ({ ...f, date: e.target.value }))} style={{ ...kitInput, colorScheme: 'dark' }} /></Field>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <span style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>Toute la journée</span>
            <Toggle on={addForm.allDay} onChange={() => setAddForm(f => ({ ...f, allDay: !f.allDay }))} colorOff={T.faint} />
          </div>
          {!addForm.allDay && (
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 10 }}>
              <Field label="Heure"><input type="time" value={addForm.time} onChange={e => setAddForm(f => ({ ...f, time: e.target.value }))} style={{ ...kitInput, colorScheme: 'dark' }} /></Field>
              <Field label="Durée (heures)"><input type="number" min="0.5" max="24" step="0.5" value={addForm.duration} onChange={e => setAddForm(f => ({ ...f, duration: e.target.value }))} style={kitInput} /></Field>
            </div>
          )}
        </Sheet>
      )}
    </Screen>
  );
}
