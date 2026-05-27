export interface Feedback {
    id: string;
    session_id: string;
    action_type: string;
    action_id?: string;
    rating: 'positive' | 'negative' | 'neutral';
    comment?: string;
    context: Record<string, unknown>;
    created_at: string;
}
export interface LearningPattern {
    id: string;
    category: string;
    pattern: string;
    confidence: number;
    sample_size: number;
    metadata: Record<string, unknown>;
    updated_at: string;
}
export declare function recordFeedback(params: {
    sessionId: string;
    actionType: string;
    actionId?: string;
    rating: 'positive' | 'negative' | 'neutral';
    comment?: string;
    context?: Record<string, unknown>;
}): Promise<Feedback>;
export declare function getFeedbackForAction(actionId: string): Promise<Feedback[]>;
export declare function getFeedbackByType(actionType: string, limit?: number): Promise<Feedback[]>;
export declare function analyzeFeedbackPattern(actionType: string): Promise<void>;
export declare function upsertLearningPattern(params: {
    category: string;
    pattern: string;
    confidence: number;
    sampleSize: number;
    metadata: Record<string, unknown>;
}): Promise<LearningPattern>;
export declare function getLearningPatterns(): Promise<LearningPattern[]>;
export declare function getKouiderPreferences(): Promise<{
    response_style: 'short' | 'detailed' | 'balanced';
    tone: 'professional' | 'friendly' | 'casual';
    tiktok_styles: Record<string, number>;
    auto_approve_threshold: number;
}>;
export declare function getFeedbackStats(): Promise<{
    total: number;
    positive: number;
    negative: number;
    neutral: number;
    by_type: Record<string, {
        positive: number;
        negative: number;
        neutral: number;
    }>;
}>;
//# sourceMappingURL=feedback-system.d.ts.map