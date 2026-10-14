import axios from 'axios';
import { supabase } from './supabase.js';
import { env } from '../config/env.js';

// Lecture + envoi (après accord de Kouider) des boîtes Gmail de Kouider via OAuth (le compte de service ne peut pas lire un @gmail.com).
// Tokens stockés dans google_oauth_tokens sous la clé "gmail:<adresse>" pour ne pas écraser ceux de l'agenda.

const GMAIL_BASE       = 'https://gmail.googleapis.com/gmail/v1/users/me';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE_READ       = 'https://www.googleapis.com/auth/gmail.readonly';
const SCOPE_SEND       = 'https://www.googleapis.com/auth/gmail.send';
// drive.file : seulement les Docs/Sheets créés par Dzaryx (pas d'accès au reste du Drive)
export const SCOPE_DRIVE_FILE = 'https://www.googleapis.com/auth/drive.file';
const GMAIL_SCOPE      = `${SCOPE_READ} ${SCOPE_SEND} ${SCOPE_DRIVE_FILE}`;
// Même callback que l'agenda → aucune nouvelle URI à déclarer dans Google Cloud
const REDIRECT_URI     = () => env.GOOGLE_REDIRECT_URI ?? 'https://ibrahim-backend-production.up.railway.app/api/calendar/callback';
export const GMAIL_STATE_PREFIX = 'gmail:';

export type GmailAccount = 'perso' | 'pro';

export function gmailAddress(account: GmailAccount): string {
  return account === 'pro' ? 'fikconciergerie@gmail.com' : (env.PERSONAL_GCAL_ID ?? 'kouiderpablo@gmail.com');
}

const tokenKey = (address: string) => `${GMAIL_STATE_PREFIX}${address.toLowerCase()}`;

// ── OAuth ─────────────────────────────────────────────────────

export function getGmailAuthUrl(account: GmailAccount): string {
  const address = gmailAddress(account);
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID ?? '', response_type: 'code',
    redirect_uri: REDIRECT_URI(), scope: GMAIL_SCOPE,
    access_type: 'offline', prompt: 'consent', login_hint: address,
    state: tokenKey(address),
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/** Lien court et fixe (redirige vers Google) — les LLM recopient mal la longue URL OAuth. */
export function getGmailConnectLink(): string {
  return REDIRECT_URI().replace(/\/callback$/, '/gmail-connect');
}

/** Échange le code OAuth ; retourne l'adresse réellement connectée, ou null. */
export async function exchangeGmailCode(code: string): Promise<string | null> {
  try {
    const { data } = await axios.post(GOOGLE_TOKEN_URL, new URLSearchParams({
      code, grant_type: 'authorization_code',
      client_id:     env.GOOGLE_CLIENT_ID     ?? '',
      client_secret: env.GOOGLE_CLIENT_SECRET ?? '',
      redirect_uri:  REDIRECT_URI(),
    }).toString(), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });

    // L'utilisateur a pu choisir un autre compte que celui suggéré → on lit l'adresse réelle
    const { data: profile } = await axios.get(`${GMAIL_BASE}/profile`, {
      headers: { Authorization: `Bearer ${data.access_token as string}` },
    });
    const address = String(profile.emailAddress);

    await supabase.from('google_oauth_tokens').upsert({
      email: tokenKey(address), access_token: data.access_token as string,
      refresh_token: data.refresh_token as string, token_type: 'Bearer',
      expires_at: new Date(Date.now() + (data.expires_in as number) * 1000).toISOString(),
      scope: data.scope as string, updated_at: new Date().toISOString(),
    }, { onConflict: 'email' });
    return address;
  } catch (err) {
    console.error('[gmail] OAuth exchange failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

async function getGmailToken(address: string): Promise<string | null> {
  const { data } = await supabase
    .from('google_oauth_tokens').select('access_token, refresh_token, expires_at')
    .eq('email', tokenKey(address)).maybeSingle();
  if (!data) return null;
  const token = data as { access_token: string; refresh_token: string; expires_at: string };
  if (Date.now() < new Date(token.expires_at).getTime() - 60_000) return token.access_token;
  try {
    const { data: r } = await axios.post(GOOGLE_TOKEN_URL, new URLSearchParams({
      grant_type: 'refresh_token', refresh_token: token.refresh_token,
      client_id: env.GOOGLE_CLIENT_ID ?? '', client_secret: env.GOOGLE_CLIENT_SECRET ?? '',
    }).toString(), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    await supabase.from('google_oauth_tokens').update({
      access_token: r.access_token as string,
      expires_at: new Date(Date.now() + (r.expires_in as number) * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('email', tokenKey(address));
    return r.access_token as string;
  } catch (err) {
    console.error('[gmail] Token refresh failed:', err instanceof Error ? err.message : err);
    return null;  // refresh token révoqué/expiré → il faut reconnecter
  }
}

// ── Lecture ───────────────────────────────────────────────────

export interface EmailSummary {
  id: string; from: string; subject: string; date: string; snippet: string; unread: boolean;
}

export class GmailNotConnectedError extends Error {}

async function gmailGet<T>(address: string, path: string, params?: Record<string, unknown>): Promise<T> {
  const token = await getGmailToken(address);
  if (!token) throw new GmailNotConnectedError(address);
  const { data } = await axios.get<T>(`${GMAIL_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` }, params, timeout: 15_000,
    paramsSerializer: { indexes: null },  // metadataHeaders=From&metadataHeaders=Subject…
  });
  return data;
}

type Header = { name: string; value: string };
const header = (headers: Header[] | undefined, name: string) =>
  headers?.find(h => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';

export async function listEmails(
  account: GmailAccount, opts: { query?: string; max?: number; unreadOnly?: boolean } = {},
): Promise<EmailSummary[]> {
  const address = gmailAddress(account);
  const q = [opts.query, opts.unreadOnly ? 'is:unread' : '', 'in:inbox'].filter(Boolean).join(' ');
  const list = await gmailGet<{ messages?: { id: string }[] }>(address, '/messages', {
    q, maxResults: Math.min(Math.max(opts.max ?? 10, 1), 25),
  });
  const ids = (list.messages ?? []).map(m => m.id);
  return Promise.all(ids.map(async id => {
    const m = await gmailGet<{ id: string; snippet: string; labelIds?: string[]; payload?: { headers?: Header[] } }>(
      address, `/messages/${id}`, { format: 'metadata', metadataHeaders: ['From', 'Subject', 'Date'] });
    return {
      id: m.id,
      from: header(m.payload?.headers, 'From'),
      subject: header(m.payload?.headers, 'Subject') || '(sans objet)',
      date: header(m.payload?.headers, 'Date'),
      snippet: m.snippet ?? '',
      unread: m.labelIds?.includes('UNREAD') ?? false,
    };
  }));
}

interface Part { mimeType?: string; body?: { data?: string }; parts?: Part[] }

function decodeB64Url(s: string): string {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8');
}

function extractBody(part: Part | undefined): { text: string; html: string } {
  const out = { text: '', html: '' };
  if (!part) return out;
  if (part.body?.data) {
    if (part.mimeType === 'text/plain') out.text += decodeB64Url(part.body.data);
    else if (part.mimeType === 'text/html') out.html += decodeB64Url(part.body.data);
  }
  for (const p of part.parts ?? []) {
    const sub = extractBody(p);
    out.text += sub.text;
    out.html += sub.html;
  }
  return out;
}

function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>|<\/p>|<\/div>|<\/tr>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n').trim();
}

export async function readEmail(account: GmailAccount, id: string, maxChars = 6000) {
  const address = gmailAddress(account);
  const m = await gmailGet<{ id: string; payload?: Part & { headers?: Header[] } }>(
    address, `/messages/${encodeURIComponent(id)}`, { format: 'full' });
  const { text, html } = extractBody(m.payload);
  let body = (text.trim() || htmlToText(html)).trim();
  const truncated = body.length > maxChars;
  if (truncated) body = body.slice(0, maxChars);
  return {
    id: m.id,
    from: header(m.payload?.headers, 'From'),
    to: header(m.payload?.headers, 'To'),
    subject: header(m.payload?.headers, 'Subject') || '(sans objet)',
    date: header(m.payload?.headers, 'Date'),
    body, truncated,
  };
}

// ── Envoi ─────────────────────────────────────────────────────

/** Jeton du compte Google pour une permission donnée (Docs/Sheets…) ; null si absent ou permission non accordée. */
export async function getGoogleUserToken(account: GmailAccount, scope: string): Promise<string | null> {
  const { data } = await supabase
    .from('google_oauth_tokens').select('scope')
    .eq('email', tokenKey(gmailAddress(account))).maybeSingle();
  if (!(data as { scope?: string } | null)?.scope?.includes(scope)) return null;
  return getGmailToken(gmailAddress(account));
}

export class GmailSendNotAllowedError extends Error {}

/** Vrai si le jeton stocké inclut la permission d'envoi (sinon il faut reconnecter). */
export async function canSendEmail(account: GmailAccount): Promise<boolean> {
  const { data } = await supabase
    .from('google_oauth_tokens').select('scope')
    .eq('email', tokenKey(gmailAddress(account))).maybeSingle();
  return Boolean((data as { scope?: string } | null)?.scope?.includes(SCOPE_SEND));
}

const encodeHeader = (v: string) =>
  /^[\x20-\x7e]*$/.test(v) ? v : `=?UTF-8?B?${Buffer.from(v, 'utf-8').toString('base64')}?=`;

/** Nombre de mails envoyés aujourd'hui depuis la boîte (compté dans Gmail → exact même après redémarrage). */
export async function countSentToday(account: GmailAccount): Promise<number> {
  const address = gmailAddress(account);
  const d = new Date();
  const after = `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
  const r = await gmailGet<{ messages?: unknown[] }>(address, '/messages', { q: `in:sent after:${after}`, maxResults: 100 });
  return r.messages?.length ?? 0;
}

export interface ThreadRef { threadId: string; inReplyTo: string }

// Adresse pro au nom du site (hébergée chez Zoho). Utilisée comme expéditeur dès qu'elle est ajoutée et
// validée dans Gmail (Paramètres → Comptes → « Envoyer des e-mails en tant que ») ; sinon l'adresse Gmail.
export const PRO_ALIAS = 'contact@fikconciergerie.com';
const SENDER_NAME = 'FIK Conciergerie';
let aliasCache: { ok: boolean; at: number } | null = null;

/** Vrai si contact@fikconciergerie.com est validée comme adresse d'envoi dans la boîte pro (vérifié toutes les heures). */
export async function proAliasReady(): Promise<boolean> {
  if (aliasCache && Date.now() - aliasCache.at < 3600_000) return aliasCache.ok;
  try {
    const r = await gmailGet<{ sendAs?: Array<{ sendAsEmail: string; verificationStatus?: string }> }>(gmailAddress('pro'), '/settings/sendAs');
    const ok = (r.sendAs ?? []).some(a => a.sendAsEmail.toLowerCase() === PRO_ALIAS && a.verificationStatus === 'accepted');
    aliasCache = { ok, at: Date.now() };
  } catch {
    // Erreur passagère (réseau, quota) : on garde le dernier état connu et on réessaie dans 5 min,
    // au lieu de repasser une heure entière sur l'adresse Gmail
    aliasCache = { ok: aliasCache?.ok ?? true, at: Date.now() - 3300_000 };
  }
  return aliasCache.ok;
}

/** Adresse qui apparaît chez le destinataire pour les mails de la boîte pro. */
export async function proSenderAddress(): Promise<string> {
  return (await proAliasReady()) ? PRO_ALIAS : gmailAddress('pro');
}

export async function sendEmail(
  account: GmailAccount, mail: { to: string; subject: string; body: string; reply?: ThreadRef; replyTo?: string },
): Promise<{ id: string; threadId: string }> {
  const address = gmailAddress(account);
  if (!(await canSendEmail(account))) throw new GmailSendNotAllowedError(address);
  const token = await getGmailToken(address);
  if (!token) throw new GmailNotConnectedError(address);
  const sender = account === 'pro' ? await proSenderAddress() : address;
  const from = account === 'pro' ? `${SENDER_NAME} <${sender}>` : address;
  const raw = [
    `From: ${from}`,
    // Envoi depuis contact@ (Zoho, sans transfert) : les réponses reviennent dans la boîte Gmail que Dzaryx surveille
    // replyTo (ex. visiteur d'un site client) : adresse simple déjà validée, sans retour à la ligne
    ...(mail.replyTo && /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/.test(mail.replyTo) ? [`Reply-To: ${mail.replyTo}`]
      : sender !== address ? [`Reply-To: ${SENDER_NAME} <${address}>`] : []),
    `To: ${mail.to}`,
    `Subject: ${encodeHeader(mail.subject)}`,
    // Réponse : ces en-têtes + threadId → le mail reste dans la même conversation chez le destinataire
    ...(mail.reply ? [`In-Reply-To: ${mail.reply.inReplyTo}`, `References: ${mail.reply.inReplyTo}`] : []),
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(mail.body, 'utf-8').toString('base64').replace(/.{76}/g, '$&\r\n'),
  ].join('\r\n');
  const { data } = await axios.post<{ id: string; threadId: string }>(`${GMAIL_BASE}/messages/send`,
    { raw: Buffer.from(raw, 'utf-8').toString('base64url'), ...(mail.reply ? { threadId: mail.reply.threadId } : {}) },
    { headers: { Authorization: `Bearer ${token}` }, timeout: 15_000 });
  return { id: data.id, threadId: data.threadId };
}

// ── Suivi des réponses (prospection) ──────────────────────────

export interface InboxMessage {
  id: string; threadId: string; from: string; fromEmail: string; subject: string; messageId: string; date: number;
}

/** Messages reçus (pas ceux envoyés par la boîte), avec leur conversation et leur Message-ID. */
export async function listInboxMessages(account: GmailAccount, query: string, max = 50): Promise<InboxMessage[]> {
  const address = gmailAddress(account);
  const list = await gmailGet<{ messages?: { id: string }[] }>(address, '/messages', {
    q: `${query} -from:me`, maxResults: Math.min(Math.max(max, 1), 100),
  });
  return Promise.all((list.messages ?? []).map(async ({ id }) => {
    const m = await gmailGet<{ id: string; threadId: string; internalDate?: string; payload?: { headers?: Header[] } }>(
      address, `/messages/${id}`, { format: 'metadata', metadataHeaders: ['From', 'Subject', 'Message-ID'] });
    const from = header(m.payload?.headers, 'From');
    return {
      id: m.id, threadId: m.threadId, from,
      fromEmail: (from.match(/<([^>]+)>/)?.[1] ?? from).trim().toLowerCase(),
      subject: header(m.payload?.headers, 'Subject'),
      messageId: header(m.payload?.headers, 'Message-ID'),
      date: Number(m.internalDate ?? 0),
    };
  }));
}

/** Message-ID (en-tête RFC) d'un mail de la boîte — pour y répondre dans la même conversation. */
export async function getMessageIdHeader(account: GmailAccount, id: string): Promise<string> {
  const m = await gmailGet<{ payload?: { headers?: Header[] } }>(
    gmailAddress(account), `/messages/${encodeURIComponent(id)}`, { format: 'metadata', metadataHeaders: ['Message-ID'] });
  return header(m.payload?.headers, 'Message-ID');
}

/** Message-ID du dernier mail d'une conversation (le nôtre pour une relance) — pour rester dans le même fil. */
export async function getThreadLastMessageId(account: GmailAccount, threadId: string): Promise<string> {
  const t = await gmailGet<{ messages?: Array<{ payload?: { headers?: Header[] } }> }>(
    gmailAddress(account), `/threads/${encodeURIComponent(threadId)}`, { format: 'metadata', metadataHeaders: ['Message-ID'] });
  return header(t.messages?.at(-1)?.payload?.headers, 'Message-ID');
}

/** Vrai si la conversation contient un mail ENVOYÉ par la boîte avant ce message → c'est une réponse à un de nos mails. */
export async function isReplyToUs(account: GmailAccount, threadId: string, messageId: string): Promise<boolean> {
  const t = await gmailGet<{ messages?: Array<{ id: string; labelIds?: string[] }> }>(
    gmailAddress(account), `/threads/${encodeURIComponent(threadId)}`, { format: 'minimal' });
  const msgs = t.messages ?? [];
  const idx = msgs.findIndex(m => m.id === messageId);
  return msgs.slice(0, idx < 0 ? msgs.length : idx).some(m => m.labelIds?.includes('SENT'));
}
