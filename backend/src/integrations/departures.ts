import { kvGet, kvSet } from './app-store.js';
import { listAgendaRange } from './google-calendar.js';
import { getLocation } from './location.js';
import { queueTelegramMessage } from '../notifications/tg-outbox.js';
import { emitProactive } from '../notifications/mobile-push.js';
import { callOwner, getPendingCall } from '../notifications/voice-call.js';
import { ensureRoutineStart, getRoutineConfig, routinePausedReason, lastKouiderActivity, localNow, hm } from './morning-routine.js';

// DÉPARTS + TRAFIC (demande de Kouider 2026-10-15) : pour chaque RDV de l'agenda FIK qui a une ADRESSE (salle de sport,
// travail, aéroport, RDV…), Dzaryx calcule le trajet avec le trafic réel (Google Maps), depuis la position GPS de
// Kouider si elle est fraîche (position en direct partagée sur Telegram), sinon depuis la maison.
// - ~15 min avant l'heure où il faut partir : message « pars à 6h25, 19 min de route ».
// - Le trafic empire après le message : nouveau message avec la nouvelle heure.
// - L'heure de partir est passée et il n'est pas parti (GPS encore à la maison, ou pas de GPS et aucune réponse) → APPEL.
// Pendant une pause de la routine (vacances), la salle et le travail ne sont pas suivis (l'aéroport, si).

const HOME_RADIUS_KM = 0.35;
const MAX_KM = 150;                         // au-delà, ce RDV n'est pas « en voiture d'ici » (ex. RDV à Oran depuis Bruxelles)

type LatLng = { lat: number; lng: number };

function km(a: LatLng, b: LatLng): number {
  const R = 6371, dLat = (b.lat - a.lat) * Math.PI / 180, dLng = (b.lng - a.lng) * Math.PI / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

async function geocode(address: string): Promise<LatLng | null> {
  const ck = `geo:${address.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 120)}`;
  try { const c = await kvGet(ck); if (c) return JSON.parse(c) as LatLng; } catch { /* rien */ }
  const key = process.env['GOOGLE_MAPS_API_KEY'];
  if (!key) return null;
  try {
    const r = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${key}&language=fr`);
    const j = await r.json() as { status: string; results: Array<{ geometry: { location: LatLng } }> };
    const loc = j.results?.[0]?.geometry.location;
    if (loc) await kvSet(ck, JSON.stringify(loc), 60 * 86_400);
    return loc ?? null;
  } catch { return null; }
}

async function drive(o: LatLng, d: LatLng): Promise<{ min: number; normal: number; km: number } | null> {
  const key = process.env['GOOGLE_MAPS_API_KEY'];
  if (!key) return null;
  try {
    const r = await fetch(`https://maps.googleapis.com/maps/api/distancematrix/json?origins=${o.lat},${o.lng}&destinations=${d.lat},${d.lng}&mode=driving&departure_time=now&traffic_model=best_guess&language=fr&key=${key}`);
    const j = await r.json() as { rows: Array<{ elements: Array<{ status: string; duration: { value: number }; duration_in_traffic?: { value: number }; distance: { value: number } }> }> };
    const e = j.rows?.[0]?.elements?.[0];
    if (!e || e.status !== 'OK') return null;
    return { min: Math.ceil((e.duration_in_traffic?.value ?? e.duration.value) / 60), normal: Math.ceil(e.duration.value / 60), km: Math.round(e.distance.value / 100) / 10 };
  } catch { return null; }
}

interface DepState { warnedAt?: number; warnMin?: number; leaveBy?: number; updated?: boolean; called?: boolean; done?: boolean; originAtWarn?: LatLng }

/** RDV sans adresse (ponctuel, pas un appel/visio) : une seule question ~3 h avant pour pouvoir prévenir du départ. */
async function askAddress(id: string, title: string, start: number, now: number, recurring: boolean): Promise<void> {
  if (recurring || start - now > 3 * 3600_000 || start - now < 20 * 60_000) return;
  if (/^(🟢|🏠|🚿|⏰|🚗|🏋️|✈️|🧳)/u.test(title) || /\b(appel|call|visio|zoom|meet|teams|t[ée]l[ée]phone|en ligne|libre|anniv)/i.test(title)) return;
  const key = `dep:ask:${id}`;
  if (await kvGet(key).catch(() => '1')) return;
  await kvSet(key, '1', 86_400);
  const name = title.replace(/^[^\p{L}\d]+/u, '').trim();
  await queueTelegramMessage(`📍 « ${name} » à ${hm(start)} n'a pas d'adresse dans l'agenda. Envoie-la-moi (ou le nom du lieu) : je l'ajoute et je te dis quand partir, avec le trafic et le lien Waze.`);
}

/** Toutes les 5 min (4h–23h Bruxelles). */
export async function jobDepartureWatch(): Promise<void> {
  await ensureRoutineStart().catch(() => {});
  const now = Date.now();
  const evs = await listAgendaRange(new Date(now).toISOString(), new Date(now + 4 * 3600_000).toISOString(), 30);
  if (!evs?.length) return;
  const cfg = await getRoutineConfig();
  const paused = await routinePausedReason(localNow().date, cfg);
  const home = await geocode(cfg.addresses.home);
  const loc = await getLocation('kouider').catch(() => null);
  const fresh = loc && now - Date.parse(loc.updated_at) < 20 * 60_000 ? { lat: loc.lat, lng: loc.lng } : null;
  const origin = fresh ?? home;
  if (!origin) return;

  for (const e of evs) {
    if (!e.id || !e.start.dateTime || e.transparency === 'transparent') continue;
    const title = e.summary ?? 'RDV';
    if (!e.location?.trim()) { await askAddress(e.id, title, Date.parse(e.start.dateTime), now, !!e.recurringEventId); continue; }
    if (/^(🟢|🏠|🚿|⏰)/u.test(title) || /laekenveld/i.test(e.location)) continue;
    const routineTrip = /wemmel|werrie/i.test(e.location) || /^(🏋️|✈️ Belgique)/u.test(title);
    // pause « sport » (ex. il commence lundi) : seules les alertes salle sautent, le travail reste prévenu
    if (paused && routineTrip && !(/sport/i.test(cfg.pauseReason ?? '') && !/wemmel/i.test(e.location) && !/^🏋️/u.test(title))) continue;
    const start = Date.parse(e.start.dateTime);
    if (start <= now) continue;

    const key = `dep:${e.id}`;
    let st: DepState = {};
    try { st = JSON.parse((await kvGet(key)) ?? '{}') as DepState; } catch { /* neuf */ }
    if (st.done || st.called) continue;
    const dest = await geocode(e.location);
    if (!dest) continue;
    const far = km(origin, dest);
    if (far < HOME_RADIUS_KM) { await kvSet(key, JSON.stringify({ ...st, done: true }), 86_400); continue; }   // déjà sur place
    if (far > MAX_KM) continue;
    if (start - now > (Math.max(far, 5) * 2.5 + 75) * 60_000) continue;          // trop tôt pour s'en occuper

    const t = await drive(origin, dest);
    if (!t) continue;
    const airport = /^🧳/u.test(title);
    const leaveBy = start - (t.min + (airport ? 0 : 5)) * 60_000;
    const name = title.replace(/^[^\p{L}\d]+/u, '').split(' — ')[0]!.trim();
    const traffic = t.min - t.normal >= 5 ? ` 🔴 trafic chargé (+${t.min - t.normal} min)` : t.min - t.normal >= 2 ? ' 🟡 un peu de trafic' : ' 🟢 fluide';
    const maps = `🧭 Waze : https://waze.com/ul?ll=${dest.lat},${dest.lng}&navigate=yes\n🗺️ Maps : https://www.google.com/maps/dir/?api=1&destination=${dest.lat},${dest.lng}&travelmode=driving`;

    if (!st.warnedAt && now >= leaveBy - 15 * 60_000) {
      const text = `🚗 ${name} à ${hm(start)} — pars à ${hm(leaveBy)}.\n⏱ ${t.min} min de route (${t.km} km),${traffic}.${fresh ? '' : ' (calculé depuis la maison)'}\n${maps}`;
      await queueTelegramMessage(text);
      emitProactive(text.split('\n')[0]!, 'reminder', text);
      st = { ...st, warnedAt: now, warnMin: t.min, leaveBy, originAtWarn: origin };
    } else if (st.warnedAt && !st.updated && st.warnMin && t.min - st.warnMin >= 8 && now < leaveBy) {
      const text = `⚠️ Le trafic a empiré pour ${name} : ${t.min} min maintenant (au lieu de ${st.warnMin}). Pars à ${hm(leaveBy)} au plus tard.\n${maps}`;
      await queueTelegramMessage(text);
      st = { ...st, updated: true, leaveBy };
    } else if (st.warnedAt && now >= leaveBy + 3 * 60_000) {
      // Parti ? GPS frais : il a bougé de l'endroit où il était ; sinon : il a répondu après le message
      const moved = fresh && st.originAtWarn ? km(fresh, st.originAtWarn) > 0.5 : false;
      const answered = !fresh && (await lastKouiderActivity()) > st.warnedAt;
      if (moved || answered) st = { ...st, done: true };
      else if (!(await getPendingCall('kouider'))) {
        const late = Math.max(0, Math.round((now + t.min * 60_000 - start) / 60_000));
        await callOwner(`Kouider, il faut partir maintenant pour ${name} à ${hm(start).replace('h', ' h ')} : il y a ${t.min} minutes de route avec la circulation${late > 0 ? `, tu as déjà environ ${late} minutes de retard` : ', sinon tu vas arriver en retard'}. Allez, on y va !`);
        st = { ...st, called: true };
      }
    }
    await kvSet(key, JSON.stringify(st), 86_400);
  }
}
