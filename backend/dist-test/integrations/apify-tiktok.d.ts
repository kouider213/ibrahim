export interface TikTokVideo {
    id: string;
    author: string;
    authorFollowers: number | null;
    description: string;
    hashtags: string[];
    views: number | null;
    likes: number | null;
    comments: number | null;
    shares: number | null;
    publishedAt: string | null;
    engagementRate: number | null;
}
export interface TikTokRealData {
    source: 'apify' | 'unavailable';
    scrapedAt: string;
    hashtags: string[];
    profiles: string[];
    videos: TikTokVideo[];
    topHashtags: Array<{
        tag: string;
        avgViews: number;
        count: number;
    }>;
    topAuthors: Array<{
        handle: string;
        followers: number | null;
        totalViews: number;
        videoCount: number;
    }>;
    avgEngagement: number | null;
    error?: string;
}
export declare function apifyRun(actorId: string, input: Record<string, unknown>): Promise<unknown[]>;
export declare function parseVideo(raw: unknown): TikTokVideo;
export declare function scrapeTikTokForOranCars(carFocus?: string, extraHashtags?: string[]): Promise<TikTokRealData>;
export declare function formatTikTokDataForReport(data: TikTokRealData): string;
export declare function serializeTikTokData(data: TikTokRealData): string;
//# sourceMappingURL=apify-tiktok.d.ts.map