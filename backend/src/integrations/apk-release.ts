import { createHmac, timingSafeEqual } from 'crypto';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { inflateRawSync } from 'zlib';
import axios from 'axios';
import { kvGet, kvSet } from './app-store.js';
import { queueTelegramMessage } from '../notifications/tg-outbox.js';

// Dernier APK construit par GitHub Actions (build-apk.yml) → lien privé signé (jamais public : l'APK contient les clés
// de l'app). Nexus l'appelle au démarrage du PC : il télécharge l'APK dans Téléchargements\Dzaryx et Kouider le reçoit
// une seule fois sur Telegram (compte Dzaryx, via tgcall).

const REPO = 'kouider213/ibrahim';
const GH = 'https://api.github.com';
const API = () => process.env['PUBLIC_API_URL'] ?? 'https://ibrahim-backend-production.up.railway.app';
const secret = () => process.env['SESSION_SECRET'] ?? process.env['WEBHOOK_SECRET'] ?? 'dzaryx';
const LINK_TTL_MS = 3 * 24 * 3600_000;

export interface ApkInfo { run: number; artifactId: number; sha: string; version: string; name: string; sizeMb: number }

const ghHeaders = (auth = false) => ({
  Accept: 'application/vnd.github+json',
  'User-Agent': 'dzaryx-backend',
  ...(auth && process.env['GITHUB_TOKEN'] ? { Authorization: `Bearer ${process.env['GITHUB_TOKEN']}` } : {}),
});

/** Dernier build réussi + son artefact (lecture publique, pas besoin de jeton). */
export async function latestApk(): Promise<ApkInfo | null> {
  const { data } = await axios.get(`${GH}/repos/${REPO}/actions/workflows/build-apk.yml/runs?status=success&per_page=1`, { headers: ghHeaders(), timeout: 10_000 });
  const run = data.workflow_runs?.[0];
  if (!run) return null;
  const arts = (await axios.get(run.artifacts_url, { headers: ghHeaders(), timeout: 10_000 })).data.artifacts as Array<{ id: number; expired: boolean; size_in_bytes: number }>;
  const art = arts.find(a => !a.expired);
  if (!art) return null;
  let version = '';
  try {
    const appJson = (await axios.get(`https://raw.githubusercontent.com/${REPO}/${run.head_sha}/dzaryx-native/app.json`, { timeout: 10_000 })).data;
    version = String(appJson?.expo?.version ?? '');
  } catch { /* nom sans version */ }
  return {
    run: run.run_number, artifactId: art.id, sha: run.head_sha, version,
    name: `Dzaryx${version ? `-v${version}` : ''}-build${run.run_number}.apk`,
    sizeMb: Math.round(art.size_in_bytes / 1_048_576),
  };
}

export function apkLink(run: number): string {
  const exp = Date.now() + LINK_TTL_MS;
  return `${API()}/api/nexus/apk/${run}.${exp}.${createHmac('sha256', secret()).update(`apk:${run}:${exp}`).digest('base64url').slice(0, 22)}`;
}

export function verifyApkToken(token: string): number | null {
  const [r, e, sig] = token.split('.');
  const run = Number(r), exp = Number(e);
  if (!run || !exp || !sig || exp < Date.now()) return null;
  const a = Buffer.from(sig), b = Buffer.from(createHmac('sha256', secret()).update(`apk:${run}:${exp}`).digest('base64url').slice(0, 22));
  return a.length === b.length && timingSafeEqual(a, b) ? run : null;
}

/** Le fichier .apk du build (artefact GitHub = zip d'un seul fichier) — gardé en cache disque. */
export async function apkFile(info: ApkInfo): Promise<Buffer> {
  const cache = `/tmp/dzaryx-apk-${info.run}.apk`;
  if (existsSync(cache)) return readFileSync(cache);
  if (!process.env['GITHUB_TOKEN']) throw new Error('GITHUB_TOKEN manquant');
  const res = await axios.get(`${GH}/repos/${REPO}/actions/artifacts/${info.artifactId}/zip`, {
    headers: ghHeaders(true), responseType: 'arraybuffer', timeout: 180_000, maxContentLength: 300 * 1_048_576,
  });
  const apk = unzipFirst(Buffer.from(res.data));
  writeFileSync(cache, apk);
  return apk;
}

// Lecture minimale d'un zip : premier fichier via le répertoire central (stocké ou deflate).
export function unzipFirst(zip: Buffer): Buffer {
  let eocd = zip.length - 22;
  while (eocd >= 0 && zip.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error('zip illisible');
  const cd = zip.readUInt32LE(eocd + 16);
  if (zip.readUInt32LE(cd) !== 0x02014b50) throw new Error('zip illisible');
  const method = zip.readUInt16LE(cd + 10);
  const packed = zip.readUInt32LE(cd + 20);
  const local = zip.readUInt32LE(cd + 42);
  const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
  const raw = zip.subarray(start, start + packed);
  if (method === 0) return Buffer.from(raw);
  if (method === 8) return inflateRawSync(raw);
  throw new Error(`zip : méthode ${method} non gérée`);
}

/** Appelé par Nexus au démarrage du PC : nouveau build ? → lien + (une seule fois) envoi Telegram. */
export async function checkApkForPc(): Promise<{ ok: boolean; error?: string; run?: number; name?: string; version?: string; url?: string; isNew?: boolean }> {
  const info = await latestApk();
  if (!info) return { ok: false, error: 'Aucun APK disponible sur GitHub' };
  try { await apkFile(info); }
  catch (e) {
    const msg = axios.isAxiosError(e) && e.response?.status === 401 ? 'jeton GitHub refusé (GITHUB_TOKEN à renouveler)' : String(e instanceof Error ? e.message : e);
    return { ok: false, error: msg, run: info.run };
  }
  const url = apkLink(info.run);
  const last = Number(await kvGet('apk:telegram_run') ?? 0);
  const isNew = info.run > last;
  if (isNew) {
    await kvSet('apk:telegram_run', String(info.run));
    await queueTelegramMessage(
      `📱 Nouvelle version de l'app Dzaryx${info.version ? ` v${info.version}` : ''} (build ${info.run}, ${info.sizeMb} Mo).\nOuvre le fichier sur ton téléphone pour l'installer. Copie aussi rangée sur le PC dans Téléchargements\\Dzaryx.`,
      undefined, 'kouider', { url, name: info.name },
    );
  }
  return { ok: true, run: info.run, name: info.name, version: info.version, url, isNew };
}
