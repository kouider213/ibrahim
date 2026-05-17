export const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL ?? 'https://ibrahim-backend-production.up.railway.app';

export interface ChatResponse {
  text:   string;
  status: 'done' | 'error';
}

export interface UserLocation {
  lat: number;
  lng: number;
  accuracy?: number;
}

function authHeaders(token: string) {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

export async function sendMessage(
  message:       string,
  sessionId:     string,
  imageBase64?:  string,
  userLocation?: UserLocation,
  mobileToken?:  string,
): Promise<ChatResponse> {
  const token = mobileToken ?? process.env.EXPO_PUBLIC_MOBILE_TOKEN ?? '';
  const res = await fetch(`${BACKEND_URL}/api/chat`, {
    method:  'POST',
    headers: authHeaders(token),
    body: JSON.stringify({
      message,
      sessionId,
      ...(imageBase64  ? { imageBase64, imageMime: 'image/jpeg' } : {}),
      ...(userLocation ? { userLocation }                         : {}),
    }),
  });

  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json() as Promise<ChatResponse>;
}

export interface HistoryMessage {
  role:       'user' | 'assistant';
  content:    string;
  created_at: string;
}

export async function fetchHistory(
  sessionId:    string,
  mobileToken?: string,
  limit = 30,
): Promise<HistoryMessage[]> {
  const token = mobileToken ?? process.env.EXPO_PUBLIC_MOBILE_TOKEN ?? '';
  try {
    const res = await fetch(`${BACKEND_URL}/api/chat/${encodeURIComponent(sessionId)}/history?limit=${limit}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return [];
    const data = await res.json() as { history: HistoryMessage[] };
    return data.history ?? [];
  } catch {
    return [];
  }
}

export async function registerDevice(
  displayName:  string,
  mode:         string,
  businessType: string | null,
  businessName: string | null,
  city:         string | null,
  mobileToken?: string,
): Promise<{ userId: string }> {
  const token = mobileToken ?? process.env.EXPO_PUBLIC_MOBILE_TOKEN ?? '';
  const res = await fetch(`${BACKEND_URL}/api/auth/register`, {
    method:  'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ displayName, mode, businessType, businessName, city }),
  });
  if (!res.ok) throw new Error(`Register error ${res.status}`);
  return res.json() as Promise<{ userId: string }>;
}

export interface FleetIntelligence {
  total_cars:          number;
  available_now_count: number;
  occupancy_avg_pct:   number;
  most_profitable:     string | null;
  idle_vehicles:       string[];
  low_fleet_alert:     boolean;
  stats:               Array<{
    car_name:          string;
    available_now:     boolean;
    occupancy_pct:     number;
    revenue_30d:       number;
  }>;
}

export async function fetchFleetStats(mobileToken?: string): Promise<FleetIntelligence | null> {
  const token = mobileToken ?? process.env.EXPO_PUBLIC_MOBILE_TOKEN ?? '';
  try {
    const res = await fetch(`${BACKEND_URL}/api/bi/fleet`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    return res.json() as Promise<FleetIntelligence>;
  } catch {
    return null;
  }
}

export async function triggerSchedulerJob(jobName: string, mobileToken?: string): Promise<boolean> {
  const token = mobileToken ?? process.env.EXPO_PUBLIC_MOBILE_TOKEN ?? '';
  try {
    const res = await fetch(`${BACKEND_URL}/api/scheduler/trigger/${encodeURIComponent(jobName)}`, {
      method:  'POST',
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export interface Booking {
  id:                   string;
  client_name:          string;
  client_phone:         string | null;
  start_date:           string;
  end_date:             string;
  final_price:          number | null;
  payment_status:       string;
  status:               string;
  rented_by:            string | null;
  client_price_per_day: number | null;
  owner_price_per_day:  number | null;
  profit_kouider:       number | null;
  paid_amount:          number | null;
  cars:                 { name: string; category: string | null } | null;
}

export async function fetchBookings(
  mobileToken?: string,
  status?: string,
  limit = 30,
): Promise<Booking[]> {
  const token = mobileToken ?? process.env.EXPO_PUBLIC_MOBILE_TOKEN ?? '';
  try {
    const params = new URLSearchParams({ limit: String(limit) });
    if (status) params.set('status', status);
    const res = await fetch(`${BACKEND_URL}/api/bookings?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data = await res.json() as { bookings: Booking[] };
    return data.bookings ?? [];
  } catch {
    return [];
  }
}
