/**
 * Sauvegarde sur le VPS (cron 3h30) : toute la base → /root/backups/db/dzaryx-AAAA-MM-JJ.json.gz (30 gardées)
 * + copie des photos/documents Supabase Storage → /root/backups/storage/<bucket>/… (seulement les nouveaux).
 * Lancer : cd backend && npx tsx --env-file ../.env scripts/backup-local.ts
 * Restaurer : scripts/backup-restore.ts
 */
import { mkdirSync, writeFileSync, readdirSync, unlinkSync, existsSync, statSync } from 'fs';
import { dirname, join } from 'path';
import axios from 'axios';
import { env } from '../src/config/env';
import { dumpDatabase, stampBackup } from '../src/integrations/db-backup';

const ROOT = process.env['BACKUP_DIR'] ?? '/root/backups';
const KEEP = 30;
const H = { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` };

interface Obj { name: string; id: string | null; metadata?: { size?: number } | null }

async function listAll(bucket: string, prefix = ''): Promise<Array<{ path: string; size: number }>> {
  const out: Array<{ path: string; size: number }> = [];
  for (let offset = 0; ; offset += 1000) {
    const { data } = await axios.post(`${env.SUPABASE_URL}/storage/v1/object/list/${bucket}`,
      { prefix, limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } }, { headers: H, timeout: 30_000 });
    const items = data as Obj[];
    for (const o of items) {
      const path = prefix ? `${prefix}/${o.name}` : o.name;
      if (o.id === null) out.push(...await listAll(bucket, path));          // dossier
      else if (o.name !== '.emptyFolderPlaceholder') out.push({ path, size: o.metadata?.size ?? -1 });
    }
    if (items.length < 1000) return out;
  }
}

async function mirrorStorage(): Promise<{ files: number; fresh: number; failed: number }> {
  const { data } = await axios.get(`${env.SUPABASE_URL}/storage/v1/bucket`, { headers: H, timeout: 20_000 });
  let files = 0, fresh = 0, failed = 0;
  for (const b of data as Array<{ name: string }>) {
    for (const f of await listAll(b.name)) {
      files++;
      const dest = join(ROOT, 'storage', b.name, f.path);
      if (existsSync(dest) && (f.size < 0 || statSync(dest).size === f.size)) continue;
      try {
        const r = await axios.get(`${env.SUPABASE_URL}/storage/v1/object/${b.name}/${f.path.split('/').map(encodeURIComponent).join('/')}`,
          { headers: H, responseType: 'arraybuffer', timeout: 120_000 });
        mkdirSync(dirname(dest), { recursive: true });
        writeFileSync(dest, Buffer.from(r.data as ArrayBuffer));
        fresh++;
      } catch (err) {
        failed++;
        console.warn(`storage ${b.name}/${f.path}:`, err instanceof Error ? err.message : err);
      }
    }
  }
  return { files, fresh, failed };
}

(async () => {
  const dir = join(ROOT, 'db');
  mkdirSync(dir, { recursive: true });
  const d = await dumpDatabase();
  const file = join(dir, `dzaryx-${d.at.slice(0, 10)}.json.gz`);
  writeFileSync(file, d.gz, { mode: 0o600 });
  for (const old of readdirSync(dir).filter(f => /^dzaryx-.*\.json\.gz$/.test(f)).sort().reverse().slice(KEEP)) unlinkSync(join(dir, old));
  const st = await mirrorStorage().catch(err => { console.warn('storage:', err instanceof Error ? err.message : err); return null; });
  await stampBackup('vps', d, `VPS ${file}${st ? ` + ${st.files} fichiers (${st.fresh} nouveaux${st.failed ? `, ${st.failed} en échec` : ''})` : ' (photos : échec)'}`);
  console.log(`${new Date().toISOString()} OK ${d.tables} tables, ${d.rows} lignes, ${Math.round(d.gz.length / 1024)} Ko → ${file}`
    + (d.failed.length ? ` | illisibles: ${d.failed.join(' ; ')}` : '') + (st ? ` | storage ${st.files} fichiers, ${st.fresh} nouveaux, ${st.failed} échecs` : ''));
  process.exit(0);
})().catch(e => { console.error(new Date().toISOString(), 'ÉCHEC :', e instanceof Error ? e.message : e); process.exit(1); });
