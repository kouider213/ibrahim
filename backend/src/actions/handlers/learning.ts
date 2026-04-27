import { supabase } from '../../integrations/supabase.js';

/**
 * PHASE 13 — APPRENTISSAGE CONTINU Dzaryx
 * Handlers pour feedback, amélioration, et calibration automatique
 */

// ─────────────────────────────────────────────────────────────────
// 1. RECORD FEEDBACK
// ─────────────────────────────────────────────────────────────────
export async function recordFeedback(args: {
  action_type: string;
  rating: 'positive' | 'negative' | 'neutral';
  action_id?: string;
  comment?: string;
  context?: string;
}) {
  try {
    // Parser le contexte si c'est une string JSON
    let contextObj = null;
    if (args.context) {
      try {
        contextObj = JSON.parse(args.context);
      } catch {
        contextObj = { raw: args.context };
      }
    }

    // Insérer le feedback
    const { data, error } = await supabase
      .from('Dzaryx_feedback')
      .insert({
        action_type: args.action_type,
        action_id: args.action_id || null,
        rating: args.rating,
        comment: args.comment || null,
        context: contextObj,
        learned: false,
      })
      .select()
      .single();

    if (error) throw error;

    // Mettre à jour les stats mensuelles
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();

    await updateMonthlyStats(year, month);

    return {
      success: true,
      feedback_id: data.id,
      message: `✅ Feedback enregistré : ${args.rating} sur ${args.action_type}`,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
    };
  }
}

// ─────────────────────────────────────────────────────────────────
// 2. MONTHLY IMPROVEMENT REPORT
// ─────────────────────────────────────────────────────────────────
export async function getMonthlyImprovementReport(args?: {
  year?: number;
  month?: number;
}) {
  try {
    const now = new Date();
    const year = args?.year || now.getFullYear();
    const month = args?.month || now.getMonth() + 1;

    // Récupérer tous les feedbacks du mois
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    const { data: feedbacks, error: feedbackError } = await supabase
      .from('Dzaryx_feedback')
      .select('*')
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString())
      .order('created_at', { ascending: false });

    if (feedbackError) throw feedbackError;

    // Récupérer les règles apprises ce mois
    const { data: rules, error: rulesError } = await supabase
      .from('Dzaryx_rules')
      .select('*')
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString());

    if (rulesError) throw rulesError;

    // Analyser les feedbacks par type
    const byType: Record<string, { positive: number; negative: number; neutral: number }> = {};
    
    feedbacks?.forEach((fb: any) => {
      if (!byType[fb.action_type]) {
        byType[fb.action_type] = { positive: 0, negative: 0, neutral: 0 };
      }
      byType[fb.action_type][fb.rating as 'positive' | 'negative' | 'neutral']++;
    });

    const totalFeedbacks = feedbacks?.length || 0;
    const positiveFeedbacks = feedbacks?.filter((f: any) => f.rating === 'positive').length || 0;
    const negativeFeedbacks = feedbacks?.filter((f: any) => f.rating === 'negative').length || 0;
    const satisfactionRate = totalFeedbacks > 0 ? Math.round((positiveFeedbacks / totalFeedbacks) * 100) : 0;

    // Patterns découverts (feedbacks négatifs récurrents)
    const negativePatterns = feedbacks
      ?.filter((f: any) => f.rating === 'negative' && f.comment)
      .map((f: any) => f.comment);

    return {
      success: true,
      period: `${getMonthName(month)} ${year}`,
      summary: {
        total_feedbacks: totalFeedbacks,
        positive: positiveFeedbacks,
        negative: negativeFeedbacks,
        neutral: feedbacks?.filter((f: any) => f.rating === 'neutral').length || 0,
        satisfaction_rate: `${satisfactionRate}%`,
      },
      by_action_type: byType,
      rules_learned: rules?.length || 0,
      new_rules: rules?.map((r: any) => r.instruction) || [],
      negative_patterns: negativePatterns || [],
      recommendations: generateRecommendations(byType, negativeFeedbacks, totalFeedbacks),
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
    };
  }
}

// ─────────────────────────────────────────────────────────────────
// 3. LEARNING EVOLUTION (6 derniers mois)
// ─────────────────────────────────────────────────────────────────
export async function getLearningEvolution(args?: { months?: number }) {
  try {
    const monthsToAnalyze = args?.months || 6;
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth() - monthsToAnalyze + 1, 1);

    const { data: feedbacks, error } = await supabase
      .from('Dzaryx_feedback')
      .select('*')
      .gte('created_at', startDate.toISOString())
      .order('created_at', { ascending: true });

    if (error) throw error;

    // Grouper par mois
    const monthlyData: Record<string, { positive: number; negative: number; total: number }> = {};

    feedbacks?.forEach((fb: any) => {
      const date = new Date(fb.created_at);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

      if (!monthlyData[key]) {
        monthlyData[key] = { positive: 0, negative: 0, total: 0 };
      }

      monthlyData[key].total++;
      if (fb.rating === 'positive') monthlyData[key].positive++;
      if (fb.rating === 'negative') monthlyData[key].negative++;
    });

    // Calculer l'évolution
    const evolution = Object.entries(monthlyData).map(([month, data]) => ({
      month,
      total_feedbacks: data.total,
      positive: data.positive,
      negative: data.negative,
      satisfaction_rate: Math.round((data.positive / data.total) * 100),
    }));

    const trend =
      evolution.length > 1 &&
      evolution[evolution.length - 1].satisfaction_rate > evolution[0].satisfaction_rate
        ? '📈 En amélioration'
        : evolution.length > 1
        ? '📉 Besoin d\'amélioration'
        : '➡️ Stable';

    return {
      success: true,
      period: `${monthsToAnalyze} derniers mois`,
      evolution,
      trend,
      total_feedbacks: feedbacks?.length || 0,
      avg_satisfaction:
        Math.round(
          evolution.reduce((sum, m) => sum + m.satisfaction_rate, 0) / evolution.length
        ) || 0,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
    };
  }
}

// ─────────────────────────────────────────────────────────────────
// 4. KOUIDER PREFERENCES (calibration automatique)
// ─────────────────────────────────────────────────────────────────
export async function getKouiderPreferences() {
  try {
    // Récupérer tous les feedbacks
    const { data: feedbacks, error } = await supabase
      .from('Dzaryx_feedback')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Analyser les préférences
    const preferences = {
      response_style: analyzeResponseStyle(feedbacks || []),
      tone_preference: analyzeTonePreference(feedbacks || []),
      tiktok_favorites: analyzeTikTokFavorites(feedbacks || []),
      booking_preferences: analyzeBookingPreferences(feedbacks || []),
    };

    return {
      success: true,
      preferences,
      total_feedbacks_analyzed: feedbacks?.length || 0,
      last_calibration: new Date().toISOString(),
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
    };
  }
}

// ─────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────

async function updateMonthlyStats(year: number, month: number) {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59);

  const { data: feedbacks } = await supabase
    .from('Dzaryx_feedback')
    .select('rating')
    .gte('created_at', startDate.toISOString())
    .lte('created_at', endDate.toISOString());

  const { data: rules } = await supabase
    .from('Dzaryx_rules')
    .select('id')
    .gte('created_at', startDate.toISOString())
    .lte('created_at', endDate.toISOString());

  const totalFeedbacks = feedbacks?.length || 0;
  const positiveFeedbacks = feedbacks?.filter((f: any) => f.rating === 'positive').length || 0;
  const negativeFeedbacks = feedbacks?.filter((f: any) => f.rating === 'negative').length || 0;

  await supabase
    .from('Dzaryx_learning_stats')
    .upsert(
      {
        year,
        month,
        total_feedbacks: totalFeedbacks,
        positive_feedbacks: positiveFeedbacks,
        negative_feedbacks: negativeFeedbacks,
        rules_learned: rules?.length || 0,
      },
      { onConflict: 'year,month' }
    );
}

function getMonthName(month: number): string {
  const names = [
    'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
  ];
  return names[month - 1];
}

function generateRecommendations(
  byType: Record<string, any>,
  negativeCount: number,
  totalCount: number
): string[] {
  const recommendations: string[] = [];

  if (negativeCount / totalCount > 0.3) {
    recommendations.push('⚠️ Taux de feedbacks négatifs élevé (>30%) — analyse approfondie nécessaire');
  }

  Object.entries(byType).forEach(([type, stats]) => {
    if (stats.negative > stats.positive) {
      recommendations.push(`📌 Améliorer les actions de type "${type}"`);
    }
  });

  if (recommendations.length === 0) {
    recommendations.push('✅ Performances globales satisfaisantes — continuer sur cette voie');
  }

  return recommendations;
}

function analyzeResponseStyle(feedbacks: any[]): string {
  const responseFeedbacks = feedbacks.filter((f) => f.action_type === 'response');
  if (responseFeedbacks.length === 0) return 'balanced';

  const positiveComments = responseFeedbacks
    .filter((f) => f.rating === 'positive' && f.comment)
    .map((f) => f.comment?.toLowerCase() || '');

  const shortPreferred = positiveComments.some((c) => c.includes('court') || c.includes('concis'));
  const detailedPreferred = positiveComments.some((c) => c.includes('détaillé') || c.includes('complet'));

  if (shortPreferred) return 'short';
  if (detailedPreferred) return 'detailed';
  return 'balanced';
}

function analyzeTonePreference(feedbacks: any[]): string {
  const positiveComments = feedbacks
    .filter((f) => f.rating === 'positive' && f.comment)
    .map((f) => f.comment?.toLowerCase() || '');

  const friendlyPreferred = positiveComments.some((c) => c.includes('amical') || c.includes('cool'));
  const professionalPreferred = positiveComments.some((c) => c.includes('professionnel') || c.includes('sérieux'));

  if (friendlyPreferred) return 'friendly';
  if (professionalPreferred) return 'professional';
  return 'friendly';
}

function analyzeTikTokFavorites(feedbacks: any[]): string[] {
  const tiktokFeedbacks = feedbacks.filter((f) => f.action_type === 'tiktok' && f.rating === 'positive');
  const styles = tiktokFeedbacks
    .map((f) => f.context?.style)
    .filter(Boolean);

  const uniqueStyles = [...new Set(styles)];
  return uniqueStyles.length > 0 ? uniqueStyles : ['dynamic', 'casual'];
}

function analyzeBookingPreferences(feedbacks: any[]): any {
  const bookingFeedbacks = feedbacks.filter((f) => f.action_type === 'booking');
  const positiveCount = bookingFeedbacks.filter((f) => f.rating === 'positive').length;
  const total = bookingFeedbacks.length;

  return {
    satisfaction_rate: total > 0 ? Math.round((positiveCount / total) * 100) : 0,
    total_bookings_reviewed: total,
  };
}

// ─────────────────────────────────────────────────────────────────
// DISPATCHER — appelé par executor.ts
// ─────────────────────────────────────────────────────────────────
import type { ActionPayload, ActionResult } from '../executor.js';

export async function handleLearning(payload: ActionPayload): Promise<ActionResult> {
  try {
    let data: unknown;
    switch (payload.action) {
      case 'record_feedback':
        data = await recordFeedback(payload.params as any);
        break;
      case 'get_monthly_improvement_report':
        data = await getMonthlyImprovementReport(payload.params as any);
        break;
      case 'get_learning_evolution':
        data = await getLearningEvolution(payload.params as any);
        break;
      case 'get_kouider_preferences':
        data = await getKouiderPreferences();
        break;
      default:
        return { success: false, error: 'Unknown learning action', message: `Action inconnue: ${payload.action}` };
    }
    return { success: true, data, message: 'OK' };
  } catch (err: any) {
    return { success: false, error: err.message, message: `Erreur: ${err.message}` };
  }
}
