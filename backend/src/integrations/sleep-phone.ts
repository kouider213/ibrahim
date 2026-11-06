/**
 * 😴 SOMMEIL SANS MONTRE (04/11/2026) — Kouider ne met pas toujours sa montre la nuit, ni toujours d'alarme.
 * Raccourci iPhone « Dzaryx Sommeil » → POST /api/jarvis/sleep {kind:'auto'|'couche'|'leve'} :
 *  - le soir (19h → 3h) : « couché » = DERNIER signal de la soirée (chargeur branché, dernière appli ouverte…) ;
 *  - le matin (4h30 → 13h) : 1er signal = « levé » → nuit = levé − couché − 15 min pour s'endormir.
 * La nuit estimée part dans health:daily (sleep_src 'telephone') comme si la montre l'avait envoyée → coach sommeil,
 * message du réveil, FORME… Si la montre envoie ensuite une vraie nuit, elle remplace l'estimation.
 * Entre 3h et 4h30 (téléphone regardé en pleine nuit) : ignoré.
 */
import { kvJson, kvPut, tg } from './ai-util.js';
import { localNow, localTs } from './morning-routine.js';

const BED_K = 'sleep:phone:bed';      // { at: ISO }
const WOKE_K = 'sleep:phone:woke';    // { date, at }
const FALL_ASLEEP_MIN = 15;
// 06/11 (Kouider : « bonne nuit » à 21h38 alors qu'il dort à 90 % vers 23h-23h30 → nuit gonflée d'1 h) :
// heure de coucher MINIMUM (« enregistre mon sommeil à partir de 22:30 au minimum ») : un « bonne nuit » plus tôt compte à cette heure-là.
const MINBED_K = 'sleep:phone:min_bed';   // 'HH:MM' (défaut 22:30, dit par Kouider)
const DEFAULT_MIN_BED = '22:30';
export async function minBed(): Promise<string> { return (await kvJson<string | null>(MINBED_K, null)) ?? DEFAULT_MIN_BED; }
/** Heure de coucher à enregistrer maintenant : jamais avant son minimum le soir même. */
async function bedAtNow(): Promise<{ iso: string; floored: boolean; min: string }> {
  const { date, hhmm } = localNow();
  const min = await minBed();
  if (hhmm >= '17:00' && hhmm < min) return { iso: new Date(localTs(date, min)).toISOString(), floored: true, min };
  return { iso: new Date().toISOString(), floored: false, min };
}

const hm = (iso: string) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });
const fmtH = (h: number) => `${Math.floor(h)} h ${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;

export async function phoneSleepMark(kindIn: string): Promise<{ ok: true; say: string }> {
  const { date, hhmm } = localNow();
  const nowIso = new Date().toISOString();
  const night = hhmm >= '19:00' || hhmm < '03:00';
  const morning = hhmm >= '04:30' && hhmm < '13:00';
  const kind = /couch|dor|bed|nuit/i.test(kindIn) ? 'couche' : /lev|reveil|réveil|wake/i.test(kindIn) ? 'leve' : night ? 'couche' : morning ? 'leve' : 'rien';

  if (kind === 'couche') {
    const b = await bedAtNow();
    await kvPut(BED_K, { at: b.iso }, 20 * 3600);
    return { ok: true, say: kindIn === 'auto' ? '' : `Bonne nuit 🌙 Coucher noté à ${hm(b.iso)}${b.floored ? ' (ton heure minimum)' : ''}.` };
  }
  if (kind !== 'leve') return { ok: true, say: '' };

  const woke = await kvJson<{ date: string } | null>(WOKE_K, null);
  if (woke?.date === date) return { ok: true, say: '' };   // déjà levé ce matin : les autres signaux ne comptent pas
  await kvPut(WOKE_K, { date, at: nowIso }, 2 * 86_400);
  await kvPut('kouider:woke', { date, hhmm }, 2 * 86_400).catch(() => {});   // FORME : l'activité du jour démarre ici

  const bed = await kvJson<{ at: string } | null>(BED_K, null);
  const raw = bed ? (Date.now() - Date.parse(bed.at)) / 3_600_000 : 0;
  if (!bed || raw < 2 || raw > 14) {
    const msg = `☀️ Réveil noté à ${hm(nowIso)}, mais je n'ai pas ton heure de coucher. Dis-moi « j'ai dormi 7 h » ou « couché à 23h30 » et je calcule.`;
    await tg(msg).catch(() => {});
    return { ok: true, say: msg };
  }
  const sleep = Math.max(0, raw - FALL_ASLEEP_MIN / 60);
  const sleep_h = Math.round(sleep * 10) / 10;
  await kvPut(BED_K, null, 1).catch(() => {});

  // La montre a déjà donné une vraie nuit ce matin → on ne la remplace pas
  const days = await kvJson<Array<{ date: string; sleep_h?: number; sleep_src?: string }>>('health:daily', []);
  const today = days.find(x => x.date === date);
  if (today?.sleep_h && today.sleep_src !== 'telephone') return { ok: true, say: `Bonjour ☀️ La montre a déjà compté ta nuit : ${fmtH(today.sleep_h)}.` };

  await import('./jarvis-hub.js').then(m => m.receiveHealth({ date, sleep_h, sleep_src: 'telephone' }));
  return { ok: true, say: `Bonjour ☀️ Couché à ${hm(bed.at)}, levé à ${hm(nowIso)} → environ ${fmtH(sleep)} de sommeil (estimé sans montre).` };
}

/**
 * 04/11 (Kouider : « je vais envoyer un message à Dzaryx avant de dormir, ex. bonne nuit, et au réveil aussi ») :
 *  - le soir (19h → 4h), « bonne nuit / je vais dormir / je me couche… » = coucher (le dernier compte) ;
 *  - le matin (4h30 → 13h), son 1er message (quel qu'il soit) après un « bonne nuit » = réveil → nuit calculée.
 * Renvoie une réponse directe seulement si le message n'est QUE la salutation ; sinon null (le cerveau répond normalement).
 */
const NIGHT_RE = /\b(bonne nuit+|bonne nui|bone nuit|bn nuit|bne nuit|b nuit|tesbah|tesba7|tasbah|t'?sbah|je (vais|part|pars) (dormir|me coucher|au lit)|je (me couche|dors|vais au lit)|au lit|dodo|(je vais|on va) faire dodo)(?![\wà-ÿ])/i;
const NOT_SLEEP_RE = /\b(pas encore|dors pas|dort pas|(peux|arrive) pas (à |a )?dormir|pas sommeil|insomnie)/i;
const MORNING_RE = /\b(bonjour|bonjoir|sala+m\w*|salut|sbah|sba7|sbah el ?kh?ir|r[ée]v[eé]ill?(?:[ée]e?s?|er|ez)|je me l[èe]ve|je suis (debout|lev[ée])|debout)(?![\wà-ÿ])/i;
export async function sleepFromMessage(text: string): Promise<string | null> {
  // 05/11 : « bonne nuit » avec « [Contexte : ne pas déranger jusqu'à 23h30…] » devant → trop long → coucher pas noté
  let raw = text; for (let i = 0; i < 3; i++) { const m = raw.match(/^\s*\[[\s\S]*?\]\s*/); if (!m) break; raw = raw.slice(m[0].length); }
  const t = raw.trim();
  if (!t || t.length > 400) return null;
  const { date, hhmm } = localNow();
  const short = t.split(/\s+/).length <= 6;
  // Réglages (n'importe quelle heure, fautes comprises : « soleil » = sommeil)
  const n = t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const SLEEPW = '(?:sommeil|soleil|someil|somail|sommeille|coucher|couche|dodo|nuit|heure de dormir)';
  const minM = new RegExp(`${SLEEPW}[^\\d]{0,40}?(\\d{1,2})\\s*[h:]\\s*(\\d{2})?`).exec(n);
  if (minM && /\b(minimum|mini|au plus tot|pas avant|a partir de|apres)\b/.test(n) && /\b(enregistr\w*|not\w*|compt\w*|calcul\w*|met|mets|programm\w*|regl\w*|toujours|jamais)\b/.test(n) && t.length < 200) {
    const H = Number(minM[1]), M = Number(minM[2] ?? 0);
    if (H >= 18 && H <= 23 && M <= 59) {
      const v = `${String(H).padStart(2, '0')}:${String(M).padStart(2, '0')}`;
      await kvPut(MINBED_K, v, 3650 * 86_400);
      const bed = await kvJson<{ at: string } | null>(BED_K, null);   // ce soir déjà noté trop tôt → corrigé tout de suite
      let fix = '';
      if (bed && Date.now() - Date.parse(bed.at) < 12 * 3600_000 && hm(bed.at) < v && hm(bed.at) >= '17:00') { const iso = new Date(localTs(date, v)).toISOString(); await kvPut(BED_K, { at: iso }, 20 * 3600); fix = ` Ce soir corrigé : coucher compté à ${v}.`; }
      return `✅ C'est réglé : un « bonne nuit » avant ${v} compte ton coucher à ${v} minimum (après ${v}, l'heure réelle).${fix} Si tu t'endors plus tard, dis-le au réveil (« endormi à 23h30 ») et je corrige la nuit.`;
    }
  }
  // Ce soir seulement : « compte mon coucher à 23h30 », « je dors à 23h ce soir »
  const tonight = /\b(?:compt\w*|not\w*|enregistr\w*|met|mets)\s+(?:mon\s+|le\s+)?(?:sommeil|soleil|someil|coucher)\s+(?:a|vers|pour)\s*(\d{1,2})\s*[h:]\s*(\d{2})?|\bje (?:dors|vais dormir|me couche)\s+(?:a|vers)\s*(\d{1,2})\s*[h:]\s*(\d{2})?/.exec(n);
  if (tonight && !/minimum|mini\b|au plus tot|pas avant|a partir/.test(n) && (hhmm >= '17:00' || hhmm < '03:00') && t.length < 160) {
    const H = Number(tonight[1] ?? tonight[3]), M = Number(tonight[2] ?? tonight[4] ?? 0);
    if (H <= 23 && M <= 59 && (H >= 18 || H <= 2)) {
      const d = H <= 2 && hhmm >= '17:00' ? new Date(Date.parse(`${date}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10) : date;
      const v = `${String(H).padStart(2, '0')}:${String(M).padStart(2, '0')}`;
      await kvPut(BED_K, { at: new Date(localTs(d, v)).toISOString() }, 20 * 3600);
      return `🌙 Noté : coucher compté à ${v} ce soir. Envoie-moi un message au réveil et je calcule ta nuit.`;
    }
  }
  if ((hhmm >= '19:00' || hhmm < '04:00') && NIGHT_RE.test(t) && !NOT_SLEEP_RE.test(t)) {
    const b = await bedAtNow();
    await kvPut(BED_K, { at: b.iso }, 20 * 3600);
    if (!short) return null;
    return b.floored
      ? `Bonne nuit 🌙 Il est ${hhmm} : je compte ton coucher à ${b.min} (ton heure minimum, tu t'endors rarement avant). Si tu t'endors plus tard, dis-le au réveil (« endormi à 23h30 »).`
      : `Bonne nuit 🌙 Coucher noté à ${hhmm}. Envoie-moi un message au réveil et je calcule ta nuit.`;
  }
  // « couché à 23:30 » le matin (réponse à « je n'ai pas ton heure de coucher ») → nuit calculée par le code, pas par le cerveau
  // (05/11 : le cerveau avait répondu « pour demain (jeudi) » alors qu'on était jeudi)
  const bedM = /\b(?:je me suis\s+|je m'?\s*)?(?:couch[ée]e?s?|endormie?s?|endormi|dormi)\s+(?:vers\s+|a\s+|à\s+)+(\d{1,2})\s*(?:h|:)\s*(\d{2})?/i.exec(t);
  if (bedM && hhmm >= '04:30' && hhmm < '14:00' && t.length < 120) {
    const H = Number(bedM[1]), M = Number(bedM[2] ?? 0);
    if (H > 23 || M > 59) return null;
    const woke = await kvJson<{ date: string; at: string } | null>(WOKE_K, null);
    const wakeIso = woke?.date === date ? woke.at : new Date().toISOString();
    if (woke?.date !== date) await kvPut(WOKE_K, { date, at: wakeIso }, 2 * 86_400);
    const wakeMin = Number(hm(wakeIso).slice(0, 2)) * 60 + Number(hm(wakeIso).slice(3, 5));
    let mins = wakeMin - (H * 60 + M); if (mins <= 0) mins += 1440;
    if (mins < 120 || mins > 14 * 60) return null;
    const sleep_h = Math.round(mins / 6) / 10;
    await kvPut(BED_K, null, 1).catch(() => {});
    await import('./jarvis-hub.js').then(m => m.receiveHealth({ date, sleep_h, sleep_src: 'telephone' }));
    const bedTxt = `${String(H).padStart(2, '0')}:${String(M).padStart(2, '0')}`;
    const tip = sleep_h < 6.5 ? ' Nuit courte : vas-y doucement aujourd\'hui et couche-toi plus tôt ce soir.' : sleep_h >= 7 ? ' Belle nuit 💪' : '';
    return `✅ Noté : ${fmtH(mins / 60)} de sommeil (couché ${bedTxt} → réveil ${hm(wakeIso)}).${tip}`;
  }
  if (hhmm >= '04:30' && hhmm < '13:00') {
    const woke = await kvJson<{ date: string } | null>(WOKE_K, null);
    if (woke?.date === date) return null;
    const bed = await kvJson<{ at: string } | null>(BED_K, null);
    if (!bed && !MORNING_RE.test(t)) return null;       // pas de « bonne nuit » hier : seul un vrai « bonjour » compte comme réveil
    const r = await phoneSleepMark('leve');
    return short && MORNING_RE.test(t) ? r.say : null;
  }
  return null;
}
