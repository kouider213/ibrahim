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
import { localNow } from './morning-routine.js';

const BED_K = 'sleep:phone:bed';      // { at: ISO }
const WOKE_K = 'sleep:phone:woke';    // { date, at }
const FALL_ASLEEP_MIN = 15;

const hm = (iso: string) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });
const fmtH = (h: number) => `${Math.floor(h)} h ${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;

export async function phoneSleepMark(kindIn: string): Promise<{ ok: true; say: string }> {
  const { date, hhmm } = localNow();
  const nowIso = new Date().toISOString();
  const night = hhmm >= '19:00' || hhmm < '03:00';
  const morning = hhmm >= '04:30' && hhmm < '13:00';
  const kind = /couch|dor|bed|nuit/i.test(kindIn) ? 'couche' : /lev|reveil|réveil|wake/i.test(kindIn) ? 'leve' : night ? 'couche' : morning ? 'leve' : 'rien';

  if (kind === 'couche') {
    await kvPut(BED_K, { at: nowIso }, 20 * 3600);
    return { ok: true, say: kindIn === 'auto' ? '' : `Bonne nuit 🌙 Coucher noté à ${hm(nowIso)}.` };
  }
  if (kind !== 'leve') return { ok: true, say: '' };

  const woke = await kvJson<{ date: string } | null>(WOKE_K, null);
  if (woke?.date === date && kindIn === 'auto') return { ok: true, say: '' };   // déjà levé ce matin : les autres signaux ne comptent pas
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
