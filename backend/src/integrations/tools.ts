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
];
