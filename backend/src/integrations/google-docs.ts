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
    return `📄 Google Doc créé : « ${title} »\nhttps://docs.google.com/document/d/${id}/edit`;
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
