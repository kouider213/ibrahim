import axios from 'axios';
import { gzipSync } from 'zlib';
import { env } from '../config/env.js';
import { supabase } from './supabase.js';
import { kvGet, kvSet } from './app-store.js';
import { token as driveToken } from './google-docs.js';

// Sauvegarde de toute la base Supabase (le plan gratuit n'en fait aucune).
// - Railway (job db-backup, 3h) : un fichier .json.gz par jour dans le Drive pro, dossier « Dzaryx — Sauvegardes », 30 gardés.
// - VPS (scripts/backup-local.ts, cron 3h30) : même fichier dans /root/backups + copie des photos/documents.
// Les deux écrivent leur dernier passage dans app_kv (backup:last:drive / backup:last:vps), vérifié par l'auto-test.

const PAGE = 1000;
const KEEP = 30;
const FOLDER = 'Dzaryx — Sauvegardes';

export interface BackupDump { gz: Buffer; tables: number; rows: number; failed: string[]; at: string }

/** Liste des tables exposées par l'API REST de Supabase (toutes celles du schéma public). */
export async function listTables(): Promise<string[]> {
  const { data } = await axios.get(`${env.SUPABASE_URL}/rest/v1/`, {
    headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` }, timeout: 20_000,
  });
  return Object.keys((data as { definitions?: Record<string, unknown> }).definitions ?? {}).sort();
}

async function dumpTable(table: string): Promise<unknown[]> {
  const rows: unknown[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from(table).select('*').range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
}

export async function dumpDatabase(): Promise<BackupDump> {
  const at = new Date().toISOString();
  const out: Record<string, unknown[]> = {};
  const failed: string[] = [];
  let rows = 0;
  for (const t of await listTables()) {
    try {
      out[t] = await dumpTable(t);
      rows += out[t].length;
    } catch (err) {
      failed.push(`${t}: ${err instanceof Error ? err.message : String(err)}`.slice(0, 160));
    }
  }
  const tables = Object.keys(out).length;
  if (!tables) throw new Error(`aucune table lue (${failed[0] ?? 'liste vide'})`);
  const gz = gzipSync(Buffer.from(JSON.stringify({ format: 'dzaryx-backup-v1', at, tables: out })));
  return { gz, tables, rows, failed, at };
}

export interface BackupStamp { at: string; tables: number; rows: number; kb: number; failed: number; where: string }

export async function stampBackup(kind: 'drive' | 'vps', d: BackupDump, where: string): Promise<void> {
  const stamp: BackupStamp = { at: d.at, tables: d.tables, rows: d.rows, kb: Math.round(d.gz.length / 1024), failed: d.failed.length, where };
  await kvSet(`backup:last:${kind}`, JSON.stringify(stamp));
}

export async function lastBackup(kind: 'drive' | 'vps'): Promise<BackupStamp | null> {
  const raw = await kvGet(`backup:last:${kind}`).catch(() => null);
  return raw ? JSON.parse(raw) as BackupStamp : null;
}

// ── Google Drive (permission drive.file : Dzaryx ne voit que les fichiers qu'il a créés) ─────────────

const DRIVE = 'https://www.googleapis.com/drive/v3/files';

async function driveFolder(headers: Record<string, string>): Promise<string> {
  const cached = await kvGet('backup:drive:folder').catch(() => null);
  if (cached) {
    const ok = await axios.get(`${DRIVE}/${cached}`, { headers, params: { fields: 'id,trashed' }, timeout: 15_000 })
      .then(r => !(r.data as { trashed?: boolean }).trashed).catch(() => false);
    if (ok) return cached;
  }
  const { data } = await axios.post(DRIVE, { name: FOLDER, mimeType: 'application/vnd.google-apps.folder' },
    { headers, params: { fields: 'id' }, timeout: 15_000 });
  const id = (data as { id: string }).id;
  await kvSet('backup:drive:folder', id);
  return id;
}

export async function uploadToDrive(d: BackupDump): Promise<string> {
  try {
    return await uploadToDriveRaw(d);
  } catch (err) {
    const body = axios.isAxiosError(err) ? JSON.stringify(err.response?.data ?? err.message) : String(err);
    if (/has not been used|is disabled|SERVICE_DISABLED/i.test(body)) {
      const m = body.match(/https:\/\/console\.developers\.google\.com\/apis\/api\/drive\.googleapis\.com\/overview\?project=\d+/);
      throw new Error(`l'API Google Drive n'est pas activée dans le projet Google de Dzaryx — ouvre ${m?.[0] ?? 'console.cloud.google.com → API Google Drive'} et clique « Activer » (copie VPS OK en attendant)`);
    }
    throw new Error(`Drive : ${body.slice(0, 200)}`);
  }
}

async function uploadToDriveRaw(d: BackupDump): Promise<string> {
  const t = await driveToken();
  if (!t) throw new Error('Drive pro non autorisé (permission drive.file manquante) — reconnecte Gmail pro');
  const headers = { Authorization: `Bearer ${t}` };
  const folder = await driveFolder(headers);
  const name = `dzaryx-${d.at.slice(0, 10)}.json.gz`;
  const boundary = `dzx${Date.now()}`;
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name, parents: [folder] })}\r\n--${boundary}\r\nContent-Type: application/gzip\r\n\r\n`),
    d.gz,
    Buffer.from(`\r\n--${boundary}--`),
  ]);
  await axios.post('https://www.googleapis.com/upload/drive/v3/files', body, {
    headers: { ...headers, 'Content-Type': `multipart/related; boundary=${boundary}` },
    params: { uploadType: 'multipart', fields: 'id' }, timeout: 120_000, maxBodyLength: Infinity,
  });
  // Ne garder que les 30 plus récentes.
  const { data } = await axios.get(DRIVE, {
    headers, timeout: 15_000,
    params: { q: `'${folder}' in parents and trashed = false`, orderBy: 'createdTime desc', fields: 'files(id,name)', pageSize: 200 },
  });
  const old = ((data as { files?: Array<{ id: string }> }).files ?? []).slice(KEEP);
  for (const f of old) await axios.delete(`${DRIVE}/${f.id}`, { headers, timeout: 15_000 }).catch(() => {});
  return `Drive pro / ${FOLDER} / ${name}`;
}

/** Job Railway 3h : sauvegarde → Drive. Lève une erreur si ça échoue (le scheduler prévient Kouider). */
export async function jobDbBackup(): Promise<string> {
  const d = await dumpDatabase();
  const where = await uploadToDrive(d);
  await stampBackup('drive', d, where);
  const msg = `${d.tables} tables, ${d.rows} lignes, ${Math.round(d.gz.length / 1024)} Ko → ${where}`;
  if (d.failed.length) console.warn('[db-backup] tables illisibles:', d.failed.join(' | '));
  return msg;
}
