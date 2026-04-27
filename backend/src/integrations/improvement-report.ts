import {
  getLearningPatterns,
  getKouiderPreferences,
} from './feedback-system.js';
import { supabase } from './supabase.js';

// ── Types ──────────────────────────────────────────────────────

export interface MonthlyImprovementReport {
  period: string; // "2026-04"
  summary: {
    new_rules_learned: number;
    total_feedback_received: number;
    positive_feedback_rate: number;
    patterns_discovered: number;
  };
  learning_highlights: string[];
  preferences_calibrated: {
    response_style: string;
    tone: string;
    tiktok_favorites: string[];
  };
  performance_by_category: Record<
    string,
    { positive: number; negative: number; success_rate: number }
  >;
  recommendations: string[];
}

// ── Générer le rapport mensuel ─────────────────────────────────

export async function generateMonthlyReport(
  year: number,
  month: number
): Promise<MonthlyImprovementReport> {
  const startDate = new Date(year, month - 1, 1).toISOString();
  const endDate = new Date(year, month, 1).toISOString();
  const period = `${year}-${month.toString().padStart(2, '0')}`;

  // 1. Compter les nouvelles règles apprises ce mois
  const { data: newRules } = await supabase
    .from('Dzaryx_rules')
    .select('id')
    .gte('created_at', startDate)
    .lt('created_at', endDate);

  const newRulesCount = (newRules ?? []).length;

  // 2. Récupérer les stats de feedback du mois
  const { data: monthFeedback } = await supabase
    .from('Dzaryx_feedback')
    .select('rating, action_type, comment')
    .gte('created_at', startDate)
    .lt('created_at', endDate);

  const feedbacks = (monthFeedback ?? []) as {
    rating: string;
    action_type: string;
    comment?: string;
  }[];

  const totalFeedback = feedbacks.length;
  const positiveFeedback = feedbacks.filter(f => f.rating === 'positive').length;
  const positiveFeedbackRate = totalFeedback > 0 ? positiveFeedback / totalFeedback : 0;

  // 3. Récupérer les patterns découverts
  const patterns = await getLearningPatterns();

  // 4. Récupérer les préférences calibrées
  const prefs = await getKouiderPreferences();

  // 5. Analyser les performances par catégorie
  const performanceByCategory: Record<
    string,
    { positive: number; negative: number; success_rate: number }
  > = {};

  feedbacks.forEach(f => {
    if (!performanceByCategory[f.action_type]) {
      performanceByCategory[f.action_type] = { positive: 0, negative: 0, success_rate: 0 };
    }
    if (f.rating === 'positive') performanceByCategory[f.action_type].positive++;
    if (f.rating === 'negative') performanceByCategory[f.action_type].negative++;
  });

  Object.keys(performanceByCategory).forEach(cat => {
    const { positive, negative } = performanceByCategory[cat];
    const total = positive + negative;
    performanceByCategory[cat].success_rate = total > 0 ? positive / total : 0;
  });

  // 6. Extraire les highlights (commentaires positifs marquants)
  const highlights = feedbacks
    .filter(f => f.rating === 'positive' && f.comment)
    .map(f => f.comment!)
    .slice(0, 5);

  // 7. Générer des recommandations
  const recommendations: string[] = [];

  if (positiveFeedbackRate < 0.7) {
    recommendations.push(
      '⚠️ Taux de satisfaction faible (<70%) — analyser les feedbacks négatifs'
    );
  }

  Object.entries(performanceByCategory).forEach(([cat, perf]) => {
    if (perf.success_rate < 0.6) {
      recommendations.push(
        `⚠️ Catégorie "${cat}" sous-performante (${Math.round(perf.success_rate * 100)}%) — revoir la stratégie`
      );
    }
  });

  if (newRulesCount === 0) {
    recommendations.push('💡 Aucune nouvelle règle apprise ce mois — encourager plus de feedback');
  }

  if (recommendations.length === 0) {
    recommendations.push('✅ Toutes les métriques sont bonnes — continuer ainsi !');
  }

  // 8. Top styles TikTok
  const tiktokFavorites = Object.entries(prefs.tiktok_styles)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([style]) => style);

  return {
    period,
    summary: {
      new_rules_learned: newRulesCount,
      total_feedback_received: totalFeedback,
      positive_feedback_rate: positiveFeedbackRate,
      patterns_discovered: patterns.length,
    },
    learning_highlights: highlights,
    preferences_calibrated: {
      response_style: prefs.response_style,
      tone: prefs.tone,
      tiktok_favorites: tiktokFavorites,
    },
    performance_by_category: performanceByCategory,
    recommendations,
  };
}

// ── Rapport d'évolution (comparaison mois par mois) ────────────

export async function getEvolutionReport(months: number = 6): Promise<{
  evolution: Array<{
    period: string;
    positive_rate: number;
    new_rules: number;
  }>;
  trends: {
    improving: boolean;
    avg_positive_rate: number;
  };
}> {
  const now = new Date();
  const evolution: Array<{
    period: string;
    positive_rate: number;
    new_rules: number;
  }> = [];

  for (let i = 0; i < months; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const period = `${year}-${month.toString().padStart(2, '0')}`;

    const report = await generateMonthlyReport(year, month);

    evolution.push({
      period,
      positive_rate: report.summary.positive_feedback_rate,
      new_rules: report.summary.new_rules_learned,
    });
  }

  evolution.reverse(); // Plus ancien → plus récent

  const avgPositiveRate =
    evolution.reduce((sum, e) => sum + e.positive_rate, 0) / evolution.length;

  const isImproving =
    evolution.length >= 2 &&
    evolution[evolution.length - 1].positive_rate > evolution[0].positive_rate;

  return {
    evolution,
    trends: {
      improving: isImproving,
      avg_positive_rate: avgPositiveRate,
    },
  };
}

// ── Formatter le rapport en texte pour Kouider ─────────────────

export function formatReportForKouider(report: MonthlyImprovementReport): string {
  let text = `📊 **RAPPORT D'AMÉLIORATION — ${report.period}**\n\n`;

  text += `## 📈 RÉSUMÉ\n`;
  text += `- Nouvelles règles apprises : **${report.summary.new_rules_learned}**\n`;
  text += `- Feedbacks reçus : **${report.summary.total_feedback_received}**\n`;
  text += `- Taux de satisfaction : **${Math.round(report.summary.positive_feedback_rate * 100)}%**\n`;
  text += `- Patterns découverts : **${report.summary.patterns_discovered}**\n\n`;

  text += `## 🎯 PRÉFÉRENCES CALIBRÉES\n`;
  text += `- Style de réponse : **${report.preferences_calibrated.response_style}**\n`;
  text += `- Ton : **${report.preferences_calibrated.tone}**\n`;
  if (report.preferences_calibrated.tiktok_favorites.length > 0) {
    text += `- Styles TikTok favoris : **${report.preferences_calibrated.tiktok_favorites.join(', ')}**\n`;
  }
  text += `\n`;

  if (report.learning_highlights.length > 0) {
    text += `## 💡 HIGHLIGHTS\n`;
    report.learning_highlights.forEach(h => {
      text += `- "${h}"\n`;
    });
    text += `\n`;
  }

  text += `## 📊 PERFORMANCE PAR CATÉGORIE\n`;
  Object.entries(report.performance_by_category).forEach(([cat, perf]) => {
    const rate = Math.round(perf.success_rate * 100);
    const emoji = rate >= 80 ? '✅' : rate >= 60 ? '⚠️' : '❌';
    text += `${emoji} **${cat}** : ${rate}% (${perf.positive} ✅ / ${perf.negative} ❌)\n`;
  });
  text += `\n`;

  if (report.recommendations.length > 0) {
    text += `## 🎯 RECOMMANDATIONS\n`;
    report.recommendations.forEach(r => {
      text += `${r}\n`;
    });
  }

  return text;
}
