// 26/11 Kouider : « fais le 1 et pas les autres » → à la place du parrainage avec remise : PRIORITÉ EN HAUTE SAISON (0 €).
// Un client qui a amené au moins 1 ami (code parrain compté ＋ dans PARRAINAGE, referrals.uses ≥ 1) = client PRIORITAIRE :
//  1. il est prévenu AVANT tout le monde : 6 semaines avant chaque vague (fêtes, Aïd, printemps, été), Kouider reçoit ses
//     messages prêts (1 appui chacun) — seulement s'il reste des voitures libres sur la vague ;
//  2. QUAND C'EST COMPLET : on ne retire JAMAIS une voiture à un client déjà réservé (premier réservé = gardé). Le prioritaire
//     reçoit d'autres dates / une autre voiture libre, et il est prévenu EN PREMIER si une voiture se libère (annulation) ;
//  3. sur WhatsApp, son message est marqué « ⭐ client prioritaire » et la réponse proposée suit ces règles.
// Le message de remerciement après la location explique l'avantage (client-care reviewText).
import { supabase } from './supabase.js';
import { kvGet, kvSet } from './app-store.js';
import { queueTelegramMessage } from '../notifications/tg-outbox.js';

export interface PriorityClient { name: string; phone: string | null; code: string; uses: number }
const BUSY = ['CONFIRMED', 'ACTIVE', 'COMPLETED', 'PENDING'];
const key9 = (p?: string | null) => { const d = String(p ?? '').replace(/\D/g, ''); return d.length >= 8 ? d.slice(-9) : ''; };
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9؀-ۿ ]/g, ' ').replace(/\s+/g, ' ').trim();
const first = (n: string) => { const f = n.trim().split(/\s+/)[0] ?? n; return f.charAt(0).toUpperCase() + f.slice(1).toLowerCase(); };
const dfr = (d: string) => new Date(d + 'T12:00:00Z').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', timeZone: 'UTC' });

export async function priorityClients(): Promise<PriorityClient[]> {
  const { data } = await supabase.from('referrals').select('code, referrer_name, referrer_phone, uses').gte('uses', 1).limit(500);
  return ((data ?? []) as Array<{ code: string; referrer_name: string | null; referrer_phone: string | null; uses: number }>)
    .filter(r => r.referrer_name || r.referrer_phone)
    .map(r => ({ name: r.referrer_name || r.referrer_phone || '', phone: r.referrer_phone, code: r.code, uses: r.uses }));
}

/** Discussion WhatsApp (nom du contact ou numéro) → client prioritaire ? */
export async function findPriority(chat: string): Promise<PriorityClient | null> {
  const list = await priorityClients().catch(() => [] as PriorityClient[]);
  const k = key9(chat), n = norm(chat);
  return list.find(p => (k && key9(p.phone) === k) || (n.length >= 4 && norm(p.name) && (norm(p.name) === n || (n.includes(norm(p.name)) && norm(p.name).includes(' '))))) ?? null;
}

/** Règle ajoutée au brouillon de réponse quand le client est prioritaire. */
export function priorityRule(p: PriorityClient): string {
  return `\n\nCE CLIENT EST PRIORITAIRE (il nous a déjà amené ${p.uses} ami(s)) : il a la priorité pour réserver en haute saison (fêtes, Aïd, vacances, été).
- S'il y a une voiture libre sur ses dates : propose-la tout de suite et dis-lui qu'on la lui garde dès qu'il confirme.
- Si TOUT EST PRIS sur ses dates : ne promets JAMAIS de retirer la voiture d'un autre client (le premier réservé garde sa voiture). Dis-le honnêtement, propose les dates les plus proches où une voiture est libre ou une autre voiture libre, et dis-lui qu'il est le PREMIER prévenu si une voiture se libère sur ses dates.`;
}

function earlyText(c: PriorityClient, w: { name: string; short: string; from: string; to: string }, free: number, lang: 'fr' | 'ar'): string {
  if (lang === 'ar') return `السلام عليكم ${first(c.name)} 👋 معاك قويدر من FIK Conciergerie. بفضلك جاونا كليان جداد، ولهذا عندك الأولوية: الحجز تاع ${w.name} (${dfr(w.from)} – ${dfr(w.to)}) مفتوح ليك قبل الناس كامل. باقي ${free} طوموبيل. إذا راك هابط، بعثلي التواريخ ونحجزلك 🙏`;
  return `Salam ${first(c.name)} 👋 C'est Kouider, de FIK Conciergerie. Grâce à vous, de nouveaux clients nous ont fait confiance : vous avez donc la priorité. Les réservations pour ${w.short} (${dfr(w.from)} – ${dfr(w.to)}) vous sont ouvertes avant tout le monde, il reste ${free} voiture${free > 1 ? 's' : ''}. Si vous descendez, envoyez-moi vos dates et je vous la garde 🙏`;
}
const wa = (phone: string | null, text: string) => { const d = String(phone ?? '').replace(/\D/g, '').replace(/^00/, ''); return d.length >= 9 ? `https://wa.me/${d}?text=${encodeURIComponent(text)}` : ''; };

/** Job quotidien 9h30 : (a) 6 semaines avant une vague → messages prioritaires prêts ; (b) une réservation annulée sur une
 *  vague → la voiture libérée est proposée D'ABORD aux prioritaires. Rien n'est envoyé seul : Kouider appuie sur chaque lien. */
export async function jobPriorityEarlyAccess(): Promise<string> {
  const { WAVES } = await import('../api/routes/insights.js');
  const today = new Date().toISOString().slice(0, 10);
  const prio = await priorityClients();
  const out: string[] = [];
  const [{ data: cars }, { data: bk }] = await Promise.all([
    supabase.from('cars').select('id, name').eq('available', true),
    supabase.from('bookings').select('id, car_id, client_name, client_phone, client_lang, status, start_date, end_date, updated_at').gte('end_date', today).limit(1500),
  ]);
  const C = (cars ?? []) as Array<{ id: string; name: string }>;
  const B = (bk ?? []) as Array<{ id: string; car_id: string; client_name: string; client_phone: string | null; client_lang: string | null; status: string; start_date: string; end_date: string; updated_at: string | null }>;
  for (const w of WAVES.filter(x => x.from > today)) {
    const days = Math.round((Date.parse(w.from) - Date.parse(today)) / 86_400_000);
    const taken = new Set(B.filter(b => BUSY.includes(String(b.status).toUpperCase()) && b.start_date <= w.to && b.end_date >= w.from).map(b => b.car_id));
    const free = C.filter(c => !taken.has(c.id));
    // (a) Accès prioritaire : 42 jours avant (une seule fois par vague)
    if (prio.length && days <= 42 && days > 21 && !(await kvGet(`prio:early:${w.id}`))) {
      await kvSet(`prio:early:${w.id}`, today, 200 * 86_400);
      // Déjà réservés sur la vague : rien à leur envoyer
      const booked = new Set(B.filter(b => BUSY.includes(String(b.status).toUpperCase()) && b.start_date <= w.to && b.end_date >= w.from).map(b => key9(b.client_phone)));
      const todo = prio.filter(p => !booked.has(key9(p.phone)));
      if (!free.length) { out.push(`⭐ Priorité ${w.name} : toutes tes voitures sont déjà prises du ${dfr(w.from)} au ${dfr(w.to)}. Je ne préviens pas tes ${todo.length} client(s) prioritaire(s) : il n'y a rien à leur proposer. Si une réservation est annulée, je te les propose en premier.`); continue; }
      const lines = todo.map(p => { const lang = (B.find(b => key9(b.client_phone) === key9(p.phone))?.client_lang === 'ar') ? 'ar' : 'fr'; const l = wa(p.phone, earlyText(p, w, free.length, lang)); return l ? `⭐ ${p.name} (${p.uses} ami${p.uses > 1 ? 's' : ''} amené${p.uses > 1 ? 's' : ''})\n👉 ${l}` : `⭐ ${p.name} : pas de numéro valable`; });
      if (lines.length) out.push(`⭐ Accès prioritaire ${w.name} (${dfr(w.from)} – ${dfr(w.to)}) : il reste ${free.length} voiture(s) libre(s) sur ${C.length}. Tes clients prioritaires sont prévenus AVANT la campagne. Appuie sur chaque lien, le message est prêt :\n\n${lines.join('\n\n')}`);
    }
    // (b) Voiture libérée (annulée / refusée depuis hier) pendant une vague → prioritaires d'abord
    const freed = B.filter(b => /CANCEL|REJECT/i.test(b.status) && b.start_date <= w.to && b.end_date >= w.from && (b.updated_at ?? '') >= new Date(Date.now() - 26 * 3600_000).toISOString());
    for (const b of freed) {
      if (await kvGet(`prio:freed:${b.id}`)) continue;
      await kvSet(`prio:freed:${b.id}`, '1', 120 * 86_400);
      if (taken.has(b.car_id)) continue;   // déjà reprise par quelqu'un d'autre
      const car = C.find(c => c.id === b.car_id)?.name ?? 'une voiture';
      const who = prio.filter(p => key9(p.phone) !== key9(b.client_phone));
      out.push(`🔓 ${car} se libère du ${dfr(b.start_date)} au ${dfr(b.end_date)} (${w.name}, annulation de ${b.client_name}).`
        + (who.length ? ` Propose-la d'abord à tes clients prioritaires :\n${who.map(p => `⭐ ${p.name}${p.phone ? ` (${p.phone})` : ''}`).join('\n')}\nSans réponse de leur part, tu la proposes à tout le monde.` : ` Tu n'as pas encore de client prioritaire : propose-la à tout le monde.`));
    }
  }
  if (out.length) await queueTelegramMessage(out.join('\n\n———\n\n')).catch(() => {});
  return out.length ? `${out.length} message(s)` : 'rien';
}
