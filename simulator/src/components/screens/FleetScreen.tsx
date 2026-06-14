import { useState, useEffect, useRef, type CSSProperties } from 'react';
import { business, getOrCreateSessionId, type Car, type FleetIntel, type SiteProperty, type SaleVehicle, type InspectionResult, type DamageBox } from '../../services/api.ts';
import { Hero, StatCard } from '../ui/Premium.tsx';

type ParcTab = 'cars' | 'immo' | 'vente';

// Catalog prices (ref only for display — never used in financial calculations)
const PRICE_CATALOG: Array<{ match: string; h: number; k: number }> = [
  { match: 'jumpy',       h: 44, k: 55 },
  { match: 'berlingo',    h: 44, k: 55 },
  { match: 'jogger',      h: 37, k: 50 },
  { match: 'sandero',     h: 22, k: 35 },
  { match: 'clio 5 alp',  h: 44, k: 50 },
  { match: 'clio 5',      h: 37, k: 45 },
  { match: 'clio 4 v1',   h: 16, k: 25 },
  { match: 'clio 4 v2',   h: 24, k: 35 },
  { match: 'clio 4',      h: 20, k: 30 },
  { match: 'i10',         h: 16, k: 25 },
  { match: 'fiat 500 xl', h: 37, k: 45 },
  { match: 'fiat 500',    h: 24, k: 35 },
  { match: 'r.duster',    h: 31, k: 45 },
  { match: 'd.duster',    h: 44, k: 50 },
  { match: 'duster',      h: 37, k: 48 },
  { match: 'creta',       h: 24, k: 45 },
];

function getCatalog(name: string): { h: number; k: number } | null {
  const n = name.toLowerCase();
  return PRICE_CATALOG.find(p => n.includes(p.match)) ?? null;
}

type InspectKind = 'vehicle' | 'property';
interface InspectOpen { kind: InspectKind; name: string }

export default function FleetScreen({ actor = 'kouider' }: { actor?: string }) {
  const isHouari = actor === 'houari';
  const [tab, setTab]      = useState<ParcTab>('cars');
  const [intel, setIntel]  = useState<FleetIntel | null>(null);
  const [cars, setCars]    = useState<Car[]>([]);
  const [loading, setLoad] = useState(true);
  const [toggling, setTog] = useState<string | null>(null);
  const [msg, setMsg]      = useState('');
  const [inspect, setInspect] = useState<InspectOpen | null>(null);
  const [editCar, setEditCar] = useState<Car | null>(null);
  const [bookCar, setBookCar] = useState<Car | null>(null);
  const [photoBusy, setPhotoBusy] = useState<string | null>(null);
  const photoTarget = useRef<string>('');
  const carPhotoRef = useRef<HTMLInputElement>(null);
  const sessionId = useRef(getOrCreateSessionId());

  const onCarPhotos = async (files: File[]) => {
    const name = photoTarget.current;
    if (!files.length || !name) return;
    setPhotoBusy(name);
    try {
      const imgs = await Promise.all(files.slice(0, 15).map(f => new Promise<string>((res, rej) => {
        const r = new FileReader(); r.onloadend = () => res(r.result as string); r.onerror = rej; r.readAsDataURL(f);
      })));
      const r = await business.addCarPhotos(name, imgs);
      setMsg(`✅ ${r.count ?? imgs.length} photo(s) — ${name}`);
      setTimeout(() => setMsg(''), 2500);
      void load();
    } catch { setMsg('❌ Échec photos'); setTimeout(() => setMsg(''), 2500); }
    finally { setPhotoBusy(null); }
  };

  const load = async () => {
    setLoad(true);
    try {
      const [fleetRes, carsRes] = await Promise.all([
        business.fetchFleet().catch(() => null),
        business.fetchCars().catch(() => ({ cars: [] as Car[] })),
      ]);
      setIntel(fleetRes);
      setCars(carsRes.cars ?? []);
    } finally { setLoad(false); }
  };

  useEffect(() => { void load(); }, []);

  const toggle = async (car: Car) => {
    setTog(car.id);
    const ok = await business.toggleCar(car.id, !car.available).catch(() => false);
    if (ok) {
      setCars(cs => cs.map(c => c.id === car.id ? { ...c, available: !c.available } : c));
      setMsg(`${car.name} → ${!car.available ? 'DISPONIBLE' : 'INDISPONIBLE'}`);
      setTimeout(() => setMsg(''), 2500);
    }
    setTog(null);
  };

  const availCount   = cars.filter(c => c.available).length;
  const unavailCount = cars.filter(c => !c.available).length;
  const occPct       = intel ? Math.round(intel.occupancy_avg_pct) : 0;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#0a0a0c', color: '#fff', fontFamily: 'Inter, sans-serif', position: 'relative', overflow: 'hidden' }}>
      {/* Header premium (cohérent avec les autres écrans) */}
      <div style={{ flexShrink: 0, background: 'rgba(10,10,12,0.97)' }}>
        <Hero eyebrow="Dzaryx · Parc" title={tab === 'cars' ? 'Véhicules' : tab === 'immo' ? 'Immobilier' : 'Vente auto'} subtitle={msg || undefined} />
        <div style={{ padding: '0 16px 10px' }}>
          {/* Segment switcher */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            {([['cars', '🚗 LOCATION'], ['immo', '🏠 IMMO'], ['vente', '💰 VENTE']] as [ParcTab, string][]).map(([k, lbl]) => (
              <button key={k} onClick={() => setTab(k)} style={{
                flex: 1, padding: '9px 4px', borderRadius: 10,
                background: tab === k ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${tab === k ? '#10b98188' : 'rgba(255,255,255,0.08)'}`,
                fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 700, letterSpacing: '0.04em',
                color: tab === k ? '#10b981' : 'rgba(255,255,255,0.55)', cursor: 'pointer',
              }}>{lbl}</button>
            ))}
          </div>
          {tab === 'cars' && (
          <div style={{ display: 'flex', gap: 10 }}>
            <StatCard value={String(cars.length)} label="TOTAL" color="#10b981" />
            <StatCard value={String(availCount)} label="DISPO" color="#00e676" />
            <StatCard value={`${occPct}%`} label="OCCUP" color="#ffb347" />
            <StatCard value={String(unavailCount)} label="INDISPO" color="#ff3366" />
          </div>
          )}
        </div>
      </div>

      {/* Immo / Vente panes */}
      {tab === 'immo'  && <ImmoPane  onMsg={(m) => { setMsg(m); setTimeout(() => setMsg(''), 2500); }} onInspect={(name) => setInspect({ kind: 'property', name })} />}
      {tab === 'vente' && <VentePane onMsg={(m) => { setMsg(m); setTimeout(() => setMsg(''), 2500); }} />}

      {/* Cars list */}
      {tab === 'cars' && (
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {loading ? (
          <HudLoader />
        ) : cars.length === 0 ? (
          <HudEmpty text="Aucun véhicule" />
        ) : cars.map(car => {
          const avail   = car.available;
          const col     = avail ? '#00e676' : '#ff3366';
          const stat    = intel?.stats.find(s => s.car_name === car.name);
          const isTog   = toggling === car.id;
          const rev30d  = stat ? Math.round(stat.revenue_30d) : null;
          const occ30d  = stat ? Math.round(stat.occupancy_pct) : null;
          const catalog = getCatalog(car.name);
          const cur     = isHouari ? 'DA' : '€';
          // Houari : prix en DZD (houari_*). Kouider : prix EUR actuels (base/resale, fallback catalogue).
          const hPrice  = isHouari ? (car.houari_base_price   ?? null) : (car.base_price   ?? catalog?.h ?? null);
          const kPrice  = isHouari ? (car.houari_resale_price ?? null) : (car.resale_price ?? catalog?.k ?? null);
          const profit  = (hPrice != null && kPrice != null) ? Math.round((kPrice - hPrice) * 100) / 100 : null;

          return (
            <div key={car.id} style={{
              borderRadius: 16,
              border: '1px solid rgba(255,255,255,0.07)',
              background: '#16161c',
              display: 'flex', alignItems: 'stretch',
            }}>
              {/* Left accent bar */}
              <div style={{ width: 3, alignSelf: 'stretch', background: `linear-gradient(180deg, ${col}, ${col}22)`, flexShrink: 0, borderTopLeftRadius: 16, borderBottomLeftRadius: 16 }} />

              {/* Photo — left square */}
              <div style={{
                width: 86, height: 72, flexShrink: 0,
                background: `radial-gradient(ellipse at 50% 60%, ${col}0d, #030912)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                overflow: 'hidden', margin: '0 2px',
              }}>
                <CarPhoto url={car.image_url ?? null} name={car.name} col={col} />
              </div>

              {/* Middle — name + prices + stats */}
              <div style={{ flex: 1, minWidth: 0, padding: '9px 6px 9px 8px' }}>
                {/* Name */}
                <div style={{
                  fontSize: 15.5, color: '#ffffff', fontWeight: 700,
                  letterSpacing: '0.01em', marginBottom: 3,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {car.name}
                </div>
                {/* Category */}
                <div style={{ fontSize: 10.5, color: '#9b9ba6', marginBottom: 6 }}>
                  {car.category ?? 'Standard'}
                </div>
                {/* Prices — Proprio / Client / marge */}
                <div style={{ display: 'flex', gap: 6, marginBottom: 5, flexWrap: 'wrap' }}>
                  {hPrice !== null && (
                    <span style={{ fontSize: 11, fontWeight: 600, background: '#ff5a7a14', border: '1px solid #ff5a7a3a', borderRadius: 8, padding: '3px 8px', color: '#ff7a93' }}>
                      Proprio {hPrice} {cur}/j
                    </span>
                  )}
                  {kPrice !== null && (
                    <span style={{ fontSize: 11, fontWeight: 600, background: '#00e67614', border: '1px solid #00e6763a', borderRadius: 8, padding: '3px 8px', color: '#00e676' }}>
                      Client {kPrice} {cur}/j
                    </span>
                  )}
                  {profit !== null && (
                    <span style={{ fontSize: 11, fontWeight: 600, background: '#ffb34714', border: '1px solid #ffb3473a', borderRadius: 8, padding: '3px 8px', color: '#ffb347' }}>
                      Marge +{profit} {cur}/j
                    </span>
                  )}
                </div>
                {/* Rev 30j + occupation — affichés seulement s'il y a de l'activité */}
                {rev30d !== null && rev30d > 0 && (
                  <div style={{ fontSize: 11, color: '#9b9ba6', marginBottom: 4 }}>
                    REV. 30J <span style={{ color: '#e5e7eb', fontWeight: 700 }}>
                      {rev30d >= 1000 ? `${(rev30d / 1000).toFixed(1)}k€` : `${rev30d}€`}
                    </span>
                  </div>
                )}
                {occ30d !== null && occ30d > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <div style={{ flex: 1, height: 3, background: '#ffffff09', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${occ30d}%`, background: `linear-gradient(90deg, ${col}55, ${col})`, borderRadius: 2, transition: 'width 0.6s ease' }} />
                    </div>
                    <span style={{ fontSize: 10, color: col, fontFamily: 'Inter, sans-serif', minWidth: 28, textAlign: 'right' }}>
                      {occ30d}%
                    </span>
                  </div>
                )}
              </div>

              {/* Right — toggle + label + inspection */}
              <div style={{ flexShrink: 0, padding: '0 10px 0 4px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <button
                  onClick={() => void toggle(car)}
                  disabled={isTog}
                  title={avail ? 'Mettre indisponible' : 'Mettre disponible'}
                  style={{
                    width: 50, height: 28, borderRadius: 14, border: 'none',
                    background: avail
                      ? 'linear-gradient(90deg, #00b85a, #00e676)'
                      : 'linear-gradient(90deg, #cc1133, #ff3366)',
                    cursor: isTog ? 'default' : 'pointer',
                    opacity: isTog ? 0.55 : 1,
                    position: 'relative',
                    transition: 'all 0.25s',
                    boxShadow: `0 0 10px ${col}40`,
                  }}
                >
                  <div style={{
                    position: 'absolute', top: 4,
                    width: 20, height: 20, borderRadius: '50%',
                    background: isTog ? '#ffffff88' : '#fff',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.5)',
                    transition: 'left 0.25s cubic-bezier(0.34,1.56,0.64,1)',
                    left: avail ? 26 : 4,
                  }} />
                </button>
                <span style={{ fontSize: 9, fontFamily: 'Inter, sans-serif', fontWeight: 700, color: col, letterSpacing: '0.08em' }}>
                  {isTog ? '…' : avail ? 'DISPO' : 'INDISPO'}
                </span>
                {/* Actions : réserver + édition prix + photos + inspection */}
                <div style={{ display: 'flex', gap: 5 }}>
                  <button
                    onClick={() => setBookCar(car)}
                    title="Créer une réservation (calendrier)"
                    style={{
                      width: 30, height: 22, borderRadius: 6, border: '1px solid #10b98166',
                      background: 'rgba(16,185,129,0.12)', cursor: 'pointer',
                      fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#10b981', transition: 'all 0.2s',
                    }}
                  >📅</button>
                  <button
                    onClick={() => setEditCar(car)}
                    title="Modifier prix & devise"
                    style={{
                      width: 30, height: 22, borderRadius: 6, border: '1px solid #10b98144',
                      background: 'rgba(16,185,129,0.06)', cursor: 'pointer',
                      fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#10b981', transition: 'all 0.2s',
                    }}
                  >✎</button>
                  <button
                    onClick={() => { photoTarget.current = car.name; carPhotoRef.current?.click(); }}
                    title="Ajouter des photos du véhicule"
                    style={{
                      width: 30, height: 22, borderRadius: 6, border: '1px solid #00e67644',
                      background: 'rgba(0,230,118,0.06)', cursor: 'pointer',
                      fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#00e676', transition: 'all 0.2s',
                    }}
                  >{photoBusy === car.name ? '…' : '🖼️'}</button>
                  <button
                    onClick={() => setInspect({ kind: 'vehicle', name: car.name })}
                    title="Photo inspection avant/après"
                    style={{
                      width: 30, height: 22, borderRadius: 6, border: '1px solid #ffb34744',
                      background: 'rgba(255,179,71,0.06)', cursor: 'pointer',
                      fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#ffb347aa', transition: 'all 0.2s',
                    }}
                  >📷</button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      )}

      {/* Footer refresh */}
      {tab === 'cars' && (
      <div style={{ padding: '6px 14px 8px', borderTop: '1px solid #ffffff08', flexShrink: 0 }}>
        <button onClick={() => void load()} style={refreshBtn}>↻ ACTUALISER LE PARC</button>
      </div>
      )}

      {/* Input caché — ajout multi-photos véhicule (PARC) */}
      <input ref={carPhotoRef} type="file" accept="image/*" multiple style={{ display: 'none' }}
        onChange={e => { const arr = Array.from(e.target.files ?? []); e.target.value = ''; void onCarPhotos(arr); }} />

      {/* Inspection modal (véhicule + bien) */}
      {inspect && (
        <InspectionModal
          kind={inspect.kind}
          subject={inspect.name}
          sessionId={sessionId.current}
          onClose={() => setInspect(null)}
        />
      )}

      {/* Édition prix / devise par voiture */}
      {editCar && (
        <CarEditModal
          car={editCar}
          isHouari={isHouari}
          onClose={() => setEditCar(null)}
          onSaved={(updated) => { setCars(cs => cs.map(c => c.id === updated.id ? updated : c)); setEditCar(null); setMsg('✅ Prix mis à jour'); setTimeout(() => setMsg(''), 2000); }}
        />
      )}

      {bookCar && (
        <BookingCalendarModal
          car={bookCar}
          isHouari={isHouari}
          onClose={() => setBookCar(null)}
          onCreated={(n) => { setBookCar(null); setMsg(`✅ ${n} réservation(s) créée(s)`); setTimeout(() => setMsg(''), 2800); void load(); }}
        />
      )}
    </div>
  );
}

// ── Création de réservation(s) via calendrier (1 ou plusieurs clients) ─────────
interface BkEntry { client: string; phone: string; start: string; end: string }
function BookingCalendarModal({ car, isHouari, onClose, onCreated }: {
  car: Car; isHouari: boolean; onClose: () => void; onCreated: (n: number) => void;
}) {
  const cur = isHouari ? 'DA' : '€';
  const defPrice = isHouari ? (car.houari_resale_price ?? null) : (car.resale_price ?? null);
  const ownerPrice = isHouari ? null : (car.base_price ?? null);
  const [month, setMonth] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  const [booked, setBooked] = useState<Set<string>>(new Set());
  const [entries, setEntries] = useState<BkEntry[]>([]);
  const [client, setClient] = useState(''); const [phone, setPhone] = useState('');
  const [price, setPrice] = useState(defPrice != null ? String(defPrice) : '');
  const [selStart, setSelStart] = useState<string | null>(null);
  const [selEnd, setSelEnd] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  // Charger les dates déjà réservées de cette voiture
  useEffect(() => {
    business.fetchBookings().then(r => {
      const s = new Set<string>();
      (r.bookings ?? []).forEach(b => {
        const cid = (b as unknown as { car_id?: string }).car_id;
        if (cid !== car.id) return;
        if (['cancelled', 'rejected', 'REJECTED', 'CANCELLED'].includes(b.status)) return;
        eachDay(b.start_date, b.end_date).forEach(d => s.add(d));
      });
      setBooked(s);
    }).catch(() => {});
  }, [car.id]);

  const iso = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const reservedSet = new Set<string>([...booked, ...entries.flatMap(e => eachDay(e.start, e.end))]);

  const onDay = (d: string) => {
    if (reservedSet.has(d)) return;
    if (!selStart || (selStart && selEnd)) { setSelStart(d); setSelEnd(null); return; }
    if (d < selStart) { setSelStart(d); return; }
    // vérifie qu'aucune date réservée dans l'intervalle
    const range = eachDay(selStart, d);
    if (range.some(x => reservedSet.has(x))) { setErr('Intervalle chevauche une date déjà prise'); setTimeout(() => setErr(''), 2500); return; }
    setSelEnd(d);
  };

  const addEntry = () => {
    if (!client.trim() || !selStart || !selEnd) { setErr('Nom + dates requis'); setTimeout(() => setErr(''), 2000); return; }
    setEntries(e => [...e, { client: client.trim(), phone: phone.trim(), start: selStart, end: selEnd }]);
    setClient(''); setPhone(''); setSelStart(null); setSelEnd(null);
  };

  const createAll = async () => {
    const list = [...entries];
    if (client.trim() && selStart && selEnd) list.push({ client: client.trim(), phone: phone.trim(), start: selStart, end: selEnd });
    if (!list.length) { setErr('Ajoute au moins un client + dates'); setTimeout(() => setErr(''), 2000); return; }
    const ppd = price ? Number(price) : (defPrice ?? 0);
    setSaving(true);
    let ok = 0;
    for (const e of list) {
      const nb = Math.max(1, eachDay(e.start, e.end).length);
      try {
        await business.createBooking({
          client_name: e.client, client_phone: (e.phone && e.phone.replace(/\D/g, '').length >= 6) ? e.phone : '000000',
          car_id: car.id, start_date: e.start, end_date: e.end, nb_days: nb,
          client_price_per_day: ppd || null,
          owner_price_per_day: ownerPrice,
          final_price: Math.round(ppd * nb * 100) / 100,
          currency: isHouari ? 'DZD' : 'EUR',
          rented_by: isHouari ? 'Houari' : 'Kouider',
          initial_status: 'CONFIRMED',
        });
        ok++;
      } catch { /* skip */ }
    }
    setSaving(false);
    onCreated(ok);
  };

  const totalClients = entries.length + (client.trim() && selStart && selEnd ? 1 : 0);
  const first = new Date(month.y, month.m, 1);
  const startWeekday = (first.getDay() + 6) % 7; // lundi=0
  const daysInMonth = new Date(month.y, month.m + 1, 0).getDate();
  const todayIso = new Date().toISOString().slice(0, 10);
  const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
  const E = '#10b981';

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'flex-end' }}>
      <div style={{ width: '100%', maxHeight: '94%', overflowY: 'auto', background: '#15151b', borderRadius: '20px 20px 0 0', border: '1px solid rgba(255,255,255,0.08)', padding: '16px 16px 22px', fontFamily: 'Inter, sans-serif' }}>
        <div style={{ width: 38, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.15)', margin: '0 auto 14px' }} />
        <div style={{ fontSize: 17, fontWeight: 800, color: '#fff' }}>Réserver — {car.name}</div>
        <div style={{ fontSize: 12, color: '#9b9ba6', marginBottom: 12 }}>1 ou plusieurs clients · dates indispo en rouge</div>

        {/* Calendrier */}
        <div style={{ background: '#1d1d25', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: 12, marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <button onClick={() => setMonth(s => s.m === 0 ? { y: s.y - 1, m: 11 } : { y: s.y, m: s.m - 1 })} style={calNav}>‹</button>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{MONTHS[month.m]} {month.y}</span>
            <button onClick={() => setMonth(s => s.m === 11 ? { y: s.y + 1, m: 0 } : { y: s.y, m: s.m + 1 })} style={calNav}>›</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 3, marginBottom: 4 }}>
            {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => <div key={i} style={{ textAlign: 'center', fontSize: 9, color: '#6b7280' }}>{d}</div>)}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 3 }}>
            {Array.from({ length: startWeekday }).map((_, i) => <div key={`e${i}`} />)}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1; const d = iso(month.y, month.m, day);
              const past = d < todayIso;
              const isBooked = reservedSet.has(d);
              const inSel = selStart && (d === selStart || (selEnd && d >= selStart && d <= selEnd) || (!selEnd && d === selStart));
              const disabled = past || isBooked;
              const bg = isBooked ? 'rgba(225,29,72,0.18)' : inSel ? E : past ? 'transparent' : 'rgba(255,255,255,0.04)';
              const fg = isBooked ? '#fb7185' : inSel ? '#04140d' : past ? '#3a3a40' : '#e5e7eb';
              return (
                <button key={day} onClick={() => !disabled && onDay(d)} disabled={disabled}
                  style={{ aspectRatio: '1', borderRadius: 8, border: 'none', background: bg, color: fg, fontSize: 12, fontWeight: inSel ? 700 : 500, cursor: disabled ? 'default' : 'pointer', fontFamily: 'Inter, sans-serif' }}>
                  {day}
                </button>
              );
            })}
          </div>
          <div style={{ fontSize: 11, color: '#9b9ba6', marginTop: 8, textAlign: 'center' }}>
            {selStart && !selEnd ? `Début ${selStart.slice(8)}/${selStart.slice(5, 7)} — choisis la fin` : selStart && selEnd ? `${selStart.slice(8)}/${selStart.slice(5, 7)} → ${selEnd.slice(8)}/${selEnd.slice(5, 7)} (${eachDay(selStart, selEnd).length}j)` : 'Choisis la date de début'}
          </div>
        </div>

        {/* Client */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <input value={client} onChange={e => setClient(e.target.value)} placeholder="Nom du client" style={{ ...bkInp, flex: 1 }} />
          <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Téléphone" inputMode="tel" style={{ ...bkInp, flex: 1 }} />
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'center' }}>
          <input value={price} onChange={e => setPrice(e.target.value)} type="number" placeholder={`Prix/jour (${cur})`} style={{ ...bkInp, flex: 1 }} />
          <button onClick={addEntry} style={{ flex: '0 0 auto', padding: '11px 14px', borderRadius: 11, border: `1px solid ${E}66`, background: `${E}1a`, color: E, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>+ Client</button>
        </div>

        {/* Clients ajoutés */}
        {entries.length > 0 && (
          <div style={{ marginBottom: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {entries.map((e, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#1d1d25', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '8px 11px' }}>
                <span style={{ flex: 1, fontSize: 13, color: '#fff' }}>{e.client}</span>
                <span style={{ fontSize: 11, color: '#9b9ba6' }}>{e.start.slice(5)} → {e.end.slice(5)}</span>
                <button onClick={() => setEntries(x => x.filter((_, j) => j !== i))} style={{ border: 'none', background: 'none', color: '#fb7185', fontSize: 14, cursor: 'pointer' }}>✕</button>
              </div>
            ))}
          </div>
        )}

        {err && <div style={{ fontSize: 12, color: '#fb7185', marginBottom: 8, textAlign: 'center' }}>{err}</div>}

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: 13, borderRadius: 13, border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: '#9b9ba6', fontSize: 14, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>Annuler</button>
          <button onClick={() => void createAll()} disabled={saving || totalClients === 0} style={{ flex: 2, padding: 13, borderRadius: 13, border: 'none', background: `linear-gradient(135deg, ${E}, #34d399)`, color: '#04140d', fontSize: 14, fontWeight: 800, cursor: 'pointer', opacity: saving || totalClients === 0 ? 0.5 : 1, fontFamily: 'Inter, sans-serif' }}>
            {saving ? 'Création…' : `Créer ${totalClients || ''} résa${totalClients > 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// liste des jours (ISO) entre start et end inclus
function eachDay(start: string, end: string): string[] {
  const out: string[] = [];
  const s = new Date(start + 'T00:00:00'); const e = new Date(end + 'T00:00:00');
  for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) out.push(d.toISOString().slice(0, 10));
  return out;
}
const calNav: CSSProperties = { width: 30, height: 30, borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: '#10b981', fontSize: 16, cursor: 'pointer' };
const bkInp: CSSProperties = { padding: '11px 12px', borderRadius: 11, border: '1px solid rgba(255,255,255,0.1)', background: '#1d1d25', color: '#fff', fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'Inter, sans-serif' };

// ── Édition prix voiture (Kouider €, Houari DZD) ──────────────────────────────
function CarEditModal({ car, isHouari, onClose, onSaved }: {
  car: Car; isHouari: boolean; onClose: () => void; onSaved: (c: Car) => void;
}) {
  const cur = isHouari ? 'DA' : '€';
  const initOwner  = isHouari ? car.houari_base_price   : car.base_price;
  const initClient = isHouari ? car.houari_resale_price : car.resale_price;
  const [owner, setOwner]   = useState(initOwner  != null ? String(initOwner)  : '');
  const [client, setClient] = useState(initClient != null ? String(initClient) : '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const save = async () => {
    setSaving(true); setErr('');
    const o = owner  ? Number(owner)  : null;
    const c = client ? Number(client) : null;
    // Houari = propriétaire → pas de prix proprio, juste le prix client (DZD).
    const payload: Record<string, unknown> = isHouari
      ? { houari_resale_price: c }
      : { base_price: o, resale_price: c };
    try {
      const r = await business.updateCar(car.id, payload);
      onSaved(r.car ?? { ...car, ...payload });
    } catch { setErr('Échec. Réessaie.'); setSaving(false); }
  };

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 50, background: 'rgba(0,5,15,0.92)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 14 }}>
      <div style={{ width: '90%', maxWidth: 300, background: 'linear-gradient(135deg, #161618, #101012)', border: '1px solid #10b98133', borderRadius: 16, padding: 18 }}>
        <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: '#10b981', letterSpacing: '0.15em', textAlign: 'center' }}>MODIFIER PRIX</div>
        <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 9, color: '#ffffff66', textAlign: 'center', marginBottom: 4 }}>{car.name.toUpperCase()}</div>
        <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 8, color: isHouari ? '#10b981' : '#00e676', textAlign: 'center', marginBottom: 14 }}>
          {isHouari ? '💱 Tarifs HOUARI — en dinars (DA)' : '💶 Tarifs KOUIDER — en euros (€)'}
        </div>

        {!isHouari && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 7, color: '#ffffff55', letterSpacing: '0.1em', marginBottom: 5 }}>PRIX PROPRIO /JOUR ({cur})</div>
            <input value={owner} onChange={e => setOwner(e.target.value)} type="number" inputMode="numeric" placeholder="ex: 35" style={editInp} />
          </div>
        )}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 7, color: '#ffffff55', letterSpacing: '0.1em', marginBottom: 5 }}>PRIX {isHouari ? 'DE LOCATION' : 'CLIENT'} /JOUR ({cur})</div>
          <input value={client} onChange={e => setClient(e.target.value)} type="number" inputMode="numeric" placeholder={isHouari ? 'ex: 7000' : 'ex: 45'}
            style={editInp} />
        </div>
        {!isHouari && owner && client && Number(client) >= Number(owner) && (
          <div style={{ fontSize: 9, color: '#ffb347', textAlign: 'center', marginBottom: 10 }}>Marge : {Math.round((Number(client) - Number(owner)) * 100) / 100} {cur}/j</div>
        )}
        {err && <div style={{ fontSize: 9, color: '#ff6b8a', textAlign: 'center', marginBottom: 8 }}>{err}</div>}

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onClose} style={{ flex: 1, padding: 11, borderRadius: 10, border: '1px solid #ffffff18', background: 'transparent', color: '#ffffff66', fontFamily: 'Inter, sans-serif', fontSize: 8, cursor: 'pointer' }}>ANNULER</button>
          <button onClick={() => void save()} disabled={saving} style={{ flex: 2, padding: 11, borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #10b981, #34d399)', color: '#ffffff', fontFamily: 'Inter, sans-serif', fontSize: 8, fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.5 : 1 }}>{saving ? '…' : 'ENREGISTRER'}</button>
        </div>
      </div>
    </div>
  );
}

const editInp: CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 9, border: '1px solid #ffffff1e',
  background: 'rgba(255,255,255,0.04)', color: '#fff', fontFamily: 'Inter, sans-serif', fontSize: 13,
  outline: 'none', boxSizing: 'border-box',
};

// ── IMMO PANE ────────────────────────────────────────────────────────────────
const IMMO_ST: Record<string, { label: string; col: string }> = {
  disponible: { label: 'DISPO', col: '#00e676' }, libre: { label: 'DISPO', col: '#00e676' },
  loue: { label: 'LOUÉ', col: '#ffb347' }, vendu: { label: 'VENDU', col: '#ff5fa2' },
  coming_soon: { label: 'BIENTÔT', col: '#10b981' },
};
const paneInput: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', background: 'rgba(16,185,129,0.04)',
  border: '1px solid #10b9811a', borderRadius: 7, padding: '6px 8px',
  fontFamily: 'Inter, sans-serif', fontSize: 10, color: '#c8e8ff', outline: 'none',
};

function ImmoPane({ onMsg, onInspect }: { onMsg: (m: string) => void; onInspect: (name: string) => void }) {
  const [items, setItems] = useState<SiteProperty[]>([]);
  const [loading, setLoad] = useState(true);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [f, setF] = useState({ title: '', transaction: 'location', city: 'Oran', district: '', address: '', price: '', currency: 'DZD', type: 'appartement', rooms: '' });

  const load = async () => { setLoad(true); try { const r = await business.fetchProperties(); setItems(r.properties ?? []); } catch { setItems([]); } finally { setLoad(false); } };
  useEffect(() => { void load(); }, []);

  const add = async () => {
    if (!f.title.trim() || !f.price) { onMsg('❌ Titre + prix requis'); return; }
    setBusy('add');
    try {
      await business.createProperty({
        title: f.title.trim(), name: f.title.trim(), transaction: f.transaction,
        city: f.city.trim() || 'Oran', district: f.district.trim() || null, address: f.address.trim() || null,
        price: Number(f.price), currency: f.currency, price_type: f.transaction === 'location' ? 'mois' : 'total',
        type: f.type, rooms: f.rooms ? Number(f.rooms) : null, status: 'disponible',
      });
      onMsg('✅ Bien ajouté au site'); setShow(false);
      setF({ title: '', transaction: 'location', city: 'Oran', district: '', address: '', price: '', currency: 'DZD', type: 'appartement', rooms: '' });
      void load();
    } catch { onMsg('❌ Échec ajout'); } finally { setBusy(null); }
  };

  const cycle = async (p: SiteProperty) => {
    const order = p.transaction === 'vente' ? ['disponible', 'vendu', 'coming_soon'] : ['disponible', 'loue', 'coming_soon'];
    const cur = (p.status || 'disponible').toLowerCase();
    const next = order[(order.indexOf(cur) + 1) % order.length];
    setBusy(p.id);
    try { await business.updateProperty(p.id, { status: next }); setItems(xs => xs.map(x => x.id === p.id ? { ...x, status: next } : x)); }
    catch { onMsg('❌ Échec MAJ'); } finally { setBusy(null); }
  };

  const del = async (p: SiteProperty) => {
    if (!confirm(`Supprimer "${p.title || p.name}" du site ?`)) return;
    setBusy(p.id);
    try { await business.deleteProperty(p.id); setItems(xs => xs.filter(x => x.id !== p.id)); onMsg('🗑 Supprimé'); }
    catch { onMsg('❌ Échec'); } finally { setBusy(null); }
  };

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <button onClick={() => setShow(s => !s)} style={{ ...paneInput, cursor: 'pointer', textAlign: 'center', color: '#b388ff', border: '1px solid #b388ff44', background: 'rgba(179,136,255,0.08)', fontFamily: 'Inter, sans-serif', fontSize: 8, letterSpacing: '0.15em' }}>
        {show ? '✕ FERMER' : '+ AJOUTER UN BIEN'}
      </button>
      {show && (
        <div style={{ background: 'rgba(179,136,255,0.05)', border: '1px solid #b388ff22', borderRadius: 10, padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', gap: 5 }}>
            {(['location', 'vente'] as const).map(t => (
              <button key={t} onClick={() => setF(s => ({ ...s, transaction: t }))} style={{ flex: 1, padding: '6px', borderRadius: 6, fontFamily: 'Inter, sans-serif', fontSize: 7, cursor: 'pointer', background: f.transaction === t ? '#b388ff22' : 'transparent', border: `1px solid ${f.transaction === t ? '#b388ff' : '#ffffff22'}`, color: f.transaction === t ? '#b388ff' : '#ffffff44' }}>{t === 'location' ? 'À LOUER' : 'À VENDRE'}</button>
            ))}
          </div>
          <input value={f.title} onChange={e => setF(s => ({ ...s, title: e.target.value }))} placeholder="Titre (ex: F3 Hay Badr)" style={paneInput} />
          <div style={{ display: 'flex', gap: 5 }}>
            <input value={f.city} onChange={e => setF(s => ({ ...s, city: e.target.value }))} placeholder="Ville" style={paneInput} />
            <input value={f.district} onChange={e => setF(s => ({ ...s, district: e.target.value }))} placeholder="Quartier" style={paneInput} />
          </div>
          <input value={f.address} onChange={e => setF(s => ({ ...s, address: e.target.value }))} placeholder="Adresse précise (pour la carte Google Maps)" style={paneInput} />
          <div style={{ display: 'flex', gap: 5 }}>
            <input value={f.price} onChange={e => setF(s => ({ ...s, price: e.target.value }))} type="number" placeholder={f.transaction === 'location' ? 'Loyer/mois' : 'Prix vente'} style={paneInput} />
            <select value={f.currency} onChange={e => setF(s => ({ ...s, currency: e.target.value }))} style={{ ...paneInput, flex: '0 0 70px' }}><option>DZD</option><option>EUR</option></select>
          </div>
          <div style={{ display: 'flex', gap: 5 }}>
            <select value={f.type} onChange={e => setF(s => ({ ...s, type: e.target.value }))} style={paneInput}>
              {['appartement', 'villa', 'maison', 'studio', 'local', 'terrain'].map(o => <option key={o}>{o}</option>)}
            </select>
            <input value={f.rooms} onChange={e => setF(s => ({ ...s, rooms: e.target.value }))} type="number" placeholder="Pièces" style={paneInput} />
          </div>
          <button onClick={() => void add()} disabled={busy === 'add'} style={{ ...paneInput, cursor: 'pointer', textAlign: 'center', color: '#00e676', border: '1px solid #00e67644', background: 'rgba(0,230,118,0.1)', fontFamily: 'Inter, sans-serif', fontSize: 8, letterSpacing: '0.15em' }}>{busy === 'add' ? '…' : '✅ AJOUTER AU SITE'}</button>
        </div>
      )}
      {loading ? <HudLoader /> : items.length === 0 ? <HudEmpty text="Aucun bien — ajoute le premier" /> : items.map(p => {
        const st = IMMO_ST[(p.status || 'disponible').toLowerCase()] ?? { label: (p.status || '').toUpperCase(), col: '#888' };
        const cur = p.currency === 'DZD' ? 'DA' : (p.currency || '€');
        return (
          <div key={p.id} style={{ borderRadius: 10, border: `1px solid ${st.col}33`, background: `linear-gradient(135deg, ${st.col}08, rgba(10,10,12,0.6))`, padding: '9px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 14 }}>🏠</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, color: '#e8f4ff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title || p.name}</div>
                <div style={{ fontSize: 8, color: '#ffffff44', marginTop: 1 }}>
                  {p.transaction === 'vente' ? 'À vendre' : 'À louer'} · {[p.district, p.city].filter(Boolean).join(', ')}{p.rooms ? ` · ${p.rooms}p` : ''}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 10, color: '#fff' }}>{p.price != null ? `${Number(p.price).toLocaleString('fr-FR')} ${cur}` : '—'}</div>
                <div style={{ fontSize: 7, color: st.col, marginTop: 1 }}>{st.label}</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 5, marginTop: 8 }}>
              <button onClick={() => void cycle(p)} disabled={busy === p.id} style={{ flex: 1, padding: '6px', borderRadius: 6, fontFamily: 'Inter, sans-serif', fontSize: 7, cursor: 'pointer', background: 'rgba(255,179,71,0.1)', border: '1px solid #ffb34744', color: '#ffb347' }}>🔄 STATUT</button>
              <button onClick={() => onInspect(p.title || p.name || 'Bien')} title="État des lieux entrée/sortie" style={{ flex: '0 0 44px', padding: '6px', borderRadius: 6, fontFamily: 'Inter, sans-serif', fontSize: 9, cursor: 'pointer', background: 'rgba(16,185,129,0.1)', border: '1px solid #10b98144', color: '#10b981' }}>📷</button>
              <button onClick={() => void del(p)} disabled={busy === p.id} style={{ flex: '0 0 44px', padding: '6px', borderRadius: 6, fontFamily: 'Inter, sans-serif', fontSize: 7, cursor: 'pointer', background: 'rgba(255,51,102,0.1)', border: '1px solid #ff336644', color: '#ff3366' }}>🗑</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── VENTE PANE ───────────────────────────────────────────────────────────────
const VENTE_ST: Record<string, { label: string; col: string }> = {
  disponible: { label: 'À VENDRE', col: '#00e676' }, reserve: { label: 'RÉSERVÉE', col: '#ffb347' }, vendu: { label: 'VENDUE', col: '#ff5fa2' },
};

function VentePane({ onMsg }: { onMsg: (m: string) => void }) {
  const [items, setItems] = useState<SaleVehicle[]>([]);
  const [loading, setLoad] = useState(true);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [f, setF] = useState({ brand: '', model: '', year: '', price: '', currency: 'DZD', mileage: '' });

  const load = async () => { setLoad(true); try { const r = await business.fetchVehiclesForSale(); setItems(r.vehicles ?? []); } catch { setItems([]); } finally { setLoad(false); } };
  useEffect(() => { void load(); }, []);

  const add = async () => {
    if (!f.brand.trim() || !f.model.trim() || !f.price) { onMsg('❌ Marque + modèle + prix requis'); return; }
    setBusy('add');
    try {
      await business.addVehicleForSale({ brand: f.brand.trim(), model: f.model.trim(), year: f.year ? Number(f.year) : null, price: Number(f.price), currency: f.currency, mileage: f.mileage ? Number(f.mileage) : null, status: 'disponible' });
      onMsg('✅ Voiture ajoutée au site'); setShow(false);
      setF({ brand: '', model: '', year: '', price: '', currency: 'DZD', mileage: '' });
      void load();
    } catch { onMsg('❌ Échec ajout'); } finally { setBusy(null); }
  };

  const cycle = async (v: SaleVehicle) => {
    const order = ['disponible', 'reserve', 'vendu'];
    const next = order[(order.indexOf((v.status || 'disponible').toLowerCase()) + 1) % order.length];
    setBusy(v.id);
    try { await business.updateVehicleSale(v.id, { status: next }); setItems(xs => xs.map(x => x.id === v.id ? { ...x, status: next } : x)); }
    catch { onMsg('❌ Échec MAJ'); } finally { setBusy(null); }
  };

  const addPhotos = async (id: string, files: FileList) => {
    setBusy(id);
    try {
      const photos = await Promise.all(Array.from(files).slice(0, 10).map(fl => new Promise<string>((res, rej) => {
        const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(new Error('read')); r.readAsDataURL(fl);
      })));
      const out = await business.addVehicleSalePhotos(id, photos);
      onMsg(`✅ ${out.count} photo(s) — visible sur le site`); void load();
    } catch { onMsg('❌ Échec photos'); } finally { setBusy(null); }
  };

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <button onClick={() => setShow(s => !s)} style={{ ...paneInput, cursor: 'pointer', textAlign: 'center', color: '#ffb347', border: '1px solid #ffb34744', background: 'rgba(255,179,71,0.08)', fontFamily: 'Inter, sans-serif', fontSize: 8, letterSpacing: '0.15em' }}>
        {show ? '✕ FERMER' : '+ AJOUTER UNE VOITURE À VENDRE'}
      </button>
      {show && (
        <div style={{ background: 'rgba(255,179,71,0.05)', border: '1px solid #ffb34722', borderRadius: 10, padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', gap: 5 }}>
            <input value={f.brand} onChange={e => setF(s => ({ ...s, brand: e.target.value }))} placeholder="Marque (Audi)" style={paneInput} />
            <input value={f.model} onChange={e => setF(s => ({ ...s, model: e.target.value }))} placeholder="Modèle (Q3)" style={paneInput} />
          </div>
          <div style={{ display: 'flex', gap: 5 }}>
            <input value={f.year} onChange={e => setF(s => ({ ...s, year: e.target.value }))} type="number" placeholder="Année" style={paneInput} />
            <input value={f.mileage} onChange={e => setF(s => ({ ...s, mileage: e.target.value }))} type="number" placeholder="Km" style={paneInput} />
          </div>
          <div style={{ display: 'flex', gap: 5 }}>
            <input value={f.price} onChange={e => setF(s => ({ ...s, price: e.target.value }))} type="number" placeholder="Prix vente" style={paneInput} />
            <select value={f.currency} onChange={e => setF(s => ({ ...s, currency: e.target.value }))} style={{ ...paneInput, flex: '0 0 70px' }}><option>DZD</option><option>EUR</option></select>
          </div>
          <button onClick={() => void add()} disabled={busy === 'add'} style={{ ...paneInput, cursor: 'pointer', textAlign: 'center', color: '#00e676', border: '1px solid #00e67644', background: 'rgba(0,230,118,0.1)', fontFamily: 'Inter, sans-serif', fontSize: 8, letterSpacing: '0.15em' }}>{busy === 'add' ? '…' : '✅ AJOUTER AU SITE'}</button>
        </div>
      )}
      {loading ? <HudLoader /> : items.length === 0 ? <HudEmpty text="Aucune voiture à vendre — ajoute la première" /> : items.map(v => {
        const st = VENTE_ST[(v.status || 'disponible').toLowerCase()] ?? { label: (v.status || '').toUpperCase(), col: '#888' };
        const cur = v.currency === 'DZD' ? 'DA' : (v.currency || '€');
        return (
          <div key={v.id} style={{ borderRadius: 10, border: `1px solid ${st.col}33`, background: `linear-gradient(135deg, ${st.col}08, rgba(10,10,12,0.6))`, padding: '9px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 14 }}>🚗</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, color: '#e8f4ff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.brand} {v.model}</div>
                <div style={{ fontSize: 8, color: '#ffffff44', marginTop: 1 }}>{[v.year, v.mileage ? `${Number(v.mileage).toLocaleString('fr-FR')} km` : null].filter(Boolean).join(' · ') || '—'}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 10, color: '#fff' }}>{v.price != null ? `${Number(v.price).toLocaleString('fr-FR')} ${cur}` : '—'}</div>
                <div style={{ fontSize: 7, color: st.col, marginTop: 1 }}>{st.label}</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <button onClick={() => void cycle(v)} disabled={busy === v.id} style={{ flex: 1, padding: '6px', borderRadius: 6, fontFamily: 'Inter, sans-serif', fontSize: 7, cursor: 'pointer', background: 'rgba(255,179,71,0.1)', border: '1px solid #ffb34744', color: '#ffb347' }}>🔄 STATUT</button>
              <label style={{ flex: 1, padding: '6px', borderRadius: 6, fontFamily: 'Inter, sans-serif', fontSize: 7, cursor: busy === v.id ? 'wait' : 'pointer', background: 'rgba(0,212,255,0.1)', border: '1px solid #00d4ff44', color: '#00d4ff', textAlign: 'center' }}>
                📷 PHOTOS
                <input type="file" accept="image/*" multiple disabled={busy === v.id} style={{ display: 'none' }} onChange={e => { if (e.target.files?.length) void addPhotos(v.id, e.target.files); e.currentTarget.value = ''; }} />
              </label>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function HudLoader() {
  return (
    <div style={{ textAlign: 'center', padding: 30, fontSize: 9, color: '#10b98133', fontFamily: 'Inter, sans-serif', letterSpacing: '0.25em' }}>
      CHARGEMENT…
    </div>
  );
}

function HudEmpty({ text }: { text: string }) {
  return <div style={{ textAlign: 'center', padding: 30, fontSize: 9, color: '#ffffff1a', letterSpacing: '0.1em' }}>{text}</div>;
}

const refreshBtn: React.CSSProperties = {
  background: 'transparent', border: '1px solid #10b98122', borderRadius: 6,
  padding: '5px 12px', fontFamily: 'Inter, sans-serif', fontSize: 7,
  color: '#10b98155', cursor: 'pointer', letterSpacing: '0.2em', width: '100%',
};

function CarPhoto({ url, name, col }: { url: string | null; name: string; col: string }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  if (!url || failed) {
    return <CarPlaceholder col={col} />;
  }
  return (
    <>
      {!loaded && <CarPlaceholder col={col} />}
      <img
        src={url} alt={name}
        style={{
          width: '100%', height: '100%',
          objectFit: 'contain',
          objectPosition: 'center center',
          display: loaded ? 'block' : 'none',
        }}
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
      />
    </>
  );
}

function CarPlaceholder({ col }: { col: string }) {
  return (
    <svg width="40" height="28" viewBox="0 0 40 28" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="12" width="36" height="10" rx="3" fill={col} fillOpacity="0.12" stroke={col} strokeWidth="0.8" strokeOpacity="0.5"/>
      <path d="M 10 12 L 14 5 L 26 5 L 30 12" fill={col} fillOpacity="0.1" stroke={col} strokeWidth="0.8" strokeOpacity="0.4"/>
      <rect x="14.5" y="6.5" width="4.5" height="5" rx="1" fill={col} fillOpacity="0.25"/>
      <rect x="21" y="6.5" width="4.5" height="5" rx="1" fill={col} fillOpacity="0.25"/>
      <circle cx="10" cy="22" r="3.5" fill="none" stroke={col} strokeWidth="1" strokeOpacity="0.6"/>
      <circle cx="10" cy="22" r="1.5" fill={col} fillOpacity="0.3"/>
      <circle cx="30" cy="22" r="3.5" fill="none" stroke={col} strokeWidth="1" strokeOpacity="0.6"/>
      <circle cx="30" cy="22" r="1.5" fill={col} fillOpacity="0.3"/>
      <rect x="36" y="14" width="2" height="3" rx="1" fill={col} fillOpacity="0.7"/>
    </svg>
  );
}

// ── INSPECTION MODAL (véhicule + bien) ───────────────────────────────────────
const SEV_COL: Record<string, string> = { grave: '#ff3366', moyen: '#ffb347', leger: '#ffd54f', aucun: '#7a8aa0' };

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onloadend = () => res(r.result as string);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

export function InspectionModal({ kind, subject, sessionId, onClose }: {
  kind: 'vehicle' | 'property'; subject: string; sessionId: string; onClose: () => void;
}) {
  const [mode, setMode]     = useState<'before' | 'after'>('before');
  const [client, setClient] = useState('');
  const [busy, setBusy]     = useState(false);
  const [result, setResult] = useState<InspectionResult | null>(null);
  const [err, setErr]       = useState('');
  const [shots, setShots]   = useState<string[]>([]);   // data URLs des photos choisies
  const fileRef = useRef<HTMLInputElement>(null);

  const title = kind === 'vehicle' ? 'INSPECTION VÉHICULE' : 'ÉTAT DES LIEUX';

  const addFiles = async (files: File[]) => {
    if (!files.length) return;
    try {
      const urls = await Promise.all(files.slice(0, 8).map(fileToDataUrl));
      setShots(s => [...s, ...urls].slice(0, 8));
    } catch {
      setErr('Lecture photo impossible. Réessaie.');
    }
  };

  const submit = async () => {
    if (!shots.length || !client.trim()) return;
    setBusy(true); setErr('');
    try {
      const images = shots.map(u => u.split(',')[1] ?? '');
      const r = await business.inspect(kind, {
        mode, client_name: client.trim(), subject,
        images, mime: 'image/jpeg', session_id: sessionId,
      });
      if (r.success) setResult(r);
      else setErr(r.message || 'Échec de l\'analyse');
    } catch {
      setErr('Erreur réseau. Réessaie.');
    } finally { setBusy(false); }
  };

  const boxes: DamageBox[] = result?.analysis?.damageBoxes ?? [];
  const photos: string[]   = result?.photos ?? (result?.photoUrl ? [result.photoUrl] : []);

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 50, background: 'rgba(0,5,15,0.94)', backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }}>
      <div style={{ background: 'linear-gradient(135deg, #161618, #101012)', border: '1px solid #ffb34733', borderRadius: 18, padding: 18, width: '92%', maxWidth: 320, maxHeight: '92%', overflowY: 'auto', boxShadow: '0 0 40px rgba(255,179,71,0.12)' }}>
        <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: '#ffb347', letterSpacing: '0.2em', textAlign: 'center' }}>{title}</div>
        <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 9, color: '#ffffff66', letterSpacing: '0.1em', marginBottom: 14, textAlign: 'center' }}>{subject.toUpperCase()}</div>

        {result ? (
          <>
            {result.analysis?.accident && (
              <div style={{ background: 'rgba(255,51,102,0.15)', border: '1px solid #ff336655', borderRadius: 8, padding: '6px 8px', marginBottom: 8, color: '#ff6b8a', fontFamily: 'Inter, sans-serif', fontSize: 9, letterSpacing: '0.1em', textAlign: 'center' }}>🚨 ACCIDENT / CHOC DÉTECTÉ</div>
            )}

            {/* Chaque photo + ses marqueurs (numéros globaux) */}
            {photos.map((url, pi) => (
              <div key={pi} style={{ position: 'relative', width: '100%', borderRadius: 10, overflow: 'hidden', marginBottom: 8, border: '1px solid #ffffff14' }}>
                <img src={url} alt={`inspection ${pi + 1}`} style={{ width: '100%', display: 'block' }} />
                {boxes.map((d, gi) => (d.photo_index ?? 0) !== pi ? null : (() => {
                  const col = SEV_COL[d.severity] ?? '#ffb347';
                  return (
                    <div key={gi}>
                      <div style={{ position: 'absolute', left: `${d.box.x * 100}%`, top: `${d.box.y * 100}%`, width: `${d.box.w * 100}%`, height: `${d.box.h * 100}%`, border: `2px solid ${col}`, borderRadius: 4, boxShadow: `0 0 8px ${col}88`, boxSizing: 'border-box' }} />
                      <div style={{ position: 'absolute', left: `${d.box.x * 100}%`, top: `${d.box.y * 100}%`, transform: 'translate(-50%,-50%)', minWidth: 16, height: 16, padding: '0 3px', borderRadius: 8, background: col, color: '#04101f', fontFamily: 'Inter, sans-serif', fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{gi + 1}</div>
                    </div>
                  );
                })())}
                {photos.length > 1 && <div style={{ position: 'absolute', top: 4, left: 4, background: 'rgba(0,0,0,0.6)', color: '#fff', fontFamily: 'Inter, sans-serif', fontSize: 8, padding: '1px 5px', borderRadius: 5 }}>Photo {pi + 1}/{photos.length}</div>}
              </div>
            ))}

            {/* Légende dégâts */}
            {boxes.length > 0 ? (
              <div style={{ marginBottom: 10 }}>
                {boxes.map((d, i) => {
                  const col = SEV_COL[d.severity] ?? '#ffb347';
                  return (
                    <div key={i} style={{ display: 'flex', gap: 7, alignItems: 'flex-start', marginBottom: 5 }}>
                      <span style={{ flex: '0 0 16px', height: 16, borderRadius: 8, background: col, color: '#04101f', fontFamily: 'Inter, sans-serif', fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</span>
                      <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 9, color: '#dfeaff', lineHeight: 1.35 }}>
                        {d.label}{d.is_new ? <b style={{ color: '#ff6b8a' }}> · NOUVEAU</b> : ''}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ color: '#00e676', fontFamily: 'Inter, sans-serif', fontSize: 10, textAlign: 'center', marginBottom: 10 }}>✅ Aucun {kind === 'vehicle' ? 'dégât' : 'défaut'} détecté</div>
            )}

            {/* Rapport texte */}
            <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 8.5, color: '#ffffff88', lineHeight: 1.5, whiteSpace: 'pre-wrap', maxHeight: 120, overflowY: 'auto', borderTop: '1px solid #ffffff10', paddingTop: 8, marginBottom: 12 }}>
              {result.analysis?.comparisonReport || result.analysis?.description || ''}
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { setResult(null); setShots([]); setMode(mode === 'before' ? 'after' : mode); }} style={inspBtn('#10b981')}>+ NOUVELLE</button>
              <button onClick={onClose} style={inspBtn('#ffb347')}>✓ TERMINÉ</button>
            </div>
          </>
        ) : busy ? (
          <div style={{ textAlign: 'center', padding: '18px 0', fontFamily: 'Inter, sans-serif', fontSize: 10, color: '#ffb347', letterSpacing: '0.2em', animation: 'statusPulse 1s ease infinite' }}>ANALYSE CLAUDE EN COURS…<br /><span style={{ fontSize: 8, color: '#ffffff55' }}>{shots.length} photo{shots.length > 1 ? 's' : ''}</span></div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              {(['before', 'after'] as const).map(m => (
                <button key={m} onClick={() => setMode(m)} style={{ flex: 1, padding: '8px 0', borderRadius: 10, border: `1.5px solid ${mode === m ? '#ffb347' : '#ffffff18'}`, background: mode === m ? 'rgba(255,179,71,0.12)' : 'transparent', color: mode === m ? '#ffb347' : '#ffffff44', fontFamily: 'Inter, sans-serif', fontSize: 8, letterSpacing: '0.15em', cursor: 'pointer' }}>
                  {m === 'before' ? (kind === 'vehicle' ? 'AVANT' : 'ENTRÉE') : (kind === 'vehicle' ? 'APRÈS' : 'SORTIE')}
                </button>
              ))}
            </div>

            <div style={{ marginBottom: 12 }}>
              <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 7, color: '#ffffff44', letterSpacing: '0.1em', marginBottom: 6 }}>{kind === 'vehicle' ? 'NOM CLIENT' : 'NOM LOCATAIRE'}</div>
              <input value={client} onChange={e => setClient(e.target.value)} placeholder="Ex: Benali Mohamed" style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #ffffff18', background: 'rgba(255,255,255,0.04)', color: '#fff', fontFamily: 'Inter, sans-serif', fontSize: 10, outline: 'none', boxSizing: 'border-box' }} />
            </div>

            {/* Miniatures des photos choisies */}
            {shots.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                {shots.map((u, i) => (
                  <div key={i} style={{ position: 'relative', width: 54, height: 54, borderRadius: 8, overflow: 'hidden', border: '1px solid #ffffff22' }}>
                    <img src={u} alt={`p${i}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    <button onClick={() => setShots(s => s.filter((_, j) => j !== i))} style={{ position: 'absolute', top: 2, right: 2, width: 16, height: 16, borderRadius: '50%', border: 'none', background: 'rgba(255,51,102,0.85)', color: '#fff', fontSize: 10, lineHeight: '14px', cursor: 'pointer', padding: 0 }}>✕</button>
                  </div>
                ))}
              </div>
            )}

            {err && <div style={{ color: '#ff6b8a', fontFamily: 'Inter, sans-serif', fontSize: 8.5, marginBottom: 8, lineHeight: 1.4 }}>{err}</div>}

            <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={e => { const arr = Array.from(e.target.files ?? []); e.target.value = ''; void addFiles(arr); }} />
            <button onClick={() => fileRef.current?.click()} style={{ width: '100%', padding: '9px 0', borderRadius: 10, border: '1.5px dashed #ffb34755', background: 'rgba(255,179,71,0.06)', color: '#ffb347', fontFamily: 'Inter, sans-serif', fontSize: 8.5, letterSpacing: '0.15em', cursor: 'pointer', marginBottom: 8 }}>📷 {shots.length ? 'AJOUTER PHOTO' : 'PRENDRE / CHOISIR PHOTOS'}</button>
            <button onClick={() => void submit()} disabled={!client.trim() || !shots.length} style={{ width: '100%', padding: '10px 0', borderRadius: 10, border: '1.5px solid #00e67666', background: (client.trim() && shots.length) ? 'rgba(0,230,118,0.12)' : 'rgba(255,255,255,0.03)', color: (client.trim() && shots.length) ? '#00e676' : '#ffffff33', fontFamily: 'Inter, sans-serif', fontSize: 9, letterSpacing: '0.2em', cursor: (client.trim() && shots.length) ? 'pointer' : 'not-allowed', marginBottom: 8 }}>🔍 ANALYSER {shots.length > 0 ? `(${shots.length})` : ''}</button>
            <button onClick={onClose} style={{ width: '100%', padding: '7px 0', borderRadius: 10, border: '1px solid #ffffff12', background: 'transparent', color: '#ffffff33', fontFamily: 'Inter, sans-serif', fontSize: 8, letterSpacing: '0.1em', cursor: 'pointer' }}>ANNULER</button>
          </>
        )}
      </div>
    </div>
  );
}

function inspBtn(col: string): CSSProperties {
  return { flex: 1, padding: '9px 0', borderRadius: 10, border: `1.5px solid ${col}66`, background: `${col}1a`, color: col, fontFamily: 'Inter, sans-serif', fontSize: 8.5, letterSpacing: '0.12em', cursor: 'pointer' };
}
