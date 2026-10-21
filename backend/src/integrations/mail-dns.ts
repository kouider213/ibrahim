import axios from 'axios';
import { env } from '../config/env.js';
import { kvGet, kvSet } from './app-store.js';

// DNS du domaine (Vercel) pour que les mails de contact@ arrivent en boîte de réception et pas en spam :
// DMARC posé automatiquement ; DKIM dès que la clé Zoho (Zoho Admin → Authentification e-mail → DKIM,
// sélecteur « zmail ») est enregistrée dans app_kv 'mail:zoho-dkim'. Résultat dans app_kv 'mail:dns-setup'.

const DOMAIN = 'fikconciergerie.com';
const DMARC  = 'v=DMARC1; p=none; adkim=r; aspf=r';
const DKIM_SELECTOR = 'zmail._domainkey';

type DnsRecord = { id: string; type: string; name: string; value: string };

async function vercelApi<T>(method: 'get' | 'post', path: string, teamId: string | null, body?: unknown): Promise<T> {
  const { data } = await axios.request<T>({
    method, url: `https://api.vercel.com${path}`, data: body, timeout: 15_000,
    params: teamId ? { teamId } : undefined, headers: { Authorization: `Bearer ${env.VERCEL_TOKEN}` },
  });
  return data;
}

/** Le domaine peut être sur le compte perso ou dans une équipe Vercel : on essaie les deux. */
async function findRecords(): Promise<{ teamId: string | null; records: DnsRecord[] }> {
  const teams = await vercelApi<{ teams?: { id: string }[] }>('get', '/v2/teams', null).catch(() => ({ teams: [] }));
  let lastErr: unknown = null;
  for (const teamId of [null, ...(teams.teams ?? []).map(t => t.id)]) {
    try {
      const r = await vercelApi<{ records: DnsRecord[] }>('get', `/v4/domains/${DOMAIN}/records?limit=100`, teamId);
      return { teamId, records: r.records };
    } catch (err) { lastErr = err; }
  }
  throw lastErr;
}

export async function ensureMailDns(): Promise<string> {
  if (!env.VERCEL_TOKEN) return 'VERCEL_TOKEN absent';
  const { teamId, records } = await findRecords();
  const txt = (name: string) => records.find(r => r.type === 'TXT' && r.name === name);
  const done: string[] = [];
  const add = async (name: string, value: string) => {
    await vercelApi('post', `/v2/domains/${DOMAIN}/records`, teamId, { name, type: 'TXT', value, ttl: 3600 });
    done.push(`${name} ajouté`);
  };
  if (!txt('_dmarc')) await add('_dmarc', DMARC);
  const dkim = (await kvGet('mail:zoho-dkim').catch(() => null))?.trim();
  if (dkim && !txt(DKIM_SELECTOR)) await add(DKIM_SELECTOR, dkim);
  const status = `${new Date().toISOString()} ${done.join(', ') || 'rien à faire'}` +
    ` (DMARC ${txt('_dmarc') || done.some(d => d.startsWith('_dmarc')) ? 'ok' : 'absent'},` +
    ` DKIM ${txt(DKIM_SELECTOR) || done.some(d => d.startsWith(DKIM_SELECTOR)) ? 'ok' : 'en attente de la clé Zoho'})`;
  await kvSet('mail:dns-setup', status).catch(() => {});
  return status;
}

/** Au démarrage puis toutes les 6 h (la clé DKIM peut être ajoutée à tout moment). */
export function startMailDnsSync(): void {
  const run = () => ensureMailDns()
    .then(s => console.log(`[mail-dns] ${s}`))
    .catch(err => {
      const msg = axios.isAxiosError(err) ? `${err.response?.status} ${JSON.stringify(err.response?.data).slice(0, 200)}` : String(err);
      console.error('[mail-dns]', msg);
      void kvSet('mail:dns-setup', `${new Date().toISOString()} ERREUR ${msg}`).catch(() => {});
    });
  void run();
  setInterval(run, 6 * 3600_000).unref();
}
