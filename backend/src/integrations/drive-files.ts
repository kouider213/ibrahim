import axios from 'axios';
import { kvGet, kvSet } from './app-store.js';
import { token as driveToken } from './google-docs.js';

// Dépôt d'un fichier dans le Drive pro (permission drive.file : Dzaryx ne voit que ce qu'il a créé), dans un dossier
// créé une fois et retenu dans app_kv. Utilisé par le PC cloud (téléchargements copiés automatiquement).

const DRIVE = 'https://www.googleapis.com/drive/v3/files';

async function folderId(headers: Record<string, string>, name: string): Promise<string> {
  const key = `drive:folder:${name}`;
  const cached = await kvGet(key).catch(() => null);
  if (cached) {
    const ok = await axios.get(`${DRIVE}/${cached}`, { headers, params: { fields: 'id,trashed' }, timeout: 15_000 })
      .then(r => !(r.data as { trashed?: boolean }).trashed).catch(() => false);
    if (ok) return cached;
  }
  const { data } = await axios.post(DRIVE, { name, mimeType: 'application/vnd.google-apps.folder' },
    { headers, params: { fields: 'id' }, timeout: 15_000 });
  const id = (data as { id: string }).id;
  await kvSet(key, id);
  return id;
}

/** Envoie le fichier dans le dossier Drive `folder` → lien d'ouverture. */
export async function uploadFileToDrive(name: string, body: Buffer, folder: string, mime = 'application/octet-stream'): Promise<string> {
  const t = await driveToken();
  if (!t) throw new Error('Drive pro non autorisé');
  const headers = { Authorization: `Bearer ${t}` };
  const parent = await folderId(headers, folder);
  const boundary = `dzx${Date.now()}`;
  const payload = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name, parents: [parent] })}\r\n--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`),
    body,
    Buffer.from(`\r\n--${boundary}--`),
  ]);
  const { data } = await axios.post('https://www.googleapis.com/upload/drive/v3/files', payload, {
    headers: { ...headers, 'Content-Type': `multipart/related; boundary=${boundary}` },
    params: { uploadType: 'multipart', fields: 'id,webViewLink' }, timeout: 120_000, maxBodyLength: Infinity,
  });
  return (data as { webViewLink?: string; id: string }).webViewLink ?? `https://drive.google.com/file/d/${(data as { id: string }).id}/view`;
}
