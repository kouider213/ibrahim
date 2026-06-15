import Anthropic from '@anthropic-ai/sdk';
import { env } from '../config/env.js';
import { redis } from '../queue/queue.js';

const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

export type OppCategory = 'location' | 'vente' | 'import' | 'immo' | 'business' | 'change' | 'invest' | 'aide' | 'loi' | 'marche' | 'modele';
export type OppUrgency  = 'info' | 'a_suivre' | 'urgent';

const VALID_CATS: OppCategory[] = ['location', 'vente', 'import', 'immo', 'business', 'change', 'invest', 'aide', 'loi', 'marche', 'modele'];

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

const CACHE_KEY = 'deals:opportunities:v3'; // v3 = veille business large (+ devises/invest/aides)
const CACHE_TTL = 60 * 60 * 25; // 25h (refresh quotidien par le cron 7h, reste dispo si le cron saute un jour)

function extractJson(text: string): any | null {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const s = t.indexOf('{'); const e = t.lastIndexOf('}');
  if (s === -1 || e <= s) return null;
  try { return JSON.parse(t.slice(s, e + 1)); } catch { return null; }
}

const SYSTEM = `Tu es l'analyste business de Kouider, homme d'affaires à Oran (Algérie) avec du capital et du réseau. Il fait déjà : location de voitures, achat/revente de voitures, import de véhicules, immobilier. MAIS il veut TOUT ce qui peut être intéressant pour faire du business en Algérie — il est ouvert à n'importe quelle bonne affaire ou tendance, pas seulement ses activités actuelles.
Ta mission : agir comme un veilleur business malin qui surveille TOUTE l'économie algérienne et lui remonte les VRAIES opportunités et les choses importantes à savoir.

Recherche sur le web (actualité récente, 2025-2026) et couvre LARGEMENT, sans te limiter :
- 🔑 LOCATION VOITURE : modèles/segments qui se louent le mieux, saison (été diaspora), prix, demande Oran.
- 💰 ACHAT/REVENTE VOITURE : véhicules à acheter bas / revendre avec marge, modèles recherchés, prix occasion.
- ⛴️ IMPORT : lois d'import (moins de 3 ans/10 ans, taxes), changements, ports/douane, quand ça rouvre, modèles importables.
- 🏠 IMMOBILIER : prix Oran (achat/location/vente), quartiers qui montent, demande locative, foncier/terrains, bonnes affaires.
- 💱 DEVISES / CHANGE : euro-dinar (officiel ET marché parallèle/square), tendance, impact sur import et achats, meilleur moment.
- 📈 INVESTISSEMENT / SECTEURS PORTEURS : où placer de l'argent en Algérie (secteurs en croissance, e-commerce, tourisme, agro, tech, franchises, niches rentables), nouvelles entreprises/zones à fort potentiel.
- 🏛️ AIDES / SUBVENTIONS / DISPOSITIFS ÉTAT : ANADE/ANGEM/CNAC, financements, avantages fiscaux, zones franches, appels d'offres, facilités pour entrepreneurs/importateurs.
- 📜 LOIS & RÉGLEMENTATION : tout changement (loi de finances, import, change, immo, fiscalité, business) qui crée une opportunité ou un risque.
- 💡 AUTRE : toute tendance/affaire intéressante pour un entrepreneur à Oran/Algérie même hors de ses activités.

Sois CONCRET et orienté action pour l'Algérie (surtout Oran). Chiffres, modèles, quartiers, taux, secteurs, dates réels. Pas de blabla générique. Si une info n'est pas sûre, dis-le.

⛔ TRÈS IMPORTANT : ta réponse finale doit être UNIQUEMENT l'objet JSON ci-dessous. AUCUN texte avant, AUCUNE analyse en markdown, AUCUN commentaire après. Commence directement par { et termine par }. Le "detail" est lu en entier par Kouider dans une fiche dédiée : sois complet et concret (3 à 6 phrases : chiffres, taux, secteurs, prix, dates, sources si possible).

Format EXACT :
{
  "summary": "2-3 phrases de synthèse pour Kouider",
  "items": [
    {
      "category": "location|vente|import|immo|change|invest|aide|loi|business",
      "title": "titre court et accrocheur",
      "detail": "explication concrète (chiffres, taux, secteurs, dates si possible)",
      "action": "ce que Kouider devrait faire / surveiller",
      "urgency": "info|a_suivre|urgent"
    }
  ]
}
10 à 14 items, couvre PLUSIEURS axes différents (auto, immo, devises, investissement, aides, lois...), les plus utiles d'abord.`;

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
      max_tokens: 6000,
      system:     SYSTEM,
      tools:      [{ type: 'web_search_20250305' as any, name: 'web_search', max_uses: 5 } as any],
      messages:   [{ role: 'user', content: 'Recherche les infos récentes (marché, location, nouveautés, lois & import auto Algérie) puis réponds UNIQUEMENT avec le JSON demandé — aucun texte avant ni après.' }],
    });
    text = msg.content.filter(b => b.type === 'text').map(b => (b as any).text).join('\n');
  } catch (e) {
    console.error('[opportunities] anthropic error:', e);
  }

  const parsed = extractJson(text);
  const items: Opportunity[] = Array.isArray(parsed?.items) ? parsed.items.map((o: any) => ({
    category: VALID_CATS.includes(o?.category) ? o.category : 'marche',
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
