/**
 * CERVEAU + (27/10/2026) :
 *  - projet : projets en pilote automatique — un objectif + une date → plan en étapes datées ; chaque matin il relance
 *    l'étape du jour, coche ce que Kouider dit avoir fait, replanifie le retard, signale ce qui bloque. app_kv `projects`.
 *  - mode_vacances : le gardien répond 24 h/24 (mêmes règles : jamais de dispo ni de décision), « ne pas déranger »
 *    sauf urgence, et au retour le résumé de tout. app_kv `vacation`.
 *  - humeur : chaque soir, ses messages du jour → stress / énergie / humeur (Haiku) ; 3 jours de stress fort → un mot
 *    doux ; Dzaryx adapte son ton (contexte du dossier). app_kv `mood:log` (privé).
 *  - habitudes (« il devine ») : chaque dimanche, ses demandes des 4 dernières semaines → ce qu'il demande toujours au
 *    même moment ; à l'heure dite, Dzaryx l'a déjà préparé. app_kv `habits`.
 *  - rapport_moi : le 1er du mois, « qui tu es » — heures efficaces, humeur, sommeil, argent, réussites, 3 conseils.
 *  - fortune : tout ce qu'il possède (voitures, or, euros, dinars, biens, créances) + projection 1 / 5 / 10 ans.
 *    Valeurs qu'il dicte dans app_kv `fortune:assets` (jamais dans le dépôt public).
 */
import { ai, jsonOf, kvJson, kvPut, tg, research, uid } from './ai-util.js';
import { localNow } from './morning-routine.js';
import { supabase } from './supabase.js';

async function kouiderTurns(fromIso: string, toIso = new Date().toISOString(), limit = 400): Promise<Array<{ content: string; created_at: string }>> {
  const { data } = await supabase.from('conversations').select('content, created_at').eq('session_id', 'voice_kouider').eq('role', 'user')
    .gte('created_at', fromIso).lte('created_at', toIso).order('created_at').limit(limit);
  return ((data ?? []) as Array<{ content: string; created_at: string }>).map(r => ({ ...r, content: String(r.content).replace(/^\[[^\]]{20,}\]\s*/s, '').slice(0, 400) }));
}

// ── Projets en pilote automatique ────────────────────────────────────────────
interface Step { text: string; date: string; done?: boolean }
interface Project { id: string; goal: string; deadline: string; steps: Step[]; created: string; done?: boolean; lastNudge?: string }

export async function projectTool(input: Record<string, unknown>): Promise<string> {
  const action = String(input['action'] ?? 'list');
  const ps = await kvJson<Project[]>('projects', []);
  const find = () => { const q = String(input['project'] ?? input['goal'] ?? '').toLowerCase(); return ps.find(p => !p.done && (!q || p.goal.toLowerCase().includes(q))); };
  if (action === 'create') {
    const goal = String(input['goal'] ?? '').trim();
    if (!goal) return '❌ Quel projet ?';
    const deadline = String(input['deadline'] ?? '').trim() || new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
    const o = jsonOf<{ steps?: Step[] }>(await research(`Kouider lance un projet : « ${goal} », à finir avant le ${deadline}. Regarde ce qui est utile dans ses données (agenda, finances, réservations) puis découpe en 5 à 12 étapes CONCRÈTES datées (de demain jusqu'au ${deadline}), chacune faisable en une séance. Réponds à la fin UNIQUEMENT : {"steps":[{"text":"","date":"AAAA-MM-JJ"}]}`, { rounds: 4, sessionId: 'projects' })) ?? {};
    const steps = (o.steps ?? []).filter(s => s.text && /^\d{4}-\d{2}-\d{2}$/.test(s.date));
    if (!steps.length) return '❌ Je n\'ai pas réussi à faire le plan, redis-moi le projet plus précisément.';
    const p: Project = { id: uid(), goal, deadline, steps, created: new Date().toISOString() };
    await kvPut('projects', [...ps, p].slice(-30));
    return `🎼 Projet lancé : ${goal} (avant le ${deadline})\n${steps.map((s, i) => `${i + 1}. ${s.date.slice(5).split('-').reverse().join('/')} — ${s.text}`).join('\n')}\n\nChaque matin je te rappelle l'étape du jour. Dis-moi « fait » quand c'est fait.`;
  }
  const p = find();
  if (action === 'done_step') {
    if (!p) return '❌ Quel projet ?';
    const q = String(input['step'] ?? '').toLowerCase();
    const s = p.steps.find(x => !x.done && (!q || x.text.toLowerCase().includes(q))) ;
    if (!s) return 'Toutes les étapes sont déjà faites.';
    s.done = true;
    if (p.steps.every(x => x.done)) p.done = true;
    await kvPut('projects', ps);
    const next = p.steps.find(x => !x.done);
    return `✅ « ${s.text} » fait.${p.done ? `\n🏁 Projet « ${p.goal} » TERMINÉ, bravo !` : `\nProchaine étape (${next!.date}) : ${next!.text}`}`;
  }
  if (action === 'stop') { if (!p) return 'Aucun projet.'; p.done = true; await kvPut('projects', ps); return `⏹ Projet « ${p.goal} » arrêté.`; }
  const open = ps.filter(x => !x.done);
  return open.length ? open.map(x => `🎼 ${x.goal} (avant le ${x.deadline}) — ${x.steps.filter(s => s.done).length}/${x.steps.length}\n${x.steps.map(s => `  ${s.done ? '✅' : '⬜'} ${s.date.slice(5).split('-').reverse().join('/')} ${s.text}`).join('\n')}`).join('\n\n') : 'Aucun projet en cours. (« prépare l\'été 2027 avant le 1er mai »)';
}

/** 8h15 : étape du jour + retard → replanifié. */
export async function jobProjects(): Promise<string> {
  const ps = await kvJson<Project[]>('projects', []);
  const { date } = localNow();
  const lines: string[] = [];
  for (const p of ps.filter(x => !x.done && x.lastNudge !== date)) {
    const late = p.steps.filter(s => !s.done && s.date < date);
    const todayS = p.steps.filter(s => !s.done && s.date === date);
    if (late.length >= 2) {   // retard : on décale tout ce qui reste d'autant de jours que de retard (jusqu'à l'échéance)
      const shift = Math.round((Date.parse(date) - Date.parse(late[0]!.date)) / 86_400_000);
      for (const s of p.steps.filter(x => !x.done)) s.date = new Date(Math.min(Date.parse(s.date) + shift * 86_400_000, Date.parse(p.deadline))).toISOString().slice(0, 10);
    }
    if (todayS.length || late.length) lines.push(`🎼 ${p.goal}\n${[...late.map(s => `⏰ en retard : ${s.text}`), ...todayS.map(s => `👉 aujourd'hui : ${s.text}`)].join('\n')}${late.length >= 2 ? '\n(Je décale la suite du plan.)' : ''}`);
    p.lastNudge = date;
  }
  await kvPut('projects', ps);
  if (lines.length) await tg(`🎼 Tes projets aujourd'hui :\n\n${lines.join('\n\n')}\n\nDis « fait » quand c'est fait, ou « bloqué : … » et je t'aide.`);
  return `${lines.length} projet(s)`;
}

// ── Mode vacances ────────────────────────────────────────────────────────────
interface Vacation { from: string; until: string; summarized?: boolean }

export async function vacationActive(): Promise<boolean> {
  const v = await kvJson<Vacation | null>('vacation', null);
  return !!v && Date.now() >= Date.parse(v.from) && Date.now() < Date.parse(v.until);
}

export async function vacationTool(input: Record<string, unknown>): Promise<string> {
  const action = String(input['action'] ?? 'status');
  if (action === 'on') {
    const until = String(input['until'] ?? '').trim();
    if (!/^\d{4}-\d{2}-\d{2}/.test(until)) return '❌ Jusqu\'à quand ? (until AAAA-MM-JJ)';
    const from = String(input['from'] ?? '').trim() || new Date().toISOString();
    const v: Vacation = { from: /^\d{4}-\d{2}-\d{2}$/.test(from) ? `${from}T00:00:00` : from, until: /^\d{4}-\d{2}-\d{2}$/.test(until) ? `${until}T20:00:00` : until };
    await kvPut('vacation', v);
    const { planDnd } = await import('../notifications/dnd.js');
    await planDnd({ from: Date.parse(v.from), until: Date.parse(v.until), why: 'mode vacances' }).catch(() => {});
    return `🏖️ Mode vacances du ${v.from.slice(0, 10)} au ${v.until.slice(0, 10)} : le gardien répond aux clients 24 h/24 (infos, conditions, prix, site — jamais de dispo ni de décision), je ne te dérange que pour une vraie urgence (accident, police, client bloqué), et au retour tu as le résumé de tout. Bonnes vacances !`;
  }
  if (action === 'off') {
    await kvPut('vacation', null);
    const { clearPlannedDnd } = await import('../notifications/dnd.js');
    await clearPlannedDnd().catch(() => {});
    return '✅ Mode vacances arrêté : retour au fonctionnement normal.';
  }
  const v = await kvJson<Vacation | null>('vacation', null);
  return v && Date.now() < Date.parse(v.until) ? `🏖️ Mode vacances : du ${v.from.slice(0, 10)} au ${v.until.slice(0, 10)}.` : 'Mode vacances : non.';
}

/** Toutes les heures : vacances finies → résumé de tout ce qui s'est passé. */
export async function jobVacationEnd(): Promise<string> {
  const v = await kvJson<Vacation | null>('vacation', null);
  if (!v || v.summarized || Date.now() < Date.parse(v.until)) return 'rien';
  v.summarized = true; await kvPut('vacation', v);
  const log = await kvJson<Array<{ at: string; chat: string; asked: string; needs: string }>>('nightguard:log', []);
  const during = log.filter(e => e.at >= v.from && e.at <= v.until);
  const { data } = await supabase.from('bookings').select('client_name, start_date, status, created_at').gte('created_at', v.from);
  const text = await ai(`Kouider rentre de vacances (${v.from.slice(0, 10)} → ${v.until.slice(0, 10)}). Pendant ce temps :\n- Clients qui ont écrit (gardien) : ${during.map(e => `${e.chat} : ${e.asked}${e.needs ? ` [à décider : ${e.needs}]` : ''}`).join(' | ') || 'aucun'}\n- Réservations créées : ${JSON.stringify(data ?? [])}\nFais-lui un résumé de retour : 3 lignes de bilan, puis les décisions qui l'attendent (une par ligne, la plus urgente d'abord). Tutoie-le, chaleureux, pas de tableau.`, { quality: true, max: 900 });
  await tg(`🏖️ Bon retour ! Voici ce qui s'est passé pendant tes vacances :\n\n${text}`);
  return 'résumé envoyé';
}

// ── Humeur ───────────────────────────────────────────────────────────────────
interface Mood { date: string; stress: number; energy: number; mood: string; why: string }

export async function jobMood(): Promise<string> {
  const { date } = localNow();
  const turns = await kouiderTurns(`${date}T00:00:00`);
  if (turns.length < 4) return 'pas assez de messages';
  const o = jsonOf<{ stress?: number; energy?: number; mood?: string; why?: string }>(await ai(`Voici les messages que Kouider a envoyés aujourd'hui à son assistant (dans l'ordre, avec l'heure) :\n${turns.map(t => `${t.created_at.slice(11, 16)} ${t.content}`).join('\n').slice(-9000)}\n\nÉvalue avec tact son état du jour d'après ses mots, la longueur et le ton (impatience, fatigue, joie, inquiétude), l'heure (messages très tard / très tôt). Réponds UNIQUEMENT : {"stress":1-10,"energy":1-10,"mood":"un mot","why":"une phrase, factuelle, bienveillante"}`, { max: 300 })) ?? {};
  const log = await kvJson<Mood[]>('mood:log', []);
  log.push({ date, stress: Number(o.stress ?? 5), energy: Number(o.energy ?? 5), mood: String(o.mood ?? ''), why: String(o.why ?? '') });
  await kvPut('mood:log', log.filter(m => m.date !== date || m === log[log.length - 1]).slice(-120));
  const last3 = log.slice(-3);
  const alerted = await kvJson<string>('mood:alerted', '');
  if (last3.length === 3 && last3.every(m => m.stress >= 7) && (!alerted || Date.parse(date) - Date.parse(alerted) > 5 * 86_400_000)) {
    await kvPut('mood:alerted', date);
    await tg(`💭 Kouider, ça fait 3 jours que je te sens sous pression (${last3.map(m => m.why).join(' ; ')}).\nTu veux que je décale ce qui peut attendre demain et que je te garde une vraie pause ? Dis-moi juste « allège ma journée ».`);
  }
  return `humeur ${o.mood} stress ${o.stress}`;
}

/** Pour le dossier de Dzaryx : son état récent (adapter le ton). */
export async function moodText(): Promise<string> {
  const log = await kvJson<Mood[]>('mood:log', []);
  const m = log[log.length - 1];
  if (!m || Date.now() - Date.parse(m.date) > 2 * 86_400_000) return '';
  return `HUMEUR RÉCENTE de Kouider (${m.date}) : ${m.mood}, stress ${m.stress}/10, énergie ${m.energy}/10 — ${m.why}${m.stress >= 7 ? ' → sois bref, calme et rassurant, propose d\'alléger.' : ''}`;
}

// ── Habitudes : il devine ────────────────────────────────────────────────────
interface Habit { weekday: number; hour: string; what: string; prompt: string; lastRun?: string }

export async function jobHabitsLearn(): Promise<string> {
  const turns = await kouiderTurns(new Date(Date.now() - 28 * 86_400_000).toISOString(), undefined, 1500);
  if (turns.length < 30) return 'pas assez d\'historique';
  const days = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'];
  const lines = turns.map(t => { const d = new Date(t.created_at); const l = localNow(d.getTime()); return `${days[l.weekday]} ${l.hhmm} ${t.content.slice(0, 140)}`; }).join('\n');
  const o = jsonOf<{ habits?: Habit[] }>(await ai(`Voici 4 semaines de demandes de Kouider à son assistant (jour, heure, message) :\n${lines.slice(-30000)}\n\nTrouve les demandes RÉCURRENTES : la même chose demandée au moins 3 fois, le même jour de la semaine ou chaque jour, à peu près à la même heure (ex. chiffres de la semaine le vendredi soir, programme du lendemain le soir, météo d'Oran le matin). Ignore le reste.\nRéponds UNIQUEMENT : {"habits":[{"weekday":0-6 (0=dimanche, -1 = tous les jours),"hour":"HH:MM (30 min AVANT l'heure habituelle)","what":"ce qu'il demande, en 6 mots","prompt":"la demande à préparer, formulée comme lui la dirait"}]}`, { quality: true, max: 1500 })) ?? {};
  const habits = (o.habits ?? []).filter(h => h.prompt && /^\d{2}:\d{2}$/.test(h.hour)).slice(0, 8);
  const old = await kvJson<Habit[]>('habits', []);
  await kvPut('habits', habits.map(h => ({ ...h, lastRun: old.find(x => x.what === h.what)?.lastRun })));
  return `${habits.length} habitude(s)`;
}

/** Toutes les 15 min : une habitude arrive → il prépare et l'envoie avant qu'on demande. */
export async function jobHabitsRun(): Promise<string> {
  const habits = await kvJson<Habit[]>('habits', []);
  const { date, hhmm, weekday } = localNow();
  let n = 0;
  for (const h of habits) {
    if (h.lastRun === date || (h.weekday !== -1 && h.weekday !== weekday) || hhmm < h.hour || hhmm > `${String(Number(h.hour.slice(0, 2)) + 1).padStart(2, '0')}${h.hour.slice(2)}`) continue;
    h.lastRun = date; n++;
    const out = await research(`Prépare pour Kouider, AVANT qu'il le demande (il le demande d'habitude à cette heure) : « ${h.prompt} ». Réponse directe, courte, avec les vrais chiffres.`, { rounds: 5, sessionId: 'habits' });
    await tg(`🔮 Je te l'ai préparé avant que tu demandes (${h.what}) :\n\n${out}`);
  }
  if (n) await kvPut('habits', habits);
  return `${n} préparé(s)`;
}

// ── Rapport « qui tu es » ────────────────────────────────────────────────────
export async function buildSelfReport(days = 30): Promise<string> {
  const from = new Date(Date.now() - days * 86_400_000).toISOString();
  const turns = await kouiderTurns(from, undefined, 3000);
  const byHour = new Array(24).fill(0) as number[];
  for (const t of turns) byHour[Number(localNow(Date.parse(t.created_at)).hhmm.slice(0, 2))]++;
  const mood = (await kvJson<Mood[]>('mood:log', [])).filter(m => m.date >= from.slice(0, 10));
  const health = (await kvJson<Array<{ date: string; sleep_h?: number; steps?: number; rhr?: number }>>('health:daily', [])).filter(h => h.date >= from.slice(0, 10));
  const { executeTool } = await import('./tool-executor.js');
  const [money, expenses] = await Promise.all([
    executeTool('get_revenue_report', { period: 'month' }, 'self-report').catch(() => ''),
    executeTool('get_expenses', {}, 'self-report').catch(() => ''),
  ]);
  return ai(`Écris à Kouider « Le rapport : qui tu es » des ${days} derniers jours, à partir de ces VRAIES données (n'invente rien) :
- Messages à son assistant par heure (0h→23h) : ${byHour.join(',')} (total ${turns.length})
- Exemples de ses demandes : ${turns.filter((_, i) => i % Math.max(1, Math.floor(turns.length / 60)) === 0).map(t => t.content.slice(0, 90)).join(' | ').slice(0, 6000)}
- Humeur notée chaque soir : ${mood.map(m => `${m.date} ${m.mood} stress ${m.stress}`).join(' ; ') || 'pas encore de données'}
- Santé (montre) : ${health.map(h => `${h.date} sommeil ${h.sleep_h ?? '?'}h pas ${h.steps ?? '?'}`).join(' ; ') || 'pas encore branché'}
- Argent FIK : ${String(money).slice(0, 1200)}
- Dépenses : ${String(expenses).slice(0, 800)}
Structure : 🕐 Tes heures les plus efficaces ; 💭 Ton humeur et ce qui la fait bouger ; 😴 Sommeil / énergie (si données) ; 💶 Argent ; 🏆 Tes 3 réussites du mois ; 🎯 3 conseils précis pour le mois prochain. Tutoie-le, chaleureux et honnête, pas de tableau, 25 lignes max.`, { quality: true, max: 2000 });
}

export async function jobSelfReport(): Promise<string> {
  await tg(`🪞 Le rapport du mois : qui tu es\n\n${await buildSelfReport(30)}`);
  return 'ok';
}

// ── Fortune ──────────────────────────────────────────────────────────────────
interface Asset { id: string; label: string; kind: 'voiture' | 'or' | 'euros' | 'dinars' | 'bien' | 'autre' | 'dette'; value: number; currency: 'EUR' | 'DZD'; growth?: number }

export async function fortune(): Promise<{ total: number; lines: Array<{ label: string; eur: number; kind: string }>; rate: number; proj: Record<string, number> }> {
  const assets = await kvJson<Asset[]>('fortune:assets', []);
  const g = await import('./gold.js').then(m => m.goldMarket()).catch(() => null);
  const rate = g?.eurDzd ?? 260;
  const lines: Array<{ label: string; kind: string; eur: number }> = assets.map(a => ({ label: a.label, kind: a.kind, eur: (a.kind === 'dette' ? -1 : 1) * (a.currency === 'DZD' ? a.value / rate : a.value) }));
  // Ce qu'on doit à FIK (restes à payer des clients)
  const { data } = await supabase.from('bookings').select('amount_remaining').gt('amount_remaining', 0).not('status', 'in', '(REJECTED,CANCELLED,cancelled)');
  const due = ((data ?? []) as Array<{ amount_remaining: number }>).reduce((s, b) => s + Number(b.amount_remaining || 0), 0);
  if (due > 0) lines.push({ label: 'Ce que les clients doivent encore à FIK', kind: 'créance', eur: due });
  const total = lines.reduce((s, l) => s + l.eur, 0);
  // Projection prudente : voitures -12 %/an, or +5 %/an, biens +3 %/an, reste 0 % (taux réglables par actif via growth)
  const rateOf = (k: string, a?: Asset) => a?.growth ?? ({ voiture: -0.12, or: 0.05, bien: 0.03 } as Record<string, number>)[k] ?? 0;
  const proj: Record<string, number> = {};
  for (const y of [1, 5, 10]) proj[`${y} an${y > 1 ? 's' : ''}`] = Math.round(lines.reduce((s, l, i) => s + l.eur * Math.pow(1 + rateOf(l.kind, assets[i]), y), 0));
  return { total: Math.round(total), lines: lines.map(l => ({ ...l, eur: Math.round(l.eur) })), rate: Math.round(rate), proj };
}

export async function fortuneTool(input: Record<string, unknown>): Promise<string> {
  const action = String(input['action'] ?? 'show');
  const assets = await kvJson<Asset[]>('fortune:assets', []);
  if (action === 'set') {
    const label = String(input['label'] ?? '').trim();
    const value = Number(String(input['value'] ?? '').replace(/\s/g, '').replace(',', '.').replace(/[^\d.-]/g, ''));
    if (!label || !Number.isFinite(value)) return '❌ Il me faut quoi (label) et combien (value).';
    const kind = (String(input['kind'] ?? 'autre') as Asset['kind']);
    const currency = /dzd|da|dinar/i.test(String(input['currency'] ?? '')) ? 'DZD' : 'EUR';
    const old = assets.find(a => a.label.toLowerCase() === label.toLowerCase());
    if (old) Object.assign(old, { value, kind, currency }); else assets.push({ id: uid(), label, kind, value, currency });
    await kvPut('fortune:assets', assets);
  }
  if (action === 'remove') {
    await kvPut('fortune:assets', assets.filter(a => !a.label.toLowerCase().includes(String(input['label'] ?? '').toLowerCase())));
  }
  const f = await fortune();
  if (!f.lines.length) return '💰 Je n\'ai encore rien sur ta fortune. Dis-moi ce que tu possèdes : « 3 000 € sur mon compte », « 600 € d\'or », « la Clio vaut 1,2 million de DA », « appartement à Oran 18 millions »…';
  return `💰 Ta fortune aujourd'hui : ${f.total.toLocaleString('fr-FR')} € (≈ ${(f.total * f.rate).toLocaleString('fr-FR')} DA au square ${f.rate})\n${f.lines.map(l => `• ${l.label} : ${l.eur.toLocaleString('fr-FR')} €`).join('\n')}\n\n📈 Projection prudente (voitures −12 %/an, or +5 %, biens +3 %, sans nouvelles économies) : ${Object.entries(f.proj).map(([k, v]) => `dans ${k} ${v.toLocaleString('fr-FR')} €`).join(' · ')}`;
}
