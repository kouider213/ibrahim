/**
 * B034 — donne au service d'appels Telegram (tgcall) son propre jeton d'appareil, à la place de l'ancien
 * code MOBILE_ACCESS_TOKEN. Remplace ACCESS_TOKEN dans tgcall/.env (sans jamais l'afficher).
 * Lancer : cd backend && npx tsx --env-file ../.env scripts/tgcall-token.ts && pm2 restart dzaryx-tg
 */
import { readFileSync, writeFileSync, renameSync } from 'fs';
import { resolve } from 'path';
import { issueDeviceToken } from '../src/auth/device-auth';

const ENV = resolve(__dirname, '../../tgcall/.env');

(async () => {
  const lines = readFileSync(ENV, 'utf-8').split('\n');
  const i = lines.findIndex(l => l.startsWith('ACCESS_TOKEN='));
  if (i < 0) throw new Error('ACCESS_TOKEN absent de tgcall/.env');
  const token = await issueDeviceToken('kouider', 'service:tgcall');
  lines[i] = `ACCESS_TOKEN=${token}`;
  writeFileSync(`${ENV}.tmp`, lines.join('\n'), { mode: 0o600 });
  renameSync(`${ENV}.tmp`, ENV);
  console.log('OK : nouveau jeton écrit dans tgcall/.env — lance maintenant : pm2 restart dzaryx-tg');
  process.exit(0);
})().catch(e => { console.error('ÉCHEC :', e instanceof Error ? e.message : e); process.exit(1); });
