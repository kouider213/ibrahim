import { chat } from '../integrations/claude-api.js';
import {
  scrapeTikTokForOranCars,
  formatTikTokDataForReport,
  serializeTikTokData,
  type TikTokRealData,
} from '../integrations/apify-tiktok.js';
import type { Car } from '../integrations/supabase.js';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface VideoIdea {
  title:            string;
  concept:          string;
  voiceover_script: string;
  caption:          string;
  hashtags:         string[];
  best_time:        string;
  car_suggestion?:  string;
  data_basis:       'real_tiktok' | 'no_data'; // NEVER omit — prevents hiding data source
}

export interface MarketResearchReport {
  week:           string;
  scraped_at:     string;
  data_quality:   'real' | 'partial' | 'no_data';
  data_source:    string;
  real_metrics:   {
    videos_analyzed:    number;
    avg_engagement_pct: number | null;
    top_hashtags:       Array<{ tag: string; avgViews: number; count: number }>;
    top_authors:        Array<{ handle: string; totalViews: number; followers: number | null }>;
  } | null;
  trends:         string[];
  top_ideas:      VideoIdea[];
  summary:        string;
  raw_json:       string; // serialized TikTokRealData for audit — always present
}

// ── Seasonal context (real calendar logic) ────────────────────────────────────

function getSeasonalContext(month: number): string {
  if (month >= 6 && month <= 8) return 'Saison MRE — forte demande, familles diaspora, tourisme estival Oran';
  if (month === 3 || month === 4) return 'Ramadan — location nocturne populaire, sorties après iftar, famille étendue';
  if (month === 12 || month === 1) return 'Hiver — longue durée, voyages familiaux, fêtes de fin d\'année';
  if (month === 5)                return 'Pré-saison — anticiper les vacances d\'été, réservations anticipées';
  if (month === 9 || month === 10) return 'Rentrée — déplacements professionnels, étudiants, business';
  return 'Période standard — clients locaux professionnels et loisirs';
}

// ── Claude prompts ─────────────────────────────────────────────────────────────

function buildPromptWithData(carList: string, season: string, week: string, formattedData: string): string {
  return `Tu es un expert marketing TikTok spécialisé location de voitures en Algérie.

CONTRAINTE ABSOLUE : Base ton analyse UNIQUEMENT sur les données réelles ci-dessous.
- Ne jamais inventer de chiffres (vues, likes, abonnés, engagement).
- Ne jamais inventer de hashtags ou tendances non présents dans ces données.
- Si une info est absente des données, écris "données non disponibles".

FLOTTE FIK CONCIERGERIE : ${carList}
SAISON : ${season}
SEMAINE : ${week}

DONNÉES TIKTOK RÉELLES (APIFY clockworks~tiktok-scraper) :
${formattedData}

Génère en JSON valide strictement :
{
  "trends": [
    "Tendance avec chiffres RÉELS ex: #locationoran — 45K vues moy. sur 12 vidéos",
    "...maximum 5 tendances tirées directement des données ci-dessus"
  ],
  "top_ideas": [
    {
      "title": "Titre basé sur contenu réel observé dans les données",
      "concept": "Concept inspiré d'une vraie vidéo performante des données (cite le compte source si pertinent)",
      "voiceover_script": "Script 20-35 mots darija/français, punchy, exploite une vraie lacune détectée",
      "caption": "Légende avec les vrais hashtags performants des données, max 150 chars",
      "hashtags": ["#hashtag_réel_des_données", "..."],
      "best_time": "Basé sur les dates/heures des vidéos les plus vues dans les données",
      "car_suggestion": "voiture de la flotte la plus adaptée à la tendance",
      "data_basis": "real_tiktok"
    }
  ],
  "summary": "Stratégie basée sur données réelles — cite 2-3 chiffres concrets tirés des données"
}`;
}

function buildPromptNoData(carList: string, season: string, week: string, error: string): string {
  return `Tu es un expert marketing TikTok spécialisé location de voitures en Algérie.

AVERTISSEMENT CRITIQUE : Les données TikTok réelles ne sont PAS disponibles.
Raison technique : ${error}

RÈGLES STRICTES :
- N'invente AUCUN chiffre (vues, likes, abonnés, engagement).
- N'invente AUCUNE tendance comme si elle était prouvée par des données.
- Chaque idée doit clairement indiquer qu'elle n'est PAS basée sur des données réelles.

FLOTTE : ${carList}
SAISON : ${season}
SEMAINE : ${week}

Génère en JSON valide :
{
  "trends": [],
  "top_ideas": [
    {
      "title": "Idée créative (SANS données réelles)",
      "concept": "Concept basé sur bonnes pratiques générales — pas de données TikTok disponibles cette semaine",
      "voiceover_script": "Script 20-35 mots darija/français",
      "caption": "Légende max 150 chars",
      "hashtags": ["#locationoran", "#locationvoiture", "#oran", "#algerie", "#mre"],
      "best_time": "Vendredi 19h-21h (estimation générale — aucune donnée réelle)",
      "car_suggestion": "voiture de la flotte",
      "data_basis": "no_data"
    }
  ],
  "summary": "⚠️ Rapport basé sur bonnes pratiques générales — aucune donnée TikTok réelle disponible. Raison: ${error}"
}`;
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function runTikTokMarketResearch(cars: Car[], carFocus?: string, extraHashtags?: string[]): Promise<MarketResearchReport> {
  const week   = new Date().toISOString().slice(0, 10);
  const month  = new Date().getMonth() + 1;
  const season = getSeasonalContext(month);
  const carList = cars.map(c => `${c.name} (${c.category}, ${c.base_price} DZD/j)`).join(', ');

  // ── Step 1: Scrape real TikTok data ─────────────────────────────────────────
  let tiktokData: TikTokRealData;
  try {
    tiktokData = await scrapeTikTokForOranCars(carFocus, extraHashtags);
  } catch (err) {
    tiktokData = {
      source:        'unavailable',
      scrapedAt:     new Date().toISOString(),
      hashtags:      [],
      profiles:      [],
      videos:        [],
      topHashtags:   [],
      topAuthors:    [],
      avgEngagement: null,
      error:         err instanceof Error ? err.message : String(err),
    };
  }

  const hasRealData = tiktokData.source === 'apify' && tiktokData.videos.length > 0;
  const dataQuality: MarketResearchReport['data_quality'] = !hasRealData
    ? 'no_data'
    : tiktokData.videos.length >= 10 ? 'real' : 'partial';

  // ── Step 2: Build prompt using real data only ────────────────────────────────
  const formattedData = formatTikTokDataForReport(tiktokData);
  const prompt = hasRealData
    ? buildPromptWithData(carList, season, week, formattedData)
    : buildPromptNoData(carList, season, week, tiktokData.error ?? 'raison inconnue');

  // ── Step 3: Claude generates ideas grounded in real data ────────────────────
  const response = await chat([{ role: 'user', content: prompt }]);
  let parsed: { trends?: string[]; top_ideas?: VideoIdea[]; summary?: string } = {};
  try {
    const m = response.text.match(/\{[\s\S]*\}/);
    if (m) parsed = JSON.parse(m[0]) as typeof parsed;
  } catch { /* leave parsed empty */ }

  // ── Step 4: Return structured report with audit trail ───────────────────────
  return {
    week,
    scraped_at:   tiktokData.scrapedAt,
    data_quality: dataQuality,
    data_source:  hasRealData
      ? `APIFY clockworks~tiktok-scraper — ${tiktokData.videos.length} vidéos récupérées`
      : `Données indisponibles — ${tiktokData.error ?? 'raison inconnue'}`,
    real_metrics: hasRealData ? {
      videos_analyzed:    tiktokData.videos.length,
      avg_engagement_pct: tiktokData.avgEngagement,
      top_hashtags:       tiktokData.topHashtags,                        // { tag, avgViews, count }
      top_authors:        tiktokData.topAuthors.map(a => ({              // normalise to interface
        handle:      a.handle,
        totalViews:  a.totalViews,
        followers:   a.followers,
      })),
    } : null,
    trends:    Array.isArray(parsed.trends)    ? parsed.trends    : [],
    top_ideas: Array.isArray(parsed.top_ideas) ? parsed.top_ideas : [],
    summary:   parsed.summary ?? (hasRealData
      ? '⚠️ Claude n\'a pas généré de summary.'
      : `⚠️ Aucune donnée TikTok réelle disponible. ${tiktokData.error ?? ''}`),
    raw_json: serializeTikTokData(tiktokData),
  };
}
