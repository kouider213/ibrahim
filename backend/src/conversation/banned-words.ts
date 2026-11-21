// 21/11 18h59 : « Plus jamais tu m'appelle mon rebeu » → le cerveau a compris « ne m'appelle plus (au téléphone) »,
// a répondu « j'ai annulé ton appel » sans outil → « ⚠️ Je n'ai pas exécuté cette action ».
// Ici : le CODE comprend « ne m'appelle plus X / arrête de dire X », garde X dans une liste,
// le retire de TOUT ce qui part (cerveau, messages programmés, Telegram) et le rappelle à chaque cerveau.
import { kvGet, kvSet } from '../integrations/app-store.js';

const KEY = 'kouider:banned_words';
let cache: string[] = [];
let loadedAt = 0;

export async function loadBanned(force = false): Promise<string[]> {
  if (!force && Date.now() - loadedAt < 60_000) return cache;
  try {
    const v = await kvGet(KEY);
    const arr = v ? JSON.parse(v) : [];
    cache = Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string' && !!x.trim()) : [];
  } catch { /* garde l'ancien cache */ }
  loadedAt = Date.now();
  return cache;
}

async function save(list: string[]): Promise<void> {
  cache = [...new Set(list.map(w => w.trim()).filter(Boolean))];
  loadedAt = Date.now();
  await kvSet(KEY, JSON.stringify(cache));
}

const L = 'a-zà-ÿœæ0-9';
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/['’]/g, "['’]").replace(/\s+/g, '\\s+');

/** Ce qui suit « m'appelle(s) plus » mais qui parle de COUPS DE FIL, pas d'un surnom */
const CALL_CONTEXT = /^(au\s+t[ée]l|par\s+t[ée]l|le\s+(matin|soir|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|week)|la\s+nuit|ce\s+(soir|matin)|cette\s+nuit|demain|aujourd|avant|apr[èe]s|pendant|quand|si\s|sauf|pour\s|sur\s|en\s|à\s|a\s\d|vers|entre|d[eè]s|tant|jusqu|\d|tous?\s+les|chaque|jamais$|plus$|pas$|,|\.|!|\?)/i;

function cleanTarget(raw: string): string | null {
  let x = raw.trim().replace(/^[«"“'’:,\s]+|[»"”'’.!?…,;\s]+$/g, '').replace(/^comme\s+[çc]a\s*:?\s*/i, '').trim();
  x = x.replace(/[«»"“”]/g, '').trim();
  if (!x || x.length > 40 || x.split(/\s+/).length > 4) return null;
  if (CALL_CONTEXT.test(x)) return null;
  return x.toLowerCase();
}

export type BanRequest = { kind: 'ban' | 'unban'; word: string };

/** « plus jamais tu m'appelles mon rebeu », « ne m'appelle plus chef », « arrête de m'appeler frérot », « ne dis plus « mon rebeu » » */
export function detectBanRequest(text: string): BanRequest | null {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length > 160) return null;
  const unban = /(?:tu\s+peux|tu\s+as\s+le\s+droit\s+de)\s+(?:re)?m['’]\s?appeler\s+(?:de\s+nouveau\s+|à\s+nouveau\s+)?(.+)$/i.exec(t);
  if (unban) { const w = cleanTarget(unban[1]); return w ? { kind: 'unban', word: w } : null; }
  const pats = [
    /(?:plus\s+jamais|jamais\s+plus)\s+(?:tu\s+)?(?:ne\s+)?m['’]\s?appell?e[sz]?\s+(?:plus\s+)?(.+)$/i,
    /(?:ne\s+|n['’]\s?)?m['’]\s?appell?e[sz]?\s+(?:plus|pas|jamais)(?:\s+jamais)?\s+(.+)$/i,
    /(?:tu\s+)?(?:ne\s+)?m['’]\s?appell?e[sz]?\s+plus\s+jamais\s+(.+)$/i,
    /appelle[sz]?[- ]moi\s+(?:plus|pas|jamais)(?:\s+jamais)?\s+(.+)$/i,
    /(?:arr[êe]te|arretes?|stop)\s+(?:de\s+)?m['’]\s?appeler\s+(.+)$/i,
    /je\s+(?:ne\s+)?veux\s+(?:plus|pas)\s+que\s+tu\s+m['’]\s?appell?es?\s+(.+)$/i,
    /(?:ne\s+|n['’]\s?)?(?:dis|[ée]cris|utilise)\s+(?:plus|jamais)(?:\s+jamais)?\s+(?:le\s+mot\s+)?[«"“](.+?)[»"”]/i,
    /(?:arr[êe]te|stop)\s+(?:de\s+)?(?:dire|[ée]crire)\s+[«"“](.+?)[»"”]/i,
  ];
  for (const p of pats) {
    const m = p.exec(t);
    if (!m) continue;
    const w = cleanTarget(m[1]);
    if (w) return { kind: 'ban', word: w };
    return null;   // « ne m'appelle plus le soir » = coups de fil → au cerveau
  }
  return null;
}

export async function applyBanRequest(r: BanRequest): Promise<string> {
  const list = await loadBanned(true);
  if (r.kind === 'unban') {
    await save(list.filter(w => w !== r.word));
    return `D'accord, « ${r.word} » n'est plus interdit.`;
  }
  await save([...list, r.word]);
  return `Compris, je ne t'appellerai plus jamais « ${r.word} ». C'est enregistré partout : messages, coach, appels. Désolé.`;
}

/** Retire les mots interdits d'un texte (cache synchrone ; appeler loadBanned() avant pour qu'il soit frais). */
export function scrubBanned(text: string, list: string[] = cache): string {
  if (!text || !list.length) return text;
  if (!hasBanned(text, list)) return text;
  let out = text;
  for (const w of list) {
    const re = new RegExp(`(^|[^${L}])\\s*[,–-]?\\s*${esc(w)}(?![${L}])\\s*`, 'gi');
    out = out.replace(re, (_m, pre: string) => `${pre} `);
  }
  return out
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+([.,;:])/g, '$1')
    .replace(/([,;])\s*([!?.])/g, ' $2').replace(/ \./g, '.')
    .replace(/^[ \t,;]+/gm, '')
    .replace(/^([a-zà-ÿ])/gm, (_m, b: string) => b.toUpperCase())
    .replace(/ +$/gm, '');
}

export function bannedFact(list: string[] = cache): string {
  if (!list.length) return '';
  return `INTERDIT PAR KOUIDER : ne l'appelle JAMAIS et n'écris JAMAIS ${list.map(w => `« ${w} »`).join(', ')} (ni variante). Appelle-le Kouider.`;
}

export function hasBanned(text: string, list: string[] = cache): boolean {
  return list.some(w => new RegExp(`(^|[^${L}])${esc(w)}(?![${L}])`, 'i').test(text));
}
