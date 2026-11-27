// TikTok de FIK (fik_conciergerie) lu dans le Chrome du PC cloud (cloudpc/tiktok_web.py) — 24/11, demande de Kouider :
// « je voudrais ceux de TikTok aussi » (messages privés + commentaires). Chaque demande → fiche 🎵 TikTok dans DEMANDES + Telegram.
// 26/11 : « comme avec WhatsApp » → message privé = réponse proposée, « oui » = envoyée sur TikTok par le PC cloud (rien sans son oui).
// Commentaires publics : réponse à copier (pas d'envoi).
import * as CL from './client-lang.js';
import * as ND from './no-dispo.js';
import { kvGet, kvSet } from './app-store.js';
import { recordDemande, looksLikeDemande, listWaDemandes, markDemande, WA_CLOSED } from './wa-demandes.js';
import { cloudEmit, isCloudPcOnline } from '../actions/handlers/cloudpc-relay.js';
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
  const draft = await ttDraft(it).catch(() => '');
  const dm = it.kind === 'dm' && !!draft;
  if (dm) await setTtPending(it.name, draft);
  const fr = await CL.frLines(it.text, draft);   // 26/11 traduction comme WhatsApp
  const t = `🎵 TikTok — ${it.name} (${where})\n« ${it.text.slice(0, 500)} »\n${fr.client}\n`
    + (dm ? `✍️ Réponse prête :\n« ${draft} »\n${fr.reply}\nRéponds « oui » pour l'envoyer sur TikTok, « non » pour laisser, ou dis-moi quoi changer.`
      : (draft ? `✍️ Réponse à copier-coller sous le commentaire :\n${draft}\n\n` : '') + `Ajouté dans DEMANDES.`);
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

/** 24/11 : réponse proposée (Kouider la copie dans TikTok) — mêmes règles que WhatsApp, conditions exactes via l'outil. */
export async function ttDraft(it: TtItem, convo = '', extra = ''): Promise<string> {
  const { runReadOnlyAgent } = await import('./readonly-agent.js');
  // Les conditions EXACTES dans le prompt (24/11 : sans elles, il a écrit « la caution est obligatoire » — FIK n'en demande aucune)
  const cond = await import('./night-guard.js').then(m => m.exactConditions()).catch(() => '');
  const system = `Tu prépares la réponse de FIK Conciergerie (location de voitures à Oran, livraison gratuite à l'aéroport d'Oran) à un ${it.kind === 'dm' ? 'MESSAGE PRIVÉ' : 'COMMENTAIRE PUBLIC'} TikTok. Kouider la copiera lui-même.
Règles : MÊME langue et même alphabet que le client (s'il écrit en français, même avec « salem », réponds en français ; darija en lettres latines → darija en lettres latines ; lettres arabes → lettres arabes), poli, chaleureux, court (1 à 3 phrases), pas de grossièreté.
${CL.langRule(it.text)} Ne promets JAMAIS qu'une voiture est disponible (Kouider vérifie). Conditions EXACTES ci-dessous — n'en cite aucune autre, n'invente rien :
${cond}
 Demande de location → demande les dates (début et fin) et l'âge du conducteur (35 ans minimum). Jamais de prix${it.kind === 'comment' ? ' en public' : ''}. Pour réserver : WhatsApp +32466311469 (écris le numéro tel quel, en chiffres latins).${it.kind === 'comment' ? ' Commentaire public : réponse très courte qui invite à écrire en privé ou sur WhatsApp.' : ''}
${await ND.noDispoRule(it.name)}
Réponds UNIQUEMENT avec le texte de la réponse, rien d'autre.${extra ? `\n${extra}` : ''}`;
  const r = await runReadOnlyAgent(convo
    ? `Discussion privée TikTok avec « ${it.name} » (dans l'ordre ; « FIK » = nous). ${extra ? 'Écris le message de reprise décrit plus haut' : 'Réponds à son DERNIER message'}, sans redemander ce qu'il a déjà donné :\n${convo.slice(-2500)}`
    : `${it.kind === 'dm' ? 'Message privé' : 'Commentaire'} TikTok de « ${it.name} » :\n« ${it.text.slice(0, 800)} »`, { system, sessionId: 'tt_draft', maxRounds: 1, maxTokens: 400 });
  let out = r.text.trim().replace(/^["«]\s*|\s*["»]$/g, '').slice(0, 700);
  if (out && it.text && !CL.replyMatches(it.text, out)) out = await CL.rewriteInLang(out, it.text).catch(() => out);   // 26/11 langue du client
  if (out && ND.claimsAvailability(out) && !(await ND.hasConfirmation(it.name).catch(() => false))) out = ND.checkingText(CL.detectClientLang(it.text || convo), `${it.text} ${convo.slice(-600)}`);   // 26/11 jamais de dispo promise
  return out;
}


// ── 26/11 : répondre aux messages privés TikTok depuis Telegram, comme WhatsApp ─────────────────────────────
type R = { ok: boolean; error?: string; [k: string]: unknown };
const PENDING = 'tt:pending';   // { chat, draft, queue: [noms suivants] } — le prochain message de Kouider (oui / non) décide

export async function setTtPending(chat: string, draft: string, queue: string[] = [], relance = false): Promise<void> {
  await kvSet(PENDING, JSON.stringify({ chat, draft, queue, relance }), 12 * 3600);
  await import('./whatsapp-web.js').then(m => m.clearWaPending()).catch(() => {});   // un seul « oui » en attente à la fois
}
export async function clearTtPending(): Promise<void> { await kvSet(PENDING, '', 60).catch(() => {}); }
/** 27/11 : client traité depuis l'app → son « oui » en attente sur Telegram ne doit plus partir. */
export async function clearTtPendingFor(chat: string): Promise<void> {
  try { const p = JSON.parse((await kvGet(PENDING)) ?? 'null') as { chat?: string } | null; if (p?.chat?.toLowerCase() === chat.toLowerCase()) await clearTtPending(); } catch { /* */ }
}

export interface TtMsg { me: boolean; text: string; when?: string }
/** Discussion privée lue sur le PC cloud (null = injoignable ; [] = introuvable). La lire la marque « lue » sur TikTok. */
export async function readTtChat(chat: string): Promise<TtMsg[] | null> {
  if (!isCloudPcOnline()) return null;
  const r = await cloudEmit<R & { messages?: TtMsg[] }>('cloud:tt', { action: 'read_chat', name: chat }, 120_000).catch(() => null);
  if (!r) return null;
  return r.ok ? r.messages ?? [] : /introuvable/.test(String(r.error)) ? [] : null;
}

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const WDAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
/** Séparateur TikTok (« 24 novembre 2026 11:29 », « 24 novembre 11:29 », « Hier 14:02 », « lundi 14:02 », « 14:02 ») → AAAA-MM-JJ. */
export function ttMsgDate(when: string | undefined, today: string): string | null {
  const w = String(when ?? '').trim().toLowerCase();
  if (!w) return null;
  const add = (n: number) => new Date(Date.parse(`${today}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
  const m = /^(\d{1,2})\s+([a-zéû]+)\.?(?:\s+(\d{4}))?/.exec(w);
  if (m) {
    const mo = MONTHS.findIndex(x => x.startsWith(m[2]!.slice(0, 3)));
    if (mo >= 0) {
      let y = Number(m[3] ?? today.slice(0, 4));
      const iso = (yy: number) => `${yy}-${String(mo + 1).padStart(2, '0')}-${m[1]!.padStart(2, '0')}`;
      if (!m[3] && iso(y) > today) y -= 1;
      return iso(y);
    }
  }
  if (/^(hier|yesterday)/.test(w)) return add(-1);
  const wd = WDAYS.findIndex(x => w.startsWith(x));
  if (wd >= 0) { const tw = new Date(`${today}T12:00:00Z`).getUTCDay(); return add(-(((tw - wd) + 7) % 7 || 7)); }
  if (/^\d{1,2}:\d{2}$/.test(w) || /aujourd/.test(w)) return today;
  return null;
}

/** Lit la discussion sur le PC cloud et prépare la réponse (contexte complet, pas seulement l'aperçu de la liste). */
export async function draftFor(chat: string, preview: string): Promise<{ draft: string; last: string; missing?: boolean }> {
  let convo = '', last = preview;
  if (isCloudPcOnline()) {
    const r = await cloudEmit<R & { messages?: Array<{ me: boolean; text: string }> }>('cloud:tt', { action: 'read_chat', name: chat }, 120_000).catch(() => null);
    if (r && !r.ok && /introuvable/.test(String(r.error))) return { draft: '', last: 'discussion introuvable dans TikTok (pseudo changé ?)', missing: true };
    const msgs = r?.ok ? r.messages ?? [] : [];
    if (msgs.length) {
      convo = msgs.map(m => `${m.me ? 'FIK' : chat} : ${m.text.replace(/\s+/g, ' ').slice(0, 400)}`).join('\n');
      const theirs = msgs.filter(m => !m.me);
      if (msgs[msgs.length - 1]!.me) return { draft: '', last: `déjà répondu (« ${msgs[msgs.length - 1]!.text.slice(0, 120)} »)` };
      last = theirs.slice(-3).map(m => m.text).join(' / ') || preview;
    }
  }
  const draft = await ttDraft({ kind: 'dm', name: chat, text: preview }, convo).catch(() => '');
  return { draft, last };
}

/** Messages privés TikTok encore sans réponse (fiches ouvertes « nouveau », 14 derniers jours). */
async function openDms(): Promise<Array<{ chat: string; text: string }>> {
  return (await listWaDemandes('tiktok'))
    .filter(d => (d.via ?? 'dm') === 'dm' && d.status === 'nouveau' && !WA_CLOSED.has(d.status) && Date.now() - Date.parse(d.updated_at) < 14 * 86_400_000)
    .map(d => ({ chat: d.chat, text: d.text }));
}

async function propose(list: Array<{ chat: string; text: string }>, header = ''): Promise<string> {
  for (let i = 0; i < list.length; i++) {
    const c = list[i]!;
    const { draft, last, missing } = await draftFor(c.chat, c.text.split('\n').pop() || c.text);
    if (missing) { header += `• ${c.chat} : ${last} → regarde-la sur ton téléphone.\n`; continue; }
    if (!draft) { await markDemande(c.chat, 'contacté', ['nouveau'], 'tiktok').catch(() => {}); header += `• ${c.chat} : ${last} → rangé.\n`; continue; }
    const rest = list.slice(i + 1).map(x => x.chat);
    await setTtPending(c.chat, draft, rest);
    const fr = await CL.frLines(last, draft);
    return `${header}🎵 ${c.chat} : « ${last.slice(0, 300)} »\n${fr.client}\n✍️ Réponse prête :\n« ${draft} »\n${fr.reply}\nRéponds « oui » pour l'envoyer sur TikTok, « non » pour passer, ou dis-moi quoi changer.`
      + (rest.length ? `\n(${rest.length} autre${rest.length > 1 ? 's' : ''} après : ${rest.join(', ')})` : '');
  }
  return header ? `${header}\nPlus aucun message TikTok en attente ✅` : '';
}

/** « montre les messages TikTok » : tous les messages privés en attente, réponse proposée un par un. */
export async function showTiktokMessages(): Promise<string> {
  const list = await openDms();
  if (!list.length) return '🎵 Aucun message privé TikTok en attente de réponse. (Les commentaires sont dans l\'app → DEMANDES → 🎵 TikTok.)';
  const head = `🎵 ${list.length} message${list.length > 1 ? 's' : ''} TikTok en attente : ${list.map(x => x.chat).join(', ')}\n\n`;
  return (await propose(list, head)) || head;
}

export async function sendTtReply(chat: string, text: string): Promise<{ ok: boolean; error?: string }> {
  if (!isCloudPcOnline()) return { ok: false, error: 'le PC cloud ne répond pas' };
  const r = await cloudEmit<R>('cloud:tt', { action: 'reply', name: chat, text }, 180_000)
    .catch(err => ({ ok: false, error: err instanceof Error ? err.message : String(err) } as R));
  if (r.ok) await markDemande(chat, 'contacté', ['nouveau'], 'tiktok').catch(() => {});
  return { ok: r.ok, error: r.error };
}

const TT_SHOW_RE = /\b(tik ?tok|tiktok)\b/i;
const SHOW_WORD_RE = /\b(montre|monte|motre|affiche|lis|voir|quels?|r[ée]pond|message|msg|dm)/i;
const YES_RE = /^\s*(oui|ouais|wi|yes|ok|okay|d'?accord|vas[- ]y|envoie(-la|-le)?|go|c'?est bon|parfait|nickel|wah|ih|نعم|واه)(?=$|[\s,.!👍])/i;
const NO_RE = /^\s*(non|no|nan|laisse|annule|passe|suivant|pas maintenant|لا)(?=$|[\s,.!])/i;
const CHANGE_RE = /mais|change|modifi|plut[oô]t|sauf|ajoute|enl[eè]ve|corrige/i;

/** Avant WhatsApp : « montre les messages TikTok » et le oui / non d'une réponse TikTok proposée. null = pas concerné. */
export async function handleTtYesNo(message: string): Promise<{ reply?: string; note?: string } | null> {
  const m = message.trim();
  if (TT_SHOW_RE.test(m) && SHOW_WORD_RE.test(m) && m.length <= 80 && !/\b(pub|vid[ée]o|publi|stat|abonn|post)/i.test(m)) return { reply: await showTiktokMessages() };
  const raw = await kvGet(PENDING).catch(() => null);
  if (!raw) return null;
  let p: { chat: string; draft: string; queue?: string[]; relance?: boolean };
  try { p = JSON.parse(raw); } catch { return null; }
  await clearTtPending();
  // 26/11 : « la Clio est dispo » / « c'est complet » → retenu + réponse réécrite avec ça (même précédé de « oui »)
  if (ND.dispoWords(m)) {
    const nd = await ND.draftFromConfirmation(p.chat, p.draft, `Réponse qu'on allait envoyer à « ${p.chat} » sur TikTok : ${p.draft}`, m).catch(() => '');
    if (nd) {
      await setTtPending(p.chat, nd, p.queue, p.relance);
      return { reply: `📌 Retenu (72 h) : « ${m} »\n\n✍️ Nouvelle réponse pour ${p.chat} :\n« ${nd} »\n${(await CL.frLines('', nd)).reply}\nRéponds « oui » pour l'envoyer sur TikTok, « non » pour passer, ou dis-moi quoi changer.` };
    }
  }
  const short = m.length <= 40 && !CHANGE_RE.test(m);
  const yes = short && YES_RE.test(m), no = short && NO_RE.test(m);
  if (!yes && !no) {
    // « change … / ajoute … / plutôt … » (ou consigne courte) → réécrite ici, toujours en attente de son oui
    // 26/11 « écris-la en darija / en arabe » → réécriture guidée (darija d'Oran)
    const want = /darija|derja|arabe|fran[cç]ais|anglais/i.test(m) ? CL.askedLang(m, '') : null;
    if (want) {
      const nd = await CL.rewriteInLang(p.draft, '', want).catch(() => p.draft);
      if (nd !== p.draft) {
        await setTtPending(p.chat, nd, p.queue, p.relance);
        const fr = await CL.frLines('', nd);
        return { reply: `✍️ Nouvelle réponse pour ${p.chat} :\n« ${nd} »\n${fr.reply}\nRéponds « oui » pour l'envoyer sur TikTok, « non » pour passer, ou dis-moi quoi changer.` };
      }
    }
    if (CHANGE_RE.test(m) || m.length <= 120) {
      const { runReadOnlyAgent } = await import('./readonly-agent.js');
      const r = await runReadOnlyAgent(`Réponse actuelle : « ${p.draft} »\nConsigne de Kouider : « ${m} »`, { sessionId: 'tt_draft', maxRounds: 1, maxTokens: 400,
        system: `Tu réécris la réponse de FIK Conciergerie à un message privé TikTok de « ${p.chat} » selon la consigne de Kouider. Garde la langue, le vouvoiement et ce qui n'est pas concerné. N'invente aucune condition ni prix. Si la consigne n'a rien à voir avec cette réponse, renvoie exactement : AUTRE. Sinon réponds UNIQUEMENT avec le nouveau texte.` }).catch(() => null);
      const t = (r?.text ?? '').trim().replace(/^["«]\s*|\s*["»]$/g, '').slice(0, 900);
      if (t && t !== 'AUTRE') {
        await setTtPending(p.chat, t, p.queue, p.relance);
        return { reply: `✍️ Nouvelle réponse pour ${p.chat} :\n« ${t} »\n\nRéponds « oui » pour l'envoyer sur TikTok, « non » pour passer, ou dis-moi quoi changer.` };
      }
    }
    return null;   // autre sujet : il passe à Dzaryx normalement (« montre les messages tiktok » la repropose)
  }
  const queue = (await openDms()).filter(x => (p.queue ?? []).includes(x.chat));
  // Relance du matin : la suite vient de la file des relances (WhatsApp, site, TikTok)
  const after = async () => p.relance ? await import('./relance-clients.js').then(m => m.nextRelance()).catch(() => '') : `\n\n${await propose(queue)}`;
  if (no) return { reply: `👍 Rien envoyé à ${p.chat}.${await after()}`.trim() };
  const r = await sendTtReply(p.chat, p.draft);
  if (!r.ok) { await setTtPending(p.chat, p.draft, p.queue, p.relance); return { reply: `❌ Pas envoyé sur TikTok à ${p.chat} : ${r.error ?? 'erreur'}. Redis « oui » pour réessayer.` }; }
  return { reply: `✅ Envoyé sur TikTok à ${p.chat}.${await after()}`.trim() };
}
