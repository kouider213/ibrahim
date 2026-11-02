/**
 * RAPPELS SELON LE LIEU (27/10/2026) — « quand j'arrive chez le garagiste, rappelle-moi de demander pour la courroie ».
 * Le lieu : maison / salle / travail (adresses de la routine), « ici » (position actuelle), une adresse ou un nom de lieu
 * (Google). Chaque position GPS reçue (assistant GPS) → à moins de ~200 m → message Telegram + notification app.
 * Une fois par défaut ; « à chaque fois » = répété (au plus une fois toutes les 6 h). app_kv `placerem:list`.
 */
import { kvGet, kvSet } from './app-store.js';
import { geocode, km } from './departures.js';
import { getLocation } from './location.js';
import { getRoutineConfig, localTs } from './morning-routine.js';
import { queueTelegramMessage } from '../notifications/tg-outbox.js';
import { emitProactive } from '../notifications/mobile-push.js';

interface PlaceRem { id: string; text: string; place: string; lat: number; lng: number; radius: number; repeat: boolean; created: string; firedAt?: string; done?: boolean;
  /** 02/11 : « arrivé » = il faut d'abord l'avoir vu HORS de la zone (créé à la maison → ne sonne pas tout de suite) */
  armed?: boolean;
  /** pas avant (ISO) : « demain quand je rentre de la salle » */
  from?: string }
const KEY = 'placerem:list';

async function list(): Promise<PlaceRem[]> {
  try { return JSON.parse((await kvGet(KEY)) ?? '[]') as PlaceRem[]; } catch { return []; }
}
async function save(l: PlaceRem[]): Promise<void> { await kvSet(KEY, JSON.stringify(l.slice(-60))); }

async function locate(place: string): Promise<{ lat: number; lng: number; label: string } | null> {
  const p = place.trim().toLowerCase();
  if (/^(ici|l[àa]|o[uù] je suis)$/.test(p)) {
    const loc = await getLocation('kouider').catch(() => null);
    return loc ? { lat: loc.lat, lng: loc.lng, label: 'ici (position actuelle)' } : null;
  }
  const a = (await getRoutineConfig()).addresses;
  const alias = /maison|chez moi|domicile/.test(p) ? a.home : /salle|sport|gym/.test(p) ? a.gym : /travail|boulot|taf/.test(p) ? a.work : '';
  if (alias) { const g = await geocode(alias).catch(() => null); return g ? { ...g, label: place } : null; }
  // Nom de lieu → Google Places autour de lui, sinon géocodage simple
  const key = process.env['GOOGLE_MAPS_API_KEY'];
  if (key) {
    const loc = await getLocation('kouider').catch(() => null);
    const j = await fetch(`https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(place)}&language=fr&key=${key}${loc ? `&location=${loc.lat},${loc.lng}&radius=20000` : ''}`)
      .then(r => r.json()).catch(() => ({})) as { results?: Array<{ name: string; formatted_address?: string; geometry: { location: { lat: number; lng: number } } }> };
    const r = j.results?.[0];
    if (r) return { ...r.geometry.location, label: `${r.name}${r.formatted_address ? `, ${r.formatted_address}` : ''}` };
  }
  const g = await geocode(place).catch(() => null);
  return g ? { ...g, label: place } : null;
}

/** Appelé à chaque position GPS de Kouider (assistant GPS).
 *  02/11 : 7 « Tu es arrivé — maison » d'un coup → positions traitées une par une (verrou) + armement hors zone. */
let chain: Promise<void> = Promise.resolve();
export function checkPlaceReminders(pos: { lat: number; lng: number }): Promise<void> {
  chain = chain.then(() => checkOnce(pos)).catch(() => {});
  return chain;
}
async function checkOnce(pos: { lat: number; lng: number }): Promise<void> {
  const all = await list();
  let changed = false;
  for (const r of all) {
    if (r.done) continue;
    const d = km(pos, r) * 1000;
    if (r.armed === false) { if (d > r.radius + 150) { r.armed = true; changed = true; } continue; }
    if (d > r.radius) continue;
    if (r.from && Date.now() < Date.parse(r.from)) continue;
    if (r.firedAt && Date.now() - Date.parse(r.firedAt) < 6 * 3600_000) continue;
    r.firedAt = new Date().toISOString();
    if (!r.repeat) r.done = true; else r.armed = false;   // répété : il doit ressortir avant de re-sonner
    changed = true;
    const text = `📍 Tu es arrivé — ${r.place}\n🔔 ${r.text}`;
    await save(all);   // enregistré AVANT d'envoyer : jamais deux fois
    await queueTelegramMessage(text).catch(() => {});
    emitProactive(`📍 ${r.place} : ${r.text.slice(0, 80)}`, 'alert', text);
  }
  if (changed) await save(all);
}

export async function placeReminderTool(input: Record<string, unknown>): Promise<string> {
  const action = String(input['action'] ?? 'list');
  const all = await list();
  if (action === 'add') {
    const text = String(input['text'] ?? '').trim(), place = String(input['place'] ?? '').trim();
    if (!text || !place) return '❌ Il me faut le rappel (text) ET le lieu (place).';
    const p = await locate(place);
    if (!p) return `❌ Je ne trouve pas « ${place} » sur la carte. Donne une adresse, ou dis « ici » quand tu y es.`;
    const radius = Math.min(Math.max(Number(input['radius_m']) || 200, 80), 2000);
    const here = await getLocation('kouider').catch(() => null);
    const inside = !!here && km({ lat: here.lat, lng: here.lng }, p) * 1000 <= radius + 150;
    const fromRaw = String(input['from'] ?? '').trim();
    const from = /^\d{4}-\d{2}-\d{2}/.test(fromRaw) ? new Date(localTs(fromRaw.slice(0, 10), /\d{2}:\d{2}$/.test(fromRaw) ? fromRaw.slice(-5) : '00:00')).toISOString() : undefined;
    const r: PlaceRem = { id: Math.random().toString(36).slice(2, 8), text, place: p.label, lat: p.lat, lng: p.lng, radius, repeat: input['repeat'] === true, created: new Date().toISOString(),
      ...(inside ? { armed: false } : {}), ...(from ? { from } : {}) };
    await save([...all, r]);
    return `✅ Rappel de lieu enregistré : en arrivant à ${p.label} (à ${radius} m), je te dis « ${text} »${r.repeat ? ' — à chaque passage' : ''}${from ? ` (pas avant ${fromRaw})` : ''}${inside ? ' — tu y es déjà : il sonnera la prochaine fois que tu y arrives' : ''}.\n(Il faut que ta position soit partagée : app ou position en direct Telegram.)`;
  }
  if (action === 'delete') {
    const q = String(input['id'] ?? input['text'] ?? '').toLowerCase();
    const keep = all.filter(r => !(r.id === q || (q && (r.text.toLowerCase().includes(q) || r.place.toLowerCase().includes(q)))));
    await save(keep);
    return `🗑️ ${all.length - keep.length} rappel(s) de lieu supprimé(s).`;
  }
  const open = all.filter(r => !r.done);
  return open.length ? `📍 Rappels de lieu actifs :\n${open.map(r => `• [${r.id}] ${r.place} → « ${r.text} »${r.repeat ? ' (à chaque fois)' : ''}`).join('\n')}` : 'Aucun rappel de lieu actif.';
}
