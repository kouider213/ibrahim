/**
 * Restaure une sauvegarde Dzaryx (fichier .json.gz du VPS ou téléchargé du Drive).
 * Par défaut : montre seulement ce qui serait remis. Rien n'est écrit sans --yes.
 *   npx tsx --env-file ../.env scripts/backup-restore.ts /root/backups/db/dzaryx-2026-10-15.json.gz [--table bookings] [--yes]
 * Les lignes sont remises par « upsert » (même id → remplacée, absente → recréée). Rien n'est supprimé.
 */
import { readFileSync } from 'fs';
import { gunzipSync } from 'zlib';
import { supabase } from '../src/integrations/supabase';

const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith('--'));
const only = args.includes('--table') ? args[args.indexOf('--table') + 1] : null;
const write = args.includes('--yes');

(async () => {
  if (!file) throw new Error('donne le chemin du fichier .json.gz');
  const dump = JSON.parse(gunzipSync(readFileSync(file)).toString()) as { format: string; at: string; tables: Record<string, Record<string, unknown>[]> };
  if (dump.format !== 'dzaryx-backup-v1') throw new Error('format inconnu');
  console.log(`Sauvegarde du ${dump.at}${write ? '' : ' — APERÇU (ajoute --yes pour écrire)'}`);
  for (const [table, rows] of Object.entries(dump.tables)) {
    if (only && table !== only) continue;
    if (!write) { console.log(`  ${table}: ${rows.length} lignes`); continue; }
    let done = 0;
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await supabase.from(table).upsert(rows.slice(i, i + 500));
      if (error) { console.error(`  ${table}: ÉCHEC après ${done} lignes — ${error.message}`); break; }
      done += Math.min(500, rows.length - i);
    }
    if (done === rows.length) console.log(`  ${table}: ${done} lignes remises`);
  }
  process.exit(0);
})().catch(e => { console.error('ÉCHEC :', e instanceof Error ? e.message : e); process.exit(1); });
