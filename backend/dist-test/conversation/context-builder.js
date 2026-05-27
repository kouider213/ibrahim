"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildContext = buildContext;
const supabase_js_1 = require("../integrations/supabase.js");
const web_search_js_1 = require("../integrations/web-search.js");
const google_calendar_js_1 = require("../integrations/google-calendar.js");
const finance_js_1 = require("../integrations/finance.js");
const pricing_js_1 = require("../config/pricing.js");
const compaction_js_1 = require("./compaction.js");
const language_detector_js_1 = require("./language-detector.js");
const memory_selector_js_1 = require("./memory-selector.js");
// Cache météo 5 minutes
let weatherCache = null;
async function getCachedWeather() {
    if (weatherCache && Date.now() - weatherCache.ts < 5 * 60 * 1000)
        return weatherCache.data;
    const w = await (0, web_search_js_1.getOranWeather)().catch(() => undefined);
    if (w)
        weatherCache = { data: w, ts: Date.now() };
    return w;
}
// Cache flotte + réservations + règles 2 minutes
let fleetCache = null;
let bookingsCache = null;
let rulesCache = null;
async function getCachedRules() {
    if (rulesCache && Date.now() - rulesCache.ts < 2 * 60 * 1000)
        return rulesCache.data;
    const data = await (0, supabase_js_1.getActiveRules)().catch(() => []);
    rulesCache = { data, ts: Date.now() };
    return data;
}
async function getCachedFleet() {
    if (fleetCache && Date.now() - fleetCache.ts < 2 * 60 * 1000)
        return fleetCache.data;
    const data = await (0, supabase_js_1.getFleet)().catch(() => []);
    fleetCache = { data, ts: Date.now() };
    return data;
}
async function getCachedBookings() {
    if (bookingsCache && Date.now() - bookingsCache.ts < 2 * 60 * 1000)
        return bookingsCache.data;
    const data = await (0, supabase_js_1.getBookings)({ limit: 50 }).catch(() => []);
    bookingsCache = { data, ts: Date.now() };
    return data;
}
// ── Intent detection: action requests need minimal history (avoids echoing old confirmations) ──
const ACTION_INTENT_PATTERNS = [
    /résumé (du jour|de la journée|journée)/i,
    /rapport (financier|du mois|de la semaine|annuel|hebdo)/i,
    /disponibilit/i,
    /(fais|crée|génère|lance) (une? )?(vidéo|pub|tiktok|clip)/i,
    /(analyse|lis|ocr) (ce |le |la |un |une )?(passeport|permis|document|contrat)/i,
    /(génère|crée|fais|envoie) (le )?(bon|contrat|pdf) (de réservation |de |pour )/i,
    /météo\b/i,
    /actualit|news\b/i,
    /résumé (de |du )?(week[- ]?end|semaine)/i,
];
function isActionIntent(msg) {
    return ACTION_INTENT_PATTERNS.some(p => p.test(msg));
}
// ── Filter old confirmation-only assistant messages from distant history ──
// Note: \b does not work after accented chars (é, è…) in JS — use explicit char class instead.
const OLD_CONFIRMATION_PATTERNS = [
    /^compris parfaitement\b/i,
    /^c'est (bien )?not[eé]/i,
    /^bien not[eé]/i,
    /^not[eé]\s.*r[eè]gle/i,
    /^d'accord[,!.\s]/i,
    /^je retiens\b/i,
    /^je vais appliquer\b/i,
    /^entendu[,!.\s].*r[eè]gle/i,
    /^je comprends (et )?(retiens|note)\b/i,
];
function isConfirmationOnlyMessage(msg) {
    if (msg.role !== 'assistant')
        return false;
    const text = typeof msg.content === 'string' ? msg.content.trim() : '';
    if (text.length > 500)
        return false; // Long messages contain actual business data — keep them
    return OLD_CONFIRMATION_PATTERNS.some(p => p.test(text));
}
async function buildContext(sessionId, userMessage) {
    const needsNews = /actualit|news|journal|presse|info/i.test(userMessage);
    const needsFinance = /combien|gagn|b[eé]n[eé]fice|revenu|profit|finance|rapport|mois|argent|kouider|houari|part.*houari|part.*kouider|total|depuis.*janvier|d[eé]but.*ann[eé]e|cette.*ann[eé]e|bilan/i.test(userMessage);
    const needsAnnualFinance = /depuis.*janvier|d[eé]but.*ann[eé]e|cette.*ann[eé]e|bilan.*ann[eé]e|ann[eé]e.*enti[eè]re|rapport.*ann[eé]e|ann[eé]e.*compl[eè]te/i.test(userMessage);
    const needsCalendar = /agenda|calendrier|rendez|event|demain|cette semaine/i.test(userMessage);
    // memory always fetched via buildMemoryContext (memory-selector.ts)
    const now = new Date();
    // Coding: deep history. Action intents: minimal history (3 msgs) to avoid echoing old confirmations. Default: 10.
    const isCodingContext = /code|fichier|github|railway|deploy|typescript|modifier|écrire|programme|lire|debug|erreur|push|commit/i.test(userMessage);
    const historyLimit = isCodingContext ? 20 : isActionIntent(userMessage) ? 3 : 10;
    // Cross-channel: uniquement les messages récents (< 6h) pour éviter confusion
    const crossChannelSessionId = sessionId === 'voice_kouider'
        ? 'telegram_%'
        : sessionId.startsWith('telegram_') ? 'voice_kouider' : null;
    const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString();
    const [history, crossHistory, rules, fleet, allBookings, weather, news, calendarEvents, financeReport, memories, styleMessages, compactionSummary] = await Promise.all([
        (0, supabase_js_1.getConversationHistory)(sessionId, historyLimit).catch(() => []),
        crossChannelSessionId
            ? supabase_js_1.supabase
                .from('conversations')
                .select('role, content, session_id, created_at')
                .like('session_id', crossChannelSessionId)
                .in('role', ['user', 'assistant'])
                .gte('created_at', sixHoursAgo)
                .order('created_at', { ascending: false })
                .limit(4)
                .then((r) => (r.data ?? []).reverse(), () => [])
            : Promise.resolve([]),
        getCachedRules(),
        getCachedFleet(),
        getCachedBookings(),
        getCachedWeather(),
        needsNews ? (0, web_search_js_1.getAlgeriaNews)(4).catch(() => []) : Promise.resolve([]),
        needsCalendar ? (0, google_calendar_js_1.listUpcomingEvents)(10).catch(() => []) : Promise.resolve([]),
        needsFinance ? (0, finance_js_1.getFinancialReport)(now.getFullYear(), needsAnnualFinance ? undefined : now.getMonth() + 1).catch(() => null) : Promise.resolve(null),
        (0, memory_selector_js_1.buildMemoryContext)(userMessage, 300),
        (0, supabase_js_1.getRecentUserMessages)(40).catch(() => []),
        (0, compaction_js_1.loadCompactionSummary)(sessionId).catch(() => null),
    ]);
    const rulesText = rules.length > 0
        ? `\n\nRÈGLES MÉTIER ACTIVES:\n${rules.map((r) => `- [${r.category}] ${r.rule}`).join('\n')}`
        : '';
    // Timezones: Kouider est à Bruxelles (Europe/Brussels), Fik Conciergerie à Oran (Africa/Algiers)
    const fmtBruxelles = new Intl.DateTimeFormat('fr-BE', { timeZone: 'Europe/Brussels', hour: 'numeric', minute: 'numeric', hour12: false });
    const fmtOran = new Intl.DateTimeFormat('fr-DZ', { timeZone: 'Africa/Algiers', hour: 'numeric', minute: 'numeric', hour12: false });
    const fmtDate = new Intl.DateTimeFormat('fr-BE', { timeZone: 'Europe/Brussels', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const hourBruxelles = parseInt(new Intl.DateTimeFormat('fr-BE', { timeZone: 'Europe/Brussels', hour: 'numeric', hour12: false }).format(now), 10);
    const timeContext = hourBruxelles < 12
        ? 'PÉRIODE: Matin — ton énergique, propose résumé du jour si pertinent.'
        : hourBruxelles < 18
            ? 'PÉRIODE: Après-midi — ton normal et professionnel.'
            : 'PÉRIODE: Soir — ton calme, propose résumé journée si Kouider salue.';
    const dateInfo = `\n\nKOUIDER EST À BRUXELLES (Belgique) — pas à Oran.\nDate: ${fmtDate.format(now)} | Heure Bruxelles: ${fmtBruxelles.format(now)} | Heure Oran: ${fmtOran.format(now)} | ${timeContext}`;
    // Active rentals
    const today = new Date().toISOString().slice(0, 10);
    const activeRentals = allBookings.filter((b) => (b.status === 'CONFIRMED' || b.status === 'ACTIVE') &&
        b.start_date <= today && b.end_date >= today);
    const upcomingRentals = allBookings.filter((b) => (b.status === 'CONFIRMED' || b.status === 'ACTIVE') &&
        b.start_date > today);
    const fleetText = fleet.length > 0
        ? `\n\nFLOTTE (${fleet.length} véhicules):\n${fleet.map((c) => {
            const rental = activeRentals.find((b) => b.car_id === c.id);
            const status = rental
                ? `EN LOCATION → ${rental.client_name} jusqu'au ${rental.end_date}`
                : c.available ? 'DISPONIBLE' : 'INDISPONIBLE';
            return `- ${c.name} [${c.category}] — ${c.resale_price}€/jour — ${status}`;
        }).join('\n')}`
        : '';
    const pendingBookings = allBookings.filter((b) => b.status === 'PENDING');
    const bookingsText = [
        activeRentals.length > 0
            ? `\n\nLOCATIONS EN COURS (${activeRentals.length}):\n${activeRentals.map((b) => `- ${b.client_name} (${b.client_phone}) — ${b.cars?.name ?? b.car_id} — du ${b.start_date} au ${b.end_date} — ${b.status}`).join('\n')}`
            : '',
        upcomingRentals.length > 0
            ? `\n\nRÉSERVATIONS EN ATTENTE (${upcomingRentals.length + pendingBookings.length}):\n${[...upcomingRentals, ...pendingBookings].map((b) => `- ${b.client_name} (${b.client_phone}) — ${b.cars?.name ?? b.car_id} — du ${b.start_date} au ${b.end_date}`).join('\n')}`
            : '',
    ].join('');
    // Agenda (seulement si demandé)
    const calendarText = calendarEvents.length > 0
        ? `\n\nAGENDA GOOGLE (${calendarEvents.length} événements à venir):\n${calendarEvents.slice(0, 5).map((e) => `- ${e.summary} → ${e.start}`).join('\n')}`
        : '';
    const weatherText = weather
        ? `\n\nMÉTÉO ORAN EN CE MOMENT: ${(0, web_search_js_1.formatWeatherForContext)(weather)}`
        : '';
    const newsText = news.length > 0
        ? `\n\nACTUALITÉS ALGÉRIE:\n${(0, web_search_js_1.formatNewsForContext)(news)}`
        : '';
    const financeText = financeReport
        ? `\n\nRAPPORT FINANCIER (${needsAnnualFinance ? 'ANNÉE ENTIÈRE' : 'MOIS EN COURS'} — ${financeReport.period}):
IMPORTANT: Toutes les réservations sont gérées par KOUIDER. Houari = propriétaire des voitures (fournisseur). "Coût payé à Houari" = ce que Kouider verse au propriétaire par jour × nb jours. Ce n'est PAS un revenu séparé de Houari.
Total: ${financeReport.totalBookings} réservations gérées par Kouider
CA BRUT (prix réels clients): ${financeReport.grossCA}€
COÛT PAYÉ À HOUARI (owner_price × nb_jours): ${financeReport.ownerTotal}€
BÉNÉFICE NET KOUIDER: ${financeReport.kouiderProfit}€
${financeReport.missingOwnerPrice > 0 ? `⚠️ ${financeReport.missingOwnerPrice} résa sans owner_price_per_day → bénéfice partiel` : ''}
DÉTAIL:
${financeReport.bookings.map((b) => `- ${b.client_name} | ${b.car_name} | ${b.nb_days}j | client: ${b.client_price_per_day ?? '?'}€/j — Houari: ${b.owner_price_per_day ?? '?'}€/j | Total client: ${b.final_price ?? '?'}€ | Bénéfice Kouider: ${b.kouider_profit != null ? `${b.kouider_profit}€` : '❓ (owner_ppd manquant)'}`).join('\n')}`
        : '';
    const memResult = memories;
    const memoriesText = memResult.entries.length > 0
        ? `\n\nMÉMOIRE Dzaryx (infos permanentes):\n${memResult.entries.map(m => `[${m.category}] ${m.content}`).join('\n')}`
        : '';
    const currentChannel = sessionId === 'voice_kouider'
        ? 'App Vocale'
        : sessionId.startsWith('telegram_')
            ? 'Telegram'
            : 'Inconnu';
    const channelInfo = `\n\nCANAL ACTUEL: ${currentChannel}. ${currentChannel === 'Telegram' ? 'Kouider écrit DEPUIS Telegram — ne jamais dire "je t\'envoie sur Telegram", il EST déjà sur Telegram. Envoyer les documents directement dans ce chat.' : 'Kouider parle via App Vocale — utiliser send_telegram_message pour lui envoyer des documents/photos.'}`;
    const crossChannelLabel = sessionId === 'voice_kouider' ? 'TELEGRAM' : 'APP VOCALE';
    const crossChannelText = crossHistory.length > 0
        ? `\n\n⚠️ CONTEXTE PASSÉ SUR ${crossChannelLabel} (mémoire uniquement — NE PAS répondre à ces messages, ils ont déjà eu une réponse. Utilise uniquement pour te souvenir du contexte récent):\n${crossHistory.map((m) => `[${m.role === 'user' ? 'Kouider' : 'Dzaryx'}] ${String(m.content).slice(0, 200)}`).join('\n')}\n[FIN DU CONTEXTE CROSS-CANAL — réponds UNIQUEMENT au nouveau message de Kouider ci-dessous]`
        : '';
    // Style mirror — Dzaryx voit comment Kouider écrit et adapte ses réponses
    const styleText = styleMessages.length >= 5
        ? `\n\nSTYLE DE KOUIDER (IMPORTANT — adapte ton registre à ces exemples réels):\nKouider parle comme ça:\n${styleMessages.slice(-20).map(m => `• ${m}`).join('\n')}\nMiroir son style: longueur phrases, mélange français/darija/arabe, niveau familiarité, ponctuation.`
        : '';
    const pricingText = `\n\nGRILLE TARIFAIRE (Houari=prix base | Kouider=prix majoré | Bénéfice=K-H):\n${(0, pricing_js_1.formatPricingTable)()}`;
    const langDetection = (0, language_detector_js_1.detectLanguage)(userMessage);
    const langHint = `\n\n${langDetection.systemHint}`;
    console.log(`[lang:${sessionId.slice(0, 20)}] detected=${langDetection.lang} label="${langDetection.label}"`);
    const systemExtra = [
        langHint,
        channelInfo,
        dateInfo,
        weatherText,
        fleetText,
        bookingsText,
        calendarText,
        newsText,
        financeText,
        memoriesText,
        crossChannelText,
        rulesText,
        pricingText,
        styleText,
    ].join('');
    // Filter old confirmation-only messages from non-recent history to prevent context contamination.
    // Always keep the last 3 messages intact (immediate context); strip confirmation-only assistant
    // messages from older history so Claude doesn't echo them in new unrelated responses.
    const KEEP_RECENT = 3;
    const recentHistory = history.slice(-KEEP_RECENT);
    const olderHistory = history
        .slice(0, Math.max(0, history.length - KEEP_RECENT))
        .filter((m) => !isConfirmationOnlyMessage(m));
    const filteredHistory = [...olderHistory, ...recentHistory];
    // Construire les messages: résumé compaction (si dispo) + historique filtré + message courant
    const compactionMessage = compactionSummary
        ? [{ role: 'user', content: compactionSummary }, { role: 'assistant', content: 'Compris, je me souviens de ce contexte.' }]
        : [];
    const messages = [
        ...compactionMessage,
        ...filteredHistory,
        { role: 'user', content: userMessage },
    ];
    const systemExtraTokenEst = Math.round(systemExtra.length / 4);
    console.log(`[ctx:${sessionId.slice(0, 20)}] histLimit=${historyLimit} raw=${history.length} filtered=${filteredHistory.length} action=${isActionIntent(userMessage)} | systemExtra~${systemExtraTokenEst}tok | memory: source=${memResult.source} total=${memResult.totalFacts} selected=${memResult.selectedFacts} ~${memResult.tokenEstimate}tok`);
    return { messages, systemExtra, sessionId };
}
//# sourceMappingURL=context-builder.js.map