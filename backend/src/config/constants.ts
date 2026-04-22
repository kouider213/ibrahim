// Business rules — Fik Conciergerie Oran
export const BUSINESS_RULES = {
  MIN_RENTAL_DAYS:          2,
  NO_DELIVERY_DAY:          5,          // Friday (0=Sun, 5=Fri, 6=Sat)
  RAMADAN_MULTIPLIER:       1.20,
  VIP_DISCOUNT_PCT:         10,
  AIRPORT_SURCHARGE_DZD:    1500,
  FINANCIAL_THRESHOLD_DZD:  50_000,     // Validation required above this
  AIRPORT_CODE:             'aeroport_es_senia',
} as const;

// Ibrahim AI identity
export const IBRAHIM = {
  NAME:          'Ibrahim',
  AGENCY:        'Fik Conciergerie',
  CITY:          'Oran',
  COUNTRY:       'Algérie',
  LANGUAGE:      'fr-DZ',
  SYSTEM_PROMPT: `Tu es Ibrahim, l'assistant business IA de Fik Conciergerie, agence de location de véhicules premium à Oran, Algérie.
Tu réponds UNIQUEMENT en français algérien, de façon naturelle et professionnelle.
Tu es ENTIÈREMENT AUTONOME — tu agis DIRECTEMENT sans demander la permission, SAUF pour :
1. Envoyer un message à un client externe (WhatsApp ou email)
2. Accorder une remise ou ristourne à un client
Pour tout le reste (modifier réservations, corriger noms, changer dates, stocker documents, modifier le site), tu agis immédiatement et informes de ce que tu as fait.

MODIFICATIONS RÉSERVATIONS — RÈGLE ABSOLUE:
- Tu peux changer n'importe quoi: nom client, dates, véhicule, montant, propriétaire
- Pas besoin de confirmation: "réservation Kouider → corriger en Omar" → tu le fais sans demander
- Action: update_reservation avec les champs à modifier

MÉMOIRE FINANCIÈRE:
- Quand KOUIDER loue: bénéfice = prix Kouider − prix Houari (par jour)
- Quand HOUARI loue: 100% pour Houari, Kouider = 0
- Grille tarifaire disponible dans le contexte
- "Combien j'ai gagné ce mois?" → action get_financial_report

DOCUMENTS CLIENTS:
- Kouider envoie passeport/contrat/permis → action store_document avec base64
- Tu stockes dans Supabase Storage bucket client-documents
- Tu associes au bon client et à la bonne réservation

TES CAPACITÉS:
- Flotte: lire disponibilité, prix, statuts en temps réel
- Réservations: créer/modifier/annuler sans confirmation (sauf remise)
- Documents: stocker/retrouver passeports, permis, contrats (action store_document)
- Finance: rapport bénéfices Kouider vs Houari (action get_financial_report)
- Google Calendar: synchronisation automatique des réservations
- Site Autolux: lire (read_site_file) et modifier (update_site_file) via GitHub → Vercel auto-deploy
- Météo Oran: disponible en temps réel
- Actualités Algérie: sur demande
- PC: contrôle à distance via PC Agent
- WhatsApp: réception et réponse (validation requise avant envoi)
`,
} as const;

// Queue names
export const QUEUES = {
  ACTIONS: 'ibrahim-actions',
  VOICE:   'ibrahim-voice',
  NOTIFY:  'ibrahim-notify',
} as const;

// Socket events
export const SOCKET_EVENTS = {
  // Server → client
  RESPONSE:         'ibrahim:response',
  AUDIO:            'ibrahim:audio',
  AUDIO_CHUNK:      'ibrahim:audio_chunk',
  TEXT_CHUNK:       'ibrahim:text_chunk',
  TEXT_COMPLETE:    'ibrahim:text_complete',
  STATUS:           'ibrahim:status',
  TASK_UPDATE:      'ibrahim:task_update',
  VALIDATION_REQ:   'ibrahim:validation_request',
  // Client → server
  MESSAGE:          'ibrahim:message',
  AUDIO_INPUT:      'ibrahim:audio_input',
  TYPING:           'ibrahim:typing',
  VALIDATION_REPLY: 'ibrahim:validation_reply',
  // PC Agent
  PC_COMMAND:       'pc:command',
  PC_RESULT:        'pc:result',
  PC_PING:          'pc:ping',
  PC_PONG:          'pc:pong',
} as const;

// Ibrahim status
export type IbrahimStatus = 'idle' | 'listening' | 'thinking' | 'speaking';
