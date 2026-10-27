/**
 * MÉMOIRE DES GENS (27/10/2026) — une fiche par personne que Kouider connaît (client, partenaire, garagiste, famille, ami) :
 * qui c'est, comment il la connaît, enfants / proches, ce qu'ils se sont dit, ce qu'il a promis, dates importantes.
 * Avant de la voir (RDV de l'agenda qui la cite), Dzaryx lui envoie la fiche sur Telegram : « tu vois Karim à 15h :
 * son fils s'appelle Yanis, tu lui as promis la Clio à 27 € ». app_kv `people`.
 */
import { kvJson, kvPut, tg, ai, jsonOf, uid } from './ai-util.js';
import { localNow } from './morning-routine.js';

interface Person { id: string; name: string; aka: string[]; who: string; notes: Array<{ at: string; text: string }>; promises: Array<{ at: string; text: string; done?: boolean }>; dates: Array<{ label: string; date: string }>; phone?: string; updated: string }
const KEY = 'people';
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

const all = () => kvJson<Person[]>(KEY, []);
const find = (list: Person[], q: string) => { const n = norm(q); return list.find(p => norm(p.name) === n || p.aka.some(a => norm(a) === n)) ?? list.find(p => norm(p.name).includes(n) || n.includes(norm(p.name))); };

function card(p: Person): string {
  const open = p.promises.filter(x => !x.done);
  return `👤 ${p.name}${p.aka.length ? ` (${p.aka.join(', ')})` : ''}${p.phone ? ` — ${p.phone}` : ''}\n${p.who}`
    + (p.dates.length ? `\n📅 ${p.dates.map(d => `${d.label} : ${d.date}`).join(' · ')}` : '')
    + (open.length ? `\n🤝 Tu lui as promis : ${open.map(x => x.text).join(' ; ')}` : '')
    + (p.notes.length ? `\n📝 ${p.notes.slice(-6).map(n => `${n.at.slice(0, 10)} — ${n.text}`).join('\n📝 ')}` : '');
}

export async function peopleTool(input: Record<string, unknown>): Promise<string> {
  const action = String(input['action'] ?? 'get');
  const list = await all();
  const name = String(input['name'] ?? '').trim();
  if (action === 'list') return list.length ? list.map(p => `• ${p.name} — ${p.who.slice(0, 80)}`).join('\n') : 'Aucune fiche pour le moment.';
  if (!name) return '❌ De qui parles-tu ? (name)';
  let p = find(list, name);
  if (action === 'get') return p ? card(p) : `Je n'ai pas encore de fiche sur ${name}. Dis-moi qui c'est et je la crée (action remember).`;
  if (action === 'forget') { if (!p) return 'Pas de fiche.'; await kvPut(KEY, list.filter(x => x !== p)); return `🗑️ Fiche de ${p.name} supprimée.`; }
  if (action === 'promise_done') {
    if (!p) return 'Pas de fiche.';
    const q = norm(String(input['text'] ?? ''));
    p.promises.forEach(x => { if (!q || norm(x.text).includes(q)) x.done = true; });
    await kvPut(KEY, list); return `✅ Promesse(s) à ${p.name} cochée(s).`;
  }
  // remember : Kouider raconte quelque chose → on range (qui c'est, note, promesse, date) — Haiku trie
  const said = String(input['text'] ?? '').trim();
  if (!said) return '❌ Que dois-je retenir sur cette personne ? (text)';
  const o = jsonOf<{ who?: string; note?: string; promise?: string; dates?: Array<{ label: string; date: string }>; aka?: string[]; phone?: string }>(await ai(
    `Kouider (FIK Conciergerie) me dit à propos de « ${name} » : « ${said} ».\nRange l'info. Réponds UNIQUEMENT :\n{"who":"qui c'est en une phrase si dit, sinon vide","note":"le fait à retenir qui n'est ni le « who » ni la promesse (vide si rien)","promise":"ce que Kouider a promis à cette personne, sinon vide","dates":[{"label":"anniversaire / mariage / naissance…","date":"JJ/MM ou AAAA-MM-JJ"}],"aka":["autres noms / surnoms"],"phone":"numéro si dit"}`, { max: 500 })) ?? {};
  const now = new Date().toISOString();
  if (!p) { p = { id: uid(), name, aka: [], who: '', notes: [], promises: [], dates: [], updated: now }; list.push(p); }
  if (o.who) p.who = o.who;
  if (o.note) p.notes.push({ at: now, text: o.note });
  if (o.promise) p.promises.push({ at: now, text: o.promise });
  // Seulement de vraies dates (JJ/MM ou AAAA-MM-JJ) d'événements personnels : pas « 11 » pour « en novembre »
  for (const d of o.dates ?? []) if (/^(\d{1,2}\/\d{1,2}(\/\d{2,4})?|\d{4}-\d{2}-\d{2})$/.test(String(d.date).trim()) && /anniv|mariage|naiss|f[êe]te|d[ée]c[èe]s/i.test(d.label) && !p.dates.some(x => x.label === d.label)) p.dates.push(d);
  for (const a of o.aka ?? []) if (a && norm(a) !== norm(p.name) && !p.aka.includes(a)) p.aka.push(a);
  if (o.phone) p.phone = o.phone;
  p.updated = now; p.notes = p.notes.slice(-40);
  await kvPut(KEY, list.slice(-400));
  return `✅ Retenu sur ${p.name}.\n${card(p)}`;
}

/** Contexte pour Dzaryx : fiches des personnes citées dans le message (au plus 2). */
export async function peopleContext(text: string): Promise<string> {
  const list = await all();
  if (!list.length) return '';
  const n = ` ${norm(text)} `;
  const hits = list.filter(p => [p.name, ...p.aka].some(a => norm(a).length >= 3 && n.includes(` ${norm(a)} `))).slice(0, 2);
  return hits.length ? `[MÉMOIRE DES GENS — fiches des personnes citées]\n${hits.map(card).join('\n\n')}` : '';
}

/** Toutes les 15 min (8h-21h) : un RDV de l'agenda dans ~45 min cite quelqu'un qu'on connaît → sa fiche sur Telegram. */
export async function jobPeopleBrief(): Promise<string> {
  const list = await all();
  if (!list.length) return 'aucune fiche';
  const { listAgendaRange } = await import('./google-calendar.js');
  const now = Date.now();
  const evs = ((await listAgendaRange(new Date(now + 30 * 60_000).toISOString(), new Date(now + 60 * 60_000).toISOString()).catch(() => null)) ?? []) as Array<{ id?: string; summary?: string; description?: string; start?: { dateTime?: string } }>;
  const sent = await kvJson<string[]>('people:briefed', []);
  let n = 0;
  for (const e of evs) {
    const id = `${e.id}:${localNow().date}`;
    if (sent.includes(id)) continue;
    const t = ` ${norm(`${e.summary ?? ''} ${e.description ?? ''}`)} `;
    const hits = list.filter(p => [p.name, ...p.aka].some(a => norm(a).length >= 3 && t.includes(` ${norm(a)} `)));
    if (!hits.length) continue;
    sent.push(id); n++;
    await tg(`🧠 Dans moins d'une heure : « ${e.summary} ». Ce que je sais :\n\n${hits.map(card).join('\n\n')}`);
  }
  await kvPut('people:briefed', sent.slice(-100), 3 * 86_400);
  // Dates du jour (anniversaires…)
  const { date } = localNow();
  const dm = `${date.slice(8, 10)}/${date.slice(5, 7)}`;
  if (!sent.includes(`dates:${date}`) && localNow().hhmm >= '08:00') {
    const today = list.flatMap(p => p.dates.filter(d => d.date.includes(dm) || d.date.endsWith(date.slice(5))).map(d => `${p.name} — ${d.label}`));
    sent.push(`dates:${date}`); await kvPut('people:briefed', sent.slice(-100), 3 * 86_400);
    if (today.length) await tg(`🎂 Aujourd'hui : ${today.join(' ; ')}. Un petit message ?`);
  }
  return `${n} fiche(s) envoyée(s)`;
}
