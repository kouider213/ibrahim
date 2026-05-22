import { redis } from '../queue/queue.js';

export interface StoredLocation {
  lat:        number;
  lng:        number;
  city?:      string;
  country:    'Algeria' | 'Belgium' | 'France' | 'Unknown';
  updated_at: string;
}

const LOCATION_TTL = 86400; // 24h

function detectCountry(lat: number, lng: number): StoredLocation['country'] {
  if (lat >= 18 && lat <= 38 && lng >= -9 && lng <= 12)       return 'Algeria';
  if (lat >= 49.5 && lat <= 51.5 && lng >= 2.5 && lng <= 6.5) return 'Belgium';
  if (lat >= 42 && lat <= 51.5 && lng >= -5 && lng <= 10)     return 'France';
  return 'Unknown';
}

async function reverseGeocode(lat: number, lng: number): Promise<string | undefined> {
  const key = process.env['GOOGLE_MAPS_API_KEY'];
  if (!key) return undefined;
  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${key}&language=fr&result_type=locality|administrative_area_level_1`;
    const res  = await fetch(url);
    const json = await res.json() as {
      status: string;
      results: Array<{
        address_components: Array<{ long_name: string; types: string[] }>;
      }>;
    };
    if (json.status !== 'OK' || !json.results[0]) return undefined;
    const comp = json.results[0].address_components.find(
      c => c.types.includes('locality') || c.types.includes('administrative_area_level_1'),
    );
    return comp?.long_name;
  } catch {
    return undefined;
  }
}

export async function storeLocation(actorId: string, lat: number, lng: number): Promise<StoredLocation> {
  const country = detectCountry(lat, lng);
  const city    = await reverseGeocode(lat, lng);
  const loc: StoredLocation = { lat, lng, city, country, updated_at: new Date().toISOString() };
  await redis.setex(`location:${actorId}`, LOCATION_TTL, JSON.stringify(loc));
  return loc;
}

export async function getLocation(actorId: string): Promise<StoredLocation | null> {
  const raw = await redis.get(`location:${actorId}`);
  if (!raw) return null;
  try { return JSON.parse(raw) as StoredLocation; } catch { return null; }
}

export function formatLocationCtx(loc: StoredLocation): string {
  const age = Math.round((Date.now() - new Date(loc.updated_at).getTime()) / 60000);
  const city = loc.city ?? loc.country;
  return `Position actuelle: ${city} (${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)}) — mis à jour il y a ${age} min`;
}
