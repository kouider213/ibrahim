/**
 * COPILOTE DE ROUTE AVEC DES YEUX (Kouider 28/10 : « un truc ultra fou qui m'accompagne tous les jours ») — l'iPhone sur
 * le support de la voiture, page ROUTE de l'app : une image toutes les ~4 s + vitesse GPS.
 *  - lit les panneaux : limitation de vitesse (gardée jusqu'au panneau suivant / 3 km), zone 30, sens interdit, stop…
 *    → « Attention, c'est limité à 50, tu es à 63 » (vitesse GPS réelle) ;
 *  - dangers visibles : piéton qui traverse, feu rouge, travaux, voiture arrêtée → dit à voix haute ;
 *  - retient les plaques vues (mémoire visuelle partagée avec l'Œil : « la plaque de la voiture devant moi ce matin ? ») ;
 *  - BOÎTE NOIRE : freinage brutal (GPS) → les 15 dernières images gardées et envoyées sur Telegram avec l'heure, le lieu
 *    et les plaques — preuve pour un constat.
 */
import { kvJson, kvPut } from './ai-util.js';
import { gemini } from './eye.js';
import { km } from './departures.js';
import { localNow, hm } from './morning-routine.js';

interface Frame { t: number; jpg: string; lat?: number; lng?: number; kmh?: number }
interface RoadState { limit?: number; limitLat?: number; limitLng?: number; limitAt?: number; lastWarn?: number; lastSay?: number; said: string[]; lastBox?: number }
const ring: Frame[] = [];                       // en mémoire : 15 dernières images (boîte noire)
const speeds: Array<{ t: number; kmh: number }> = [];
let st: RoadState = { said: [] };
let lastLog = 0;

async function blackBox(at: Frame, from: number): Promise<void> {
  const { publishMedia } = await import('./my-voice.js');
  const urls: string[] = [];
  for (const f of ring.slice(-15)) urls.push(await publishMedia(f.jpg, 'image/jpeg', 30 * 86_400));
  const plates = (await kvJson<Array<{ t: number; plate: string }>>('road:plates', [])).filter(p => at.t - p.t < 90_000).map(p => p.plate);
  const where = at.lat ? `https://maps.google.com/?q=${at.lat},${at.lng}` : 'position inconnue';
  const { queueTelegramAlbum } = await import('../notifications/tg-outbox.js');
  await queueTelegramAlbum(`🎥 BOÎTE NOIRE — freinage brutal à ${hm(at.t)} (${Math.round(from)} → ${Math.round(at.kmh ?? 0)} km/h).\n📍 ${where}\n${plates.length ? `🔢 Plaques vues juste avant : ${[...new Set(plates)].join(', ')}\n` : ''}Les ${urls.length} dernières images sont gardées 30 jours (preuve pour un constat). Tout va bien ?`, urls);
}

/** Une image de la route. */
export async function roadFrame(o: { image: string; lat?: number; lng?: number; kmh?: number }): Promise<{ say?: string; limit?: number | null; plates?: string[] }> {
  const now = Date.now();
  if (!o.image || o.image.length > 1_200_000) return {};
  const f: Frame = { t: now, jpg: o.image, ...(o.lat != null ? { lat: o.lat, lng: o.lng } : {}), ...(o.kmh != null ? { kmh: o.kmh } : {}) };
  ring.push(f); if (ring.length > 15) ring.shift();
  if (st.said.length === 0 && !st.limitAt) st = await kvJson<RoadState>('road:state', { said: [] });
  // Boîte noire : chute de ≥ 25 km/h en ≤ 6 s depuis ≥ 40 km/h
  if (o.kmh != null) {
    speeds.push({ t: now, kmh: o.kmh }); while (speeds.length && now - speeds[0]!.t > 8000) speeds.shift();
    const top = Math.max(...speeds.map(s => s.kmh));
    if (top >= 40 && top - o.kmh >= 25 && now - (st.lastBox ?? 0) > 120_000) { st.lastBox = now; void blackBox(f, top).catch(e => console.warn('[road] boîte noire', e)); }
  }
  // La limite gardée expire après 3 km ou 15 min sans panneau
  if (st.limit && ((o.lat != null && st.limitLat != null && km({ lat: o.lat, lng: o.lng! }, { lat: st.limitLat, lng: st.limitLng! }) > 3) || now - (st.limitAt ?? 0) > 15 * 60_000)) delete st.limit;
  let j: { limit?: number | null; end_limit?: boolean; plates?: string[]; hazard?: string | null; sign?: string | null; scene?: string } = {};
  try {
    j = JSON.parse((await gemini(`Image de la caméra avant d'une voiture (Belgique / France / Algérie), conducteur : Kouider. JSON :
{"limit": nombre si un panneau de LIMITATION DE VITESSE est clairement visible maintenant (rond rouge avec un nombre, ou zone 30 / 50), sinon null,
 "end_limit": true si panneau de fin de limitation / fin de zone,
 "plates": [plaques d'immatriculation lisibles en entier],
 "hazard": phrase de 6 mots max s'il y a un danger IMMÉDIAT (piéton ou vélo qui traverse devant, feu rouge proche, voiture arrêtée devant, travaux sur la voie), sinon null,
 "sign": panneau important autre que la vitesse (sens interdit, stop, céder le passage, zone école, radar annoncé), sinon null,
 "scene": "4 mots"}`, o.image)).replace(/^```json|```$/g, '').trim());
  } catch { return { limit: st.limit ?? null }; }
  if (j.end_limit) delete st.limit;
  if (typeof j.limit === 'number' && j.limit >= 10 && j.limit <= 130) { st.limit = j.limit; st.limitAt = now; if (o.lat != null) { st.limitLat = o.lat; st.limitLng = o.lng; } }
  const plates = (j.plates ?? []).map(p => String(p).toUpperCase().trim()).filter(p => p.length >= 5 && p.length <= 12).slice(0, 4);
  if (plates.length) {
    const all = await kvJson<Array<{ t: number; plate: string; lat?: number; lng?: number }>>('road:plates', []);
    for (const p of plates) all.push({ t: now, plate: p, ...(o.lat != null ? { lat: o.lat, lng: o.lng } : {}) });
    await kvPut('road:plates', all.filter(x => now - x.t < 7 * 86_400_000).slice(-1500));
  }
  // Mémoire visuelle partagée avec l'Œil (au plus toutes les 20 s, ou dès qu'il y a une plaque / un panneau)
  if (now - lastLog > 20_000 || plates.length || j.sign) {
    lastLog = now;
    const log = await kvJson<Array<Record<string, unknown>>>('eye:log', []);
    log.push({ t: now, scene: `en voiture — ${j.scene ?? ''}`.slice(0, 80), objects: j.sign ?? '', texts: plates.join(', '), people: '', ...(o.lat != null ? { lat: o.lat, lng: o.lng } : {}) });
    await kvPut('eye:log', log.filter(e => now - Number(e['t']) < 7 * 86_400_000).slice(-3000));
  }
  let say: string | undefined;
  const fresh = (s: string) => !st.said.includes(s) || now - (st.lastSay ?? 0) > 60_000;
  if (st.limit && o.kmh != null && o.kmh > st.limit + 4 && now - (st.lastWarn ?? 0) > 30_000) {
    st.lastWarn = now; say = `Attention, c'est limité à ${st.limit}, tu es à ${Math.round(o.kmh)}.`;
  } else if (j.hazard && fresh(j.hazard) && now - (st.lastSay ?? 0) > 12_000) say = j.hazard;
  else if (j.sign && fresh(j.sign) && now - (st.lastSay ?? 0) > 20_000 && /radar|école|ecole|sens interdit/i.test(j.sign)) say = j.sign;
  if (say) { st.lastSay = now; st.said = [...st.said, say].slice(-8); }
  await kvPut('road:state', st, 86_400);
  return { ...(say ? { say } : {}), limit: st.limit ?? null, plates };
}

/** Résumé de la route du jour (pour l'outil / la carte du soir). */
export async function roadToday(): Promise<string> {
  const { date } = localNow();
  const plates = (await kvJson<Array<{ t: number; plate: string }>>('road:plates', [])).filter(p => localNow(p.t).date === date);
  return plates.length ? `🚗 Route du jour : ${new Set(plates.map(p => p.plate)).size} plaques retenues (dernière à ${hm(plates[plates.length - 1]!.t)}).` : 'Pas de route filmée aujourd\'hui.';
}
