import { supabase } from './supabase.js';
import {
  processInspection, formatDamageLines,
  type DamageBox, type InspectionImage,
} from './inspection-core.js';
import type { SaveStateResult } from './vehicle-state.js';

export interface PropertyState {
  id:               string;
  client_name:      string;
  property_name:    string;
  property_id:      string | null;
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

async function resolvePropertyId(propertyName: string): Promise<string | null> {
  try {
    const { data } = await supabase
      .from('properties').select('id')
      .or(`title.ilike.%${propertyName}%,name.ilike.%${propertyName}%`)
      .limit(1);
    return data?.[0]?.id ?? null;
  } catch { return null; }
}

// ── État AVANT (entrée locataire) ───────────────────────────────
export async function savePropertyBeforeState(
  clientName:   string,
  propertyName: string,
  images:       InspectionImage[],
  ownerKey      = 'kouider',
  propertyId?:  string,
): Promise<SaveStateResult> {
  try {
    if (!images.length) return { success: false, message: '❌ Aucune photo fournie.' };
    const [{ photos, analysis }, resolvedProp] = await Promise.all([
      processInspection(images, 'property', 'before', 'inspections/properties'),
      propertyId ? Promise.resolve(propertyId) : resolvePropertyId(propertyName),
    ]);

    const { data, error } = await supabase.from('property_states').insert({
      owner_key:       ownerKey,
      client_name:     clientName,
      property_name:   propertyName,
      property_id:     resolvedProp ?? null,
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
      ? `🏠 *État AVANT — ${propertyName} (${clientName})*${nb}\n\n${analysis.description}\n\n⚠️ *Défauts existants :*\n${formatDamageLines(analysis.damageBoxes)}\n\n_Dossier ${data.id.slice(-8)}_`
      : `🏠 *État AVANT — ${propertyName} (${clientName})*${nb}\n\n${analysis.description}\n\n✅ *Aucun défaut constaté.*\n\n_Dossier ${data.id.slice(-8)}_`;

    return { success: true, message, stateId: data.id, photoUrl: photos[0] ?? null, photos, bookingId: resolvedProp, analysis };
  } catch (e) {
    console.error('[property-state] savePropertyBeforeState error:', e);
    return { success: false, message: '❌ Erreur lors de l\'analyse. Réessaie.' };
  }
}

// ── État APRÈS (sortie locataire) + comparaison ─────────────────
export async function savePropertyAfterState(
  clientName:   string,
  propertyName: string,
  images:       InspectionImage[],
  ownerKey      = 'kouider',
): Promise<SaveStateResult> {
  try {
    if (!images.length) return { success: false, message: '❌ Aucune photo fournie.' };
    const { data: beforeStates } = await supabase
      .from('property_states')
      .select('ai_description, created_at, id, property_id')
      .eq('owner_key', ownerKey)
      .ilike('client_name', `%${clientName}%`)
      .ilike('property_name', `%${propertyName}%`)
      .eq('state_type', 'before')
      .order('created_at', { ascending: false })
      .limit(1);

    const beforeState = beforeStates?.[0];
    if (!beforeState) {
      return {
        success: false,
        message: `⚠️ Aucun état AVANT trouvé pour *${clientName}* / *${propertyName}*. Lance d'abord l'inspection d'entrée.`,
      };
    }

    const { photos, analysis } = await processInspection(
      images, 'property', 'after', 'inspections/properties', beforeState.ai_description ?? '',
    );

    const { data, error } = await supabase.from('property_states').insert({
      owner_key:         ownerKey,
      client_name:       clientName,
      property_name:     propertyName,
      property_id:       beforeState.property_id ?? null,
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
      ? `🔍 *Rapport sortie — ${propertyName} (${clientName})*${nb}\n\n📅 État d'entrée : ${dateAvant}\n\n🆕 *Nouveaux défauts :*\n${formatDamageLines(newDmg)}\n\n📝 ${analysis.comparisonReport ?? analysis.description}\n\n_Dossier ${data.id.slice(-8)}_`
      : `✅ *Sortie OK — ${propertyName} (${clientName})*${nb}\n\n📅 État d'entrée : ${dateAvant}\n\nAucun nouveau défaut par rapport à l'entrée.\n\n${analysis.description}\n\n_Dossier ${data.id.slice(-8)}_`;

    return { success: true, message, stateId: data.id, photoUrl: photos[0] ?? null, photos, bookingId: beforeState.property_id ?? null, analysis };
  } catch (e) {
    console.error('[property-state] savePropertyAfterState error:', e);
    return { success: false, message: '❌ Erreur lors de la comparaison. Réessaie.' };
  }
}

export async function getPropertyHistory(
  clientName:   string,
  propertyName: string,
  ownerKey      = 'kouider',
): Promise<PropertyState[]> {
  const { data } = await supabase
    .from('property_states')
    .select('*')
    .eq('owner_key', ownerKey)
    .ilike('client_name', `%${clientName}%`)
    .ilike('property_name', `%${propertyName}%`)
    .order('created_at', { ascending: false })
    .limit(20);
  return (data ?? []) as PropertyState[];
}
