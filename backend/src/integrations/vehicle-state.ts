import { supabase } from './supabase.js';
import Anthropic from '@anthropic-ai/sdk';
import { env } from '../config/env.js';

const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

export interface VehicleState {
  id:               string;
  client_name:      string;
  car_name:         string;
  state_type:       'before' | 'after';
  photos:           string[];
  ai_description:   string | null;
  damages:          string[];
  damage_detected:  boolean;
  comparison_report: string | null;
  created_at:       string;
}

// ── Analyser photo véhicule avec Claude Vision ───────────────────

async function analyzeVehiclePhoto(
  base64: string,
  mime: string,
  stateType: 'before' | 'after',
  beforeDescription?: string,
): Promise<{ description: string; damages: string[]; damageDetected: boolean; comparisonReport?: string }> {

  const systemPrompt = stateType === 'before'
    ? `Tu es expert en inspection véhicule. Analyse l'état du véhicule sur la photo.
Décris précisément: carrosserie, pare-chocs, jantes, vitres, intérieur si visible.
Note toute rayure, bosse, fissure, ou dommage existant.
Sois très précis sur la localisation (ex: "rayure 5cm aile avant gauche").
Réponds en français, de manière structurée.`
    : `Tu es expert en inspection véhicule. Compare l'état actuel du véhicule avec l'état initial.

ÉTAT INITIAL (avant location):
${beforeDescription}

Analyse la photo actuelle et détermine:
1. Quels nouveaux dommages sont apparus pendant la location ?
2. L'état général s'est-il dégradé ?
Sois très précis. Indique clairement si des dommages sont NOUVEAUX vs existants avant.
Réponds en français.`;

  const userPrompt = stateType === 'before'
    ? 'Analyse l\'état de ce véhicule en détail.'
    : 'Compare l\'état actuel avec l\'état initial et identifie les nouveaux dommages.';

  const msg = await anthropic.messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system:     systemPrompt,
    messages:   [{
      role:    'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mime as 'image/jpeg', data: base64 } },
        { type: 'text',  text: userPrompt },
      ],
    }],
  });

  const text = msg.content[0].type === 'text' ? msg.content[0].text : '';

  // Extraction dommages depuis la description
  const damageKeywords = /rayure|bosse|fissure|cassé|brisé|déformé|enfoncé|éraflure|impact|dommage|dégât/i;
  const damages: string[] = [];
  const lines = text.split('\n');
  for (const line of lines) {
    if (damageKeywords.test(line) && line.trim().length > 10) {
      damages.push(line.trim().replace(/^[-•*]\s*/, ''));
    }
  }

  const damageDetected = stateType === 'after'
    ? /nouveau|apparu|constaté|rajouté|absent.*avant|n'était pas/i.test(text)
    : damages.length > 0;

  return {
    description:      text,
    damages,
    damageDetected,
    comparisonReport: stateType === 'after' ? text : undefined,
  };
}

// ── Sauvegarder état avant location ─────────────────────────────

export async function saveBeforeState(
  clientName: string,
  carName:    string,
  base64:     string,
  mime        = 'image/jpeg',
  ownerKey    = 'kouider',
  bookingId?: string,
): Promise<{ success: boolean; description: string; message: string }> {
  try {
    const analysis = await analyzeVehiclePhoto(base64, mime, 'before');

    const { data, error } = await supabase.from('vehicle_states').insert({
      owner_key:       ownerKey,
      client_name:     clientName,
      car_name:        carName,
      booking_id:      bookingId ?? null,
      state_type:      'before',
      photos:          [],  // stockage URL Cloudinary à implémenter si besoin
      ai_description:  analysis.description,
      damages:         analysis.damages,
      damage_detected: analysis.damageDetected,
    }).select('id').single();

    if (error) throw error;

    const msg = analysis.damageDetected
      ? `📋 *État AVANT — ${carName} (${clientName})*\n\n${analysis.description}\n\n⚠️ *Dommages existants notés:*\n${analysis.damages.map(d => `• ${d}`).join('\n')}\n\n_ID dossier: ${data.id.slice(-8)}_`
      : `📋 *État AVANT — ${carName} (${clientName})*\n\n${analysis.description}\n\n✅ *Aucun dommage majeur constaté.*\n\n_ID dossier: ${data.id.slice(-8)}_`;

    return { success: true, description: analysis.description, message: msg };
  } catch (e) {
    console.error('[vehicle-state] saveBeforeState error:', e);
    return { success: false, description: '', message: '❌ Erreur lors de l\'analyse. Réessaie.' };
  }
}

// ── Sauvegarder état après retour + comparer ──────────────────────

export async function saveAfterState(
  clientName: string,
  carName:    string,
  base64:     string,
  mime        = 'image/jpeg',
  ownerKey    = 'kouider',
): Promise<{ success: boolean; newDamages: boolean; message: string }> {
  try {
    // Charger l'état AVANT le plus récent
    const { data: beforeStates } = await supabase
      .from('vehicle_states')
      .select('ai_description, damages, created_at, id')
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
        newDamages: false,
        message: `⚠️ Aucun état AVANT trouvé pour *${clientName}* / *${carName}*. Lance d'abord l'inspection initiale.`,
      };
    }

    const analysis = await analyzeVehiclePhoto(base64, mime, 'after', beforeState.ai_description ?? '');

    await supabase.from('vehicle_states').insert({
      owner_key:         ownerKey,
      client_name:       clientName,
      car_name:          carName,
      state_type:        'after',
      photos:            [],
      ai_description:    analysis.description,
      damages:           analysis.damages,
      damage_detected:   analysis.damageDetected,
      comparison_report: analysis.comparisonReport,
    });

    const dateAvant = new Date(beforeState.created_at).toLocaleDateString('fr-FR');

    let msg: string;
    if (analysis.damageDetected) {
      msg = `🔍 *Rapport retour — ${carName} (${clientName})*\n\n`
          + `📅 État initial: ${dateAvant}\n\n`
          + `🚨 *NOUVEAUX DOMMAGES DÉTECTÉS:*\n${analysis.damages.map(d => `• ${d}`).join('\n')}\n\n`
          + `📝 *Rapport complet:*\n${analysis.comparisonReport}`;
    } else {
      msg = `✅ *Retour OK — ${carName} (${clientName})*\n\n`
          + `📅 État initial: ${dateAvant}\n\n`
          + `Aucun nouveau dommage constaté par rapport à l'état initial.\n\n`
          + `${analysis.description}`;
    }

    return { success: true, newDamages: analysis.damageDetected, message: msg };
  } catch (e) {
    console.error('[vehicle-state] saveAfterState error:', e);
    return { success: false, newDamages: false, message: '❌ Erreur lors de la comparaison. Réessaie.' };
  }
}

// ── Historique états d'un véhicule ───────────────────────────────

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
    .limit(10);

  return (data ?? []) as VehicleState[];
}
