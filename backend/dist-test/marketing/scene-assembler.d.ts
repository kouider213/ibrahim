/**
 * scene-assembler.ts
 * ──────────────────────────────────────────────────────────────────────────────
 * Multi-scene video assembly engine for Fik Conciergerie marketing videos.
 *
 * Car scenes  → Runway Gen-4 Turbo / Kling 1.6 (photorealistic AI video)
 * UI scenes   → FFmpeg synthetic  (phone, WhatsApp, TikTok, CTA)
 *               Instant generation, text always readable, zero AI cost.
 * Assembly    → FFmpeg concat + text overlays + voice + optional music
 * ──────────────────────────────────────────────────────────────────────────────
 */
export type SceneType = 'car_reveal' | 'car_drive' | 'car_airport' | 'ui_phone_search' | 'ui_whatsapp' | 'ui_tiktok' | 'ui_problem' | 'ui_cta';
export interface SceneSpec {
    type: SceneType;
    label: string;
    duration: number;
    overlayText?: string;
    prompt?: string;
    ui_title?: string;
    ui_lines?: string[];
    ui_color?: string;
}
export declare function ensureSceneFont(): Promise<string | null>;
export declare function generateUISceneFile(spec: SceneSpec, outPath: string, fontPath: string | null): Promise<void>;
export declare function addOverlayToClip(inputBuffer: Buffer, overlayText: string, fontPath: string | null): Promise<Buffer>;
export declare function concatScenesWithVoice(scenePaths: string[], voiceBuffer: Buffer | null, tmpDir: string): Promise<Buffer>;
//# sourceMappingURL=scene-assembler.d.ts.map