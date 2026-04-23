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
      },
      required: ['car_id','client_name','client_age','start_date','end_date','final_price'],
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
];
