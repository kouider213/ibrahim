/**
 * PHASE 13 — APPRENTISSAGE CONTINU Dzaryx
 * Handlers pour feedback, amélioration, et calibration automatique
 */
export declare function recordFeedback(args: {
    action_type: string;
    rating: 'positive' | 'negative' | 'neutral';
    action_id?: string;
    comment?: string;
    context?: string;
}): Promise<{
    success: boolean;
    feedback_id: any;
    message: string;
    error?: undefined;
} | {
    success: boolean;
    error: any;
    feedback_id?: undefined;
    message?: undefined;
}>;
export declare function getMonthlyImprovementReport(args?: {
    year?: number;
    month?: number;
}): Promise<{
    success: boolean;
    period: string;
    summary: {
        total_feedbacks: number;
        positive: number;
        negative: number;
        neutral: number;
        satisfaction_rate: string;
    };
    by_action_type: Record<string, {
        positive: number;
        negative: number;
        neutral: number;
    }>;
    rules_learned: number;
    new_rules: any[];
    negative_patterns: any[];
    recommendations: string[];
    error?: undefined;
} | {
    success: boolean;
    error: any;
    period?: undefined;
    summary?: undefined;
    by_action_type?: undefined;
    rules_learned?: undefined;
    new_rules?: undefined;
    negative_patterns?: undefined;
    recommendations?: undefined;
}>;
export declare function getLearningEvolution(args?: {
    months?: number;
}): Promise<{
    success: boolean;
    period: string;
    evolution: {
        month: string;
        total_feedbacks: number;
        positive: number;
        negative: number;
        satisfaction_rate: number;
    }[];
    trend: string;
    total_feedbacks: number;
    avg_satisfaction: number;
    error?: undefined;
} | {
    success: boolean;
    error: any;
    period?: undefined;
    evolution?: undefined;
    trend?: undefined;
    total_feedbacks?: undefined;
    avg_satisfaction?: undefined;
}>;
export declare function getKouiderPreferences(): Promise<{
    success: boolean;
    preferences: {
        response_style: string;
        tone_preference: string;
        tiktok_favorites: string[];
        booking_preferences: any;
    };
    total_feedbacks_analyzed: number;
    last_calibration: string;
    error?: undefined;
} | {
    success: boolean;
    error: any;
    preferences?: undefined;
    total_feedbacks_analyzed?: undefined;
    last_calibration?: undefined;
}>;
import type { ActionPayload, ActionResult } from '../executor.js';
export declare function handleLearning(payload: ActionPayload): Promise<ActionResult>;
//# sourceMappingURL=learning.d.ts.map