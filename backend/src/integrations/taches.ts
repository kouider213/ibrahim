/**
 * MES TÂCHES (27/11/2026) — ce que Kouider doit FAIRE lui-même et qu'il a demandé à Dzaryx de retenir
 * (« lundi appeler le médecin pour ma femme », « faut que je passe à la banque jeudi », « pense à acheter le cadeau d'Ibrahim »).
 * - app_kv `perso:taches` (privé, Kouider seulement).
 * - Page Aujourd'hui : carte « À faire » (aujourd'hui, en retard, à venir) avec Fait / Demain / Supprimer / ajouter.
 * - Messages : 8h liste du jour, à l'heure dite pour une tâche à heure (boutons Fait / 1 h / Demain),
 *   20h30 ce qui reste, dimanche 19h la semaine qui vient. Réponse « tâche 2 faite » = le n° 2 de la dernière liste.
 * - Les promesses (foresight.ts) et les rappels à heure fixe (table reminders) sont montrés à côté, sans doublon.
 */
import { kvJson, kvPut, tg, uid } from './ai-util.js';
import { localNow } from './morning-routine.js';

export type Cat = 'famille' | 'sante' | 'fik' | 'admin' | 'maison' | 'perso';
export interface Tache {
  id: string; text: string; due: string | null; time?: string | null; cat: Cat; who?: string | null;
  repeat?: 'semaine' | 'mois' | null; created: string; source: 'telegram' | 'app' | 'appel' | 'auto';
  done?: string | null; reminded?: string | null; moved?: number;
  lieu?: 'algerie' | 'belgique' | null;   // 27/11 « à faire en Algérie » / « au retour en Belgique » : sortie quand il y est
}
const KEY = 'perso:taches';
const LAST = 'perso:taches:last';   // numéros de la dernière liste envoyée → « tâche 2 faite »
export const CAT: Record<Cat, string> = { famille: '👨‍👩‍👦', sante: '🩺', fik: '🚗', admin: '📄', maison: '🏠', perso: '📝' };

const all = () => kvJson<Tache[]>(KEY, []);
const save = (l: Tache[]) => kvPut(KEY, l.filter(t => !t.done || Date.now() - Date.parse(t.done) < 30 * 86_400_000).slice(-300));
const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MONTHS = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'];

/** « lundi », « demain », « après-demain », « 3 décembre », « 2026-12-03 », « 03/12 », « dans 3 jours », « la semaine prochaine » → AAAA-MM-JJ. */
export function parseDue(raw: unknown, now = localNow()): string | null {
  const s = norm(String(raw ?? '').trim());
  if (!s || /^(null|aucune?|sans date|non)$/.test(s)) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  if (/aujourd|ce soir|tout a l'heure|maintenant/.test(s)) return now.date;
  if (/apres[- ]demain/.test(s)) return addDays(now.date, 2);
  if (/demain/.test(s)) return addDays(now.date, 1);
  const inN = s.match(/dans (\d+) (jour|semaine)/); if (inN) return addDays(now.date, +inN[1]! * (inN[2] === 'semaine' ? 7 : 1));
  if (/semaine prochaine/.test(s)) return addDays(now.date, ((8 - now.weekday) % 7) || 7);   // lundi prochain
  const dm = s.match(/\b(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?\b/);
  const dn = s.match(/\b(\d{1,2})(?:er)? (janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)\b/);
  if (dm || dn) {
    const d = +(dm ? dm[1]! : dn![1]!), m = dm ? +dm[2]! : MONTHS.indexOf(dn![2]!) + 1;
    let y = dm?.[3] ? (+dm[3] < 100 ? 2000 + +dm[3] : +dm[3]) : +now.date.slice(0, 4);
    let iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    if (!dm?.[3] && iso < now.date) { y++; iso = `${y}${iso.slice(4)}`; }
    return iso;
  }
  const wd = DAYS.findIndex(d => new RegExp(`\\b${d}\\b`).test(s));
  if (wd >= 0) return addDays(now.date, ((wd - now.weekday + 7) % 7) || 7);   // « lundi » dit un lundi = lundi prochain
  return null;
}
const parseTime = (raw: unknown): string | null => {
  const m = String(raw ?? '').match(/(\d{1,2})\s*(?:h|:)\s*(\d{2})?/i);
  return m && +m[1]! < 24 ? `${m[1]!.padStart(2, '0')}:${m[2] ?? '00'}` : null;
};
export function guessCat(text: string): Cat {
  const t = norm(text);
  if (/medecin|docteur|pharma|dentiste|analyse|prise de sang|ordonnance|hopital|kine|vaccin|rdv sante/.test(t)) return 'sante';
  if (/femme|ibrahim|fils|enfant|ecole|creche|maman|mere|pere|papa|frere|soeur|famille|belle/.test(t)) return 'famille';
  if (/client|voiture|location|reservation|houari|fik|clio|duster|aeroport|caution|contrat|site/.test(t)) return 'fik';
  if (/banque|impot|papier|passeport|visa|assurance|mairie|commune|facture|cpas|mutuelle|carte d'identite|prefecture|consulat|poste/.test(t)) return 'admin';
  if (/maison|appart|courses|reparer|plombier|loyer|menage|meuble/.test(t)) return 'maison';
  return 'perso';
}
const dayLabel = (due: string | null, now = localNow()) => {
  if (!due) return 'sans date';
  if (due === now.date) return "aujourd'hui";
  if (due === addDays(now.date, 1)) return 'demain';
  if (due < now.date) return `en retard (${due.slice(8, 10)}/${due.slice(5, 7)})`;
  const diff = Math.round((Date.parse(due) - Date.parse(now.date)) / 86_400_000);
  return diff < 7 ? DAYS[new Date(`${due}T12:00:00Z`).getUTCDay()]! : `le ${due.slice(8, 10)}/${due.slice(5, 7)}`;
};
const line = (t: Tache, n?: number) => `${n != null ? `${n}. ` : '• '}${CAT[t.cat]} ${t.text}${t.time ? ` à ${t.time.replace(':', 'h')}` : ''}`;

// ── Lecture ──────────────────────────────────────────────────────────────────
export interface TacheView extends Tache { label: string; late: boolean; today: boolean }
export async function tachesList(): Promise<{ today: TacheView[]; late: TacheView[]; upcoming: TacheView[]; nodate: TacheView[]; done: TacheView[];
  promises: Array<{ id: string; text: string; due: string }>; reminders: Array<{ id: string; text: string; at: string }>; stats: { doneWeek: number; open: number };
  here: 'algerie' | 'belgique'; promos: Array<{ id: string; title: string; what: string; bookBy?: string | null; why: string; url?: string | null }>; ailleurs: TacheView[]; moves: import('./taches-lies.js').ClientMove[]; trips: import('./taches-lies.js').MyTrip[] }> {
  const now = localNow();
  const L = await import('./taches-lies.js');
  const [l, here, moves, trips] = await Promise.all([all(), L.currentPlace(), L.clientMoves(3).catch(() => []), L.myTrips(10).catch(() => [])]);
  const v = (t: Tache): TacheView => ({ ...t, label: dayLabel(t.due, now), late: !!t.due && t.due < now.date, today: t.due === now.date });
  const sorted = l.filter(t => !t.done).sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999') || (a.time ?? '99').localeCompare(b.time ?? '99'));
  const open = sorted.filter(t => !t.lieu || t.lieu === here);   // une tâche « en Algérie » ne sort que quand il y est
  const promises = await import('./foresight.js').then(async () => (await kvJson<Array<{ id: string; to: string; what: string; due: string; done?: boolean }>>('promises', []))
    .filter(p => !p.done && Date.parse(p.due) - Date.now() < 7 * 86_400_000).map(p => ({ id: p.id, text: `${p.to} : ${p.what}`, due: p.due }))).catch(() => []);
  const reminders = await import('./supabase.js').then(async ({ supabase }) => {
    const { data } = await supabase.from('reminders').select('id, message, local_time_iso, remind_at').eq('status', 'PENDING')
      .lte('remind_at', new Date(Date.now() + 7 * 86_400_000).toISOString()).order('remind_at').limit(10);
    return (data ?? []).map((r: { id: string; message: string; local_time_iso?: string; remind_at: string }) => ({ id: r.id, text: r.message, at: r.local_time_iso ?? r.remind_at }));
  }).catch(() => []);
  return {
    today: open.filter(t => t.due === now.date).map(v),
    late: open.filter(t => t.due && t.due < now.date).map(v),
    upcoming: open.filter(t => t.due && t.due > now.date).map(v),
    nodate: open.filter(t => !t.due).map(v),
    done: l.filter(t => t.done && t.done.slice(0, 10) >= addDays(now.date, -1)).map(v),
    promises, reminders, here, moves, trips,
    promos: (await import('./ah-promos.js').then(m => m.activePromos()).catch(() => [])).slice(0, 2).map(p => ({ id: p.id, title: p.title, what: p.what, bookBy: p.bookBy, why: p.why, url: p.url })),
    ailleurs: sorted.filter(t => t.lieu && t.lieu !== here).map(v),
    stats: { doneWeek: l.filter(t => t.done && Date.now() - Date.parse(t.done) < 7 * 86_400_000).length, open: open.length },
  };
}

// ── Écriture ─────────────────────────────────────────────────────────────────
export function guessLieu(text: string): Tache['lieu'] {
  const t = norm(text);
  if (/(en|a|quand je (suis|serai|vais) (en|a)) (algerie|oran|alger|au bled|bled)\b|\bau bled\b|\ba oran\b/.test(t)) return 'algerie';
  if (/(au|a mon|des mon) retour|en belgique|a bruxelles|quand je rentre/.test(t)) return 'belgique';
  return null;
}
export async function tacheAdd(input: { text: string; due?: unknown; time?: unknown; cat?: string; who?: string; repeat?: string; lieu?: string | null; source?: Tache['source'] }): Promise<Tache | { dup: Tache }> {
  const text = String(input.text ?? '').trim().replace(/^(je dois|il faut que je|faut que je|penser? a|n'oublie pas de|rappelle[- ]moi d[e'])\s*/i, '').slice(0, 200);
  if (!text) throw new Error('Quelle tâche ?');
  const l = await all();
  const due = parseDue(input.due) ?? (input.due ? null : parseDue(text));
  const dup = l.find(t => !t.done && norm(t.text) === norm(text) && t.due === due);
  if (dup) return { dup };
  const t: Tache = { id: uid(), text: text[0]!.toUpperCase() + text.slice(1), due, time: parseTime(input.time), cat: (input.cat && input.cat in CAT ? input.cat : guessCat(text)) as Cat,
    lieu: input.lieu === 'algerie' || input.lieu === 'belgique' ? input.lieu : input.lieu === '' ? null : guessLieu(String(input.text ?? '')),
    who: input.who ? String(input.who).slice(0, 40) : null, repeat: input.repeat === 'semaine' || input.repeat === 'mois' ? input.repeat : null,
    created: new Date().toISOString(), source: input.source ?? 'telegram' };
  l.push(t); await save(l);
  return t;
}

function find(l: Tache[], q: unknown): Tache | undefined {
  const s = String(q ?? '').trim();
  if (!s) return undefined;
  const byId = l.find(t => t.id === s); if (byId) return byId;
  const open = l.filter(t => !t.done);
  const words = norm(s).split(/\s+/).filter(w => w.length > 2);
  return open.find(t => norm(t.text).includes(norm(s))) ?? open.find(t => words.length > 0 && words.every(w => norm(t.text).includes(w)))
    ?? open.map(t => ({ t, n: words.filter(w => norm(t.text).includes(w)).length })).filter(x => x.n >= 2).sort((a, b) => b.n - a.n)[0]?.t;
}
async function byNumber(n: number): Promise<string | null> { return (await kvJson<string[]>(LAST, []))[n - 1] ?? null; }

export async function tacheAct(id: string, action: 'done' | 'undo' | 'tomorrow' | 'hour' | 'move' | 'remove' | 'edit', extra: { due?: unknown; time?: unknown; text?: string } = {}): Promise<{ ok: boolean; message: string; task?: Tache }> {
  const l = await all();
  const t = find(l, id);
  if (!t) return { ok: false, message: 'Tâche introuvable.' };
  const now = localNow();
  if (action === 'done') {
    t.done = new Date().toISOString();
    if (t.repeat) {   // tâche qui revient : la suivante est créée tout de suite
      const base = t.due ?? now.date;
      const next = t.repeat === 'semaine' ? addDays(base, 7) : `${base.slice(0, 5)}${String(+base.slice(5, 7) % 12 + 1).padStart(2, '0')}${base.slice(7)}`.replace(/^(\d{4})-01/, (_m, y) => +base.slice(5, 7) === 12 ? `${+y + 1}-01` : `${y}-01`);
      l.push({ ...t, id: uid(), due: next, done: null, reminded: null, moved: 0, created: new Date().toISOString() });
    }
  } else if (action === 'undo') t.done = null;
  else if (action === 'tomorrow') { t.due = addDays(t.due && t.due > now.date ? t.due : now.date, 1); t.reminded = null; t.moved = (t.moved ?? 0) + 1; }
  else if (action === 'hour') { const h = new Date(Date.now() + 3600_000); t.due = now.date; t.time = localNow(h.getTime()).hhmm; t.reminded = null; }
  else if (action === 'move') { const d = parseDue(extra.due); if (!d) return { ok: false, message: 'Pour quel jour ?' }; t.due = d; t.time = parseTime(extra.time) ?? t.time ?? null; t.reminded = null; t.moved = (t.moved ?? 0) + 1; }
  else if (action === 'edit') { if (extra.text?.trim()) t.text = extra.text.trim().slice(0, 200); if (extra.due !== undefined) t.due = parseDue(extra.due); if (extra.time !== undefined) t.time = parseTime(extra.time); t.reminded = null; }
  else if (action === 'remove') { await save(l.filter(x => x !== t)); return { ok: true, message: `🗑️ « ${t.text} » supprimée.` }; }
  await save(l);
  const msg = action === 'done' ? `✅ Fait : ${t.text}${t.repeat ? ` (la prochaine est notée pour ${dayLabel(l[l.length - 1]!.due)})` : ''}`
    : action === 'undo' ? `↩️ Remise à faire : ${t.text}` : `📅 ${t.text} → ${dayLabel(t.due)}${t.time ? ` à ${t.time.replace(':', 'h')}` : ''}`;
  return { ok: true, message: msg, task: t };
}

// ── Outil du cerveau ─────────────────────────────────────────────────────────
export async function tachesTool(input: Record<string, unknown>): Promise<string> {
  const a = String(input['action'] ?? 'list');
  if (a === 'add') {
    const items = Array.isArray(input['items']) ? input['items'] as Array<Record<string, unknown>> : [input];
    const out: string[] = [];
    for (const it of items) {
      try {
        const r = await tacheAdd({ text: String(it['text'] ?? ''), due: it['due'], time: it['time'], cat: it['cat'] as string, who: it['who'] as string, repeat: it['repeat'] as string, lieu: (it['lieu'] as string) ?? undefined, source: input['source'] === 'appel' ? 'appel' : 'telegram' });
        out.push('dup' in r ? `déjà notée : ${r.dup.text} (${dayLabel(r.dup.due)})` : `${CAT[r.cat]} ${r.text} — ${dayLabel(r.due)}${r.time ? ` à ${r.time.replace(':', 'h')}` : ''}${r.repeat ? ` (chaque ${r.repeat})` : ''}${r.lieu === 'algerie' ? ' — 🇩🇿 sortira quand tu seras en Algérie' : r.lieu === 'belgique' ? ' — 🇧🇪 à ton retour' : ''}`);
      } catch (e) { out.push(`❌ ${(e as Error).message}`); }
    }
    return `📝 Noté dans tes tâches :\n${out.join('\n')}\nJe te le rappelle le jour même à 8h${out.some(o => / à \d/.test(o)) ? ' et à l\'heure dite' : ''} ; c'est aussi sur la page Aujourd'hui. (Confirme-lui en une phrase, sans liste d'options.)`;
  }
  if (a === 'decaler_retour') {
    const to = parseDue(input['due']); if (!to) return '❌ Pour quel jour ?';
    const l = await all(); const today = localNow().date; let k = 0;
    for (const t of l) if (!t.done && t.due && t.due >= today && t.due < to && t.lieu !== 'algerie') { t.due = to; t.reminded = null; k++; }
    await save(l); return `📅 ${k} tâche(s) décalée(s) au ${to.slice(8)}/${to.slice(5, 7)}.`;
  }
  if (a === 'check') {
    const { tickTripItem } = await import('./trips.js');
    const r = await tickTripItem(String(input['id'] ?? ''), String(input['text'] ?? 'tout'), input['undo'] !== true);
    return r.message;
  }
  if (['done', 'remove', 'tomorrow', 'move', 'undo', 'edit'].includes(a)) {
    let q = String(input['id'] ?? input['text'] ?? '');
    const n = Number(input['n']); if (n > 0) q = (await byNumber(n)) ?? q;
    if (a === 'tomorrow' && /^(tout|toutes|all)$/i.test(q.trim())) {
      const l = await all(); const now = localNow(); let k = 0;
      for (const t of l) if (!t.done && t.due && t.due <= now.date) { t.due = addDays(now.date, 1); t.reminded = null; t.moved = (t.moved ?? 0) + 1; k++; }
      await save(l); return k ? `📅 ${k} tâche(s) décalée(s) à demain.` : 'Rien à décaler.';
    }
    if (a === 'done' && /^(tout|toutes|all)$/i.test(q.trim())) {
      const l = await all(); const today = localNow().date; let k = 0;
      for (const t of l) if (!t.done && t.due && t.due <= today) { t.done = new Date().toISOString(); k++; }
      await save(l); return k ? `✅ ${k} tâche(s) du jour cochée(s).` : 'Rien à cocher aujourd\'hui.';
    }
    const r = await tacheAct(q, a as 'done', { due: input['due'], time: input['time'], text: input['new_text'] as string });
    return r.ok ? r.message : `❌ ${r.message} Voici la liste :\n${await listText()}`;
  }
  return listText();
}

async function listText(): Promise<string> {
  const r = await tachesList();
  const seq = [...r.late, ...r.today, ...r.upcoming, ...r.nodate];
  await kvPut(LAST, seq.map(t => t.id), 3 * 86_400_000 / 1000);
  if (!seq.length && !r.promises.length) return '📝 Aucune tâche en cours. (« lundi je dois appeler… » et je la note.)';
  let i = 0;
  const block = (title: string, l: TacheView[], lab = false) => l.length ? `${title}\n${l.map(t => `${line(t, ++i)}${lab ? ` — ${t.label}` : ''}`).join('\n')}` : '';
  const mv = r.moves.map(m => `${m.kind === 'arrivee' ? '🛬' : '🔑'} ${m.label} : ${m.client} (${m.car})${m.time ? ` ${m.time.replace(':', 'h')}` : ''}${m.missing.length ? ` — manque ${m.missing.map(x => x.toLowerCase()).join(', ')}` : ' ✅'}`);
  const tr = r.trips.map(t => `✈️ ${t.title} — ${t.inDays === 0 ? "aujourd'hui" : t.inDays === 1 ? 'demain' : `dans ${t.inDays} j`}${t.missing.length ? ` — il manque ${t.missing.length} point(s)` : ' ✅'}`);
  return [block('⚠️ En retard', r.late, true), block("📌 Aujourd'hui", r.today), block('📅 À venir', r.upcoming, true), block('🗂 Sans date', r.nodate),
    r.ailleurs.length ? `${r.here === 'algerie' ? '🇧🇪 Au retour' : '🇩🇿 En Algérie'}\n${r.ailleurs.map(t => line(t)).join('\n')}` : '',
    tr.length ? `✈️ Tes voyages\n${tr.join('\n')}` : '', mv.length ? `🚗 Clients (3 jours)\n${mv.join('\n')}` : '',
    r.promises.length ? `🤝 Promesses\n${r.promises.map(p => `• ${p.text}`).join('\n')}` : ''].filter(Boolean).join('\n\n') + '\n\nRéponds « tâche 2 faite » pour cocher.';
}

// ── Messages automatiques (toutes les 15 min, 6h-22h) ────────────────────────
export async function jobTaches(): Promise<string> {
  const now = localNow();
  const once = async (k: string, ttl = 86_400) => { const key = `perso:taches:sent:${k}`; if (await kvJson<string | null>(key, null)) return false; await kvPut(key, '1', ttl); return true; };
  const l = await all();
  const L = await import('./taches-lies.js');
  const here = await L.currentPlace();
  const open = l.filter(t => !t.done && (!t.lieu || t.lieu === here));
  const due = open.filter(t => t.due && t.due <= now.date);
  const dzToday = localNow(Date.now(), 'Africa/Algiers').date;
  const moves = await L.clientMoves(3).catch(() => [] as Awaited<ReturnType<typeof L.clientMoves>>);
  const trips = await L.myTrips(3).catch(() => [] as Awaited<ReturnType<typeof L.myTrips>>);
  const out: string[] = [];
  // 1. À l'heure dite (15 min avant) : boutons
  for (const t of open.filter(x => x.due === now.date && x.time && !x.reminded)) {
    const [h, m] = t.time!.split(':').map(Number); const [nh, nm] = now.hhmm.split(':').map(Number);
    if (h! * 60 + m! - (nh! * 60 + nm!) > 15) continue;
    t.reminded = new Date().toISOString();
    const { createDecision } = await import('./conscience.js');
    await createDecision(`⏰ ${CAT[t.cat]} ${t.text}${t.who ? ` (pour ${t.who})` : ''} — c'est maintenant (${t.time!.replace(':', 'h')}).`, [
      { label: '✅ Fait', tool: 'mes_taches', input: { action: 'done', id: t.id } },
      { label: '⏰ Dans 1 h', tool: 'mes_taches', input: { action: 'move', id: t.id, due: 'aujourd\'hui', time: localNow(Date.now() + 3600_000).hhmm } },
      { label: '📅 Demain', tool: 'mes_taches', input: { action: 'tomorrow', id: t.id } },
    ]).catch(() => tg(`⏰ ${t.text} — c'est maintenant.`));
    out.push(`heure:${t.id}`);
  }
  if (out.length) await save(l);
  const numbered = async (list: Tache[]) => { await kvPut(LAST, list.map(t => t.id), 3 * 86_400); return list.map((t, i) => `${line(t, i + 1)}${t.due && t.due < now.date ? ' ⚠️ en retard' : ''}${t.who ? ` (pour ${t.who})` : ''}`).join('\n'); };
  // Boutons « ✅ <tâche> » (Telegram) quand il y en a ≤ 3 ; sinon texte numéroté (« fait 1 » seul = Grand Coach, d'où « tâche 1 faite »)
  const sendList = async (head: string, list: Tache[], hint: string) => {
    if (!list.length) { await tg(head); return; }
    if (list.length <= 3) {
      const { createDecision } = await import('./conscience.js');
      const ok = await createDecision(head, [
        ...list.map(t => ({ label: `✅ ${t.text.slice(0, 40)}`, tool: 'mes_taches', input: { action: 'done', id: t.id } })),
        { label: '📅 Tout à demain', tool: 'mes_taches', input: { action: 'tomorrow', id: 'tout' } },
      ]).then(() => true).catch(() => false);
      if (ok) return;
    }
    await tg(`${head}\n\n${hint}`);
  };
  // 2. 8h : la liste du jour (+ en retard)
  const mvToday = L.movesLines(moves, dzToday);
  const tripLine = trips.filter(t => t.inDays <= 1).map(t => `✈️ ${t.title} ${t.inDays === 0 ? "aujourd'hui" : 'demain'} à ${t.time.replace(':', 'h')}${t.missing.length ? ` — check-list : il manque ${t.missing.slice(0, 5).map(x => x.toLowerCase()).join(', ')}` : ' — check-list ✅'}`);
  const extras = [...tripLine, ...(mvToday.length ? ['', '🚗 Clients aujourd\'hui :', ...mvToday] : [])].join('\n');
  if (now.hhmm >= '08:00' && now.hhmm < '11:00' && (due.length || extras) && await once(`matin:${now.date}`)) {
    const head = [due.length ? `📝 Aujourd'hui tu dois :\n${await numbered(due)}` : "📝 Pas de tâche perso aujourd'hui.", extras].filter(Boolean).join('\n\n');
    await sendList(head, due, 'Touche quand c\'est fait, ou réponds « tâche 1 faite » / « tâche 2 demain ».');
    out.push('matin');
  }
  // 3. 20h30 : ce qui reste
  const tomorrowMissing = L.movesLines(moves.filter(m => m.missing.length), addDays(dzToday, 1));
  if (now.hhmm >= '20:30' && now.hhmm < '22:00' && !due.length && tomorrowMissing.length && await once(`soir:${now.date}`)) {
    await tg(`🌙 Demain côté clients, il manque encore :\n${tomorrowMissing.join('\n')}\n\nDis « le contrat de X est signé » pour cocher, ou coche dans l'app (Aujourd'hui › À faire).`);
    out.push('soir-clients');
  }
  if (now.hhmm >= '20:30' && now.hhmm < '22:00' && due.length && await once(`soir:${now.date}`)) {
    const doneToday = l.filter(t => t.done?.slice(0, 10) === now.date).length;
    await sendList(`🌙 ${doneToday ? `${doneToday} tâche(s) faite(s) aujourd'hui 👏. ` : ''}Il reste :\n${await numbered(due)}${tomorrowMissing.length ? `\n\n🚗 Demain, il manque encore :\n${tomorrowMissing.join('\n')}` : ''}`, due, '« tâche 1 faite », « tâche 1 demain » ou « tâche 1 lundi ».');
    out.push('soir');
  }
  // 4. Dimanche 19h : la semaine qui vient
  if (now.weekday === 0 && now.hhmm >= '19:00' && now.hhmm < '21:00' && await once(`semaine:${now.date}`, 2 * 86_400)) {
    const week = open.filter(t => t.due && t.due > now.date && t.due <= addDays(now.date, 7));
    const wkMoves = await L.clientMoves(7).catch(() => []);
    const wkTrips = await L.myTrips(7).catch(() => []);
    const lines = [
      ...week.map(t => `• ${dayLabel(t.due, now)} : ${CAT[t.cat]} ${t.text}${t.time ? ` à ${t.time.replace(':', 'h')}` : ''}`),
      ...wkTrips.map(t => `• ${L.dayLabel(t.date)} : ✈️ ${t.title} à ${t.time.replace(':', 'h')}`),
      ...wkMoves.map(m => `• ${m.label} : ${m.kind === 'arrivee' ? '🛬' : '🔑'} ${m.client} (${m.car})${m.time ? ` ${m.time.replace(':', 'h')}` : ''}`),
    ];
    if (lines.length) { await tg(`🗓 Ta semaine :\n${lines.join('\n')}`); out.push('semaine'); }
  }
  // 9. 1 h avant une arrivée / un retour client (heure d'Oran) : ce qui manque encore
  const dzNow = localNow(Date.now(), 'Africa/Algiers');
  for (const m of moves.filter(x => x.date === dzToday && x.time && x.missing.length)) {
    const [h, mi] = m.time!.split(':').map(Number); const [nh, nm] = dzNow.hhmm.split(':').map(Number);
    const diff = h! * 60 + mi! - (nh! * 60 + nm!);
    if (diff > 0 && diff <= 75 && await once(`move1h:${m.id}`)) {
      await tg(`${m.kind === 'arrivee' ? '🛬' : '🔑'} Dans ${diff < 60 ? `${diff} min` : '1 h'} : ${m.kind === 'arrivee' ? 'arrivée' : 'retour'} de ${m.client} (${m.car}) à ${m.time!.replace(':', 'h')}. Il manque encore : ${m.missing.map(x => x.toLowerCase()).join(', ')}.`);
      out.push(`move1h:${m.id}`);
    }
  }
  // 6. Changement de pays (mode Oran GPS / voyage) : la liste « en Algérie » ou « au retour » sort une fois
  const before = await L.lastPlace();
  if (before !== here) {
    await kvPut('perso:taches:lieu', here);
    const list = l.filter(t => !t.done && t.lieu === here);
    if (before && list.length) {
      await sendList(here === 'algerie' ? `🇩🇿 Bienvenue ! Ce que tu voulais faire en Algérie :\n${await numbered(list)}` : `🇧🇪 Bon retour ! Ce que tu avais noté pour ton retour :\n${await numbered(list)}`, list, '« tâche 1 faite » quand c\'est fait.');
      out.push(`lieu:${here}`);
    }
    if (before === 'algerie' && here === 'belgique') {
      const left = l.filter(t => !t.done && t.lieu === 'algerie');
      if (left.length) await tg(`📌 ${left.length} tâche(s) d'Algérie pas faite(s) (${left.slice(0, 3).map(t => t.text.toLowerCase()).join(', ')}${left.length > 3 ? '…' : ''}) : je les garde pour ton prochain voyage.`);
    }
  }
  // 7. Jour de son départ en voyage : tâches datées pendant son absence → les décaler au retour ?
  const { readTrips } = await import('./trips.js');
  const myOut = (await readTrips()).find(t => t.who === 'kouider' && t.pauseFrom && t.pauseTo && t.pauseFrom >= now.date && t.pauseFrom <= addDays(now.date, 1));
  if (myOut && now.hhmm >= '09:00' && await once(`absence:${myOut.id}`, 10 * 86_400)) {
    const during = l.filter(t => !t.done && t.due && t.due >= myOut.pauseFrom! && t.due <= myOut.pauseTo! && t.lieu !== 'algerie');
    if (during.length) {
      const { createDecision } = await import('./conscience.js');
      await createDecision(`✈️ Pendant ton voyage (${myOut.pauseFrom!.slice(8)}/${myOut.pauseFrom!.slice(5, 7)} → ${myOut.pauseTo!.slice(8)}/${myOut.pauseTo!.slice(5, 7)}), tu avais noté :\n${during.map(t => `• ${dayLabel(t.due)} : ${t.text}`).join('\n')}`, [
        { label: `📅 Tout décaler au ${addDays(myOut.pauseTo!, 1).slice(8)}/${addDays(myOut.pauseTo!, 1).slice(5, 7)}`, tool: 'mes_taches', input: { action: 'decaler_retour', due: addDays(myOut.pauseTo!, 1) } },
        { label: '👍 Je les garde (faisables de là-bas)', say: 'ok je garde mes tâches pendant le voyage' },
      ]).catch(() => {});
      out.push('absence');
    }
  }
  // 8. J-2 de son vol : demandes (Houari, famille) pas encore prêtes
  for (const t of trips.filter(x => x.inDays === 2 && x.requests.length)) {
    if (await once(`demandes:${t.id}`, 4 * 86_400)) { await tg(`🎁 Dans 2 jours tu pars (${t.title}). On t'a demandé :\n${t.requests.map(r => `• ${r}`).join('\n')}\n\nDis « c'est acheté pour Houari » pour cocher.`); out.push('demandes'); }
  }
  // 5. Repoussée 3 fois ou plus : on propose de la caler vraiment (1×/semaine par tâche)
  for (const t of open.filter(x => (x.moved ?? 0) >= 3 && x.due === now.date)) {
    if (now.hhmm >= '12:00' && await once(`repousse:${t.id}`, 7 * 86_400)) {
      const { createDecision } = await import('./conscience.js');
      await createDecision(`🔁 « ${t.text} » a été repoussée ${t.moved} fois. On la règle comment ?`, [
        { label: '📌 Je la fais aujourd\'hui', tool: 'mes_taches', input: { action: 'move', id: t.id, due: 'aujourd\'hui', time: '18:00' } },
        { label: '📅 Samedi', tool: 'mes_taches', input: { action: 'move', id: t.id, due: 'samedi' } },
        { label: '🗑 Plus besoin', tool: 'mes_taches', input: { action: 'remove', id: t.id } },
      ]).catch(() => {});
      out.push(`repousse:${t.id}`);
    }
  }
  return out.join(',') || 'rien';
}

/** Ligne pour les contextes (dossier Kouider, Grand Coach) : tâches du jour. */
export async function tachesToday(): Promise<string[]> {
  const today = localNow().date;
  return (await all()).filter(t => !t.done && t.due && t.due <= today).map(t => `${t.text}${t.due! < today ? ' (en retard)' : ''}`);
}
