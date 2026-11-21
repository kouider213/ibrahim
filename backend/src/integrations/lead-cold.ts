// 16/11 : « lead qui refroidit » — une demande du site (lead, dossier, import, réservation en attente) restée plus de
// 48 h sans être traitée → 1 message par jour à 10h30 avec la liste ; la relance est prête dans l'app (Demandes →
// « Relancer sur WhatsApp », dans la langue du client). Chaque demande n'est signalée que 2 fois (J+2 et J+5), jamais plus.
import { supabase } from './supabase.js';
import { kvJson, kvPut, tg } from './ai-util.js';

const CLOSED = new Set(['perdu', 'conclu', 'lost', 'won', 'refuse', 'refusé', 'CANCELLED', 'DELIVERED', 'FINALIZED', 'COMPLETED', 'REJECTED', 'DECLINED']);
type Row = { id: string; client_name: string | null; status: string | null; created_at: string; what: string };

export async function coldLeads(minH = 48, maxDays = 21): Promise<Row[]> {
  const from = new Date(Date.now() - maxDays * 86_400_000).toISOString(), to = new Date(Date.now() - minH * 3_600_000).toISOString();
  const q = async (table: string, sel: string, what: (r: Record<string, unknown>) => string, extra?: (b: ReturnType<typeof supabase.from>) => unknown) => {
    try {
      let b = supabase.from(table).select(sel).gte('created_at', from).lte('created_at', to).limit(100);
      if (extra) b = extra(b as never) as typeof b;
      const { data } = await b;
      // paniers du site (« 🛒 panier ») : relancés par relance-clients.ts, pas ici
      return ((data ?? []) as unknown as Array<Record<string, unknown>>).filter(r => !String(r['notes'] ?? '').startsWith('🛒')).map(r => ({ id: `${table}:${r['id']}`, client_name: (r['client_name'] as string) ?? null, status: (r['status'] as string) ?? null, created_at: String(r['created_at']), what: what(r) }));
    } catch { return []; }
  };
  const all = (await Promise.all([
    q('client_leads', 'id, client_name, status, created_at, criteria, category, notes', r => String(r['criteria'] || r['category'] || 'demande')),
    q('dossiers', 'id, client_name, status, created_at, subject, kind', r => String(r['subject'] || r['kind'] || 'dossier')),
    q('import_orders', 'id, client_name, status, created_at, vehicle_brand, vehicle_model', r => `import ${[r['vehicle_brand'], r['vehicle_model']].filter(Boolean).join(' ')}`.trim()),
    q('bookings', 'id, client_name, status, created_at', () => 'réservation en attente', b => (b as unknown as { eq: (c: string, v: string) => unknown }).eq('status', 'PENDING')),
  ])).flat();
  return all.filter(r => !r.status || !CLOSED.has(r.status));
}

export async function jobLeadCold(): Promise<string> {
  const rows = await coldLeads();
  const sent = await kvJson<Record<string, number>>('leads:cold:sent', {});
  const ageD = (iso: string) => Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  // J+2 puis J+5, pas plus
  const due = rows.filter(r => { const n = sent[r.id] ?? 0, d = ageD(r.created_at); return (n === 0 && d >= 2) || (n === 1 && d >= 5); });
  if (!due.length) return 'rien';
  for (const r of due) sent[r.id] = (sent[r.id] ?? 0) + 1;
  await kvPut('leads:cold:sent', Object.fromEntries(Object.entries(sent).slice(-300)), 40 * 86_400);
  const lines = due.slice(0, 8).map(r => `• ${r.client_name || 'Sans nom'} — ${r.what.slice(0, 60)} (il y a ${ageD(r.created_at)} j)`);
  await tg(`⏳ ${due.length === 1 ? 'Une demande du site attend' : `${due.length} demandes du site attendent`} depuis plus de 2 jours :\n${lines.join('\n')}\n\nLa relance est déjà écrite dans la langue du client : app → Demandes → « Relancer sur WhatsApp ». Sinon marque-la « perdu » pour que je n'en parle plus.`);
  return `${due.length} signalée(s)`;
}
