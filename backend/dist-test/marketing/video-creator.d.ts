import type { VideoIdea } from './market-research.js';
import type { Car } from '../integrations/supabase.js';
export interface VideoResult {
    buffer: Buffer;
    caption: string;
    hashtags: string[];
    car_name: string;
    script: string;
}
export interface VideoOptions {
    customScript?: string;
    backgroundEffect?: string;
}
export declare function createMarketingVideo(car: Car, idea: VideoIdea, options?: VideoOptions): Promise<VideoResult>;
export declare function mergeVideos(videoBuffers: Buffer[]): Promise<Buffer>;
//# sourceMappingURL=video-creator.d.ts.map