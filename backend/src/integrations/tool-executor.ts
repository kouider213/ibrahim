import { supabase } from './supabase.js';
import { createCalendarEvent, syncPendingBookings, listUpcomingEvents } from './google-calendar.js';
import { getFinancialReport, formatFinancialReport } from './finance.js';
import { executeMediaTool } from './media-executor.js';
import { getFileContent, updateFile, listDirectory, triggerNetlifyDeploy, searchCode } from './github.js';
import { learnRule, chat } from './claude-api.js';
import { formatPricingTable, getPricingForVehicle } from '../config/pricing.js';
import { getOranWeather } from './web-search.js';
import { getRailwayLogs, waitForDeploy } from './railway.js';
import { env } from '../config/env.js';
import { runTikTokMarketResearch } from '../marketing/market-research.js';
import { mergeVideos } from '../marketing/video-creator.js';
import { savePendingVideo } from '../marketing/approval-store.js';
import { executeCreateMarketingVideo, isValidMp4Buffer, mergeVideoWithAudio } from '../marketing/create-marketing-video.js';
import { getVideoBuffer, clearVideoBuffer } from '../marketing/video-buffer.js';
import {
  sendMessage as sendTelegramForMarketing,
  sendPhoto as sendTelegramPhoto,
  sendVoiceBuffer,
  sendVideoBuffer,
} from './telegram.js';
import { synthesizeVoice } from '../notifications/dispatcher.js';
import type { Car } from './supabase.js';
import { checkCarAvailability as checkAvailability } from './supabase.js';
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
import { sendMessage as sendTelegramText, sendDocument as sendTelegramDoc } from './telegram.js';
import { generateReservationVoucher } from './generate-voucher.js';
import { schedulerQueue } from '../queue/scheduler.js';
import axios from 'axios';
import { runCodeAgent } from '../agents/code-agent.js';

// ── In-memory lock — prevents duplicate video generations per chat ─────────────
// Key = chatId (Telegram) or sessionId. Set before generation, deleted in finally.
const videoGenLocks = new Set<string>();

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
      case 'github_patch_file':     return await githubPatchFile(input);
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
      case 'get_fleet_status':                   return await getFleetStatus();
      case 'rate_client':                        return await rateClient(input);
      // ─── PHASE 14 — Image & Vidéo ───
      case 'analyze_image':
      case 'optimize_image':
      case 'create_social_variants':
      case 'enhance_image':
      case 'remove_background':
      case 'add_text_overlay':
      case 'analyze_video':
      case 'cut_video':
      case 'add_subtitles':
      case 'optimize_for_platform':
      case 'extract_thumbnail':
      case 'add_background_music':
      case 'create_video_preview':       return await executeMediaTool(name, input);
      // ─── MARKETING TIKTOK ───
      case 'run_tiktok_research':        return await runTikTokResearchTool(sessionId);
      case 'generate_tiktok_video':      return await createMarketingVideoTool(input, sessionId);
      case 'create_marketing_video':     return await createMarketingVideoTool(input, sessionId);
      case 'merge_videos':               return await mergeVideosTool(input, sessionId);
      // ─── VEILLE CONCURRENTIELLE ───
      case 'analyze_competitors':        return await analyzeCompetitors(input, sessionId ?? '');
      case 'watch_my_tiktok':            return await watchMyTiktok(input);
      // ─── CODE AGENT AUTONOME ───
      case 'execute_code_task':          return await executeCodeTaskTool(input, sessionId);
      case 'create_new_project':         return await createNewProjectTool(input, sessionId);
      // ─── GÉNÉRATION IA (Replicate + fal.ai) ───
      case 'generate_image':             return await generateImageTool(input, sessionId);
      case 'generate_ai_video':          return await generateAiVideoTool(input, sessionId);
      case 'animate_car_photo':          return await animateCarPhotoTool(input, sessionId);
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
  if (input['payment_status']) fields['payment_status'] = input['payment_status'];
  if (input['paid_amount'] !== undefined) fields['paid_amount'] = Number(input['paid_amount']);
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

  // Anti-doublon: vérifie disponibilité avant insertion
  const isAvailable = await checkAvailability(
    input['car_id'] as string,
    input['start_date'] as string,
    input['end_date'] as string,
  );
  if (!isAvailable) {
    return `❌ Voiture déjà réservée du ${input['start_date']} au ${input['end_date']}. Vérifie avec check_car_availability.`;
  }

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

async function getWeather(input: Record<string, unknown>): Promise<string> {
  const city    = (input['city'] as string | undefined)?.trim();
  const country = (input['country'] as string | undefined)?.trim();

  // Sans ville spécifiée → météo Oran (défaut)
  if (!city || city.toLowerCase().includes('oran')) {
    const data = await getOranWeather();
    return JSON.stringify(data);
  }

  // Avec ville → geocoding Open-Meteo puis météo
  try {
    const geoQuery  = country ? `${city}, ${country}` : city;
    const geoResp   = await axios.get(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(geoQuery)}&count=1&language=fr&format=json`,
      { timeout: 8_000 },
    );
    const results = (geoResp.data as any).results as Array<{ latitude: number; longitude: number; name: string; country: string; timezone: string }> | undefined;
    if (!results?.length) return `❌ Ville introuvable: ${geoQuery}`;

    const loc      = results[0];
    const timezone = encodeURIComponent(loc.timezone ?? 'auto');
    const wxResp   = await axios.get(
      `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weathercode,is_day&timezone=${timezone}`,
      { timeout: 8_000 },
    );
    const c    = (wxResp.data as any).current;
    const WMO: Record<number, { label: string; icon: string }> = {
      0: { label: 'Ciel dégagé', icon: '☀️' }, 1: { label: 'Principalement dégagé', icon: '🌤️' },
      2: { label: 'Partiellement nuageux', icon: '⛅' }, 3: { label: 'Couvert', icon: '☁️' },
      45: { label: 'Brouillard', icon: '🌫️' }, 48: { label: 'Brouillard givrant', icon: '🌫️' },
      51: { label: 'Bruine légère', icon: '🌦️' }, 61: { label: 'Pluie légère', icon: '🌧️' },
      63: { label: 'Pluie modérée', icon: '🌧️' }, 65: { label: 'Pluie forte', icon: '⛈️' },
      80: { label: 'Averses légères', icon: '🌦️' }, 81: { label: 'Averses modérées', icon: '🌧️' },
      82: { label: 'Averses violentes', icon: '⛈️' }, 95: { label: 'Orage', icon: '⛈️' },
      99: { label: 'Orage avec grêle', icon: '🌩️' },
    };
    const wmo = WMO[c.weathercode as number] ?? { label: 'Inconnu', icon: '❓' };
    return JSON.stringify({
      city:          loc.name,
      country:       loc.country,
      temperature:   Math.round(c.temperature_2m as number),
      apparent_temp: Math.round(c.apparent_temperature as number),
      humidity:      c.relative_humidity_2m as number,
      wind_speed:    Math.round(c.wind_speed_10m as number),
      condition:     wmo.label,
      icon:          wmo.icon,
      is_day:        c.is_day === 1,
    });
  } catch (err) {
    return `❌ Erreur météo pour ${city}: ${err instanceof Error ? err.message : String(err)}`;
  }
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

async function githubPatchFile(input: Record<string, unknown>): Promise<string> {
  const repo      = (input['repo']       as string) || 'ibrahim';
  const path      = input['path']       as string;
  const oldString = input['old_string'] as string;
  const newString = input['new_string'] as string;
  const message   = (input['message']   as string) || 'patch: surgical edit';

  if (!path || oldString === undefined || newString === undefined)
    return '❌ repo, path, old_string et new_string sont requis';

  const result = await getFileContent(path, repo);
  if (!result) return `❌ Fichier non trouvé: ${path} dans ${repo}`;

  const content = result.content;
  const occurrences = content.split(oldString).length - 1;

  if (occurrences === 0)
    return `❌ Extrait non trouvé dans ${path}.\nVérifie que le texte est copié mot pour mot (espaces, indentation, retours à la ligne inclus).\nAstuce: utilise github_read_file pour récupérer l'extrait exact.`;
  if (occurrences > 1)
    return `❌ Extrait trouvé ${occurrences} fois dans ${path} — ambigu.\nAjoute plus de contexte autour (lignes voisines) pour le rendre unique.`;

  const newContent = content.replace(oldString, newString);
  const writeResult = await updateFile(path, newContent, message, repo);
  if (!writeResult) return `❌ Impossible de commiter ${path}`;

  const preview = oldString.split('\n')[0].trim().slice(0, 60);
  return `✅ Patch appliqué dans ${path} (commit: ${writeResult.commitSha})\n→ "${preview}..." remplacé avec succès`;
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
    .lt('start_date', endDate)
    .gt('end_date', startDate);

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

  const { url, clientName, buffer } = await generateReservationVoucher(bookingId);
  const filename = `BON_${clientName.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
  const caption  = `📄 Bon de réservation — ${clientName}`;

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

    const resp = await axios.post<{ ok: boolean; description?: string }>(
      `${botBase}/sendDocument`,
      form,
      { headers: form.getHeaders(), maxBodyLength: Infinity, maxContentLength: Infinity },
    );

    if (!resp.data.ok) {
      throw new Error(`Telegram: ${resp.data.description ?? JSON.stringify(resp.data)}`);
    }
    console.log('[voucher] PDF sent to chatId:', chatId);
  };

  if (sessionId?.startsWith('telegram_')) {
    const chatId = Number(sessionId.replace('telegram_', ''));
    if (!isNaN(chatId)) {
      try {
        await sendPDF(chatId);
        return `✅ Bon de réservation de ${clientName} généré et envoyé en PDF ! 📄`;
      } catch (e: unknown) {
        const errMsg = e instanceof Error ? e.message : String(e);
        console.error('[voucher] sendPDF error:', errMsg);
        return `⚠️ Bon généré, PDF non envoyé: ${errMsg}\n${url}`;
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

async function getFleetStatus(): Promise<string> {
  const today = new Date().toISOString().slice(0, 10);

  const { data: cars, error: carErr } = await supabase
    .from('cars')
    .select('id, name, category, base_price, available')
    .order('name');

  if (carErr || !cars?.length) return '❌ Impossible de récupérer la flotte.';

  const { data: activeBookings } = await supabase
    .from('bookings')
    .select('car_id, client_name, client_phone, start_date, end_date, payment_status, paid_amount, final_price')
    .in('status', ['CONFIRMED', 'ACTIVE'])
    .lt('start_date', today)
    .gte('end_date', today);

  const { data: upcomingBookings } = await supabase
    .from('bookings')
    .select('car_id, client_name, start_date, end_date')
    .in('status', ['CONFIRMED', 'PENDING'])
    .gt('start_date', today)
    .lte('start_date', new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10));

  const activeMap = new Map<string, typeof activeBookings extends (infer T)[] | null ? T : never>();
  for (const b of (activeBookings ?? []) as any[]) activeMap.set(b.car_id, b);

  const upcomingMap = new Map<string, typeof upcomingBookings extends (infer T)[] | null ? T : never>();
  for (const b of (upcomingBookings ?? []) as any[]) {
    if (!upcomingMap.has(b.car_id)) upcomingMap.set(b.car_id, b);
  }

  const lines: string[] = [`🚗 *ÉTAT FLOTTE — ${today}*`, '─'.repeat(35)];
  let rented = 0, available = 0, unavailable = 0;

  for (const car of cars as any[]) {
    const active   = activeMap.get(car.id);
    const upcoming = upcomingMap.get(car.id);

    if (active) {
      rented++;
      const remaining = (active.final_price ?? 0) - (active.paid_amount ?? 0);
      const payTag = active.payment_status === 'PAID' ? '✅' : remaining > 0 ? `💰${remaining}€ dû` : '';
      lines.push(`🔴 *${car.name}* — loué à ${active.client_name} jusqu'au ${active.end_date} ${payTag}`);
    } else if (!car.available) {
      unavailable++;
      lines.push(`🔧 *${car.name}* — indisponible (maintenance/hors service)`);
    } else {
      available++;
      const nextLine = upcoming ? ` → prochain: ${(upcoming as any).client_name} le ${(upcoming as any).start_date}` : '';
      lines.push(`🟢 *${car.name}* — disponible${nextLine}`);
    }
  }

  lines.push('─'.repeat(35));
  lines.push(`✅ ${available} dispo | 🔴 ${rented} loué(s) | 🔧 ${unavailable} hors service`);
  return lines.join('\n');
}

async function rateClient(input: Record<string, unknown>): Promise<string> {
  const bookingId = input['booking_id'] as string;
  const rating    = Number(input['rating']);
  const comment   = (input['comment'] as string) ?? '';

  if (!bookingId) return '❌ booking_id requis';
  if (rating < 1 || rating > 5) return '❌ Note entre 1 et 5';

  const { data: booking, error } = await supabase
    .from('bookings')
    .select('client_name, client_phone')
    .eq('id', bookingId)
    .single();

  if (error || !booking) return `❌ Réservation introuvable: ${bookingId}`;

  const stars = '⭐'.repeat(rating) + '☆'.repeat(5 - rating);
  const notes = comment ? `${stars} — ${comment}` : stars;

  const { error: updErr } = await supabase
    .from('bookings')
    .update({ notes: `[NOTE CLIENT] ${notes}` })
    .eq('id', bookingId);

  if (updErr) return `❌ Erreur: ${updErr.message}`;

  return `✅ Client ${(booking as any).client_name} noté ${stars}${comment ? ` — "${comment}"` : ''}`;
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

  const lines = results.map(r => {
    const urgency = r.days_late >= 3 ? '🔴' : r.days_late >= 1 ? '🟡' : '⚪';
    return `${urgency} ${r.car} — ${r.client} (${r.phone}) — dû le ${r.due_date} — ${r.days_late}j de retard`;
  });

  return `⏰ RETARDS DE RETOUR (${results.length} véhicule${results.length > 1 ? 's' : ''})\n${'─'.repeat(40)}\n${lines.join('\n')}`;
}

// ── Marketing TikTok tools ────────────────────────────────────

function chatIdFromSession(sessionId?: string): string {
  if (sessionId?.startsWith('telegram_')) return sessionId.slice('telegram_'.length);
  return env.TELEGRAM_CHAT_ID ?? '809747124';
}

async function runTikTokResearchTool(sessionId?: string): Promise<string> {
  const chatId = chatIdFromSession(sessionId);

  const { data: carsRaw } = await supabase.from('cars').select('*').eq('available', true);
  const cars = (carsRaw ?? []) as Car[];

  if (cars.length === 0) {
    return '⚠️ Aucune voiture disponible pour la recherche marketing.';
  }

  await sendTelegramForMarketing(chatId, '🔍 *Dzaryx Marketing*\nRecherche TikTok lancée... ⏳');

  const report = await runTikTokMarketResearch(cars);

  const msg = [
    `📊 *RAPPORT MARKETING — ${report.week}*`,
    ``,
    `📈 *Tendances:*`,
    report.trends.map(t => `• ${t}`).join('\n'),
    ``,
    report.top_ideas.map((idea, i) => [
      `*[${i + 1}] ${idea.title}*`,
      `🎬 ${idea.concept}`,
      `🎤 _${idea.voiceover_script}_`,
      `📱 ${idea.caption}`,
      `⏰ ${idea.best_time}`,
    ].join('\n')).join('\n\n'),
    ``,
    `💡 ${report.summary}`,
    ``,
    `💬 Dis "fais une vidéo pour [voiture]" pour créer une vidéo automatiquement !`,
  ].join('\n');

  await sendTelegramForMarketing(chatId, msg);
  return `✅ Rapport TikTok envoyé sur Telegram (${report.top_ideas.length} idées générées).`;
}

async function createMarketingVideoTool(
  input: Record<string, unknown>,
  sessionId?: string,
): Promise<string> {
  const chatId       = chatIdFromSession(sessionId);
  const falKey       = env.FAL_KEY;

  // ── Paramètres ────────────────────────────────────────────────
  const carNameFilter    = (input['car_name'] as string | undefined)?.toLowerCase();
  const style            = (input['style'] as string | undefined) ?? 'reveal';
  const customScript     = input['custom_script'] as string | undefined;
  const backgroundEffect = input['background_effect'] as string | undefined;

  // ── Chercher la voiture ───────────────────────────────────────
  const { data: carsRaw } = await supabase.from('cars').select('*').eq('available', true);
  const cars = (carsRaw ?? []) as Car[];
  if (cars.length === 0) return '⚠️ Aucune voiture disponible.';

  const carsWithImage = cars.filter(c => c.image_url);
  if (carsWithImage.length === 0) return '⚠️ Aucune voiture avec photo — ajoute des photos dans le tableau de bord.';

  const car = carNameFilter
    ? (carsWithImage.find(c => c.name.toLowerCase().includes(carNameFilter)) ?? carsWithImage[Math.floor(Math.random() * carsWithImage.length)])
    : carsWithImage[Math.floor(Math.random() * carsWithImage.length)];

  // ── Prix depuis la grille tarifaire ──────────────────────────
  const pricing      = getPricingForVehicle(car.name);
  const priceKouider = pricing?.kouiderPrice ?? null;
  const priceHouari  = pricing?.houariPrice  ?? null;
  const priceDisplay = priceKouider ? `${priceKouider}€/j` : (priceHouari ? `${priceHouari}€/j` : 'prix sur demande');

  // ── Script IA ou personnalisé ─────────────────────────────────
  let script: string;
  if (customScript) {
    script = customScript;
  } else {
    const month  = new Date().getMonth() + 1;
    const season = month >= 6 && month <= 8 ? 'Saison MRE (forte demande diaspora)'
      : month === 3 || month === 4            ? 'Ramadan (sorties nocturnes, famille)'
      : 'Période standard (clients locaux + pros)';
    const styleDesc: Record<string, string> = {
      reveal:     'dévoilement dramatique, suspense puis révélation prix',
      prix:       'choc du prix en premier, insister sur le rapport qualité/prix',
      lifestyle:  'émotion, voyage, liberté, week-end parfait',
      temoignage: 'témoignage client enthousiaste, très authentique',
    };
    const sr = await chat([{
      role: 'user',
      content: `Script voix-off TikTok, 20-25 sec, FRANÇAIS uniquement, style ${style} (${styleDesc[style] ?? style}).
VOITURE: ${car.name} (${car.category}) | PRIX: ${priceDisplay} | ${season}
Accrocheur, prix + "Fik Conciergerie Oran" mentionnés, CTA fort. RÉPONDS UNIQUEMENT avec le script, sans guillemets.`,
    }], undefined);
    script = sr.text.trim().replace(/^["']|["']$/g, '');
  }

  const caption  = `🚗 ${car.name} à Oran — ${priceDisplay} | Fik Conciergerie`;
  const hashtags = ['#locationvoiture', '#oran', '#algerie', '#fikconcierge', '#mre', '#tiktokalgerie'];

  // ── Tentative 1 : Runway Gen-4 Turbo (si RUNWAY_API_KEY) → Kling IA fallback ──
  const runwayKey    = env.RUNWAY_API_KEY;
  let videoBuffer: Buffer | null = null;
  let method = 'photo';

  if (runwayKey || falKey) {
    const bgMotion: Record<string, string> = {
      plage:    'car on Algerian beach, ocean waves, golden sunset, cinematic pan shot',
      ville:    'car in Oran city streets, urban lights, dynamic tracking shot',
      montagne: 'car on mountain road Algeria, dramatic landscape, sweeping camera move',
      desert:   'car in Sahara desert, sand dunes, epic wide establishing shot',
      route:    'car driving on coastal road Oran, smooth tracking shot',
      luxe:     'luxury car, premium setting, elegant slow motion reveal',
      foret:    'car on forest road, dappled golden light, cinematic dolly shot',
      coucher:  'car at golden hour sunset, warm tones, silhouette reveal',
      nuit:     'car at night, city lights bokeh, dramatic neon reflections',
    };
    const motionPrompt = backgroundEffect
      ? (bgMotion[backgroundEffect] ?? `${backgroundEffect} scenery, cinematic car reveal, smooth camera`)
      : `${car.name} cinematic reveal, smooth camera pan, golden hour, professional automotive photography`;

    const providerLabel = runwayKey ? 'Runway Gen-4 Turbo' : 'Kling IA';
    await sendTelegramForMarketing(chatId,
      `🎬 *Vidéo TikTok — ${car.name}*\n_${providerLabel}${backgroundEffect ? ` · fond ${backgroundEffect}` : ''}_\n⏳ 60-240 secondes...`
    ).catch(() => {});

    try {
      // Vérifier que l'image est publiquement accessible
      await axios.head(car.image_url, { timeout: 8_000 });

      const result = await generateVehicleVideo({
        imageUrl:      car.image_url,
        userPrompt:    motionPrompt,
        carName:       car.name,
        duration:      5,
        falKey,
        runwayKey,
        forceProvider: 'auto',
      });

      const resp = await axios.get(result.url, { responseType: 'arraybuffer', timeout: 60_000 });
      const rawBuf = Buffer.from(resp.data as ArrayBuffer);
      if (!isValidMp4Buffer(rawBuf)) {
        throw new Error(`${result.provider} a retourné un fichier invalide (${rawBuf.length} bytes — pas un MP4).`);
      }
      videoBuffer = rawBuf;
      method      = result.provider;
      console.log(`[tool:create_marketing_video] ✅ MP4 validé (${result.provider} ${result.mode}):`, videoBuffer.length, 'bytes');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[tool:create_marketing_video] IA vidéo failed:', msg);
      await sendTelegramForMarketing(chatId,
        `⚠️ _IA vidéo indisponible (\`${msg.slice(0, 120)}\`) — FFmpeg fallback..._`
      ).catch(() => {});
    }
  }

  // ── Tentative 2 : FFmpeg + ElevenLabs (local, fiable) ────────
  if (!videoBuffer) {
    await sendTelegramForMarketing(chatId,
      `🎬 *Vidéo TikTok — ${car.name}*\n_Montage FFmpeg HD 1080×1920${backgroundEffect ? ` · fond ${backgroundEffect}` : ''}_\n⏳ Génération voix + montage...`
    ).catch(() => {});

    try {
      // Utilise executeCreateMarketingVideo — le module complet avec upload Supabase
      const result = await executeCreateMarketingVideo(
        {
          car_name:          car.name,
          style:             style as 'reveal' | 'prix' | 'lifestyle' | 'temoignage',
          custom_script:     customScript,
          background_effect: backgroundEffect,
        },
        chatId,
      );
      const deliveryNote = result.telegram_delivered ? 'envoyée sur Telegram ↑' : '⚠️ générée mais envoi Telegram échoué';
      const prefix = result.telegram_delivered ? '✅' : '⚠️';
      return `${prefix} Vidéo ${result.method === 'ffmpeg' ? 'FFmpeg HD' : 'photo'} pour ${result.car_name} — ${deliveryNote} (ID: ${result.pending_id}).\nScript: "${result.script.slice(0, 80)}..."`;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[tool:create_marketing_video] FFmpeg failed:', msg);
      await sendTelegramForMarketing(chatId,
        `❌ _FFmpeg aussi échoué:_ \`${msg.slice(0, 200)}\`\n_Envoi photo + voix..._`
      ).catch(() => {});
    }
  }

  // ── Voix ElevenLabs ──────────────────────────────────────────
  const audioBuffer = await synthesizeVoice(script).catch(() => null);

  // ── Fusion voix + vidéo IA (Runway/Kling) ────────────────────
  // Si on a une vidéo IA ET une voix → on fusionne avec FFmpeg pour
  // obtenir un seul MP4 avec audio intégré (prêt à poster sur TikTok)
  if (videoBuffer && audioBuffer) {
    try {
      const merged = await mergeVideoWithAudio(videoBuffer, audioBuffer);
      if (isValidMp4Buffer(merged)) {
        videoBuffer = merged;
        console.log(`[tool:create_marketing_video] ✅ Voix fusionnée dans la vidéo (${merged.length} bytes)`);
      }
    } catch (mergeErr) {
      console.error('[tool:create_marketing_video] merge audio failed:', mergeErr instanceof Error ? mergeErr.message : mergeErr);
    }
  }

  // ── Workflow approbation ──────────────────────────────────────
  const pendingId = await savePendingVideo({
    video_url: car.image_url,
    caption,
    hashtags,
    car_name:  car.name,
    car_id:    car.id,
    script,
  });

  const approvalMsg = [
    `🎬 *Vidéo TikTok — ${car.name}* (${method})`,
    ``,
    `📋 ${caption}`,
    `🏷️ ${hashtags.join(' ')}`,
    ``,
    `📝 Script:\n_${script.slice(0, 200)}_`,
    ``,
    `✅ Réponds *Oke* pour publier | ❌ *Non* pour annuler`,
  ].join('\n');

  // ── Envoi Telegram ────────────────────────────────────────────
  let videoActuallySent = false;
  if (videoBuffer) {
    try {
      await sendVideoBuffer(chatId, videoBuffer, approvalMsg);
      videoActuallySent = true;
    } catch (sendErr) {
      console.error('[tool:create_marketing_video] sendVideoBuffer failed:', sendErr instanceof Error ? sendErr.message : sendErr);
      await sendTelegramPhoto(chatId, car.image_url, approvalMsg).catch(() => {});
    }
  } else {
    await sendTelegramPhoto(chatId, car.image_url, approvalMsg).catch(() => {});
  }

  // Envoyer la voix séparément seulement si la vidéo n'a pas pu être générée
  if (!videoBuffer && audioBuffer) {
    await sendVoiceBuffer(chatId, audioBuffer).catch(() => {});
  }

  let resultMsg: string;
  if (videoActuallySent) {
    resultMsg = `✅ Vidéo ${method} créée et envoyée ↑ (ID: ${pendingId}). En attente de ta validation.`;
  } else if (videoBuffer) {
    resultMsg = `⚠️ Vidéo générée mais envoi Telegram échoué — photo envoyée à la place ↑ (ID: ${pendingId}). En attente de ta validation.`;
  } else {
    resultMsg = `Je n'ai pas pu créer la vidéo. La génération a échoué (Kling IA et FFmpeg ont tous les deux échoué). Une photo + voix ont été envoyées à la place ↑ (ID: ${pendingId}).`;
  }
  return resultMsg.substring(0, 3000);
}

async function mergeVideosTool(
  _input: Record<string, unknown>,
  sessionId?: string,
): Promise<string> {
  const chatId  = chatIdFromSession(sessionId);
  const fileIds = getVideoBuffer(sessionId ?? '');

  if (fileIds.length < 2) {
    return `⚠️ Envoie au moins 2 vidéos sur Telegram avant de demander la fusion. Tu n'as envoyé que ${fileIds.length} vidéo(s) dans cette session.`;
  }

  await sendTelegramForMarketing(chatId, `🎬 *Fusion de ${fileIds.length} vidéos en cours...*\n_Normalisation + montage_ ⏳`);

  // Download all videos from Telegram
  const { downloadFile: downloadTelegramFile } = await import('./telegram.js');
  const buffers: Buffer[] = [];
  for (const fileId of fileIds) {
    const buf = await downloadTelegramFile(fileId);
    if (!buf) {
      await sendTelegramForMarketing(chatId, `⚠️ Impossible de télécharger la vidéo (ID: ${fileId}) — elle a peut-être expiré.`);
      return `⚠️ Échec téléchargement d'une vidéo.`;
    }
    buffers.push(buf);
  }

  const merged = await mergeVideos(buffers).catch(async (err) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[tool:merge_videos] failed:', msg);
    await sendTelegramForMarketing(chatId, `⚠️ Fusion échouée: ${msg.slice(0, 120)}`);
    return null;
  });

  if (!merged) return '⚠️ Fusion des vidéos échouée.';

  clearVideoBuffer(sessionId ?? '');

  const caption = `🎬 *Vidéo fusionnée — ${fileIds.length} clips*\n\nFusionnée par Dzaryx ✨`;
  await sendVideoBuffer(chatId, merged, caption).catch(async (err) => {
    console.error('[tool] merge sendVideoBuffer failed:', err instanceof Error ? err.message : err);
    await sendTelegramForMarketing(chatId, `⚠️ Upload vidéo fusionnée échoué: ${err instanceof Error ? err.message : String(err)}`);
  });

  return `✅ ${fileIds.length} vidéos fusionnées et envoyées juste au-dessus ↑`;
}

// ════════════════════════════════════════════════════════════════
// ── VEILLE CONCURRENTIELLE ────────────────────────────────────
// ════════════════════════════════════════════════════════════════

async function jSearch(query: string, maxChars = 1500): Promise<string> {
  try {
    const { data } = await axios.get(`https://s.jina.ai/${encodeURIComponent(query)}`, {
      headers: { 'Accept': 'text/plain', 'X-Retain-Images': 'none' },
      timeout: 15_000,
    });
    return (typeof data === 'string' ? data : JSON.stringify(data)).slice(0, maxChars);
  } catch {
    return 'Aucun résultat.';
  }
}

async function jFetch(url: string, maxChars = 2500): Promise<string> {
  try {
    const { data } = await axios.get(`https://r.jina.ai/${encodeURIComponent(url)}`, {
      headers: { 'Accept': 'text/plain', 'X-Retain-Images': 'none' },
      timeout: 20_000,
    });
    return (typeof data === 'string' ? data : JSON.stringify(data)).slice(0, maxChars);
  } catch {
    return 'Page inaccessible.';
  }
}

async function apifyRun(actorId: string, inputPayload: Record<string, unknown>): Promise<any[]> {
  const apiKey = env.APIFY_API_KEY;
  if (!apiKey) return [];

  const runResp = await axios.post(
    `https://api.apify.com/v2/acts/${actorId}/runs?token=${apiKey}`,
    inputPayload,
    { timeout: 30_000 },
  );

  const runId: string = runResp.data?.data?.id ?? '';
  if (!runId) return [];

  // Attendre la fin du run (max 120s)
  let datasetId = '';
  for (let i = 0; i < 24; i++) {
    await new Promise(r => setTimeout(r, 5000));
    const statusResp = await axios.get(
      `https://api.apify.com/v2/actor-runs/${runId}?token=${apiKey}`,
      { timeout: 10_000 },
    );
    const status: string = statusResp.data?.data?.status ?? '';
    if (status === 'SUCCEEDED') { datasetId = statusResp.data?.data?.defaultDatasetId ?? ''; break; }
    if (status === 'FAILED' || status === 'ABORTED') return [];
  }

  if (!datasetId) return [];

  const itemsResp = await axios.get(
    `https://api.apify.com/v2/datasets/${datasetId}/items?token=${apiKey}&limit=40`,
    { timeout: 15_000 },
  );
  return itemsResp.data ?? [];
}

function formatTikTokItems(items: any[]): string {
  if (!items.length) return 'Aucun résultat TikTok trouvé.';

  const byAuthor: Record<string, any[]> = {};
  for (const item of items) {
    const handle = item.authorMeta?.name ?? item.author?.uniqueId ?? 'inconnu';
    if (!byAuthor[handle]) byAuthor[handle] = [];
    byAuthor[handle].push(item);
  }

  let output = '';
  for (const [handle, videos] of Object.entries(byAuthor)) {
    const first = videos[0];
    const m = first?.authorMeta ?? first?.author ?? {};
    output += `\n📊 @${handle} — Abonnés: ${m.fans ?? m.followerCount ?? '?'} | Likes total: ${m.heart ?? m.heartCount ?? '?'}\n`;
    for (const v of videos.slice(0, 6)) {
      const date = v.createTimeISO ?? (v.createTime ? new Date(v.createTime * 1000).toLocaleDateString('fr-FR') : '?');
      const desc = (v.text ?? v.desc ?? '(sans description)').slice(0, 100);
      const tags = (v.hashtags ?? []).map((h: any) => `#${h.name ?? h}`).join(' ');
      output += `  • "${desc}" ${tags}\n`;
      output += `    👁 ${v.playCount ?? v.stats?.playCount ?? '?'} vues | ❤️ ${v.diggCount ?? v.stats?.diggCount ?? '?'} | ${date}\n`;
    }
    output += '\n';
  }
  return output;
}

async function analyzeCompetitors(input: Record<string, unknown>, sessionId: string): Promise<string> {
  const competitor = input['competitor'] as string | undefined;
  const makeVideo  = input['generate_counter_video'] as boolean | undefined;
  const chatId     = chatIdFromSession(sessionId);

  // ── Notification de démarrage ──────────────────────────────
  await sendTelegramForMarketing(chatId,
    `🕵️ *Veille concurrentielle lancée*\n${competitor ? `_Cible: ${competitor}_` : '_Scan général: location voiture Oran_'}\n⏳ Recherche web en cours...`
  ).catch(() => {});

  // ── Sources à scraper ──────────────────────────────────────
  const COMPETITOR_HANDLES = competitor
    ? [competitor.replace('@', '').trim()]
    : ['didanolocation', 'locationoranalgerie', 'orancar', 'autolocationoran'];

  const TIKTOK_HASHTAGS = ['locationoran', 'locationvoitureoran', 'voitureoran', 'locationvoiture', 'oranalgerie'];

  let tiktokData = '';

  // ── APIFY (si clé disponible) ──────────────────────────────
  if (env.APIFY_API_KEY) {
    if (competitor && competitor.startsWith('@')) {
      const items = await apifyRun('clockworks~tiktok-scraper', {
        profiles:             [competitor.replace('@', '').trim()],
        resultsPerPage:       15,
        shouldDownloadVideos: false,
        shouldDownloadCovers: false,
      });
      tiktokData = formatTikTokItems(items);
    } else if (competitor) {
      const items = await apifyRun('clockworks~tiktok-scraper', {
        searchQueries:        [competitor, `location voiture oran ${competitor}`],
        resultsPerPage:       20,
        shouldDownloadVideos: false,
        shouldDownloadCovers: false,
      });
      tiktokData = formatTikTokItems(items);
    } else {
      const items = await apifyRun('clockworks~tiktok-scraper', {
        hashtags:             TIKTOK_HASHTAGS,
        resultsPerPage:       15,
        shouldDownloadVideos: false,
        shouldDownloadCovers: false,
      });
      tiktokData = formatTikTokItems(items);
    }
  }

  // ── Fallback multi-sources web (sans APIFY ou complément) ──
  if (!tiktokData || tiktokData === 'Aucun résultat TikTok trouvé.') {
    const searches: Array<Promise<string>> = [];

    // 1. Recherches TikTok via Jina (moteur de recherche)
    const tiktokQueries = competitor
      ? [`tiktok ${competitor} location voiture oran`, `site:tiktok.com ${competitor}`]
      : [
          'tiktok location voiture oran algerie hashtag',
          'site:tiktok.com locationoran locationvoitureoran',
          'tiktok didanolocation location oran algerie',
        ];

    for (const q of tiktokQueries) {
      searches.push(jSearch(q, 2000));
    }

    // 2. Pages TikTok directes des concurrents connus
    const profileFetches = COMPETITOR_HANDLES.slice(0, 3).map(h =>
      jFetch(`https://www.tiktok.com/@${h}`, 1500)
        .then(txt => `\n--- PROFIL @${h} ---\n${txt}`)
        .catch(() => `\n--- @${h}: inaccessible ---\n`)
    );
    searches.push(...profileFetches);

    // 3. Recherches Google sur les concurrents à Oran
    searches.push(jSearch('location voiture oran prix tarifs 2024 2025 concurrents', 1500));
    searches.push(jSearch('agence location voiture oran algerie avis google maps', 1500));

    // 4. Facebook/Instagram (souvent plus accessibles)
    searches.push(jSearch('facebook location voiture oran algerie promo prix', 1500));

    const results = await Promise.all(searches);
    tiktokData = results
      .filter(r => r && r.length > 50 && !r.includes('Aucun résultat'))
      .join('\n\n---\n\n')
      .slice(0, 8000);

    if (!tiktokData || tiktokData.length < 100) {
      tiktokData = '⚠️ Données web limitées — TikTok bloque le scraping. Analyse basée sur les bonnes pratiques du marché.';
    }
  }

  const pricing = formatPricingTable();

  // ── Analyse Claude avec les données collectées ─────────────
  const analysis = await chat([{
    role: 'user',
    content: `Tu es Dzaryx, assistant IA de Fik Conciergerie Oran.
Analyse ces données RÉELLES collectées sur internet concernant la concurrence location voitures à Oran.
Les données proviennent de TikTok, Google, Facebook, pages web des concurrents.

DONNÉES COLLECTÉES:
${tiktokData}

GRILLE TARIFAIRE FIK CONCIERGERIE (nos vrais prix):
${pricing}

Réponds en français, format structuré Telegram (markdown bold avec **):

**🕵️ CONCURRENTS DÉTECTÉS & ACTIVITÉ**
(liste les comptes/agences trouvés, leur activité, fréquence de publication, types de contenu — si données limitées, dis-le clairement)

**💰 COMPARAISON TARIFAIRE**
(prix concurrents vs nos prix — si trouvés dans les données)

**📊 OPPORTUNITÉS MARCHÉ**
(ce que personne ne fait encore, lacunes, tendances à exploiter à Oran)

**⚡ ACTION IMMÉDIATE RECOMMANDÉE**
(une seule action très précise et concrète à faire aujourd'hui)

**📱 SCRIPT VIDÉO SUGGÉRÉ**
(15-20 sec en français, exploite une lacune détectée)`,
  }], undefined);

  // ── Envoi de l'analyse sur Telegram ────────────────────────
  if (makeVideo) {
    await sendTelegramForMarketing(chatId, `${analysis.text}\n\n⏳ _Création de la contre-pub en cours..._`);
    const { data: cars } = await supabase.from('cars').select('*').eq('available', true).limit(1);
    const car = (cars ?? [])[Math.floor(Math.random() * (cars ?? []).length)] as Car | undefined;
    if (car) {
      await createMarketingVideoTool({ car_name: car.name, style: 'prix' }, sessionId);
    }
    return '✅ Analyse concurrents envoyée + vidéo contre-pub créée.';
  }

  // Envoyer l'analyse sur Telegram et la retourner aussi dans la réponse (tronquée pour Claude)
  await sendTelegramForMarketing(chatId, analysis.text).catch(() => {});
  return analysis.text.substring(0, 3000);
}

async function watchMyTiktok(input: Record<string, unknown>): Promise<string> {
  const handle = ((input['handle'] as string | undefined) ?? 'fikconciergerieoran').replace('@', '');

  const [profileData, searchData] = await Promise.all([
    jFetch(`https://www.tiktok.com/@${handle}`, 3000),
    jSearch(`@${handle} tiktok location voiture oran fik conciergerie`, 2000),
  ]);

  const analysis = await chat([{
    role: 'user',
    content: `Tu es Dzaryx, assistant IA de Fik Conciergerie Oran. Analyse notre compte TikTok @${handle}.

DONNÉES PROFIL TIKTOK:
${profileData}

RÉSULTATS RECHERCHE:
${searchData}

Analyse en français, format Telegram (markdown):

**📊 ÉTAT DU COMPTE @${handle}**
(abonnés, vues, engagement approximatif si visible)

**🎬 VIDÉOS RÉCENTES**
(titres, sujets, performance si disponible)

**✅ CE QUI FONCTIONNE**
(types de contenu qui marchent bien)

**❌ CE QUI MANQUE**
(opportunités non exploitées, types de vidéos à essayer)

**🚀 3 RECOMMANDATIONS CONCRÈTES**
(actions spécifiques à faire cette semaine)

Si les données sont limitées (TikTok bloque souvent les scrapers), dis-le et propose quand même des pistes basées sur les bonnes pratiques du secteur location voiture Oran.`,
  }], undefined);

  return analysis.text.substring(0, 3000);
}

// ════════════════════════════════════════════════════════════════
// ── CODE AGENT AUTONOME ───────────────────────────────────────
// ════════════════════════════════════════════════════════════════

async function executeCodeTaskTool(input: Record<string, unknown>, sessionId?: string): Promise<string> {
  const task   = input['task'] as string;
  const repo   = (input['repo'] as string | undefined) ?? 'ibrahim';
  const chatId = chatIdFromSession(sessionId);

  if (!task) return '❌ task requis — décris ce qui doit être codé';

  // Lance l'agent en arrière-plan (non-bloquant)
  runCodeAgent(task, chatId, repo).catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    sendTelegramForMarketing(chatId, `❌ Code Agent crash: ${msg}`).catch(() => {});
  });

  return `✅ Code Agent lancé pour: "${task.slice(0, 80)}"\n⏳ Je te tiens informé sur Telegram au fur et à mesure (5-15 min selon la complexité).`;
}

async function createNewProjectTool(input: Record<string, unknown>, sessionId?: string): Promise<string> {
  const clientName   = input['client_name']   as string;
  const businessType = input['business_type'] as string;
  const description  = input['description']   as string;
  const phone        = (input['phone']        as string | undefined) ?? '';
  const city         = (input['city']         as string | undefined) ?? 'Oran';
  const chatId       = chatIdFromSession(sessionId);

  if (!clientName || !businessType || !description)
    return '❌ client_name, business_type et description sont requis';

  const repoName = `client-${clientName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;

  const task = `Créer un site web professionnel complet pour un client.

CLIENT: ${clientName}
TYPE DE BUSINESS: ${businessType}
VILLE: ${city}
TÉLÉPHONE: ${phone || 'à définir'}
DESCRIPTION / CONTENU SOUHAITÉ: ${description}

INSTRUCTIONS TECHNIQUES:
1. Créer les fichiers dans le dossier clients/${repoName}/ du repo ibrahim
2. Fichiers minimum: index.html, style.css, script.js
3. Design: moderne, responsive, professionnel
4. Langue: français (ou arabe si demandé)
5. Inclure: header avec nom + logo placeholder, section services, contact avec téléphone, footer
6. Couleurs: choisir selon le type de business (restaurant → chaleureux, médecin → bleu/blanc, etc.)
7. Après création → verify_deploy pour confirmer

À la fin, annoncer que le site est prêt et indiquer comment le déployer sur Netlify.`;

  runCodeAgent(task, chatId, 'ibrahim').catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    sendTelegramForMarketing(chatId, `❌ Code Agent crash: ${msg}`).catch(() => {});
  });

  return `✅ Création du site pour ${clientName} (${businessType}) lancée!\n⏳ Code Agent au travail — résultat sur Telegram dans 10-20 min.`;
}

// ════════════════════════════════════════════════════════════════
// ── GÉNÉRATION IA — Replicate (images) + fal.ai (vidéos) ─────
// ════════════════════════════════════════════════════════════════

async function replicateGenerate(
  model: string,
  input: Record<string, unknown>,
  token: string,
  maxMs = 120_000,
): Promise<string> {
  const createResp = await axios.post(
    `https://api.replicate.com/v1/models/${model}/predictions`,
    { input },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Prefer: 'wait=10',
      },
      timeout: 30_000,
    },
  );

  type Prediction = { id: string; status: string; output: unknown; error?: string };
  let pred = createResp.data as Prediction;

  if (pred.status === 'succeeded') {
    const out = Array.isArray(pred.output) ? pred.output[0] : pred.output;
    return String(out);
  }

  const start = Date.now();
  while (Date.now() - start < maxMs) {
    await new Promise(r => setTimeout(r, 3000));
    const poll = await axios.get(`https://api.replicate.com/v1/predictions/${pred.id}`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 15_000,
    });
    pred = poll.data;
    if (pred.status === 'succeeded') {
      const out = Array.isArray(pred.output) ? pred.output[0] : pred.output;
      return String(out);
    }
    if (pred.status === 'failed' || pred.status === 'canceled') {
      throw new Error(`Replicate: ${pred.error ?? 'prediction failed'}`);
    }
  }
  throw new Error('Replicate: timeout après 2 minutes');
}

// ── Shared helper: find car by partial/insensitive name, return id+name+image_url ──
async function findCarByName(name: string): Promise<{ id: string; name: string; image_url: string } | null> {
  const { data: cars } = await supabase.from('cars').select('id, name, image_url');
  if (!cars?.length) return null;
  const q = name.toLowerCase().replace(/\s+/g, ' ').trim();

  // 1. Exact match
  let hit = cars.find(c => c.name.toLowerCase() === q);
  if (hit) return hit as { id: string; name: string; image_url: string };

  // 2. Contains (car name ⊇ query OR query ⊇ car name)
  hit = cars.find(c => {
    const cn = c.name.toLowerCase();
    return cn.includes(q) || q.includes(cn);
  });
  if (hit) return hit as { id: string; name: string; image_url: string };

  // 3. Any significant word match (>= 3 chars)
  const words = q.split(/\s+/).filter(w => w.length >= 3);
  for (const word of words) {
    hit = cars.find(c => c.name.toLowerCase().includes(word));
    if (hit) return hit as { id: string; name: string; image_url: string };
  }

  return null;
}

async function falGenerate(
  modelId: string,
  input: Record<string, unknown>,
  falKey: string,
  maxMs = 240_000,
): Promise<string> {
  type FalQueue = {
    request_id: string;
    status?: string;
    response_url?: string;  // fal.ai provides exact result URL
    status_url?: string;    // fal.ai provides exact status URL
  };

  // Submit to fal.ai queue
  let submitResp;
  try {
    submitResp = await axios.post(
      `https://queue.fal.run/${modelId}`,
      input,
      { headers: { Authorization: `Key ${falKey}`, 'Content-Type': 'application/json' }, timeout: 30_000 },
    );
  } catch (submitErr: any) {
    if (submitErr.response) {
      throw new Error(`fal.ai submit (${modelId}): HTTP ${submitErr.response.status} — ${JSON.stringify(submitErr.response.data).slice(0, 300)}`);
    }
    throw submitErr;
  }

  const queued = submitResp.data as FalQueue;
  const { request_id, response_url, status_url } = queued;

  // Use URLs from fal.ai response — never construct manually (avoids 405 on result fetch)
  const pollUrl    = status_url   ?? `https://queue.fal.run/${modelId}/requests/${request_id}/status`;
  const resultUrl  = response_url ?? `https://queue.fal.run/${modelId}/requests/${request_id}`;

  // Poll for completion — HTTP 200 and 202 both mean "still running", only body status matters
  const start = Date.now();
  let completed = false;
  while (Date.now() - start < maxMs) {
    await new Promise(r => setTimeout(r, 5000));
    const statusResp = await axios.get(pollUrl, { headers: { Authorization: `Key ${falKey}` }, timeout: 15_000, validateStatus: () => true });
    const httpStatus = statusResp.status;
    if (httpStatus === 401 || httpStatus === 403) throw new Error(`fal.ai: auth rejetée (${httpStatus})`);
    if (httpStatus === 404) throw new Error('fal.ai: endpoint introuvable (404)');
    if (httpStatus >= 500) throw new Error(`fal.ai: erreur serveur (${httpStatus})`);
    const jobStatus: string = (statusResp.data as any)?.status ?? (statusResp.data as any)?.state ?? '';
    if (jobStatus === 'COMPLETED') { completed = true; break; }
    if (jobStatus === 'FAILED' || jobStatus === 'ERROR') throw new Error(`fal.ai: job échoué (status=${jobStatus})`);
    // IN_QUEUE / IN_PROGRESS / HTTP 202 → continue polling
  }
  if (!completed) throw new Error(`fal.ai: timeout après ${Math.round(maxMs / 1000)}s`);

  // Fetch result via response_url
  const resultResp = await axios.get(resultUrl, { headers: { Authorization: `Key ${falKey}` }, timeout: 15_000 });

  const result = resultResp.data as Record<string, unknown>;
  // fal.ai returns { video:{url} }, { images:[{url}] }, or { image:{url} } (BiRefNet/image models)
  const videoUrl = (result['video'] as any)?.url as string | undefined;
  if (videoUrl) return videoUrl;
  const images = result['images'] as any[] | undefined;
  if (images?.[0]?.url) return images[0].url as string;
  const singleImage = (result['image'] as any)?.url as string | undefined;
  if (singleImage) return singleImage;
  return JSON.stringify(result);
}

// ── Runway Gen-3 Alpha Turbo — image-to-video ─────────────────────────────────
async function runwayGenerate(
  imageUrl: string,
  prompt: string,
  duration: 5 | 10,
  token: string,
  maxMs = 240_000,
): Promise<string> {
  const headers = {
    Authorization:      `Bearer ${token}`,
    'X-Runway-Version': '2024-11-06',
    'Content-Type':     'application/json',
  };

  // gen4.5 supports portrait 720:1280 — gen3a_turbo only supported 768:1280 (caused 400)
  const payload = {
    model:       'gen4_turbo',  // gen4.5 confirmed in docs; gen4_turbo also valid
    promptImage: imageUrl,
    promptText:  prompt,
    ratio:       '720:1280',
    duration,
  };

  console.log(`[runwayGenerate] POST https://api.dev.runwayml.com/v1/image_to_video`);
  console.log(`[runwayGenerate] Authorization: ${token ? `Bearer ***${token.slice(-6)}` : 'MISSING'}`);
  console.log(`[runwayGenerate] X-Runway-Version: 2024-11-06 | Content-Type: application/json`);
  console.log(`[runwayGenerate] payload: model=${payload.model} ratio=${payload.ratio} duration=${payload.duration}`);
  console.log(`[runwayGenerate] promptImage: ${imageUrl.slice(0, 100)}`);
  console.log(`[runwayGenerate] promptText: "${prompt.slice(0, 100)}"`);

  let submitResp;
  try {
    submitResp = await axios.post(
      'https://api.dev.runwayml.com/v1/image_to_video',
      payload,
      { headers, timeout: 30_000 },
    );
  } catch (err: any) {
    if (err.response) {
      const status  = err.response.status as number;
      const data    = err.response.data;
      const errMsg  = typeof data === 'object' ? JSON.stringify(data) : String(data);
      console.error(`[runwayGenerate] ❌ HTTP ${status} — Runway response: ${errMsg}`);
      if (status === 400) throw new Error(`Runway a rejeté la requête (400): ${errMsg}`);
      if (status === 401 || status === 403) throw new Error(`Runway: auth rejetée (${status})`);
      throw new Error(`Runway: erreur HTTP ${status} — ${errMsg}`);
    }
    console.error(`[runwayGenerate] ❌ network error:`, err.message);
    throw err;
  }

  const taskId: string = (submitResp.data as any)?.id;
  if (!taskId) {
    console.error(`[runwayGenerate] ❌ pas de task ID — réponse complète:`, JSON.stringify(submitResp.data));
    throw new Error('Runway: pas de task ID dans la réponse');
  }
  console.log(`[runwayGenerate] ✅ task créée: taskId=${taskId} — polling...`);

  const start = Date.now();
  while (Date.now() - start < maxMs) {
    await new Promise(r => setTimeout(r, 5000));
    const elapsed = Math.round((Date.now() - start) / 1000);
    const statusResp = await axios.get(
      `https://api.dev.runwayml.com/v1/tasks/${taskId}`,
      { headers, timeout: 15_000, validateStatus: () => true },
    );
    const httpStatus = statusResp.status;
    if (httpStatus === 401 || httpStatus === 403) throw new Error(`Runway: auth rejetée (${httpStatus})`);
    if (httpStatus === 404) throw new Error(`Runway: task introuvable (${taskId})`);
    if (httpStatus >= 500) throw new Error(`Runway: erreur serveur (${httpStatus})`);
    const task   = statusResp.data as any;
    const status = (task?.status ?? '') as string;
    console.log(`[runwayGenerate] taskId=${taskId} status=${status || 'unknown'} (${elapsed}s)`);
    if (status === 'SUCCEEDED') {
      const output = task?.output as string[] | undefined;
      if (output?.[0]) {
        console.log(`[runwayGenerate] ✅ SUCCEEDED — output[0]=${output[0]}`);
        return output[0];
      }
      throw new Error('Runway: SUCCEEDED mais aucune URL vidéo dans output');
    }
    if (status === 'FAILED') {
      const reason = task?.failure ?? task?.failureCode ?? 'raison inconnue';
      throw new Error(`Runway: génération échouée — ${reason}`);
    }
    // PENDING / RUNNING → continue polling
  }
  throw new Error(`Runway: timeout après ${Math.round(maxMs / 1000)}s`);
}

// ── Scene transformation detection — keywords that indicate background relocation ─
function detectSceneTransformation(userPrompt: string): boolean {
  const lower = userPrompt.toLowerCase();
  const keywords = [
    // FR locations
    'plage', 'beach',
    'montagne', 'mountain',
    ' mer ', ' mer,', ' mer.', 'bord de mer', 'face à la mer', 'vue sur la mer',
    'sea ', 'ocean', 'côte', 'côtier', 'côtière', 'coastal', 'corniche',
    'désert', 'desert',
    'forêt', 'foret', 'forest',
    'campagne', 'countryside', 'falaise', 'cliff',
    // Algeria specifics
    'oran', 'oranais', 'oranaise', 'algérie', 'algerie', 'algérien', 'alger',
    // Generic transformation intent
    'arrière-plan', 'arriere-plan', 'background', 'décor', 'decor',
    'paysage', 'scenery', 'setting',
    // Relocation verbs / patterns
    'mets la voiture', 'met la voiture', 'place la voiture',
    'déplace', 'deplace', 'relocate',
    'sur une plage', 'sur la plage', 'sur une montagne', 'sur la montagne',
    'dans le désert', 'dans la forêt', 'dans un décor',
    'face à la', 'face a la', 'au bord de', 'avec vue sur',
    'route côtière', 'route cotiere',
  ];
  return keywords.some(kw => lower.includes(kw));
}

// ── Prompt builder ─────────────────────────────────────────────────────────────
// Strict fidelity  (sceneTransformation=false): motion-only prompt, cfgScale=0.4
// Scene transform  (sceneTransformation=true) : car identity from image + new env
// KEY: for image-to-video, NEVER describe the car appearance — image is the reference.
function buildVideoPromptForRealism(opts: {
  carName:              string;
  userScene:            string;
  mode:                 'image-to-video' | 'text-to-video';
  sceneTransformation?: boolean;
}): { prompt: string; negativePrompt: string; cfgScale: number } {
  const { carName, userScene, mode, sceneTransformation = false } = opts;

  const baseNegativePrompt = [
    'morphing, body deformation, shape distortion, color change',
    'concept car, car redesign, stylized render, CGI, anime, cartoon',
    'oversaturated, dramatic fake lighting, neon glow',
    'speed blur, drift, stunt, explosion, smoke',
    'unrealistic reflections, plastic look, blurry, low quality',
    'AI artifact, glitch, uncanny valley',
  ].join(', ');

  // ── text-to-video (no source image) ─────────────────────────────────────────
  if (mode === 'text-to-video') {
    const scene = userScene.length > 15 ? userScene : 'coastal road in Oran, Algeria, golden hour';
    const prompt = [
      `Real filmed video of a ${carName || 'car'}. ${scene}.`,
      'Car drives slowly and naturally.',
      'Camera at 3/4 front angle, smooth and stable.',
      'Natural lighting, realistic road surface, realistic motion.',
      'Looks like a real video, not CGI or AI-stylized.',
    ].join(' ');
    return { prompt, negativePrompt: baseNegativePrompt, cfgScale: 0.5 };
  }

  // ── image-to-video: scene transformation — car from image, env from text ─────
  // cfgScale=0.65 → give more weight to prompt so background actually changes
  if (sceneTransformation) {
    const prompt = [
      'Use the provided vehicle image as the identity reference for the car only.',
      "Preserve the car's exact shape, color, body lines and visible details.",
      `Relocate the car into a completely new environment: ${userScene}.`,
      'Replace the original background entirely with the requested new scene.',
      'The vehicle must appear naturally placed and integrated into the new location.',
      'Show the new setting clearly — the original background must not remain visible.',
      'Natural lighting that matches the new environment. Smooth realistic camera motion.',
      'Looks like a real filmed video.',
    ].join(' ');
    const negativePrompt = baseNegativePrompt + ', original background, same scene as source image, unchanged environment';
    return { prompt, negativePrompt, cfgScale: 0.65 };
  }

  // ── image-to-video: strict fidelity — preserve car + scene, motion only ──────
  // cfgScale=0.4 → image-faithful, minimal divergence from source
  const scene = userScene.length > 15 ? userScene : 'coastal road in Oran, Algeria, golden hour';
  const prompt = [
    `Real filmed video. ${scene}.`,
    'Car moves slowly and naturally.',
    'Minimal camera motion, smooth handheld or gimbal shot.',
    'Natural daylight, realistic road surface, natural shadows.',
    'Realistic reflections, no stylization.',
    'Looks like a real video shot with a camera.',
  ].join(' ');
  return { prompt, negativePrompt: baseNegativePrompt, cfgScale: 0.4 };
}

// ── Source image quality check (HEAD, no download) ────────────────────────────
async function prepareSourceImage(imageUrl: string): Promise<{ valid: boolean; sizeKb: number; note: string }> {
  try {
    const resp   = await axios.head(imageUrl, { timeout: 8_000, validateStatus: () => true });
    if (resp.status >= 400) return { valid: false, sizeKb: 0, note: `HTTP ${resp.status}` };
    const bytes  = Number(resp.headers['content-length'] ?? 0);
    const sizeKb = bytes > 0 ? Math.round(bytes / 1024) : 0;
    const note   = sizeKb > 0
      ? (sizeKb < 15 ? `⚠️ image petite (${sizeKb}KB) — qualité peut varier` : `OK (${sizeKb}KB)`)
      : 'OK (taille inconnue)';
    return { valid: true, sizeKb, note };
  } catch (err: any) {
    return { valid: false, sizeKb: 0, note: `Inaccessible: ${err.message}` };
  }
}

// ── Step A: Remove background — fal.ai BiRefNet ───────────────────────────────
// Returns URL of PNG with transparent background (car only)
async function extractCarFromBackground(imageUrl: string, falKey: string, maxMs = 90_000): Promise<string> {
  console.log(`[extractCarFromBackground] BiRefNet — imageUrl=${imageUrl}`);
  const url = await falGenerate(
    'fal-ai/birefnet',
    { image_url: imageUrl, model: 'General Use (Light)' },
    falKey,
    maxMs,
  );
  if (url.startsWith('{')) throw new Error(`BiRefNet returned unexpected JSON: ${url.slice(0, 120)}`);
  console.log(`[extractCarFromBackground] ✅ carPNG=${url}`);
  return url;
}

// ── Step B: Place extracted car in a new scene ────────────────────────────────
// Uses BRIA product-shot: car PNG is the fixed foreground asset, only the
// background is generated. The car is NEVER redrawn → color/shape preserved.
// Primary:  fal-ai/bria/product-shot  (purpose-built for product-on-new-bg)
// Fallback: fal-ai/bria/background-generation  (same BRIA family, alt name)
async function generateCarInNewScene(
  carPngUrl:      string,
  requestedScene: string,
  _carName:       string,   // kept for API compatibility — BRIA infers car from image
  falKey:         string,
  maxMs = 120_000,
): Promise<string> {
  // Scene prompt describes only the environment — car identity comes from the PNG
  const scenePrompt = [
    `${requestedScene}.`,
    'Professional automotive photography, photorealistic, cinematic lighting, 4K.',
    'Realistic outdoor environment, natural light, no studio backdrop.',
    'Car is the main subject, naturally integrated.',
  ].join(' ');

  // ── Attempt 1: BRIA product-shot ─────────────────────────────────────────
  // The image_url (car PNG, transparent bg) becomes the fixed foreground.
  // BRIA generates only the background around it — car pixels unchanged.
  const endpoint1 = 'fal-ai/bria/product-shot';
  const input1 = { image_url: carPngUrl, prompt: scenePrompt, num_results: 1 };
  console.log(`[generateCarInNewScene] T1: ${endpoint1} | car is fixed foreground (color/shape auto-preserved)`);
  console.log(`[generateCarInNewScene] input.image_url=${carPngUrl}`);
  console.log(`[generateCarInNewScene] input.prompt="${scenePrompt}"`);
  let error1 = '';
  try {
    const url = await falGenerate(endpoint1, input1, falKey, Math.round(maxMs * 0.65));
    if (url.startsWith('{')) throw new Error(`JSON inattendu: ${url.slice(0, 200)}`);
    console.log(`[generateCarInNewScene] ✅ T1 BRIA product-shot OK → ${url}`);
    return url;
  } catch (err1: any) {
    error1 = err1.message;
    console.warn(`[generateCarInNewScene] ❌ T1 (${endpoint1}): ${error1}`);
  }

  // ── Attempt 2: BRIA background-generation (same family, alternative endpoint) ──
  const endpoint2 = 'fal-ai/bria/background-generation';
  const input2 = { image_url: carPngUrl, prompt: scenePrompt };
  console.log(`[generateCarInNewScene] T2: ${endpoint2}`);
  try {
    const url = await falGenerate(endpoint2, input2, falKey, Math.round(maxMs * 0.8));
    if (url.startsWith('{')) throw new Error(`JSON inattendu: ${url.slice(0, 200)}`);
    console.log(`[generateCarInNewScene] ✅ T2 BRIA background-generation OK → ${url}`);
    return url;
  } catch (err2: any) {
    const error2 = err2.message;
    console.error(`[generateCarInNewScene] ❌ T2 (${endpoint2}): ${error2}`);
    throw new Error(`generateCarInNewScene: T1 (${endpoint1}): ${error1} | T2 (${endpoint2}): ${error2}`);
  }
}

// ── Step B validation: check the transformed keyframe is a real scene image ──
async function validateTransformedKeyframe(imageUrl: string): Promise<{ valid: boolean; reason: string; sizeKb: number }> {
  try {
    const resp = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 30_000 });
    const buf  = Buffer.from(resp.data as ArrayBuffer);
    const sizeKb = Math.round(buf.length / 1024);
    const contentType = (resp.headers['content-type'] as string | undefined) ?? '';

    if (!contentType.startsWith('image/')) {
      return { valid: false, reason: `content-type non image: "${contentType}"`, sizeKb };
    }
    if (buf.length < 30_000) {
      return { valid: false, reason: `image trop petite (${sizeKb} KB) — probablement fond vide ou transparent`, sizeKb };
    }
    // Magic bytes: JPEG = FF D8, PNG = 89 50 4E 47
    const isJpeg = buf[0] === 0xFF && buf[1] === 0xD8;
    const isPng  = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47;
    if (!isJpeg && !isPng) {
      return { valid: false, reason: `format non reconnu (magic: ${buf.slice(0, 4).toString('hex')})`, sizeKb };
    }
    return { valid: true, reason: `OK — ${sizeKb} KB, ${contentType}`, sizeKb };
  } catch (err: any) {
    return { valid: false, reason: `téléchargement échoué: ${err.message}`, sizeKb: 0 };
  }
}

async function generateVehicleVideo(opts: {
  imageUrl:            string | null;
  userPrompt:          string;
  carName:             string;
  duration:            number;
  falKey:              string | undefined;
  runwayKey:           string | undefined;
  forceProvider?:      'runway' | 'kling' | 'auto';
  sceneTransformation?: boolean;
}): Promise<{ url: string; provider: string; mode: 'image-to-video' | 'text-to-video' }> {
  const { imageUrl, userPrompt, carName, duration, falKey, runwayKey, forceProvider = 'auto', sceneTransformation = false } = opts;
  const dur  = (duration <= 5 ? 5 : 10) as 5 | 10;
  const mode: 'image-to-video' | 'text-to-video' = imageUrl ? 'image-to-video' : 'text-to-video';

  const { prompt, negativePrompt, cfgScale } = buildVideoPromptForRealism({ carName, userScene: userPrompt, mode, sceneTransformation });
  console.log(`[generateVehicleVideo] forceProvider=${forceProvider} mode=${mode} sceneTransformation=${sceneTransformation} cfgScale=${cfgScale} runway=${!!runwayKey} fal=${!!falKey}`);
  console.log(`[generateVehicleVideo] prompt="${prompt.slice(0, 120)}"`);

  // ── FORCED RUNWAY ─────────────────────────────────────────────────────────
  if (forceProvider === 'runway') {
    if (!runwayKey) throw new Error('RUNWAY_API_KEY non configurée dans Railway. Ajoute-la dans Railway → Variables → RUNWAY_API_KEY.');
    if (!imageUrl)  throw new Error('Runway image-to-video nécessite une image source — voiture non trouvée dans la flotte ou sans photo.');
    console.log(`[generateVehicleVideo] FORCED RUNWAY — imageUrl=${imageUrl}`);
    const url = await runwayGenerate(imageUrl, prompt, dur, runwayKey, 240_000);
    return { url, provider: 'Runway Gen-3', mode };
  }

  // ── FORCED KLING ──────────────────────────────────────────────────────────
  if (forceProvider === 'kling') {
    if (!falKey) throw new Error('FAL_KEY non configurée — impossible d\'utiliser Kling.');
    if (imageUrl) {
      const url = await falGenerate(
        'fal-ai/kling-video/v1.6/standard/image-to-video',
        { image_url: imageUrl, prompt, negative_prompt: negativePrompt, cfg_scale: cfgScale, duration: String(duration), aspect_ratio: '9:16' },
        falKey, 240_000,
      );
      return { url, provider: 'Kling 1.6', mode: 'image-to-video' };
    }
    const url = await falGenerate(
      'fal-ai/kling-video/v1.6/standard/text-to-video',
      { prompt, negative_prompt: negativePrompt, duration: String(duration), aspect_ratio: '9:16' },
      falKey, 240_000,
    );
    return { url, provider: 'Kling 1.6', mode: 'text-to-video' };
  }

  // ── AUTO: Runway first if available ───────────────────────────────────────
  if (imageUrl && runwayKey) {
    try {
      console.log(`[generateVehicleVideo] AUTO — essai Runway d'abord...`);
      const url = await runwayGenerate(imageUrl, prompt, dur, runwayKey, 240_000);
      return { url, provider: 'Runway Gen-3', mode };
    } catch (err: any) {
      console.warn('[generateVehicleVideo] Runway failed → Kling fallback:', err.message);
    }
  } else if (imageUrl && !runwayKey) {
    console.log('[generateVehicleVideo] Runway non configuré, fallback vers Kling.');
  }

  // Kling image-to-video — cfgScale from builder (0.4 strict / 0.65 scene transform)
  if (imageUrl && falKey) {
    const url = await falGenerate(
      'fal-ai/kling-video/v1.6/standard/image-to-video',
      { image_url: imageUrl, prompt, negative_prompt: negativePrompt, cfg_scale: cfgScale, duration: String(duration), aspect_ratio: '9:16' },
      falKey, 240_000,
    );
    return { url, provider: 'Kling 1.6', mode: 'image-to-video' };
  }

  // Kling text-to-video (last resort)
  if (falKey) {
    const url = await falGenerate(
      'fal-ai/kling-video/v1.6/standard/text-to-video',
      { prompt, negative_prompt: negativePrompt, duration: String(duration), aspect_ratio: '9:16' },
      falKey, 240_000,
    );
    return { url, provider: 'Kling 1.6', mode: 'text-to-video' };
  }

  throw new Error('Aucun provider vidéo configuré — ajoute FAL_KEY dans Railway → Variables');
}

async function generateImageTool(input: Record<string, unknown>, sessionId?: string): Promise<string> {
  const token = env.REPLICATE_API_TOKEN;
  if (!token) return '❌ REPLICATE_API_TOKEN non configuré dans Railway. Ajoute-le dans Railway → Variables.';

  const prompt      = input['prompt'] as string;
  const aspectRatio = (input['aspect_ratio'] as string) ?? '9:16';
  const style       = (input['style'] as string) ?? 'photorealistic';
  const chatId      = chatIdFromSession(sessionId);

  const styleModifier: Record<string, string> = {
    photorealistic: 'ultra-realistic, photographic, DSLR quality, 4K',
    cinematic:      'cinematic photography, film grain, professional lighting, movie scene',
    artistic:       'artistic, vibrant colors, creative composition',
    luxury:         'luxury brand photography, glossy, premium, elegant',
  };

  const fullPrompt = `${prompt}, ${styleModifier[style] ?? styleModifier['photorealistic']}`;

  await sendTelegramForMarketing(chatId, `🎨 *Génération image IA — Flux.1*\n_"${prompt.slice(0, 80)}"_\n⏳ 15-30 secondes...`);

  const imageUrl = await replicateGenerate(
    'black-forest-labs/flux-1.1-pro',
    {
      prompt:         fullPrompt,
      aspect_ratio:   aspectRatio,
      output_format:  'jpg',
      output_quality: 90,
      safety_tolerance: 2,
    },
    token,
    90_000,
  );

  let delivered = false;
  try {
    await sendTelegramPhoto(chatId, imageUrl, `🎨 *Image générée — Flux.1 Pro*\n_${prompt.slice(0, 100)}_`);
    delivered = true;
  } catch (err: any) {
    console.error('[generateImageTool] sendTelegramPhoto failed:', err.message);
  }

  if (delivered) {
    return `✅ Image Flux.1 générée et envoyée sur Telegram ↑\nURL: ${imageUrl}`;
  }
  return `⚠️ Image générée mais envoi Telegram échoué.\nURL directe: ${imageUrl}`;
}

async function generateAiVideoTool(input: Record<string, unknown>, sessionId?: string): Promise<string> {
  const falKey    = env.FAL_KEY;
  const runwayKey = env.RUNWAY_API_KEY;

  // Startup log — visible in Railway logs every time a video is requested
  console.log(`[video-providers] Runway configured: ${runwayKey ? 'true ✅' : 'false'} | fal.ai configured: ${falKey ? 'true ✅' : 'false'}`);

  if (!falKey && !runwayKey) return '❌ Aucun provider vidéo configuré. Ajoute FAL_KEY dans Railway → Variables.';

  const prompt          = input['prompt'] as string;
  const duration        = Number(input['duration'] ?? 5);
  const carName         = input['car_name'] as string | undefined;
  const forceProvider   = (input['provider'] as 'auto' | 'runway' | 'kling' | undefined) ?? 'auto';
  const chatId          = chatIdFromSession(sessionId);

  // ── Duplicate lock ─────────────────────────────────────────────────────────
  const lockKey = chatId || sessionId || 'global';
  if (videoGenLocks.has(lockKey)) {
    console.log(`[generateAiVideoTool] duplicate video generation skipped (lockKey=${lockKey})`);
    return '⏳ Génération vidéo déjà en cours pour cette session. La précédente se termine dans 1-4 min.';
  }
  videoGenLocks.add(lockKey);

  try {
  const sceneTransformation = detectSceneTransformation(prompt);
  const requestedScene      = sceneTransformation ? prompt.slice(0, 80) : '';
  console.log(`[generateAiVideoTool] provider demandé: ${forceProvider} | voiture: "${carName ?? 'non précisée'}" | sceneTransformation=${sceneTransformation}${sceneTransformation ? ` requestedScene="${requestedScene}"` : ''}`);

  // ── Lookup real car photo from Supabase ────────────────────────────────────
  let carImageUrl:   string | null = null;
  let carDisplayName = '';

  if (carName) {
    const car = await findCarByName(carName);
    console.log(`[generateAiVideoTool] voiture demandée: "${carName}" → ${car ? `trouvée: "${car.name}"` : 'non trouvée'}`);
    if (car?.image_url) {
      console.log(`[generateAiVideoTool] image_url: ${car.image_url}`);
      const imgCheck = await prepareSourceImage(car.image_url);
      console.log(`[generateAiVideoTool] image check: ${imgCheck.note}`);
      if (imgCheck.valid) {
        carImageUrl    = car.image_url;
        carDisplayName = car.name;
        console.log(`[generateAiVideoTool] ✅ mode image-to-video activé: ${car.name}`);
      } else {
        console.log(`[generateAiVideoTool] ⚠️ Image invalide pour ${car.name} (${imgCheck.note}) → text-to-video`);
      }
    } else {
      console.log(`[generateAiVideoTool] ⚠️ Aucune image_url pour "${carName}" → text-to-video`);
    }
  }

  // ── Scene transformation pipeline (3 steps) ──────────────────────────────
  // Preprocessing happens here so we can send per-step Telegram progress messages.
  let effectiveImageUrl: string | null = carImageUrl;
  let carExtraction           = false;
  let transformedKeyframeCreated = false;

  if (sceneTransformation && carImageUrl && falKey) {
    // STEP 1 — Background removal
    await sendTelegramForMarketing(chatId,
      `🎬 *Transformation de scène — ${carDisplayName}*\n✅ Photo réelle du véhicule trouvée.\n_Étape 1/3 : Extraction de la voiture (suppression du fond)..._\n⏳ Patience...`);
    let carOnlyUrl: string;
    try {
      carOnlyUrl = await extractCarFromBackground(carImageUrl, falKey, 90_000);
      carExtraction = true;
      console.log(`[generateAiVideoTool] carExtraction=true carOnlyUrl=${carOnlyUrl}`);
    } catch (extractErr: any) {
      console.warn(`[generateAiVideoTool] carExtraction=FAILED: ${extractErr.message}`);
      throw new Error(`Impossible d'isoler correctement la voiture pour transformer le décor. J'ai besoin d'une photo plus propre / mieux cadrée.`);
    }

    // STEP 2 — New scene generation (no fallback — fail clean if this fails)
    await sendTelegramForMarketing(chatId,
      `✅ *Voiture extraite.* Étape 2/3 : Création de la nouvelle scène...\n_"${requestedScene.slice(0, 60)}"_\n⏳ 30-90 secondes...`);
    let transformedUrl: string;
    try {
      transformedUrl = await generateCarInNewScene(carOnlyUrl, prompt, carDisplayName || carName || '', falKey, 150_000);
    } catch (sceneErr: any) {
      console.error(`[generateAiVideoTool] transformedKeyframeCreated=false: ${sceneErr.message}`);
      await sendTelegramForMarketing(chatId,
        `❌ *La recréation de la nouvelle scène a échoué.*\nJe n'ai pas lancé l'animation pour éviter un rendu incohérent.\n_Erreur: ${sceneErr.message.slice(0, 200)}_`);
      throw new Error(`Transformation de scène échouée : ${sceneErr.message}`);
    }

    // STEP 2b — Validate the transformed keyframe
    console.log(`[generateAiVideoTool] validation keyframe intermédiaire: ${transformedUrl}`);
    const kfValidation = await validateTransformedKeyframe(transformedUrl);
    console.log(`[generateAiVideoTool] transformedKeyframeValidated=${kfValidation.valid} raison="${kfValidation.reason}" sizeKb=${kfValidation.sizeKb}`);
    if (!kfValidation.valid) {
      await sendTelegramForMarketing(chatId,
        `❌ *Image intermédiaire invalide* (${kfValidation.reason}).\nGénération vidéo annulée — la scène créée n'est pas exploitable.`);
      throw new Error(`Keyframe invalide: ${kfValidation.reason}`);
    }

    transformedKeyframeCreated = true;
    effectiveImageUrl = transformedUrl;
    console.log(`[generateAiVideoTool] transformedKeyframeCreated=true transformedUrl=${transformedUrl}`);
    await sendTelegramForMarketing(chatId,
      `✅ *Nouvelle scène créée avec succès* (${kfValidation.sizeKb} KB).\nÉtape 3/3 : Animation vidéo en cours...\n⏳ 60-240 secondes...`);

  } else if (forceProvider === 'runway') {
    await sendTelegramForMarketing(chatId,
      `🎬 *Génération vidéo — Runway Gen-3* (mode forcé)\n${carImageUrl ? `✅ Photo réelle de *${carDisplayName}* trouvée.` : '⚠️ Aucune photo réelle trouvée.'}\n_Génération en mode fidélité stricte avec Runway..._\n⏳ 60-240 secondes, patience...`);
  } else if (carImageUrl) {
    const providerLabel = (forceProvider === 'kling' || !runwayKey) ? 'Kling 1.6' : 'Runway Gen-3';
    await sendTelegramForMarketing(chatId,
      `🎬 *Génération vidéo IA — ${providerLabel}*\n✅ Photo réelle de *${carDisplayName}* trouvée.\n_Génération réaliste en cours avec ${providerLabel}..._\n⏳ 60-240 secondes, patience...`);
  } else {
    await sendTelegramForMarketing(chatId,
      `🎬 *Génération vidéo IA — Kling 1.6*\n⚠️ Aucune photo réelle exploitable trouvée. Génération basée uniquement sur description, le rendu peut être moins fidèle.\n⏳ 60-240 secondes, patience...`);
  }

  const sourceImageType = effectiveImageUrl !== carImageUrl ? 'transformed' : 'original';
  console.log(`[generateAiVideoTool] sourceImage=${sourceImageType} carExtraction=${carExtraction} transformedKeyframeCreated=${transformedKeyframeCreated} requestedScene="${requestedScene}"`);

  // ── Generate via provider dispatcher ──────────────────────────────────────
  const genStart = Date.now();
  const { url: videoUrl, provider, mode } = await generateVehicleVideo({
    imageUrl:            effectiveImageUrl,
    userPrompt:          prompt,
    carName:             carDisplayName || carName || '',
    duration,
    falKey,
    runwayKey,
    forceProvider,
    // If we already built a transformed keyframe, just animate it (motion-only prompt)
    // If preprocessing was skipped/failed, keep the original sceneTransformation flag
    sceneTransformation: !transformedKeyframeCreated && sceneTransformation,
  });
  const genSec = Math.round((Date.now() - genStart) / 1000);
  console.log(`[generateAiVideoTool] ✅ provider=${provider} mode=${mode} sceneTransformation=${sceneTransformation} sourceImage=${sourceImageType} durée=${genSec}s`);
  console.log(`[generateAiVideoTool] url vidéo: ${videoUrl}`);

  const resp   = await axios.get(videoUrl, { responseType: 'arraybuffer', timeout: 60_000 });
  const buffer = Buffer.from(resp.data as ArrayBuffer);

  if (!isValidMp4Buffer(buffer)) {
    throw new Error(`${provider} a retourné un fichier invalide (${buffer.length} bytes — pas un MP4 valide)`);
  }

  const caption = mode === 'image-to-video'
    ? `🎬 *${carDisplayName} — Vidéo réaliste — ${provider}*\n_Générée depuis la vraie photo_`
    : `🎬 *Vidéo IA — ${provider}*\n_${prompt.slice(0, 100)}_`;

  let delivered = false;
  try {
    await sendVideoBuffer(chatId, buffer, caption);
    delivered = true;
  } catch (err: any) {
    console.error('[generateAiVideoTool] sendVideoBuffer failed:', err.message);
    try {
      await sendTelegramForMarketing(chatId, `${caption}\n\n⚠️ Envoi direct impossible.\n[Télécharger](${videoUrl})`);
      delivered = true;
    } catch { /* both failed */ }
  }

  const modeLabel = mode === 'image-to-video' ? `image réelle de ${carDisplayName}` : 'description texte';
  if (delivered) return `✅ Vidéo réaliste créée (${provider}, ${mode}) depuis ${modeLabel} — envoyée sur Telegram ↑`;
  return `⚠️ Vidéo générée via ${provider} (${mode}) depuis ${modeLabel} mais envoi Telegram échoué.\nURL directe: ${videoUrl}`;
  } finally {
    videoGenLocks.delete(lockKey);
  }
}

async function animateCarPhotoTool(input: Record<string, unknown>, sessionId?: string): Promise<string> {
  const falKey    = env.FAL_KEY;
  const runwayKey = env.RUNWAY_API_KEY;
  if (!falKey && !runwayKey) return '❌ Aucun provider vidéo configuré. Ajoute FAL_KEY dans Railway → Variables.';

  const chatId         = chatIdFromSession(sessionId);
  const carName        = input['car_name'] as string | undefined;
  const motionPrompt   = (input['motion_prompt'] as string) ?? 'car moving forward smoothly, cinematic camera pan, golden hour lighting';
  const forceProvider  = (input['provider'] as 'auto' | 'runway' | 'kling' | undefined) ?? 'auto';

  let imageUrl    = input['image_url'] as string | undefined;
  let displayName = 'voiture';

  console.log(`[animateCarPhotoTool] provider demandé: ${forceProvider} | voiture: "${carName ?? 'auto'}"`);

  // ── Duplicate lock ─────────────────────────────────────────────────────────
  const lockKey = chatId || sessionId || 'global';
  if (videoGenLocks.has(lockKey)) {
    console.log(`[animateCarPhotoTool] duplicate video generation skipped (lockKey=${lockKey})`);
    return '⏳ Génération vidéo déjà en cours pour cette session. La précédente se termine dans 1-4 min.';
  }
  videoGenLocks.add(lockKey);

  try {
  if (!imageUrl) {
    if (carName) {
      const car = await findCarByName(carName);
      console.log(`[animateCarPhotoTool] Recherche: "${carName}" →`, car ? `${car.name} (image:${car.image_url ? 'oui' : 'non'})` : 'non trouvée');
      if (!car?.image_url) {
        return `❌ Voiture "${carName}" non trouvée dans la flotte ou sans photo. Vérifie le nom ou fournis image_url.`;
      }
      imageUrl    = car.image_url;
      displayName = car.name;
    } else {
      const { data: cars } = await supabase.from('cars').select('id, name, image_url').eq('available', true);
      const car = (cars ?? []).find((c: any) => c.image_url) as any;
      if (!car?.image_url) return '❌ Aucune voiture avec photo trouvée. Précise car_name ou fournis image_url.';
      imageUrl    = car.image_url as string;
      displayName = car.name as string;
    }
  }
  console.log(`[animateCarPhotoTool] image_url: ${imageUrl} | displayName: ${displayName}`);

  if (forceProvider === 'runway') {
    await sendTelegramForMarketing(chatId,
      `🎬 *Animation photo — Runway Gen-3* (mode forcé)\n✅ Photo réelle de *${displayName}* trouvée.\n_Génération en mode fidélité stricte avec Runway..._\n⏳ 60-240 secondes...`);
  } else {
    const providerLabel = (forceProvider === 'kling' || !runwayKey) ? 'Kling 1.6' : 'Runway Gen-3';
    await sendTelegramForMarketing(chatId,
      `🎬 *Animation photo IA — ${providerLabel}*\n✅ Photo réelle de *${displayName}* trouvée.\n_Génération réaliste en cours avec ${providerLabel}..._\n⏳ 60-240 secondes...`);
  }

  const genStart = Date.now();
  const { url: videoUrl, provider, mode } = await generateVehicleVideo({
    imageUrl:            imageUrl ?? null,
    userPrompt:          motionPrompt,
    carName:             displayName,
    duration:            5,
    falKey,
    runwayKey,
    forceProvider,
    sceneTransformation: false,
  });
  const genSec = Math.round((Date.now() - genStart) / 1000);
  console.log(`[animateCarPhotoTool] ✅ provider=${provider} mode=${mode} durée=${genSec}s`);
  console.log(`[animateCarPhotoTool] url vidéo: ${videoUrl}`);

  const resp   = await axios.get(videoUrl, { responseType: 'arraybuffer', timeout: 60_000 });
  const buffer = Buffer.from(resp.data as ArrayBuffer);

  if (!isValidMp4Buffer(buffer)) {
    throw new Error(`${provider} a retourné un fichier invalide (${buffer.length} bytes — pas un MP4 valide)`);
  }

  const caption = `🎬 *${displayName} — Vidéo réaliste — ${provider}*\n_Générée depuis la vraie photo_`;
  let delivered = false;
  try {
    await sendVideoBuffer(chatId, buffer, caption);
    delivered = true;
  } catch (err: any) {
    console.error('[animateCarPhotoTool] sendVideoBuffer failed:', err.message);
    try {
      await sendTelegramForMarketing(chatId, `${caption}\n\n⚠️ Envoi direct impossible.\n[Télécharger la vidéo](${videoUrl})`);
      delivered = true;
    } catch { /* both failed */ }
  }

  if (delivered) return `✅ Photo de ${displayName} animée (${provider}, ${mode}) et envoyée sur Telegram ↑`;
  return `⚠️ Vidéo générée (${provider}) mais envoi Telegram échoué.\nURL directe: ${videoUrl}`;
  } finally {
    videoGenLocks.delete(lockKey);
  }
}
