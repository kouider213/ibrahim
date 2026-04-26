import type Anthropic from '@anthropic-ai/sdk';

export const IBRAHIM_TOOLS: Anthropic.Tool[] = [
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
        status:      { type: 'string', enum: ['PENDING','CONFIRMED','ACTIVE','COMPLETED','REJECTED'] },
        rented_by:   { type: 'string', enum: ['Kouider','Houari'] },
        notes:       { type: 'string' },
      },
      required: ['id'],
    },
  },
  {
    name: 'create_booking',
    description: 'Créer une nouvelle réservation dans Supabase.',
    input_schema: {
      type: 'object' as const,
      properties: {
        car_id:      { type: 'string', description: 'UUID de la voiture' },
        client_name: { type: 'string' },
        client_phone:{ type: 'string' },
        client_age:  { type: 'number', description: 'Âge du client' },
        start_date:  { type: 'string', description: 'YYYY-MM-DD' },
        end_date:    { type: 'string', description: 'YYYY-MM-DD' },
        final_price: { type: 'number' },
        notes:       { type: 'string' },
        rented_by:   { type: 'string', enum: ['Kouider','Houari'], description: 'Défaut: Kouider' },
        status:      { type: 'string', enum: ['PENDING','CONFIRMED','ACTIVE','COMPLETED','REJECTED'], description: 'Défaut: CONFIRMED. Utiliser COMPLETED pour les anciennes réservations terminées.' },
      },
      required: ['car_id','client_name','start_date','end_date','final_price'],
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
    name: 'store_document',
    description: 'Stocker passeport/permis/contrat client dans Supabase Storage.',
    input_schema: {
      type: 'object' as const,
      properties: {
        client_phone: { type: 'string' },
        client_name:  { type: 'string' },
        booking_id:   { type: 'string', description: 'UUID réservation (optionnel)' },
        type:         { type: 'string', enum: ['passport','license','contract','other'] },
        file_url:     { type: 'string', description: 'URL publique du fichier' },
        notes:        { type: 'string' },
      },
      required: ['client_phone','client_name','type','file_url'],
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
    description: 'Mémoriser une nouvelle règle métier dans ibrahim_rules.',
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
    description: 'Mémoriser une information dans la mémoire permanente ibrahim_memory. Utiliser quand Kouider dit "souviens-toi que..." ou "apprends que...".',
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
    description: 'Rechercher dans la mémoire permanente d\'Ibrahim.',
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
    description: 'Lire un fichier depuis n\'importe quel repo GitHub (ibrahim, autolux-location, fik-conciergerie). Utiliser pour lire le code source d\'Ibrahim avant de le modifier.',
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
    description: 'Créer ou modifier un fichier dans un repo GitHub. Pour le repo ibrahim → Railway redéploie automatiquement en 2-3 min. Envoyer le contenu COMPLET du fichier.',
    input_schema: {
      type: 'object' as const,
      properties: {
        repo:    { type: 'string', description: 'Nom du repo: ibrahim, autolux-location, ou fik-conciergerie' },
        path:    { type: 'string', description: 'Chemin du fichier ex: backend/src/integrations/tools.ts' },
        content: { type: 'string', description: 'Contenu COMPLET du fichier (pas de diff, tout le fichier)' },
        message: { type: 'string', description: 'Message de commit (ex: "feat: add booking export tool")' },
      },
      required: ['repo', 'path', 'content'],
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
    description: 'Exécuter du SQL sur la base de données Supabase (SELECT, INSERT, UPDATE, ALTER TABLE, CREATE TABLE, etc.). Nécessite SUPABASE_ACCESS_TOKEN configuré dans Railway.',
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
    description: 'Enregistrer un feedback de Kouider sur une action Ibrahim (réponse, réservation, contenu TikTok, etc.). Ibrahim apprend de ces feedbacks.',
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
    description: 'Rapport mensuel d\'amélioration Ibrahim: nouvelles règles apprises, feedbacks reçus, patterns découverts, performances par catégorie, recommandations.',
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
    description: 'Évolution de l\'apprentissage Ibrahim sur plusieurs mois: tendances, taux de satisfaction, amélioration continue.',
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

  // ─── Contrat de location ─────────────────────────────────────
  {
    name: 'generate_contract',
    description: 'Générer un contrat de location complet et formaté pour une réservation. Retourne le texte du contrat prêt à imprimer ou envoyer. Utiliser quand Kouider dit "génère le contrat pour [client]" ou "fais le contrat de la réservation X".',
    input_schema: {
      type: 'object' as const,
      properties: {
        booking_id: { type: 'string', description: 'UUID de la réservation Supabase' },
      },
      required: ['booking_id'],
    },
  },

  // ─── Statistiques flotte ──────────────────────────────────────
  {
    name: 'get_fleet_stats',
    description: 'Statistiques détaillées par véhicule: CA généré, nombre de réservations, jours loués, durée moyenne, répartition Kouider/Houari. Classement du plus au moins rentable. Utile pour "quelle est ma voiture la plus rentable ?".',
    input_schema: {
      type: 'object' as const,
      properties: {
        year:  { type: 'number', description: 'Année (défaut: année courante)' },
        month: { type: 'number', description: 'Mois 1-12 (optionnel — vide = toute l\'année)' },
      },
    },
  },

  // ─── Alertes immédiates ──────────────────────────────────────
  {
    name: 'send_alert',
    description: 'Envoyer une notification Pushover immédiate à Kouider. Utiliser pour les urgences: client en retard, voiture non rendue, problème urgent. Différent de schedule_reminder qui programme un rappel futur.',
    input_schema: {
      type: 'object' as const,
      properties: {
        message: { type: 'string', description: 'Texte de la notification' },
        title:   { type: 'string', description: 'Titre (défaut: "Ibrahim")' },
        urgent:  { type: 'boolean', description: 'Priorité haute (true = son d\'alerte fort)' },
      },
      required: ['message'],
    },
  },

  // ─── Maintenance flotte ──────────────────────────────────────
  {
    name: 'record_maintenance',
    description: 'Enregistrer un entretien pour une voiture de la flotte (vidange, pneus, freins, contrôle technique, accident, etc.).',
    input_schema: {
      type: 'object' as const,
      properties: {
        car_name:      { type: 'string', description: 'Nom de la voiture (ex: Clio 5, Dacia Sandero)' },
        type:          { type: 'string', description: 'Type d\'entretien: vidange, pneus, freins, controle_technique, accident, nettoyage, autre' },
        date:          { type: 'string', description: 'Date YYYY-MM-DD (défaut: aujourd\'hui)' },
        mileage:       { type: 'number', description: 'Kilométrage au moment de l\'entretien (optionnel)' },
        cost:          { type: 'number', description: 'Coût en DZD (optionnel)' },
        notes:         { type: 'string', description: 'Notes supplémentaires (optionnel)' },
        next_due_date: { type: 'string', description: 'Prochaine échéance YYYY-MM-DD (optionnel — ex: prochaine vidange dans 10 000 km)' },
      },
      required: ['car_name', 'type'],
    },
  },
  {
    name: 'get_fleet_maintenance',
    description: 'Voir l\'historique d\'entretien de la flotte. Affiche les entretiens passés et les alertes pour les échéances à venir dans 30 jours.',
    input_schema: {
      type: 'object' as const,
      properties: {
        car_name: { type: 'string', description: 'Filtrer par nom de voiture (optionnel — vide = toute la flotte)' },
      },
    },
  },

  // ─── Calendrier Google — Gestion événements ─────────────────
  {
    name: 'create_calendar_event',
    description: 'Créer un événement dans le calendrier Google Fik Conciergerie (fikconciergerie@gmail.com). Utiliser pour les nouvelles réservations confirmées.',
    input_schema: {
      type: 'object' as const,
      properties: {
        booking_id:  { type: 'string', description: 'UUID de la réservation Supabase' },
        client_name: { type: 'string', description: 'Nom du client' },
        car_name:    { type: 'string', description: 'Nom du véhicule' },
        start_date:  { type: 'string', description: 'Date début YYYY-MM-DD' },
        end_date:    { type: 'string', description: 'Date fin YYYY-MM-DD' },
        notes:       { type: 'string', description: 'Notes ou commentaires (optionnel)' },
      },
      required: ['booking_id', 'client_name', 'car_name', 'start_date', 'end_date'],
    },
  },
  {
    name: 'update_calendar_event',
    description: 'Modifier un événement existant dans le calendrier Google (changer les dates, le nom, la description).',
    input_schema: {
      type: 'object' as const,
      properties: {
        google_event_id: { type: 'string', description: 'ID Google de l\'événement à modifier' },
        summary:         { type: 'string', description: 'Nouveau titre de l\'événement (optionnel)' },
        start_date:      { type: 'string', description: 'Nouvelle date début YYYY-MM-DD (optionnel)' },
        end_date:        { type: 'string', description: 'Nouvelle date fin YYYY-MM-DD (optionnel)' },
        description:     { type: 'string', description: 'Nouvelle description (optionnel)' },
      },
      required: ['google_event_id'],
    },
  },
  {
    name: 'delete_calendar_event',
    description: 'Supprimer un événement du calendrier Google (ex: après annulation d\'une réservation).',
    input_schema: {
      type: 'object' as const,
      properties: {
        google_event_id: { type: 'string', description: 'ID Google de l\'événement à supprimer' },
      },
      required: ['google_event_id'],
    },
  },

  // ─── TELEGRAM depuis app vocale ──────────────────────────────
  {
    name: 'send_telegram_message',
    description: 'Envoyer un message texte ou une photo/document à Kouider via Telegram. Utiliser depuis l\'app vocale quand Kouider demande d\'envoyer quelque chose sur son Telegram (ex: "envoie-moi le passeport de Omar sur Telegram").',
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
    name: 'get_client_profile',
    description: 'Profil complet d\'un client: historique de toutes ses réservations, total dépensé, montant impayé, documents en archive, téléphone. Utiliser quand Kouider demande "dis-moi tout sur le client X" ou pour vérifier l\'historique avant une nouvelle location.',
    input_schema: {
      type: 'object' as const,
      properties: {
        client_name: { type: 'string', description: 'Nom du client (partiel accepté)' },
      },
      required: ['client_name'],
    },
  },
  {
    name: 'get_client_document',
    description: 'Récupérer un document client stocké (passeport, permis, contrat) depuis Supabase. Retourne l\'URL publique directe pour afficher la photo. Utiliser quand Kouider demande à voir/envoyer un document client.',
    input_schema: {
      type: 'object' as const,
      properties: {
        client_name:  { type: 'string', description: 'Nom du client (partiel accepté)' },
        client_phone: { type: 'string', description: 'Téléphone du client (optionnel)' },
        type:         { type: 'string', enum: ['passport', 'license', 'contract', 'other'], description: 'Type de document (optionnel)' },
      },
      required: [],
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
    description: 'Programmer un rappel Pushover à Kouider. Exemples: "rappelle-moi dans 30min de appeler Houari", "rappel à 14h30 rendez-vous médecin".',
    input_schema: {
      type: 'object' as const,
      properties: {
        message:       { type: 'string',  description: 'Texte du rappel' },
        delay_minutes: { type: 'number',  description: 'Délai en minutes (ex: 30 pour "dans 30 minutes")' },
        at_time:       { type: 'string',  description: 'Heure exacte HH:MM heure Bruxelles (ex: "14:30") — alternatif à delay_minutes' },
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
];
