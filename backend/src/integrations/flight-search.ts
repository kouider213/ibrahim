/**
 * flight-search.ts
 * Recherche de billets d'avion via Amadeus API
 * Départs: Bruxelles (BRU), Paris (CDG/ORY), Lille (LIL)
 * Destination: Oran (ORN)
 */

import axios from 'axios';

const AMADEUS_CLIENT_ID     = process.env['AMADEUS_CLIENT_ID'] ?? '';
const AMADEUS_CLIENT_SECRET = process.env['AMADEUS_CLIENT_SECRET'] ?? '';
const AMADEUS_BASE_URL      = 'https://test.api.amadeus.com'; // sandbox → production: api.amadeus.com

export interface FlightOffer {
  id:             string;
  origin:         string;
  destination:    string;
  departureDate:  string;
  returnDate:     string;
  price:          number;
  currency:       string;
  airline:        string;
  availableSeats: number;
  duration:       string;
  stops:          number;
  deepLink:       string;
}

export interface FlightSearchParams {
  origins:        string[];   // ['BRU', 'CDG', 'ORY', 'LIL']
  destination:    string;     // 'ORN'
  departureDates: string[];   // semaine du 10 juillet
  returnDates:    string[];   // jusqu'au 24 août max
  adults:         number;
  children:       number;
  infants:        number;
  maxPrice:       number;
  currency:       string;
}

// ── Token Amadeus (expire toutes les 30 min) ──────────────────
let amadeusToken: string | null = null;
let tokenExpiry:  number        = 0;

async function getAmadeusToken(): Promise<string> {
  if (amadeusToken && Date.now() < tokenExpiry) return amadeusToken;

  if (!AMADEUS_CLIENT_ID || !AMADEUS_CLIENT_SECRET) {
    throw new Error('AMADEUS_CLIENT_ID ou AMADEUS_CLIENT_SECRET non configuré');
  }

  const { data } = await axios.post(
    `${AMADEUS_BASE_URL}/v1/security/oauth2/token`,
    new URLSearchParams({
      grant_type:    'client_credentials',
      client_id:     AMADEUS_CLIENT_ID,
      client_secret: AMADEUS_CLIENT_SECRET,
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
  );

  amadeusToken = (data as { access_token: string }).access_token;
  tokenExpiry  = Date.now() + ((data as { expires_in: number }).expires_in - 60) * 1000;
  return amadeusToken!;
}

// ── Recherche vols ────────────────────────────────────────────
async function searchFlights(
  origin:        string,
  destination:   string,
  departureDate: string,
  returnDate:    string,
  adults:        number,
  children:      number,
  infants:       number,
  maxPrice:      number,
  currency:      string,
): Promise<FlightOffer[]> {
  const token = await getAmadeusToken();

  const params: Record<string, string | number> = {
    originLocationCode:      origin,
    destinationLocationCode: destination,
    departureDate,
    returnDate,
    adults,
    infants,
    max:                     10,
    currencyCode:            currency,
    maxPrice,
    includedAirlineCodes:    '',
  };

  if (children > 0) params['children'] = children;

  const { data } = await axios.get(`${AMADEUS_BASE_URL}/v2/shopping/flight-offers`, {
    headers: { Authorization: `Bearer ${token}` },
    params,
  });

  const offers = (data as { data: FlightAmadeusOffer[] }).data ?? [];

  return offers.map(offer => {
    const price    = parseFloat(offer.price.grandTotal);
    const outbound = offer.itineraries[0];
    const inbound  = offer.itineraries[1];
    const seg0     = outbound?.segments[0];
    const lastSeg  = inbound?.segments[inbound.segments.length - 1];

    return {
      id:             offer.id,
      origin,
      destination,
      departureDate,
      returnDate:     lastSeg?.arrival?.at?.slice(0, 10) ?? returnDate,
      price,
      currency,
      airline:        seg0?.carrierCode ?? '?',
      availableSeats: offer.numberOfBookableSeats ?? 0,
      duration:       outbound?.duration ?? '',
      stops:          (outbound?.segments?.length ?? 1) - 1,
      deepLink:       `https://www.amadeus.com`,
    };
  }).filter(o => o.price <= maxPrice);
}

// ── Amadeus types ─────────────────────────────────────────────
interface FlightAmadeusOffer {
  id:                   string;
  price:                { grandTotal: string };
  itineraries:          Array<{
    duration: string;
    segments: Array<{
      carrierCode:  string;
      departure:    { iataCode: string; at: string };
      arrival:      { iataCode: string; at: string };
    }>;
  }>;
  numberOfBookableSeats: number;
}

// ── Génération des dates ──────────────────────────────────────
function generateDepartureDates(): string[] {
  // Semaine du 10 juillet 2026 → du 10 au 17 juillet
  const dates: string[] = [];
  for (let d = 10; d <= 17; d++) {
    dates.push(`2026-07-${String(d).padStart(2, '0')}`);
  }
  return dates;
}

function generateReturnDates(): string[] {
  // Retour entre 20 juillet et 24 août 2026
  const dates: string[] = [];
  // Juillet: 20→31
  for (let d = 20; d <= 31; d++) {
    dates.push(`2026-07-${String(d).padStart(2, '0')}`);
  }
  // Août: 1→24
  for (let d = 1; d <= 24; d++) {
    dates.push(`2026-08-${String(d).padStart(2, '0')}`);
  }
  return dates;
}

// ── Recherche principale ──────────────────────────────────────
export async function searchKouiderFlights(): Promise<FlightOffer[]> {
  const origins      = ['BRU', 'CDG', 'ORY', 'LIL'];
  const destination  = 'ORN';
  const departures   = generateDepartureDates();
  const returns      = generateReturnDates();
  const adults       = 2;
  const children     = 0;
  const infants      = 1;  // bébé -2 ans
  const maxPrice     = 1500;
  const currency     = 'EUR';

  const allOffers: FlightOffer[] = [];
  const errors: string[]         = [];

  // Limiter les combinaisons pour éviter trop d'appels API
  // On prend chaque origine × chaque date de départ × quelques dates de retour représentatives
  const sampleReturns = returns.filter((_, i) => i % 7 === 0); // ~1 retour/semaine

  for (const origin of origins) {
    for (const dep of departures) {
      for (const ret of sampleReturns) {
        // Vérifier que le retour est au moins 3 jours après le départ
        if (ret <= dep) continue;

        try {
          const offers = await searchFlights(
            origin, destination, dep, ret,
            adults, children, infants, maxPrice, currency,
          );
          allOffers.push(...offers);
          // Pause 200ms entre appels pour respecter rate limit
          await new Promise(r => setTimeout(r, 200));
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          errors.push(`${origin}/${dep}→${ret}: ${msg}`);
        }
      }
    }
  }

  if (errors.length > 0) {
    console.warn(`[flight-search] ${errors.length} erreurs:`, errors.slice(0, 5));
  }

  // Dédupliquer et trier par prix
  const seen = new Set<string>();
  const unique = allOffers.filter(o => {
    const key = `${o.origin}-${o.departureDate}-${o.returnDate}-${o.price}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return unique.sort((a, b) => a.price - b.price);
}

// ── Noms lisibles ─────────────────────────────────────────────
export function airportName(code: string): string {
  const map: Record<string, string> = {
    BRU: '🇧🇪 Bruxelles',
    CDG: '🇫🇷 Paris CDG',
    ORY: '🇫🇷 Paris Orly',
    LIL: '🇫🇷 Lille',
    ORN: '🇩🇿 Oran',
  };
  return map[code] ?? code;
}

export function airlineName(code: string): string {
  const map: Record<string, string> = {
    AH:  'Air Algérie',
    AF:  'Air France',
    SN:  'Brussels Airlines',
    FR:  'Ryanair',
    U2:  'EasyJet',
    VY:  'Vueling',
    TK:  'Turkish Airlines',
    AT:  'Royal Air Maroc',
    LH:  'Lufthansa',
    HV:  'Transavia',
    TO:  'Transavia France',
  };
  return map[code] ?? code;
}
