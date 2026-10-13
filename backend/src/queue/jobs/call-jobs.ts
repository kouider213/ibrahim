import { supabase } from '../../integrations/supabase.js';
import { listInboxMessages, isReplyToUs, type GmailAccount } from '../../integrations/gmail.js';
import { buildYesterdayRecap } from '../../integrations/prospect-autopilot.js';
import { autoCall } from '../../notifications/auto-call.js';

// Appels automatiques planifiés (choix de Kouider) :
// - 10h (Bruxelles) chaque jour : récapitulatif à l'oral
// - toutes les 15 min : quelqu'un a répondu à un de ses mails (boîtes perso + pro)

function oranDate(offsetDays = 0): string {
  return new Date(Date.now() + offsetDays * 86_400_000).toLocaleDateString('en-CA', { timeZone: 'Africa/Algiers' });
}

const carOf = (b: { cars?: { name?: string } | null }) => b.cars?.name ?? 'la voiture';
const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`;

export async function jobDailyRecapCall(): Promise<void> {
  const today = oranDate(), tomorrow = oranDate(1);
  type B = { client_name: string; cars?: { name?: string } | null };
  const [actives, departs, returns, arrivals, late, unpaid, recap] = await Promise.all([
    supabase.from('bookings').select('id').in('status', ['CONFIRMED', 'ACTIVE']).lte('start_date', today).gte('end_date', today),
    supabase.from('bookings').select('client_name, cars(name)').in('status', ['CONFIRMED', 'ACTIVE']).eq('start_date', today),
    supabase.from('bookings').select('client_name, cars(name)').in('status', ['CONFIRMED', 'ACTIVE']).eq('end_date', today),
    supabase.from('bookings').select('client_name, cars(name)').in('status', ['CONFIRMED', 'ACTIVE']).eq('start_date', tomorrow),
    supabase.from('bookings').select('id').in('status', ['CONFIRMED', 'ACTIVE']).lt('end_date', today),
    supabase.from('bookings').select('id').in('payment_status', ['PENDING', 'PARTIAL']).in('status', ['ACTIVE', 'COMPLETED']).lte('start_date', today),
    buildYesterdayRecap().catch(() => null),
  ]);
  const list = (rows: unknown) => ((rows ?? []) as B[]).map(b => `${b.client_name} avec ${carOf(b)}`).join(', ');

  const parts: string[] = ['Voici ton récap du jour.'];
  const nActive = actives.data?.length ?? 0;
  parts.push(nActive ? `${plural(nActive, 'voiture')} en location aujourd'hui.` : `Aucune voiture en location aujourd'hui.`);
  if (departs.data?.length)  parts.push(`Départs aujourd'hui : ${list(departs.data)}.`);
  if (returns.data?.length)  parts.push(`Retours aujourd'hui : ${list(returns.data)}.`);
  if (arrivals.data?.length) parts.push(`Demain arrivent : ${list(arrivals.data)}.`);
  if (late.data?.length)     parts.push(`Attention, ${plural(late.data.length, 'voiture')} pas encore rendue${late.data.length > 1 ? 's' : ''}.`);
  if (unpaid.data?.length)   parts.push(`${plural(unpaid.data.length, 'solde')} reste${unpaid.data.length > 1 ? 'nt' : ''} à encaisser.`);
  if (recap?.short)          parts.push(recap.short);
  parts.push('Tu veux que je détaille quelque chose ?');

  await autoCall(`daily-recap:${today}`, parts.join(' '));
}

/** Réponses à SES mails (conversation où la boîte a envoyé un mail avant). Les prospects sont gérés par checkProspectReplies. */
export async function jobMailReplyCall(): Promise<void> {
  for (const account of ['perso', 'pro'] as GmailAccount[]) {
    let msgs;
    try {
      msgs = await listInboxMessages(account, 'in:inbox newer_than:2h -category:promotions -category:social -category:forums', 20);
    } catch { continue; }                                     // boîte non connectée → rien
    if (!msgs.length) continue;

    let prospectEmails = new Set<string>();
    if (account === 'pro') {
      const { data } = await supabase.from('prospects').select('email').in('email', msgs.map(m => m.fromEmail));
      prospectEmails = new Set(((data ?? []) as Array<{ email: string }>).map(p => p.email?.toLowerCase()));
    }

    for (const m of msgs) {
      if (prospectEmails.has(m.fromEmail) || /no-?reply|mailer-daemon|postmaster/i.test(m.fromEmail)) continue;
      if (!(await isReplyToUs(account, m.threadId, m.id).catch(() => false))) continue;
      const name = m.from.replace(/<[^>]+>/, '').replace(/"/g, '').trim() || m.fromEmail;
      const subject = m.subject.replace(/^((re|tr|fwd?)\s*:\s*)+/i, '').trim();
      await autoCall(`mail-reply:${m.id}`, `${name} a répondu à ton mail${subject ? ` « ${subject} »` : ''}. Tu veux que je te le lise ?`);
    }
  }
}
