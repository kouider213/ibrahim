import { supabase } from './supabase.js';
import { getFinancialReport, formatFinancialReport } from './finance.js';
import { getFileContent, updateFile } from './github.js';
import { learnRule } from './claude-api.js';

export async function executeTool(
  name: string,
  input: Record<string, unknown>,
): Promise<string> {
  try {
    switch (name) {
      case 'list_bookings':       return await listBookings(input);
      case 'update_booking':      return await updateBooking(input);
      case 'create_booking':      return await createBooking(input);
      case 'cancel_booking':      return await cancelBooking(input);
      case 'delete_booking':      return await deleteBooking(input);
      case 'get_financial_report':return await financialReport(input);
      case 'store_document':      return await storeDocument(input);
      case 'read_site_file':      return await readSiteFile(input);
      case 'update_site_file':    return await updateSiteFile(input);
      case 'learn_rule':          return await learnRuleTool(input);
      default:                    return `Outil inconnu: ${name}`;
    }
  } catch (err) {
    return `Erreur outil ${name}: ${err instanceof Error ? err.message : String(err)}`;
  }
}

async function listBookings(input: Record<string, unknown>): Promise<string> {
  let query = supabase
    .from('bookings')
    .select('id, client_name, client_phone, start_date, end_date, final_price, status, rented_by, cars(name)')
    .order('start_date', { ascending: false })
    .limit(Number(input['limit'] ?? 20));

  if (input['status'])      query = query.eq('status', input['status'] as string);
  if (input['client_name']) query = query.ilike('client_name', `%${input['client_name']}%`);

  const { data, error } = await query;
  if (error) return `Erreur: ${error.message}`;
  if (!data?.length) return 'Aucune réservation trouvée.';

  const rows = (data as unknown as Array<{
    id: string; client_name: string; client_phone?: string;
    start_date: string; end_date: string; final_price: number;
    status: string; rented_by?: string; cars?: { name: string };
  }>).map(b =>
    `- [${b.id}] ${b.client_name} | ${b.cars?.name ?? '?'} | ${b.start_date} → ${b.end_date} | ${b.final_price}€ | ${b.status} | ${b.rented_by ?? 'Kouider'}`,
  );

  return `${data.length} réservation(s):\n${rows.join('\n')}`;
}

async function updateBooking(input: Record<string, unknown>): Promise<string> {
  const { id, ...updates } = input as { id: string } & Record<string, unknown>;
  if (!id) return 'Erreur: id obligatoire';

  const { id: _i, ...safeUpdates } = updates;
  (safeUpdates as Record<string, unknown>)['updated_at'] = new Date().toISOString();

  const { data, error } = await supabase
    .from('bookings')
    .update(safeUpdates)
    .eq('id', id)
    .select('id, client_name, start_date, end_date, status')
    .single();

  if (error) return `Erreur mise à jour: ${error.message}`;
  const b = data as { client_name: string; start_date: string; end_date: string; status: string };
  return `✅ Réservation ${id.slice(0,8)} mise à jour: ${b.client_name} | ${b.start_date} → ${b.end_date} | ${b.status}`;
}

async function createBooking(input: Record<string, unknown>): Promise<string> {
  const { car_id, client_name, client_phone, client_age, start_date, end_date, final_price, notes, rented_by } = input as {
    car_id: string; client_name: string; client_phone?: string; client_age: number;
    start_date: string; end_date: string; final_price: number;
    notes?: string; rented_by?: string;
  };

  const days = Math.ceil((new Date(end_date).getTime() - new Date(start_date).getTime()) / 86_400_000);

  const { data, error } = await supabase.from('bookings').insert({
    car_id, client_name, client_phone, client_age, start_date, end_date,
    nb_days:               days,
    final_price,
    base_price_snapshot:   final_price,
    resale_price_snapshot: final_price,
    profit:                0,
    status:                'CONFIRMED',
    rented_by:             rented_by ?? 'Kouider',
    notes,
    whatsapp_sent: false,
    sms_sent:      false,
  }).select('id').single();

  if (error) return `Erreur création: ${error.message}`;
  return `✅ Réservation créée: ${client_name} | ${days} jours | ID: ${(data as { id: string }).id}`;
}

async function cancelBooking(input: Record<string, unknown>): Promise<string> {
  const { id } = input as { id: string };
  if (!id) return 'Erreur: id obligatoire';

  const { error } = await supabase
    .from('bookings')
    .update({ status: 'REJECTED', updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) return `Erreur annulation: ${error.message}`;
  return `✅ Réservation ${id.slice(0,8)} annulée.`;
}

async function deleteBooking(input: Record<string, unknown>): Promise<string> {
  const { id } = input as { id: string };
  if (!id) return 'Erreur: id obligatoire';

  const { error } = await supabase
    .from('bookings')
    .delete()
    .eq('id', id);

  if (error) return `Erreur suppression: ${error.message}`;
  return `✅ Réservation ${id.slice(0,8)} supprimée définitivement.`;
}

async function financialReport(input: Record<string, unknown>): Promise<string> {
  const year  = Number(input['year']  ?? new Date().getFullYear());
  const month = input['month'] ? Number(input['month']) : undefined;
  const report = await getFinancialReport(year, month);
  return formatFinancialReport(report);
}

async function storeDocument(input: Record<string, unknown>): Promise<string> {
  const { client_phone, client_name, booking_id, type, file_url, notes } = input as {
    client_phone: string; client_name: string; booking_id?: string;
    type: string; file_url: string; notes?: string;
  };

  const { error } = await supabase.from('client_documents').insert({
    client_phone, client_name, booking_id, type, file_url,
    storage_path: file_url,
    notes,
  });

  if (error) return `Erreur stockage: ${error.message}`;
  return `✅ Document ${type} enregistré pour ${client_name}`;
}

async function readSiteFile(input: Record<string, unknown>): Promise<string> {
  const { path } = input as { path: string };
  const file = await getFileContent(path);
  if (!file) return `Fichier introuvable: ${path}`;
  return `Contenu de ${path}:\n\`\`\`\n${file.content.slice(0, 3000)}\n\`\`\``;
}

async function updateSiteFile(input: Record<string, unknown>): Promise<string> {
  const { path, content, message } = input as { path: string; content: string; message?: string };
  const result = await updateFile(path, content, message ?? `Ibrahim: update ${path}`);
  if (!result) return `Échec GitHub update: ${path}`;
  return `✅ Site mis à jour: ${path} — commit ${result.commitSha} — Vercel redéploie.`;
}

async function learnRuleTool(input: Record<string, unknown>): Promise<string> {
  const { instruction } = input as { instruction: string };
  const rule = await learnRule(instruction);
  const { error } = await supabase.from('ibrahim_rules').insert({ ...rule, source: 'learned', active: true });
  if (error) return `Erreur mémorisation: ${error.message}`;
  return `✅ Règle mémorisée: "${rule.rule}"`;
}
