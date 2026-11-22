// 22/11 Kouider : les photos de passeport / carte d'identité envoyées avec les réservations du site
// (bucket PRIVÉ client-ids) sont effacées toutes seules :
//  - 30 jours après le retour de la voiture,
//  - 7 jours après un refus / une annulation,
//  - photo sans réservation (formulaire abandonné après l'envoi) au bout de 3 jours.
import { supabase } from './supabase.js';

const BUCKET = 'client-ids';
const REF = /réf\. (\d{4}-\d{2}\/[\w-]+\.(?:jpg|png|webp))\)/;
const ago = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

export async function jobClientIdsCleanup(): Promise<string> {
  const { data: bks } = await supabase.from('bookings').select('id, status, end_date, updated_at, notes').ilike('notes', '%réf. %');
  const used = new Set<string>();
  const remove: string[] = [];
  for (const b of (bks ?? []) as Array<{ status: string; end_date: string; updated_at: string | null; notes: string | null }>) {
    const path = REF.exec(b.notes ?? '')?.[1];
    if (!path) continue;
    used.add(path);
    const closed = /^(REJECTED|CANCELLED|CANCELED)$/i.test(b.status);
    if ((closed && (b.updated_at ?? b.end_date).slice(0, 10) < ago(7)) || b.end_date.slice(0, 10) < ago(30)) remove.push(path);
  }
  // Photos orphelines (aucune réservation ne les cite) de plus de 3 jours
  const { data: months } = await supabase.storage.from(BUCKET).list('', { limit: 100 });
  for (const m of months ?? []) {
    const { data: files } = await supabase.storage.from(BUCKET).list(m.name, { limit: 1000 });
    for (const f of files ?? []) {
      const p = `${m.name}/${f.name}`;
      if (!used.has(p) && f.created_at && f.created_at.slice(0, 10) < ago(3)) remove.push(p);
    }
  }
  if (!remove.length) return 'rien à effacer';
  const { error } = await supabase.storage.from(BUCKET).remove([...new Set(remove)]);
  return error ? `erreur : ${error.message}` : `${new Set(remove).size} photo(s) d'identité effacée(s)`;
}
