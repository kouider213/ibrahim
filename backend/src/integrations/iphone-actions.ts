/**
 * 📲 DZARYX PILOTE L'IPHONE (17/11/2026)
 * Apple ne donne aucun « accès complet » à une appli : la seule porte = l'app Raccourcis.
 * Le cerveau met des actions en file (outil `iphone`) ; le raccourci « Dzaryx Faire » les récupère
 * (GET /api/jarvis/phone-do, jeton de Kouider obligatoire) et les exécute.
 * Déclenché : juste après une réponse Siri (champ `act`), ou par l'automatisation « Telegram est fermé ».
 *
 * SÉCURITÉ (Kouider 17/11 : « que moi qui ai accès ») :
 *  - la file ne se lit qu'avec le jeton appareil de Kouider (requireOwner) — aucun jeton dans le dépôt public ;
 *  - l'outil refuse toute session qui n'est pas Kouider en direct (Houari, clients WhatsApp, jobs autonomes, tests) ;
 *  - les liens ouverts sont limités à une liste blanche (tel, sms, Waze, Plans, Musique, applis connues) ;
 *  - pas d'envoi de SMS automatique : le SMS est PRÉ-REMPLI, Kouider appuie lui-même sur Envoyer.
 */
import { kvJson, kvPut } from './ai-util.js';
import { PHONE_ACTIONS as ACTIONS, PHONE_APPS, type PhoneDo } from './iphone-tool-def.js';
export type { PhoneDo };

const QUEUE = 'iphone:queue';
const LAST_PULL = 'iphone:last_pull';
const MAX_AGE_MS = 12 * 3600_000;   // une alarme demandée hier soir et jamais récupérée ne doit pas sonner 2 jours après

// Ce que le raccourci reçoit (`do`) : call/sms/navigate/music/app deviennent `open` + url → un seul bloc côté iPhone.
type ShortcutDo = Exclude<PhoneDo, 'call' | 'sms' | 'navigate' | 'music' | 'app'>;
// Tous les champs en TEXTE : plus simple à brancher dans Raccourcis (« Obtenir la valeur du dictionnaire »).
export interface PhoneItem { id: string; do: ShortcutDo; kind: PhoneDo; time?: string; label?: string; minutes?: string; on?: string; level?: string; text?: string; when?: string; url?: string; cmd?: string; at: number }

// Sessions qui ne sont PAS Kouider en direct : Houari, clients/WhatsApp, jobs autonomes, bancs de test.
const DENY_SESSION = /houari|^wa|whatsapp|client|guest|public|site|squad|mission|nightlist|night|factory|mentor|radar|opps|crisis|readonly|habits|projects|savings|total-recall|mode-oran|test|bench|replay|sandbox|cron|job|auto/i;
export const phoneAllowed = (sessionId?: string): boolean => !DENY_SESSION.test(sessionId ?? '');

// Liens autorisés pour `open` (rien d'autre : un lien piégé dans un mail/WhatsApp ne peut pas être ouvert sur son iPhone)
const SAFE_URL = /^(tel:|sms:|facetime:|facetime-audio:|music:|maps:|waze:|https:\/\/(waze\.com|maps\.apple\.com|music\.apple\.com|www\.google\.com\/maps|maps\.google\.com)\/)/i;
const APP_URLS = new Set(Object.values(PHONE_APPS));

const two = (n: number) => String(n).padStart(2, '0');

/** « 5h », « 05:30 », « 6h45 », 5 → « 05:00 » ; null si illisible. */
export function parseClock(v: unknown, minute?: unknown): string | null {
  if (typeof v === 'number' && Number.isFinite(v)) {
    const h = Math.floor(v), m = Number(minute ?? 0) || 0;
    return h >= 0 && h < 24 && m >= 0 && m < 60 ? `${two(h)}:${two(m)}` : null;
  }
  const m = /^\s*(\d{1,2})\s*(?:[:hH.]\s*(\d{1,2})?)?\s*$/.exec(String(v ?? ''));
  if (!m) return null;
  const h = Number(m[1]), mi = Number(m[2] ?? minute ?? 0) || 0;
  return h < 24 && mi < 60 ? `${two(h)}:${two(mi)}` : null;
}

const onOff = (v: unknown): string => (v === false || /^(0|false|off|non|désactive|eteins|éteins|coupe)$/i.test(String(v ?? '').trim()) ? '0' : '1');
const pct = (v: unknown): string | null => { const n = Math.round(Number(v)); return Number.isFinite(n) && n >= 0 && n <= 100 ? String(n) : null; };
const phone = (v: unknown): string | null => { const s = String(v ?? '').replace(/[\s.()-]/g, ''); return /^\+?\d{6,15}$/.test(s) ? s : null; };
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

/** Valide et met en file. Renvoie l'action ou un message d'erreur pour le cerveau. */
export async function queuePhoneAction(input: Record<string, unknown>): Promise<PhoneItem | string> {
  const kind = String(input['action'] ?? input['do'] ?? '').toLowerCase() as PhoneDo;
  if (!ACTIONS.includes(kind)) return `Action inconnue « ${kind} ». Possibles : ${ACTIONS.join(', ')}.`;
  const item: PhoneItem = { id: Math.random().toString(36).slice(2, 10), do: kind as ShortcutDo, kind, at: Date.now() };
  const label = String(input['label'] ?? '').trim().slice(0, 60);
  const text = String(input['text'] ?? '').trim().slice(0, 1000);
  const open = (url: string) => { item.do = 'open'; item.url = url; };
  switch (kind) {
    case 'alarm': {
      const t = parseClock(input['time'] ?? input['hour'], input['minute']);
      if (!t) return 'Heure manquante ou illisible (ex : "05:30").';
      item.time = t; item.label = label || 'Dzaryx'; break;
    }
    case 'timer': {
      const m = Number(input['minutes']);
      if (!Number.isFinite(m) || m <= 0 || m > 24 * 60) return 'Durée du minuteur manquante (minutes).';
      item.minutes = String(Math.round(m * 100) / 100); break;
    }
    case 'focus': case 'silent': case 'torch': case 'wifi': case 'bluetooth': case 'cellular': case 'airplane': case 'low_power': case 'dark_mode':
      item.on = onOff(input['on']); break;
    case 'volume': case 'brightness': {
      const l = pct(input['level']);
      if (l === null) return 'Niveau manquant (0 à 100).';
      item.level = l; break;
    }
    case 'reminder':
      if (!text) return 'Texte du rappel manquant.';
      item.text = text;
      if (input['when']) item.when = String(input['when']).slice(0, 40);   // « 2026-11-18 09:00 » : Raccourcis le lit comme une date
      break;
    case 'note': case 'say': case 'clipboard':
      if (!text) return 'Texte manquant.';
      item.text = text; break;
    case 'shazam': break;
    case 'media': {
      const c = String(input['cmd'] ?? '').toLowerCase();
      if (!['play', 'pause', 'next', 'previous'].includes(c)) return 'cmd = play, pause, next ou previous.';
      item.cmd = c; break;
    }
    case 'call': {
      const n = phone(input['to']); if (!n) return 'Numéro manquant ou invalide (format +33…, +213…). Cherche-le avec tes outils.';
      open(`tel:${n}`); break;
    }
    case 'sms': {
      const n = phone(input['to']); if (!n) return 'Numéro manquant ou invalide (format +33…, +213…).';
      open(`sms:${n}${text ? `&body=${encodeURIComponent(text)}` : ''}`); item.text = text; break;
    }
    case 'navigate':
      if (!text) return 'Adresse manquante.';
      open(`https://waze.com/ul?q=${encodeURIComponent(text)}&navigate=yes`); item.text = text; break;
    case 'music':
      if (!text) return 'Titre ou artiste manquant.';
      open(`music://music.apple.com/search?term=${encodeURIComponent(text)}`); item.text = text; break;
    case 'app': {
      const k = norm(text); const url = PHONE_APPS[k] ?? Object.entries(PHONE_APPS).find(([n]) => norm(n) === k)?.[1];
      if (!url) return `Appli inconnue « ${text} ». Connues : ${Object.keys(PHONE_APPS).join(', ')}.`;
      open(url); item.text = text; break;
    }
    case 'open': {
      const u = String(input['url'] ?? '').trim();
      if (!SAFE_URL.test(u) && !APP_URLS.has(u)) return 'Lien refusé : seulement tel:, sms:, FaceTime, Waze, Plans, Musique ou une appli connue (sécurité).';
      open(u.slice(0, 1000)); break;
    }
  }
  const q = (await kvJson<PhoneItem[]>(QUEUE, [])).filter(x => Date.now() - x.at < MAX_AGE_MS);
  q.push(item);
  await kvPut(QUEUE, q.slice(-20));
  return item;
}

/** Le raccourci récupère tout ce qui attend (et vide la file). */
export async function popPhoneActions(): Promise<PhoneItem[]> {
  const q = (await kvJson<PhoneItem[]>(QUEUE, [])).filter(x => Date.now() - x.at < MAX_AGE_MS);
  await kvPut(QUEUE, []);
  await kvPut(LAST_PULL, Date.now());
  return q;
}

export async function pendingPhoneCount(): Promise<number> {
  return (await kvJson<PhoneItem[]>(QUEUE, [])).filter(x => Date.now() - x.at < MAX_AGE_MS).length;
}

const ONOFF: Partial<Record<PhoneDo, string>> = { focus: 'Ne pas déranger', silent: 'mode silence', torch: 'lampe', wifi: 'Wi-Fi', bluetooth: 'Bluetooth', cellular: 'données cellulaires', airplane: 'mode avion', low_power: 'économie d\'énergie', dark_mode: 'mode sombre' };
function describe(i: PhoneItem): string {
  if (ONOFF[i.kind]) return `${ONOFF[i.kind]} ${i.on === '1' ? 'activé' : 'coupé'}`;
  switch (i.kind) {
    case 'alarm': return `alarme à ${(i.time ?? '').replace(':', 'h')}${i.label && i.label !== 'Dzaryx' ? ` (« ${i.label} »)` : ''}`;
    case 'timer': return `minuteur de ${i.minutes} min`;
    case 'volume': return `volume à ${i.level} %`;
    case 'brightness': return `luminosité à ${i.level} %`;
    case 'reminder': return `rappel « ${i.text} »${i.when ? ` pour ${i.when}` : ''}`;
    case 'note': return 'note créée';
    case 'say': return 'ton iPhone le dit à voix haute';
    case 'clipboard': return 'texte copié';
    case 'shazam': return 'Shazam lancé';
    case 'media': return `musique : ${i.cmd}`;
    case 'call': return `appel vers ${(i.url ?? '').slice(4)}`;
    case 'sms': return 'SMS pré-rempli (il appuie sur Envoyer)';
    case 'navigate': return `Waze vers ${i.text}`;
    case 'music': return `Musique : « ${i.text} »`;
    case 'app': return `ouverture de ${i.text}`;
    default: return 'lien ouvert';
  }
}

/** Outil `iphone` du cerveau. */
export async function iphoneTool(input: Record<string, unknown>, sessionId?: string): Promise<string> {
  if (!phoneAllowed(sessionId)) return '❌ Réservé à Kouider en direct : son iPhone ne se pilote pas depuis cette conversation.';
  const r = await queuePhoneAction(input);
  if (typeof r === 'string') return `❌ ${r}`;
  const lastPull = await kvJson<number>(LAST_PULL, 0);
  const what = describe(r);
  if (!lastPull) return `⏳ Mis en file : ${what}. ATTENTION : le raccourci « Dzaryx Faire » n'a encore jamais été lancé sur son iPhone — dis-lui de l'installer (app Dzaryx › JARVIS › Santé·Siri › « Dzaryx pilote ton iPhone »), sinon rien ne se fera.`;
  // Siri, app et Telegram partagent la session voice_kouider : on ne sait pas d'où il parle → phrase valable partout
  return `✅ ${what} — ton iPhone le fait tout de suite si tu me parles par Siri, sinon dès que tu fermes Telegram. Dis-le-lui en une phrase (« c'est fait, alarme à 5h »).`;
}
