/**
 * PHASE 15 — Recherche d'images (Pexels API)
 * Permet à Dzaryx de chercher des images sur internet et les afficher
 */
export interface PexelsPhoto {
    id: number;
    url: string;
    photographer: string;
    photographer_url: string;
    src: {
        original: string;
        large2x: string;
        large: string;
        medium: string;
        small: string;
        portrait: string;
        landscape: string;
        tiny: string;
    };
    alt: string;
    width: number;
    height: number;
}
export interface ImageSearchResult {
    photos: PexelsPhoto[];
    total_results: number;
    query: string;
}
export declare function searchImages(query: string, count?: number, orientation?: 'landscape' | 'portrait' | 'square'): Promise<ImageSearchResult>;
export declare function formatImageResults(result: ImageSearchResult): string;
//# sourceMappingURL=image-search.d.ts.map