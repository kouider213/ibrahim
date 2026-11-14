/**
 * 13/11 — COACH DE SEMAINE + TRAVAIL (Kouider : « je dois pouvoir lui dire que j'ai raté cette semaine parce que la police a fermé
 * mon lieu de travail, que je refais ma douche, que je cours à droite à gauche, que je profite de la famille → il adapte la semaine
 * prochaine à partir de lundi, il me donne des conseils mentaux et physiques (coach de vie + coach sport) ; il sait où je travaille,
 * il voit l'article du journal sur la librairie fermée à Jette, il connaît mon ressenti sur ce travail, il me conseille et me motive »).
 *
 * Le CODE fait l'action (semaine prochaine replanifiée, reprise en douceur, histoire de la semaine gardée) et la recherche d'article ;
 * le cerveau ne fait que parler avec ces résultats posés à côté de la question (même méthode que health-advisor / world-facts).
 * Rien de santé ni de perso dans le dépôt public : tout est dans app_kv.
 */
import { kvGet, kvSet } from './app-store.js';
import { localNow } from './morning-routine.js';

const norm = (s: string) => s.replace(/^\s*\[[\s\S]*?\]\s*/, '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’`]/g, "'").replace(/\s+/g, ' ').trim();
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const wd = (d: string) => new Date(`${d}T12:00:00Z`).getUTCDay();
const mondayOf = (d: string) => addDays(d, -((wd(d) + 6) % 7));
const fmtD = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('fr-FR', { timeZone: 'UTC', weekday: 'long', day: 'numeric' });

// « adapte la semaine prochaine / mes séances à partir de lundi », « mauvaise semaine, je me suis pas beaucoup entraîné »
const ADAPT = /\b(adapt\w*|ajust\w*|refai\w*|reorganis\w*|organis\w*|prepar\w*|planifi\w*|recal\w*|change\w*)\b[^.!?]{0,70}\b(semaine prochaine|prochaines? seances?|seances? (de|du) (la semaine prochaine|lundi)|a partir de lundi|des lundi)\b|\b(semaine prochaine|a partir de lundi|des lundi)\b[^.!?]{0,50}\b(adapt\w*|ajust\w*|seances?|sport|programme|entrainements?)\b/;
const BAD = /\b(mauvaise|sale|grosse|dure|pourrie|compliquee|difficile|nulle) semaine\b|\bsemaine (de merde|pourrie|difficile|compliquee|ratee|nulle|chargee)\b|\bpas (beaucoup|trop|assez|bcp|vraiment) (ete |)(m'?|me )?entrain\w*|\b(rate|loupe|manque|saute)\w* (mes |des |plusieurs |pas mal de |beaucoup de |toutes mes )?(seances?|entrainements?|jours de sport)\b|\bpas pu (aller a la salle|m'?entrain\w*|faire (mon|du) sport)\b/;
const SPORTY = /\b(sport|seances?|salle|entrain\w*|muscu|programme)\b/;

export function isWeekTalk(msg: string): boolean {
  const t = norm(msg);
  if (t.length < 15 || t.length > 1500) return false;
  return ADAPT.test(t) || (BAD.test(t) && (SPORTY.test(t) || /\b(semaine)\b/.test(t)));
}

// Travail : la librairie de Jette (adresse dans la routine du matin), fermée par la police la semaine du 11/11
const WORK_WORDS = /\b(librairie|mon travail|mon boulot|mon taf|lieux? de travail|au travail|le travail|le boulot|magasin|mon patron|mes collegues?)\b/;
const WORK_NEWS = /\b(ferm\w*|police|article|journal|presse|news|actu\w*|descente|perquisition|scelle\w*|enquete|rouvr\w*)\b/;
const WORK_FEEL = /\b(je m[ey]? sens (mal|pas bien|pas a l'?aise|nul)|mal a l'?aise|j'?aime pas|j'?aime plus|deteste|marre|ras le bol|stress\w*|angoiss\w*|deprim\w*|j'?en peux plus|envie de partir|pas ma place|degout\w*|me pese|lourd)\b/;
const FEEL_KEY = 'kouider:work:feelings';

export function isWorkTalk(msg: string): boolean {
  const t = norm(msg);
  return t.length >= 12 && t.length <= 1500 && WORK_WORDS.test(t) && (WORK_NEWS.test(t) || WORK_FEEL.test(t));
}

async function workFeelings(): Promise<string[]> {
  try { return JSON.parse((await kvGet(FEEL_KEY)) ?? '[]') as string[]; } catch { return []; }
}
/** Ce qu'il dit ressentir sur son travail : gardé (daté) pour que Dzaryx s'en souvienne les fois suivantes. */
async function noteWorkFeeling(msg: string): Promise<void> {
  const t = norm(msg);
  if (!(WORK_WORDS.test(t) && WORK_FEEL.test(t))) return;
  const all = await workFeelings();
  all.push(`${localNow().date} : « ${msg.replace(/^\s*\[[\s\S]*?\]\s*/, '').replace(/\s+/g, ' ').slice(0, 260)} »`);
  await kvSet(FEEL_KEY, JSON.stringify(all.slice(-8)), 365 * 86_400);
}

/** Jours sans travail enregistrés (no_work) cette semaine et la raison — la fermeture de la librairie. */
async function workOffDays(from: string, to: string): Promise<string[]> {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const v = await kvGet(`kouider:dayoff:${d}`).catch(() => null);
    if (v) out.push(`${fmtD(d)} (${v})`);
  }
  return out;
}

/** L'action (faite par le code) : histoire de la semaine gardée, reprise en douceur si la semaine a été coupée, semaine prochaine replanifiée. */
async function adaptNextWeek(msg: string): Promise<{ text: string; done: number; planned: number }> {
  const today = localNow().date;
  const from = mondayOf(today);
  const nextMon = wd(today) === 1 && localNow().hhmm < '12:00' ? today : addDays(from, 7);
  const sport = await import('./sport-coach.js');
  const att = await sport.weekAttendance(from, addDays(from, 6));
  const done = att.done.filter(d => d <= today).length;
  // histoire de la semaine (raisons données par Kouider), gardée 3 semaines pour les bilans et le coach
  const key = `kouider:week:story:${from}`;
  const prev = (await kvGet(key).catch(() => null)) ?? '';
  await kvSet(key, `${prev ? `${prev}\n` : ''}${today} : ${msg.replace(/^\s*\[[\s\S]*?\]\s*/, '').replace(/\s+/g, ' ').slice(0, 700)}`.slice(-2500), 21 * 86_400);
  const lines: string[] = [];
  lines.push(`Cette semaine (depuis lundi ${from.slice(8)}/${from.slice(5, 7)}) : ${done} séance${done > 1 ? 's' : ''} faite${done > 1 ? 's' : ''}${att.done.length ? ` (${att.done.map(fmtD).join(', ')})` : ''}${att.skipped.length ? ` · annulées : ${att.skipped.map(([d, r]) => `${fmtD(d)}${r ? ` (${r})` : ''}`).join(', ')}` : ''}${att.missed.length ? ` · ratées : ${att.missed.map(fmtD).join(', ')}` : ''}.`);
  // 14/11 : « annulée mercredi, déplacée au jeudi » + jeudi compté « jour de repos » → le cerveau se contredisait
  if (att.skipped.length || att.missed.length) lines.push('(Une séance annulée, déplacée ou ratée qui n\'est PAS dans les séances faites n\'a PAS été faite ni rattrapée. Ne compte JAMAIS le jour où elle avait été déplacée comme « jour de repos » : dis simplement qu\'elle n\'a pas eu lieu.)');
  // Semaine coupée (0-1 séance) → les 3 premiers jours en reprise allégée : moins de séries, charges −10 %, pas de blessure au retour
  if (done <= 1) {
    const ok = await sport.setReprise(nextMon, addDays(nextMon, 2), 'reprise après une semaine coupée').catch(() => false);
    lines.push(ok ? `🪶 Reprise en douceur du ${fmtD(nextMon)} au ${fmtD(addDays(nextMon, 2))} : mêmes exercices, ~40 % de séries en moins, charges −10 %. Ensuite on repart à fond.`
      : '🪶 Une semaine allégée était déjà prévue : je la garde.');
  }
  const plan = await sport.planSportWeek(true).catch(() => null);
  const nextSlots = (plan?.slots ?? []).filter(s => s.date >= nextMon).sort((a, b) => a.date.localeCompare(b.date));
  const ov = await sport.sportOverview().catch(() => null) as { sessions?: Record<string, { label: string; emoji: string }> } | null;
  if (!plan) lines.push('⚠️ L\'agenda FIK ne répond pas : la semaine prochaine n\'a pas pu être replanifiée.');
  else if (nextSlots.length) lines.push(`🗓️ Semaine prochaine (agenda FIK mis à jour) :\n${nextSlots.map(s => `- ${fmtD(s.date)} ${new Date(s.start).toLocaleTimeString('fr-FR', { timeZone: 'Europe/Brussels', hour: '2-digit', minute: '2-digit' })} : ${ov?.sessions?.[s.type] ? `${ov.sessions[s.type]!.emoji} ${ov.sessions[s.type]!.label}` : s.type}${s.minutes < 60 ? ` (${s.minutes} min)` : ''}`).join('\n')}`);
  else lines.push(`🗓️ Séances de la semaine prochaine : ${plan.slots.length ? 'pas encore dans la fenêtre de 7 jours, elles seront calées dimanche soir' : 'aucun créneau sport dans l\'agenda'}.`);
  return { text: lines.join('\n'), done, planned: att.done.length + att.missed.length + att.skipped.length };
}

/** Consigne (+ action faite) à poser à côté du message — '' si le message ne parle ni de sa semaine ni de son travail. */
export async function weekCoachHint(msg: string, o: { sandbox?: boolean } = {}): Promise<{ hint: string; acted: boolean }> {
  const week = isWeekTalk(msg), work = isWorkTalk(msg);
  if (!week && !work) return { hint: '', acted: false };
  const today = localNow().date;
  const from = mondayOf(today);
  if (!o.sandbox) await noteWorkFeeling(msg).catch(() => {});
  const parts: string[] = [];
  const [feel, off] = await Promise.all([workFeelings().catch(() => []), workOffDays(from, addDays(from, 6)).catch(() => [])]);
  const lifeCtx = [
    off.length ? `JOURS SANS TRAVAIL cette semaine (enregistrés) : ${off.join(' · ')}.` : '',
    feel.length ? `CE QU'IL A DÉJÀ DIT RESSENTIR SUR SON TRAVAIL (la librairie de Jette) :\n${feel.join('\n')}` : '',
  ].filter(Boolean).join('\n');

  let acted = false;
  if (week) {
    const r = o.sandbox ? { text: '(banc : semaine non replanifiée)', done: 0, planned: 0 } : await adaptNextWeek(msg).catch(e => ({ text: `❌ Semaine prochaine pas replanifiée : ${e instanceof Error ? e.message : e}`, done: 0, planned: 0 }));
    acted = !/^❌/.test(r.text) && !o.sandbox;
    parts.push(`DÉJÀ FAIT PAR LE CODE pour ce message (n'appelle PAS sport_coach / forme pour replanifier la semaine, c'est fait) :\n${r.text}`,
      `Tu es à la fois son COACH DE VIE et son COACH SPORT. Réponds dans cet ordre, en tutoyant, chaleureux et direct, format Telegram (**gras**, puces « • », pas de ###) :
1. **Ta semaine** : réponds honnêtement à sa question (« est-ce une mauvaise semaine ? ») avec SES vrais chiffres ci-dessus et SES raisons à lui (travail fermé, douche à refaire, courses, famille…). Une semaine où il a géré le travail, la maison et sa famille n'est PAS un échec : dis-le avec des faits, sans le flatter. Le corps ne perd rien en 1 semaine (muscle intact, la force revient en 2-3 séances).
2. **Dans la tête** : 2-3 conseils mentaux concrets pour CE qu'il vit (stress du travail, tout gérer en même temps, culpabilité de ne pas s'entraîner) — ex. règle des 2 jours (ne jamais rater 2 jours de suite), séance minimum de 30 min les jours chargés, une chose à la fois pour la douche.
3. **Dans le corps** : 2-3 conseils physiques pour cette période (porter / bricoler la douche = attention au dos : genoux pliés, charge contre soi ; marcher compte ; protéines et sommeil gardés même sans salle ; pas de rattrapage en doublant les séances).
4. **Ta semaine prochaine** : recopie le plan ci-dessus (jours, heures, séances, reprise en douceur s'il y en a une) et dis en une phrase POURQUOI il est fait comme ça.
5. Une phrase finale qui le relie à son pourquoi : sa femme ET Ibrahim (toujours les deux), son objectif physique.
Jamais : « tu aurais dû », dramatiser, lui dire de quitter son travail sur un coup de tête.`);
  }
  if (work) {
    // L'article : recherche faite par le code (adresse du travail dans la routine du matin). Requêtes publiques sans nom de Kouider.
    const { multiProviderWebSearch } = await import('./web-search-provider.js');
    const qs = ['librairie Jette fermée police', 'Jette place Philippe Werrie librairie fermeture police'];
    const rs = await Promise.all(qs.map(q => Promise.race([
      multiProviderWebSearch(`${q} novembre ${today.slice(0, 4)}`, 'coach-week').catch(() => null),
      new Promise<null>(res => setTimeout(() => res(null), 9000)),
    ])));
    const found = rs.filter(r => r && r.results_count > 0 && !/^NO_DATA/.test(r.text)).map(r => r!.text.slice(0, 1800));
    parts.push(`SON TRAVAIL : la librairie de Jette (place Philippe Werrie) où il est salarié, fermée par la police la semaine du 11/11 ; il dit reprendre le travail le 14/11. ${lifeCtx}`,
      found.length
        ? `ARTICLES TROUVÉS SUR INTERNET (recherche faite par le code — ne garde QUE ce qui parle vraiment d'une librairie à Jette fermée par la police ; cite le média, la date et le lien ; n'invente rien de plus que ce qui est écrit) :\n${found.join('\n---\n')}`
        : `ARTICLES : la recherche n'a rien trouvé de sûr sur la fermeture. S'il demande l'article, dis-le honnêtement (tu peux relancer web_search une fois avec d'autres mots) et ne raconte rien d'inventé sur les raisons de la fermeture.`,
      `Comment répondre sur le travail : s'il en parle ou demande l'article → résume ce que dit l'article (faits seulement, source), puis relie-le à CE QU'IL RESSENT (ci-dessus) : il s'y sent mal. Conseille-le comme un grand frère sage : ce qui dépend de lui / ce qui n'en dépend pas, comment se protéger (ne pas se mêler de ce qui ne le regarde pas, garder ses preuves de paie et d'heures, connaître ses droits de salarié si la fermeture dure — chômage temporaire en Belgique), et comment utiliser ce moment pour avancer sur SES projets (FIK, plan Algérie) sans tout lâcher d'un coup. Motive-le avec du concret. Jamais d'accusation contre son patron ou quelqu'un de précis au-delà de ce que dit la source ; ne suppose RIEN sur un rôle de Kouider (il est salarié). S'il s'inquiète pour lui ou son salaire : conseil concret = garder fiches de paie / contrat / heures, se renseigner auprès d'un syndicat ou d'un avocat (aide juridique gratuite possible), ne parler de l'affaire à personne au travail.`);
  }
  if (!week && lifeCtx && !work) parts.push(lifeCtx);
  return { hint: parts.join('\n\n'), acted };
}
