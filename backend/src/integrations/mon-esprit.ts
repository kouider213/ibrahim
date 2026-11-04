/**
 * MON ESPRIT (04/11/2026, demande de Kouider) : Dzaryx sait quels jours il va bien ou mal, quel sport il a fait (même dit
 * à la voix), et que ses meilleurs moments sont avec sa femme et son fils Ibrahim. Chaque soir un JOURNAL du jour est
 * écrit depuis ses vrais messages + montre + sport + humeur ; le dimanche, le classement de ses jours de la semaine.
 *
 * Les 20 options (tool `esprit`, jobs `esprit-day` 23h10, `esprit-sunday` dim 18h, `esprit-watch` 18h15) :
 *  1 journal du soir auto          2 classement de la semaine (dim)   3 recette d'une bonne journée (chiffres)
 *  4 quel sport le rend heureux    5 carnet des moments en famille     6 rappel doux après 3 jours sans moment famille
 *  7 série dure (3 jours ≤ 4)       8 « tu remontes » après une série dure  9 prévision de demain
 * 10 bilan du mois                 11 « comment je vais aujourd'hui »   12 il note sa journée lui-même
 * 13 ce qui gâche ses journées     14 jours de travail vs jours de congé 15 sommeil → moral, chiffré
 * 16 carnet de gratitude           17 défi famille de la semaine         18 le cerveau connaît ses 7 derniers jours
 * 19 record : meilleur jour du mois 20 comparaison avec la semaine d'avant
 * Tout en app_kv `esprit:*` (privé, jamais dans le dépôt public). Jamais de médicament / Liberté dans ces messages.
 */
import { ai, jsonOf, kvJson, kvPut, tg } from './ai-util.js';
import { localNow } from './morning-routine.js';
import { supabase } from './supabase.js';

const DAYS_KEY = 'esprit:days';
const CORE = "Ses meilleurs moments de vie sont avec sa femme et son fils Ibrahim (1 an et demi) : c'est sa priorité n°1, avant le business.";
const FAMILY_RE = /\b(ma femme|femme|[ée]pouse|ibrahim|mon fils|fils|petit|b[ée]b[ée]|famille|en famille|ma ch[ée]rie|ensemble)\b/i;
const WD = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

export interface EspritDay {
  date: string; score: number; moral: number; energie: number; stress: number;
  sport: { fait: boolean; quoi?: string; ressenti?: string };
  famille: string[]; top?: string; dur?: string; declencheurs: string[]; gratitude?: string; resume?: string;
  sommeil?: number; pas?: number; off?: boolean; manual?: boolean;
}

const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const wdOf = (d: string) => new Date(Date.parse(`${d}T12:00:00Z`)).getUTCDay();
const avg = (a: number[]) => (a.length ? Math.round((a.reduce((x, y) => x + y, 0) / a.length) * 10) / 10 : null);
const dayName = (d: string) => `${WD[wdOf(d)]} ${Number(d.slice(8))}`;

export async function readDays(): Promise<EspritDay[]> { return kvJson<EspritDay[]>(DAYS_KEY, []); }
async function saveDay(d: EspritDay): Promise<void> {
  const all = (await readDays()).filter(x => x.date !== d.date);
  all.push(d); all.sort((a, b) => a.date.localeCompare(b.date));
  await kvPut(DAYS_KEY, all.slice(-400));
}

/** Ses messages d'une journée (heure locale Bruxelles). */
async function turnsOf(date: string): Promise<string[]> {
  const from = new Date(Date.parse(`${date}T00:00:00Z`) - 2 * 3600_000).toISOString(), to = new Date(Date.parse(`${date}T23:59:59Z`)).toISOString();
  const { data } = await supabase.from('conversations').select('content, created_at').eq('session_id', 'voice_kouider').eq('role', 'user')
    .gte('created_at', from).lte('created_at', to).order('created_at').limit(300);
  return ((data ?? []) as Array<{ content: string; created_at: string }>)
    .filter(t => localNow(Date.parse(t.created_at)).date === date)
    .map(t => `${localNow(Date.parse(t.created_at)).hhmm} ${String(t.content).replace(/^\[[^\]]{20,}\]\s*/s, '').replace(/\n\n\[Consigne[\s\S]*$/, '').slice(0, 280)}`);
}

/** Tout ce que Dzaryx sait d'une journée : messages, humeur, montre, sport, congé. */
async function facts(date: string) {
  const [turns, moodLog, coachLog, health, sportH, sportLog, off] = await Promise.all([
    turnsOf(date),
    kvJson<Array<{ date: string; stress?: number; energy?: number; mood?: string; why?: string }>>('mood:log', []),
    kvJson<Array<{ at: string; mood?: number; note?: string }>>('kouider:coach:log', []),
    kvJson<Array<{ date: string; sleep_h?: number; steps?: number; hrv?: number; rhr?: number }>>('health:daily', []),
    import('./sport-coach.js').then(m => m.sportHistory()).catch(() => ({ history: {} as Record<string, string> })),
    import('./sport-coach.js').then(m => m.readSportLog()).catch(() => [] as Array<{ date: string; type: string; durationMin?: number; rpe?: number; note?: string }>),
    import('./kouider-dossier.js').then(m => m.getDaysOff()).catch(() => [] as number[]),
  ]);
  return {
    turns, mood: moodLog.find(m => m.date === date), coach: coachLog.filter(l => localNow(Date.parse(l.at)).date === date),
    health: health.find(h => h.date === date), sportStatus: (sportH.history as Record<string, string>)[date],
    sessions: sportLog.filter(l => l.date === date).map(l => ({ type: l.type, min: l.durationMin, rpe: l.rpe, note: l.note })),
    off: off.includes(wdOf(date)),
  };
}

/** Note du jour CALCULÉE (Kouider 04/11 « classé selon mon état d'esprit et le sport ») : toujours la même règle.
 *  60 % état d'esprit (moral, énergie, stress inversé) · 25 % sport (fait + ressenti) · 15 % moment en famille. */
export function dayScore(d: Pick<EspritDay, 'moral' | 'energie' | 'stress' | 'sport' | 'famille'>): number {
  const esprit = (d.moral + d.energie + (11 - d.stress)) / 3;
  const sport = d.sport.fait ? (/dur|nul|mal|crev|fatigu|bof/i.test(d.sport.ressenti ?? '') ? 7 : 10) : 3;
  const fam = d.famille.length ? 10 : 4;
  return Math.max(1, Math.min(10, Math.round(0.6 * esprit + 0.25 * sport + 0.15 * fam)));
}

/** Option 1 : le journal de la journée, écrit depuis ses vraies données. */
export async function writeJournal(date = localNow().date): Promise<EspritDay | null> {
  const old = (await readDays()).find(d => d.date === date);
  if (old?.manual) return old;                                    // il a noté sa journée lui-même : on garde sa note
  const f = await facts(date);
  if (f.turns.length < 2 && !f.health && !f.sessions.length && !f.coach.length) return null;
  const o = jsonOf<Partial<EspritDay> & { sport?: EspritDay['sport'] }>(await ai(
    `Journée du ${dayName(date)} ${date} de Kouider (papa, travaille en librairie + son business de location FIK).\n${CORE}\n` +
    `Ses messages à son assistant (heure + texte, souvent dictés) :\n${f.turns.join('\n') || '(aucun)'}\n` +
    `Humeur déduite : ${JSON.stringify(f.mood ?? null)}\nMoral qu'il a donné lui-même : ${JSON.stringify(f.coach)}\n` +
    `Montre : ${JSON.stringify(f.health ?? null)}\nSport prévu/fait : ${f.sportStatus ?? 'rien de prévu'} ; séances notées : ${JSON.stringify(f.sessions)}\n` +
    `Jour de congé : ${f.off ? 'oui' : 'non'}\n\n` +
    `Écris le journal de SA journée, uniquement d'après ces faits (rien d'inventé). Le sport compte même s'il l'a seulement dit dans un message (« j'ai fait 30 min de vélo »). ` +
    `famille = les vrais moments avec sa femme / son fils / sa famille cités dans ses messages (vide si aucun). ` +
    `JAMAIS de médicament, comprimé, traitement, sevrage, libido, sexualité, testostérone, prise de sang ni maladie dans aucun champ (le journal peut être lu à côté de sa femme) : écris « santé » ou « fatigue » à la place. ` +
    `Réponds UNIQUEMENT : {"score":1-10,"moral":1-10,"energie":1-10,"stress":1-10,"sport":{"fait":true/false,"quoi":"…","ressenti":"…"},"famille":["…"],"top":"meilleur moment en 1 phrase","dur":"moment le plus dur (ou vide)","declencheurs":["2-3 mots : ce qui a pesé"],"gratitude":"une chose positive de sa journée","resume":"2 phrases"}`,
    { max: 700 }));
  if (!o || !(Number(o.score) >= 1)) return null;
  const clamp = (v: unknown) => Math.max(1, Math.min(10, Math.round(Number(v) || 5)));
  // Filet de sécurité : rien de privé (santé, traitement, intimité) ne sort du journal, même si l'IA l'écrit
  const PRIV = /m[ée]dic|m[ée]doc|comprim|cachet|demis?\b|zaldiar|tramadol|sevrage|lib[ée]rt[ée]|libido|sexu|testo|[ée]rection|prise de sang|ordonnance|pharmac/i;
  const clean = (x?: string) => (x && PRIV.test(x) ? undefined : x);
  o.top = clean(o.top); o.dur = clean(o.dur) ?? (o.dur ? 'journée difficile (santé / fatigue)' : undefined); o.gratitude = clean(o.gratitude); o.resume = clean(o.resume);
  o.famille = (o.famille ?? []).filter(x => !PRIV.test(x)); o.declencheurs = (o.declencheurs ?? []).map(x => (PRIV.test(x) ? 'santé' : x));
  if (o.sport) o.sport.ressenti = clean(o.sport.ressenti);
  const day: EspritDay = {
    date, score: clamp(o.score), moral: clamp(o.moral), energie: clamp(o.energie), stress: clamp(o.stress),
    sport: { fait: !!o.sport?.fait || f.sportStatus === 'done' || f.sessions.length > 0, quoi: o.sport?.quoi || f.sessions.map(s => s.type).join(', ') || undefined, ressenti: o.sport?.ressenti || undefined },
    famille: (o.famille ?? []).filter(Boolean).slice(0, 4), top: o.top || undefined, dur: o.dur || undefined,
    declencheurs: (o.declencheurs ?? []).filter(Boolean).slice(0, 3), gratitude: o.gratitude || undefined, resume: o.resume || undefined,
    sommeil: f.health?.sleep_h, pas: f.health?.steps, off: f.off,
  };
  if (!day.famille.length) day.famille = f.turns.filter(t => FAMILY_RE.test(t)).slice(0, 2).map(t => t.slice(6, 120));
  day.score = dayScore(day);
  await saveDay(day);
  return day;
}

/** Option 3, 4, 14, 15 : ce qui fait ses bonnes journées, calculé par le code sur ses vrais jours. */
function recipe(days: EspritDay[]): string[] {
  const out: string[] = [];
  const cmp = (label: string, yes: EspritDay[], no: EspritDay[]) => {
    const a = avg(yes.map(d => d.score)), b = avg(no.map(d => d.score));
    if (a != null && b != null && yes.length >= 2 && no.length >= 2 && Math.abs(a - b) >= 0.5) out.push(`${label} : ${a}/10 contre ${b}/10 sans`);
  };
  cmp('👨‍👩‍👦 Jours avec un moment en famille', days.filter(d => d.famille.length), days.filter(d => !d.famille.length));
  cmp('🏋️ Jours avec sport', days.filter(d => d.sport.fait), days.filter(d => !d.sport.fait));
  cmp('😴 Nuits de 7 h ou plus', days.filter(d => (d.sommeil ?? 0) >= 7), days.filter(d => d.sommeil != null && d.sommeil < 7));
  cmp('🌴 Jours de congé', days.filter(d => d.off), days.filter(d => !d.off));
  cmp('🚶 Plus de 8 000 pas', days.filter(d => (d.pas ?? 0) >= 8000), days.filter(d => d.pas != null && d.pas < 8000));
  const bySport: Record<string, number[]> = {};
  for (const d of days) if (d.sport.fait && d.sport.quoi) (bySport[d.sport.quoi.toLowerCase().split(/[,(]/)[0]!.trim()] ??= []).push(d.score);
  const best = Object.entries(bySport).filter(([, v]) => v.length >= 2).sort((a, b) => avg(b[1])! - avg(a[1])!)[0];
  if (best) out.push(`💪 Le sport qui te fait le plus de bien : ${best[0]} (${avg(best[1])}/10 en moyenne ces jours-là)`);
  return out;
}

/** Option 13 : ce qui revient les jours difficiles. */
function triggers(days: EspritDay[]): string[] {
  const n: Record<string, number> = {};
  for (const d of days.filter(x => x.score <= 5)) for (const t of d.declencheurs) n[t.toLowerCase()] = (n[t.toLowerCase()] ?? 0) + 1;
  return Object.entries(n).filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t, c]) => `${t} (${c} fois)`);
}

/** Options 2, 17, 19, 20 : la semaine classée, envoyée le dimanche. */
export async function weekRecap(send = false): Promise<string> {
  const today = localNow().date;
  for (let i = 0; i < 7; i++) {                                    // jours manquants (job raté) : on les écrit maintenant
    const d = addDays(today, -i);
    if (!(await readDays()).some(x => x.date === d)) await writeJournal(d).catch(() => null);
  }
  const all = await readDays();
  const week = all.filter(d => d.date > addDays(today, -7) && d.date <= today);
  if (week.length < 2) return "Pas encore assez de journées notées cette semaine pour faire ton classement (il me faut au moins 2 jours).";
  const ranked = [...week].sort((a, b) => b.score - a.score || b.moral - a.moral);
  const medal = ['🥇', '🥈', '🥉'];
  const lines = ranked.map((d, i) => `${medal[i] ?? '▫️'} ${dayName(d.date)} — ${d.score}/10${d.sport.fait ? ' · 🏋️' : ''}${d.famille.length ? ' · 👨‍👩‍👦' : ''}${d.top ? ` · ${d.top}` : ''}`);
  const best = ranked[0]!, worst = ranked[ranked.length - 1]!;
  const prev = all.filter(d => d.date > addDays(today, -14) && d.date <= addDays(today, -7));
  const a = avg(week.map(d => d.score))!, p = avg(prev.map(d => d.score));
  const month = all.filter(d => d.date.slice(0, 7) === today.slice(0, 7));
  const record = [...month].sort((x, y) => y.score - x.score)[0];
  const fam = week.flatMap(d => d.famille.map(m => `• ${dayName(d.date)} : ${m}`)).slice(0, 5);
  const rec = recipe(all.filter(d => d.date > addDays(today, -35)));
  const trig = triggers(all.filter(d => d.date > addDays(today, -35)));
  const grat = week.filter(d => d.gratitude).map(d => `• ${d.gratitude}`).slice(0, 4);
  const defi = jsonOf<{ defi?: string; mot?: string }>(await ai(
    `${CORE}\nSa semaine (journal) : ${JSON.stringify(week.map(d => ({ jour: dayName(d.date), score: d.score, famille: d.famille, sport: d.sport, top: d.top, dur: d.dur })))}\n` +
    `Ce qui fait ses bons jours : ${rec.join(' ; ') || 'pas encore assez de données'}\n` +
    `Donne : 1) un DÉFI FAMILLE simple et concret pour la semaine prochaine avec sa femme et/ou Ibrahim (réaliste avec son travail, pas cher), ` +
    `2) un mot de fin chaleureux de grand frère (1 phrase, tutoiement, sans médicament). Réponds UNIQUEMENT : {"defi":"…","mot":"…"}`, { max: 250 })) ?? {};
  const text = [
    `🧠 TA SEMAINE DANS LA TÊTE (${dayName(addDays(today, -6))} → ${dayName(today)})`,
    '(classé : 60 % ton état d\'esprit · 25 % le sport · 15 % la famille)', '', ...lines, '',
    `⭐ Meilleur jour : ${dayName(best.date)}${best.resume ? ` — ${best.resume}` : ''}`,
    worst.date !== best.date ? `🌧️ Jour le plus dur : ${dayName(worst.date)}${worst.dur ? ` — ${worst.dur}` : ''}` : '',
    `📊 Moyenne : ${a}/10${p != null ? ` (semaine d'avant : ${p}/10 ${a > p ? '📈' : a < p ? '📉' : '='})` : ''}`,
    record && record.score >= 8 ? `🏆 Record du mois : ${dayName(record.date)} (${record.score}/10)` : '',
    ...(fam.length ? ['', '👨‍👩‍👦 Tes moments en famille :', ...fam] : ['', "👨‍👩‍👦 Aucun moment en famille noté cette semaine — c'est pourtant là que tu es le plus heureux."]),
    ...(rec.length ? ['', '🧪 Ta recette d\'une bonne journée (tes vrais chiffres, 5 semaines) :', ...rec.map(r => `• ${r}`)] : []),
    ...(trig.length ? ['', `⚠️ Ce qui revient les jours durs : ${trig.join(', ')}`] : []),
    ...(grat.length ? ['', '🙏 Ce qui était bien :', ...grat] : []),
    ...(defi.defi ? ['', `🎯 Défi famille de la semaine : ${defi.defi}`] : []),
    ...(defi.mot ? ['', defi.mot] : []),
  ].filter((l, i, arr) => l !== '' || arr[i - 1] !== '').join('\n').trim();
  if (send) { await tg(text); await kvPut('esprit:weekly:last', today); }
  return text;
}

/** Option 9 : prévision de demain, d'après ses bons/mauvais jours et ce qui est prévu. */
async function tomorrow(): Promise<string> {
  const d = addDays(localNow().date, 1);
  const days = (await readDays()).filter(x => x.date > addDays(d, -36));
  const [sport, off, health] = await Promise.all([
    import('./sport-coach.js').then(m => m.sportSessionFor(d)).catch(() => null),
    import('./kouider-dossier.js').then(m => m.getDaysOff()).then(o => o.includes(wdOf(d))).catch(() => false),
    kvJson<Array<{ date: string; sleep_h?: number }>>('health:daily', []),
  ]);
  const same = avg(days.filter(x => wdOf(x.date) === wdOf(d)).map(x => x.score));
  const lastSleep = health[health.length - 1]?.sleep_h;
  const rec = recipe(days);
  return [`🔮 Demain (${dayName(d)}) :`,
    same != null ? `• Tes ${WD[wdOf(d)]}s sont en moyenne à ${same}/10.` : '',
    `• ${off ? 'Jour de congé.' : 'Jour de travail.'}${sport ? ` Sport prévu : ${sport}.` : ' Pas de sport prévu.'}`,
    lastSleep != null && lastSleep < 6.5 ? `• Dernière nuit courte (${lastSleep} h) : couche-toi tôt ce soir, c'est ce qui pèse le plus sur ton moral.` : '',
    rec[0] ? `• Ce qui marche pour toi : ${rec[0]}.` : '',
    '• Garde un vrai moment avec ta femme ou Ibrahim : ce sont tes meilleurs jours.',
  ].filter(Boolean).join('\n');
}

/** Option 10 : le mois. */
function monthText(all: EspritDay[], ym: string): string {
  const m = all.filter(d => d.date.slice(0, 7) === ym);
  if (!m.length) return `Aucune journée notée en ${ym}.`;
  const r = [...m].sort((a, b) => b.score - a.score);
  return [`📅 Ton mois (${ym}) : ${m.length} jours notés, moyenne ${avg(m.map(d => d.score))}/10.`,
    `🏆 Meilleur jour : ${dayName(r[0]!.date)} (${r[0]!.score}/10)${r[0]!.top ? ` — ${r[0]!.top}` : ''}`,
    `🌧️ Plus dur : ${dayName(r[r.length - 1]!.date)} (${r[r.length - 1]!.score}/10)`,
    `🏋️ Sport : ${m.filter(d => d.sport.fait).length} jours · 👨‍👩‍👦 moments en famille : ${m.filter(d => d.famille.length).length} jours`,
    ...recipe(m).map(x => `• ${x}`)].join('\n');
}

/** Options 6, 7, 8 : chaque soir 18h15, des mots doux seulement quand c'est utile (jamais d'appel). */
export async function jobEspritWatch(): Promise<string> {
  const today = localNow().date;
  const all = await readDays();
  const last3 = all.filter(d => d.date >= addDays(today, -3) && d.date < today);
  const { quietUntil } = await import('../notifications/auto-call.js');
  if ((await quietUntil().catch(() => 0)) > Date.now()) return 'ne pas déranger';
  const sent = await kvJson<Record<string, string>>('esprit:sent', {});
  const since = (k: string) => (sent[k] ? (Date.parse(today) - Date.parse(sent[k]!)) / 86_400_000 : 99);
  const mark = async (k: string) => { sent[k] = today; await kvPut('esprit:sent', sent); };
  // 7 : série dure (le mot doux de brain-plus sur le stress compte aussi → pas deux messages la même semaine)
  const alerted = await kvJson<string>('mood:alerted', '');
  if (last3.length === 3 && last3.every(d => d.score <= 4) && since('dur') > 5 && (!alerted || Date.parse(today) - Date.parse(alerted) > 3 * 86_400_000)) {
    await mark('dur');
    await tg(`🤍 Kouider, ces 3 derniers jours ont été durs (${last3.map(d => `${dayName(d.date)} ${d.score}/10`).join(', ')}). Tu n'as rien à prouver ce soir.\nLe plus simple qui t'aide d'habitude : ${recipe(all.slice(-35))[0] ?? 'un moment avec ta femme et Ibrahim, et une vraie nuit'}.\nSi tu veux en parler, je suis là. Et si ça pèse trop, parles-en aussi à ton médecin ou à quelqu'un de proche.`);
    return 'série dure';
  }
  // 8 : il remonte après une série dure
  const y = all.find(d => d.date === addDays(today, -1));
  if (y && y.score >= 7 && sent['dur'] && since('dur') <= 10 && since('remonte') > 10) {
    await mark('remonte');
    await tg(`📈 Hier ${y.score}/10 — tu remontes, après des jours difficiles. ${y.top ? `Ce qui a marché : ${y.top}. ` : ''}Garde ça en tête la prochaine fois que ça tangue.`);
    return 'remontée';
  }
  // 6 : 3 jours sans moment en famille
  if (last3.length === 3 && last3.every(d => !d.famille.length) && since('famille') > 4) {
    await mark('famille');
    await tg(`👨‍👩‍👦 Ça fait 3 jours que tu ne m'as parlé d'aucun moment avec ta femme ou Ibrahim. Tes meilleurs jours, c'est avec eux (${avg(all.filter(d => d.famille.length).map(d => d.score)) ?? '—'}/10 en moyenne). Ce soir, 20 minutes rien que pour eux, téléphone posé ?`);
    return 'famille';
  }
  return 'rien à dire';
}

export async function jobEspritDay(): Promise<string> {
  const d = await writeJournal();
  return d ? `${d.date} ${d.score}/10` : 'pas assez de données';
}
export async function jobEspritSunday(): Promise<string> {
  const last = await kvJson<string>('esprit:weekly:last', '');
  if (last === localNow().date) return 'déjà envoyé';
  const t = await weekRecap(true);
  return t.slice(0, 60);
}

/** Option 18 : ce que le cerveau sait de ses derniers jours (dans son dossier : chat, appels, Siri). */
export async function espritText(): Promise<string> {
  const days = (await readDays()).slice(-7);
  const base = `MON ESPRIT : ${CORE}`;
  if (!days.length) return base;
  return `${base}\nSes derniers jours (journal du soir) : ${days.map(d => `${dayName(d.date)} ${d.score}/10${d.sport.fait ? ` sport${d.sport.quoi ? ` ${d.sport.quoi}` : ''}` : ''}${d.famille.length ? ' famille' : ''}${d.dur ? ` (dur : ${d.dur.slice(0, 60)})` : ''}`).join(' · ')}.\nQuand il demande comment il va, ses meilleurs jours, son moral ou sa semaine → outil esprit.`;
}

/** « ma journée 8/10 », « je mets 7 à ma journée », « journée de merde 3 sur 10 » → noté par le CODE (05/11 banc : le cerveau
 *  disait « c'est top » sans rien enregistrer). rest = il raconte autre chose → le cerveau répond aussi. */
export function parseDayNote(raw: string): { score: number; famille?: string; top?: string; date?: string; rest: boolean } | null {
  const t = raw.replace(/^\s*\[[\s\S]*?\]\s*/, '').trim();
  if (t.length > 300 || /\?/.test(t)) return null;
  const m = /\bjourn[ée]e\b[^0-9?]{0,40}?\b(10|[1-9])(?:[.,]5)?\s*(?:\/|sur)\s*10\b/i.exec(t) ?? /\b(10|[1-9])\s*(?:\/|sur)\s*10\b[^?]{0,25}\bjourn[ée]e\b/i.exec(t) ?? /\bje (?:mets|donne)\s+(10|[1-9])\b[^?]{0,20}\bjourn[ée]e/i.exec(t);
  if (!m) return null;
  const score = Number(m[1]);
  const date = /\bhier\b/i.test(t) ? new Date(Date.parse(`${localNow().date}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10) : undefined;
  const restTxt = t.replace(m[0], ' ').replace(/\b(ma|mon|d['’]hier|hier|aujourd['’]hui|du jour)\b/gi, ' ').replace(/\s+/g, ' ').replace(/^[\s,.:;!-]+|[\s,.:;!-]+$/g, '').trim();
  const famille = FAMILY_RE.test(restTxt) ? restTxt.slice(0, 160) : undefined;
  return { score, ...(famille ? { famille } : {}), ...(restTxt.split(/\s+/).length >= 3 ? { top: restTxt.slice(0, 160) } : {}), ...(date ? { date } : {}), rest: restTxt.split(/\s+/).filter(Boolean).length >= 4 };
}

/** Outil `esprit` (Kouider seulement). */
export async function espritTool(input: Record<string, unknown>): Promise<string> {
  const action = String(input['action'] ?? 'semaine');
  const all = await readDays();
  const today = localNow().date;
  switch (action) {
    case 'semaine': return weekRecap(false);
    case 'aujourdhui': {                                                  // 11
      const d = await writeJournal(today);
      return d ? `🧠 Aujourd'hui, pour l'instant : ${d.score}/10 (moral ${d.moral}, énergie ${d.energie}, stress ${d.stress}).${d.sport.fait ? ` Sport : ${d.sport.quoi ?? 'fait'}.` : ''}${d.famille.length ? ` En famille : ${d.famille.join(' ; ')}.` : ''}${d.resume ? `\n${d.resume}` : ''}` : "Pas encore assez d'éléments aujourd'hui pour dire comment tu vas — raconte-moi ta journée.";
    }
    case 'noter': {                                                       // 12
      const score = Number(input['score']);
      if (!(score >= 1 && score <= 10)) return '❌ Donne une note de 1 à 10.';
      const date = String(input['date'] ?? today).slice(0, 10);
      const base = all.find(d => d.date === date) ?? (await writeJournal(date)) ?? { date, score, moral: score, energie: 5, stress: 5, sport: { fait: false }, famille: [], declencheurs: [] };
      const fam = String(input['famille'] ?? '').trim(), top = String(input['top'] ?? '').trim();
      await saveDay({ ...base, score: Math.round(score), moral: Math.round(score), manual: true, ...(top ? { top } : {}), famille: fam ? [...base.famille, fam] : base.famille });
      return `✅ ${dayName(date)} noté ${Math.round(score)}/10${top ? ` — meilleur moment : ${top}` : ''}. Je garde TA note, pas la mienne.`;
    }
    case 'famille': {                                                     // 5
      const f = all.filter(d => d.date > addDays(today, -60)).flatMap(d => d.famille.map(m => `• ${dayName(d.date)} : ${m}`));
      return f.length ? `👨‍👩‍👦 Tes moments en famille (60 jours) :\n${f.slice(-25).join('\n')}` : "Je n'ai encore aucun moment en famille noté. Raconte-les-moi : « ce soir bain avec Ibrahim », je les garde.";
    }
    case 'recette': {                                                     // 3 4 14 15
      const r = recipe(all.filter(d => d.date > addDays(today, -60)));
      return r.length ? `🧪 Ce qui fait tes bonnes journées (tes vrais chiffres) :\n${r.map(x => `• ${x}`).join('\n')}` : "Il me faut encore une dizaine de journées notées pour voir ce qui fait tes bons jours.";
    }
    case 'declencheurs': {                                                // 13
      const t = triggers(all.filter(d => d.date > addDays(today, -60)));
      return t.length ? `⚠️ Ce qui revient tes jours difficiles : ${t.join(', ')}.` : "Pas encore de déclencheur qui revient (ou pas assez de jours durs — tant mieux).";
    }
    case 'gratitude': {                                                   // 16
      const g = all.filter(d => d.gratitude && d.date > addDays(today, -14)).map(d => `• ${dayName(d.date)} : ${d.gratitude}`);
      return g.length ? `🙏 Ton carnet de gratitude :\n${g.join('\n')}` : 'Carnet vide pour l\'instant — il se remplit tout seul chaque soir.';
    }
    case 'demain': return tomorrow();                                     // 9
    case 'mois': return monthText(all, String(input['mois'] ?? today.slice(0, 7)).slice(0, 7));   // 10
    case 'jour': {
      const date = String(input['date'] ?? addDays(today, -1)).slice(0, 10);
      const d = all.find(x => x.date === date) ?? await writeJournal(date);
      return d ? `${dayName(d.date)} : ${d.score}/10 · moral ${d.moral} · énergie ${d.energie} · stress ${d.stress}${d.sport.fait ? ` · sport ${d.sport.quoi ?? ''}` : ''}${d.famille.length ? `\n👨‍👩‍👦 ${d.famille.join(' ; ')}` : ''}${d.top ? `\n⭐ ${d.top}` : ''}${d.dur ? `\n🌧️ ${d.dur}` : ''}` : `Rien de noté le ${date}.`;
    }
    case 'options': return [
      '🧠 MON ESPRIT — 20 options :',
      "1 Journal du soir automatique (23h10)", '2 Classement de ta semaine (dimanche 18h)', "3 Recette d'une bonne journée, chiffrée",
      '4 Le sport qui te rend le plus heureux', '5 Carnet des moments en famille', '6 Rappel doux après 3 jours sans moment famille',
      '7 Mot de soutien après 3 jours durs', '8 « Tu remontes » quand ça repart', '9 Prévision de demain',
      '10 Bilan du mois', "11 « Comment je vais aujourd'hui ? »", '12 Tu notes ta journée toi-même (« ma journée 8/10 »)',
      '13 Ce qui gâche tes journées', '14 Jours de travail vs jours de congé', '15 Sommeil → moral, chiffré',
      '16 Carnet de gratitude', '17 Défi famille de la semaine', '18 Dzaryx connaît tes 7 derniers jours partout',
      '19 Record : meilleur jour du mois', "20 Comparaison avec la semaine d'avant",
    ].join('\n');
    default: return '❌ Action inconnue.';
  }
}
