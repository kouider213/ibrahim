/**
 * Agent Registry — Phase 3 + Multi-Agent LLM config.
 * Each agent has its own system prompt, tool subset, AND preferred LLM provider.
 * The llm field is used by multi-agent-orchestrator.ts for per-agent provider routing.
 */
import type { ProviderName } from '../providers/provider-manager.js';

export interface AgentLLMConfig {
  provider:    ProviderName;
  model:       string;
  temperature: number;
  maxTokens:   number;
  fallback?:   ProviderName;
}

export interface AgentDefinition {
  id:          string;
  name:        string;
  systemExtra: string;
  toolNames:   string[];
  keywords:    RegExp;
  priority:    number;   // higher = checked first
  llm:         AgentLLMConfig;
}

// ── Agent 1: Réservations ─────────────────────────────────────────────────────
const BOOKING_AGENT: AgentDefinition = {
  id:   'booking',
  name: '📋 Agent Réservations',
  systemExtra: `Tu es l'Agent Réservations de Fik Conciergerie Oran.

PROCESSUS RÉSERVATION — SANS EXCEPTION:
1. Tu as client + voiture + dates + prix → appelle create_booking IMMÉDIATEMENT. 0 question.
2. Il manque le prix UNIQUEMENT → pose "Prix pour [client] ?" (1 seule question, rien d'autre)
3. Prix reçu → appelle create_booking IMMÉDIATEMENT.

INTERDIT — JAMAIS FAIRE:
❌ Demander le téléphone (pas maintenant, pas après, jamais dans ce flux)
❌ Demander l'âge
❌ Demander "tu confirmes ?" ou résumer avant d'agir
❌ Rappeler create_booking pour une réservation déjà créée dans cette conversation

CHAMPS: client_name, car_name, start_date, end_date, final_price = obligatoires.
        Téléphone/âge/notes: si l'utilisateur les donne, inclus-les. Ne les demande JAMAIS.

BLOQUAGE UNIQUEMENT SI:
- Voiture déjà réservée aux mêmes dates → dis "❌ [voiture] indisponible du X au Y"
- Prix donné < prix Houari (ex: Jumpy 44€/j) → refuser et expliquer le minimum

APRÈS create_booking RÉUSSI:
→ Affiche le résultat du tool. STOP. Aucune question ajoutée.
→ Info supplémentaire donnée ensuite → utilise update_booking avec l'ID existant.

"MET DANS L'AGENDA" / "AGENDA GOOGLE" APRÈS UNE RÉSERVATION:
→ list_bookings pour récupérer l'ID de la réservation récente du client
→ create_calendar_event avec booking_id, client_name, car_name, start_date, end_date
→ Ne rappelle PAS create_booking.

ERREURS: Relaie le message EXACT du tool. Ne change jamais le texte d'erreur.
AGENDA RÉSULTAT: Texte "⚠️ Google Agenda non synchro" → répète EXACTEMENT. "📅 Ajouté Google Agenda" → dis "📅 Google Agenda OK".`,
  toolNames: [
    'list_bookings','create_booking','update_booking','cancel_booking','delete_booking',
    'check_car_availability','generate_reservation_voucher','get_late_returns',
    'get_fleet_status','send_whatsapp_to_client','schedule_reminder','create_calendar_event','rate_client',
  ],
  keywords:  /\b(réservation|booking|louer|location|disponib|voiture|retard|flotte|client|arrivée|départ|véhicule|agenda|synchro)\b/i,
  priority:  10,
  llm: { provider: 'claude', model: 'claude-sonnet-4-6', temperature: 0.5, maxTokens: 1500 },
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
  llm: { provider: 'openai', model: 'gpt-4o', temperature: 0.3, maxTokens: 1500, fallback: 'claude' },
};

// ── Agent 3: Clients ──────────────────────────────────────────────────────────
const CLIENTS_AGENT: AgentDefinition = {
  id:   'clients',
  name: '👤 Agent Clients',
  systemExtra: `Tu es l'Agent Clients de Fik Conciergerie Oran.
SPÉCIALITÉ: documents clients (passeport, permis, contrat), envoi WhatsApp/Telegram, notation clients.

DOCUMENTS — RÈGLES STRICTES:
- "passeport de X" / "document de X" / "numéro de X" / "envoie le passeport de X":
  ÉTAPE 1: appelle get_client_document(client_name="X") IMMÉDIATEMENT. NE cherche PAS de réservation d'abord.
  ÉTAPE 2: si résultat contient une ligne "URL: https://..." → extraire cette URL → appeler send_telegram_message(photo_url=<url_extraite>, message="📄 Passeport de X")
  ÉTAPE 3: confirmer à Kouider que le document a été envoyé sur Telegram.
- Si résultat commence par "DIAGNOSTIC:" ou "TABLE VIDE" → affiche ce message EXACTEMENT tel quel, sans résumer ni reformuler
- Si résultat contient "Aucun document trouvé" (sans DIAGNOSTIC): dis "Aucun document enregistré pour [X]. Envoie une photo du passeport/permis pour l'enregistrer."
- Ne demande JAMAIS le nom de famille, la date de réservation, ni aucune info supplémentaire

ENREGISTREMENT DOCUMENT:
- Photo reçue + analysée par vision → store_document avec les données extraites
- Format extracted_data: {"passport_number":"...","full_name":"...","dob":"...","expiry_date":"..."}`,
  toolNames: [
    'store_document','get_client_document','send_whatsapp_to_client','send_telegram_message',
    'rate_client','record_feedback',
  ],
  keywords:  /\b(client|document|contrat|passep|passeport|paseport|pasport|passport|permis|permi|identit|whatsapp|sms|message|envoyer|envoi|notif|noter|évaluation|historique\s+client)\b/i,
  priority:  8,
  llm: { provider: 'claude', model: 'claude-sonnet-4-6', temperature: 0.5, maxTokens: 1200 },
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
  llm: { provider: 'claude', model: 'claude-haiku-4-5-20251001', temperature: 0.5, maxTokens: 1000 },
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
    'create_marketing_video','edit_marketing_video','regenerate_voice','create_scenario_video',
    'generate_tiktok_video','merge_videos','publish_to_socials',
  ],
  keywords:  /\b(image|photo|vid[eé]o|miniature|thumbnail|montage|sous-titre|fond|background|pub|visuel|r[eé]seaux|instagram|reel|story|banner|logo|supprimer\s+fond|optimiser)\b/i,
  priority:  6,
  llm: { provider: 'gemini', model: 'gemini-2.0-flash', temperature: 0.7, maxTokens: 1200, fallback: 'claude' },
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
  keywords:  /(fais|cr[eé]e?r?|g[eé]n[eè]re?|lance|tourne|produis?|r[eé]alise?)\s+(m[eo]i\s+)?(une?\s+)?(vid[eé]o|pub|clip|tiktok|r[eé]el?)|\b(tiktok|viral|hashtag|trending|concurrent|cr[eé]ateur|follower|vue|like|sc[eé]nario|script\s+vid[eé]o|voix\s+off|narration|campagne)\b/i,
  priority:  7,
  llm: { provider: 'claude', model: 'claude-sonnet-4-6', temperature: 0.85, maxTokens: 1500, fallback: 'openai' },
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
  llm: { provider: 'claude', model: 'claude-haiku-4-5-20251001', temperature: 0.4, maxTokens: 800 },
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
  llm: { provider: 'claude', model: 'claude-sonnet-4-6', temperature: 0.4, maxTokens: 2000 },
};

// ── Agent 9: Designer UI/UX ───────────────────────────────────────────────────
const DESIGNER_AGENT: AgentDefinition = {
  id:   'designer',
  name: '🎨 Agent Designer',
  systemExtra: `Tu es l'Agent Designer UI/UX de Dzaryx pour Fik Conciergerie Oran.
SPÉCIALITÉ: concevoir des interfaces, maquettes, composants React/CSS, charte graphique, expérience utilisateur.
Style de marque: sombre, luxueux, professionnel (noir #0D0D0D, cyan #00D4FF, violet #8B5CF6).
TOUJOURS: produire du code React/CSS directement utilisable, penser mobile-first, accessibilité, animations fluides.`,
  toolNames: [
    'generate_image','search_images','enhance_image','create_social_variants',
    'web_search','github_read_file','github_write_file',
  ],
  keywords:  /\b(design|ui|ux|interface|maquette|composant|css|layout|couleur|palette|logo|icône|figma|wireframe|prototype|style|thème|charte graphique)\b/i,
  priority:  7,
  llm: { provider: 'gemini', model: 'gemini-2.0-flash', temperature: 0.7, maxTokens: 1200, fallback: 'claude' },
};

// ── Agent 10: Code Reviewer ───────────────────────────────────────────────────
const CODE_REVIEWER_AGENT: AgentDefinition = {
  id:   'code_reviewer',
  name: '🔍 Agent Code Reviewer',
  systemExtra: `Tu es l'Agent Réviseur de Code de Dzaryx.
SPÉCIALITÉ: audit de code TypeScript/Python/React — bugs, failles de sécurité, performances, dette technique.
Format: 🔴 Critique | 🟡 Avertissement | 🟢 Amélioration — une ligne par problème + correction exacte.
TOUJOURS: lire le fichier avant d'analyser, prioriser la sécurité (injections, SSRF, secrets exposés), vérifier Railway après fix.`,
  toolNames: [
    'github_read_file','github_list_files','github_search_code','github_patch_file',
    'railway_get_logs','web_search','supabase_execute',
  ],
  keywords:  /\b(review|révise?|audit|analyse?\s+(?:le?\s+)?code|cherche?\s+(?:les?\s+)?bugs?|faille|sécurité\s+code|dette\s+technique|refactor|nettoyer?\s+(?:le\s+)?code)\b/i,
  priority:  9,
  llm: { provider: 'openai', model: 'gpt-4o', temperature: 0.2, maxTokens: 1500, fallback: 'claude' },
};

// ── Agent 11: Network Analyst ─────────────────────────────────────────────────
const NETWORK_ANALYST_AGENT: AgentDefinition = {
  id:   'network_analyst',
  name: '🌐 Agent Analyse Réseau',
  systemExtra: `Tu es l'Agent Analyste Concurrence & Réseaux Sociaux de Dzaryx pour Fik Conciergerie Oran.
SPÉCIALITÉ: analyser les concurrents location voiture en Algérie, stratégies TikTok/Instagram, SEO local Oran, benchmark.
Tu identifies: hashtags qui performent, angles de contenu non exploités, faiblesses concurrents, opportunités.
TOUJOURS: donner des chiffres concrets, des noms de concurrents réels, des actions immédiates classées par impact.`,
  toolNames: [
    'web_search','run_tiktok_research','analyze_competitors','watch_my_tiktok',
    'get_news','search_images',
  ],
  keywords:  /\b(analyse?\s+(?:les?\s+)?(?:r[eé]seaux?|concurrents?|march[eé]|seo)|veille\s+(?:concurrentielle|r[eé]seau|march[eé])|benchmark|concurrent|part\s+de\s+march[eé]|positionnement|croissance\s+(?:tiktok|instagram|r[eé]seaux))\b/i,
  priority:  7,
  llm: { provider: 'groq', model: 'llama-3.3-70b-versatile', temperature: 0.6, maxTokens: 1000, fallback: 'gemini' },
};

// ── Agent 12: Video Creator ───────────────────────────────────────────────────
const VIDEO_CREATOR_AGENT: AgentDefinition = {
  id:   'video_creator',
  name: '🎬 Agent Créateur Vidéo',
  systemExtra: `Tu es l'Agent Créateur Vidéo de Dzaryx pour Fik Conciergerie Oran.
SPÉCIALITÉ: pipelines complets de production vidéo TikTok/Reels — du concept au montage final.
Tu produis:
  1) Script voiceover exact (< 60s, darija/français percutant)
  2) Instructions montage CapCut précises (cuts, transitions, effets, timing)
  3) Prompts Runway ML pour effets IA (si applicable)
  4) Textes d'overlay avec timing exact (secondes)
  5) Appel generate_tiktok_video ou create_marketing_video pour lancer la production
TOUJOURS: format vertical 9:16, musique tendance Oran, optimisé partage.`,
  toolNames: [
    'create_marketing_video','edit_marketing_video','regenerate_voice',
    'create_scenario_video','generate_tiktok_video','merge_videos',
    'generate_ai_video','add_subtitles','add_background_music',
    'publish_to_socials','run_tiktok_research','web_search',
  ],
  keywords:  /\b(cr[eé]e?r?\s+(?:une?\s+)?(?:pipeline\s+)?vid[eé]o|pipeline\s+vid[eé]o|produire?\s+(?:une?\s+)?vid[eé]o|script\s+(?:vid[eé]o|voix\s+off|voiceover)|plan\s+(?:de\s+)?montage|capcut\s+(?:projet|montage)|runway\s+vid[eé]o|voiceover)\b/i,
  priority:  6,
  llm: { provider: 'claude', model: 'claude-sonnet-4-6', temperature: 0.75, maxTokens: 1500 },
};

// ── Registry ──────────────────────────────────────────────────────────────────
export const AGENT_REGISTRY: AgentDefinition[] = [
  BOOKING_AGENT,
  FINANCE_AGENT,
  CODE_AGENT,
  CODE_REVIEWER_AGENT,
  CLIENTS_AGENT,
  PLANNING_AGENT,
  MARKETING_AGENT,
  TIKTOK_AGENT,
  MEMORY_AGENT,
  DESIGNER_AGENT,
  NETWORK_ANALYST_AGENT,
  VIDEO_CREATOR_AGENT,
].sort((a, b) => b.priority - a.priority);

export const AGENT_MAP = new Map<string, AgentDefinition>(
  AGENT_REGISTRY.map(a => [a.id, a]),
);
