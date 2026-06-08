import { supabase } from './supabase.js';
import {
  processInspection, formatDamageLines,
  type InspectionAnalysis, type DamageBox, type InspectionImage,
} from './inspection-core.js';

export interface VehicleState {
  id:               string;
  client_name:      string;
  car_name:         string;
  booking_id:       string | null;
  state_type:       'before' | 'after';
  photos:           string[];
  ai_description:   string | null;
  damages:          string[];
  damage_boxes:     DamageBox[];
  damage_detected:  boolean;
  accident:         boolean;
  severity:         string | null;
  comparison_report: string | null;
  created_at:       string;
}

export interface SaveStateResult {
  success:    boolean;
  message:    string;             // texte prêt pour le chat
  stateId?:   string;
  photoUrl?:  string | null;      // 1ère photo (rétrocompat)
  photos?:    string[];           // toutes les photos
  bookingId?: string | null;
  analysis?:  InspectionAnalysis;
}

// Retrouve la réservation du client pour ce véhicule (la plus pertinente).
async function resolveBookingId(clientName: string, carName: string): Promise<string | null> {
  try {
    const { data: cars } = await supabase
      .from('cars').select('id').ilike('name', `%${carName}%`).limit(1);
    const carId = cars?.[0]?.id;
    let q = supabase
      .from('bookings')
      .select('id, car_id, client_name, status, created_at')
      .ilike('client_name', `%${clientName}%`)
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false })
      .limit(1);
    if (carId) q = q.eq('car_id', carId);
    const { data } = await q;
    return data?.[0]?.id ?? null;
  } catch { return null; }
}

// ── État AVANT location ─────────────────────────────────────────
export async function saveBeforeState(
  clientName: string,
  carName:    string,
  images:     InspectionImage[],
  ownerKey    = 'kouider',
  bookingId?: string,
): Promise<SaveStateResult> {
  try {
    if (!images.length) return { success: false, message: '❌ Aucune photo fournie.' };
    const [{ photos, analysis }, resolvedBooking] = await Promise.all([
      processInspection(images, 'vehicle', 'before', 'inspections/vehicles'),
      bookingId ? Promise.resolve(bookingId) : resolveBookingId(clientName, carName),
    ]);

    const { data, error } = await supabase.from('vehicle_states').insert({
      owner_key:       ownerKey,
      client_name:     clientName,
      car_name:        carName,
      booking_id:      resolvedBooking ?? null,
      state_type:      'before',
      photos,
      ai_description:  analysis.description,
      damages:         analysis.damages,
      damage_boxes:    analysis.damageBoxes,
      damage_detected: analysis.damageDetected,
      accident:        analysis.accident,
      severity:        analysis.severity,
    }).select('id').single();
    if (error) throw error;

    const nb = photos.length > 1 ? ` (${photos.length} photos)` : '';
    const message = analysis.damageDetected
      ? `📋 *État AVANT — ${carName} (${clientName})*${nb}\n\n${analysis.description}\n\n⚠️ *Dégâts existants notés :*\n${formatDamageLines(analysis.damageBoxes)}\n\n_Dossier ${data.id.slice(-8)}${resolvedBooking ? ' · lié à la réservation' : ''}_`
      : `📋 *État AVANT — ${carName} (${clientName})*${nb}\n\n${analysis.description}\n\n✅ *Aucun dégât constaté.*\n\n_Dossier ${data.id.slice(-8)}${resolvedBooking ? ' · lié à la réservation' : ''}_`;

    return { success: true, message, stateId: data.id, photoUrl: photos[0] ?? null, photos, bookingId: resolvedBooking, analysis };
  } catch (e) {
    console.error('[vehicle-state] saveBeforeState error:', e);
    return { success: false, message: '❌ Erreur lors de l\'analyse. Réessaie.' };
  }
}

// ── État APRÈS retour + comparaison ─────────────────────────────
export async function saveAfterState(
  clientName: string,
  carName:    string,
  images:     InspectionImage[],
  ownerKey    = 'kouider',
): Promise<SaveStateResult> {
  try {
    if (!images.length) return { success: false, message: '❌ Aucune photo fournie.' };
    const { data: beforeStates } = await supabase
      .from('vehicle_states')
      .select('ai_description, created_at, id, booking_id')
      .eq('owner_key', ownerKey)
      .ilike('client_name', `%${clientName}%`)
      .ilike('car_name', `%${carName}%`)
      .eq('state_type', 'before')
      .order('created_at', { ascending: false })
      .limit(1);

    const beforeState = beforeStates?.[0];
    if (!beforeState) {
      return {
        success: false,
        message: `⚠️ Aucun état AVANT trouvé pour *${clientName}* / *${carName}*. Lance d'abord l'inspection de départ.`,
      };
    }

    const { photos, analysis } = await processInspection(
      images, 'vehicle', 'after', 'inspections/vehicles', beforeState.ai_description ?? '',
    );

    const { data, error } = await supabase.from('vehicle_states').insert({
      owner_key:         ownerKey,
      client_name:       clientName,
      car_name:          carName,
      booking_id:        beforeState.booking_id ?? null,
      state_type:        'after',
      photos,
      ai_description:    analysis.description,
      damages:           analysis.damages,
      damage_boxes:      analysis.damageBoxes,
      damage_detected:   analysis.damageDetected,
      accident:          analysis.accident,
      severity:          analysis.severity,
      comparison_report: analysis.comparisonReport,
    }).select('id').single();
    if (error) throw error;

    const dateAvant = new Date(beforeState.created_at).toLocaleDateString('fr-FR');
    const newDmg    = analysis.damageBoxes.filter(d => d.is_new);
    const nb        = photos.length > 1 ? ` (${photos.length} photos)` : '';

    const message = analysis.damageDetected
      ? `🔍 *Rapport retour — ${carName} (${clientName})*${nb}\n\n📅 État initial : ${dateAvant}\n\n${analysis.accident ? '🚨 *ACCIDENT / CHOC DÉTECTÉ*\n\n' : ''}🆕 *Nouveaux dégâts :*\n${formatDamageLines(newDmg)}\n\n📝 ${analysis.comparisonReport ?? analysis.description}\n\n_Dossier ${data.id.slice(-8)}_`
      : `✅ *Retour OK — ${carName} (${clientName})*${nb}\n\n📅 État initial : ${dateAvant}\n\nAucun nouveau dégât par rapport à l'état initial.\n\n${analysis.description}\n\n_Dossier ${data.id.slice(-8)}_`;

    return { success: true, message, stateId: data.id, photoUrl: photos[0] ?? null, photos, bookingId: beforeState.booking_id ?? null, analysis };
  } catch (e) {
    console.error('[vehicle-state] saveAfterState error:', e);
    return { success: false, message: '❌ Erreur lors de la comparaison. Réessaie.' };
  }
}

// ── Historique ──────────────────────────────────────────────────
export async function getVehicleHistory(
  clientName: string,
  carName:    string,
  ownerKey    = 'kouider',
): Promise<VehicleState[]> {
  const { data } = await supabase
    .from('vehicle_states')
    .select('*')
    .eq('owner_key', ownerKey)
    .ilike('client_name', `%${clientName}%`)
    .ilike('car_name', `%${carName}%`)
    .order('created_at', { ascending: false })
    .limit(20);
  return (data ?? []) as VehicleState[];
}
