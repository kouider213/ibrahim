import axios from 'axios';
import { getGoogleUserToken, getGmailConnectLink, gmailAddress, SCOPE_DRIVE_FILE } from './gmail.js';

// Création de Google Docs / Sheets dans le Drive de fikconciergerie@gmail.com (idée reprise de JARVIS).
// Même connexion OAuth que Gmail, avec la permission drive.file (Dzaryx ne voit que ses propres fichiers).

export async function token(): Promise<string | null> {
  return getGoogleUserToken('pro', SCOPE_DRIVE_FILE);
}

export const notConnected = () =>
  `🔗 Il faut d'abord autoriser Dzaryx à créer des Docs/Sheets sur ${gmailAddress('pro')}. Ouvre ce lien et accepte : ${getGmailConnectLink()}\n(Recopie ce lien en entier, en texte brut.)`;

function apiError(err: unknown, what: string): string {
  const status = axios.isAxiosError(err) ? err.response?.status : undefined;
  const msg = axios.isAxiosError(err) ? JSON.stringify(err.response?.data ?? err.message).slice(0, 300) : String(err);
  if (status === 403 && /has not been used|is disabled|SERVICE_DISABLED/i.test(msg)) {
    return `❌ L'API ${what} n'est pas activée dans Google Cloud (projet OAuth de Dzaryx). Active-la puis réessaie.`;
  }
  if (status === 401 || status === 403) return notConnected();
  return `❌ Création ${what} échouée : ${msg}`;
}

/** Id d'un Doc/Sheet Dzaryx à partir de son lien (ou de l'id seul). */
export function googleFileRef(ref: string): { id: string; kind: 'document' | 'spreadsheets' } | null {
  const m = ref.match(/docs\.google\.com\/(document|spreadsheets)\/d\/([\w-]{20,})/);
  if (m) return { id: m[2]!, kind: m[1] as 'document' | 'spreadsheets' };
  return /^[\w-]{20,}$/.test(ref.trim()) ? { id: ref.trim(), kind: 'document' } : null;
}

/** PDF d'un Doc/Sheet (lien d'export : marche avec drive.file, sans l'API Drive). */
export async function exportGooglePdf(id: string, kind: 'document' | 'spreadsheets' = 'document'): Promise<Buffer> {
  const t = await token();
  if (!t) throw new Error(notConnected());
  const { data } = await axios.get(`https://docs.google.com/${kind}/d/${id}/export`,
    { headers: { Authorization: `Bearer ${t}` }, params: { format: 'pdf' }, responseType: 'arraybuffer', timeout: 90_000 });
  const buf = Buffer.from(data as ArrayBuffer);
  if (buf.subarray(0, 4).toString() !== '%PDF') throw new Error('Google n\'a pas renvoyé de PDF');
  return buf;
}

const pdfName = (title: string) => `${title.replace(/[^\p{L}\p{N} _-]+/gu, '').trim().replace(/\s+/g, '_').slice(0, 80) || 'document'}.pdf`;

/** Envoie le Doc/Sheet en fichier PDF sur Telegram (légende = caption). Renvoie false si l'export échoue. */
export async function sendGooglePdfToTelegram(id: string, kind: 'document' | 'spreadsheets', title: string, caption: string): Promise<boolean> {
  try {
    const pdf = await exportGooglePdf(id, kind);
    const { queueTelegramFile } = await import('../actions/handlers/nexus-relay.js');   // import dynamique : évite un cycle
    await queueTelegramFile(pdf.toString('base64'), pdfName(title), caption.slice(0, 1000));
    return true;
  } catch (err) {
    console.warn('[google-docs] PDF → Telegram:', err instanceof Error ? err.message : String(err));
    return false;
  }
}

/** Outil send_doc_pdf : « envoie-le-moi en PDF » pour un Doc/Sheet créé par Dzaryx. */
export async function sendDocPdf(input: Record<string, unknown>): Promise<string> {
  const ref = googleFileRef(String(input['url'] ?? ''));
  if (!ref) return '❌ Donne le lien Google Docs/Sheets du document (docs.google.com/…) à envoyer en PDF.';
  const title = String(input['title'] ?? '').trim() || 'Document Dzaryx';
  const ok = await sendGooglePdfToTelegram(ref.id, ref.kind, title, `📄 ${title}`);
  return ok
    ? `✅ PDF « ${title} » envoyé sur Telegram (il arrive dans quelques secondes).`
    : `❌ Je n'ai pas pu exporter « ${title} » en PDF (document créé par quelqu'un d'autre que Dzaryx, ou connexion Google à refaire). Le lien reste valable : https://docs.google.com/${ref.kind}/d/${ref.id}/edit`;
}

export async function createGoogleDoc(input: Record<string, unknown>): Promise<string> {
  const title = String(input['title'] ?? '').trim() || 'Document Dzaryx';
  const content = String(input['content'] ?? '');
  const t = await token();
  if (!t) return notConnected();
  const headers = { Authorization: `Bearer ${t}` };
  try {
    const { data } = await axios.post('https://docs.googleapis.com/v1/documents', { title }, { headers, timeout: 15_000 });
    const id = (data as { documentId: string }).documentId;
    if (content) {
      await axios.post(`https://docs.googleapis.com/v1/documents/${id}:batchUpdate`,
        { requests: [{ insertText: { location: { index: 1 }, text: content } }] }, { headers, timeout: 15_000 });
    }
    const url = `https://docs.google.com/document/d/${id}/edit`;
    if (input['send_pdf'] === true) {
      const sent = await sendGooglePdfToTelegram(id, 'document', title, `📄 ${title}\n${url}`);
      return `📄 Google Doc créé : « ${title} »\n${url}\n${sent ? '✅ PDF envoyé sur Telegram.' : '⚠️ PDF non envoyé (export refusé).'}`;
    }
    return `📄 Google Doc créé : « ${title} »\n${url}`;
  } catch (err) {
    return apiError(err, 'Google Docs');
  }
}

export async function createGoogleSheet(input: Record<string, unknown>): Promise<string> {
  const title = String(input['title'] ?? '').trim() || 'Tableau Dzaryx';
  const rows = Array.isArray(input['rows'])
    ? (input['rows'] as unknown[]).filter(Array.isArray).map(r => (r as unknown[]).map(c => (c == null ? '' : c)))
    : [];
  const t = await token();
  if (!t) return notConnected();
  const headers = { Authorization: `Bearer ${t}` };
  try {
    const { data } = await axios.post('https://sheets.googleapis.com/v4/spreadsheets',
      { properties: { title } }, { headers, timeout: 15_000 });
    const sheet = data as { spreadsheetId: string; sheets?: Array<{ properties: { title: string } }> };
    if (rows.length) {
      const tab = sheet.sheets?.[0]?.properties.title ?? 'Sheet1';
      await axios.put(
        `https://sheets.googleapis.com/v4/spreadsheets/${sheet.spreadsheetId}/values/${encodeURIComponent(`'${tab}'!A1`)}`,
        { values: rows }, { headers, params: { valueInputOption: 'USER_ENTERED' }, timeout: 15_000 });
    }
    return `📊 Google Sheet créé : « ${title} »${rows.length ? ` (${rows.length} lignes)` : ''}\nhttps://docs.google.com/spreadsheets/d/${sheet.spreadsheetId}/edit`;
  } catch (err) {
    return apiError(err, 'Google Sheets');
  }
}
