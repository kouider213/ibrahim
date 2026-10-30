/**
 * RADARS (Kouider 30/10/2026, flashé à Simonis en allant à la salle) :
 *  - AVANT LE RADAR : chaque position Telegram en direct passe ici ; s'il roule (≥ 25 km/h) et qu'un radar fixe est devant
 *    lui (≤ 700 m, ou 50 s de route à sa vitesse, dans sa direction) → message court + notif, une fois par radar et par heure.
 *    Radars : OpenStreetMap (highway=speed_camera, gardés 14 j par carré de ~10 km) + les endroits où il a été flashé.
 *  - « JE ME SUIS FAIT FLASHER » → outil radars action=flash : noté avec l'endroit (GPS) et l'heure, l'endroit devient un radar
 *    connu. Courrier reçu → action=amende (montant, date limite) → rappels 7 j, 2 j et le jour même à 10h ; action=paye.
 *    Pas de courrier 21 jours après → « tu as reçu l'amende ? ».
 * Données : app_kv `radars:tile:*`, `radars:state`.
 */
import { kvJson, kvPut, tg, uid } from './ai-util.js';
import { km } from './departures.js';
import { getLocation } from './location.js';
import { localNow } from './morning-routine.js';
import { emitProactive } from '../notifications/mobile-push.js';

interface Cam { lat: number; lng: number; max?: number; name?: string; mine?: boolean }
interface Fine { id: string; at: string; lat?: number; lng?: number; where: string; speed?: number; amount?: number; due?: string; paid?: boolean; asked?: boolean; sent: string[] }
interface State { off?: boolean; last?: { t: number; lat: number; lng: number }; warned: Record<string, number>; fines: Fine[] }

const STATE = 'radars:state';
const TILE = 0.1;   // ~11 km × 7 km en Belgique
const getState = () => kvJson<State>(STATE, { warned: {}, fines: [] });
const saveState = (s: State) => kvPut(STATE, s);
const camKey = (c: { lat: number; lng: number }) => `${c.lat.toFixed(4)},${c.lng.toFixed(4)}`;

/** Cap en degrés de a vers b. */
function bearing(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const r = Math.PI / 180, y = Math.sin((b.lng - a.lng) * r) * Math.cos(b.lat * r);
  const x = Math.cos(a.lat * r) * Math.sin(b.lat * r) - Math.sin(a.lat * r) * Math.cos(b.lat * r) * Math.cos((b.lng - a.lng) * r);
  return (Math.atan2(y, x) / r + 360) % 360;
}
const angle = (a: number, b: number) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

const tilePending = new Map<string, Promise<Cam[]>>();
const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
let overpassDownUntil = 0;   // tous les serveurs en échec → on ne réessaie pas avant 10 min
async function overpass(q: string): Promise<Array<{ lat: number; lon: number; tags?: Record<string, string> }>> {
  if (Date.now() < overpassDownUntil) throw new Error('overpass en pause');
  let last = '';
  for (const url of OVERPASS) {
    try {
      const r = await fetch(url, { method: 'POST', body: `data=${encodeURIComponent(q)}`,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Dzaryx/1.0' }, signal: AbortSignal.timeout(25_000) });
      if (!r.ok) { last = `${url} ${r.status}`; continue; }
      const j = await r.json() as { elements?: Array<{ lat: number; lon: number; tags?: Record<string, string> }> };
      return j.elements ?? [];
    } catch (e) { last = `${url} ${e instanceof Error ? e.message : e}`; }
  }
  overpassDownUntil = Date.now() + 10 * 60_000;
  throw new Error(`overpass: ${last}`);
}

async function tileCams(tlat: number, tlng: number): Promise<Cam[]> {
  const key = `radars:tile:${tlat.toFixed(1)},${tlng.toFixed(1)}`;
  const cached = await kvJson<Cam[] | null>(key, null);
  if (cached) return cached;
  if (tilePending.has(key)) return tilePending.get(key)!;
  const p = (async () => {
    const q = `[out:json][timeout:20];node["highway"="speed_camera"](${tlat.toFixed(1)},${tlng.toFixed(1)},${(tlat + TILE).toFixed(1)},${(tlng + TILE).toFixed(1)});out;`;
    const cams = (await overpass(q)).map(e => ({ lat: e.lat, lng: e.lon, ...(Number(e.tags?.['maxspeed']) ? { max: Number(e.tags!['maxspeed']) } : {}), ...(e.tags?.['name'] ? { name: e.tags['name'] } : {}) }));
    await kvPut(key, cams, 14 * 86_400);
    return cams;
  })().finally(() => tilePending.delete(key));
  tilePending.set(key, p);
  return p;
}

/** Radars autour d'un point : OSM (carré courant + voisins si on est près du bord) + là où il a été flashé. */
async function camsAround(p: { lat: number; lng: number }, st: State): Promise<Cam[]> {
  const tiles = new Set<string>();
  for (const dl of [-0.012, 0, 0.012]) for (const dg of [-0.018, 0, 0.018])
    tiles.add(`${Math.floor((p.lat + dl) / TILE) * TILE}|${Math.floor((p.lng + dg) / TILE) * TILE}`);
  const out: Cam[] = [];
  for (const t of tiles) {
    const [a, b] = t.split('|').map(Number);
    out.push(...await tileCams(a!, b!).catch(() => [] as Cam[]));
  }
  for (const f of st.fines) if (f.lat != null && f.lng != null) out.push({ lat: f.lat, lng: f.lng, mine: true, name: f.where });
  return out;
}

let busy = false;
/** Chaque position en direct (appelé par /api/call/location). */
export function onRadarPoint(lat: number, lng: number): void {
  if (busy) return;
  busy = true;
  void check({ t: Date.now(), lat, lng }).catch(e => console.warn('[radars]', e instanceof Error ? e.message : e)).finally(() => { busy = false; });
}

async function check(p: { t: number; lat: number; lng: number }): Promise<void> {
  const st = await getState();
  if (st.off) return;
  const prev = st.last;
  const moved = prev ? km(prev, p) : 0;
  if (prev && moved < 0.05 && p.t - prev.t < 5 * 60_000) return;   // GPS qui tremble : on garde l'ancien point pour le cap
  st.last = { t: p.t, lat: p.lat, lng: p.lng };
  const dt = prev ? (p.t - prev.t) / 3600_000 : 0;
  const kmh = prev && dt > 5 / 3600 && dt < 0.1 ? moved / dt : 0;
  if (!prev || kmh < 25 || kmh > 200) { await saveState(st); return; }
  const head = bearing(prev, p);
  const reach = Math.max(0.7, Math.min(2, kmh * 50 / 3600));   // 50 s de route, entre 700 m et 2 km
  const now = p.t;
  for (const k of Object.keys(st.warned)) if (now - st.warned[k]! > 3 * 3600_000) delete st.warned[k];
  const ahead = (await camsAround(p, st))
    .map(c => ({ c, d: km(p, c) }))
    .filter(x => x.d <= reach && x.d > 0.03 && angle(bearing(p, x.c), head) <= 35 && !(st.warned[camKey(x.c)] && now - st.warned[camKey(x.c)]! < 3600_000))
    .sort((a, b) => a.d - b.d)[0];
  if (ahead) {
    st.warned[camKey(ahead.c)] = now;
    const m = Math.round(ahead.d * 1000 / 50) * 50;
    const lim = ahead.c.max ? ` — limite ${ahead.c.max} km/h` : '';
    const text = `📸 Radar ${ahead.c.mine ? `(là où tu as été flashé${ahead.c.name ? `, ${ahead.c.name}` : ''})` : 'fixe'} dans ${m} m${lim}. Tu roules à ~${Math.round(kmh)} km/h.`;
    await tg(text);
    emitProactive('📸 Radar', 'reminder', text, 'kouider', 'route');
  }
  await saveState(st);
}

// ── Amendes ───────────────────────────────────────────────────────────────────
const fr = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const fineLine = (f: Fine) => `• ${f.id} — flashé le ${fr(f.at)} ${f.where}${f.speed ? ` à ${f.speed} km/h` : ''}${f.amount ? ` · ${f.amount} €` : ''}${f.due ? ` · à payer avant le ${fr(f.due)}` : f.paid ? '' : ' · courrier pas encore reçu'}${f.paid ? ' · ✅ payée' : ''}`;

export async function radarsTool(input: Record<string, unknown>): Promise<string> {
  const action = String(input['action'] ?? 'list');
  const st = await getState();
  const pick = () => {
    const id = String(input['id'] ?? '');
    const open = st.fines.filter(f => !f.paid);
    return open.find(f => f.id === id) ?? open[open.length - 1] ?? null;
  };
  if (action === 'off' || action === 'on') { st.off = action === 'off'; await saveState(st); return st.off ? '🔕 Alertes radar coupées.' : '📸 Alertes radar remises : je te préviens avant chaque radar fixe sur ta route.'; }
  if (action === 'flash') {
    const loc = await getLocation('kouider').catch(() => null);
    const freshLoc = loc && Date.now() - Date.parse(loc.updated_at) < 30 * 60_000 ? loc : null;
    const where = String(input['where'] ?? '').trim() || (freshLoc?.city ? `vers ${freshLoc.city}` : 'endroit non précisé');
    const at = /^\d{4}-\d{2}-\d{2}/.test(String(input['date'] ?? '')) ? String(input['date']).slice(0, 10) : localNow().date;
    const f: Fine = { id: uid(), at, where, sent: [], ...(Number(input['speed']) ? { speed: Number(input['speed']) } : {}),
      ...(freshLoc && !input['where'] ? { lat: freshLoc.lat, lng: freshLoc.lng } : {}) };
    st.fines.push(f); st.fines = st.fines.slice(-30);
    await saveState(st);
    return `📸 Noté : flashé le ${fr(at)} ${where}${f.speed ? ` à ${f.speed} km/h` : ''}.${f.lat != null ? ' Cet endroit est maintenant dans mes radars : je te préviens avant d\'y repasser.' : ''} Quand tu reçois le courrier, dis-moi le montant et la date limite, je te rappelle de payer à temps. Pas de courrier dans 3 semaines → je te demande.`;
  }
  if (action === 'amende') {
    const f = pick();
    if (!f) return 'Aucun flash noté. Dis « je me suis fait flasher » d\'abord (ou donne où et quand).';
    if (Number(input['amount'])) f.amount = Number(input['amount']);
    const due = String(input['due'] ?? '');
    f.due = /^\d{4}-\d{2}-\d{2}$/.test(due) ? due : new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);
    await saveState(st);
    return `🧾 Amende notée${f.amount ? ` : ${f.amount} €` : ''}, à payer avant le ${fr(f.due)}${/^\d{4}-\d{2}-\d{2}$/.test(due) ? '' : ' (14 jours par défaut : vérifie la date sur le courrier et redis-la moi)'}. Je te le rappelle 7 jours avant, 2 jours avant et le jour même.`;
  }
  if (action === 'paye') {
    const f = pick();
    if (!f) return 'Aucune amende en attente.';
    f.paid = true; await saveState(st);
    return `✅ Amende du ${fr(f.at)} marquée payée.`;
  }
  const open = st.fines.filter(f => !f.paid), paid = st.fines.filter(f => f.paid).slice(-3);
  return [`📸 Radars : alertes ${st.off ? 'coupées' : 'actives'} (radars fixes OpenStreetMap + tes endroits flashés).`,
    open.length ? `Amendes en attente :\n${open.map(fineLine).join('\n')}` : 'Aucune amende en attente.',
    paid.length ? `Payées récemment :\n${paid.map(fineLine).join('\n')}` : ''].filter(Boolean).join('\n');
}

/** Tous les jours à 10h : rappels de paiement + « tu as reçu le courrier ? ». */
export async function jobRadars(): Promise<void> {
  const st = await getState();
  const today = localNow().date;
  const days = (iso: string) => Math.round((Date.parse(iso) - Date.parse(today)) / 86_400_000);
  let changed = false;
  for (const f of st.fines) {
    if (f.paid) continue;
    if (f.due) {
      const d = days(f.due);
      const k = d <= 0 ? 'j0' : d <= 2 ? 'j2' : d <= 7 ? 'j7' : '';
      if (k && !f.sent.includes(k)) {
        f.sent.push(k); changed = true;
        await tg(`🧾 Amende radar du ${fr(f.at)} (${f.where})${f.amount ? ` : ${f.amount} €` : ''} — ${d < 0 ? `la date limite (${fr(f.due)}) est PASSÉE, paie vite pour éviter la majoration` : d === 0 ? 'à payer AUJOURD\'HUI' : `à payer avant le ${fr(f.due)} (dans ${d} jours)`}. Dis « amende payée » quand c'est fait.`);
      }
    } else if (!f.asked && days(f.at) <= -21) {
      f.asked = true; changed = true;
      await tg(`📸 Tu as été flashé le ${fr(f.at)} (${f.where}). Tu as reçu le courrier ? Dis-moi le montant et la date limite, je te rappelle de payer.`);
    }
  }
  if (changed) await saveState(st);
}
