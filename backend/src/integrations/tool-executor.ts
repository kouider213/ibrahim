import { supabase } from './supabase.js';
import { getFinancialReport, formatFinancialReport } from './finance.js';
import { getFileContent, updateFile, listDirectory, triggerNetlifyDeploy } from './github.js';
import { learnRule } from './claude-api.js';
import { getOranWeather } from './web-search.js';
import { getRailwayLogs } from './railway.js';
import { env } from '../config/env.js';
import {
  getPaymentStatus,
  recordPayment,
  getRevenueReport,
  getUnpaidBookings,
  generateReceipt,
  getFinanceDashboard,
} from './phase5-finance.js';
import axios from 'axios';

export async function executeTool(
  name: string,
  input: Record<string, unknown>,
): Promise<string> {
  try {
    switch (name) {
      case 'list_bookings':         return await listBookings(input);
      case 'update_booking':        return await updateBooking(input);
      case 'create_booking':        return await createBooking(input);
      case 'cancel_booking':        return await cancelBooking(input);
      case 'delete_booking':        return await deleteBooking(input);
      case 'get_financial_report':  return await financialReport(input);
      case 'store_document':        return await storeDocument(input);
      case 'read_site_file':        return await readSiteFile(input);
      case 'update_site_file':      return await updateSiteFile(input);
      case 'learn_rule':            return await learnRuleTool(input);
      case 'remember_info':         return await rememberInfo(input);
      case 'recall_memory':         return await recallMemory(input);
      case 'get_weather':           return await getWeather(input);
      case 'get_news':              return await getNews(input);
      case 'github_read_file':      return await githubReadFile(input);
      case 'github_write_file':     return await githubWriteFile(input);
      case 'github_list_files':     return await githubListFiles(input);
      case 'railway_get_logs':      return await railwayGetLogs(input);
      case 'supabase_execute':      return await supabaseExecute(input);
      case 'netlify_deploy':        return await netlifyDeploy(input);
      // ─── PHASE 5 ───
      case 'get_payment_status':    return await getPaymentStatus(input['booking_id'] as string | undefined);
      case 'record_payment':        return await recordPayment(
                                      input['booking_id'] as string,
                                      Number(input['amount']),
                                      (input['type'] as 'acompte' | 'solde' | 'partiel') ?? 'partiel',
                                      input['note'] as string | undefined,
                                    );
      case 'get_revenue_report':    return await getRevenueReport(
                                      (input['period'] as 'week' | 'month' | 'year') ?? 'month',
                                      input['year'] ? Number(input['year']) : undefined,
                                      input['month'] ? Number(input['month']) : undefined,
                                      input['car_name'] as string | undefined,
                                    );
      case 'get_unpaid_bookings':   return await getUnpaidBookings();
      case 'generate_receipt':      return await generateReceipt(input['booking_id'] as string);
      case 'get_finance_dashboard': return await getFinanceDashboard();
      default:                      return `Outil inconnu: ${name}`;
    }
  } catch (err) {
    return `Erreur outil ${name}: ${err instanceof Error ? err.message : String(err)}`;
  }
}

async function listBookings(input: Record<string, unknown>): Promise<string> {
  let query = supabase
    .from('bookings')
    .select('id, client_name, client_phone, start_date, end_date, final_price, status, payment_status, paid_amount, cars(name)')
    .order('start_date', { ascending: false })
    .limit(Number(input['limit'] ?? 20));

  if (input['status'])      query = query.eq('status', input['status'] as string);
  if (input['client_name']) query = query.ilike('client_name', `%${input['client_name']}%`);

  const { data, error } = await query;
  if (error) {
    const { data: fallback, error: err2 } = await supabase
      .from('bookings')
      .select('id, client_name, client_phone, start_date, end_date, final_price, status')
      .order('start_date', { ascending: false })
      .limit(Number(input['limit'] ?? 20));
    if (err2) return `Erreur: ${err2.message}`;
    if (!fallback?.length) return 'Aucune réservation trouvée.';
    return `${fallback.length} réservation(s):\n${(fallback as any[]).map(b =>
      `- [${b.id}] ${b.client_name} | ${b.start_date} → ${b.end_date} | ${b.final_price}€ | ${b.status}`
    ).join('\n')}`;
  }
  if (!data?.length) return 'Aucune réservation trouvée.';

  const rows = (data as any[]).map(b => {
    const payInfo = b.payment_status
      ? ` | 💰 ${b.payment_status} (payé: ${b.paid_amount ?? 0}€)`
      : '';
    return `- [${b.id}] ${b.client_name} | ${b.cars?.name ?? '?'} | ${b.start_date} → ${b.end_date} | ${b.final_price}€ | ${b.status}${payInfo}`;
  });

  return `${data.length} réservation(s):\n${rows.join('\n')}`;
}

async function updateBooking(input: Record<string, unknown>): Promise<string> {
  const id = input['id'] as string;
  if (!id) return 'ID manquant';

  const fields: Record<string, unknown> = {};
  if (input['client_name'])  fields['client_name']  = input['client_name'];
  if (input['client_phone']) fields['client_phone'] = input['client_phone'];
  if (input['client_age'])   fields['client_age']   = input['client_age'];
  if (input['start_date'])   fields['start_date']   = input['start_date'];
  if (input['end_date'])     fields['end_date']     = input['end_date'];
  if (input['final_price'] !== undefined) fields['final_price'] = input['final_price'];
  if (input['status'])       fields['status']       = input['status'];
  if (input['rented_by'])    fields['rented_by']    = input['rented_by'];
  if (input['notes'])        fields['notes']        = input['notes'];

  const { error } = await supabase.from('bookings').update(fields).eq('id', id);
  if (error) return `Erreur mise à jour: ${error.message}`;
  return `✅ Réservation ${id} mise à jour: ${JSON.stringify(fields)}`;
}

async function createBooking(input: Record<string, unknown>): Promise<string> {
  const { data, error } = await supabase
    .from('bookings')
    .insert({
      car_id:       input['car_id'],
      client_name:  input['client_name'],
      client_phone: input['client_phone'] ?? null,
      client_age:   input['client_age']   ?? null,
      start_date:   input['start_date'],
      end_date:     input['end_date'],
      final_price:  input['final_price'],
      notes:        input['notes']        ?? null,
      rented_by:    input['rented_by']    ?? 'Kouider',
      status:       input['status']       ?? 'CONFIRMED',
      payment_status: 'PENDING',
      paid_amount:  0,
    })
    .select()
    .single();

  if (error) return `Erreur création: ${error.message}`;
  return `✅ Réservation créée! ID: ${(data as any).id} | ${input['client_name']} | ${input['start_date']} → ${input['end_date']} | ${input['final_price']}€`;
}

async function cancelBooking(input: Record<string, unknown>): Promise<string> {
  const { error } = await supabase
    .from('bookings')
    .update({ status: 'REJECTED' })
    .eq('id', input['id'] as string);
  if (error) return `Erreur annulation: ${error.message}`;
  return `✅ Réservation ${input['id']} annulée (REJECTED)`;
}

async function deleteBooking(input: Record<string, unknown>): Promise<string> {
  const { error } = await supabase
    .from('bookings')
    .delete()
    .eq('id', input['id'] as string);
  if (error) return `Erreur suppression: ${error.message}`;
  return `✅ Réservation ${input['id']} supprimée définitivement`;
}

async function financialReport(input: Record<string, unknown>): Promise<string> {
  const year  = Number(input['year']  ?? new Date().getFullYear());
  const month = input['month'] ? Number(input['month']) : undefined;
  const report = await getFinancialReport(year, month);
  return formatFinancialReport(report);
}

async function storeDocument(input: Record<string, unknown>): Promise<string> {
  const { data, error } = await supabase
    .from('client_documents')
    .insert({
      client_phone: input['client_phone'],
      client_name:  input['client_name'],
      booking_id:   input['booking_id'] ?? null,
      type:         input['type'],
      file_url:     input['file_url'],
      notes:        input['notes'] ?? null,
    })
    .select()
    .single();

  if (error) return `Erreur stockage document: ${error.message}`;
  return `✅ Document ${input['type']} stocké pour ${input['client_name']}. ID: ${(data as any).id}`;
}

async function readSiteFile(input: Record<string, unknown>): Promise<string> {
  const result = await getFileContent(input['path'] as string, 'autolux-location');
  if (!result) return `Fichier non trouvé: ${input['path']}`;
  return result.content;
}

async function updateSiteFile(input: Record<string, unknown>): Promise<string> {
  const result = await updateFile(
    input['path']    as string,
    input['content'] as string,
    input['message'] as string,
    'autolux-location',
  );
  if (!result) return `Erreur: impossible de mettre à jour ${input['path']}`;
  return `✅ Fichier mis à jour: ${input['path']} (commit: ${result.commitSha})`;
}

async function learnRuleTool(input: Record<string, unknown>): Promise<string> {
  const result = await learnRule(input['instruction'] as string);
  return `✅ Règle apprise [${result.category}]: ${result.rule}`;
}

async function rememberInfo(input: Record<string, unknown>): Promise<string> {
  const { data, error } = await supabase
    .from('ibrahim_memory')
    .insert({
      category: input['category'] ?? 'fact',
      content:  input['content'],
    })
    .select()
    .single();

  if (error) return `Erreur mémoire: ${error.message}`;
  return `✅ Mémorisé [${input['category']}]: ${input['content']}`;
}

async function recallMemory(input: Record<string, unknown>): Promise<string> {
  let query = supabase
    .from('ibrahim_memory')
    .select('category, content, created_at')
    .order('created_at', { ascending: false })
    .limit(20);

  if (input['category']) query = query.eq('category', input['category'] as string);
  if (input['query']) query = query.ilike('content', `%${input['query']}%`);

  const { data, error } = await query;
  if (error) return `Erreur recall: ${error.message}`;
  if (!data?.length) return 'Aucun souvenir trouvé.';
  return data.map((m: any) => `[${m.category}] ${m.content}`).join('\n');
}

async function getWeather(input: Record<string, unknown>): Promise<string> {
  const city    = (input['city']    as string) || 'Oran';
  const country = (input['country'] as string) || '';
  return getOranWeather(`${city}${country ? ', ' + country : ''}`);
}

async function getNews(input: Record<string, unknown>): Promise<string> {
  const source = (input['source'] as string) || 'algerie';
  try {
    const query   = source === 'monde' ? 'actualités monde today' : 'actualités Algérie aujourd\'hui';
    const encoded = encodeURIComponent(query);
    const resp    = await axios.get(`https://news.google.com/rss/search?q=${encoded}&hl=fr&gl=DZ&ceid=DZ:fr`, { timeout: 8000 });
    const items   = (resp.data as string).match(/<title>(.*?)<\/title>/g)?.slice(1, 8) ?? [];
    const titles  = items.map(t => t.replace(/<\/?title>/g, '').trim());
    return titles.length ? `📰 Actualités (${source}):\n${titles.map((t, i) => `${i + 1}. ${t}`).join('\n')}` : 'Aucune actualité trouvée.';
  } catch {
    return 'Impossible de récupérer les actualités.';
  }
}

async function githubReadFile(input: Record<string, unknown>): Promise<string> {
  const repo = (input['repo'] as string) || 'ibrahim';
  const path = input['path'] as string;
  const result = await getFileContent(path, repo);
  if (!result) return `Fichier non trouvé: ${path}`;
  return result.content;
}

async function githubWriteFile(input: Record<string, unknown>): Promise<string> {
  const repo    = (input['repo']    as string) || 'ibrahim';
  const path    = input['path']    as string;
  const content = input['content'] as string;
  const message = (input['message'] as string) || 'update';
  const result = await updateFile(path, content, message, repo);
  if (!result) return `Erreur: impossible de mettre à jour ${path}`;
  return `✅ Fichier mis à jour: ${path} (commit: ${result.commitSha})`;
}

async function githubListFiles(input: Record<string, unknown>): Promise<string> {
  const repo = (input['repo'] as string) || 'ibrahim';
  const path = (input['path'] as string) || '';
  const files = await listDirectory(path, repo);
  if (!files.length) return `Répertoire vide ou non trouvé: ${path || '/'}`;
  return files.map(f => `${f.type === 'dir' ? '📁' : '📄'} ${f.path}`).join('\n');
}

async function railwayGetLogs(input: Record<string, unknown>): Promise<string> {
  const limit = Number(input['limit'] ?? 50);
  return getRailwayLogs(limit);
}

async function supabaseExecute(input: Record<string, unknown>): Promise<string> {
  const sql = input['sql'] as string;
  if (!sql) return 'SQL manquant';

  const supabaseUrl   = env.SUPABASE_URL;
  const supabaseToken = process.env['SUPABASE_ACCESS_TOKEN'];

  if (!supabaseToken) return 'SUPABASE_ACCESS_TOKEN non configuré dans Railway.';

  try {
    const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\./)?.[1];
    if (!projectRef) return 'Impossible d\'extraire le project ref depuis SUPABASE_URL';

    const resp = await axios.post(
      `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
      { query: sql },
      {
        headers: {
          Authorization: `Bearer ${supabaseToken}`,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      },
    );

    const result = resp.data;
    if (Array.isArray(result) && result.length === 0) return '✅ SQL exécuté:\n[]';
    if (Array.isArray(result)) {
      return `✅ SQL exécuté:\n${JSON.stringify(result.slice(0, 50), null, 2)}`;
    }
    return `✅ SQL exécuté:\n${JSON.stringify(result, null, 2)}`;
  } catch (err: any) {
    const msg = err.response?.data?.message || err.response?.data?.error || err.message;
    return `❌ Erreur SQL: ${msg}`;
  }
}

async function netlifyDeploy(input: Record<string, unknown>): Promise<string> {
  const siteId = (input['site_id'] as string) || 'fik-conciergerie-oran';
  const ok = await triggerNetlifyDeploy(siteId);
  return ok ? `✅ Déploiement Netlify déclenché pour: ${siteId}` : `❌ Échec du déploiement Netlify pour: ${siteId}`;
}
