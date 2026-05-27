"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.supabase = void 0;
exports.getFleet = getFleet;
exports.getAvailableCars = getAvailableCars;
exports.checkCarAvailability = checkCarAvailability;
exports.getBookings = getBookings;
exports.getClientHistory = getClientHistory;
exports.createBooking = createBooking;
exports.getActiveRules = getActiveRules;
exports.getRecentUserMessages = getRecentUserMessages;
exports.getConversationHistory = getConversationHistory;
exports.saveConversationTurn = saveConversationTurn;
exports.saveClientDocument = saveClientDocument;
exports.getClientDocuments = getClientDocuments;
exports.checkVehicleAvailability = checkVehicleAvailability;
exports.isVipClient = isVipClient;
exports.getUserProfile = getUserProfile;
exports.getMemoryFacts = getMemoryFacts;
exports.upsertMemoryFact = upsertMemoryFact;
exports.addMemoryEpisode = addMemoryEpisode;
exports.getRecentEpisodes = getRecentEpisodes;
exports.getActiveHabits = getActiveHabits;
const supabase_js_1 = require("@supabase/supabase-js");
const env_js_1 = require("../config/env.js");
exports.supabase = (0, supabase_js_1.createClient)(env_js_1.env.SUPABASE_URL, env_js_1.env.SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
});
// ── Fik Conciergerie queries ───────────────────────────────────
async function getFleet() {
    const { data, error } = await exports.supabase
        .from('cars')
        .select('*')
        .order('name');
    if (error)
        throw new Error(`Fleet fetch failed: ${error.message}`);
    return (data ?? []);
}
async function getAvailableCars(startDate, endDate) {
    try {
        const { data } = await exports.supabase
            .rpc('check_car_availability', { p_start: startDate, p_end: endDate });
        if (data)
            return data;
    }
    catch { /* RPC not available, fallback below */ }
    // Fallback: filter by available flag
    const { data: cars } = await exports.supabase.from('cars').select('*').eq('available', true);
    return (cars ?? []);
}
async function checkCarAvailability(carId, startDate, endDate, excludeBookingId) {
    let query = exports.supabase
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .eq('car_id', carId)
        .in('status', ['PENDING', 'CONFIRMED', 'ACTIVE'])
        .lt('start_date', endDate)
        .gt('end_date', startDate);
    if (excludeBookingId)
        query = query.neq('id', excludeBookingId);
    const { count, error } = await query;
    if (error)
        throw new Error(`Availability check failed: ${error.message}`);
    return (count ?? 0) === 0;
}
async function getBookings(filters) {
    let query = exports.supabase
        .from('bookings')
        .select('*, cars(name, category)')
        .order('created_at', { ascending: false })
        .limit(filters?.limit ?? 50);
    if (filters?.status)
        query = query.eq('status', filters.status);
    if (filters?.clientPhone)
        query = query.eq('client_phone', filters.clientPhone);
    if (filters?.carId)
        query = query.eq('car_id', filters.carId);
    const { data, error } = await query;
    if (error)
        throw new Error(`Bookings fetch failed: ${error.message}`);
    return (data ?? []);
}
async function getClientHistory(phone) {
    const { data, error } = await exports.supabase
        .from('bookings')
        .select('*')
        .eq('client_phone', phone)
        .order('created_at', { ascending: false });
    if (error)
        throw new Error(`Client history fetch failed: ${error.message}`);
    const bookings = (data ?? []);
    const confirmed = bookings.filter(b => b.status === 'CONFIRMED' || b.status === 'COMPLETED');
    const totalSpent = confirmed.reduce((sum, b) => sum + (b.final_price ?? 0), 0);
    const isVip = confirmed.length >= 5 || totalSpent > 1000;
    return { bookings, totalSpent, bookingCount: confirmed.length, isVip };
}
async function createBooking(booking) {
    // Anti-doublon: check availability before creating
    const available = await checkCarAvailability(booking.car_id, booking.start_date, booking.end_date);
    if (!available) {
        throw new Error(`Le véhicule n'est pas disponible du ${booking.start_date} au ${booking.end_date}.`);
    }
    const { data, error } = await exports.supabase
        .from('bookings')
        .insert(booking)
        .select()
        .single();
    if (error)
        throw new Error(`Booking creation failed: ${error.message}`);
    return data;
}
// ── Dzaryx conversation helpers ───────────────────────────────
async function getActiveRules() {
    const { data, error } = await exports.supabase
        .from('Dzaryx_rules')
        .select('*')
        .eq('active', true)
        .order('category');
    if (error)
        throw new Error(`Rules fetch failed: ${error.message}`);
    return (data ?? []);
}
async function getRecentUserMessages(limit = 40) {
    const { data } = await exports.supabase
        .from('conversations')
        .select('content')
        .eq('role', 'user')
        .order('created_at', { ascending: false })
        .limit(limit);
    return (data ?? []).map((r) => r.content).reverse();
}
async function getConversationHistory(sessionId, limit = 20) {
    const { data, error } = await exports.supabase
        .from('conversations')
        .select('role, content, created_at')
        .eq('session_id', sessionId)
        .in('role', ['user', 'assistant'])
        .order('created_at', { ascending: false })
        .limit(limit);
    if (error)
        throw new Error(`Conversation fetch failed: ${error.message}`);
    return (data ?? []).reverse();
}
async function saveConversationTurn(sessionId, role, content, metadata = {}) {
    const { error } = await exports.supabase
        .from('conversations')
        .insert({ session_id: sessionId, role, content, metadata });
    if (error)
        throw new Error(`Conversation save failed: ${error.message}`);
}
// ── Client documents ───────────────────────────────────────────
async function saveClientDocument(doc) {
    const { data, error } = await exports.supabase
        .from('client_documents')
        .insert(doc)
        .select()
        .single();
    if (error)
        throw new Error(`Document save failed: ${error.message}`);
    return data;
}
async function getClientDocuments(clientPhone) {
    const { data, error } = await exports.supabase
        .from('client_documents')
        .select('*')
        .eq('client_phone', clientPhone)
        .order('created_at', { ascending: false });
    if (error)
        throw new Error(`Documents fetch failed: ${error.message}`);
    return (data ?? []);
}
// Legacy compatibility
async function checkVehicleAvailability(vehicleId, startDate, endDate, excludeId) {
    return checkCarAvailability(vehicleId, startDate, endDate, excludeId);
}
async function isVipClient(phone) {
    const { isVip } = await getClientHistory(phone);
    return isVip;
}
// ── P12 Memory Engine helpers ──────────────────────────────────
async function getUserProfile(userId = 'kouider') {
    const { data, error } = await exports.supabase
        .from('user_profile')
        .select('*')
        .eq('user_id', userId)
        .single();
    if (error)
        return null;
    return data;
}
async function getMemoryFacts(filters) {
    let query = exports.supabase
        .from('memory_facts')
        .select('*')
        .eq('user_id', filters?.user_id ?? 'kouider')
        .order('confidence', { ascending: false })
        .order('updated_at', { ascending: false })
        .limit(filters?.limit ?? 50);
    if (filters?.domain)
        query = query.eq('domain', filters.domain);
    if (filters?.is_current !== undefined)
        query = query.eq('is_current', filters.is_current);
    const { data, error } = await query;
    if (error)
        throw new Error(`memory_facts fetch failed: ${error.message}`);
    return (data ?? []);
}
async function upsertMemoryFact(domain, key, value, opts, userId = 'kouider') {
    const { error } = await exports.supabase
        .from('memory_facts')
        .upsert({
        user_id: userId,
        domain,
        key,
        value,
        value_type: opts?.value_type ?? 'text',
        value_json: opts?.value_json,
        confidence: opts?.confidence ?? 1.0,
        source: opts?.source ?? 'explicit',
        verified: opts?.verified ?? true,
        valid_from: opts?.valid_from,
        valid_until: opts?.valid_until,
        is_current: true,
        updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,domain,key' });
    if (error)
        throw new Error(`upsertMemoryFact failed [${domain}/${key}]: ${error.message}`);
}
async function addMemoryEpisode(episode) {
    const { data, error } = await exports.supabase
        .from('memory_episodes')
        .insert(episode)
        .select()
        .single();
    if (error)
        throw new Error(`addMemoryEpisode failed: ${error.message}`);
    return data;
}
async function getRecentEpisodes(options) {
    let query = exports.supabase
        .from('memory_episodes')
        .select('*')
        .gt('expires_at', new Date().toISOString())
        .order('occurred_at', { ascending: false })
        .limit(options?.limit ?? 20);
    if (options?.episode_type)
        query = query.eq('episode_type', options.episode_type);
    if (options?.min_importance)
        query = query.gte('importance', options.min_importance);
    const { data, error } = await query;
    if (error)
        throw new Error(`getRecentEpisodes failed: ${error.message}`);
    return (data ?? []);
}
async function getActiveHabits(userId = 'kouider') {
    const { data, error } = await exports.supabase
        .from('memory_habits')
        .select('*')
        .eq('user_id', userId)
        .eq('active', true)
        .order('created_at');
    if (error)
        throw new Error(`getActiveHabits failed: ${error.message}`);
    return (data ?? []);
}
//# sourceMappingURL=supabase.js.map