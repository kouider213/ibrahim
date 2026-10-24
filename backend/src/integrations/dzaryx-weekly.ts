// « Ce que j'ai fait pour toi cette semaine » (Kouider 24/10 : Dzaryx doit montrer son travail, comme un vrai majordome).
// Dimanche soir : un seul message Telegram + app. Tout est compté depuis ce qui a vraiment été envoyé (proactive_history),
// les appels (calls:health:*, envoyés par tgcall) et les coûts Claude — rien d'inventé.
import { supabase } from './supabase.js';
import { kvGet } from './app-store.js';
import { emitProactive } from '../notifications/mobile-push.js';
import { queueTelegramMessage } from '../notifications/tg-outbox.js';
import { getDailyCostReport } from '../monitoring/cost-tracker.js';

const brusselsDay = (ts: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Brussels' }).format(new Date(ts));
const plural = (n: number, w: string) => `${n} ${w}${n > 1 ? 's' : ''}`;

export async function buildDzaryxWeekly(now = Date.now()): Promise<string> {
  const since = new Date(now - 7 * 86_400_000).toISOString();
  const { data } = await supabase.from('proactive_history').select('type, text').eq('actor', 'kouider').gte('created_at', since).limit(2000);
  const msgs = (data ?? []) as Array<{ type: string; text: string }>;
  const count = (re: RegExp) => msgs.filter(m => re.test(m.text)).length;
  const sum = (re: RegExp) => msgs.reduce((s, m) => s + Number(m.text.match(re)?.[1] ?? 0), 0);

  const mails = sum(/Démarchage du jour : (\d+) mail/);
  const yes = count(/a dit oui/);
  const demos = count(/^🌐 Démo envoyée/);
  const ideas = count(/^💡 Idée/);
  const opps = count(/Opportunité|opportunités urgentes/);
  const reminders = msgs.filter(m => m.type === 'reminder').length;

  const calls = { ok: 0, muet: 0, manque: 0, bascule: 0 };
  for (let i = 0; i < 7; i++) {
    const h = JSON.parse((await kvGet(`calls:health:${brusselsDay(now - i * 86_400_000)}`).catch(() => null)) ?? '{}') as Partial<typeof calls>;
    for (const k of Object.keys(calls) as Array<keyof typeof calls>) calls[k] += h[k] ?? 0;
  }

  let cost = 0;
  for (let i = 0; i < 7; i++) cost += (await getDailyCostReport(new Date(now - i * 86_400_000).toISOString().slice(0, 10)).catch(() => ({ totalUSD: 0 }))).totalUSD;

  const { data: pv } = await supabase.from('page_views').select('session_id').gte('created_at', since).limit(20000);
  const visitors = new Set(((pv ?? []) as Array<{ session_id: string | null }>).map(v => v.session_id).filter(Boolean)).size;

  const callLine = calls.ok + calls.manque + calls.muet
    ? `📞 ${plural(calls.ok, 'appel')} réussi${calls.ok > 1 ? 's' : ''}${calls.manque ? `, ${calls.manque} pas décroché${calls.manque > 1 ? 's' : ''}` : ''}${calls.muet ? `, ${calls.muet} muet${calls.muet > 1 ? 's' : ''}` : ''}${calls.bascule ? ` (${calls.bascule} passé${calls.bascule > 1 ? 's' : ''} sur Claude en cours d'appel)` : ''}`
    : '';
  return [
    `🤵 Ce que j'ai fait pour toi cette semaine\n`,
    `✉️ ${plural(msgs.length, 'message')} envoyé${msgs.length > 1 ? 's' : ''} (dont ${plural(reminders, 'rappel')})`,
    callLine,
    mails ? `📤 ${plural(mails, 'mail')} de démarchage FIK Sites → ${yes} oui, ${plural(demos, 'démo')} envoyée${demos > 1 ? 's' : ''}` : '',
    ideas || opps ? `💡 ${plural(ideas, 'idée')} business du mentor, ${plural(opps, 'opportunité')} repérée${opps > 1 ? 's' : ''}` : '',
    `🌐 ${plural(visitors, 'visite')} sur fikconciergerie.com (robots compris)`,
    `🧠 Coût Claude de la semaine : ${cost.toFixed(2)} $`,
    '',
    yes ? `👉 À toi : ${plural(yes, 'commerçant')} a dit oui cette semaine, dis-moi quand tu les rappelles.` : '👉 Dis-moi sur quoi tu veux que je pousse la semaine prochaine.',
  ].filter(l => l !== '').join('\n').replace(/\n👉/, '\n\n👉');
}

export async function jobDzaryxWeekly(): Promise<void> {
  const text = await buildDzaryxWeekly();
  emitProactive('🤵 Ce que j\'ai fait pour toi cette semaine', 'info', text, 'kouider');
  await queueTelegramMessage(text);
}
