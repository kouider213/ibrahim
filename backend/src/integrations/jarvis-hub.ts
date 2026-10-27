/**
 * JARVIS HUB (27/10/2026) — ce que l'app et l'iPhone demandent au cerveau :
 *  - santé : un Raccourci iPhone envoie chaque matin les données de Santé / Apple Watch (sommeil, pas, cœur au repos,
 *    VFC) → app_kv `health:daily` (privé) ; sommeil court ou cœur anormal → message + journée allégée proposée.
 *  - siri : « Dis Siri, Dzaryx » → le Raccourci dicte la phrase → Dzaryx complet répond (phrase à dire) + une action
 *    iPhone à ouvrir (appel, SMS, WhatsApp, Waze, musique, app) en lien tel:/sms:/wa.me/waze:/music:.
 *  - salle de commande : tout le business sur un écran (TV / PC) : argent, flotte, retours, WhatsApp, alertes, fortune.
 *  - futur : les chiffres de base de la machine à voir le futur (flotte, prix moyen, occupation réelle, coûts).
 *  - briefing 3D : les phrases du briefing que la Carte live dit en survolant chaque endroit.
 */
import { kvJson, kvPut, tg } from './ai-util.js';
import { supabase } from './supabase.js';
import { localNow } from './morning-routine.js';

// ── Santé ────────────────────────────────────────────────────────────────────
export interface HealthDay { date: string; sleep_h?: number; steps?: number; rhr?: number; hrv?: number; active_kcal?: number; weight?: number }
const num = (v: unknown) => { const n = Number(String(v ?? '').replace(',', '.').replace(/[^\d.]/g, '')); return Number.isFinite(n) && n > 0 ? n : undefined; };

export async function receiveHealth(body: Record<string, unknown>): Promise<{ ok: true; note: string }> {
  // Raccourci fait par « Décrire un raccourci » (Apple) : les valeurs arrivent souvent en texte libre (champ data, résumé…)
  // → Haiku en tire les chiffres. Les champs déjà numériques restent prioritaires.
  // Format réel du Raccourci (27/10) : {"data":{"steps":"131\n64\n…","heart_rate_variability":"20.1\n27.0…","resting_heart_rate":"71","sleep":"…"}}
  // → calcul exact : pas = somme, VFC = moyenne, cœur au repos = dernière valeur, sommeil = somme (heures, ou minutes/secondes converties)
  const d0 = (typeof body['data'] === 'object' && body['data']) ? body['data'] as Record<string, unknown> : body;
  const nums = (v: unknown) => String(v ?? '').split(/[\n,;]+/).map(x => Number(x.trim().replace(',', '.'))).filter(x => Number.isFinite(x) && x > 0);
  const pick = (re: RegExp) => Object.entries(d0).find(([k]) => re.test(k))?.[1];
  const stepsL = nums(pick(/step|pas/i)), hrvL = nums(pick(/variab|hrv|vfc/i)), rhrL = nums(pick(/rest|repos|rhr/i)), sleepL = nums(pick(/sleep|sommeil/i));
  if (stepsL.length || hrvL.length || rhrL.length || sleepL.length) {
    let sl = sleepL.reduce((a, b) => a + b, 0);
    if (sl > 24 * 60) sl /= 3600; else if (sl > 24) sl /= 60;   // secondes ou minutes → heures
    Object.assign(body, {
      ...(stepsL.length ? { steps: Math.round(stepsL.reduce((a, b) => a + b, 0)) } : {}),
      ...(hrvL.length ? { hrv: Math.round(hrvL.reduce((a, b) => a + b, 0) / hrvL.length) } : {}),
      ...(rhrL.length ? { rhr: Math.round(rhrL[rhrL.length - 1]!) } : {}),
      ...(sl > 0 ? { sleep_h: Math.round(sl * 10) / 10 } : {}),
    });
  }
  if (!['sleep_h', 'steps', 'rhr', 'hrv'].some(k => num(body[k]) !== undefined)) {
    const full = JSON.stringify(body);
    await kvPut('health:lastraw', full.slice(0, 60_000), 3 * 86_400).catch(() => {});   // pour comprendre le format du Raccourci (privé)
    // Beaucoup de petits échantillons (pas, phases de sommeil) : on additionne les nombres nous-mêmes quand c'est une liste
    const raw = full.slice(0, 40_000);
    const { ai, jsonOf } = await import('./ai-util.js');
    const o = jsonOf<Record<string, number>>(await ai(`Données de santé d'un iPhone (format libre, français ou anglais) :\n${raw}\n\nExtrais : heures de sommeil de la dernière nuit (total, en heures), nombre de pas d'hier ou du jour, fréquence cardiaque au repos (bpm), variabilité de la fréquence cardiaque (ms). Pour les pas : ADDITIONNE tous les échantillons de pas. Pour le sommeil : additionne les durées « endormi / core / deep / REM » (pas « au lit » ni « éveillé »). Réponds UNIQUEMENT : {"sleep_h":0,"steps":0,"rhr":0,"hrv":0} (0 si absent).`, { max: 200, quality: true }).catch(() => '')) ?? {};
    Object.assign(body, o);
  }
  const date = String(body['date'] ?? localNow().date).slice(0, 10);
  // Le Raccourci peut envoyer le sommeil en heures ou en minutes
  let sleep = num(body['sleep_h'] ?? body['sleep'] ?? body['sommeil']);
  if (sleep && sleep > 24) sleep = Math.round((sleep / 60) * 10) / 10;
  const d: HealthDay = { date, sleep_h: sleep, steps: num(body['steps'] ?? body['pas']), rhr: num(body['rhr'] ?? body['resting_hr'] ?? body['coeur_repos']), hrv: num(body['hrv'] ?? body['vfc']), active_kcal: num(body['active_kcal'] ?? body['calories']), weight: num(body['weight'] ?? body['poids']) };
  const stored = await kvJson<HealthDay[]>('health:daily', []);
  const same = stored.find(x => x.date === date);
  // Plusieurs envois le même jour : on complète, on n'efface pas une valeur déjà reçue
  if (same) for (const k of Object.keys(same) as Array<keyof HealthDay>) if ((d as unknown as Record<string, unknown>)[k] === undefined) (d as unknown as Record<string, unknown>)[k] = same[k];
  const all = stored.filter(x => x.date !== date);
  all.push(d);
  all.sort((a, b) => a.date.localeCompare(b.date));
  await kvPut('health:daily', all.slice(-120));
  const prev = all.slice(-15, -1);
  const avg = (k: keyof HealthDay) => { const v = prev.map(x => Number(x[k] ?? 0)).filter(x => x > 0); return v.length >= 5 ? v.reduce((a, b) => a + b, 0) / v.length : 0; };
  const notes: string[] = [];
  if (d.sleep_h && d.sleep_h < 5.5) notes.push(`😴 Nuit courte : ${d.sleep_h} h de sommeil. Je te garde une journée légère (rien de non urgent avant 10h) — dis « journée normale » si tu te sens bien.`);
  const rhr = avg('rhr');
  if (d.rhr && rhr && d.rhr >= rhr + 8) notes.push(`❤️ Cœur au repos à ${d.rhr} (d'habitude ${Math.round(rhr)}) : fatigue, stress ou début de maladie possible. Bois, lève le pied, et consulte si ça dure.`);
  const hrv = avg('hrv');
  if (d.hrv && hrv && d.hrv < hrv * 0.75) notes.push(`📉 VFC basse (${d.hrv} contre ${Math.round(hrv)} d'habitude) : ton corps récupère mal, séance de sport légère aujourd'hui.`);
  if (notes.length) await tg(`🩺 Jarvis santé — ${date}\n${notes.join('\n')}`);
  return { ok: true, note: notes.join(' ') || 'Données reçues, tout va bien.' };
}

export async function healthText(days = 7): Promise<string> {
  const all = (await kvJson<HealthDay[]>('health:daily', [])).slice(-days);
  if (!all.length) return 'Pas encore de données santé : installe le Raccourci « Dzaryx Santé » (page JARVIS › Santé de l\'app).';
  return `🩺 Santé (${all.length} jours) :\n${all.map(d => `• ${d.date.slice(5)} : ${d.sleep_h ?? '?'} h de sommeil · ${d.steps?.toLocaleString('fr-FR') ?? '?'} pas · cœur ${d.rhr ?? '?'}${d.hrv ? ` · VFC ${d.hrv}` : ''}`).join('\n')}`;
}

// ── Siri ─────────────────────────────────────────────────────────────────────
const SIRI = `[SIRI — Kouider te parle via Siri sur son iPhone (mains libres). Réponds en 1 à 2 phrases courtes, à l'oral.
Si sa demande est une ACTION DE SON IPHONE (appeler quelqu'un, envoyer un SMS, ouvrir WhatsApp avec quelqu'un, itinéraire, musique, ouvrir une app),
ajoute à la toute fin une ligne seule : PHONE_URL: <lien> — tel:+33…, sms:+33…&body=…, https://waze.com/ul?q=…&navigate=yes, music://music.apple.com/search?term=…, ou le lien de l'app.
WHATSAPP = TOUJOURS son WhatsApp BUSINESS via l'outil whatsapp_web (PC cloud), JAMAIS de PHONE_URL wa.me (ça ouvre le WhatsApp perso) :
lire / dernier message / non lus → whatsapp_web (unread ou read) et dis-lui à l'oral qui a écrit et ce qu'il dit ; écrire à quelqu'un → prépare le message avec whatsapp_web et demande son oui avant d'envoyer.
Numéro d'un contact : cherche-le avec tes outils (clients, partenaires, mémoire des gens). Si tu ne le trouves pas, demande-le.]`;

export async function siriTurn(text: string): Promise<{ say: string; url?: string }> {
  const { processMessage } = await import('../conversation/orchestrator.js');
  const { stripToolTrace } = await import('./supabase.js');
  const out = await processMessage(`${SIRI}\n${text.slice(0, 1500)}`, 'voice_kouider', true);
  let say = stripToolTrace(out.text ?? '') || 'Pardon, je n\'ai pas compris.';
  const m = /PHONE_URL:\s*(\S+)/i.exec(say);
  say = say.replace(/PHONE_URL:\s*\S+/i, '').replace(/https?:\/\/\S+/g, '').replace(/[*_#`>|]/g, '').trim();
  return { say: say.slice(0, 600), ...(m ? { url: m[1] } : {}) };
}

// ── Salle de commande ────────────────────────────────────────────────────────
export async function commandCenter(): Promise<Record<string, unknown>> {
  const today = localNow().date;
  const monthStart = `${today.slice(0, 7)}-01`;
  const [{ data: cars }, { data: books }] = await Promise.all([
    supabase.from('cars').select('id, name, available'),
    supabase.from('bookings').select('car_id, client_name, start_date, end_date, status, final_price, total_price, amount_remaining, profit, created_at').gte('end_date', `${today.slice(0, 7)}-01`).order('start_date'),
  ]);
  const B = ((books ?? []) as Array<Record<string, unknown>>).filter(b => !/REJECT|CANCEL/i.test(String(b['status'])));
  const C = (cars ?? []) as Array<{ id: string; name: string; available?: boolean }>;
  const fleet = C.map(c => {
    const now = B.find(b => b['car_id'] === c.id && String(b['start_date']).slice(0, 10) <= today && String(b['end_date']).slice(0, 10) >= today);
    const next = B.find(b => b['car_id'] === c.id && String(b['start_date']).slice(0, 10) > today);
    return { name: c.name, status: c.available === false ? 'atelier' : now ? (String(now['end_date']).slice(0, 10) === today ? 'retour' : 'louée') : 'libre', client: now ? String(now['client_name']) : '', until: now ? String(now['end_date']).slice(0, 16) : '', next: next ? String(next['start_date']).slice(0, 10) : '' };
  });
  const month = B.filter(b => String(b['start_date']).slice(0, 10) >= monthStart);
  const revenue = month.reduce((s, b) => s + Number(b['final_price'] ?? b['total_price'] ?? 0), 0);
  const profit = month.reduce((s, b) => s + Number(b['profit'] ?? 0), 0);
  const due = B.reduce((s, b) => s + Number(b['amount_remaining'] ?? 0), 0);
  const [drafts, conn, square, fortune, projects, squad] = await Promise.all([
    import('./whatsapp-web.js').then(m => m.waPendingDrafts()).catch(() => []),
    import('./connections-watch.js').then(m => m.connectionsText()).catch(() => ''),
    import('./gold.js').then(m => m.goldMarket()).then(g => g?.eurDzd ?? null).catch(() => null),
    import('./brain-plus.js').then(m => m.fortune()).then(f => f.total).catch(() => null),
    kvJson<Array<{ goal: string; done?: boolean; steps: Array<{ text: string; date: string; done?: boolean }> }>>('projects', []),
    import('./squad.js').then(m => m.getSquad()).catch(() => null),
  ]);
  return {
    at: new Date().toISOString(), fleet, revenue: Math.round(revenue), profit: Math.round(profit), due: Math.round(due),
    occupancy: C.length ? Math.round((fleet.filter(f => f.status === 'louée' || f.status === 'retour').length / C.length) * 100) : 0,
    returnsToday: fleet.filter(f => f.status === 'retour').map(f => `${f.name} — ${f.client}`),
    departuresToday: B.filter(b => String(b['start_date']).slice(0, 10) === today).map(b => `${C.find(c => c.id === b['car_id'])?.name ?? '?'} — ${b['client_name']}`),
    whatsapp: (drafts as Array<{ chat: string; preview: string }>).slice(0, 6),
    alerts: conn ? [conn.replace(/^CONNEXIONS COUPÉES EN CE MOMENT[^:]*:\s*/, '')] : [],
    square, fortune,
    projects: projects.filter(p => !p.done).map(p => ({ goal: p.goal, done: p.steps.filter(s => s.done).length, total: p.steps.length, today: p.steps.find(s => !s.done)?.text ?? '' })),
    squad: squad ? { goal: squad.goal, status: squad.status } : null,
  };
}

// ── Machine à voir le futur : chiffres de base ───────────────────────────────
export async function futureBase(): Promise<Record<string, number>> {
  const since = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
  const [{ data: cars }, { data: books }, { data: exp }] = await Promise.all([
    supabase.from('cars').select('resale_price, base_price'),
    supabase.from('bookings').select('start_date, end_date, status, final_price, profit').gte('end_date', since),
    supabase.from('cash_entries').select('amount, kind, entry_date').gte('entry_date', since),
  ]);
  const C = (cars ?? []) as Array<{ resale_price: number; base_price: number }>;
  const B = ((books ?? []) as Array<{ start_date: string; end_date: string; status: string; final_price?: number; profit?: number }>).filter(b => !/REJECT|CANCEL/i.test(b.status));
  const days = B.reduce((s, b) => s + Math.max(1, Math.round((Date.parse(b.end_date) - Date.parse(b.start_date)) / 86_400_000)), 0);
  const price = C.length ? C.reduce((s, c) => s + Number(c.resale_price || 0), 0) / C.length : 35;
  const margin = C.length ? C.reduce((s, c) => s + (Number(c.resale_price || 0) - Number(c.base_price || 0)), 0) / C.length : price * 0.3;
  const costs = ((exp ?? []) as Array<{ amount: number; kind: string }>).filter(e => e.kind === 'expense').reduce((s, e) => s + Math.abs(Number(e.amount || 0)), 0) / 3;
  return { cars: C.length, price: Math.round(price), marginPerDay: Math.round(margin), occupancy: C.length ? Math.min(95, Math.round((days / (C.length * 90)) * 100)) : 0, monthlyCosts: Math.round(costs) };
}

// ── Briefing 3D (Carte live) ─────────────────────────────────────────────────
export async function briefing3d(): Promise<Record<string, string>> {
  const { listAgendaRange } = await import('./google-calendar.js');
  const now = new Date();
  const end = new Date(now); end.setHours(23, 59, 0, 0);
  const evs = ((await listAgendaRange(now.toISOString(), end.toISOString()).catch(() => null)) ?? []) as Array<{ summary?: string; start?: { dateTime?: string } }>;
  const agenda = evs.length ? `Aujourd'hui : ${evs.slice(0, 4).map(e => `${e.start?.dateTime ? `${e.start.dateTime.slice(11, 16).replace(':', 'h')} ` : ''}${e.summary ?? ''}`).join(', ')}.` : 'Ton agenda est libre aujourd\'hui.';
  const trips = await kvJson<Array<{ who: string; kind: string; title: string; from?: string; to?: string; departAt: number }>>('trips:v1', []);
  const nextTrip = trips.filter(t => t.who === 'kouider' && t.kind === 'flight' && t.departAt > Date.now()).sort((a, b) => a.departAt - b.departAt)[0];
  const g = await import('./gold.js').then(m => m.goldMarket()).catch(() => null);
  const pred = await kvJson<{ text?: string } | null>('predictions:last', null);
  const proj = (await kvJson<Array<{ goal: string; done?: boolean; steps: Array<{ text: string; date: string; done?: boolean }> }>>('projects', [])).filter(p => !p.done);
  return {
    me: agenda,
    aeroport: nextTrip ? `Prochain vol : ${nextTrip.title || `${nextTrip.from ?? ''} vers ${nextTrip.to ?? ''}`}, le ${new Date(nextTrip.departAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}.` : '',
    agence: [g?.eurDzd ? `L'euro est à ${Math.round(g.eurDzd)} dinars au square.` : '', proj.length ? `Projet ${proj[0]!.goal} : ${proj[0]!.steps.find(s => !s.done)?.text ?? 'presque fini'}.` : ''].filter(Boolean).join(' '),
    futur: pred?.text ? `Ma prédiction : ${pred.text.replace(/\*\*/g, '').split('\n').find(l => l.includes('🔮'))?.replace(/🔮/g, '').slice(0, 220) ?? ''}` : '',
  };
}
