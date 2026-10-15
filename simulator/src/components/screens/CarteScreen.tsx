// Carte live 3D — tout le business FIK vu comme un jeu : agence, parking location, atelier, voitures qui roulent
// en ville, vente auto, port d'import, immobilier, packs séjour, aéroport, entreprises, FIK Sites.
// Pas de GPS : la position est symbolique, le statut est réel. Plein écran + lien pour l'ouvrir sur le PC.
// En démo (?demo=carte) : données fictives, rien n'est chargé du serveur → offre FIK à montrer aux prospects.
import { useState, useEffect, useCallback, useMemo, useRef, type ReactNode, type CSSProperties } from 'react';
import { apiFetch, business, type Car, type Booking, type SmartReminder, type TodayItem, type SaleVehicle, type SiteProperty } from '../../services/api.ts';
import { STATUS, ZONE_INFO, ALL_ZONES, buildCars, demoWorld, norm, ymd, addDays, monthMoney, fmtMoney, moneyTag, type Status, type World, type ZoneId, type DemoKind, type Item, type Money } from '../carte/data.ts';
import type { SceneApi, Pick, SkyMode, Weather } from '../carte/scene.ts';
import { Missions, buildQuests, useQuests, type Quest } from '../carte/Missions.tsx';
import { MePanel, meState, demoMe, type MeData } from '../carte/MePanel.tsx';
import { sfx, speak, hush, soundOn, setSound, ambientStart, ambientMood, ambientStop } from '../carte/sfx.ts';
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
  const [day, setDay] = useState(0);                     // barre de temps : 0 = aujourd'hui … +13 j
  const [showMoney, setShowMoney] = useState(false);     // 💶 étiquettes argent sur la carte
  const [month, setMonth] = useState(() => ymd(new Date()).slice(0, 7));
  const [sky, setSky] = useState<SkyMode>('auto');      // 🕒 heure réelle / ☀️ / 🌙
  const [wx, setWx] = useState<Weather | null>(null);
  const [sound, setSnd] = useState(soundOn);
  const [clock, setClock] = useState(() => new Date());
  const [tour, setTour] = useState<{ i: number; steps: Array<{ p: Pick; t: string }> } | null>(null);
  const [questsOpen, setQuestsOpen] = useState(false);
  const [rolling, setRolling] = useState<string[]>([]);   // missions dont la voiture est en train de sortir
  const [arrive, setArrive] = useState<string[]>([]);     // voitures qui rentrent au parking
  const [meData, setMeData] = useState<MeData | null>(() => demo ? demoMe() : null); // agenda du bonhomme Kouider   // plein écran : liste des missions par-dessus la carte
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

  // Météo réelle d'Oran (Open-Meteo, gratuit, sans clé) → pluie, nuages, vent sur la carte
  useEffect(() => {
    if (demo) return;
    const get = () => fetch('https://api.open-meteo.com/v1/forecast?latitude=35.70&longitude=-0.63&current=temperature_2m,weather_code,wind_speed_10m,cloud_cover&timezone=Africa%2FAlgiers')
      .then(r => r.json() as Promise<{ current?: { temperature_2m: number; weather_code: number; wind_speed_10m: number; cloud_cover: number } }>)
      .then(j => { const c = j.current; if (c) setWx({ code: c.weather_code, temp: Math.round(c.temperature_2m), wind: c.wind_speed_10m, clouds: c.cloud_cover }); })
      .catch(() => {});
    void get(); const t = setInterval(get, 15 * 60_000); return () => clearInterval(t);
  }, [demo]);
  useEffect(() => { const t = setInterval(() => setClock(new Date()), 30_000); return () => clearInterval(t); }, []);
  // Agenda de Kouider (= agenda FIK) pour son bonhomme — toutes les 5 min
  const loadMe = useCallback(() => {
    if (demo || actor !== 'kouider') return;
    void apiFetch<MeData>('/api/calendar/me').then(setMeData).catch(() => {});
  }, [demo, actor]);
  useEffect(() => { loadMe(); const t = setInterval(loadMe, 5 * 60_000); return () => clearInterval(t); }, [loadMe]);

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

  const cash = useMemo(() => monthMoney(cars, bookings, month), [cars, bookings, month]);
  // Barre de temps : pour chacun des 14 prochains jours, combien de voitures sont libres / dehors / partent / rentrent
  const days = useMemo(() => {
    if (demo) return [];
    const t0 = ymd(new Date());
    return Array.from({ length: 14 }, (_, i) => {
      const d = addDays(t0, i);
      const o: Record<Status, number> = { dispo: 0, depart: 0, loue: 0, retour: 0, atelier: 0 };
      buildCars(cars, bookings, [], new Map(), d).forEach(m => { o[m.status]++; });
      return { d, ...o, out: o.loue + o.retour + o.depart };
    });
  }, [demo, cars, bookings]);
  const when = day === 0 ? 'aujourd\'hui' : day === 1 ? 'demain' : `le ${fmtD(addDays(ymd(new Date()), day))}`;
  const stLabel = (k: Status) => STATUS[k].label.replace('aujourd\'hui', when);

  const world = useMemo<World>(() => {
    if (demo) {
      const w = demoWorld(demo.kind, demo.brand);
      if (demoArrival && w.cars.length) w.cars.push({ id: 'demo-new', name: 'Nouvelle Clio 6', status: 'dispo', booking: null, due: 0, alerts: [], badge: null });
      return { ...w, fresh };
    }
    const due = new Map((today?.toCollect ?? []).map(x => [x.id, x.due]));
    const list = buildCars(cars, bookings, reminders, due, addDays(ymd(new Date()), day));
    if (showMoney) list.forEach(m => { m.money = moneyTag(cash.byCar.get(m.id)); });
    return { brand: 'FIK CONCIERGERIE', zones: ALL_ZONES, cars: list, ...extra, fresh, showMoney };
  }, [demo, demoArrival, cars, bookings, reminders, today, extra, fresh, day, showMoney, cash]);
  const freshText = useMemo(() => {
    if (demo) return '';
    const n = (p: string) => freshNote.filter(f => f.startsWith(p)).length;
    return ([['car:', 'voiture'], ['sale:', 'véhicule à vendre'], ['prop:', 'bien'], ['imp:', 'import']] as const)
      .filter(([p]) => n(p)).map(([p, t]) => `${n(p)} ${t}${n(p) > 1 && !t.includes(' ') ? 's' : ''}`).join(', ');
  }, [freshNote, demo]);

  // Missions du jour (toujours sur aujourd'hui, même si la barre de temps regarde un autre jour)
  const todayWorld = useMemo<World>(() => {
    if (demo || day === 0) return world;
    const due = new Map((today?.toCollect ?? []).map(x => [x.id, x.due]));
    return { ...world, cars: buildCars(cars, bookings, reminders, due) };
  }, [demo, day, world, cars, bookings, reminders, today]);
  const asleep = useMemo(() => demo ? [] : cars.filter(c => !cash.byCar.get(c.id)?.days).map(c => c.id), [demo, cars, cash]);
  const quests = useMemo(() => buildQuests(todayWorld, { asleep }), [todayWorld, asleep]);
  const tz = demo ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'Africa/Algiers';
  const todayKey = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(clock);
  const Q = useQuests(quests, todayKey, !demo && !loading && cars.length > 0, (q, perfect) => {
    sfx.coin(); api.current?.burst(q.pick ?? null, q.gain ?? `+${q.xp} XP`);
    // La voiture bouge vraiment : remise → elle sort du parking ; retour → elle rentre se garer
    const carId = q.pick?.kind === 'car' ? q.pick.id : null;
    if (carId && q.id.startsWith('dep:')) { setRolling(r => [...r, q.id]); setTimeout(() => api.current?.driveOut(carId, () => setRolling(r => r.filter(x => x !== q.id))), 700); }
    if (carId && q.id.startsWith('ret:')) { setArrive([carId]); setTimeout(() => setArrive(a => a.filter(x => x !== carId)), 8000); }
    say(`✅ ${q.title} · +${q.xp} XP`);
    if (perfect) setTimeout(() => { sfx.fanfare(); api.current?.burst({ kind: 'zone', zone: 'agence' }, '🏆 Journée parfaite !'); api.current?.fireworks(); }, 900);
  });
  const targets = useMemo(() => day === 0 ? Q.all.filter(q => !Q.done.includes(q.id) && q.pick).map(q => { const p = q.pick!; return p.kind === 'car' ? p.id : p.kind === 'zone' ? `zone:${p.zone}` : 'me'; }) : [], [Q.all, Q.done, day]);
  const goQuest = (q: Quest) => {
    sfx.tap(); setQuestsOpen(false);
    if (q.ask) { onAsk(q.ask); return; }
    if (q.pick) { if (day !== 0) setDay(0); choose(q.pick); }
  };

  // Visite guidée : la caméra fait le tour du business et raconte la journée (voix si 🔊)
  const startTour = () => {
    const w = todayWorld, n = (st: Status[]) => w.cars.filter(c => st.includes(c.status)).length;
    const pl = (k: number, one: string, many = `${one}s`) => `${k} ${k > 1 ? many : one}`;
    const hello = (() => { const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: 'numeric', hourCycle: 'h23' }).format(new Date())); return h < 12 ? 'Bonjour' : h < 18 ? 'Bon après-midi' : 'Bonsoir'; })();
    const left = Q.all.filter(q => !Q.done.includes(q.id)).length;
    const steps: Array<{ p: Pick; t: string }> = [
      { p: { kind: 'zone', zone: 'agence' }, t: `${hello}${demo ? '' : ' Kouider'} ! ${wx ? `${wx.temp} degrés à Oran. ` : ''}${w.pending ? `${pl(w.pending, 'demande')} du site t'attendent à l'agence.` : 'Aucune demande en attente à l\'agence.'}` },
    ];
    if (demo || actor === 'kouider') steps.push({ p: { kind: 'me' }, t: `${demo ? 'Vous' : 'Toi'} : ${me.bubble.replace(/^\S+\s/, '')}.` });
    if (w.cars.length) {
      steps.push({ p: { kind: 'zone', zone: 'parking' }, t: `Au parking : ${pl(n(['dispo', 'depart']), 'voiture prête', 'voitures prêtes')}${n(['depart']) ? `, dont ${pl(n(['depart']), 'départ')} aujourd'hui` : ''}.` });
      steps.push({ p: { kind: 'zone', zone: 'ville' }, t: `En ville : ${pl(n(['loue', 'retour']), 'voiture louée', 'voitures louées')}${n(['retour']) ? `, ${pl(n(['retour']), 'retour')} prévu${n(['retour']) > 1 ? 's' : ''} aujourd'hui` : ''}.` });
      if (n(['atelier'])) steps.push({ p: { kind: 'zone', zone: 'atelier' }, t: `À l'atelier : ${pl(n(['atelier']), 'voiture')} indisponible${n(['atelier']) > 1 ? 's' : ''}.` });
      const due = w.cars.reduce((s2, c) => s2 + c.due, 0);
      if (due > 0) steps.push({ p: { kind: 'zone', zone: 'agence' }, t: `Argent à encaisser : ${due.toLocaleString('fr-FR')} euros.` });
    }
    if (w.zones.includes('vente') && w.sales.length) steps.push({ p: { kind: 'zone', zone: 'vente' }, t: `Vente auto : ${pl(w.sales.length, 'véhicule')} à vendre.` });
    if (w.zones.includes('port') && w.imports.length) steps.push({ p: { kind: 'zone', zone: 'port' }, t: `Au port : ${pl(w.imports.length, 'import')} en cours.` });
    if (w.zones.includes('immo') && w.properties.length) steps.push({ p: { kind: 'zone', zone: 'immo' }, t: `Immobilier : ${pl(w.properties.length, 'bien')}.` });
    steps.push({ p: null, t: left ? `Tu as ${pl(left, 'mission')} aujourd'hui. Les flèches dorées te montrent où aller. C'est parti !` : 'Tout est réglé pour aujourd\'hui. Journée parfaite !' });
    setPick(null); setSheet(null); sfx.whoosh();
    setTour({ i: 0, steps });
  };
  useEffect(() => {
    if (!tour) return;
    const st = tour.steps[tour.i];
    if (!st) { setTour(null); if (!Q.all.some(q => !Q.done.includes(q.id))) api.current?.fireworks(); return; }
    api.current?.focus(st.p);
    let next = false;
    const go = () => { if (next) return; next = true; setTour(t => t && { ...t, i: t.i + 1 }); };
    const spoke = speak(st.t, () => setTimeout(go, 500));
    const t = setTimeout(go, spoke ? 12_000 : 3800);
    return () => clearTimeout(t);
  }, [tour?.i, !!tour]); // eslint-disable-line react-hooks/exhaustive-deps
  const stopTour = () => { hush(); setTour(null); api.current?.focus(null); };

  // Scène 3D (three.js chargé à la demande)
  useEffect(() => {
    let dead = false;
    void import('../carte/scene.ts').then(({ createScene }) => {
      if (dead || !host.current) return;
      api.current = createScene(host.current, p => { if (p) sfx.tap(); setPick(p); api.current?.focus(p); });
      setReady(true);
    });
    return () => { dead = true; api.current?.dispose(); api.current = null; };
  }, []);
  // Panneau LED sur l'agence : les chiffres clés qui défilent
  const led = useMemo(() => {
    const c = todayWorld.cars, n = (st: Status) => c.filter(x => x.status === st).length;
    const parts = demo ? [`Bienvenue chez ${world.brand}`] : [`CA ${monthName(month).split(' ')[0]} : ${fmtMoney(cash.total.ca)}`];
    if (c.length) parts.push(`${n('dispo')} libres`, `${n('depart')} départs`, `${n('retour')} retours`, `${c.filter(x => x.status === 'loue' || x.status === 'retour').length}/${c.length} dehors`);
    return parts.join(' ★ ');
  }, [todayWorld, demo, world.brand, month, cash]);
  // Ce que la carte montre aujourd'hui tient compte des missions faites : clés remises → la voiture roule en ville,
  // retour récupéré → elle est au parking (même avant que la réservation soit clôturée)
  const shown = useMemo<World>(() => {
    if (day !== 0) return world;
    const doneIds = new Set(Q.done.filter(id => !rolling.includes(id)));
    return { ...world, cars: world.cars.map(m => {
      const b = m.booking?.id;
      if (b && m.status === 'depart' && doneIds.has(`dep:${b}`)) return { ...m, status: 'loue' as Status, badge: m.badge?.t === '🔑' ? null : m.badge };
      if (b && m.status === 'retour' && doneIds.has(`ret:${b}`)) return { ...m, status: 'dispo' as Status, badge: m.badge?.t === '↩' ? null : m.badge };
      return m;
    }) };
  }, [world, day, Q.done, rolling]);
  const me = useMemo(() => meState(meData, demo ? 'Vous' : 'Kouider', Q.all.filter(q => !Q.done.includes(q.id)).length, clock), [meData, demo, Q.all, Q.done, clock]);
  useEffect(() => { if (ready) api.current?.setMe(demo || actor === 'kouider' ? me : null); }, [ready, me, demo, actor]);
  useEffect(() => { if (ready) api.current?.update({ ...shown, targets, led, arrive }); }, [ready, shown, targets, led]); // eslint-disable-line react-hooks/exhaustive-deps
  // Ambiance sonore : démarre au premier toucher sur la carte (règle des navigateurs), suit jour/nuit et pluie
  useEffect(() => {
    if (!sound || !ready) { ambientStop(); return; }
    const el = wrap.current;
    const go = () => { ambientStart(); const m = api.current?.mood(); if (m) ambientMood(m); };
    el?.addEventListener('pointerdown', go);
    const t = setInterval(() => { const m = api.current?.mood(); if (m) ambientMood(m); }, 4000);
    const vis = () => { if (document.hidden) ambientStop(); };
    document.addEventListener('visibilitychange', vis);
    return () => { el?.removeEventListener('pointerdown', go); clearInterval(t); document.removeEventListener('visibilitychange', vis); ambientStop(); };
  }, [sound, ready]);
  useEffect(() => { if (ready) api.current?.setSky(sky, tz); }, [ready, sky, tz]);
  useEffect(() => { if (ready) api.current?.setWeather(wx); }, [ready, wx]);
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
  const car = pick?.kind === 'car' ? shown.cars.find(m => m.id === pick.id) ?? null : null;
  const zone = pick?.kind === 'zone' ? pick.zone : null;
  const meOpen = pick?.kind === 'me';
  const wa = (phone: string | null) => { const p = (phone || '').replace(/\D/g, ''); if (p) window.open(`https://wa.me/${p}`, '_blank'); };

  // ── Fiche (voiture ou métier) ───────────────────────────────────────────────
  const sheetRaw = sheet?.id ? raws[sheet.kind].find(x => x.id === sheet.id) ?? null : null;
  const panel = (car || zone || meOpen) && (
    <div style={{ background: '#fff', color: '#0f172a', borderRadius: 14, padding: '11px 12px', boxShadow: '0 8px 30px rgba(0,0,0,0.25)', maxHeight: full ? '62vh' : undefined, overflowY: 'auto' }}>
      {meOpen ? (
        <MePanel data={meData} state={me} demo={!!demo} onClose={() => choose(null)} onAsk={onAsk} onChanged={loadMe} />
      ) : sheet && !demo && (!sheet.id || sheetRaw) ? (
        <ItemSheet kind={sheet.kind} raw={sheetRaw} onClose={() => setSheet(null)} onChanged={() => void load()} onAsk={onAsk} />
      ) : car && !demo ? (
        <CarSheet m={car} car={cars.find(c => c.id === car.id)} money={cash.byCar.get(car.id)} monthLabel={monthName(month)} actor={actor} onClose={() => choose(null)} onChanged={() => void load()}
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
      </> : zone && <ZonePanel zone={zone} world={world} demo={!!demo} when={when} onClose={() => choose(null)} onOpen={onOpen} onAsk={onAsk}
        onCar={id => choose({ kind: 'car', id })} onAdd={() => setAdding({})} onItem={(kind, id) => setSheet({ kind, id })}
        demands={raws.dem.map(x => ({ id: x.id, label: String(x['title'] ?? 'Demande'), sub: [x['client_name'], x['status']].filter(Boolean).join(' · ') }))} />}
    </div>
  );

  // Plein écran sur iPhone : décaler sous l'encoche / la barre d'état et au-dessus de la barre du bas
  const sTop = full ? 'calc(8px + env(safe-area-inset-top, 0px))' : 8;
  const sBot = (px: number) => full ? `calc(${px}px + env(safe-area-inset-bottom, 0px))` : px;
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
        .dz3-money { background: #fef3c7; color: #92400e; font: 800 10px ${C.font}; padding: 2px 6px; border-radius: 7px; white-space: nowrap; border: 1px solid #f59e0b; box-shadow: 0 2px 6px rgba(0,0,0,.2); cursor: pointer }
        .dz3-led { width: 104px; overflow: hidden; background: #050505; border: 2px solid #3f3f46; border-radius: 4px; padding: 3px 0; box-shadow: 0 0 12px rgba(251,191,36,.35); cursor: pointer }
        .dz3-led span { display: inline-block; white-space: nowrap; padding-left: 100%; font: 800 9.5px ui-monospace, Menlo, monospace; color: #fbbf24; text-shadow: 0 0 6px #f59e0b; animation: dz3L 14s linear infinite }
        @keyframes dz3L { to { transform: translateX(-100%) } }
        .dz3-me { display: flex; flex-direction: column; align-items: center; background: #0f766e; color: #fff; font: 700 10.5px ${C.font}; padding: 4px 9px; border-radius: 12px; white-space: nowrap; box-shadow: 0 4px 14px rgba(15,118,110,.45); border: 2px solid #fbbf24; max-width: 220px }
        .dz3-me b { font-size: 11.5px; color: #fde68a } .dz3-me span { overflow: hidden; text-overflow: ellipsis; max-width: 200px }
        .dz3-me i { font-style: normal; display: none } .dz3-me-far i { display: inline } .dz3-me-far span { display: none } .dz3-me-far { padding: 3px 8px }
        .dz3-me-alert { background: #b91c1c; box-shadow: 0 4px 14px rgba(185,28,28,.45) }
        .dz3-compact .dz3-me span { max-width: 140px }
        .dz3-name { background: rgba(15,23,42,.82); color: #fff; font: 700 9.5px ${C.font}; padding: 2px 6px; border-radius: 6px; white-space: nowrap; transform: translateY(14px) }
        .dz3-gain { background: linear-gradient(90deg,#fbbf24,#f59e0b); color: #1c1917; font: 900 15px ${C.font}; padding: 5px 12px; border-radius: 20px; white-space: nowrap; box-shadow: 0 6px 20px rgba(245,158,11,.55); border: 2px solid #fff }
        @keyframes dz3T { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: none } }
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
          <span>{day === 0 ? 'JAUGE DE LA JOURNÉE' : `PRÉVISION — ${when.toUpperCase()}`}</span><span style={{ color: C.text }}>{out}/{world.cars.length} dehors · {Math.round(out / total * 100)}%</span>
        </div>
        <div style={{ display: 'flex', height: 9, borderRadius: 6, overflow: 'hidden', background: '#27272a' }}>
          {(['loue', 'retour', 'depart', 'dispo', 'atelier'] as Status[]).map(k => counts[k] > 0 && <div key={k} style={{ width: `${counts[k] / total * 100}%`, background: STATUS[k].badge }} />)}
        </div>
        {!demo && (day === 0 ? <div style={{ display: 'flex', gap: 14, marginTop: 9, fontSize: 12 }}>
          <span>🔑 <b>{today?.departures.length ?? counts.depart}</b> départs</span>
          <span>↩️ <b>{today?.returns.length ?? counts.retour}</b> retours</span>
          <span>💰 <b>{(today?.toCollect ?? []).reduce((s, x) => s + x.due, 0).toLocaleString('fr-FR')}</b> à encaisser</span>
        </div> : <div style={{ display: 'flex', gap: 14, marginTop: 9, fontSize: 12, flexWrap: 'wrap' }}>
          <span>🔑 <b>{counts.depart}</b> départs</span>
          <span>↩️ <b>{counts.retour}</b> retours</span>
          <span style={{ color: counts.dispo === 0 ? C.red : undefined }}>🅿️ <b>{counts.dispo}</b> libre{counts.dispo > 1 ? 's' : ''}{counts.dispo === 0 ? ' — complet' : ''}</span>
        </div>)}
        {days.length > 0 && <TimeBar days={days} day={day} setDay={setDay} total={world.cars.length} />}
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
        <div style={{ position: 'absolute', top: sTop, right: 8, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5, zIndex: 3 }}>
          {full && <button onClick={toggleFull} aria-label="Quitter le plein écran" style={{ height: 34, borderRadius: 10, border: 'none', background: '#dc2626', color: '#fff', fontSize: 12.5, fontWeight: 800, cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.25)', padding: '0 10px', whiteSpace: 'nowrap' }}>✕ Quitter</button>}
          <MapBtn onClick={() => api.current?.zoom(1.5)}>+</MapBtn>
          <MapBtn onClick={() => api.current?.zoom(1 / 1.5)}>−</MapBtn>
          <MapBtn onClick={() => { setPick(null); api.current?.reset(); }}>⌂</MapBtn>
          {!demo && <MapBtn onClick={() => setShowMoney(v => !v)} on={showMoney}>💶</MapBtn>}
          <MapBtn onClick={() => setSky(m => m === 'auto' ? 'jour' : m === 'jour' ? 'nuit' : 'auto')}>{sky === 'auto' ? '🕒' : sky === 'jour' ? '☀️' : '🌙'}</MapBtn>
        </div>
        {/* Bas de la carte : missions + visite guidée + son */}
        <div style={{ position: 'absolute', left: 8, right: 8, bottom: sBot(10), zIndex: 3, display: 'flex', gap: 6, alignItems: 'center', pointerEvents: 'none' }}>
          {Q.all.length > 0 && <button onClick={() => { sfx.tap(); if (full) setQuestsOpen(v => !v); else wrap.current?.parentElement?.querySelector<HTMLElement>('[data-missions]')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }}
            style={{ ...pill, color: Q.done.length === Q.all.length ? '#1c1917' : '#fff', background: Q.done.length === Q.all.length ? 'linear-gradient(90deg,#fbbf24,#f59e0b)' : 'linear-gradient(90deg,#6366f1,#8b5cf6)', boxShadow: '0 4px 14px rgba(99,102,241,.45)' }}>
            {Q.done.length === Q.all.length ? '🏆' : '🎯'} {Q.done.length}/{Q.all.length}
          </button>}
          <button onClick={() => tour ? stopTour() : startTour()} style={{ ...pill, background: tour ? '#dc2626' : 'rgba(15,23,42,0.86)', color: '#fff' }}>{tour ? '■ Stop' : '▶ Visite'}</button>
          <span style={{ flex: 1 }} />
          <button onClick={() => { const v = !sound; setSound(v); setSnd(v); if (!v) hush(); else sfx.tap(); }} aria-label="Son" style={{ ...pill, background: 'rgba(255,255,255,0.94)', color: '#0f172a', padding: '7px 10px' }}>{sound ? '🔊' : '🔇'}</button>
        </div>
        {/* Heure + météo réelle d'Oran */}
        {!full && <div style={{ position: 'absolute', top: 8, left: 8, zIndex: 3, background: 'rgba(15,23,42,0.78)', color: '#fff', borderRadius: 11, padding: '5px 9px', fontSize: 12, fontWeight: 800, fontFamily: C.font, pointerEvents: 'none' }}>
          {wxIcon(wx, clock, tz)} {wx ? `${wx.temp}° · ` : ''}{clock.toLocaleTimeString('fr-FR', { timeZone: tz, hour: '2-digit', minute: '2-digit' })}{demo ? '' : ' Oran'}
        </div>}
        {full && questsOpen && <div style={{ position: 'absolute', left: 8, right: 8, bottom: sBot(64), zIndex: 5, maxWidth: 460, margin: '0 auto', maxHeight: '60vh', overflowY: 'auto' }}>
          <Missions compact all={Q.all} done={Q.done} xp={Q.xp} streak={Q.streak} onGo={goQuest} onDone={q => Q.complete(q)} onUndo={Q.undo} />
        </div>}
        {/* Visite guidée : sous-titres */}
        {tour && tour.steps[tour.i] && <div key={tour.i} onClick={stopTour} style={{ position: 'absolute', left: 10, right: 10, bottom: sBot(64), zIndex: 6, maxWidth: 520, margin: '0 auto', background: 'rgba(15,23,42,0.9)', color: '#fff', borderRadius: 16, padding: '12px 14px', fontFamily: C.font, fontSize: 15, fontWeight: 700, lineHeight: 1.4, boxShadow: '0 10px 30px rgba(0,0,0,.35)', animation: 'dz3T .35s ease-out', cursor: 'pointer' }}>
          <div style={{ fontSize: 10, letterSpacing: '0.16em', color: '#a5b4fc', fontWeight: 800, marginBottom: 3 }}>VISITE GUIDÉE · {tour.i + 1}/{tour.steps.length} · toucher pour arrêter</div>
          {tour.steps[tour.i]!.t}
        </div>}
        {full && <div style={{ position: 'absolute', top: sTop, left: 8, zIndex: 3, background: 'rgba(15,23,42,0.82)', color: '#fff', borderRadius: 12, padding: '7px 11px', fontFamily: C.font }}>
          <div style={{ fontSize: 10, letterSpacing: '0.16em', color: '#6ee7b7', fontWeight: 700 }}>CARTE LIVE</div>
          <div style={{ fontSize: 15, fontWeight: 800 }}>{world.brand}</div>
          <div style={{ fontSize: 11.5, fontWeight: 700, opacity: 0.9 }}>{wxIcon(wx, clock, tz)} {wx ? `${wx.temp}° · ` : ''}{clock.toLocaleTimeString('fr-FR', { timeZone: tz, hour: '2-digit', minute: '2-digit' })}{demo ? '' : ' Oran'}</div>
          <div style={{ display: 'flex', gap: 9, fontSize: 11.5, marginTop: 3, flexWrap: 'wrap' }}>
            {(Object.keys(STATUS) as Status[]).map(k => <span key={k}><span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: 4, background: STATUS[k].badge, marginRight: 4 }} />{counts[k]}</span>)}
          </div>
        </div>}
        {day > 0 && <div onClick={() => setDay(0)} style={{ position: 'absolute', top: full ? 'calc(96px + env(safe-area-inset-top, 0px))' : 42, left: 8, zIndex: 3, background: '#4f46e5', color: '#fff', borderRadius: 12, padding: '6px 10px', fontSize: 12, fontWeight: 800, cursor: 'pointer', fontFamily: C.font, boxShadow: '0 3px 10px rgba(79,70,229,.4)' }}>
          🕒 {when.charAt(0).toUpperCase() + when.slice(1)} · revenir à aujourd'hui ✕
        </div>}
        {full && panel && !questsOpen && !tour && <div style={{ position: 'absolute', left: 8, right: 8, bottom: sBot(26), zIndex: 4, maxWidth: 460, margin: '0 auto' }}>{panel}</div>}
      </div>

      {!full && panel && <div style={{ marginTop: 8 }}>{panel}</div>}

      {(Q.all.length > 0 || !loading) && <div data-missions style={{ marginTop: 10 }}><Missions all={Q.all} done={Q.done} xp={Q.xp} streak={Q.streak} onGo={goQuest} onDone={q => Q.complete(q)} onUndo={Q.undo} /></div>}

      {/* Légende : touche → vole vers la zone */}
      {world.cars.length > 0 && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '10px 0 14px' }}>
        {(Object.keys(STATUS) as Status[]).map(k => (
          <button key={k} onClick={() => choose({ kind: 'zone', zone: ZONE_OF[k] })} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 600, cursor: 'pointer', borderRadius: 20, padding: '5px 10px', background: C.surface, color: C.text, border: `1px solid ${C.border}` }}>
            <span style={{ width: 8, height: 8, borderRadius: 4, background: STATUS[k].badge }} />{stLabel(k)} <b>{counts[k]}</b>
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
        <MoneyCard money={cash} cars={world.cars} month={month} setMonth={setMonth} on={showMoney} toggle={() => setShowMoney(v => !v)}
          onCar={id => choose({ kind: 'car', id })} onAsk={onAsk} />

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
      {toast && <div style={{ position: 'fixed', left: '50%', bottom: 90, transform: 'translateX(-50%)', background: '#0f172a', color: '#fff', padding: '9px 14px', borderRadius: 12, fontSize: 13, fontWeight: 700, zIndex: 1100, whiteSpace: 'nowrap', maxWidth: '92vw', overflow: 'hidden', textOverflow: 'ellipsis', boxShadow: '0 6px 20px rgba(0,0,0,.35)' }}>{toast}</div>}
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

function ZonePanel({ zone, world, demo, when, onClose, onOpen, onAsk, onCar, onAdd, onItem, demands }: {
  zone: ZoneId; world: World; demo: boolean; when: string; onClose: () => void; onOpen: (p: string) => void; onAsk: (p: string) => void; onCar: (id: string) => void; onAdd: () => void;
  onItem: (kind: SheetKind, id: string | null) => void; demands: Item[];
}) {
  const info = ZONE_INFO[zone];
  const cars = (s: Status[]) => world.cars.filter(c => s.includes(c.status));
  const list: Item[] | null =
    zone === 'parking' ? cars(['depart', 'dispo']).map(c => ({ id: c.id, label: c.name, sub: c.status === 'depart' ? `Départ ${when} · ${c.booking?.client_name ?? ''}` : 'Disponible' }))
    : zone === 'atelier' ? cars(['atelier']).map(c => ({ id: c.id, label: c.name, sub: 'Indisponible' }))
    : zone === 'ville' ? cars(['loue', 'retour']).map(c => ({ id: c.id, label: c.name, sub: `${c.booking?.client_name ?? ''} · ${c.status === 'retour' ? `retour ${when}` : `jusqu'au ${c.booking ? fmtD(c.booking.end_date) : ''}`}` }))
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
function MapBtn({ onClick, on, children }: { onClick: () => void; on?: boolean; children: ReactNode }) {
  return <button onClick={onClick} style={{ width: 34, height: 34, borderRadius: 10, border: on ? '2px solid #f59e0b' : 'none', background: on ? '#fef3c7' : 'rgba(255,255,255,0.94)', color: '#0f172a', fontSize: 17, fontWeight: 800, cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>{children}</button>;
}
function Btn({ bg, fg, onClick, children }: { bg: string; fg: string; onClick: () => void; children: ReactNode }) {
  return <button onClick={onClick} style={{ background: bg, color: fg, border: 'none', borderRadius: 9, padding: '7px 10px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>{children}</button>;
}

const monthName = (m: string) => new Date(m + '-15T12:00:00').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
const shiftMonth = (m: string, n: number) => { const d = new Date(m + '-15T12:00:00'); d.setMonth(d.getMonth() + n); return ymd(d).slice(0, 7); };

// Barre de temps : 14 jours, chaque colonne = part du parc dehors ce jour-là. Toucher un jour → la ville passe à ce jour.
function TimeBar({ days, day, setDay, total }: { days: Array<{ d: string; dispo: number; depart: number; retour: number; out: number }>; day: number; setDay: (n: number) => void; total: number }) {
  const t = Math.max(1, total);
  return (
    <div style={{ marginTop: 11 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: C.muted, fontWeight: 700, letterSpacing: '0.08em', marginBottom: 5 }}>
        <span>🕒 BARRE DE TEMPS — TOUCHE UN JOUR</span><span>libres / {total}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(14, 1fr)', gap: 3 }}>
        {days.map((x, i) => {
          const full = x.dispo === 0, pct = x.out / t;
          const dd = new Date(x.d + 'T12:00:00');
          return (
            <button key={x.d} onClick={() => setDay(i)} title={`${x.d} : ${x.out} dehors, ${x.dispo} libres, ${x.depart} départs, ${x.retour} retours`}
              style={{ padding: 0, border: `1.5px solid ${day === i ? '#818cf8' : 'transparent'}`, borderRadius: 7, background: day === i ? '#312e81' : 'transparent', cursor: 'pointer', color: C.text, minWidth: 0 }}>
              <div style={{ height: 34, display: 'flex', alignItems: 'flex-end', padding: '0 3px' }}>
                <div style={{ width: '100%', height: `${Math.max(8, pct * 100)}%`, borderRadius: 3, background: full ? C.red : pct > 0.75 ? C.orange : '#3b82f6' }} />
              </div>
              <div style={{ fontSize: 9, fontWeight: 700, color: i === 0 ? C.accent : C.muted, lineHeight: 1.1, paddingTop: 2 }}>{i === 0 ? 'auj' : dd.toLocaleDateString('fr-FR', { weekday: 'short' }).slice(0, 3)}</div>
              <div style={{ fontSize: 10, fontWeight: 800, color: full ? C.red : C.text, paddingBottom: 2 }}>{x.dispo}</div>
            </button>
          );
        })}
      </div>
      <input type="range" min={0} max={days.length - 1} value={day} onChange={e => setDay(Number(e.target.value))} style={{ width: '100%', marginTop: 4, accentColor: '#818cf8' }} />
    </div>
  );
}

// L'argent du mois : chiffre d'affaires, bénéfice (seulement si prix propriétaire saisi), reste à encaisser, voitures qui dorment
function MoneyCard({ money, cars, month, setMonth, on, toggle, onCar, onAsk }: {
  money: { byCar: Map<string, Money>; total: Money }; cars: World['cars']; month: string; setMonth: (m: string) => void;
  on: boolean; toggle: () => void; onCar: (id: string) => void; onAsk: (p: string) => void;
}) {
  const t = money.total;
  const ranked = cars.map(c => ({ c, m: money.byCar.get(c.id) })).filter((x): x is { c: World['cars'][number]; m: Money } => !!x.m);
  const val = (m: Money) => m.ca['€'] + m.ca['DA'] / 250; // tri seulement (≈ taux), jamais affiché
  const top = ranked.filter(x => x.m.days).sort((a, b) => val(b.m) - val(a.m)).slice(0, 3);
  const asleep = ranked.filter(x => !x.m.days);
  const known = t.rentals - t.noOwner;
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: '12px 13px', marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 800, flex: 1 }}>💶 L'argent — {monthName(month)}</div>
        <button onClick={() => setMonth(shiftMonth(month, -1))} style={mbtn}>‹</button>
        <button onClick={() => setMonth(shiftMonth(month, 1))} style={mbtn}>›</button>
        <button onClick={toggle} style={{ ...mbtn, width: 'auto', padding: '0 9px', background: on ? '#f59e0b' : 'transparent', color: on ? '#1c1917' : C.gold, borderColor: `${C.gold}66` }}>{on ? '✓ Sur la carte' : 'Sur la carte'}</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
        <Stat k="Chiffre d'affaires" v={fmtMoney(t.ca)} sub={`${t.rentals} loc. · ${t.days} j`} />
        <Stat k="Bénéfice" v={known ? fmtMoney(t.profit) : 'inconnu'} sub={t.noOwner ? `${t.noOwner} loc. sans prix propriétaire` : 'complet'} warn={t.noOwner > 0} />
        <Stat k="Reste à encaisser" v={fmtMoney(t.due)} warn={t.due['€'] + t.due['DA'] > 0} />
      </div>
      {t.noOwner > 0 && <div style={{ fontSize: 11, color: C.muted, marginTop: 6, lineHeight: 1.4 }}>
        Bénéfice = (prix client − prix propriétaire) × jours. {known ? 'Le chiffre ci-dessus ne compte que les locations où le prix propriétaire est saisi.' : 'Aucune location de ce mois n\'a de prix propriétaire : ajoute-le dans la réservation pour voir le bénéfice.'}
      </div>}
      {top.length > 0 && <div style={{ marginTop: 9 }}>
        <div style={{ fontSize: 10.5, color: C.muted, fontWeight: 700, letterSpacing: '0.08em', marginBottom: 3 }}>CE QUI RAPPORTE</div>
        {top.map(({ c, m }) => <div key={c.id} onClick={() => onCar(c.id)} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '4px 0', borderTop: `1px solid ${C.border}`, cursor: 'pointer' }}>
          <b>{c.name}</b><span>{fmtMoney(m.ca)} · {m.days} j{m.due['€'] + m.due['DA'] ? <span style={{ color: C.orange }}> · reste {fmtMoney(m.due)}</span> : ''} ›</span>
        </div>)}
      </div>}
      {asleep.length > 0 && <div style={{ marginTop: 8 }}>
        <div style={{ fontSize: 10.5, color: C.muted, fontWeight: 700, letterSpacing: '0.08em', marginBottom: 4 }}>💤 QUI DORT (0 jour loué ce mois)</div>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {asleep.slice(0, 12).map(({ c }) => <button key={c.id} onClick={() => onCar(c.id)} style={{ fontSize: 11.5, borderRadius: 14, padding: '4px 9px', cursor: 'pointer', border: `1px solid ${C.border}`, background: 'transparent', color: C.text }}>{c.name}</button>)}
        </div>
        <button onClick={() => onAsk(`Ces voitures n'ont aucun jour loué en ${monthName(month)} : ${asleep.map(x => x.c.name).join(', ')}. Pourquoi, et comment les louer vite (prix, pub, clients à relancer) ?`)}
          style={{ marginTop: 7, background: `${C.accent}18`, border: `1px solid ${C.accent}44`, borderRadius: 9, padding: '5px 10px', cursor: 'pointer', color: C.accent, fontWeight: 700, fontSize: 11.5 }}>✨ Comment les faire rouler ?</button>
      </div>}
    </div>
  );
}
const pill: CSSProperties = { pointerEvents: 'auto', border: 'none', borderRadius: 20, padding: '8px 13px', fontSize: 13, fontWeight: 900, cursor: 'pointer', fontFamily: C.font, boxShadow: '0 3px 10px rgba(0,0,0,.25)', whiteSpace: 'nowrap' };
const mbtn: CSSProperties = { width: 28, height: 26, borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: C.text, cursor: 'pointer', fontSize: 13, fontWeight: 800 };
function Stat({ k, v, sub, warn }: { k: string; v: string; sub?: string; warn?: boolean }) {
  return <div style={{ background: '#0f0f14', borderRadius: 10, padding: '7px 8px', minWidth: 0 }}>
    <div style={{ fontSize: 9.5, color: C.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{k}</div>
    <div style={{ fontSize: 14, fontWeight: 800, marginTop: 2, color: warn && k !== 'Bénéfice' ? C.orange : C.text, overflowWrap: 'anywhere' }}>{v}</div>
    {sub && <div style={{ fontSize: 10, color: warn ? C.orange : C.muted, marginTop: 1 }}>{sub}</div>}
  </div>;
}

// Icône météo (codes WMO d'Open-Meteo) ; la nuit, lune au lieu du soleil
function wxIcon(w: Weather | null, now: Date, tz: string): string {
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: 'numeric', hourCycle: 'h23' }).format(now));
  const night = h < 7 || h >= 19;
  if (!w) return night ? '🌙' : '☀️';
  const c = w.code;
  return c >= 95 ? '⛈️' : c >= 80 ? '🌦️' : c >= 71 ? '🌨️' : c >= 51 ? '🌧️' : c >= 45 ? '🌫️' : c === 3 ? '☁️' : c >= 1 ? (night ? '🌙' : '🌤️') : night ? '🌙' : '☀️';
}
