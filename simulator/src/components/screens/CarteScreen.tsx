// Carte live 3D — tout le business FIK vu comme un jeu : agence, parking location, atelier, voitures qui roulent
// en ville, vente auto, port d'import, immobilier, packs séjour, aéroport, entreprises, FIK Sites.
// Pas de GPS : la position est symbolique, le statut est réel. Plein écran + lien pour l'ouvrir sur le PC.
// En démo (?demo=carte) : données fictives, rien n'est chargé du serveur → offre FIK à montrer aux prospects.
import { useState, useEffect, useCallback, useMemo, useRef, type ReactNode, type CSSProperties } from 'react';
import { apiFetch, business, type Car, type Booking, type SmartReminder, type TodayItem, type SaleVehicle, type SiteProperty } from '../../services/api.ts';
import { STATUS, ZONE_INFO, ALL_ZONES, buildCars, demoWorld, norm, type Status, type World, type ZoneId, type DemoKind, type Item } from '../carte/data.ts';
import type { SceneApi, Pick } from '../carte/scene.ts';
import AddRentals from '../carte/AddRentals.tsx';
import CarSheet from '../carte/CarSheet.tsx';
import ItemSheet, { type SheetKind, type Raw } from '../carte/ItemSheet.tsx';

const C = {
  bg: '#0a0a0c', surface: '#16161c', border: 'rgba(255,255,255,0.08)',
  accent: '#10b981', gold: '#fbbf24', red: '#ef4444', orange: '#fb923c', text: '#f5f5f7', muted: '#9b9ba6',
  font: '-apple-system, "Segoe UI", Roboto, sans-serif',
};
const APP_URL = 'https://kouider213.github.io/ibrahim/';
const FIK_WA = '32466311469';

type Today = { departures: TodayItem[]; returns: TodayItem[]; toCollect: Array<TodayItem & { due: number }> };
type Demande = { id: string; source: string; title: string; client_name?: string; client_phone?: string; status?: string; meta?: string; kind?: string; ref?: string; created_at?: string; fields?: Record<string, unknown> };
const DONE = /cancel|annul|deliver|livr|done|termin|closed|refus|reject|conclu|perdu|finali|complet/i;
const fmtD = (s: string) => new Date(s + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
const money = (n: number, cur?: string | null) => `${n.toLocaleString('fr-FR')} ${cur === 'DZD' ? 'DA' : '€'}`;
const ZONE_OF: Record<Status, ZoneId> = { dispo: 'parking', depart: 'parking', loue: 'ville', retour: 'ville', atelier: 'atelier' };

export interface CarteProps {
  onAsk: (prompt: string) => void;
  onOpen: (page: string) => void;
  actor?: string;
  startFull?: boolean;
  demo?: { kind: DemoKind; brand: string };
}

export default function CarteScreen({ onAsk, onOpen, actor = 'kouider', startFull, demo }: CarteProps) {
  const [cars, setCars] = useState<Car[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [reminders, setReminders] = useState<SmartReminder[]>([]);
  const [today, setToday] = useState<Today | null>(null);
  const [extra, setExtra] = useState<Omit<World, 'brand' | 'zones' | 'cars'>>({ sales: [], imports: [], properties: [], packs: [], pending: 0, sites: 0, prospects: 0, replies: 0 });
  const [loading, setLoading] = useState(!demo);
  const [pick, setPick] = useState<Pick>(null);
  const [full, setFull] = useState(!!startFull);
  const [adding, setAdding] = useState<{ car?: string } | null>(null);
  const [sheet, setSheet] = useState<{ kind: SheetKind; id: string | null } | null>(null); // fiche métier (null id = création)
  const [raws, setRaws] = useState<Record<SheetKind, Raw[]>>({ sale: [], prop: [], imp: [], pack: [], dem: [] });
  const [toast, setToast] = useState('');
  const [ready, setReady] = useState(false);
  const [fresh, setFresh] = useState<string[]>([]);      // animés sur la carte (quelques secondes)
  const [freshNote, setFreshNote] = useState<string[]>([]); // bandeau « Nouveau »
  const [demoArrival, setDemoArrival] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const api = useRef<SceneApi | null>(null);

  const say = (t: string) => { setToast(t); setTimeout(() => setToast(''), 2600); };

  const load = useCallback(async () => {
    if (demo) return;
    setLoading(true);
    try {
      const [c, b, r, t, v, p, d, pk, s, pr] = await Promise.all([
        business.fetchCars().catch(() => ({ cars: [] as Car[] })),
        business.fetchBookingsWindow().catch(() => ({ bookings: [] as Booking[] })),
        business.fetchReminders().catch(() => ({ reminders: [] as SmartReminder[] })),
        business.insightsToday().catch(() => null),
        business.fetchVehiclesForSale().catch(() => ({ vehicles: [] as SaleVehicle[] })),
        business.fetchProperties().catch(() => ({ properties: [] as SiteProperty[] })),
        apiFetch<{ demandes: Demande[] }>('/api/demandes').catch(() => ({ demandes: [] as Demande[] })),
        apiFetch<{ packs: Array<{ id: string; title?: string; name?: string }> }>('/api/packs').catch(() => ({ packs: [] })),
        business.sitesOverview().catch(() => null),
        business.prospectsOverview().catch(() => null),
      ]);
      setCars(c.cars ?? []); setBookings(b.bookings ?? []); setReminders(r.reminders ?? []); setToday(t && Array.isArray(t.departures) && Array.isArray(t.returns) && Array.isArray(t.toCollect) ? t : null);
      const dem = d.demandes ?? [];
      setRaws({
        sale: (v.vehicles ?? []) as unknown as Raw[], prop: (p.properties ?? []) as unknown as Raw[], pack: (pk.packs ?? []) as unknown as Raw[],
        imp: dem.filter(x => x.source === 'import') as unknown as Raw[],
        dem: dem.filter(x => x.source !== 'import' && !DONE.test(x.status ?? '')) as unknown as Raw[],
      });
      setExtra({
        sales: (v.vehicles ?? []).filter(x => !/vendu|sold/i.test(x.status ?? '')).map<Item>(x => ({ id: x.id, label: [x.brand, x.model, x.year].filter(Boolean).join(' '), sub: x.price ? money(x.price, x.currency) : undefined })),
        imports: dem.filter(x => x.source === 'import' && !DONE.test(x.status ?? '')).map<Item>(x => ({ id: x.id, label: x.title, sub: [x.client_name, x.status].filter(Boolean).join(' · ') })),
        properties: (p.properties ?? []).filter(x => !/vendu|sold|archiv/i.test(x.status ?? '')).map<Item>(x => ({ id: x.id, label: x.title || x.name || 'Bien', sub: /vente|sale/i.test(x.transaction ?? '') ? 'À vendre' : 'À louer' })),
        packs: (pk.packs ?? []).map<Item>(x => ({ id: x.id, label: x.title || x.name || 'Pack' })),
        pending: dem.filter(x => /pending|new|nouveau|open|attente/i.test(x.status ?? '') || !x.status).length,
        sites: s?.stats?.live ?? 0,
        prospects: pr?.stats?.sent ?? 0,
        replies: pr?.stats?.replies ?? 0,
      });
    } finally { setLoading(false); }
  }, [demo]);
  useEffect(() => { void load(); }, [load]);
  // Sur PC / TV : rafraîchit tout seul chaque minute
  useEffect(() => { if (demo) return; const t = setInterval(() => void load(), 60_000); return () => clearInterval(t); }, [load, demo]);

  // Nouveautés depuis la dernière visite : comparées à ce que la carte a déjà montré (mémorisé sur l'appareil)
  useEffect(() => {
    if (demo || loading || !cars.length) return;
    const ids = [...cars.map(c => `car:${c.id}`), ...extra.sales.map(x => `sale:${x.id}`), ...extra.properties.map(x => `prop:${x.id}`), ...extra.imports.map(x => `imp:${x.id}`)];
    let seen: string[] | null = null;
    try { seen = JSON.parse(localStorage.getItem('dz:carte:seen') ?? 'null') as string[] | null; } catch { /* ignore */ }
    const known = new Set(seen ?? ids); // 1re visite : rien n'est « nouveau »
    const nw = ids.filter(id => !known.has(id));
    if (nw.length) { setFresh(nw); setFreshNote(nw); }
    try { localStorage.setItem('dz:carte:seen', JSON.stringify([...new Set([...(seen ?? []), ...ids])].slice(-2000))); } catch { /* ignore */ }
  }, [demo, loading, cars, extra]);

  // Une fois l'animation jouée, on ne la rejoue pas au rafraîchissement suivant
  useEffect(() => { if (!fresh.length) return; const t = setTimeout(() => setFresh([]), 16_000); return () => clearTimeout(t); }, [fresh]);
  // Démo : une nouvelle voiture arrive après quelques secondes, pour montrer l'effet au prospect
  useEffect(() => { if (!demo) return; const t = setTimeout(() => { setDemoArrival(true); setFresh(['car:demo-new', 'prop:p0', 'imp:i0', 'sale:s0']); }, 6000); return () => clearTimeout(t); }, [demo]);

  const world = useMemo<World>(() => {
    if (demo) {
      const w = demoWorld(demo.kind, demo.brand);
      if (demoArrival && w.cars.length) w.cars.push({ id: 'demo-new', name: 'Nouvelle Clio 6', status: 'dispo', booking: null, due: 0, alerts: [], badge: null });
      return { ...w, fresh };
    }
    const due = new Map((today?.toCollect ?? []).map(x => [x.id, x.due]));
    return { brand: 'FIK CONCIERGERIE', zones: ALL_ZONES, cars: buildCars(cars, bookings, reminders, due), ...extra, fresh };
  }, [demo, demoArrival, cars, bookings, reminders, today, extra, fresh]);
  const freshText = useMemo(() => {
    if (demo) return '';
    const n = (p: string) => freshNote.filter(f => f.startsWith(p)).length;
    return ([['car:', 'voiture'], ['sale:', 'véhicule à vendre'], ['prop:', 'bien'], ['imp:', 'import']] as const)
      .filter(([p]) => n(p)).map(([p, t]) => `${n(p)} ${t}${n(p) > 1 && !t.includes(' ') ? 's' : ''}`).join(', ');
  }, [freshNote, demo]);

  // Scène 3D (three.js chargé à la demande)
  useEffect(() => {
    let dead = false;
    void import('../carte/scene.ts').then(({ createScene }) => {
      if (dead || !host.current) return;
      api.current = createScene(host.current, p => { setPick(p); api.current?.focus(p); });
      setReady(true);
    });
    return () => { dead = true; api.current?.dispose(); api.current = null; };
  }, []);
  useEffect(() => { if (ready) api.current?.update(world); }, [ready, world]);
  const choose = (p: Pick) => { setPick(p); setSheet(null); api.current?.focus(p); };

  // Plein écran : vrai plein écran si le navigateur le permet (PC, Android), sinon la carte prend tout l'écran (iPhone)
  useEffect(() => {
    const on = () => { if (!document.fullscreenElement) setFull(false); };
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);
  const toggleFull = () => {
    if (full) { if (document.fullscreenElement) void document.exitFullscreen().catch(() => {}); setFull(false); return; }
    setFull(true);
    const el = wrap.current as (HTMLDivElement & { webkitRequestFullscreen?: () => void }) | null;
    if (el?.requestFullscreen) void el.requestFullscreen().catch(() => {});
    else el?.webkitRequestFullscreen?.();
  };
  useEffect(() => { const t = setTimeout(() => api.current?.resize(), 60); return () => clearTimeout(t); }, [full]);

  const pcLink = `${APP_URL}?carte=1`;
  const shareLink = async (url: string, title: string) => {
    const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
    try { await navigator.clipboard.writeText(url); say('Lien copié ✓'); }
    catch { if (nav.share) await nav.share({ title, url }).catch(() => {}); else window.prompt('Copie ce lien :', url); }
  };

  const counts = useMemo(() => {
    const o: Record<Status, number> = { dispo: 0, depart: 0, loue: 0, retour: 0, atelier: 0 };
    world.cars.forEach(m => { o[m.status]++; });
    return o;
  }, [world]);
  const total = world.cars.length || 1;
  const out = counts.loue + counts.retour;
  const urgent = reminders.filter(r => r.priority === 'HIGH').length;
  const car = pick?.kind === 'car' ? world.cars.find(m => m.id === pick.id) ?? null : null;
  const zone = pick?.kind === 'zone' ? pick.zone : null;
  const wa = (phone: string | null) => { const p = (phone || '').replace(/\D/g, ''); if (p) window.open(`https://wa.me/${p}`, '_blank'); };

  // ── Fiche (voiture ou métier) ───────────────────────────────────────────────
  const sheetRaw = sheet?.id ? raws[sheet.kind].find(x => x.id === sheet.id) ?? null : null;
  const panel = (car || zone) && (
    <div style={{ background: '#fff', color: '#0f172a', borderRadius: 14, padding: '11px 12px', boxShadow: '0 8px 30px rgba(0,0,0,0.25)', maxHeight: full ? '62vh' : undefined, overflowY: 'auto' }}>
      {sheet && !demo && (!sheet.id || sheetRaw) ? (
        <ItemSheet kind={sheet.kind} raw={sheetRaw} onClose={() => setSheet(null)} onChanged={() => void load()} onAsk={onAsk} />
      ) : car && !demo ? (
        <CarSheet m={car} car={cars.find(c => c.id === car.id)} onClose={() => choose(null)} onChanged={() => void load()}
          onAsk={onAsk} onOpen={onOpen} onRent={() => setAdding({ car: car.id })} />
      ) : car ? <>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 10, fontWeight: 800, color: '#fff', background: STATUS[car.status].badge, borderRadius: 6, padding: '2px 7px' }}>{STATUS[car.status].label.toUpperCase()}</span>
          <span style={{ fontSize: 14.5, fontWeight: 800, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{car.name}</span>
          <button onClick={() => choose(null)} style={{ background: 'none', border: 'none', fontSize: 16, cursor: 'pointer', color: '#64748b' }}>✕</button>
        </div>
        {car.booking ? (
          <div style={{ fontSize: 12.5, marginTop: 6, color: '#334155' }}>
            👤 <b>{car.booking.client_name}</b> · {fmtD(car.booking.start_date)} → {fmtD(car.booking.end_date)}
            {car.due > 0 && <span style={{ color: '#b45309', fontWeight: 700 }}> · {money(car.due)} à encaisser</span>}
          </div>
        ) : <div style={{ fontSize: 12.5, marginTop: 6, color: '#334155' }}>{car.status === 'atelier' ? 'À l\'atelier, aucune location en cours.' : 'Au parking — prête à partir.'}</div>}
        {car.alerts.slice(0, 2).map(a => <div key={a.id} style={{ fontSize: 11.5, marginTop: 5, color: a.priority === 'HIGH' ? '#b91c1c' : '#9a3412' }}>⚠️ {a.message}</div>)}
        <div style={{ fontSize: 11.5, marginTop: 7, color: '#64748b' }}>Dans la vraie version : tout se modifie ici (état, réparation, km, vidange, papiers, rappels, paiement…).</div>
      </> : zone && <ZonePanel zone={zone} world={world} demo={!!demo} onClose={() => choose(null)} onOpen={onOpen} onAsk={onAsk}
        onCar={id => choose({ kind: 'car', id })} onAdd={() => setAdding({})} onItem={(kind, id) => setSheet({ kind, id })}
        demands={raws.dem.map(x => ({ id: x.id, label: String(x['title'] ?? 'Demande'), sub: [x['client_name'], x['status']].filter(Boolean).join(' · ') }))} />}
    </div>
  );

  const mapBox: CSSProperties = full
    ? { position: 'fixed', inset: 0, zIndex: 900, background: '#bae6fd' }
    : { position: 'relative', borderRadius: 18, overflow: 'hidden', background: '#bae6fd', border: `1px solid ${C.border}`, height: 'min(68vh, 520px)', minHeight: 320 };

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: C.bg, color: C.text, fontFamily: C.font, padding: demo ? '14px 14px 30px' : '18px 14px 30px', boxSizing: 'border-box' }}>
      <style>{`
        .dz3-zone { background: rgba(255,255,255,.94); color: #0f172a; font: 700 11px ${C.font}; padding: 4px 9px; border-radius: 20px; white-space: nowrap; box-shadow: 0 2px 8px rgba(0,0,0,.18); }
        .dz3-zone b { color: #047857 }
        .dz3-brand { background: #0f766e; color: #fff; letter-spacing: .06em } .dz3-brand b { color: #fde68a }
        .dz3-badge { width: 18px; height: 18px; border-radius: 9px; color: #fff; font: 800 11px ${C.font}; display: grid; place-items: center; border: 2px solid #fff; box-shadow: 0 2px 6px rgba(0,0,0,.25) }
        .dz3-new { background: linear-gradient(90deg,#f59e0b,#ec4899); color: #fff; font: 800 11px ${C.font}; padding: 3px 9px; border-radius: 20px; white-space: nowrap; box-shadow: 0 3px 10px rgba(236,72,153,.45); animation: dz3N 1s ease-in-out infinite alternate }
        @keyframes dz3N { from { filter: brightness(1) } to { filter: brightness(1.25) } }
        .dz3-short { display: none } .dz3-compact .dz3-full { display: none } .dz3-compact .dz3-short { display: inline } .dz3-compact .dz3-zone { padding: 3px 7px; font-size: 11px }
        .dz3-price { background: #fef3c7; color: #92400e; font: 800 9.5px ${C.font}; padding: 2px 6px; border-radius: 6px; white-space: nowrap; box-shadow: 0 1px 4px rgba(0,0,0,.15) }
        @keyframes dz3P { 0%,100% { box-shadow: 0 0 0 0 rgba(239,68,68,.7) } 50% { box-shadow: 0 0 0 7px rgba(239,68,68,0) } } .dz3-pulse { animation: dz3P 1.2s ease-in-out infinite }
      `}</style>

      {demo && <div style={{ background: `${C.gold}18`, border: `1px solid ${C.gold}44`, color: C.gold, borderRadius: 12, padding: '8px 11px', fontSize: 12, marginBottom: 10 }}>
        Démo FIK Conciergerie — données d'exemple. Votre activité réelle, vue comme un jeu, sur téléphone, PC ou télé.
      </div>}

      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 12, gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11, letterSpacing: '0.18em', color: C.accent, fontWeight: 600, textTransform: 'uppercase' }}>{demo ? 'Carte live' : 'Dzaryx · Carte live 3D'}</div>
          <div style={{ fontSize: 24, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{demo ? world.brand : 'Tout mon business'}</div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          {!demo && <Top onClick={() => void shareLink(pcLink, 'Carte live Dzaryx')} title="Lien pour ouvrir la carte sur le PC">🔗 PC</Top>}
          <Top onClick={toggleFull} title="Plein écran">⛶</Top>
          {!demo && <Top onClick={() => void load()} title="Rafraîchir">↻</Top>}
        </div>
      </div>

      {/* Jauge de la journée */}
      {world.cars.length > 0 && <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: '11px 13px', marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: C.muted, fontWeight: 700, letterSpacing: '0.08em', marginBottom: 7 }}>
          <span>JAUGE DE LA JOURNÉE</span><span style={{ color: C.text }}>{out}/{world.cars.length} dehors · {Math.round(out / total * 100)}%</span>
        </div>
        <div style={{ display: 'flex', height: 9, borderRadius: 6, overflow: 'hidden', background: '#27272a' }}>
          {(['loue', 'retour', 'depart', 'dispo', 'atelier'] as Status[]).map(k => counts[k] > 0 && <div key={k} style={{ width: `${counts[k] / total * 100}%`, background: STATUS[k].badge }} />)}
        </div>
        {!demo && <div style={{ display: 'flex', gap: 14, marginTop: 9, fontSize: 12 }}>
          <span>🔑 <b>{today?.departures.length ?? counts.depart}</b> départs</span>
          <span>↩️ <b>{today?.returns.length ?? counts.retour}</b> retours</span>
          <span>💰 <b>{(today?.toCollect ?? []).reduce((s, x) => s + x.due, 0).toLocaleString('fr-FR')}</b> à encaisser</span>
        </div>}
      </div>}

      {/* Faire entrer toutes les locations */}
      {!demo && !loading && (
        <div style={{ background: `${C.accent}10`, border: `1px solid ${C.accent}33`, borderRadius: 14, padding: '10px 12px', marginBottom: 12 }}>
          <div style={{ fontSize: 12.5, lineHeight: 1.4 }}>
            <b>{bookings.length} location{bookings.length > 1 ? 's' : ''}</b> dans Dzaryx. Ajoute toutes les autres : la carte, les relances et les rapports deviennent justes.
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <Btn bg={C.accent} fg="#fff" onClick={() => setAdding({})}>➕ Ajouter des locations</Btn>
          </div>
        </div>
      )}

      {freshText && <div onClick={() => setFreshNote([])} style={{ background: 'linear-gradient(90deg,#f59e0b22,#ec489922)', border: '1px solid #ec489955', borderRadius: 12, padding: '8px 11px', fontSize: 12.5, marginBottom: 10, cursor: 'pointer' }}>
        ✨ <b>Nouveau sur la carte</b> depuis ta dernière visite : {freshText}
      </div>}

      {/* La carte 3D */}
      <div ref={wrap} style={mapBox}>
        <div ref={host} style={{ position: 'absolute', inset: 0, touchAction: 'none' }} />
        {(loading || !ready) && <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: '#0f172a', fontSize: 13, fontWeight: 700, background: 'rgba(255,255,255,0.35)', zIndex: 2, pointerEvents: 'none' }}>Construction de la ville…</div>}
        <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', flexDirection: 'column', gap: 5, zIndex: 3 }}>
          {full && <MapBtn onClick={toggleFull}>✕</MapBtn>}
          <MapBtn onClick={() => api.current?.zoom(1.5)}>+</MapBtn>
          <MapBtn onClick={() => api.current?.zoom(1 / 1.5)}>−</MapBtn>
          <MapBtn onClick={() => { setPick(null); api.current?.reset(); }}>⌂</MapBtn>
        </div>
        {full && <div style={{ position: 'absolute', top: 8, left: 8, zIndex: 3, background: 'rgba(15,23,42,0.82)', color: '#fff', borderRadius: 12, padding: '7px 11px', fontFamily: C.font }}>
          <div style={{ fontSize: 10, letterSpacing: '0.16em', color: '#6ee7b7', fontWeight: 700 }}>CARTE LIVE</div>
          <div style={{ fontSize: 15, fontWeight: 800 }}>{world.brand}</div>
          <div style={{ display: 'flex', gap: 9, fontSize: 11.5, marginTop: 3, flexWrap: 'wrap' }}>
            {(Object.keys(STATUS) as Status[]).map(k => <span key={k}><span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: 4, background: STATUS[k].badge, marginRight: 4 }} />{counts[k]}</span>)}
          </div>
        </div>}
        <div style={{ position: 'absolute', left: 8, bottom: 8, fontSize: 10.5, color: '#0f172a', opacity: 0.6, zIndex: 3, pointerEvents: 'none', fontFamily: C.font }}>
          1 doigt : déplacer · 2 doigts : zoom / tourner{full ? ' · souris : clic droit pour tourner' : ''}
        </div>
        {full && panel && <div style={{ position: 'absolute', left: 8, right: 8, bottom: 26, zIndex: 4, maxWidth: 460, margin: '0 auto' }}>{panel}</div>}
      </div>

      {!full && panel && <div style={{ marginTop: 8 }}>{panel}</div>}

      {/* Légende : touche → vole vers la zone */}
      {world.cars.length > 0 && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '10px 0 14px' }}>
        {(Object.keys(STATUS) as Status[]).map(k => (
          <button key={k} onClick={() => choose({ kind: 'zone', zone: ZONE_OF[k] })} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 600, cursor: 'pointer', borderRadius: 20, padding: '5px 10px', background: C.surface, color: C.text, border: `1px solid ${C.border}` }}>
            <span style={{ width: 8, height: 8, borderRadius: 4, background: STATUS[k].badge }} />{STATUS[k].label} <b>{counts[k]}</b>
          </button>
        ))}
      </div>}

      {/* Tous les métiers */}
      <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, letterSpacing: '0.1em', margin: '6px 0 8px' }}>{demo ? 'ZONES' : 'TOUS NOS MÉTIERS'}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 7, marginBottom: 14 }}>
        {world.zones.map(z => (
          <button key={z} onClick={() => choose({ kind: 'zone', zone: z })} style={{ textAlign: 'left', background: zone === z ? `${C.accent}18` : C.surface, border: `1px solid ${zone === z ? C.accent : C.border}`, borderRadius: 12, padding: '9px 10px', color: C.text, cursor: 'pointer' }}>
            <div style={{ fontSize: 13, fontWeight: 800 }}>{ZONE_INFO[z].icon} {ZONE_INFO[z].title}</div>
            <div style={{ fontSize: 11.5, color: C.muted, marginTop: 2 }}>{zoneCount(z, world)}</div>
          </button>
        ))}
      </div>

      {demo ? (
        <a href={`https://wa.me/${FIK_WA}?text=${encodeURIComponent(`Bonjour FIK, j'ai vu la démo Carte live${demo.brand ? ` (${demo.brand})` : ''}. Je veux la même pour mon entreprise.`)}`} target="_blank" rel="noreferrer"
          style={{ display: 'block', textAlign: 'center', background: '#22c55e', color: '#fff', fontWeight: 800, borderRadius: 12, padding: '12px 0', textDecoration: 'none', fontSize: 14 }}>
          💬 Je veux la même pour mon entreprise
        </a>
      ) : <>
        {/* Assistant */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: '12px 13px', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 800 }}>✨ Assistant {urgent > 0 && <span style={{ color: C.red, fontSize: 11 }}>· {urgent} urgent{urgent > 1 ? 's' : ''}</span>}</div>
            <button onClick={() => onAsk('Fais-moi le briefing du jour de tout le business : départs, retours, paiements à encaisser, voitures libres à pousser, ventes, imports, immobilier, demandes du site et les urgences dans l\'ordre.')}
              style={{ background: `${C.accent}18`, border: `1px solid ${C.accent}44`, borderRadius: 9, padding: '5px 10px', cursor: 'pointer', color: C.accent, fontWeight: 700, fontSize: 11.5 }}>Briefing du jour</button>
          </div>
          {reminders.length === 0 ? <div style={{ fontSize: 12, color: C.muted }}>Rien d'urgent sur le parc.</div> : reminders.slice(0, 4).map(r => (
            <div key={r.id} onClick={() => { const m = world.cars.find(x => norm(x.name) === norm(r.car_name)); if (m) choose({ kind: 'car', id: m.id }); }}
              style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '7px 0', borderTop: `1px solid ${C.border}`, cursor: 'pointer' }}>
              <span style={{ width: 7, height: 7, borderRadius: 4, marginTop: 5, flexShrink: 0, background: r.priority === 'HIGH' ? C.red : r.priority === 'MEDIUM' ? C.orange : C.muted }} />
              <div style={{ fontSize: 12, lineHeight: 1.35 }}><b>{r.car_name}</b> · {r.client_name}<div style={{ color: C.muted }}>{r.message}</div></div>
            </div>
          ))}
        </div>
        <PcLink url={pcLink} onCopy={() => void shareLink(pcLink, 'Carte live Dzaryx')} />
        {actor === 'kouider' && <SellOffer onCopy={u => void shareLink(u, 'Démo Carte live')} />}
      </>}

      {adding && <AddRentals cars={cars} actor={actor} initialCar={adding.car} onClose={() => setAdding(null)} onDone={n => { say(`${n} location${n > 1 ? 's' : ''} ajoutée${n > 1 ? 's' : ''} ✓`); void load(); }} />}
      {toast && <div style={{ position: 'fixed', left: '50%', bottom: 90, transform: 'translateX(-50%)', background: '#0f172a', color: '#fff', padding: '9px 14px', borderRadius: 12, fontSize: 13, fontWeight: 700, zIndex: 1100, boxShadow: '0 6px 20px rgba(0,0,0,.35)' }}>{toast}</div>}
    </div>
  );
}

function zoneCount(z: ZoneId, w: World): string {
  const n = (s: Status[]) => w.cars.filter(c => s.includes(c.status)).length;
  switch (z) {
    case 'agence': return w.pending ? `${w.pending} demande${w.pending > 1 ? 's' : ''} en attente` : 'Aucune demande en attente';
    case 'parking': return `${n(['dispo', 'depart'])} voiture${n(['dispo', 'depart']) > 1 ? 's' : ''} au parking`;
    case 'atelier': return `${n(['atelier'])} à l'atelier`;
    case 'ville': return `${n(['loue', 'retour'])} en location`;
    case 'vente': return w.sales.length ? `${w.sales.length} à vendre` : 'Bientôt — 0 à vendre';
    case 'port': return `${w.imports.length} import${w.imports.length > 1 ? 's' : ''} en cours`;
    case 'immo': return w.properties.length ? `${w.properties.length} bien${w.properties.length > 1 ? 's' : ''}` : 'Bientôt — 0 bien';
    case 'packs': return w.packs.length ? `${w.packs.length} pack${w.packs.length > 1 ? 's' : ''}` : 'Bientôt — 0 pack';
    case 'aeroport': return 'Livraison, accueil, transferts';
    case 'b2b': return w.prospects ? `${w.prospects} démarchées · ${w.replies} réponse${w.replies > 1 ? 's' : ''}` : 'Packs entreprises';
    case 'web': return w.sites ? `${w.sites} site${w.sites > 1 ? 's' : ''} en ligne` : 'Sites pour les commerces';
  }
}

function ZonePanel({ zone, world, demo, onClose, onOpen, onAsk, onCar, onAdd, onItem, demands }: {
  zone: ZoneId; world: World; demo: boolean; onClose: () => void; onOpen: (p: string) => void; onAsk: (p: string) => void; onCar: (id: string) => void; onAdd: () => void;
  onItem: (kind: SheetKind, id: string | null) => void; demands: Item[];
}) {
  const info = ZONE_INFO[zone];
  const cars = (s: Status[]) => world.cars.filter(c => s.includes(c.status));
  const list: Item[] | null =
    zone === 'parking' ? cars(['depart', 'dispo']).map(c => ({ id: c.id, label: c.name, sub: c.status === 'depart' ? `Départ aujourd'hui · ${c.booking?.client_name ?? ''}` : 'Disponible' }))
    : zone === 'atelier' ? cars(['atelier']).map(c => ({ id: c.id, label: c.name, sub: 'Indisponible' }))
    : zone === 'ville' ? cars(['loue', 'retour']).map(c => ({ id: c.id, label: c.name, sub: `${c.booking?.client_name ?? ''} · ${c.status === 'retour' ? 'retour aujourd\'hui' : `jusqu'au ${c.booking ? fmtD(c.booking.end_date) : ''}`}` }))
    : zone === 'vente' ? world.sales : zone === 'port' ? world.imports : zone === 'immo' ? world.properties : zone === 'packs' ? world.packs
    : zone === 'agence' && !demo ? demands : null;
  const isCar = zone === 'parking' || zone === 'atelier' || zone === 'ville';
  const itemKind = ({ vente: 'sale', port: 'imp', immo: 'prop', packs: 'pack', agence: 'dem' } as Partial<Record<ZoneId, SheetKind>>)[zone];
  const tap = demo ? undefined : isCar ? onCar : itemKind ? (id: string) => onItem(itemKind, id) : undefined;
  const actions: Array<[string, () => void]> = demo ? [] : ({
    agence: [['📥 Demandes du site', () => onOpen('leads')], ['📅 Réservations', () => onOpen('bookings')]],
    parking: [['➕ Ajouter des locations', onAdd], ['🚗 Parc', () => onOpen('fleet')]],
    atelier: [['🚗 Parc', () => onOpen('fleet')], ['✨ Dzaryx', () => onAsk('Quelles voitures sont indisponibles, pourquoi, et quand reviennent-elles ? Vidanges et papiers à prévoir ?')]],
    ville: [['📅 Réservations', () => onOpen('bookings')], ['➕ Ajouter des locations', onAdd]],
    vente: [['➕ Mettre en vente', () => onItem('sale', null)], ['🏷️ Véhicules à vendre', () => onOpen('fleet')], ['✨ Dzaryx', () => onAsk('Comment lancer la vente de véhicules d\'occasion : quels modèles acheter/importer pour revendre à Oran, à quel prix, et comment les mettre en vente sur le site ?')]],
    port: [['➕ Nouvel import', () => onItem('imp', null)], ['📥 Commandes d\'import', () => onOpen('leads')], ['✨ Dzaryx', () => onAsk('Fais le point sur mes importations de véhicules en cours et ce que je dois faire pour chacune.')]],
    immo: [['➕ Ajouter un bien', () => onItem('prop', null)], ['🏠 Immobilier', () => onOpen('immo')], ['✨ Dzaryx', () => onAsk('Aide-moi à lancer l\'immobilier : comment trouver mes premiers biens à louer ou vendre à Oran et les mettre sur le site ?')]],
    packs: [['➕ Nouveau pack', () => onItem('pack', null)], ['✨ Créer un pack avec Dzaryx', () => onAsk('Aide-moi à créer un pack séjour clé en main (voiture + logement + extras) pour le site, avec un prix.')]],
    aeroport: [['📥 Demandes', () => onOpen('leads')], ['✨ Dzaryx', () => onAsk('Quelles livraisons aéroport, accueils et transferts sont prévus ces prochains jours ?')]],
    b2b: [['📤 Démarchage', () => onOpen('demarchage')]],
    web: [['🌐 Sites clients', () => onOpen('sites')]],
  } as Record<ZoneId, Array<[string, () => void]>>)[zone];
  return <>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 14.5, fontWeight: 800, flex: 1 }}>{info.icon} {info.title}</span>
      <span style={{ fontSize: 11.5, color: '#475569', fontWeight: 700 }}>{zoneCount(zone, world)}</span>
      <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 16, cursor: 'pointer', color: '#64748b' }}>✕</button>
    </div>
    <div style={{ fontSize: 12, color: '#475569', marginTop: 4 }}>{info.desc}</div>
    {list && list.length > 0 && <div style={{ marginTop: 7, maxHeight: 170, overflowY: 'auto' }}>
      {list.slice(0, 30).map(x => (
        <div key={x.id} onClick={tap ? () => tap(x.id) : undefined} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '5px 0', borderTop: '1px solid #e2e8f0', fontSize: 12.5, cursor: tap ? 'pointer' : 'default' }}>
          <b style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.label}</b><span style={{ color: '#64748b', whiteSpace: 'nowrap' }}>{x.sub}{tap ? ' ›' : ''}</span>
        </div>
      ))}
    </div>}
    {list && list.length === 0 && <div style={{ fontSize: 12, color: '#64748b', marginTop: 6 }}>Rien pour le moment.</div>}
    {actions.length > 0 && <div style={{ display: 'flex', gap: 6, marginTop: 9, flexWrap: 'wrap' }}>
      {actions.map(([t, fn]) => <Btn key={t} bg="#f1f5f9" fg="#334155" onClick={fn}>{t}</Btn>)}
    </div>}
  </>;
}

function PcLink({ url, onCopy }: { url: string; onCopy: () => void }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: '12px 13px', marginBottom: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 800 }}>🖥️ Voir la carte sur ton PC</div>
      <div style={{ fontSize: 12, color: C.muted, margin: '4px 0 8px', lineHeight: 1.4 }}>
        Ouvre ce lien sur le PC : la carte s'affiche directement en grand et se met à jour toute seule chaque minute. La 1re fois, connecte-toi avec ton mot de passe Dzaryx. Touche ⛶ pour le vrai plein écran.
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <code style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11.5, background: '#0f0f14', borderRadius: 8, padding: '8px 9px', color: '#a7f3d0' }}>{url}</code>
        <Btn bg={C.accent} fg="#fff" onClick={onCopy}>Copier</Btn>
      </div>
    </div>
  );
}

// Offre FIK : vendre la Carte live à d'autres entreprises (démo publique personnalisée, données fictives)
function SellOffer({ onCopy }: { onCopy: (url: string) => void }) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<DemoKind>('location');
  const url = `${APP_URL}?demo=carte&k=${kind}${name.trim() ? `&n=${encodeURIComponent(name.trim())}` : ''}`;
  const msg = `Bonjour${name.trim() ? ` ${name.trim()}` : ''}, voici à quoi ressemblerait votre activité en direct, vue comme un jeu : chaque véhicule ou bien est à sa place (disponible, loué, à l'atelier, en vente…), les retards et paiements à encaisser sautent aux yeux, et on peut l'afficher en plein écran sur un PC ou une télé. Démo (données d'exemple) : ${url}\n— FIK Conciergerie`;
  const kinds: Array<[DemoKind, string]> = [['location', 'Loueur'], ['vente', 'Vente auto'], ['garage', 'Garage'], ['immo', 'Agence immo'], ['transport', 'Transport']];
  return (
    <div style={{ background: `linear-gradient(135deg, ${C.gold}14, ${C.surface})`, border: `1px solid ${C.gold}40`, borderRadius: 14, padding: '12px 13px' }}>
      <div style={{ fontSize: 13, fontWeight: 800 }}>💼 Offre FIK — vendre la Carte live</div>
      <div style={{ fontSize: 12, color: C.muted, margin: '4px 0 8px', lineHeight: 1.4 }}>
        Une démo à leur nom, avec des données d'exemple (aucune de tes vraies données). Tu peux aussi dire à Dzaryx : « envoie la démo carte au garage X ».
      </div>
      <input value={name} onChange={e => setName(e.target.value)} placeholder="Nom de l'entreprise (ex. Garage Benali)" style={{ width: '100%', boxSizing: 'border-box', background: '#0f0f14', border: `1px solid ${C.border}`, borderRadius: 9, padding: '8px 9px', color: C.text, fontSize: 13, marginBottom: 7 }} />
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 9 }}>
        {kinds.map(([k, t]) => <button key={k} onClick={() => setKind(k)} style={{ fontSize: 11.5, fontWeight: 700, borderRadius: 16, padding: '5px 10px', cursor: 'pointer', border: `1px solid ${kind === k ? C.gold : C.border}`, background: kind === k ? `${C.gold}25` : 'transparent', color: C.text }}>{t}</button>)}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <Btn bg={C.gold} fg="#1c1917" onClick={() => window.open(url, '_blank')}>👁️ Voir la démo</Btn>
        <Btn bg="#22c55e" fg="#fff" onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank')}>💬 Envoyer</Btn>
        <Btn bg="#334155" fg="#fff" onClick={() => onCopy(url)}>🔗 Copier le lien</Btn>
      </div>
    </div>
  );
}

function Top({ onClick, title, children }: { onClick: () => void; title: string; children: ReactNode }) {
  return <button onClick={onClick} title={title} style={{ background: `${C.accent}12`, border: `1px solid ${C.accent}33`, borderRadius: 10, padding: '7px 11px', cursor: 'pointer', color: C.accent, fontWeight: 700, fontSize: 13 }}>{children}</button>;
}
function MapBtn({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return <button onClick={onClick} style={{ width: 34, height: 34, borderRadius: 10, border: 'none', background: 'rgba(255,255,255,0.94)', color: '#0f172a', fontSize: 17, fontWeight: 800, cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>{children}</button>;
}
function Btn({ bg, fg, onClick, children }: { bg: string; fg: string; onClick: () => void; children: ReactNode }) {
  return <button onClick={onClick} style={{ background: bg, color: fg, border: 'none', borderRadius: 9, padding: '7px 10px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>{children}</button>;
}
