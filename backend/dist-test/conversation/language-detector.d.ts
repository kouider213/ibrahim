export type DetectedLanguage = 'fr' | 'ar' | 'darija' | 'en' | 'fr+darija' | 'unknown';
export interface LanguageDetection {
    lang: DetectedLanguage;
    label: string;
    systemHint: string;
}
export declare function detectLanguage(text: string): LanguageDetection;
//# sourceMappingURL=language-detector.d.ts.map