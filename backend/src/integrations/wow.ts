/**
 * « EFFET WOW » (Kouider 28/10 : « des capacités qui me laissent sur le cul ») — tout part de ce que Dzaryx sait déjà
 * (GPS en direct, agenda, trafic, WhatsApp, montre) :
 *  - RETARD PRÉDIT : il voit avant toi que tu arriveras en retard à un RDV (position + trafic) → boutons « prévenir la
 *    personne sur WhatsApp avec l'heure exacte » / « décaler le RDV ».
 *  - PARCMÈTRE MALIN : « j'ai payé 2 h » → il sait où est la voiture et combien de temps il te faut À PIED depuis où tu
 *    es pour y retourner : il te prévient pile quand il faut repartir (pas à l'heure de fin, quand il faut MARCHER).
 *  - DÉJÀ-VU : tu t'arrêtes dans un endroit où tu es déjà venu → quand, combien de temps, et ce que tu y faisais (agenda).
 *  - CARTE DE TA JOURNÉE (21h45) : ton trajet du jour dessiné sur une carte + km, temps au volant, lieux, pas, séance.
 */
import { kvJson, kvPut, tg } from './ai-util.js';
import { getLocation } from './location.js';
import { geocode, drive, km } from './departures.js';
import { listAgendaRange } from './google-calendar.js';
import { localNow, hm } from './morning-routine.js';

interface Pt { t: number; lat: number; lng: number }
interface Visit { lat: number; lng: number; from: number; to: number; label?: string; place?: string }
const LATE_KEY = 'wow:late', PARK_KEY = 'wow:parkmeter';
const ROUTINE = /^(🏋️|🚗|🚿|⏰|🟢|🍽️|😴|🕌|🧘|📚)/u;
const fmtDay = (ts: number) => new Date(ts).toLocaleDateString('fr-FR', { timeZone: 'Europe/Brussels', weekday: 'long', day: 'numeric', month: 'long' });

async function myPos(maxAgeMin = 10): Promise<{ lat: number; lng: number } | null> {
  const loc = await getLocation('kouider').catch(() => null);
  return loc && Date.now() - Date.parse(loc.updated_at) < maxAgeMin * 60_000 ? { lat: loc.lat, lng: loc.lng } : null;
}

async function walkMin(o: { lat: number; lng: number }, d: { lat: number; lng: number }): Promise<number> {
  const key = process.env['GOOGLE_MAPS_API_KEY'];
  const fallback = Math.ceil(km(o, d) * 1.3 / 4.8 * 60);     // 4,8 km/h, rues pas droites
  if (!key) return fallback;
  try {
    const r = await fetch(`https://maps.googleapis.com/maps/api/distancematrix/json?origins=${o.lat},${o.lng}&destinations=${d.lat},${d.lng}&mode=walking&language=fr&key=${key}`, { signal: AbortSignal.timeout(8000) });
    const j = await r.json() as { rows?: Array<{ elements?: Array<{ status: string; duration?: { value: number } }> }> };
    const e = j.rows?.[0]?.elements?.[0];
    return e?.status === 'OK' && e.duration ? Math.ceil(e.duration.value / 60) : fallback;
  } catch { return fallback; }
}

// ── Retard prédit ────────────────────────────────────────────────────────────
async function lateWatch(): Promise<void> {
  const now = Date.now();
  const evs = await listAgendaRange(new Date(now).toISOString(), new Date(now + 2 * 3600_000).toISOString(), 30).catch(() => null);
  const ev = (evs ?? []).find(e => e.start.dateTime && e.location && e.transparency !== 'transparent' && !ROUTINE.test(e.summary ?? '')
    && Date.parse(e.start.dateTime) - now < 100 * 60_000 && Date.parse(e.start.dateTime) > now);
  if (!ev?.id) return;
  const done = await kvJson<Record<string, number>>(LATE_KEY, {});
  if (done[ev.id]) return;
  const pos = await myPos();
  const dest = await geocode(ev.location!).catch(() => null);
  if (!pos || !dest || km(pos, dest) < 0.5) return;
  const t = await drive(pos, dest).catch(() => null);
  if (!t) return;
  const start = Date.parse(ev.start.dateTime!);
  const arrive = now + (t.min + 3) * 60_000;                 // + 3 min pour se garer
  const late = Math.round((arrive - start) / 60_000);
  if (late < 5) return;
  for (const k of Object.keys(done)) if (now - done[k]! > 2 * 86_400_000) delete done[k];
  done[ev.id] = now;
  await kvPut(LATE_KEY, done);
  const phone = `${ev.description ?? ''} ${ev.location ?? ''}`.match(/(\+?\d[\d .]{8,}\d)/)?.[1]?.replace(/[ .]/g, '');
  const who = (ev.summary ?? '').replace(/^(rdv|rendez-vous|réunion|meeting)\s*(avec)?\s*/i, '').split(/[—\-–(]/)[0]!.trim() || ev.summary;
  const at = hm(arrive + 2 * 60_000);
  const msg = `Bonjour, petit contretemps sur la route, j'arrive vers ${at}. Désolé pour l'attente, à tout de suite !`;
  const { createDecision } = await import('./conscience.js');
  await createDecision(`⏰ Je vois que tu vas être en retard : « ${ev.summary} » est à ${hm(start)}, et d'où tu es il y a ${t.min} min de route${t.min > t.normal + 4 ? ` (bouchons +${t.min - t.normal} min)` : ''} → arrivée vers ${hm(arrive)}, ~${late} min de retard.`, [
    { label: `Prévenir ${phone ?? who} sur WhatsApp (« j'arrive vers ${at} »)`, tool: 'whatsapp_web', input: { action: 'send', chat: phone ?? who, text: msg } },
    { label: `Décaler le RDV de ${Math.ceil(late / 5) * 5} min`, tool: 'update_agenda_event', input: { google_event_id: ev.id,
      start_datetime: new Date(start + Math.ceil(late / 5) * 5 * 60_000).toISOString(), end_datetime: new Date(Date.parse(ev.end.dateTime ?? ev.start.dateTime!) + Math.ceil(late / 5) * 5 * 60_000).toISOString() } },
    { label: 'Rien, je gère', say: 'Ok, je ne touche à rien.' },
  ]);
}

// ── Parcmètre malin ──────────────────────────────────────────────────────────
interface Park { until: number; lat: number; lng: number; warned?: boolean; late?: boolean }
export async function parkmeterTool(input: Record<string, unknown>): Promise<string> {
  const action = String(input['action'] ?? 'set');
  if (action === 'cancel') { await kvPut(PARK_KEY, null); return '✅ Parcmètre oublié.'; }
  if (action === 'status') {
    const p = await kvJson<Park | null>(PARK_KEY, null);
    if (!p || p.until < Date.now() - 3600_000) return 'Pas de parcmètre en cours.';
    const pos = await myPos(15);
    const w = pos ? await walkMin(pos, p) : null;
    return `🅿️ Payé jusqu'à ${hm(p.until)} (${Math.round((p.until - Date.now()) / 60_000)} min).${w != null ? ` Tu es à ${w} min à pied de ta voiture → pars au plus tard à ${hm(p.until - (w + 3) * 60_000)}.` : ''}`;
  }
  const min = Number(input['minutes']) || 0;
  const hhmm = String(input['until'] ?? '').replace('h', ':');
  const { date } = localNow();
  const until = /^\d{1,2}:\d{2}$/.test(hhmm) ? (await import('./morning-routine.js')).localTs(date, hhmm.padStart(5, '0')) : min > 0 ? Date.now() + min * 60_000 : 0;
  if (!until || until < Date.now()) return '❌ Dis-moi combien de temps tu as payé (« 2 h ») ou jusqu\'à quelle heure.';
  // La voiture : position actuelle (il vient de payer à côté) sinon la dernière voiture garée notée
  const here = await myPos(15);
  const car = here ?? await kvJson<{ lat: number; lng: number } | null>('gps:parking', null);
  if (!car) return '❌ Je n\'ai pas ta position : partage ta position en direct sur Telegram et redis-le-moi.';
  await kvPut(PARK_KEY, { until, lat: car.lat, lng: car.lng } satisfies Park, 12 * 3600);
  return `🅿️ Noté : payé jusqu'à ${hm(until)}, voiture ${here ? 'ici' : 'à l\'endroit où tu t\'es garé'}. Où que tu sois, je calcule le temps qu'il te faut À PIED pour revenir et je te préviens pile au moment de repartir — pas d'amende.`;
}
async function parkWatch(): Promise<void> {
  const p = await kvJson<Park | null>(PARK_KEY, null);
  if (!p || p.late) return;
  const now = Date.now();
  const pos = await myPos(15);
  const near = pos && km(pos, p) < 0.08;
  if (near) return;                                                                  // il est à la voiture
  const w = pos ? await walkMin(pos, p) : 5;
  const leaveAt = p.until - (w + 4) * 60_000;
  if (!p.warned && now >= leaveAt - 6 * 60_000) {
    p.warned = true;
    await kvPut(PARK_KEY, p, 12 * 3600);
    const link = `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}&travelmode=walking`;
    await tg(`🅿️ Ton parcmètre finit à ${hm(p.until)}. Tu es à ${w} min à pied de ta voiture → mets-toi en route ${now >= leaveAt ? 'MAINTENANT' : `vers ${hm(leaveAt)}`}.\n🚶 ${link}\nTu restes plus longtemps ? Dis « rajoute 1 h au parcmètre » après avoir repayé.`);
    const { emitProactive } = await import('../notifications/mobile-push.js');
    emitProactive(`🅿️ Parcmètre : repars ${now >= leaveAt ? 'maintenant' : `à ${hm(leaveAt)}`} (${w} min à pied)`, 'reminder', undefined, 'kouider', 'parking');
  } else if (p.warned && now >= p.until - 2 * 60_000 && !near) {
    p.late = true;
    await kvPut(PARK_KEY, p, 12 * 3600);
    await tg(`🅿️ Ton parcmètre se termine dans 2 min et tu n'es pas à la voiture. Repaye depuis ton téléphone (app de stationnement) si tu peux, puis dis-moi « rajoute 1 h ».`);
  }
}

// ── Déjà-vu (appelé par gps-life quand il s'arrête quelque part) ──────────────
export async function dejaVu(p: { lat: number; lng: number }): Promise<void> {
  const visits = await kvJson<Visit[]>('gps:visits', []);
  const before = visits.filter(v => !v.place && km(v, p) < 0.1 && Date.now() - v.to > 86_400_000);
  if (!before.length || before.length >= 6) return;           // lieu de tous les jours (supermarché…) : pas intéressant
  const last = before[before.length - 1]!;
  const dur = Math.round((last.to - last.from) / 60_000);
  const evs = await listAgendaRange(new Date(last.from - 60 * 60_000).toISOString(), new Date(last.to).toISOString(), 10).catch(() => null);
  const what = (evs ?? []).find(e => e.start.dateTime && !ROUTINE.test(e.summary ?? ''))?.summary;
  await tg(`🔁 Déjà-vu : tu es déjà venu ici${last.label ? ` (${last.label})` : ''} ${fmtDay(last.from)} à ${hm(last.from)}, ${dur >= 60 ? `${Math.floor(dur / 60)} h ${String(dur % 60).padStart(2, '0')}` : `${dur} min`}${what ? ` — c'était pour « ${what} »` : ''}.${before.length > 1 ? ` C'est ta ${before.length + 1}e fois ici.` : ''}`);
}

// ── Carte de ta journée ─────────────────────────────────────────────────────
export async function dayMap(send = true): Promise<string> {
  const { date } = localNow();
  const dayStart = (await import('./morning-routine.js')).localTs(date, '00:00');
  const pts = (await kvJson<Pt[]>('gps:track', [])).filter(x => x.t >= dayStart);
  if (pts.length < 6) return 'Pas assez de positions aujourd\'hui pour dessiner ta journée (partage ta position en direct sur Telegram).';
  let dist = 0, driveMs = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = km(pts[i - 1]!, pts[i]!), h = (pts[i]!.t - pts[i - 1]!.t) / 3600_000;
    if (h > 0 && h < 0.25) { dist += d; if (d / h >= 20) driveMs += pts[i]!.t - pts[i - 1]!.t; }
  }
  const visits = (await kvJson<Visit[]>('gps:visits', [])).filter(v => v.to >= dayStart && v.to - v.from >= 10 * 60_000);
  const health = (await kvJson<Array<{ date: string; steps?: number }>>('health:daily', [])).find(h => h.date === date);
  const step = Math.max(1, Math.ceil(pts.length / 180));
  const path = pts.filter((_, i) => i % step === 0 || i === pts.length - 1).map(x => `${x.lat.toFixed(5)},${x.lng.toFixed(5)}`).join('|');
  const markers = visits.slice(0, 9).map((v, i) => `&markers=color:0xF59E0B%7Clabel:${i + 1}%7C${v.lat.toFixed(5)},${v.lng.toFixed(5)}`).join('');
  const key = process.env['GOOGLE_MAPS_API_KEY'];
  let img: string | undefined;
  if (key) {
    try {
      const url = `https://maps.googleapis.com/maps/api/staticmap?size=640x640&scale=2&maptype=roadmap&path=color:0x3B82F6ff%7Cweight:5%7C${path}${markers}&key=${key}`;
      const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (r.ok) img = Buffer.from(await r.arrayBuffer()).toString('base64');
    } catch { /* texte seul */ }
  }
  const dm = Math.round(driveMs / 60_000);
  const text = [`🗺️ Ta journée du ${fmtDay(dayStart + 12 * 3600_000)}`,
    `🚗 ${dist.toFixed(1).replace('.', ',')} km parcourus · ${dm >= 60 ? `${Math.floor(dm / 60)} h ${String(dm % 60).padStart(2, '0')}` : `${dm} min`} au volant${health?.steps ? ` · 👣 ${health.steps.toLocaleString('fr-FR')} pas` : ''}`,
    ...visits.slice(0, 9).map((v, i) => `${i + 1}. ${v.label ?? 'Arrêt'} — ${hm(v.from)}–${hm(v.to)}`),
  ].join('\n');
  if (send) await tg(text, img);
  return `${text}${img && send ? '\n(carte envoyée sur Telegram)' : ''}`;
}

/** Toutes les 5 min (6h-23h). */
export async function jobWowWatch(): Promise<void> {
  await lateWatch().catch(e => console.warn('[wow] retard', e instanceof Error ? e.message : e));
  await parkWatch().catch(e => console.warn('[wow] parcmètre', e instanceof Error ? e.message : e));
}
