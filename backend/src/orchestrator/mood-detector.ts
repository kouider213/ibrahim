import { supabase } from '../integrations/supabase.js';

export type Mood = 'normal' | 'stressed' | 'angry' | 'happy' | 'tired' | 'rushed' | 'anxious' | 'focused';
export type DzaryxTone = 'normal' | 'soft' | 'direct' | 'motivational' | 'silent';

export interface MoodResult {
  mood:       Mood;
  intensity:  number;   // 1-5
  signals:    string[];
  tone:       DzaryxTone;
  advice:     string;   // conseil injecté dans system prompt
}

// ── Signaux linguistiques ────────────────────────────────────────────────────

const STRESS_SIGNALS = [
  { re: /urgent|vite|rapide|asap|maintenant|tout\s+de\s+suite/i,   signal: 'urgence_exprimée' },
  { re: /merde|putain|bordel|wlah|mlh|sah\s+sah/i,                 signal: 'juron' },
  { re: /stressé|stressante|je\s+pète|j'en\s+peux\s+plus/i,        signal: 'stress_explicite' },
  { re: /!!+/,                                                       signal: 'exclamations_multiples' },
  { re: /\?\?\?+/,                                                   signal: 'questions_multiples' },
];

const ANGER_SIGNALS = [
  { re: /c'est\s+nul|nul|catastrophe|honte|inacceptable|c'est\s+quoi\s+ça/i, signal: 'insatisfaction' },
  { re: /[A-ZÀÂÉÈÊËÎÏÔÙÛÜ]{4,}/,                                              signal: 'majuscules' },
  { re: /toujours\s+pareil|encore\s+une\s+fois|ça\s+recommence/i,             signal: 'répétition_problème' },
  { re: /j'en\s+ai\s+marre|ras\s+le\s+bol|fed\s+up/i,                        signal: 'ras_le_bol' },
];

const HAPPY_SIGNALS = [
  { re: /super|parfait|excellent|génial|top|nickel|au\s+top|impeccable/i, signal: 'satisfaction' },
  { re: /merci\s+beaucoup|vraiment\s+merci|chapeau/i,                     signal: 'gratitude_forte' },
  { re: /😊|😄|🎉|👍|🔥|💪|✅/u,                                          signal: 'emoji_positif' },
  { re: /j'adore|je\s+kiffe|c'est\s+bon|wallah\s+bien/i,                 signal: 'enthousiasme' },
];

const TIRED_SIGNALS = [
  { re: /fatigué|crevé|épuisé|j'ai\s+pas\s+dormi|insomnie/i,  signal: 'fatigue_explicite' },
  { re: /flemme|pas\s+le\s+courage|plus\s+d'énergie/i,         signal: 'manque_energie' },
];

const RUSHED_SIGNALS = [
  { re: /ok|oui|non|ouais|nope|yep/i, signal: 'réponse_ultra_courte' },
];

const ANXIOUS_SIGNALS = [
  { re: /je\s+sais\s+pas|incertain|pas\s+sûr|ça\s+m'inquiète|j'ai\s+peur/i, signal: 'incertitude' },
  { re: /et\s+si|au\s+cas\s+où|risque|danger|problème/i,                      signal: 'anticipation_négative' },
];

// ── Signaux contextuels ──────────────────────────────────────────────────────

function getHourSignals(hour: number): string[] {
  if (hour >= 0 && hour < 6)  return ['heure_nuit'];
  if (hour >= 22)             return ['heure_tardive'];
  if (hour >= 6 && hour < 8)  return ['heure_tôt'];
  return [];
}

function getLengthSignals(text: string): string[] {
  const words = text.trim().split(/\s+/).length;
  if (words <= 3) return ['message_très_court'];
  if (words <= 8) return ['message_court'];
  return [];
}

function getTypoSignals(text: string): string[] {
  // Beaucoup de fautes = écrit vite = rushed
  const words = text.toLowerCase().split(/\s+/);
  const suspectRatio = words.filter(w =>
    w.length > 4 && /[aeiou]{3,}|[bcdfghjklmnpqrstvwxyz]{4,}/i.test(w)
  ).length / Math.max(words.length, 1);
  return suspectRatio > 0.3 ? ['nombreuses_fautes'] : [];
}

// ── Score par humeur ─────────────────────────────────────────────────────────

function scoreSignals(text: string, patterns: Array<{ re: RegExp; signal: string }>): string[] {
  return patterns.filter(p => p.re.test(text)).map(p => p.signal);
}

// ── Tone recommandé selon humeur ─────────────────────────────────────────────

function recommendTone(mood: Mood, intensity: number): DzaryxTone {
  if (mood === 'angry'   && intensity >= 3) return 'soft';
  if (mood === 'stressed' && intensity >= 3) return 'direct';
  if (mood === 'tired')                      return 'soft';
  if (mood === 'anxious')                    return 'soft';
  if (mood === 'rushed')                     return 'direct';
  if (mood === 'happy')                      return 'motivational';
  return 'normal';
}

// ── Conseil pour system prompt ────────────────────────────────────────────────

function buildAdvice(mood: Mood, intensity: number, _signals: string[]): string {
  if (mood === 'angry' && intensity >= 4) {
    return 'HUMEUR: Kouider semble énervé. Sois très calme, concis, pas de blabla. Si une décision importante est en jeu, suggère d\'attendre avant d\'agir.';
  }
  if (mood === 'stressed' && intensity >= 3) {
    return 'HUMEUR: Kouider est stressé. Va droit au but, solutions concrètes seulement. Pas de questions inutiles. Si décision irréversible → rappelle d\'attendre.';
  }
  if (mood === 'tired') {
    return 'HUMEUR: Kouider est fatigué. Réponses très courtes. Propose de remettre à demain si non urgent.';
  }
  if (mood === 'rushed') {
    return 'HUMEUR: Kouider est pressé. Réponse en 1-2 phrases max. Essentiel seulement.';
  }
  if (mood === 'anxious') {
    return 'HUMEUR: Kouider est anxieux. Sois rassurant, donne des faits concrets. Pas de "peut-être" ni "ça dépend".';
  }
  if (mood === 'happy') {
    return 'HUMEUR: Kouider est de bonne humeur. Ton énergique, profites-en pour lui glisser une info business positive si pertinente.';
  }
  return '';
}

// ── Détecteur principal ──────────────────────────────────────────────────────

export function detectMood(text: string, hourBruxelles?: number): MoodResult {
  const hour = hourBruxelles ?? new Date().getHours();
  const signals: string[] = [
    ...getHourSignals(hour),
    ...getLengthSignals(text),
    ...getTypoSignals(text),
  ];

  const stressSignals  = scoreSignals(text, STRESS_SIGNALS);
  const angerSignals   = scoreSignals(text, ANGER_SIGNALS);
  const happySignals   = scoreSignals(text, HAPPY_SIGNALS);
  const tiredSignals   = scoreSignals(text, TIRED_SIGNALS);
  const rushedSignals  = scoreSignals(text, RUSHED_SIGNALS);
  const anxiousSignals = scoreSignals(text, ANXIOUS_SIGNALS);

  signals.push(...stressSignals, ...angerSignals, ...happySignals, ...tiredSignals, ...rushedSignals, ...anxiousSignals);

  // Scores
  let angerScore   = angerSignals.length * 2 + (signals.includes('majuscules') ? 3 : 0);
  let stressScore  = stressSignals.length * 2 + (signals.includes('heure_tardive') ? 1 : 0) + (signals.includes('heure_nuit') ? 2 : 0);
  let happyScore   = happySignals.length * 2;
  let tiredScore   = tiredSignals.length * 2 + (signals.includes('heure_nuit') ? 2 : 0) + (signals.includes('heure_tardive') ? 1 : 0);
  let rushedScore  = (signals.includes('message_très_court') ? 2 : 0) + (signals.includes('nombreuses_fautes') ? 1 : 0);
  let anxiousScore = anxiousSignals.length * 2;

  const scores: Record<Mood, number> = {
    angry:   angerScore,
    stressed: stressScore,
    happy:   happyScore,
    tired:   tiredScore,
    rushed:  rushedScore,
    anxious: anxiousScore,
    focused: 0,
    normal:  0,
  };

  const topMood = (Object.entries(scores) as [Mood, number][])
    .sort((a, b) => b[1] - a[1])[0];

  const mood      = topMood[1] >= 2 ? topMood[0] : 'normal';
  const intensity = Math.min(5, Math.max(1, Math.round(topMood[1])));
  const tone      = recommendTone(mood, intensity);
  const advice    = buildAdvice(mood, intensity, signals);

  return { mood, intensity, signals, tone, advice };
}

// ── Persistance en base ──────────────────────────────────────────────────────

export async function saveMoodSession(
  sessionId: string,
  result:    MoodResult,
  rawText:   string,
  userId     = 'kouider',
): Promise<void> {
  try {
    await supabase.from('mood_sessions').insert({
      user_id:     userId,
      session_id:  sessionId,
      mood:        result.mood,
      intensity:   result.intensity,
      signals:     result.signals,
      raw_message: rawText.slice(0, 50),
      dzaryx_tone: result.tone,
    });
  } catch {
    // non-bloquant
  }
}

// ── Humeur récente (dernières 2h) pour contexte proactif ────────────────────

export async function getRecentMood(userId = 'kouider'): Promise<MoodResult | null> {
  try {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from('mood_sessions')
      .select('mood, intensity, signals, dzaryx_tone')
      .eq('user_id', userId)
      .gte('created_at', twoHoursAgo)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!data) return null;
    const d = data as { mood: Mood; intensity: number; signals: string[]; dzaryx_tone: DzaryxTone };
    return {
      mood:      d.mood,
      intensity: d.intensity,
      signals:   d.signals,
      tone:      d.dzaryx_tone,
      advice:    buildAdvice(d.mood, d.intensity, d.signals),
    };
  } catch {
    return null;
  }
}
