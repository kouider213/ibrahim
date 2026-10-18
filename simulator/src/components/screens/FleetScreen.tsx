import { useState, useEffect, useRef, type CSSProperties } from 'react';
import { business, getOrCreateSessionId, type Car, type FleetIntel, type SiteProperty, type SaleVehicle, type InspectionResult, type DamageBox } from '../../services/api.ts';
import { SkeletonCards } from '../ui/Premium.tsx';
import { T, tone, PageHeader, Segmented, Chips, Kpi, Badge, Btn, ActionBtn, Toggle, Sheet, Field, inputStyle, Empty, Toast, SectionTitle } from '../ui/Kit.tsx';
import PhotoGallery, { type GalleryKind } from '../ui/PhotoGallery.tsx';

type ParcTab = 'cars' | 'immo' | 'vente';
type CarFilter = 'all' | 'on' | 'off';

// Les prix viennent UNIQUEMENT de la table cars (base_price = Houari, resale_price = client) :
// plus de grille en dur ici, sinon un prix changé par Dzaryx ne suivrait pas.

type InspectKind = 'vehicle' | 'property';
interface InspectOpen { kind: InspectKind; name: string }

const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString('fr-FR');

export default function FleetScreen({ actor = 'kouider' }: { actor?: string }) {
  const isHouari = actor === 'houari';
  const [tab, setTab]      = useState<ParcTab>('cars');
  const [filter, setFilter] = useState<CarFilter>('all');
  const [intel, setIntel]  = useState<FleetIntel | null>(null);
  const [cars, setCars]    = useState<Car[]>([]);
  const [loading, setLoad] = useState(true);
  const [toggling, setTog] = useState<string | null>(null);
  const [msg, setMsgRaw]   = useState('');
  const [inspect, setInspect] = useState<InspectOpen | null>(null);
  const [editCar, setEditCar] = useState<Car | null>(null);
  const [bookCar, setBookCar] = useState<Car | null>(null);
  const [detail, setDetail] = useState<Car | null>(null);
  const [gallery, setGallery] = useState<{ kind: GalleryKind; id: string; name: string } | null>(null);
  const [counts, setCounts] = useState<{ immo?: number; vente?: number }>({});
  const sessionId = useRef(getOrCreateSessionId());
  const msgTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setMsg = (m: string, ms = 2600) => {
    setMsgRaw(m);
    if (msgTimer.current) clearTimeout(msgTimer.current);
    if (m) msgTimer.current = setTimeout(() => setMsgRaw(''), ms);
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

  useEffect(() => {
    void load();
    // Compteurs des onglets Immo / Vente (sans bloquer l'affichage)
    business.fetchProperties().then(r => setCounts(c => ({ ...c, immo: (r.properties ?? []).length }))).catch(() => {});
    business.fetchVehiclesForSale().then(r => setCounts(c => ({ ...c, vente: (r.vehicles ?? []).length }))).catch(() => {});
  }, []);

  const toggle = async (car: Car) => {
    setTog(car.id);
    const ok = await business.toggleCar(car.id, !car.available).catch(() => false);
    if (ok) {
      setCars(cs => cs.map(c => c.id === car.id ? { ...c, available: !c.available } : c));
      setMsg(`${!car.available ? '✅' : '⛔'} ${car.name} → ${!car.available ? 'disponible' : 'indisponible'}`);
    } else setMsg('❌ Changement impossible, réessaie');
    setTog(null);
  };

  const cur = isHouari ? 'DA' : '€';
  const priceOf = (c: Car) => ({
    h: isHouari ? (c.houari_base_price ?? null) : (c.base_price ?? null),
    k: isHouari ? (c.houari_resale_price ?? null) : (c.resale_price ?? null),
  });
  const availCount   = cars.filter(c => c.available).length;
  const unavailCount = cars.length - availCount;
  const occPct       = intel ? Math.round(intel.occupancy_avg_pct) : null;
  const margins      = cars.map(priceOf).filter(p => p.h != null && p.k != null).map(p => (p.k as number) - (p.h as number));
  const avgMargin    = margins.length ? margins.reduce((a, b) => a + b, 0) / margins.length : null;
  const shown        = cars.filter(c => filter === 'all' || (filter === 'on' ? c.available : !c.available));

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: T.bg, color: T.text, fontFamily: T.font, position: 'relative', overflow: 'hidden' }}>
      <Toast text={msg} />

      {/* En-tête : titre + actualiser + onglets */}
      <div style={{ flexShrink: 0, borderBottom: `1px solid ${T.line}`, background: `linear-gradient(180deg, ${T.surface}, ${T.bg})` }}>
        <PageHeader
          compact
          title={tab === 'cars' ? 'Mes véhicules' : tab === 'immo' ? 'Immobilier' : 'Vente auto'}
          subtitle={tab === 'cars' ? (isHouari ? 'Prix en dinars (DA)' : 'Prix Houari, prix client et marge par jour') : tab === 'immo' ? 'Biens publiés sur le site' : 'Voitures à vendre sur le site'}
          right={tab === 'cars' ? (
            <button onClick={() => void load()} aria-label="Actualiser" title="Actualiser le parc" style={{ width: 40, height: 40, borderRadius: 12, border: `1px solid ${T.line}`, background: T.surface2, color: T.accent, fontSize: 18, cursor: 'pointer', flexShrink: 0, animation: loading ? 'dzSpin 1s linear infinite' : 'none' }}>↻</button>
          ) : undefined}
        />
        <style>{'@keyframes dzSpin{to{transform:rotate(360deg)}}'}</style>
        <div style={{ padding: '0 16px 12px' }}>
          <Segmented<ParcTab>
            value={tab} onChange={setTab}
            items={[
              { id: 'cars', label: '🚗 Location', count: cars.length || undefined },
              { id: 'immo', label: '🏠 Immo', count: counts.immo },
              { id: 'vente', label: '🏷️ Vente', count: counts.vente },
            ]}
          />
        </div>
      </div>

      {/* Immo / Vente */}
      {tab === 'immo'  && <ImmoPane  onMsg={(m) => setMsg(m)} onInspect={(name) => setInspect({ kind: 'property', name })} onCount={(n) => setCounts(c => ({ ...c, immo: n }))} />}
      {tab === 'vente' && <VentePane onMsg={(m) => setMsg(m)} onCount={(n) => setCounts(c => ({ ...c, vente: n }))} />}

      {/* Location */}
      {tab === 'cars' && (
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px 130px' }}>
        {/* Chiffres clés */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 10, marginBottom: 14 }}>
          <Kpi value={<>{availCount}<span style={{ fontSize: 15, color: T.faint, fontWeight: 600 }}> / {cars.length}</span></>} label="Disponibles" color={T.ok} sub={unavailCount ? `${unavailCount} indisponible${unavailCount > 1 ? 's' : ''}` : 'Tout le parc roule'} />
          <Kpi value={occPct != null ? `${occPct} %` : '—'} label="Occupation (30 j)" color={T.warn}
            sub={occPct != null ? <span style={{ display: 'block', height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.07)', marginTop: 6 }}><span style={{ display: 'block', height: '100%', width: `${Math.min(100, occPct)}%`, borderRadius: 2, background: `linear-gradient(90deg, ${tone(T.warn, 0.5)}, ${T.warn})` }} /></span> : undefined} />
          {!isHouari && <Kpi value={avgMargin != null ? `${fmt(avgMargin)} ${cur}` : '—'} label="Marge moyenne / jour" color={T.accent} />}
          {!isHouari && <Kpi value={margins.length ? `${fmt(Math.max(...margins))} ${cur}` : '—'} label="Meilleure marge / jour" color={T.violet}
            sub={(() => { const best = cars.find(c => { const p = priceOf(c); return p.h != null && p.k != null && (p.k - p.h) === Math.max(...margins); }); return best?.name; })()} />}
        </div>

        <div style={{ marginBottom: 14 }}>
          <Chips<CarFilter> value={filter} onChange={setFilter} items={[
            { id: 'all', label: 'Toutes', count: cars.length },
            { id: 'on', label: 'Disponibles', count: availCount },
            { id: 'off', label: 'Indisponibles', count: unavailCount },
          ]} />
        </div>

        {loading && !cars.length ? (
          <SkeletonCards count={3} height={250} />
        ) : shown.length === 0 ? (
          <Empty icon="🚗" title={cars.length ? 'Aucune voiture dans ce filtre' : 'Aucun véhicule'} text={cars.length ? 'Change de filtre pour voir le reste du parc.' : 'Ajoute une voiture en le disant à Dzaryx.'} />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 340px), 1fr))', gap: 14 }}>
            {shown.map(car => {
              const stat   = intel?.stats.find(s => s.car_name === car.name);
              const rev30d = stat ? Math.round(stat.revenue_30d) : 0;
              const occ30d = stat ? Math.round(stat.occupancy_pct) : 0;
              const { h, k } = priceOf(car);
              const margin = h != null && k != null ? k - h : null;
              const repair = !car.available && (car.maintenance_note ?? '').startsWith('🔧');
              const stCol  = car.available ? T.ok : repair ? T.warn : T.bad;
              const stLbl  = car.available ? 'Disponible' : repair ? 'Au garage' : 'Indisponible';
              const note   = !car.available && car.maintenance_note ? car.maintenance_note.replace(/^🔧\s*/, '') : '';
              return (
                <div key={car.id} style={{ borderRadius: 22, overflow: 'hidden', background: `linear-gradient(180deg, ${T.surface2}, ${T.surface})`, border: `1px solid ${car.available ? T.line : tone(stCol, 0.35)}`, boxShadow: '0 18px 40px -24px rgba(0,0,0,0.9)' }}>
                  {/* Photo pleine largeur */}
                  <div onClick={() => setDetail(car)} role="button" aria-label={`Fiche ${car.name}`} style={{ position: 'relative', height: 170, background: '#040914', overflow: 'hidden', cursor: 'pointer' }}>
                    <CarPhoto url={car.image_url ?? null} name={car.name} col={stCol} />
                    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(4,9,20,0.55) 0%, transparent 35%, transparent 45%, rgba(8,16,36,0.96) 100%)', pointerEvents: 'none' }} />
                    {!car.available && <div style={{ position: 'absolute', inset: 0, background: 'rgba(4,9,20,0.35)', backdropFilter: 'grayscale(0.7)', pointerEvents: 'none' }} />}
                    <div style={{ position: 'absolute', top: 12, left: 12 }}><Badge color={stCol}>{stLbl}</Badge></div>
                    <div onClick={e => e.stopPropagation()} style={{ position: 'absolute', top: 10, right: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Toggle on={car.available} busy={toggling === car.id} onChange={() => void toggle(car)} />
                    </div>
                    <div style={{ position: 'absolute', left: 14, right: 14, bottom: 10 }}>
                      <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: '-0.02em', color: '#fff', textShadow: '0 2px 12px rgba(0,0,0,0.7)', lineHeight: 1.15 }}>{car.name}</div>
                      <div style={{ fontSize: 12.5, color: '#c3d2f0', marginTop: 2, display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ textTransform: 'capitalize' }}>{[car.category, car.fuel].filter(Boolean).join(' · ') || 'Standard'}</span><span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 600, color: T.accent }}>Voir la fiche ›</span></div>
                    </div>
                  </div>

                  {note && <div style={{ margin: '12px 14px 0', padding: '9px 12px', borderRadius: 12, background: tone(stCol, 0.1), border: `1px solid ${tone(stCol, 0.3)}`, color: stCol, fontSize: 13, fontWeight: 600 }}>{repair ? '🔧 ' : '⛔ '}{note}</div>}

                  {/* Prix : Houari / Client / Marge */}
                  <div style={{ display: 'grid', gridTemplateColumns: isHouari ? '1fr' : 'repeat(3, minmax(0,1fr))', margin: '12px 14px 0', borderRadius: 14, border: `1px solid ${T.line}`, background: 'rgba(255,255,255,0.02)' }}>
                    {!isHouari && <PriceCell label="Houari" value={h} cur={cur} color={T.muted} />}
                    <PriceCell label={isHouari ? 'Prix de location' : 'Client'} value={k} cur={cur} color={T.text} divider={!isHouari} />
                    {!isHouari && <PriceCell label="Marge" value={margin} cur={cur} color={margin != null && margin > 0 ? T.ok : T.bad} divider plus />}
                  </div>

                  {/* Activité 30 jours */}
                  {(rev30d > 0 || occ30d > 0) && (
                    <div style={{ margin: '12px 14px 0', display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ fontSize: 12.5, color: T.muted, whiteSpace: 'nowrap' }}>30 j · <b style={{ color: T.text }}>{rev30d >= 1000 ? `${(rev30d / 1000).toFixed(1)} k€` : `${rev30d} €`}</b></div>
                      <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${Math.min(100, occ30d)}%`, borderRadius: 3, background: `linear-gradient(90deg, ${tone(T.accent, 0.5)}, ${T.accent})` }} />
                      </div>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: T.accent, minWidth: 38, textAlign: 'right' }}>{occ30d} %</div>
                    </div>
                  )}

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 8, padding: 14 }}>
                    <ActionBtn icon="📅" label="Réserver" color={T.accent} onClick={() => setBookCar(car)} />
                    <ActionBtn icon="✏️" label="Prix" color={T.accent} onClick={() => setEditCar(car)} />
                    <ActionBtn icon="🖼️" label="Photos" color={T.ok} onClick={() => setGallery({ kind: 'car', id: car.id, name: car.name })} />
                    <ActionBtn icon="📷" label="État" color={T.warn} onClick={() => setInspect({ kind: 'vehicle', name: car.name })} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      )}

      {detail && (
        <CarDetailSheet
          car={cars.find(c => c.id === detail.id) ?? detail}
          isHouari={isHouari}
          stat={intel?.stats.find(s => s.car_name === detail.name)}
          busy={toggling === detail.id}
          onClose={() => setDetail(null)}
          onToggle={(c) => void toggle(c)}
          onBook={(c) => setBookCar(c)}
          onPrice={(c) => setEditCar(c)}
          onPhotos={(c) => setGallery({ kind: 'car', id: c.id, name: c.name })}
          onInspect={(c) => setInspect({ kind: 'vehicle', name: c.name })}
        />
      )}

      {gallery && (
        <PhotoGallery kind={gallery.kind} id={gallery.id} name={gallery.name} onClose={() => setGallery(null)} onChanged={() => void load()} />
      )}

      {inspect && (
        <InspectionModal kind={inspect.kind} subject={inspect.name} sessionId={sessionId.current} onClose={() => setInspect(null)} />
      )}

      {editCar && (
        <CarEditModal
          car={editCar}
          isHouari={isHouari}
          onClose={() => setEditCar(null)}
          onSaved={(updated) => { setCars(cs => cs.map(c => c.id === updated.id ? updated : c)); setEditCar(null); setMsg('✅ Prix mis à jour partout (site, admin, Dzaryx)'); }}
        />
      )}

      {bookCar && (
        <BookingCalendarModal
          car={bookCar}
          isHouari={isHouari}
          onClose={() => setBookCar(null)}
          onCreated={(n) => { setBookCar(null); setMsg(n ? `✅ ${n} réservation${n > 1 ? 's' : ''} créée${n > 1 ? 's' : ''}` : '❌ Aucune réservation créée'); void load(); }}
        />
      )}
    </div>
  );
}

// ── Fiche complète d'un véhicule ─────────────────────────────────────────────
const dayDiff = (iso?: string | null) => {
  if (!iso) return null;
  const d = new Date(iso.slice(0, 10) + 'T00:00:00'); const t = new Date(); t.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - t.getTime()) / 86400000);
};
const frDate = (iso?: string | null) => iso ? new Date(iso.slice(0, 10) + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

function InfoRow({ label, value, color, hint }: { label: string; value: React.ReactNode; color?: string; hint?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 0', borderBottom: `1px solid ${T.line}` }}>
      <div style={{ flex: 1, fontSize: 14, color: T.muted }}>{label}</div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: 14.5, fontWeight: 700, color: color ?? T.text }}>{value}</div>
        {hint != null && <div style={{ fontSize: 12, color: color ?? T.faint, marginTop: 1 }}>{hint}</div>}
      </div>
    </div>
  );
}

function ExpiryRow({ label, iso }: { label: string; iso?: string | null }) {
  const d = dayDiff(iso);
  const col = d == null ? T.faint : d < 0 ? T.bad : d <= 30 ? T.warn : T.ok;
  const hint = d == null ? 'non renseigné' : d < 0 ? `expiré depuis ${-d} j` : d === 0 ? 'expire aujourd\'hui' : `dans ${d} j`;
  return d == null
    ? <InfoRow label={label} value="non renseigné" color={T.faint} />
    : <InfoRow label={label} value={frDate(iso)} color={col} hint={hint} />;
}

function CarDetailSheet({ car, isHouari, stat, busy, onClose, onToggle, onBook, onPrice, onPhotos, onInspect }: {
  car: Car; isHouari: boolean; stat?: { revenue_30d: number; occupancy_pct: number }; busy: boolean;
  onClose: () => void; onToggle: (c: Car) => void; onBook: (c: Car) => void; onPrice: (c: Car) => void; onPhotos: (c: Car) => void; onInspect: (c: Car) => void;
}) {
  const [photos, setPhotos] = useState<string[]>(car.image_url ? [car.image_url] : []);
  const [bookings, setBookings] = useState<Array<{ client_name: string; start_date: string; end_date: string; status: string }>>([]);
  useEffect(() => {
    business.carPhotos(car.id).then(r => { if (r.photos.length) setPhotos(r.photos.map(p => p.url)); }).catch(() => {});
    business.fetchBookings().then(r => {
      const today = new Date().toISOString().slice(0, 10);
      setBookings((r.bookings ?? []).filter(b => (b as unknown as { car_id?: string }).car_id === car.id
        && !['cancelled', 'rejected', 'CANCELLED', 'REJECTED'].includes(b.status) && (b.end_date ?? '').slice(0, 10) >= today)
        .sort((a, b) => a.start_date.localeCompare(b.start_date)).slice(0, 5)
        .map(b => ({ client_name: b.client_name, start_date: b.start_date, end_date: b.end_date, status: b.status })));
    }).catch(() => {});
  }, [car.id]);

  const cur = isHouari ? 'DA' : '€';
  const h = isHouari ? (car.houari_base_price ?? null) : (car.base_price ?? null);
  const k = isHouari ? (car.houari_resale_price ?? null) : (car.resale_price ?? null);
  const margin = h != null && k != null ? k - h : null;
  const repair = !car.available && (car.maintenance_note ?? '').startsWith('🔧');
  const stCol = car.available ? T.ok : repair ? T.warn : T.bad;
  const kmLeft = car.next_service_km != null && car.current_km != null ? car.next_service_km - car.current_km : null;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <Sheet
      title={car.name}
      subtitle={<span style={{ textTransform: 'capitalize' }}>{[car.category, car.fuel, car.transmission, car.seats ? `${car.seats} places` : null].filter(Boolean).join(' · ') || 'Véhicule du parc'}</span>}
      onClose={onClose}
      footer={<div style={{ display: 'flex', gap: 8, width: '100%' }}>
        <ActionBtn icon="📅" label="Réserver" onClick={() => onBook(car)} />
        <ActionBtn icon="✏️" label="Prix" onClick={() => onPrice(car)} />
        <ActionBtn icon="🖼️" label="Photos" color={T.ok} onClick={() => onPhotos(car)} />
        <ActionBtn icon="📷" label="État" color={T.warn} onClick={() => onInspect(car)} />
      </div>}
    >
      {/* Photos (défilement) */}
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', scrollSnapType: 'x mandatory', margin: '0 -18px 14px', padding: '0 18px', scrollbarWidth: 'none' }}>
        {photos.length ? photos.map((u, i) => (
          <button key={u} onClick={() => onPhotos(car)} style={{ flex: '0 0 82%', height: 190, borderRadius: 16, border: `1px solid ${T.line}`, background: `${T.surface2} url(${u}) center/cover`, scrollSnapAlign: 'start', cursor: 'pointer', position: 'relative', padding: 0 }}>
            <span style={{ position: 'absolute', bottom: 8, right: 8, fontSize: 12, fontWeight: 700, padding: '3px 8px', borderRadius: 8, background: 'rgba(0,0,0,0.6)', color: '#fff' }}>{i + 1}/{photos.length}</span>
          </button>
        )) : (
          <button onClick={() => onPhotos(car)} style={{ flex: '1 0 100%', height: 150, borderRadius: 16, border: `1px dashed ${T.lineStrong}`, background: 'transparent', color: T.accent, fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: T.font }}>📷 Ajouter des photos</button>
        )}
      </div>

      {/* Statut */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 16, background: tone(stCol, 0.08), border: `1px solid ${tone(stCol, 0.3)}`, marginBottom: 14 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: stCol }}>{car.available ? 'Disponible' : repair ? 'Au garage' : 'Indisponible'}</div>
          {car.maintenance_note && !car.available && <div style={{ fontSize: 13, color: T.muted, marginTop: 2 }}>{car.maintenance_note.replace(/^🔧\s*/, '')}</div>}
        </div>
        <Toggle on={car.available} busy={busy} onChange={() => onToggle(car)} />
      </div>

      {/* Prix */}
      <div style={{ display: 'grid', gridTemplateColumns: isHouari ? '1fr' : 'repeat(3, minmax(0,1fr))', borderRadius: 14, border: `1px solid ${T.line}`, background: 'rgba(255,255,255,0.02)', marginBottom: 14 }}>
        {!isHouari && <PriceCell label="Houari" value={h} cur={cur} color={T.muted} />}
        <PriceCell label={isHouari ? 'Prix de location' : 'Client'} value={k} cur={cur} color={T.text} divider={!isHouari} />
        {!isHouari && <PriceCell label="Marge" value={margin} cur={cur} color={margin != null && margin > 0 ? T.ok : T.bad} divider plus />}
      </div>

      {/* Réservations */}
      <SectionTitle>Réservations à venir</SectionTitle>
      {bookings.length === 0 ? (
        <div style={{ fontSize: 14, color: T.muted, marginBottom: 14 }}>Aucune réservation en cours ou à venir.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
          {bookings.map((b, i) => {
            const now = b.start_date.slice(0, 10) <= today;
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 13, background: 'rgba(255,255,255,0.03)', border: `1px solid ${now ? tone(T.accent, 0.4) : T.line}` }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 700, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.client_name}</div>
                  <div style={{ fontSize: 12.5, color: T.muted }}>{frDate(b.start_date)} → {frDate(b.end_date)}</div>
                </div>
                {now && <Badge color={T.accent}>En cours</Badge>}
              </div>
            );
          })}
        </div>
      )}

      {/* Activité */}
      {stat && (stat.revenue_30d > 0 || stat.occupancy_pct > 0) && (
        <>
          <SectionTitle>Activité 30 jours</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
            <Kpi value={`${Math.round(stat.revenue_30d).toLocaleString('fr-FR')} €`} label="Chiffre d'affaires" color={T.accent} />
            <Kpi value={`${Math.round(stat.occupancy_pct)} %`} label="Occupation" color={T.warn} />
          </div>
        </>
      )}

      {/* Entretien & papiers */}
      <SectionTitle>Entretien & papiers</SectionTitle>
      <div style={{ marginBottom: 14 }}>
        <InfoRow label="Kilométrage" value={car.current_km != null ? `${car.current_km.toLocaleString('fr-FR')} km` : '—'} color={car.current_km == null ? T.faint : undefined} />
        <InfoRow label="Prochaine vidange" value={car.next_service_km != null ? `${car.next_service_km.toLocaleString('fr-FR')} km` : car.next_service_date ? frDate(car.next_service_date) : '—'}
          color={kmLeft != null ? (kmLeft <= 0 ? T.bad : kmLeft <= 1000 ? T.warn : T.ok) : (car.next_service_km == null && !car.next_service_date ? T.faint : undefined)}
          hint={kmLeft != null ? (kmLeft <= 0 ? `dépassée de ${(-kmLeft).toLocaleString('fr-FR')} km` : `dans ${kmLeft.toLocaleString('fr-FR')} km`) : undefined} />
        <InfoRow label="Dernier entretien" value={car.last_service_date ? frDate(car.last_service_date) : '—'} color={car.last_service_date ? undefined : T.faint} hint={car.last_service_km != null ? `${car.last_service_km.toLocaleString('fr-FR')} km` : undefined} />
        <ExpiryRow label="Assurance" iso={car.insurance_expiry} />
        <ExpiryRow label="Contrôle technique" iso={car.technical_expiry} />
        <ExpiryRow label="Vignette" iso={car.vignette_expiry} />
      </div>
      {(car.description || car.service_notes) && (
        <>
          <SectionTitle>Notes</SectionTitle>
          {car.description && <div style={{ fontSize: 14, color: T.text, lineHeight: 1.5, marginBottom: 8 }}>{car.description}</div>}
          {car.service_notes && <div style={{ fontSize: 13.5, color: T.muted, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>🔧 {car.service_notes}</div>}
        </>
      )}
      <div style={{ fontSize: 12.5, color: T.faint, textAlign: 'center', marginTop: 14 }}>Pour remplir le kilométrage ou les dates de papiers, dis-le à Dzaryx (ex. « la Clio Diesel est à 84 000 km »).</div>
    </Sheet>
  );
}

function PriceCell({ label, value, cur, color, divider, plus }: { label: string; value: number | null; cur: string; color: string; divider?: boolean; plus?: boolean }) {
  return (
    <div style={{ padding: '10px 8px', textAlign: 'center', borderLeft: divider ? `1px solid ${T.line}` : 'none', minWidth: 0 }}>
      <div style={{ fontSize: 11.5, color: T.faint, fontWeight: 600, marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color, letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}>
        {value == null ? '—' : <>{plus && value > 0 ? '+' : ''}{fmt(value)}<span style={{ fontSize: 12, fontWeight: 600, color: T.faint }}> {cur}/j</span></>}
      </div>
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
  const _t = new Date();
  const todayIso = `${_t.getFullYear()}-${String(_t.getMonth() + 1).padStart(2, '0')}-${String(_t.getDate()).padStart(2, '0')}`;
  const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

  const nbSel = selStart && selEnd ? eachDay(selStart, selEnd).length : 0;
  const ppdNum = price ? Number(price) : (defPrice ?? 0);
  return (
    <Sheet
      title={`Réserver · ${car.name}`}
      subtitle="Un ou plusieurs clients — les jours déjà pris sont en rouge"
      onClose={onClose}
      footer={<>
        <Btn variant="ghost" onClick={onClose} style={{ flex: 1 }}>Annuler</Btn>
        <Btn variant="primary" onClick={() => void createAll()} disabled={saving || totalClients === 0} style={{ flex: 2 }}>
          {saving ? 'Création…' : totalClients ? `Créer ${totalClients} réservation${totalClients > 1 ? 's' : ''}` : 'Choisis des dates'}
        </Btn>
      </>}
    >
      {/* Calendrier */}
      <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.line}`, borderRadius: 18, padding: 14, marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <button onClick={() => setMonth(s => s.m === 0 ? { y: s.y - 1, m: 11 } : { y: s.y, m: s.m - 1 })} style={calNav} aria-label="Mois précédent">‹</button>
          <span style={{ fontSize: 16, fontWeight: 700, color: T.text }}>{MONTHS[month.m]} {month.y}</span>
          <button onClick={() => setMonth(s => s.m === 11 ? { y: s.y + 1, m: 0 } : { y: s.y, m: s.m + 1 })} style={calNav} aria-label="Mois suivant">›</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4, marginBottom: 6 }}>
          {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => <div key={i} style={{ textAlign: 'center', fontSize: 11.5, fontWeight: 600, color: T.faint }}>{d}</div>)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4 }}>
          {Array.from({ length: startWeekday }).map((_, i) => <div key={`e${i}`} />)}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1; const d = iso(month.y, month.m, day);
            const past = d < todayIso;
            const isBooked = reservedSet.has(d);
            const isEdge = d === selStart || d === selEnd;
            const inSel = selStart && (isEdge || (selEnd && d >= selStart && d <= selEnd));
            const disabled = past || isBooked;
            const bg = isBooked ? tone(T.bad, 0.18) : isEdge ? T.accent : inSel ? tone(T.accent, 0.25) : past ? 'transparent' : 'rgba(255,255,255,0.04)';
            const fg = isBooked ? T.bad : isEdge ? '#04101f' : inSel ? T.text : past ? '#34405c' : T.text;
            return (
              <button key={day} onClick={() => !disabled && onDay(d)} disabled={disabled}
                style={{ aspectRatio: '1', minHeight: 38, borderRadius: 10, border: d === todayIso ? `1px solid ${tone(T.accent, 0.6)}` : 'none', background: bg, color: fg, fontSize: 14, fontWeight: inSel ? 800 : 500, cursor: disabled ? 'default' : 'pointer', fontFamily: T.font, textDecoration: isBooked ? 'line-through' : 'none' }}>
                {day}
              </button>
            );
          })}
        </div>
        <div style={{ fontSize: 13, color: selStart ? T.accent : T.muted, marginTop: 12, textAlign: 'center', fontWeight: 600 }}>
          {selStart && !selEnd ? `Début le ${selStart.slice(8)}/${selStart.slice(5, 7)} — touche la date de fin` : selStart && selEnd ? `${selStart.slice(8)}/${selStart.slice(5, 7)} → ${selEnd.slice(8)}/${selEnd.slice(5, 7)} · ${nbSel} jour${nbSel > 1 ? 's' : ''}${ppdNum ? ` · ${fmt(ppdNum * nbSel)} ${cur}` : ''}` : 'Touche la date de début'}
        </div>
      </div>

      <Field label="Client">
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={client} onChange={e => setClient(e.target.value)} placeholder="Nom du client" style={{ ...inputStyle, flex: 1 }} />
          <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Téléphone" inputMode="tel" style={{ ...inputStyle, flex: 1 }} />
        </div>
      </Field>
      <Field label={`Prix par jour (${cur})`} hint={ownerPrice != null ? `Prix Houari : ${fmt(ownerPrice)} ${cur}/j` : undefined}>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={price} onChange={e => setPrice(e.target.value)} type="number" inputMode="decimal" placeholder={`ex. ${defPrice ?? 30}`} style={{ ...inputStyle, flex: 1 }} />
          <Btn onClick={addEntry} style={{ flexShrink: 0 }}>+ Autre client</Btn>
        </div>
      </Field>

      {entries.length > 0 && (
        <>
          <SectionTitle>Déjà ajoutés</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 8 }}>
            {entries.map((e, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(255,255,255,0.03)', border: `1px solid ${T.line}`, borderRadius: 13, padding: '10px 12px' }}>
                <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: T.text }}>{e.client}</span>
                <span style={{ fontSize: 12.5, color: T.muted }}>{e.start.slice(8)}/{e.start.slice(5, 7)} → {e.end.slice(8)}/{e.end.slice(5, 7)}</span>
                <button onClick={() => setEntries(x => x.filter((_, j) => j !== i))} aria-label="Retirer" style={{ width: 30, height: 30, borderRadius: 9, border: 'none', background: tone(T.bad, 0.12), color: T.bad, fontSize: 13, cursor: 'pointer' }}>✕</button>
              </div>
            ))}
          </div>
        </>
      )}

      {err && <div style={{ fontSize: 13.5, fontWeight: 600, color: T.bad, textAlign: 'center', marginTop: 4 }}>{err}</div>}
    </Sheet>
  );
}

// liste des jours (ISO local) entre start et end inclus.
// Format LOCAL (pas toISOString = UTC, qui décale d'un jour en UTC+1).
function eachDay(start: string, end: string): string[] {
  const out: string[] = [];
  const s = new Date(start.slice(0, 10) + 'T00:00:00'); const e = new Date(end.slice(0, 10) + 'T00:00:00');
  for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  }
  return out;
}
const calNav: CSSProperties = { width: 40, height: 40, borderRadius: 12, border: `1px solid ${T.line}`, background: 'rgba(255,255,255,0.03)', color: T.accent, fontSize: 20, cursor: 'pointer' };

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

  const o = owner ? Number(owner) : null;
  const c = client ? Number(client) : null;
  const marge = o != null && c != null ? c - o : null;
  return (
    <Sheet
      title={`Prix · ${car.name}`}
      subtitle={isHouari ? 'Tarifs Houari — en dinars (DA)' : 'Changé ici = changé partout : site, admin, Dzaryx, simulateur'}
      onClose={onClose}
      footer={<>
        <Btn variant="ghost" onClick={onClose} style={{ flex: 1 }}>Annuler</Btn>
        <Btn variant="primary" onClick={() => void save()} disabled={saving} style={{ flex: 2 }}>{saving ? 'Enregistrement…' : 'Enregistrer'}</Btn>
      </>}
    >
      {!isHouari && (
        <Field label={`Prix payé à Houari / jour (${cur})`}>
          <input value={owner} onChange={e => setOwner(e.target.value)} type="number" inputMode="decimal" placeholder="ex. 16" style={inputStyle} />
        </Field>
      )}
      <Field label={`Prix ${isHouari ? 'de location' : 'client'} / jour (${cur})`} hint={isHouari ? undefined : 'C\'est le prix affiché sur le site.'}>
        <input value={client} onChange={e => setClient(e.target.value)} type="number" inputMode="decimal" placeholder={isHouari ? 'ex. 7000' : 'ex. 30'} style={inputStyle} />
      </Field>
      {!isHouari && marge != null && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderRadius: 14, background: tone(marge > 0 ? T.ok : T.bad, 0.1), border: `1px solid ${tone(marge > 0 ? T.ok : T.bad, 0.3)}` }}>
          <span style={{ fontSize: 14, color: T.muted, fontWeight: 600 }}>Ta marge</span>
          <span style={{ fontSize: 22, fontWeight: 800, color: marge > 0 ? T.ok : T.bad }}>{marge > 0 ? '+' : ''}{fmt(marge)} {cur}/j</span>
        </div>
      )}
      {err && <div style={{ fontSize: 13.5, fontWeight: 600, color: T.bad, textAlign: 'center', marginTop: 10 }}>{err}</div>}
    </Sheet>
  );
}

// ── IMMO PANE ────────────────────────────────────────────────────────────────
const IMMO_ST: Record<string, { label: string; col: string }> = {
  disponible: { label: 'Disponible', col: T.ok }, libre: { label: 'Disponible', col: T.ok },
  loue: { label: 'Loué', col: T.warn }, vendu: { label: 'Vendu', col: T.violet },
  coming_soon: { label: 'Bientôt', col: T.accent },
};
const IMMO_ICON: Record<string, string> = { appartement: '🏢', villa: '🏡', maison: '🏠', studio: '🛏️', local: '🏪', terrain: '🌳' };

function PaneShell({ children }: { children: React.ReactNode }) {
  return <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px 130px', display: 'flex', flexDirection: 'column', gap: 12 }}>{children}</div>;
}

function TwoChoice<K extends string>({ value, onChange, items }: { value: K; onChange: (k: K) => void; items: [K, string][] }) {
  return <Segmented<K> value={value} onChange={onChange} items={items.map(([id, label]) => ({ id, label }))} />;
}

function ImmoPane({ onMsg, onInspect, onCount }: { onMsg: (m: string) => void; onInspect: (name: string) => void; onCount: (n: number) => void }) {
  const [gallery, setGallery] = useState<{ id: string; name: string } | null>(null);
  const [items, setItems] = useState<SiteProperty[]>([]);
  const [loading, setLoad] = useState(true);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [f, setF] = useState({ title: '', transaction: 'location', city: 'Oran', district: '', address: '', price: '', currency: 'DZD', type: 'appartement', rooms: '' });

  const load = async () => { setLoad(true); try { const r = await business.fetchProperties(); setItems(r.properties ?? []); onCount((r.properties ?? []).length); } catch { setItems([]); } finally { setLoad(false); } };
  useEffect(() => { void load(); }, []);

  const add = async () => {
    if (!f.title.trim() || !f.price) { onMsg('❌ Titre et prix obligatoires'); return; }
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
    } catch { onMsg('❌ Échec de l\'ajout'); } finally { setBusy(null); }
  };

  const cycle = async (p: SiteProperty) => {
    const order = p.transaction === 'vente' ? ['disponible', 'vendu', 'coming_soon'] : ['disponible', 'loue', 'coming_soon'];
    const cur = (p.status || 'disponible').toLowerCase();
    const next = order[(order.indexOf(cur) + 1) % order.length];
    setBusy(p.id);
    try { await business.updateProperty(p.id, { status: next }); setItems(xs => xs.map(x => x.id === p.id ? { ...x, status: next } : x)); }
    catch { onMsg('❌ Échec de la mise à jour'); } finally { setBusy(null); }
  };

  const del = async (p: SiteProperty) => {
    if (!confirm(`Supprimer « ${p.title || p.name} » du site ?`)) return;
    setBusy(p.id);
    try { await business.deleteProperty(p.id); setItems(xs => { const n = xs.filter(x => x.id !== p.id); onCount(n.length); return n; }); onMsg('🗑️ Bien supprimé'); }
    catch { onMsg('❌ Échec'); } finally { setBusy(null); }
  };

  return (
    <PaneShell>
      <Btn variant={show ? 'ghost' : 'primary'} onClick={() => setShow(s => !s)} style={{ width: '100%' }}>{show ? 'Fermer' : '＋ Ajouter un bien'}</Btn>
      {show && (
        <div style={{ background: `linear-gradient(180deg, ${T.surface2}, ${T.surface})`, border: `1px solid ${T.lineStrong}`, borderRadius: 20, padding: 16 }}>
          <div style={{ marginBottom: 12 }}><TwoChoice value={f.transaction as 'location' | 'vente'} onChange={(t) => setF(s => ({ ...s, transaction: t }))} items={[['location', 'À louer'], ['vente', 'À vendre']]} /></div>
          <Field label="Titre de l'annonce"><input value={f.title} onChange={e => setF(s => ({ ...s, title: e.target.value }))} placeholder="ex. F3 meublé Akid Lotfi" style={inputStyle} /></Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Field label="Ville"><input value={f.city} onChange={e => setF(s => ({ ...s, city: e.target.value }))} style={inputStyle} /></Field>
            <Field label="Quartier"><input value={f.district} onChange={e => setF(s => ({ ...s, district: e.target.value }))} placeholder="ex. Hay Badr" style={inputStyle} /></Field>
          </div>
          <Field label="Adresse précise" hint="Sert à placer le bien sur Google Maps."><input value={f.address} onChange={e => setF(s => ({ ...s, address: e.target.value }))} style={inputStyle} /></Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 96px', gap: 8 }}>
            <Field label={f.transaction === 'location' ? 'Loyer / mois' : 'Prix de vente'}><input value={f.price} onChange={e => setF(s => ({ ...s, price: e.target.value }))} type="number" inputMode="decimal" style={inputStyle} /></Field>
            <Field label="Devise"><select value={f.currency} onChange={e => setF(s => ({ ...s, currency: e.target.value }))} style={inputStyle}><option>DZD</option><option>EUR</option></select></Field>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 96px', gap: 8 }}>
            <Field label="Type"><select value={f.type} onChange={e => setF(s => ({ ...s, type: e.target.value }))} style={{ ...inputStyle, textTransform: 'capitalize' }}>
              {['appartement', 'villa', 'maison', 'studio', 'local', 'terrain'].map(o => <option key={o}>{o}</option>)}
            </select></Field>
            <Field label="Pièces"><input value={f.rooms} onChange={e => setF(s => ({ ...s, rooms: e.target.value }))} type="number" inputMode="numeric" style={inputStyle} /></Field>
          </div>
          <Btn variant="primary" onClick={() => void add()} disabled={busy === 'add'} style={{ width: '100%' }}>{busy === 'add' ? 'Publication…' : 'Publier sur le site'}</Btn>
        </div>
      )}
      {loading ? <SkeletonCards count={3} height={120} /> : items.length === 0 ? (
        !show && <Empty icon="🏠" title="Aucun bien publié" text="Ajoute ton premier appartement, villa ou local : il apparaîtra tout de suite sur le site." />
      ) : items.map(p => {
        const st = IMMO_ST[(p.status || 'disponible').toLowerCase()] ?? { label: p.status || '—', col: T.muted };
        const cur = p.currency === 'DZD' ? 'DA' : (p.currency || '€');
        const t = ((p as SiteProperty & { type?: string }).type ?? '').toLowerCase();
        return (
          <div key={p.id} style={{ borderRadius: 20, border: `1px solid ${T.line}`, background: `linear-gradient(180deg, ${T.surface2}, ${T.surface})`, padding: 14 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <div style={{ width: 48, height: 48, borderRadius: 14, background: tone(st.col, 0.12), border: `1px solid ${tone(st.col, 0.3)}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>{IMMO_ICON[t] ?? '🏠'}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: T.text, lineHeight: 1.25 }}>{p.title || p.name}</div>
                <div style={{ fontSize: 13, color: T.muted, marginTop: 3 }}>{p.transaction === 'vente' ? 'À vendre' : 'À louer'} · {[p.district, p.city].filter(Boolean).join(', ')}{p.rooms ? ` · ${p.rooms} pièces` : ''}</div>
              </div>
              <Badge color={st.col}>{st.label}</Badge>
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: T.text, margin: '12px 0' }}>{p.price != null ? `${Number(p.price).toLocaleString('fr-FR')} ${cur}` : '—'}<span style={{ fontSize: 12.5, color: T.faint, fontWeight: 600 }}>{p.transaction === 'vente' ? '' : ' / mois'}</span></div>
            <div style={{ display: 'flex', gap: 8 }}>
              <ActionBtn icon="🔄" label="Statut" color={T.warn} busy={busy === p.id} onClick={() => void cycle(p)} />
              <ActionBtn icon="🖼️" label="Photos" color={T.ok} onClick={() => setGallery({ id: p.id, name: p.title || p.name || 'Bien' })} />
              <ActionBtn icon="📷" label="État des lieux" color={T.accent} onClick={() => onInspect(p.title || p.name || 'Bien')} />
              <ActionBtn icon="🗑️" label="Supprimer" color={T.bad} onClick={() => void del(p)} />
            </div>
          </div>
        );
      })}
      {gallery && <PhotoGallery kind="property" id={gallery.id} name={gallery.name} onClose={() => setGallery(null)} onChanged={() => void load()} />}
    </PaneShell>
  );
}

// ── VENTE PANE ───────────────────────────────────────────────────────────────
const VENTE_ST: Record<string, { label: string; col: string }> = {
  disponible: { label: 'À vendre', col: T.ok }, reserve: { label: 'Réservée', col: T.warn }, vendu: { label: 'Vendue', col: T.violet },
};

function VentePane({ onMsg, onCount }: { onMsg: (m: string) => void; onCount: (n: number) => void }) {
  const [items, setItems] = useState<SaleVehicle[]>([]);
  const [loading, setLoad] = useState(true);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [f, setF] = useState({ brand: '', model: '', year: '', price: '', currency: 'DZD', mileage: '' });

  const load = async () => { setLoad(true); try { const r = await business.fetchVehiclesForSale(); setItems(r.vehicles ?? []); onCount((r.vehicles ?? []).length); } catch { setItems([]); } finally { setLoad(false); } };
  useEffect(() => { void load(); }, []);

  const add = async () => {
    if (!f.brand.trim() || !f.model.trim() || !f.price) { onMsg('❌ Marque, modèle et prix obligatoires'); return; }
    setBusy('add');
    try {
      await business.addVehicleForSale({ brand: f.brand.trim(), model: f.model.trim(), year: f.year ? Number(f.year) : null, price: Number(f.price), currency: f.currency, mileage: f.mileage ? Number(f.mileage) : null, status: 'disponible' });
      onMsg('✅ Voiture ajoutée au site'); setShow(false);
      setF({ brand: '', model: '', year: '', price: '', currency: 'DZD', mileage: '' });
      void load();
    } catch { onMsg('❌ Échec de l\'ajout'); } finally { setBusy(null); }
  };

  const cycle = async (v: SaleVehicle) => {
    const order = ['disponible', 'reserve', 'vendu'];
    const next = order[(order.indexOf((v.status || 'disponible').toLowerCase()) + 1) % order.length];
    setBusy(v.id);
    try { await business.updateVehicleSale(v.id, { status: next }); setItems(xs => xs.map(x => x.id === v.id ? { ...x, status: next } : x)); }
    catch { onMsg('❌ Échec de la mise à jour'); } finally { setBusy(null); }
  };

  const [gallery, setGallery] = useState<{ id: string; name: string } | null>(null);

  return (
    <PaneShell>
      <Btn variant={show ? 'ghost' : 'primary'} onClick={() => setShow(s => !s)} style={{ width: '100%' }}>{show ? 'Fermer' : '＋ Ajouter une voiture à vendre'}</Btn>
      {show && (
        <div style={{ background: `linear-gradient(180deg, ${T.surface2}, ${T.surface})`, border: `1px solid ${T.lineStrong}`, borderRadius: 20, padding: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Field label="Marque"><input value={f.brand} onChange={e => setF(s => ({ ...s, brand: e.target.value }))} placeholder="ex. Renault" style={inputStyle} /></Field>
            <Field label="Modèle"><input value={f.model} onChange={e => setF(s => ({ ...s, model: e.target.value }))} placeholder="ex. Clio 5" style={inputStyle} /></Field>
            <Field label="Année"><input value={f.year} onChange={e => setF(s => ({ ...s, year: e.target.value }))} type="number" inputMode="numeric" style={inputStyle} /></Field>
            <Field label="Kilométrage"><input value={f.mileage} onChange={e => setF(s => ({ ...s, mileage: e.target.value }))} type="number" inputMode="numeric" style={inputStyle} /></Field>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 96px', gap: 8 }}>
            <Field label="Prix de vente"><input value={f.price} onChange={e => setF(s => ({ ...s, price: e.target.value }))} type="number" inputMode="decimal" style={inputStyle} /></Field>
            <Field label="Devise"><select value={f.currency} onChange={e => setF(s => ({ ...s, currency: e.target.value }))} style={inputStyle}><option>DZD</option><option>EUR</option></select></Field>
          </div>
          <Btn variant="primary" onClick={() => void add()} disabled={busy === 'add'} style={{ width: '100%' }}>{busy === 'add' ? 'Publication…' : 'Publier sur le site'}</Btn>
        </div>
      )}
      {loading ? <SkeletonCards count={3} height={120} /> : items.length === 0 ? (
        !show && <Empty icon="🏷️" title="Aucune voiture à vendre" text="Ajoute une voiture : elle apparaît tout de suite dans « Vente auto » sur le site." />
      ) : items.map(v => {
        const st = VENTE_ST[(v.status || 'disponible').toLowerCase()] ?? { label: v.status || '—', col: T.muted };
        const cur = v.currency === 'DZD' ? 'DA' : (v.currency || '€');
        return (
          <div key={v.id} style={{ borderRadius: 20, border: `1px solid ${T.line}`, background: `linear-gradient(180deg, ${T.surface2}, ${T.surface})`, padding: 14 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <div style={{ width: 48, height: 48, borderRadius: 14, background: tone(st.col, 0.12), border: `1px solid ${tone(st.col, 0.3)}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>🚗</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: T.text }}>{v.brand} {v.model}</div>
                <div style={{ fontSize: 13, color: T.muted, marginTop: 3 }}>{[v.year, v.mileage ? `${Number(v.mileage).toLocaleString('fr-FR')} km` : null].filter(Boolean).join(' · ') || '—'}</div>
              </div>
              <Badge color={st.col}>{st.label}</Badge>
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: T.text, margin: '12px 0' }}>{v.price != null ? `${Number(v.price).toLocaleString('fr-FR')} ${cur}` : '—'}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <ActionBtn icon="🔄" label="Statut" color={T.warn} busy={busy === v.id} onClick={() => void cycle(v)} />
              <ActionBtn icon="🖼️" label="Photos" color={T.accent} onClick={() => setGallery({ id: v.id, name: `${v.brand} ${v.model}` })} />
            </div>
          </div>
        );
      })}

      {gallery && <PhotoGallery kind="sale" id={gallery.id} name={gallery.name} onClose={() => setGallery(null)} onChanged={() => void load()} />}
    </PaneShell>
  );
}

const btnLabel: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 48, borderRadius: 13, border: `1px dashed ${tone(T.accent, 0.5)}`, background: tone(T.accent, 0.08), color: T.accent, fontSize: 15, fontWeight: 700, fontFamily: T.font };

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
          position: 'absolute', inset: 0, width: '100%', height: '100%',
          objectFit: 'cover', objectPosition: 'center 55%',
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
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `radial-gradient(ellipse at 50% 60%, ${tone(col, 0.12)}, transparent 70%)` }}>
    <svg width="96" height="68" viewBox="0 0 40 28" fill="none" xmlns="http://www.w3.org/2000/svg">
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
    </div>
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

export function InspectionModal({ kind, subject, sessionId, onClose, initialMode = 'before', initialClient = '', onResult, fixed }: {
  kind: 'vehicle' | 'property'; subject: string; sessionId: string; onClose: () => void;
  initialMode?: 'before' | 'after'; initialClient?: string; onResult?: (r: InspectionResult, mode: 'before' | 'after') => void; fixed?: boolean;
}) {
  const [mode, setMode]     = useState<'before' | 'after'>(initialMode);
  const [client, setClient] = useState(initialClient);
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
      if (r.success) { setResult(r); onResult?.(r, mode); }
      else setErr(r.message || 'Échec de l\'analyse');
    } catch {
      setErr('Erreur réseau. Réessaie.');
    } finally { setBusy(false); }
  };

  const boxes: DamageBox[] = result?.analysis?.damageBoxes ?? [];
  const photos: string[]   = result?.photos ?? (result?.photoUrl ? [result.photoUrl] : []);

  const modeLbl = (m: 'before' | 'after') => m === 'before' ? (kind === 'vehicle' ? 'Avant (départ)' : 'Entrée') : (kind === 'vehicle' ? 'Après (retour)' : 'Sortie');
  const ready = !!client.trim() && shots.length > 0;
  return (
    <Sheet
      fixed={fixed} z={fixed ? 1200 : 60} accent={T.warn}
      title={kind === 'vehicle' ? 'Inspection du véhicule' : 'État des lieux'}
      subtitle={subject}
      onClose={onClose}
      footer={result ? <>
        <Btn onClick={() => { setResult(null); setShots([]); setMode(mode === 'before' ? 'after' : mode); }} style={{ flex: 1 }}>＋ Nouvelle</Btn>
        <Btn variant="primary" onClick={onClose} style={{ flex: 1 }}>Terminé</Btn>
      </> : busy ? undefined : <>
        <Btn variant="ghost" onClick={onClose} style={{ flex: 1 }}>Annuler</Btn>
        <Btn variant="primary" onClick={() => void submit()} disabled={!ready} style={{ flex: 2 }}>🔍 Analyser{shots.length ? ` (${shots.length})` : ''}</Btn>
      </>}
    >
      {result ? (
        <>
          {result.analysis?.accident && (
            <div style={{ background: tone(T.bad, 0.14), border: `1px solid ${tone(T.bad, 0.4)}`, borderRadius: 14, padding: '11px 14px', marginBottom: 12, color: T.bad, fontSize: 14, fontWeight: 700, textAlign: 'center' }}>🚨 Accident / choc détecté</div>
          )}
          {photos.map((url, pi) => (
            <div key={pi} style={{ position: 'relative', width: '100%', borderRadius: 14, overflow: 'hidden', marginBottom: 10, border: `1px solid ${T.line}` }}>
              <img src={url} alt={`inspection ${pi + 1}`} style={{ width: '100%', display: 'block' }} />
              {boxes.map((d, gi) => (d.photo_index ?? 0) !== pi ? null : (() => {
                const col = SEV_COL[d.severity] ?? '#ffb347';
                return (
                  <div key={gi}>
                    <div style={{ position: 'absolute', left: `${d.box.x * 100}%`, top: `${d.box.y * 100}%`, width: `${d.box.w * 100}%`, height: `${d.box.h * 100}%`, border: `2px solid ${col}`, borderRadius: 4, boxShadow: `0 0 8px ${col}88`, boxSizing: 'border-box' }} />
                    <div style={{ position: 'absolute', left: `${d.box.x * 100}%`, top: `${d.box.y * 100}%`, transform: 'translate(-50%,-50%)', minWidth: 22, height: 22, padding: '0 4px', borderRadius: 11, background: col, color: '#04101f', fontSize: 12, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{gi + 1}</div>
                  </div>
                );
              })())}
              {photos.length > 1 && <div style={{ position: 'absolute', top: 8, left: 8, background: 'rgba(0,0,0,0.65)', color: '#fff', fontSize: 12, fontWeight: 600, padding: '3px 8px', borderRadius: 8 }}>Photo {pi + 1}/{photos.length}</div>}
            </div>
          ))}
          {boxes.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
              {boxes.map((d, i) => {
                const col = SEV_COL[d.severity] ?? '#ffb347';
                return (
                  <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <span style={{ flex: '0 0 24px', height: 24, borderRadius: 12, background: col, color: '#04101f', fontSize: 12, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</span>
                    <span style={{ fontSize: 14, color: T.text, lineHeight: 1.45 }}>{d.label}{d.is_new ? <b style={{ color: T.bad }}> · nouveau</b> : ''}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ color: T.ok, fontSize: 15, fontWeight: 700, textAlign: 'center', margin: '6px 0 12px' }}>✅ Aucun {kind === 'vehicle' ? 'dégât' : 'défaut'} détecté</div>
          )}
          {(result.analysis?.comparisonReport || result.analysis?.description) && (
            <div style={{ fontSize: 13.5, color: T.muted, lineHeight: 1.55, whiteSpace: 'pre-wrap', borderTop: `1px solid ${T.line}`, paddingTop: 12 }}>
              {result.analysis?.comparisonReport || result.analysis?.description}
            </div>
          )}
        </>
      ) : busy ? (
        <div style={{ textAlign: 'center', padding: '36px 0' }}>
          <div style={{ width: 44, height: 44, margin: '0 auto 14px', borderRadius: '50%', border: `3px solid ${tone(T.warn, 0.25)}`, borderTopColor: T.warn, animation: 'dzSpin 0.9s linear infinite' }} />
          <style>{'@keyframes dzSpin{to{transform:rotate(360deg)}}'}</style>
          <div style={{ fontSize: 16, fontWeight: 700, color: T.text }}>Analyse en cours…</div>
          <div style={{ fontSize: 13, color: T.muted, marginTop: 4 }}>{shots.length} photo{shots.length > 1 ? 's' : ''} · environ 20 secondes</div>
        </div>
      ) : (
        <>
          <div style={{ marginBottom: 14 }}>
            <Segmented<'before' | 'after'> value={mode} onChange={setMode} items={[{ id: 'before', label: modeLbl('before') }, { id: 'after', label: modeLbl('after') }]} />
          </div>
          <Field label={kind === 'vehicle' ? 'Nom du client' : 'Nom du locataire'}>
            <input value={client} onChange={e => setClient(e.target.value)} placeholder="ex. Benali Mohamed" style={inputStyle} />
          </Field>
          {shots.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 12 }}>
              {shots.map((u, i) => (
                <div key={i} style={{ position: 'relative', paddingTop: '100%', borderRadius: 12, overflow: 'hidden', border: `1px solid ${T.line}` }}>
                  <img src={u} alt={`p${i}`} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                  <button onClick={() => setShots(s => s.filter((_, j) => j !== i))} aria-label="Retirer" style={{ position: 'absolute', top: 4, right: 4, width: 24, height: 24, borderRadius: '50%', border: 'none', background: 'rgba(225,29,72,0.9)', color: '#fff', fontSize: 12, cursor: 'pointer', padding: 0 }}>✕</button>
                </div>
              ))}
            </div>
          )}
          {err && <div style={{ color: T.bad, fontSize: 13.5, fontWeight: 600, marginBottom: 10, lineHeight: 1.4 }}>{err}</div>}
          <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={e => { const arr = Array.from(e.target.files ?? []); e.target.value = ''; void addFiles(arr); }} />
          <button onClick={() => fileRef.current?.click()} style={{ ...btnLabel, width: '100%', borderColor: tone(T.warn, 0.5), background: tone(T.warn, 0.08), color: T.warn, cursor: 'pointer', minHeight: 64 }}>
            📷 {shots.length ? 'Ajouter une photo' : 'Prendre ou choisir des photos'}
          </button>
          <div style={{ fontSize: 12.5, color: T.faint, textAlign: 'center', marginTop: 8 }}>Jusqu'à 8 photos · {kind === 'vehicle' ? 'fais le tour de la voiture' : 'une par pièce'}</div>
        </>
      )}
    </Sheet>
  );
}

