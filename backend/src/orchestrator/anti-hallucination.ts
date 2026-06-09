import type { ToolExecution } from '../integrations/claude-api.js';
import { phantomGuard, PHANTOM_REFUSAL } from '../conversation/response-guard.js';

// Tools that legitimize numeric/data claims
const DATA_TOOLS = new Set([
  'get_financial_report', 'get_revenue_report', 'get_finance_dashboard',
  'list_bookings', 'check_car_availability', 'get_payment_status',
  'get_unpaid_bookings', 'get_late_returns', 'check_anomalies',
  'supabase_execute',
  'create_booking', 'update_booking', 'cancel_booking',
  'get_fleet_status', 'get_client_document',
]);

// Financial report patterns — both formal reports AND casual amount claims
const FINANCIAL_REPORT_PATTERNS: RegExp[] = [
  /rapport\s+financier/i,
  /chiffre\s+d['']affaires/i,
  /b[eé]n[eé]fice\s+(total|net|brut)/i,
  /revenu\s+(total|mensuel|annuel)/i,
  /total\s+(des\s+)?r[eé]servations\s*:\s*\d/i,
  // Casual financial claims with amounts
  /tes\s+revenus?\s+(sont|s['']él[eè]ve|atteignent)/i,
  /tu\s+as\s+gagn[eé]/i,
  /profit\s+(de|est|s['']él[eè]ve\s+[aà])/i,
  /[\d\s,]+\s*(da|dzd|€|dinar|euro)\s+(de\s+)?(b[eé]n[eé]fice|revenu|profit|chiffre)/i,
  /tu\s+(as\s+)?fait\s+[\d\s,]+(da|dzd|€|dinar|euro)/i,
  /ca\s+(mensuel|annuel|total)\s*[=:]\s*\d/i,
];

// Claims about reading real system state without calling a tool
const SYSTEM_STATE_CLAIMS: RegExp[] = [
  /j['']ai\s+(v[eé]rifi[eé]|consult[eé]|regard[eé])\s+(les|la|le|vos)\s+(r[eé]servation|voiture|client|planning)/i,
  /d['']apr[eè]s\s+(mes|les)\s+donn[eé]es/i,
  /selon\s+(mes|les)\s+enregistrements/i,
  /j['']ai\s+acc[eè]s\s+[aà]\s+(vos|ces|les)/i,
  /j['']ai\s+consult[eé]\s+(la\s+base|supabase|la\s+base\s+de\s+donn[eé]es)/i,
  /en\s+consultant\s+(vos|les|la)\s+(donn[eé]es|r[eé]servations|v[eé]hicules|voitures)/i,
  /d['']apr[eè]s\s+(ma\s+consultation|mon\s+acc[eè]s)/i,
  /j['']ai\s+(lu|analys[eé])\s+(vos|les)\s+(donn[eé]es|r[eé]servations)/i,
];

// Booking count claims — requires a list_bookings or similar
const BOOKING_COUNT_PATTERNS: RegExp[] = [
  /tu\s+as\s+\d+\s+r[eé]servations?/i,
  /il\s+y\s+a\s+\d+\s+r[eé]servations?/i,
  /\d+\s+r[eé]servations?\s+(en\s+cours|actives?|confirm[eé]es?|ce\s+mois)/i,
  /aucune\s+r[eé]servation\s+(en\s+cours|ce\s+mois|aujourd['']hui)/i,
  /pas\s+(de|d[''])\s+r[eé]servation\s+(en\s+cours|ce\s+mois)/i,
];
const BOOKING_TOOLS = new Set([
  'list_bookings', 'check_car_availability', 'check_anomalies',
  'get_financial_report', 'supabase_execute',
]);

// Car availability claims — requires fleet/booking tool
const CAR_NAMES_PATTERN = /(jumpy|berlingo|jogger|sandero|clio|alpine|duster|creta|fiat\s*500|i10)/i;
const AVAIL_STATUS_PATTERN = /(disponible|indisponible|en\s+location|occup[eé]e?|libre|retour\s+pr[eé]vu)/i;
const AVAIL_TOOLS = new Set([
  'check_car_availability', 'get_fleet_status', 'list_bookings', 'supabase_execute',
]);

// Payment claims — requires payment tool
const PAYMENT_CLAIM_PATTERNS: RegExp[] = [
  /[\d\s,]+\s*(da|dzd|€|dinar|euro)\s+(non\s+pay[eé]|impay[eé]|d[uû])/i,
  /montant\s+(impay[eé]|d[uû]|non\s+r[eé]gl[eé])/i,
  /client\s+(n['']a\s+pas\s+pay[eé]|est\s+en\s+retard)/i,
  /facture\s+(impay[eé]e?|en\s+attente|non\s+r[eé]gl[eé]e?)/i,
];
const PAYMENT_TOOLS = new Set([
  'get_payment_status', 'get_unpaid_bookings', 'supabase_execute', 'get_financial_report',
]);

// Fast-path providers (Groq/Gemini/OpenAI) have NO tools — block any business data claim
const FAST_PATH_FORBIDDEN_PATTERNS: RegExp[] = [
  /[\d\s,]+\s*(da|dzd|€|dinar|euro)/i,
  /\d+\s+r[eé]servations?/i,
  /(disponible|indisponible|en\s+location|occup[eé])\s+(maintenant|actuellement|en\s+ce\s+moment)/i,
  /\d+\s+clients?\s+(actifs?|ce\s+mois|en\s+cours)/i,
  /tes\s+revenus?\s+(sont|s['']él[eè]ve)/i,
  /tu\s+as\s+gagn[eé]/i,
  /j['']ai\s+(consult[eé]|v[eé]rifi[eé]|regard[eé])\s+(la\s+base|supabase|les\s+donn[eé]es)/i,
  /d['']apr[eè]s\s+(mes|les)\s+donn[eé]es/i,
  /b[eé]n[eé]fice\s+(de|est)\s+[\d,]/i,
  /chiffre\s+d['']affaires\s+(de|est)\s+[\d,]/i,
];

export const FAST_PATH_REFUSAL = '⚠️ Je n\'ai pas accès aux données en temps réel pour cette question. Pose-la moi directement et je consulterai la base de données pour te donner une réponse précise.';

export function fastPathGuard(text: string, userMessage: string, requestId: string): string {
  const hasForbiddenClaim = FAST_PATH_FORBIDDEN_PATTERNS.some(p => p.test(text));
  if (hasForbiddenClaim) {
    console.log(
      `[fast-path-guard:${requestId}] ⛔ FAST_PATH_BLOCKED business data claim without tools` +
      ` user="${userMessage.slice(0, 60).replace(/\n/g, ' ')}"` +
      ` text="${text.slice(0, 100).replace(/\n/g, ' ')}"`,
    );
    return FAST_PATH_REFUSAL;
  }
  return text;
}

// ── Localisation des messages de garde ──────────────────────────────────────
// Quand une garde bloque (et que le retry forçant l'outil a aussi échoué), on
// renvoie le message de refus dans la langue de l'interlocuteur (miroir Houari).
export type GuardLang = 'fr' | 'darija' | 'es' | 'en';

const GUARD_I18N: Record<string, Partial<Record<GuardLang, string>>> = {
  financial_claim_no_data: {
    darija: '⚠️ ما نجمش نعطيك أرقام بلا ما نشوف القاعدة. درك نحسبهملك من الداتا الحقيقية.',
    es:     '⚠️ No puedo dar cifras sin haber consultado la base de datos. Pregúntamelo y la reviso ahora.',
    en:     '⚠️ I can\'t give figures without checking the database. Ask me and I\'ll pull the real data now.',
  },
  system_state_claim: {
    darija: '⚠️ ما نقدرش نقول بللي شفت الداتا تاعك بلا ما نديرها بالفعل. قولي واش تحب نشوف ونلانسي الأداة.',
    es:     '⚠️ No puedo afirmar haber consultado tus datos sin ejecutar una consulta real. Dime qué verificar y lanzo la herramienta.',
    en:     '⚠️ I can\'t claim to have checked your data without running a real query. Tell me what to check and I\'ll run the tool.',
  },
  booking_count_claim: {
    darija: '⚠️ ما نجمش نعطيك عدد الحجوزات بلا ما نشوف القاعدة. قولي واش تحب ونلانسي list_bookings درك.',
    es:     '⚠️ No puedo dar un número de reservas sin consultar la base de datos. Dime qué quieres y uso list_bookings ya.',
    en:     '⚠️ I can\'t give a booking count without checking the database. Tell me what you need and I\'ll run list_bookings now.',
  },
  car_avail_claim: {
    darija: '⚠️ ما نجمش نأكد ديسبونيبيليتي الطوموبيل بلا ما نشوف القاعدة. درك نلانسي check_car_availability.',
    es:     '⚠️ No puedo confirmar la disponibilidad de un coche sin verificar la base de datos. Lanzo check_car_availability ahora.',
    en:     '⚠️ I can\'t confirm a car\'s availability without checking the database. Running check_car_availability now.',
  },
  payment_claim: {
    darija: '⚠️ ما نجمش نأكد حالة الخلاص بلا ما نشوف الداتا. درك نشوف بـ get_payment_status.',
    es:     '⚠️ No puedo confirmar un estado de pago sin consultar los datos. Lo verifico con get_payment_status.',
    en:     '⚠️ I can\'t confirm a payment status without checking the data. Verifying with get_payment_status.',
  },
  phantom_action: {
    darija: '⚠️ ما درتش هاد الحاجة. حتى أداة حقيقية ما تلانسات — ما نجمش نأكد بللي درت شي حاجة.',
    es:     '⚠️ No ejecuté esa acción. No se llamó ninguna herramienta real — no puedo confirmar haber hecho nada.',
    en:     '⚠️ I didn\'t perform that action. No real tool was called — I can\'t confirm I did anything.',
  },
  fast_path: {
    darija: '⚠️ ما عنديش الداتا فالوقت الحقيقي لهاد السؤال. قولهالي نيشان ونشوف القاعدة باش نجاوبك بالصح.',
    es:     '⚠️ No tengo acceso a datos en tiempo real para esto. Pregúntamelo directamente y consulto la base de datos.',
    en:     '⚠️ I don\'t have real-time data for this. Ask me directly and I\'ll check the database for a precise answer.',
  },
};

/** Renvoie le message de garde traduit, ou null si pas de traduction (→ garder le FR d'origine). */
export function localizeGuard(reason: string | null, lang: GuardLang): string | null {
  if (!reason || lang === 'fr') return null;
  return GUARD_I18N[reason]?.[lang] ?? null;
}

export interface HallucinationCheck {
  safe:    boolean;
  reason:  'phantom_action' | 'financial_claim_no_data' | 'system_state_claim' | 'booking_count_claim' | 'car_avail_claim' | 'payment_claim' | null;
  blocked: string | null;
}

export function checkAntiHallucination(
  text:          string,
  toolsExecuted: ToolExecution[],
  userMessage:   string,
  requestId:     string,
): HallucinationCheck {
  // Gate 1: phantom write guard (existing — definitive blocker)
  const phantomResult = phantomGuard(text, toolsExecuted, userMessage, requestId);
  if (phantomResult === PHANTOM_REFUSAL) {
    return { safe: false, reason: 'phantom_action', blocked: PHANTOM_REFUSAL };
  }

  // Gate 2: financial report/amount claim without data tool
  const isFinancialReport = FINANCIAL_REPORT_PATTERNS.some(p => p.test(text));
  if (isFinancialReport) {
    const hasDataTool = toolsExecuted.some(t => DATA_TOOLS.has(t.name) && t.success);
    if (!hasDataTool) {
      console.log(
        `[anti-hallucination:${requestId}] ⛔ FINANCIAL_REPORT_BLOCKED no data tool` +
        ` tools=[${toolsExecuted.map(t => t.name).join(',') || 'none'}]` +
        ` text="${text.slice(0, 100).replace(/\n/g, ' ')}"`,
      );
      return {
        safe:    false,
        reason:  'financial_claim_no_data',
        blocked: '⚠️ Impossible de générer ce rapport — aucune donnée financière réelle n\'a été récupérée.\nJe ne fournis pas de chiffres sans avoir consulté la base de données.',
      };
    }
  }

  // Gate 3: system state claims with zero tools
  const hasStateClaim = SYSTEM_STATE_CLAIMS.some(p => p.test(text));
  if (hasStateClaim && toolsExecuted.length === 0) {
    console.log(
      `[anti-hallucination:${requestId}] ⛔ SYSTEM_STATE_CLAIM_BLOCKED no tools` +
      ` claim="${text.slice(0, 80).replace(/\n/g, ' ')}"`,
    );
    return {
      safe:    false,
      reason:  'system_state_claim',
      blocked: '⚠️ Je ne peux pas affirmer avoir consulté vos données sans avoir exécuté une requête réelle.\nDemandez-moi de vérifier explicitement et je lancerai l\'outil approprié.',
    };
  }

  // Gate 4: booking count claims without booking tool
  const hasBookingCount = BOOKING_COUNT_PATTERNS.some(p => p.test(text));
  if (hasBookingCount) {
    const hasBookingTool = toolsExecuted.some(t => BOOKING_TOOLS.has(t.name) && t.success);
    if (!hasBookingTool) {
      console.log(
        `[anti-hallucination:${requestId}] ⛔ BOOKING_COUNT_BLOCKED no booking tool` +
        ` tools=[${toolsExecuted.map(t => t.name).join(',') || 'none'}]` +
        ` text="${text.slice(0, 100).replace(/\n/g, ' ')}"`,
      );
      return {
        safe:    false,
        reason:  'booking_count_claim',
        blocked: '⚠️ Je ne peux pas donner un nombre de réservations sans avoir consulté la base de données.\nDis-moi ce que tu veux savoir et j\'utilise list_bookings immédiatement.',
      };
    }
  }

  // Gate 4b: car availability claims without fleet/booking tool
  const hasCarName   = CAR_NAMES_PATTERN.test(text);
  const hasAvailStat = AVAIL_STATUS_PATTERN.test(text);
  if (hasCarName && hasAvailStat) {
    const hasAvailTool = toolsExecuted.some(t => AVAIL_TOOLS.has(t.name) && t.success);
    if (!hasAvailTool) {
      console.log(
        `[anti-hallucination:${requestId}] ⛔ CAR_AVAIL_BLOCKED no fleet tool` +
        ` tools=[${toolsExecuted.map(t => t.name).join(',') || 'none'}]` +
        ` text="${text.slice(0, 100).replace(/\n/g, ' ')}"`,
      );
      return {
        safe:    false,
        reason:  'car_avail_claim',
        blocked: '⚠️ Je ne peux pas confirmer la disponibilité d\'un véhicule sans avoir vérifié la base de données.\nJe lance check_car_availability maintenant.',
      };
    }
  }

  // Gate 4c: payment claims without payment tool
  const hasPaymentClaim = PAYMENT_CLAIM_PATTERNS.some(p => p.test(text));
  if (hasPaymentClaim) {
    const hasPaymentTool = toolsExecuted.some(t => PAYMENT_TOOLS.has(t.name) && t.success);
    if (!hasPaymentTool) {
      console.log(
        `[anti-hallucination:${requestId}] ⛔ PAYMENT_CLAIM_BLOCKED no payment tool` +
        ` tools=[${toolsExecuted.map(t => t.name).join(',') || 'none'}]` +
        ` text="${text.slice(0, 100).replace(/\n/g, ' ')}"`,
      );
      return {
        safe:    false,
        reason:  'payment_claim',
        blocked: '⚠️ Je ne peux pas affirmer un statut de paiement sans avoir consulté les données.\nJe vérifie avec get_payment_status.',
      };
    }
  }

  return { safe: true, reason: null, blocked: null };
}

export interface ExecutionTrace {
  requestId:       string;
  channel:         string;
  sessionId:       string;
  toolsExecuted:   ToolExecution[];
  responseAllowed: boolean;
  priorityScore:   number;
  priorityLevel:   string;
  agentUsed:       string;
  focusStatus:     string;
  latencyMs:       number;
}

export function logExecutionTrace(t: ExecutionTrace): void {
  const writeSuccess = t.toolsExecuted.some(x => x.success);
  console.log(
    `[orchestrator-trace] {` +
    `"request_id":"${t.requestId}",` +
    `"channel":"${t.channel}",` +
    `"session":"${t.sessionId.slice(0, 30)}",` +
    `"tools":[${t.toolsExecuted.map(x => `"${x.name}"`).join(',')}],` +
    `"write_success":${writeSuccess},` +
    `"response_allowed":${t.responseAllowed},` +
    `"priority":${t.priorityScore},` +
    `"priority_level":"${t.priorityLevel}",` +
    `"agent":"${t.agentUsed}",` +
    `"focus":"${t.focusStatus}",` +
    `"ms":${t.latencyMs}` +
    `}`,
  );
}

export { PHANTOM_REFUSAL };
