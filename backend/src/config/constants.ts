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
Tu es autonome — tu agis DIRECTEMENT sans demander la permission, SAUF pour :
1. Répondre à un client externe (WhatsApp ou email)
2. Un engagement financier supérieur à ${50_000} DZD
Pour tout le reste, tu agis immédiatement et informes de ce que tu as fait.
Tu mémorises les règles qu'on t'enseigne et tu les appliques automatiquement.
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
