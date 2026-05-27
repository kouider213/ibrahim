import type { Car } from '../integrations/supabase.js';
export interface VideoIdea {
    title: string;
    concept: string;
    voiceover_script: string;
    caption: string;
    hashtags: string[];
    best_time: string;
    car_suggestion?: string;
    data_basis: 'real_tiktok' | 'no_data';
}
export interface MarketResearchReport {
    week: string;
    scraped_at: string;
    data_quality: 'real' | 'partial' | 'no_data';
    data_source: string;
    real_metrics: {
        videos_analyzed: number;
        avg_engagement_pct: number | null;
        top_hashtags: Array<{
            tag: string;
            avgViews: number;
            count: number;
        }>;
        top_authors: Array<{
            handle: string;
            totalViews: number;
            followers: number | null;
        }>;
    } | null;
    trends: string[];
    top_ideas: VideoIdea[];
    summary: string;
    raw_json: string;
}
export declare function runTikTokMarketResearch(cars: Car[], carFocus?: string, extraHashtags?: string[]): Promise<MarketResearchReport>;
//# sourceMappingURL=market-research.d.ts.map