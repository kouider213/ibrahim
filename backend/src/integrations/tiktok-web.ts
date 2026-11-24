// TikTok de FIK (fik_conciergerie) lu dans le Chrome du PC cloud (cloudpc/tiktok_web.py) — 24/11, demande de Kouider :
// « je voudrais ceux de TikTok aussi » (messages privés + commentaires). LECTURE SEULE : Dzaryx ne répond jamais sur TikTok.
// Chaque demande → fiche 🎵 TikTok dans DEMANDES (wa-demandes.ts, kv tt:demandes) + Telegram.
import { kvGet, kvSet } from './app-store.js';
import { recordDemande, looksLikeDemande } from './wa-demandes.js';
import { queueTelegramMessage } from '../notifications/tg-outbox.js';
import { emitProactive } from '../notifications/mobile-push.js';

export interface TtItem { kind: 'dm' | 'comment'; name: string; text: string; time?: string; unread?: number; video?: string; backfill?: boolean; at?: string }

const GREETING_RE = /^(slm|salam|salem|salut|bonjour|bonsoir|hello|hi|cc|coucou|السلام|سلام|bjr|bsr)\b/i;

/** Un message privé à un compte de location = presque toujours un client ; un commentaire seulement s'il demande quelque chose. */
export function ttIsDemande(it: TtItem): boolean {
  const t = it.text.trim();
  if (!t) return false;
  if (it.kind === 'dm') return true;
  return looksLikeDemande(t) || /\?|wach|wesh|prix|combien|dispo|tarif|كم|واش/i.test(t) || (GREETING_RE.test(t) && t.length < 25);
}

export async function onTtNew(it: TtItem): Promise<void> {
  if (!it?.name || !ttIsDemande(it)) return;
  const added = await recordDemande('tiktok', it.name, it.text, 'nouveau', { via: it.kind, video: it.video, at: it.at });
  if (!added || it.backfill) return;
  const where = it.kind === 'dm' ? 'message privé' : `commentaire${it.video ? ` (${it.video})` : ''}`;
  const t = `🎵 TikTok — ${it.name} (${where})\n« ${it.text.slice(0, 500)} »\n\n`
    + `Ajouté dans DEMANDES. Réponds-lui depuis l'app TikTok (Dzaryx ne répond pas sur TikTok).`;
  await queueTelegramMessage(t).catch(() => {});
  emitProactive(`TikTok — ${it.name} : ${it.text.slice(0, 70)}`, 'info', t);
}

/** Puzzle anti-robot / déconnexion signalés par le PC cloud : prévenir Kouider au plus une fois toutes les 6 h. */
export async function onTtState(st: { logged_in?: boolean; captcha?: boolean }): Promise<void> {
  const key = st.logged_in === false ? 'tt:alert:logout' : st.captcha ? 'tt:alert:captcha' : '';
  await kvSet('tt:web:logged_in', st.logged_in === false ? '0' : '1').catch(() => {});
  if (!key || await kvGet(key).catch(() => null)) return;
  await kvSet(key, '1', 6 * 3600).catch(() => {});
  const msg = st.logged_in === false
    ? '⚠️ TikTok s\'est déconnecté du PC cloud : je ne vois plus tes messages TikTok. Dis-moi « connecte TikTok » pour un nouveau code QR.'
    : '🧩 TikTok affiche un puzzle anti-robot sur le PC cloud. Ouvre l\'app → MON PC → écran du PC cloud et fais glisser la pièce, sinon je ne vois plus les commentaires TikTok.';
  await queueTelegramMessage(msg, undefined, 'kouider', undefined, true).catch(() => {});
}
