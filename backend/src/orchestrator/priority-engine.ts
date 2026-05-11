export type PriorityLevel = 'CRITICAL' | 'HIGH' | 'NORMAL' | 'LOW';
export type SourceChannel = 'telegram' | 'mobile_voice' | 'mobile_text' | 'backend_internal';

export interface PriorityScore {
  level:  PriorityLevel;
  score:  number;   // 1–10
  reason: string;
}

// Ordered by descending severity
const CRITICAL_PATTERNS: Array<[RegExp, string]> = [
  [/vol[eé]\b|accident\b|urgence\b|secours\b|police\b|ambulance\b/i,  'emergency'],
  [/voiture.*vol[eé]|vol[eé].*voiture/i,                               'vehicle_theft'],
  [/client.*(bloqu[eé]|bless[eé]|accident)/i,                          'client_emergency'],
  [/panne.*autoroute|bloqu[eé].*autoroute/i,                           'breakdown_highway'],
];

const HIGH_PATTERNS: Array<[RegExp, string]> = [
  [/cr[eé][eé]r?\s+(une?|la|le)?\s*r[eé]servation|nouvelle\s+r[eé]servation|ajoute\s+(une?)?\s*r[eé]sa/i, 'create_booking'],
  [/annule|supprime\s+(la|le)?\s*(r[eé]sa|réservation|booking)/i,                                           'cancel_booking'],
  [/modifie|change|mets?\s+[aà]\s+jour\s+(la|le)?/i,                                                       'modify_record'],
  [/paiement|paye\b|encaisse|r[eè]gle\s+(la|le)?\s*(facture|note)/i,                                       'payment'],
  [/retard|impay[eé]|d[eé]pass[eé]\s+(la\s+)?date|non\s+rendu/i,                                           'overdue'],
  [/programme\s+(un|le)?\s*rappel|reminder|schedule/i,                                                      'reminder'],
  [/envoie\s+(sur\s+)?telegram|envoie\s+(le\s+)?message|send\s+telegram/i,                                  'send_message'],
  [/d[eé]ploie|deploy|push\s+sur\s+railway/i,                                                               'deploy'],
];

const LOW_PATTERNS: Array<[RegExp, string]> = [
  [/^(bonjour|bonsoir|salam\s+alaykoum?|salut\b|cava\b|ça\s+va\??|hello\b|hi\b|hey\b)/i, 'greeting'],
  [/merci\b|bonne\s+(journée|soirée|nuit)|à\s+(bientôt|demain)/i,                          'farewell'],
  [/blague|joke|raconte\s+une\s+histoire/i,                                                  'entertainment'],
  [/meteo\b|météo\b|temps\s+qu'il\s+fait/i,                                                  'weather_casual'],
];

// Telegram = direct operator channel → slight score boost
const CHANNEL_BOOST: Record<SourceChannel, number> = {
  telegram:          1,
  mobile_voice:      0,
  mobile_text:       0,
  backend_internal: -1,
};

export function scorePriority(message: string, channel: SourceChannel): PriorityScore {
  const boost = CHANNEL_BOOST[channel] ?? 0;

  for (const [pattern, reason] of CRITICAL_PATTERNS) {
    if (pattern.test(message)) {
      return { level: 'CRITICAL', score: 10, reason };
    }
  }

  for (const [pattern, reason] of HIGH_PATTERNS) {
    if (pattern.test(message)) {
      return { level: 'HIGH', score: Math.min(10, 8 + boost), reason };
    }
  }

  for (const [pattern, reason] of LOW_PATTERNS) {
    if (pattern.test(message)) {
      return { level: 'LOW', score: Math.max(1, 2 + boost), reason };
    }
  }

  return { level: 'NORMAL', score: Math.min(10, 5 + boost), reason: 'default' };
}

export function priorityToQueuePriority(p: PriorityScore): number {
  // BullMQ: lower number = higher priority
  switch (p.level) {
    case 'CRITICAL': return 1;
    case 'HIGH':     return 3;
    case 'NORMAL':   return 5;
    case 'LOW':      return 8;
  }
}
