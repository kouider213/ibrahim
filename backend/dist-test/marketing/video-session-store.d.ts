export interface VideoSession {
    id: string;
    carName: string;
    carImageUrl: string | null;
    carId?: string;
    script: string;
    videoBuffer: Buffer | null;
    audioBuffer: Buffer | null;
    prompt: string;
    provider: string;
    background: string;
    scenario: string;
    caption: string;
    hashtags: string[];
    pendingId: string;
    createdAt: string;
}
export declare function saveVideoSession(session: Omit<VideoSession, 'id' | 'createdAt'>): VideoSession;
export declare function getLatestVideoSession(): VideoSession | null;
export declare function getVideoSessionById(id: string): VideoSession | null;
//# sourceMappingURL=video-session-store.d.ts.map