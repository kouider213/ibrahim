import { supabase } from './supabase.js';

// ── Types ──────────────────────────────────────────────────────

export interface Feedback {
  id: string;
  session_id: string;
  action_type: string; // 'response', 'booking', 'tiktok', 'modification', etc.
  action_id?: string;
  rating: 'positive' | 'negative' | 'neutral';
  comment?: string;
  context: Record<string, unknown>;
  created_at: string;
}

export interface LearningPattern {
  id: string;
  category: string; // 'tone', 'length', 'style', 'tiktok_content', etc.
  pattern: string;
  confidence: number; // 0-1
  sample_size: number;
  metadata: Record<string, unknown>;
  updated_at: string;
}

// ── Enregistrer un feedback ────────────────────────────────────

export async function recordFeedback(params: {
  sessionId: string;
  actionType: string;
  actionId?: string;
  rating: 'positive' | 'negative' | 'neutral';
  comment?: string;
  context?: Record<string, unknown>;
}): Promise<Feedback> {
  const { data, error } = await supabase
    .from('ibrahim_feedback')
    .insert({
      session_id: params.sessionId,
      action_type: params.actionType,
      action_id: params.actionId,
      rating: params.rating,
      comment: params.comment,
      context: params.context ?? {},
    })
    .select()
    .single();

  if (error) throw new Error(`Feedback recording failed: ${error.message}`);

  // Déclencher l'analyse en arrière-plan
  analyzeFeedbackPattern(params.actionType).catch(err =>
    console.error('⚠️ Background pattern analysis failed:', err)
  );

  return data as Feedback;
}

// ── Récupérer les feedbacks d'une action ───────────────────────

export async function getFeedbackForAction(actionId: string): Promise<Feedback[]> {
  const { data, error } = await supabase
    .from('ibrahim_feedback')
    .select('*')
    .eq('action_id', actionId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Feedback fetch failed: ${error.message}`);
  return (data ?? []) as Feedback[];
}

// ── Récupérer les feedbacks par type ───────────────────────────

export async function getFeedbackByType(
  actionType: string,
  limit = 50
): Promise<Feedback[]> {
  const { data, error } = await supabase
    .from('ibrahim_feedback')
    .select('*')
    .eq('action_type', actionType)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Feedback fetch failed: ${error.message}`);
  return (data ?? []) as Feedback[];
}

// ── Analyser les patterns de feedback ──────────────────────────

export async function analyzeFeedbackPattern(actionType: string): Promise<void> {
  const feedbacks = await getFeedbackByType(actionType, 100);

  if (feedbacks.length < 5) return; // Pas assez de données

  const positive = feedbacks.filter(f => f.rating === 'positive').length;
  const negative = feedbacks.filter(f => f.rating === 'negative').length;
  const total = feedbacks.length;

  // Analyser les patterns spécifiques selon le type
  let patterns: Record<string, unknown> = {};

  if (actionType === 'response') {
    // Analyser la longueur des réponses
    const longResponses = feedbacks.filter(
      f => f.context?.response_length && (f.context.response_length as number) > 500
    );
    const shortResponses = feedbacks.filter(
      f => f.context?.response_length && (f.context.response_length as number) < 200
    );

    const longPositive = longResponses.filter(f => f.rating === 'positive').length;
    const shortPositive = shortResponses.filter(f => f.rating === 'positive').length;

    patterns = {
      prefers_long: longPositive / Math.max(longResponses.length, 1) > 0.7,
      prefers_short: shortPositive / Math.max(shortResponses.length, 1) > 0.7,
    };
  } else if (actionType === 'tiktok') {
    // Analyser les styles TikTok
    const styles = feedbacks
      .filter(f => f.context?.style)
      .map(f => ({ style: f.context!.style as string, rating: f.rating }));

    const styleStats = styles.reduce((acc, s) => {
      if (!acc[s.style]) acc[s.style] = { positive: 0, total: 0 };
      acc[s.style].total++;
      if (s.rating === 'positive') acc[s.style].positive++;
      return acc;
    }, {} as Record<string, { positive: number; total: number }>);

    patterns = { style_preferences: styleStats };
  }

  // Calculer la confiance
  const confidence = positive / total;

  // Enregistrer ou mettre à jour le pattern
  await upsertLearningPattern({
    category: actionType,
    pattern: JSON.stringify({
      success_rate: confidence,
      positive,
      negative,
      total,
      ...patterns,
    }),
    confidence,
    sampleSize: total,
    metadata: patterns,
  });
}

// ── Enregistrer un pattern d'apprentissage ─────────────────────

export async function upsertLearningPattern(params: {
  category: string;
  pattern: string;
  confidence: number;
  sampleSize: number;
  metadata: Record<string, unknown>;
}): Promise<LearningPattern> {
  const { data, error } = await supabase
    .from('ibrahim_learning_patterns')
    .upsert(
      {
        category: params.category,
        pattern: params.pattern,
        confidence: params.confidence,
        sample_size: params.sampleSize,
        metadata: params.metadata,
      },
      { onConflict: 'category' }
    )
    .select()
    .single();

  if (error) throw new Error(`Pattern upsert failed: ${error.message}`);
  return data as LearningPattern;
}

// ── Récupérer les patterns d'apprentissage ─────────────────────

export async function getLearningPatterns(): Promise<LearningPattern[]> {
  const { data, error } = await supabase
    .from('ibrahim_learning_patterns')
    .select('*')
    .order('confidence', { ascending: false });

  if (error) throw new Error(`Patterns fetch failed: ${error.message}`);
  return (data ?? []) as LearningPattern[];
}

// ── Obtenir les préférences de Kouider ─────────────────────────

export async function getKouiderPreferences(): Promise<{
  response_style: 'short' | 'detailed' | 'balanced';
  tone: 'professional' | 'friendly' | 'casual';
  tiktok_styles: Record<string, number>; // style → score
  auto_approve_threshold: number;
}> {
  const patterns = await getLearningPatterns();

  const responsePattern = patterns.find(p => p.category === 'response');
  const tiktokPattern = patterns.find(p => p.category === 'tiktok');

  let responseStyle: 'short' | 'detailed' | 'balanced' = 'balanced';
  if (responsePattern?.metadata?.prefers_short) responseStyle = 'short';
  else if (responsePattern?.metadata?.prefers_long) responseStyle = 'detailed';

  const tiktokStyles: Record<string, number> = {};
  if (tiktokPattern?.metadata?.style_preferences) {
    const stylePrefs = tiktokPattern.metadata.style_preferences as Record<
      string,
      { positive: number; total: number }
    >;
    Object.entries(stylePrefs).forEach(([style, stats]) => {
      tiktokStyles[style] = stats.positive / stats.total;
    });
  }

  return {
    response_style: responseStyle,
    tone: 'friendly', // TODO: analyser le ton
    tiktok_styles: tiktokStyles,
    auto_approve_threshold: 0.8,
  };
}

// ── Statistiques globales de feedback ──────────────────────────

export async function getFeedbackStats(): Promise<{
  total: number;
  positive: number;
  negative: number;
  neutral: number;
  by_type: Record<string, { positive: number; negative: number; neutral: number }>;
}> {
  const { data, error } = await supabase
    .from('ibrahim_feedback')
    .select('rating, action_type');

  if (error) throw new Error(`Stats fetch failed: ${error.message}`);

  const feedbacks = (data ?? []) as { rating: string; action_type: string }[];

  const stats = {
    total: feedbacks.length,
    positive: feedbacks.filter(f => f.rating === 'positive').length,
    negative: feedbacks.filter(f => f.rating === 'negative').length,
    neutral: feedbacks.filter(f => f.rating === 'neutral').length,
    by_type: {} as Record<string, { positive: number; negative: number; neutral: number }>,
  };

  feedbacks.forEach(f => {
    if (!stats.by_type[f.action_type]) {
      stats.by_type[f.action_type] = { positive: 0, negative: 0, neutral: 0 };
    }
    stats.by_type[f.action_type][f.rating as 'positive' | 'negative' | 'neutral']++;
  });

  return stats;
}
