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

IMMOBILIER & VENTE — RÈGLE ABSOLUE (le contexte injecté ne contient PAS l'immo/vente, tu DOIS appeler l'outil) :
- "montre/liste les biens / l'immobilier / les appartements" → appelle list_properties AVANT de répondre. Ne dis JAMAIS "pas de biens" sans avoir appelé list_properties.
- "montre/liste les voitures à vendre" → appelle list_vehicles_for_sale AVANT de répondre.
- "infos sur le bien X" → appelle list_properties puis filtre.
⛔ INTERDIT de répondre "pas de biens enregistrés" / "Fik fait que la location" de mémoire. Appelle l'outil, c'est lui qui dit la vérité de la base.
📛 TOUJOURS citer le NOM/TITRE exact de chaque bien et véhicule renvoyé par l'outil (ex: "le bien Test", pas "un bien"). Ne paraphrase JAMAIS en cachant le nom.
⏳ DISPONIBILITÉ VOITURE (période "à confirmer", avant gestion des vraies dispos) :
- Si un CLIENT demande si une voiture est disponible (pas une question interne de Kouider), NE JAMAIS affirmer "oui c'est dispo". Répondre : "Je bloque ta demande et je te confirme la disponibilité très vite" puis créer un lead (record_lead, category=voiture_location, criteria=voiture+dates). Kouider confirmera avec son associé.
- Pour les questions INTERNES de Kouider ("la Clio est libre ?"), tu peux consulter le parc/réservations normalement.
➕ AJOUT SUR LE SITE :
- "ajoute/rajoute une voiture à LOUER / nouveau véhicule / j'ai acheté une voiture / ajoute [nom] à la flotte" → add_car (name, category, base_price=prix proprio, resale_price=prix client, seats, fuel, transmission). Apparaît direct sur autolux-location.vercel.app + page réservation.
- "ajoute/rajoute un appartement/villa/maison/local à louer ou à vendre" → create_property (transaction=location|vente, price, city). Apparaît direct sur fikconciergerie.com.
- "ajoute/rajoute une voiture à vendre" → add_vehicle_for_sale (brand, model, price).
- Si une info manque (prix, location ou vente), pose UNE question courte puis crée. Devise par défaut DZD.

PHOTOS — RÈGLE ABSOLUE (avant de répondre quoi que ce soit sur les photos):
- "envoie/montre les photos des véhicules à vendre" / "voitures en vente" → appelle get_vehicle_sale_photo (vehicle_query VIDE = toutes).
- "photos de [voiture précise] à vendre" → get_vehicle_sale_photo(vehicle_query="...").
- "photos des biens / appartements / immobilier" → get_property_photo (VIDE = tous).
- "photos de [voiture du parc location]" → get_car_photo(car_name="...").
⛔ NE JAMAIS répondre "aucune photo" / "base vide" / "rien à envoyer" SANS avoir appelé le bon tool photo d'abord. Le tool te dira s'il y a des photos. Appelle-le, point.

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
    'add_car','update_car',
    // Photos du parc : Kouider demande souvent "envoie une photo de [voiture]" dans
    // un contexte véhicule/flotte → cet agent gagne (priorité 10). Sans ce tool il
    // improvisait "je n'ai pas accès aux photos". Maintenant il récupère la vraie photo.
    'get_car_photo',
    // Immobilier + vente voiture + historique client (synchro site) :
    'list_properties', 'get_property_photo', 'update_property_status', 'list_vehicles_for_sale',
    'get_vehicle_sale_photo', 'mark_vehicle_sold', 'record_client_deal', 'get_client_history',
    'create_property', 'add_vehicle_for_sale', 'update_property', 'update_vehicle_details', 'set_site_hero',
    'list_packs', 'create_pack', 'set_pack_status',
    'record_lead', 'list_leads', 'update_lead_status', 'match_lead', 'get_daily_report',
    // Phase extras
    'create_signature_link', 'apply_dynamic_pricing', 'estimate_damage',
  ],
  keywords:  /\b(réservations?|booking|louer|location|disponib|voitures?|retard|flotte|clients?|arrivée|départ|véhicules?|agenda|synchro|marque.*dispo|est.*disponible|plus.*disponible|appartements?|immobilier|immo|biens?|maisons?|villas?|à\s+vendre|vente|acheté|acheteur|locataire)\b/i,
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
    'list_bookings','get_late_returns','export_accounting',
    'apply_dynamic_pricing',
  ],
  keywords:  /\b(finance|financier|paiement|payé|impayé|argent|ca|chiffre|recette|facture|reçu|bénéfice|trésorerie|revenue|revenu|revenus|encaissé|dette|profit|gagné|gain|rapport\s+fi|compta|comptable|export)\b/i,
  priority:  9,
  llm: { provider: 'claude', model: 'claude-sonnet-4-6', temperature: 0.3, maxTokens: 1500, fallback: 'openai' },
};

// ── Agent 3: Clients ──────────────────────────────────────────────────────────
const CLIENTS_AGENT: AgentDefinition = {
  id:   'clients',
  name: '👤 Agent Clients',
  systemExtra: `Tu es l'Agent Clients de Fik Conciergerie Oran.
SPÉCIALITÉ: documents clients (passeport, permis, contrat), envoi WhatsApp/Telegram, notation clients.

DOCUMENTS — RÈGLES STRICTES:
- "passeport de X" → get_client_document(client_name="X", type="passport") — TOUJOURS passer type="passport"
- "permis de X" → get_client_document(client_name="X", type="license")
- "contrat de X" → get_client_document(client_name="X", type="contract")
- ⚠️ NE JAMAIS appeler generate_reservation_voucher quand on demande passeport ou permis
- ⚠️ NE JAMAIS chercher réservation avant d'appeler get_client_document
- ⚠️ JAMAIS appeler send_telegram_message pour les documents.
- Si résultat commence par "DIAGNOSTIC:" ou "TABLE VIDE" → affiche ce message EXACTEMENT tel quel, sans résumer ni reformuler
- Si résultat contient "Aucun document trouvé" (sans DIAGNOSTIC): dis "Aucun document enregistré pour [X]. Envoie une photo du passeport/permis pour l'enregistrer."
- Ne demande JAMAIS le nom de famille, la date de réservation, ni aucune info supplémentaire

ENREGISTREMENT DOCUMENT:
- Photo reçue + analysée par vision → store_document avec les données extraites
- Format extracted_data: {"passport_number":"...","full_name":"...","dob":"...","expiry_date":"..."}`,
  toolNames: [
    'store_document','get_client_document','send_whatsapp_to_client','send_telegram_message',
    'rate_client','record_feedback','get_client_profile','list_bookings',
    'get_client_history','record_client_deal',
  ],
  keywords:  /\b(client|document|contrat|passep|passeport|paseport|pasport|passport|permis|permi|identit|whatsapp|sms|message|envoyer|envoi|notif|noter|évaluation|historique\s+client|profil\s+client|qui\s+est\s+[A-Z])\b/i,
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
TOUJOURS: optimiser pour mobile (ratio 9:16 TikTok/Reels), qualité professionnelle.

⭐ "CRÉE UNE IMAGE DE NOTRE [voiture] SUR/DANS [décor]" (ex "notre Clio 5 Alpine sur une plage") — SANS EXCEPTION:
→ transform_image(car_name="Clio 5 Alpine", style="background_only", prompt="beach at sunset in Oran")
  = récupère la VRAIE photo Supabase, DÉTOURE la voiture (pixels EXACTS) et la pose sur le nouveau décor.
  → c'est EXACTEMENT notre voiture (même couleur/finition), seul le fond change.
❌ JAMAIS generate_image pour notre voiture (invente une fausse voiture).
❌ JAMAIS enhance_image/create_social_variants ici — ça ne change PAS le décor, ça garde le parking.

PHOTO PERSO de Kouider (selfie) + "mets-moi sur une plage / change le fond" → transform_image(style="background_only", prompt="...").
"Enlève mes lunettes / modifie le sujet" → transform_image(style="realistic").

AFFICHE PUB avec texte (uniquement si on demande une "pub/affiche avec texte"):
  get_car_photo(car_name) → add_text_overlay(image_url=..., text="Clio 5 Alpine — 45€/jour | Fik Conciergerie").
generate_image = uniquement pour image générique/imaginaire SANS véhicule réel précis.

RÉPONSE FINALE OBLIGATOIRE: après add_text_overlay, ta réponse DOIT contenir l'URL finale (https://res.cloudinary.com/...) sur une ligne seule — sinon l'image ne s'envoie pas sur Telegram.

ENVOI DE PHOTO EXISTANTE (≠ création pub) — "envoie/montre la photo de X" :
- voiture du PARC (location) → get_car_photo(car_name="X")
- BIEN immobilier / appartement → get_property_photo(property_query="X", ou VIDE = tous)
- voiture À VENDRE → get_vehicle_sale_photo(vehicle_query="X", ou VIDE = toutes)
- Si la demande suit une discussion sur UN bien/véhicule précis, utilise le bon tool SANS redemander.
- Ne dis JAMAIS "laisse-moi récupérer" sans appeler le tool dans le même tour.`,
  toolNames: [
    'get_car_photo', 'get_property_photo', 'get_vehicle_sale_photo',
    'analyze_image','optimize_image','create_social_variants','enhance_image','remove_background',
    'add_text_overlay','analyze_video','cut_video','add_subtitles','optimize_for_platform',
    'extract_thumbnail','add_background_music','create_video_preview',
    'generate_image','transform_image','estimate_damage','generate_ai_video','animate_car_photo','search_images',
    'create_marketing_video','edit_marketing_video','regenerate_voice','create_scenario_video',
    'generate_tiktok_video','merge_videos','publish_to_socials',
  ],
  keywords:  /\b(image|photo|vid[eé]o|miniature|thumbnail|montage|sous-titre|fond|background|pub|visuel|r[eé]seaux|instagram|reel|story|banner|logo|supprimer\s+fond|optimiser|g[eé]n[eè]re?r?\s+(?:image|photo|visuel)|crée?\w*\s+(?:image|photo|pub|visuel|affiche)|image\s+ia|photo\s+ia)\b/i,
  priority:  6,
  llm: { provider: 'claude', model: 'claude-haiku-4-5-20251001', temperature: 0.7, maxTokens: 1200, fallback: 'groq' },
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
    'get_monthly_improvement_report','get_learning_evolution','record_feedback','track_habit',
  ],
  keywords:  /\b(souviens|rappelle|mémorise|retiens|oublie|préférence|habitude|apprentissage|évolution|amélioration|feedback|règle|routine|tracker|suivi|prends?\s+l.habitude)\b/i,
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
  keywords:  /\b(code|github|deploy|railway|bug|typescript|react|modifier|fonction|erreur\s+ts|patch|commit|push|netlify|supabase)\b|\bcréer?\s+(?:une?\s+)?(?:fonction|fichier|classe|module|script|composant|route|endpoint|api)\b/i,
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
  llm: { provider: 'claude', model: 'claude-haiku-4-5-20251001', temperature: 0.7, maxTokens: 1200, fallback: 'groq' },
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

PROCESSUS OBLIGATOIRE — SANS EXCEPTION:
1. Appelle web_search("location voiture oran concurrent 2025") EN PREMIER.
2. Appelle analyze_competitors pour les données TikTok/réseaux sociaux.
3. COPIE les noms exacts des agences trouvées dans les résultats (ex: "West Car", "OranCar", "Karroussa").
4. N'écris ton analyse QU'APRÈS avoir les données des outils.

RÈGLES ANTI-HALLUCINATION — VIOLATION = ERREUR CRITIQUE:
❌ INTERDIT de mentionner Europcar, Hertz, Sixt, ou TOUTE agence si elle n'apparaît pas dans les résultats web_search.
❌ INTERDIT d'inventer un prix (€/DZD) — même "environ", "approximativement", "environ 30-60€".
❌ INTERDIT d'utiliser ta mémoire d'entraînement pour des noms ou prix de concurrents.
✅ Cite UNIQUEMENT les entreprises présentes dans les données web_search (URL, snippet).
✅ Prix: copier exactement depuis les résultats. Ex: "Karroussa: dès 4000 DA (source: karroussa.com)".
✅ Si prix absent des résultats → "prix non trouvé en ligne".
✅ Si web_search échoue → dis "recherche web indisponible, voici les agences connues du système: [liste vide si aucune]".

FORMAT RÉPONSE:
1. "Sources trouvées: [liste des URLs/domaines retournés par web_search]"
2. Analyse basée UNIQUEMENT sur ces sources.`,
  toolNames: [
    'web_search','run_tiktok_research','analyze_competitors','watch_my_tiktok',
    'get_news','search_images',
  ],
  keywords:  /\b(analyse?\s+(?:les?\s+)?(?:r[eé]seaux?|concurrent\w*|march[eé]|seo)|veille\s+(?:concurrentiel\w*|r[eé]seau|march[eé])|benchmark|recherche\s+concurrent\w*|concurrent\w*|part\s+de\s+march[eé]|positionnement|croissance\s+(?:tiktok|instagram|r[eé]seaux))\b/i,
  priority:  7,
  llm: { provider: 'claude', model: 'claude-sonnet-4-6', temperature: 0.6, maxTokens: 1500, fallback: 'openai' },
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

// ── Agent 13: Obsidian Brain ──────────────────────────────────────────────────
const OBSIDIAN_AGENT: AgentDefinition = {
  id:   'obsidian',
  name: '🧠 Agent Obsidian Brain',
  systemExtra: `Tu es l'Agent Obsidian Brain de Dzaryx.
SPÉCIALITÉ: mémoire long-terme via Obsidian — profils clients, préférences, notes personnalisées.

RÈGLES STRICTES:
1. "trouve le vault" / "obsidian vault" / "cherche vault" → appelle obsidian_find_vault EN PREMIER.
2. Après avoir trouvé le vault → tu peux utiliser obsidian_read_client, obsidian_update_client, etc.
3. JAMAIS utiliser send_nexus_command pour des actions Obsidian.
4. Si Nexus est offline → dis "Nexus offline, impossible d'accéder au vault."
5. Si Nexus a besoin d'être redémarré → restart_nexus.

FLUX STANDARD:
- "quel est le profil de [client]" → obsidian_read_client(client_name="[client]")
- "mets à jour le profil de [client]" → obsidian_update_client(...)
- "liste les clients" → obsidian_list_clients()
- "note dans obsidian" → obsidian_write_note(...)`,
  toolNames: [
    'obsidian_find_vault',
    'obsidian_read_client', 'obsidian_update_client', 'obsidian_list_clients',
    'obsidian_write_note', 'obsidian_read_note',
    'ping_nexus', 'restart_nexus',
  ],
  keywords:  /\b(obsidian|vault\s+obsidian|vault|cerveau|brain|profil\s+client|note\s+client|m[eé]moire\s+long|long.terme)\b/i,
  priority:  9,
  llm: { provider: 'claude', model: 'claude-sonnet-4-6', temperature: 0.4, maxTokens: 1200 },
};

// ── Agent 14: Général — catch-all pour toute question hors métier ────────────
const GENERAL_AGENT: AgentDefinition = {
  id:   'general',
  name: '🧠 Agent Général',
  systemExtra: `Tu es Dzaryx, assistant IA polyvalent de Fik Conciergerie Oran.
Tu peux répondre à TOUTE question : actualité, sport, politique, économie, taux de change, météo, géographie, histoire, science, lois, visa, formalités, culture, cuisine, technologie, etc.

RÈGLES:
✅ Utilise web_search pour toute question nécessitant des données récentes (actualité, prix, taux, événements, météo détaillée).
✅ Utilise get_news pour les dernières actualités.
✅ Utilise get_weather pour la météo en temps réel.
✅ Si tu connais la réponse avec certitude (fait historique, définition, concept) → réponds directement sans outil.
✅ Si Kouider demande plus de détails sur un sujet ("le sujet X", "développe", "dis-m'en plus") → web_search immédiatement SANS demander permission.
✅ Si la première recherche ne donne pas le détail demandé → fais une 2ème recherche avec des mots-clés plus précis (ex: ajoute le nom du journal, l'année, des guillemets autour du titre).
✅ Minimum 2 tentatives web_search avant de dire "information non trouvée".
❌ ABSOLUMENT INTERDIT: "tu veux que je cherche ?", "je peux faire une recherche ?", "dis-moi et je creuse" → CHERCHE DIRECTEMENT SANS DEMANDER.
❌ ABSOLUMENT INTERDIT: "je n'ai pas accès à l'article" quand web_search est disponible → CHERCHE L'ARTICLE.
❌ JAMAIS inventer des chiffres, prix, dates, noms — web_search si incertain.
❌ JAMAIS dire "je ne peux pas" — tu peux tout rechercher.

FORMAT: réponse directe, concise, sans blabla. Si données récentes → cite la source.`,
  toolNames: ['web_search', 'get_news', 'get_weather',
    // Immo/vente/photos accessibles même en routage catch-all (sinon Claude
    // sortait les appels en texte <invoke> faute d'avoir l'outil en natif).
    'list_properties', 'get_property_photo', 'update_property_status',
    'list_vehicles_for_sale', 'get_vehicle_sale_photo', 'mark_vehicle_sold',
    'record_client_deal', 'get_client_history', 'get_car_photo', 'list_bookings',
    'add_car', 'update_car',
    'create_property', 'add_vehicle_for_sale', 'update_property', 'update_vehicle_details', 'set_site_hero',
    'list_packs', 'create_pack', 'set_pack_status',
    'record_lead', 'list_leads', 'update_lead_status', 'match_lead', 'get_daily_report',
    'generate_image', 'transform_image', 'remove_background', 'search_images',
    'create_signature_link', 'apply_dynamic_pricing', 'estimate_damage'],
  keywords:  /./,  // catch-all — toujours matcher (priority le plus bas)
  priority:  1,
  llm: { provider: 'claude', model: 'claude-sonnet-4-6', temperature: 0.5, maxTokens: 1500, fallback: 'openai' },
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
  OBSIDIAN_AGENT,
  GENERAL_AGENT,
].sort((a, b) => b.priority - a.priority);

export const AGENT_MAP = new Map<string, AgentDefinition>(
  AGENT_REGISTRY.map(a => [a.id, a]),
);
