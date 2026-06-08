import Anthropic from '@anthropic-ai/sdk';
import { v2 as cloudinary } from 'cloudinary';
import { env } from '../config/env.js';

const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME ?? '',
  api_key:    env.CLOUDINARY_API_KEY    ?? '',
  api_secret: env.CLOUDINARY_API_SECRET ?? '',
});

export type InspectionKind = 'vehicle' | 'property';
export type StateType      = 'before' | 'after';
export type Severity       = 'aucun' | 'leger' | 'moyen' | 'grave';

// Une boîte = un dégât localisé. x,y,w,h normalisés 0..1, origine coin haut-gauche.
export interface DamageBox {
  label:    string;     // ex "Rayure aile avant gauche"
  severity: Severity;
  location: string;     // ex "aile avant gauche"
  is_new?:  boolean;    // (état 'after') dégât apparu pendant la location
  box:      { x: number; y: number; w: number; h: number };
}

export interface InspectionAnalysis {
  description:       string;
  severity:         Severity;
  accident:         boolean;
  damages:          string[];     // labels plats (rétrocompat)
  damageBoxes:      DamageBox[];
  damageDetected:   boolean;
  comparisonReport?: string;      // rempli sur l'état 'after'
}

// ── Upload photo → Cloudinary, renvoie l'URL permanente ──────────
export async function uploadInspectionPhoto(
  base64: string,
  mime  = 'image/jpeg',
  folder = 'inspections',
): Promise<string | null> {
  try {
    const dataUri = base64.startsWith('data:') ? base64 : `data:${mime};base64,${base64}`;
    const up = await cloudinary.uploader.upload(dataUri, { folder });
    return up.secure_url;
  } catch (e) {
    console.error('[inspection-core] cloudinary upload error:', e);
    return null;
  }
}

function clamp01(n: unknown): number {
  const v = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

function safeSeverity(s: unknown): Severity {
  const v = String(s ?? '').toLowerCase();
  return v === 'leger' || v === 'moyen' || v === 'grave' ? v : 'aucun';
}

// Extrait le 1er objet JSON d'une réponse (tolère ```json ... ``` et texte autour).
function extractJson(text: string): Record<string, unknown> | null {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const start = t.indexOf('{');
  const end   = t.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try { return JSON.parse(t.slice(start, end + 1)) as Record<string, unknown>; }
  catch { return null; }
}

const SUBJECT: Record<InspectionKind, { noun: string; zones: string }> = {
  vehicle: {
    noun:  'véhicule',
    zones: 'carrosserie, pare-chocs avant/arrière, portières, capot, toit, jantes, vitres, phares, rétroviseurs, intérieur si visible',
  },
  property: {
    noun:  'bien immobilier (logement)',
    zones: 'murs, sols, plafond, peinture, portes, fenêtres, cuisine, salle de bain, sanitaires, meubles, électroménager, traces d\'humidité/moisissure',
  },
};

// ── Analyse Claude Vision (Sonnet) → JSON structuré avec boîtes ──
export async function analyzeInspectionPhoto(
  base64: string,
  mime: string,
  kind: InspectionKind,
  stateType: StateType,
  beforeDescription?: string,
): Promise<InspectionAnalysis> {
  const subj = SUBJECT[kind];

  const jsonShape = `Réponds UNIQUEMENT avec un objet JSON valide (aucun texte autour), de cette forme exacte :
{
  "description": "description détaillée de l'état général en français",
  "severity": "aucun|leger|moyen|grave",
  "accident": true/false,
  "damages": [
    {
      "label": "ex: Rayure 5cm aile avant gauche",
      "severity": "leger|moyen|grave",
      "location": "ex: aile avant gauche",
      "is_new": true/false,
      "box": { "x": 0.0-1.0, "y": 0.0-1.0, "w": 0.0-1.0, "h": 0.0-1.0 }
    }
  ]${stateType === 'after' ? ',\n  "comparison": "rapport avant/après détaillé en français"' : ''}
}
RÈGLES box : coordonnées normalisées 0..1, origine en HAUT-GAUCHE de l'image. x,y = coin haut-gauche du dégât, w,h = largeur/hauteur. Sois précis : la boîte doit entourer le dégât visible.
RÈGLES is_new : ${stateType === 'after' ? 'true si le dégât est APPARU pendant la location (absent de l\'état initial), false s\'il existait déjà.' : 'toujours false (état initial).'}
"accident" = true seulement si dégât important type choc/collision (tôle enfoncée, pare-choc cassé, vitre brisée, structure déformée).
"severity" global = le pire des dégâts (aucun si rien).
Si aucun dégât : damages = [], severity = "aucun", accident = false.`;

  const system = stateType === 'before'
    ? `Tu es un expert en inspection de ${subj.noun}. Analyse précisément l'état sur la photo : ${subj.zones}.
Repère TOUTE rayure, bosse, fissure, éraflure, tache, impact ou dommage existant, et sa localisation exacte.
${jsonShape}`
    : `Tu es un expert en inspection de ${subj.noun}. Compare l'état ACTUEL avec l'état initial.

ÉTAT INITIAL (avant) :
${beforeDescription ?? '(non disponible)'}

Identifie les NOUVEAUX dommages apparus depuis l'état initial (et garde aussi les existants en is_new:false). Zones : ${subj.zones}.
${jsonShape}`;

  const userPrompt = stateType === 'before'
    ? 'Analyse l\'état de cet élément en détail et renvoie le JSON.'
    : 'Compare avec l\'état initial, identifie les nouveaux dommages et renvoie le JSON.';

  let text = '';
  try {
    const msg = await anthropic.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 1800,
      system,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mime as 'image/jpeg', data: base64 } },
          { type: 'text',  text: userPrompt },
        ],
      }],
    });
    text = msg.content[0]?.type === 'text' ? msg.content[0].text : '';
  } catch (e) {
    console.error('[inspection-core] anthropic error:', e);
    return { description: '', severity: 'aucun', accident: false, damages: [], damageBoxes: [], damageDetected: false };
  }

  const parsed = extractJson(text);

  // Fallback : si le JSON casse, on garde au moins la description brute.
  if (!parsed) {
    return {
      description:    text || 'Analyse indisponible.',
      severity:       'aucun',
      accident:       false,
      damages:        [],
      damageBoxes:    [],
      damageDetected: false,
      comparisonReport: stateType === 'after' ? text : undefined,
    };
  }

  const rawDamages = Array.isArray(parsed['damages']) ? parsed['damages'] as unknown[] : [];
  const damageBoxes: DamageBox[] = rawDamages.map((d) => {
    const o = (d ?? {}) as Record<string, unknown>;
    const b = (o['box'] ?? {}) as Record<string, unknown>;
    return {
      label:    String(o['label'] ?? 'Dégât'),
      severity: safeSeverity(o['severity']),
      location: String(o['location'] ?? ''),
      is_new:   Boolean(o['is_new']),
      box: { x: clamp01(b['x']), y: clamp01(b['y']), w: clamp01(b['w']), h: clamp01(b['h']) },
    };
  });

  const description = String(parsed['description'] ?? text ?? '');
  const comparison  = parsed['comparison'] != null ? String(parsed['comparison']) : undefined;
  const accident    = Boolean(parsed['accident']);
  const severity    = safeSeverity(parsed['severity']);

  // En 'after', "dégât détecté" = au moins un dégât nouveau. En 'before' = au moins un dégât.
  const damageDetected = stateType === 'after'
    ? damageBoxes.some(d => d.is_new)
    : damageBoxes.length > 0;

  return {
    description,
    severity,
    accident,
    damages:        damageBoxes.map(d => d.label),
    damageBoxes,
    damageDetected,
    comparisonReport: stateType === 'after' ? (comparison ?? description) : undefined,
  };
}

// Petit résumé texte des dégâts (pour les messages chat).
export function formatDamageLines(boxes: DamageBox[]): string {
  if (!boxes.length) return '';
  const icon = (s: Severity) => (s === 'grave' ? '🔴' : s === 'moyen' ? '🟠' : s === 'leger' ? '🟡' : '⚪');
  return boxes
    .map((d, i) => `${i + 1}. ${icon(d.severity)} ${d.label}${d.is_new ? ' *(NOUVEAU)*' : ''}`)
    .join('\n');
}
