import Anthropic from '@anthropic-ai/sdk';
import { env } from '../config/env.js';
import { redis } from '../queue/queue.js';

const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

export type OppCategory = 'marche' | 'location' | 'import' | 'loi' | 'modele';
export type OppUrgency  = 'info' | 'a_suivre' | 'urgent';

export interface Opportunity {
  category: OppCategory;
  title:    string;
  detail:   string;
  action:   string;     // ce que Kouider devrait faire
  urgency:  OppUrgency;
}

export interface OpportunitiesReport {
  updated_at: string;
  summary:    string;
  items:      Opportunity[];
}

const CACHE_KEY = 'deals:opportunities:v1';
const CACHE_TTL = 60 * 60 * 12; // 12h

function extractJson(text: string): any | null {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const s = t.indexOf('{'); const e = t.lastIndexOf('}');
  if (s === -1 || e <= s) return null;
  try { return JSON.parse(t.slice(s, e + 1)); } catch { return null; }
}

const SYSTEM = `Tu es l'analyste business automobile de Kouider (Fik Conciergerie, Oran, Algérie) — location ET achat/revente de voitures + import.
Ta mission : repérer les VRAIES opportunités du marché auto algérien, comme un homme d'affaires malin qui surveille tout.

Recherche sur le web (actualité récente, 2025-2026) et couvre :
- 🚗 Quels véhicules se vendent/se louent le MIEUX en Algérie en ce moment (modèles, segments, prix).
- 🆕 Nouveautés / nouveaux modèles qui arrivent, et lesquels sont intéressants pour la location ou la revente.
- 📜 Lois & règles d'import de véhicules en Algérie (ex: véhicules de moins de 3 ans / moins de 10 ans, taxes, conditions) — et tout CHANGEMENT récent ou à venir.
- ⛴️ Contraintes pratiques d'import (ex: blocage/saturation des ports/bateaux en été, délais douane) — et à partir de QUAND l'import redevient possible.
- 💡 Opportunités concrètes : "tel modèle va devenir importable", "bon moment pour acheter X et revendre", etc.

Sois CONCRET et orienté action pour Oran/Algérie. Pas de blabla générique. Si une info n'est pas sûre, dis-le.

Réponds À LA FIN uniquement avec un objet JSON (rien après) :
{
  "summary": "2-3 phrases de synthèse pour Kouider",
  "items": [
    {
      "category": "marche|location|import|loi|modele",
      "title": "titre court et accrocheur",
      "detail": "explication concrète (chiffres, modèles, dates si possible)",
      "action": "ce que Kouider devrait faire / surveiller",
      "urgency": "info|a_suivre|urgent"
    }
  ]
}
6 à 9 items maximum, les plus utiles d'abord.`;

export async function getAutoOpportunities(force = false): Promise<OpportunitiesReport> {
  if (!force) {
    try {
      const cached = await redis.get(CACHE_KEY);
      if (cached) return JSON.parse(cached) as OpportunitiesReport;
    } catch { /* ignore */ }
  }

  let text = '';
  try {
    const msg = await anthropic.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 3000,
      system:     SYSTEM,
      tools:      [{ type: 'web_search_20250305' as any, name: 'web_search', max_uses: 6 } as any],
      messages:   [{ role: 'user', content: 'Donne-moi les opportunités auto du moment en Algérie (marché, location, import, lois). Recherche les infos récentes puis renvoie le JSON.' }],
    });
    text = msg.content.filter(b => b.type === 'text').map(b => (b as any).text).join('\n');
  } catch (e) {
    console.error('[opportunities] anthropic error:', e);
  }

  const parsed = extractJson(text);
  const items: Opportunity[] = Array.isArray(parsed?.items) ? parsed.items.map((o: any) => ({
    category: ['marche', 'location', 'import', 'loi', 'modele'].includes(o?.category) ? o.category : 'marche',
    title:    String(o?.title ?? 'Opportunité'),
    detail:   String(o?.detail ?? ''),
    action:   String(o?.action ?? ''),
    urgency:  ['info', 'a_suivre', 'urgent'].includes(o?.urgency) ? o.urgency : 'info',
  })) : [];

  const report: OpportunitiesReport = {
    updated_at: new Date().toISOString(),
    summary:    String(parsed?.summary ?? (items.length ? '' : 'Analyse indisponible pour le moment, réessaie.')),
    items,
  };

  if (items.length) {
    try { await redis.set(CACHE_KEY, JSON.stringify(report), 'EX', CACHE_TTL); } catch { /* ignore */ }
  }
  return report;
}
