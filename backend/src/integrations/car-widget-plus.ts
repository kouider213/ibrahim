/**
 * 🚗 WIDGET CARPLAY + JARVIS (04/11/2026, Kouider : « rajoute-les tous ») — toujours SANS AUCUN CHIFFRE à l'écran :
 *  1. QUAND PARTIR  : prochain RDV de l'agenda avec adresse (≤ 3 h) → « Partez maintenant », « Départ dans la demi-heure »…
 *  2. TRAFIC        : vers ce RDV (ou vers la maison au retour) → « Route fluide », « Trafic chargé, partez plus tôt ».
 *  3. CLIENT ATTEND : dernier message WhatsApp d'un client sans réponse (15 min → 24 h) → « Un client attend votre réponse ».
 *     Jamais de nom ni de texte (passagers).
 *  4. RETARD PRÉDIT : d'où il est, il arrivera en retard → « Retard probable, je vous propose de prévenir ».
 *  6. ARRIVÉE       : CarPlay coupé → « Bienvenue à la maison, Monsieur » + demain + phrase de fin (voix Jarvis).
 * Trajets Google Maps gardés 10 min en cache (le widget se rafraîchit ~toutes les 15 min).
 */
import { kvJson, kvPut } from './ai-util.js';
import { localNow } from './morning-routine.js';

type LatLng = { lat: number; lng: number };
const ROUTINE = /^(🟢|🏠|🚿|⏰|🍽️|😴|🕌|🧘|📚)/u;
const PRIVATE = /libert[ée]|m[ée]dic|pharma|traitement|dose|sant[ée]|vitalit|🕊️|objectif perso|appel perso|rdv perso/i;

async function homePos(): Promise<LatLng | null> {
  const { getRoutineConfig } = await import('./morning-routine.js');
  const { geocode } = await import('./departures.js');
  const cfg = await getRoutineConfig().catch(() => null);
  return cfg?.addresses?.home ? geocode(cfg.addresses.home).catch(() => null) : null;
}
async function cachedDrive(o: LatLng, d: LatLng): Promise<{ min: number; normal: number } | null> {
  const k = `car:drive:${o.lat.toFixed(2)},${o.lng.toFixed(2)}>${d.lat.toFixed(3)},${d.lng.toFixed(3)}`;
  const c = await kvJson<{ min: number; normal: number; at: number } | null>(k, null);
  if (c && Date.now() - c.at < 10 * 60_000) return c;
  const t = await import('./departures.js').then(m => m.drive(o, d)).catch(() => null);
  if (t) await kvPut(k, { ...t, at: Date.now() }, 3600).catch(() => {});
  return t;
}
const trafficWords = (t: { min: number; normal: number }, to: string) =>
  t.min - t.normal >= 5 ? `Trafic chargé ${to} · partez plus tôt` : t.min - t.normal >= 2 ? `Un peu de trafic ${to}` : `Route fluide ${to}`;

export interface CarRoad { go: string; road: string; late: string }
/** 1 + 2 + 4 : quand partir, trafic, retard prédit — tout en mots. */
export async function carRoad(here: LatLng, fresh: boolean, homeward: boolean): Promise<CarRoad> {
  const out: CarRoad = { go: '', road: '', late: '' };
  const now = Date.now();
  const { listAgendaRange } = await import('./google-calendar.js');
  const evs = await listAgendaRange(new Date(now).toISOString(), new Date(now + 3 * 3600_000).toISOString(), 20).catch(() => null);
  const ev = (evs ?? []).find(e => e.start.dateTime && e.location?.trim() && e.transparency !== 'transparent' && !ROUTINE.test(e.summary ?? '') && Date.parse(e.start.dateTime) > now);
  const home = await homePos();
  const { geocode, km } = await import('./departures.js');
  if (ev) {
    const dest = await geocode(ev.location!).catch(() => null);
    const origin = fresh ? here : home ?? here;
    if (dest && km(origin, dest) > 0.4 && km(origin, dest) < 150) {
      const t = await cachedDrive(origin, dest);
      if (t) {
        const raw = (ev.summary ?? 'RDV').replace(/^[^\p{L}\d]+/u, '').split(' — ')[0]!.trim();
        const name = PRIVATE.test(raw) ? 'votre rendez-vous' : /^belgique$/i.test(raw) || /wemmel/i.test(ev.location!) ? 'le travail' : raw.slice(0, 28);
        const start = Date.parse(ev.start.dateTime!);
        const leaveIn = (start - (t.min + 5) * 60_000 - now) / 60_000;
        const lateBy = (now + (t.min + 3) * 60_000 - start) / 60_000;
        if (lateBy >= 5 && fresh) out.late = `Retard probable · ${name} · je vous propose de prévenir`;
        out.go = leaveIn <= 3 ? `Partez maintenant · ${name}` : leaveIn <= 20 ? `Départ dans un quart d'heure · ${name}` : leaveIn <= 45 ? `Départ dans la demi-heure · ${name}` : leaveIn <= 90 ? `Départ dans l'heure · ${name}` : '';
        out.road = trafficWords(t, `vers ${name}`);
        return out;
      }
    }
  }
  // Pas de RDV proche : au retour, le trafic vers la maison
  if (homeward && home && fresh && km(here, home) > 0.6) {
    const t = await cachedDrive(here, home);
    if (t) out.road = trafficWords(t, 'vers la maison');
  }
  return out;
}

/** 3 : un client attend une réponse WhatsApp (sans nom, sans texte). */
export async function clientWaiting(): Promise<string> {
  const h = localNow().hhmm;
  if (h < '07:00' || h >= '22:00') return '';
  const log = await kvJson<Array<{ chat: string; at: number; dir: 'in' | 'out' }>>('wa:convlog', []);
  const last = new Map<string, { at: number; dir: 'in' | 'out' }>();
  for (const m of log) last.set(m.chat, m);
  const now = Date.now();
  const n = [...last.values()].filter(m => m.dir === 'in' && now - m.at > 15 * 60_000 && now - m.at < 24 * 3600_000).length;
  return n === 0 ? '' : n === 1 ? 'Un client attend votre réponse' : 'Des clients attendent votre réponse';
}

/** 6 : CarPlay coupé — discours d'arrivée (à la maison) ou phrase courte (ailleurs). */
export async function arrivalSpeech(pos: LatLng | null): Promise<string> {
  const home = await homePos();
  const { km } = await import('./departures.js');
  const atHome = !!(pos && home && km(pos, home) < 0.6);
  const { date, hhmm } = localNow();
  if (!atHome) return pos ? 'Vous êtes arrivé, Monsieur. Je retiens où la voiture est garée.' : 'Vous êtes arrivé, Monsieur.';
  const last = await kvJson<{ at: number } | null>('car:arrive:last', null);
  await kvPut('car:arrive:last', { at: Date.now() }, 86_400).catch(() => {});
  if (last && Date.now() - last.at < 30 * 60_000) return 'Re-bienvenue, Monsieur.';
  const tomorrow = new Date(Date.parse(`${date}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  const { listAgendaRange } = await import('./google-calendar.js');
  const evs = await listAgendaRange(`${tomorrow}T04:00:00+01:00`, `${tomorrow}T23:00:00+01:00`, 20).catch(() => null);
  const items = (evs ?? []).filter(e => e.transparency !== 'transparent' && !ROUTINE.test(e.summary ?? '') && !PRIVATE.test(e.summary ?? ''))
    .slice(0, 2).map(e => (e.summary ?? '').replace(/^[^\p{L}\d]+/u, '').split(' — ')[0]!.trim()).filter(Boolean);
  const fik = await import('./jarvis4.js').then(m => m.carWidgetData()).catch(() => null) as { nextTitle?: string; nextWhen?: string } | null;
  const evening = hhmm >= '17:00';
  const parts = [
    evening ? 'Bienvenue à la maison, Monsieur.' : 'Bienvenue à la maison, Monsieur. Petite pause méritée.',
    evening ? 'La journée est terminée. Vous avez tenu, et chaque jour comme celui-ci vous rapproche d\'Oran.' : '',
    items.length ? `Demain, il vous attend : ${items.join(', puis ')}.` : evening ? 'Demain, rien de lourd à l\'agenda.' : '',
    fik?.nextTitle && fik.nextTitle !== 'Flotte au calme' ? `Côté FIK, prochain mouvement : ${fik.nextTitle}, ${fik.nextWhen}.` : '',
    evening ? 'Maintenant, la mission, c\'est votre famille. Je garde la boutique.' : 'Je garde la boutique.',
  ];
  return parts.filter(Boolean).join(' ');
}
