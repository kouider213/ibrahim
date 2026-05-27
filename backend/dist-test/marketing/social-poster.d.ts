import type { PendingVideo } from './approval-store.js';
export interface PostResult {
    platform: string;
    success: boolean;
    post_id?: string;
    url?: string;
    message: string;
}
export declare function buildSharePackage(video: PendingVideo): string;
export declare function publishVideo(video: PendingVideo): Promise<PostResult>;
//# sourceMappingURL=social-poster.d.ts.map