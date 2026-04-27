import { chat } from '../integrations/claude-api.js';
import type { Car } from '../integrations/supabase.js';

export interface VideoIdea {
  title: string;
  concept: string;
  voiceover_script: string;
  caption: string;
  hashtags: string[];
  best_time: string;
  car_suggestion?: string;
}

export interface MarketResearchReport {
  week: string;
  trends: string[];
  top_ideas: VideoIdea[];
  summary: string;
}

function getSeasonalContext(month: number): string {
  if (month >= 6 && month <= 8) return 'Saison MRE — forte demande, familles diaspora, tourisme estival Oran';
  if (month === 3 || month === 4) return 'Ramadan — location nocturne populaire, sorties après iftar, famille étendue';
  if (month === 12 || month === 1) return 'Hiver — longue durée, voyages familiaux, fêtes de fin d\'année';
  if (month === 5) return 'Pré-saison — anticiper les vacances d\'été, réservations anticipées';
  if (month === 9 || month === 10) return 'Rentrée — déplacements professionnels, étudiants, business';
  return 'Période standard — clients locaux professionnels et loisirs';
}

export async function runTikTokMarketResearch(cars: Car[]): Promise<MarketResearchReport> {
  const week = new Date().toISOString().slice(0, 10);
  const month = new Date().getMonth() + 1;
  const seasonalContext = getSeasonalContext(month);
  const carList = cars.map(c => `${c.name} (${c.category}, ${c.base_price} DZD/j)`).join(', ');

  const prompt = `Tu es un expert marketing TikTok et réseaux sociaux spécialisé dans la location de voitures en Algérie.

CONTEXTE ENTREPRISE:
- Société: Fik Conciergerie — location de voitures à Oran, Algérie
- Flotte disponible: ${carList}
- Semaine du: ${week}
- Saison: ${seasonalContext}
- Marché cible: Oranais locaux + MRE (Algériens de la diaspora en visite)
- Concurrence: agences classiques peu actives sur TikTok → opportunité ÉNORME

ANALYSE TENDANCES TIKTOK LOCATION VOITURE:
Analyse ces tendances prouvées qui cartonnent pour la location de voitures:
1. "Car reveal" — dévoilement dramatique d'une voiture avec musique
2. "Prix choc" — afficher le prix daily en gros plan, choquer par le rapport qualité/prix
3. "Avant/après" — voiture sale livrée propre, ou client hésitant → client satisfait
4. "POV: tu loues une ${cars[0]?.name ?? 'BMW'} pour le weekend" — style lifestyle
5. "Tu savais que tu peux louer une voiture à Oran pour X DZD/jour?" — format éducatif
6. Témoignage client (darija/français mixte) — très authentique, fort engagement
7. "Day in my life with a rental car" — touriste ou MRE qui visite Oran
8. Coulisses agence — préparation véhicule, équipe, processus sérieux

MISSION: Génère 3 concepts de vidéos TikTok ULTRA-CONCRETS pour CETTE SEMAINE.

RÈGLES:
- Scripts en darija/français mélangé (naturel algérien)
- Ton: dynamique, authentique, pas corporate
- Durée vidéo idéale: 15-30 secondes pour TikTok
- Chaque vidéo doit donner envie de réserver IMMÉDIATEMENT
- Hashtags mix: populaires (#locationvoiture) + niches (#oran #algerie #mre2025)

RÉPONDS UNIQUEMENT EN JSON VALIDE:
{
  "trends": ["tendance1 qui marche cette semaine", "tendance2", "tendance3"],
  "top_ideas": [
    {
      "title": "Titre accrocheur max 8 mots",
      "concept": "Description de ce qu'on voit dans la vidéo (2-3 phrases concrètes)",
      "voiceover_script": "Le texte exact à dire à voix haute (20-35 mots, darija/français, punchy)",
      "caption": "Légende TikTok avec emojis max 150 caractères",
      "hashtags": ["#locationvoiture", "#oran", "#algerie", "#fikconciergeire", "#mre", "#voiture", "#oran2025", "#locationoran"],
      "best_time": "Jour + heure optimale ex: Vendredi 20h-22h",
      "car_suggestion": "nom exact de la voiture de la flotte à mettre en avant"
    }
  ],
  "summary": "Stratégie de la semaine en 2 phrases — pourquoi ces idées vont exploser les vues"
}`;

  const response = await chat([{ role: 'user', content: prompt }]);

  try {
    const jsonMatch = response.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON');
    const data = JSON.parse(jsonMatch[0]) as Partial<MarketResearchReport>;
    return {
      week,
      trends:    Array.isArray(data.trends)    ? data.trends    : [],
      top_ideas: Array.isArray(data.top_ideas) ? data.top_ideas : [],
      summary:   data.summary ?? '',
    };
  } catch {
    return fallbackReport(week, cars);
  }
}

function fallbackReport(week: string, cars: Car[]): MarketResearchReport {
  const car = cars[0];
  return {
    week,
    trends: ['Car reveal dramatique', 'Prix choc format court', 'Témoignage darija authentique'],
    top_ideas: [{
      title: 'Location voiture Oran — Prix imbattable',
      concept: 'Dévoilement de la voiture avec le prix en gros plan, musique dynamique.',
      voiceover_script: `Wach tabghi troh f weekend b ${car?.name ?? 'voiture premium'}? Fik Conciergerie Oran — ${car?.base_price ?? 3000} DA par jour. Réserve maintenant !`,
      caption: `🚗 Location ${car?.name ?? 'voiture'} à Oran — Prix imbattable ! Réserve maintenant 📞`,
      hashtags: ['#locationvoiture', '#oran', '#algerie', '#fikconcierge', '#mre', '#voitureoran'],
      best_time: 'Vendredi 19h-21h',
      car_suggestion: car?.name,
    }],
    summary: 'Cette semaine: mise en avant du rapport qualité/prix et de la disponibilité immédiate.',
  };
}
