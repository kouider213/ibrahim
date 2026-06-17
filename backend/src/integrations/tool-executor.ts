/**
 * DZARYX AI Agent — Tool Executor
 * © 2024-2026 Kouider — Fik Conciergerie, Oran, Algeria
 * PROPRIETARY — ALL RIGHTS RESERVED — UNAUTHORIZED USE PROHIBITED
 * Signature: DZX-FK-OAN-2024-K7X9M2Q1
 */
import { supabase } from './supabase.js';
import { insertReminder, findByDedupKey } from '../db/reminders.js';
import {
  resolveTimezone,
  parseLocalHHMM,
  getUTCOffsetString,
  toLocalISO,
  isValidTimezone,
} from '../utils/timezone.js';
import { createCalendarEvent, syncPendingBookings, listUpcomingEvents, deleteCalendarEvent, updateCalendarEvent, listPersonalEvents, createPersonalCalendarEvent, deletePersonalCalendarEvent } from './google-calendar.js';
import { getFinancialReport, formatFinancialReport } from './finance.js';
import { executeMediaTool } from './media-executor.js';
import { getFileContent, updateFile, listDirectory, triggerNetlifyDeploy, searchCode, vercelGetDeployments, vercelGetDeploymentLogs, vercelCheckUrl, vercelRedeploy } from './github.js';
import { learnRule, chat } from './claude-api.js';
import { formatPricingTable, getPricingForVehicle } from '../config/pricing.js';
import { getOranWeather } from './web-search.js';
import { getRailwayLogs, waitForDeploy } from './railway.js';
import { env } from '../config/env.js';
import { runTikTokMarketResearch } from '../marketing/market-research.js';
import { savePendingVideo } from '../marketing/approval-store.js';
import { saveVideoSession, getLatestVideoSession } from '../marketing/video-session-store.js';
import { executeCreateMarketingVideo, isValidMp4Buffer, mergeVideoWithAudio } from '../marketing/create-marketing-video.js';
import {
  generateUISceneFile, addOverlayToClip, concatScenesWithVoice,
  ensureSceneFont,
} from '../marketing/scene-assembler.js';
import {
  saveVideoProject, updateVideoProject,
  buildClientSearchStoryboard, buildAirportArrivalStoryboard,
  buildFleetRevealStoryboard, buildCornicheDriveStoryboard,
} from '../marketing/video-project-store.js';

const PROJ_W = 1080;
const PROJ_H = 1920;
import { getVideoBuffer } from '../marketing/video-buffer.js';
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
import { sendWhatsApp } from './whatsapp.js';
import { generateReservationVoucher } from './generate-voucher.js';
import { getLearnedRules, saveLearnedRule, formatRulesForContext } from './learned-rules.js';
import { generateRentalContract } from './generate-contract.js';
import { exportBookingsToExcel } from './excel-export.js';
// schedulerQueue removed — schedule_reminder now uses worker-only delivery (no BullMQ)
import { redis } from '../queue/queue.js';
import { recordToolExecution } from '../orchestrator/action-engine.js';
import { writeMemory, computeMemoryKey, type MemoryDomain } from '../orchestrator/memory-engine.js';
import { getClientProfile } from '../orchestrator/client-intelligence.js';
import { getClientBrain, addClientNote, setArrivalPattern, saveObservation } from './client-brain.js';
import axios from 'axios';
import crypto from 'crypto';
import { runCodeAgent } from '../agents/code-agent.js';
import { executeImageToImage } from './image-to-image.js';
import { multiProviderWebSearch, jinaAuthHeaders } from './web-search-provider.js';
import { saveBeforeState, saveAfterState } from './vehicle-state.js';
import { savePropertyBeforeState, savePropertyAfterState } from './property-state.js';

// ── In-memory lock — prevents duplicate video generations per chat ─────────────
// Key = chatId (Telegram) or sessionId. Set before generation, deleted in finally.
const videoGenLocks = new Set<string>();

// ── App notification helpers (replace Telegram sends in marketing tools) ───────
async function tgMsg(_chatId: string | number | null, text: string): Promise<void> {
  try {
    const { emitProactive } = await import('../notifications/mobile-push.js');
    const clean = text.replace(/[*_`[\]()]/g, '').replace(/_/g, '').slice(0, 120);
    emitProactive(clean, 'info', text.replace(/[*_]/g, ''));
  } catch {}
}

async function tgPhoto(_chatId: string | number | null, imageUrl: string, caption: string): Promise<void> {
  try {
    const { emitProactive } = await import('../notifications/mobile-push.js');
    const title = caption.replace(/[*_`[\]()]/g, '').slice(0, 80);
    emitProactive(title, 'info', `${caption.replace(/[*_]/g, '')}\n${imageUrl}`);
  } catch {}
}

async function tgVideo(_chatId: string | number | null, buf: Buffer, caption: string): Promise<boolean> {
  try {
    const { emitProactive } = await import('../notifications/mobile-push.js');
    const { v2: cloudinary } = await import('cloudinary');
    cloudinary.config({
      cloud_name: env.CLOUDINARY_CLOUD_NAME,
      api_key: env.CLOUDINARY_API_KEY,
      api_secret: env.CLOUDINARY_API_SECRET,
    });
    const videoUrl: string = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { resource_type: 'video', folder: 'dzaryx-marketing' },
        (err, result) => {
          if (err || !result) reject(err ?? new Error('upload failed'));
          else resolve(result.secure_url);
        },
      );
      stream.end(buf);
    });
    const title = caption.replace(/[*_`[\]()]/g, '').slice(0, 80);
    emitProactive(title || 'Vidéo marketing prête', 'info', `${caption.replace(/[*_]/g, '')}\n📹 ${videoUrl}`);
    return true;
  } catch (err) {
    console.error('[tgVideo] cloudinary upload failed:', err instanceof Error ? err.message : err);
    return false;
  }
}

async function tgPhotoBuffer(_chatId: string | number | null, buf: Buffer, caption: string): Promise<boolean> {
  try {
    const { emitProactive } = await import('../notifications/mobile-push.js');
    const { v2: cloudinary } = await import('cloudinary');
    cloudinary.config({
      cloud_name: env.CLOUDINARY_CLOUD_NAME,
      api_key: env.CLOUDINARY_API_KEY,
      api_secret: env.CLOUDINARY_API_SECRET,
    });
    const imageUrl: string = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { resource_type: 'image', folder: 'dzaryx-marketing' },
        (err, result) => {
          if (err || !result) reject(err ?? new Error('upload failed'));
          else resolve(result.secure_url);
        },
      );
      stream.end(buf);
    });
    const title = caption.replace(/[*_`[\]()]/g, '').slice(0, 80);
    emitProactive(title || 'Photo marketing', 'info', `${caption.replace(/[*_]/g, '')}\n${imageUrl}`);
    return true;
  } catch (err) {
    console.error('[tgPhotoBuffer] cloudinary upload failed:', err instanceof Error ? err.message : err);
    return false;
  }
}

async function tgVoice(_chatId: string | number | null, buf: Buffer): Promise<void> {
  try {
    const { emitProactive } = await import('../notifications/mobile-push.js');
    const { v2: cloudinary } = await import('cloudinary');
    cloudinary.config({
      cloud_name: env.CLOUDINARY_CLOUD_NAME,
      api_key: env.CLOUDINARY_API_KEY,
      api_secret: env.CLOUDINARY_API_SECRET,
    });
    const audioUrl: string = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { resource_type: 'video', folder: 'dzaryx-marketing', format: 'mp3' },
        (err, result) => {
          if (err || !result) reject(err ?? new Error('upload failed'));
          else resolve(result.secure_url);
        },
      );
      stream.end(buf);
    });
    emitProactive('Voix générée', 'info', `🎙️ Voix off disponible\n🔗 ${audioUrl}`);
  } catch (err) {
    console.error('[tgVoice] upload failed:', err instanceof Error ? err.message : err);
  }
}

// ── Failure detection — covers catch-block errors AND business soft-failures ──
// Patterns anchored at START (safe — no valid result begins with these)
const FAIL_START_PATTERNS: RegExp[] = [
  /^Erreur\b/i,       // "Erreur outil X:", "Erreur mémoire:", "Erreur recall:", "Erreur:"
  /^Error\b/i,        // English catch-block
  /^Outil inconnu:/,  // unknown tool name
  /^Impossible\b/i,   // "Impossible de faire..."
  /^[Éé]chec\b/,      // "Échec de..."
  /^Failed\b/i,       // English explicit failure
];
// Phrases anywhere — slightly higher false-positive risk, kept narrow
const FAIL_PHRASE_PATTERNS: RegExp[] = [
  /\bintrouvable\b/i,  // "Réservation introuvable", "Client introuvable"
  /\bnot\s+found\b/i,  // English not-found
];

function isToolFailureResult(result: string, toolName: string): boolean {
  if (result.startsWith(`Outil inconnu: ${toolName}`)) return true;
  if (FAIL_START_PATTERNS.some(p => p.test(result)))   return true;
  if (FAIL_PHRASE_PATTERNS.some(p => p.test(result)))   return true;
  return false;
}

// ── Public entry point — wraps _dispatch with timing + action recording ──────
export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  sessionId?: string,
): Promise<string> {
  const t0     = Date.now();
  const sid    = sessionId ?? 'unknown';
  const result = await _dispatch(name, input, sessionId);
  const ms     = Date.now() - t0;

  const isError = isToolFailureResult(result, name);

  // Fire-and-forget — never block the tool response
  recordToolExecution({
    sessionId: sid,
    toolName:  name,
    args:      input,
    result,
    success:   !isError,
    latencyMs: ms,
    error:     isError ? result.slice(0, 200) : undefined,
  }).catch(err => console.error('[action-engine] recordToolExecution failed:', err instanceof Error ? err.message : err));

  return result;
}

const NEXUS_TOOLS = new Set(['ping_nexus', 'send_nexus_command', 'nexus_screenshot', 'wake_nexus', 'restart_nexus', 'nexus_full_status']);
const PC_TOOLS    = new Set(['pc_run_command', 'pc_open_file', 'pc_screenshot', 'pc_list_files', 'pc_read_file']);

async function _dispatch(
  name: string,
  input: Record<string, unknown>,
  sessionId?: string,
): Promise<string> {
  // Nexus / PC — Kouider uniquement
  const isHouariSession = /houari/i.test(sessionId ?? '');
  if (isHouariSession && (NEXUS_TOOLS.has(name) || PC_TOOLS.has(name))) {
    return '❌ Nexus PC disponible uniquement pour Kouider.';
  }

  try {
    switch (name) {
      case 'list_bookings':         return await listBookings(input);
      case 'update_booking':        return await updateBooking(input);
      case 'create_booking':        return await createBooking(input, sessionId);
      case 'cancel_booking':        return await cancelBooking(input);
      case 'delete_booking':        return await deleteBooking(input);
      case 'get_financial_report':  return await financialReport(input);
      case 'store_document':        return await storeDocument(input);
      case 'get_client_document':   return await getClientDocument(input);
      case 'read_site_file':        return await readSiteFile(input);
      case 'update_site_file':      return await updateSiteFile(input);
      case 'learn_rule':            return await learnRuleTool(input);
      case 'remember_info':         return await rememberInfo(input, sessionId);
      case 'recall_memory':         return await recallMemory(input, sessionId);
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
      // ─── VERCEL (autolux-location) ───
      case 'vercel_get_deployments':     return await vercelGetDeploymentsTool(input);
      case 'vercel_get_deployment_logs': return await vercelGetDeploymentLogsTool(input);
      case 'vercel_check_url':           return await vercelCheckUrlTool(input);
      case 'vercel_redeploy':            return await vercelRedeployTool(input);
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
      case 'get_client_profile':         return await getClientProfileTool(input['client_name'] as string);
      case 'get_client_brain':           return await getClientBrainTool(input['name_or_phone'] as string, sessionId);
      case 'add_client_note':            return await addClientNoteTool(input['name_or_phone'] as string, input['note'] as string, sessionId);
      case 'set_arrival_pattern':        return await setArrivalPatternTool(input, sessionId);
      case 'track_habit':                return await trackHabitTool(input);
      // ─── GitHub search ───
      case 'github_search_code':         return await githubSearchCode(input);
      // ─── Telegram depuis app vocale ───
      case 'send_telegram_message':      return await sendTelegramMessage(input);
      // ─── Web / Internet ───
      case 'web_search':                 return await webSearch(input);
      case 'fetch_url':                  return await fetchUrl(input);
      // ─── Rappels ───
      case 'schedule_reminder':          return await scheduleReminder(input, sessionId);
      // ─── PHASE 15 — Recherche images ───
      case 'search_images':              return await searchImages(input);
      // ─── GOOGLE CALENDAR ───
      case 'create_calendar_event':      return await createCalendarEventTool(input);
      case 'sync_calendar':             return await syncCalendarTool();
      case 'list_calendar_events':      return await listCalendarEventsTool(input);
      case 'create_personal_event':     return await createPersonalEventTool(input);
      case 'list_personal_events':      return await listPersonalEventsTool(input);
      case 'delete_personal_event':     return await deletePersonalEventTool(input);
      case 'delete_calendar_event':     return await deleteCalendarEventTool(input);
      case 'update_calendar_event':     return await updateCalendarEventTool(input);
      // ─── OBSIDIAN BRAIN ───
      case 'obsidian_find_vault':      return await obsidianFindVaultTool();
      case 'obsidian_read_client':     return await obsidianReadClientTool(input);
      case 'obsidian_update_client':   return await obsidianUpdateClientTool(input);
      case 'obsidian_list_clients':    return await obsidianListClientsTool();
      case 'obsidian_write_note':      return await obsidianWriteNoteTool(input);
      case 'obsidian_read_note':       return await obsidianReadNoteTool(input);
      // ─── NEXUS PC AGENT ───
      case 'ping_nexus':               return await pingNexusTool();
      case 'send_nexus_command':       return await sendNexusCommandTool(input);
      case 'nexus_screenshot':         return await nexusScreenshotTool(input);
      case 'wake_nexus':               return await wakeNexusTool();
      case 'restart_nexus':            return await restartNexusTool();
      case 'nexus_full_status':        return await nexusFullStatusTool();
      // ─── INSPECTION VÉHICULE ───
      case 'save_vehicle_state_before': return await saveVehicleStateBefore(input, undefined, 'image/jpeg', sessionId);
      case 'save_vehicle_state_after':  return await saveVehicleStateAfter(input, undefined, 'image/jpeg', sessionId);
      case 'get_vehicle_states':        return await getVehicleStatesTool(input, sessionId);
      case 'save_property_state_before': return await savePropertyStateBefore(input, undefined, 'image/jpeg', sessionId);
      case 'save_property_state_after':  return await savePropertyStateAfter(input, undefined, 'image/jpeg', sessionId);
      case 'get_property_states':        return await getPropertyStatesTool(input, sessionId);
      // ─── HEALTH CHECK ───
      case 'health_check_all':         return await healthCheckAllTool();
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
      case 'run_tiktok_research':        return await runTikTokResearchTool(sessionId, input);
      case 'generate_tiktok_video':      return await createMarketingVideoTool(input, sessionId);
      case 'create_marketing_video':     return await createMarketingVideoTool(input, sessionId);
      case 'edit_marketing_video':       return await editMarketingVideoTool(input, sessionId);
      case 'regenerate_voice':           return await regenerateVoiceTool(input, sessionId);
      case 'create_scenario_video':      return await createScenarioVideoTool(input, sessionId);
      case 'create_video_project':       return await createVideoProjectTool(input, sessionId);
      case 'merge_videos':               return await mergeVideosTool(input, sessionId);
      // ─── VEILLE CONCURRENTIELLE ───
      case 'analyze_competitors':        return await analyzeCompetitors(input, sessionId ?? '');
      case 'watch_my_tiktok':            return await watchMyTiktok(input);
      // ─── PHASE 5: MULTI-PLATFORM ───
      case 'publish_to_socials':         return await publishToSocialsTool(input, sessionId ?? '');
      // ─── CODE AGENT AUTONOME ───
      case 'execute_code_task':          return await executeCodeTaskTool(input, sessionId);
      case 'create_new_project':         return await createNewProjectTool(input, sessionId);
      // ─── GÉNÉRATION IA (Replicate + fal.ai) ───
      case 'generate_image':             return await generateImageTool(input, sessionId);
      case 'generate_ai_video':          return await generateAiVideoTool(input, sessionId);
      case 'animate_car_photo':          return await animateCarPhotoTool(input, sessionId);
      case 'get_car_photo':              return await getCarPhotoTool(input);
      // ─── IMMOBILIER & VENTE — synchro site ───
      case 'create_property':            return await createPropertyTool(input, sessionId);
      case 'add_vehicle_for_sale':       return await addVehicleForSaleTool(input, sessionId);
      case 'update_property':            return await updatePropertyTool(input);
      case 'update_vehicle_details':     return await updateVehicleDetailsTool(input);
      case 'set_site_hero':              return await setSiteHeroTool(input);
      case 'record_lead':                return await recordLeadTool(input);
      case 'list_leads':                 return await listLeadsTool(input);
      case 'update_lead_status':         return await updateLeadStatusTool(input);
      case 'match_lead':                 return await matchLeadTool(input);
      case 'get_daily_report':           return await getDailyReportTool();
      case 'list_properties':            return await listPropertiesTool(input);
      case 'get_property_photo':         return await getPropertyPhotoTool(input);
      case 'update_property_status':     return await updatePropertyStatusTool(input);
      case 'list_vehicles_for_sale':     return await listVehiclesForSaleTool(input);
      case 'get_vehicle_sale_photo':     return await getVehicleSalePhotoTool(input);
      case 'mark_vehicle_sold':          return await markVehicleSoldTool(input);
      // ─── PACKS (combos voiture + immo + jet ski) — synchro site ───
      case 'list_packs':                 return await listPacksTool(input);
      case 'create_pack':                return await createPackTool(input, sessionId);
      case 'set_pack_status':            return await setPackStatusTool(input);
      case 'record_client_deal':         return await recordClientDealTool(input);
      case 'get_client_history':         return await getClientHistoryTool(input);
      // ─── IMAGE-TO-IMAGE avec conservation visage ───
      case 'transform_image':            return await executeImageToImage(input, sessionId);
      case 'get_my_location':            return await getMyLocationTool(sessionId);
      case 'get_travel_time':            return await getTravelTimeTool(input, sessionId);
      case 'calculate_delivery_fee':     return await calculateDeliveryFeeTool(input);
      case 'export_accounting':          return await exportAccountingPDF(input);
      case 'update_car':                 return await updateCarTool(input);
      case 'add_car':                    return await addCarTool(input, sessionId);
      case 'delete_car':                 return await deleteCarTool(input);
      // ─── ANALYTICS SITE ───
      case 'get_site_analytics':         return await getSiteAnalyticsTool(input);
      // ─── AVIS CLIENTS ───
      case 'list_reviews':               return await listReviewsTool(input);
      case 'approve_review':             return await approveReviewTool(input);
      case 'delete_review':              return await deleteReviewTool(input);
      // ─── RÈGLES APPRISES (Phase 8) ───
      case 'save_learned_rule':          return await saveLearnedRuleTool(input, sessionId);
      case 'list_learned_rules':         return await listLearnedRulesTool(input, sessionId);
      // ─── CONTRAT PDF (Phase 8.2) ───
      case 'generate_contract':          return await generateContractTool(input, sessionId);
      // ─── EXPORT EXCEL (Phase 8.5) ───
      case 'export_excel':               return await exportExcelTool(input, sessionId);
      // ─── SMART PRICING ───
      case 'suggest_smart_pricing':          return await suggestSmartPricingTool(input, sessionId);
      // ─── MAINTENANCE VÉHICULE ───
      case 'update_vehicle_maintenance':     return await updateVehicleMaintenanceTool(input);
      case 'get_vehicle_maintenance':        return await getVehicleMaintenanceTool(input);
      // ─── PHASE EXTRAS (dégât / signature / pricing) ───
      case 'estimate_damage':                return await estimateDamageTool(input, sessionId);
      case 'create_signature_link':          return await createSignatureLinkTool(input);
      case 'apply_dynamic_pricing':          return await applyDynamicPricingTool(input);
      // ─── ALARME TÉLÉPHONE ───
      case 'set_phone_alarm': {
        const hour   = Number(input['hour']   ?? 0);
        const minute = Number(input['minute'] ?? 0);
        const label  = String(input['label']  ?? 'Dzaryx');
        return JSON.stringify({ __native_action: 'set_alarm', hour, minute, label });
      }
      default:                           return `Outil inconnu: ${name}`;
    }
  } catch (err) {
    return `Erreur outil ${name}: ${err instanceof Error ? err.message : String(err)}`;
  }
}

async function listBookings(input: Record<string, unknown>): Promise<string> {
  let query = supabase
    .from('bookings')
    .select('id, client_name, client_phone, start_date, end_date, final_price, currency, status, payment_status, paid_amount, rented_by, cars(name)')
    .order('start_date', { ascending: false })
    .limit(Number(input['limit'] ?? 20));

  if (input['status'])      query = query.eq('status', input['status'] as string);
  if (input['client_name']) query = query.ilike('client_name', `%${input['client_name']}%`);
  // Filtre par acteur (ex: "réservations de Houari") — rented_by stocké 'Houari'/'Kouider'
  if (input['rented_by'])   query = query.ilike('rented_by', `%${input['rented_by']}%`);

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
    const curr = b.currency ?? 'EUR';
    const priceStr = curr === 'DZD' ? `${b.final_price} DZD` : `${b.final_price}€`;
    const paidStr  = curr === 'DZD' ? `${b.paid_amount ?? 0} DZD` : `${b.paid_amount ?? 0}€`;
    const payInfo = b.payment_status
      ? ` | 💰 ${b.payment_status} (payé: ${paidStr})`
      : '';
    const who = b.rented_by ? ` | 👤 ${b.rented_by}` : '';
    return `- [${b.id}] ${b.client_name} | ${b.cars?.name ?? '?'} | ${b.start_date} → ${b.end_date} | ${priceStr} | ${b.status}${who}${payInfo}`;
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
  if (input['payment_status']) {
    // Automotolux values: UNPAID | PARTIAL | PAID (uppercase)
    const psMap: Record<string, string> = { pending: 'UNPAID', unpaid: 'UNPAID', partial: 'PARTIAL', paid: 'PAID', PENDING: 'UNPAID', UNPAID: 'UNPAID', PARTIAL: 'PARTIAL', PAID: 'PAID' };
    fields['payment_status'] = psMap[input['payment_status'] as string] ?? (input['payment_status'] as string).toUpperCase();
  }
  if (input['paid_amount'] !== undefined) fields['paid_amount'] = Number(input['paid_amount']);
  if (input['currency'])     fields['currency']     = input['currency'];
  if (input['rented_by'])    fields['rented_by']    = input['rented_by'];
  if (input['client_passport']) fields['client_passport'] = input['client_passport'];
  if (input['passport_expiry']) fields['passport_expiry'] = input['passport_expiry'];
  if (input['notes'])        fields['notes']        = input['notes'];

  // Si on met à jour l'acompte sans préciser le statut, le déduire auto.
  if (input['paid_amount'] !== undefined && !input['payment_status']) {
    const { data: cur } = await supabase.from('bookings').select('final_price').eq('id', id).single();
    const fp = cur ? Number((cur as any).final_price) || 0 : 0;
    const pa = Number(input['paid_amount']);
    fields['payment_status'] = pa <= 0 ? 'UNPAID' : (fp > 0 && pa >= fp ? 'PAID' : 'PARTIAL');
  }

  // Fetch car_id before update if we need to free the car
  let carIdToFree: string | null = null;
  if (input['status'] && ['COMPLETED', 'REJECTED'].includes(input['status'] as string)) {
    const { data: bk } = await supabase.from('bookings').select('car_id').eq('id', id).single();
    carIdToFree = bk ? (bk as any).car_id : null;
  }

  const { error } = await supabase.from('bookings').update(fields).eq('id', id);
  if (error) return `Erreur mise à jour: ${error.message}`;

  if (carIdToFree) {
    try { await supabase.from('cars').update({ available: true }).eq('id', carIdToFree); } catch { /* non-bloquant */ }
  }

  return `✅ Réservation ${id} mise à jour: ${JSON.stringify(fields)}`;
}

async function createBooking(input: Record<string, unknown>, sessionId?: string): Promise<string> {
  if (!input['client_name']) return '❌ client_name manquant';
  if (!input['start_date'])  return '❌ start_date manquant (format YYYY-MM-DD)';
  if (!input['end_date'])    return '❌ end_date manquant (format YYYY-MM-DD)';
  if (input['start_date'] > input['end_date']) return '❌ start_date doit être avant end_date';

  // Resolve car_id from car_name if UUID not provided
  let carId = input['car_id'] as string | undefined;
  if (!carId && input['car_name']) {
    const { data: carMatch } = await supabase
      .from('cars')
      .select('id, name')
      .ilike('name', `%${input['car_name']}%`)
      .limit(1)
      .single();
    if (!carMatch) return `❌ Voiture "${input['car_name']}" introuvable dans la flotte. Vérifie le nom exact.`;
    carId = (carMatch as any).id as string;
  }
  if (!carId) return '❌ car_id ou car_name manquant — spécifie la voiture';

  const VALID_STATUSES = ['CONFIRMED', 'PENDING', 'ACTIVE', 'COMPLETED', 'REJECTED'];
  const status = (input['status'] as string) ?? 'CONFIRMED';
  if (!VALID_STATUSES.includes(status)) return `❌ status invalide: ${status}. Valeurs: ${VALID_STATUSES.join(', ')}`;

  // Anti-doublon: vérifie disponibilité avant insertion
  const isAvailable = await checkAvailability(
    carId,
    input['start_date'] as string,
    input['end_date'] as string,
  );
  if (!isAvailable) {
    return `❌ Voiture déjà réservée du ${input['start_date']} au ${input['end_date']}. Vérifie avec check_car_availability.`;
  }

  // ── Vendredi: avertissement livraison/retour ──────────────────────────────
  const startDay = new Date(input['start_date'] as string).getDay(); // 0=dim, 5=ven
  const endDay   = new Date(input['end_date']   as string).getDay();
  const fridayWarning = (startDay === 5 || endDay === 5)
    ? '\n⚠️ VENDREDI: La date de départ ou retour tombe un vendredi (Jumua). Confirme avec le client — livraisons/retours déconseillés ce jour-là.'
    : '';

  // ── Ramadan: détection automatique + note tarifs ──────────────────────────
  function isInRamadan(d: string): boolean {
    const periods: Record<number, [string, string]> = {
      2025: ['2025-03-01', '2025-03-30'],
      2026: ['2026-02-18', '2026-03-19'],
      2027: ['2027-02-07', '2027-03-08'],
      2028: ['2028-01-27', '2028-02-25'],
    };
    const y = new Date(d).getFullYear();
    const p = periods[y];
    return !!p && d >= p[0] && d <= p[1];
  }
  const ramadanNote = (isInRamadan(input['start_date'] as string) || isInRamadan(input['end_date'] as string))
    ? '\n📅 RAMADAN: Dates en période de Ramadan — tarifs spéciaux Ramadan peuvent s\'appliquer. Vérifie si une remise Ramadan a été accordée au client.'
    : '';

  // Calcul nb_days = JOURS INCLUS (départ + retour comptent). 24/07→08/08 = 16j.
  const nb_days = Math.max(1, Math.round(
    (new Date(input['end_date'] as string).getTime() - new Date(input['start_date'] as string).getTime()) / 86_400_000,
  ) + 1);

  // Vérification prix Houari — refuse si prix client < coût Houari
  try {
    const { data: carRow } = await supabase.from('cars').select('name').eq('id', carId).single();
    const carNameForCheck = (carRow as any)?.name as string | undefined;
    if (carNameForCheck) {
      const { data: pricingRow } = await supabase.from('pricing').select('houari_price').ilike('vehicle_name', `%${carNameForCheck}%`).limit(1).single();
      const houariDay = pricingRow ? Number((pricingRow as any).houari_price) : null;
      if (houariDay !== null) {
        const minTotal = houariDay * nb_days;
        const clientTotal = Number(input['final_price']);
        if (clientTotal < minTotal) {
          return `⚠️ Prix insuffisant ! ${carNameForCheck} coûte ${houariDay}€/j à Houari → minimum ${minTotal}€ pour ${nb_days} jours. Tu as saisi ${clientTotal}€. Modifie le prix avant de créer.`;
        }
      }
    }
  } catch { /* si pricing indispo, on continue sans bloquer */ }

  const client_ppd = input['client_price_per_day'] != null ? Number(input['client_price_per_day']) : null;
  const owner_ppd  = input['owner_price_per_day']  != null ? Number(input['owner_price_per_day'])  : null;

  // Acompte + statut paiement : on RESPECTE l'acompte donné (était ignoré avant → bug).
  // Le statut se déduit de paid_amount vs final_price si non fourni explicitement.
  const paidAmount  = input['paid_amount'] != null ? Number(input['paid_amount']) : 0;
  const finalPrice  = Number(input['final_price']) || 0;
  const psMap: Record<string, string> = { pending: 'UNPAID', unpaid: 'UNPAID', partial: 'PARTIAL', paid: 'PAID' };
  const payment_status = input['payment_status']
    ? (psMap[String(input['payment_status']).toLowerCase()] ?? 'UNPAID')
    : (paidAmount <= 0 ? 'UNPAID' : (finalPrice > 0 && paidAmount >= finalPrice ? 'PAID' : 'PARTIAL'));

  // Automotolux payment_status values: 'UNPAID' | 'PARTIAL' | 'PAID' (DEFAULT 'UNPAID')
  // nb_days, notes NOT in automotolux schema → excluded
  // client_age: column exists, make nullable via: ALTER TABLE bookings ALTER COLUMN client_age DROP NOT NULL
  // Acteur robuste : input explicite > cache session > déduit du sessionId (houari/kouider).
  // Normalisé en 'Houari'/'Kouider' (la casse compte pour profit_kouider + filtres).
  const actorRaw = (input['rented_by'] as string)
    ?? (sessionId ? await redis.get(`session:actor:${sessionId}`).catch(() => null) : null)
    ?? (sessionId && /houari/i.test(sessionId) ? 'houari' : 'kouider');
  const rentedBy = /houari/i.test(String(actorRaw)) ? 'Houari' : 'Kouider';
  const currency = (input['currency'] as string) ?? (rentedBy === 'Houari' ? 'DZD' : 'EUR');

  const insertPayload: Record<string, unknown> = {
    car_id:               carId,
    client_name:          input['client_name'],
    client_phone:         input['client_phone']      ?? null,
    client_age:           input['client_age']         != null ? Number(input['client_age']) : null,
    start_date:           input['start_date'],
    end_date:             input['end_date'],
    final_price:          input['final_price'],
    payment_status,
    paid_amount:          paidAmount,
    rented_by:            rentedBy,
    currency,
    status,
    client_price_per_day: client_ppd,
    owner_price_per_day:  owner_ppd,
    owner_total:          owner_ppd != null ? Math.round(owner_ppd * nb_days * 100) / 100 : null,
    profit_kouider:       (client_ppd != null && owner_ppd != null && rentedBy !== 'Houari')
                            ? Math.round((client_ppd - owner_ppd) * nb_days * 100) / 100
                            : null,
    discount_applied:     input['discount_applied']  != null ? Number(input['discount_applied']) : 0,
    client_passport:      input['client_passport'] ?? null,
    passport_expiry:      input['passport_expiry']  ?? null,
  };

  const { data, error } = await supabase
    .from('bookings')
    .insert(insertPayload)
    .select()
    .single();

  if (error) {
    console.error('[create_booking] Supabase INSERT error:', JSON.stringify({ code: error.code, message: error.message, details: error.details, hint: error.hint }));
    return `Erreur création: ${error.message}`;
  }

  // Auto-mark car unavailable when booking is active/confirmed
  if (!['REJECTED', 'COMPLETED'].includes(status)) {
    try { await supabase.from('cars').update({ available: false }).eq('id', carId); } catch { /* non-bloquant */ }
  }

  const booking = data as any;
  let calendarNote = '';
  try {
    const { data: car } = await supabase.from('cars').select('name').eq('id', carId).single();
    const carName = (car as any)?.name ?? 'Véhicule';
    const eventId = await createCalendarEvent(booking.id, input['client_name'] as string, carName, input['start_date'] as string, input['end_date'] as string, input['notes'] as string | undefined);
    calendarNote = eventId ? ' | 📅 Ajouté Google Agenda' : ' | ⚠️ Google Agenda non synchro';

    // Auto-update client intelligence (non-bloquant)
    import('../orchestrator/client-intelligence.js').then(({ updateClientIntelFromBooking }) => {
      updateClientIntelFromBooking({
        client_name:          input['client_name'] as string,
        client_phone:         input['client_phone'] as string | undefined,
        car_name:             carName,
        start_date:           input['start_date'] as string,
        end_date:             input['end_date'] as string,
        nb_days,
        client_price_per_day: client_ppd,
        final_price:          Number(input['final_price']) || null,
        discount_applied:     input['discount_applied'] != null ? Number(input['discount_applied']) : 0,
        status,
        payment_status,
        paid_amount:          paidAmount,
      }).catch(() => {});
    }).catch(() => {});

    // Auto-notify via app with formatted voucher text (direct, no file upload needed)
    setTimeout(() => {
      const refNo = `BK-${new Date().getFullYear()}-${String(booking.id).slice(-6).toUpperCase()}`;
      const s = new Date(input['start_date'] as string).toLocaleDateString('fr-FR');
      const e = new Date(input['end_date']   as string).toLocaleDateString('fr-FR');
      const chatText = [
        `📄 BON DE RÉSERVATION`,
        `━━━━━━━━━━━━━━━━━━━━`,
        `👤 ${input['client_name'] as string}`,
        `🚗 ${carName}`,
        `📅 Du ${s} au ${e} (${nb_days}j)`,
        `💶 Total: ${input['final_price'] as string}€`,
        `🔢 Réf: ${refNo}`,
        `━━━━━━━━━━━━━━━━━━━━`,
        `📍 FIK Conciergerie Oran`,
      ].join('\n');
      import('../notifications/mobile-push.js').then(({ emitProactive }) => {
        emitProactive(`Bon de réservation — ${input['client_name'] as string}`, 'info', chatText);
        emitProactive(
          `Nouvelle réservation — ${input['client_name'] as string} — ${carName} (${input['start_date'] as string} → ${input['end_date'] as string})`,
          'info',
          `🚗 Nouvelle réservation confirmée\n👤 ${input['client_name'] as string}\n🚗 ${carName}\n📅 ${input['start_date'] as string} → ${input['end_date'] as string}\n💶 ${input['final_price'] as string}€`,
          'houari',
        );
        console.log('[create_booking] Auto-voucher envoyé dans app');
      }).catch(() => {});
    }, 2000);
  } catch { calendarNote = ' | ⚠️ Google Agenda non synchro'; }

  // Alert si owner_ppd manquant → notifier via app
  if (owner_ppd === null) {
    const alertMsg = `⚠️ Réservation sans prix propriétaire\n👤 ${input['client_name'] as string}\n🚗 ${carId}\n📅 ${input['start_date'] as string} → ${input['end_date'] as string}\n💶 Total client: ${input['final_price'] as string}€\nDis le prix propriétaire pour calculer le profit.`;
    import('../notifications/mobile-push.js').then(({ emitProactive }) => {
      emitProactive('Réservation sans prix propriétaire', 'alert', alertMsg);
    }).catch(() => {});
  }

  return `✅ Réservation créée! ID: ${booking.id} | ${input['client_name']} | ${input['start_date']} → ${input['end_date']} | ${input['final_price']}€${calendarNote}${owner_ppd === null ? ' | ⚠️ Prix proprio manquant' : ''}${fridayWarning}${ramadanNote}`;
}

async function cancelBooking(input: Record<string, unknown>): Promise<string> {
  const id = input['id'] as string;
  const { data: bk } = await supabase.from('bookings').select('car_id').eq('id', id).single();
  const { error } = await supabase.from('bookings').update({ status: 'REJECTED' }).eq('id', id);
  if (error) return `Erreur annulation: ${error.message}`;
  if (bk && (bk as any).car_id) {
    try { await supabase.from('cars').update({ available: true }).eq('id', (bk as any).car_id); } catch { /* non-bloquant */ }
  }
  return `✅ Réservation ${id} annulée (REJECTED)`;
}

async function deleteBooking(input: Record<string, unknown>): Promise<string> {
  const id = input['id'] as string;
  const { data: booking } = await supabase.from('bookings').select('status').eq('id', id).single();
  if (!booking) return `❌ Réservation ${id} introuvable`;
  if (['ACTIVE', 'CONFIRMED'].includes(booking.status as string)) {
    return `❌ Impossible de supprimer une réservation ${booking.status}. Annule-la d'abord avec cancel_booking.`;
  }

  // Delete Google Calendar event if linked
  let calendarNote = '';
  try {
    const { data: calEvent } = await supabase
      .from('calendar_events')
      .select('google_event_id')
      .eq('booking_id', id)
      .single();
    if (calEvent?.google_event_id) {
      await deleteCalendarEvent(calEvent.google_event_id as string);
      calendarNote = ' | 📅 Agenda supprimé';
    }
  } catch { calendarNote = ' | ⚠️ Agenda non supprimé'; }

  const { error } = await supabase.from('bookings').delete().eq('id', id);
  if (error) return `Erreur suppression: ${error.message}`;
  return `✅ Réservation ${id} supprimée définitivement${calendarNote}`;
}

async function financialReport(input: Record<string, unknown>): Promise<string> {
  const year  = Number(input['year']  ?? new Date().getFullYear());
  const month = input['month'] ? Number(input['month']) : undefined;
  const report = await getFinancialReport(year, month);
  return formatFinancialReport(report);
}

const OCR_DOC_TYPES = /passeport|passport|permis|license|licence|cin|carte.identit/i;
const IMAGE_EXTS    = /\.(jpg|jpeg|png|webp|bmp)(\?|$)/i;

async function ocrDocumentBuffer(buffer: Buffer, docType: string, hint?: string): Promise<Record<string, string> | null> {
  try {
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

    const base64    = buffer.toString('base64');
    const mediaType: 'image/jpeg' | 'image/png' = hint?.includes('.png') ? 'image/png' : 'image/jpeg';

    const isPermis = /permis|license|licence/i.test(docType);
    const fields   = isPermis
      ? 'nom, prénom, numéro_permis, date_naissance, date_expiration, catégories, pays_délivrance'
      : 'nom, prénom, numéro_document, date_naissance, date_expiration, nationalité, sexe, pays_délivrance';

    const { content } = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 400,
      messages: [{
        role:    'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
          { type: 'text',  text: `Extrais ces champs du document: ${fields}. JSON strict uniquement, sans markdown. Si un champ illisible, mets null.` },
        ],
      }],
    });

    const text = (content[0] as { type: string; text: string }).text ?? '';
    const json = text.match(/\{[\s\S]*?\}/)?.[0];
    return json ? JSON.parse(json) as Record<string, string> : null;
  } catch {
    return null;
  }
}

async function ocrDocumentImage(fileUrl: string, docType: string): Promise<Record<string, string> | null> {
  try {
    const imgRes = await axios.get<ArrayBuffer>(fileUrl, { responseType: 'arraybuffer', timeout: 20_000 });
    return ocrDocumentBuffer(Buffer.from(imgRes.data), docType, fileUrl);
  } catch {
    return null;
  }
}

// Parse une date FR/ISO tolérante (DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD) → Date|null
function parseLooseDate(s?: string | null): Date | null {
  if (!s) return null;
  const t = String(s).trim();
  let m = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);          // YYYY-MM-DD
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  m = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);            // DD/MM/YYYY
  if (m) { const y = +m[3] < 100 ? 2000 + +m[3] : +m[3]; return new Date(y, +m[2] - 1, +m[1]); }
  const d = new Date(t);
  return isNaN(d.getTime()) ? null : d;
}
function yearsSince(d: Date | null): number | null {
  if (!d) return null;
  const now = new Date();
  let a = now.getFullYear() - d.getFullYear();
  if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) a--;
  return a;
}

const MIN_AGE = 35;  // assurance Fik Conciergerie

/**
 * Scan d'une pièce (passeport/permis) → extraction + âge + contrôle assurance + validité.
 * Renvoie un résumé lisible prêt à afficher, et met les infos en cache session pour la résa.
 */
export async function scanIdentity(
  buffer: Buffer, mimeHint: string, isPermis: boolean, sessionId?: string,
  opts: { clientName?: string; clientPhone?: string } = {},
): Promise<string> {
  const docType = isPermis ? 'permis' : 'passeport';
  const data = await ocrDocumentBuffer(buffer, docType, mimeHint.includes('png') ? '.png' : '.jpg');
  if (!data) return '❌ Lecture du document impossible — reprends la photo bien nette, à plat, sans reflet.';

  const nom    = [data['prénom'] ?? data['prenom'], data['nom']].filter(Boolean).join(' ').trim() || (data['nom'] ?? 'Inconnu');
  const age    = yearsSince(parseLooseDate(data['date_naissance']));
  const expD   = parseLooseDate(data['date_expiration']);
  const expired = expD ? expD.getTime() < Date.now() : null;
  const permisNo = data['numéro_permis'] ?? data['numero_permis'] ?? data['numéro_document'] ?? data['numero_document'] ?? null;

  // Cache pour pré-remplir la résa ensuite
  if (sessionId) {
    redis.set(`session:scanned_client:${sessionId}`, JSON.stringify({ nom, age, permisNo, expiration: data['date_expiration'] ?? null, isPermis }), 'EX', 3600).catch(() => {});
  }

  // Persiste le document dans le DOSSIER CLIENT (image + données extraites), sous le nom scanné.
  // Upload et insert SÉPARÉS : si l'upload échoue, on enregistre quand même la fiche
  // (données OCR + nom) pour que la récup la retrouve, photo ajoutée si dispo.
  let savedToFile = false;
  let fileUrl: string | null = null;
  try {
    const ext  = mimeHint.includes('png') ? 'png' : 'jpg';
    const path = `ids/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    await supabase.storage.createBucket('client-documents', { public: true }).catch(() => {});
    const { error: upErr } = await supabase.storage.from('client-documents').upload(path, buffer, { contentType: mimeHint || 'image/jpeg', upsert: false });
    if (upErr) console.warn('[scanIdentity] upload photo échoué:', upErr.message);
    else fileUrl = supabase.storage.from('client-documents').getPublicUrl(path).data?.publicUrl ?? null;
  } catch (e) {
    console.warn('[scanIdentity] upload photo exception:', e);
  }
  // Si scan lancé depuis une fiche client précise, on stocke sous SON nom + téléphone
  // (sinon la fiche /api/clients/:phone ne retrouve pas le doc, qui n'a pas de phone).
  const docClientName = opts.clientName?.trim() || nom;
  try {
    const { error } = await supabase.from('client_documents').insert({
      // type en ANGLAIS ('passport'/'license') pour rester cohérent avec le reste + la récup.
      client_name: docClientName, client_phone: opts.clientPhone ?? null,
      type: isPermis ? 'license' : 'passport', file_url: fileUrl, extracted_data: data,
    });
    if (error) console.warn('[scanIdentity] insert client_documents échoué:', error.message);
    else savedToFile = true;
  } catch (e) {
    console.warn('[scanIdentity] insert client_documents exception:', e);
  }

  // Lie le passeport à la RÉSERVATION du client (n° + expiration) — best-effort.
  // Gère l'ordre prénom/nom inversé (ex: scan "MORALD BOUFRAINE" vs résa "Boufraine Morald").
  let linkedToBooking = false;
  if (!isPermis && permisNo) {
    try {
      const expIso = expD ? `${expD.getFullYear()}-${String(expD.getMonth() + 1).padStart(2, '0')}-${String(expD.getDate()).padStart(2, '0')}` : null;
      // Priorité : téléphone exact > nom du client de la fiche > nom OCR (mots ≥3).
      let q = supabase.from('bookings').select('id, client_name, start_date');
      if (opts.clientPhone) {
        q = q.eq('client_phone', opts.clientPhone);
      } else {
        const words = String(opts.clientName?.trim() || nom).split(/\s+/).filter(w => w.length >= 3);
        if (!words.length) throw new Error('no name words');
        q = q.or(words.map(w => `client_name.ilike.*${w}*`).join(','));
      }
      const { data: matches } = await q.order('start_date', { ascending: false }).limit(1);
      {
        const bkId = (matches as { id: string }[] | null)?.[0]?.id;
        if (bkId) {
          const { error: upErr } = await supabase
            .from('bookings')
            .update({ client_passport: permisNo, passport_expiry: expIso })
            .eq('id', bkId);
          if (!upErr) linkedToBooking = true;
        }
      }
    } catch (e) {
      console.warn('[scanIdentity] lien résa échoué:', e);
    }
  }

  const ageLine = age == null ? '• Âge: illisible ⚠️ (vérifie manuellement le minimum 35 ans)'
    : age >= MIN_AGE ? `• Âge: ${age} ans ✅ (assurance OK, min ${MIN_AGE})`
    : `• Âge: ${age} ans ⛔ REFUS — sous le minimum assurance (${MIN_AGE} ans). NE PAS louer.`;
  const expLine = expired == null ? '' : expired
    ? `\n• ${isPermis ? 'Permis' : 'Document'} EXPIRÉ (${data['date_expiration']}) ⛔`
    : `\n• Valide jusqu'au ${data['date_expiration']} ✅`;

  return [
    `📋 ${isPermis ? 'Permis de conduire' : 'Pièce d\'identité'} scanné — **${nom}**`,
    ageLine + expLine,
    permisNo ? `• N° ${isPermis ? 'permis' : 'document'}: ${permisNo}` : '',
    data['nationalité'] || data['nationalite'] ? `• Nationalité: ${data['nationalité'] ?? data['nationalite']}` : '',
    savedToFile ? `📁 Enregistré dans le dossier de ${nom} (DOCS).` : '',
    linkedToBooking ? `🔗 Passeport rattaché à la réservation de ${nom}.` : '',
    ``,
    age != null && age < MIN_AGE
      ? `⛔ Client trop jeune pour l'assurance — je ne crée pas de réservation.`
      : linkedToBooking
        ? `✅ Passeport enregistré sur la réservation existante de ${nom}. Rien d'autre à faire.`
        : `✅ Données prêtes. Donne-moi la **voiture** et les **dates** et je crée la réservation pour ${nom}.`,
  ].filter(Boolean).join('\n');
}

async function storeDocument(input: Record<string, unknown>): Promise<string> {
  const fileUrl = input['file_url'] as string | undefined;
  const docType = input['type']     as string ?? '';

  let extractedData: Record<string, unknown> | null =
    input['extracted_data']
      ? (() => { try { return JSON.parse(input['extracted_data'] as string); } catch { return null; } })()
      : null;

  // Auto-OCR: passeport/permis image sans données déjà extraites
  if (fileUrl && !extractedData && OCR_DOC_TYPES.test(docType) && IMAGE_EXTS.test(fileUrl)) {
    extractedData = await ocrDocumentImage(fileUrl, docType);
  }

  const { data, error } = await supabase
    .from('client_documents')
    .insert({
      client_phone:   input['client_phone']   ?? null,
      client_name:    input['client_name'],
      booking_id:     input['booking_id']     ?? null,
      type:           docType,
      file_url:       fileUrl                 ?? null,
      notes:          input['notes']          ?? null,
      extracted_data: extractedData,
    })
    .select()
    .single();

  if (error) return `Erreur stockage document: ${error.message}`;
  const doc = data as any;

  if (doc.extracted_data) {
    const d = doc.extracted_data as Record<string, string>;
    const lines = Object.entries(d)
      .filter(([, v]) => v && v !== 'null')
      .map(([k, v]) => `• ${k}: ${v}`)
      .join('\n');
    return `✅ Document ${docType} stocké pour ${input['client_name']}. ID: ${doc.id}\n📋 Données extraites:\n${lines}`;
  }

  return `✅ Document ${docType} stocké pour ${input['client_name']}. ID: ${doc.id}`;
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

const CATEGORY_TO_DOMAIN: Record<string, MemoryDomain> = {
  identity:   'identity',
  business:   'business',
  health:     'health',
  family:     'family',
  goal:       'goal',
  habit:      'habit',
  preference: 'preference',
  note:       'note',
  fact:       'note',
};

function inferUserId(sessionId?: string): string {
  if (!sessionId) return 'kouider';
  if (sessionId.toLowerCase().includes('houari')) return 'houari';
  return 'kouider';
}

async function rememberInfo(input: Record<string, unknown>, sessionId?: string): Promise<string> {
  const category = (input['category'] as string | undefined) ?? 'fact';
  const content  = input['content'] as string;
  const userId   = inferUserId(sessionId);
  const domain: MemoryDomain = CATEGORY_TO_DOMAIN[category] ?? 'note';
  // Normalized SHA256 hash → same fact with punctuation/case variations = same key = UPDATE not INSERT
  const key = computeMemoryKey(content, domain);

  // Write to modern memory_facts first (actor-scoped)
  const modernResult = await writeMemory({ key, value: content, domain, source: 'remember_info', userId });

  // Always write legacy ibrahim_memory (don't break old recall flow)
  const { error: legacyError } = await supabase
    .from('ibrahim_memory')
    .insert({ category, content });

  if (modernResult.success && !legacyError) {
    return `✅ Mémorisé [${category}]: ${content}`;
  }

  if (modernResult.success && legacyError) {
    console.warn(`[rememberInfo] legacy write failed: ${legacyError.message}`);
    return `✅ Mémorisé [${category}]: ${content} (⚠️ index legacy non mis à jour)`;
  }

  if (!modernResult.success && !legacyError) {
    return `⚠️ Sauvegardé legacy uniquement [${category}]: ${content} — mémoire moderne échouée: ${modernResult.error}`;
  }

  // Both failed
  return `❌ Erreur mémoire [${category}]: moderne="${modernResult.error}" legacy="${legacyError!.message}"`;
}

async function recallMemory(input: Record<string, unknown>, sessionId?: string): Promise<string> {
  const userId = inferUserId(sessionId);
  // Search memory_facts (modern) first
  try {
    const { getMemoryFacts } = await import('../integrations/supabase.js');
    const facts = await getMemoryFacts({ is_current: true, limit: 50, user_id: userId });
    const searchQuery = (input['query'] as string | undefined)?.toLowerCase() ?? '';
    const catFilter   = input['category'] as string | undefined;
    const filtered = facts.filter(f => {
      const matchesCat = !catFilter || f.domain === catFilter;
      const matchesQ   = !searchQuery || `${f.key} ${f.value}`.toLowerCase().includes(searchQuery);
      return matchesCat && matchesQ;
    });
    if (filtered.length > 0) {
      return filtered.slice(0, 15).map(f => `[${f.domain}] ${f.key}: ${f.value}`).join('\n');
    }
  } catch { /* fallback below */ }

  // Legacy fallback
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

// ─── VERCEL TOOLS ─────────────────────────────────────────────────────────────

async function vercelGetDeploymentsTool(input: Record<string, unknown>): Promise<string> {
  const project = (input['project'] as string | undefined) ?? 'autolux-location';
  const deploys = await vercelGetDeployments(project);
  if (!deploys.length) {
    return `❌ Aucun déploiement trouvé pour "${project}". Vérifie VERCEL_TOKEN dans Railway ou le nom du projet.`;
  }
  const lines = deploys.map((d: any) => {
    const state   = d.state   ?? d.readyState ?? '?';
    const created = d.created ? new Date(d.created).toLocaleString('fr-FR') : '?';
    const url     = d.url     ? `https://${d.url}` : '?';
    const commit  = d.meta?.githubCommitSha?.slice(0, 7) ?? '?';
    return `${state === 'READY' ? '✅' : state === 'ERROR' ? '❌' : '⏳'} [${commit}] ${state} — ${created}\n   🔗 ${url}`;
  });
  return `📦 **Deployments Vercel — ${project}** (${deploys.length} derniers)\n\n${lines.join('\n\n')}`;
}

async function vercelGetDeploymentLogsTool(input: Record<string, unknown>): Promise<string> {
  const deploymentId = input['deployment_id'] as string | undefined;
  if (!deploymentId) return '❌ deployment_id requis (obtiens-le via vercel_get_deployments)';
  return vercelGetDeploymentLogs(deploymentId);
}

async function vercelCheckUrlTool(input: Record<string, unknown>): Promise<string> {
  const url = (input['url'] as string | undefined) ?? 'https://autolux-location.vercel.app';
  const result = await vercelCheckUrl(url);
  if (result.ok) return `✅ ${url} → HTTP ${result.status} (OK)`;
  if (result.status === 0) return `❌ ${url} → inaccessible (timeout ou DNS)`;
  return `⚠️ ${url} → HTTP ${result.status} (${result.status === 404 ? 'page non trouvée' : result.status === 500 ? 'erreur serveur' : 'voir logs'})`;
}

async function vercelRedeployTool(input: Record<string, unknown>): Promise<string> {
  const deploymentId = input['deployment_id'] as string | undefined;
  if (!deploymentId) return '❌ deployment_id requis (obtiens-le via vercel_get_deployments)';
  return vercelRedeploy(deploymentId);
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
    .select('car_id, rented_by, client_name, start_date, end_date')
    .in('status', ['CONFIRMED', 'ACTIVE'])
    .lt('start_date', endDate)
    .gt('end_date', startDate);

  const { data: overlapping } = await overlappingQuery;
  type OverlapRow = { car_id: string; rented_by?: string; client_name?: string; start_date?: string; end_date?: string };
  const overlapRows = (overlapping ?? []) as OverlapRow[];
  const busyCarIds = new Set(overlapRows.map(b => b.car_id));

  let carsQuery = supabase.from('cars').select('id, name, base_price, category').eq('available', true);
  if (carId) carsQuery = carsQuery.eq('id', carId);

  const { data: cars, error } = await carsQuery;
  if (error) return `❌ Erreur: ${error.message}`;

  const startD = new Date(startDate);
  const endD   = new Date(endDate);
  const days   = Math.max(1, Math.round((endD.getTime() - startD.getTime()) / 86_400_000));

  const available = (cars ?? []).filter((c: { id: string }) => !busyCarIds.has(c.id));

  if (!available.length) {
    // Si une voiture précise est demandée → dire QUI l'a bloquée + pour quel client + dates
    if (carId) {
      const conflicts = overlapRows.filter(b => b.car_id === carId);
      if (conflicts.length) {
        const details = conflicts.map(c => {
          const who = c.rented_by ? `bloquée par ${c.rented_by}` : 'réservée';
          return `❌ ${who} pour le client ${c.client_name ?? '?'} du ${c.start_date} au ${c.end_date}`;
        }).join('\n');
        return `${details}\n→ Indisponible sur la période demandée (${startDate} → ${endDate}).`;
      }
      return `❌ La voiture demandée n'est pas disponible du ${startDate} au ${endDate}.`;
    }
    return `❌ Aucune voiture disponible du ${startDate} au ${endDate}.`;
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
  // Build REST API URL directly (bypass supabase JS type issues)
  const SUPA_URL = env['SUPABASE_URL' as keyof typeof env] as string;
  const SUPA_KEY = env['SUPABASE_SERVICE_KEY' as keyof typeof env] as string;

  const clientName = input['client_name'] as string | undefined;
  const clientPhone = input['client_phone'] as string | undefined;
  const docType = input['type'] as string | undefined;

  console.log(`[get_client_document] query: client_name=${clientName} phone=${clientPhone} type=${docType}`);

  // Build URL manually — URLSearchParams encodes * to %2A which breaks PostgREST ilike syntax
  const select = 'id,client_name,client_phone,type,file_url,storage_path,notes,extracted_data,created_at';
  const filters: string[] = [];
  if (clientName)  filters.push(`client_name=ilike.*${clientName}*`);
  if (clientPhone) filters.push(`client_phone=ilike.*${clientPhone}*`);
  if (docType)     filters.push(`type=eq.${docType}`);
  const filterStr = filters.length ? `&${filters.join('&')}` : '';
  const restUrl = `${SUPA_URL}/rest/v1/client_documents?select=${select}&order=created_at.desc&limit=5${filterStr}`;

  const { default: axiosModule } = await import('axios');

  type DocRow = { id: string; client_name: string; client_phone: string; type: string; file_url: string; storage_path: string; notes?: string; extracted_data?: Record<string, unknown>; created_at: string };
  let docs: DocRow[] = [];
  try {
    const { data } = await axiosModule.get<DocRow[]>(restUrl, {
      headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` },
      timeout: 10_000,
    });
    docs = data ?? [];
    console.log(`[get_client_document] found ${docs.length} row(s)`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[get_client_document] REST error:', msg);
    return `Erreur récupération document: ${msg}`;
  }

  if (docs.length === 0) {
    // Fallback : pas de document scanné, mais le n° passeport peut être stocké sur la RÉSA
    // (saisi au moment de la réservation). On le renvoie au moins en texte.
    if (clientName) {
      try {
        const { data: bk } = await axiosModule.get<{ client_name: string; client_passport: string | null; passport_expiry: string | null }[]>(
          `${SUPA_URL}/rest/v1/bookings?select=client_name,client_passport,passport_expiry&client_passport=not.is.null&client_name=ilike.*${clientName}*&limit=1`,
          { headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` }, timeout: 8_000 },
        );
        const row = bk?.[0];
        if (row?.client_passport) {
          const exp = row.passport_expiry ? ` (expire le ${row.passport_expiry})` : '';
          return `📋 Passeport de ${row.client_name} : ${row.client_passport}${exp}\n⚠️ Numéro enregistré sur la réservation — aucune photo/scan en base. Pour la photo, demande à Kouider de scanner la pièce.`;
        }
      } catch { /* on continue vers le diagnostic */ }
    }
    // Dump all names for diagnosis
    try {
      const { data: all } = await axiosModule.get<{client_name:string;type:string}[]>(
        `${SUPA_URL}/rest/v1/client_documents?select=client_name,type&limit=30`,
        { headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` }, timeout: 8_000 },
      );
      const total = all?.length ?? 0;
      if (!total) return 'TABLE VIDE — aucun document enregistré dans la base client_documents.';
      const names = (all ?? []).map(d => `${d.client_name} (${d.type})`).join(' | ');
      return `DIAGNOSTIC: "${clientName ?? '?'}" introuvable. ${total} doc(s) en base: ${names}`;
    } catch {
      return `Aucun document trouvé pour "${clientName ?? '?'}".`;
    }
  }

  const field = input['field'] as string | undefined;
  const doc = docs[0];

  if (field) {
    if (doc.extracted_data && field in doc.extracted_data) return `${field}: ${doc.extracted_data[field]}`;
    if (field === 'client_phone' || field === 'phone') return doc.client_phone ?? '❌ Téléphone non renseigné';
    if (field === 'file_url' || field === 'url') return doc.file_url ?? '❌ URL non disponible';
    return `❌ Champ "${field}" introuvable. Disponibles: ${doc.extracted_data ? Object.keys(doc.extracted_data).join(', ') : 'client_phone, file_url'}`;
  }

  // Auto-send to app via Supabase signed URL (fast, no download, works in browser without auth)
  const { emitProactive: emitDocProactive } = await import('../notifications/mobile-push.js');
  const sentUrls: string[] = [];
  const signedUrlMap = new Map<string, string>(); // doc_id → accessible URL (for tool result)
  for (const d of docs) {
    if (!d.storage_path && !d.file_url) continue;
    const caption = `📄 ${d.client_name} — ${d.type}`;

    try {
      // Generate a 1h signed URL via Supabase JS client — reliable, accessible in browser without auth
      let docUrl = '';
      if (d.storage_path) {
        try {
          const { data: signData, error: signErr } = await supabase.storage
            .from('client-documents')
            .createSignedUrl(d.storage_path, 3600);
          if (!signErr && signData?.signedUrl) docUrl = signData.signedUrl;
        } catch { /* fallback below */ }
      }
      // Fallback: use file_url as-is (public bucket or already signed)
      if (!docUrl) docUrl = d.file_url ?? '';

      if (docUrl) {
        signedUrlMap.set(d.id, docUrl);
        emitDocProactive(`Document — ${d.client_name}`, 'info', `${caption}\n${docUrl}`);
        sentUrls.push(d.storage_path ?? d.file_url ?? d.id);
      }

      // OCR backfill in background — doesn't block doc delivery
      if (!d.extracted_data && OCR_DOC_TYPES.test(d.type) && (d.storage_path || IMAGE_EXTS.test(d.file_url ?? ''))) {
        void (async () => {
          try {
            let buf: Buffer | null = null;
            if (d.storage_path) {
              const { data } = await axiosModule.get(`${SUPA_URL}/storage/v1/object/client-documents/${d.storage_path}`, {
                responseType: 'arraybuffer', headers: { Authorization: `Bearer ${SUPA_KEY}` }, timeout: 20_000,
              });
              buf = Buffer.from(data as ArrayBuffer);
            } else if (d.file_url) {
              const { data } = await axiosModule.get(d.file_url, { responseType: 'arraybuffer', timeout: 20_000 });
              buf = Buffer.from(data as ArrayBuffer);
            }
            if (!buf) return;
            const ocr = await ocrDocumentBuffer(buf, d.type, d.file_url ?? d.storage_path);
            if (ocr) {
              await axiosModule.patch(
                `${SUPA_URL}/rest/v1/client_documents?id=eq.${d.id}`,
                { extracted_data: ocr },
                { headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' } },
              ).catch(() => {});
              console.log(`[get_client_document] OCR backfill OK for doc ${d.id}`);
            }
          } catch { /* ignore background OCR failure */ }
        })();
      }
    } catch (err) {
      console.error('[get_client_document] send failed:', err instanceof Error ? err.message : err);
    }
  }

  const results = docs.map(d => {
    const extStr  = d.extracted_data ? `\nDonnées: ${JSON.stringify(d.extracted_data)}` : '';
    // Always use the signed URL in the tool result so Claude can echo 📹 url in its response
    const accessibleUrl = signedUrlMap.get(d.id) ?? d.file_url ?? '';
    const mediaLine = accessibleUrl ? `\n📹 ${accessibleUrl}` : '';
    return `📄 ${d.client_name} (${d.client_phone ?? '—'}) — ${d.type}\nDate: ${d.created_at.slice(0, 10)}${mediaLine}${extStr}${d.notes ? `\nNote: ${d.notes}` : ''}`;
  });

  const appStatus = sentUrls.length > 0 ? `\n✅ ${sentUrls.length} doc(s) envoyé(s) dans l'app` : '';
  return results.join('\n\n') + appStatus;
}

async function webSearch(input: Record<string, unknown>): Promise<string> {
  const query = input['query'] as string;
  if (!query) return 'Query requise';
  const result = await multiProviderWebSearch(query);
  // Return structured text + metadata so agents can cite the source
  const meta = `[source:${result.source} confidence:${result.confidence} results:${result.results_count} tried:${result.attempted_providers.join('>')}]`;
  return result.results_count > 0
    ? `${meta}\n\n${result.text}`
    : result.text; // NO_DATA message already included
}

async function fetchUrl(input: Record<string, unknown>): Promise<string> {
  const url = input['url'] as string;
  if (!url) return 'URL requise';
  try {
    const encoded = encodeURIComponent(url);
    const { data } = await axios.get(`https://r.jina.ai/${encoded}`, {
      headers: jinaAuthHeaders(),
      timeout: 20_000,
    });
    const text = typeof data === 'string' ? data : JSON.stringify(data);
    return text.slice(0, 6000) || 'Page vide ou inaccessible.';
  } catch (err) {
    return `Erreur fetch URL: ${err instanceof Error ? err.message : String(err)}`;
  }
}

// ─── RAPPELS PERSONNALISÉS ────────────────────────────────────────────────────

// Type interne pour le résultat structuré du rappel
interface ReminderResult {
  status:            'created' | 'duplicate_blocked' | 'db_failed' | 'TIMEZONE_UNKNOWN';
  idempotency_key?:  string;
  source_channel:    string;
  request_id:        string;
  job_id?:           string;
  db_id?:            string;
  // Timezone proof — MUST be cited in Claude's confirmation
  remind_at_utc?:    string;
  local_time?:       string;
  timezone_used?:    string;
  timezone_source?:  string;
  utc_offset?:       string;
  delay_ms?:         number;
  human_delay?:      string;
  message:           string;
  existing_job_id?:  string;
  existing_db_id?:   string;
  error?:            string;
}

async function scheduleReminder(
  input: Record<string, unknown>,
  sessionId?: string,
): Promise<string> {
  const message      = input['message']       as string | undefined;
  const delayMinutes = input['delay_minutes'] as number | undefined;
  const atTime       = input['at_time']       as string | undefined;
  const tzInput      = input['timezone']      as string | undefined;

  if (!message) return JSON.stringify({ error: '❌ message requis', source_channel: 'unknown', request_id: 'none', message: '' });

  const source_channel: string = sessionId?.startsWith('telegram_')
    ? 'telegram'
    : sessionId?.startsWith('voice_')
    ? 'mobile_voice'
    : sessionId?.startsWith('mobile_')
    ? 'mobile_text'
    : 'backend_internal';

  const request_id = `rem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  // ── 1. Timezone — priority chain ────────────────────────────────────
  // Priority: explicit → Redis session → Redis global → Europe/Brussels
  // NEVER hardcode Africa/Algiers
  const sessionTzKey = sessionId ? `user:tz:${sessionId}` : null;
  const [sessionTzRaw, globalTzRaw] = await Promise.all([
    sessionTzKey ? redis.get(sessionTzKey) : Promise.resolve(null),
    redis.get('user:tz'),
  ]);
  const sessionTz = (sessionTzRaw && isValidTimezone(sessionTzRaw)) ? sessionTzRaw : null;
  const globalTz  = (globalTzRaw  && isValidTimezone(globalTzRaw))  ? globalTzRaw  : null;

  const resolved = resolveTimezone(tzInput ?? null, sessionTz ?? globalTz ?? null);

  // Anti-hallucination: if explicit timezone given but invalid → reject
  if (tzInput && !resolved.valid) {
    const result: ReminderResult = {
      status:          'TIMEZONE_UNKNOWN',
      source_channel,
      request_id,
      message,
      error:           `❌ TIMEZONE_UNKNOWN: "${tzInput}" n'est pas un timezone IANA valide. Rappel NON programmé.`,
    };
    console.error(`[schedule_reminder] TIMEZONE_UNKNOWN tz="${tzInput}" req=${request_id}`);
    return JSON.stringify(result);
  }

  const timezone = resolved.timezone;

  // ── 2. Calculer remind_at (UTC) ──────────────────────────────────────
  let delayMs  = 0;
  let remindAt = new Date();

  if (delayMinutes !== undefined && Number(delayMinutes) > 0) {
    delayMs  = Number(delayMinutes) * 60 * 1000;
    remindAt = new Date(Date.now() + delayMs);
  } else if (atTime) {
    const parsed = parseLocalHHMM(atTime, timezone);
    if (!parsed) {
      return JSON.stringify({ error: '❌ at_time invalide — format HH:MM (ex: "14:30")', source_channel, request_id, message });
    }
    remindAt = parsed;
    delayMs  = remindAt.getTime() - Date.now();
  } else {
    return JSON.stringify({ error: '❌ Spécifie delay_minutes ou at_time', source_channel, request_id, message });
  }

  // ── 3. Timezone enrichment ───────────────────────────────────────────
  const utcOffset    = getUTCOffsetString(timezone, remindAt);
  const localTimeISO = toLocalISO(remindAt, timezone);

  // ── 4. Idempotency key ───────────────────────────────────────────────
  const userId      = sessionId ?? 'global';
  const targetBlock = Math.floor(remindAt.getTime() / (5 * 60 * 1000));
  const idemRaw     = `${userId}:${message.trim().toLowerCase()}:${targetBlock}`;
  const idempotency_key = crypto
    .createHash('sha256')
    .update(idemRaw)
    .digest('hex')
    .slice(0, 32);

  const redisKey     = `reminder:idem:${idempotency_key}`;
  const IDEM_TTL_SEC = 300;

  // ── 5. Dedup — Redis then DB ─────────────────────────────────────────
  const existingJobId = await redis.get(redisKey);
  if (existingJobId) {
    return JSON.stringify({
      status:          'duplicate_blocked',
      idempotency_key,
      source_channel,
      request_id,
      message,
      existing_job_id: existingJobId,
    } satisfies ReminderResult);
  }
  const dbExisting = await findByDedupKey(idempotency_key);
  if (dbExisting) {
    return JSON.stringify({
      status:          'duplicate_blocked',
      idempotency_key,
      source_channel,
      request_id,
      message,
      existing_job_id: dbExisting.job_id ?? 'db_only',
      existing_db_id:  dbExisting.id,
    } satisfies ReminderResult);
  }

  // ── 6. Persister en DB AVANT BullMQ — source de vérité ──────────────
  const dbRow = await insertReminder({
    message,
    remind_at:        remindAt,
    timezone,
    utc_offset:       utcOffset,
    local_time_iso:   localTimeISO,
    timezone_source:  resolved.source,
    created_by:       source_channel,
    session_id:       sessionId,
    dedup_key:        idempotency_key,
  });

  if (!dbRow) {
    console.error(`[schedule_reminder] DB INSERT FAILED req=${request_id} — NOT_SCHEDULED`);
    return JSON.stringify({
      status:      'db_failed',
      source_channel,
      request_id,
      message,
      error:       '❌ FAILED: DB insert échoué. Rappel NON programmé. Vérifie que la table reminders existe (migration SQL).',
    } satisfies ReminderResult);
  }

  // ── 7. Single delivery path: reminder-worker polls DB every 30s ─────
  // BullMQ custom-reminder no longer used — eliminates double-send race.
  // Worker picks up PENDING rows due within 90s window → single authoritative send.
  const jobId = `worker:${dbRow.id}`;

  await redis.set(redisKey, jobId, 'EX', IDEM_TTL_SEC);

  // ── 8. Human delay ───────────────────────────────────────────────────
  const mins = Math.round(delayMs / 60_000);
  const human_delay = mins >= 60
    ? `${Math.floor(mins / 60)}h${mins % 60 > 0 ? String(mins % 60).padStart(2, '0') : ''}`
    : `${mins}min`;

  const result: ReminderResult = {
    status:           'created',
    idempotency_key,
    source_channel,
    request_id,
    job_id:           jobId,
    db_id:            dbRow.id,
    // Timezone proof — Claude MUST include these in confirmation
    remind_at_utc:    remindAt.toISOString(),
    local_time:       localTimeISO,
    timezone_used:    timezone,
    timezone_source:  resolved.source,
    utc_offset:       utcOffset,
    delay_ms:         delayMs,
    human_delay,
    message,
  };

  console.log(
    `[schedule_reminder] CREATED req=${request_id} db_id=${dbRow.id} ` +
    `job_id=${jobId} tz=${timezone} source=${resolved.source} ` +
    `local=${localTimeISO} utc=${remindAt.toISOString()} offset=${utcOffset} delay=${human_delay}`,
  );

  return JSON.stringify(result);
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

async function deleteCalendarEventTool(input: Record<string, unknown>): Promise<string> {
  const googleEventId = input['google_event_id'] as string | undefined;
  if (!googleEventId) return '❌ google_event_id requis';
  const ok = await deleteCalendarEvent(googleEventId);
  if (!ok) return `❌ Impossible de supprimer l'événement ${googleEventId}`;
  return `✅ Événement ${googleEventId} supprimé de Google Agenda`;
}

// ── Personal calendar tools ───────────────────────────────────

async function createPersonalEventTool(input: Record<string, unknown>): Promise<string> {
  const title         = input['title']          as string | undefined;
  const startDatetime = input['start_datetime'] as string | undefined;
  const endDatetime   = input['end_datetime']   as string | undefined;
  const description   = input['description']   as string | undefined;
  const allDay        = input['all_day']        as boolean | undefined;

  if (!title || !startDatetime || !endDatetime)
    return '❌ title, start_datetime, end_datetime sont requis';

  const eventId = await createPersonalCalendarEvent(title, startDatetime, endDatetime, description, allDay);
  if (!eventId) return '❌ Impossible de créer l\'événement. Vérifie que l\'agenda kouiderpablo@gmail.com est partagé avec le service account et que PERSONAL_GCAL_ID est configuré dans Railway.';
  return `✅ Événement ajouté dans ton agenda perso !\n📅 ${title}\n🗓️ ${startDatetime} → ${endDatetime}${description ? `\n📝 ${description}` : ''}\n🔗 Event ID: ${eventId}`;
}

async function listPersonalEventsTool(input: Record<string, unknown>): Promise<string> {
  const maxResults = Number(input['max_results'] ?? 15);
  const events = await listPersonalEvents(maxResults);
  if (!events.length) return '📅 Aucun événement à venir dans ton agenda perso (kouiderpablo@gmail.com).';
  return `📅 ${events.length} événement(s) dans ton agenda perso:\n${events.map((e: any) => {
    const start = e.start?.dateTime?.slice(0, 16).replace('T', ' ') ?? e.start?.date ?? '?';
    return `- ${e.summary} | ${start}`;
  }).join('\n')}`;
}

async function deletePersonalEventTool(input: Record<string, unknown>): Promise<string> {
  const googleEventId = input['google_event_id'] as string | undefined;
  if (!googleEventId) return '❌ google_event_id requis — appelle list_personal_events pour obtenir l\'ID';
  await deletePersonalCalendarEvent(googleEventId);
  return `✅ Événement ${googleEventId} supprimé de ton agenda perso`;
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
  const message   = String(input['message'] ?? '');
  const photoUrl  = input['photo_url']    as string | undefined;
  const docUrl    = input['document_url'] as string | undefined;
  const caption   = String(input['caption'] ?? message);

  // Tout passe par l'app (Socket.IO + Expo Push) — plus Telegram
  const { emitProactive } = await import('../notifications/mobile-push.js');

  if (photoUrl) {
    emitProactive(caption.slice(0, 100), 'info', `📸 ${caption}\n🔗 ${photoUrl}`);
    if (message && message !== caption) emitProactive(message.slice(0, 100), 'info', message);
    return `✅ Photo envoyée dans l'app${message ? ` avec message: "${message}"` : ''}`;
  }
  if (docUrl) {
    emitProactive(caption.slice(0, 100), 'info', `📄 ${caption}\n🔗 ${docUrl}`);
    return `✅ Document envoyé dans l'app`;
  }
  if (message) {
    emitProactive(message.slice(0, 100), 'info', message);
    return `✅ Message envoyé dans l'app: "${message}"`;
  }
  return '❌ Rien à envoyer (message, photo_url ou document_url requis)';
}

async function generateVoucherTool(input: Record<string, unknown>, _sessionId?: string): Promise<string> {
  const bookingId = input['booking_id'] as string;
  if (!bookingId) return '❌ booking_id requis';

  const { data: bk } = await supabase.from('bookings').select('*, cars(name)').eq('id', bookingId).single();
  if (!bk) return '❌ Réservation introuvable';

  const clientName = String((bk as Record<string, unknown>)['client_name'] ?? '');
  const carName2   = ((bk as Record<string, unknown>)['cars'] as Record<string, unknown> | null)?.['name'] as string ?? '—';
  const start      = String((bk as Record<string, unknown>)['start_date'] ?? '');
  const end        = String((bk as Record<string, unknown>)['end_date']   ?? '');
  const total      = Number((bk as Record<string, unknown>)['final_price']  ?? 0);
  const paid       = Number((bk as Record<string, unknown>)['paid_amount']  ?? 0);
  const days2      = Math.max(1, Math.ceil((new Date(end).getTime() - new Date(start).getTime()) / 86_400_000));
  const startFmt   = new Date(start).toLocaleDateString('fr-FR');
  const endFmt     = new Date(end).toLocaleDateString('fr-FR');
  const refNo      = `BK-${new Date().getFullYear()}-${bookingId.slice(-6).toUpperCase()}`;
  const paiement   = paid > 0 ? `${total}€ | Acompte: ${paid}€ | Reste: ${total - paid}€` : `${total}€ à régler à la restitution`;

  const chatText = [
    `📄 BON DE RÉSERVATION — FIK CONCIERGERIE`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `👤 Client:   ${clientName}`,
    `🚗 Véhicule: ${carName2}`,
    `📅 Période:  ${startFmt} → ${endFmt} (${days2}j)`,
    `💶 Paiement: ${paiement}`,
    `🔢 Réf:      ${refNo}`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `📍 FIK Conciergerie Oran — AutoLux Location`,
  ].join('\n');

  // Generate PDF and serve directly from backend (Content-Type: application/pdf)
  let pdfUrl = '';
  try {
    const { buffer: pdfBuf } = await generateReservationVoucher(bookingId);
    const { storePdf } = await import('../utils/pdf-store.js');
    const token = storePdf(pdfBuf, `bon-${refNo}.pdf`);
    pdfUrl = `${env.BACKEND_URL}/api/pdf/${token}`;
  } catch (err) {
    console.error('[generateVoucherTool] PDF generation failed:', err instanceof Error ? err.message : err);
  }

  const { emitProactive } = await import('../notifications/mobile-push.js');
  const fullText = pdfUrl ? `${chatText}\n📹 ${pdfUrl}` : chatText;
  emitProactive(`Bon de réservation — ${clientName}`, 'info', fullText);

  return `✅ Bon de réservation envoyé dans l'app pour ${clientName} !${pdfUrl ? '\n📎 PDF dans le chat' : ''}\n\n${chatText}`;
}

// ── Phase 8 handlers ─────────────────────────────────────────────────────────

async function saveLearnedRuleTool(input: Record<string, unknown>, sessionId?: string): Promise<string> {
  const rule = (input['rule'] as string | undefined)?.trim();
  if (!rule) return '❌ rule requis';
  const ownerKey = sessionId?.toLowerCase().includes('houari') ? 'houari' : 'kouider';
  const result = await saveLearnedRule({
    ownerKey,
    category: (input['category'] as 'business' | 'client' | 'pricing' | 'communication' | 'operations' | 'reminder' | undefined) ?? 'business',
    rule,
    context:  input['context']  as string | undefined,
    priority: input['priority'] ? Number(input['priority']) : undefined,
  });
  if (!result.ok) return '❌ Erreur lors de la sauvegarde de la règle.';
  const op = result.operation === 'updated' ? 'mise à jour' : 'créée';
  return `✅ Règle ${op} en mémoire (${result.id?.slice(-6)}):\n"${rule}"`;
}

async function listLearnedRulesTool(input: Record<string, unknown>, sessionId?: string): Promise<string> {
  const ownerKey  = sessionId?.toLowerCase().includes('houari') ? 'houari' : 'kouider';
  const rules     = await getLearnedRules(ownerKey, 50);
  const category  = input['category'] as string | undefined;
  const filtered  = category ? rules.filter(r => r.category === category) : rules;
  if (!filtered.length) return 'ℹ️ Aucune règle apprise pour le moment.';
  return `📚 ${filtered.length} règle(s) apprise(s) pour ${ownerKey}:\n\n${formatRulesForContext(filtered)}`;
}

async function generateContractTool(input: Record<string, unknown>, _sessionId?: string): Promise<string> {
  const bookingId = input['booking_id'] as string | undefined;
  if (!bookingId) return '❌ booking_id requis';

  const { data: bk } = await supabase.from('bookings').select('*, cars(name)').eq('id', bookingId).single();
  if (!bk) return '❌ Réservation introuvable';

  const clientName   = String((bk as Record<string, unknown>)['client_name'] ?? '');
  const carName3     = ((bk as Record<string, unknown>)['cars'] as Record<string, unknown> | null)?.['name'] as string ?? '—';
  const start        = String((bk as Record<string, unknown>)['start_date'] ?? '');
  const end          = String((bk as Record<string, unknown>)['end_date']   ?? '');
  const total        = Number((bk as Record<string, unknown>)['final_price']  ?? 0);
  const paid         = Number((bk as Record<string, unknown>)['paid_amount']  ?? 0);
  const days3        = Math.max(1, Math.ceil((new Date(end).getTime() - new Date(start).getTime()) / 86_400_000));
  const startFmt     = new Date(start).toLocaleDateString('fr-FR');
  const endFmt       = new Date(end).toLocaleDateString('fr-FR');
  const contractNumber = `CTR-${new Date().getFullYear()}-${bookingId.slice(-6).toUpperCase()}`;
  const reste        = total - paid;

  const chatText = [
    `📝 CONTRAT DE LOCATION — FIK CONCIERGERIE`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `👤 Locataire:  ${clientName}`,
    `🚗 Véhicule:   ${carName3}`,
    `📅 Période:    ${startFmt} → ${endFmt} (${days3}j)`,
    `💶 Total:      ${total}€${paid > 0 ? ` | Acompte: ${paid}€ | Reste: ${reste}€` : ''}`,
    `🔢 Contrat:    ${contractNumber}`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `📋 Conditions: passeport conservé pendant location`,
    `📍 FIK Conciergerie Oran — AutoLux Location`,
  ].join('\n');

  // Generate PDF and serve directly from backend (Content-Type: application/pdf)
  let pdfUrl = '';
  try {
    const { buffer: pdfBuf } = await generateRentalContract(bookingId);
    const { storePdf } = await import('../utils/pdf-store.js');
    const token = storePdf(pdfBuf, `contrat-${contractNumber}.pdf`);
    pdfUrl = `${env.BACKEND_URL}/api/pdf/${token}`;
  } catch (err) {
    console.error('[generateContractTool] PDF generation failed:', err instanceof Error ? err.message : err);
  }

  const { emitProactive } = await import('../notifications/mobile-push.js');
  const fullText = pdfUrl ? `${chatText}\n📹 ${pdfUrl}` : chatText;
  emitProactive(`Contrat ${contractNumber} — ${clientName}`, 'info', fullText);

  return `✅ Contrat ${contractNumber} envoyé dans l'app pour ${clientName} !${pdfUrl ? '\n📎 PDF dans le chat' : ''}\n\n${chatText}`;
}

async function exportExcelTool(input: Record<string, unknown>, _sessionId?: string): Promise<string> {
  const year  = input['year']  ? Number(input['year'])  : undefined;
  const month = input['month'] ? Number(input['month']) : undefined;
  const buffer = await exportBookingsToExcel(year, month);

  const y     = year  ?? new Date().getFullYear();
  const label = month ? `${String(month).padStart(2, '0')}_${y}` : String(y);
  const filename = `Fik_Conciergerie_${label}.xlsx`;

  // Upload sur Cloudinary pour URL téléchargeable
  let downloadUrl = '';
  try {
    const { v2: cloudinary } = await import('cloudinary');
    const result = await new Promise<{ secure_url: string }>((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        { resource_type: 'raw', public_id: `excel/${filename}`, overwrite: true },
        (err, res) => err ? reject(err) : resolve(res as { secure_url: string }),
      );
      uploadStream.end(buffer);
    });
    downloadUrl = result.secure_url;
  } catch {
    // Pas de Cloudinary — retourner texte seul
  }

  // Notifier via app (Socket.IO + Expo Push)
  const { emitProactive } = await import('../notifications/mobile-push.js');
  const msg = downloadUrl
    ? `🛰 📊 Export Excel ${label} prêt\n🔗\n${downloadUrl}`
    : `📊 Export Excel ${label} généré (${Math.round(buffer.length / 1024)} KB)`;
  emitProactive(`Export Excel ${label} prêt`, 'info', msg);

  return `✅ Export Excel ${label} généré ! 📊${downloadUrl ? `\n🔗\n${downloadUrl}` : ''}`;
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

/**
 * Normalise le script personnalisé transmis via l'outil create_marketing_video :
 *  - Supprime les guillemets enveloppants si présents
 *  - Préserve les accents, apostrophes, emojis, ponctuation française
 *  - Tronque à 500 caractères max pour la synthèse ElevenLabs
 */
function sanitizeCustomScript(raw?: string): string | undefined {
  if (!raw) return undefined;
  return raw
    .trim()
    .replace(/^["'«»]/, '')
    .replace(/["'«»]$/, '')
    .trim()
    .slice(0, 500);
}

async function runTikTokResearchTool(sessionId?: string, input?: Record<string, unknown>): Promise<string> {
  const chatId      = chatIdFromSession(sessionId);
  const carFocus    = input?.['car_focus'] as string | undefined;
  const extraTags   = input?.['hashtags'] as string[] | undefined;

  const { data: carsRaw } = await supabase.from('cars').select('*').eq('available', true);
  const cars = (carsRaw ?? []) as Car[];

  if (cars.length === 0) {
    return '⚠️ Aucune voiture disponible pour la recherche marketing.';
  }

  const focusLabel = carFocus ? ` — focus: ${carFocus}` : '';
  await tgMsg(chatId, `🔍 *Dzaryx Marketing*\nRecherche TikTok lancée${focusLabel}... ⏳`);

  const report = await runTikTokMarketResearch(cars, carFocus, extraTags);

  const qualityBadge = report.data_quality === 'real'    ? '✅ DONNÉES RÉELLES'
                     : report.data_quality === 'partial'  ? '⚠️ DONNÉES PARTIELLES'
                     : '❌ PAS DE DONNÉES RÉELLES';

  const msg = [
    `📊 *RAPPORT MARKETING — ${report.week}*`,
    ``,
    `🔍 *Source:* ${qualityBadge}`,
    `_${report.data_source}_`,
    report.real_metrics ? [
      ``,
      `📈 *Métriques réelles:*`,
      `• Vidéos analysées: ${report.real_metrics.videos_analyzed}`,
      `• Engagement moyen: ${report.real_metrics.avg_engagement_pct !== null ? `${report.real_metrics.avg_engagement_pct}%` : 'N/A'}`,
      `• Top hashtag: #${report.real_metrics.top_hashtags[0]?.tag ?? '?'} (~${report.real_metrics.top_hashtags[0]?.avgViews.toLocaleString('fr-FR') ?? '?'} vues moy.)`,
    ].join('\n') : '',
    ``,
    report.trends.length
      ? `📈 *Tendances (données réelles):*\n${report.trends.map(t => `• ${t}`).join('\n')}`
      : `📈 *Tendances:* aucune donnée réelle disponible cette semaine`,
    ``,
    report.top_ideas.map((idea, i) => [
      `*[${i + 1}] ${idea.title}*${idea.data_basis === 'no_data' ? ' _(pas de données réelles)_' : ''}`,
      `🎬 ${idea.concept}`,
      `🎤 _${idea.voiceover_script}_`,
      `📱 ${idea.caption}`,
      `⏰ ${idea.best_time}`,
    ].join('\n')).join('\n\n'),
    ``,
    `💡 ${report.summary}`,
    ``,
    `💬 Dis "fais une vidéo pour [voiture]" pour créer une vidéo automatiquement !`,
  ].filter(Boolean).join('\n');

  await tgMsg(chatId, msg);
  return `✅ Rapport TikTok envoyé (qualité: ${report.data_quality}, ${report.top_ideas.length} idées, source: ${report.data_source.slice(0, 60)}).`;
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
  const customScript     = sanitizeCustomScript(input['custom_script'] as string | undefined);
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

  // Hoist motionPrompt so it's available for saveVideoSession outside the block
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
  let motionPrompt = backgroundEffect
    ? (bgMotion[backgroundEffect] ?? `${backgroundEffect} scenery, cinematic car reveal, smooth camera`)
    : `${car.name} cinematic reveal, smooth camera pan, golden hour, professional automotive photography`;

  if (runwayKey || falKey) {

    const providerLabel = runwayKey ? 'Runway Gen-4 Turbo' : 'Kling IA';
    await tgMsg(chatId,
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
      await tgMsg(chatId,
        `⚠️ _IA vidéo indisponible (\`${msg.slice(0, 120)}\`) — FFmpeg fallback..._`
      ).catch(() => {});
    }
  }

  // ── Tentative 2 : FFmpeg + ElevenLabs (local, fiable) ────────
  if (!videoBuffer) {
    await tgMsg(chatId,
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
      const deliveryNote = result.telegram_delivered ? "envoyée dans l'app ↑" : '⚠️ générée mais envoi app échoué';
      const prefix = result.telegram_delivered ? '✅' : '⚠️';
      return `${prefix} Vidéo ${result.method === 'ffmpeg' ? 'FFmpeg HD' : 'photo'} pour ${result.car_name} — ${deliveryNote} (ID: ${result.pending_id}).\nScript: "${result.script.slice(0, 80)}..."`;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[tool:create_marketing_video] FFmpeg failed:', msg);
      await tgMsg(chatId,
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

  // ── Save session for modifications ───────────────────────────
  saveVideoSession({
    carName:     car.name,
    carImageUrl: car.image_url,
    carId:       car.id,
    script,
    videoBuffer: videoBuffer ?? null,
    audioBuffer: audioBuffer ?? null,
    prompt:      motionPrompt,
    provider:    method,
    background:  backgroundEffect ?? '',
    scenario:    '',
    caption,
    hashtags,
    pendingId,
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
  let photoActuallySent = false;

  // Download car image buffer once for use in fallbacks
  let carImgBuf: Buffer | null = null;
  try {
    const imgResp = await axios.get(car.image_url, { responseType: 'arraybuffer', timeout: 20_000 });
    carImgBuf = Buffer.from(imgResp.data as ArrayBuffer);
  } catch {
    console.error('[tool:create_marketing_video] car image download failed');
  }

  if (videoBuffer) {
    try {
      await tgVideo(chatId, videoBuffer, approvalMsg);
      videoActuallySent = true;
    } catch (sendErr) {
      console.error('[tool:create_marketing_video] sendVideoBuffer failed:', sendErr instanceof Error ? sendErr.message : sendErr);
      if (carImgBuf) {
        try {
          await tgPhotoBuffer(chatId, carImgBuf, approvalMsg);
          photoActuallySent = true;
        } catch (photoErr) {
          console.error('[tool:create_marketing_video] photo fallback failed:', photoErr instanceof Error ? photoErr.message : photoErr);
        }
      }
    }
  } else {
    if (carImgBuf) {
      try {
        await tgPhotoBuffer(chatId, carImgBuf, approvalMsg);
        photoActuallySent = true;
      } catch (photoErr) {
        console.error('[tool:create_marketing_video] photo send failed:', photoErr instanceof Error ? photoErr.message : photoErr);
      }
    }
  }

  // Envoyer la voix séparément seulement si la vidéo n'a pas pu être générée
  if (!videoBuffer && audioBuffer) {
    await tgVoice(chatId, audioBuffer).catch(() => {});
  }

  let resultMsg: string;
  if (videoActuallySent) {
    resultMsg = `✅ Vidéo ${method} créée et envoyée ↑ (ID: ${pendingId}). En attente de ta validation.`;
  } else if (videoBuffer) {
    resultMsg = `⚠️ Vidéo générée mais envoi app échoué${photoActuallySent ? ' — photo envoyée ↑' : ''} (ID: ${pendingId}).`;
  } else if (photoActuallySent) {
    resultMsg = `❌ Vidéo IA non générée — photo envoyée à la place ↑ (ID: ${pendingId}). Demande "fais une vidéo FFmpeg" pour forcer FFmpeg.`;
  } else {
    resultMsg = `❌ Vidéo non créée et envoi app échoué. Kling IA et FFmpeg ont tous les deux échoué. Vérifie les logs Railway.`;
  }
  return resultMsg.substring(0, 3000);
}

async function editMarketingVideoTool(
  input: Record<string, unknown>,
  sessionId?: string,
): Promise<string> {
  const chatId    = chatIdFromSession(sessionId);
  const session   = getLatestVideoSession();
  const modification = (input['modification'] as string | undefined) ?? '';

  if (!session) {
    return '⚠️ Aucune vidéo en mémoire. Génère d\'abord une vidéo avec "fais une vidéo TikTok pour [voiture]".';
  }

  const runwayKey = env.RUNWAY_API_KEY;
  const falKey    = env.FAL_KEY;

  if (!runwayKey && !falKey) {
    return '❌ Aucun provider vidéo configuré (RUNWAY_API_KEY ou FAL_KEY requis).';
  }

  // Determine modification type
  const mod = modification.toLowerCase();
  const isVoiceOnly = /voix|voice|script|ton|tone|phrase|texte|parle/i.test(mod) && !/fond|background|scène|scene|caméra|camera|arrière/i.test(mod);
  const isVideoOnly = /fond|background|scène|scene|caméra|camera|arrière|décor|lumière|aéroport|corniche|plage/i.test(mod);

  await tgMsg(chatId,
    `✏️ *Modification vidéo — ${session.carName}*\n_"${modification.slice(0, 80)}"_\n⏳ En cours...`
  ).catch(() => {});

  // Re-generate voice if script/tone changed
  let audioBuffer = session.audioBuffer;
  if (!isVideoOnly) {
    const newScript = (input['new_script'] as string | undefined) ?? session.script;
    const tone      = (input['tone'] as string | undefined);
    const tonePrefix = tone === 'professionnel' ? 'Ton professionnel et sérieux. ' :
                       tone === 'dynamique'      ? 'Ton dynamique et énergique. ' :
                       tone === 'chaleureux'      ? 'Ton chaleureux et accueillant. ' :
                       tone === 'commercial'      ? 'Ton commercial percutant. ' : '';
    const scriptToUse = tonePrefix + newScript;
    audioBuffer = await synthesizeVoice(scriptToUse).catch(() => session.audioBuffer);
  }

  // Re-generate video if scene/background changed
  let videoBuffer = session.videoBuffer;
  let provider    = session.provider;
  if (!isVoiceOnly && session.carImageUrl) {
    try {
      const newScene = modification.length > 10 ? modification : session.prompt;
      const result   = await generateVehicleVideo({
        imageUrl:            session.carImageUrl,
        userPrompt:          newScene,
        carName:             session.carName,
        duration:            5,
        falKey,
        runwayKey,
        forceProvider:       'auto',
        sceneTransformation: true,
      });
      const resp   = await axios.get(result.url, { responseType: 'arraybuffer', timeout: 60_000 });
      const rawBuf = Buffer.from(resp.data as ArrayBuffer);
      if (isValidMp4Buffer(rawBuf)) {
        videoBuffer = rawBuf;
        provider    = result.provider;
      }
    } catch (err: any) {
      console.error('[edit_marketing_video] regen failed:', err.message);
    }
  }

  // Merge video + audio
  let finalVideo = videoBuffer;
  if (videoBuffer && audioBuffer) {
    try {
      const merged = await mergeVideoWithAudio(videoBuffer, audioBuffer);
      if (isValidMp4Buffer(merged)) finalVideo = merged;
    } catch { /* keep unmerged */ }
  }

  // Save new session
  saveVideoSession({
    ...session,
    videoBuffer:  finalVideo,
    audioBuffer,
    script:       (input['new_script'] as string | undefined) ?? session.script,
    provider,
    prompt:       modification,
  });

  // Send to Telegram
  const approvalMsg = `✏️ *Vidéo modifiée — ${session.carName}*\n_${modification.slice(0, 100)}_\n\n✅ *Oke* pour publier | ❌ *Non* pour annuler`;

  if (finalVideo) {
    await tgVideo(chatId, finalVideo, approvalMsg).catch(async () => {
      await tgMsg(chatId, approvalMsg).catch(() => {});
    });
  } else {
    await tgMsg(chatId, approvalMsg).catch(() => {});
  }

  return `✅ Vidéo modifiée (${provider}) et envoyée ↑`;
}

async function regenerateVoiceTool(
  input: Record<string, unknown>,
  sessionId?: string,
): Promise<string> {
  const chatId  = chatIdFromSession(sessionId);
  const session = getLatestVideoSession();

  if (!session) {
    return '⚠️ Aucune vidéo en mémoire. Génère d\'abord une vidéo.';
  }

  const newScript = (input['script'] as string | undefined) ?? session.script;
  const tone      = (input['tone'] as string | undefined) ?? '';

  const tonePrefix = tone === 'professionnel' ? 'Ton professionnel et sérieux. ' :
                     tone === 'dynamique'      ? 'Ton dynamique et énergique. ' :
                     tone === 'chaleureux'      ? 'Ton chaleureux et accueillant. ' :
                     tone === 'commercial'      ? 'Ton commercial percutant. ' : '';

  await tgMsg(chatId, `🎙️ *Nouvelle voix en cours...*\n_Ton: ${tone || 'standard'}_`).catch(() => {});

  const audioBuffer = await synthesizeVoice(tonePrefix + newScript);
  if (!audioBuffer) return '❌ ElevenLabs indisponible — vérifie ELEVENLABS_API_KEY dans Railway.';

  // Merge with existing video if available
  let finalVideo = session.videoBuffer;
  if (session.videoBuffer && audioBuffer) {
    try {
      const merged = await mergeVideoWithAudio(session.videoBuffer, audioBuffer);
      if (isValidMp4Buffer(merged)) finalVideo = merged;
    } catch { /* keep old video */ }
  }

  // Update session
  saveVideoSession({ ...session, audioBuffer, videoBuffer: finalVideo, script: newScript });

  // Send
  if (finalVideo) {
    await tgVideo(chatId, finalVideo,
      `🎙️ *Voix modifiée — ${session.carName}*\n_Script: "${newScript.slice(0, 100)}_"\n\n✅ *Oke* pour publier | ❌ *Non* pour annuler`
    ).catch(async () => {
      await tgVoice(chatId, audioBuffer).catch(() => {});
    });
  } else {
    await tgVoice(chatId, audioBuffer).catch(() => {});
  }

  return `✅ Nouvelle voix générée et envoyée ↑`;
}

async function createScenarioVideoTool(
  input: Record<string, unknown>,
  sessionId?: string,
): Promise<string> {
  const chatId    = chatIdFromSession(sessionId);
  const scenario  = (input['scenario'] as string) ?? 'airport_arrival';
  const carName   = (input['car_name'] as string | undefined);
  const falKey    = env.FAL_KEY;
  const runwayKey = env.RUNWAY_API_KEY;

  if (!falKey && !runwayKey) {
    return '❌ Aucun provider vidéo configuré.';
  }

  // Lookup car
  const { data: carsRaw } = await supabase.from('cars').select('*').eq('available', true);
  const cars = (carsRaw ?? []) as Car[];
  const carsWithImage = cars.filter(c => c.image_url);
  const car = carName
    ? (carsWithImage.find(c => c.name.toLowerCase().includes(carName.toLowerCase())) ?? carsWithImage[0])
    : carsWithImage[0];

  if (!car) return '⚠️ Aucune voiture avec photo disponible dans la flotte.';

  const pricing      = getPricingForVehicle(car.name);
  const priceDisplay = pricing?.kouiderPrice ? `${pricing.kouiderPrice}€/j` : 'prix sur demande';

  // Build scenario details
  const scenarios: Record<string, { label: string; voiceScript: string; description: string; hashtags: string[] }> = {
    airport_arrival: {
      label:       'Arrivée aéroport Ahmed Ben Bella',
      voiceScript: `Vous arrivez à l'aéroport d'Oran ? Fik Conciergerie vous attend avec votre ${car.name}, propre et prête. Livraison directe à l'aéroport. Appelez-nous maintenant !`,
      description: `Scène à l'aéroport Ahmed Ben Bella d'Oran — client qui arrive avec valises, ${car.name} propre qui attend, remise de clés professionnelle. Service sérieux et rapide de Fik Conciergerie.`,
      hashtags:    ['#locationvoiture', '#oran', '#aeroportoran', '#fikconcierge', '#algerie', '#mre', '#tiktokalgerie', '#voiturelocation'],
    },
    client_search: {
      label:       'Client qui cherche une location',
      voiceScript: `Arrêtez de chercher ! Fik Conciergerie à Oran. ${car.name} disponible dès maintenant. Service rapide, prix transparent, livraison à l'aéroport. WhatsApp maintenant !`,
      description: `Client qui cherche une voiture, appelle plusieurs agences sans succès, puis découvre Fik Conciergerie sur WhatsApp et obtient une réponse immédiate. Transformation du problème en solution.`,
      hashtags:    ['#locationvoiture', '#oran', '#fikconcierge', '#algerie', '#mre', '#locationauto', '#tiktokalgerie'],
    },
    fleet_reveal: {
      label:       'Présentation flotte Fik Conciergerie',
      voiceScript: `La flotte Fik Conciergerie à Oran. ${car.name} et bien plus encore. Location de voitures premium, service personnalisé, livraison aéroport. Réservez dès maintenant !`,
      description: `Présentation soignée de la ${car.name} — révélation progressiste, détails du véhicule, intérieur et extérieur. Ambiance premium et professionnelle.`,
      hashtags:    ['#locationvoiture', '#oran', '#fikconcierge', '#algerie', '#flotte', '#premium', '#tiktokalgerie'],
    },
    corniche_drive: {
      label:       'Balade Corniche d\'Oran',
      voiceScript: `La ${car.name} sur la Corniche d'Oran. Location à ${priceDisplay}. Profitez de l'Algérie avec style. Fik Conciergerie — votre partenaire mobilité à Oran.`,
      description: `${car.name} sur la Corniche d'Oran, mer Méditerranée en arrière-plan, lumière dorée. Ambiance lifestyle et liberté, invite au voyage et à la découverte.`,
      hashtags:    ['#locationvoiture', '#oran', '#corniche', '#fikconcierge', '#algerie', '#lifestyle', '#tiktokalgerie'],
    },
  };

  const sc = scenarios[scenario] ?? scenarios['airport_arrival'];

  await tgMsg(chatId,
    `🎬 *Scénario : ${sc.label}*\n_${car.name} — ${priceDisplay}_\n⏳ Génération Runway/Kling en cours...`
  ).catch(() => {});

  // Send structured brief first
  const brief = [
    `📋 *Brief vidéo — ${sc.label}*`,
    ``,
    `🚗 Voiture : ${car.name} (${priceDisplay})`,
    `⏱️ Durée : 5-10 secondes`,
    `📱 Format : 9:16 TikTok`,
    ``,
    `🎬 Scène : ${sc.description}`,
    ``,
    `🎤 Voix off :`,
    `_${sc.voiceScript}_`,
    ``,
    `🏷️ Hashtags : ${sc.hashtags.join(' ')}`,
    ``,
    `📣 CTA : WhatsApp → Fik Conciergerie`,
  ].join('\n');
  await tgMsg(chatId, brief).catch(() => {});

  // Generate video
  let videoBuffer: Buffer | null = null;
  let provider = 'inconnu';
  try {
    await axios.head(car.image_url, { timeout: 8_000 });
    const result = await generateVehicleVideo({
      imageUrl:            car.image_url,
      userPrompt:          sc.description,
      carName:             car.name,
      duration:            5,
      falKey,
      runwayKey,
      forceProvider:       'auto',
      sceneTransformation: true,
      scenario,
    });
    const resp   = await axios.get(result.url, { responseType: 'arraybuffer', timeout: 60_000 });
    const rawBuf = Buffer.from(resp.data as ArrayBuffer);
    if (isValidMp4Buffer(rawBuf)) {
      videoBuffer = rawBuf;
      provider    = result.provider;
    }
  } catch (err: any) {
    console.error('[create_scenario_video] video gen failed:', err.message);
    await tgMsg(chatId, `⚠️ Vidéo IA indisponible, photo envoyée à la place.`).catch(() => {});
  }

  // Generate voice
  const audioBuffer = await synthesizeVoice(sc.voiceScript).catch(() => null);

  // Merge
  let finalVideo = videoBuffer;
  if (videoBuffer && audioBuffer) {
    try {
      const merged = await mergeVideoWithAudio(videoBuffer, audioBuffer);
      if (isValidMp4Buffer(merged)) finalVideo = merged;
    } catch { /* keep unmerged */ }
  }

  // Save session
  const pendingId = await savePendingVideo({
    video_url: car.image_url,
    caption:   `${car.name} — ${priceDisplay} | Fik Conciergerie Oran`,
    hashtags:  sc.hashtags,
    car_name:  car.name,
    car_id:    car.id,
    script:    sc.voiceScript,
  });

  saveVideoSession({
    carName:     car.name,
    carImageUrl: car.image_url,
    carId:       car.id,
    script:      sc.voiceScript,
    videoBuffer: finalVideo,
    audioBuffer,
    prompt:      sc.description,
    provider,
    background:  scenario,
    scenario,
    caption:     `${car.name} — ${priceDisplay} | Fik Conciergerie Oran`,
    hashtags:    sc.hashtags,
    pendingId,
  });

  const approvalMsg = [
    `🎬 *${sc.label}* (${provider})`,
    `🚗 ${car.name} — ${priceDisplay}`,
    ``,
    `✅ *Oke* pour publier sur TikTok | ❌ *Non* pour annuler`,
    `✏️ Dis "modifie la scène" ou "change la voix" pour ajuster`,
  ].join('\n');

  if (finalVideo) {
    await tgVideo(chatId, finalVideo, approvalMsg).catch(async () => {
      await tgPhoto(chatId, car.image_url, approvalMsg).catch(() => {});
    });
  } else if (car.image_url) {
    await tgPhoto(chatId, car.image_url, approvalMsg).catch(() => {});
    if (audioBuffer) await tgVoice(chatId, audioBuffer).catch(() => {});
  }

  return `✅ Scénario "${sc.label}" généré (${provider}) et envoyé ↑ (ID: ${pendingId})`;
}

// ── CRÉER UN PROJET VIDÉO MULTI-SCÈNES ───────────────────────────────────────
async function createVideoProjectTool(
  input: Record<string, unknown>,
  sessionId?: string,
): Promise<string> {
  const chatId    = chatIdFromSession(sessionId);
  const scenario  = (input['scenario']  as string) ?? 'client_search';
  const carName   = (input['car_name']  as string | undefined);
  const style     = (input['style']     as string | undefined) ?? 'tiktok';
  const falKey    = env.FAL_KEY;
  const runwayKey = env.RUNWAY_API_KEY;

  if (!falKey && !runwayKey) {
    return '❌ Aucun provider vidéo configuré (RUNWAY_API_KEY ou FAL_KEY requis dans Railway).';
  }

  // ── Find car ───────────────────────────────────────────────────────────────
  const { data: carsRaw } = await supabase.from('cars').select('*').eq('available', true);
  const cars           = (carsRaw ?? []) as Car[];
  const carsWithImage  = cars.filter(c => c.image_url);
  if (!carsWithImage.length) return '⚠️ Aucune voiture avec photo disponible dans la flotte.';

  const car = carName
    ? (carsWithImage.find(c => c.name.toLowerCase().includes(carName.toLowerCase())) ?? carsWithImage[0])
    : carsWithImage[0];

  const pricing      = getPricingForVehicle(car.name);
  const priceDisplay = pricing?.kouiderPrice ? `${pricing.kouiderPrice}€/j` : 'prix sur demande';

  // ── Build storyboard ───────────────────────────────────────────────────────
  const storyboards: Record<string, ReturnType<typeof buildClientSearchStoryboard>> = {
    client_search:    buildClientSearchStoryboard(car.name, priceDisplay),
    airport_arrival:  buildAirportArrivalStoryboard(car.name, priceDisplay),
    fleet_reveal:     buildFleetRevealStoryboard(car.name, priceDisplay),
    corniche_drive:   buildCornicheDriveStoryboard(car.name, priceDisplay),
  };
  const board = storyboards[scenario] ?? storyboards['client_search'];

  // ── Send brief ─────────────────────────────────────────────────────────────
  const totalDur  = board.scenes.reduce((s, sc) => s + sc.duration, 0);
  const sceneList = board.scenes.map((sc, i) =>
    `*${i + 1}. ${sc.label}* (${sc.duration}s) — ${sc.overlayText ?? sc.type}`
  ).join('\n');

  const brief = [
    `🎬 *Projet vidéo — ${board.title}*`,
    `🚗 ${car.name} — ${priceDisplay} | ⏱️ ${totalDur}s | 📱 9:16 TikTok`,
    ``,
    `📋 *Plan scène par scène :*`,
    sceneList,
    ``,
    `🎤 *Voix off :*`,
    `_${board.voiceScript.slice(0, 250)}_`,
    ``,
    `🏷️ ${board.hashtags.slice(0, 5).join(' ')}`,
    ``,
    `⏳ Génération en cours (car scenes = Runway/Kling, UI scenes = FFmpeg instantané)...`,
  ].join('\n');
  await tgMsg(chatId, brief).catch(() => {});

  // ── Save project ───────────────────────────────────────────────────────────
  const project = saveVideoProject({
    title:       board.title,
    scenario,
    carName:     car.name,
    carImageUrl: car.image_url,
    carId:       car.id,
    voiceScript: board.voiceScript,
    scenes:      board.scenes,
    hashtags:    board.hashtags,
    caption:     `${car.name} — ${priceDisplay} | Fik Conciergerie Oran`,
    style,
    pendingId:   '',
    finalBuffer: null,
    audioBuffer: null,
    provider:    'pending',
    version:     1,
  });

  // ── Generate all scenes ────────────────────────────────────────────────────
  const tmpDir   = await import('os').then(o => import('fs/promises').then(f =>
    f.mkdtemp(o.tmpdir() + '/dzaryx-proj-')
  ));
  const fontPath = await ensureSceneFont();
  const scenePaths: string[] = [];
  let   usedProvider = 'FFmpeg';

  try {
    for (let i = 0; i < board.scenes.length; i++) {
      const sc      = board.scenes[i];
      const outPath = `${tmpDir}/scene_${i}.mp4`;

      if (sc.type.startsWith('ui_')) {
        // FFmpeg synthetic — instant
        await tgMsg(chatId,
          `🖥️ _Scène ${i + 1}/${board.scenes.length} — ${sc.label} (FFmpeg)_`
        ).catch(() => {});
        await generateUISceneFile(sc, outPath, fontPath);
        scenePaths.push(outPath);

      } else {
        // Car scene — Runway/Kling
        await tgMsg(chatId,
          `🎬 _Scène ${i + 1}/${board.scenes.length} — ${sc.label} (Runway/Kling ~90s)_`
        ).catch(() => {});

        let carClipBuffer: Buffer | null = null;
        try {
          await axios.head(car.image_url, { timeout: 8_000 });
          const prompt = sc.prompt ?? `Cinematic automotive shot of a ${car.name}. ${sc.overlayText ?? 'Professional car advertisement'}. Real filmed footage quality. TikTok vertical format.`;
          const result = await generateVehicleVideo({
            imageUrl:          car.image_url,
            userPrompt:        prompt,
            carName:           car.name,
            duration:          Math.min(sc.duration, 5) as 5 | 10,
            falKey,
            runwayKey,
            forceProvider:     'auto',
            sceneTransformation: true,
          });
          const resp = await axios.get(result.url, { responseType: 'arraybuffer', timeout: 60_000 });
          const raw  = Buffer.from(resp.data as ArrayBuffer);
          if (isValidMp4Buffer(raw)) {
            carClipBuffer = raw;
            usedProvider  = result.provider;
          }
        } catch (err: any) {
          console.error(`[create_video_project] scene ${i + 1} AI failed:`, err.message);
        }

        // If AI failed, fallback: generate a static image clip
        if (!carClipBuffer) {
          await tgMsg(chatId,
            `⚠️ _Scène ${i + 1} IA indisponible — image statique utilisée_`
          ).catch(() => {});
          // Create a simple static scene from car image using FFmpeg
          try {
            const imgBuf = await axios.get(car.image_url, { responseType: 'arraybuffer', timeout: 20_000 })
              .then(r => Buffer.from(r.data as ArrayBuffer));
            const imgPath = `${tmpDir}/car_${i}.jpg`;
            await import('fs/promises').then(f => f.writeFile(imgPath, imgBuf));
            await runFFmpegForProject([
              '-y', '-loop', '1', '-i', imgPath,
              '-t', String(sc.duration),
              '-vf', `scale=${PROJ_W}:${PROJ_H}:force_original_aspect_ratio=increase,crop=${PROJ_W}:${PROJ_H},eq=saturation=1.5:contrast=1.1`,
              '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '26',
              '-pix_fmt', 'yuv420p', '-r', '25', '-movflags', '+faststart',
              outPath,
            ]);
            carClipBuffer = await import('fs/promises').then(f => f.readFile(outPath));
          } catch (fbErr: any) {
            console.error(`[create_video_project] static fallback failed:`, fbErr.message);
            // Skip this scene
            continue;
          }
        }

        // Add text overlay
        if (sc.overlayText && carClipBuffer) {
          const withOverlay = await addOverlayToClip(carClipBuffer, sc.overlayText, fontPath)
            .catch(() => carClipBuffer!);
          await import('fs/promises').then(f => f.writeFile(outPath, withOverlay));
        } else if (carClipBuffer) {
          await import('fs/promises').then(f => f.writeFile(outPath, carClipBuffer));
        }
        scenePaths.push(outPath);
      }
    }

    if (!scenePaths.length) {
      return '❌ Impossible de générer les scènes. Vérifie la connexion et les clés API.';
    }

    // ── Generate voice ─────────────────────────────────────────────────────
    await tgMsg(chatId, '🎙️ _Génération voix off ElevenLabs..._').catch(() => {});
    const audioBuffer = await synthesizeVoice(board.voiceScript).catch(() => null);

    // ── Assemble ──────────────────────────────────────────────────────────
    await tgMsg(chatId, '🎞️ _Assemblage final FFmpeg..._').catch(() => {});
    const finalBuffer = await concatScenesWithVoice(scenePaths, audioBuffer, tmpDir);

    // ── Save pending + session ────────────────────────────────────────────
    const pendingId = await savePendingVideo({
      video_url: car.image_url,
      caption:   project.caption,
      hashtags:  board.hashtags,
      car_name:  car.name,
      car_id:    car.id,
      script:    board.voiceScript,
    });

    updateVideoProject(project.id, { finalBuffer, audioBuffer, pendingId, provider: usedProvider });

    saveVideoSession({
      carName:     car.name,
      carImageUrl: car.image_url,
      carId:       car.id,
      script:      board.voiceScript,
      videoBuffer: finalBuffer,
      audioBuffer,
      prompt:      scenario,
      provider:    usedProvider,
      background:  scenario,
      scenario,
      caption:     project.caption,
      hashtags:    board.hashtags,
      pendingId,
    });

    // ── Send to Telegram ──────────────────────────────────────────────────
    const approvalMsg = [
      `🎬 *Projet vidéo — ${board.title}*`,
      `🚗 ${car.name} | ⏱️ ${totalDur}s | 📱 9:16 | ${usedProvider}`,
      ``,
      `✅ *Oke* pour publier sur TikTok | ❌ *Non* pour annuler`,
      `✏️ _"modifie la scène X", "change la voix", "refais le CTA"_`,
    ].join('\n');

    await tgVideo(chatId, finalBuffer, approvalMsg).catch(async () => {
      await tgPhoto(chatId, car.image_url, approvalMsg).catch(() => {});
    });

    return `✅ Projet vidéo "${board.title}" (${scenePaths.length} scènes, ${usedProvider}) envoyé dans l'app ↑ (ID: ${pendingId}).`;

  } finally {
    await import('fs/promises').then(f => f.rm(tmpDir, { recursive: true, force: true })).catch(() => {});
  }
}

function runFFmpegForProject(args: string[]): Promise<void> {
  // @ts-ignore
  const ffmpegPath = require('ffmpeg-static') as string | null;
  if (!ffmpegPath) throw new Error('ffmpeg-static not found');
  const { spawn } = require('child_process') as typeof import('child_process');
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, args, { stdio: 'pipe' });
    let stderr = '';
    proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });
    proc.on('close', (code: number | null) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exit ${code}: ${stderr.slice(-400)}`));
    });
    proc.on('error', reject);
  });
}

async function mergeVideosTool(
  _input: Record<string, unknown>,
  sessionId?: string,
): Promise<string> {
  const fileIds = getVideoBuffer(sessionId ?? '');

  if (fileIds.length < 2) {
    return `⚠️ Envoie au moins 2 vidéos avant de demander la fusion. Tu n'as envoyé que ${fileIds.length} vidéo(s) dans cette session.`;
  }

  return `⚠️ Fusion de vidéos non disponible dans cette version.`;
}

// ════════════════════════════════════════════════════════════════
// ── VEILLE CONCURRENTIELLE ────────────────────────────────────
// ════════════════════════════════════════════════════════════════

async function jSearch(query: string, maxChars = 1500): Promise<string> {
  const result = await multiProviderWebSearch(query);
  return result.text.slice(0, maxChars);
}

async function jFetch(url: string, maxChars = 2500): Promise<string> {
  try {
    const { data } = await axios.get(`https://r.jina.ai/${encodeURIComponent(url)}`, {
      headers: jinaAuthHeaders(),
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

  try {
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
  } catch {
    // Pas de crédits, quota dépassé, ou réseau → fallback web_search
    return [];
  }
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
  const competitor      = input['competitor'] as string | undefined;
  const extraHashtags   = input['hashtags'] as string[] | undefined;
  const carFocus        = input['car_focus'] as string | undefined;
  const makeVideo       = input['generate_counter_video'] as boolean | undefined;
  const chatId          = chatIdFromSession(sessionId);

  // ── Notification de démarrage ──────────────────────────────
  const focusLabel = competitor ? `_Cible: ${competitor}_` : carFocus ? `_Focus: ${carFocus}_` : '_Scan général: location voiture Oran_';
  await tgMsg(chatId,
    `🕵️ *Veille concurrentielle lancée*\n${focusLabel}\n⏳ 10 recherches en cours...`
  ).catch(() => {});

  // ── Hashtags contextuels ───────────────────────────────────
  const baseHashtags = ['locationoran', 'locationvoitureoran', 'voitureoran', 'locationvoiture', 'oranalgerie', 'locationaeroport', 'mre2025'];
  const carHashtags  = carFocus ? [`${carFocus.toLowerCase().replace(/\s+/g, '')}oran`, carFocus.toLowerCase().replace(/\s+/g, '')] : [];
  const TIKTOK_HASHTAGS = [...new Set([...baseHashtags, ...carHashtags, ...(extraHashtags ?? [])])];

  // ── Sources à scraper ──────────────────────────────────────
  const COMPETITOR_HANDLES = competitor
    ? [competitor.replace('@', '').trim()]
    : ['locationoranalgerie', 'orancar', 'autolocationoran'];

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

  // ── Multi-source web search (DDG + Bing + Google API) ─────
  if (!tiktokData || tiktokData === 'Aucun résultat TikTok trouvé.') {
    // Build contextual queries based on competitor/car focus
    const hashtagStr = TIKTOK_HASHTAGS.slice(0, 4).map(h => `#${h}`).join(' ');
    const webQueries = competitor
      ? [
          `${competitor} oran location voiture algerie 2025`,
          `tiktok ${competitor} location voiture oran`,
          `${competitor} facebook instagram oran location`,
          `location voiture oran algerie tarifs 2025 concurrents`,
          `agence location voiture oran algerie avis google maps`,
        ]
      : [
          'meilleures agences location voiture oran algerie avis 2025',
          `tiktok ${hashtagStr} location voiture oran algerie`,
          'location voiture oran facebook instagram promo tarifs 2025',
          'youtube location voiture oran algerie 2025',
          'location voiture oran algerie tarifs prix journalier 2025',
          'agence location voiture oran algerie avis google maps',
          'location voiture aeroport ahmed ben bella oran algerie prix',
          carFocus ? `tiktok #${carFocus.toLowerCase().replace(/\s+/g, '')} location voiture oran algerie` : 'location voiture oran mre été 2025 pas cher',
        ];

    const results = await Promise.all(webQueries.map(q => jSearch(q, 1500)));
    const validResults = results.filter(r => r && r.length > 80 && !r.includes('NO_DATA'));

    // Complément: fetch TikTok profil direct via Jina (souvent vide mais vaut le coup)
    const profileFetch = await jFetch(`https://www.tiktok.com/@${COMPETITOR_HANDLES[0]}`, 1200)
      .then(txt => txt.length > 100 ? `\n--- PROFIL @${COMPETITOR_HANDLES[0]} (TikTok) ---\n${txt}` : '');

    tiktokData = [
      `[SOURCES WEB — ${validResults.length}/${webQueries.length} avec données]`,
      ...webQueries.map((q, i) => `[${q}]\n${results[i]?.slice(0, 800) ?? 'no data'}`),
      profileFetch,
    ].filter(Boolean).join('\n\n---\n\n').slice(0, 10000);

    if (validResults.length === 0) {
      tiktokData = `⚠️ Données web limitées cette semaine — ${webQueries.length} requêtes, 0 résultat concret. TikTok et certaines agences locales ne sont pas indexés.`;
    }

    console.log(`[analyze-competitors] web_search: ${validResults.length}/${webQueries.length} résultats valides`);
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
    await tgMsg(chatId, `${analysis.text}\n\n⏳ _Création de la contre-pub en cours..._`);
    const { data: cars } = await supabase.from('cars').select('*').eq('available', true).limit(1);
    const car = (cars ?? [])[Math.floor(Math.random() * (cars ?? []).length)] as Car | undefined;
    if (car) {
      await createMarketingVideoTool({ car_name: car.name, style: 'prix' }, sessionId);
    }
    return '✅ Analyse concurrents envoyée + vidéo contre-pub créée.';
  }

  // Envoyer l'analyse sur Telegram et la retourner aussi dans la réponse (tronquée pour Claude)
  await tgMsg(chatId, analysis.text).catch(() => {});
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
// ── Phase 5: publish_to_socials ───────────────────────────────

async function publishToSocialsTool(input: Record<string, unknown>, sessionId: string): Promise<string> {
  const { getLatestPendingVideo, getPendingVideoById, approveVideo } = await import('../marketing/approval-store.js');
  const { publishVideo, buildSharePackage }                          = await import('../marketing/social-poster.js');

  const pendingId = input['pending_id'] as string | undefined;
  const video = pendingId ? getPendingVideoById(pendingId) : getLatestPendingVideo();

  if (!video) return '❌ Aucune vidéo en attente — génère-en une avec `create_marketing_video` d\'abord.';

  approveVideo(video.id);

  const chatId = chatIdFromSession(sessionId);
  const tiktokConfigured = Boolean(
    (await import('../config/env.js')).env.TIKTOK_ACCESS_TOKEN &&
    (await import('../config/env.js')).env.TIKTOK_OPEN_ID,
  );

  if (tiktokConfigured) {
    await tgMsg(chatId, `🚀 *Publication TikTok en cours...*`).catch(() => {});
    const result = await publishVideo(video);
    const reply  = result.success
      ? `✅ *Publié sur ${result.platform}*\n${result.message}${result.url ? `\n🔗 ${result.url}` : ''}`
      : `⚠️ *Problème publication:* ${result.message}\n\n${buildSharePackage(video)}`;
    await tgMsg(chatId, reply).catch(() => {});
    return reply;
  }

  const pkg = buildSharePackage(video);
  await tgMsg(chatId, pkg).catch(() => {});
  return pkg;
}

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
    tgMsg(chatId, `❌ Code Agent crash: ${msg}`).catch(() => {});
  });

  return `✅ Code Agent lancé pour: "${task.slice(0, 80)}"\n⏳ Je te tiens informé dans l'app au fur et à mesure (5-15 min selon la complexité).`;
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
    tgMsg(chatId, `❌ Code Agent crash: ${msg}`).catch(() => {});
  });

  return `✅ Création du site pour ${clientName} (${businessType}) lancée!\n⏳ Code Agent au travail — résultat dans l'app dans 10-20 min.`;
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
    // FR locations (explicit scene settings — not city names alone)
    'plage', 'beach',
    'montagne', 'mountain',
    ' mer ', ' mer,', ' mer.', 'bord de mer', 'face à la mer', 'vue sur la mer',
    'sea ', 'ocean', 'côte', 'côtier', 'côtière', 'coastal', 'corniche',
    'désert', 'desert',
    'forêt', 'foret', 'forest',
    'campagne', 'countryside', 'falaise', 'cliff',
    // Generic transformation intent
    'arrière-plan', 'arriere-plan', 'background', 'décor', 'decor',
    'paysage', 'scenery', 'setting',
    // Relocation verbs / patterns — explicit intent required
    'mets la voiture', 'met la voiture', 'place la voiture',
    'déplace', 'deplace', 'relocate',
    'sur une plage', 'sur la plage', 'sur une montagne', 'sur la montagne',
    'dans le désert', 'dans la forêt', 'dans un décor',
    'face à la', 'face a la', 'au bord de', 'avec vue sur',
    'route côtière', 'route cotiere',
  ];
  // City names alone ("à Oran", "en Algérie") do NOT trigger scene transformation —
  // they are business context, not requests to change the car's background.
  return keywords.some(kw => lower.includes(kw));
}

// ── Prompt builder ─────────────────────────────────────────────────────────────
function buildVideoPromptForRealism(opts: {
  carName:              string;
  userScene:            string;
  mode:                 'image-to-video' | 'text-to-video';
  sceneTransformation?: boolean;
  scenario?:            string;
}): { prompt: string; negativePrompt: string; cfgScale: number } {
  const { carName, userScene, mode, sceneTransformation = false, scenario } = opts;

  const baseNegativePrompt = [
    'morphing, body deformation, shape distortion, color change',
    'concept car, car redesign, stylized render, CGI, anime, cartoon',
    'oversaturated, dramatic fake lighting, neon glow',
    'speed blur, drift, stunt, explosion, smoke',
    'unrealistic reflections, plastic look, blurry, low quality',
    'AI artifact, glitch, uncanny valley, watermark, text overlay',
    'duplicate car, multiple cars',
  ].join(', ');

  // ── Scenario-specific prompts ────────────────────────────────────────────────
  if (scenario === 'airport_arrival') {
    const prompt = [
      'Cinematic shot at Oran Ahmed Ben Bella International Airport, Algeria.',
      'Modern white terminal building visible in background, palm trees, clear blue sky.',
      `A clean well-presented ${carName || 'rental car'} parked at the arrivals area.`,
      'A traveler with luggage walks out of the terminal and approaches the vehicle.',
      'Smooth tracking camera shot, golden hour sunlight, professional and welcoming atmosphere.',
      'Looks like a real filmed commercial video.',
    ].join(' ');
    return { prompt, negativePrompt: baseNegativePrompt, cfgScale: 0.5 };
  }

  if (scenario === 'city_drive') {
    const prompt = [
      `Cinematic tracking shot of a ${carName || 'car'} driving through Oran city center, Algeria.`,
      'Mediterranean architecture, wide boulevard, light traffic.',
      'Camera follows at side angle, smooth gimbal motion.',
      'Warm afternoon sunlight, realistic road reflections, professional automotive feel.',
      'Looks exactly like a real filmed car commercial.',
    ].join(' ');
    return { prompt, negativePrompt: baseNegativePrompt, cfgScale: 0.5 };
  }

  if (scenario === 'corniche') {
    const prompt = [
      `Cinematic shot of a ${carName || 'car'} parked on the Corniche d'Oran with Mediterranean Sea visible.`,
      'Rocky coastline, crystal blue water, clear Algerian sky.',
      'Camera slowly orbits around the vehicle at low angle.',
      'Golden hour warm tones, realistic sea breeze atmosphere.',
      'Premium automotive commercial look, real filmed footage style.',
    ].join(' ');
    return { prompt, negativePrompt: baseNegativePrompt, cfgScale: 0.5 };
  }

  if (scenario === 'reveal') {
    const prompt = [
      `Dramatic cinematic reveal of a ${carName || 'car'}.`,
      'Camera starts close on a detail (door handle or wheel), slowly pulls back to reveal the full vehicle.',
      'Soft dramatic lighting, clean professional background.',
      'Smooth dolly or crane camera movement, premium automotive advertisement style.',
      'Realistic filmed footage, not CGI.',
    ].join(' ');
    return { prompt, negativePrompt: baseNegativePrompt, cfgScale: 0.45 };
  }

  // ── text-to-video (no source image) ─────────────────────────────────────────
  if (mode === 'text-to-video') {
    const scene = userScene.length > 15 ? userScene : 'coastal road in Oran Algeria, golden hour';
    const prompt = [
      `Real filmed commercial video of a ${carName || 'car'}. ${scene}.`,
      'Car moves slowly and naturally on road.',
      'Camera at smooth 3/4 front angle, stable gimbal shot.',
      'Natural Mediterranean sunlight, realistic road surface, realistic shadows and reflections.',
      'Professional automotive advertisement quality, looks like a real video, not CGI.',
    ].join(' ');
    return { prompt, negativePrompt: baseNegativePrompt, cfgScale: 0.5 };
  }

  // ── image-to-video: scene transformation ────────────────────────────────────
  if (sceneTransformation) {
    const prompt = [
      'Use the provided vehicle image as the exact identity reference for the car.',
      "Preserve the car's exact shape, color, body lines, wheels and all visible details precisely.",
      `Place this exact vehicle in a completely new environment: ${userScene}.`,
      'Replace the original background entirely with the new scene.',
      'The vehicle must appear naturally integrated and parked or slowly moving in the new location.',
      'Natural lighting that matches the environment. Smooth realistic camera motion.',
      'Professional automotive commercial quality, looks like real filmed footage.',
    ].join(' ');
    const negativePrompt = baseNegativePrompt + ', original background, unchanged environment, same scene as photo';
    return { prompt, negativePrompt, cfgScale: 0.65 };
  }

  // ── image-to-video: strict fidelity — preserve car exactly, add natural motion ─
  const scene = userScene.length > 15 ? userScene : 'coastal road in Oran Algeria, warm golden hour light';
  const prompt = [
    `Photorealistic filmed video. ${scene}.`,
    'The car in the image moves very slowly and naturally forward.',
    'Smooth handheld or gimbal camera — slight natural movement.',
    'Sunlight creates realistic reflections on the bodywork.',
    'Natural shadows, realistic road surface, no stylization.',
    'Looks exactly like real footage shot with a professional camera.',
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
  scenario?:           string;
}): Promise<{ url: string; provider: string; mode: 'image-to-video' | 'text-to-video' }> {
  const { imageUrl, userPrompt, carName, duration, falKey, runwayKey, forceProvider = 'auto', sceneTransformation = false, scenario } = opts;
  const dur  = (duration <= 5 ? 5 : 10) as 5 | 10;
  const mode: 'image-to-video' | 'text-to-video' = imageUrl ? 'image-to-video' : 'text-to-video';

  const { prompt, negativePrompt, cfgScale } = buildVideoPromptForRealism({ carName, userScene: userPrompt, mode, sceneTransformation, scenario });
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

async function generateImageTool(input: Record<string, unknown>, _sessionId?: string): Promise<string> {
  const prompt      = input['prompt'] as string;
  const aspectRatio = (input['aspect_ratio'] as string) ?? '9:16';
  const style       = (input['style'] as string) ?? 'photorealistic';

  const styleModifier: Record<string, string> = {
    photorealistic: 'ultra-realistic, photographic, DSLR quality, 4K',
    cinematic:      'cinematic photography, film grain, professional lighting, movie scene',
    artistic:       'artistic, vibrant colors, creative composition',
    luxury:         'luxury brand photography, glossy, premium, elegant',
  };

  const fullPrompt = `${prompt}, ${styleModifier[style] ?? styleModifier['photorealistic']}`;

  const { emitProactive: emitImgProactive } = await import('../notifications/mobile-push.js');
  const openaiKey = env.OPENAI_API_KEY;

  // ── gpt-image-1 (OpenAI — modèle image le PLUS performant, primary) ───────────
  // Renvoie du b64 → on l'upload sur Supabase Storage pour avoir une URL publique.
  // Si l'organisation OpenAI n'est pas vérifiée (403) ou autre erreur → on tombe sur DALL-E 3.
  if (openaiKey) {
    const sizeMapGpt: Record<string, string> = { '1:1': '1024x1024', '16:9': '1536x1024', '9:16': '1024x1536' };
    const sizeG = sizeMapGpt[aspectRatio] ?? '1024x1024';
    emitImgProactive('Génération image gpt-image-1…', 'info', `🎨 gpt-image-1 en cours pour "${prompt.slice(0, 80)}"…`);
    try {
      const res = await axios.post(
        'https://api.openai.com/v1/images/generations',
        { model: 'gpt-image-1', prompt: fullPrompt, n: 1, size: sizeG, quality: 'high' },
        { headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' }, timeout: 120_000 },
      );
      const b64img = (res.data as { data: { b64_json?: string }[] }).data[0]?.b64_json;
      if (b64img) {
        const buf  = Buffer.from(b64img, 'base64');
        const path = `generated/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;
        await supabase.storage.createBucket('generated-images', { public: true }).catch(() => {});
        await supabase.storage.from('generated-images').upload(path, buf, { contentType: 'image/png', upsert: false });
        const url = supabase.storage.from('generated-images').getPublicUrl(path).data?.publicUrl;
        if (url) {
          emitImgProactive('Image gpt-image-1 prête', 'info', `🎨 Image prête\n📹 ${url}`);
          return `✅ Image générée (gpt-image-1) et envoyée dans l'app\nURL: ${url}`;
        }
      }
    } catch (err: unknown) {
      const ax = err as { response?: { status?: number; data?: unknown } };
      console.warn(`[generate-image] gpt-image-1 indispo (status=${ax?.response?.status}) → fallback DALL-E 3:`, JSON.stringify(ax?.response?.data ?? '').slice(0, 200));
      // fall through to DALL-E 3
    }
  }

  // ── DALL-E 3 (fallback si gpt-image-1 indispo) ────────────────────────────────
  if (openaiKey) {
    const sizeMap: Record<string, string> = {
      '1:1':   '1024x1024',
      '16:9':  '1792x1024',
      '9:16':  '1024x1792',
    };
    const size = sizeMap[aspectRatio] ?? '1024x1024';

    emitImgProactive(`Génération image DALL-E 3…`, 'info', `🎨 DALL-E 3 en cours pour "${prompt.slice(0, 80)}"…`);
    try {
      const res = await axios.post(
        'https://api.openai.com/v1/images/generations',
        { model: 'dall-e-3', prompt: fullPrompt, n: 1, size, quality: 'hd', response_format: 'url' },
        { headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' }, timeout: 90_000 },
      );
      const imageUrl = (res.data as { data: { url: string }[] }).data[0]?.url;
      if (imageUrl) {
        emitImgProactive(`Image DALL-E 3 prête`, 'info', `🎨 Image DALL-E 3 prête\n📹 ${imageUrl}`);
        return `✅ Image DALL-E 3 générée et envoyée dans l'app\nURL: ${imageUrl}`;
      }
    } catch (err: unknown) {
      const axErr = err as { response?: { status?: number; data?: { error?: { code?: string; message?: string } } } };
      const code = axErr?.response?.data?.error?.code;
      const status = axErr?.response?.status;
      // Quota / billing errors — inform user but don't fall through silently
      if (status === 429 || code === 'insufficient_quota' || code === 'billing_hard_limit_reached') {
        const replicateToken = env.REPLICATE_API_TOKEN;
        if (!replicateToken) return '❌ Crédits OpenAI épuisés. Ajoute des crédits sur platform.openai.com → Billing. (REPLICATE_API_TOKEN non configuré non plus.)';
        console.warn('[generate-image] DALL-E 3 quota exceeded — falling back to Flux 1.1 Pro');
      } else {
        console.error('[generate-image] DALL-E 3 error:', axErr?.response?.data ?? err);
        // Non-quota error: fall through to Flux fallback
      }
    }
  }

  // ── Flux 1.1 Pro (fallback / no OpenAI key) ───────────────────
  const token = env.REPLICATE_API_TOKEN;
  if (!token) {
    if (openaiKey) return '❌ Crédits OpenAI épuisés. Ajoute des crédits sur platform.openai.com → Billing, ou configure REPLICATE_API_TOKEN dans Railway.';
    return '❌ Aucun provider image configuré. Ajoute OPENAI_API_KEY (DALL-E 3) ou REPLICATE_API_TOKEN (Flux) dans Railway → Variables.';
  }

  emitImgProactive(`Génération image Flux.1…`, 'info', `🎨 Flux.1 Pro en cours pour "${prompt.slice(0, 80)}"…`);

  const imageUrl = await replicateGenerate(
    'black-forest-labs/flux-1.1-pro',
    {
      prompt:           fullPrompt,
      aspect_ratio:     aspectRatio,
      output_format:    'jpg',
      output_quality:   90,
      safety_tolerance: 2,
    },
    token,
    90_000,
  );

  emitImgProactive(`Image Flux.1 Pro prête`, 'info', `🎨 Image Flux.1 Pro prête\n📹 ${imageUrl}`);
  return `✅ Image Flux.1 Pro générée et envoyée dans l'app\nURL: ${imageUrl}`;
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

  // ── Lookup real car photo from Supabase (or use direct image_url if provided) ─
  let carImageUrl:   string | null = null;
  let carDisplayName = '';

  // Allow passing image_url directly (for direct Runway tests without Supabase)
  const directImageUrl = input['image_url'] as string | undefined;
  if (directImageUrl) {
    console.log(`[generateAiVideoTool] image_url direct fourni: ${directImageUrl}`);
    const imgCheck = await prepareSourceImage(directImageUrl);
    console.log(`[generateAiVideoTool] image check (direct): ${imgCheck.note}`);
    if (imgCheck.valid) {
      carImageUrl    = directImageUrl;
      carDisplayName = carName ?? 'voiture';
      console.log(`[generateAiVideoTool] ✅ mode image-to-video activé (direct url)`);
    } else {
      console.warn(`[generateAiVideoTool] ⚠️ Image directe invalide: ${imgCheck.note}`);
    }
  } else if (carName) {
    const car = await findCarByName(carName);
    console.log(`[generateAiVideoTool] voiture demandée: "${carName}" → ${car ? `trouvée: "${car.name}"` : 'non trouvée'}`);
    if (car?.image_url) {
      console.log(`[generateAiVideoTool] image_url Supabase: ${car.image_url}`);
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

  // RÈGLE ABSOLUE: si provider forcé (runway ou kling), on court-circuite
  // TOUT pré-traitement fal.ai/bria et on envoie directement l'image à Runway/Kling.
  // La transformation de scène est décrite dans le prompt texte — le modèle s'en charge.
  if (forceProvider !== 'auto' && sceneTransformation && carImageUrl) {
    const provLabel = forceProvider === 'runway' ? 'Runway Gen-3' : 'Kling 1.6';
    await tgMsg(chatId,
      `🎬 *Génération vidéo — ${provLabel}* (provider forcé)\n✅ Photo réelle de *${carDisplayName}* trouvée.\n_Scène décrite dans le prompt — aucun pré-traitement fal.ai._\n⏳ 60-240 secondes...`
    ).catch(() => {});
    // effectiveImageUrl reste = carImageUrl (photo Supabase originale)
    // sceneTransformation reste true pour que le prompt texte soit envoyé tel quel
  } else if (sceneTransformation && carImageUrl && falKey) {
    // STEP 1 — Background removal
    await tgMsg(chatId,
      `🎬 *Transformation de scène — ${carDisplayName}*\n✅ Photo réelle du véhicule trouvée.\n_Étape 1/3 : Extraction de la voiture (suppression du fond)..._\n⏳ Patience...`);
    let carOnlyUrl: string;
    try {
      carOnlyUrl = await extractCarFromBackground(carImageUrl, falKey, 90_000);
      carExtraction = true;
      console.log(`[generateAiVideoTool] carExtraction=true carOnlyUrl=${carOnlyUrl}`);
    } catch (extractErr: any) {
      console.warn(`[generateAiVideoTool] carExtraction=FAILED: ${extractErr.message} — fallback image originale`);
      await tgMsg(chatId,
        `⚠️ *Extraction fond échouée — on anime directement la photo originale.*\n_${extractErr.message.slice(0, 120)}_`);
      // Fallback: skip BRIA pipeline entirely, animate original Supabase image
      carOnlyUrl = carImageUrl;
      // Skip to video generation without transformed keyframe
      effectiveImageUrl = carImageUrl;
      // Jump out of the BRIA block so generateVehicleVideo runs with original image
      // We set sceneTransformation=false so Runway/Kling prompt stays simple
      await tgMsg(chatId,
        `🎬 *Génération vidéo depuis la photo originale...*\n⏳ 60-240 secondes...`);
      const genStartFb = Date.now();
      const { url: fbUrl, provider: fbProvider, mode: fbMode } = await generateVehicleVideo({
        imageUrl:   carImageUrl,
        userPrompt: prompt,
        carName:    carDisplayName || carName || '',
        duration,
        falKey,
        runwayKey,
        forceProvider,
        sceneTransformation: false,
      });
      const genSecFb = Math.round((Date.now() - genStartFb) / 1000);
      console.log(`[generateAiVideoTool] fallback provider=${fbProvider} mode=${fbMode} durée=${genSecFb}s`);
      const respFb   = await axios.get(fbUrl, { responseType: 'arraybuffer', timeout: 60_000 });
      const bufferFb = Buffer.from(respFb.data as ArrayBuffer);
      if (!isValidMp4Buffer(bufferFb)) throw new Error(`${fbProvider} a retourné un fichier invalide`);
      const captionFb = `🎬 *${carDisplayName} — Vidéo IA — ${fbProvider}*\n_Photo originale (extraction fond échouée)_`;
      try { await tgVideo(chatId, bufferFb, captionFb); } catch {
        await tgMsg(chatId, `${captionFb}\n\n⚠️ Envoi direct impossible.\n[Télécharger](${fbUrl})`);
      }
      return `✅ Vidéo créée (${fbProvider}, fallback — extraction fond échouée) — envoyée dans l'app ↑`;
    }

    // STEP 2 — New scene generation — fallback to original image if BRIA fails
    await tgMsg(chatId,
      `✅ *Voiture extraite.* Étape 2/3 : Création de la nouvelle scène...\n_"${requestedScene.slice(0, 60)}"_\n⏳ 30-90 secondes...`);
    let transformedUrl: string;
    try {
      transformedUrl = await generateCarInNewScene(carOnlyUrl, prompt, carDisplayName || carName || '', falKey, 150_000);
    } catch (sceneErr: any) {
      console.warn(`[generateAiVideoTool] BRIA scene FAILED: ${sceneErr.message} — fallback image originale`);
      await tgMsg(chatId,
        `⚠️ *Création nouvelle scène échouée — on anime la photo originale.*\n_${sceneErr.message.slice(0, 120)}_`);
      // Fallback: animate original Supabase image without scene transformation
      const genStartFb2 = Date.now();
      const { url: fbUrl2, provider: fbProv2, mode: fbMode2 } = await generateVehicleVideo({
        imageUrl:   carImageUrl,
        userPrompt: prompt,
        carName:    carDisplayName || carName || '',
        duration,
        falKey,
        runwayKey,
        forceProvider,
        sceneTransformation: false,
      });
      const genSecFb2 = Math.round((Date.now() - genStartFb2) / 1000);
      console.log(`[generateAiVideoTool] fallback2 provider=${fbProv2} mode=${fbMode2} durée=${genSecFb2}s`);
      const respFb2   = await axios.get(fbUrl2, { responseType: 'arraybuffer', timeout: 60_000 });
      const bufferFb2 = Buffer.from(respFb2.data as ArrayBuffer);
      if (!isValidMp4Buffer(bufferFb2)) throw new Error(`${fbProv2} a retourné un fichier invalide`);
      const captionFb2 = `🎬 *${carDisplayName} — Vidéo IA — ${fbProv2}*\n_Photo originale (transformation scène échouée)_`;
      try { await tgVideo(chatId, bufferFb2, captionFb2); } catch {
        await tgMsg(chatId, `${captionFb2}\n\n⚠️ Envoi direct impossible.\n[Télécharger](${fbUrl2})`);
      }
      return `✅ Vidéo créée (${fbProv2}, fallback — transformation scène échouée) — envoyée dans l'app ↑`;
    }

    // STEP 2b — Validate the transformed keyframe
    console.log(`[generateAiVideoTool] validation keyframe intermédiaire: ${transformedUrl}`);
    const kfValidation = await validateTransformedKeyframe(transformedUrl);
    console.log(`[generateAiVideoTool] transformedKeyframeValidated=${kfValidation.valid} raison="${kfValidation.reason}" sizeKb=${kfValidation.sizeKb}`);
    if (!kfValidation.valid) {
      await tgMsg(chatId,
        `❌ *Image intermédiaire invalide* (${kfValidation.reason}).\nGénération vidéo annulée — la scène créée n'est pas exploitable.`);
      throw new Error(`Keyframe invalide: ${kfValidation.reason}`);
    }

    transformedKeyframeCreated = true;
    effectiveImageUrl = transformedUrl;
    console.log(`[generateAiVideoTool] transformedKeyframeCreated=true transformedUrl=${transformedUrl}`);
    await tgMsg(chatId,
      `✅ *Nouvelle scène créée avec succès* (${kfValidation.sizeKb} KB).\nÉtape 3/3 : Animation vidéo en cours...\n⏳ 60-240 secondes...`);

  } else if (forceProvider === 'runway') {
    await tgMsg(chatId,
      `🎬 *Génération vidéo — Runway Gen-3* (mode forcé)\n${carImageUrl ? `✅ Photo réelle de *${carDisplayName}* trouvée.` : '⚠️ Aucune photo réelle trouvée.'}\n_Génération en mode fidélité stricte avec Runway..._\n⏳ 60-240 secondes, patience...`);
  } else if (carImageUrl) {
    const providerLabel = (forceProvider === 'kling' || !runwayKey) ? 'Kling 1.6' : 'Runway Gen-3';
    await tgMsg(chatId,
      `🎬 *Génération vidéo IA — ${providerLabel}*\n✅ Photo réelle de *${carDisplayName}* trouvée.\n_Génération réaliste en cours avec ${providerLabel}..._\n⏳ 60-240 secondes, patience...`);
  } else {
    await tgMsg(chatId,
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

  const resp   = await axios.get(videoUrl, { responseType: 'arraybuffer', timeout: 120_000 });
  const buffer = Buffer.from(resp.data as ArrayBuffer);
  const sizeKb = Math.round(buffer.length / 1024);
  console.log(`[generateAiVideoTool] vidéo téléchargée: ${sizeKb} KB`);

  if (!isValidMp4Buffer(buffer)) {
    throw new Error(`${provider} a retourné un fichier invalide (${sizeKb} KB — pas un MP4 valide)`);
  }

  const caption = mode === 'image-to-video'
    ? `🎬 *${carDisplayName} — Vidéo réaliste — ${provider}*\n_Générée depuis la vraie photo_`
    : `🎬 *Vidéo IA — ${provider}*\n_${prompt.slice(0, 100)}_`;

  let delivered = false;
  // Telegram sendVideo API limit: 50 MB. Send URL link for larger files.
  if (sizeKb > 45_000) {
    console.warn(`[generateAiVideoTool] vidéo trop lourde pour Telegram API (${sizeKb} KB > 45 MB) — envoi lien direct`);
    try {
      await tgMsg(chatId, `${caption}\n\n📎 Fichier trop lourd pour envoi direct.\n[▶ Télécharger la vidéo](${videoUrl})`);
      delivered = true;
    } catch { /* ignore */ }
  } else {
    try {
      await tgVideo(chatId, buffer, caption);
      delivered = true;
    } catch (err: any) {
      console.error('[generateAiVideoTool] sendVideoBuffer failed:', err.message);
      try {
        await tgMsg(chatId, `${caption}\n\n⚠️ Envoi direct échoué (${sizeKb} KB).\n[▶ Télécharger la vidéo](${videoUrl})`);
        delivered = true;
      } catch { /* both failed */ }
    }
  }

  const modeLabel = mode === 'image-to-video' ? `image réelle de ${carDisplayName}` : 'description texte';
  if (delivered) return `✅ Vidéo réaliste créée (${provider}, ${mode}) depuis ${modeLabel} — envoyée dans l'app ↑`;
  return `⚠️ Vidéo générée via ${provider} (${mode}) depuis ${modeLabel} mais envoi app échoué.\nURL directe: ${videoUrl}`;
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
    await tgMsg(chatId,
      `🎬 *Animation photo — Runway Gen-3* (mode forcé)\n✅ Photo réelle de *${displayName}* trouvée.\n_Génération en mode fidélité stricte avec Runway..._\n⏳ 60-240 secondes...`);
  } else {
    const providerLabel = (forceProvider === 'kling' || !runwayKey) ? 'Kling 1.6' : 'Runway Gen-3';
    await tgMsg(chatId,
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
    await tgVideo(chatId, buffer, caption);
    delivered = true;
  } catch (err: any) {
    console.error('[animateCarPhotoTool] sendVideoBuffer failed:', err.message);
    try {
      await tgMsg(chatId, `${caption}\n\n⚠️ Envoi direct impossible.\n[Télécharger la vidéo](${videoUrl})`);
      delivered = true;
    } catch { /* both failed */ }
  }

  if (delivered) return `✅ Photo de ${displayName} animée (${provider}, ${mode}) et envoyée dans l'app ↑`;
  return `⚠️ Vidéo générée (${provider}) mais envoi app échoué.\nURL directe: ${videoUrl}`;
  } finally {
    videoGenLocks.delete(lockKey);
  }
}

// ─── NEXUS PC AGENT ──────────────────────────────────────────────────────────

async function pingNexusTool(): Promise<string> {
  const { isNexusOnline, pingNexus } = await import('../actions/handlers/nexus-relay.js');
  if (!isNexusOnline()) {
    return '❌ NEXUS hors ligne — lance start.bat sur le PC Windows pour démarrer l\'agent local.';
  }
  try {
    const result = await pingNexus();
    return `✅ NEXUS répond!\n🖥️ PC: ${result.hostname}\n⏰ Heure PC: ${result.time}\n📡 Latence: ${result.latency_ms}ms\nLa connexion Dzaryx ↔ NEXUS est opérationnelle.`;
  } catch (err) {
    return `⚠️ NEXUS connecté mais ne répond pas au ping: ${err instanceof Error ? err.message : String(err)}`;
  }
}

async function sendNexusCommandTool(input: Record<string, unknown>): Promise<string> {
  const command = (input['command'] as string | undefined)?.trim();
  if (!command) return '❌ Commande requise (ex: "ouvre spotify", "screenshot")';
  const { isNexusOnline, sendToNexus } = await import('../actions/handlers/nexus-relay.js');
  if (!isNexusOnline()) {
    return '❌ NEXUS hors ligne — impossible d\'envoyer la commande. Lance start.bat sur le PC.';
  }
  sendToNexus('nexus:command', { text: command, source: 'dzaryx-app' });
  return `✅ Commande envoyée à NEXUS: "${command}"\n📡 NEXUS va l\'exécuter et envoyer le résultat dans l\'app ou via le journal.`;
}

async function nexusScreenshotTool(input: Record<string, unknown>): Promise<string> {
  const { isNexusOnline, nexusScreenshotBase64 } = await import('../actions/handlers/nexus-relay.js');
  if (!isNexusOnline()) {
    return '❌ NEXUS hors ligne — lance start.bat sur le PC pour démarrer l\'agent.';
  }
  try {
    const r = await nexusScreenshotBase64(35_000);
    if (!r.ok || !r.image_base64) {
      return `❌ Screenshot échoué: ${r.error ?? 'aucune image reçue de Nexus'}`;
    }
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const storagePath = `screenshots/pc_${ts}.png`;
    const buf = Buffer.from(r.image_base64, 'base64');
    const { error: upErr } = await supabase.storage
      .from('client-documents')
      .upload(storagePath, buf, { contentType: 'image/png', upsert: true });
    if (upErr) {
      return `⚠️ Screenshot capturé (${r.size_kb ?? '?'}KB) mais upload échoué: ${upErr.message}`;
    }
    const { data: urlData } = supabase.storage.from('client-documents').getPublicUrl(storagePath);
    const caption = (input['caption'] as string | undefined) ?? '';
    return `📸 Screenshot PC${caption ? ` — ${caption}` : ''} (${r.size_kb ?? '?'}KB)\n📹 ${urlData.publicUrl}`;
  } catch (err) {
    return `❌ Erreur screenshot: ${err instanceof Error ? err.message : String(err)}`;
  }
}

async function wakeNexusTool(): Promise<string> {
  const { isNexusOnline, isLauncherOnline, wakeNexus } = await import('../actions/handlers/nexus-relay.js');

  if (isNexusOnline()) {
    return '✅ Nexus est déjà actif et connecté — aucune action nécessaire.';
  }

  if (!isLauncherOnline()) {
    return [
      '❌ Launcher hors ligne — impossible de réveiller Nexus.',
      '',
      '🔧 Pour activer le Launcher:',
      '  1. Allume le PC Windows',
      '  2. Exécute install-nexus-launcher.bat (une seule fois)',
      '  3. Le Launcher démarrera automatiquement à chaque session',
    ].join('\n');
  }

  try {
    const result = await wakeNexus();
    if (result.success) {
      const statusIcon = result.status === 'started' ? '🟢' : result.status === 'already_running' ? '✅' : '⏳';
      return `${statusIcon} ${result.message}`;
    }
    return `❌ Réveil échoué: ${result.message}`;
  } catch (err) {
    return `❌ Erreur réveil Nexus: ${err instanceof Error ? err.message : String(err)}`;
  }
}

async function restartNexusTool(): Promise<string> {
  const { isNexusOnline, emitToNexusWithAck } = await import('../actions/handlers/nexus-relay.js');
  if (!isNexusOnline()) return '❌ Nexus déjà hors ligne — pas besoin de redémarrer.';
  try {
    const res = await emitToNexusWithAck<{ ok: boolean; message?: string }>(
      'nexus:self_restart', {}, 5000,
    );
    if (res.ok) return `🔄 Nexus redémarre... Le watchdog va le relancer automatiquement dans 3-5 secondes.\n${res.message ?? ''}`;
    return '⚠️ Nexus n\'a pas pu redémarrer proprement.';
  } catch {
    return '⚠️ Nexus a redémarré (timeout normal — il était en train de s\'arrêter). Le watchdog le relance.';
  }
}

async function nexusFullStatusTool(): Promise<string> {
  const { isNexusOnline, isLauncherOnline, getNexusMac, getNexusIp, getLauncherStatus } = await import('../actions/handlers/nexus-relay.js');

  const lines: string[] = ['📊 **État système NEXUS**\n'];

  const nexusOk    = isNexusOnline();
  const launcherOk = isLauncherOnline();

  lines.push(`🖥️ Nexus Agent:  ${nexusOk    ? '🟢 EN LIGNE' : '🔴 HORS LIGNE'}`);
  lines.push(`🚀 Launcher:     ${launcherOk ? '🟢 EN LIGNE' : '🔴 HORS LIGNE'}`);

  if (nexusOk) {
    const mac = getNexusMac();
    const ip  = getNexusIp();
    if (mac) lines.push(`🔗 MAC: ${mac}`);
    if (ip)  lines.push(`🌐 IP:  ${ip}`);
  }

  if (launcherOk) {
    try {
      const status = await getLauncherStatus();
      if (status['hostname'])   lines.push(`💻 Hostname:    ${status['hostname']}`);
      if (status['uptime'])     lines.push(`⏱️ Uptime:      ${status['uptime']}`);
      if (status['last_wake'])  lines.push(`⏰ Dernier réveil: ${status['last_wake']}`);
      if (status['last_error']) lines.push(`⚠️ Dernière erreur: ${status['last_error']}`);
    } catch {
      lines.push('⚠️ Statut Launcher: timeout');
    }
  }

  if (!nexusOk && !launcherOk) {
    lines.push('\n💡 Pour activer: exécute install-nexus-launcher.bat sur le PC Windows');
  } else if (!nexusOk && launcherOk) {
    lines.push('\n💡 Nexus hors ligne mais Launcher disponible — dis "réveille Nexus" pour le démarrer');
  }

  return lines.join('\n');
}

// ─── GOOGLE CALENDAR — update manquant ───────────────────────────────────────

async function updateCalendarEventTool(input: Record<string, unknown>): Promise<string> {
  const googleEventId = (input['google_event_id'] as string | undefined)?.trim();
  if (!googleEventId) return '❌ google_event_id requis — appelle list_calendar_events pour obtenir l\'ID';
  const updates: { summary?: string; startDate?: string; endDate?: string; description?: string } = {};
  if (input['summary'])     updates.summary     = input['summary']     as string;
  if (input['start_date'])  updates.startDate   = input['start_date']  as string;
  if (input['end_date'])    updates.endDate     = input['end_date']    as string;
  if (input['description']) updates.description = input['description'] as string;
  if (!Object.keys(updates).length) return '❌ Au moins un champ à modifier requis (summary, start_date, end_date, description)';
  const ok = await updateCalendarEvent(googleEventId, updates);
  if (!ok) return `❌ Impossible de modifier l'événement ${googleEventId} — vérifie GOOGLE_SERVICE_ACCOUNT_JSON`;
  return `✅ Événement ${googleEventId} modifié dans Google Agenda!\n${Object.entries(updates).map(([k, v]) => `  ${k}: ${v}`).join('\n')}`;
}

// ─── HEALTH CHECK COMPLET ────────────────────────────────────────────────────

async function healthCheckAllTool(): Promise<string> {
  const results: string[] = [];

  results.push('✅ Railway backend — en ligne (tu parles avec moi)');

  if (env.ANTHROPIC_API_KEY) results.push('✅ Claude API (Anthropic) — clé configurée');
  else results.push('❌ Claude API — ANTHROPIC_API_KEY manquant');

  if (env.ELEVENLABS_API_KEY) results.push('✅ ElevenLabs (TTS) — clé configurée');
  else results.push('⚠️ ElevenLabs — ELEVENLABS_API_KEY manquant (voix désactivée)');

  try {
    const { error } = await supabase.from('bookings').select('id').limit(1);
    if (error) results.push(`❌ Supabase — ${error.message}`);
    else results.push('✅ Supabase (base de données) — connexion OK');
  } catch (e) {
    results.push(`❌ Supabase — ${e instanceof Error ? e.message : String(e)}`);
  }

  try {
    const events = await listUpcomingEvents(1);
    if (events === null) results.push('❌ Google Calendar — token invalide ou GOOGLE_SERVICE_ACCOUNT_JSON manquant');
    else results.push('✅ Google Calendar — connexion OK');
  } catch (e) {
    results.push(`❌ Google Calendar — ${e instanceof Error ? e.message : String(e)}`);
  }

  if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) results.push('✅ Telegram — configuré');
  else results.push('⚠️ Telegram — TELEGRAM_BOT_TOKEN ou TELEGRAM_CHAT_ID manquant');

  if (env.GITHUB_TOKEN) results.push('✅ GitHub — token présent (coder activé)');
  else results.push('⚠️ GitHub — GITHUB_TOKEN manquant (coder sans GitHub impossible)');

  const { isNexusOnline } = await import('../actions/handlers/nexus-relay.js');
  if (isNexusOnline()) results.push('✅ NEXUS — connecté (PC en ligne)');
  else results.push('❌ NEXUS — hors ligne (lance start.bat sur le PC)');

  const now = new Date().toLocaleString('fr-FR', { timeZone: 'Africa/Algiers', hour12: false });
  return `🔍 HEALTH CHECK DZARYX\n📅 ${now} (Oran)\n\n${results.join('\n')}`;
}

// ─── get_car_photo — toutes les photos depuis Supabase (car_photos + image_url) ─
async function getCarPhotoTool(input: Record<string, unknown>): Promise<string> {
  const carName = (input['car_name'] as string | undefined)?.trim();
  if (!carName) return '❌ Paramètre car_name manquant.';

  // Fetch car + its photos table
  const { data: cars, error } = await supabase
    .from('cars')
    .select('id, name, image_url, car_photos(url, position)')
    .ilike('name', `%${carName}%`)
    .limit(5);

  if (error) return `❌ Erreur Supabase: ${error.message}`;
  if (!cars || cars.length === 0) return `❌ Aucune voiture trouvée pour "${carName}" dans la flotte.`;

  const car = (cars as any[]).find(c => c.image_url || (c.car_photos && c.car_photos.length > 0)) ?? cars[0];

  // Collect all unique photo URLs (car_photos ordered by position, then image_url as fallback)
  const extraPhotos: string[] = (car.car_photos ?? [])
    .sort((a: any, b: any) => a.position - b.position)
    .map((p: any) => p.url as string)
    .filter(Boolean);

  const allUrls: string[] = [];
  if (extraPhotos.length > 0) {
    allUrls.push(...extraPhotos);
  } else if (car.image_url) {
    allUrls.push(car.image_url as string);
  }

  if (allUrls.length === 0) {
    return `⚠️ Voiture "${car.name}" trouvée mais aucune photo. Ajoute des photos dans le tableau de bord.`;
  }

  // Emit each photo separately to the mobile app (like WhatsApp gallery)
  const { emitProactive } = await import('../notifications/mobile-push.js');
  for (let i = 0; i < allUrls.length; i++) {
    const label = allUrls.length > 1 ? `${car.name} — photo ${i + 1}/${allUrls.length}` : car.name;
    emitProactive(label, 'info', `${label}\n${allUrls[i]}`);
    if (i < allUrls.length - 1) {
      await new Promise(r => setTimeout(r, 400));
    }
  }

  return `✅ ${allUrls.length} photo${allUrls.length > 1 ? 's' : ''} envoyée${allUrls.length > 1 ? 's' : ''} pour "${car.name}":\n${allUrls.map((u, i) => `${i + 1}. ${u}`).join('\n')}\n\nUtilise ces URLs avec enhance_image ou create_social_variants.`;
}

// ════════════════════════════════════════════════════════════════════════════
// IMMOBILIER & VENTE — synchro avec le site (mêmes tables Supabase)
// ════════════════════════════════════════════════════════════════════════════

// Enregistre une opération dans client_deals (trace QUI a fait QUOI). Non-bloquant.
async function logClientDeal(d: {
  client_name?: string; client_phone?: string; deal_type: string;
  item_table?: string; item_id?: string; item_label?: string;
  amount?: number; currency?: string; status?: string; notes?: string;
}): Promise<void> {
  if (!d.client_name) return; // pas de client → on ne loggue pas
  try {
    await supabase.from('client_deals').insert([{
      client_name: d.client_name, client_phone: d.client_phone ?? null,
      deal_type: d.deal_type, item_table: d.item_table ?? null, item_id: d.item_id ?? null,
      item_label: d.item_label ?? null, amount: d.amount ?? null, currency: d.currency ?? 'DZD',
      status: d.status ?? 'termine', notes: d.notes ?? null,
    }]);
  } catch (e) { console.error('[client_deals] insert fail:', e instanceof Error ? e.message : e); }
}

async function getPropertyPhotoTool(input: Record<string, unknown>): Promise<string> {
  const raw = (input['property_query'] as string | undefined)?.trim() || '';
  const wantAll = !raw || /^(tous|toutes|tout|all|les?\s+biens?|appartements?|immobilier)/i.test(raw);

  let q = supabase.from('properties').select('id, title, city, image_url, property_photos(url, position)');
  if (!wantAll) q = q.or(`title.ilike.%${raw}%,city.ilike.%${raw}%`);
  const { data: props, error } = await q.limit(wantAll ? 20 : 5);
  if (error) return `❌ Erreur Supabase: ${error.message}`;
  if (!props || props.length === 0) return wantAll ? 'Aucun bien immobilier enregistré.' : `❌ Aucun bien trouvé pour "${raw}".`;

  const targets = wantAll ? (props as any[]) : [(props as any[]).find(p => p.image_url || (p.property_photos && p.property_photos.length > 0)) ?? props[0]];
  const { emitProactive } = await import('../notifications/mobile-push.js');
  let totalSent = 0;
  const sentNames: string[] = [];

  for (const prop of targets) {
    const extra: string[] = (prop.property_photos ?? [])
      .sort((a: any, b: any) => a.position - b.position).map((p: any) => p.url as string).filter(Boolean);
    const urls: string[] = extra.length > 0 ? extra : (prop.image_url ? [prop.image_url as string] : []);
    if (urls.length === 0) continue;
    for (let i = 0; i < urls.length; i++) {
      const label = urls.length > 1 ? `${prop.title} — photo ${i + 1}/${urls.length}` : prop.title;
      emitProactive(label, 'info', `${label}\n${urls[i]}`);
      totalSent++;
      await new Promise(r => setTimeout(r, 350));
    }
    sentNames.push(prop.title);
  }
  if (totalSent === 0) return '⚠️ Biens trouvés mais aucun n\'a de photo. Ajoute des photos dans l\'admin du site.';
  return `✅ ${totalSent} photo(s) envoyée(s) pour : ${sentNames.join(', ')}.`;
}

async function createPropertyTool(input: Record<string, unknown>, sessionId?: string): Promise<string> {
  const title = (input['title'] as string | undefined)?.trim();
  const transaction = (input['transaction'] as string | undefined)?.trim();
  const price = input['price'] as number | undefined;
  if (!title || !transaction || price == null) return '❌ title, transaction et price requis.';
  if (!['location', 'vente'].includes(transaction)) return '❌ transaction doit être "location" ou "vente".';

  const row: Record<string, unknown> = {
    title,
    name: title,                                  // colonne legacy NOT NULL éventuelle
    transaction,
    city:        (input['city'] as string | undefined)?.trim() || 'Oran',
    district:    (input['district'] as string | undefined)?.trim() || null,
    address:     (input['address'] as string | undefined)?.trim() || null,
    price,
    currency:    (input['currency'] as string | undefined)?.trim() || 'DZD',
    price_type:  transaction === 'location' ? 'mois' : 'total',
    type:        (input['type'] as string | undefined)?.trim() || 'appartement',
    rooms:       (input['rooms'] as number | undefined) ?? null,
    surface:     (input['surface'] as number | undefined) ?? null,
    description: (input['description'] as string | undefined)?.trim() || null,
    status:      (input['status'] as string | undefined)?.trim() || 'disponible',
  };
  const { data, error } = await supabase.from('properties').insert([row]).select('id, title').single();
  if (error) return `❌ Erreur création bien: ${error.message}`;
  const cur = row.currency === 'DZD' ? 'DA' : '€';
  const suffix = transaction === 'location' ? '/mois' : '';
  const nPhotos = await attachSessionPhotos(sessionId, { photoTable: 'property_photos', fk: 'property_id', ownerId: (data as any).id, mainTable: 'properties' });
  const photoNote = nPhotos > 0 ? ` 📸 ${nPhotos} photo(s) attachée(s).` : ' Joins des photos dans le chat ou ajoute via l\'admin.';
  return `✅ Bien ajouté sur le site : "${(data as any).title}" — ${transaction === 'vente' ? 'à vendre' : 'à louer'} à ${row.city} · ${Number(price).toLocaleString()} ${cur}${suffix}. Visible sur fikconciergerie.com.${photoNote}`;
}

async function addVehicleForSaleTool(input: Record<string, unknown>, sessionId?: string): Promise<string> {
  const brand = (input['brand'] as string | undefined)?.trim();
  const model = (input['model'] as string | undefined)?.trim();
  const price = input['price'] as number | undefined;
  if (!brand || !model || price == null) return '❌ brand, model et price requis.';

  const row: Record<string, unknown> = {
    brand, model, price,
    year:         (input['year'] as number | undefined) ?? null,
    currency:     (input['currency'] as string | undefined)?.trim() || 'DZD',
    mileage:      (input['mileage'] as number | undefined) ?? null,
    fuel:         (input['fuel'] as string | undefined)?.trim() || null,
    transmission: (input['transmission'] as string | undefined)?.trim() || null,
    status:       (input['status'] as string | undefined)?.trim() || 'disponible',
  };
  const { data, error } = await supabase.from('vehicles_for_sale').insert([row]).select('id, brand, model').single();
  if (error) return `❌ Erreur ajout voiture à vendre: ${error.message}`;
  const cur = row.currency === 'DZD' ? 'DA' : '€';
  const nPhotos = await attachSessionPhotos(sessionId, { photoTable: 'vehicle_sale_photos', fk: 'vehicle_id', ownerId: (data as any).id, mainTable: 'vehicles_for_sale' });
  const photoNote = nPhotos > 0 ? ` 📸 ${nPhotos} photo(s) attachée(s).` : ' Joins des photos dans le chat ou ajoute via l\'admin.';
  return `✅ Voiture à vendre ajoutée sur le site : ${(data as any).brand} ${(data as any).model}${row.year ? ` (${row.year})` : ''} · ${Number(price).toLocaleString()} ${cur}. Visible sur le site.${photoNote}`;
}

const LEAD_CAT_LABEL: Record<string, string> = {
  immo_location: 'Location immo', immo_vente: 'Achat immo',
  voiture_location: 'Location voiture', voiture_vente: 'Achat voiture',
};

async function recordLeadTool(input: Record<string, unknown>): Promise<string> {
  const client_name = (input['client_name'] as string | undefined)?.trim();
  const category = (input['category'] as string | undefined)?.trim();
  const criteria = (input['criteria'] as string | undefined)?.trim();
  if (!client_name || !category || !criteria) return '❌ client_name, category et criteria requis.';
  const row = {
    client_name, client_phone: (input['client_phone'] as string | undefined)?.trim() || null,
    category, criteria,
    budget_max: (input['budget_max'] as number | undefined) ?? null,
    currency: (input['currency'] as string | undefined)?.trim() || 'DZD',
    city: (input['city'] as string | undefined)?.trim() || null,
    status: 'nouveau',
  };
  const { error } = await supabase.from('client_leads').insert([row]);
  if (error) return `❌ Erreur: ${error.message} (lance la migration 0016_client_leads.sql si la table manque).`;
  return `✅ Demande enregistrée : ${client_name} cherche "${criteria}" (${LEAD_CAT_LABEL[category] || category}${row.budget_max ? `, budget ${Number(row.budget_max).toLocaleString()} ${row.currency === 'DZD' ? 'DA' : '€'}` : ''}). Dis "qu'est-ce que j'ai pour ${client_name}" pour matcher au stock.`;
}

async function listLeadsTool(input: Record<string, unknown>): Promise<string> {
  const status = (input['status'] as string | undefined)?.trim();
  let q = supabase.from('client_leads').select('client_name, category, criteria, budget_max, currency, city, status, created_at').order('created_at', { ascending: false });
  if (status) q = q.eq('status', status);
  else q = q.in('status', ['nouveau', 'en_cours']);
  const { data, error } = await q.limit(50);
  if (error) return `❌ Erreur: ${error.message}`;
  if (!data || data.length === 0) return status ? `Aucune demande "${status}".` : 'Aucune demande en cours.';
  const lines = (data as any[]).map(l => {
    const b = l.budget_max ? ` · ≤${Number(l.budget_max).toLocaleString()} ${l.currency === 'DZD' ? 'DA' : '€'}` : '';
    return `📥 ${l.client_name} — ${LEAD_CAT_LABEL[l.category] || l.category} : ${l.criteria}${l.city ? ` (${l.city})` : ''}${b} · ${l.status}`;
  });
  return `${data.length} demande(s) :\n${lines.join('\n')}`;
}

async function updateLeadStatusTool(input: Record<string, unknown>): Promise<string> {
  const query = (input['lead_query'] as string | undefined)?.trim();
  const status = (input['status'] as string | undefined)?.trim();
  if (!query || !status) return '❌ lead_query et status requis.';
  const { data: leads, error } = await supabase.from('client_leads')
    .select('id, client_name, criteria').or(`client_name.ilike.%${query}%,criteria.ilike.%${query}%`).limit(5);
  if (error) return `❌ Erreur: ${error.message}`;
  if (!leads || leads.length === 0) return `❌ Aucune demande trouvée pour "${query}".`;
  if (leads.length > 1) return `⚠️ Plusieurs demandes:\n${(leads as any[]).map(l => `• ${l.client_name} — ${l.criteria}`).join('\n')}\nPrécise.`;
  const l = (leads as any[])[0];
  const upd: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
  if (input['notes']) upd['notes'] = input['notes'];
  const { error: e2 } = await supabase.from('client_leads').update(upd).eq('id', l.id);
  if (e2) return `❌ Échec: ${e2.message}`;
  return `✅ Demande de ${l.client_name} → ${status}.`;
}

async function matchLeadTool(input: Record<string, unknown>): Promise<string> {
  const query = (input['lead_query'] as string | undefined)?.trim();
  if (!query) return '❌ lead_query requis.';
  const { data: leads } = await supabase.from('client_leads')
    .select('*').or(`client_name.ilike.%${query}%,criteria.ilike.%${query}%`).limit(1);
  const lead = (leads as any[] | null)?.[0];
  if (!lead) return `❌ Aucune demande trouvée pour "${query}".`;

  const immo = lead.category.startsWith('immo');
  const txn = lead.category.endsWith('vente') ? 'vente' : 'location';
  let matches: string[] = [];
  if (immo) {
    let q = supabase.from('properties').select('title, city, district, price, currency, transaction, status').eq('transaction', txn).eq('status', 'disponible');
    const { data } = await q.limit(50);
    matches = ((data as any[]) || [])
      .filter(p => !lead.city || (p.city || '').toLowerCase().includes(String(lead.city).toLowerCase()) || (p.district || '').toLowerCase().includes(String(lead.city).toLowerCase()))
      .filter(p => !lead.budget_max || p.price == null || Number(p.price) <= Number(lead.budget_max) * 1.1)
      .map(p => `🏠 ${p.title} — ${[p.district, p.city].filter(Boolean).join(', ')} · ${p.price ? Number(p.price).toLocaleString() + ' ' + (p.currency === 'DZD' ? 'DA' : '€') : 'prix sur demande'}`);
  } else {
    const { data } = await supabase.from('vehicles_for_sale').select('brand, model, year, price, currency, status').eq('status', 'disponible').limit(50);
    matches = ((data as any[]) || [])
      .filter(v => !lead.budget_max || v.price == null || Number(v.price) <= Number(lead.budget_max) * 1.1)
      .map(v => `🚗 ${v.brand} ${v.model}${v.year ? ` (${v.year})` : ''} · ${v.price ? Number(v.price).toLocaleString() + ' ' + (v.currency === 'DZD' ? 'DA' : '€') : 'prix sur demande'}`);
  }
  if (matches.length === 0) return `Pour ${lead.client_name} ("${lead.criteria}") : rien dans le stock actuel. Je te préviens dès qu'un bien correspond.`;
  return `Pour ${lead.client_name} ("${lead.criteria}") — ${matches.length} dans le stock :\n${matches.slice(0, 8).join('\n')}`;
}

async function getDailyReportTool(): Promise<string> {
  const today = new Date().toISOString().slice(0, 10);
  const dayStart = today + 'T00:00:00';
  const out: string[] = [`📅 RAPPORT DU ${new Date().toLocaleDateString('fr-FR')}`];

  // Arrivées / retours voitures aujourd'hui
  const { data: bks } = await supabase.from('bookings')
    .select('client_name, start_date, end_date, status, payment_status, final_price, cars(name)')
    .in('status', ['CONFIRMED', 'ACTIVE']);
  const arr = (bks as any[] || []).filter(b => b.start_date === today);
  const ret = (bks as any[] || []).filter(b => b.end_date === today);
  out.push(`\n🚗 VOITURES — ${arr.length} arrivée(s), ${ret.length} retour(s)`);
  arr.forEach(b => out.push(`  ✈️ ${b.client_name} prend ${b.cars?.name ?? '?'}`));
  ret.forEach(b => out.push(`  🔙 ${b.client_name} rend ${b.cars?.name ?? '?'}`));

  // Opérations du jour (client_deals)
  const { data: deals } = await supabase.from('client_deals')
    .select('client_name, deal_type, item_label, amount, currency').gte('created_at', dayStart);
  if ((deals as any[])?.length) {
    out.push(`\n💼 OPÉRATIONS DU JOUR — ${(deals as any[]).length}`);
    (deals as any[]).forEach(d => out.push(`  • ${d.client_name} — ${d.deal_type}${d.item_label ? ` (${d.item_label})` : ''}${d.amount ? ` · ${Number(d.amount).toLocaleString()} ${d.currency === 'DZD' ? 'DA' : '€'}` : ''}`));
  }

  // Nouveaux leads
  const { data: leads } = await supabase.from('client_leads')
    .select('client_name, criteria, status').eq('status', 'nouveau').limit(20);
  if ((leads as any[])?.length) {
    out.push(`\n📥 DEMANDES À TRAITER — ${(leads as any[]).length}`);
    (leads as any[]).forEach(l => out.push(`  • ${l.client_name} : ${l.criteria}`));
  }

  // Alertes : paiements en retard (fin passée, pas PAID)
  const overdue = (bks as any[] || []).filter(b => b.end_date < today && b.payment_status !== 'PAID');
  if (overdue.length) {
    out.push(`\n⚠️ PAIEMENTS EN RETARD — ${overdue.length}`);
    overdue.slice(0, 10).forEach(b => out.push(`  💰 ${b.client_name} — ${b.final_price ?? '?'}€ (${b.cars?.name ?? '?'})`));
  }

  if (out.length === 1) out.push('\nRien de spécial aujourd\'hui. Bonne journée 👌');
  return out.join('\n');
}

async function setSiteHeroTool(input: Record<string, unknown>): Promise<string> {
  let url = (input['media_url'] as string | undefined)?.trim() || '';
  if (/^(reset|auto|défaut|defaut|vide|none)$/i.test(url)) url = '';
  if (url && !/^https?:\/\//i.test(url)) return '❌ media_url doit être une URL complète (https://...) ou "reset".';
  const { error } = await supabase.from('site_settings').update({ hero_media_url: url }).eq('id', 1);
  if (error) return `❌ Erreur: ${error.message} (lance la migration 0015_hero_media.sql si la colonne manque).`;
  if (!url) return '✅ Hero remis sur la photo automatique de la voiture en avant.';
  const isVid = /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url);
  return `✅ Hero de l'accueil mis à jour avec ${isVid ? 'la vidéo' : 'la photo'}. Visible sur fikconciergerie.com.`;
}

async function updatePropertyTool(input: Record<string, unknown>): Promise<string> {
  const query = (input['property_query'] as string | undefined)?.trim();
  if (!query) return '❌ property_query requis.';
  const updates: Record<string, unknown> = {};
  for (const k of ['price', 'description', 'title', 'address', 'city', 'district', 'surface', 'rooms'] as const) {
    if (input[k] != null && input[k] !== '') updates[k] = input[k];
  }
  if (Object.keys(updates).length === 0) return '❌ Aucune modification fournie.';

  const { data: props, error } = await supabase.from('properties')
    .select('id, title, city').or(`title.ilike.%${query}%,city.ilike.%${query}%`).limit(5);
  if (error) return `❌ Erreur Supabase: ${error.message}`;
  if (!props || props.length === 0) return `❌ Aucun bien trouvé pour "${query}".`;
  if (props.length > 1) return `⚠️ Plusieurs biens correspondent:\n${(props as any[]).map(p => `• ${p.title} (${p.city})`).join('\n')}\nPrécise lequel.`;

  const p = (props as any[])[0];
  const { error: upErr } = await supabase.from('properties').update(updates).eq('id', p.id);
  if (upErr) return `❌ Échec mise à jour: ${upErr.message}`;
  return `✅ "${p.title}" mis à jour sur le site (${Object.keys(updates).join(', ')}).`;
}

async function updateVehicleDetailsTool(input: Record<string, unknown>): Promise<string> {
  const query = (input['vehicle_query'] as string | undefined)?.trim();
  if (!query) return '❌ vehicle_query requis.';
  const updates: Record<string, unknown> = {};
  for (const k of ['price', 'year', 'mileage'] as const) {
    if (input[k] != null) updates[k] = input[k];
  }
  if (Object.keys(updates).length === 0) return '❌ Aucune modification fournie.';

  const { data: vs, error } = await supabase.from('vehicles_for_sale')
    .select('id, brand, model').or(`brand.ilike.%${query}%,model.ilike.%${query}%`).limit(5);
  if (error) return `❌ Erreur Supabase: ${error.message}`;
  if (!vs || vs.length === 0) return `❌ Aucune voiture à vendre trouvée pour "${query}".`;
  if (vs.length > 1) return `⚠️ Plusieurs voitures correspondent:\n${(vs as any[]).map(v => `• ${v.brand} ${v.model}`).join('\n')}\nPrécise laquelle.`;

  const v = (vs as any[])[0];
  const { error: upErr } = await supabase.from('vehicles_for_sale').update(updates).eq('id', v.id);
  if (upErr) return `❌ Échec mise à jour: ${upErr.message}`;
  return `✅ ${v.brand} ${v.model} mis à jour sur le site (${Object.keys(updates).join(', ')}).`;
}

async function listPropertiesTool(input: Record<string, unknown>): Promise<string> {
  const status = (input['status'] as string | undefined)?.trim();
  let q = supabase.from('properties').select('id, title, city, district, transaction, price, currency, status, bedrooms').order('created_at', { ascending: false });
  if (status) q = q.eq('status', status);
  const { data, error } = await q.limit(50);
  if (error) return `❌ Erreur Supabase: ${error.message}`;
  if (!data || data.length === 0) return status ? `Aucun bien avec le statut "${status}".` : 'Aucun bien immobilier enregistré.';
  const cur = (c: string) => (c === 'DZD' ? 'DA' : '€');
  const lines = (data as any[]).map(p => {
    const txn = p.transaction === 'vente' ? 'À vendre' : 'À louer';
    const price = p.price ? `${Number(p.price).toLocaleString()} ${cur(p.currency)}${p.transaction === 'vente' ? '' : '/mois'}` : 'prix sur demande';
    return `🏠 ${p.title} — ${[p.district, p.city].filter(Boolean).join(', ')} · ${txn} · ${price} · statut: ${p.status}`;
  });
  return `${data.length} bien(s) :\n${lines.join('\n')}`;
}

// ─── PACKS (combos voiture + immo + jet ski + chauffeur) ───────────────────────
const PACK_TIER_LABEL: Record<string, string> = {
  entree: 'Entrée de gamme', medium: 'Médium', premium: 'Premium', entreprise: 'Entreprise/Groupe',
};

// Dispo dérivée : pack dispo seulement si le véhicule lié est libre ET le bien lié dispo.
function packIsAvailable(p: any): boolean {
  if (p.status !== 'disponible') return false;
  const carOk  = !p.car      || p.car.available !== false;
  const propOk = !p.property || (p.property.status || 'disponible') === 'disponible';
  return carOk && propOk;
}

async function listPacksTool(input: Record<string, unknown>): Promise<string> {
  const status = (input['status'] as string | undefined)?.trim();
  let q = supabase.from('packs')
    .select('id, title, tier, price, price_type, currency, status, car:cars(name, available), property:properties(title, status)')
    .order('position', { ascending: true });
  if (status) q = q.eq('status', status);
  const { data, error } = await q.limit(50);
  if (error) return `❌ Erreur Supabase: ${error.message}`;
  if (!data || data.length === 0) return 'Aucun pack enregistré. Crée-en un avec create_pack.';
  const cur = (c: string) => (c === 'DZD' ? 'DA' : '€');
  const lines = (data as any[]).map(p => {
    const price = (!p.price || p.price_type === 'sur_devis') ? 'sur devis' : `${Number(p.price).toLocaleString()} ${cur(p.currency)}`;
    const car  = p.car ? p.car.name : '—';
    const prop = p.property ? p.property.title : '—';
    const dispo = packIsAvailable(p) ? '🟢 dispo' : '🔴 indispo';
    return `📦 ${p.title} (${PACK_TIER_LABEL[p.tier] || p.tier}) · ${price} · 🚗 ${car} · 🏠 ${prop} · ${dispo}`;
  });
  return `${data.length} pack(s) :\n${lines.join('\n')}`;
}

async function createPackTool(input: Record<string, unknown>, sessionId?: string): Promise<string> {
  const title = (input['title'] as string | undefined)?.trim();
  if (!title) return '❌ title requis (nom du pack).';
  const tier = (input['tier'] as string | undefined)?.trim() || 'entree';

  // Résolution véhicule + bien réels par nom (optionnel)
  let car_id: string | null = null, carName = '';
  const carQuery = (input['car_name'] as string | undefined)?.trim();
  if (carQuery) {
    const { data } = await supabase.from('cars').select('id, name').ilike('name', `%${carQuery}%`).limit(1);
    if (data && data[0]) { car_id = (data[0] as any).id; carName = (data[0] as any).name; }
  }
  let property_id: string | null = null, propName = '';
  const propQuery = (input['property_title'] as string | undefined)?.trim();
  if (propQuery) {
    const { data } = await supabase.from('properties').select('id, title').ilike('title', `%${propQuery}%`).limit(1);
    if (data && data[0]) { property_id = (data[0] as any).id; propName = (data[0] as any).title; }
  }

  const feat = input['features'];
  const features = Array.isArray(feat) ? feat.map(String)
    : typeof feat === 'string' ? feat.split('\n').map(s => s.trim()).filter(Boolean) : null;

  const row: Record<string, unknown> = {
    title, tier,
    tagline:     (input['tagline'] as string | undefined)?.trim() || null,
    description: (input['description'] as string | undefined)?.trim() || null,
    price:       (input['price'] as number | undefined) ?? null,
    price_type:  (input['price_type'] as string | undefined)?.trim() || 'sejour',
    currency:    (input['currency'] as string | undefined)?.trim() || 'DZD',
    duration:    (input['duration'] as string | undefined)?.trim() || null,
    car_id, property_id,
    inc_car:       input['inc_car']       === true || (input['inc_car'] === undefined && car_id != null),
    inc_apartment: input['inc_apartment'] === true,
    inc_villa:     input['inc_villa']     === true,
    inc_jetski:    input['inc_jetski']    === true,
    inc_driver:    input['inc_driver']    === true,
    features,
    status: 'disponible',
  };
  const { data, error } = await supabase.from('packs').insert([row]).select('id, title').single();
  if (error) return `❌ Erreur création pack: ${error.message} (lance la migration 0018_packs.sql si la table manque).`;
  const linked = [carName ? `🚗 ${carName}` : null, propName ? `🏠 ${propName}` : null].filter(Boolean).join(' + ');
  // Packs : pas de table photos dédiée → on attache juste l'image principale (image_url).
  const nPhotos = await attachSessionPhotos(sessionId, { photoTable: null, fk: '', ownerId: (data as any).id, mainTable: 'packs' });
  const photoNote = nPhotos > 0 ? ` 📸 Photo principale attachée.` : ' Ajoute des photos depuis l\'admin.';
  return `✅ Pack "${(data as any).title}" créé sur le site (${PACK_TIER_LABEL[tier] || tier})${linked ? ` — lié à ${linked}` : ''}. Visible sur fikconciergerie.com/packs.${photoNote}`;
}

async function setPackStatusTool(input: Record<string, unknown>): Promise<string> {
  const query  = (input['pack_query'] as string | undefined)?.trim();
  const status = (input['status'] as string | undefined)?.trim();
  if (!query || !status) return '❌ pack_query et status requis.';
  const valid = ['disponible', 'indisponible', 'coming_soon'];
  if (!valid.includes(status)) return `❌ Statut invalide. Utilise: ${valid.join(', ')}.`;
  const { data: packs, error } = await supabase.from('packs').select('id, title').ilike('title', `%${query}%`).limit(5);
  if (error) return `❌ Erreur Supabase: ${error.message}`;
  if (!packs || packs.length === 0) return `❌ Aucun pack trouvé pour "${query}".`;
  if (packs.length > 1) return `⚠️ Plusieurs packs:\n${(packs as any[]).map(p => `• ${p.title}`).join('\n')}\nPrécise lequel.`;
  const p = (packs as any[])[0];
  const { error: upErr } = await supabase.from('packs').update({ status }).eq('id', p.id);
  if (upErr) return `❌ Échec: ${upErr.message}`;
  return `✅ Pack "${p.title}" → ${status}.`;
}

async function updatePropertyStatusTool(input: Record<string, unknown>): Promise<string> {
  const query  = (input['property_query'] as string | undefined)?.trim();
  const status = (input['new_status'] as string | undefined)?.trim();
  if (!query || !status) return '❌ property_query et new_status requis.';
  const valid = ['loue', 'vendu', 'disponible', 'coming_soon'];
  if (!valid.includes(status)) return `❌ Statut invalide. Utilise: ${valid.join(', ')}.`;

  const { data: props, error } = await supabase.from('properties')
    .select('id, title, city, transaction, price, currency')
    .or(`title.ilike.%${query}%,city.ilike.%${query}%`).limit(5);
  if (error) return `❌ Erreur Supabase: ${error.message}`;
  if (!props || props.length === 0) return `❌ Aucun bien trouvé pour "${query}".`;
  if (props.length > 1) return `⚠️ Plusieurs biens correspondent à "${query}":\n${(props as any[]).map(p => `• ${p.title} (${p.city})`).join('\n')}\nPrécise lequel.`;

  const p = (props as any[])[0];
  const { error: upErr } = await supabase.from('properties').update({ status }).eq('id', p.id);
  if (upErr) return `❌ Échec mise à jour: ${upErr.message}`;

  const clientName = input['client_name'] as string | undefined;
  if (clientName && (status === 'loue' || status === 'vendu')) {
    await logClientDeal({
      client_name: clientName, client_phone: input['client_phone'] as string | undefined,
      deal_type: status === 'vendu' ? 'vente_immo' : 'location_immo',
      item_table: 'properties', item_id: String(p.id), item_label: p.title,
      amount: input['amount'] as number | undefined, currency: p.currency,
    });
  }
  const label = status === 'loue' ? 'LOUÉ' : status === 'vendu' ? 'VENDU' : status;
  return `✅ "${p.title}" marqué ${label} sur le site${clientName ? ` (client: ${clientName})` : ''}. Le bien n'apparaît plus dans les disponibilités.`;
}

async function getVehicleSalePhotoTool(input: Record<string, unknown>): Promise<string> {
  const raw = (input['vehicle_query'] as string | undefined)?.trim() || '';
  const wantAll = !raw || /^(tous|toutes|tout|all|les?\s+voitures?|v[eé]hicules?)/i.test(raw);

  let q = supabase.from('vehicles_for_sale').select('id, brand, model, image_url, vehicle_sale_photos(url, position)');
  if (!wantAll) q = q.or(`brand.ilike.%${raw}%,model.ilike.%${raw}%`);
  const { data: vs, error } = await q.limit(wantAll ? 20 : 5);
  if (error) return `❌ Erreur Supabase: ${error.message}`;
  if (!vs || vs.length === 0) return wantAll ? 'Aucune voiture à vendre enregistrée.' : `❌ Aucune voiture à vendre trouvée pour "${raw}".`;

  const targets = wantAll ? (vs as any[]) : [(vs as any[]).find(x => x.image_url || (x.vehicle_sale_photos && x.vehicle_sale_photos.length > 0)) ?? vs[0]];
  const { emitProactive } = await import('../notifications/mobile-push.js');
  let totalSent = 0;
  const sentNames: string[] = [];

  for (const v of targets) {
    const extra: string[] = (v.vehicle_sale_photos ?? [])
      .sort((a: any, b: any) => a.position - b.position).map((p: any) => p.url as string).filter(Boolean);
    const urls: string[] = extra.length > 0 ? extra : (v.image_url ? [v.image_url as string] : []);
    if (urls.length === 0) continue;
    const name = `${v.brand} ${v.model}`;
    for (let i = 0; i < urls.length; i++) {
      const label = urls.length > 1 ? `${name} — photo ${i + 1}/${urls.length}` : name;
      emitProactive(label, 'info', `${label}\n${urls[i]}`);
      totalSent++;
      await new Promise(r => setTimeout(r, 350));
    }
    sentNames.push(name);
  }
  if (totalSent === 0) return '⚠️ Voitures trouvées mais aucune n\'a de photo. Ajoute des photos dans l\'admin du site.';
  return `✅ ${totalSent} photo(s) envoyée(s) pour : ${sentNames.join(', ')}.`;
}

async function listVehiclesForSaleTool(input: Record<string, unknown>): Promise<string> {
  const status = (input['status'] as string | undefined)?.trim();
  let q = supabase.from('vehicles_for_sale').select('id, brand, model, year, price, currency, status, mileage').order('created_at', { ascending: false });
  if (status) q = q.eq('status', status);
  const { data, error } = await q.limit(50);
  if (error) return `❌ Erreur Supabase: ${error.message}`;
  if (!data || data.length === 0) return status ? `Aucune voiture à vendre avec le statut "${status}".` : 'Aucune voiture à vendre enregistrée.';
  const cur = (c: string) => (c === 'DZD' ? 'DA' : '€');
  const lines = (data as any[]).map(v => `🚗 ${v.brand} ${v.model}${v.year ? ` (${v.year})` : ''} — ${v.price ? Number(v.price).toLocaleString() + ' ' + cur(v.currency) : 'prix sur demande'} · ${v.mileage != null ? v.mileage + ' km · ' : ''}statut: ${v.status}`);
  return `${data.length} voiture(s) à vendre :\n${lines.join('\n')}`;
}

async function markVehicleSoldTool(input: Record<string, unknown>): Promise<string> {
  const query  = (input['vehicle_query'] as string | undefined)?.trim();
  const status = ((input['new_status'] as string | undefined)?.trim()) || 'vendu';
  if (!query) return '❌ vehicle_query requis.';
  const valid = ['vendu', 'reserve', 'disponible'];
  if (!valid.includes(status)) return `❌ Statut invalide. Utilise: ${valid.join(', ')}.`;

  const { data: vs, error } = await supabase.from('vehicles_for_sale')
    .select('id, brand, model, price, currency')
    .or(`brand.ilike.%${query}%,model.ilike.%${query}%`).limit(5);
  if (error) return `❌ Erreur Supabase: ${error.message}`;
  if (!vs || vs.length === 0) return `❌ Aucune voiture à vendre trouvée pour "${query}".`;
  if (vs.length > 1) return `⚠️ Plusieurs voitures correspondent:\n${(vs as any[]).map(v => `• ${v.brand} ${v.model}`).join('\n')}\nPrécise laquelle.`;

  const v = (vs as any[])[0];
  const { error: upErr } = await supabase.from('vehicles_for_sale').update({ status }).eq('id', v.id);
  if (upErr) return `❌ Échec mise à jour: ${upErr.message}`;

  const clientName = input['client_name'] as string | undefined;
  if (clientName && status === 'vendu') {
    await logClientDeal({
      client_name: clientName, client_phone: input['client_phone'] as string | undefined,
      deal_type: 'vente_voiture', item_table: 'vehicles_for_sale', item_id: String(v.id),
      item_label: `${v.brand} ${v.model}`, amount: input['amount'] as number | undefined, currency: v.currency,
    });
  }
  const label = status === 'vendu' ? 'VENDUE' : status === 'reserve' ? 'RÉSERVÉE' : status;
  return `✅ ${v.brand} ${v.model} marquée ${label} sur le site${clientName ? ` (acheteur: ${clientName})` : ''}.`;
}

async function recordClientDealTool(input: Record<string, unknown>): Promise<string> {
  const clientName = (input['client_name'] as string | undefined)?.trim();
  const dealType   = (input['deal_type'] as string | undefined)?.trim();
  if (!clientName || !dealType) return '❌ client_name et deal_type requis.';
  await logClientDeal({
    client_name: clientName, client_phone: input['client_phone'] as string | undefined,
    deal_type: dealType, item_label: input['item_label'] as string | undefined,
    amount: input['amount'] as number | undefined, notes: input['notes'] as string | undefined,
  });
  return `✅ Opération enregistrée pour ${clientName} (${dealType}).`;
}

async function getClientHistoryTool(input: Record<string, unknown>): Promise<string> {
  const query = (input['client_query'] as string | undefined)?.trim();
  if (!query) return '❌ client_query requis.';

  // 1) Réservations voiture (table bookings)
  const { data: bookings } = await supabase.from('bookings')
    .select('client_name, client_phone, start_date, end_date, total_price, currency, status')
    .or(`client_name.ilike.%${query}%,client_phone.ilike.%${query}%`).order('created_at', { ascending: false }).limit(20);

  // 2) Autres opérations (client_deals)
  const { data: deals } = await supabase.from('client_deals')
    .select('deal_type, item_label, amount, currency, status, created_at')
    .or(`client_name.ilike.%${query}%,client_phone.ilike.%${query}%`).order('created_at', { ascending: false }).limit(20);

  const lines: string[] = [];
  if (bookings && bookings.length) {
    lines.push(`🚗 Locations voiture (${bookings.length}) :`);
    (bookings as any[]).forEach(b => lines.push(`  • ${b.start_date} → ${b.end_date} · ${b.total_price ? b.total_price + ' ' + (b.currency === 'EUR' ? '€' : 'DA') : '—'} · ${b.status}`));
  }
  if (deals && deals.length) {
    lines.push(`📋 Autres opérations (${deals.length}) :`);
    (deals as any[]).forEach(d => lines.push(`  • ${d.deal_type} — ${d.item_label ?? ''} · ${d.amount ? d.amount + ' ' + (d.currency || 'DA') : ''} · ${d.status} (${String(d.created_at).slice(0, 10)})`));
  }
  if (lines.length === 0) return `Aucun historique trouvé pour "${query}".`;

  // Détermine le profil
  const types = new Set<string>();
  if (bookings?.length) types.add('locataire voiture');
  (deals as any[] | null)?.forEach(d => {
    if (d.deal_type === 'location_immo') types.add('locataire immobilier');
    if (d.deal_type === 'vente_immo') types.add('acheteur immobilier');
    if (d.deal_type === 'vente_voiture') types.add('acheteur voiture');
  });
  const profil = types.size ? `\n👤 Profil: ${[...types].join(', ')}` : '';
  return `Historique de "${query}" :${profil}\n${lines.join('\n')}`;
}

// ─── OBSIDIAN BRAIN ───────────────────────────────────────────────────────────

async function obsidianFindVaultTool(): Promise<string> {
  const { isNexusOnline } = await import('../actions/handlers/nexus-relay.js');
  if (!isNexusOnline()) return '❌ Nexus hors ligne — allume le PC et lance start.bat.';
  const { emitToNexusWithAck } = await import('../actions/handlers/nexus-relay.js');
  const { resetVaultCache } = await import('./obsidian-bridge.js');
  resetVaultCache();
  try {
    const res = await emitToNexusWithAck<{ ok: boolean; vault?: string; all_vaults?: string[] }>(
      'nexus:find_obsidian_vault', {}, 20000,
    );
    if (res.ok && res.vault) {
      process.env['OBSIDIAN_VAULT_PATH'] = res.vault;
      const all = res.all_vaults?.length ? `\nAutres vaults trouvés: ${res.all_vaults.slice(1).join(', ')}` : '';
      return `✅ Vault Obsidian détecté: ${res.vault}${all}\n\nObsidian Brain opérationnel. Tu peux maintenant utiliser obsidian_read_client, obsidian_update_client, etc.`;
    }
    return '⚠️ Aucun vault Obsidian trouvé sur le PC. Ouvre Obsidian d\'abord et relance la détection.';
  } catch (e) {
    return `❌ Détection échouée: ${e instanceof Error ? e.message : String(e)}. Redémarre Nexus (nexus.py sur le PC) si le problème persiste.`;
  }
}

async function obsidianReadClientTool(input: Record<string, unknown>): Promise<string> {
  const clientName = (input['client_name'] as string | undefined)?.trim();
  if (!clientName) return '❌ client_name requis.';
  const { readClientNote, getVaultPath } = await import('./obsidian-bridge.js');
  const vault = await getVaultPath();
  if (!vault) return '⚠️ Obsidian non configuré. NEXUS hors ligne ou OBSIDIAN_VAULT_PATH non défini. Dis à Kouider de définir la variable ou de lancer Nexus.';
  const content = await readClientNote(clientName);
  if (!content) return `📭 Aucune fiche Obsidian pour "${clientName}". Utilise obsidian_update_client pour en créer une.`;
  return `📓 Fiche Obsidian — ${clientName}:\n\n${content}`;
}

async function obsidianUpdateClientTool(input: Record<string, unknown>): Promise<string> {
  const clientName = (input['client_name'] as string | undefined)?.trim();
  if (!clientName) return '❌ client_name requis.';
  const { writeClientNote, buildClientNote, getVaultPath } = await import('./obsidian-bridge.js');
  const vault = await getVaultPath();
  if (!vault) return '⚠️ Obsidian non configuré. NEXUS hors ligne ou OBSIDIAN_VAULT_PATH non défini.';
  const content = buildClientNote({
    name:         clientName,
    phone:        (input['phone']         as string | undefined),
    status:       (input['status']        as 'VIP' | 'FREQUENT' | 'REGULAR' | 'NEW' | undefined),
    preferredCar: (input['preferred_car'] as string | undefined),
    totalRentals: (input['total_rentals'] as number | undefined),
    notes:        (input['notes']         as string | undefined),
    lastRental:   (input['last_rental']   as string | undefined),
  });
  const ok = await writeClientNote(clientName, content);
  return ok
    ? `✅ Fiche Obsidian mise à jour pour ${clientName}.\n\n${content}`
    : `❌ Échec écriture fiche Obsidian pour ${clientName}. Vérifier que Nexus est connecté.`;
}

async function obsidianListClientsTool(): Promise<string> {
  const { listClientNotes, getVaultPath } = await import('./obsidian-bridge.js');
  const vault = await getVaultPath();
  if (!vault) return '⚠️ Obsidian non configuré. NEXUS hors ligne ou OBSIDIAN_VAULT_PATH non défini.';
  const clients = await listClientNotes();
  if (clients.length === 0) return '📭 Aucune fiche client dans Obsidian. Utilise obsidian_update_client pour en créer.';
  return `📓 Clients dans Obsidian (${clients.length}):\n${clients.map(c => `• ${c}`).join('\n')}`;
}

async function obsidianWriteNoteTool(input: Record<string, unknown>): Promise<string> {
  const noteName = (input['note_name'] as string | undefined)?.trim();
  const content  = (input['content']   as string | undefined)?.trim();
  if (!noteName || !content) return '❌ note_name et content requis.';
  const { writeNote, getVaultPath } = await import('./obsidian-bridge.js');
  const vault = await getVaultPath();
  if (!vault) return '⚠️ Obsidian non configuré. NEXUS hors ligne ou OBSIDIAN_VAULT_PATH non défini.';
  const ok = await writeNote(noteName, content);
  return ok
    ? `✅ Note Obsidian "${noteName}" enregistrée (${content.length} chars).`
    : `❌ Échec écriture note Obsidian "${noteName}".`;
}

async function obsidianReadNoteTool(input: Record<string, unknown>): Promise<string> {
  const noteName = (input['note_name'] as string | undefined)?.trim();
  if (!noteName) return '❌ note_name requis.';
  const { readNote, getVaultPath } = await import('./obsidian-bridge.js');
  const vault = await getVaultPath();
  if (!vault) return '⚠️ Obsidian non configuré. NEXUS hors ligne ou OBSIDIAN_VAULT_PATH non défini.';
  const content = await readNote(noteName);
  if (!content) return `📭 Note "${noteName}" introuvable dans Obsidian.`;
  return `📓 Note Obsidian "${noteName}":\n\n${content}`;
}

// ─── POSITION GPS ACTEUR ─────────────────────────────────────────────────────
async function getMyLocationTool(sessionId?: string): Promise<string> {
  const { getLocation } = await import('./location.js');
  const actorId = sessionId?.includes('houari') ? 'houari' : 'kouider';
  const loc = await getLocation(actorId);
  if (!loc) {
    return '📍 Position non disponible — ouvre l\'application et appuie sur "Partager ma position" dans CONFIG.';
  }
  const age = Math.round((Date.now() - new Date(loc.updated_at).getTime()) / 60000);
  const city = loc.city ?? loc.country;
  const countryEmoji = loc.country === 'Algeria' ? '🇩🇿' : loc.country === 'Belgium' ? '🇧🇪' : loc.country === 'France' ? '🇫🇷' : '🌍';
  return [
    `📍 Position actuelle: **${city}** ${countryEmoji}`,
    `Coordonnées: ${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}`,
    `Pays: ${loc.country}`,
    `Mise à jour: il y a ${age < 60 ? `${age} min` : `${Math.round(age / 60)}h`}`,
  ].join('\n');
}

// ─── TRAJET TEMPS RÉEL ────────────────────────────────────────────────────────
async function getTravelTimeTool(input: Record<string, unknown>, sessionId?: string): Promise<string> {
  const { getTravelTime } = await import('./maps.js');
  const destination = input['destination'] as string | undefined;
  let originLat     = input['origin_lat']  as number | undefined;
  let originLng     = input['origin_lng']  as number | undefined;
  const arrivalTime = input['arrival_time'] as string | undefined;

  if (!destination) return '❌ destination requis.';

  // Auto-fallback: use stored GPS location when not provided
  if (originLat === undefined || originLng === undefined) {
    const { getLocation } = await import('./location.js');
    const actorId = sessionId?.includes('houari') ? 'houari' : 'kouider';
    const stored  = await getLocation(actorId);
    if (stored) {
      originLat = stored.lat;
      originLng = stored.lng;
    } else {
      return '❌ Position GPS non disponible. Partage ta position depuis CONFIG dans l\'application, puis réessaie.';
    }
  }

  const result = await getTravelTime(originLat, originLng, destination, arrivalTime);

  const trafficEmoji = result.traffic === 'heavy' ? '🔴' : result.traffic === 'light' ? '🟢' : result.traffic === 'unknown' ? '⚪' : '🟡';
  const lines = [
    `🗺️ **Trajet → ${result.destination_label}**`,
    `⏱ Durée: **${result.travel_time_minutes} min** ${trafficEmoji} (trafic ${result.traffic === 'unknown' ? 'non disponible' : result.traffic})`,
    `📏 Distance: ${result.distance_km} km`,
    arrivalTime ? `🚀 Partir à: **${result.recommended_departure}**` : '',
    ``,
    `📍 Navigation:`,
    `• Waze: ${result.waze_link}`,
    `• Google Maps: ${result.maps_link}`,
    result.error ? `\n⚠️ ${result.error}` : '',
  ].filter(l => l !== undefined);

  return lines.join('\n');
}

// ── Calculate Delivery Fee Tool ───────────────────────────────────────────────
// Dépôt Fik Conciergerie — Es Sénia, Oran
const DEPOT_LAT = 35.6459;
const DEPOT_LNG = -0.6050;

async function calculateDeliveryFeeTool(input: Record<string, unknown>): Promise<string> {
  const { getTravelTime } = await import('./maps.js');
  const clientAddress = String(input['client_address'] ?? '').trim();
  const carName       = String(input['car_name'] ?? '').trim();
  const ratePerKm     = Number(input['rate_per_km'] ?? 200);

  if (!clientAddress) return '❌ client_address requis.';

  const result = await getTravelTime(DEPOT_LAT, DEPOT_LNG, clientAddress);

  if (result.error && result.distance_km === 0) {
    return `❌ Adresse non reconnue: "${clientAddress}"\nEssaie: "aéroport", "Bir El Djir", "centre-ville", "Ain Turk", "Arzew", ou adresse complète.`;
  }

  const fee     = Math.round(result.distance_km * ratePerKm);
  const feeNote = result.error ? ' (estimation — GPS API non configurée)' : '';
  const carNote = carName ? ` — ${carName}` : '';

  const lines = [
    `🚗 **Livraison${carNote}**`,
    `📍 Dépôt Es Sénia → ${result.destination_label}`,
    ``,
    `📏 Distance: **${result.distance_km} km**`,
    `⏱ Trajet: **${result.travel_time_minutes} min**`,
    `💰 Frais livraison: **${fee} DZD** (${ratePerKm} DZD/km${feeNote})`,
    ``,
    `🗺️ Navigation:`,
    `• Waze: ${result.waze_link}`,
    `• Google Maps: ${result.maps_link}`,
    result.error ? `\n⚠️ ${result.error}` : '',
  ].filter(l => l !== undefined);

  return lines.join('\n');
}

// ── Habit Tracker Tool ────────────────────────────────────────────────────────

async function trackHabitTool(input: Record<string, unknown>): Promise<string> {
  const habitName   = String(input['habit_name']   ?? '').trim().toLowerCase().replace(/\s+/g, '_');
  const description = String(input['description']  ?? '').trim();
  const scheduleType= String(input['schedule_type'] ?? 'daily') as 'daily' | 'weekly' | 'interval' | 'condition';
  const actionType  = String(input['action_type']  ?? 'remind') as 'remind' | 'check' | 'notify';
  const active      = input['active'] !== false;

  if (!habitName || !description) return '❌ habit_name et description requis.';

  const payload: Record<string, unknown> = {
    user_id:      'kouider',
    habit_name:   habitName,
    description,
    schedule_type: scheduleType,
    action_type:   actionType,
    action_data:   { message: description },
    active,
    streak_days:  0,
    missed_count: 0,
  };
  if (input['schedule_cron'])  payload['schedule_cron']  = input['schedule_cron'];
  if (input['interval_hours']) payload['interval_hours'] = Number(input['interval_hours']);

  const { data: existing } = await supabase
    .from('memory_habits')
    .select('id')
    .eq('user_id', 'kouider')
    .eq('habit_name', habitName)
    .limit(1)
    .single();

  if (existing?.id) {
    await supabase.from('memory_habits').update({ ...payload, streak_days: undefined, missed_count: undefined }).eq('id', existing.id);
    return `✅ Habitude *${habitName}* mise à jour — ${description}${active ? '' : ' (désactivée)'}`;
  }

  const { error } = await supabase.from('memory_habits').insert(payload);
  if (error) return `❌ Erreur sauvegarde habitude: ${error.message}`;
  return `✅ Habitude *${habitName}* enregistrée — ${description}\n📅 Suivi: ${scheduleType} · Action: ${actionType}`;
}

// ── Get Client Profile Tool ───────────────────────────────────────────────────

async function getClientProfileTool(clientName: string): Promise<string> {
  if (!clientName) return '❌ Nom client requis.';
  const result = await getClientProfile(clientName);
  if (!result.exists || !result.profile) {
    return `❌ Aucun profil client trouvé pour "${clientName}". Ce client n'a peut-être pas encore de réservation enregistrée.`;
  }
  const p = result.profile;
  const lines = [
    `👤 *PROFIL CLIENT: ${p.client_name}*`,
    `📞 ${p.client_phone ?? 'Téléphone non renseigné'}`,
    ``,
    `📊 *Score: ${p.score}* | Réservations: ${p.total_bookings} | Total dépensé: ${Math.round(p.total_spent)}€`,
    p.last_booking_date ? `📅 Dernière résa: ${p.last_booking_date}` : '',
    ``,
    `🚗 Voitures préférées: ${p.preferred_cars.length ? p.preferred_cars.join(', ') : 'Non déterminé'}`,
    p.avoided_cars.length ? `🚫 Voitures évitées: ${p.avoided_cars.join(', ')}` : '',
    `⏱ Durée typique: ${p.typical_duration_days ? `${p.typical_duration_days} jours` : 'Variable'}`,
    p.typical_months.length ? `📆 Mois favoris: ${p.typical_months.map(m => new Date(2024, m - 1).toLocaleString('fr-FR', { month: 'long' })).join(', ')}` : '',
    ``,
    `💳 Fiabilité paiement: ${p.payment_reliability}`,
    `🤝 Style négociation: ${p.negotiation_style}`,
    p.avg_discount_asked > 0 ? `💸 Remise moyenne demandée: ${Math.round(p.avg_discount_asked)}%` : '',
    p.cancellation_count > 0 ? `⚠️ Annulations: ${p.cancellation_count}` : '',
    p.notes ? `\n📝 Notes: ${p.notes}` : '',
  ].filter(Boolean);
  return lines.join('\n');
}

// ── Client Brain Tools ────────────────────────────────────────────────────────

async function getClientBrainTool(nameOrPhone: string, sessionId?: string): Promise<string> {
  if (!nameOrPhone) return '❌ Nom ou téléphone requis.';
  const actorId = sessionId?.includes('houari') ? 'houari' : 'kouider';
  const result = await getClientBrain(nameOrPhone, actorId);
  if (!result.found) {
    return `❌ Aucun client trouvé pour "${nameOrPhone}". Vérifie le nom ou le numéro.`;
  }
  return result.context;
}

async function addClientNoteTool(nameOrPhone: string, note: string, sessionId?: string): Promise<string> {
  if (!nameOrPhone || !note) return '❌ Nom/téléphone et note requis.';
  const actorId = sessionId?.includes('houari') ? 'houari' : 'kouider';
  const result = await addClientNote(nameOrPhone, note, actorId);
  // Also save as observation
  await saveObservation('manual', `Note sur ${nameOrPhone}: ${note}`, actorId, undefined, nameOrPhone, 'manual').catch(() => {});
  return result;
}

async function setArrivalPatternTool(input: Record<string, unknown>, sessionId?: string): Promise<string> {
  const nameOrPhone = input['name_or_phone'] as string;
  if (!nameOrPhone) return '❌ Nom ou téléphone requis.';
  const actorId = sessionId?.includes('houari') ? 'houari' : 'kouider';
  const pattern: Record<string, string> = {};
  if (input['typical_time'])  pattern['typical_time']  = input['typical_time'] as string;
  if (input['typical_hour'])  pattern['typical_hour']  = input['typical_hour'] as string;
  if (input['typical_day'])   pattern['typical_day']   = input['typical_day'] as string;
  if (input['flight_origin']) pattern['flight_origin'] = input['flight_origin'] as string;
  if (input['notes'])         pattern['notes']         = input['notes'] as string;
  return setArrivalPattern(nameOrPhone, pattern, actorId);
}

// ── Export Comptable PDF ──────────────────────────────────────────────────────

async function exportAccountingPDF(input: Record<string, unknown>): Promise<string> {
  const now    = new Date();
  const prev   = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const year   = typeof input['year']  === 'number' ? input['year']  : prev.getFullYear();
  const month  = typeof input['month'] === 'number' ? input['month'] : prev.getMonth() + 1;

  const start  = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDay = new Date(year, month, 0).getDate();
  const end    = `${year}-${String(month).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`;

  const { data: rows, error } = await supabase
    .from('bookings')
    .select('client_name, client_phone, start_date, end_date, final_price, client_price_per_day, owner_price_per_day, profit_kouider, payment_status, paid_amount, rented_by, cars(name)')
    .lte('start_date', end)
    .gte('end_date', start)
    .order('start_date', { ascending: true });

  if (error) return `❌ Erreur Supabase: ${error.message}`;
  const bookings = (rows ?? []) as Array<Record<string, unknown>>;

  const totalCA     = bookings.reduce((s, b) => s + (Number(b['final_price'])    || 0), 0);
  const getDays = (b: Record<string, unknown>) => Math.max(1, Math.ceil((new Date(b['end_date'] as string).getTime() - new Date(b['start_date'] as string).getTime()) / 86_400_000));
  const totalOwner  = bookings.reduce((s, b) => s + (Number(b['owner_price_per_day']) || 0) * getDays(b), 0);
  // Profit Kouider = CA client - coût proprio (depuis profit_kouider ou calculé)
  const totalProfit = bookings.reduce((s, b) => {
    if (b['profit_kouider'] != null && Number(b['profit_kouider']) !== 0) return s + Number(b['profit_kouider']);
    const ownerCost = (Number(b['owner_price_per_day']) || 0) * getDays(b);
    return s + (ownerCost > 0 ? (Number(b['final_price']) || 0) - ownerCost : 0);
  }, 0);
  // Revenu Houari = somme coûts proprio
  const totalHouari = totalOwner;
  const totalPaid   = bookings.reduce((s, b) => s + (Number(b['paid_amount'])    || 0), 0);
  const unpaid      = bookings.filter(b => b['payment_status'] !== 'PAID');
  const monthLabel  = new Date(year, month - 1, 1).toLocaleString('fr-FR', { month: 'long', year: 'numeric' });

  const PDFDocument = (await import('pdfkit')).default;
  const pdfBuffer: Buffer = await new Promise<Buffer>((resolve, reject) => {
    const doc    = new PDFDocument({ size: 'A4', margins: { top: 40, bottom: 40, left: 40, right: 40 } });
    const chunks: Buffer[] = [];
    doc.on('data',  (c: Buffer) => chunks.push(c));
    doc.on('end',   ()          => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.font('Helvetica-Bold').fontSize(20).fillColor('#111').text('FIK CONCIERGERIE', { align: 'center' });
    doc.font('Helvetica').fontSize(9).fillColor('#888').text('Rapport comptable mensuel', { align: 'center' });
    doc.moveDown(0.3);
    doc.moveTo(40, doc.y).lineTo(555, doc.y).lineWidth(2).strokeColor('#111').stroke();
    doc.moveDown(0.3);
    doc.font('Helvetica-Bold').fontSize(14).fillColor('#111').text(`${monthLabel.toUpperCase()}`, { align: 'center' });
    doc.moveTo(40, doc.y).lineTo(555, doc.y).lineWidth(2).strokeColor('#111').stroke();
    doc.moveDown(0.8);

    doc.font('Helvetica-Bold').fontSize(11).fillColor('#111').text('RÉSUMÉ');
    doc.moveTo(40, doc.y).lineTo(555, doc.y).lineWidth(0.5).strokeColor('#ccc').stroke();
    doc.moveDown(0.3);
    const kpiY = doc.y;
    const kpiW = 120;
    const kpis = [
      { label: 'Réservations',      value: String(bookings.length) },
      { label: 'CA Total',          value: `${Math.round(totalCA)}€` },
      { label: 'Profit Kouider',    value: `${Math.round(totalProfit)}€` },
      { label: 'Revenu Houari',     value: `${Math.round(totalHouari)}€` },
      { label: 'Encaissé',     value: `${Math.round(totalPaid)}€` },
      { label: 'Impayés',      value: String(unpaid.length) },
    ];
    kpis.forEach((k, i) => {
      const x = 40 + (i % 3) * (kpiW + 15);
      const y = kpiY + Math.floor(i / 3) * 50;
      doc.rect(x, y, kpiW, 40).fillAndStroke('#f8f8f8', '#e0e0e0');
      doc.font('Helvetica-Bold').fontSize(16).fillColor(k.label === 'Bénéfice net' ? '#007700' : '#111').text(k.value, x, y + 6, { width: kpiW, align: 'center' });
      doc.font('Helvetica').fontSize(7).fillColor('#888').text(k.label.toUpperCase(), x, y + 26, { width: kpiW, align: 'center' });
    });
    doc.moveDown(4);

    doc.font('Helvetica-Bold').fontSize(11).fillColor('#111').text('DÉTAIL DES RÉSERVATIONS');
    doc.moveTo(40, doc.y).lineTo(555, doc.y).lineWidth(0.5).strokeColor('#ccc').stroke();
    doc.moveDown(0.3);

    const cols   = [105, 70, 60, 55, 55, 55, 60, 35];
    const labels = ['Client', 'Voiture', 'Début', 'Fin', 'CA', 'Proprio', 'Profit', 'Payé'];
    let hx = 40;
    const headerY = doc.y;
    labels.forEach((l, i) => {
      doc.font('Helvetica-Bold').fontSize(7).fillColor('#555').text(l, hx, headerY, { width: cols[i] });
      hx += cols[i];
    });
    doc.moveDown(0.4);
    doc.moveTo(40, doc.y).lineTo(555, doc.y).lineWidth(0.5).strokeColor('#ddd').stroke();
    doc.moveDown(0.2);

    for (const b of bookings) {
      if (doc.y > 730) { doc.addPage(); }
      const car = (b['cars'] as { name: string } | null)?.name ?? '—';
      const days = Math.max(1, Math.ceil((new Date(b['end_date'] as string).getTime() - new Date(b['start_date'] as string).getTime()) / 86_400_000));
      const ownerTot = (Number(b['owner_price_per_day']) || 0) * days;
      const ca       = Number(b['final_price']) || 0;
      // Profit: utilise profit_kouider si dispo, sinon calcule CA - coût proprio
      const profit   = b['profit_kouider'] != null && Number(b['profit_kouider']) !== 0
        ? Number(b['profit_kouider'])
        : ownerTot > 0 ? ca - ownerTot : null;
      const isPaid   = b['payment_status'] === 'PAID';
      const rowY2    = doc.y;
      let rx = 40;
      const rowData = [
        String(b['client_name'] ?? '—').slice(0, 16),
        car.slice(0, 12),
        String(b['start_date'] ?? '').slice(5),
        String(b['end_date']   ?? '').slice(5),
        `${Math.round(Number(b['final_price']) || 0)}€`,
        ownerTot > 0 ? `${Math.round(ownerTot)}€` : '—',
        profit != null ? `${Math.round(profit)}€` : '—',
        isPaid ? '✓' : '✗',
      ];
      const rColors = ['#111','#555','#555','#555','#111','#777', profit != null && profit >= 0 ? '#007700' : '#cc0000', isPaid ? '#007700' : '#cc0000'];
      rowData.forEach((v, i) => {
        doc.font('Helvetica').fontSize(7).fillColor(rColors[i] ?? '#111').text(v, rx, rowY2, { width: cols[i], lineBreak: false });
        rx += cols[i];
      });
      doc.moveDown(0.9);
    }

    doc.moveTo(40, 800).lineTo(555, 800).lineWidth(0.5).strokeColor('#ccc').stroke();
    doc.font('Helvetica').fontSize(7).fillColor('#aaa').text(
      `Fik Conciergerie · Généré par Dzaryx IA · ${new Date().toLocaleDateString('fr-FR')}`,
      40, 807, { width: 515, align: 'center' },
    );
    doc.end();
  });

  // Servir via Railway /api/pdf/:token — content-type application/pdf correct pour iOS
  const safePeriod = `${year}-${String(month).padStart(2, '0')}`;
  let pdfUrl = '';
  try {
    const { storePdf } = await import('../utils/pdf-store.js');
    const token = storePdf(pdfBuffer, `COMPTA_${safePeriod}.pdf`);
    pdfUrl = `${env.BACKEND_URL}/api/pdf/${token}`;
  } catch (err) {
    console.error('[exportAccountingPDF] PDF store failed:', err instanceof Error ? err.message : err);
  }
  const { emitProactive } = await import('../notifications/mobile-push.js');
  emitProactive(
    `Rapport comptable ${monthLabel} prêt`,
    'info',
    `🛰 📊 Rapport comptable ${monthLabel}\n📋 ${bookings.length} réservations | CA: ${Math.round(totalCA)}€ | Bénéfice: ${Math.round(totalProfit)}€${pdfUrl ? `\n🔗\n${pdfUrl}` : ''}`,
  );

  return `✅ Rapport comptable ${monthLabel} généré !\n📋 ${bookings.length} réservations | CA: ${Math.round(totalCA)}€ | Proprio: ${Math.round(totalOwner)}€ | Bénéfice net: ${Math.round(totalProfit)}€ | Encaissé: ${Math.round(totalPaid)}€ | Impayés: ${unpaid.length}${pdfUrl ? `\n🔗\n${pdfUrl}` : ''}`;
}


// ── Mise à jour véhicule ──────────────────────────────────────────────────────

async function updateCarTool(input: Record<string, unknown>): Promise<string> {
  let carId = input['car_id'] as string | undefined;

  // Resolve by name if no ID
  if (!carId && input['car_name']) {
    const { data } = await supabase
      .from('cars')
      .select('id, name')
      .ilike('name', `%${input['car_name']}%`)
      .limit(1)
      .single();
    if (!data) return `❌ Véhicule "${input['car_name']}" introuvable dans la flotte`;
    carId = (data as { id: string }).id;
  }
  if (!carId) return '❌ car_name ou car_id requis';

  const updates: Record<string, unknown> = {};
  if (input['available']     !== undefined) updates['available']     = input['available'];
  if (input['base_price']    !== undefined) updates['base_price']    = input['base_price'];
  if (input['resale_price']  !== undefined) updates['resale_price']  = input['resale_price'];
  if (input['description']   !== undefined) updates['description']   = input['description'];
  if (input['name']          !== undefined) updates['name']          = input['name'];
  if (input['category']      !== undefined) updates['category']      = input['category'];
  if (input['seats']         !== undefined) updates['seats']         = Number(input['seats']);
  if (input['fuel']          !== undefined) updates['fuel']          = input['fuel'];
  if (input['transmission']  !== undefined) updates['transmission']  = input['transmission'];
  if (input['image_url']     !== undefined) updates['image_url']     = input['image_url'];

  if (Object.keys(updates).length === 0) return '❌ Aucun champ à mettre à jour fourni';

  const { data, error } = await supabase
    .from('cars')
    .update(updates)
    .eq('id', carId)
    .select('name, available, base_price, resale_price')
    .single();

  if (error) return `❌ Erreur mise à jour: ${error.message}`;

  const car = data as { name: string; available: boolean; base_price: number; resale_price: number };
  const lines = [
    `✅ ${car.name} mis à jour`,
    `📍 Statut: ${car.available ? '✅ DISPONIBLE' : '🔒 EN LOCATION / INDISPONIBLE'}`,
    car.base_price   != null ? `💶 Prix client: ${car.base_price}€/j` : '',
    car.resale_price != null ? `🏠 Prix proprio: ${car.resale_price}€/j` : '',
  ].filter(Boolean);
  return lines.join('\n');
}

// ─── ANALYTICS SITE FIK ─────────────────────────────────────────────────────

async function getSiteAnalyticsTool(input: Record<string, unknown>): Promise<string> {
  const days = Number(input['days'] ?? 30);
  const since = new Date(Date.now() - days * 86400000).toISOString();

  try {
    const [pvRes, cvRes, bookRes] = await Promise.all([
      supabase.from('page_views').select('page, device, country, session_id, created_at').gte('created_at', since),
      supabase.from('car_views').select('car_id, device, country, created_at, cars(name)').gte('created_at', since),
      supabase.from('bookings').select('id, created_at, status').gte('created_at', since),
    ]);

    const pv      = pvRes.data   || [];
    const cv      = cvRes.data   || [];
    const bk      = bookRes.data || [];

    const totalViews     = pv.length;
    const uniqueSessions = new Set(pv.map((v: { session_id: string | null }) => v.session_id).filter(Boolean)).size;
    const mobileViews    = pv.filter((v: { device: string }) => v.device === 'mobile').length;
    const mobilePct      = totalViews > 0 ? Math.round((mobileViews / totalViews) * 100) : 0;

    // Top pages
    const pageCount: Record<string, number> = {};
    pv.forEach((v: { page: string }) => { pageCount[v.page] = (pageCount[v.page] || 0) + 1; });
    const topPages = Object.entries(pageCount).sort((a, b) => b[1] - a[1]).slice(0, 5);

    // Top countries
    const countryCount: Record<string, number> = {};
    pv.filter((v: { country: string | null }) => v.country).forEach((v: { country: string }) => {
      countryCount[v.country] = (countryCount[v.country] || 0) + 1;
    });
    const topCountries = Object.entries(countryCount).sort((a, b) => b[1] - a[1]).slice(0, 5);

    // Top cars
    const carCount: Record<string, number> = {};
    (cv as any[]).forEach((v: any) => {
      const name = v.cars?.name || 'Inconnu';
      carCount[name] = (carCount[name] || 0) + 1;
    });
    const topCars = Object.entries(carCount).sort((a, b) => b[1] - a[1]).slice(0, 5);

    const lines = [
      `📊 Analytics site Fik Conciergerie — ${days} derniers jours`,
      ``,
      `👁️ ${totalViews} pages vues | ${uniqueSessions} sessions uniques | ${mobilePct}% mobile`,
      `📅 ${bk.length} nouvelles demandes de réservation`,
      totalViews > 0 ? `📈 Conversion: ${Math.round((bk.length / uniqueSessions) * 100)}% des sessions` : '',
      ``,
      `📄 Pages les plus visitées:`,
      ...topPages.map(([p, n]) => `  ${p || '/'} → ${n} vues`),
      ``,
      topCars.length > 0 ? `🚗 Véhicules les plus vus:` : '',
      ...topCars.map(([n, c]) => `  ${n} → ${c} vues`),
      ``,
      topCountries.length > 0 ? `🌍 Pays:` : '',
      ...topCountries.map(([c, n]) => `  ${c}: ${n} visites`),
    ].filter(l => l !== null && l !== undefined);

    return lines.join('\n');
  } catch (err) {
    return `❌ Erreur analytics: ${err instanceof Error ? err.message : String(err)}`;
  }
}

// ─── AVIS CLIENTS ────────────────────────────────────────────────────────────

async function listReviewsTool(input: Record<string, unknown>): Promise<string> {
  const filter = input['filter'] as string || 'all'; // 'pending' | 'approved' | 'all'
  try {
    let query = supabase.from('reviews').select('*').order('created_at', { ascending: false }).limit(20);
    if (filter === 'pending')  query = supabase.from('reviews').select('*').eq('approved', false).order('created_at', { ascending: false }).limit(20);
    if (filter === 'approved') query = supabase.from('reviews').select('*').eq('approved', true).order('created_at', { ascending: false }).limit(20);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const reviews = (data || []) as Array<{ id: string; client_name: string; rating: number; comment: string; approved: boolean; created_at: string }>;
    if (reviews.length === 0) return `📭 Aucun avis ${filter === 'pending' ? 'en attente' : filter === 'approved' ? 'publié' : ''} trouvé.`;
    return [
      `⭐ ${reviews.length} avis (${filter}):`,
      ...reviews.map(r =>
        `\n[${r.id.substring(0,8)}] ${r.approved ? '✅' : '⏳'} ${r.client_name} — ${r.rating}/5\n  "${r.comment.substring(0, 100)}${r.comment.length > 100 ? '...' : ''}"`
      ),
    ].join('\n');
  } catch (err) {
    return `❌ Erreur: ${err instanceof Error ? err.message : String(err)}`;
  }
}

async function approveReviewTool(input: Record<string, unknown>): Promise<string> {
  const id = input['review_id'] as string;
  if (!id) return '❌ review_id requis';
  const { error } = await supabase.from('reviews').update({ approved: true }).eq('id', id);
  if (error) return `❌ Erreur: ${error.message}`;
  return `✅ Avis [${id.substring(0,8)}] publié sur le site.`;
}

async function deleteReviewTool(input: Record<string, unknown>): Promise<string> {
  const id = input['review_id'] as string;
  if (!id) return '❌ review_id requis';
  const { error } = await supabase.from('reviews').delete().eq('id', id);
  if (error) return `❌ Erreur: ${error.message}`;
  return `🗑️ Avis [${id.substring(0,8)}] supprimé du site.`;
}

// ─── AJOUTER VÉHICULE ───────────────────────────────────────────────────────

// Récupère les photos jointes dans le chat (uploadées via POST /api/cars/session-photos
// → cache Redis session:photos:{sessionId}) et les attache à une annonce fraîchement
// créée : insert dans la table photos + image_url = 1ère photo. Vide le cache ensuite.
// Resilient : si une table photo manque, on n'échoue pas la création.
async function attachSessionPhotos(
  sessionId: string | undefined,
  opts: { photoTable: string | null; fk: string; ownerId: string; mainTable: string },
): Promise<number> {
  if (!sessionId) return 0;
  const key = `session:photos:${sessionId}`;
  let urls: string[] = [];
  try {
    const raw = await redis.get(key);
    if (!raw) return 0;
    urls = JSON.parse(raw) as string[];
  } catch { return 0; }
  if (!urls.length) return 0;

  if (opts.photoTable) {
    let pos = 0;
    for (const url of urls) {
      try { await supabase.from(opts.photoTable).insert({ [opts.fk]: opts.ownerId, url, position: pos++ }); }
      catch { /* table photo absente → on garde au moins image_url */ }
    }
  }
  try { await supabase.from(opts.mainTable).update({ image_url: urls[0] }).eq('id', opts.ownerId); } catch { /* pas de colonne image_url */ }
  await redis.del(key).catch(() => {});
  return urls.length;
}

async function addCarTool(input: Record<string, unknown>, sessionId?: string): Promise<string> {
  const name = input['name'] as string;
  if (!name) return '❌ Le nom du véhicule est requis';

  const basePrice    = Number(input['base_price']   ?? 0);
  const resalePrice  = Number(input['resale_price']  ?? input['client_price'] ?? 0);
  const seats        = Number(input['seats']         ?? 5);
  const category     = (input['category']   as string) || 'berline';
  const fuel         = (input['fuel']       as string) || 'essence';
  const transmission = (input['transmission'] as string) || 'manuelle';
  const description  = (input['description'] as string) || null;
  const imageUrl     = (input['image_url']  as string) || null;

  const { data, error } = await supabase
    .from('cars')
    .insert({
      name, base_price: basePrice, resale_price: resalePrice,
      seats, category, fuel, transmission, description,
      image_url: imageUrl, available: true,
      created_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) return `❌ Erreur ajout véhicule: ${error.message}`;

  const car = data as { id: string; name: string };
  const nPhotos = await attachSessionPhotos(sessionId, { photoTable: 'car_photos', fk: 'car_id', ownerId: car.id, mainTable: 'cars' });
  return [
    `✅ Véhicule ajouté sur le site Fik Conciergerie`,
    `🚗 ${car.name} (ID: ${car.id})`,
    `📍 Catégorie: ${category} | ${seats} places | ${fuel}`,
    resalePrice > 0 ? `💶 Prix client: ${resalePrice}€/jour` : '',
    basePrice > 0   ? `🏠 Prix proprio: ${basePrice}€/jour` : '',
    nPhotos > 0     ? `📸 ${nPhotos} photo(s) attachée(s)` : (imageUrl ? `🖼️ Photo: ${imageUrl}` : '⚠️ Pas de photo — joins des photos dans le chat ou ajoute via l\'admin'),
    ``,
    `Le véhicule est maintenant disponible sur autolux-location.vercel.app`,
  ].filter(Boolean).join('\n');
}

// ─── SUPPRIMER VÉHICULE ─────────────────────────────────────────────────────

async function deleteCarTool(input: Record<string, unknown>): Promise<string> {
  let carId = input['car_id'] as string | undefined;
  let carName = '';

  if (!carId && input['car_name']) {
    const { data } = await supabase.from('cars').select('id, name').ilike('name', `%${input['car_name']}%`).limit(1).single();
    if (!data) return `❌ Véhicule "${input['car_name']}" introuvable`;
    carId = (data as { id: string; name: string }).id;
    carName = (data as { id: string; name: string }).name;
  }
  if (!carId) return '❌ car_name ou car_id requis';

  // Check for active bookings before delete
  const today = new Date().toISOString().slice(0, 10);
  const { data: active } = await supabase.from('bookings')
    .select('id, status').eq('car_id', carId)
    .in('status', ['ACCEPTED', 'CONFIRMED', 'ACTIVE', 'PENDING'])
    .gte('end_date', today).limit(1);

  if (active && active.length > 0) {
    return `⚠️ Impossible de supprimer ${carName || carId} — il a ${active.length} réservation(s) active(s). Annule d'abord les réservations ou marque-le indisponible.`;
  }

  const { error } = await supabase.from('cars').delete().eq('id', carId);
  if (error) return `❌ Erreur suppression: ${error.message}`;
  return `🗑️ Véhicule ${carName || carId} supprimé de la flotte et du site Fik Conciergerie.`;
}

// ─── INSPECTION VÉHICULE ────────────────────────────────────────────────────

async function saveVehicleStateBefore(
  input:      Record<string, unknown>,
  imageBase64: string | undefined,
  imageMime:   string,
  sessionId?: string,
): Promise<string> {
  const clientName = (input['client_name'] as string | undefined)?.trim();
  const carName    = (input['car_name']    as string | undefined)?.trim();
  if (!clientName || !carName) return '❌ client_name et car_name requis';

  // Try to get image from parameter, or fall back to Redis cache for this session
  let b64  = imageBase64;
  let mime = imageMime;
  if (!b64 && sessionId) {
    try {
      const cached = await redis.get(`session:image:${sessionId}`);
      if (cached) { const p = JSON.parse(cached) as { base64: string; mime: string }; b64 = p.base64; mime = p.mime; }
    } catch { /* ignore */ }
  }
  if (!b64) return '❌ Aucune image trouvée. Envoie une photo du véhicule avec ce message.';

  const result = await saveBeforeState(clientName, carName, [{ base64: b64, mime }], 'kouider');
  return result.message;
}

async function saveVehicleStateAfter(
  input:      Record<string, unknown>,
  imageBase64: string | undefined,
  imageMime:   string,
  sessionId?: string,
): Promise<string> {
  const clientName = (input['client_name'] as string | undefined)?.trim();
  const carName    = (input['car_name']    as string | undefined)?.trim();
  if (!clientName || !carName) return '❌ client_name et car_name requis';

  let b64  = imageBase64;
  let mime = imageMime;
  if (!b64 && sessionId) {
    try {
      const cached = await redis.get(`session:image:${sessionId}`);
      if (cached) { const p = JSON.parse(cached) as { base64: string; mime: string }; b64 = p.base64; mime = p.mime; }
    } catch { /* ignore */ }
  }
  if (!b64) return '❌ Aucune image trouvée. Envoie une photo du véhicule avec ce message.';

  const result = await saveAfterState(clientName, carName, [{ base64: b64, mime }], 'kouider');
  return result.message;
}

async function getVehicleStatesTool(input: Record<string, unknown>, sessionId?: string): Promise<string> {
  const clientName = (input['client_name'] as string | undefined)?.trim() ?? '';
  const carName    = (input['car_name']    as string | undefined)?.trim() ?? '';

  const ownerKey = sessionId?.includes('houari') ? 'houari' : 'kouider';
  const { getVehicleHistory } = await import('./vehicle-state.js');
  const states = await getVehicleHistory(clientName || '%', carName || '%', ownerKey);

  if (!states.length) return `ℹ️ Aucune inspection trouvée${clientName ? ` pour ${clientName}` : ''}.`;

  const lines = states.map(s => {
    const date = new Date(s.created_at).toLocaleDateString('fr-FR');
    const type = s.state_type === 'before' ? '📋 AVANT' : '🔍 APRÈS';
    const dmg  = s.damage_detected ? '⚠️ dommages' : '✅ OK';
    return `• ${type} — ${s.car_name} / ${s.client_name} — ${date} — ${dmg}`;
  });

  return `🚗 **Historique inspections:**\n\n${lines.join('\n')}`;
}

// ─── INSPECTION IMMOBILIER ──────────────────────────────────────────────────

async function getInspectionImage(
  imageBase64: string | undefined, imageMime: string, sessionId?: string,
): Promise<{ b64?: string; mime: string }> {
  let b64 = imageBase64; let mime = imageMime;
  if (!b64 && sessionId) {
    try {
      const cached = await redis.get(`session:image:${sessionId}`);
      if (cached) { const p = JSON.parse(cached) as { base64: string; mime: string }; b64 = p.base64; mime = p.mime; }
    } catch { /* ignore */ }
  }
  return { b64, mime };
}

async function savePropertyStateBefore(
  input: Record<string, unknown>, imageBase64: string | undefined, imageMime: string, sessionId?: string,
): Promise<string> {
  const clientName   = (input['client_name']   as string | undefined)?.trim();
  const propertyName = (input['property_name'] as string | undefined)?.trim() ?? (input['car_name'] as string | undefined)?.trim();
  if (!clientName || !propertyName) return '❌ client_name et property_name requis';
  const { b64, mime } = await getInspectionImage(imageBase64, imageMime, sessionId);
  if (!b64) return '❌ Aucune image trouvée. Envoie une photo du bien avec ce message.';
  const owner = sessionId?.toLowerCase().includes('houari') ? 'houari' : 'kouider';
  const result = await savePropertyBeforeState(clientName, propertyName, [{ base64: b64, mime }], owner);
  return result.message;
}

async function savePropertyStateAfter(
  input: Record<string, unknown>, imageBase64: string | undefined, imageMime: string, sessionId?: string,
): Promise<string> {
  const clientName   = (input['client_name']   as string | undefined)?.trim();
  const propertyName = (input['property_name'] as string | undefined)?.trim() ?? (input['car_name'] as string | undefined)?.trim();
  if (!clientName || !propertyName) return '❌ client_name et property_name requis';
  const { b64, mime } = await getInspectionImage(imageBase64, imageMime, sessionId);
  if (!b64) return '❌ Aucune image trouvée. Envoie une photo du bien avec ce message.';
  const owner = sessionId?.toLowerCase().includes('houari') ? 'houari' : 'kouider';
  const result = await savePropertyAfterState(clientName, propertyName, [{ base64: b64, mime }], owner);
  return result.message;
}

async function getPropertyStatesTool(input: Record<string, unknown>, sessionId?: string): Promise<string> {
  const clientName   = (input['client_name']   as string | undefined)?.trim() ?? '';
  const propertyName = (input['property_name'] as string | undefined)?.trim() ?? '';
  const ownerKey = sessionId?.toLowerCase().includes('houari') ? 'houari' : 'kouider';
  const { getPropertyHistory } = await import('./property-state.js');
  const states = await getPropertyHistory(clientName || '%', propertyName || '%', ownerKey);
  if (!states.length) return `ℹ️ Aucune inspection bien trouvée${clientName ? ` pour ${clientName}` : ''}.`;
  const lines = states.map(s => {
    const date = new Date(s.created_at).toLocaleDateString('fr-FR');
    const type = s.state_type === 'before' ? '🏠 AVANT' : '🔍 APRÈS';
    const dmg  = s.damage_detected ? '⚠️ défauts' : '✅ OK';
    return `• ${type} — ${s.property_name} / ${s.client_name} — ${date} — ${dmg}`;
  });
  return `🏠 **Historique inspections biens:**\n\n${lines.join('\n')}`;
}

// ── Smart Pricing Suggestions ─────────────────────────────────────────────────
async function suggestSmartPricingTool(input: Record<string, unknown>, _sessionId?: string): Promise<string> {
  const carId   = input['car_id']   ? String(input['car_id'])   : undefined;
  const carName = input['car_name'] ? String(input['car_name']) : undefined;

  const now       = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const todayStr  = now.toISOString().slice(0, 10);

  let carQuery = supabase
    .from('cars')
    .select('id, name, category, resale_price, owner_price_per_day, available');
  if (carId)   carQuery = carQuery.eq('id', carId);
  if (carName) carQuery = carQuery.ilike('name', `%${carName}%`);

  const { data: cars } = await carQuery.limit(carId || carName ? 1 : 20);
  if (!cars?.length) return '❌ Véhicule(s) introuvable(s).';

  const results: string[] = ['📊 SUGGESTIONS TARIFAIRES INTELLIGENTES', ''];

  for (const car of cars as Array<{
    id: string; name: string; category: string;
    resale_price?: number; owner_price_per_day?: number;
  }>) {
    const [bookingsRes, idleRes] = await Promise.all([
      supabase.from('bookings')
        .select('client_price_per_day, owner_price_per_day, nb_days, final_price, start_date, end_date')
        .eq('car_id', car.id).neq('status', 'cancelled')
        .gte('start_date', monthStart).lte('start_date', todayStr),
      supabase.from('bookings')
        .select('end_date').eq('car_id', car.id).neq('status', 'cancelled')
        .order('end_date', { ascending: false }).limit(1),
    ]);

    const bookings = bookingsRes.data ?? [];
    const totalDays = bookings.reduce((s, b: any) => s + (b.nb_days ?? 0), 0);
    const avgPrice  = bookings.length > 0
      ? Math.round(bookings.reduce((s: number, b: any) => s + (b.client_price_per_day ?? 0), 0) / bookings.length)
      : 0;
    const currentPrice = car.resale_price ?? 0;
    const ownerPrice   = car.owner_price_per_day ?? 0;

    // Calcul jours depuis dernière location
    const lastBookingDate = idleRes.data?.[0]?.end_date;
    const idleDays = lastBookingDate
      ? Math.floor((Date.now() - new Date(lastBookingDate).getTime()) / 86400000)
      : null;

    // Logique de suggestion
    let suggestion = '';
    let reason     = '';

    if (bookings.length >= 3 && avgPrice >= currentPrice) {
      // Forte demande — augmenter prix
      const newPrice = Math.round(currentPrice * 1.1 / 100) * 100;
      suggestion = `↑ Augmenter à ${newPrice}€/j (+10%)`;
      reason     = `Forte demande ce mois (${bookings.length} locations, prix moyen ${avgPrice}€)`;
    } else if (idleDays !== null && idleDays >= 10) {
      // Voiture immobile — baisser prix
      const newPrice = Math.max(ownerPrice + 500, Math.round(currentPrice * 0.9 / 100) * 100);
      suggestion = `↓ Baisser à ${newPrice}€/j (-10%)`;
      reason     = `Immobilisé depuis ${idleDays}j — attirer clients avec prix compétitif`;
    } else if (bookings.length === 0) {
      suggestion = `↓ Essayer ${Math.round(currentPrice * 0.85 / 100) * 100}€/j (-15%)`;
      reason     = `Aucune location ce mois — stimuler la demande`;
    } else {
      suggestion = `✓ Prix actuel correct (${currentPrice}€/j)`;
      reason     = `${bookings.length} location(s), ${totalDays} jours loués ce mois`;
    }

    results.push(`🚗 **${car.name}** [${car.category}]`);
    results.push(`   Prix actuel: ${currentPrice}€/j | Propriétaire: ${ownerPrice}€/j | Marge: ${currentPrice - ownerPrice}€`);
    results.push(`   Ce mois: ${bookings.length} locations, ${totalDays} jours${idleDays !== null ? `, idle ${idleDays}j` : ''}`);
    results.push(`   💡 ${suggestion}`);
    results.push(`   Raison: ${reason}`);
    results.push('');
  }

  return results.join('\n');
}

// ── Vehicle Maintenance Update ────────────────────────────────────────────────
async function updateVehicleMaintenanceTool(input: Record<string, unknown>): Promise<string> {
  const carId           = String(input['car_id']          ?? '');
  const carName         = String(input['car_name']        ?? '');
  const currentKm       = input['current_km']       != null ? Number(input['current_km'])       : undefined;
  const lastServiceDate = input['last_service_date'] != null ? String(input['last_service_date']) : undefined;
  const lastServiceKm   = input['last_service_km']   != null ? Number(input['last_service_km'])   : undefined;
  const nextServiceDate = input['next_service_date'] != null ? String(input['next_service_date']) : undefined;
  const nextServiceKm   = input['next_service_km']   != null ? Number(input['next_service_km'])   : undefined;
  const serviceNotes    = input['service_notes']    != null ? String(input['service_notes'])    : undefined;
  const intervalKm      = input['service_interval_km'] != null ? Number(input['service_interval_km']) : undefined;

  if (!carId && !carName) return '❌ Précise l\'id ou le nom du véhicule.';

  const updates: Record<string, unknown> = {};
  if (currentKm       != null) updates['current_km']          = currentKm;
  if (lastServiceDate)         updates['last_service_date']    = lastServiceDate;
  if (lastServiceKm   != null) updates['last_service_km']      = lastServiceKm;
  if (nextServiceDate)         updates['next_service_date']    = nextServiceDate;
  if (nextServiceKm   != null) updates['next_service_km']      = nextServiceKm;
  if (serviceNotes)            updates['service_notes']        = serviceNotes;
  if (intervalKm      != null) updates['service_interval_km']  = intervalKm;

  if (!Object.keys(updates).length) return '❌ Aucune donnée à mettre à jour.';

  let query = supabase.from('cars').update(updates);
  if (carId)   query = query.eq('id', carId);
  if (carName) query = query.ilike('name', `%${carName}%`);

  const { error } = await query;
  if (error) return `❌ Erreur mise à jour: ${error.message}`;

  const parts: string[] = [];
  if (currentKm       != null) parts.push(`kilométrage: ${currentKm.toLocaleString()} km`);
  if (lastServiceDate)         parts.push(`dernier entretien: ${lastServiceDate}`);
  if (nextServiceDate)         parts.push(`prochain entretien: ${nextServiceDate}`);
  if (serviceNotes)            parts.push(`notes: ${serviceNotes}`);

  return `✅ Entretien mis à jour pour ${carName || carId}: ${parts.join(', ')}`;
}

// ── Vehicle Maintenance Status ────────────────────────────────────────────────
// ═══════════ PHASE EXTRAS — charges, expirations, compteur, dégât, pricing, signature ═══════════

async function findCarRow(name?: string): Promise<{ id: string; name: string; base_price?: number | null; resale_price?: number | null; houari_resale_price?: number | null } | null> {
  if (!name?.trim()) return null;
  const { data } = await supabase.from('cars').select('id, name, base_price, resale_price, houari_resale_price').ilike('name', `%${name.trim()}%`).limit(1);
  return (data as never[] | null)?.[0] ?? null;
}
const MIG_HINT = '(si erreur "table manquante" → exécute supabase/migration_phase_extras.sql dans Supabase)';

// ── 4. ESTIMATION COÛT DÉGÂT (vision) ───────────────────────────────────────
async function estimateDamageTool(input: Record<string, unknown>, sessionId?: string): Promise<string> {
  let base64: string | undefined; let mime = 'image/jpeg';
  if (sessionId) { try { const c = await redis.get(`session:image:${sessionId}`); if (c) { const j = JSON.parse(c) as { base64: string; mime?: string }; base64 = j.base64; mime = j.mime ?? mime; } } catch { /* ignore */ } }
  if (!base64) return '❌ Envoie une photo du dégât avec ta demande.';
  const ctx = input['context'] ? String(input['context']) : '';
  try {
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    const { content } = await client.messages.create({
      model: 'claude-sonnet-4-6', max_tokens: 700,
      messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: (mime.includes('png') ? 'image/png' : 'image/jpeg') as 'image/png' | 'image/jpeg', data: base64 } },
        { type: 'text', text: `Tu es expert carrosserie auto en Algérie (Oran). Décris le(s) dégât(s) visible(s) sur ce véhicule et donne une ESTIMATION du coût de réparation en DINARS algériens (fourchette réaliste prix Oran 2026), pièce + main d'œuvre. ${ctx}\nFormat court: 1) dégâts constatés 2) réparation nécessaire 3) estimation DZD (fourchette) 4) à facturer au client oui/non. Sois honnête si la photo est floue.` },
      ] }],
    });
    const txt = (content.find(c => c.type === 'text') as { text?: string })?.text ?? '';
    return txt ? `🔧 CONSTAT DÉGÂT\n\n${txt}\n\n_⚠️ Estimation indicative — à confirmer par un carrossier._` : '❌ Analyse impossible.';
  } catch (e) {
    return `❌ Estimation échouée: ${e instanceof Error ? e.message : String(e)}`;
  }
}

// ── 5. SIGNATURE ÉLECTRONIQUE — lien de signature ───────────────────────────
async function createSignatureLinkTool(input: Record<string, unknown>): Promise<string> {
  const client = input['client_name'] ? String(input['client_name']) : undefined;
  if (!client) return '❌ Donne le nom du client.';
  const { data: bk } = await supabase.from('bookings').select('id, client_name, cars(name), start_date, end_date, final_price, currency').ilike('client_name', `%${client}%`).order('created_at', { ascending: false }).limit(1);
  const b = (bk as { id: string; client_name: string; cars?: { name?: string }; start_date?: string; end_date?: string; final_price?: number; currency?: string }[] | null)?.[0];
  if (!b) return `❌ Aucune location pour ${client}.`;
  const token = crypto.randomBytes(16).toString('hex');
  const { error } = await supabase.from('contract_signatures').insert({
    token, booking_id: b.id, client_name: b.client_name, status: 'pending',
    details: { car: b.cars?.name, start: b.start_date, end: b.end_date, price: b.final_price, currency: b.currency },
  });
  if (error) return `❌ Lien non créé. ${MIG_HINT} — ${error.message}`;
  const url = `${env.BACKEND_URL ?? 'https://ibrahim-backend-production.up.railway.app'}/sign/${token}`;
  return `✅ Lien de signature créé pour ${b.client_name} (${b.cars?.name ?? ''}):\n${url}\n\nEnvoie-le au client — il signe sur son téléphone, la signature est archivée automatiquement.`;
}

// ── 6. PRICING DYNAMIQUE APPLIQUÉ ───────────────────────────────────────────
async function applyDynamicPricingTool(input: Record<string, unknown>): Promise<string> {
  const car = await findCarRow(input['car_name'] ? String(input['car_name']) : undefined);
  if (!car) return '❌ Précise la voiture.';
  const newClient = input['new_client_price'] != null ? Number(input['new_client_price']) : null;
  const ccy = String(input['currency'] ?? 'EUR').toUpperCase();
  if (newClient == null) return '❌ Donne le nouveau prix client/jour (new_client_price).';
  // EUR → resale_price ; DZD → houari_resale_price (prix affiché par voiture)
  const col = ccy === 'DZD' ? 'houari_resale_price' : 'resale_price';
  const floor = ccy === 'DZD' ? car.houari_resale_price : car.base_price;
  if (floor != null && newClient < floor) return `❌ ${newClient} ${ccy} < prix proprio ${floor} ${ccy} — interdit de louer sous le prix proprio.`;
  const { error } = await supabase.from('cars').update({ [col]: newClient }).eq('id', car.id);
  if (error) return `❌ Mise à jour prix impossible — ${error.message}`;
  return `✅ Prix ${ccy} de ${car.name} mis à jour: **${newClient} ${ccy}/jour**${input['reason'] ? ` (${String(input['reason'])})` : ''}.`;
}

async function getVehicleMaintenanceTool(input: Record<string, unknown>): Promise<string> {
  const carName = input['car_name'] ? String(input['car_name']) : undefined;

  let query = supabase
    .from('cars')
    .select('name, category, current_km, last_service_date, last_service_km, next_service_date, next_service_km, service_interval_km, service_notes');
  if (carName) query = query.ilike('name', `%${carName}%`);

  const { data: cars, error } = await query.order('name');
  if (error || !cars?.length) return '❌ Données entretien indisponibles.';

  const today = new Date();
  const lines: string[] = ['🔧 ÉTAT ENTRETIEN PARC AUTO', ''];

  for (const car of cars as Array<{
    name: string; category: string; current_km?: number;
    last_service_date?: string; next_service_date?: string;
    service_interval_km?: number; service_notes?: string;
  }>) {
    const kmInfo = car.current_km ? `${car.current_km.toLocaleString()} km` : 'km inconnu';
    let statusEmoji = '❓';
    let statusText  = 'Aucune donnée';

    if (car.next_service_date) {
      const diff = Math.ceil((new Date(car.next_service_date).getTime() - today.getTime()) / 86400000);
      if (diff < 0)   { statusEmoji = '🔴'; statusText = `EN RETARD de ${Math.abs(diff)}j`; }
      else if (diff <= 14) { statusEmoji = '🟡'; statusText = `dans ${diff}j`; }
      else                 { statusEmoji = '🟢'; statusText = `dans ${diff}j`; }
    }

    lines.push(`${statusEmoji} **${car.name}** [${car.category}] — ${kmInfo}`);
    if (car.last_service_date) lines.push(`   Dernier entretien: ${car.last_service_date}`);
    if (car.next_service_date) lines.push(`   Prochain: ${car.next_service_date} (${statusText})`);
    if (car.service_notes)     lines.push(`   Notes: ${car.service_notes}`);
    lines.push('');
  }

  return lines.join('\n');
}
