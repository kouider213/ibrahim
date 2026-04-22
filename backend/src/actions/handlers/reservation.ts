import { z } from 'zod';
import { supabase, checkVehicleAvailability, isVipClient } from '../../integrations/supabase.js';
import { learnRule } from '../../integrations/claude-api.js';
import { BUSINESS_RULES } from '../../config/constants.js';
import type { ActionPayload, ActionResult } from '../executor.js';

const createSchema = z.object({
  client_name:      z.string().min(2),
  client_phone:     z.string().optional(),
  client_email:     z.string().email().optional(),
  vehicle_id:       z.string(),
  vehicle_name:     z.string(),
  start_date:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date:         z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  pickup_location:  z.string().default('agency'),
  return_location:  z.string().default('agency'),
  daily_rate:       z.number().positive(),
  deposit:          z.number().optional(),
  notes:            z.string().optional(),
});

export async function handleReservation(payload: ActionPayload): Promise<ActionResult> {
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

async function createReservation(params: Record<string, unknown>): Promise<ActionResult> {
  const parsed = createSchema.safeParse(params);
  if (!parsed.success) {
    return { success: false, error: parsed.error.message, message: `Paramètres invalides: ${parsed.error.errors[0]?.message}` };
  }

  const data = parsed.data;
  const start = new Date(data.start_date);
  const end   = new Date(data.end_date);

  // Business rule: minimum 2 days
  const days = Math.ceil((end.getTime() - start.getTime()) / 86_400_000);
  if (days < BUSINESS_RULES.MIN_RENTAL_DAYS) {
    return { success: false, error: 'min_duration', message: `La durée minimale est de ${BUSINESS_RULES.MIN_RENTAL_DAYS} jours.` };
  }

  // Business rule: no delivery on Friday
  if (start.getDay() === BUSINESS_RULES.NO_DELIVERY_DAY && data.pickup_location !== 'agency') {
    return { success: false, error: 'no_friday_delivery', message: 'Pas de livraison le vendredi. Choisissez un autre jour de prise en charge.' };
  }

  // Check vehicle availability (anti-duplicate)
  const available = await checkVehicleAvailability(data.vehicle_id, data.start_date, data.end_date);
  if (!available) {
    return { success: false, error: 'not_available', message: `Le véhicule ${data.vehicle_name} n'est pas disponible pour ces dates.` };
  }

  // VIP check
  let isVip = false;
  let discountPct = 0;
  if (data.client_phone) {
    isVip = await isVipClient(data.client_phone);
    if (isVip) discountPct = BUSINESS_RULES.VIP_DISCOUNT_PCT;
  }

  // Airport surcharge
  let dailyRate = data.daily_rate;
  if (data.pickup_location === BUSINESS_RULES.AIRPORT_CODE || data.return_location === BUSINESS_RULES.AIRPORT_CODE) {
    dailyRate += BUSINESS_RULES.AIRPORT_SURCHARGE_DZD / days;
  }

  const baseAmount = dailyRate * days;
  const totalAmount = baseAmount * (1 - discountPct / 100);

  const { data: reservation, error } = await supabase
    .from('bookings')
    .insert({
      car_id:                data.vehicle_id,
      client_name:           data.client_name,
      client_phone:          data.client_phone,
      client_email:          data.client_email,
      start_date:            data.start_date,
      end_date:              data.end_date,
      nb_days:               days,
      base_price_snapshot:   Math.round(dailyRate),
      resale_price_snapshot: Math.round(data.daily_rate),
      final_price:           Math.round(totalAmount),
      profit:                Math.round(totalAmount - data.daily_rate * days),
      notes:                 data.notes ?? `Créé par Ibrahim. ${isVip ? `VIP -${discountPct}%` : ''}`,
      status:                'CONFIRMED',
      whatsapp_sent:         false,
      sms_sent:              false,
    })
    .select()
    .single();

  if (error) return { success: false, error: error.message, message: `Erreur création réservation: ${error.message}` };

  const msg = isVip
    ? `✅ Réservation créée pour ${data.client_name} (CLIENT VIP — remise ${discountPct}% appliquée). Total: ${Math.round(totalAmount).toLocaleString('fr-DZ')} DZD pour ${days} jours.`
    : `✅ Réservation créée pour ${data.client_name}. Total: ${Math.round(totalAmount).toLocaleString('fr-DZ')} DZD pour ${days} jours.`;

  return { success: true, data: reservation, message: msg };
}

async function updateReservation(params: Record<string, unknown>): Promise<ActionResult> {
  const { id, ...updates } = params as { id: string } & Record<string, unknown>;
  if (!id) return { success: false, error: 'missing_id', message: 'ID réservation requis' };

  const { data, error } = await supabase
    .from('bookings')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) return { success: false, error: error.message, message: `Erreur mise à jour: ${error.message}` };
  return { success: true, data, message: '✅ Réservation mise à jour.' };
}

async function cancelReservation(params: Record<string, unknown>): Promise<ActionResult> {
  const { id } = params as { id: string };
  if (!id) return { success: false, error: 'missing_id', message: 'ID requis' };

  const { error } = await supabase
    .from('bookings')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) return { success: false, error: error.message, message: `Erreur annulation: ${error.message}` };
  return { success: true, message: '✅ Réservation annulée.' };
}

async function listReservations(params: Record<string, unknown>): Promise<ActionResult> {
  const { status, vehicle_id, date } = params as { status?: string; vehicle_id?: string; date?: string };

  let query = supabase.from('bookings').select('*').order('start_date', { ascending: true });

  if (status) query = query.eq('status', status);
  if (vehicle_id) query = query.eq('vehicle_id', vehicle_id);
  if (date) {
    query = query.lte('start_date', date).gte('end_date', date);
  }

  const { data, error } = await query.limit(50);
  if (error) return { success: false, error: error.message, message: `Erreur liste réservations: ${error.message}` };

  const count = (data ?? []).length;
  return {
    success: true,
    data,
    message: count === 0
      ? 'Aucune réservation trouvée.'
      : `${count} réservation${count > 1 ? 's' : ''} trouvée${count > 1 ? 's' : ''}.`,
  };
}

async function checkAvailability(params: Record<string, unknown>): Promise<ActionResult> {
  const { vehicle_id, start_date, end_date } = params as {
    vehicle_id: string; start_date: string; end_date: string;
  };
  if (!vehicle_id || !start_date || !end_date) {
    return { success: false, error: 'missing_params', message: 'vehicle_id, start_date, end_date requis' };
  }

  const available = await checkVehicleAvailability(vehicle_id, start_date, end_date);
  return {
    success: true,
    data:    { available },
    message: available
      ? `✅ Le véhicule est disponible du ${start_date} au ${end_date}.`
      : `❌ Le véhicule n'est pas disponible pour ces dates.`,
  };
}

async function handleLearnRule(params: Record<string, unknown>): Promise<ActionResult> {
  const { instruction } = params as { instruction: string };
  if (!instruction) return { success: false, error: 'missing_instruction', message: 'Instruction requise' };

  const rule = await learnRule(instruction);

  const { data, error } = await supabase
    .from('ibrahim_rules')
    .insert({ ...rule, source: 'learned', active: true })
    .select()
    .single();

  if (error) return { success: false, error: error.message, message: `Erreur mémorisation: ${error.message}` };
  return { success: true, data, message: `✅ Règle mémorisée : "${rule.rule}"` };
}
