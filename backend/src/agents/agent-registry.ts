/**
 * Agent Registry — Phase 3
 * 8 specialized agents, each with its own system prompt + tool subset.
 */

export interface AgentDefinition {
  id:          string;
  name:        string;
  systemExtra: string;
  toolNames:   string[];
  keywords:    RegExp;
  priority:    number;   // higher = checked first
}

// ── Agent 1: Réservations ─────────────────────────────────────────────────────
const BOOKING_AGENT: AgentDefinition = {
  id:   'booking',
  name: '📋 Agent Réservations',
  systemExtra: `Tu es l'Agent Réservations de Fik Conciergerie Oran.
SPÉCIALITÉ: créer, modifier, annuler, lister les réservations. Vérifier les disponibilités. Gérer les retards et la flotte.
TOUJOURS: confirmer les dates, vérifier la disponibilité voiture avant toute création.`,
  toolNames: [
    'list_bookings','create_booking','update_booking','cancel_booking','delete_booking',
    'check_car_availability','generate_reservation_voucher','get_late_returns',
    'get_fleet_status','send_whatsapp_to_client','schedule_reminder','create_calendar_event','rate_client',
  ],
  keywords:  /\b(réservation|booking|louer|location|disponib|voiture|retard|flotte|client|arrivée|départ|véhicule)\b/i,
  priority:  10,
};

// ── Agent 2: Finance ──────────────────────────────────────────────────────────
const FINANCE_AGENT: AgentDefinition = {
  id:   'finance',
  name: '💰 Agent Finance',
  systemExtra: `Tu es l'Agent Finance de Fik Conciergerie Oran.
SPÉCIALITÉ: rapports financiers, CA, paiements, impayés, reçus, anomalies.
TOUJOURS: donner des chiffres précis avec devise (€/DZD), indiquer la période concernée.`,
  toolNames: [
    'get_financial_report','get_finance_dashboard','get_payment_status','record_payment',
    'get_revenue_report','get_unpaid_bookings','generate_receipt','check_anomalies',
    'list_bookings','get_late_returns',
  ],
  keywords:  /\b(finance|financier|paiement|payé|impayé|argent|ca|chiffre|recette|facture|reçu|bénéfice|trésorerie|revenue|encaissé|dette)\b/i,
  priority:  9,
};

// ── Agent 3: Clients ──────────────────────────────────────────────────────────
const CLIENTS_AGENT: AgentDefinition = {
  id:   'clients',
  name: '👤 Agent Clients',
  systemExtra: `Tu es l'Agent Clients de Fik Conciergerie Oran.
SPÉCIALITÉ: documents clients (passeport, permis, contrat), envoi WhatsApp/Telegram, notation clients.
TOUJOURS: vérifier l'identité avant d'envoyer des données sensibles.`,
  toolNames: [
    'store_document','get_client_document','send_whatsapp_to_client','send_telegram_message',
    'rate_client','record_feedback','list_bookings',
  ],
  keywords:  /\b(client|document|contrat|passeport|permis|whatsapp|sms|message|envoyer|notif|noter|évaluation|historique client)\b/i,
  priority:  8,
};

// ── Agent 4: Planning ─────────────────────────────────────────────────────────
const PLANNING_AGENT: AgentDefinition = {
  id:   'planning',
  name: '📅 Agent Planning',
  systemExtra: `Tu es l'Agent Planning de Fik Conciergerie Oran.
SPÉCIALITÉ: agenda, rappels, calendrier Google, météo, actualités.
TOUJOURS: confirmer le fuseau horaire (Oran = UTC+1), format dates DD/MM/YYYY.`,
  toolNames: [
    'create_calendar_event','sync_calendar','list_calendar_events','schedule_reminder',
    'get_weather','get_news','list_bookings',
  ],
  keywords:  /\b(calendrier|agenda|rappel|planifier|rdv|rendez-vous|météo|temps|actualité|news|événement|réunion|demain|semaine prochaine)\b/i,
  priority:  7,
};

// ── Agent 5: Marketing Image/Vidéo ───────────────────────────────────────────
const MARKETING_AGENT: AgentDefinition = {
  id:   'marketing',
  name: '🎨 Agent Marketing',
  systemExtra: `Tu es l'Agent Marketing visuel de Fik Conciergerie Oran.
SPÉCIALITÉ: création et optimisation d'images/vidéos pour réseaux sociaux, suppression fond, sous-titres, montage.
TOUJOURS: optimiser pour mobile (ratio 9:16 TikTok/Reels), qualité professionnelle.`,
  toolNames: [
    'analyze_image','optimize_image','create_social_variants','enhance_image','remove_background',
    'add_text_overlay','analyze_video','cut_video','add_subtitles','optimize_for_platform',
    'extract_thumbnail','add_background_music','create_video_preview',
    'generate_image','generate_ai_video','animate_car_photo','search_images',
  ],
  keywords:  /\b(image|photo|vidéo|miniature|thumbnail|montage|sous-titre|fond|background|pub|visuel|réseaux|instagram|reel|story|banner|logo|supprimer fond|optimiser)\b/i,
  priority:  6,
};

// ── Agent 6: TikTok ───────────────────────────────────────────────────────────
const TIKTOK_AGENT: AgentDefinition = {
  id:   'tiktok',
  name: '🎬 Agent TikTok',
  systemExtra: `Tu es l'Agent TikTok de Fik Conciergerie Oran.
SPÉCIALITÉ: création vidéos marketing TikTok, recherche tendances, analyse concurrents location voiture Oran.
TOUJOURS: adapter le contenu au marché algérien, hashtags en arabe + français + darija. Après création d'une vidéo, proposer de publier avec publish_to_socials.`,
  toolNames: [
    'run_tiktok_research','analyze_competitors','watch_my_tiktok',
    'create_marketing_video','edit_marketing_video','regenerate_voice',
    'create_scenario_video','create_video_project','merge_videos','generate_tiktok_video',
    'publish_to_socials',
  ],
  keywords:  /\b(tiktok|viral|hashtag|trending|concurrent|créateur|follower|vue|like|scenario|script vidéo|voix|narration|campagne)\b/i,
  priority:  6,
};

// ── Agent 7: Mémoire & Apprentissage ─────────────────────────────────────────
const MEMORY_AGENT: AgentDefinition = {
  id:   'memory',
  name: '🧠 Agent Mémoire',
  systemExtra: `Tu es l'Agent Mémoire de Dzaryx.
SPÉCIALITÉ: mémoriser, retrouver, apprendre des règles, préférences Kouider, rapports d'évolution.
TOUJOURS: confirmer ce qui a été mémorisé, citer la source si rappel.`,
  toolNames: [
    'remember_info','recall_memory','learn_rule','get_kouider_preferences',
    'get_monthly_improvement_report','get_learning_evolution','record_feedback',
  ],
  keywords:  /\b(souviens|rappelle|mémorise|retiens|oublie|préférence|habitude|apprentissage|évolution|amélioration|feedback|règle)\b/i,
  priority:  5,
};

// ── Agent 8: Code & Infra ─────────────────────────────────────────────────────
const CODE_AGENT: AgentDefinition = {
  id:   'code',
  name: '💻 Agent Code',
  systemExtra: `Tu es l'Agent Code de Dzaryx.
SPÉCIALITÉ: développement TypeScript/React, GitHub, Railway déploiement, debug, nouvelles features.
TOUJOURS: lire le fichier avant de modifier, vérifier le déploiement Railway après chaque push.`,
  toolNames: [
    'github_read_file','github_write_file','github_patch_file','github_list_files','github_search_code',
    'railway_get_logs','railway_wait_deploy','netlify_deploy','supabase_execute',
    'read_site_file','update_site_file','web_search','execute_code_task','create_new_project',
  ],
  keywords:  /\b(code|github|deploy|railway|bug|typescript|react|fichier|modifier|créer|fonction|erreur ts|patch|commit|push|netlify|supabase)\b/i,
  priority:  8,
};

// ── Registry ──────────────────────────────────────────────────────────────────
export const AGENT_REGISTRY: AgentDefinition[] = [
  BOOKING_AGENT,
  FINANCE_AGENT,
  CODE_AGENT,
  CLIENTS_AGENT,
  PLANNING_AGENT,
  MARKETING_AGENT,
  TIKTOK_AGENT,
  MEMORY_AGENT,
].sort((a, b) => b.priority - a.priority);

export const AGENT_MAP = new Map<string, AgentDefinition>(
  AGENT_REGISTRY.map(a => [a.id, a]),
);
