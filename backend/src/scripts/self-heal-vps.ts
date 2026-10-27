/**
 * SE RÉPARE SEUL — côté VPS (27/10/2026). Lancé toutes les 10 min par pm2 (dzaryx-heal, cron, pas un 2e backend :
 * n'importe que Supabase). Relance :
 *  - dzaryx-tg (appels / messages Telegram) si son battement de cœur a plus de 15 min — jamais pendant un appel ;
 *  - dzaryx-cloudpc (WhatsApp, navigateur) si le cerveau le voit coupé depuis ≥ 2 contrôles.
 * Au plus 3 relances par service et par 6 h ; chaque relance est notée (app_kv `heal:log`) et dite à Kouider sur Telegram
 * par la boîte d'envoi (tgcall/outbox) — seulement si ça a marché ou si c'est la 3e tentative.
 */
import { execSync } from 'child_process';
import { writeFileSync, mkdirSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env['SUPABASE_URL']!, process.env['SUPABASE_SERVICE_ROLE_KEY'] ?? process.env['SUPABASE_SERVICE_KEY'] ?? process.env['SUPABASE_KEY']!);
const OUTBOX = '/root/dzaryx/tgcall/outbox';

async function kv(key: string): Promise<string | null> {
  const { data } = await sb.from('app_kv').select('value, expires_at').eq('key', key).maybeSingle();
  const r = data as { value: string; expires_at: string | null } | null;
  return !r || (r.expires_at && Date.parse(r.expires_at) < Date.now()) ? null : r.value;
}
async function kvSet(key: string, value: string): Promise<void> {
  await sb.from('app_kv').upsert({ key, value, expires_at: null, updated_at: new Date().toISOString() });
}
function say(text: string): void {
  try { mkdirSync(OUTBOX, { recursive: true }); writeFileSync(`${OUTBOX}/heal-${Date.now()}.txt`, text); } catch { /* rien */ }
}

(async () => {
  const log = JSON.parse((await kv('heal:log')) ?? '[]') as Array<{ at: string; svc: string; why: string }>;
  const recent = (svc: string) => log.filter(l => l.svc === svc && Date.now() - Date.parse(l.at) < 6 * 3600_000).length;
  const restart = (svc: string, why: string) => {
    if (recent(svc) >= 3) { console.log(`[heal] ${svc} : déjà 3 relances en 6 h, on laisse`); return false; }
    execSync(`pm2 restart ${svc}`, { stdio: 'ignore', timeout: 60_000 });
    log.push({ at: new Date().toISOString(), svc, why });
    console.log(`[heal] ${svc} relancé (${why})`);
    return true;
  };

  // Service Telegram : battement de cœur trop vieux, et pas d'appel en cours
  const beat = await kv('tgcall:heartbeat');
  const live = await kv('tgcall:live');
  if (beat && Date.now() - Date.parse(beat) > 15 * 60_000 && !live) {
    // le message attend dans la boîte d'envoi et part dès que le service est revenu
    if (restart('dzaryx-tg', `battement de cœur vieux de ${Math.round((Date.now() - Date.parse(beat)) / 60_000)} min`)) say('🩺 Le service Telegram de Dzaryx était bloqué : je l\'ai relancé tout seul.');
  }
  // PC cloud : le cerveau (surveillance des connexions) le voit coupé
  const conn = JSON.parse((await kv('conn:watch')) ?? '{}') as Record<string, { down?: number; fails?: number }>;
  const pc = conn['cloudpc'];
  if (pc?.down && (pc.fails ?? 0) >= 2 && Date.now() - pc.down < 6 * 3600_000) {
    if (restart('dzaryx-cloudpc', `coupé depuis ${Math.round((Date.now() - pc.down) / 60_000)} min`)) say('🩺 Le PC cloud (WhatsApp, navigateur) ne répondait plus : je l\'ai relancé tout seul.');
  }
  await kvSet('heal:log', JSON.stringify(log.slice(-50)));
  process.exit(0);
})().catch(err => { console.error('[heal]', err); process.exit(1); });
