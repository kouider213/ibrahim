import type { SceneSpec } from './scene-assembler.js';
export interface VideoProject {
    id: string;
    title: string;
    scenario: string;
    carName: string;
    carImageUrl: string | null;
    carId?: string;
    voiceScript: string;
    scenes: SceneSpec[];
    hashtags: string[];
    caption: string;
    style: string;
    pendingId: string;
    finalBuffer: Buffer | null;
    audioBuffer: Buffer | null;
    provider: string;
    version: number;
    createdAt: string;
}
export declare function saveVideoProject(project: Omit<VideoProject, 'id' | 'createdAt'>): VideoProject;
export declare function getLatestVideoProject(): VideoProject | null;
export declare function updateVideoProject(id: string, patch: Partial<Pick<VideoProject, 'finalBuffer' | 'audioBuffer' | 'scenes' | 'version' | 'pendingId' | 'provider'>>): void;
interface Storyboard {
    title: string;
    voiceScript: string;
    scenes: SceneSpec[];
    hashtags: string[];
}
export declare function buildClientSearchStoryboard(carName: string, priceDisplay: string, whatsappNumber?: string): Storyboard;
export declare function buildAirportArrivalStoryboard(carName: string, priceDisplay: string, whatsappNumber?: string): Storyboard;
export declare function buildFleetRevealStoryboard(carName: string, priceDisplay: string): Storyboard;
export declare function buildCornicheDriveStoryboard(carName: string, priceDisplay: string): Storyboard;
export {};
//# sourceMappingURL=video-project-store.d.ts.map