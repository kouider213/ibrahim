import { kvJson, kvPut } from './ai-util.js';
import { localNow } from './morning-routine.js';

// 04/11 (Kouider) : « et quand je suis en vacances, en Algérie ou dans un autre pays ? » → MODE VACANCES dans la voiture.
// « Je suis souvent avec ma femme et mon fils mais ça m'arrive d'être avec mon associé Houari bof » →
//   - en vacances : FAMILLE par défaut à chaque trajet ;
//   - « je suis avec Houari » / « on est en famille » / « je suis seul » = qui est dans la voiture, jusqu'à la fin de la journée
//     (marche aussi hors vacances) ;
//   - vacances = voyage enregistré (trips.ts), OU position à plus de 300 km de la maison, OU « je suis en vacances »
//     (jusqu'à « fin des vacances », 45 jours max) ;
//   - l'heure dite est celle du pays où il est (fuseau d'après le GPS) ; le logement de vacances = « la maison » là-bas.

export type Company = 'famille' | 'houari' | 'seul';
const COMPANY_K = 'car:company', VAC_K = 'car:vacation', LODGING_K = 'car:vac-lodging', TZ_K = 'car:tz-cache';
const FAR_KM = 300;

type LL = { lat: number; lng: number };
const km = (a: LL, b: LL) => {
  const R = 6371, r = Math.PI / 180, dl = (b.lat - a.lat) * r, dg = (b.lng - a.lng) * r;
  const x = Math.sin(dl / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dg / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
};

export async function herePos(pos: Partial<LL> = {}): Promise<LL | null> {
  if (Number.isFinite(pos.lat) && pos.lat && Number.isFinite(pos.lng)) return { lat: pos.lat!, lng: pos.lng! };
  const loc = await import('./location.js').then(m => m.getLocation('kouider')).catch(() => null);
  return loc && Date.now() - Date.parse(loc.updated_at) < 6 * 3600_000 ? { lat: loc.lat, lng: loc.lng } : null;
}

async function homePos(): Promise<LL | null> {
  const [{ geocode }, { getRoutineConfig }] = await Promise.all([import('./departures.js'), import('./morning-routine.js')]);
  const a = (await getRoutineConfig()).addresses;
  return a?.home ? geocode(a.home).catch(() => null) : null;
}

/** Fuseau horaire du lieu (Open-Meteo, gratuit), mis en cache par zone d'environ 50 km. */
export async function tzAt(p: LL | null): Promise<string> {
  if (!p) return 'Europe/Brussels';
  const key = `${p.lat.toFixed(0)},${p.lng.toFixed(0)}`;
  const cache = await kvJson<Record<string, string>>(TZ_K, {});
  if (cache[key]) return cache[key]!;
  try {
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${p.lat.toFixed(2)}&longitude=${p.lng.toFixed(2)}&current=temperature_2m&timezone=auto`, { signal: AbortSignal.timeout(6000) });
    const tz = r.ok ? ((await r.json()) as { timezone?: string }).timezone : undefined;
    if (tz && tz !== 'GMT') { cache[key] = tz; await kvPut(TZ_K, cache); return tz; }
  } catch { /* fuseau belge par défaut */ }
  return 'Europe/Brussels';
}

/** Qui est dans la voiture, dit par Kouider aujourd'hui (null = rien dit). */
export async function saidCompany(): Promise<Company | null> {
  const c = await kvJson<{ mode: Company; date: string } | null>(COMPANY_K, null);
  return c && c.date === localNow().date ? c.mode : null;
}

export interface Vacation { on: boolean; why: string; country?: string; tz: string; algeria: boolean; here: LL | null }

export async function vacationState(pos: Partial<LL> = {}): Promise<Vacation> {
  const here = await herePos(pos);
  const tz = await tzAt(here);
  const algeria = tz === 'Africa/Algiers';
  const manual = await kvJson<{ since: number; off?: boolean } | null>(VAC_K, null);
  if (manual && !manual.off && Date.now() - manual.since < 45 * 86_400_000) return { on: true, why: 'dit par Kouider', tz, algeria, here };
  const trip = await import('./trips.js').then(m => m.kouiderAwayOn(localNow().date)).catch(() => null);
  if (trip) return { on: true, why: `voyage : ${trip}`, tz, algeria, here };
  const home = await homePos().catch(() => null);
  if (here && home && km(here, home) > FAR_KM) return { on: true, why: `à ${Math.round(km(here, home))} km de la maison`, tz, algeria, here };
  return { on: false, why: '', tz, algeria, here };
}

/** Qui est dans la voiture pour CE trajet : ce qu'il a dit aujourd'hui > vacances (famille) > null (règles normales). */
export async function rideCompany(v: Vacation): Promise<Company | null> {
  return (await saidCompany()) ?? (v.on ? 'famille' : null);
}

const clock = (hhmm: string) => `Il est ${hhmm.replace(':', ' heures ').replace(/ 00$/, '')}`;

async function weatherLine(here: LL | null): Promise<string> {
  const m = here ? await import('./forme-runs-pro.js').then(x => x.weatherAt(here.lat, here.lng, Date.now())).catch(() => null) : null;
  return m ? `, ${Math.round(m.temp)} degrés dehors, ${m.label.toLowerCase()}${m.rain ? ', prudence sur la route' : ''}` : '';
}

/** Prochaine étape de l'agenda dans les 6 h (sans rien de privé) : « le vol dans 2 heures 10 ». */
async function nextStep(travelOnly: boolean): Promise<string> {
  const evs = await import('./google-calendar.js').then(m => m.listAgendaRange(new Date().toISOString(), new Date(Date.now() + 6 * 3600_000).toISOString())).catch(() => null);
  const PRIV = /libert|m[ée]dicament|vitalit|sant[ée]|m[ée]decin|pharmac|🔒|libre|rdv possibles|disponible/i;
  const TRAVEL = /✈|🧳|vol |a[ée]roport|bateau|ferry|train/i;
  const e = ((evs ?? []) as Array<{ summary?: string; start?: { dateTime?: string } }>)
    .find(x => x.start?.dateTime && Date.parse(x.start.dateTime) > Date.now() && !PRIV.test(x.summary ?? '') && (!travelOnly || TRAVEL.test(x.summary ?? '')));
  if (!e) return '';
  const min = Math.round((Date.parse(e.start!.dateTime!) - Date.now()) / 60_000);
  const left = min >= 60 ? `${Math.floor(min / 60)} heure${min >= 120 ? 's' : ''}${min % 60 ? ` ${min % 60}` : ''}` : `${min} minutes`;
  const name = (e.summary ?? '').replace(/[\p{Extended_Pictographic}️]/gu, '').replace(/\s+/g, ' ').trim();
  return ` Prochaine étape : ${name}, dans ${left}.`;
}

/** Logement de vacances = là où il démarre le matin (avant 14 h, heure locale) ; le soir, loin de là = retour à la maison. */
async function backToLodging(v: Vacation): Promise<boolean> {
  if (!v.here) return false;
  const { date, hhmm } = localNow(Date.now(), v.tz);
  const lodging = await kvJson<{ date: string; lat: number; lng: number } | null>(LODGING_K, null);
  if (hhmm < '14:00' && (!lodging || lodging.date !== date)) { await kvPut(LODGING_K, { date, ...v.here }); return false; }
  return !!lodging && hhmm >= '17:00' && km(v.here, lodging) > 2;
}

/** Discours de démarrage selon qui est là. Hors vacances, seulement famille/houari (le « seul » garde le discours normal). */
export async function companyGreeting(who: Company, v: Vacation): Promise<string> {
  const { hhmm } = localNow(Date.now(), v.tz);
  const h = Number(hhmm.slice(0, 2));
  const salut = h < 5 || h >= 18 ? 'Bonsoir' : 'Bonjour';
  const [weather, home] = await Promise.all([weatherLine(v.here), v.on ? backToLodging(v) : Promise.resolve(false)]);
  // « Bienvenue au pays » : une seule fois par jour (pas à chaque démarrage)
  let pays = '';
  if (v.on && v.algeria) {
    const { date } = localNow(Date.now(), v.tz);
    if ((await kvJson<string>('car:vac-welcome', '')) !== date) { pays = ' Bienvenue au pays, monsieur.'; await kvPut('car:vac-welcome', date); }
  }
  const ret = home ? ' Cap sur la maison, bonne fin de journée.' : '';
  if (who === 'houari') {
    return `${salut} Kouider, ${salut.toLowerCase()} Houari. ${clock(hhmm)}${weather}. Protocole associés activé.${pays}${await nextStep(false)}${ret} Deux associés dans la même voiture : c'est comme ça qu'on construit quelque chose qui dure. Bonne route à vous deux.`;
  }
  if (who === 'famille') {
    const p = v.on ? 'Protocole vacances en famille activé : pas de travail, pas de business, seulement vous trois.' : 'Protocole famille activé : aujourd\'hui, rien d\'autre ne compte que vous trois.';
    return `${salut} à toute la famille. ${clock(hhmm)}${weather}. ${p}${pays}${await nextStep(true)}${ret} Profitez de ce moment ensemble.`;
  }
  return `${salut} Kouider. ${clock(hhmm)}${weather}. Protocole vacances activé.${pays}${await nextStep(true)}${ret} Rien à gérer aujourd'hui : reposez-vous, vous l'avez mérité.`;
}

// ── Phrases de Kouider (orchestrator) ───────────────────────────────────────

const HOUARI_RE = /\b(je suis|on est|suis|je roule|en voiture)\s+(avec|à côté de)\s+houari\b|\bhouari\s+(est\s+)?avec moi\b/i;
const FAMILY_RE = /\b(on est en famille|je suis (avec|en voiture avec) (ma femme|ma famille|mon fils|ibrahim)|(ma femme|ma famille) (est )?avec moi|mode famille)\b/i;
const ALONE_RE = /\b(je suis (tout )?seul|mode seul)\b/i;
const VAC_ON_RE = /\b(je suis|on est|nous sommes|suis)\s+en\s+vacances?\b|\bmode vacances\b/i;
const VAC_OFF_RE = /\b(fin des vacances|vacances (sont )?finies|plus en vacances|vacances termin[ée]es)\b/i;

/** Retourne { reply, direct } si le message parle de qui est dans la voiture / des vacances ; direct = message court
 *  (réponse sans le cerveau). Message plus long : le réglage est fait, le cerveau répond au reste. */
export async function companyFromMessage(text: string): Promise<{ reply: string; direct: boolean } | null> {
  const t = text.trim();
  const parts: string[] = [];
  if (VAC_OFF_RE.test(t)) { await kvPut(VAC_K, { since: Date.now(), off: true }); parts.push('🏠 Fin des vacances : la voiture reprend le mode normal.'); }
  else if (VAC_ON_RE.test(t)) { await kvPut(VAC_K, { since: Date.now() }); parts.push('🌴 Mode vacances activé dans la voiture : pas de travail, heure du pays, famille par défaut. Dis « fin des vacances » au retour.'); }
  const who: Company | null = HOUARI_RE.test(t) ? 'houari' : FAMILY_RE.test(t) ? 'famille' : ALONE_RE.test(t) ? 'seul' : null;
  if (who) {
    await kvPut(COMPANY_K, { mode: who, date: localNow().date });
    parts.push(who === 'houari' ? '🤝 Noté : Houari est avec toi. Dans la voiture, je vous salue tous les deux, rien de privé, jusqu\'à ce soir.'
      : who === 'famille' ? '👨‍👩‍👦 Noté : mode famille dans la voiture jusqu\'à ce soir.'
      : '🚗 Noté : tu es seul, discours normal dans la voiture jusqu\'à ce soir.');
  }
  if (!parts.length) return null;
  return { reply: parts.join('\n'), direct: t.length <= 60 };
}
