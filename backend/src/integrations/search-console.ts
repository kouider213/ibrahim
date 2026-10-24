// Google Search Console (Kouider 24/10 : « fikconciergerie.com » ne sortait dans aucune recherche) : combien de fois le site
// apparaît sur Google, sur quelles recherches, à quelle place. Lecture seule (webmasters.readonly), connexion une seule fois
// par le lien /api/calendar/gsc-connect, avec le compte Google qui a validé le site dans Search Console.
import axios from 'axios';
import { supabase } from './supabase.js';
import { env } from '../config/env.js';

const SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API = 'https://www.googleapis.com/webmasters/v3';
const REDIRECT_URI = () => env.GOOGLE_REDIRECT_URI ?? 'https://ibrahim-backend-production.up.railway.app/api/calendar/callback';
export const GSC_STATE = 'gsc:owner';      // même callback que l'agenda / Gmail, distingué par le state
const SITE_RE = /fikconciergerie\.com/i;

export function getGscAuthUrl(): string {
  return `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID ?? '', response_type: 'code', redirect_uri: REDIRECT_URI(), scope: SCOPE,
    access_type: 'offline', prompt: 'consent', state: GSC_STATE,
  }).toString()}`;
}

export const gscConnectLink = () => REDIRECT_URI().replace(/\/callback$/, '/gsc-connect');

export async function exchangeGscCode(code: string): Promise<boolean> {
  try {
    const { data } = await axios.post(TOKEN_URL, new URLSearchParams({
      code, grant_type: 'authorization_code', client_id: env.GOOGLE_CLIENT_ID ?? '',
      client_secret: env.GOOGLE_CLIENT_SECRET ?? '', redirect_uri: REDIRECT_URI(),
    }).toString(), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    await supabase.from('google_oauth_tokens').upsert({
      email: GSC_STATE, access_token: data.access_token as string, refresh_token: data.refresh_token as string, token_type: 'Bearer',
      expires_at: new Date(Date.now() + (data.expires_in as number) * 1000).toISOString(),
      scope: data.scope as string, updated_at: new Date().toISOString(),
    }, { onConflict: 'email' });
    return true;
  } catch (err) {
    console.error('[gsc] OAuth exchange failed:', err instanceof Error ? err.message : err);
    return false;
  }
}

async function token(): Promise<string | null> {
  const { data } = await supabase.from('google_oauth_tokens').select('access_token, refresh_token, expires_at').eq('email', GSC_STATE).maybeSingle();
  if (!data) return null;
  const t = data as { access_token: string; refresh_token: string; expires_at: string };
  if (Date.now() < new Date(t.expires_at).getTime() - 60_000) return t.access_token;
  try {
    const { data: r } = await axios.post(TOKEN_URL, new URLSearchParams({
      grant_type: 'refresh_token', refresh_token: t.refresh_token, client_id: env.GOOGLE_CLIENT_ID ?? '', client_secret: env.GOOGLE_CLIENT_SECRET ?? '',
    }).toString(), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    await supabase.from('google_oauth_tokens').update({
      access_token: r.access_token as string, expires_at: new Date(Date.now() + (r.expires_in as number) * 1000).toISOString(), updated_at: new Date().toISOString(),
    }).eq('email', GSC_STATE);
    return r.access_token as string;
  } catch (err) {
    console.error('[gsc] refresh failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

export interface GscReport { site: string; clicks: number; impressions: number; position: number; queries: Array<{ q: string; clicks: number; impressions: number; position: number }>; from: string; to: string }

/** 7 derniers jours connus (Google a ~2-3 jours de retard). null = pas connecté ; string = problème lisible. */
export async function gscReport(days = 7): Promise<GscReport | string | null> {
  const t = await token();
  if (!t) return null;
  const h = { Authorization: `Bearer ${t}` };
  try {
    const { data: sites } = await axios.get(`${API}/sites`, { headers: h, timeout: 20_000 });
    const site = ((sites.siteEntry ?? []) as Array<{ siteUrl: string; permissionLevel: string }>)
      .filter(s => SITE_RE.test(s.siteUrl) && s.permissionLevel !== 'siteUnverifiedUser')
      .sort((a, b) => Number(b.siteUrl.startsWith('sc-domain:')) - Number(a.siteUrl.startsWith('sc-domain:')))[0]?.siteUrl;
    if (!site) return 'le compte Google connecté n\'a pas fikconciergerie.com dans Search Console';
    const to = new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10);
    const from = new Date(Date.now() - (days + 1) * 86_400_000).toISOString().slice(0, 10);
    const q = (body: object) => axios.post(`${API}/sites/${encodeURIComponent(site)}/searchAnalytics/query`, { startDate: from, endDate: to, ...body }, { headers: h, timeout: 20_000 });
    const [tot, byQuery] = await Promise.all([q({}), q({ dimensions: ['query'], rowLimit: 5 })]);
    const row = (tot.data.rows?.[0] ?? {}) as { clicks?: number; impressions?: number; position?: number };
    return {
      site, from, to, clicks: row.clicks ?? 0, impressions: row.impressions ?? 0, position: row.position ?? 0,
      queries: ((byQuery.data.rows ?? []) as Array<{ keys: string[]; clicks: number; impressions: number; position: number }>)
        .map(r => ({ q: r.keys[0]!, clicks: r.clicks, impressions: r.impressions, position: r.position })),
    };
  } catch (err) {
    const msg = axios.isAxiosError(err) ? `${err.response?.status ?? ''} ${JSON.stringify(err.response?.data ?? err.message).slice(0, 160)}` : String(err);
    console.error('[gsc] report:', msg);
    return /SERVICE_DISABLED|has not been used|accessNotConfigured/i.test(msg)
      ? 'l\'API Search Console n\'est pas activée dans Google Cloud (à faire une fois)' : `Google ne répond pas (${msg.slice(0, 60)})`;
  }
}

/** Bloc pour le rapport de 21h. */
export async function gscSection(): Promise<string> {
  const r = await gscReport().catch(() => 'erreur');
  if (r === null) return `\n🔎 Google : pas encore branché. Clique une fois ici avec le compte qui gère le site dans Search Console :\n${gscConnectLink()}`;
  if (typeof r === 'string') return `\n🔎 Google : ${r}.`;
  const pos = (p: number) => p ? `${p.toFixed(1).replace('.', ',')}e place` : '—';
  const top = r.queries.map(x => `  • « ${x.q} » — ${x.impressions} vues, ${x.clicks} clic${x.clicks > 1 ? 's' : ''}, ${pos(x.position)}`).join('\n');
  return `\n🔎 Google (7 derniers jours connus) : vu ${r.impressions} fois, ${r.clicks} clic${r.clicks > 1 ? 's' : ''}, ${pos(r.position)} en moyenne` +
    (r.impressions === 0 ? '\n  ⚠️ Le site n\'apparaît encore dans aucune recherche Google.' : top ? `\n${top}` : '');
}
