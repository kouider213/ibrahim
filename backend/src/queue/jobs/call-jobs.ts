import { supabase } from '../../integrations/supabase.js';
import { listInboxMessages, isReplyToUs, type GmailAccount } from '../../integrations/gmail.js';
import { buildYesterdayRecap } from '../../integrations/prospect-autopilot.js';
import { autoCall } from '../../notifications/auto-call.js';
import { paperWarning } from '../../integrations/car-papers.js';

// Appels automatiques planifiés (choix de Kouider) :
// - 10h (Bruxelles) chaque jour : récapitulatif à l'oral
// - toutes les 15 min : quelqu'un a répondu à un de ses mails — boîte PRO fikconciergerie@gmail.com UNIQUEMENT
//   (envois via l'alias contact@fikconciergerie.com). Jamais la boîte perso : choix de Kouider.

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
  for (const account of ['pro'] as GmailAccount[]) {   // jamais 'perso'
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

/**
 * 18h (Bruxelles) : la veille de chaque DÉPART et de chaque FIN de location → APPEL (demande de Kouider 2026-10-13).
 * Un seul appel pour tout demain. Départ : reste à payer, contrat signé ou pas, papiers de la voiture.
 * Retour : reste à encaisser, prochain départ de la voiture.
 */
export async function jobRentalEveCall(): Promise<void> {
  const tomorrow = oranDate(1);
  type B = { id: string; car_id: string; client_name: string; final_price: number | null; paid_amount: number | null; currency: string | null; cars?: { name?: string } | null };
  const cols = 'id, car_id, client_name, final_price, paid_amount, currency, cars(name)';
  const [{ data: dep }, { data: ret }] = await Promise.all([
    supabase.from('bookings').select(cols).eq('start_date', tomorrow).in('status', ['PENDING', 'CONFIRMED']),
    supabase.from('bookings').select(cols).eq('end_date', tomorrow).in('status', ['PENDING', 'CONFIRMED', 'ACTIVE']),
  ]);
  const departs = (dep ?? []) as unknown as B[], returns = (ret ?? []) as unknown as B[];
  if (!departs.length && !returns.length) return;

  const leftToPay = (b: B) => {
    const left = (Number(b.final_price) || 0) - (Number(b.paid_amount) || 0);
    return left > 0 ? ` Il reste ${Math.round(left)} ${b.currency === 'DZD' ? 'dinars' : 'euros'} à encaisser.` : '';
  };
  const parts: string[] = [];
  for (const b of departs) {
    const { data: sig } = await supabase.from('contract_signatures').select('status').eq('booking_id', b.id).eq('status', 'signed').limit(1);
    const contract = sig?.length ? '' : ' Le contrat n\'est pas encore signé.';
    const papers = (await paperWarning(b.car_id, tomorrow).catch(() => '')).replace(/^⚠️ PAPIERS : /, ' Attention, ').replace(', avant la fin de la location.', ' !');
    parts.push(`Départ : ${b.client_name} prend la ${carOf(b)} demain.${leftToPay(b)}${contract}${papers}`);
  }
  for (const b of returns) {
    const { data: next } = await supabase.from('bookings').select('client_name, start_date')
      .eq('car_id', b.car_id).neq('id', b.id).in('status', ['PENDING', 'CONFIRMED'])
      .gte('start_date', tomorrow).order('start_date').limit(1);
    const n = (next as { client_name: string; start_date: string }[] | null)?.[0];
    const after = n
      ? ` Elle repart ${n.start_date === tomorrow ? 'le jour même' : `le ${new Date(`${n.start_date}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', timeZone: 'UTC' })}`} avec ${n.client_name}.`
      : '';
    parts.push(`Retour : ${b.client_name} rend la ${carOf(b)} demain.${leftToPay(b)}${after}`);
  }
  const intro = [departs.length ? plural(departs.length, 'départ') : '', returns.length ? plural(returns.length, 'retour') : ''].filter(Boolean).join(' et ');
  await autoCall(`rental-eve:${tomorrow}`, `Pour demain, ${intro}. ${parts.join(' ')} Tu veux que je prépare un message pour un client, le contrat à signer, ou une proposition de prolongation ?`);
}
