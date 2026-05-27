export interface PendingVideo {
    id: string;
    video_url: string;
    caption: string;
    hashtags: string[];
    car_name: string;
    car_id?: string;
    script: string;
    created_at: string;
    status: 'pending' | 'approved' | 'rejected';
}
export declare function savePendingVideo(video: Omit<PendingVideo, 'id' | 'created_at' | 'status'>): Promise<string>;
export declare function getLatestPendingVideo(): PendingVideo | null;
export declare function getPendingVideoById(id: string): PendingVideo | null;
export declare function approveVideo(id: string): PendingVideo | null;
export declare function rejectVideo(id: string): void;
//# sourceMappingURL=approval-store.d.ts.map