export interface PostingWindow {
    day: string;
    time: string;
    score: number;
    reason: string;
}
export interface TikTokIdea {
    title: string;
    hook: string;
    concept: string;
    hashtags: string[];
    virality_score: number;
    best_time: string;
}
export interface TikTokIntelligence {
    best_posting_windows: PostingWindow[];
    ideas: TikTokIdea[];
    apify_available: boolean;
    generated_at: string;
}
export declare function getTikTokIntelligence(carName?: string): Promise<TikTokIntelligence>;
export declare function generateViralHook(carName: string, style?: 'lifestyle' | 'prix' | 'temoignage'): Promise<string>;
//# sourceMappingURL=tiktok-intelligence.d.ts.map