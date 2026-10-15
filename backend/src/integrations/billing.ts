import axios from 'axios';
import { redis } from '../queue/queue.js';
import { kvGet, kvSet } from './app-store.js';
import { probeProviders } from './fallback-probe.js';
import { emitProactive } from '../notifications/mobile-push.js';
import { queueTelegramMessage } from '../notifications/tg-outbox.js';
import { autoCall } from '../notifications/auto-call.js';

// « À PAYER » : tout ce qui coûte (ou peut couper) pour garder Dzaryx en vie. Demande de Kouider (15/10/2026).
// - Vraies infos quand le service les donne (Railway : facture en cours + date ; Claude : crédit épuisé détecté ;
//   cerveaux gratuits : sondés) ; sinon Kouider saisit la date d'échéance / le solde (app ou « j'ai payé X »).
// - Alerte J-7, J-3, J-1 et le jour J (app + Telegram, appel la veille pour les services VITAUX), crédit bas, coupure.
// - Survie : Railway = le seul vital. Claude coupé → cerveaux gratuits (chat + tâches de fond, voir anthropic-compat) ;
//   ElevenLabs coupé → voix du téléphone ; PC cloud/VPS coupé → seulement appels Telegram, WhatsApp et PC cloud perdus.

export type Level = 'vital' | 'important' | 'optionnel';
export type Kind  = 'abonnement' | 'credits' | 'gratuit' | 'annuel';

interface Def {
  id: string; name: string; level: Level; kind: Kind; what: string; ifUnpaid: string; payUrl: string;
  period?: 'mois' | 'an'; price?: string;    // prix public indicatif, à corriger par Kouider
  mandatory?: boolean;                         // OBLIGATOIRE à payer pour que Dzaryx reste en vie (Railway seulement)
  env?: string[];                              // service compté seulement si une de ces clés est configurée
}

export const SERVICES: Def[] = [
  { id: 'railway', name: 'Railway', level: 'vital', kind: 'abonnement', period: 'mois', price: '≈ 5 à 10 $', mandatory: true,
    what: 'Le cerveau de Dzaryx (serveur) : Telegram, app, démarchage, appels programmés.',
    ifUnpaid: 'Dzaryx s\'arrête complètement. À payer en priorité.', payUrl: 'https://railway.com/account/billing' },
  { id: 'anthropic', name: 'Claude (Anthropic)', level: 'important', kind: 'credits', price: 'crédits prépayés',
    what: 'L\'intelligence principale (réponses, démarchage, conseiller).',
    ifUnpaid: 'Dzaryx continue avec les cerveaux gratuits (Groq/Gemini), un peu moins malin.', payUrl: 'https://console.anthropic.com/settings/billing', env: ['ANTHROPIC_API_KEY'] },
  { id: 'vps', name: 'VPS Hostinger (PC cloud)', level: 'important', kind: 'abonnement', period: 'mois', price: '≈ 7 à 10 €',
    what: 'PC cloud : vrais appels Telegram, WhatsApp Business, navigateur, sauvegardes.',
    ifUnpaid: 'Plus d\'appels Telegram ni de WhatsApp ; Dzaryx répond toujours par écrit.', payUrl: 'https://hpanel.hostinger.com/billing' },
  { id: 'domain', name: 'Domaine fikconciergerie.com', level: 'important', kind: 'annuel', period: 'an', price: '≈ 10 à 20 €',
    what: 'Le site et l\'adresse contact@fikconciergerie.com.',
    ifUnpaid: 'Site et adresse mail pro hors service.', payUrl: 'https://www.name.com/account/domain' },
  { id: 'elevenlabs', name: 'ElevenLabs (voix)', level: 'optionnel', kind: 'abonnement', period: 'mois', price: '≈ 5 à 22 $',
    what: 'La belle voix de Dzaryx.', ifUnpaid: 'Voix du téléphone à la place (gratuite).', payUrl: 'https://elevenlabs.io/app/subscription', env: ['ELEVENLABS_API_KEY'] },
  { id: 'google_maps', name: 'Google Maps API', level: 'optionnel', kind: 'credits', price: '200 $/mois offerts par Google',
    what: 'Démarchage sites web, démos de sites, carte.', ifUnpaid: 'Plus de nouveaux commerces trouvés ni de démos.', payUrl: 'https://console.cloud.google.com/billing', env: ['GOOGLE_MAPS_API_KEY', 'GOOGLE_PLACES_API_KEY'] },
  { id: 'supabase', name: 'Supabase (base de données)', level: 'vital', kind: 'gratuit', price: 'gratuit (plan Free)',
    what: 'Toutes les données : réservations, clients, prospects, mémoire.', ifUnpaid: 'Gratuit mais INDISPENSABLE : ne jamais passer en payant, juste rester dans la limite gratuite.', payUrl: 'https://supabase.com/dashboard/org/_/billing', env: ['SUPABASE_URL'] },
  { id: 'upstash', name: 'Upstash Redis', level: 'important', kind: 'gratuit', price: 'gratuit (limite mensuelle)',
    what: 'Mémoire rapide et tâches programmées.', ifUnpaid: 'Gratuit ; si la limite est dépassée, tâches programmées en pause jusqu\'au mois suivant.', payUrl: 'https://console.upstash.com', env: ['REDIS_URL'] },
  { id: 'groq', name: 'Groq (cerveau de secours)', level: 'optionnel', kind: 'gratuit', price: 'gratuit',
    what: 'Remplace Claude s\'il n\'a plus de crédit.', ifUnpaid: 'Gratuit.', payUrl: 'https://console.groq.com', env: ['GROQ_API_KEY'] },
  { id: 'gemini', name: 'Gemini (cerveau de secours)', level: 'optionnel', kind: 'gratuit', price: 'gratuit',
    what: 'Second secours si Claude et Groq ne répondent pas.', ifUnpaid: 'Gratuit.', payUrl: 'https://aistudio.google.com', env: ['GEMINI_API_KEY'] },
  { id: 'openai', name: 'OpenAI (dernier secours)', level: 'optionnel', kind: 'credits', price: 'crédits prépayés',
    what: 'Dernier secours payant si tout le reste tombe.', ifUnpaid: 'Rien de grave, Groq/Gemini restent.', payUrl: 'https://platform.openai.com/settings/organization/billing', env: ['OPENAI_API_KEY'] },
  { id: 'fal', name: 'fal.ai / Replicate (vidéos, images)', level: 'optionnel', kind: 'credits', price: 'crédits prépayés',
    what: 'Vidéos et images marketing.', ifUnpaid: 'Plus de vidéos IA ; tout le reste marche.', payUrl: 'https://fal.ai/dashboard/billing', env: ['FAL_KEY', 'FAL_API_KEY', 'REPLICATE_API_TOKEN'] },
  { id: 'tavily', name: 'Tavily / Jina / Apify (recherche web)', level: 'optionnel', kind: 'gratuit', price: 'gratuit (quotas)',
    what: 'Recherche web, e-mails des prospects.', ifUnpaid: 'Recherche plus lente (moteurs gratuits).', payUrl: 'https://app.tavily.com', env: ['TAVILY_API_KEY', 'JINA_API_KEY', 'APIFY_API_KEY'] },
  { id: 'free_misc', name: 'Telegram, Netlify, GitHub, Pexels, Cloudinary', level: 'optionnel', kind: 'gratuit', price: 'gratuit',
    what: 'Messagerie, app, code, photos.', ifUnpaid: 'Gratuit.', payUrl: '' },
];

/** Ce que Kouider a saisi (ou que Dzaryx a appris) pour un service. */
export interface Override {
  due?: string;          // prochaine échéance AAAA-MM-JJ
  amount?: string;       // montant réel, ex. « 6 $ »
  balance?: number;      // crédits restants (USD) au moment de la recharge
  balanceAt?: string;    // date de cette saisie
  spentAtBalance?: number; // compteur de dépenses Claude au moment de la saisie
  note?: string;
  paidAt?: string;
}
export interface BillingRow extends Def {
  active: boolean; due: string | null; daysLeft: number | null; amount: string | null; note: string | null;
  state: 'ok' | 'soon' | 'late' | 'out' | 'unknown'; status: string; live: boolean;
}

const OV_KEY = 'billing:overrides';
const CLAUDE_OUT_KEY = 'billing:claude_out';
export const SPEND_KEY = 'claude:spend:total_usd';   // incrémenté par cost-tracker (sans expiration)

async function overrides(): Promise<Record<string, Override>> {
  try { return JSON.parse((await kvGet(OV_KEY)) ?? '{}') as Record<string, Override>; } catch { return {}; }
}
async function saveOverrides(o: Record<string, Override>): Promise<void> { await kvSet(OV_KEY, JSON.stringify(o)); }

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Brussels' }).format(new Date());
const daysUntil = (d: string) => Math.round((new Date(`${d}T12:00:00Z`).getTime() - new Date(`${today()}T12:00:00Z`).getTime()) / 86_400_000);
const fmtDay = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

// ── Infos réelles ──
interface RailwayInfo { due: string; total: number; usage: number; status: string }
const RAILWAY_LAST = 'billing:railway_last';
/** Facture Railway en direct ; si le jeton du serveur ne peut pas la lire, dernière lecture réussie (gardée en base). */
async function railwayInfo(): Promise<(RailwayInfo & { cached?: boolean }) | null> {
  const token = process.env['RAILWAY_TOKEN'];
  const query = '{ projects { edges { node { workspace { customer { currentUsage billingPeriod { end } subscriptions { status nextInvoiceDate nextInvoiceCurrentTotal } } } } } } }';
  // Jeton de compte/équipe (Bearer) ou jeton de projet (Project-Access-Token)
  for (const headers of token ? [{ Authorization: `Bearer ${token}` }, { 'Project-Access-Token': token }] : []) {
    try {
      const { data } = await axios.post('https://backboard.railway.com/graphql/v2', { query }, { headers, timeout: 15_000 });
      const c = data?.data?.projects?.edges?.[0]?.node?.workspace?.customer;
      const sub = c?.subscriptions?.[0];
      const end = sub?.nextInvoiceDate ?? c?.billingPeriod?.end;
      if (!end) continue;
      const info = { due: String(end).slice(0, 10), total: Number(sub?.nextInvoiceCurrentTotal ?? 0) / 100, usage: Number(c?.currentUsage ?? 0), status: String(sub?.status ?? 'active') };
      await kvSet(RAILWAY_LAST, JSON.stringify(info)).catch(() => {});
      return info;
    } catch { /* essai suivant */ }
  }
  try {
    const last = JSON.parse((await kvGet(RAILWAY_LAST)) ?? 'null') as RailwayInfo | null;
    if (!last) return null;
    // Date passée → la facture a été prélevée : on avance d'un mois
    const d = new Date(`${last.due}T12:00:00Z`);
    while (daysUntil(d.toISOString().slice(0, 10)) < 0) d.setUTCMonth(d.getUTCMonth() + 1);
    return { ...last, due: d.toISOString().slice(0, 10), cached: true };
  } catch { return null; }
}

/** Date d'expiration publique du domaine (RDAP, registre .com). */
async function domainExpiry(): Promise<string | null> {
  try {
    const { data } = await axios.get('https://rdap.verisign.com/com/v1/domain/fikconciergerie.com', { timeout: 10_000 });
    const ev = (data?.events ?? []) as Array<{ eventAction: string; eventDate: string }>;
    return ev.find(e => e.eventAction === 'expiration')?.eventDate?.slice(0, 10) ?? null;
  } catch { return null; }
}

async function claudeSpent(): Promise<number> { return parseFloat((await redis.get(SPEND_KEY).catch(() => null)) ?? '0') || 0; }

/** Appelé quand Claude renvoie « crédit épuisé » : on bascule (voir anthropic-compat) et on prévient une fois toutes les 6 h. */
export async function markClaudeCreditOut(detail: string): Promise<void> {
  const first = await redis.set(CLAUDE_OUT_KEY, new Date().toISOString(), 'EX', 6 * 3600, 'NX').catch(() => null);
  if (first !== 'OK') return;
  const text = `🔴 Claude n'a plus de crédit (${detail.slice(0, 80)}).\nJe continue avec les cerveaux gratuits (Groq/Gemini) : je réponds toujours, un peu moins finement.\n` +
    `👉 Recharge ici : https://console.anthropic.com/settings/billing puis dis-moi « j'ai rechargé Claude de 50 $ ».`;
  emitProactive('Claude n\'a plus de crédit — je passe en mode gratuit.', 'alert', text, 'kouider', 'paiements');
  await queueTelegramMessage(text).catch(() => {});
}
export async function claudeOutSince(): Promise<string | null> { return redis.get(CLAUDE_OUT_KEY).catch(() => null); }
export async function clearClaudeOut(): Promise<void> { await redis.del(CLAUDE_OUT_KEY).catch(() => {}); }

export async function getBilling(): Promise<{ rows: BillingRow[]; claudeSpent7d: number | null; survival: string[] }> {
  const [ov, rw, dom, probe, outSince, spent] = await Promise.all([
    overrides(), railwayInfo(), domainExpiry(), probeProviders().catch(() => ({} as Awaited<ReturnType<typeof probeProviders>>)), claudeOutSince(), claudeSpent(),
  ]);
  const rows: BillingRow[] = SERVICES.map(s => {
    const o = ov[s.id] ?? {};
    const active = !s.env || s.env.some(k => !!process.env[k]);
    let due = o.due ?? null, amount = o.amount ?? null, live = false;
    let status = '', state: BillingRow['state'] = 'unknown';
    if (s.id === 'railway' && rw) {
      due = ov['railway']?.due && rw.cached ? ov['railway'].due : rw.due; live = !rw.cached;
      amount = rw.cached ? `≈ ${rw.total.toFixed(2)} $ (dernière lecture)` : `${rw.total.toFixed(2)} $ (facture en cours)`;
      status = rw.status === 'active' ? 'Abonnement actif' : `Abonnement : ${rw.status}`;
    }
    if (s.id === 'domain' && dom) { due = dom; live = true; status = `Chez Name.com — expire le ${fmtDay(dom)}`; }
    if (s.id === 'anthropic') {
      const st = probe['claude']?.state;
      if (outSince) { state = 'out'; status = 'Plus de crédit — Dzaryx tourne en mode gratuit'; live = true; }
      else if (o.balance !== undefined) {
        const left = o.balance - (spent - (o.spentAtBalance ?? 0));
        status = `≈ ${Math.max(0, left).toFixed(2)} $ restants (estimation depuis ta recharge du ${fmtDay((o.balanceAt ?? today()).slice(0, 10))})`;
        state = left <= 5 ? 'soon' : 'ok';
      } else status = st === 'ok' ? 'Répond — solde inconnu (dis-moi le montant à ta prochaine recharge)' : st === 'down' ? 'Ne répond pas (crédit ? clé ?)' : 'Solde inconnu';
      if (st === 'down' && !outSince) state = 'out';
      if (state === 'unknown' && st === 'ok') state = 'ok';
    }
    if ((s.id === 'groq' || s.id === 'gemini' || s.id === 'openai') && probe[s.id]) {
      const st = probe[s.id]!.state; live = true;
      status = st === 'ok' ? 'Prêt' : st === 'busy' ? 'Occupé (quota du jour)' : st === 'down' ? 'Ne répond pas' : 'Non configuré';
      state = st === 'ok' || st === 'busy' ? 'ok' : 'out';
    }
    if (s.kind === 'gratuit' && state === 'unknown') state = 'ok';
    const daysLeft = due ? daysUntil(due) : null;
    if (daysLeft !== null && state !== 'out') state = daysLeft < 0 ? 'late' : daysLeft <= 7 ? 'soon' : 'ok';
    if (!status) status = due ? (daysLeft! < 0 ? `En retard depuis le ${fmtDay(due)}` : `Prochain paiement le ${fmtDay(due)}`)
      : s.kind === 'gratuit' ? 'Gratuit' : 'Date de paiement inconnue — à remplir';
    else if (due && s.id === 'railway') status += ` · prochain paiement le ${fmtDay(due)}`;
    if (s.id === 'domain' && daysLeft !== null && daysLeft > 30) state = 'ok';     // annuel : alerte à J-30 max
    if (s.id === 'domain' && daysLeft !== null && daysLeft <= 30 && daysLeft >= 0) state = 'soon';
    return { ...s, active, due, daysLeft, amount, note: o.note ?? null, state, status, live };
  });
  const r7: number[] = [];
  try {
    const { getDailyCostReport } = await import('../monitoring/cost-tracker.js');
    for (let i = 0; i < 7; i++) r7.push((await getDailyCostReport(new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10))).totalUSD);
  } catch { /* redis indisponible */ }
  const survival = [
    'Railway payé = Dzaryx vivant (Telegram, app, tâches programmées).',
    probe['groq']?.state === 'ok' || probe['gemini']?.state === 'ok'
      ? '✅ Sans crédit Claude : chat ET tâches de fond passent sur Groq/Gemini (gratuits).'
      : '⚠️ Cerveaux gratuits injoignables en ce moment : sans Claude, Dzaryx répondrait en mode très limité.',
    'Sans ElevenLabs : voix du téléphone. Sans VPS : plus d\'appels Telegram ni de WhatsApp, le reste marche.',
  ];
  return { rows: rows.filter(r => r.active), claudeSpent7d: r7.length ? r7.reduce((a, b) => a + b, 0) : null, survival };
}

/** Kouider a payé / saisi une échéance, un montant, une recharge. */
export async function updateBilling(id: string, patch: { due?: string; amount?: string; balance?: number; note?: string; paid?: boolean }): Promise<string> {
  const s = SERVICES.find(x => x.id === id);
  if (!s) throw new Error(`Service inconnu : ${id}`);
  const all = await overrides();
  const o: Override = { ...(all[id] ?? {}) };
  if (patch.due !== undefined) {
    if (patch.due && !/^\d{4}-\d{2}-\d{2}$/.test(patch.due)) throw new Error('Date au format AAAA-MM-JJ');
    o.due = patch.due || undefined;
  }
  if (patch.amount !== undefined) o.amount = patch.amount.trim().slice(0, 40) || undefined;
  if (patch.note !== undefined) o.note = patch.note.trim().slice(0, 200) || undefined;
  if (patch.balance !== undefined) {
    if (!(patch.balance >= 0)) throw new Error('Montant invalide');
    o.balance = patch.balance; o.balanceAt = new Date().toISOString(); o.spentAtBalance = await claudeSpent();
    if (id === 'anthropic') await clearClaudeOut();
  }
  if (patch.paid) {
    o.paidAt = new Date().toISOString();
    if (o.due && s.period) {     // payé → échéance suivante
      const d = new Date(`${o.due}T12:00:00Z`);
      if (s.period === 'mois') d.setUTCMonth(d.getUTCMonth() + 1); else d.setUTCFullYear(d.getUTCFullYear() + 1);
      while (daysUntil(d.toISOString().slice(0, 10)) < 0) s.period === 'mois' ? d.setUTCMonth(d.getUTCMonth() + 1) : d.setUTCFullYear(d.getUTCFullYear() + 1);
      o.due = d.toISOString().slice(0, 10);
    }
  }
  all[id] = o;
  await saveOverrides(all);
  return `✅ ${s.name} : ${[o.due ? `prochain paiement le ${fmtDay(o.due)}` : '', o.amount ? `montant ${o.amount}` : '', patch.balance !== undefined ? `solde ${patch.balance} $ noté` : ''].filter(Boolean).join(', ') || 'mis à jour'}.`;
}

/** Tâche du matin : échéances proches, retards, crédit bas, service coupé. Une seule alerte par service et par palier. */
export async function jobBillingWatch(): Promise<void> {
  const { rows } = await getBilling();
  const lines: string[] = [];
  for (const r of rows) {
    let step = '';
    if (r.state === 'out') step = 'out';
    else if (r.daysLeft !== null && r.kind !== 'gratuit') {
      if (r.daysLeft < 0) step = `late:${r.due}`;
      else if (r.daysLeft === 0) step = `d0:${r.due}`;
      else if (r.daysLeft === 1) step = `d1:${r.due}`;
      else if (r.daysLeft <= 3) step = `d3:${r.due}`;
      else if (r.daysLeft <= 7) step = `d7:${r.due}`;
      else if (r.kind === 'annuel' && r.daysLeft <= 30) step = `d30:${r.due}`;
    } else if (r.id === 'anthropic' && r.state === 'soon') step = `low:${today().slice(0, 7)}`;
    if (!step) continue;
    const key = `billing:alerted:${r.id}:${step}`;
    // retard : rappel chaque jour ; sinon une fois par palier
    const ttl = step.startsWith('late') || step === 'out' ? 20 * 3600 : 40 * 86_400;
    if ((await redis.set(key, '1', 'EX', ttl, 'NX').catch(() => null)) !== 'OK') continue;
    const when = r.daysLeft === null ? '' : r.daysLeft < 0 ? `EN RETARD de ${-r.daysLeft} jour(s)` : r.daysLeft === 0 ? 'AUJOURD\'HUI' : `dans ${r.daysLeft} jour(s)`;
    lines.push(`${r.level === 'vital' ? '🔴' : r.level === 'important' ? '🟠' : '🟡'} ${r.name} — ${r.state === 'out' ? r.status : `paiement ${when}`}` +
      `${r.amount ? ` (${r.amount})` : ''}\n   Si pas payé : ${r.ifUnpaid}${r.payUrl ? `\n   Payer : ${r.payUrl}` : ''}`);
    if (r.level === 'vital' && (step.startsWith('d1') || step.startsWith('d0') || step.startsWith('late'))) {
      await autoCall(`billing:${r.id}:${step}`, `Rappel important : le paiement de ${r.name} est ${when.toLowerCase()}. Si ce n'est pas payé, ${r.ifUnpaid}`, { level: 'normal' });
    }
  }
  if (!lines.length) return;
  const text = `💳 À payer pour garder Dzaryx actif :\n\n${lines.join('\n\n')}\n\nQuand c'est payé, dis-moi « j'ai payé ${rows.find(r => lines.some(l => l.includes(r.name)))?.name ?? 'Railway'} » (ou bouton « Payé » dans la page À PAYER).`;
  emitProactive(`À payer : ${lines.length} service(s) à regarder.`, 'reminder', text, 'kouider', 'paiements');
  await queueTelegramMessage(text).catch(() => {});
}

/** Outil `billing` pour Dzaryx. */
export async function billingTool(input: Record<string, unknown>): Promise<string> {
  const action = String(input['action'] ?? 'list');
  if (action === 'list') {
    const { rows, survival, claudeSpent7d } = await getBilling();
    const icon = (r: BillingRow) => r.state === 'out' || r.state === 'late' ? '🔴' : r.state === 'soon' ? '🟠' : r.state === 'ok' ? '🟢' : '⚪';
    const paid = rows.filter(r => r.kind !== 'gratuit'), free = rows.filter(r => r.kind === 'gratuit');
    return `💳 À PAYER pour garder Dzaryx actif :\n` +
      `(Seul OBLIGATOIRE : Railway. Tout le reste est facultatif, Dzaryx survit sans.)\n` +
      paid.map(r => `${icon(r)} ${r.name} [${r.mandatory ? 'OBLIGATOIRE' : 'facultatif'}] — ${r.status}${r.amount ? ` · ${r.amount}` : r.price ? ` · ${r.price}` : ''}`).join('\n') +
      `\n\nGratuits : ${free.map(r => `${icon(r)} ${r.name}`).join(', ')}` +
      (claudeSpent7d !== null ? `\nClaude, 7 derniers jours : ≈ ${claudeSpent7d.toFixed(2)} $ (estimation)` : '') +
      `\n\nSurvie : ${survival.join(' ')}`;
  }
  const id = String(input['service'] ?? '').toLowerCase().trim();
  const svc = SERVICES.find(s => s.id === id || s.name.toLowerCase().includes(id));
  if (!svc) return `❌ Service inconnu. Choix : ${SERVICES.map(s => s.id).join(', ')}`;
  if (action === 'paid') return updateBilling(svc.id, { paid: true, ...(input['due'] ? { due: String(input['due']) } : {}) });
  if (action === 'set') return updateBilling(svc.id, {
    ...(input['due'] !== undefined ? { due: String(input['due']) } : {}),
    ...(input['amount'] !== undefined ? { amount: String(input['amount']) } : {}),
    ...(input['balance'] !== undefined ? { balance: Number(input['balance']) } : {}),
    ...(input['note'] !== undefined ? { note: String(input['note']) } : {}),
  });
  return '❌ action : list, paid, set';
}
