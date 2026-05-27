"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleReservation = handleReservation;
const zod_1 = require("zod");
const supabase_js_1 = require("../../integrations/supabase.js");
const claude_api_js_1 = require("../../integrations/claude-api.js");
const constants_js_1 = require("../../config/constants.js");
const createSchema = zod_1.z.object({
    client_name: zod_1.z.string().min(2),
    client_phone: zod_1.z.string().optional(),
    client_email: zod_1.z.string().email().optional(),
    vehicle_id: zod_1.z.string(),
    vehicle_name: zod_1.z.string(),
    start_date: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    end_date: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    pickup_location: zod_1.z.string().default('agency'),
    return_location: zod_1.z.string().default('agency'),
    daily_rate: zod_1.z.number().positive(),
    deposit: zod_1.z.number().optional(),
    notes: zod_1.z.string().optional(),
});
async function handleReservation(payload) {
    switch (payload.action) {
        case 'create_reservation':
            return createReservation(payload.params);
        case 'update_reservation':
            return updateReservation(payload.params);
        case 'cancel_reservation':
            return cancelReservation(payload.params);
        case 'list_reservations':
            return listReservations(payload.params);
        case 'check_availability':
            return checkAvailability(payload.params);
        case 'learn_rule':
            return handleLearnRule(payload.params);
        case 'reply_to_client':
            return { success: false, error: 'validation_required', message: 'Validation requise pour répondre au client' };
        default:
            return { success: false, error: 'Unknown reservation action', message: 'Action réservation inconnue' };
    }
}
async function createReservation(params) {
    const parsed = createSchema.safeParse(params);
    if (!parsed.success) {
        return { success: false, error: parsed.error.message, message: `Paramètres invalides: ${parsed.error.errors[0]?.message}` };
    }
    const data = parsed.data;
    const start = new Date(data.start_date);
    const end = new Date(data.end_date);
    // Business rule: minimum 2 days
    const days = Math.ceil((end.getTime() - start.getTime()) / 86_400_000);
    if (days < constants_js_1.BUSINESS_RULES.MIN_RENTAL_DAYS) {
        return { success: false, error: 'min_duration', message: `La durée minimale est de ${constants_js_1.BUSINESS_RULES.MIN_RENTAL_DAYS} jours.` };
    }
    // Check vehicle availability (anti-duplicate)
    const available = await (0, supabase_js_1.checkVehicleAvailability)(data.vehicle_id, data.start_date, data.end_date);
    if (!available) {
        return { success: false, error: 'not_available', message: `Le véhicule ${data.vehicle_name} n'est pas disponible pour ces dates.` };
    }
    // VIP check
    let isVip = false;
    let discountPct = 0;
    if (data.client_phone) {
        isVip = await (0, supabase_js_1.isVipClient)(data.client_phone);
        if (isVip)
            discountPct = constants_js_1.BUSINESS_RULES.VIP_DISCOUNT_PCT;
    }
    const dailyRate = data.daily_rate;
    const baseAmount = dailyRate * days;
    const totalAmount = baseAmount * (1 - discountPct / 100);
    const { data: reservation, error } = await supabase_js_1.supabase
        .from('bookings')
        .insert({
        car_id: data.vehicle_id,
        client_name: data.client_name,
        client_phone: data.client_phone,
        client_email: data.client_email,
        start_date: data.start_date,
        end_date: data.end_date,
        nb_days: days,
        base_price_snapshot: Math.round(dailyRate),
        resale_price_snapshot: Math.round(data.daily_rate),
        final_price: Math.round(totalAmount),
        profit: Math.round(totalAmount - data.daily_rate * days),
        notes: data.notes ?? `Créé par Dzaryx. ${isVip ? `VIP -${discountPct}%` : ''}`,
        status: 'CONFIRMED',
        whatsapp_sent: false,
        sms_sent: false,
    })
        .select()
        .single();
    if (error)
        return { success: false, error: error.message, message: `Erreur création réservation: ${error.message}` };
    const msg = isVip
        ? `✅ Réservation créée pour ${data.client_name} (CLIENT VIP — remise ${discountPct}% appliquée). Total: ${Math.round(totalAmount).toLocaleString('fr-DZ')} DZD pour ${days} jours.`
        : `✅ Réservation créée pour ${data.client_name}. Total: ${Math.round(totalAmount).toLocaleString('fr-DZ')} DZD pour ${days} jours.`;
    return { success: true, data: reservation, message: msg };
}
async function updateReservation(params) {
    const { id, ...updates } = params;
    if (!id)
        return { success: false, error: 'missing_id', message: 'ID réservation requis' };
    const { data, error } = await supabase_js_1.supabase
        .from('bookings')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
    if (error)
        return { success: false, error: error.message, message: `Erreur mise à jour: ${error.message}` };
    return { success: true, data, message: '✅ Réservation mise à jour.' };
}
async function cancelReservation(params) {
    const { id } = params;
    if (!id)
        return { success: false, error: 'missing_id', message: 'ID requis' };
    const { error } = await supabase_js_1.supabase
        .from('bookings')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', id);
    if (error)
        return { success: false, error: error.message, message: `Erreur annulation: ${error.message}` };
    return { success: true, message: '✅ Réservation annulée.' };
}
async function listReservations(params) {
    const { status, vehicle_id, date } = params;
    let query = supabase_js_1.supabase.from('bookings').select('*').order('start_date', { ascending: true });
    if (status)
        query = query.eq('status', status);
    if (vehicle_id)
        query = query.eq('vehicle_id', vehicle_id);
    if (date) {
        query = query.lte('start_date', date).gte('end_date', date);
    }
    const { data, error } = await query.limit(50);
    if (error)
        return { success: false, error: error.message, message: `Erreur liste réservations: ${error.message}` };
    const count = (data ?? []).length;
    return {
        success: true,
        data,
        message: count === 0
            ? 'Aucune réservation trouvée.'
            : `${count} réservation${count > 1 ? 's' : ''} trouvée${count > 1 ? 's' : ''}.`,
    };
}
async function checkAvailability(params) {
    const { vehicle_id, start_date, end_date } = params;
    if (!vehicle_id || !start_date || !end_date) {
        return { success: false, error: 'missing_params', message: 'vehicle_id, start_date, end_date requis' };
    }
    const available = await (0, supabase_js_1.checkVehicleAvailability)(vehicle_id, start_date, end_date);
    return {
        success: true,
        data: { available },
        message: available
            ? `✅ Le véhicule est disponible du ${start_date} au ${end_date}.`
            : `❌ Le véhicule n'est pas disponible pour ces dates.`,
    };
}
async function handleLearnRule(params) {
    const { instruction } = params;
    if (!instruction)
        return { success: false, error: 'missing_instruction', message: 'Instruction requise' };
    const rule = await (0, claude_api_js_1.learnRule)(instruction);
    const { data, error } = await supabase_js_1.supabase
        .from('Dzaryx_rules')
        .insert({ ...rule, source: 'learned', active: true })
        .select()
        .single();
    if (error)
        return { success: false, error: error.message, message: `Erreur mémorisation: ${error.message}` };
    return { success: true, data, message: `✅ Règle mémorisée : "${rule.rule}"` };
}
//# sourceMappingURL=reservation.js.map