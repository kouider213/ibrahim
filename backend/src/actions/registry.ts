export type ActionCategory = 'reservation' | 'content' | 'pc' | 'query' | 'rule';

export interface ActionDefinition {
  name:               string;
  category:           ActionCategory;
  description:        string;
  requiresValidation: boolean;
  handler:            string;
}

const actions: ActionDefinition[] = [
  // Reservations
  {
    name:               'create_reservation',
    category:           'reservation',
    description:        'Créer une nouvelle réservation véhicule',
    requiresValidation: false,
    handler:            'reservation',
  },
  {
    name:               'update_reservation',
    category:           'reservation',
    description:        'Modifier une réservation existante',
    requiresValidation: false,
    handler:            'reservation',
  },
  {
    name:               'cancel_reservation',
    category:           'reservation',
    description:        'Annuler une réservation',
    requiresValidation: false,
    handler:            'reservation',
  },
  {
    name:               'list_reservations',
    category:           'reservation',
    description:        'Lister les réservations',
    requiresValidation: false,
    handler:            'reservation',
  },
  {
    name:               'check_availability',
    category:           'reservation',
    description:        'Vérifier la disponibilité d\'un véhicule',
    requiresValidation: false,
    handler:            'reservation',
  },
  // Client communication — always needs validation
  {
    name:               'reply_to_client',
    category:           'query',
    description:        'Répondre à un client WhatsApp ou email',
    requiresValidation: true,
    handler:            'reservation',
  },
  // Content
  {
    name:               'generate_tiktok',
    category:           'content',
    description:        'Générer un script TikTok',
    requiresValidation: false,
    handler:            'content',
  },
  {
    name:               'generate_post',
    category:           'content',
    description:        'Générer un post réseaux sociaux',
    requiresValidation: false,
    handler:            'content',
  },
  // PC agent
  {
    name:               'pc_open_file',
    category:           'pc',
    description:        'Ouvrir un fichier sur le PC',
    requiresValidation: false,
    handler:            'pc-relay',
  },
  {
    name:               'pc_run_command',
    category:           'pc',
    description:        'Exécuter une commande sur le PC',
    requiresValidation: false,
    handler:            'pc-relay',
  },
  {
    name:               'pc_screenshot',
    category:           'pc',
    description:        'Prendre une capture d\'écran du PC',
    requiresValidation: false,
    handler:            'pc-relay',
  },
  // Rules
  {
    name:               'learn_rule',
    category:           'rule',
    description:        'Apprendre et mémoriser une nouvelle règle',
    requiresValidation: false,
    handler:            'reservation',
  },
  // Finance
  {
    name:               'get_financial_report',
    category:           'query',
    description:        'Rapport financier mensuel — bénéfice Kouider, revenu Houari',
    requiresValidation: false,
    handler:            'finance',
  },
  {
    name:               'set_booking_owner',
    category:           'reservation',
    description:        'Attribuer une réservation à Kouider ou Houari',
    requiresValidation: false,
    handler:            'finance',
  },
  // Documents
  {
    name:               'store_document',
    category:           'query',
    description:        'Stocker document client (passeport, permis, contrat) dans Supabase Storage',
    requiresValidation: false,
    handler:            'finance',
  },
  // Site Autolux
  {
    name:               'read_site_file',
    category:           'query',
    description:        'Lire un fichier du site autolux-location sur GitHub',
    requiresValidation: false,
    handler:            'finance',
  },
  {
    name:               'update_site_file',
    category:           'content',
    description:        'Modifier un fichier du site autolux-location via GitHub → Vercel',
    requiresValidation: false,
    handler:            'finance',
  },
];

const registry = new Map<string, ActionDefinition>(
  actions.map(a => [a.name, a]),
);

export function getAction(name: string): ActionDefinition | undefined {
  return registry.get(name);
}

export function getAllActions(): ActionDefinition[] {
  return Array.from(registry.values());
}

export function actionRequiresValidation(name: string): boolean {
  return registry.get(name)?.requiresValidation ?? false;
}
