/**
 * PHASE 15 — Recherche d'images (Pexels API)
 * Permet à Dzaryx de chercher des images sur internet et les afficher
 */

import axios from 'axios';
import { env } from '../config/env.js';

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

export async function searchImages(
  query: string,
  count: number = 4,
  orientation?: 'landscape' | 'portrait' | 'square',
): Promise<ImageSearchResult> {
  const apiKey = env.PEXELS_API_KEY;

  if (!apiKey) {
    throw new Error('PEXELS_API_KEY non configurée dans les variables d\'environnement Railway.');
  }

  const params: Record<string, string | number> = {
    query,
    per_page: Math.min(count, 10),
    locale: 'fr-FR',
  };

  if (orientation) {
    params['orientation'] = orientation;
  }

  const { data } = await axios.get('https://api.pexels.com/v1/search', {
    headers: {
      Authorization: apiKey,
    },
    params,
    timeout: 10_000,
  });

  return {
    photos: data.photos as PexelsPhoto[],
    total_results: data.total_results,
    query,
  };
}

export function formatImageResults(result: ImageSearchResult): string {
  if (!result.photos || result.photos.length === 0) {
    return `❌ Aucune image trouvée pour "${result.query}".`;
  }

  const lines = result.photos.map((photo, i) => {
    return `**Image ${i + 1}** — par ${photo.photographer}
🖼️ ${photo.src.large}
📐 ${photo.width}×${photo.height}px
🔗 Pexels: ${photo.url}`;
  });

  return `🔍 **${result.photos.length} image(s) trouvée(s) pour "${result.query}"** (${result.total_results} total)\n\n${lines.join('\n\n')}`;
}
