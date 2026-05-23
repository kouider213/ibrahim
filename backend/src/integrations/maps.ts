
export interface TravelTimeResult {
  travel_time_minutes: number;
  distance_km: number;
  traffic: 'light' | 'normal' | 'heavy' | 'unknown';
  recommended_departure: string;
  waze_link: string;
  maps_link: string;
  destination_label: string;
  origin_lat: number;
  origin_lng: number;
  dest_lat: number;
  dest_lng: number;
  error?: string;
}

// Known landmarks in Oran area for name→coords resolution
const ORAN_LANDMARKS: Record<string, { lat: number; lng: number; label: string }> = {
  'douba':             { lat: 35.6769, lng: -0.6654, label: 'Douba Groupe, Haï Badr, Oran' },
  'agence':            { lat: 35.6769, lng: -0.6654, label: 'Douba Groupe, Haï Badr, Oran' },
  'hay badr':          { lat: 35.6769, lng: -0.6654, label: 'Haï Badr, Oran' },
  'haï badr':          { lat: 35.6769, lng: -0.6654, label: 'Haï Badr, Oran' },
  'hai badr':          { lat: 35.6769, lng: -0.6654, label: 'Haï Badr, Oran' },
  'aéroport':          { lat: 35.6235, lng: -0.6212, label: 'Aéroport Ahmed Ben Bella' },
  'aeroport':          { lat: 35.6235, lng: -0.6212, label: 'Aéroport Ahmed Ben Bella' },
  'airport':           { lat: 35.6235, lng: -0.6212, label: 'Aéroport Ahmed Ben Bella' },
  'ahmed ben bella':   { lat: 35.6235, lng: -0.6212, label: 'Aéroport Ahmed Ben Bella' },
  'centre':            { lat: 35.6969, lng: -0.6308, label: 'Centre-ville Oran' },
  'centre-ville':      { lat: 35.6969, lng: -0.6308, label: 'Centre-ville Oran' },
  'port':              { lat: 35.7062, lng: -0.6218, label: 'Port d\'Oran' },
  'gare':              { lat: 35.7000, lng: -0.6361, label: 'Gare ferroviaire Oran' },
  'université':        { lat: 35.6906, lng: -0.6406, label: 'Université Oran 1' },
  'usto':              { lat: 35.6717, lng: -0.6247, label: 'USTO Oran' },
  'bir el djir':       { lat: 35.7248, lng: -0.5423, label: 'Bir El Djir' },
  'es senia':          { lat: 35.6459, lng: -0.6050, label: 'Es Sénia' },
  'arzew':             { lat: 35.8342, lng: -0.3189, label: 'Arzew' },
  'ain turk':          { lat: 35.7444, lng: -0.7678, label: 'Aïn Türck' },
  'belgique':          { lat: 50.8503, lng: 4.3517,  label: 'Belgique (Bruxelles)' },
  'bruxelles':         { lat: 50.8503, lng: 4.3517,  label: 'Bruxelles' },
};

async function geocodeAddress(address: string, apiKey: string): Promise<{ lat: number; lng: number; label: string } | null> {
  // Use address as-is — do NOT append country context (breaks international addresses like Brussels)
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json() as {
      status: string;
      results: Array<{ geometry: { location: { lat: number; lng: number } }; formatted_address: string }>;
    };
    if (data.status !== 'OK' || !data.results[0]) return null;
    const loc = data.results[0].geometry.location;
    return { lat: loc.lat, lng: loc.lng, label: data.results[0].formatted_address };
  } catch {
    return null;
  }
}

async function resolveDestination(destination: string, apiKey?: string): Promise<{ lat: number; lng: number; label: string } | null> {
  // 1. Fast local lookup first
  const lower = destination.toLowerCase().trim();
  for (const [key, coords] of Object.entries(ORAN_LANDMARKS)) {
    if (lower.includes(key)) return coords;
  }
  // 2. Geocoding API fallback for any address
  if (apiKey) return geocodeAddress(destination, apiKey);
  return null;
}

function buildWazeLink(lat: number, lng: number): string {
  return `https://waze.com/ul?ll=${lat},${lng}&navigate=yes&zoom=17`;
}

function buildMapsLink(lat: number, lng: number, _label: string): string {
  return `https://maps.google.com/?daddr=${lat},${lng}&directionsmode=driving&travelmode=driving`;
}

function trafficLabel(ratio: number): 'light' | 'normal' | 'heavy' {
  if (ratio < 1.15) return 'light';
  if (ratio < 1.4)  return 'normal';
  return 'heavy';
}

export async function getTravelTime(
  originLat: number,
  originLng: number,
  destination: string,
  arrivalTime?: string, // "HH:MM"
): Promise<TravelTimeResult> {
  const key = process.env['GOOGLE_MAPS_API_KEY'];
  const dest = await resolveDestination(destination, key ?? undefined);
  if (!dest) {
    return {
      travel_time_minutes: 0,
      distance_km: 0,
      traffic: 'unknown',
      recommended_departure: 'Destination non reconnue',
      waze_link: `https://waze.com/ul?q=${encodeURIComponent(destination)}&navigate=yes`,
      maps_link: `https://maps.google.com/?daddr=${encodeURIComponent(destination)}&directionsmode=driving`,
      destination_label: destination,
      origin_lat: originLat,
      origin_lng: originLng,
      dest_lat: 0,
      dest_lng: 0,
      error: `Destination "${destination}" non reconnue — essaie avec "aéroport", "centre-ville", ou une adresse précise`,
    };
  }

  if (!key) {
    // Fallback: straight-line distance → rough estimate (60 km/h avg in Oran)
    const R = 6371;
    const dLat = (dest.lat - originLat) * Math.PI / 180;
    const dLng = (dest.lng - originLng) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(originLat * Math.PI / 180) * Math.cos(dest.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    const distKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const roughMinutes = Math.round((distKm / 40) * 60); // 40 km/h avg urban

    let departure = 'maintenant';
    if (arrivalTime) {
      const [h, m] = arrivalTime.split(':').map(Number);
      const arrivalMinutes = h * 60 + m;
      const depMinutes = arrivalMinutes - roughMinutes - 5;
      const dh = Math.floor(depMinutes / 60) % 24;
      const dm = depMinutes % 60;
      departure = `${String(dh).padStart(2, '0')}h${String(dm).padStart(2, '0')} (estimation — Google Maps API non configurée)`;
    }

    return {
      travel_time_minutes: roughMinutes,
      distance_km: Math.round(distKm * 10) / 10,
      traffic: 'unknown',
      recommended_departure: departure,
      waze_link: buildWazeLink(dest.lat, dest.lng),
      maps_link: buildMapsLink(dest.lat, dest.lng, dest.label),
      destination_label: dest.label,
      origin_lat: originLat,
      origin_lng: originLng,
      dest_lat: dest.lat,
      dest_lng: dest.lng,
      error: 'GOOGLE_MAPS_API_KEY manquant — estimation basée sur distance à vol d\'oiseau (±20%)',
    };
  }

  // Google Maps Distance Matrix API with real traffic
  const departureTime = 'now'; // real-time traffic
  const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${originLat},${originLng}&destinations=${dest.lat},${dest.lng}&departure_time=${departureTime}&traffic_model=best_guess&key=${key}`;

  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Google Maps API error: ${resp.status}`);

  const data = await resp.json() as {
    rows: Array<{
      elements: Array<{
        status: string;
        duration: { value: number };
        duration_in_traffic: { value: number };
        distance: { value: number };
      }>;
    }>;
  };

  const el = data.rows[0]?.elements[0];
  if (!el || el.status !== 'OK') {
    // Fallback to straight-line estimate if API returns non-OK (REQUEST_DENIED, ZERO_RESULTS, etc.)
    const R = 6371;
    const dLat = (dest.lat - originLat) * Math.PI / 180;
    const dLng = (dest.lng - originLng) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(originLat * Math.PI / 180) * Math.cos(dest.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    const distKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return {
      travel_time_minutes: Math.round((distKm / 40) * 60),
      distance_km: Math.round(distKm * 10) / 10,
      traffic: 'unknown',
      recommended_departure: 'maintenant',
      waze_link: buildWazeLink(dest.lat, dest.lng),
      maps_link: buildMapsLink(dest.lat, dest.lng, dest.label),
      destination_label: dest.label,
      origin_lat: originLat, origin_lng: originLng,
      dest_lat: dest.lat, dest_lng: dest.lng,
      error: `Google Maps: ${el?.status ?? 'no result'} — estimation vol d'oiseau`,
    };
  }

  const travelSeconds = el.duration_in_traffic?.value ?? el.duration.value;
  const baseSeconds   = el.duration.value;
  const travelMinutes = Math.ceil(travelSeconds / 60);
  const distKm        = Math.round(el.distance.value / 100) / 10;
  const ratio         = travelSeconds / baseSeconds;
  const traffic       = trafficLabel(ratio);

  let departure = 'maintenant';
  if (arrivalTime) {
    const [h, m] = arrivalTime.split(':').map(Number);
    const arrivalMinutes = h * 60 + m;
    const depMinutes     = arrivalMinutes - travelMinutes - 5; // 5min marge
    const dh = Math.floor(depMinutes / 60) % 24;
    const dm = ((depMinutes % 60) + 60) % 60;
    const trafficNote = traffic === 'heavy' ? ' ⚠️ trafic dense' : traffic === 'light' ? ' ✅ trafic fluide' : '';
    departure = `${String(dh).padStart(2, '0')}h${String(dm).padStart(2, '0')}${trafficNote}`;
  }

  return {
    travel_time_minutes: travelMinutes,
    distance_km: distKm,
    traffic,
    recommended_departure: departure,
    waze_link: buildWazeLink(dest.lat, dest.lng),
    maps_link: buildMapsLink(dest.lat, dest.lng, dest.label),
    destination_label: dest.label,
    origin_lat: originLat,
    origin_lng: originLng,
    dest_lat: dest.lat,
    dest_lng: dest.lng,
  };
}
