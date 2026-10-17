import { kvGet } from './app-store.js';

// Données du GLOBE de l'app (même chose que nexus/modules/globe.py, mais côté serveur → marche PC éteint) :
// avions (adsb.lol → airplanes.live → OpenSky), séismes (USGS), satellites (CelesTrak), météo (Open-Meteo), lieux (OSM),
// avions en route vers / partis d'une ville (OpenSky + routes adsbdb), caméras publiques (TfL, Caltrans, Digitraffic, Windy).

type Q = Record<string, string | undefined>;
type Cam = { id: string; name: string; city: string; country?: string; lat: number; lon: number; img: string; video: string; thumb?: string; embed?: string; src: string; views?: number; dist?: number };

const UA = 'Dzaryx-FIK/1.0 (assistant personnel; contact fikconciergerie.com)';
const cache = new Map<string, { at: number; body: unknown }>();
const down = new Map<string, number>();

async function getJson<T = any>(url: string, ttlS: number, timeoutMs = 12_000, headers: Record<string, string> = {}): Promise<T> {   // eslint-disable-line @typescript-eslint/no-explicit-any
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < ttlS * 1000) return hit.body as T;
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json', ...headers }, signal: AbortSignal.timeout(timeoutMs) });
  if (!r.ok) throw new Error(`${new URL(url).host} ${r.status}`);
  const body = await r.json();
  cache.set(url, { at: Date.now(), body });
  if (cache.size > 300) [...cache.entries()].sort((a, b) => a[1].at - b[1].at).slice(0, 80).forEach(([k]) => cache.delete(k));
  return body as T;
}

const num = (q: Q, k: string, d: number) => { const v = Number(q[k]); return Number.isFinite(v) && q[k] !== undefined && q[k] !== '' ? v : d; };
const R = Math.PI / 180;
export function km(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const x = Math.sin((lat2 - lat1) * R / 2) ** 2 + Math.cos(lat1 * R) * Math.cos(lat2 * R) * Math.sin((lon2 - lon1) * R / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(Math.min(1, x)));
}
function bearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const y = Math.sin((lon2 - lon1) * R) * Math.cos(lat2 * R);
  const x = Math.cos(lat1 * R) * Math.sin(lat2 * R) - Math.sin(lat1 * R) * Math.cos(lat2 * R) * Math.cos((lon2 - lon1) * R);
  return (Math.atan2(y, x) / R + 360) % 360;
}
async function pool<T, U>(items: T[], n: number, fn: (t: T) => Promise<U>): Promise<U[]> {
  const out: U[] = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]!); } }));
  return out;
}

async function planes(q: Q) {
  const lat = num(q, 'lat', 35.7), lon = num(q, 'lon', -0.6), nm = Math.max(10, Math.min(250, Math.round(num(q, 'nm', 200))));
  for (const base of ['https://api.adsb.lol/v2/point', 'https://api.airplanes.live/v2/point']) {
    if (Date.now() < (down.get(base) ?? 0)) continue;          // source en panne : pas avant 10 min
    try {
      const d = await getJson(`${base}/${lat.toFixed(3)}/${lon.toFixed(3)}/${nm}`, 12, 6000);
      const out = (d.ac ?? []).filter((a: any) => a.lat != null && a.lon != null && a.alt_baro !== 'ground').map((a: any) => ({   // eslint-disable-line @typescript-eslint/no-explicit-any
        id: a.hex, cs: String(a.flight ?? a.r ?? '').trim(), type: a.t ?? '', lat: a.lat, lon: a.lon,
        alt: Math.round(Number(a.alt_baro || a.alt_geom || 0) * 0.3048), spd: Math.round(Number(a.gs || 0) * 1.852), trk: Number(a.track || 0),
      }));
      return { source: new URL(base).host, planes: out };
    } catch { down.set(base, Date.now() + 600_000); }
  }
  const dl = nm / 60;
  const d = await getJson(`https://opensky-network.org/api/states/all?lamin=${(lat - dl).toFixed(2)}&lomin=${(lon - dl * 1.3).toFixed(2)}&lamax=${(lat + dl).toFixed(2)}&lomax=${(lon + dl * 1.3).toFixed(2)}`, 20);
  return { source: 'opensky', planes: (d.states ?? []).filter((s: any[]) => s[5] != null && s[6] != null && !s[8]).map((s: any[]) => ({   // eslint-disable-line @typescript-eslint/no-explicit-any
    id: s[0], cs: String(s[1] ?? '').trim(), type: '', lat: s[6], lon: s[5], alt: Math.round(s[7] || s[13] || 0), spd: Math.round((s[9] || 0) * 3.6), trk: s[10] || 0,
  })) };
}

async function quakes() {
  const d = await getJson('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson', 300);
  return { quakes: (d.features ?? []).map((f: any) => ({ mag: f.properties?.mag, place: f.properties?.place, time: f.properties?.time,   // eslint-disable-line @typescript-eslint/no-explicit-any
    lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], depth: f.geometry.coordinates[2] })) };
}

async function sats() {
  const all: any[] = [];   // eslint-disable-line @typescript-eslint/no-explicit-any
  for (const g of ['stations', 'visual']) {
    try { all.push(...await getJson(`https://celestrak.org/NORAD/elements/gp.php?GROUP=${g}&FORMAT=json`, 7200)); } catch { /* groupe indisponible */ }   // CelesTrak : max 1 fois / 2 h
  }
  const seen = new Set(); const out = [];
  for (const s of all) { if (seen.has(s.NORAD_CAT_ID)) continue; seen.add(s.NORAD_CAT_ID); out.push(s); }
  return { sats: out.slice(0, 220) };
}

async function weather(q: Q) {
  const qs = new URLSearchParams({ latitude: num(q, 'lat', 35.7).toFixed(3), longitude: num(q, 'lon', -0.6).toFixed(3), timezone: 'auto', forecast_days: '1',
    current: 'temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code', daily: 'sunrise,sunset' });
  const d = await getJson(`https://api.open-meteo.com/v1/forecast?${qs}`, 600);
  const c = d.current ?? {}, daily = d.daily ?? {};
  return { temp: c.temperature_2m, feels: c.apparent_temperature, hum: c.relative_humidity_2m, wind: c.wind_speed_10m, code: c.weather_code,
    offset: d.utc_offset_seconds ?? 0, sunrise: String(daily.sunrise?.[0] ?? '').slice(-5), sunset: String(daily.sunset?.[0] ?? '').slice(-5) };
}

async function place(q: Q) {
  const qs = new URLSearchParams({ lat: num(q, 'lat', 0).toFixed(3), lon: num(q, 'lon', 0).toFixed(3), format: 'json', zoom: '6', 'accept-language': 'fr' });
  const a = (await getJson(`https://nominatim.openstreetmap.org/reverse?${qs}`, 3600))?.address ?? {};
  return { name: a.state || a.region || a.county || a.country || '', country: a.country || '' };
}

async function geocode(q: Q) {
  const qs = new URLSearchParams({ q: String(q['q'] ?? '').slice(0, 120), format: 'json', limit: '1', 'accept-language': 'fr' });
  const r = await getJson<any[]>(`https://nominatim.openstreetmap.org/search?${qs}`, 86400);   // eslint-disable-line @typescript-eslint/no-explicit-any
  const p = r?.[0];
  if (!p) return { found: false };
  return { found: true, name: String(p.display_name ?? q['q']).split(',')[0], full: p.display_name ?? '', lat: Number(p.lat), lon: Number(p.lon),
    bbox: (p.boundingbox ?? []).map(Number) };   // [sud, nord, ouest, est]
}

const noRoute = new Map<string, number>();
async function route(cs: string): Promise<any | null> {   // eslint-disable-line @typescript-eslint/no-explicit-any
  if (Date.now() < (noRoute.get(cs) ?? 0)) return null;
  try {
    const fr = (await getJson(`https://api.adsbdb.com/v0/callsign/${encodeURIComponent(cs)}`, 21600, 6000))?.response?.flightroute;
    if (fr?.destination) return fr;
  } catch { /* inconnu */ }
  noRoute.set(cs, Date.now() + 21_600_000);
  return null;
}
const airport = (a: any = {}) => ({ iata: a.iata_code || a.icao_code || '', city: a.municipality || a.name || '', name: a.name || '', country: a.country_name || '', lat: a.latitude, lon: a.longitude });   // eslint-disable-line @typescript-eslint/no-explicit-any

async function inbound(q: Q) {
  const lat = num(q, 'lat', 35.62), lon = num(q, 'lon', -0.62), out = q['mode'] === 'out';
  const dl = 24, dlon = Math.min(45, dl / Math.max(0.3, Math.cos(lat * R)));
  const d = await getJson(`https://opensky-network.org/api/states/all?lamin=${Math.max(-89, lat - dl).toFixed(1)}&lomin=${Math.max(-180, lon - dlon).toFixed(1)}&lamax=${Math.min(89, lat + dl).toFixed(1)}&lomax=${Math.min(180, lon + dlon).toFixed(1)}`, 45, 20_000);
  let cands: Array<{ d: number; cs: string; s: any[]; near: boolean }> = [];   // eslint-disable-line @typescript-eslint/no-explicit-any
  for (const s of d.states ?? []) {
    const cs = String(s[1] ?? '').trim();
    if (!cs || s[5] == null || s[6] == null || s[8]) continue;
    const dist = km(s[6], s[5], lat, lon), trk = s[10] || 0;
    const b = out ? bearing(lat, lon, s[6], s[5]) : bearing(s[6], s[5], lat, lon);
    const diff = Math.abs(((trk - b + 180) % 360 + 360) % 360 - 180), vr = s[11] || 0;
    const near = dist < 150 && (diff < 60 || (out ? vr >= 0 : vr <= 0));
    if (near || (dist < 3800 && diff < 28)) cands.push({ d: dist, cs, s, near });
  }
  cands.sort((a, b) => a.d - b.d);
  cands = [...cands.filter(c => c.near).slice(0, 30), ...cands.filter(c => !c.near)].slice(0, 90);
  const routes = await pool(cands, 10, c => route(c.cs));
  const flights = []; let ap = null;
  for (let i = 0; i < cands.length; i++) {
    const { cs, s } = cands[i]!, fr = routes[i];
    if (!fr) continue;
    const end = (out ? fr.origin : fr.destination) ?? {};
    if (end.latitude == null || km(end.latitude, end.longitude, lat, lon) > 70) continue;
    ap = ap ?? airport(end);
    const spd = (s[9] || 0) * 3.6, dist = km(s[6], s[5], end.latitude, end.longitude);
    flights.push({ cs, id: s[0], airline: fr.airline?.name ?? '', from: airport(fr.origin), to: airport(fr.destination),
      lat: s[6], lon: s[5], alt: Math.round(s[7] || s[13] || 0), spd: Math.round(spd), trk: s[10] || 0, vr: s[11] || 0,
      dist: Math.round(dist), eta: spd > 80 && !out ? Math.round(dist / spd * 60) : null });
  }
  flights.sort((a, b) => out ? b.dist - a.dist : a.dist - b.dist);
  return { mode: out ? 'out' : 'in', airport: ap, flights, checked: cands.length };
}

// ── Caméras publiques ─────────────────────────────────────────────────────────
const CALTRANS = [32.4, -124.6, 42.1, -114.0], FINLAND = [59.6, 19.0, 70.2, 31.7], LONDON = [51.2, -0.7, 51.8, 0.4];
const inBox = (lat: number, lon: number, b: number[], pad: number) => b[0]! - pad <= lat && lat <= b[2]! + pad && b[1]! - pad <= lon && lon <= b[3]! + pad;
const camLists = new Map<string, { at: number; cams: Cam[] }>();
async function camList(name: string, loader: () => Promise<Cam[]>): Promise<Cam[]> {
  const hit = camLists.get(name);
  if (hit && Date.now() - hit.at < 6 * 3600_000) return hit.cams;
  try { const cams = await loader(); camLists.set(name, { at: Date.now(), cams }); return cams; }
  catch { return hit?.cams ?? []; }
}
async function tfl(): Promise<Cam[]> {
  const list = await getJson<any[]>('https://api.tfl.gov.uk/Place/Type/JamCam', 21600, 20_000);   // eslint-disable-line @typescript-eslint/no-explicit-any
  return list.flatMap(c => {
    const p = Object.fromEntries((c.additionalProperties ?? []).map((a: any) => [a.key, a.value]));   // eslint-disable-line @typescript-eslint/no-explicit-any
    if (p['available'] === 'false' || !p['imageUrl']) return [];
    return [{ id: c.id, name: c.commonName ?? '', city: 'Londres', lat: c.lat, lon: c.lon, img: p['imageUrl'], video: p['videoUrl'] ?? '', src: 'TfL' }];
  });
}
async function caltrans(): Promise<Cam[]> {
  const parts = await pool(Array.from({ length: 12 }, (_, i) => i + 1), 6, async n => {
    try {
      const d = await getJson(`https://cwwp2.dot.ca.gov/data/d${n}/cctv/cctvStatusD${String(n).padStart(2, '0')}.json`, 21600, 25_000);
      return (d.data ?? []).flatMap((row: any): Cam[] => {   // eslint-disable-line @typescript-eslint/no-explicit-any
        const c = row.cctv ?? {}, loc = c.location ?? {}, img = c.imageData?.static?.currentImageURL;
        const la = Number(loc.latitude), lo = Number(loc.longitude);
        if (c.inService !== 'true' || !img || !Number.isFinite(la) || !Number.isFinite(lo)) return [];
        return [{ id: `ct${n}-${c.index}`, name: loc.locationName ?? '', city: loc.nearbyPlace || 'Californie', lat: la, lon: lo, img, video: '', src: 'Caltrans' }];
      });
    } catch { return []; }
  });
  return parts.flat();
}
async function finland(): Promise<Cam[]> {
  const d = await getJson('https://tie.digitraffic.fi/api/weathercam/v1/stations', 21600, 20_000);
  return (d.features ?? []).flatMap((f: any): Cam[] => {   // eslint-disable-line @typescript-eslint/no-explicit-any
    const pr = f.properties ?? {}, presets = (pr.presets ?? []).filter((x: any) => x.inCollection).map((x: any) => x.id);   // eslint-disable-line @typescript-eslint/no-explicit-any
    if (!presets.length || pr.collectionStatus !== 'GATHERING') return [];
    const [lon, lat] = f.geometry.coordinates;
    return [{ id: pr.id, name: String(pr.name ?? '').split('_').slice(1).join('_') || pr.name || '', city: 'Finlande', lat, lon, img: `https://weathercam.digitraffic.fi/${presets[0]}.jpg`, video: '', src: 'Digitraffic' }];
  });
}

async function windyRaw(params: Record<string, string>, ttlS = 300): Promise<{ webcams?: any[]; total?: number } | null> {   // eslint-disable-line @typescript-eslint/no-explicit-any
  const key = process.env['WINDY_WEBCAMS_KEY'] || await kvGet('cfg:windy_webcams_key');
  if (!key) return null;
  const qs = new URLSearchParams({ ...params, limit: '50', lang: 'fr', include: 'location,images,player' });
  try { return await getJson(`https://api.windy.com/webcams/api/v3/webcams?${qs}`, ttlS, 15_000, { 'x-windy-api-key': key }); }
  catch { return null; }
}
function windyCams(d: { webcams?: any[] } | null): Cam[] {   // eslint-disable-line @typescript-eslint/no-explicit-any
  return (d?.webcams ?? []).map(w => {
    const loc = w.location ?? {}, pl = w.player ?? {}, cur = w.images?.current ?? {};
    return { id: `w${w.webcamId}`, name: w.title ?? '', city: loc.city || loc.country || '', country: loc.country || '', lat: loc.latitude, lon: loc.longitude,
      img: cur.preview || '', video: '', thumb: cur.thumbnail || '', embed: pl.live || pl.day || '', src: 'Windy', views: w.viewCount };
  }).filter(c => c.lat != null);
}
const uniq = (list: Cam[]) => { const seen = new Set<string>(); return list.filter(c => !seen.has(c.id) && (seen.add(c.id), true)); };

const WINDY_CATS = new Set(['airport', 'beach', 'building', 'city', 'coast', 'forest', 'indoor', 'lake', 'landscape', 'meteo', 'mountain',
  'observatory', 'port', 'river', 'sportArea', 'square', 'traffic', 'village']);

async function catcams(q: Q) {
  const cat = q['cat'] ?? 'all', params: Record<string, string> = WINDY_CATS.has(cat) ? { categories: cat } : {};
  const pages = q['lat'] && q['lon']
    ? [await windyRaw({ ...params, nearby: `${num(q, 'lat', 0).toFixed(3)},${num(q, 'lon', 0).toFixed(3)},250` })]
    : await Promise.all([0, 50].map(o => windyRaw({ ...params, offset: String(o), sortKey: 'popularity', sortDirection: 'desc' }, 1800)));
  return { cams: uniq(pages.flatMap(windyCams)), total: Math.max(0, ...pages.map(p => p?.total ?? 0)), cat: params['categories'] ? cat : 'all', windy: pages.some(Boolean) };
}

async function world() {
  const offsets = Array.from({ length: 21 }, (_, i) => i * 50);
  const [pages, keyless] = await Promise.all([
    pool(offsets, 6, o => windyRaw({ offset: String(o), sortKey: 'popularity', sortDirection: 'desc' }, 3600)),
    Promise.all([camList('tfl', tfl), camList('caltrans', caltrans), camList('finland', finland)]),
  ]);
  const windy = uniq(pages.flatMap(windyCams));
  ['Royaume-Uni', 'États-Unis', 'Finlande'].forEach((n, i) => keyless[i]!.forEach(c => { c.country = c.country || n; }));
  const free = keyless.flat();
  const windyTotal = Math.max(0, ...pages.map(p => p?.total ?? 0));
  return { cams: [...windy, ...free], total: windyTotal + free.length, windy_total: windyTotal, windy: !!pages[0] };
}

async function cams(q: Q) {
  const lat = num(q, 'lat', 35.7), lon = num(q, 'lon', -0.6), radius = Math.max(5, Math.min(250, num(q, 'km', 40)));
  const pad = radius / 80;
  const parts = await Promise.all([
    inBox(lat, lon, LONDON, pad) ? camList('tfl', tfl) : [],
    inBox(lat, lon, CALTRANS, pad) ? camList('caltrans', caltrans) : [],
    inBox(lat, lon, FINLAND, pad) ? camList('finland', finland) : [],
    windyRaw({ nearby: `${lat.toFixed(3)},${lon.toFixed(3)},${Math.round(radius)}` }).then(windyCams),
  ]);
  const near = parts.flat().map(c => ({ ...c, dist: Math.round(km(lat, lon, c.lat, c.lon) * 10) / 10 }))
    .filter(c => c.dist <= radius).sort((a, b) => a.dist - b.dist).slice(0, 80);
  const zones: Array<[string, number, number]> = [['Londres', 51.507, -0.128], ['San Francisco', 37.775, -122.419], ['Los Angeles', 34.052, -118.244], ['Helsinki', 60.170, 24.938]];
  const z = zones.reduce((a, b) => km(lat, lon, a[1], a[2]) <= km(lat, lon, b[1], b[2]) ? a : b);
  return { cams: near, windy: !!(process.env['WINDY_WEBCAMS_KEY'] || await kvGet('cfg:windy_webcams_key')),
    nearest_elsewhere: near.length ? null : { name: z[0], lat: z[1], lon: z[2], dist: Math.round(km(lat, lon, z[1], z[2])) } };
}

const KINDS: Record<string, (q: Q) => Promise<unknown>> = { planes, quakes, sats, weather, place, geocode, inbound, cams, world, catcams };

export async function globeData(kind: string, q: Q): Promise<unknown | null> {
  const fn = KINDS[kind];
  return fn ? fn(q) : null;
}
