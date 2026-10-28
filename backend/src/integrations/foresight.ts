/**
 * IL VOIT L'AVENIR (Jarvis 4, 28/10/2026)
 *  - SIMULATION DE DEMAIN (21h) : agenda + routine + séance + locations + vols + prières + trajets + énergie → les
 *    collisions avant qu'elles arrivent et le plan B. Gardée pour le bilan « téléphone branché le soir ».
 *  - GARDIEN DES PROMESSES : tout ce qu'il promet (Telegram, appels, WhatsApp envoyés) → rappel avant l'échéance,
 *    avec « je le fais pour toi ? ».
 *  - GPS DE VIE : ses grands objectifs chiffrés → chaque dimanche, sur la route ou pas, avec une probabilité.
 *  - PLAN B PERMANENT : pour chaque location à venir, une voiture de secours libre aux mêmes dates.
 *  - CHANCES DE RÉSERVATION : chaque client WhatsApp noté (« 80 % », « touriste du prix 15 % »).
 *  - IL APPREND À MIEUX VENDRE : discussions qui finissent en réservation vs les autres → leçons chaque dimanche.
 *  - ANTI-REGRET : message énervé → version calme proposée ; prix sous son plancher → rappel (jamais bloquant).
 */
import { kvJson, kvPut, tg, ai, uid } from './ai-util.js';
import { jsonOf } from './media-util.js';
import { localNow, getRoutineConfig } from './morning-routine.js';
import { supabase } from './supabase.js';

const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

// ── Journal WhatsApp (pour les chances, la vente, les promesses) ─────────────
interface WaLog { chat: string; at: number; dir: 'in' | 'out'; text: string }
export async function logWa(chat: string, dir: 'in' | 'out', text: string): Promise<void> {
  const l = await kvJson<WaLog[]>('wa:convlog', []);
  l.push({ chat: chat.slice(0, 80), at: Date.now(), dir, text: text.slice(0, 600) });
  await kvPut('wa:convlog', l.filter(x => Date.now() - x.at < 45 * 86_400_000).slice(-1500));
}

// ── Simulation de demain ─────────────────────────────────────────────────────
async function prayerTimes(date: string, city = 'Brussels', country = 'Belgium'): Promise<string> {
  try {
    const [y, m, d] = date.split('-');
    const r = await fetch(`https://api.aladhan.com/v1/timingsByCity/${d}-${m}-${y}?city=${city}&country=${country}&method=3`, { signal: AbortSignal.timeout(6000) });
    const t = (await r.json() as { data?: { timings?: Record<string, string> } }).data?.timings;
    return t ? `Fajr ${t['Fajr']}, Dhuhr ${t['Dhuhr']}, Asr ${t['Asr']}, Maghrib ${t['Maghrib']}, Isha ${t['Isha']}` : '';
  } catch { return ''; }
}

export async function simulateTomorrow(send = true): Promise<string> {
  const date = addDays(localNow().date, 1);
  const wd = new Date(`${date}T12:00:00Z`).getUTCDay();
  const { listAgendaRange } = await import('./google-calendar.js');
  const evs = ((await listAgendaRange(`${date}T00:00:00Z`, `${date}T23:59:00Z`).catch(() => null)) ?? []) as Array<{ summary?: string; location?: string; start?: { dateTime?: string; date?: string }; end?: { dateTime?: string } }>;
  const cfg = await getRoutineConfig();
  const oran = await import('./gps-life.js').then(m => m.oranActive()).catch(() => null);
  const [{ data: books }, sport, prayers, energy] = await Promise.all([
    supabase.from('bookings').select('client_name, start_date, end_date, status, cars(name)').or(`start_date.like.${date}%,end_date.like.${date}%`).limit(15),
    import('./sport-coach.js').then(m => m.sportSessionFor(date)).catch(() => null),
    oran ? prayerTimes(date, 'Oran', 'Algeria') : prayerTimes(date),
    kvJson<{ peak: string[]; low: string[] } | null>('energy:profile', null),
  ]);
  const trips = (await kvJson<Array<{ who: string; title: string; departAt: number }>>('trips:v1', [])).filter(t => localNow(t.departAt).date === date);
  const { geocode, drive } = await import('./departures.js');
  const legs: string[] = [];
  const pts = await Promise.all((['home', 'gym', 'work'] as const).map(k => geocode(cfg.addresses[k]).catch(() => null)));
  if (pts[0] && pts[1]) { const d = await drive(pts[0], pts[1]).catch(() => null); if (d) legs.push(`maison→salle ${d.min} min`); }
  if (pts[0] && pts[2]) { const d = await drive(pts[0], pts[2]).catch(() => null); if (d) legs.push(`maison→travail ${d.min} min`); }
  const facts = {
    date, jour: ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'][wd], lieu: oran ? 'Oran (Algérie)' : 'Bruxelles',
    routine: cfg.days[wd], agenda: evs.map(e => `${e.start?.dateTime?.slice(11, 16) ?? 'journée'}-${e.end?.dateTime?.slice(11, 16) ?? ''} ${e.summary ?? ''}${e.location ? ` @${e.location}` : ''}`),
    seance: sport, locations: (books ?? []).filter((b: Record<string, unknown>) => !/REJECT|CANCEL/i.test(String(b['status']))),
    vols: trips.map(t => `${t.who} ${t.title} ${localNow(t.departAt).hhmm}`), prieres: prayers, trajets: legs, energie: energy,
  };
  const o = jsonOf<{ timeline?: string[]; collisions?: Array<{ what: string; fix: string }>; tip?: string }>(await ai(
    `Simule la journée de DEMAIN de Kouider minute par minute avec ces faits réels :\n${JSON.stringify(facts, null, 1)}\n\n`
    + `Déroule-la (réveil, trajets réels, séance, travail, clients, vols, prières, repas, famille) et repère les COLLISIONS : deux choses en même temps, trajet impossible, retard probable, séance qui fait rater un client, fatigue mal placée (chose difficile dans un creux d'énergie). Pour chacune : un plan B concret.\n`
    + `Réponds UNIQUEMENT : {"timeline":["6h40 réveil", "..."] (8-12 lignes),"collisions":[{"what":"…","fix":"…"}],"tip":"1 phrase pour réussir sa journée"}`, { quality: true, max: 1200 }));
  if (!o) return 'Simulation impossible pour le moment.';
  const text = `🔮 Demain (${facts.jour} ${date.slice(8)}/${date.slice(5, 7)})\n${(o.timeline ?? []).join('\n')}${o.collisions?.length ? `\n\n⚠️ Collisions repérées :\n${o.collisions.map(c => `• ${c.what}\n  → ${c.fix}`).join('\n')}` : '\n\n✅ Aucune collision.'}${o.tip ? `\n\n💡 ${o.tip}` : ''}`;
  await kvPut('tomorrow:sim', { date, text, collisions: o.collisions?.length ?? 0 }, 2 * 86_400);
  if (send && o.collisions?.length) await tg(text);
  return text;
}
export async function jobTomorrowSim(): Promise<string> { const t = await simulateTomorrow(true); return t.slice(0, 60); }

// ── Gardien des promesses ────────────────────────────────────────────────────
export interface Promise_ { id: string; to: string; what: string; due: string; source: string; done?: boolean; reminded?: boolean; draft?: string; chat?: string }

export async function jobPromises(): Promise<string> {
  const since = Number(await kvJson<number>('promises:scan', Date.now() - 24 * 3600_000));
  const { data } = await supabase.from('conversations').select('content, created_at').eq('session_id', 'voice_kouider').eq('role', 'user').gte('created_at', new Date(since).toISOString()).order('created_at').limit(200);
  const turns = ((data ?? []) as Array<{ content: string; created_at: string }>).map(t => `[Kouider à Dzaryx ${t.created_at.slice(0, 16)}] ${String(t.content).replace(/^\[[^\]]{20,}\]\s*/s, '').slice(0, 300)}`);
  const wa = (await kvJson<WaLog[]>('wa:convlog', [])).filter(x => x.at > since && x.dir === 'out').map(x => `[WhatsApp envoyé à ${x.chat} ${new Date(x.at).toISOString().slice(0, 16)}] ${x.text}`);
  await kvPut('promises:scan', Date.now());
  if (!turns.length && !wa.length) return 'rien';
  const now = new Date().toISOString().slice(0, 16);
  const o = jsonOf<{ promises?: Array<{ to: string; what: string; due: string; draft?: string; chat?: string }> }>(await ai(
    `Maintenant : ${now} (heure de Bruxelles). Voici des messages de Kouider et des messages WhatsApp envoyés en son nom :\n${[...turns, ...wa].join('\n').slice(-12000)}\n\n`
    + `Trouve les PROMESSES / ENGAGEMENTS de Kouider envers quelqu'un (« je vous rappelle demain », « je vous envoie le contrat », « je passe jeudi », « je lui ai promis la Clio à 27 € », « je dois rembourser Karim samedi »). Ignore les demandes faites à Dzaryx lui-même.\n`
    + `Réponds UNIQUEMENT : {"promises":[{"to":"qui","what":"quoi, court","due":"AAAA-MM-JJTHH:MM (échéance probable ; « demain » = demain 10:00 ; sans date = dans 24 h)","chat":"nom WhatsApp si promis sur WhatsApp","draft":"message prêt à envoyer pour tenir la promesse, si c'est un message"}]}`, { max: 1200 })) ?? {};
  const list = await kvJson<Promise_[]>('promises', []);
  let n = 0;
  for (const p of o.promises ?? []) {
    if (!p.to || !p.what || list.some(x => !x.done && x.to.toLowerCase() === p.to.toLowerCase() && x.what.slice(0, 20).toLowerCase() === p.what.slice(0, 20).toLowerCase())) continue;
    list.push({ id: uid(), to: p.to, what: p.what, due: p.due || new Date(Date.now() + 86_400_000).toISOString().slice(0, 16), source: p.chat ? 'whatsapp' : 'telegram', draft: p.draft, chat: p.chat });
    n++;
  }
  // Échéance dans moins de 2 h, pas encore rappelée → rappel avec bouton « je le fais »
  const { createDecision } = await import('./conscience.js');
  for (const p of list.filter(x => !x.done && !x.reminded && Date.parse(x.due) - Date.now() < 2 * 3600_000)) {
    p.reminded = true;
    await createDecision(`🤝 Promesse à ${p.to} : ${p.what} (prévu ${p.due.slice(11, 16) || 'aujourd\'hui'}).`, [
      ...(p.draft && p.chat ? [{ label: `Je lui envoie : « ${p.draft.slice(0, 60)}… »`, tool: 'whatsapp_web', input: { action: 'send', chat: p.chat, text: p.draft } }] : []),
      { label: 'C\'est fait', tool: 'promesses', input: { action: 'done', id: p.id } },
      { label: 'Rappelle-moi demain', tool: 'promesses', input: { action: 'snooze', id: p.id } },
    ]);
  }
  await kvPut('promises', list.filter(x => !x.done || Date.now() - Date.parse(x.due) < 14 * 86_400_000).slice(-150));
  return `${n} nouvelle(s)`;
}

export async function promisesDue(): Promise<string[]> {
  return (await kvJson<Promise_[]>('promises', [])).filter(p => !p.done && Date.parse(p.due) - Date.now() < 6 * 3600_000).map(p => `${p.to} : ${p.what} (pour ${p.due.replace('T', ' ')})`);
}

export async function promisesTool(input: Record<string, unknown>): Promise<string> {
  const a = String(input['action'] ?? 'list');
  const list = await kvJson<Promise_[]>('promises', []);
  const find = () => list.find(p => p.id === input['id']) ?? list.find(p => !p.done && input['to'] && p.to.toLowerCase().includes(String(input['to']).toLowerCase()));
  if (a === 'add') {
    list.push({ id: uid(), to: String(input['to'] ?? '?'), what: String(input['what'] ?? ''), due: String(input['due'] ?? new Date(Date.now() + 86_400_000).toISOString().slice(0, 16)), source: 'manuel' });
    await kvPut('promises', list);
    return `🤝 Noté : promesse à ${input['to']} — ${input['what']}. Je te la rappelle avant l'échéance.`;
  }
  if (a === 'done' || a === 'snooze') {
    const p = find();
    if (!p) return '❌ Promesse introuvable.';
    if (a === 'done') p.done = true; else { p.due = new Date(Date.now() + 20 * 3600_000).toISOString().slice(0, 16); p.reminded = false; }
    await kvPut('promises', list);
    return a === 'done' ? `✅ Promesse à ${p.to} tenue.` : `⏰ Je te la rappelle demain.`;
  }
  const open = list.filter(p => !p.done).sort((x, y) => x.due.localeCompare(y.due));
  return open.length ? `🤝 Tes promesses en cours :\n${open.map(p => `• ${p.to} : ${p.what} — ${p.due.replace('T', ' ')}${Date.parse(p.due) < Date.now() ? ' ⚠️ en retard' : ''}`).join('\n')}` : '🤝 Aucune promesse en cours.';
}

// ── GPS de vie ───────────────────────────────────────────────────────────────
interface LifeGoal { id: string; name: string; target: number; unit: string; deadline: string; metric: 'fortune' | 'poids' | 'ca_mois' | 'manuel'; start: number; startDate: string; history: Array<{ date: string; value: number }> }

async function metricValue(g: LifeGoal): Promise<number | null> {
  if (g.metric === 'fortune') return import('./brain-plus.js').then(m => m.fortune()).then(f => f.total).catch(() => null);
  if (g.metric === 'poids') {
    const h = (await kvJson<Array<{ weight?: number }>>('health:daily', [])).filter(x => x.weight);
    if (h.length) return h[h.length - 1]!.weight!;
    // Pas de pesée Santé : le poids qu'il tient à jour dans FORME
    return (await kvJson<{ weightKg?: number }>('kouider:forme:profile', {})).weightKg ?? null;
  }
  if (g.metric === 'ca_mois') return import('./jarvis-hub.js').then(m => m.commandCenter()).then(c => Number(c['revenue'] ?? 0)).catch(() => null);
  return g.history.length ? g.history[g.history.length - 1]!.value : null;
}

function probability(g: LifeGoal, now: number): number {
  const total = Date.parse(g.deadline) - Date.parse(g.startDate), spent = Date.now() - Date.parse(g.startDate);
  if (total <= 0 || g.target === g.start) return 50;
  const done = (now - g.start) / (g.target - g.start);
  const timeShare = Math.max(0.02, spent / total);
  const pace = done / timeShare;   // 1 = pile dans les temps
  return Math.round(Math.max(3, Math.min(97, 50 + (pace - 1) * 60)));
}

export async function lifeGpsTool(input: Record<string, unknown>): Promise<string> {
  const a = String(input['action'] ?? 'check');
  const list = await kvJson<LifeGoal[]>('lifegps', []);
  if (a === 'add') {
    const g: LifeGoal = { id: uid(), name: String(input['name'] ?? ''), target: Number(input['target']), unit: String(input['unit'] ?? ''), deadline: String(input['deadline'] ?? ''), metric: (['fortune', 'poids', 'ca_mois'].includes(String(input['metric'])) ? input['metric'] : 'manuel') as LifeGoal['metric'], start: 0, startDate: localNow().date, history: [] };
    if (!g.name || !Number.isFinite(g.target) || !/^\d{4}-\d{2}-\d{2}$/.test(g.deadline)) return '❌ Il me faut name, target (nombre), deadline (AAAA-MM-JJ) et metric (fortune | poids | ca_mois | manuel).';
    const v = g.metric === 'manuel' ? Number(input['current'] ?? 0) : await metricValue(g);
    g.start = Number(v ?? input['current'] ?? 0);
    g.history.push({ date: g.startDate, value: g.start });
    list.push(g); await kvPut('lifegps', list);
    return `🧭 Objectif ajouté : ${g.name} — de ${g.start} à ${g.target} ${g.unit} avant le ${g.deadline}. Je te dis chaque dimanche si tu es sur la route.`;
  }
  if (a === 'update') {
    const g = list.find(x => x.name.toLowerCase().includes(String(input['name'] ?? '').toLowerCase()));
    if (!g) return '❌ Objectif introuvable.';
    g.history.push({ date: localNow().date, value: Number(input['current']) }); await kvPut('lifegps', list);
    return `🧭 ${g.name} : ${input['current']} ${g.unit} noté (${probability(g, Number(input['current']))} % de chances).`;
  }
  if (a === 'remove') { await kvPut('lifegps', list.filter(x => !x.name.toLowerCase().includes(String(input['name'] ?? '').toLowerCase()))); return 'Objectif retiré.'; }
  if (!list.length) return '🧭 Aucun grand objectif. Dis par ex. « objectif : 50 000 € de fortune avant le 31/12/2027 » ou « 80 kg avant l\'été ».';
  if (a === 'decision') {
    return ai(`Grands objectifs de Kouider : ${JSON.stringify(list.map(g => ({ name: g.name, target: g.target, unit: g.unit, deadline: g.deadline, last: g.history.at(-1)?.value })))}\nIl hésite : « ${input['question']} ». Est-ce que ça le rapproche ou l'éloigne de chaque objectif ? Chiffre l'impact si possible, puis verdict en 1 phrase. 6 lignes max.`, { quality: true, max: 500 });
  }
  const lines: string[] = [];
  for (const g of list) {
    const v = await metricValue(g) ?? g.start;
    if (g.metric !== 'manuel') { g.history.push({ date: localNow().date, value: v }); g.history = g.history.slice(-60); }
    lines.push(`• ${g.name} : ${Math.round(v * 10) / 10}/${g.target} ${g.unit} (échéance ${g.deadline}) → ${probability(g, v)} % de chances`);
  }
  await kvPut('lifegps', list);
  const lever = await ai(`Objectifs de Kouider et où il en est :\n${lines.join('\n')}\nPour l'objectif le plus en retard, donne LA chose concrète cette semaine qui ferait le plus monter ses chances (chiffre l'effet : « passe à ~85 % »). 2 phrases.`, { max: 250 });
  return `🧭 GPS de vie\n${lines.join('\n')}\n\n${lever}`;
}
export async function jobLifeGps(): Promise<string> {
  if (!(await kvJson<LifeGoal[]>('lifegps', [])).length) return 'aucun objectif';
  await tg(await lifeGpsTool({ action: 'check' }));
  return 'envoyé';
}

// ── Plan B permanent ─────────────────────────────────────────────────────────
interface Car { id: string; name: string; category?: string; available?: boolean; resale_price?: number }
interface Book { id: string; car_id: string; client_name: string; client_phone?: string; start_date: string; end_date: string; status: string }
const overlap = (a: Book, s: string, e: string) => a.start_date.slice(0, 10) <= e.slice(0, 10) && a.end_date.slice(0, 10) >= s.slice(0, 10);

export async function planB(days = 14): Promise<Array<{ b: Book; car: Car; backup: Car | null; problem: string }>> {
  const today = localNow().date;
  const [{ data: cars }, { data: books }] = await Promise.all([
    supabase.from('cars').select('id, name, category, available, resale_price'),
    supabase.from('bookings').select('id, car_id, client_name, client_phone, start_date, end_date, status').gte('end_date', today).lte('start_date', addDays(today, days + 30)),
  ]);
  const C = (cars ?? []) as Car[];
  const B = ((books ?? []) as Book[]).filter(b => !/REJECT|CANCEL/i.test(b.status));
  return B.filter(b => b.start_date.slice(0, 10) <= addDays(today, days) && b.start_date.slice(0, 10) >= today).map(b => {
    const car = C.find(c => c.id === b.car_id) ?? { id: b.car_id, name: '?' };
    const free = C.filter(c => c.id !== b.car_id && c.available !== false && !B.some(x => x.car_id === c.id && overlap(x, b.start_date, b.end_date)));
    const backup = free.sort((x, y) => Number(x.category !== car.category) - Number(y.category !== car.category) || Math.abs(Number(x.resale_price ?? 0) - Number(car.resale_price ?? 0)) - Math.abs(Number(y.resale_price ?? 0) - Number(car.resale_price ?? 0)))[0] ?? null;
    const double = B.some(x => x.id !== b.id && x.car_id === b.car_id && overlap(x, b.start_date, b.end_date));
    return { b, car, backup, problem: car.available === false ? 'voiture indisponible (atelier / panne)' : double ? 'voiture réservée deux fois sur ces dates' : '' };
  });
}

export async function planBTool(): Promise<string> {
  const l = await planB(14);
  if (!l.length) return 'Aucune location dans les 14 prochains jours.';
  return `🅱️ Plan B des 14 prochains jours :\n${l.map(x => `• ${x.b.start_date.slice(5, 10)} ${x.car.name} — ${x.b.client_name} → secours : ${x.backup?.name ?? 'AUCUNE voiture libre ⚠️'}${x.problem ? `\n  🚨 ${x.problem}` : ''}`).join('\n')}`;
}

export async function jobPlanB(): Promise<string> {
  const l = (await planB(3)).filter(x => x.problem);
  const warned = await kvJson<string[]>('planb:warned', []);
  const { createDecision } = await import('./conscience.js');
  let n = 0;
  for (const x of l) {
    const k = `${x.b.id}:${x.problem}`;
    if (warned.includes(k)) continue;
    warned.push(k); n++;
    const msg = x.backup ? `Bonjour ${x.b.client_name.split(' ')[0]}, petite modification pour votre location du ${x.b.start_date.slice(8, 10)}/${x.b.start_date.slice(5, 7)} : nous vous remettrons une ${x.backup.name} à la place de la ${x.car.name}, aux mêmes conditions. Merci de votre confiance, FIK Conciergerie.` : '';
    await createDecision(`🚨 Location du ${x.b.start_date.slice(5, 10)} (${x.b.client_name}) : la ${x.car.name} pose problème — ${x.problem}. ${x.backup ? `Plan B prêt : la ${x.backup.name} est libre aux mêmes dates.` : 'Aucune autre voiture libre !'}`, [
      ...(x.backup && x.b.client_phone ? [{ label: `Prévenir le client (${x.backup.name})`, tool: 'whatsapp_web', input: { action: 'send', chat: x.b.client_phone, text: msg } }] : []),
      { label: 'Je gère moi-même', say: 'OK, je te laisse gérer.' },
    ]);
  }
  await kvPut('planb:warned', warned.slice(-200));
  return `${n} alerte(s)`;
}

// ── Chances de réservation ───────────────────────────────────────────────────
interface Score { pct: number; why: string; at: number }
export async function scoreChat(chat: string, convo: string): Promise<Score | null> {
  const lessons = await kvJson<string>('sales:lessons', '');
  const o = jsonOf<{ pct?: number; why?: string }>(await ai(`Discussion WhatsApp entre un client et FIK (location de voitures à Oran) :\n${convo.slice(-2500)}\n${lessons ? `\nCe qu'on a appris de nos clients : ${lessons.slice(0, 800)}\n` : ''}\nProbabilité qu'il RÉSERVE vraiment (dates précises, urgence, questions concrètes = chaud ; « c'est combien ? » seul, compare, négocie dur, pas de dates = froid). Réponds UNIQUEMENT : {"pct":0-100,"why":"5 mots (ex. dates précises + passeport envoyé)"}`, { max: 120 }));
  if (!o?.pct && o?.pct !== 0) return null;
  const s: Score = { pct: Math.round(Number(o.pct)), why: String(o.why ?? ''), at: Date.now() };
  const all = await kvJson<Record<string, Score>>('wa:scores', {});
  all[chat.toLowerCase()] = s;
  await kvPut('wa:scores', Object.fromEntries(Object.entries(all).sort((a, b) => b[1].at - a[1].at).slice(0, 150)));
  return s;
}

export async function chancesTool(): Promise<string> {
  const log = (await kvJson<WaLog[]>('wa:convlog', [])).filter(x => Date.now() - x.at < 4 * 86_400_000);
  const chats = [...new Set(log.filter(x => x.dir === 'in').map(x => x.chat))].slice(-12);
  if (!chats.length) return 'Aucun client WhatsApp ces 4 derniers jours.';
  const scores = await kvJson<Record<string, Score>>('wa:scores', {});
  const out: Array<{ chat: string; s: Score; waiting: boolean }> = [];
  for (const c of chats) {
    const msgs = log.filter(x => x.chat === c);
    let s: Score | undefined = scores[c.toLowerCase()];
    if (!s || msgs.some(m => m.at > s!.at)) s = await scoreChat(c, msgs.map(m => `${m.dir === 'in' ? 'Client' : 'FIK'} : ${m.text}`).join('\n')) ?? undefined;
    if (s) out.push({ chat: c, s, waiting: msgs[msgs.length - 1]?.dir === 'in' });
  }
  out.sort((a, b) => b.s.pct - a.s.pct);
  return `🎯 Chances de réservation (réponds d'abord aux plus chauds) :\n${out.map(o => `• ${o.s.pct >= 60 ? '🔥' : o.s.pct >= 30 ? '🙂' : '🧊'} ${o.chat} — ${o.s.pct} % (${o.s.why})${o.waiting ? ' · attend ta réponse' : ''}`).join('\n')}`;
}

// ── Il apprend à mieux vendre ────────────────────────────────────────────────
export async function salesLessons(send = true): Promise<string> {
  const log = (await kvJson<WaLog[]>('wa:convlog', [])).filter(x => Date.now() - x.at < 30 * 86_400_000);
  if (log.length < 20) return 'Pas encore assez de discussions WhatsApp enregistrées (il en faut quelques semaines).';
  const { data } = await supabase.from('bookings').select('client_name, client_phone, created_at, final_price, cars(name)').gte('created_at', new Date(Date.now() - 35 * 86_400_000).toISOString());
  const booked = ((data ?? []) as Array<{ client_name: string; client_phone?: string }>);
  const chats = [...new Set(log.map(x => x.chat))];
  const digits = (s: string) => s.replace(/\D/g, '').slice(-9);
  const lines = chats.map(c => {
    const m = log.filter(x => x.chat === c);
    const firstIn = m.find(x => x.dir === 'in'), firstOut = m.find(x => x.dir === 'out' && firstIn && x.at > firstIn.at);
    const did = booked.some(b => (digits(c).length >= 8 && digits(b.client_phone ?? '') === digits(c)) || b.client_name.toLowerCase().split(' ')[0] === c.toLowerCase().split(' ')[0]);
    return `### ${did ? 'RÉSERVÉ' : 'PAS RÉSERVÉ'} — délai 1re réponse ${firstIn && firstOut ? Math.round((firstOut.at - firstIn.at) / 60_000) : '?'} min\n${m.slice(0, 10).map(x => `${x.dir === 'in' ? 'C' : 'FIK'}: ${x.text.slice(0, 160)}`).join('\n')}`;
  });
  const text = await ai(`Voici ${chats.length} discussions WhatsApp de FIK (location de voitures, Oran) sur 30 jours, marquées RÉSERVÉ ou PAS RÉSERVÉ, avec le délai de la 1re réponse :\n${lines.join('\n').slice(-28000)}\n\nCompare les deux groupes : ton, prix annoncé, délai de réponse, questions posées, voitures demandées, offres (livraison, sans caution…). Donne 4 leçons CHIFFRÉES et concrètes (« quand on répond en moins de 5 min, X fois plus de réservations »), puis 2 phrases types à utiliser. Pas de théorie.`, { quality: true, max: 1000 });
  await kvPut('sales:lessons', text.slice(0, 2000));
  if (send) await tg(`📈 Ce que j'ai appris de tes ventes cette semaine :\n\n${text}`);
  return text;
}
export async function jobSalesLessons(): Promise<string> { const t = await salesLessons(true); return t.slice(0, 50); }

// ── Anti-regret ──────────────────────────────────────────────────────────────
/** Message à un client / pro dicté sous le coup de l'énervement → version calme (null si le message est OK). */
export async function calmVersion(text: string): Promise<string | null> {
  if (text.length < 20) return null;
  if (!/[!?]{2,}|\b[A-ZÉÈ]{5,}\b|n'importe quoi|arnaque|honte|menteur|inadmissible|dernière fois|foutez|marre|ridicule|incompétent|vous moquez|c'est pas sérieux|tant pis pour vous|j'en ai rien|débrouillez/i.test(text)) return null;
  const o = jsonOf<{ angry?: boolean; calm?: string }>(await ai(`Message que Kouider (gérant d'une agence de location) veut envoyer à un client ou un pro :\n« ${text} »\nEst-il écrit sous le coup de l'énervement au point de risquer de perdre le client / la relation ? Si oui, réécris-le ferme mais calme et pro, même fond, même langue. Réponds UNIQUEMENT : {"angry":true|false,"calm":"…"}`, { max: 400 }));
  return o?.angry && o.calm ? o.calm : null;
}

/** Prix sous son plancher (prix propriétaire, ou plancher qu'il a réglé) → rappel ajouté au résultat. */
export async function priceFloorNote(input: Record<string, unknown>): Promise<string> {
  const total = Number(input['final_price']);
  const s = String(input['start_date'] ?? ''), e = String(input['end_date'] ?? '');
  if (!total || !s || !e) return '';
  const days = Math.max(1, Math.round((Date.parse(e.slice(0, 10)) - Date.parse(s.slice(0, 10))) / 86_400_000));
  const q = supabase.from('cars').select('id, name, base_price, resale_price').limit(1);
  const { data } = input['car_id'] ? await q.eq('id', String(input['car_id'])) : await q.ilike('name', `%${String(input['car_name'] ?? '').trim()}%`);
  const car = (data ?? [])[0] as { name: string; base_price?: number; resale_price?: number } | undefined;
  if (!car) return '';
  const floors = await kvJson<Record<string, number>>('price:floors', {});
  const perDay = total / days;
  const floor = floors[car.name.toLowerCase()] ?? Number(car.base_price ?? 0);
  if (floor && perDay < floor) return `\n\n🧯 ANTI-REGRET : ${Math.round(perDay)}/jour pour la ${car.name}, c'est SOUS ton plancher (${floor}/jour). Tu es sûr ? (je n'ai rien bloqué)`;
  if (car.resale_price && perDay < Number(car.resale_price) * 0.85) return `\n\n🧯 ANTI-REGRET : ${Math.round(perDay)}/jour, c'est ${Math.round((1 - perDay / Number(car.resale_price)) * 100)} % sous ton prix habituel (${car.resale_price}/jour). Volontaire ?`;
  return '';
}
