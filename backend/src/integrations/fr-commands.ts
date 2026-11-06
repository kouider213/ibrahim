// PHRASES DU QUOTIDIEN exécutées par le CODE (05/11/2026, banc « comme Kouider ») — le cerveau gratuit prenait le mauvais
// outil ou disait « c'est noté » sans rien faire :
//  « rappelle-moi le 1er décembre de payer l'assurance » → create_intention (ne sonne jamais) + « Rappel noté ! »
//  « mets un rdv chez le dentiste mardi prochain à 15h » → rappel_lieu puis « Service indisponible »
//  « rdv le 3 janvier à 10h avec le notaire » → « je l'ajoute ? » (heure d'Oran) et rien
//  « ne me dérange pas jusqu'à 18h » → MODE VACANCES activé
//  « j'ai dormi 5h » → rien noté
//  « une idée de soirée avec ma femme samedi ? » → restaurants inventés à Oran + vin
// Dates en heure de Bruxelles (Kouider y vit). Une phrase floue (pas de date/heure claire) part au cerveau.
import { localNow } from './morning-routine.js';
import { MED_ALT } from '../config/private-terms.js';

const MONTHS: Record<string, number> = { janvier: 1, janv: 1, fevrier: 2, fevr: 2, fev: 2, mars: 3, avril: 4, avr: 4, mai: 5, juin: 6, juillet: 7, juil: 7, aout: 8, septembre: 9, sept: 9, octobre: 10, oct: 10, novembre: 11, nov: 11, decembre: 12, dec: 12 };
const WDAYS: Record<string, number> = { dimanche: 0, lundi: 1, mardi: 2, mercredi: 3, jeudi: 4, vendredi: 5, samedi: 6 };
/** 06/11 (Kouider : « même les fautes d'orthographe il doit les comprendre comme toi ») : écriture SMS / phonétique → forme normale,
 *  appliquée AVANT toutes les commandes du code (rappels, eau, séance, météo, silence…). Seulement des mots sans autre sens possible. */
const SMS: Array<[RegExp, string]> = [
  [/\b(?:kel|kelle|qel|quelle?s?)\b/g, 'quel'], [/\b(?:koi|quoa|kwa)\b/g, 'quoi'], [/\bki\b/g, 'qui'], [/\b(?:cmb|cbn|combi1|conbien|combie)\b/g, 'combien'],
  [/\b(?:ds|dan)(?=\s+(?:\d|une?\b|deux|trois|quatre|cinq|dix|quinze|vingt|trente|la\b|le\b|l'))/g, 'dans'],
  [/\b(?:jsui|jsuis|chui|chuis|jss|jsu|j suis|je sui|jui)\b/g, 'je suis'], [/^(?:g|jai|j ai|jé|je)\s+(?=(?:bu|pris|pri|mang|fait|fini|termin|eu|rat|oubli|envie|mal|besoin)\w*)/, "j'ai "],
  [/\bjai\b/g, "j'ai"], [/\b(?:ojd|auj|aujourdhui|aujourdui|aujordhui|ajd|aujaurdhui|aujourd hui)\b/g, "aujourd'hui"],
  [/\b(?:mtn|maintenan|mintenant)\b/g, 'maintenant'], [/\b(?:demin|demai|dmain|deman|demian|2main)\b/g, 'demain'], [/\b(?:stp|stpl|svp|sil te plait)\b/g, "s'il te plait"],
  [/\bpr\b/g, 'pour'], [/\b(?:vai|vé|ve)\b(?=\s+(?:pas|aller|faire|dormir|a\b|au\b))/g, 'vais'], [/\bannul\b/g, 'annule'], [/\bbcp\b/g, 'beaucoup'], [/\b(?:tkt|tqt)\b/g, "t'inquiete"], [/\bseanse|seence|scéance|sceance\b/g, 'seance'],
  [/\b(?:a la|à la) sale\b/g, 'a la salle'], [/\b(?:temp|tant|tems)\b(?=\s+(?:il fait|qu'il fait|a|à|pour|demain))/g, 'temps'], [/\b(?:rapel|rappel|rapelle|rapell)\s*(?:moi|moa)\b/g, 'rappelle-moi'],
  [/\bd'?o\b(?=\s*$)/g, "d'eau"], [/\b(?:deau)\b/g, "d'eau"], [/\bfatiguer?\b|\bfatigé\b/g, 'fatigue'],
];
const sms = (s: string) => { let t = s; for (const [re, to] of SMS) t = t.replace(re, to); return t; };
const stripBase = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’`]/g, "'");
const strip = (s: string) => sms(s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’`]/g, "'").replace(/\s+/g, ' ').trim());
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const wdOf = (d: string) => new Date(Date.parse(`${d}T12:00:00Z`)).getUTCDay();
const pad = (n: number) => String(n).padStart(2, '0');
const WD_FR = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MO_FR = ['', 'janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
export const frDate = (d: string) => `${WD_FR[wdOf(d)]} ${Number(d.slice(8))}${d.slice(8) === '01' ? 'er' : ''} ${MO_FR[Number(d.slice(5, 7))]}${d.slice(0, 4) !== localNow().date.slice(0, 4) ? ` ${d.slice(0, 4)}` : ''}`;

export interface When { date?: string; time?: string; inMinutes?: number; used: string[] }

/** 06/11 banc fautes : « rapelle moi dan 2h » → rappel DEMAIN à 02:00. Fautes de quand courantes → forme correcte (accents gardés). */
export const fixWhenTypos = (s: string) => s.replace(/\bds\b(?=\s+(?:\d|une?\b))/gi, 'dans').replace(/\bdan(?=\s+(?:\d|une?\b|deux|trois|quatre|cinq|dix|quinze|vingt|trente))/gi, 'dans').replace(/\b(?:demin|demai|dmain|deman|demian|demmain)\b/gi, 'demain')
  .replace(/\b(?:aujourdhui|aujourdui|aujordhui|ojourdhui|auj)\b/gi, "aujourd'hui").replace(/\bapr[eè]s[- ]?dem\w*\b/gi, 'après-demain');
/** Quand ? dans une phrase française. date = YYYY-MM-DD (Bruxelles), time = HH:MM. */
export function parseWhen(raw: string, now = localNow()): When {
  const t = ` ${strip(fixWhenTypos(raw))} `;
  const used: string[] = [];
  const w: When = { used };
  const take = (re: RegExp) => { const m = re.exec(t); if (m) used.push(m[0].trim()); return m; };
  let m: RegExpExecArray | null;
  if ((m = take(/\bdans\s+(\d+|une?|deux|trois|quatre|cinq|dix|quinze|vingt|trente)\s*(min(?:ute)?s?|mn|h(?:eures?)?|jours?|semaines?)\b/))) {
    const nums: Record<string, number> = { un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, dix: 10, quinze: 15, vingt: 20, trente: 30 };
    const n = Number(m[1]) || nums[m[1]!] || 1;
    const u = m[2]!;
    if (/^m/.test(u)) w.inMinutes = n; else if (/^h/.test(u)) w.inMinutes = n * 60;
    else w.date = addDays(now.date, /^s/.test(u) ? n * 7 : n);
  }
  if (!w.date && take(/\bapres[- ]demain\b/)) w.date = addDays(now.date, 2);
  else if (!w.date && take(/\bdemain\b/)) w.date = addDays(now.date, 1);
  else if (!w.date && take(/\b(aujourd'hui|ce soir|ce matin|cet apres-midi|cet aprem|tout a l'heure)\b/)) w.date = now.date;
  if (!w.date && (m = take(/\b(?:le\s+)?(1er|\d{1,2})\s+(janv(?:ier)?|fevr?(?:ier)?|mars|avr(?:il)?|mai|juin|juil(?:let)?|aout|sept(?:embre)?|oct(?:obre)?|nov(?:embre)?|dec(?:embre)?)\.?(?:\s+(20\d\d))?\b/))) {
    const d = m[1] === '1er' ? 1 : Number(m[1]), mo = MONTHS[m[2]!.replace(/\.$/, '')] ?? MONTHS[m[2]!.slice(0, 4)] ?? 0;
    if (mo && d >= 1 && d <= 31) {
      let y = m[3] ? Number(m[3]) : Number(now.date.slice(0, 4));
      let ds = `${y}-${pad(mo)}-${pad(d)}`;
      if (!m[3] && ds < now.date) { y++; ds = `${y}-${pad(mo)}-${pad(d)}`; }
      w.date = ds;
    }
  }
  if (!w.date && (m = take(/\b(?:le\s+)?(\d{1,2})[/.](\d{1,2})(?:[/.](\d{2,4}))?\b/))) {
    const d = Number(m[1]), mo = Number(m[2]);
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      let y = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : Number(now.date.slice(0, 4));
      let ds = `${y}-${pad(mo)}-${pad(d)}`;
      if (!m[3] && ds < now.date) { y++; ds = `${y}-${pad(mo)}-${pad(d)}`; }
      w.date = ds;
    }
  }
  if (!w.date && (m = take(/\b(dimanche|lundi|mardi|mercredi|jeudi|vendredi|samedi)(\s+prochain|\s+qui vient)?\b/))) {
    const target = WDAYS[m[1]!]!;
    let diff = (target - now.weekday + 7) % 7;
    if (diff === 0) diff = 7;
    w.date = addDays(now.date, diff);
  }
  if (!w.date && (m = take(/\ble\s+(1er|\d{1,2})\b(?!\s*(?:h|:|min|€|euros?|jours?|kg|km|demis?|\/))/))) {
    const d = m[1] === '1er' ? 1 : Number(m[1]);
    if (d >= 1 && d <= 31) {
      let [y, mo] = [Number(now.date.slice(0, 4)), Number(now.date.slice(5, 7))];
      let ds = `${y}-${pad(mo)}-${pad(d)}`;
      if (ds < now.date) { mo++; if (mo > 12) { mo = 1; y++; } ds = `${y}-${pad(mo)}-${pad(d)}`; }
      w.date = ds;
    }
  }
  // Heure : « à 15h », « 15h30 », « 9:05 », « midi », « minuit »
  if ((m = take(/\b(?:a|vers|pour)?\s*(\d{1,2})\s*(?:h|:)\s*(\d{2})?\b(?!\s*(?:de sommeil|d'affil))/))) {
    const h = Number(m[1]), mi = Number(m[2] ?? 0);
    if (h <= 23 && mi <= 59) w.time = `${pad(h)}:${pad(mi)}`;
  } else if (take(/\bmidi\b/)) w.time = '12:00';
  else if (take(/\bminuit\b/)) w.time = '00:00';
  if (!w.time && /\bce soir\b/.test(t)) w.time = '20:00';
  if (!w.time && /\bce matin\b/.test(t)) w.time = '09:00';
  // « ce soir à 8h » = 20:00
  if (w.time && /\bce soir\b|\bsoir\b/.test(t) && Number(w.time.slice(0, 2)) < 12) w.time = `${pad(Number(w.time.slice(0, 2)) + 12)}:${w.time.slice(3)}`;
  return w;
}

type Direct = { text: string; direct: boolean };
let SID = 'telegram_kouider';

/** « rappelle-moi … » avec une date/heure claire → schedule_reminder. */
async function reminder(raw: string): Promise<Direct | null> {
  raw = fixWhenTypos(raw);
  const t = stripBase(raw);   // pas de correcteur SMS ici : on coupe « rappelle-moi » dans le texte brut à la même longueur
  const head = /^(?:stp\s+|s'il te plait\s+)?(rappelle[- ]?moi|r+app?ell?e?s?[- ]?moi|rapp?el(?:le)?\s*(?::|de|d')|(?:mets?|met|fais|fait|programme|cree|ajoute)[- ]?(?:moi\s+)?un\s+r+app?ell?e?(?:\s+(?:pour|a|de))?|fais[- ]moi penser|pense a me rappeler|n'oublie pas de me rappeler|tu me rappelles?)\b/.exec(t);
  if (!head || raw.length > 220 || /\?$/.test(raw.trim())) return null;
  const w = parseWhen(raw);
  if (!w.date && !w.time && !w.inMinutes) return null;
  // Ce qu'il faut rappeler : la phrase sans « rappelle-moi » ni la date/heure
  let what = raw.slice(head[0].length);
  for (const u of w.used) what = what.replace(new RegExp(u.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[ae]/g, '[aàâeéèê]'), 'i'), ' ');
  what = what.replace(/\b(à|a|le|pour|vers)\s*$/i, '').replace(/^\s*(de|d'|d’|qu'|que|à|a|pour|le|la)\s+/i, '').replace(/\s+/g, ' ').trim().replace(/^(de|d'|d’)\s*/i, '')
    .replace(/^d['’]?app?ell?(?:e|é|er|é)(?![\p{L}])/iu, 'appeler');   // « dapelé le garagiste » → « appeler le garagiste »
  if (what.length < 3) return null;
  const { executeTool } = await import('./tool-executor.js');
  const input: Record<string, unknown> = { message: what.charAt(0).toUpperCase() + what.slice(1), timezone: 'Europe/Brussels' };
  if (w.inMinutes) input['delay_minutes'] = w.inMinutes;
  else { if (w.date) input['at_date'] = w.date; input['at_time'] = w.time ?? '09:00'; }
  const r = await executeTool('schedule_reminder', input, SID);
  let j: Record<string, unknown> = {};
  try { j = JSON.parse(r); } catch { /* texte */ }
  if (j['error'] || /❌/.test(r)) return { text: `❌ Rappel pas programmé : ${String(j['error'] ?? r).slice(0, 200)}`, direct: true };
  if (j['status'] === 'duplicate_blocked') return { text: `✅ Ce rappel était déjà programmé : « ${input['message']} ».`, direct: true };
  const iso = String(j['local_time'] ?? j['local_time_iso'] ?? '');
  const d = iso.slice(0, 10), hm = iso.slice(11, 16);
  return { text: `⏰ Rappel programmé ${d === localNow().date ? "aujourd'hui" : d === addDays(localNow().date, 1) ? 'demain' : `le ${frDate(d)}`} à ${hm} : « ${input['message']} ».`, direct: true };
}

/** « mets un rdv chez le dentiste mardi prochain à 15h », « rdv le 3 janvier à 10h avec le notaire » → agenda FIK (1 h). */
async function rdv(raw: string): Promise<Direct | null> {
  const t = strip(raw);
  if (raw.length > 220 || /\?$/.test(raw.trim()) || /\b(annule|supprime|d[eé]cale|deplace|enleve|change|retire|c'est quand|quand est|j'ai quoi)\b/.test(t)) return null;
  if (!/(^|\b(mets?|ajoute|note|cree|cale|programme|prends?|inscris|fixe)\b[^.]{0,20})\b(rdv|rendez[- ]vous)\b/.test(t) && !/^\s*(rdv|rendez[- ]vous)\b/.test(t)) return null;
  const w = parseWhen(raw);
  if (!w.date || !w.time) return null;                       // il manque le jour ou l'heure → le cerveau demande
  let what = raw;
  for (const u of w.used) what = what.replace(new RegExp(u.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[ae]/g, '[aàâeéèê]'), 'i'), ' ');
  what = what.replace(/\b(mets?|ajoute|note|crée|cree|cale|programme|prends?|inscris|fixe)\b|\b(moi|un|une|le|mon)\s+(?=rdv|rendez)/gi, ' ').replace(/\b(rdv|rendez[- ]vous)\b/gi, ' ')
    .replace(/\b(dans l'agenda|à l'agenda|dans mon agenda)\b/gi, ' ').replace(/\s+(à|a|le|pour)\s*$/i, '').replace(/^\s*(à|a|le|pour)\s+/i, '').replace(/\s+/g, ' ').trim();
  const title = `📅 RDV ${what || ''}`.trim();
  const end = `${pad((Number(w.time.slice(0, 2)) + 1) % 24)}:${w.time.slice(3)}`;
  const { executeTool } = await import('./tool-executor.js');
  const r = await executeTool('create_agenda_event', { title, start_datetime: `${w.date}T${w.time}:00`, end_datetime: `${w.date}T${end}:00` }, SID);
  if (!/✅/.test(r)) return { text: `❌ RDV pas ajouté à l'agenda : ${r.slice(0, 200)}`, direct: true };
  return { text: `✅ Ajouté à l'agenda FIK : ${title.replace('📅 ', '')} — ${frDate(w.date)} à ${w.time} (heure de Bruxelles).`, direct: true };
}

/** « ne me dérange pas jusqu'à 18h / pendant 2 h / 30 min » → silence (appels + messages). */
async function dnd(raw: string): Promise<Direct | null> {
  const t = strip(raw);
  const m = /\b((?:ne )?me der[ae]n[gj]e?(?:s|z|r)? pas|der[ae]n[gj]e?[- ]moi pas|pas d'appels?|silence|mode silence|laisse[- ]moi tranquille)\b/.exec(t);
  // 06/11 banc : « ne me dérange pas jusqu'à demain 9h » → cerveau → « OK » sans rien programmer. « jusqu'à demain HHh » = silence jusque-là.
  const tmr = /jusqu'?a\s*demain\s*(?:matin\s*)?(?:a\s*)?(\d{1,2})\s*(?:h|:)\s*(\d{2})?/.exec(t);
  if (m && tmr && raw.length <= 160 && !/\?/.test(raw)) {
    const now = localNow().hhmm, H = Number(tmr[1]), M = Number(tmr[2] ?? 0);
    const minutes = 1440 - (Number(now.slice(0, 2)) * 60 + Number(now.slice(3, 5))) + H * 60 + M;
    if (H <= 23 && M <= 59 && minutes > 0 && minutes <= 1440) {
      const { executeTool } = await import('./tool-executor.js');
      const r = await executeTool('pause_calls', { minutes, reason: 'ne pas déranger' }, SID);
      if (/❌/.test(r)) return { text: r, direct: true };
      return { text: `🔕 OK, je ne te dérange plus jusqu'à demain ${pad(H)}:${pad(M)} : ni appel, ni message. Ce qui arrive est gardé et te parvient en un seul message après.`, direct: true };
    }
  }
  if (!m || raw.length > 160 || /\?/.test(raw) || /\b(demain|ce soir|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|matin)\b/.test(t)) return null;   // plus tard = silence programmé → cerveau (pause_calls day/from_time)
  const { executeTool } = await import('./tool-executor.js');
  let input: Record<string, unknown>;
  const until = /jusqu'?a\s*(\d{1,2})\s*(?:h|:)\s*(\d{2})?/.exec(t);
  const dur = /pendant\s+(\d+|une?|deux|trois)\s*(h(?:eures?)?|min(?:utes?)?|mn)\b/.exec(t);
  if (until) input = { until_time: `${pad(Number(until[1]))}:${until[2] ?? '00'}`, reason: 'ne pas déranger' };
  else if (dur) { const n = Number(dur[1]) || ({ un: 1, une: 1, deux: 2, trois: 3 } as Record<string, number>)[dur[1]!] || 1; input = { minutes: /^h/.test(dur[2]!) ? n * 60 : n, reason: 'ne pas déranger' }; }
  else if (/^\s*(stp\s+)?((?:ne )?me der[ae]n[gj]e?(?:s|z)? pas|der[ae]n[gj]e?[- ]moi pas|me derange plus)\s*(stp|s'il te plait)?\s*[.!]*\s*$/.test(t)) input = { until_reply: true, reason: 'ne pas déranger' };
  else return null;
  const r = await executeTool('pause_calls', input, SID);
  if (/❌/.test(r)) return { text: r, direct: true };
  const fin = /jusqu'à (\d{2}:\d{2})/.exec(r)?.[1];
  return { text: input['until_reply'] ? '🔕 OK, je ne te dérange plus (ni appel ni message) jusqu\'à ce que tu m\'écrives. Tout est gardé pour après.' : `🔕 OK, je ne te dérange plus jusqu'à ${fin ?? 'la fin du silence'} : ni appel, ni message. Ce qui arrive est gardé et te parvient en un seul message après.`, direct: true };
}

/** « je suis dispo à 6:30 », « joignable après 14h », « dispo à partir de 15h » → silence jusqu'à cette heure.
 *  05/11 : « Je suis dispo à 6:30 » (05:41) → le cerveau a fait resume:true (« C'est reparti ») et ignoré l'heure. */
async function dispoAt(raw: string): Promise<Direct | null> {
  const t = strip(raw);
  if (raw.length > 120 || /\?/.test(raw) || /\b(demain|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\b/.test(t)) return null;
  const m = /\b(?:dispo(?:nible)?|joignable|libre)\s+(?:a partir de|apres|vers|des|a)\s*(\d{1,2})\s*(?:h|:)\s*(\d{2})?\b/.exec(t);
  if (!m || Number(m[1]) > 23) return null;
  const hhmm = `${pad(Number(m[1]))}:${m[2] ?? '00'}`;
  const { executeTool } = await import('./tool-executor.js');
  if (hhmm <= localNow().hhmm) {   // heure déjà passée = il est là maintenant
    const r = await executeTool('pause_calls', { resume: true }, SID);
    return { text: /❌/.test(r) ? r : '✅ OK, tu es dispo : appels et messages réactivés.', direct: true };
  }
  const r = await executeTool('pause_calls', { until_time: hhmm, reason: 'dispo plus tard' }, SID);
  if (/❌/.test(r)) return { text: r, direct: true };
  return { text: `🔕 OK, je ne t'appelle pas et je ne t'écris pas avant ${hhmm}. Ce qui attend arrive à ${hhmm}.`, direct: true };
}

/** « j'ai dormi 5h », « dormi 6h30 », « j'ai dormi que 4 heures » → sommeil de la nuit noté. */
async function sleep(raw: string): Promise<Direct | null> {
  const t = strip(raw);
  const m = /\b(?:j'ai\s+)?dormi\s+(?:que\s+|seulement\s+|juste\s+|a peine\s+)?(\d{1,2})\s*(?:h|heures?)\s*(\d{1,2})?\b/.exec(t);
  if (!m || raw.length > 200 || /\?/.test(raw) || /\b(hier soir|il a dormi|ibrahim a|elle a)\b/.test(t)) return null;
  const h = Number(m[1]) + (m[2] ? Number(m[2]) / 60 : 0);
  if (!(h >= 1 && h <= 14)) return null;
  const { executeTool } = await import('./tool-executor.js');
  const hh = Math.round(h * 10) / 10;
  const r = await executeTool('life_coach', { action: 'log', sleep_hours: hh }, SID);
  if (/❌/.test(r)) return { text: r, direct: true };
  const rest = t.replace(m[0], ' ').replace(/[^a-z ]/g, ' ').split(/\s+/).filter(x => x.length > 2).length;
  const txt = `😴 Noté : ${String(hh).replace('.', ',')} h de sommeil cette nuit.${hh < 6.5 ? ' Nuit courte : couche-toi plus tôt ce soir, et vas-y doucement aujourd\'hui.' : ''}`;
  return rest < 2 ? { text: txt, direct: true } : { text: `${txt} (résultat outil : ${r.slice(0, 300)})`, direct: false };
}

/** « une idée de soirée avec ma femme (samedi) ? » → coach couple (maison par défaut, sortie le lundi), jamais d'alcool. */
async function couple(raw: string): Promise<Direct | null> {
  const t = strip(raw);
  if (raw.length > 200 || !/\b(idee|idees|propose|quoi faire|on fait quoi|que faire)\b/.test(t) || !/\b(soiree|sortie|soir|week-end|weekend)\b/.test(t) || !/\b(ma femme|mon epouse|en couple|a deux|ma cherie|avec elle)\b/.test(t)) return null;
  const w = parseWhen(raw);
  const { lifeTool } = await import('./life-plus.js');
  const r = await lifeTool({ action: 'couple', ...(w.date ? { date: w.date } : {}), ...(/\b(sortie|sortir|resto|restaurant|dehors)\b/.test(t) ? { kind: 'sortie' } : {}) });
  if (/❌/.test(r)) return { text: `Le coach couple n'a pas pu chercher (${r.slice(0, 80)}). Propose 2-3 idées de soirée À LA MAISON après le coucher d'Ibrahim (il vit à Bruxelles ; sortie seulement le lundi), simples et pas chères, JAMAIS d'alcool ni de lieu inventé.`, direct: false };
  return { text: r, direct: true };
}


/** 🔒 « dis à Houari ce que je prends comme médicament » → jamais (05/11 banc : il proposait de le faire). */
async function privacy(raw: string): Promise<Direct | null> {
  const t = strip(raw);
  if (!/\b(dis|dire|envoie|envoyer|montre|montrer|transmets|transmettre|partage|partager|explique|raconte|previens|informe|ecris)\b/.test(t)) return null;
  if (!/\b(houari|client|clients|ma femme|ma mere|mon pere|mon frere|ma soeur|mes freres|famille|cousin|collegue|patron|ami|pote|quelqu'un|whatsapp|mail)\b/.test(t)) return null;
  if (!new RegExp(String.raw`\b(medic\w*|medoc\w*|comprim\w*|cachets?|traitement${MED_ALT}|liberte|sevrage|libido|vitalite|testo\w*|sante|analyses?|prise de sang|ordonnance|demis?)\b`).test(t)) return null;
  return { text: "🔒 Ça, je le garde entre nous : je ne partage jamais ta santé, ton traitement ni ce qui est privé, avec personne (Houari, clients, famille). Si tu veux le dire à quelqu'un, c'est toi qui le lui dis — je peux t'aider à trouver les mots.", direct: true };
}

/** « il fait quel temps demain à Oran ? » → vraie prévision Open-Meteo (le cerveau répondait « pas d'information »). */
async function weather(raw: string): Promise<Direct | null> {
  const t = strip(raw);
  if (raw.length > 160 || !/\b(quel temps|la meteo|meteo|il va pleuvoir|il pleut|il fait (froid|chaud|beau)|temperature|il va faire)\b/.test(t)) return null;
  if (/\b(business|resa|reservations?|clients?|ventes?|chiffres?|marche|moral|humeur|ambiance)\b/.test(t)) return null;   // « la météo du business » ≠ la météo
  const w = parseWhen(raw);
  const today = localNow().date;
  const day = w.date ?? today;
  const diff = Math.round((Date.parse(day) - Date.parse(today)) / 86_400_000);
  if (diff < 0 || diff > 6) return null;
  const cm = /\b(?:a|sur|pour|en)\s+([a-z][a-z' -]{2,30}?)(?:\s+(?:demain|aujourd'hui|ce soir|ce matin|apres-demain|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)|\s*\?|$)/.exec(t);
  const city = cm?.[1]?.trim() && !/^(quelle|quel|combien|la|le|l)$/.test(cm[1].trim()) ? cm[1].trim() : 'bruxelles';
  const geo = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=fr`).then(r => r.json()).catch(() => null) as { results?: Array<{ name: string; latitude: number; longitude: number; country?: string; timezone?: string }> } | null;
  const g = geo?.results?.[0];
  if (!g) return null;
  const f = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${g.latitude}&longitude=${g.longitude}&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max,windspeed_10m_max&timezone=${encodeURIComponent(g.timezone ?? 'auto')}&forecast_days=7`).then(r => r.json()).catch(() => null) as { daily?: Record<string, Array<number | string>> } | null;
  const d = f?.daily;
  const i = d?.['time']?.indexOf(day) ?? -1;
  if (!d || i < 0) return null;
  const code = Number(d['weathercode']![i]);
  const sky = code === 0 ? '☀️ grand soleil' : code <= 2 ? '🌤️ peu nuageux' : code === 3 ? '☁️ couvert' : code <= 48 ? '🌫️ brouillard' : code <= 57 ? '🌦️ bruine' : code <= 67 ? '🌧️ pluie' : code <= 77 ? '❄️ neige' : code <= 82 ? '🌧️ averses' : code <= 86 ? '🌨️ averses de neige' : '⛈️ orages';
  const when = day === today ? "Aujourd'hui" : diff === 1 ? 'Demain' : frDate(day).replace(/^./, c => c.toUpperCase());
  return { text: `${when} à ${g.name} : ${sky}, ${Math.round(Number(d['temperature_2m_min']![i]))}° → ${Math.round(Number(d['temperature_2m_max']![i]))}°C, pluie ${d['precipitation_probability_max']![i]} %, vent jusqu'à ${Math.round(Number(d['windspeed_10m_max']![i]))} km/h.`, direct: true };
}

/** « c'est quand le ramadan ? », « l'aïd c'est quand ? » → calendrier calculé (05/11 banc : « 8 février 2026 », année fausse). */
async function islamicDates(raw: string): Promise<Direct | null> {
  const t = strip(raw);
  if (raw.length > 140 || !/\b(ramadan|ramadhan|aid|l'aid|mouloud|mawlid|achoura|ras el am|nouvel an hegire)\b/.test(t) || !/\b(quand|date|dans combien|commence|debut|fin|c'est le)\b/.test(t)) return null;
  const { seasonsBetween } = await import('./seasons.js');
  const today = localNow().date;
  const list = seasonsBetween(today, addDays(today, 400)).filter(x => x.kind === 'fete');
  const want = /ramadan|ramadhan/.test(t) ? /ramadan/i : /adha|kebir|mouton/.test(t) ? /adha|kebir/i : /fitr|seghir|sghir/.test(t) ? /fitr|seghir/i : /aid/.test(t) ? /a[iï]d/i : /mouloud|mawlid/.test(t) ? /mawlid/i : /achoura/.test(t) ? /achoura/i : /hegire|ras el am/i;
  const hits = list.filter(x => want.test(x.name)).slice(0, 2);
  if (!hits.length) return null;
  const days = (d: string) => Math.round((Date.parse(d) - Date.parse(today)) / 86_400_000);
  return { text: hits.map(h => {
    const aid = /(\d{4}-\d{2}-\d{2})/.exec(h.note)?.[1];
    if (aid) return `🌙 ${h.name} : le ${frDate(aid)} (dans ${days(aid)} jours, ±1 jour selon la lune).`;
    return `🌙 ${h.name} : ${h.end !== h.start ? `du ${frDate(h.start)} au ${frDate(h.end)}` : `le ${frDate(h.start)}`} (dans ${days(h.start)} jours, ±1 jour selon la lune).`;
  }).join('\n'), direct: true };
}

/** « il est où mon vol ? » / « mon vol a du retard ? » → suivi réel ; « Houari m'a demandé de ramener du parfum » → check-list du voyage. */
async function flight(raw: string): Promise<Direct | null> {
  const t = strip(raw);
  if (raw.length > 200) return null;
  const { executeTool } = await import('./tool-executor.js');
  if (/\b(il est ou|ou est|ou en est|statut|retard|heure d'arrivee|atterri|decolle)\b[^.]{0,20}\b(mon|le|notre|son) vol\b|\bmon vol\b[^.]{0,25}\b(retard|ou|heure|statut|decolle|atterri)\b/.test(t)) {
    return { text: await executeTool('travel', { action: 'track' }, SID), direct: true };
  }
  const m = /^(?:mon |ma )?([a-z][a-z' -]{1,25}?)\s+(?:m'a|ma|m a)\s+demande\s+(?:de\s+)?(?:lui\s+|leur\s+|me\s+)?(ramener|rapporter|acheter|prendre|apporter|ramene)\s+(.{2,120})$/.exec(t);
  if (m) {
    const person = m[1]!.trim().replace(/^\w/, c => c.toUpperCase());
    const items = m[3]!.replace(/\s+(d'algerie|d'oran|de belgique|au retour|pour le retour|quand je rentre|quand je reviens)\b.*$/, '').split(/\s*(?:,| et )\s*/).map(x => x.trim()).filter(Boolean);
    const back = /\b(d'algerie|d'oran|au retour|pour le retour|quand je rentre|quand je reviens)\b/.test(t);
    const r = await executeTool('travel', { action: 'request', person, items, phase: back ? 'back' : 'out' }, SID);
    if (/Aucun voyage prévu/.test(r)) {
      // Pas encore de billet : gardé, et ajouté tout seul à la check-list quand il enverra son billet
      const { kvGet, kvSet } = await import('./app-store.js');
      const pend = JSON.parse((await kvGet('trips:pending-requests').catch(() => null)) ?? '[]') as Array<{ person: string; items: string[]; phase: string; at: string }>;
      pend.push({ person, items, phase: back ? 'back' : 'out', at: new Date().toISOString() });
      await kvSet('trips:pending-requests', JSON.stringify(pend.slice(-30)));
      return { text: `📝 Noté pour ton prochain voyage : ${items.join(', ')} pour ${person}${back ? ' (à ramener au retour)' : ''}. Pas encore de billet : dès que tu me l'envoies, je l'ajoute à ta check-list et je te le rappelle avant de partir.`, direct: true };
    }
    return { text: r, direct: !/❌/.test(r) };
  }
  return null;
}


/** 🚗 « la fiat 500x est à 45200 km » (05/11 banc : faux « ✅ Noté » via remember_info qui plantait) → compteur noté par le code. */
async function carKm(raw: string): Promise<Direct | null> {
  const t = strip(raw).trim();
  if (raw.length > 160 || /\?|combien|depuis|par jour|pour aller|trajet|d'ici|jusqu'a|route/.test(t)) return null;
  const m = /^(?:la|le|ma|notre)?\s*([a-z0-9][a-z0-9 .-]{1,30}?)\s+(?:est a|a|affiche|fait|est maintenant a|compteur a)\s+(\d{1,3}(?:[ .]?\d{3})+|\d{4,6})\s*(?:km|kilometres?|bornes)\b/.exec(t)
    ?? /\bcompteur (?:de )?(?:la |le )?([a-z0-9][a-z0-9 .-]{1,30}?)\s*:?\s*(\d{1,3}(?:[ .]?\d{3})+|\d{4,6})\s*(?:km)?\b/.exec(t);
  if (!m) return null;
  const name = m[1]!.replace(/\b(voiture|bagnole|tomobil)\b/g, '').trim();
  const km = Number(m[2]!.replace(/[ .]/g, ''));
  if (!name || !(km >= 100 && km <= 999_999)) return null;
  const { recordCarKm } = await import('../notifications/client-care.js');
  const r = await recordCarKm(name, km).catch(() => '');
  if (!r || /introuvable/.test(r)) return null;     // pas une voiture de la flotte → le cerveau
  return { text: r, direct: true };
}

/** 🔥 « j'ai trop envie d'en prendre un là » (05/11 banc : « Quelle voiture t'intéresse ? 🚗 ») → SOS Liberté, tout de suite. */
/** 💵 Réponse « rien » à la question du soir « Combien de snus aujourd'hui ? » (argent-coach, 20h30)
 *  05/11 20h50 « Aucun aujourd'hui rien je pas u le temps je pas gagner de cash » → cerveau sans outil → « ⚠️ Je n'ai pas exécuté
 *  cette action ». Rien n'est inscrit (pas de vente à 0 € dans le journal) : on confirme seulement, sans redemander ce soir. */
async function noSales(raw: string): Promise<Direct | null> {
  const t = strip(raw);
  if (t.length > 200 || /\?\s*$/.test(t) || /\b[1-9]\d*\b/.test(t)) return null;
  if (!/\b(aucun|aucune|rien|zero|nada|walou|wallou|que dalle)\b|\bpas\s+(eu\s+le\s+temps|u\s+le\s+temps|gagn|vendu|fait|travaill|de\s+(vente|cash|snus))/.test(t)) return null;
  // un « rien de spécial » en discutant ≠ réponse à la caisse : mot d'argent/vente exigé, sauf réponse très courte (« rien », « aucun »)
  if (t.split(/\s+/).length > 3 && !/cash|vend|vente|gagn|snus|argent|caisse|encaiss|sous|thune|fric|client/.test(t)) return null;
  const { kvJson } = await import('./ai-util.js');
  const { date } = localNow();
  if (!(await kvJson<string | null>(`argent:sent:soir:${date}`, null))) return null;   // seulement si la question a été posée ce soir
  return { text: "📒 OK, aucune vente aujourd'hui : rien à noter, je ne te redemande pas ce soir.", direct: true };
}

/** 📲 06/11 « Je partager la pub TikTok » → le cerveau a refait un clip Runway + lien .jpeg. Partager/publier/renvoyer LA pub
 *  = renvoyer la dernière pub terminée (vidéo + légende + numéro en bio), jamais en recréer une. */
async function sharePub(raw: string): Promise<Direct | null> {
  const t = strip(raw);
  if (t.length > 160 || /\?\s*$/.test(raw)) return null;
  if (/\b(cree|creer|fais|faire|lance|genere|nouvelle|autre|refai\w*)\b/.test(t)) return null;     // une NOUVELLE pub → pubTiktok / le cerveau
  // « Je partager / j'ai partagé / c'est posté la pub » = il l'a PUBLIÉE (info) → on note + bravo, on ne renvoie rien
  const done = /^(ok |bon |voila |ca y est |c'est bon )?(j'ai|jai|j ai|je|je viens de|j'viens de|c'est|cest|elle est|la pub est|pub)\s*(bien |deja |enfin )?(partag\w*|publi\w*|post\w*|mis\w* en ligne|en ligne)\b/.test(t)
    && !/\b(moi|me|m'|stp|svp|s'il te plait)\b/.test(t) && !/\b(vais|veux|dois|peux|voudrais|demain|ce soir|plus tard|quand)\b/.test(t);
  if (done && /\b(pub|tiktok|tik tok|video)\b/.test(t)) {
    const { markPubPosted } = await import('../marketing/tiktok-pub.js');
    return { text: await markPubPosted(), direct: true };
  }
  const share = /\b(partag\w*|publi\w*|poste|poster|postes|envoie|envoi|renvoie|renvoi|donne|redonne|balance)\b.{0,30}\b(la|ma|notre|cette|ta)\s+(pub|video)\b/.test(t)
    || /\b(pub|video)\b.{0,20}\b(a|pour)\s+(partager|publier|poster)\b/.test(t);
  if (!share || !/\b(pub|tiktok|tik tok)\b/.test(t)) return null;
  const { resendLatestPub } = await import('../marketing/tiktok-pub.js');
  const r = await resendLatestPub().catch(() => null);
  return r ? { text: r, direct: true } : null;
}

/** 🎬 06/11 « Créer moi la vidéo ia stp » (après son message TikTok) → le cerveau gratuit a fait un clip de 5 s de la Clio dans le parking.
 *  Demande claire de créer la pub/vidéo pour TikTok → pub complète tout de suite (video_studio pub_tiktok), avec SON message comme texte. */
async function pubTiktok(raw: string): Promise<Direct | null> {
  const t = strip(raw);
  if (!/\b(cree|crees|creer|creez|cre|fais|fait|faire|lance|monte|genere|prepare)\b(\s+(moi|nous|lui))?\s+(la|une|ma|notre|cette|ta)?\s*(video|pub|montage)\b/.test(t)) return null;
  if (/\?|tu en penses?|t'en penses?|ton avis/.test(t)) return null;          // il demande un avis → le cerveau
  if (/\b(photo|retouche|remplace|enleve)\b/.test(t)) return null;
  if (/\bje (vais|veux|veut|voudrais|dois|compte|pense|vai)\b.{0,25}\b(faire|creer|monter|poster)\b/.test(t)) return null;   // c'est LUI qui va la faire → le cerveau conseille
  const { supabase } = await import('./supabase.js');
  const since = new Date(Date.now() - 3 * 3600_000).toISOString();
  const { data } = await supabase.from('conversations').select('role, content, created_at').eq('session_id', SID).eq('role', 'user')
    .gte('created_at', since).order('created_at', { ascending: false }).limit(8);
  const recent = ((data ?? []) as Array<{ content: string }>).map(r => String(r.content ?? '').replace(/^\s*\[[\s\S]*?\]\s*/, '').trim());
  const tiktokNow = /\b(tiktok|tik tok|reels?|insta)\b/.test(t);
  const { tiktokPubTool, pubHistory } = await import('../marketing/tiktok-pub.js');
  // un message déjà transformé en pub n'est pas réutilisé tel quel (« crée moi une pub » = une NOUVELLE pub)
  const usedBriefs = new Set((await pubHistory().catch(() => [])).map(h => h.brief.slice(0, 300)));
  const brief = [raw, ...recent].filter(m => m.length >= 60 && /tiktok|tik tok|pub|montage|motion/i.test(m) && (m === raw || !usedBriefs.has(m.slice(0, 300))))
    .sort((a, b) => b.length - a.length)[0];
  const pubWord = /\bpub\b/.test(t);
  if (!tiktokNow && !brief && !pubWord) return null;                             // « crée une vidéo » sans contexte TikTok/pub → le cerveau
  const idea = brief ?? (raw.length >= 40 ? raw : '');                           // vide = PUB LIBRE, l'équipe décide de tout
  const r = await tiktokPubTool({ idea, force: /\b(autre|nouvelle|deuxieme|2e|2eme|encore une|refai[st]|relance)\b/.test(t) });   // pub en cours → pas de 2e rendu payé sauf « une autre »
  if (r.startsWith('❌')) return { text: r, direct: true };
  if (!idea) return { text: r.replace(/\nDis-lui tout ça[^\n]*$/, '').replace(/^🎬 Pub TikTok lancée \(job \w+, /, '🎬 Pub libre : mon équipe choisit tout (angle, voiture à pousser, texte) — c\'est parti ('), direct: true };
  return { text: r.replace(/\nDis-lui tout ça[^\n]*$/, '').replace(/^🎬 Pub TikTok lancée \(job \w+, /, '🎬 C\'est parti, je te fais la pub TikTok complète (') , direct: true };
}

async function craving(raw: string): Promise<Direct | null> {
  const t = strip(raw);
  if (raw.length > 240 || /\?/.test(raw) && !/\bje (peux|dois)\b/.test(t)) return null;
  const want = /\b(envie|besoin|je craque|ca me demange|je vais craquer|je tiens plus|j'en peux plus)\b/.test(t);
  const med = new RegExp(String.raw`\b(en prendre (un|une|1)|prendre (un|une|1) (demi|cachet|comprime)|un demi|un cachet|un comprime|mes demis?|mon medoc|mes medocs|le medicament${MED_ALT}|reprendre)\b`).test(t);
  // « j'ai encore pris un demi, j'en peux plus » = prise DÉJÀ faite + moral → le cerveau (outil liberte + écoute), pas le SOS envie
  if (/\b(j'?ai|je l'?ai|je les ai)\s+(encore\s+|deja\s+|quand meme\s+)?(pris|repris|craque)\b|\bpris\b/.test(t)) return null;
  // 06/11 « si j'ai envie d'en reprendre je te ferai signe » = un plan pour plus tard, pas une envie maintenant → le cerveau
  if (/\bsi (jamais |j'?ai |je |j'?en ai )?(encore |trop )?(envie|besoin)\b|\bquand j'?(aurai|ai) (envie|besoin)\b|\bje te (ferai|ferais|dirai|dirais|previendrai|previendrais|ecrirai|ecrirais)\b/.test(t)) return null;
  if (!want || !med || /\b(voiture|clio|location|louer|resa|client|cafe|the|cigarette|pizza|gateau|sucre|manger)\b/.test(t)) return null;
  const { liberteTool } = await import('./liberte.js');
  const r = await liberteTool({ action: 'envie', note: raw.slice(0, 200) }, SID).catch(() => '');
  if (!r || /pas encore commencé/.test(r)) return null;
  // Réponse directe (même si les cerveaux sont saturés, il a son SOS tout de suite) : consignes au cerveau → à lui, en « tu »
  const lines = r.split('\n').map(l => l.trim()).filter(Boolean).flatMap(l => {
    if (/^Accompagne-le|à ta façon/i.test(l)) return [];
    if (/^Rappelle-lui SES raisons\s*:/i.test(l)) return [l.replace(/^Rappelle-lui SES raisons\s*:/i, '💛 Tes raisons :')];
    if (/^Rappelle-lui pourquoi/i.test(l)) return ['💛 Pense à pourquoi tu fais ça : ta femme, Ibrahim, ton énergie retrouvée.'];
    if (/^Ses plans à lui/i.test(l)) return [l.replace(/^Ses plans à lui pour ce moment\s*:/i, '🧭 Ton plan pour ce moment :')];
    if (/^Rappelle-lui ses victoires/i.test(l)) return [l.replace(/^Rappelle-lui ses victoires\s*:/i, '🏆 Tes victoires :')];
    if (/\b(lui|il)\b/.test(l) && !/^[0-9️⃣⏱🔥]/u.test(l)) return [];
    return [l.replace(/il peut la prendre, sans plus/, 'tu peux la prendre, sans plus')];
  });
  return { text: `🤍 Je suis là, Kouider.\n${lines.join('\n')}\nJe te réécris dans 15 minutes pour voir comment tu tiens.`, direct: true };
}

/** « mon salaire est tombé 2350 » (05/11 banc : « pas accès aux données ») → salaire du mois noté. */
async function salary(raw: string): Promise<Direct | null> {
  const t = strip(raw);
  const m = /\b(?:mon\s+)?(salaire|paie|paye)\b[^0-9?]{0,30}?\b(tombe|recu|arrive|vire|touche|rentre|est la|vient de tomber)\b[^0-9?]{0,15}(\d[\d .,]{2,8})/.exec(t) ?? /\b(?:j'ai\s+)?(touche|recu)\s+(?:mon\s+|ma\s+)?(salaire|paie|paye)\b[^0-9?]{0,15}(\d[\d .,]{2,8})/.exec(t);
  if (!m || raw.length > 200) return null;
  const amount = Math.round(Number(m[3]!.replace(/[ .]/g, '').replace(',', '.')));
  if (!(amount >= 300 && amount <= 20_000)) return null;
  const { kvGet, kvSet } = await import('./app-store.js');
  const fin = JSON.parse((await kvGet('perso:finances').catch(() => null)) ?? '{}') as { salary?: number; monthlySaving?: number };
  const ym = localNow().date.slice(0, 7);
  await kvSet(`perso:salary:received:${ym}`, JSON.stringify({ amount, at: new Date().toISOString() }));
  const usual = fin.salary;
  const diff = usual ? amount - usual : 0;
  const eur = (n: number) => `${n.toLocaleString('fr-FR')} €`;
  return { text: `💶 Salaire de ${MO_FR[Number(ym.slice(5))]} reçu : ${eur(amount)}${usual ? (Math.abs(diff) < 20 ? ' (comme d\'habitude).' : diff > 0 ? ` — ${eur(diff)} de plus que d'habitude (${eur(usual)}) : heures sup ?` : ` — ${eur(-diff)} de moins que d'habitude (${eur(usual)}) : vérifie ta fiche de paie.`) : '.'}${fin.monthlySaving ? `\n👉 Ton plan : mettre ${eur(fin.monthlySaving)} de côté dès maintenant. Dis « j'ai mis ${fin.monthlySaving} de côté » quand c'est fait.` : ''}`, direct: true };
}

/** « j'en suis où pour le plan Algérie ? », « ma projection 2028 » → ses vraies finances (05/11 banc : « je n'ai pas trouvé »). */
async function financePlans(raw: string): Promise<Direct | null> {
  const t = strip(raw);
  if (raw.length > 160) return null;
  const algerie = /\b(plan algerie|projet algerie|rentrer en algerie|m'installer a oran|demenager a oran|la maison a oran|plan oran)\b/.test(t);
  const proj = /\b(projection|combien j'aurai|j'aurai combien|combien je vais avoir|de cote fin \d{4}|fin 20\d\d|dans \d+ ans)\b/.test(t) && /\b(cote|epargne|aurai|projection|economis)\b/.test(t);
  if (!algerie && !proj) return null;
  const { runJarvis4Tool } = await import('./jarvis4-tools.js');
  // 04/11 banc : « fin 2027 » répondait déc. 2028 → l'horizon demandé est passé à l'outil
  const y = t.match(/\b(?:fin|en|decembre|d'ici)\s+(20\d\d)\b/)?.[1];
  const n = Number(t.match(/\bdans (\d+) ans?\b/)?.[1] ?? 0);
  const now = localNow().date;
  const until = y ? `${y}-12` : n > 0 && n < 30 ? `${Number(now.slice(0, 4)) + n}-${now.slice(5, 7)}` : undefined;
  const r = await runJarvis4Tool('mes_finances', { action: algerie ? 'algerie' : 'projection', ...(until && !algerie ? { until } : {}) }, SID).catch(() => null);
  if (!r) return null;
  // 05/11 banc tour 3 : en « consigne », le cerveau gratuit l'ignorait (« aucune donnée sur un plan Algérie », ou bénéfice FIK donné
  // comme épargne perso) → réponse DIRECTE du code, rien à réinterpréter
  return { text: r, direct: true };
}

/** « combien on a gagné ce mois-ci / le mois dernier / cette année avec FIK ? » → le vrai rapport (05/11 banc : total de l'année donné pour le mois). */
async function fikRevenue(raw: string): Promise<Direct | null> {
  const t = strip(raw);
  if (raw.length > 160 || !/\b(on a gagne|on a fait|ca nous a rapporte|chiffre d'affaires|\bca\b|benefice|on a encaisse|fik a rapporte|fik a fait)\b/.test(t) || /\b(snus|cash|caisse|perso|clio|fiat|duster|jumpy|voiture)\b/.test(t)) return null;
  const now = localNow().date;
  let y = Number(now.slice(0, 4)), mo: number | undefined = Number(now.slice(5, 7));
  if (/mois dernier|mois passe/.test(t)) { mo! -= 1; if (mo! < 1) { mo = 12; y--; } }
  else if (/cette annee|depuis janvier|de l'annee|en 20\d\d/.test(t)) { mo = undefined; const yy = /en (20\d\d)/.exec(t); if (yy) y = Number(yy[1]); }
  else if (!/ce mois|du mois|le mois/.test(t)) return null;
  const { executeTool } = await import('./tool-executor.js');
  const r = await executeTool('get_revenue_report', { year: y, ...(mo ? { month: mo } : {}) }, SID);
  return { text: r, direct: !/^Erreur/.test(r) };   // vrais chiffres : directs (le cerveau ne peut plus les « arrondir »)
}

/** 🛌 « je suis crevé je vais pas à la salle demain » (04/11 banc : le cerveau disait « c'est noté » sans outil → garde anti-mensonge) */
/** 📊 06/11 « mon bilan du jour / de la semaine / du mois », « envoie mon récap de la semaine » → bilan FORME par le code (PDF + texte). */
async function formeBilan(raw: string): Promise<Direct | null> {
  const t = strip(raw);
  if (t.length > 140 || !/\b(bilan|recap|recapitulatif|resume|rapport)\b/.test(t)) return null;
  if (/\b(fik|client|location|resa|voiture|argent|cash|finance|business|prospect|site|mail|liberte|demis?)\b/.test(t)) return null;   // autres bilans
  const kind = /\b(mois|mensuel)\b/.test(t) ? 'month' : /\b(semaine|hebdo)\b/.test(t) ? 'week' : /\b(jour|journee|aujourd'hui|ce soir|du soir)\b/.test(t) ? 'day' : null;
  if (!kind || !/\b(mon|ma|le|du|de|envoie|fais|donne|montre)\b/.test(t)) return null;
  if (/\b(sport|forme|sante|seance|montre|coach|corps|progres|evolution)\b/.test(t) === false && !/^(?:envoie|fais|donne|montre)?[- ]?(?:moi )?(?:mon |le )?(bilan|recap)/.test(t)) return null;
  const r = await (await import('./forme-report.js')).formeReportTool({ kind });
  return { text: r, direct: true };
}

async function sportSkip(raw: string): Promise<Direct | null> {
  const t = strip(raw);
  if (t.length > 200 || /\?\s*$/.test(t)) return null;
  const DAY = "(aujourd'hui|ce soir|ce matin|demain|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)";
  const m = t.match(new RegExp(`\\b(?:(?:je )?(?:vais|irai|peux|pourrai|veux|ferai|fais)\\s+pas\\s+(?:aller\\s+)?(?:a la salle|au sport|a la muscu|a la gym|de sport|de salle|la seance)|pas de (?:sport|salle|seance|muscu)|(?:je )?(?:saute|zappe|annule|sauterai|decale pas|supprime) (?:la salle|le sport|la seance|ma seance))\\b[^.!]{0,25}?\\b${DAY}\\b`))
    ?? t.match(new RegExp(`\\b${DAY}\\b[^.!]{0,25}?\\b(?:(?:je )?(?:vais|irai|peux|fais|ferai)\\s+pas\\s+(?:aller\\s+)?(?:a la salle|au sport|a la muscu|a la gym|de sport|la seance)|pas de (?:sport|salle|seance|muscu))\\b`));
  if (!m) return null;
  const day = m[1] ?? 'demain';
  const date = /aujourd|ce soir|ce matin/.test(day) ? localNow().date : day;   // sport_coach comprend demain / lundi…
  const reason = /crev|fatigu|epuis|naze|mort/.test(t) ? 'fatigue' : /malade|grippe|fievre|mal (au|a la|au dos)|douleur|bless/.test(t) ? 'malade / douleur' : /travail|boulot|taf/.test(t) ? 'travail' : 'repos';
  const { sportCoachTool } = await import('./sport-coach.js');
  const r = await sportCoachTool({ action: 'skip', date, reason });
  return { text: `${reason === 'fatigue' ? '🛌 Repose-toi bien, la récup fait partie du programme.\n' : ''}${r}`, direct: true };
}

/** 🌐 « combien de visites sur le site hier ? » (04/11 banc : il répondait les visites des prospects) → vrai trafic du jour, tri robots/nous */
async function siteVisits(raw: string): Promise<Direct | null> {
  const t = strip(raw);
  if (t.length > 160 || /\b(prospect|client|demo|concurrent)/.test(t)) return null;
  if (!/\b(visites?|visiteurs?|trafic|traffic|passe|venu)\b[^.?!]{0,30}\bsite\b|\bsite\b[^.?!]{0,30}\b(visites?|visiteurs?|trafic|traffic|frequentation)\b/.test(t)) return null;
  const off = /avant[- ]hier/.test(t) ? -2 : /\bhier\b/.test(t) ? -1 : /\b(aujourd'?hui|ce jour|today)\b/.test(t) || !/semaine|mois/.test(t) ? 0 : null;
  if (off === null) return null;   // semaine / mois → get_site_analytics par le cerveau
  const { dayTraffic, formatTraffic } = await import('./site-traffic.js');
  return { text: formatTraffic(await dayTraffic(off), off === -2 ? 'avant-hier' : off === -1 ? 'hier' : "aujourd'hui"), direct: true };
}

/** 💧 « je bu 2 litre d'eau » (04/11 : « Bien joué » sans rien noter) → FORME (verres de 25 cl), total du jour vs objectif */
async function water(raw: string): Promise<Direct | null> {
  const t = strip(raw).replace(/(\d),(\d)/g, '$1.$2');
  // 06/11 13h00 « Je déjà bu 2 litre » (sans « eau ») → pas reconnu → le cerveau a AJOUTÉ 2 L aux 0,6 L → « 2,6 L ». « bu 2 litres » sans autre boisson = de l'eau.
  const otherDrink = /\b(cafe|caf|the|lait|jus|coca|soda|biere|vin|monster|redbull|red bull|energy|boisson|proteine|shaker|smoothie|sirop|limonade)\b/.test(t);
  if (t.length > 140 || /\?\s*$/.test(t) || !/\b(bu|bue|bus|bois|boi|boit|avale|pris|corr?ige[rz]?|corr?igez|mets|met|remet[sz]?)\b/.test(t) || !(/\bd?eau\b/.test(t) || (!otherDrink && /\b(bu|bue|bus|bois|boi|boit)\b/.test(t) && /\d\s*(litres?|l|cl)\b|\b(un|une|deux|trois)\s+litres?\b/.test(t)))) return null;   // 05/11 banc : « jai bu 1l deau », « je boi 50cl »
  // 05/11 : 2 L redits à 15h31 → 4 L comptés. « que 2 L / en tout / au total / déjà / corrige l'eau à 2 L » = TOTAL du jour, pas un ajout
  const setTotal = /\bqu(?:e|')?\s*(?:\d|un|une|deux|trois|quatre)|\b(en tout|au total|total|deja|depuis ce matin|aujourd ?hui|aujaurdhui|corr?ige[rz]?|corr?igez|mets|met|remet[sz]?)\b/.test(t);  // 05/11 20h41 « Corige l'eau à 2l » (1 r) → cerveau « C'est noté » sans rien changer
  const m = t.match(/(\d+(?:\.\d+)?|un|une|deux|trois|quatre|cinq|six)\s*(litres?|l|verres?|bouteilles?|cl|gorgees?)\b/);
  if (!m) return null;
  const W: Record<string, number> = { un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6 };
  const n = W[m[1]!] ?? Number(m[1]);
  const u = m[2]!;
  const liters = /^l/.test(u) ? n : /^verre/.test(u) ? n * 0.25 : /^bouteille/.test(u) ? n * 1.5 : /^cl/.test(u) ? n / 100 : 0;
  if (!(liters > 0 && liters <= 6)) return null;
  const glasses = Math.round(liters * 4);
  const f = await import('./forme.js');
  const day = await f.updateDay('kouider', localNow().date, d => { d.water = Math.max(0, Math.min(30, setTotal ? glasses : (d.water ?? 0) + glasses)); });
  const prof = await f.getFormeProfile('kouider').catch(() => null);
  const goalL = (prof?.waterGoal ?? 8) * 0.25, totL = day.water * 0.25;
  const fmt = (x: number) => String(Math.round(x * 10) / 10).replace('.', ',');
  // 05/11 « Je pris 7 demi comprime est bu 2l d'eau » → seule l'eau notée, la prise Liberté perdue → on note aussi la prise
  let med = '';
  const lib = await import('./liberte.js');
  const mc = lib.looksLikeMedText(raw) ? lib.parseMedTake(raw) : null;
  if (mc) med = (await lib.runMedTake(mc).catch(e => `❌ Prise non notée : ${e instanceof Error ? e.message : e}`)) + '\n';
  return { text: `${med}💧 ${setTotal ? 'Corrigé' : 'Noté'} dans FORME : ${setTotal ? '' : `+${fmt(liters)} L → `} ${fmt(totL)} L aujourd'hui (objectif ${fmt(goalL)} L).${totL >= goalL ? ' Objectif atteint 💪' : ` Encore ${fmt(goalL - totL)} L.`}`, direct: true };
}

/** 💼 Conseil business (« comment avoir plus de clients… ») : 04/11 banc → réponse générique sans ses chiffres → consigne : ses vraies données d'abord */
async function businessAdvice(raw: string): Promise<Direct | null> {
  const t = strip(raw);
  if (t.length > 300) return null;
  if (!/\b(comment|quoi faire|idee|conseil|strategie|astuce|tu me conseilles|je fais comment)\b/.test(t)) return null;
  if (!/\b(clients?|location|louer|fik|business|chiffre|ca\b|vendre|rentab|prospect|flotte|voitures? (dorment|au garage))\b/.test(t)) return null;
  return { text: "CONSIGNE : conseil business pour SON entreprise → base-toi sur SES vrais chiffres : appelle d'abord les outils qui les donnent (flotte et taux d'occupation / réservations à venir, chiffre du mois, prospects), puis donne 3-4 actions concrètes qui citent ses vraies voitures, ses prix et ses clients (MRE). Pas de conseil générique copiable par n'importe qui.", direct: false };
}

/** ⏳ « avec les exercices que je fais, ça va être visible dans combien de temps ? » (04/11 : « quelques semaines », sans calcul) */
async function bodyEta(raw: string): Promise<Direct | null> {
  const t = strip(raw);
  if (t.length > 300) return null;
  if (!/\b(dans combien de temps|en combien de temps|combien de (temps|semaines|mois)|quand (est-ce que|est ce que)?\s*(je|j'|ca|mes)|ca va (etre|prendre))\b/.test(t)) return null;
  if (!/\b(veines?|vaines?|abdos?|ventre|muscl|seche|maigrir|perdre|kilos?|kg|gras|bras|pecs?|dos|epaules?|visible|dessine|poids|forme)\b/.test(t)) return null;
  const c = await import('./forme-cut.js').then(m => m.cutStatus('kouider')).catch(() => null);
  const w = c?.weight;
  const expected = c?.deficit ? Math.round(c.deficit * 7 / 7700 * 100) / 100 : null;   // kg/semaine attendus avec son déficit
  const rate = w?.rateWeek && w.rateWeek > 0.05 ? w.rateWeek : expected;
  const weeks = w?.toLose && rate ? Math.ceil(w.toLose / rate) : null;
  const facts = c && w ? `FAITS RÉELS (FORME › Sèche) : poids ${w.current} kg, objectif ${w.goalKg ?? '?'} kg (reste ${w.toLose} kg), sèche semaine ${c.weeksIn}, déficit visé ${c.deficit} kcal/j, `
    + `perte mesurée ${w.rateWeek != null ? `${w.rateWeek} kg/sem` : 'pas encore mesurable (pas assez de pesées)'}, perte attendue avec ce déficit ${expected ?? '?'} kg/sem, protéines visées ${c.protein.goal} g (${c.protein.perKg} g/kg)`
    + `${weeks ? ` → CALCUL : ${w.toLose} kg ÷ ${rate} kg/sem ≈ ${weeks} semaines` : ''}.\n` : '';
  const when = weeks ? new Date(Date.now() + weeks * 7 * 86400_000).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', timeZone: 'Europe/Brussels' }) : null;
  const opener = weeks && w ? `COMMENCE ta réponse EXACTEMENT par : « D'après tes vrais chiffres : il te reste ${String(w.toLose).replace('.', ',')} kg à perdre (${String(w.current).replace('.', ',')} → ${w.goalKg} kg) ; avec ton déficit de ${c!.deficit} kcal par jour tu perds environ ${String(rate).replace('.', ',')} kg par semaine, donc compte environ ${weeks} semaines, vers le ${when}${w.rateWeek == null ? ' (je l’affinerai dès que tu te pèses chaque matin)' : ''}. » puis enchaîne.\n` : '';
  return { text: facts + opener + "CONSIGNE : question sur SON corps → utilise CES chiffres (sinon appelle forme status) pour ses VRAIS chiffres (poids actuel, objectif, déficit moyen réel, séances faites, tendance des dernières semaines), puis CALCULE : kg à perdre ÷ perte réelle par semaine = N semaines → donne une fourchette chiffrée ET une date (« vers fin janvier »). Explique le calcul en une ligne, puis les 2-3 leviers qui raccourcissent ce délai pour LUI (ce qui manque dans ses données : sommeil, protéines, pas, cardio…), et un point auquel il n'aurait pas pensé. Pas de « quelques semaines » sans chiffre.", direct: false };
}

/** 📅 « il l'a prise le 3 à 10h, il la rend le 7 à 14h, je compte combien de jours ? » (04/11 banc : « 5 jours ») → règle FIK par le code */
async function rentalCount(raw: string): Promise<Direct | null> {
  const t = strip(raw);
  if (t.length > 220 || !/\b(combien de jours|je compte combien|ca fait combien|nombre de jours)\b/.test(t)) return null;
  const a = t.match(/\b(?:pris|prise|prend|recupere|part|depart|commence)\w*\b[^0-9]{0,15}le (\d{1,2})\b(?:[^0-9]{0,6}(\d{1,2}) ?h)?/);
  const b = t.match(/\b(?:rend|rendra|ramene|rapporte|retour|revient|fini)\w*\b[^0-9]{0,15}le (\d{1,2})\b(?:[^0-9]{0,6}(\d{1,2}) ?h)?/);
  if (!a || !b) return null;
  const d1 = Number(a[1]), d2 = Number(b[1]);
  if (!(d1 >= 1 && d1 <= 31 && d2 >= 1 && d2 <= 31)) return null;
  const { date } = localNow();
  const y = Number(date.slice(0, 4)), m = Number(date.slice(5, 7));
  const iso = (yy: number, mm: number, dd: number) => `${yy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
  const start = iso(y, m, d1);
  const end = d2 > d1 ? iso(y, m, d2) : (m === 12 ? iso(y + 1, 1, d2) : iso(y, m + 1, d2));
  const { rentalDays } = await import('./finance.js');
  const n = rentalDays(start, end, null, a[2] ? `${a[2]}:00` : null, b[2] ? `${b[2]}:00` : null);
  const late = a[2] && b[2] && Number(b[2]) > Number(a[2]);
  return { text: `📅 ${n} jour${n > 1 ? 's' : ''}. Chez FIK on compte par tranches de 24 h et le jour du retour ne compte jamais${late ? `, même rendue à ${b[2]} h au lieu de ${a[2]} h` : ''}.`, direct: true };
}

/** 💶 « si je loue la Fiat 500X du 29 octobre au 9 novembre à 40 €, ça fait un total de combien ? » (04/11 rejeu : il donnait
 *  les prix de la flotte) → jours FIK (24 h, retour jamais compté) × prix donné, par le code */
async function rentalTotal(raw: string): Promise<Direct | null> {
  const t = strip(raw);
  if (t.length > 250 || !/\b(total|combien|ca fait|ca me fait)\b/.test(t)) return null;
  const M = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'];
  const m = t.match(new RegExp(`\\bdu (\\d{1,2})(?:er)?\\s*(${M.join('|')})?\\s+(?:au|jusqu'?au) (\\d{1,2})(?:er)?\\s*(${M.join('|')})?`));
  const p = t.match(/(\d+(?:[.,]\d+)?)\s*(?:€|euros?\b|eur\b)|\b(?:a|au prix de|pour)\s+(\d+(?:[.,]\d+)?)\s*(?:par jour|\/j|le jour)/);
  if (!m || !p) return null;
  const price = Number((p[1] ?? p[2])!.replace(',', '.'));
  if (!(price > 0 && price < 1000)) return null;
  const { date } = localNow();
  const y = Number(date.slice(0, 4)), cm = Number(date.slice(5, 7));
  const m2 = m[4] ? M.indexOf(m[4]) + 1 : m[2] ? M.indexOf(m[2]) + 1 : cm;
  const m1 = m[2] ? M.indexOf(m[2]) + 1 : (Number(m[1]) > Number(m[3]) ? (m2 === 1 ? 12 : m2 - 1) : m2);
  const y1 = m1 > m2 ? y - (cm < m1 ? 1 : 0) : y, y2 = m1 > m2 ? y1 + 1 : y1;
  const iso = (yy: number, mm: number, dd: number) => `${yy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
  const { rentalDays } = await import('./finance.js');
  const n = rentalDays(iso(y1, m1, Number(m[1])), iso(y2, m2, Number(m[3])));
  const total = Math.round(n * price * 100) / 100;
  return { text: `💶 ${n} jours × ${String(price).replace('.', ',')} € = ${String(total).replace('.', ',')} € au total (du ${m[1]} ${M[m1 - 1]} au ${m[3]} ${M[m2 - 1]} : tranches de 24 h, le jour du retour ne compte pas).`, direct: true };
}

/** 🧠 « comment s'est passée ma semaine dans la tête ? » (04/11 banc : résumé inventé sans le journal) → journal Mon esprit */
async function mindWeek(raw: string): Promise<Direct | null> {
  const t = strip(raw);
  if (t.length > 160) return null;
  if (!/\b(ma semaine|cette semaine)\b/.test(t) || !/\b(tete|moral|mental|esprit|journal|dans ma tete|passee?|bilan)\b/.test(t) || /\b(sport|salle|seance|clients?|fik|chiffre|argent|voiture)\b/.test(t)) return null;
  const { espritTool } = await import('./mon-esprit.js');
  return { text: await espritTool({ action: 'semaine' }), direct: true };
}

/** 🤔 « je suis pas allé m'entraîner aujourd'hui… c'est mauvais ? » (04/11 : « aucune séance programmée » alors qu'il l'avait annulée) */
async function skipJudge(raw: string): Promise<Direct | null> {
  const t = strip(raw);
  if (t.length > 400) return null;
  if (!/\b(pas (ete|alle|aller|fait)|rate|saute|zappe)\b[^.?!]{0,30}\b(entrainer|salle|sport|seance|muscu)/.test(t) && !/\b(entrainer|salle|sport|seance)\b[^.?!]{0,40}\b(c'?est (mauvais|grave|pas bien)|tu en penses quoi|ca va\b)/.test(t)) return null;
  const { sportCoachTool } = await import('./sport-coach.js');
  const [today, tomorrow] = await Promise.all([sportCoachTool({ action: 'session', date: 'today' }).catch(() => ''), sportCoachTool({ action: 'session', date: 'demain' }).catch(() => '')]);
  const food = await import('./forme-food.js').then(async f => { const b = await f.foodBudget('kouider'); return `mangé ${b.eaten.kcal}/${b.target} kcal, protéines ${b.eaten.p}/${b.proteinGoal} g`; }).catch(() => '');
  return { text: `FAITS RÉELS : AUJOURD'HUI → ${today.replace(/\n/g, ' ')} | DEMAIN → ${tomorrow.split('\n')[0]} | Repas du jour : ${food}.\n`
    + "CONSIGNE : réponds HONNÊTEMENT à « c'est mauvais ? » avec ces faits : si la séance a été annulée par lui, dis-le (« tu l'avais annulée hier pour te reposer ») ; juge sa SEMAINE (faites / prévues), pas un seul jour ; dis ce qui compte un jour de repos pour sa sèche (rester en déficit, protéines du jour à finir : donne le chiffre qui manque, marche) ; si plusieurs séances s'enchaînent ensuite, préviens. Court (4-5 phrases), sans culpabiliser.", direct: false };
}

/** Le premier qui reconnaît la phrase. direct = réponse sans le cerveau. */
/** 🎨🛠️ « crée-moi une image… » / « ajoute-toi une fonction… » (04/11 banc : le petit cerveau répondait « je n'ai pas d'outil »
 * alors que generate_image / transform_image / se_coder existent) → consigne au cerveau : lance le bon outil. */
async function toolIntent(raw: string): Promise<Direct | null> {
  const t = strip(raw);
  if (t.length > 300) return null;
  if (/\b(cree|creer|genere|generer|fais|fait|faire|dessine|dessiner|imagine)\b[^.?!]{0,15}\b(une?|des)\s+(image|photo|dessin|visuel|affiche|illustration|logo)s?\b/.test(t))
    return { text: "CONSIGNE : Kouider veut une image → lance l'outil MAINTENANT : une voiture de NOTRE flotte citée (clio, fiat, duster…) = transform_image avec car_name (vraie photo) ; sinon generate_image avec une description détaillée. Ne dis JAMAIS « je n'ai pas d'outil » ; si l'outil échoue, dis-le tel quel.", direct: false };
  if (/\b(ajoute|rajoute|code|programme|cree|apprends|fais)[- ]?(toi|te)\b|\b(tu peux|tu pourrais|tu devrais) (te coder|t'?ajouter|apprendre a)|\bameliore[- ]toi\b|\b(ajoute|rajoute) (une|la) (fonction|option|fonctionnalite)\b/.test(t))
    return { text: "CONSIGNE : Kouider demande une nouvelle capacité pour Dzaryx → outil se_coder (action add, sa demande mot pour mot) = l'atelier la code cette nuit. Dis-lui que c'est noté pour l'atelier de cette nuit (PAS que c'est déjà fait). Ne dis JAMAIS « je n'ai pas d'outil ».", direct: false };
  if (/\b(programme|planning|itineraire|circuit|plan)\b[^.?!]{0,25}\b\d+\s*(jours?|j)\b|\b(week-?end|sejour|vacances)\b[^.?!]{0,30}\b(programme|planning|quoi faire|idees?)\b/.test(t))
    return { text: "CONSIGNE : écris le programme COMPLET directement dans ta réponse (jour par jour, matin / après-midi / soir, vrais lieux qui existent, adapté à qui vient — ex. enfant en bas âge = sieste, coins calmes). Ne promets AUCUN Google Doc / PDF / « je te prépare » sans appeler l'outil dans ce même tour. Ne parle PAS de FIK (ni logement, ni voiture, ni clients) s'il ne l'a pas demandé. Style simple et propre : aucun mot vulgaire ni étranger bricolé.", direct: false };
  // 04/11 banc : « différence entre je veux et je souhaite » → exemple « je veux cette voiture » (FIK glissé partout)
  if (t.length < 250 && /\b(difference entre|explique[- ]moi|ca veut dire quoi|que veut dire|c'est quoi (le|la|un|une) (mot|verbe|expression|difference)|comment on dit|traduis|traduction|conjugue|synonyme|orthographe|grammaire|definition)\b/.test(t)
      && !/\b(fik|voiture|client|resa|reservation|location|prospect|site|clio|fiat|duster)\b/.test(t))
    return { text: "CONSIGNE : question générale (langue / culture) → réponds clairement avec des exemples de la vie de tous les jours (famille, travail, courses). AUCUN exemple de voiture, client, réservation ou FIK. Style propre, aucun mot vulgaire.", direct: false };
  return null;
}

export async function frCommand(raw: string, sessionId = 'telegram_kouider'): Promise<Direct | null> {
  SID = sessionId;
  const msg = raw.replace(/^\s*\[[\s\S]*?\]\s*/, '').trim();
  if (!msg) return null;
  for (const f of [sharePub, pubTiktok, craving, noSales, carKm, formeBilan, sportSkip, water, rentalCount, rentalTotal, mindWeek, privacy, reminder, rdv, dnd, dispoAt, sleep, couple, weather, islamicDates, flight, salary, financePlans, fikRevenue, siteVisits, bodyEta, skipJudge, toolIntent, businessAdvice]) {
    const r = await f(msg).catch(e => ({ text: `❌ ${e instanceof Error ? e.message : e}`, direct: true }));
    if (r) return r;
  }
  return null;
}
