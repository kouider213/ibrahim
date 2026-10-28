/**
 * LA CONSCIENCE (Jarvis 4, 28/10/2026) — un seul cerveau qui, toutes les 10 min, regarde TOUT en même temps (lieu,
 * route, agenda, réservations, vols, WhatsApp en attente, promesses, santé, humeur, énergie, modes) et ne parle que si
 * ça vaut vraiment la peine. Plafond par jour, silence la nuit, bouclier famille, pas de redite de ce qui vient d'être
 * envoyé (journal tg:sentlog). Il APPREND : un conseil suivi d'une réaction de Kouider fait monter son type, un conseil
 * ignoré le fait baisser (et il revient moins).
 *
 * Aussi ici :
 *  - DÉCISIONS À BOUTONS : « Le client X veut la Clio du 12 au 20 → 1 Accepter 40 €/j · 2 Contre-offre · 3 Refuser » ;
 *    il répond « 1 » sur Telegram (ou touche le bouton dans l'app / le menu du Raccourci) et c'est exécuté.
 *  - BOUCLIER FAMILLE : à la maison le soir → seules les urgences passent, le gardien répond aux clients, résumé après.
 *  - HUMEUR EN DIRECT : ses derniers messages (mots, rythme, heure) → stressé/crevé → il propose de prendre le relais.
 *  - ÉNERGIE PRÉVUE : ses heures fortes / faibles (sommeil, montre, activité, humeur) → les choses dures au bon moment.
 */
import { kvJson, kvPut, tg, ai, uid } from './ai-util.js';
import { jsonOf } from './media-util.js';
import { localNow, lastKouiderActivity, getRoutineConfig } from './morning-routine.js';
import { supabase } from './supabase.js';

// ── Décisions à boutons ──────────────────────────────────────────────────────
export interface DecisionOption { label: string; tool?: string; input?: Record<string, unknown>; say?: string }
export interface Decision { id: string; at: number; title: string; options: DecisionOption[]; done?: string }
const DEC_KEY = 'decisions';

export async function createDecision(title: string, options: DecisionOption[], send = true): Promise<Decision> {
  const d: Decision = { id: uid(), at: Date.now(), title: title.slice(0, 600), options: options.slice(0, 4) };
  const list = (await kvJson<Decision[]>(DEC_KEY, [])).filter(x => Date.now() - x.at < 2 * 86_400_000);
  list.push(d);
  await kvPut(DEC_KEY, list.slice(-20));
  if (send) {
    await tg(`🔘 ${d.title}\n${d.options.map((o, i) => `${i + 1}️⃣ ${o.label}`).join('\n')}\nRéponds juste le chiffre.`);
    const { emitProactive } = await import('../notifications/mobile-push.js');
    emitProactive(`🔘 ${d.title.slice(0, 80)}`, 'reminder', d.options.map((o, i) => `${i + 1}. ${o.label}`).join(' · '));
  }
  return d;
}

export async function pendingDecisions(): Promise<Decision[]> {
  // 3 h comme chooseDecision : au-delà, « RDV à 13h » périmé ressortait encore dans le brief CarPlay à 15h30 (28/10)
  return (await kvJson<Decision[]>(DEC_KEY, [])).filter(d => !d.done && Date.now() - d.at < 3 * 3600_000);
}

export async function chooseDecision(id: string | null, n: number): Promise<string> {
  const list = await kvJson<Decision[]>(DEC_KEY, []);
  const d = id ? list.find(x => x.id === id) : list.filter(x => !x.done && Date.now() - x.at < 3 * 3600_000).pop();
  if (!d || d.done) return '❌ Plus de choix en attente.';
  const o = d.options[n - 1];
  if (!o) return `❌ Choix entre 1 et ${d.options.length}.`;
  d.done = o.label;
  await kvPut(DEC_KEY, list);
  await learn(`decision:${d.title.slice(0, 30)}`, 1);
  if (o.tool) {
    const { executeTool } = await import('./tool-executor.js');
    // Son choix vaut validation : un envoi WhatsApp passe d'abord par la relecture (signature) puis part
    if (o.tool === 'whatsapp_web' && o.input?.['action'] === 'send') await executeTool(o.tool, { ...o.input }, 'voice_kouider').catch(() => '');
    const r = await executeTool(o.tool, { ...(o.input ?? {}), confirmed: true }, 'voice_kouider').catch(e => `❌ ${e instanceof Error ? e.message : e}`);
    return `✅ ${o.label}\n${String(r).slice(0, 1500)}`;
  }
  return o.say ? `✅ ${o.label} — ${o.say}` : `✅ Noté : ${o.label}.`;
}

/** « 1 », « 2 »… sur Telegram juste après une décision → exécutée sans repasser par l'IA. */
export async function handleDecisionReply(message: string): Promise<{ reply: string } | null> {
  const m = /^\s*([1-4])\s*(?:️⃣)?\s*$/.exec(message);
  if (!m) return null;
  const open = (await kvJson<Decision[]>(DEC_KEY, [])).filter(x => !x.done && Date.now() - x.at < 3 * 3600_000);
  if (!open.length) return null;
  return { reply: await chooseDecision(null, Number(m[1])) };
}

// ── Apprentissage ────────────────────────────────────────────────────────────
const SCORES = 'conscience:scores', LOG = 'conscience:log';
interface Nudge { id: string; at: number; kind: string; text: string; urgency: number; reacted?: boolean }
async function learn(kind: string, delta: number): Promise<void> {
  const s = await kvJson<Record<string, number>>(SCORES, {});
  s[kind] = Math.max(-5, Math.min(5, (s[kind] ?? 0) + delta));
  await kvPut(SCORES, s);
}

/** Les conseils d'il y a 45 min à 3 h : réaction de Kouider (message / appel) dans les 45 min ? → +1, sinon −1. */
async function judgePast(): Promise<void> {
  const log = await kvJson<Nudge[]>(LOG, []);
  const active = await lastKouiderActivity();
  let changed = false;
  for (const n of log) {
    if (n.reacted !== undefined || Date.now() - n.at < 45 * 60_000) continue;
    n.reacted = active > n.at && active - n.at < 45 * 60_000;
    await learn(n.kind, n.reacted ? 1 : -1);
    changed = true;
  }
  if (changed) await kvPut(LOG, log.slice(-200));
}

// ── Mouvement (appelé par gps-life) ──────────────────────────────────────────
export async function noteMovement(where: string): Promise<void> {
  const prev = await kvJson<{ where: string; since: number } | null>('conscience:where', null);
  if (prev?.where !== where) await kvPut('conscience:where', { where, since: Date.now() }, 2 * 86_400);
  if (where !== 'home') await shieldOffIfLeft();
}

// ── Bouclier famille ─────────────────────────────────────────────────────────
interface Shield { on: boolean; since?: number; until?: number; disabled?: boolean; manual?: boolean }
export async function shieldActive(): Promise<boolean> {
  const s = await kvJson<Shield>('family:shield', { on: false });
  return s.on && (!s.until || Date.now() < s.until);
}
/** Gardien en service (bouclier famille, ou relais quand il est à bout) : utilisé par night-guard. */
export async function guardOnDuty(): Promise<boolean> {
  if (await shieldActive()) return true;
  const r = await kvJson<{ until: number } | null>('relief:until', null);
  return !!r && Date.now() < r.until;
}
async function shieldOffIfLeft(): Promise<void> {
  const s = await kvJson<Shield>('family:shield', { on: false });
  if (s.on && !s.manual) await endShield(s);
}
async function endShield(s: Shield): Promise<void> {
  await kvPut('family:shield', { on: false, disabled: s.disabled });
  const feed = await import('./copilot.js').then(m => m.copilotFeed(new Date(s.since ?? Date.now()).toISOString())).catch(() => []);
  const { clearDnd } = await import('../notifications/dnd.js');
  await clearDnd().catch(() => {});
  await tg(`🛡️ Bouclier famille terminé.${feed.length ? ` Pendant ce temps : ${feed.length} message(s) WhatsApp, ${feed.filter(f => /gardien/.test(f.note ?? '')).length} répondu(s) seul :\n${feed.slice(-6).map(f => `• ${f.chat} : ${f.text.slice(0, 80)}`).join('\n')}` : ' Rien d\'important n\'est arrivé.'}`);
}
/** Heure de début du temps famille selon son agenda type (lun : 18h ; jeu : 18h ; sinon 20h). */
function familyStart(weekday: number): string { return weekday === 1 || weekday === 4 ? '18:00' : '20:00'; }

async function shieldTick(where: string): Promise<void> {
  const s = await kvJson<Shield>('family:shield', { on: false });
  if (s.disabled) return;
  const { hhmm, weekday, date } = localNow();
  if (s.on && s.until && Date.now() >= s.until) { await endShield(s); return; }
  if (!s.on && where === 'home' && hhmm >= familyStart(weekday) && hhmm < '22:00') {
    if ((await kvJson<string>('family:shield:day', '')) === date) return;   // levé une fois (il l'a peut-être coupé)
    await kvPut('family:shield:day', date);
    const until = new Date(); until.setHours(22, 30, 0, 0);
    await kvPut('family:shield', { on: true, since: Date.now(), until: until.getTime() });
    await tg('🛡️ Tu es en famille : bouclier levé jusqu\'à 22h30. Seules les vraies urgences passent, je réponds aux clients (infos, prix, conditions, jamais de dispo), résumé quand tu ressors. Dis « coupe le bouclier » si besoin.');
    const { setDnd } = await import('../notifications/dnd.js');
    await setDnd({ until: until.getTime(), why: 'bouclier famille' }).catch(() => {});
  }
}

export async function shieldTool(input: Record<string, unknown>): Promise<string> {
  const a = String(input['action'] ?? 'status');
  const s = await kvJson<Shield>('family:shield', { on: false });
  if (a === 'on') {
    const until = Date.now() + (Number(input['hours']) || 3) * 3600_000;
    await kvPut('family:shield', { on: true, since: Date.now(), until, manual: true });
    const { setDnd } = await import('../notifications/dnd.js');
    await setDnd({ until, why: 'bouclier famille' }).catch(() => {});
    return `🛡️ Bouclier levé jusqu'à ${localNow(until).hhmm}.`;
  }
  if (a === 'off') { if (s.on) await endShield(s); return 'Bouclier coupé.'; }
  if (a === 'disable') { await kvPut('family:shield', { on: false, disabled: true }); return 'Bouclier automatique désactivé (plus jamais le soir sans que tu le demandes).'; }
  if (a === 'enable') { await kvPut('family:shield', { on: false }); return 'Bouclier automatique réactivé : il se lève quand tu es chez toi le soir.'; }
  return s.on ? `🛡️ Bouclier actif jusqu'à ${s.until ? localNow(s.until).hhmm : '?'}.` : `Bouclier inactif${s.disabled ? ' (automatique désactivé)' : ' — il se lève tout seul quand tu es chez toi le soir'}.`;
}

// ── Humeur en direct ─────────────────────────────────────────────────────────
interface MoodNow { at: number; stress: number; energy: number; why: string; offered?: boolean }
async function moodNowTick(): Promise<MoodNow | null> {
  const since = new Date(Date.now() - 90 * 60_000).toISOString();
  const { data } = await supabase.from('conversations').select('content, created_at').eq('session_id', 'voice_kouider').eq('role', 'user').gte('created_at', since).order('created_at').limit(30);
  const turns = ((data ?? []) as Array<{ content: string; created_at: string }>).map(t => `${localNow(Date.parse(t.created_at)).hhmm} ${String(t.content).replace(/^\[[^\]]{20,}\]\s*/s, '').slice(0, 300)}`);
  const prev = await kvJson<MoodNow | null>('mood:now', null);
  if (turns.length < 3) return prev && Date.now() - prev.at < 3 * 3600_000 ? prev : null;
  if (prev && Date.now() - prev.at < 30 * 60_000) return prev;
  const o = jsonOf<{ stress?: number; energy?: number; why?: string }>(await ai(`Messages de Kouider à son assistant ces 90 dernières minutes (heure + texte, souvent dictés à la voix) :\n${turns.join('\n')}\n\nÉvalue son état MAINTENANT d'après les mots, le ton, l'impatience, la longueur, les fautes de fatigue, l'heure. Réponds UNIQUEMENT : {"stress":1-10,"energy":1-10,"why":"une phrase factuelle"}`, { max: 150 })) ?? {};
  const m: MoodNow = { at: Date.now(), stress: Number(o.stress ?? 5), energy: Number(o.energy ?? 5), why: String(o.why ?? ''), offered: prev?.offered && Date.now() - prev.at < 6 * 3600_000 };
  await kvPut('mood:now', m, 12 * 3600);
  if ((m.stress >= 8 || m.energy <= 2) && !m.offered) {
    m.offered = true;
    await kvPut('mood:now', m, 12 * 3600);
    await createDecision(`Tu as l'air ${m.stress >= 8 ? 'sous pression' : 'crevé'} (${m.why}). Je prends le relais ?`, [
      { label: 'Oui : je gère les clients 3 h et je repousse le non-urgent', tool: 'relais', input: { hours: 3 } },
      { label: 'Non, ça va', say: 'OK, je reste discret.' },
    ]);
  }
  return m;
}

export async function reliefTool(input: Record<string, unknown>): Promise<string> {
  const h = Number(input['hours']) || 3;
  if (input['off'] === true) { await kvPut('relief:until', null); return 'Relais terminé, tu reprends la main.'; }
  await kvPut('relief:until', { until: Date.now() + h * 3600_000 });
  return `🤝 Je prends le relais ${h} h : je réponds seul aux clients (infos, prix, conditions — jamais de dispo ni de décision), je ne te dérange que pour une urgence, et je te fais le résumé après.`;
}

// ── Énergie prévue ───────────────────────────────────────────────────────────
interface EnergyProfile { at: string; peak: string[]; low: string[]; note: string }
export async function jobEnergyProfile(): Promise<string> {
  const since = new Date(Date.now() - 28 * 86_400_000).toISOString();
  const { data } = await supabase.from('conversations').select('created_at, content').eq('session_id', 'voice_kouider').eq('role', 'user').gte('created_at', since).limit(2000);
  const byHour: Record<number, { n: number; len: number }> = {};
  for (const r of (data ?? []) as Array<{ created_at: string; content: string }>) {
    const h = Number(localNow(Date.parse(r.created_at)).hhmm.slice(0, 2));
    byHour[h] = { n: (byHour[h]?.n ?? 0) + 1, len: (byHour[h]?.len ?? 0) + String(r.content).length };
  }
  const health = (await kvJson<Array<Record<string, unknown>>>('health:daily', [])).slice(-21);
  const mood = (await kvJson<Array<Record<string, unknown>>>('mood:log', [])).slice(-21);
  const sport = await import('./sport-coach.js').then(m => m.sportHistory()).then(h => Object.entries(h.history).slice(-21)).catch(() => []);
  const cfg = await getRoutineConfig();
  const o = jsonOf<EnergyProfile>(await ai(`Profil d'énergie de Kouider sur 4 semaines.\nActivité par heure (nb de messages, longueur totale) : ${JSON.stringify(byHour)}\nSanté (montre) : ${JSON.stringify(health)}\nHumeur par jour : ${JSON.stringify(mood)}\nSport : ${JSON.stringify(sport)}\nRoutine type : ${JSON.stringify(cfg.days)}\n\nDéduis ses créneaux de FORTE énergie (concentration, négociation) et de FAIBLE énergie, en tranches « 9h-11h ». Réponds UNIQUEMENT : {"peak":["…"],"low":["…"],"note":"2 phrases : ce qui fait monter/baisser son énergie (sommeil, sport, heure…)"}`, { quality: true, max: 400 }));
  if (!o) return 'rien';
  await kvPut('energy:profile', { ...o, at: localNow().date });
  return `pic ${o.peak.join(', ')}`;
}

/** Énergie du jour (1-10) : nuit + VFC + humeur, et ses créneaux. */
export async function energyToday(): Promise<{ score: number; line: string }> {
  const p = await kvJson<EnergyProfile | null>('energy:profile', null);
  const h = (await kvJson<Array<{ date: string; sleep_h?: number; hrv?: number; rhr?: number }>>('health:daily', []));
  const t = h.find(x => x.date === localNow().date);
  const avgHrv = h.slice(-14).map(x => x.hrv ?? 0).filter(Boolean);
  const hrvAvg = avgHrv.length ? avgHrv.reduce((a, b) => a + b, 0) / avgHrv.length : 0;
  const mood = await kvJson<MoodNow | null>('mood:now', null);
  let score = 6;
  if (t?.sleep_h) score += t.sleep_h >= 7 ? 1 : t.sleep_h < 5.5 ? -2 : 0;
  if (t?.hrv && hrvAvg) score += t.hrv > hrvAvg * 1.1 ? 1 : t.hrv < hrvAvg * 0.85 ? -1 : 0;
  if (mood && Date.now() - mood.at < 4 * 3600_000) score += mood.energy >= 7 ? 1 : mood.energy <= 3 ? -2 : 0;
  score = Math.max(1, Math.min(10, score));
  return { score, line: `⚡ Énergie ${score}/10${p ? ` · tes heures fortes : ${p.peak.join(', ')} · creux : ${p.low.join(', ')}` : ''}${t?.sleep_h ? ` · nuit ${t.sleep_h} h` : ''}` };
}

export async function energyTool(): Promise<string> {
  const e = await energyToday();
  const p = await kvJson<EnergyProfile | null>('energy:profile', null);
  return `${e.line}${p?.note ? `\n${p.note}` : ''}\nRègle : je cale négociations, appels importants et papiers sur tes heures fortes, le reste dans les creux.`;
}

// ── Contexte pour l'IA de Dzaryx (modes en cours) ────────────────────────────
export async function jarvis4Context(): Promise<string> {
  const [oran, shield, relief, rehearsal, e, mood] = await Promise.all([
    import('./gps-life.js').then(m => m.oranActive()).catch(() => null),
    shieldActive().catch(() => false),
    kvJson<{ until: number } | null>('relief:until', null),
    kvJson<{ role: string; goal: string } | null>('rehearsal', null),
    energyToday().catch(() => null),
    kvJson<MoodNow | null>('mood:now', null),
  ]);
  const l: string[] = [];
  if (rehearsal) l.push(`🎭 MODE RÉPÉTITION EN COURS : tu JOUES ${rehearsal.role} (objectif de Kouider : ${rehearsal.goal}). Reste dans le rôle, sois réaliste et coriace, pousse-le dans ses retranchements, une réplique courte à la fois. Seulement s'il dit « fin de la répétition » / « stop » : outil repetition action end.`);
  if (oran) l.push('🇩🇿 MODE ORAN : Kouider est EN ALGÉRIE en ce moment. Heure d\'Oran, montants en dinars d\'abord (euro au square), il peut aller sur place.');
  if (shield) l.push('🛡️ BOUCLIER FAMILLE actif : il est avec sa famille ; ne propose rien de non urgent, réponses très courtes.');
  if (relief && Date.now() < relief.until) l.push('🤝 RELAIS : tu gères les clients à sa place pour le moment, ne lui remonte que l\'urgent.');
  if (mood && Date.now() - mood.at < 3 * 3600_000 && (mood.stress >= 7 || mood.energy <= 3)) l.push(`💭 Il est ${mood.stress >= 7 ? 'tendu' : 'fatigué'} en ce moment (${mood.why}) : sois bref, calme, propose de prendre des choses en charge.`);
  if (e) l.push(e.line);
  return l.length ? `\n\nJARVIS 4 — ÉTAT DU MOMENT :\n${l.join('\n')}` : '';
}

// ── La Conscience ────────────────────────────────────────────────────────────
const MAX_PER_DAY = 6;

export async function snapshot(): Promise<Record<string, unknown>> {
  const now = new Date();
  const in4h = new Date(Date.now() + 4 * 3600_000);
  const { date } = localNow();
  const tomorrow = localNow(Date.now() + 86_400_000).date;
  const [agenda, books, drafts, promises, where, trips, oran, sent, decisions, crisis] = await Promise.all([
    import('./google-calendar.js').then(m => m.listAgendaRange(now.toISOString(), in4h.toISOString())).catch(() => null),
    supabase.from('bookings').select('client_name, start_date, end_date, status, cars(name)').or(`start_date.gte.${date},end_date.gte.${date}`).lte('start_date', `${tomorrow}T23:59`).limit(15).then(r => r.data ?? []),
    import('./whatsapp-web.js').then(m => m.waPendingDrafts()).catch(() => []),
    import('./foresight.js').then(m => m.promisesDue()).catch(() => []),
    kvJson<{ where: string; since: number } | null>('conscience:where', null),
    kvJson<Array<{ who: string; kind: string; title: string; departAt: number }>>('trips:v1', []),
    import('./gps-life.js').then(m => m.oranActive()).catch(() => null),
    kvJson<Array<{ at: number; text: string }>>('tg:sentlog', []),
    pendingDecisions(),
    kvJson<{ title: string; steps: Array<{ text: string; done?: boolean }> } | null>('crisis', null),
  ]);
  const gps = await kvJson<{ last?: { kmh: number } }>('gps:state', {});
  // Ce que Kouider a dit ces 2 h : ses corrections (« je n'ai pas de RDV », « je suis au travail ») priment sur l'agenda
  const { data: said } = await supabase.from('conversations').select('content, created_at').eq('session_id', 'voice_kouider').eq('role', 'user').gte('created_at', new Date(Date.now() - 2 * 3600_000).toISOString()).order('created_at').limit(15);
  const health = (await kvJson<Array<Record<string, unknown>>>('health:daily', [])).find(h => h['date'] === date);
  return {
    heure: localNow().hhmm, jour: ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'][localNow().weekday],
    lieu: where ? `${where.where} depuis ${Math.round((Date.now() - where.since) / 60_000)} min` : 'inconnu', vitesse_kmh: Math.round(gps.last?.kmh ?? 0),
    mode_oran: !!oran, bouclier_famille: await shieldActive(),
    // Son créneau de TRAVAIL n'est pas un rendez-vous ; un événement déjà commencé est marqué comme tel
    agenda_4h: ((agenda ?? []) as Array<{ summary?: string; start?: { dateTime?: string }; location?: string }>)
      .filter(e => !/travail|boulot|\btaf\b|shift|poste/i.test(e.summary ?? ''))
      .map(e => `${e.start?.dateTime?.slice(11, 16) ?? ''} ${e.summary ?? ''}${e.location ? ` @${e.location}` : ''}${e.start?.dateTime && Date.parse(e.start.dateTime) < Date.now() ? ' (déjà commencé)' : ''}`),
    locations_aujourdhui_demain: (books as Array<Record<string, unknown>>).filter(b => !/REJECT|CANCEL/i.test(String(b['status']))).map(b => `${(b['cars'] as { name?: string } | null)?.name ?? ''} ${b['client_name']} ${String(b['start_date']).slice(0, 16)}→${String(b['end_date']).slice(0, 16)}`),
    vols_24h: trips.filter(t => t.departAt > Date.now() && t.departAt - Date.now() < 86_400_000).map(t => `${t.who} ${t.title} ${new Date(t.departAt).toISOString().slice(0, 16)}`),
    whatsapp_en_attente: (drafts as Array<{ chat: string }>).map(d => d.chat).slice(0, 6),
    promesses_dues: promises.slice(0, 5),
    sante_du_jour: health ?? null,
    energie: (await energyToday()).line,
    humeur: await kvJson<MoodNow | null>('mood:now', null),
    decisions_en_attente: decisions.map(d => d.title.slice(0, 80)),
    salle_de_crise: crisis ? `${crisis.title} — ${crisis.steps.filter(s => !s.done).length} étape(s) restante(s)` : null,
    kouider_a_dit_2h: ((said ?? []) as Array<{ content: string; created_at: string }>).map(t => `${localNow(Date.parse(t.created_at)).hhmm} ${String(t.content).replace(/^\[[^\]]{20,}\]\s*/s, '').slice(0, 200)}`),
    deja_envoye_3h: sent.filter(s => Date.now() - s.at < 3 * 3600_000).map(s => s.text.slice(0, 140)),
  };
}

export async function jobConscience(): Promise<string> {
  const { hhmm, date } = localNow();
  await judgePast().catch(() => {});
  const where = (await kvJson<{ where: string } | null>('conscience:where', null))?.where ?? '';
  await shieldTick(where).catch(e => console.error('[conscience] shield', e));
  await moodNowTick().catch(() => null);
  const night = hhmm < '06:00' || hhmm >= '22:45';
  const snap = await snapshot();
  // Rien de neuf depuis le dernier tour (hors heure) → pas d'appel IA
  const sig = JSON.stringify({ ...snap, heure: undefined, lieu: String(snap['lieu']).replace(/\d+ min/, ''), energie: undefined, deja_envoye_3h: undefined, vitesse_kmh: Math.round(Number(snap['vitesse_kmh']) / 30) });
  const last = await kvJson<{ sig: string; at: number } | null>('conscience:last', null);
  if (last && last.sig === sig && Date.now() - last.at < 60 * 60_000) return 'inchangé';
  await kvPut('conscience:last', { sig, at: Date.now() });
  const log = await kvJson<Nudge[]>(LOG, []);
  const todayN = log.filter(n => localNow(n.at).date === date && n.urgency < 3).length;
  const scores = await kvJson<Record<string, number>>(SCORES, {});
  const o = jsonOf<{ speak?: boolean; kind?: string; urgency?: number; text?: string; options?: Array<{ label: string; tool?: string; input?: Record<string, unknown> }> }>(await ai(
    `Tu es LA CONSCIENCE de Dzaryx, l'assistant personnel (style Jarvis) de Kouider. Voici TOUT ce que tu vois maintenant :\n${JSON.stringify(snap, null, 1)}\n\n`
    + `Goûts appris (type de conseil → score, négatif = il ignore, positif = il apprécie) : ${JSON.stringify(scores)}\n`
    + `Déjà ${todayN}/${MAX_PER_DAY} conseils aujourd'hui.${night ? ' C\'est la NUIT : seulement urgence 3.' : ''}${snap['bouclier_famille'] ? ' Bouclier famille : seulement urgence 3.' : ''}\n\n`
    + `Cherche UNE chose qui vaut VRAIMENT la peine d'être dite maintenant, en CROISANT les infos (ex. client qui atterrit + Houari loin ; rendez-vous dans 40 min + 35 min de route ; promesse due aujourd'hui ; décision qui attend depuis longtemps ; santé mauvaise + grosse journée ; il roule vers un lieu alors qu'un truc l'attend ailleurs). `
    + `Sa position (lieu) est la vérité : « work » = il est à son poste de travail, c'est normal, jamais un retard ; ne lui annonce pas un RDV ailleurs pendant qu'il y est sauf s'il est noté hors travail. `
    + `Ce que Kouider a dit (kouider_a_dit_2h) PRIME sur l'agenda : s'il a dit qu'il n'a pas de RDV, qu'il est au travail ou que c'est réglé, n'en reparle plus. Son travail n'est jamais un « RDV ». `
    + `Pas de redite de ce qui a déjà été envoyé ces 3 h. Pas de banalité, pas de motivation creuse, pas de « bonne journée ». Si rien d'utile → speak:false (c'est le cas le plus fréquent).\n`
    + `Réponds UNIQUEMENT en JSON : {"speak":true|false,"kind":"type court (ex. retard-rdv, client-aeroport, promesse, sante, argent, famille, decision)","urgency":1|2|3,"text":"ce que tu lui dis, 1 à 3 phrases, tutoiement, concret","options":[{"label":"bouton court","tool":"outil Dzaryx facultatif","input":{}}]} (options facultatives, 2-3 max, seulement si un simple choix permet d'agir).`,
    { max: 500 }));
  if (!o?.speak || !o.text) return 'silence';
  const urgency = Math.max(1, Math.min(3, Number(o.urgency) || 1));
  const kind = String(o.kind ?? 'autre').slice(0, 30);
  // Jamais deux fois le même sujet en 3 h, même « urgent » (le 28/10 : 4 alertes + appels pour un faux RDV)
  if (log.some(n => n.kind === kind && Date.now() - n.at < 3 * 3600_000)) return `tu (${kind} déjà dit)`;
  // Au travail d'après le GPS → pas d'alerte « retard » (il est déjà là où il doit être)
  if (where === 'work' && /retard|rdv/i.test(kind)) return 'tu (au travail)';
  if (urgency < 3 && (night || snap['bouclier_famille'] || todayN >= MAX_PER_DAY)) return 'tu (limite)';
  if (urgency < 2 && (scores[kind] ?? 0) <= -3) return `tu (${kind} ignoré d'habitude)`;
  if (urgency < 3 && await consciencePaused()) return 'tu (pause)';
  log.push({ id: uid(), at: Date.now(), kind, text: o.text, urgency });
  await kvPut(LOG, log.slice(-200));
  if (o.options?.length) await createDecision(`🧠 ${o.text}`, o.options.map(x => ({ label: x.label, tool: x.tool, input: x.input })));
  else await tg(`🧠 ${o.text}`);
  if (urgency === 3 && !log.slice(0, -1).some(n => n.urgency === 3 && Date.now() - n.at < 6 * 3600_000)) {
    const { callOwner } = await import('../notifications/voice-call.js');
    await callOwner(o.text, 'kouider').catch(() => {});
  }
  return `parlé (${kind}, ${urgency})`;
}

export async function conscienceTool(input: Record<string, unknown>): Promise<string> {
  const a = String(input['action'] ?? 'status');
  if (a === 'useful' || a === 'useless') {
    const log = await kvJson<Nudge[]>(LOG, []);
    const n = log[log.length - 1];
    if (!n) return 'Aucun conseil récent.';
    await learn(n.kind, a === 'useful' ? 2 : -3);
    return a === 'useful' ? `👍 Noté, je t'en dirai plus sur « ${n.kind} ».` : `👌 Noté, je te parlerai beaucoup moins de « ${n.kind} ».`;
  }
  if (a === 'pause') { await kvPut('conscience:paused', Date.now() + (Number(input['hours']) || 4) * 3600_000); return `🤫 La Conscience se tait ${Number(input['hours']) || 4} h (sauf urgence).`; }
  if (a === 'resume') { await kvPut('conscience:paused', 0); return '🧠 La Conscience est de retour.'; }
  const log = (await kvJson<Nudge[]>(LOG, [])).slice(-8);
  const sc = await kvJson<Record<string, number>>(SCORES, {});
  return `🧠 La Conscience regarde tout toutes les 10 min et ne parle que si ça vaut la peine (max ${MAX_PER_DAY}/jour, la nuit seulement l'urgent).\nDerniers conseils :\n${log.map(n => `• ${localNow(n.at).hhmm} [${n.kind}] ${n.text.slice(0, 100)}${n.reacted === true ? ' 👍' : n.reacted === false ? ' (ignoré)' : ''}`).join('\n') || '—'}\nCe qu'il a appris : ${Object.entries(sc).map(([k, v]) => `${k} ${v > 0 ? '+' : ''}${v}`).join(', ') || 'rien encore'}`;
}

export async function consciencePaused(): Promise<boolean> {
  return Date.now() < Number(await kvJson<number>('conscience:paused', 0));
}
