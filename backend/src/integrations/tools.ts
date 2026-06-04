import type Anthropic from '@anthropic-ai/sdk';

export const Dzaryx_TOOLS: Anthropic.Tool[] = [
  {
    name: 'list_bookings',
    description: 'Lister les réservations depuis Supabase. Filtre par status, client, voiture ou date.',
    input_schema: {
      type: 'object' as const,
      properties: {
        status:     { type: 'string', enum: ['PENDING','CONFIRMED','ACTIVE','COMPLETED','REJECTED'], description: 'Filtrer par statut' },
        client_name:{ type: 'string', description: 'Filtrer par nom client (partiel)' },
        limit:      { type: 'number', description: 'Nombre max (défaut 20)' },
      },
    },
  },
  {
    name: 'update_booking',
    description: 'Modifier une réservation existante dans Supabase (nom, dates, voiture, montant, propriétaire, statut).',
    input_schema: {
      type: 'object' as const,
      properties: {
        id:          { type: 'string', description: 'UUID de la réservation (obligatoire)' },
        client_name: { type: 'string' },
        client_phone:{ type: 'string' },
        client_age:  { type: 'number', description: 'Âge du client' },
        start_date:  { type: 'string', description: 'Format YYYY-MM-DD' },
        end_date:    { type: 'string', description: 'Format YYYY-MM-DD' },
        final_price: { type: 'number' },
        status:         { type: 'string', enum: ['PENDING','CONFIRMED','ACTIVE','COMPLETED','REJECTED'] },
        payment_status: { type: 'string', enum: ['UNPAID','PARTIAL','PAID'], description: 'Statut de paiement' },
        paid_amount:    { type: 'number', description: 'Montant déjà encaissé' },
        currency:       { type: 'string', enum: ['EUR','DZD'], description: 'Devise: EUR ou DZD' },
        rented_by:      { type: 'string', enum: ['Kouider','Houari'] },
        notes:          { type: 'string' },
      },
      required: ['id'],
    },
  },
  {
    name: 'create_booking',
    description: 'Créer une nouvelle réservation dans Supabase. Utiliser car_name (ex: "Clio 5 Alpine") OU car_id (UUID). Si seul le nom est connu, utiliser car_name — la recherche UUID est automatique. IMPORTANT: toujours fournir client_price_per_day ET owner_price_per_day pour le calcul du profit réel. Si le client est "Kouider" sans nom de locataire, mettre client_name="Kouider". La réservation est automatiquement ajoutée à Google Agenda.',
    input_schema: {
      type: 'object' as const,
      properties: {
        car_name:    { type: 'string', description: 'Nom ou modèle de la voiture (ex: "Clio 5 Alpine", "Jumpy"). Utiliser si car_id inconnu — recherche automatique dans la flotte.' },
        car_id:      { type: 'string', description: 'UUID Supabase de la voiture. Optionnel si car_name fourni.' },
        client_name: { type: 'string' },
        client_phone:{ type: 'string' },
        client_age:  { type: 'number', description: 'Âge du client' },
        start_date:  { type: 'string', description: 'YYYY-MM-DD' },
        end_date:    { type: 'string', description: 'YYYY-MM-DD' },
        final_price: { type: 'number', description: 'Prix total facturé au client (obligatoire)' },
        client_price_per_day: { type: 'number', description: 'Prix par jour négocié avec le client. Optionnel — si non fourni, laisse null.' },
        owner_price_per_day:  { type: 'number', description: 'Prix payé à Houari par jour. Optionnel — pour calcul profit Kouider.' },
        discount_applied:     { type: 'number', description: 'Remise accordée en euros (ex: 20). Défaut: 0' },
        notes:       { type: 'string' },
        rented_by:      { type: 'string', enum: ['Kouider','Houari'], description: 'Défaut: Kouider' },
        status:         { type: 'string', enum: ['PENDING','CONFIRMED','ACTIVE','COMPLETED','REJECTED'], description: 'Défaut: CONFIRMED. Utiliser COMPLETED pour les anciennes réservations terminées.' },
        payment_status: { type: 'string', enum: ['UNPAID','PARTIAL','PAID'], description: 'Statut paiement. Défaut: UNPAID. PAID si payé, PARTIAL si acompte.' },
        paid_amount:    { type: 'number', description: 'Montant déjà payé (défaut: 0)' },
        currency:       { type: 'string', enum: ['EUR','DZD'], description: 'Devise. Défaut: DZD si Houari, EUR si Kouider.' },
      },
      required: ['client_name','start_date','end_date','final_price'],
    },
  },
  {
    name: 'cancel_booking',
    description: 'Annuler une réservation (status → REJECTED).',
    input_schema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: 'UUID de la réservation' },
      },
      required: ['id'],
    },
  },
  {
    name: 'delete_booking',
    description: 'Supprimer définitivement une réservation de Supabase (DELETE). Utiliser pour effacer les réservations annulées/rejetées.',
    input_schema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: 'UUID de la réservation à supprimer' },
      },
      required: ['id'],
    },
  },
  {
    name: 'get_financial_report',
    description: 'Rapport financier: bénéfice Kouider et revenu Houari par mois/année.',
    input_schema: {
      type: 'object' as const,
      properties: {
        year:  { type: 'number', description: 'Année (défaut: année courante)' },
        month: { type: 'number', description: 'Mois 1-12 (défaut: mois courant)' },
      },
    },
  },
  {
    name: 'get_client_profile',
    description: 'Récupérer le profil comportemental complet d\'un client: voitures préférées, durées typiques, fiabilité paiement, historique, score VIP/FREQUENT/REGULAR/NEW. Utiliser quand Kouider demande "profil de X", "infos sur X", "c\'est qui X".',
    input_schema: {
      type: 'object' as const,
      properties: {
        client_name: { type: 'string', description: 'Nom ou prénom du client (recherche partielle)' },
      },
      required: ['client_name'],
    },
  },
  {
    name: 'get_client_brain',
    description: 'Profil complet et enrichi d\'un client: voitures préférées, mois de location typiques, patterns d\'arrivée (vol le soir, arrive le lundi), insights IA générés automatiquement, fiabilité paiement, passeport pour disambiguation. Utiliser pour "Mohamed loue quoi?", "c\'est qui ce client?", "quand arrive-t-il?", "compare Mohamed Benali et Mohamed Kader".',
    input_schema: {
      type: 'object' as const,
      properties: {
        name_or_phone: { type: 'string', description: 'Nom, prénom ou numéro de téléphone du client' },
      },
      required: ['name_or_phone'],
    },
  },
  {
    name: 'add_client_note',
    description: 'Ajouter une note ou observation manuelle sur un client. Ex: "Mohamed prend toujours des vols le soir", "Client VIP — toujours prioritaire", "Attention: chien dans la voiture". La note est permanente dans le cerveau Dzaryx.',
    input_schema: {
      type: 'object' as const,
      properties: {
        name_or_phone: { type: 'string', description: 'Nom, prénom ou numéro de téléphone' },
        note:          { type: 'string', description: 'Observation ou note à retenir définitivement' },
      },
      required: ['name_or_phone', 'note'],
    },
  },
  {
    name: 'set_arrival_pattern',
    description: 'Enregistrer le pattern d\'arrivée typique d\'un client: heure de vol, jour de la semaine, aéroport d\'origine. Ex: "Rachid arrive toujours le soir entre 21h-23h", "Karim vient de Paris CDG, arrive les vendredis". Dzaryx utilise ça pour anticiper.',
    input_schema: {
      type: 'object' as const,
      properties: {
        name_or_phone:  { type: 'string', description: 'Nom, prénom ou numéro de téléphone' },
        typical_time:   { type: 'string', description: 'Moment de la journée: "matin", "après-midi", "soir", "nuit"' },
        typical_hour:   { type: 'string', description: 'Plage horaire précise: "20h-23h", "8h-10h"' },
        typical_day:    { type: 'string', description: 'Jour de la semaine: "lundi", "vendredi", "week-end"' },
        flight_origin:  { type: 'string', description: 'Aéroport ou ville d\'origine: "Paris CDG", "Bruxelles", "Lyon"' },
        notes:          { type: 'string', description: 'Notes supplémentaires sur l\'arrivée' },
      },
      required: ['name_or_phone'],
    },
  },
  {
    name: 'store_document',
    description: 'Stocker passeport/permis/contrat client + données OCR extraites. Appeler après analyse vision d\'une photo document. extracted_data contient les champs parsés (passport_number, full_name, dob, nationality, expiry_date, etc.).',
    input_schema: {
      type: 'object' as const,
      properties: {
        client_name:    { type: 'string' },
        client_phone:   { type: 'string', description: 'Optionnel' },
        booking_id:     { type: 'string', description: 'UUID réservation (optionnel)' },
        type:           { type: 'string', enum: ['passport','license','contract','other'] },
        file_url:       { type: 'string', description: 'URL publique du fichier (optionnel si extracted_data fourni)' },
        notes:          { type: 'string' },
        extracted_data: { type: 'string', description: 'JSON string des données extraites par OCR/Vision: {"passport_number":"...", "full_name":"...", "dob":"...", "nationality":"...", "expiry_date":"..."}' },
      },
      required: ['client_name','type'],
    },
  },
  {
    name: 'get_client_document',
    description: 'Récupérer documents client (passeport, permis, contrat). Retourne les données extraites. Le document est automatiquement envoyé dans l\'app (Socket.IO + push notification) — ne pas appeler send_telegram_message. Utiliser quand Kouider/Houari demande à voir un document client.',
    input_schema: {
      type: 'object' as const,
      properties: {
        client_name:  { type: 'string', description: 'Nom du client (recherche partielle)' },
        client_phone: { type: 'string', description: 'Téléphone exact' },
        booking_id:   { type: 'string', description: 'UUID réservation' },
        type:         { type: 'string', enum: ['passport','license','contract','other'], description: 'Filtrer par type de document' },
        field:        { type: 'string', description: 'Champ spécifique à retourner depuis extracted_data: passport_number, full_name, dob, nationality, expiry_date, etc. Si absent, retourne tout.' },
      },
    },
  },
  {
    name: 'read_site_file',
    description: 'Lire un fichier du site autolux-location sur GitHub.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: { type: 'string', description: 'Chemin du fichier ex: src/data/cars.ts' },
      },
      required: ['path'],
    },
  },
  {
    name: 'update_site_file',
    description: 'Modifier un fichier du site autolux-location via GitHub → Vercel redéploie auto.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path:    { type: 'string' },
        content: { type: 'string' },
        message: { type: 'string', description: 'Message de commit' },
      },
      required: ['path','content'],
    },
  },
  {
    name: 'learn_rule',
    description: 'Mémoriser une nouvelle règle métier dans Dzaryx_rules.',
    input_schema: {
      type: 'object' as const,
      properties: {
        instruction: { type: 'string', description: 'La règle à mémoriser' },
      },
      required: ['instruction'],
    },
  },
  {
    name: 'remember_info',
    description: 'Mémoriser une information dans la mémoire permanente Dzaryx_memory. Utiliser quand Kouider dit "souviens-toi que..." ou "apprends que...".',
    input_schema: {
      type: 'object' as const,
      properties: {
        content:  { type: 'string', description: 'L\'information à retenir' },
        category: { type: 'string', description: 'Catégorie: personal, business, rule, preference, fact' },
      },
      required: ['content'],
    },
  },
  {
    name: 'recall_memory',
    description: 'Rechercher dans la mémoire permanente d\'Dzaryx.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query:    { type: 'string', description: 'Recherche dans la mémoire' },
        category: { type: 'string', description: 'Filtrer par catégorie' },
      },
    },
  },
  {
    name: 'get_weather',
    description: 'Obtenir la météo pour n\'importe quelle ville du monde.',
    input_schema: {
      type: 'object' as const,
      properties: {
        city:    { type: 'string', description: 'Nom de la ville (ex: Paris, Alger, Dubai)' },
        country: { type: 'string', description: 'Pays optionnel pour précision' },
      },
    },
  },
  {
    name: 'get_news',
    description: 'Obtenir les actualités récentes d\'Algérie ou du monde.',
    input_schema: {
      type: 'object' as const,
      properties: {
        source: { type: 'string', enum: ['algerie', 'monde'], description: 'Source: algerie (défaut) ou monde' },
      },
    },
  },

  // ── Outils développement autonome ────────────────────────────

  {
    name: 'github_read_file',
    description: 'Lire un fichier depuis n\'importe quel repo GitHub (Dzaryx, autolux-location, fik-conciergerie). Utiliser pour lire le code source d\'Dzaryx avant de le modifier.',
    input_schema: {
      type: 'object' as const,
      properties: {
        repo: { type: 'string', description: 'Nom du repo: ibrahim, autolux-location, ou fik-conciergerie' },
        path: { type: 'string', description: 'Chemin du fichier ex: backend/src/config/constants.ts' },
      },
      required: ['repo', 'path'],
    },
  },
  {
    name: 'github_write_file',
    description: 'Créer un NOUVEAU fichier dans un repo GitHub (utiliser uniquement pour les nouveaux fichiers courts < 100 lignes). Pour MODIFIER un fichier existant, utiliser github_patch_file à la place.',
    input_schema: {
      type: 'object' as const,
      properties: {
        repo:    { type: 'string', description: 'Nom du repo: ibrahim, autolux-location, ou fik-conciergerie' },
        path:    { type: 'string', description: 'Chemin du fichier ex: backend/src/integrations/tools.ts' },
        content: { type: 'string', description: 'Contenu COMPLET du fichier (uniquement pour nouveaux fichiers)' },
        message: { type: 'string', description: 'Message de commit (ex: "feat: add booking export tool")' },
      },
      required: ['repo', 'path', 'content'],
    },
  },
  {
    name: 'github_patch_file',
    description: 'Modifier CHIRURGICALEMENT un fichier GitHub existant: remplace un extrait précis sans toucher au reste. C\'est l\'outil principal pour coder — JAMAIS réécrire tout le fichier. Utiliser pour: ajouter une fonction, modifier un cron, changer une règle, corriger un bug. RÈGLE: old_string doit être UNIQUE dans le fichier (ajouter du contexte si besoin). Plusieurs patches = plusieurs appels successifs.',
    input_schema: {
      type: 'object' as const,
      properties: {
        repo:       { type: 'string', description: 'Nom du repo: ibrahim, autolux-location, ou fik-conciergerie' },
        path:       { type: 'string', description: 'Chemin du fichier ex: backend/src/queue/scheduler.ts' },
        old_string: { type: 'string', description: 'Extrait EXACT à remplacer (copié mot pour mot depuis github_read_file, espaces et retours à la ligne inclus). Doit être unique dans le fichier.' },
        new_string: { type: 'string', description: 'Nouveau texte qui remplace old_string' },
        message:    { type: 'string', description: 'Message de commit ex: "fix: change cron to 8h30"' },
      },
      required: ['repo', 'path', 'old_string', 'new_string'],
    },
  },
  {
    name: 'github_list_files',
    description: 'Lister les fichiers/dossiers dans un répertoire d\'un repo GitHub. Utiliser pour naviguer dans le codebase avant de lire/modifier des fichiers.',
    input_schema: {
      type: 'object' as const,
      properties: {
        repo: { type: 'string', description: 'Nom du repo: ibrahim, autolux-location, ou fik-conciergerie' },
        path: { type: 'string', description: 'Chemin du dossier (vide pour racine). Ex: backend/src/integrations' },
      },
      required: ['repo'],
    },
  },
  {
    name: 'railway_get_logs',
    description: 'Récupérer les derniers logs Railway pour vérifier si un déploiement a réussi ou trouver des erreurs.',
    input_schema: {
      type: 'object' as const,
      properties: {
        limit: { type: 'number', description: 'Nombre de lignes de logs (défaut 50)' },
      },
    },
  },
  {
    name: 'supabase_execute',
    description: 'Exécuter une requête SELECT sur la base de données Supabase. Lecture seule — INSERT/UPDATE/DELETE non autorisés. Nécessite SUPABASE_ACCESS_TOKEN configuré dans Railway.',
    input_schema: {
      type: 'object' as const,
      properties: {
        sql: { type: 'string', description: 'La requête SQL à exécuter' },
      },
      required: ['sql'],
    },
  },
  {
    name: 'netlify_deploy',
    description: 'Déclencher manuellement un redéploiement d\'un site Netlify.',
    input_schema: {
      type: 'object' as const,
      properties: {
        site_id: { type: 'string', description: 'ID ou nom du site Netlify (défaut: fik-conciergerie-oran)' },
      },
    },
  },

  // ─── PHASE 5 — Finance ────────────────────────────────────────
  {
    name: 'get_payment_status',
    description: 'Voir le statut de paiement des réservations (payé, acompte, impayé). Sans booking_id = toutes les réservations actives.',
    input_schema: {
      type: 'object' as const,
      properties: {
        booking_id: { type: 'string', description: 'ID UUID de la réservation (optionnel — sans = toutes)' },
      },
    },
  },
  {
    name: 'record_payment',
    description: 'Enregistrer un paiement (acompte, solde, ou paiement partiel) pour une réservation.',
    input_schema: {
      type: 'object' as const,
      properties: {
        booking_id: { type: 'string', description: 'ID UUID de la réservation' },
        amount:     { type: 'number', description: 'Montant encaissé en euros' },
        type:       { type: 'string', enum: ['acompte', 'solde', 'partiel'], description: 'Type de paiement' },
        note:       { type: 'string', description: 'Note facultative (ex: "paiement espèces")' },
      },
      required: ['booking_id', 'amount'],
    },
  },
  {
    name: 'get_revenue_report',
    description: 'Calcul du chiffre d\'affaires par semaine, mois ou année. Inclut la répartition par véhicule et par propriétaire (Kouider/Houari).',
    input_schema: {
      type: 'object' as const,
      properties: {
        year:  { type: 'number', description: 'Année (défaut: année courante)' },
        month: { type: 'number', description: 'Mois 1-12 (optionnel)' },
        week:  { type: 'number', description: 'Numéro de semaine dans le mois (optionnel, nécessite month)' },
      },
    },
  },
  {
    name: 'get_late_returns',
    description: 'Détecter les véhicules non rendus après leur date de fin de location. Identifie les clients en retard avec nombre de jours de dépassement. Utiliser quand Kouider demande "qui n\'a pas rendu la voiture" ou "véhicules en retard".',
    input_schema: {
      type: 'object' as const,
      properties: {},
    },
  },
  {
    name: 'generate_reservation_voucher',
    description: 'Générer un bon de réservation PDF professionnel (A4) pour un client. Intègre automatiquement les infos passeport/permis OCR déjà enregistrées. Crée le PDF, l\'upload dans Supabase Storage, et l\'envoie directement sur Telegram. Utiliser quand Kouider dit "génère le bon de réservation pour X", "crée un bon pour X", "fais le contrat de location pour X".',
    input_schema: {
      type: 'object' as const,
      properties: {
        booking_id: { type: 'string', description: 'UUID de la réservation (utiliser list_bookings si nécessaire pour récupérer l\'ID)' },
      },
      required: ['booking_id'],
    },
  },
  {
    name: 'get_unpaid_bookings',
    description: 'Lister toutes les réservations impayées ou partiellement payées, avec urgence et délai.',
    input_schema: {
      type: 'object' as const,
      properties: {},
    },
  },
  {
    name: 'generate_receipt',
    description: 'Générer un reçu/facture formaté pour une réservation (à envoyer au client).',
    input_schema: {
      type: 'object' as const,
      properties: {
        booking_id: { type: 'string', description: 'ID UUID de la réservation' },
      },
      required: ['booking_id'],
    },
  },
  {
    name: 'get_finance_dashboard',
    description: 'Tableau de bord financier complet : CA mois en cours, comparaison mois précédent, prévisions, impayés, répartition Kouider/Houari.',
    input_schema: {
      type: 'object' as const,
      properties: {},
    },
  },
  {
    name: 'check_anomalies',
    description: 'Détecter les anomalies financières : prix anormalement bas/haut, réservations suspectes, écarts avec la grille tarifaire.',
    input_schema: {
      type: 'object' as const,
      properties: {},
    },
  },

  // ─── PHASE 13 — Apprentissage continu ────────────────────────
  {
    name: 'record_feedback',
    description: 'Enregistrer un feedback de Kouider sur une action Dzaryx (réponse, réservation, contenu TikTok, etc.). Dzaryx apprend de ces feedbacks.',
    input_schema: {
      type: 'object' as const,
      properties: {
        action_type: { type: 'string', description: 'Type d\'action: response, booking, tiktok, modification, etc.' },
        action_id:   { type: 'string', description: 'ID de l\'action (optionnel)' },
        rating:      { type: 'string', enum: ['positive', 'negative', 'neutral'], description: 'Évaluation' },
        comment:     { type: 'string', description: 'Commentaire de Kouider (optionnel)' },
        context:     { type: 'string', description: 'Contexte JSON stringifié (optionnel)' },
      },
      required: ['action_type', 'rating'],
    },
  },
  {
    name: 'get_monthly_improvement_report',
    description: 'Rapport mensuel d\'amélioration Dzaryx: nouvelles règles apprises, feedbacks reçus, patterns découverts, performances par catégorie, recommandations.',
    input_schema: {
      type: 'object' as const,
      properties: {
        year:  { type: 'number', description: 'Année (défaut: année courante)' },
        month: { type: 'number', description: 'Mois 1-12 (défaut: mois courant)' },
      },
    },
  },
  {
    name: 'get_learning_evolution',
    description: 'Évolution de l\'apprentissage Dzaryx sur plusieurs mois: tendances, taux de satisfaction, amélioration continue.',
    input_schema: {
      type: 'object' as const,
      properties: {
        months: { type: 'number', description: 'Nombre de mois à analyser (défaut: 6)' },
      },
    },
  },
  {
    name: 'get_kouider_preferences',
    description: 'Récupérer les préférences calibrées de Kouider: style de réponse (court/détaillé), ton (professionnel/amical), styles TikTok favoris.',
    input_schema: {
      type: 'object' as const,
      properties: {},
    },
  },

  // ─── PHASE 14 — Traitement Image & Vidéo ──────────────────────

  // ── IMAGE (6 outils) ──
  {
    name: 'analyze_image',
    description: 'Analyser une image: qualité, résolution, format, poids, suggestions d\'amélioration.',
    input_schema: {
      type: 'object' as const,
      properties: {
        image_url: { type: 'string', description: 'URL publique de l\'image à analyser' },
      },
      required: ['image_url'],
    },
  },
  {
    name: 'optimize_image',
    description: 'Optimiser une image: compression, conversion format, amélioration qualité selon usage (web, social, print).',
    input_schema: {
      type: 'object' as const,
      properties: {
        image_url: { type: 'string', description: 'URL publique de l\'image' },
        usage:     { type: 'string', enum: ['web', 'social', 'print'], description: 'Usage cible pour optimisation adaptée' },
        quality:   { type: 'number', description: 'Qualité 1-100 (défaut: 85)' },
      },
      required: ['image_url', 'usage'],
    },
  },
  {
    name: 'create_social_variants',
    description: 'Créer automatiquement toutes les variantes réseaux sociaux d\'une image (TikTok 9:16, Instagram Post 1:1, Instagram Story 9:16, Facebook 1.91:1).',
    input_schema: {
      type: 'object' as const,
      properties: {
        image_url: { type: 'string', description: 'URL publique de l\'image source' },
        platforms: { type: 'string', description: 'Plateformes: tiktok, instagram, facebook, all (défaut: all)' },
      },
      required: ['image_url'],
    },
  },
  {
    name: 'enhance_image',
    description: 'Améliorer qualité image avec filtres professionnels: luminosité, contraste, netteté, couleurs, réduction bruit.',
    input_schema: {
      type: 'object' as const,
      properties: {
        image_url: { type: 'string', description: 'URL publique de l\'image' },
        preset:    { type: 'string', enum: ['auto', 'vibrant', 'soft', 'pro', 'minimal'], description: 'Preset d\'amélioration (défaut: auto)' },
      },
      required: ['image_url'],
    },
  },
  {
    name: 'remove_background',
    description: 'Supprimer automatiquement l\'arrière-plan d\'une image (utile pour visuels pub, logos, produits).',
    input_schema: {
      type: 'object' as const,
      properties: {
        image_url: { type: 'string', description: 'URL publique de l\'image' },
      },
      required: ['image_url'],
    },
  },
  {
    name: 'add_text_overlay',
    description: 'Ajouter du texte professionnel sur une image (titre, slogan, CTA) pour publicités ou stories.',
    input_schema: {
      type: 'object' as const,
      properties: {
        image_url: { type: 'string', description: 'URL publique de l\'image' },
        text:      { type: 'string', description: 'Texte à ajouter' },
        position:  { type: 'string', enum: ['top', 'center', 'bottom'], description: 'Position du texte (défaut: center)' },
        style:     { type: 'string', enum: ['bold', 'elegant', 'modern', 'minimal'], description: 'Style typographique (défaut: bold)' },
      },
      required: ['image_url', 'text'],
    },
  },

  // ── VIDÉO (8 outils) ──
  {
    name: 'analyze_video',
    description: 'Analyser une vidéo: durée, résolution, format, codec, poids, qualité, ratio, suggestions d\'optimisation.',
    input_schema: {
      type: 'object' as const,
      properties: {
        video_url: { type: 'string', description: 'URL publique de la vidéo à analyser' },
      },
      required: ['video_url'],
    },
  },
  {
    name: 'cut_video',
    description: 'Découper un segment précis d\'une vidéo (ex: extraire de 0:10 à 0:45).',
    input_schema: {
      type: 'object' as const,
      properties: {
        video_url:  { type: 'string', description: 'URL publique de la vidéo' },
        start_time: { type: 'string', description: 'Temps début format MM:SS ou HH:MM:SS (ex: 0:10)' },
        end_time:   { type: 'string', description: 'Temps fin format MM:SS ou HH:MM:SS (ex: 0:45)' },
      },
      required: ['video_url', 'start_time', 'end_time'],
    },
  },
  {
    name: 'add_subtitles',
    description: 'Générer et ajouter automatiquement des sous-titres à partir de la détection vocale IA (français, arabe, anglais).',
    input_schema: {
      type: 'object' as const,
      properties: {
        video_url: { type: 'string', description: 'URL publique de la vidéo' },
        language:  { type: 'string', enum: ['fr', 'ar', 'en', 'auto'], description: 'Langue audio (défaut: auto-détection)' },
        style:     { type: 'string', enum: ['tiktok', 'youtube', 'minimal'], description: 'Style sous-titres (défaut: tiktok)' },
      },
      required: ['video_url'],
    },
  },
  {
    name: 'optimize_for_platform',
    description: 'Optimiser vidéo pour une plateforme spécifique: format, ratio, durée, compression adaptés (TikTok 9:16 <60s, Instagram Reels 9:16 <90s, YouTube 16:9).',
    input_schema: {
      type: 'object' as const,
      properties: {
        video_url: { type: 'string', description: 'URL publique de la vidéo' },
        platform:  { type: 'string', enum: ['tiktok', 'instagram', 'youtube', 'facebook'], description: 'Plateforme cible' },
      },
      required: ['video_url', 'platform'],
    },
  },
  {
    name: 'extract_thumbnail',
    description: 'Extraire une miniature (image) d\'une vidéo à un moment précis.',
    input_schema: {
      type: 'object' as const,
      properties: {
        video_url: { type: 'string', description: 'URL publique de la vidéo' },
        timestamp: { type: 'string', description: 'Moment à capturer format MM:SS ou HH:MM:SS (ex: 0:15)' },
      },
      required: ['video_url', 'timestamp'],
    },
  },
  {
    name: 'add_background_music',
    description: 'Ajouter une musique de fond libre de droits à une vidéo (volume automatiquement équilibré avec voix).',
    input_schema: {
      type: 'object' as const,
      properties: {
        video_url: { type: 'string', description: 'URL publique de la vidéo' },
        music:     { type: 'string', enum: ['upbeat', 'chill', 'corporate', 'energetic', 'emotional'], description: 'Style musical' },
        volume:    { type: 'number', description: 'Volume musique 0-100 (défaut: 30)' },
      },
      required: ['video_url', 'music'],
    },
  },
  {
    name: 'create_video_preview',
    description: 'Générer automatiquement un aperçu/teaser de 10 secondes à partir d\'une vidéo longue (sélection moments clés IA).',
    input_schema: {
      type: 'object' as const,
      properties: {
        video_url: { type: 'string', description: 'URL publique de la vidéo source' },
        duration:  { type: 'number', description: 'Durée du preview en secondes (défaut: 10)' },
      },
      required: ['video_url'],
    },
  },
  {
    name: 'generate_tiktok_video',
    description: 'Créer une vraie vidéo publicitaire TikTok (MP4 9:16, 1080×1920) depuis des images de voitures. Ajoute titre, sous-titre et musique automatiquement. Utiliser quand Kouider demande de créer une pub TikTok, vidéo pub, vidéo marketing, ou vidéo pour réseaux sociaux.',
    input_schema: {
      type: 'object' as const,
      properties: {
        image_urls:         { type: 'string', description: 'URLs des images séparées par virgule. Si vide, utilise les images des voitures Fik Conciergerie.' },
        title:              { type: 'string', description: 'Titre affiché en haut de la vidéo (défaut: "Fik Conciergerie Oran")' },
        subtitle:           { type: 'string', description: 'Sous-titre affiché en bas (ex: "Location de voitures premium • Oran")' },
        music:              { type: 'string', enum: ['upbeat', 'chill', 'corporate', 'energetic', 'emotional'], description: 'Style musical (défaut: upbeat)' },
        duration_per_image: { type: 'number', description: 'Durée d\'affichage par image en secondes (défaut: 3)' },
      },
      required: [],
    },
  },

  // ─── TELEGRAM depuis app vocale ──────────────────────────────
  {
    name: 'send_telegram_message',
    description: 'Envoyer une notification, photo ou document à Kouider/Houari via l\'app (Socket.IO + push notification). Utiliser quand l\'utilisateur demande d\'envoyer quelque chose (ex: "envoie-moi le passeport de Omar", "notifie-moi quand c\'est prêt"). Remplace Telegram — tout passe par l\'app maintenant.',
    input_schema: {
      type: 'object' as const,
      properties: {
        message:      { type: 'string', description: 'Texte à envoyer (obligatoire)' },
        photo_url:    { type: 'string', description: 'URL d\'une photo à envoyer (optionnel)' },
        document_url: { type: 'string', description: 'URL d\'un document à envoyer (optionnel)' },
        caption:      { type: 'string', description: 'Légende pour la photo/document (optionnel)' },
      },
      required: ['message'],
    },
  },

  // ─── VALIDATION DEPLOY ───────────────────────────────────────
  {
    name: 'railway_wait_deploy',
    description: 'OBLIGATOIRE après chaque github_write_file. Attend la fin du déploiement Railway et retourne: ✅ succès OU ❌ erreur avec les logs complets. Permet de détecter et corriger les erreurs TypeScript immédiatement après push, sans PC.',
    input_schema: {
      type: 'object' as const,
      properties: {
        timeout_seconds: { type: 'number', description: 'Temps max d\'attente en secondes (défaut: 180)' },
      },
    },
  },
  {
    name: 'github_search_code',
    description: 'Chercher un texte/pattern dans tous les fichiers du repo GitHub. Essentiel avant de modifier du code: trouver où une fonction est définie, quels fichiers importent un module, détecter les usages d\'un type.',
    input_schema: {
      type: 'object' as const,
      properties: {
        repo:    { type: 'string', description: 'Nom du repo (ex: ibrahim, autolux-location)' },
        query:   { type: 'string', description: 'Texte à chercher dans le code (ex: "handlePcRelay", "import.*supabase", "SOCKET_EVENTS")' },
      },
      required: ['repo', 'query'],
    },
  },

  // ─── PHASE 6 — WhatsApp clients ──────────────────────────────
  {
    name: 'send_whatsapp_to_client',
    description: 'Envoyer un message WhatsApp à un client (confirmation de réservation, rappel, réponse à une plainte, etc.). Toujours utiliser après validation Kouider pour les réponses sensibles.',
    input_schema: {
      type: 'object' as const,
      properties: {
        phone:   { type: 'string', description: 'Numéro de téléphone du client (ex: +213661234567)' },
        message: { type: 'string', description: 'Texte du message WhatsApp à envoyer' },
        lang:    { type: 'string', enum: ['fr', 'ar', 'en'], description: 'Langue du message (défaut: fr)' },
      },
      required: ['phone', 'message'],
    },
  },
  {
    name: 'check_car_availability',
    description: 'Vérifier si une voiture est disponible pour des dates données. Retourne les voitures disponibles avec leurs tarifs.',
    input_schema: {
      type: 'object' as const,
      properties: {
        start_date: { type: 'string', description: 'Date de début (YYYY-MM-DD)' },
        end_date:   { type: 'string', description: 'Date de fin (YYYY-MM-DD)' },
        car_id:     { type: 'string', description: 'ID de la voiture spécifique (optionnel — sans = toutes les voitures)' },
      },
      required: ['start_date', 'end_date'],
    },
  },
  {
    name: 'web_search',
    description: 'Rechercher sur internet: actualités mondiales, technologie, Claude/Anthropic nouveautés, prix, informations générales. Retourne les résultats les plus pertinents.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Requête de recherche (ex: "Anthropic Claude nouveautés 2025", "actualités Bruxelles aujourd\'hui")' },
      },
      required: ['query'],
    },
  },
  {
    name: 'fetch_url',
    description: 'Lire le contenu de n\'importe quelle page web ou document en ligne: docs Anthropic, GitHub, articles, pages officielles. Idéal pour consulter https://docs.anthropic.com, https://github.com/anthropics, ou toute URL publique.',
    input_schema: {
      type: 'object' as const,
      properties: {
        url: { type: 'string', description: 'URL complète à lire (ex: https://docs.anthropic.com/en/release-notes/overview)' },
      },
      required: ['url'],
    },
  },

  // ─── RAPPELS PERSONNALISÉS ────────────────────────────────────
  {
    name: 'schedule_reminder',
    description: `Programmer un rappel réel avec persistance DB + BullMQ.

RÈGLES ABSOLUES:
1. Tu ne peux JAMAIS dire "rappel programmé" sans recevoir status=created + db_id + job_id dans la réponse.
2. Si status=db_failed → dire "ÉCHEC: rappel non programmé (DB inaccessible)."
3. Si status=TIMEZONE_UNKNOWN → dire "ÉCHEC: timezone invalide, rappel non programmé."
4. Si status=duplicate_blocked → dire "Rappel déjà programmé (doublon bloqué), db_id=[existing_db_id]."
5. Ta confirmation DOIT citer: db_id, local_time, timezone_used, utc_offset.

TIMEZONE: Priorité = explicit > header X-Timezone de l'app > Europe/Brussels.
JAMAIS Africa/Algiers par défaut — seul l'utilisateur peut le définir.
Retourne: { status, db_id, job_id, remind_at_utc, local_time, timezone_used, utc_offset, human_delay }`,
    input_schema: {
      type: 'object' as const,
      properties: {
        message:       { type: 'string', description: 'Texte du rappel' },
        delay_minutes: { type: 'number', description: 'Délai en minutes (ex: 30 pour "dans 30 minutes")' },
        at_time:       { type: 'string', description: 'Heure exacte HH:MM (ex: "18:00") — timezone par défaut Europe/Brussels' },
        timezone:      { type: 'string', description: 'Timezone IANA optionnelle (défaut: Europe/Brussels, ex: Africa/Algiers si Oran)' },
      },
      required: ['message'],
    },
  },

  // ─── PHASE 15 — Recherche d'images ───────────────────────────
  {
    name: 'search_images',
    description: 'Rechercher des images sur internet (Pexels). Utilise EXACTEMENT ce que l\'utilisateur demande comme query. Exemples: "montre moi des photos de Clio 5 rouge", "trouve des images de coucher de soleil Oran", "voiture noire sport".',
    input_schema: {
      type: 'object' as const,
      properties: {
        query:       { type: 'string', description: 'EXACTEMENT ce que l\'utilisateur a demandé de chercher. Exemple: si l\'utilisateur dit "clip 4 noir", query = "Renault Clio 4 black car"' },
        count:       { type: 'number', description: 'Nombre d\'images (défaut: 4, max: 10)' },
        orientation: { type: 'string', enum: ['landscape', 'portrait', 'square'], description: 'Orientation (optionnel)' },
      },
      required: ['query'],
    },
  },

  // ─── GOOGLE CALENDAR ─────────────────────────────────────────
  {
    name: 'create_calendar_event',
    description: 'Ajouter une réservation dans Google Agenda fikconciergerie@gmail.com. Utiliser quand Kouider dit "ajoute au calendrier", "mets dans l\'agenda", "synchronise avec Google". Peut aussi être utilisé après create_booking pour forcer la synchro.',
    input_schema: {
      type: 'object' as const,
      properties: {
        booking_id:  { type: 'string', description: 'UUID de la réservation (obligatoire)' },
        client_name: { type: 'string', description: 'Nom du client' },
        car_name:    { type: 'string', description: 'Nom du véhicule (ex: Clio 4, Duster)' },
        start_date:  { type: 'string', description: 'Date début YYYY-MM-DD' },
        end_date:    { type: 'string', description: 'Date fin YYYY-MM-DD' },
        notes:       { type: 'string', description: 'Notes optionnelles' },
      },
      required: ['booking_id', 'client_name', 'car_name', 'start_date', 'end_date'],
    },
  },
  // ─── AGENDA PERSO KOUIDER (kouiderpablo@gmail.com) ──────────
  {
    name: 'create_personal_event',
    description: 'Créer un événement dans l\'agenda PERSONNEL de Kouider (kouiderpablo@gmail.com) — RDV privés, voyages, visites médicales, rappels perso, anniversaires, etc. NE PAS utiliser pour les réservations Fik Conciergerie. Utiliser quand Kouider dit "mets dans mon agenda perso", "ajoute un RDV privé", "note ce voyage", "rappelle-moi ce truc perso".',
    input_schema: {
      type: 'object' as const,
      properties: {
        title:          { type: 'string', description: 'Titre de l\'événement (ex: "RDV médecin", "Vol Bruxelles → Oran")' },
        start_datetime: { type: 'string', description: 'Début : YYYY-MM-DD ou YYYY-MM-DDTHH:MM:SS (ex: 2026-07-15 ou 2026-07-15T14:30:00)' },
        end_datetime:   { type: 'string', description: 'Fin : YYYY-MM-DD ou YYYY-MM-DDTHH:MM:SS. Si heure non précisée, mettre +1h après le début' },
        description:    { type: 'string', description: 'Détails/notes optionnels' },
        all_day:        { type: 'boolean', description: 'true = événement journée entière (pas d\'heure précise)' },
      },
      required: ['title', 'start_datetime', 'end_datetime'],
    },
  },
  {
    name: 'list_personal_events',
    description: 'Voir les prochains événements de l\'agenda PERSONNEL de Kouider (kouiderpablo@gmail.com). Utiliser quand Kouider demande "c\'est quoi mon agenda perso", "mes RDV privés", "qu\'est-ce que j\'ai de prévu perso".',
    input_schema: {
      type: 'object' as const,
      properties: {
        max_results: { type: 'number', description: 'Nombre max d\'événements (défaut: 15)' },
      },
    },
  },
  {
    name: 'delete_personal_event',
    description: 'Supprimer un événement de l\'agenda PERSONNEL de Kouider. Appeler list_personal_events d\'abord pour obtenir l\'ID.',
    input_schema: {
      type: 'object' as const,
      properties: {
        google_event_id: { type: 'string', description: 'ID Google de l\'événement (obtenu via list_personal_events)' },
      },
      required: ['google_event_id'],
    },
  },
  {
    name: 'sync_calendar',
    description: 'Synchroniser TOUTES les réservations CONFIRMED/ACTIVE pas encore dans Google Agenda. Utiliser pour un sync en masse ou vérifier que tout est bien dans le calendrier.',
    input_schema: {
      type: 'object' as const,
      properties: {},
    },
  },
  {
    name: 'list_calendar_events',
    description: 'Voir les prochains événements dans Google Agenda Fik Conciergerie. Permet de vérifier ce qui est déjà dans le calendrier.',
    input_schema: {
      type: 'object' as const,
      properties: {
        max_results: { type: 'number', description: 'Nombre max d\'événements (défaut: 20)' },
      },
    },
  },
  {
    name: 'get_fleet_status',
    description: 'Voir l\'état complet de la flotte en temps réel: quelles voitures sont louées, disponibles, en retard. Utiliser quand Kouider demande "c\'est quoi l\'état de la flotte", "quelles voitures sont dispo", "résumé de la flotte", "tableau de bord véhicules".',
    input_schema: {
      type: 'object' as const,
      properties: {},
    },
  },
  {
    name: 'rate_client',
    description: 'Noter un client après une location (fiabilité, ponctualité, soin du véhicule). Permet de constituer un historique de confiance. Utiliser quand Kouider dit "note ce client", "il était bien/nul", "client fiable/problème".',
    input_schema: {
      type: 'object' as const,
      properties: {
        booking_id: { type: 'string', description: 'UUID de la réservation' },
        rating:     { type: 'number', description: 'Note de 1 à 5 (1=très mauvais, 5=excellent)' },
        comment:    { type: 'string', description: 'Commentaire optionnel (ex: "retard 2h", "voiture impeccable", "payé sans problème")' },
      },
      required: ['booking_id', 'rating'],
    },
  },
  // ── MARKETING TIKTOK ─────────────────────────────────────────
  {
    name: 'run_tiktok_research',
    description: 'Lancer une recherche de marché TikTok maintenant: scrape les hashtags réels (#locationoran, #mre2025, etc.), analyse les tendances, génère 3 idées de vidéos sur mesure pour Fik Conciergerie Oran, et envoie le rapport sur Telegram. Si APIFY non disponible, utilise les données web indexées. Utiliser quand Kouider dit "fais une recherche TikTok", "analyse le marché", "quelles idées pour cette semaine", "stratégie réseaux sociaux", "recherche hashtag".',
    input_schema: {
      type: 'object' as const,
      properties: {
        car_focus: { type: 'string', description: 'Voiture ou segment à cibler (ex: "clio4", "duster"). Ajoute des hashtags spécifiques à cette voiture dans la recherche.' },
        hashtags:  { type: 'array', items: { type: 'string' }, description: 'Hashtags supplémentaires à rechercher (ex: ["mre2025", "oranete"]). Sans le #.' },
      },
    },
  },
  {
    name: 'create_marketing_video',
    description: 'Créer une vidéo TikTok MP4 complète (voix française ElevenLabs + montage FFmpeg) pour une voiture de la flotte. Envoie la vidéo dans cette conversation Telegram pour validation Oke/Non. AUSSI utiliser pour MODIFIER une vidéo existante (nouveau script, nouvelle voiture, nouvel effet de fond). Utiliser quand Kouider dit "fais une vidéo", "modifie la vidéo", "change le texte par...", "mets-la sur une plage", "change de voiture".',
    input_schema: {
      type: 'object' as const,
      properties: {
        car_name:          { type: 'string', description: 'Nom ou modèle de la voiture (ex: "Dacia Duster", "Creta"). Si vide, choisit automatiquement.' },
        style:             { type: 'string', description: 'Style: "reveal" (dévoilement), "prix" (focus prix), "lifestyle" (week-end), "temoignage" (avis client). Défaut: reveal.', enum: ['reveal', 'prix', 'lifestyle', 'temoignage'] },
        custom_script:     { type: 'string', description: 'Texte personnalisé à dire en voix. TOUJOURS en FRANÇAIS. Exemple: "Découvrez la Creta, disponible dès maintenant à Oran pour 4500 dinars par jour !"' },
        background_effect: { type: 'string', description: 'Effet de fond: mettre la voiture devant un décor. Valeurs: "plage", "ville", "montagne", "desert", "route", "luxe", "foret", "coucher". Utiliser quand Kouider dit "mets-la sur une plage", "fond nuit", etc.', enum: ['plage', 'ville', 'montagne', 'desert', 'route', 'luxe', 'foret', 'coucher', 'nuit'] },
      },
    },
  },
  {
    name: 'edit_marketing_video',
    description: 'Modifier une vidéo marketing déjà générée. Utiliser quand Kouider dit "je n\'aime pas cette scène", "rends-la plus réaliste", "change l\'arrière-plan", "mets la voiture devant l\'aéroport", "fais tourner la caméra", "change la lumière", "modifie la voix", "change le script". Ne pas utiliser pour créer une nouvelle vidéo — utiliser create_marketing_video pour ça.',
    input_schema: {
      type: 'object' as const,
      properties: {
        modification: { type: 'string', description: 'Description précise de la modification demandée. Ex: "Change l\'arrière-plan et mets la voiture devant l\'aéroport Ahmed Ben Bella", "Rends la scène plus réaliste avec une lumière naturelle", "Fais tourner la caméra autour de la voiture".' },
        new_script:   { type: 'string', description: 'Nouveau script voix off si Kouider veut changer le texte parlé. En FRANÇAIS.' },
        tone:         { type: 'string', enum: ['professionnel', 'dynamique', 'chaleureux', 'commercial'], description: 'Nouveau ton de la voix si Kouider veut changer l\'ambiance.' },
      },
      required: ['modification'],
    },
  },
  {
    name: 'regenerate_voice',
    description: 'Regénérer uniquement la voix off d\'une vidéo existante sans refaire la vidéo. Utiliser quand Kouider dit "change la voix", "remplace cette voix", "elle ne fait pas assez professionnelle", "rends la voix plus dynamique", "corrige la phrase X", "raccourcis le texte", "nouvelle voix".',
    input_schema: {
      type: 'object' as const,
      properties: {
        script: { type: 'string', description: 'Nouveau texte de la voix off en FRANÇAIS. Si vide, garde le script original avec le nouveau ton.' },
        tone:   { type: 'string', enum: ['professionnel', 'dynamique', 'chaleureux', 'commercial'], description: 'Ton souhaité: professionnel (sérieux), dynamique (énergique), chaleureux (accueillant), commercial (vendeur percutant).' },
      },
    },
  },
  {
    name: 'create_scenario_video',
    description: 'Créer une vidéo TikTok basée sur un scénario narratif complet avec structure scène par scène, voix off adaptée, hashtags et CTA. Utiliser pour des scénarios comme: client qui arrive à l\'aéroport d\'Oran, client qui cherche une location, présentation de la flotte Fik Conciergerie, balade sur la Corniche. Toujours envoie d\'abord le brief complet (durée, scènes, voix, hashtags, CTA) puis la vidéo.',
    input_schema: {
      type: 'object' as const,
      properties: {
        scenario: {
          type: 'string',
          enum: ['airport_arrival', 'client_search', 'fleet_reveal', 'corniche_drive'],
          description: 'airport_arrival: client arrive à l\'aéroport Ahmed Ben Bella, trouve la voiture Fik Conciergerie qui l\'attend. client_search: client galère à trouver une location puis découvre Fik Conciergerie. fleet_reveal: présentation soignée de la flotte. corniche_drive: voiture sur la Corniche d\'Oran, ambiance lifestyle.',
        },
        car_name: { type: 'string', description: 'Nom de la voiture à utiliser. Si vide, choisit automatiquement.' },
      },
      required: ['scenario'],
    },
  },
  {
    name: 'create_video_project',
    description: 'Créer une vidéo publicitaire TikTok MULTI-SCÈNES ultra-réaliste pour Fik Conciergerie. Génère un vrai storyboard (6-7 scènes), produit chaque scène (voiture = Runway/Kling, écrans téléphone/WhatsApp/TikTok = FFmpeg toujours lisible), assemble avec la voix ElevenLabs, et envoie le MP4 final. UTILISER pour : "fais une vidéo réaliste où un client galère", "crée une pub TikTok complète", "vidéo avec scène aéroport + WhatsApp + CTA", "vidéo storytelling client", "vidéo multi-scènes". Scénarios disponibles : client_search (client galère puis trouve Fik), airport_arrival (client arrive à l\'aéroport, voiture qui attend), fleet_reveal (présentation cinématique du véhicule), corniche_drive (voiture sur la Corniche d\'Oran, lifestyle). Envoie toujours le brief complet avant de générer.',
    input_schema: {
      type: 'object' as const,
      properties: {
        scenario: {
          type: 'string',
          enum: ['client_search', 'airport_arrival', 'fleet_reveal', 'corniche_drive'],
          description: 'client_search: client galère (6 scènes : hook téléphone → problème → TikTok → WhatsApp → voiture → CTA). airport_arrival: client à l\'aéroport Ahmed Ben Bella (5 scènes). fleet_reveal: présentation cinématique du véhicule (3 scènes). corniche_drive: voiture sur la Corniche, lifestyle (3 scènes).',
        },
        car_name: { type: 'string', description: 'Nom ou modèle de la voiture. Si vide, choisit automatiquement dans la flotte.' },
        style:    { type: 'string', enum: ['tiktok', 'luxe', 'dynamique', 'serieux'], description: 'Style général de la vidéo. Défaut: tiktok.' },
      },
      required: ['scenario'],
    },
  },
  {
    name: 'merge_videos',
    description: 'Fusionner plusieurs vidéos envoyées par Kouider en une seule vidéo TikTok. Utiliser quand Kouider dit "fusionne ces vidéos", "mets-les ensemble", "combine les clips". IMPORTANT: Kouider doit d\'abord envoyer les vidéos, puis demander la fusion.',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'Titre optionnel pour la vidéo finale.' },
      },
    },
  },
  // ── VEILLE CONCURRENTIELLE ────────────────────────────────────
  {
    name: 'analyze_competitors',
    description: 'Analyser la concurrence location voiture à Oran sur TikTok, YouTube, Facebook, web et Google Maps. Effectue de vraies recherches web (DuckDuckGo, Bing) sur les concurrents, les hashtags pertinents, et les tendances du marché. Utiliser quand Kouider dit "regarde ce que font les concurrents", "didanolocation a publié quoi", "est-on compétitif", "analyse la concurrence", "que font mes concurrents", "recherche sur TikTok".',
    input_schema: {
      type: 'object' as const,
      properties: {
        competitor:  { type: 'string', description: 'Nom ou handle du concurrent (ex: "didanolocation", "auto location oran"). Si vide, cherche tous les concurrents connus.' },
        car_focus:   { type: 'string', description: 'Voiture ou segment à cibler dans la recherche (ex: "clio4", "duster", "jumpy"). Génère des hashtags contextuels comme #clio4oran, #dusteroran.' },
        hashtags:    { type: 'array', items: { type: 'string' }, description: 'Hashtags supplémentaires à inclure dans la recherche (ex: ["locationaeroport", "mre2025"]). Sans le #.' },
        platform:    { type: 'string', enum: ['tiktok', 'telegram', 'all'], description: 'Plateforme à surveiller (défaut: all)' },
        generate_counter_video: { type: 'boolean', description: 'Si true et une promo concurrente est détectée, crée automatiquement une vidéo de réponse TikTok.' },
      },
    },
  },
  {
    name: 'watch_my_tiktok',
    description: 'Voir les stats et vidéos récentes du TikTok de Fik Conciergerie. Analyse ce qui performe, ce qui manque, et donne des recommandations. Utiliser quand Kouider dit "regarde mon TikTok", "comment va mon compte", "mes vidéos performent comment", "stats TikTok".',
    input_schema: {
      type: 'object' as const,
      properties: {
        handle: { type: 'string', description: 'Handle TikTok sans @. Si vide, utilise le compte Fik Conciergerie configuré.' },
      },
    },
  },

  // ── Phase 5: Publication multi-plateforme ─────────────────────
  {
    name: 'publish_to_socials',
    description: 'Publier une vidéo validée sur TikTok. Utiliser quand Kouider dit "publie la vidéo", "poste sur TikTok", "publie", "partage la dernière vidéo". Si pending_id est vide, utilise la dernière vidéo en attente.',
    input_schema: {
      type: 'object' as const,
      properties: {
        pending_id: { type: 'string', description: 'ID de la vidéo à publier (optionnel — utilise la dernière par défaut)' },
      },
    },
  },

  // ─── CODE AGENT AUTONOME ─────────────────────────────────────
  {
    name: 'execute_code_task',
    description: 'Lancer le Code Agent autonome pour coder une feature, corriger un bug, créer un site/app client. L\'agent lit les fichiers, fait les modifications, vérifie TypeScript, corrige ses propres erreurs et déploie. Utiliser quand Kouider dit "code ça", "ajoute cette feature", "crée un site pour X", "corrige ce bug", "modifie cette fonction". Fonctionne même sans PC.',
    input_schema: {
      type: 'object' as const,
      properties: {
        task: { type: 'string', description: 'Description précise de ce qui doit être codé. Plus c\'est détaillé, mieux c\'est. Ex: "Ajoute un outil get_client_history qui liste les 5 dernières réservations d\'un client par téléphone"' },
        repo: { type: 'string', description: 'Repo cible: ibrahim (défaut = Dzaryx), autolux-location, fik-conciergerie, ou nom d\'un nouveau repo client' },
      },
      required: ['task'],
    },
  },
  {
    name: 'create_new_project',
    description: 'Créer un nouveau projet complet (site vitrine, app, landing page) pour un client. L\'agent crée tous les fichiers, les push sur GitHub, et déploie sur Netlify. Utiliser quand Kouider dit "crée un site pour [client]", "nouveau projet pour [business]", "fais un site [type]".',
    input_schema: {
      type: 'object' as const,
      properties: {
        client_name:   { type: 'string', description: 'Nom du client ou de l\'entreprise' },
        business_type: { type: 'string', description: 'Type de business: restaurant, coiffeur, garage, médecin, boutique, etc.' },
        description:   { type: 'string', description: 'Description du projet: ce que le site doit contenir, style, couleurs, fonctionnalités' },
        phone:         { type: 'string', description: 'Téléphone du client (affiché sur le site)' },
        city:          { type: 'string', description: 'Ville du client' },
      },
      required: ['client_name', 'business_type', 'description'],
    },
  },

  // ─── GÉNÉRATION IA (Replicate + fal.ai) ──────────────────────
  {
    name: 'generate_image',
    description: 'Générer une image ultra-réaliste avec l\'IA Flux.1 (qualité Midjourney). Utiliser quand Kouider dit "génère une image", "crée une photo de...", "fais-moi une image...", "génère une photo de voiture". Envoie l\'image directement sur Telegram.',
    input_schema: {
      type: 'object' as const,
      properties: {
        prompt:       { type: 'string', description: 'Description précise de l\'image à générer (en anglais pour meilleur résultat). Ex: "luxury Renault Duster SUV on Oran beach, golden sunset, cinematic photography, 4K"' },
        aspect_ratio: { type: 'string', enum: ['9:16', '16:9', '1:1', '4:3'], description: 'Format de l\'image. Défaut: 9:16 (TikTok/Stories). 16:9 pour YouTube/Web, 1:1 pour Instagram.' },
        style:        { type: 'string', enum: ['photorealistic', 'cinematic', 'artistic', 'luxury'], description: 'Style visuel. Défaut: photorealistic.' },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'generate_ai_video',
    description: 'Générer une vidéo IA réaliste d\'une voiture. Providers : Runway Gen-3 (haute fidélité, si RUNWAY_API_KEY configurée) et Kling 1.6 (fallback). Mode auto par défaut : Runway si disponible, sinon Kling. IMPORTANT : si Kouider dit "avec Runway", "force Runway", "génère avec Runway", "teste Runway", "premium Runway" → passer provider: "runway". Si une voiture de la flotte est mentionnée, TOUJOURS passer car_name — Dzaryx récupère la vraie photo Supabase et génère depuis l\'image (image-to-video, plus réaliste). Envoie le MP4 sur Telegram.',
    input_schema: {
      type: 'object' as const,
      properties: {
        prompt:   { type: 'string', description: 'Scène à générer en anglais. Ex: "Renault Duster driving on Oran coastal road at golden hour". Inclure contexte Oran si possible.' },
        car_name: { type: 'string', description: 'Nom exact ou partiel de la voiture (ex: "Duster", "Clio 5", "Jumpy"). Passer si un modèle est mentionné — active le mode image réelle depuis Supabase.' },
        duration: { type: 'number', enum: [5, 10], description: 'Durée en secondes (5 ou 10). Défaut: 5.' },
        provider: { type: 'string', enum: ['auto', 'runway', 'kling'], description: '"auto" = Runway si configuré sinon Kling. "runway" = force Runway si Kouider demande Runway. Ne jamais passer "kling" sauf si Kouider dit explicitement "utilise Kling" ou "sans Runway".' },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'animate_car_photo',
    description: 'Animer une photo réelle de voiture (image → vidéo réaliste). Providers : Runway Gen-3 (si RUNWAY_API_KEY) ou Kling 1.6. Si Kouider dit "avec Runway" ou "force Runway" → provider: "runway". Mode auto par défaut. ⚠️ Prend 60-240 secondes. Envoie le MP4 sur Telegram. ⚠️ IMPORTANT : NE PAS appeler si generate_ai_video a déjà été invoqué dans ce même message — un seul outil vidéo par message. Ne pas passer provider:"kling" sauf si Kouider dit explicitement "utilise Kling" ou "sans Runway".',
    input_schema: {
      type: 'object' as const,
      properties: {
        car_name:      { type: 'string', description: 'Nom de la voiture de la flotte (ex: "Duster", "Clio"). Si vide, choisit automatiquement.' },
        image_url:     { type: 'string', description: 'URL d\'une photo à animer (optionnel — sans = utilise photo de la flotte).' },
        motion_prompt: { type: 'string', description: 'Description du mouvement voulu (en anglais). Défaut: "car moving forward smoothly, cinematic camera pan, golden hour lighting".' },
        provider:      { type: 'string', enum: ['auto', 'runway', 'kling'], description: '"auto" = Runway si configuré sinon Kling. "runway" = force Runway. "kling" = force Kling.' },
      },
    },
  },

  // ─── PHOTO RÉELLE FLOTTE ─────────────────────────────────────────
  {
    name: 'get_car_photo',
    description: 'Récupérer la vraie photo d\'une voiture du parc Fik Conciergerie depuis Supabase. TOUJOURS appeler en premier quand Kouider veut une image/pub pour une voiture du parc (Clio 5 Alpine, Jumpy, Sandero, Duster, etc.). Retourne l\'URL de la vraie photo. Ensuite passer cette URL à enhance_image, create_social_variants ou add_text_overlay. NE PAS utiliser generate_image pour une voiture déjà dans le parc.',
    input_schema: {
      type: 'object' as const,
      properties: {
        car_name: { type: 'string', description: 'Nom ou partie du nom de la voiture. Ex: "Clio 5 Alpine", "Jumpy", "Duster", "Sandero". Insensible à la casse.' },
      },
      required: ['car_name'],
    },
  },

  // ─── IMMOBILIER & VENTE — synchro site (mêmes tables que le site web) ─────────
  {
    name: 'list_properties',
    description: 'Lister les biens immobiliers (appartements/maisons) du site Fik Conciergerie depuis Supabase. Utiliser quand Kouider demande "mes biens", "l\'immobilier", "les appartements", "quels biens dispo". Montre titre, ville, prix, transaction (location/vente) et statut (disponible/loué/vendu).',
    input_schema: {
      type: 'object' as const,
      properties: {
        status: { type: 'string', description: 'Filtre optionnel: disponible | loue | vendu | coming_soon. Vide = tous.' },
      },
    },
  },
  {
    name: 'get_property_photo',
    description: 'Envoyer les photos des biens immobiliers (appartements/maisons). TOUJOURS appeler quand Kouider demande "envoie les photos des biens", "montre l\'appartement Hay Badr". Laisser property_query VIDE (ou "tous") pour envoyer les photos de TOUS les biens. Mettre le titre/ville pour un seul. NE JAMAIS dire "pas de photo" sans avoir appelé ce tool.',
    input_schema: {
      type: 'object' as const,
      properties: {
        property_query: { type: 'string', description: 'Titre/ville pour UN bien (ex: "appartement Hay Badr"). VIDE ou "tous" = tous les biens.' },
      },
    },
  },
  {
    name: 'update_property_status',
    description: 'Changer le statut d\'un bien immobilier sur le site (le rendre LOUÉ ou VENDU ou disponible). À utiliser quand un client loue/achète un appartement ou une maison (via WhatsApp). Met à jour le site automatiquement (le bien disparaît des dispos) ET enregistre l\'opération client. Ex: "marque l\'appartement Hay Badr comme loué par Mohamed".',
    input_schema: {
      type: 'object' as const,
      properties: {
        property_query: { type: 'string', description: 'Titre ou ville du bien (ex: "appartement Hay Badr", "villa Oran"). Insensible à la casse.' },
        new_status:     { type: 'string', description: 'Nouveau statut: loue | vendu | disponible' },
        client_name:    { type: 'string', description: 'Nom du client (si loué/vendu) — pour enregistrer qui.' },
        client_phone:   { type: 'string', description: 'Téléphone du client (optionnel).' },
        amount:         { type: 'number', description: 'Montant (loyer total ou prix de vente, optionnel).' },
      },
      required: ['property_query', 'new_status'],
    },
  },
  {
    name: 'list_vehicles_for_sale',
    description: 'Lister les voitures À VENDRE du site Fik Conciergerie (différent du parc de location). Utiliser quand Kouider demande "les voitures à vendre", "mon stock de vente". Montre marque, modèle, année, prix, statut.',
    input_schema: {
      type: 'object' as const,
      properties: {
        status: { type: 'string', description: 'Filtre optionnel: disponible | reserve | vendu | coming_soon. Vide = tous.' },
      },
    },
  },
  {
    name: 'get_vehicle_sale_photo',
    description: 'Envoyer les photos des voitures À VENDRE (stock de vente). TOUJOURS appeler ce tool quand Kouider demande "envoie les photos des véhicules à vendre", "montre les voitures en vente", "les photos de la Golf 8". Laisser vehicle_query VIDE (ou "tous") pour envoyer les photos de TOUTES les voitures à vendre. Mettre la marque/modèle pour une seule. NE JAMAIS dire "pas de photo" sans avoir appelé ce tool.',
    input_schema: {
      type: 'object' as const,
      properties: {
        vehicle_query: { type: 'string', description: 'Marque/modèle pour UNE voiture (ex: "Golf 8"). VIDE ou "tous" = toutes les voitures à vendre.' },
      },
    },
  },
  {
    name: 'mark_vehicle_sold',
    description: 'Marquer une voiture À VENDRE comme VENDUE (ou réservée) sur le site. À utiliser quand un client achète une voiture du stock de vente. Met à jour le site (disparaît des dispos) + enregistre l\'opération client. Ex: "la Golf 8 est vendue à Karim pour 2500000 DA".',
    input_schema: {
      type: 'object' as const,
      properties: {
        vehicle_query: { type: 'string', description: 'Marque/modèle de la voiture à vendre (ex: "Golf 8", "Clio 4"). Insensible à la casse.' },
        new_status:    { type: 'string', description: 'Nouveau statut: vendu | reserve | disponible. Défaut: vendu.' },
        client_name:   { type: 'string', description: 'Nom de l\'acheteur (optionnel).' },
        client_phone:  { type: 'string', description: 'Téléphone (optionnel).' },
        amount:        { type: 'number', description: 'Prix de vente (optionnel).' },
      },
      required: ['vehicle_query'],
    },
  },
  {
    name: 'create_property',
    description: 'Ajouter un NOUVEAU bien immobilier sur le site Fik Conciergerie (apparaît immédiatement sur fikconciergerie.com). Utiliser quand Kouider dit "ajoute un appartement à louer", "rajoute une villa à vendre", "nouveau bien". Le bien est créé dans la base partagée du site.',
    input_schema: {
      type: 'object' as const,
      properties: {
        title:       { type: 'string', description: 'Titre du bien (ex: "F3 lumineux Hay Badr", "Villa avec piscine Bir El Djir").' },
        transaction: { type: 'string', enum: ['location', 'vente'], description: 'location = à louer, vente = à vendre.' },
        city:        { type: 'string', description: 'Ville (défaut: Oran).' },
        district:    { type: 'string', description: 'Quartier (ex: Hay Badr, Bir El Djir). Optionnel.' },
        address:     { type: 'string', description: 'Adresse précise (rue, quartier, ville) — affichée sur une carte Google Maps sur l\'annonce. Ex: "Cité Hay Badr, Bât 12, Oran". Optionnel mais recommandé.' },
        price:       { type: 'number', description: 'Prix: loyer/mois si location, prix total si vente.' },
        currency:    { type: 'string', enum: ['DZD', 'EUR'], description: 'Devise. Défaut: DZD.' },
        type:        { type: 'string', description: 'Type: appartement | villa | maison | studio | local | terrain. Optionnel.' },
        rooms:       { type: 'number', description: 'Nombre de pièces (optionnel).' },
        surface:     { type: 'number', description: 'Surface en m² (optionnel).' },
        description: { type: 'string', description: 'Description (optionnel).' },
        status:      { type: 'string', enum: ['disponible', 'coming_soon'], description: 'Défaut: disponible.' },
      },
      required: ['title', 'transaction', 'price'],
    },
  },
  {
    name: 'add_vehicle_for_sale',
    description: 'Ajouter une NOUVELLE voiture À VENDRE sur le site Fik Conciergerie (apparaît immédiatement sur le site, stock de vente — différent du parc de location). Utiliser quand Kouider dit "ajoute une voiture à vendre", "rajoute une Audi Q3 à vendre".',
    input_schema: {
      type: 'object' as const,
      properties: {
        brand:        { type: 'string', description: 'Marque (ex: Audi, Volkswagen, Renault).' },
        model:        { type: 'string', description: 'Modèle (ex: Q3, Golf 8, Clio 4).' },
        year:         { type: 'number', description: 'Année (ex: 2020). Optionnel.' },
        price:        { type: 'number', description: 'Prix de vente.' },
        currency:     { type: 'string', enum: ['DZD', 'EUR'], description: 'Devise. Défaut: DZD.' },
        mileage:      { type: 'number', description: 'Kilométrage (optionnel).' },
        fuel:         { type: 'string', description: 'Carburant: essence | diesel | hybride | électrique. Optionnel.' },
        transmission: { type: 'string', description: 'Boîte: manuelle | automatique. Optionnel.' },
        status:       { type: 'string', enum: ['disponible', 'coming_soon'], description: 'Défaut: disponible.' },
      },
      required: ['brand', 'model', 'price'],
    },
  },
  {
    name: 'set_site_hero',
    description: 'Changer le média du HERO (grande image/vidéo de la page d\'accueil fikconciergerie.com). Donne une URL d\'image (.jpg/.png) ou de vidéo (.mp4) pour la mettre en fond du hero. Utiliser "reset" pour revenir à la photo automatique. Ex: "mets cette vidéo pub en accueil https://...", "remets la photo auto en accueil".',
    input_schema: {
      type: 'object' as const,
      properties: {
        media_url: { type: 'string', description: 'URL complète de l\'image ou vidéo (https://...). Mettre "reset" ou vide pour revenir à la photo automatique.' },
      },
      required: ['media_url'],
    },
  },
  {
    name: 'update_property',
    description: 'Modifier les infos d\'un bien immobilier existant sur le site (prix, description, titre, adresse, ville, surface, pièces). NE PAS utiliser pour le statut loué/vendu (→ update_property_status). Ex: "change le prix de l\'appartement Hay Badr à 45000", "ajoute une description à la villa Oran".',
    input_schema: {
      type: 'object' as const,
      properties: {
        property_query: { type: 'string', description: 'Titre ou ville du bien à modifier (recherche partielle).' },
        price:       { type: 'number', description: 'Nouveau prix (optionnel).' },
        description: { type: 'string', description: 'Nouvelle description (optionnel).' },
        title:       { type: 'string', description: 'Nouveau titre (optionnel).' },
        address:     { type: 'string', description: 'Nouvelle adresse pour la carte (optionnel).' },
        city:        { type: 'string', description: 'Nouvelle ville (optionnel).' },
        district:    { type: 'string', description: 'Nouveau quartier (optionnel).' },
        surface:     { type: 'number', description: 'Surface m² (optionnel).' },
        rooms:       { type: 'number', description: 'Nombre de pièces (optionnel).' },
      },
      required: ['property_query'],
    },
  },
  {
    name: 'update_vehicle_details',
    description: 'Modifier les infos d\'une voiture À VENDRE existante (prix, année, km). NE PAS utiliser pour vendu/réservé (→ mark_vehicle_sold). Ex: "baisse le prix de la Golf 8 à 2300000".',
    input_schema: {
      type: 'object' as const,
      properties: {
        vehicle_query: { type: 'string', description: 'Marque/modèle de la voiture à modifier.' },
        price:   { type: 'number', description: 'Nouveau prix (optionnel).' },
        year:    { type: 'number', description: 'Année (optionnel).' },
        mileage: { type: 'number', description: 'Kilométrage (optionnel).' },
      },
      required: ['vehicle_query'],
    },
  },
  {
    name: 'record_lead',
    description: 'Enregistrer une DEMANDE / LEAD client : un client qui CHERCHE un bien ou une voiture (pas encore conclu). Ex: "untel cherche un F4 à Bir El Djir max 50000", "un client veut acheter une Golf récente budget 3M". Le lead est suivi et matché au stock.',
    input_schema: {
      type: 'object' as const,
      properties: {
        client_name:  { type: 'string', description: 'Nom du client.' },
        client_phone: { type: 'string', description: 'Téléphone (optionnel).' },
        category:     { type: 'string', enum: ['immo_location', 'immo_vente', 'voiture_location', 'voiture_vente'], description: 'Type de recherche.' },
        criteria:     { type: 'string', description: 'Ce qu\'il cherche (ex: "F4, 2 chambres, Bir El Djir, balcon").' },
        budget_max:   { type: 'number', description: 'Budget max (loyer/mois ou prix).' },
        currency:     { type: 'string', enum: ['DZD', 'EUR'], description: 'Devise. Défaut DZD.' },
        city:         { type: 'string', description: 'Ville recherchée (optionnel).' },
      },
      required: ['client_name', 'category', 'criteria'],
    },
  },
  {
    name: 'list_leads',
    description: 'Lister les demandes/leads clients (recherches en cours). Utiliser quand Kouider demande "les demandes", "qui cherche quoi", "mes leads". Filtrable par statut.',
    input_schema: {
      type: 'object' as const,
      properties: {
        status: { type: 'string', enum: ['nouveau', 'en_cours', 'conclu', 'perdu'], description: 'Filtre optionnel. Vide = tous (sauf conclu/perdu par défaut).' },
      },
    },
  },
  {
    name: 'update_lead_status',
    description: 'Changer le statut d\'un lead/demande (nouveau → en_cours → conclu/perdu). Ex: "marque la demande de Karim comme conclue".',
    input_schema: {
      type: 'object' as const,
      properties: {
        lead_query: { type: 'string', description: 'Nom du client ou critère du lead.' },
        status:     { type: 'string', enum: ['nouveau', 'en_cours', 'conclu', 'perdu'], description: 'Nouveau statut.' },
        notes:      { type: 'string', description: 'Note optionnelle.' },
      },
      required: ['lead_query', 'status'],
    },
  },
  {
    name: 'match_lead',
    description: 'Trouver dans le stock (biens ou voitures à vendre) ce qui correspond à un lead/demande client. Utiliser quand Kouider demande "quel bien correspond à la demande de X", "qu\'est-ce que j\'ai pour Karim". Compare la ville et le budget.',
    input_schema: {
      type: 'object' as const,
      properties: {
        lead_query: { type: 'string', description: 'Nom du client ou critère du lead à matcher.' },
      },
      required: ['lead_query'],
    },
  },
  {
    name: 'get_daily_report',
    description: 'Rapport du jour complet : arrivées/retours de voitures aujourd\'hui, opérations (locations/ventes immo+auto) du jour, nouvelles demandes/leads, et alertes (paiements en retard, biens dispo depuis longtemps). Utiliser quand Kouider demande "le rapport du jour", "résumé d\'aujourd\'hui", "quoi de neuf", "fais le point".',
    input_schema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'record_client_deal',
    description: 'Enregistrer une opération client générique (quand aucun autre outil ne colle) pour garder une trace de QUI a fait QUOI. Utiliser pour noter manuellement une location/vente/commande. Le statut des items se gère avec update_property_status / mark_vehicle_sold / create_booking.',
    input_schema: {
      type: 'object' as const,
      properties: {
        client_name:  { type: 'string', description: 'Nom du client.' },
        client_phone: { type: 'string', description: 'Téléphone (optionnel).' },
        deal_type:    { type: 'string', description: 'location_voiture | vente_voiture | location_immo | vente_immo | commande_vehicule' },
        item_label:   { type: 'string', description: 'Ce qui est concerné (ex: "Clio 5 Alpine", "Appartement Hay Badr").' },
        amount:       { type: 'number', description: 'Montant (optionnel).' },
        notes:        { type: 'string', description: 'Note libre (optionnel).' },
      },
      required: ['client_name', 'deal_type'],
    },
  },
  {
    name: 'get_client_history',
    description: 'Voir TOUT l\'historique d\'un client : ses locations de voiture, locations/achats immo, achats voiture. Utiliser quand Kouider demande "qu\'est-ce que Mohamed a fait", "c\'est quel type de client", "montre l\'historique de X". Croise les réservations voiture + les opérations client_deals.',
    input_schema: {
      type: 'object' as const,
      properties: {
        client_query: { type: 'string', description: 'Nom ou téléphone du client.' },
      },
      required: ['client_query'],
    },
  },

  // ─── NEXUS PC AGENT ──────────────────────────────────────────────
  {
    name: 'ping_nexus',
    description: 'Tester si NEXUS (agent PC local Kouider) est connecté. Retourne l\'heure réelle du PC + latence. Utiliser quand Kouider demande "est-ce que Nexus est connecté ?", "ping Nexus", "teste la connexion PC".',
    input_schema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'send_nexus_command',
    description: 'Envoyer une commande directe au PC de Kouider via NEXUS. NEXUS peut: ouvrir des apps (Spotify, Chrome, VS Code, CapCut...), prendre un screenshot, lister/organiser fichiers, contrôler souris/clavier, lancer une musique, ouvrir un dossier. IMPORTANT: appeler ping_nexus d\'abord pour vérifier que NEXUS est en ligne. NE PAS envoyer de commandes de suppression de fichiers sans confirmation explicite. ⛔ JAMAIS utiliser pour Obsidian — utiliser obsidian_* outils à la place.',
    input_schema: {
      type: 'object' as const,
      properties: {
        command: { type: 'string', description: 'Commande en français naturel. Ex: "ouvre spotify", "screenshot", "liste fichiers bureau", "ouvre chrome sur youtube.com", "volume 70"' },
      },
      required: ['command'],
    },
  },

  {
    name: 'nexus_screenshot',
    description: 'Prend un screenshot du bureau du PC de Kouider via NEXUS et l\'affiche directement dans le chat. Utiliser quand Kouider dit "screenshot", "capture écran", "montre l\'écran du PC", "Nexus screenshot", "prends un screenshot pc". Affiche l\'image inline dans l\'app. Nécessite que NEXUS soit en ligne.',
    input_schema: {
      type: 'object' as const,
      properties: {
        caption: { type: 'string', description: 'Légende optionnelle (ex: "bureau PC 17h45")' },
      },
      required: [],
    },
  },

  {
    name: 'wake_nexus',
    description: 'Réveiller / démarrer NEXUS (agent PC Kouider) à distance via le Launcher permanent. Le Launcher est un service léger installé sur le PC via install-nexus-launcher.bat — il tourne même quand Nexus est éteint. Utiliser quand Kouider dit "réveille Nexus", "lance Nexus", "démarre Nexus", "allume Nexus", "start Nexus". NE PAS utiliser si Nexus est déjà actif (ping_nexus d\'abord si incertain).',
    input_schema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'restart_nexus',
    description: 'Redémarrer l\'agent Nexus sur le PC de Kouider. Nexus s\'arrête proprement, le watchdog le relance automatiquement en 3-5 secondes avec le nouveau code. Utiliser quand Kouider dit "redémarre Nexus", "relance Nexus", "restart Nexus", "recharge Nexus". Nécessite que Nexus soit en ligne.',
    input_schema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'nexus_full_status',
    description: 'Obtenir l\'état complet du système NEXUS: Nexus actif ?, Launcher connecté ?, hostname PC, uptime Launcher, dernière réveil, dernière erreur. Utiliser quand Kouider demande "état de Nexus", "status PC", "est-ce que le launcher tourne", "info système".',
    input_schema: { type: 'object' as const, properties: {} },
  },

  // ─── GOOGLE CALENDAR — outil manquant ────────────────────────────
  {
    name: 'update_calendar_event',
    description: 'Modifier un événement existant dans Google Agenda (titre, dates, description). Appeler list_calendar_events d\'abord pour obtenir l\'ID exact de l\'événement à modifier.',
    input_schema: {
      type: 'object' as const,
      properties: {
        google_event_id: { type: 'string', description: 'ID Google de l\'événement (ex: "abc123xyz" — obtenu via list_calendar_events)' },
        summary:         { type: 'string', description: 'Nouveau titre' },
        start_date:      { type: 'string', description: 'Nouvelle date début YYYY-MM-DD' },
        end_date:        { type: 'string', description: 'Nouvelle date fin YYYY-MM-DD' },
        description:     { type: 'string', description: 'Nouvelle description' },
      },
      required: ['google_event_id'],
    },
  },

  // ─── IMAGE-TO-IMAGE avec conservation du visage ──────────────────
  {
    name: 'transform_image',
    description: 'Transformer une image en conservant le visage/identité de la personne. Utiliser quand Kouider envoie une photo et demande de changer le décor, appliquer un style (guerrier algérien, savane, anime...) ou modifier l\'arrière-plan tout en gardant le visage exact. Mode image-to-image réel — pas text-to-image. Providers: fal.ai IP-Adapter FaceID (conservation visage maximale) → Flux Dev I2I → Replicate PhotoMaker (fallback).',
    input_schema: {
      type: 'object' as const,
      properties: {
        image_url:        { type: 'string', description: 'URL publique de l\'image source (Supabase, Telegram, etc.)' },
        telegram_file_id: { type: 'string', description: 'File ID Telegram de l\'image envoyée dans le chat (alternatif à image_url)' },
        prompt:           { type: 'string', description: 'Description de la transformation en anglais. Ex: "child in African savanna with lion beside, cinematic realistic lighting" ou "Algerian warrior costume, desert background, dramatic lighting"' },
        style: {
          type: 'string',
          enum: ['realistic', 'anime', 'warrior', 'background_only', 'cinematic'],
          description: 'Style prédéfini: realistic (photo naturelle), anime (dessin animé), warrior (guerrier algérien), background_only (changer seulement le fond), cinematic (style film).',
        },
        strength: { type: 'number', description: 'Intensité transformation 0-1: 0.3 = très fidèle à la source, 0.7 = équilibré (défaut), 0.9 = très libre. Utiliser 0.5-0.7 pour conserver le visage.' },
        provider: {
          type: 'string',
          enum: ['auto', 'fal_ip_adapter', 'fal_flux', 'replicate'],
          description: 'auto = cascade automatique. fal_ip_adapter = conservation visage maximale. fal_flux = Flux style transfer. replicate = PhotoMaker portrait.',
        },
      },
      required: ['prompt'],
    },
  },

  // ─── OBSIDIAN BRAIN ──────────────────────────────────────────────
  {
    name: 'obsidian_find_vault',
    description: 'Détecter automatiquement le chemin du vault Obsidian sur le PC de Kouider via Nexus. Appeler quand Kouider dit "trouve le vault Obsidian", "cherche Obsidian", "où est mon vault", "configure Obsidian", "détecte le vault". Nécessite que Nexus soit en ligne. ⛔ NE PAS utiliser send_nexus_command pour ça.',
    input_schema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'obsidian_read_client',
    description: 'Lire la fiche client depuis Obsidian (cerveau Dzaryx). Appeler quand Kouider mentionne un client par nom, quand un message WhatsApp arrive d\'un client connu, ou avant de répondre à une question sur un client. Retourne: statut VIP, véhicule préféré, nombre de locations, notes privées de Kouider.',
    input_schema: {
      type: 'object' as const,
      properties: {
        client_name: { type: 'string', description: 'Nom complet ou partiel du client. Ex: "Mohamed Bendaoud", "Ahmed"' },
      },
      required: ['client_name'],
    },
  },
  {
    name: 'obsidian_update_client',
    description: 'Créer ou mettre à jour la fiche client dans Obsidian. Appeler après chaque nouvelle location, quand Kouider donne une info sur un client, ou quand le statut change. Enrichit la mémoire long-terme de Dzaryx.',
    input_schema: {
      type: 'object' as const,
      properties: {
        client_name:   { type: 'string', description: 'Nom complet du client' },
        phone:         { type: 'string', description: 'Numéro de téléphone' },
        status:        { type: 'string', enum: ['VIP', 'FREQUENT', 'REGULAR', 'NEW'], description: 'Statut: VIP (5+ locations ou client fidèle), FREQUENT (3-4), REGULAR (2), NEW (1ère fois)' },
        preferred_car: { type: 'string', description: 'Véhicule le plus souvent loué. Ex: "Clio 5 Alpine"' },
        total_rentals: { type: 'number', description: 'Nombre total de locations chez Fik Conciergerie' },
        notes:         { type: 'string', description: 'Notes privées: comportement, préférences, avertissements, anecdotes. Ex: "paie toujours cash, préfère le matin, client difficile sur les retours"' },
        last_rental:   { type: 'string', description: 'Date de la dernière location. Ex: "mai 2026"' },
      },
      required: ['client_name'],
    },
  },
  {
    name: 'obsidian_list_clients',
    description: 'Lister tous les clients dans Obsidian (cerveau Dzaryx). Utiliser quand Kouider demande "qui sont mes clients dans Obsidian", "liste les fiches clients", "quels clients j\'ai enregistrés". Retourne les noms de tous les clients avec fiche.',
    input_schema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'obsidian_write_note',
    description: 'Écrire ou mettre à jour une note libre dans Obsidian. Utiliser pour: préférences Kouider (note "preferences"), style de communication (note "style"), notes business (note "business"), tout ce que Kouider veut que Dzaryx retienne à long terme. Format: note_name = nom sans extension (ex: "preferences", "style", "business/tarifs").',
    input_schema: {
      type: 'object' as const,
      properties: {
        note_name: { type: 'string', description: 'Nom de la note sans extension .md. Ex: "preferences", "style", "instructions". Dossier: "clients/nom" pour les clients.' },
        content:   { type: 'string', description: 'Contenu complet de la note en markdown. Bien structuré avec titres (#) et sections.' },
      },
      required: ['note_name', 'content'],
    },
  },
  {
    name: 'obsidian_read_note',
    description: 'Lire une note libre depuis Obsidian. Utiliser pour lire: préférences Kouider ("preferences"), style communication ("style"), notes business. Toujours lire "preferences" au début d\'une conversation si Kouider semble avoir des préférences spécifiques.',
    input_schema: {
      type: 'object' as const,
      properties: {
        note_name: { type: 'string', description: 'Nom de la note sans extension .md. Ex: "preferences", "style", "business/tarifs"' },
      },
      required: ['note_name'],
    },
  },

  // ─── HEALTH CHECK SYSTÈME COMPLET ────────────────────────────────
  {
    name: 'health_check_all',
    description: 'Tester tous les services système: Railway, Claude API, ElevenLabs, Supabase, Google Calendar, Telegram, NEXUS, GitHub. Retourne ✅/❌/⚠️ pour chaque. Utiliser quand Kouider dit "teste tout", "health check", "statut des services", "qu\'est-ce qui fonctionne".',
    input_schema: { type: 'object' as const, properties: {} },
  },

  // ─── HABIT TRACKER ────────────────────────────────────────────────
  {
    name: 'track_habit',
    description: 'Enregistrer ou mettre à jour une habitude/routine de Kouider dans le système de suivi. Utiliser quand Kouider dit "je fais X chaque Y", "rappelle-moi de faire X", "je veux prendre l\'habitude de X", "note que je fais X". Exemples: vitamines chaque matin, sport chaque lundi, appels clients le mardi.',
    input_schema: {
      type: 'object' as const,
      properties: {
        habit_name:     { type: 'string',  description: 'Nom court de l\'habitude (ex: "vitamines_matin", "sport_lundi", "check_clients")' },
        description:    { type: 'string',  description: 'Description complète (ex: "Prendre 1000mg Vitamine D chaque matin au réveil")' },
        schedule_type:  { type: 'string',  enum: ['daily','weekly','interval','condition'], description: 'Type de récurrence' },
        schedule_cron:  { type: 'string',  description: 'Cron expression si daily/weekly (ex: "0 8 * * *" = 8h chaque jour, "0 10 * * 1" = lundi 10h)' },
        interval_hours: { type: 'number',  description: 'Si schedule_type=interval: intervalle en heures (ex: 24)' },
        action_type:    { type: 'string',  enum: ['remind','check','notify'], description: 'remind=rappel Telegram, check=vérification, notify=notification mobile' },
        active:         { type: 'boolean', description: 'true=actif (défaut), false=désactiver' },
      },
      required: ['habit_name', 'description', 'schedule_type', 'action_type'],
    },
  },

  // ─── EXPORT COMPTABLE ─────────────────────────────────────────────
  {
    name: 'export_accounting',
    description: 'Générer un rapport comptable PDF mensuel complet (toutes réservations + paiements + profits Kouider) et l\'envoyer sur Telegram. Utiliser quand Kouider demande "exporte la compta", "bilan du mois", "rapport mensuel PDF", "envoie les chiffres sur Telegram".',
    input_schema: {
      type: 'object' as const,
      properties: {
        year:  { type: 'number', description: 'Année (défaut: mois précédent)' },
        month: { type: 'number', description: 'Mois 1-12 (défaut: mois précédent)' },
      },
    },
  },

  // ─── GESTION PARC VÉHICULES ──────────────────────────────────────
  {
    name: 'add_car',
    description: 'Ajouter un NOUVEAU véhicule sur le site Fik Conciergerie (autolux-location.vercel.app). Utiliser quand Kouider dit "j\'ai acheté une nouvelle voiture", "ajoute le [nom] à la flotte", "nouveau véhicule [nom]". Le véhicule apparaîtra immédiatement sur le site et dans la page réservation.',
    input_schema: {
      type: 'object' as const,
      properties: {
        name:         { type: 'string',  description: 'Nom complet du véhicule (ex: "Renault Clio 5 Alpine")' },
        category:     { type: 'string',  description: 'Catégorie: citadine, berline, SUV, familiale, utilitaire, premium' },
        seats:        { type: 'number',  description: 'Nombre de places (défaut: 5)' },
        fuel:         { type: 'string',  description: 'Carburant: essence, diesel, électrique, hybride' },
        transmission: { type: 'string',  description: 'Transmission: manuelle, automatique' },
        base_price:   { type: 'number',  description: 'Prix propriétaire (Houari) par jour en €' },
        resale_price: { type: 'number',  description: 'Prix client (affiché sur le site) par jour en €' },
        description:  { type: 'string',  description: 'Description du véhicule pour la fiche client' },
        image_url:    { type: 'string',  description: 'URL de la photo du véhicule (Supabase Storage ou autre)' },
      },
      required: ['name'],
    },
  },
  {
    name: 'get_site_analytics',
    description: 'Obtenir les statistiques RÉELLES du site autolux-location.vercel.app depuis Supabase (table page_views + car_views). TOUJOURS utiliser cet outil quand Kouider dit "stats du site", "statistiques site", "combien de visites", "trafic site", "qui visite le site", "analytics". NE JAMAIS utiliser github_read_file pour ça — les données sont en base Supabase, pas sur GitHub.',
    input_schema: {
      type: 'object' as const,
      properties: {
        days: { type: 'number', description: 'Nombre de derniers jours à analyser (défaut: 30)' },
      },
    },
  },
  {
    name: 'list_reviews',
    description: 'Lister les avis clients du site. Filtre par: pending (en attente modération), approved (publié), all.',
    input_schema: {
      type: 'object' as const,
      properties: {
        filter: { type: 'string', description: 'pending | approved | all (défaut: all)' },
      },
    },
  },
  {
    name: 'approve_review',
    description: 'Publier un avis en attente sur le site.',
    input_schema: {
      type: 'object' as const,
      properties: {
        review_id: { type: 'string', description: 'ID de l\'avis à publier' },
      },
      required: ['review_id'],
    },
  },
  {
    name: 'delete_review',
    description: 'Supprimer un avis du site.',
    input_schema: {
      type: 'object' as const,
      properties: {
        review_id: { type: 'string', description: 'ID de l\'avis à supprimer' },
      },
      required: ['review_id'],
    },
  },
  {
    name: 'delete_car',
    description: 'Supprimer définitivement un véhicule de la flotte et du site. Vérifie qu\'il n\'y a pas de réservation active avant. Utiliser quand Kouider dit "supprime le [nom]", "retire le [nom] de la flotte".',
    input_schema: {
      type: 'object' as const,
      properties: {
        car_name: { type: 'string', description: 'Nom du véhicule à supprimer' },
        car_id:   { type: 'string', description: 'UUID exact (optionnel si car_name fourni)' },
      },
    },
  },
  {
    name: 'update_car',
    description: 'Mettre à jour un véhicule EXISTANT: disponibilité, prix, nom, places, carburant, transmission, image, description. Utiliser quand Kouider dit "la Clio est disponible", "change le prix du Duster à 80€/j", "ajoute une photo au Sandero".',
    input_schema: {
      type: 'object' as const,
      properties: {
        car_name:     { type: 'string',  description: 'Nom ou modèle (recherche partielle)' },
        car_id:       { type: 'string',  description: 'UUID exact (optionnel si car_name fourni)' },
        available:    { type: 'boolean', description: 'true = disponible, false = en location/indisponible' },
        base_price:   { type: 'number',  description: 'Prix propriétaire/jour en €' },
        resale_price: { type: 'number',  description: 'Prix client/jour en € (affiché sur le site)' },
        description:  { type: 'string',  description: 'Description du véhicule' },
        name:         { type: 'string',  description: 'Nouveau nom du véhicule' },
        category:     { type: 'string',  description: 'Catégorie: citadine, berline, SUV, familiale, utilitaire, premium' },
        seats:        { type: 'number',  description: 'Nombre de places' },
        fuel:         { type: 'string',  description: 'Carburant: essence, diesel, électrique, hybride' },
        transmission: { type: 'string',  description: 'Transmission: manuelle, automatique' },
        image_url:    { type: 'string',  description: 'URL de la photo principale' },
      },
    },
  },

  // ─── TRAJET TEMPS RÉEL ────────────────────────────────────────────
  {
    name: 'get_travel_time',
    description: 'Calculer le temps de trajet réel avec trafic depuis la position GPS de l\'utilisateur vers n\'importe quelle destination. Utiliser quand l\'utilisateur parle d\'un rendez-vous, remise de voiture, retour client, trajet, heure de départ. Si origin_lat/origin_lng non fournis, le backend utilise automatiquement la position GPS stockée. Accepte toute adresse — géocodage Google Maps. Retourne temps réel, trafic, heure de départ recommandée, liens Waze et Google Maps.',
    input_schema: {
      type: 'object' as const,
      properties: {
        destination: {
          type: 'string',
          description: 'Destination en texte: "aéroport", "centre-ville", "port", "gare", "Bir El Djir", etc.',
        },
        arrival_time: {
          type: 'string',
          description: 'Heure d\'arrivée souhaitée format "HH:MM" (ex: "12:00", "09:30"). Optionnel.',
        },
        origin_lat: {
          type: 'number',
          description: 'Latitude GPS de l\'utilisateur. Optionnel — omis = utilise position stockée en Redis.',
        },
        origin_lng: {
          type: 'number',
          description: 'Longitude GPS de l\'utilisateur. Optionnel — omis = utilise position stockée en Redis.',
        },
      },
      required: ['destination'],
    },
  },

  // ─── POSITION GPS ACTEUR ──────────────────────────────────────────
  {
    name: 'get_my_location',
    description: 'Récupère la position GPS actuelle de l\'utilisateur (Kouider ou Houari) depuis la dernière synchronisation mobile. Utiliser pour: "je suis où?", "combien de temps depuis ma position", "mon trajet vers X", "suis-je en Algérie ou Belgique?". Retourne ville, pays, coordonnées, heure de mise à jour.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },

  // ─── GPS LIVRAISON ────────────────────────────────────────────────
  {
    name: 'calculate_delivery_fee',
    description: 'Calculer les frais de livraison d\'un véhicule chez un client à Oran. Utiliser quand Kouider demande "livraison chez le client", "combien pour livrer à X", "frais livraison", "je livre la voiture à". Calcule distance dépôt → adresse client, frais livraison (200 DZD/km), temps trajet, liens navigation.',
    input_schema: {
      type: 'object' as const,
      properties: {
        client_address: {
          type: 'string',
          description: 'Adresse ou quartier du client (ex: "Bir El Djir", "aéroport", "Es Sénia", "Ain Turk", adresse complète)',
        },
        car_name: {
          type: 'string',
          description: 'Nom de la voiture à livrer (optionnel, pour le résumé)',
        },
        rate_per_km: {
          type: 'number',
          description: 'Tarif livraison par km en DZD (défaut: 200 DZD/km)',
        },
      },
      required: ['client_address'],
    },
  },

  // ─── INSPECTION VÉHICULE ──────────────────────────────────────────
  {
    name: 'save_vehicle_state_before',
    description: 'Enregistre l\'état du véhicule AVANT la location (inspection départ). Utiliser quand Kouider envoie une photo de voiture avec "état avant", "inspection avant", "départ véhicule", "avant location". Nécessite une image jointe (imageBase64 présente dans le contexte). Sauvegarde la photo + analyse AI des dommages existants dans vehicle_states.',
    input_schema: {
      type: 'object' as const,
      properties: {
        client_name: { type: 'string', description: 'Nom du client (locataire)' },
        car_name:    { type: 'string', description: 'Nom du véhicule (ex: "Clio 5", "Logan")' },
      },
      required: ['client_name', 'car_name'],
    },
  },
  {
    name: 'save_vehicle_state_after',
    description: 'Enregistre l\'état du véhicule APRÈS la location (inspection retour) et compare avec l\'état initial. Utiliser quand Kouider envoie une photo avec "état après", "retour véhicule", "vérif retour", "inspection retour". Compare automatiquement avec l\'état AVANT pour détecter nouveaux dommages.',
    input_schema: {
      type: 'object' as const,
      properties: {
        client_name: { type: 'string', description: 'Nom du client (locataire)' },
        car_name:    { type: 'string', description: 'Nom du véhicule' },
      },
      required: ['client_name', 'car_name'],
    },
  },
  {
    name: 'get_vehicle_states',
    description: 'Voir l\'historique des inspections véhicule (avant/après) pour un client ou une voiture. Utiliser quand Kouider demande "état du véhicule", "historique inspection", "les photos d\'inspection de Mohamed".',
    input_schema: {
      type: 'object' as const,
      properties: {
        client_name: { type: 'string', description: 'Filtrer par nom client (optionnel)' },
        car_name:    { type: 'string', description: 'Filtrer par nom véhicule (optionnel)' },
      },
      required: [],
    },
  },

  // ─── RÈGLES APPRISES (Phase 8) ────────────────────────────────────
  {
    name: 'save_learned_rule',
    description: 'Mémoriser une règle business ou préférence apprise depuis la conversation. Dzaryx la réutilisera dans les prochaines sessions. Utiliser quand l\'utilisateur dit "retiens que...", "note cette règle", "souviens-toi que pour les clients X...", "ne fais plus jamais...", "toujours faire X quand Y".',
    input_schema: {
      type: 'object' as const,
      properties: {
        rule:     { type: 'string', description: 'La règle en langage naturel (ex: "Toujours demander l\'acompte avant de confirmer pour les nouveaux clients")' },
        category: { type: 'string', enum: ['business', 'client', 'pricing', 'communication', 'operations', 'reminder'], description: 'Catégorie de la règle (défaut: business)' },
        context:  { type: 'string', description: 'Contexte d\'apprentissage (optionnel, ex: "suite au problème avec Ahmed en mai")' },
        priority: { type: 'number', description: 'Priorité 1-10 (défaut: 5)' },
      },
      required: ['rule'],
    },
  },
  {
    name: 'list_learned_rules',
    description: 'Lister les règles et préférences apprises par Dzaryx pour cet utilisateur. Utiliser quand l\'utilisateur dit "quelles règles tu connais", "qu\'est-ce que tu as appris", "montre tes règles", "quelles sont mes règles".',
    input_schema: {
      type: 'object' as const,
      properties: {
        category: { type: 'string', enum: ['business', 'client', 'pricing', 'communication', 'operations', 'reminder'], description: 'Filtrer par catégorie (optionnel)' },
      },
    },
  },

  // ─── CONTRAT PDF (Phase 8.2) ──────────────────────────────────────
  {
    name: 'generate_contract',
    description: 'Générer un contrat de location complet en PDF (différent du bon de réservation — contrat avec conditions générales, signature). Crée le PDF, le stocke dans Supabase et l\'envoie sur Telegram. Utiliser quand l\'utilisateur dit "génère le contrat", "crée le contrat de location", "contrat pour X", "contrat signable pour X".',
    input_schema: {
      type: 'object' as const,
      properties: {
        booking_id: { type: 'string', description: 'UUID de la réservation' },
      },
      required: ['booking_id'],
    },
  },

  // ─── EXPORT EXCEL (Phase 8.5) ─────────────────────────────────────
  {
    name: 'export_excel',
    description: 'Générer un export Excel comptable de toutes les réservations et paiements du mois/année. Envoie le fichier .xlsx sur Telegram. Utiliser quand l\'utilisateur dit "exporte en Excel", "fichier Excel", "export Excel du mois", "données Excel", "spreadsheet".',
    input_schema: {
      type: 'object' as const,
      properties: {
        year:  { type: 'number', description: 'Année (défaut: année courante)' },
        month: { type: 'number', description: 'Mois 1-12 (optionnel — sans = toute l\'année)' },
      },
    },
  },

  // ─── SUGGESTIONS TARIFAIRES INTELLIGENTES ────────────────────────
  {
    name: 'suggest_smart_pricing',
    description: 'Analyse les données de location et suggère des ajustements de prix optimaux pour maximiser le CA. À utiliser quand Kouider ou Houari demande "quel prix mettre ?", "est-ce que je devrais baisser/augmenter le prix ?", "suggestions tarifaires", "optimiser les prix".',
    input_schema: {
      type: 'object' as const,
      properties: {
        car_id:    { type: 'string', description: 'UUID du véhicule (optionnel, si pas précisé → analyse toute la flotte)' },
        car_name:  { type: 'string', description: 'Nom du véhicule (ex: "Duster", "Clio")' },
        owner_key: { type: 'string', description: 'kouider ou houari', enum: ['kouider', 'houari'] },
      },
      required: [],
    },
  },
  // ─── MAINTENANCE VÉHICULE ─────────────────────────────────────────
  {
    name: 'update_vehicle_maintenance',
    description: 'Met à jour les données d\'entretien d\'un véhicule: kilométrage actuel, date du dernier entretien, date du prochain entretien. Utiliser quand Kouider dit "j\'ai fait la vidange de X", "mets à jour le km de X", "prochain entretien de X le...".',
    input_schema: {
      type: 'object' as const,
      properties: {
        car_id:              { type: 'string',  description: 'UUID du véhicule' },
        car_name:            { type: 'string',  description: 'Nom du véhicule (ex: "Duster")' },
        current_km:          { type: 'number',  description: 'Kilométrage actuel du véhicule' },
        last_service_date:   { type: 'string',  description: 'Date du dernier entretien (YYYY-MM-DD)' },
        last_service_km:     { type: 'number',  description: 'Km au dernier entretien' },
        next_service_date:   { type: 'string',  description: 'Date du prochain entretien prévu (YYYY-MM-DD)' },
        next_service_km:     { type: 'number',  description: 'Km prévu pour le prochain entretien' },
        service_interval_km: { type: 'number',  description: 'Intervalle entretien en km (défaut: 10000)' },
        service_notes:       { type: 'string',  description: 'Notes sur l\'entretien (ex: "vidange + filtres faits")' },
      },
      required: [],
    },
  },
  {
    name: 'get_vehicle_maintenance',
    description: 'Consulte l\'état d\'entretien du parc: kilométrage, derniers entretiens, prochains entretiens. Utiliser quand demande "état entretien", "vidange de X", "prochain service", "km du Duster".',
    input_schema: {
      type: 'object' as const,
      properties: {
        car_name: { type: 'string', description: 'Nom du véhicule (optionnel, si vide → tous les véhicules)' },
      },
      required: [],
    },
  },
  // ─── ALARME TÉLÉPHONE (natif Android/iOS) ────────────────────────
  {
    name: 'set_phone_alarm',
    description: 'Créer une alarme sur le téléphone de l\'utilisateur. L\'alarme sonne à l\'heure demandée via l\'app alarme native. Utiliser quand l\'utilisateur dit "crée une alarme à X", "réveille-moi à X", "alarme pour X heures", "mets une alarme à Xh".',
    input_schema: {
      type: 'object' as const,
      properties: {
        hour:    { type: 'number', description: 'Heure (0-23)' },
        minute:  { type: 'number', description: 'Minutes (0-59, défaut: 0)' },
        label:   { type: 'string', description: 'Titre de l\'alarme (ex: "Dzaryx — Rappel client")' },
      },
      required: ['hour'],
    },
  },

];
