import { supabase } from './supabase.js';
import { createCalendarEvent, syncPendingBookings, listUpcomingEvents } from './google-calendar.js';
import { getFinancialReport, formatFinancialReport } from './finance.js';
import { executeMediaTool } from './media-executor.js';
import { getFileContent, updateFile, listDirectory, triggerNetlifyDeploy, searchCode } from './github.js';
import { learnRule } from './claude-api.js';
import { getOranWeather } from './web-search.js';
import { getRailwayLogs, waitForDeploy } from './railway.js';
import { env } from '../config/env.js';
import {
  getPaymentStatus,
  recordPayment,
  getCAReport,
  getUnpaidBookings,
  generateReceipt,
  getFinancialDashboard,
  checkAnomalies,
} from './phase5-finance.js';
import {
  recordFeedback as recordFeedbackAPI,
  getKouiderPreferences,
} from './feedback-system.js';
import {
  generateMonthlyReport,
  getEvolutionReport,
  formatReportForKouider,
} from './improvement-report.js';
import FormData from 'form-data';
import { sendWhatsApp } from './whatsapp.js';
import { sendMessage as sendTelegramText, sendPhoto as sendTelegramPhoto, sendDocument as sendTelegramDoc } from './telegram.js';
import { generateReservationVoucher } from './generate-voucher.js';
import { schedulerQueue } from '../queue/scheduler.js';
import axios from 'axios';

export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  sessionId?: string,
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
      case 'railway_wait_deploy':   return await waitForDeploy(Number(input['timeout_seconds'] ?? 180) * 1000);
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
      case 'get_revenue_report':    return await getCAReport(
                                      input['year'] ? Number(input['year']) : new Date().getFullYear(),
                                      input['month'] ? Number(input['month']) : undefined,
                                      input['week'] ? Number(input['week']) : undefined,
                                    );
      case 'get_unpaid_bookings':   return await getUnpaidBookings();
      case 'generate_receipt':      return await generateReceipt(input['booking_id'] as string);
      case 'get_finance_dashboard': return await getFinancialDashboard();
      case 'check_anomalies':            return await checkAnomalies();
      // ─── PHASE 13 ───
      case 'record_feedback':            return await recordFeedbackTool(input, sessionId);
      case 'get_monthly_improvement_report': return await getMonthlyImprovementReportTool(input);
      case 'get_learning_evolution':     return await getLearningEvolutionTool(input);
      case 'get_kouider_preferences':    return await getKouiderPreferencesTool();
      // ─── PHASE 6 — WhatsApp ───
      case 'send_whatsapp_to_client':    return await sendWhatsAppToClient(input);
      case 'check_car_availability':     return await checkCarAvailability(input);
      // ─── GitHub search ───
      case 'github_search_code':         return await githubSearchCode(input);
      // ─── Documents client ───
      case 'get_client_document':        return await getClientDocument(input);
      // ─── Telegram depuis app vocale ───
      case 'send_telegram_message':      return await sendTelegramMessage(input);
      // ─── Web / Internet ───
      case 'web_search':                 return await webSearch(input);
      case 'fetch_url':                  return await fetchUrl(input);
      // ─── Rappels ───
      case 'schedule_reminder':          return await scheduleReminder(input);
      // ─── PHASE 15 — Recherche images ───
      case 'search_images':              return await searchImages(input);
      // ─── GOOGLE CALENDAR ───
      case 'create_calendar_event':      return await createCalendarEventTool(input);
      case 'sync_calendar':             return await syncCalendarTool();
      case 'list_calendar_events':      return await listCalendarEventsTool(input);
      case 'get_late_returns':                   return await getLateReturns();
      case 'generate_reservation_voucher':       return await generateVoucherTool(input, sessionId);
      // ─── PHASE 14 — Image & Vidéo ───
      case 'analyze_image':
      case 'optimize_image':
      case 'create_social_variants':
      case 'enhance_image':
      case 'remove_background':
      case 'add_text_overlay':
      case 'analyze_video':
      case 'cut_video':
      case 'merge_videos':
      case 'add_subtitles':
      case 'optimize_for_platform':
      case 'extract_thumbnail':
      case 'add_background_music':
      case 'create_video_preview':       return await executeMediaTool(name, input);
      default:                           return `Outil inconnu: ${name}`;
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
  if (!input['car_id'])      return '❌ car_id manquant — spécifie la voiture';
  if (!input['client_name']) return '❌ client_name manquant';
  if (!input['start_date'])  return '❌ start_date manquant (format YYYY-MM-DD)';
  if (!input['end_date'])    return '❌ end_date manquant (format YYYY-MM-DD)';
  if (input['start_date'] > input['end_date']) return '❌ start_date doit être avant end_date';

  const VALID_STATUSES = ['CONFIRMED', 'PENDING', 'ACTIVE', 'COMPLETED', 'REJECTED'];
  const status = (input['status'] as string) ?? 'CONFIRMED';
  if (!VALID_STATUSES.includes(status)) return `❌ status invalide: ${status}. Valeurs: ${VALID_STATUSES.join(', ')}`;

  const VALID_PAYMENT_STATUSES = ['PENDING', 'PARTIAL', 'PAID'];
  const paymentStatus = (input['payment_status'] as string) ?? 'PENDING';
  if (!VALID_PAYMENT_STATUSES.includes(paymentStatus)) return `❌ payment_status invalide: ${paymentStatus}. Valeurs: ${VALID_PAYMENT_STATUSES.join(', ')}`;

  const { data, error } = await supabase
    .from('bookings')
    .insert({
      car_id:         input['car_id'],
      client_name:    input['client_name'],
      client_phone:   input['client_phone'] ?? null,
      client_age:     input['client_age']   ?? null,
      start_date:     input['start_date'],
      end_date:       input['end_date'],
      final_price:    input['final_price'],
      notes:          input['notes']        ?? null,
      rented_by:      input['rented_by']    ?? 'Kouider',
      status,
      payment_status: paymentStatus,
      paid_amount:    Number(input['paid_amount'] ?? 0),
    })
    .select()
    .single();

  if (error) return `Erreur création: ${error.message}`;

  const booking = data as any;
  let calendarNote = '';
  try {
    const { data: car } = await supabase.from('cars').select('name').eq('id', input['car_id']).single();
    const carName = (car as any)?.name ?? 'Véhicule';
    const eventId = await createCalendarEvent(booking.id, input['client_name'] as string, carName, input['start_date'] as string, input['end_date'] as string, input['notes'] as string | undefined);
    calendarNote = eventId ? ' | 📅 Ajouté Google Agenda' : ' | ⚠️ Google Agenda non synchro';
  } catch { calendarNote = ' | ⚠️ Google Agenda non synchro'; }

  return `✅ Réservation créée! ID: ${booking.id} | ${input['client_name']} | ${input['start_date']} → ${input['end_date']} | ${input['final_price']}€${calendarNote}`;
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
  const id = input['id'] as string;
  const { data: booking } = await supabase.from('bookings').select('status').eq('id', id).single();
  if (!booking) return `❌ Réservation ${id} introuvable`;
  if (['ACTIVE', 'CONFIRMED'].includes(booking.status as string)) {
    return `❌ Impossible de supprimer une réservation ${booking.status}. Annule-la d'abord avec cancel_booking.`;
  }
  const { error } = await supabase.from('bookings').delete().eq('id', id);
  if (error) return `Erreur suppression: ${error.message}`;
  return `✅ Réservation ${id} supprimée définitivement`;
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
  const { error } = await supabase
    .from('ibrahim_memory')
    .insert({
      category: input['category'] ?? 'fact',
      content:  input['content'],
    });

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

async function getWeather(_input: Record<string, unknown>): Promise<string> {
  const data = await getOranWeather();
  return JSON.stringify(data);
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
  // Only allow SELECT queries — prevent accidental destructive operations via Claude
  const trimmed = sql.trim().toUpperCase();
  if (!trimmed.startsWith('SELECT') && !trimmed.startsWith('WITH')) {
    return '❌ Seules les requêtes SELECT sont autorisées via cet outil.';
  }

  const supabaseUrl   = env.SUPABASE_URL;
  const supabaseToken = env.SUPABASE_ACCESS_TOKEN;

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

// ─── PHASE 13 — APPRENTISSAGE CONTINU ─────────────────────────────────────

async function recordFeedbackTool(input: Record<string, unknown>, sessionId?: string): Promise<string> {
  const actionType = input['action_type'] as string;
  const rating = input['rating'] as 'positive' | 'negative' | 'neutral';
  const actionId = input['action_id'] as string | undefined;
  const comment = input['comment'] as string | undefined;
  const contextStr = input['context'] as string | undefined;
  const context = contextStr ? JSON.parse(contextStr) : undefined;

  const feedback = await recordFeedbackAPI({
    sessionId: sessionId ?? 'default',
    actionType,
    actionId,
    rating,
    comment,
    context,
  });

  return `✅ Feedback enregistré [${rating}] pour ${actionType}. ID: ${feedback.id}`;
}

async function getMonthlyImprovementReportTool(input: Record<string, unknown>): Promise<string> {
  const now = new Date();
  const year = input['year'] ? Number(input['year']) : now.getFullYear();
  const month = input['month'] ? Number(input['month']) : now.getMonth() + 1;

  const report = await generateMonthlyReport(year, month);
  return formatReportForKouider(report);
}

async function getLearningEvolutionTool(input: Record<string, unknown>): Promise<string> {
  const months = input['months'] ? Number(input['months']) : 6;
  const evolution = await getEvolutionReport(months);

  let text = `📈 **ÉVOLUTION DE L'APPRENTISSAGE** (${months} derniers mois)\n\n`;

  evolution.evolution.forEach(e => {
    const bar = '█'.repeat(Math.round(e.positive_rate * 20));
    text += `${e.period} : ${bar} ${Math.round(e.positive_rate * 100)}% | ${e.new_rules} règles\n`;
  });

  text += `\n**TENDANCES**\n`;
  text += `- ${evolution.trends.improving ? '📈 En amélioration' : '📉 Stable ou en baisse'}\n`;
  text += `- Taux de satisfaction moyen : **${Math.round(evolution.trends.avg_positive_rate * 100)}%**\n`;

  return text;
}

async function getKouiderPreferencesTool(): Promise<string> {
  const prefs = await getKouiderPreferences();

  let text = `🎯 **PRÉFÉRENCES CALIBRÉES DE KOUIDER**\n\n`;
  text += `**Style de réponse** : ${prefs.response_style}\n`;
  text += `**Ton** : ${prefs.tone}\n`;

  if (Object.keys(prefs.tiktok_styles).length > 0) {
    text += `\n**Styles TikTok favoris** :\n`;
    const sorted = Object.entries(prefs.tiktok_styles)
      .sort(([, a], [, b]) => (b as number) - (a as number))
      .slice(0, 5);
    sorted.forEach(([style, score]) => {
      text += `- ${style} : ${Math.round((score as number) * 100)}%\n`;
    });
  }

  text += `\n**Seuil d'approbation automatique** : ${Math.round(prefs.auto_approve_threshold * 100)}%\n`;

  return text;
}

// ── Phase 6 — WhatsApp tools ──────────────────────────────────

async function sendWhatsAppToClient(input: Record<string, unknown>): Promise<string> {
  const phone   = input['phone']   as string;
  const message = input['message'] as string;
  if (!phone || !message) return '❌ phone et message sont requis';
  const ok = await sendWhatsApp(phone, message);
  return ok
    ? `✅ Message WhatsApp envoyé à ${phone}`
    : `❌ Échec envoi WhatsApp à ${phone} (Twilio non configuré ?)`;
}

async function checkCarAvailability(input: Record<string, unknown>): Promise<string> {
  const startDate = input['start_date'] as string;
  const endDate   = input['end_date']   as string;
  const carId     = input['car_id']     as string | undefined;

  if (!startDate || !endDate) return '❌ start_date et end_date sont requis';

  const overlappingQuery = supabase
    .from('bookings')
    .select('car_id')
    .in('status', ['CONFIRMED', 'ACTIVE'])
    .lte('start_date', endDate)
    .gte('end_date', startDate);

  const { data: overlapping } = await overlappingQuery;
  const busyCarIds = new Set((overlapping ?? []).map((b: { car_id: string }) => b.car_id));

  let carsQuery = supabase.from('cars').select('id, name, base_price, category').eq('available', true);
  if (carId) carsQuery = carsQuery.eq('id', carId);

  const { data: cars, error } = await carsQuery;
  if (error) return `❌ Erreur: ${error.message}`;

  const startD = new Date(startDate);
  const endD   = new Date(endDate);
  const days   = Math.max(1, Math.round((endD.getTime() - startD.getTime()) / 86_400_000));

  const available = (cars ?? []).filter((c: { id: string }) => !busyCarIds.has(c.id));

  if (!available.length) {
    return carId
      ? `❌ La voiture demandée n'est pas disponible du ${startDate} au ${endDate}.`
      : `❌ Aucune voiture disponible du ${startDate} au ${endDate}.`;
  }

  const lines = available.map((c: { id: string; name: string; base_price: number; category: string }) => {
    const total = c.base_price * days;
    return `🚗 ${c.name} (${c.category}) — ${c.base_price.toLocaleString('fr-DZ')} DZD/jour → Total ${days}j: ${total.toLocaleString('fr-DZ')} DZD`;
  });

  return `✅ Disponible du ${startDate} au ${endDate} (${days} jours):\n${lines.join('\n')}`;
}

async function githubSearchCode(input: Record<string, unknown>): Promise<string> {
  const repo  = (input['repo'] as string) || 'ibrahim';
  const query = input['query'] as string;
  if (!query) return 'Query requise';
  return searchCode(repo, query);
}

async function getClientDocument(input: Record<string, unknown>): Promise<string> {
  let query = supabase
    .from('client_documents')
    .select('id, client_name, client_phone, type, file_url, storage_path, notes, created_at')
    .order('created_at', { ascending: false })
    .limit(5);

  if (input['client_name']) query = query.ilike('client_name', `%${input['client_name']}%`);
  if (input['client_phone']) query = query.ilike('client_phone', `%${input['client_phone']}%`);
  if (input['type']) query = query.eq('type', input['type']);

  const { data, error } = await query;
  if (error) return `Erreur: ${error.message}`;
  if (!data || data.length === 0) return 'Aucun document trouvé pour ce client.';

  type DocRow = { client_name: string; client_phone: string; type: string; file_url: string; storage_path?: string; notes?: string; created_at: string };

  const results = await Promise.all((data as DocRow[]).map(async d => {
    let url = d.file_url;
    if (d.storage_path) {
      const { data: signed } = await supabase.storage
        .from('client-documents')
        .createSignedUrl(d.storage_path, 3600);
      if (signed?.signedUrl) url = signed.signedUrl;
    }
    return `📄 ${d.client_name} (${d.client_phone}) — ${d.type}\nURL: ${url}\nDate: ${d.created_at.slice(0, 10)}${d.notes ? `\nNote: ${d.notes}` : ''}`;
  }));

  return results.join('\n\n');
}

async function webSearch(input: Record<string, unknown>): Promise<string> {
  const query = input['query'] as string;
  if (!query) return 'Query requise';
  try {
    const encoded = encodeURIComponent(query);
    const { data } = await axios.get(`https://s.jina.ai/${encoded}`, {
      headers: { 'Accept': 'text/plain', 'X-Retain-Images': 'none' },
      timeout: 15_000,
    });
    const text = typeof data === 'string' ? data : JSON.stringify(data);
    return text.slice(0, 4000) || 'Aucun résultat trouvé.';
  } catch (err) {
    return `Erreur recherche web: ${err instanceof Error ? err.message : String(err)}`;
  }
}

async function fetchUrl(input: Record<string, unknown>): Promise<string> {
  const url = input['url'] as string;
  if (!url) return 'URL requise';
  try {
    const encoded = encodeURIComponent(url);
    const { data } = await axios.get(`https://r.jina.ai/${encoded}`, {
      headers: { 'Accept': 'text/plain', 'X-Retain-Images': 'none' },
      timeout: 20_000,
    });
    const text = typeof data === 'string' ? data : JSON.stringify(data);
    return text.slice(0, 6000) || 'Page vide ou inaccessible.';
  } catch (err) {
    return `Erreur fetch URL: ${err instanceof Error ? err.message : String(err)}`;
  }
}

// ─── RAPPELS PERSONNALISÉS ────────────────────────────────────────────────────

async function scheduleReminder(input: Record<string, unknown>): Promise<string> {
  const message      = input['message']       as string;
  const delayMinutes = input['delay_minutes'] as number | undefined;
  const atTime       = input['at_time']       as string | undefined;

  if (!message) return '❌ message requis';

  let delayMs = 0;

  if (delayMinutes && delayMinutes > 0) {
    delayMs = delayMinutes * 60 * 1000;
  } else if (atTime) {
    const match = /^(\d{1,2}):(\d{2})$/.exec(atTime);
    if (!match) return '❌ at_time invalide — format HH:MM (ex: "14:30")';
    const [, h, m] = match;
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Brussels' }));
    const target = new Date(now);
    target.setHours(Number(h), Number(m), 0, 0);
    if (target <= now) target.setDate(target.getDate() + 1);
    delayMs = target.getTime() - now.getTime();
  } else {
    return '❌ Spécifie delay_minutes ou at_time';
  }

  await schedulerQueue.add(
    'custom-reminder',
    { message },
    { delay: delayMs, removeOnComplete: { count: 10 }, removeOnFail: { count: 3 } },
  );

  const mins = Math.round(delayMs / 60000);
  const hDisplay = mins >= 60
    ? `${Math.floor(mins / 60)}h${mins % 60 > 0 ? String(mins % 60).padStart(2, '0') : ''}`
    : `${mins}min`;
  return `✅ Rappel programmé dans ${hDisplay}: "${message}"`;
}

// ─── PHASE 15 — Recherche d'images (Pexels) ──────────────────────────────

// ─── GOOGLE CALENDAR ─────────────────────────────────────────────────────────

async function createCalendarEventTool(input: Record<string, unknown>): Promise<string> {
  const bookingId  = input['booking_id']  as string;
  const clientName = input['client_name'] as string;
  const carName    = input['car_name']    as string;
  const startDate  = input['start_date']  as string;
  const endDate    = input['end_date']    as string;
  const notes      = input['notes']       as string | undefined;

  if (!bookingId || !clientName || !carName || !startDate || !endDate)
    return '❌ booking_id, client_name, car_name, start_date, end_date sont requis';

  const eventId = await createCalendarEvent(bookingId, clientName, carName, startDate, endDate, notes);
  if (!eventId) return '❌ Impossible de créer l\'événement Google Calendar. Vérifie GOOGLE_SERVICE_ACCOUNT_JSON dans Railway.';
  return `✅ Événement créé dans Google Agenda!\n📅 ${clientName} — ${carName}\n📆 ${startDate} → ${endDate}\n🔗 Event ID: ${eventId}`;
}

async function syncCalendarTool(): Promise<string> {
  const count = await syncPendingBookings();
  if (count === 0) return '✅ Tout est déjà synchronisé — aucune réservation manquante dans l\'agenda.';
  return `✅ ${count} réservation(s) ajoutée(s) dans Google Agenda!`;
}

async function listCalendarEventsTool(input: Record<string, unknown>): Promise<string> {
  const maxResults = Number(input['max_results'] ?? 20);
  const events = await listUpcomingEvents(maxResults);
  if (!events.length) return 'Aucun événement à venir dans Google Agenda.';
  return `📅 ${events.length} événement(s) dans Google Agenda:\n${events.map(e =>
    `- ${e.summary} | ${e.start.dateTime?.slice(0, 10) ?? '?'} → ${e.end.dateTime?.slice(0, 10) ?? '?'}`
  ).join('\n')}`;
}

async function searchImages(input: Record<string, unknown>): Promise<string> {
  const query       = input['query'] as string;
  const count       = Math.min(Number(input['count'] ?? 4), 10);
  const orientation = (input['orientation'] as string) || '';

  if (!query) return '❌ Query requise';

  const PEXELS_KEY = env.PEXELS_API_KEY;

  if (!PEXELS_KEY) {
    return `❌ Recherche d'images non disponible — configure PEXELS_API_KEY dans Railway (gratuit: pexels.com/api).`;
  }

  // ── Avec clé Pexels ────────────────────────────────────────────────────
  try {
    const params: Record<string, string | number> = {
      query,
      per_page: count,
      locale: 'fr-FR',
    };
    if (orientation) params['orientation'] = orientation;

    const { data } = await axios.get('https://api.pexels.com/v1/search', {
      headers: { Authorization: PEXELS_KEY },
      params,
      timeout: 10_000,
    });

    const photos = data.photos as any[];
    if (!photos?.length) return `Aucune image trouvée pour "${query}"`;

    const lines = photos.map((p: any, i: number) => {
      const url     = p.src?.large ?? p.src?.original ?? p.url;
      const thumb   = p.src?.medium ?? url;
      const author  = p.photographer ?? 'Inconnu';
      return `🖼️ **Image ${i + 1}** — Photo par ${author}\n📎 URL: ${url}\n🔍 Aperçu: ${thumb}`;
    });

    return `🔍 **Résultats pour "${query}"** (${photos.length} images — Pexels)\n\n${lines.join('\n\n')}`;
  } catch (err: any) {
    const msg = err.response?.data?.error ?? err.message;
    return `❌ Erreur Pexels: ${msg}`;
  }
}

async function sendTelegramMessage(input: Record<string, unknown>): Promise<string> {
  if (!env.TELEGRAM_CHAT_ID) return '❌ TELEGRAM_CHAT_ID non configuré sur le serveur';
  const chatId = Number(env.TELEGRAM_CHAT_ID);
  const message   = (input['message'] as string) ?? '';
  const photoUrl  = input['photo_url']    as string | undefined;
  const docUrl    = input['document_url'] as string | undefined;
  const caption   = (input['caption']    as string | undefined) ?? message;

  try {
    if (photoUrl) {
      await sendTelegramPhoto(chatId, photoUrl, caption);
      if (message && message !== caption) await sendTelegramText(chatId, message);
      return `✅ Photo envoyée sur Telegram${message ? ` avec message: "${message}"` : ''}`;
    }
    if (docUrl) {
      await sendTelegramDoc(chatId, docUrl, caption);
      if (message && message !== caption) await sendTelegramText(chatId, message);
      return `✅ Document envoyé sur Telegram`;
    }
    if (message) {
      await sendTelegramText(chatId, message);
      return `✅ Message envoyé sur Telegram: "${message}"`;
    }
    return '❌ Rien à envoyer (message, photo_url ou document_url requis)';
  } catch (err) {
    return `❌ Erreur Telegram: ${err instanceof Error ? err.message : String(err)}`;
  }
}

async function generateVoucherTool(input: Record<string, unknown>, sessionId?: string): Promise<string> {
  const bookingId = input['booking_id'] as string;
  if (!bookingId) return '❌ booking_id requis';

  // DIAGNOSTIC v5 — verify function called + sessionId value
  const dbgChatId = sessionId?.startsWith('telegram_') ? Number(sessionId.replace('telegram_', '')) : 0;
  console.log(`[voucher-v5] called bookingId=${bookingId} sessionId=${sessionId} dbgChatId=${dbgChatId}`);
  if (dbgChatId) {
    await sendTelegramText(dbgChatId, `🔧 [v5] voucher appelé\nbookingId=${bookingId}\nsessionId=${sessionId}`).catch(e => {
      console.error('[voucher-v5] sendText failed:', e instanceof Error ? e.message : String(e));
    });
  }

  const { url, clientName, buffer } = await generateReservationVoucher(bookingId);
  const filename = `BON_${clientName.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
  const caption  = `📄 Bon de réservation — ${clientName}`;

  // Envoi direct via Telegram API — multipart FormData, vérification ok:true
  const sendPDF = async (chatId: number): Promise<void> => {
    const botBase = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN ?? ''}`;
    const form = new FormData();
    form.append('chat_id', String(chatId));
    form.append('document', buffer, {
      filename,
      contentType: 'application/pdf',
      knownLength: buffer.length,
    });
    if (caption) form.append('caption', caption);

    const resp = await axios.post<{ ok: boolean; description?: string; result?: unknown }>(
      `${botBase}/sendDocument`,
      form,
      { headers: form.getHeaders(), maxBodyLength: Infinity, maxContentLength: Infinity },
    );

    if (!resp.data.ok) {
      throw new Error(`Telegram: ${resp.data.description ?? JSON.stringify(resp.data)}`);
    }
    console.log('[voucher] PDF sent via multipart to chatId:', chatId, JSON.stringify(resp.data).slice(0, 200));
    // Log success response in Telegram too so we can debug silently-dropped sends
    await sendTelegramText(chatId, `✅ Telegram resp ok:true — message_id=${JSON.stringify((resp.data.result as any)?.message_id)}`).catch(() => {});
  };

  if (sessionId?.startsWith('telegram_')) {
    const chatId = Number(sessionId.replace('telegram_', ''));
    if (!isNaN(chatId)) {
      // Pre-flight: verify state before attempting PDF send
      const tokenPreview = (env.TELEGRAM_BOT_TOKEN ?? '').slice(0, 12);
      await sendTelegramText(chatId, `🔍 Pre-flight voucher:\nbuffer=${buffer.length}b\nchatId=${chatId}\ntoken=${tokenPreview}...\nfilename=${filename}`).catch(() => {});
      try {
        await sendPDF(chatId);
        return `✅ [CODE-v5-OK] Bon de réservation de ${clientName} généré et envoyé en PDF (chatId=${chatId}) ! 📄`;
      } catch (e: unknown) {
        const errMsg = e instanceof Error ? e.message : String(e);
        console.error('[voucher] sendPDF error:', errMsg);
        await sendTelegramText(chatId, `🔴 sendPDF error: ${errMsg}`).catch(() => {});
        return `⚠️ [CODE-v5-ERR] Bon généré, PDF non envoyé (chatId=${chatId}): ${errMsg}`;
      }
    }
  }

  // App vocale → envoyer au chat Telegram configuré
  if (env.TELEGRAM_CHAT_ID) {
    await sendPDF(Number(env.TELEGRAM_CHAT_ID)).catch(
      (e: unknown) => console.error('[voucher] voice send failed:', e instanceof Error ? e.message : String(e)),
    );
  }
  return `✅ Bon de réservation PDF généré pour ${clientName} ! 📄\n${url}`;
}

async function getLateReturns(): Promise<string> {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('bookings')
    .select('id, client_name, client_phone, end_date, final_price, cars(name)')
    .in('status', ['CONFIRMED', 'ACTIVE'])
    .lt('end_date', today)
    .order('end_date', { ascending: true });

  if (error) throw new Error(error.message);
  if (!data?.length) return '✅ Aucun véhicule en retard de retour.';

  const results = (data as any[]).map(b => {
    const daysLate = Math.floor(
      (new Date(today).getTime() - new Date(b.end_date as string).getTime()) / 86_400_000
    );
    return {
      booking_id:  b.id,
      client:      b.client_name,
      phone:       b.client_phone ?? 'N/A',
      car:         b.cars?.name ?? '?',
      due_date:    b.end_date,
      days_late:   daysLate,
      total_price: b.final_price,
    };
  });

  return JSON.stringify(results);
}
