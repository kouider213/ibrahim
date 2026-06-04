export const BACKEND_URL    = process.env.EXPO_PUBLIC_BACKEND_URL    ?? 'https://ibrahim-backend-production.up.railway.app';
export const MOBILE_TOKEN   = process.env.EXPO_PUBLIC_MOBILE_TOKEN   ?? '';
export const MOBILE_TOKEN_H = process.env.EXPO_PUBLIC_MOBILE_TOKEN_HOUARI ?? '';

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

export interface Car {
  id:           string;
  name:         string;
  category:     string | null;
  available:    boolean;
  base_price:   number | null;
  resale_price: number | null;
  description:  string | null;
  seats:        number | null;
  fuel:         string | null;
  transmission: string | null;
  image_url:    string | null;
}

export interface RevenueSummary {
  last_month_revenue?:    number;
  last_month_profit?:     number;
  month_vs_last_pct?:     number;
  today_revenue:            number;
  week_revenue:             number;
  month_revenue:            number;
  kouider_profit_month:     number;
  houari_revenue_month:     number;
  missing_owner_price:      number;
  avg_booking_value:        number;
  total_bookings_month:     number;
  rejected_count?:          number;
  rejected_revenue_lost?:   number;
  total_unpaid_receivables?: number;
  top_clients: Array<{
    client_name:    string;
    client_phone?:  string;
    bookings_count: number;
    total_spent:    number;
    score:          string;
  }>;
}

export async function updateBookingField(
  bookingId:    string,
  updates:      Record<string, unknown>,
  mobileToken?: string,
): Promise<boolean> {
  const token = mobileToken ?? process.env.EXPO_PUBLIC_MOBILE_TOKEN ?? '';
  try {
    const res = await fetch(`${BACKEND_URL}/api/bookings/${encodeURIComponent(bookingId)}`, {
      method:  'PATCH',
      headers: authHeaders(token),
      body:    JSON.stringify(updates),
      signal:  AbortSignal.timeout(8000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function checkCarAvailability(
  carId:     string,
  startDate: string,
  endDate:   string,
  mobileToken?: string,
): Promise<boolean | null> {
  const token = mobileToken ?? process.env.EXPO_PUBLIC_MOBILE_TOKEN ?? '';
  try {
    const params = new URLSearchParams({ carId, startDate, endDate });
    const res = await fetch(`${BACKEND_URL}/api/bookings/availability?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const data = await res.json() as { available: boolean };
    return data.available;
  } catch {
    return null;
  }
}

export async function fetchCars(mobileToken?: string): Promise<Car[]> {
  const token = mobileToken ?? process.env.EXPO_PUBLIC_MOBILE_TOKEN ?? '';
  try {
    const res = await fetch(`${BACKEND_URL}/api/bookings/cars`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data = await res.json() as { cars: Car[] };
    return data.cars ?? [];
  } catch {
    return [];
  }
}

export interface Booking {
  id:                   string;
  car_id:               string;
  client_name:          string;
  client_email:         string | null;
  client_phone:         string | null;
  client_age:           number | null;
  start_date:           string;
  end_date:             string;
  final_price:          number | null;
  payment_status:       string;
  status:               string;
  rented_by:            string | null;
  notes:                string | null;
  client_price_per_day: number | null;
  owner_price_per_day:  number | null;
  profit_kouider:       number | null;
  paid_amount:          number | null;
  nb_days:              number | null;
  cars:                 { id: string; name: string; category: string | null } | null;
}

export async function fetchBookings(
  mobileToken?: string,
  status?: string,
  limit = 30,
  q?: string,
): Promise<Booking[]> {
  const token = mobileToken ?? process.env.EXPO_PUBLIC_MOBILE_TOKEN ?? '';
  try {
    const params = new URLSearchParams({ limit: String(limit) });
    if (status) params.set('status', status);
    if (q) params.set('q', q);
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

export async function fetchBookingById(
  bookingId:    string,
  mobileToken?: string,
): Promise<Booking | null> {
  const token = mobileToken ?? process.env.EXPO_PUBLIC_MOBILE_TOKEN ?? '';
  try {
    const res = await fetch(`${BACKEND_URL}/api/bookings/${encodeURIComponent(bookingId)}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json() as { booking: Booking };
    return data.booking ?? null;
  } catch {
    return null;
  }
}

export async function deleteBooking(
  bookingId:    string,
  mobileToken?: string,
): Promise<boolean> {
  const token = mobileToken ?? process.env.EXPO_PUBLIC_MOBILE_TOKEN ?? '';
  try {
    const res = await fetch(`${BACKEND_URL}/api/bookings/${encodeURIComponent(bookingId)}`, {
      method:  'DELETE',
      headers: { Authorization: `Bearer ${token}` },
      signal:  AbortSignal.timeout(8000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchAllCars(mobileToken?: string): Promise<Car[]> {
  const token = mobileToken ?? process.env.EXPO_PUBLIC_MOBILE_TOKEN ?? '';
  try {
    const res = await fetch(`${BACKEND_URL}/api/cars`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data = await res.json() as { cars: Car[] };
    return data.cars ?? [];
  } catch {
    return [];
  }
}

export async function updateCar(
  carId:        string,
  updates:      Partial<Pick<Car, 'available' | 'base_price' | 'resale_price' | 'description'>>,
  mobileToken?: string,
): Promise<boolean> {
  const token = mobileToken ?? process.env.EXPO_PUBLIC_MOBILE_TOKEN ?? '';
  try {
    const res = await fetch(`${BACKEND_URL}/api/cars/${encodeURIComponent(carId)}`, {
      method:  'PATCH',
      headers: authHeaders(token),
      body:    JSON.stringify(updates),
      signal:  AbortSignal.timeout(8000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchRevenue(mobileToken?: string): Promise<RevenueSummary | null> {
  const token = mobileToken ?? process.env.EXPO_PUBLIC_MOBILE_TOKEN ?? '';
  try {
    const res = await fetch(`${BACKEND_URL}/api/bi/revenue`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    return res.json() as Promise<RevenueSummary>;
  } catch {
    return null;
  }
}

export interface SmartReminder {
  id:       string;
  type:         string;
  priority:     'HIGH' | 'MEDIUM' | 'LOW';
  client_name:  string;
  client_phone: string | null;
  car_name:     string;
  date:         string;
  message:      string;
  action:       string;
}

export async function fetchReminders(mobileToken?: string): Promise<SmartReminder[]> {
  const token = mobileToken ?? process.env.EXPO_PUBLIC_MOBILE_TOKEN ?? '';
  try {
    const res = await fetch(`${BACKEND_URL}/api/bi/reminders`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    const data = await res.json() as { reminders: SmartReminder[] };
    return data.reminders ?? [];
  } catch {
    return [];
  }
}

export async function dismissReminder(id: string, mobileToken?: string): Promise<boolean> {
  const token = mobileToken ?? process.env.EXPO_PUBLIC_MOBILE_TOKEN ?? '';
  try {
    const res = await fetch(`${BACKEND_URL}/api/bi/reminders/dismiss`, {
      method:  'POST',
      headers: authHeaders(token),
      body:    JSON.stringify({ id }),
      signal:  AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch { return false; }
}

export type ClientType = 'loc_auto' | 'loc_immo' | 'achat_auto' | 'achat_immo' | 'demande';

export interface ClientSummary {
  name:         string;
  phone:        string | null;
  email:        string | null;
  bookingCount: number;
  totalSpent:   number;
  lastBooking:  string;
  types?:       ClientType[];
}

export async function fetchClients(mobileToken?: string): Promise<ClientSummary[]> {
  const token = mobileToken ?? process.env.EXPO_PUBLIC_MOBILE_TOKEN ?? '';
  try {
    const res = await fetch(`${BACKEND_URL}/api/clients`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    const data = await res.json() as { clients: ClientSummary[] };
    return data.clients ?? [];
  } catch {
    return [];
  }
}

export interface ClientDeal {
  id:          string;
  deal_type:   string;            // location_immo | vente_immo | vente_voiture | demande_specifique...
  item_label:  string | null;
  amount:      number | null;
  currency:    string | null;
  status:      string | null;
  created_at:  string;
}

export async function fetchClientDeals(name?: string, phone?: string, mobileToken?: string): Promise<ClientDeal[]> {
  const token = mobileToken ?? process.env.EXPO_PUBLIC_MOBILE_TOKEN ?? '';
  const qs = new URLSearchParams();
  if (phone) qs.set('phone', phone);
  if (name)  qs.set('name', name);
  if (![...qs].length) return [];
  try {
    const res = await fetch(`${BACKEND_URL}/api/clients/deals?${qs.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    const data = await res.json() as { deals: ClientDeal[] };
    return data.deals ?? [];
  } catch {
    return [];
  }
}

export interface ClientIntelligence {
  client_name:           string;
  client_phone:          string | null;
  preferred_cars:        string[];
  typical_duration_days: number | null;
  negotiation_style:     string;
  avg_discount_asked:    number;
  payment_reliability:   string;
  total_bookings:        number;
  total_spent:           number;
  last_booking_date:     string | null;
  score:                 string;
  notes:                 string | null;
}

export async function fetchClientIntelligence(mobileToken?: string): Promise<ClientIntelligence[]> {
  const token = mobileToken ?? process.env.EXPO_PUBLIC_MOBILE_TOKEN ?? '';
  try {
    const res = await fetch(`${BACKEND_URL}/api/clients/intelligence`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    const data = await res.json() as { clients: ClientIntelligence[] };
    return data.clients ?? [];
  } catch {
    return [];
  }
}

export async function clearBiCache(mobileToken?: string): Promise<{ ok: boolean; message: string }> {
  const token = mobileToken ?? process.env.EXPO_PUBLIC_MOBILE_TOKEN ?? '';
  try {
    const res = await fetch(`${BACKEND_URL}/api/bi/cache/clear`, {
      method:  'POST',
      headers: { Authorization: `Bearer ${token}` },
      signal:  AbortSignal.timeout(10000),
    });
    const data = await res.json() as { deleted?: number; error?: string };
    if (!res.ok) return { ok: false, message: data.error ?? 'Cache clear échoué' };
    return { ok: true, message: `Cache vidé (${data.deleted ?? 0} clés)` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

export async function createCar(
  car: { name: string; category?: string; base_price: number; resale_price?: number; seats?: number; fuel?: string; transmission?: string },
  mobileToken?: string,
): Promise<{ ok: boolean; car?: Car; error?: string }> {
  const token = mobileToken ?? process.env.EXPO_PUBLIC_MOBILE_TOKEN ?? '';
  try {
    const res = await fetch(`${BACKEND_URL}/api/cars`, {
      method:  'POST',
      headers: authHeaders(token),
      body:    JSON.stringify({ ...car, available: true }),
      signal:  AbortSignal.timeout(10000),
    });
    const data = await res.json() as { car?: Car; error?: string };
    if (!res.ok) return { ok: false, error: data.error };
    return { ok: true, car: data.car };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export interface SchedulerJob {
  name: string;
  cron: string;
  next: number | null;
}

export async function fetchSchedulerJobs(mobileToken?: string): Promise<SchedulerJob[]> {
  const token = mobileToken ?? process.env.EXPO_PUBLIC_MOBILE_TOKEN ?? '';
  try {
    const res = await fetch(`${BACKEND_URL}/api/scheduler/jobs`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data = await res.json() as { jobs: SchedulerJob[] };
    return data.jobs ?? [];
  } catch { return []; }
}

export interface Validation {
  id:         string;
  type:       string;
  context:    Record<string, unknown>;
  status:     'pending' | 'approved' | 'rejected';
  created_at: string;
  decided_at: string | null;
  note:       string | null;
}

export async function fetchValidations(mobileToken?: string): Promise<Validation[]> {
  const token = mobileToken ?? process.env.EXPO_PUBLIC_MOBILE_TOKEN ?? '';
  try {
    const res = await fetch(`${BACKEND_URL}/api/validations`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data = await res.json() as { validations: Validation[] };
    return data.validations ?? [];
  } catch { return []; }
}

export async function decideValidation(
  id:           string,
  decision:     'approved' | 'rejected',
  note?:        string,
  mobileToken?: string,
): Promise<boolean> {
  const token = mobileToken ?? process.env.EXPO_PUBLIC_MOBILE_TOKEN ?? '';
  try {
    const res = await fetch(`${BACKEND_URL}/api/validations/${id}/decide`, {
      method:  'POST',
      headers: authHeaders(token),
      body:    JSON.stringify({ decision, note }),
      signal:  AbortSignal.timeout(8000),
    });
    return res.ok;
  } catch { return false; }
}

export interface StoredLocation {
  lat:        number;
  lng:        number;
  city?:      string;
  country:    string;
  updated_at: string;
}

export async function shareLocation(
  lat:          number,
  lng:          number,
  mobileToken?: string,
): Promise<{ ok: boolean; location?: StoredLocation }> {
  const token = mobileToken ?? process.env.EXPO_PUBLIC_MOBILE_TOKEN ?? '';
  try {
    const res = await fetch(`${BACKEND_URL}/api/location`, {
      method:  'POST',
      headers: authHeaders(token),
      body:    JSON.stringify({ lat, lng }),
      signal:  AbortSignal.timeout(10000),
    });
    return res.json() as Promise<{ ok: boolean; location?: StoredLocation }>;
  } catch {
    return { ok: false };
  }
}

export async function getMyLocation(mobileToken?: string): Promise<StoredLocation | null> {
  const token = mobileToken ?? process.env.EXPO_PUBLIC_MOBILE_TOKEN ?? '';
  try {
    const res = await fetch(`${BACKEND_URL}/api/location`, {
      headers: { Authorization: `Bearer ${token}` },
      signal:  AbortSignal.timeout(8000),
    });
    const data = await res.json() as { ok: boolean; location: StoredLocation | null };
    return data.location ?? null;
  } catch {
    return null;
  }
}

export async function registerPushToken(
  pushToken:    string,
  mobileToken?: string,
): Promise<boolean> {
  const token = mobileToken ?? process.env.EXPO_PUBLIC_MOBILE_TOKEN ?? '';
  try {
    const res = await fetch(`${BACKEND_URL}/api/push-token`, {
      method:  'POST',
      headers: authHeaders(token),
      body:    JSON.stringify({ token: pushToken }),
      signal:  AbortSignal.timeout(8000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function updateClientNotes(
  phone:        string,
  notes:        string,
  mobileToken?: string,
): Promise<{ ok: boolean; error?: string }> {
  const token = mobileToken ?? process.env.EXPO_PUBLIC_MOBILE_TOKEN ?? '';
  try {
    const res = await fetch(`${BACKEND_URL}/api/clients/${encodeURIComponent(phone)}/notes`, {
      method:  'PATCH',
      headers: authHeaders(token),
      body:    JSON.stringify({ notes }),
      signal:  AbortSignal.timeout(8000),
    });
    const data = await res.json() as { ok?: boolean; error?: string };
    if (!res.ok) return { ok: false, error: data.error };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export interface AppNotification {
  id:         string;
  title?:     string;
  body?:      string;
  type?:      string;
  status:     string;
  data?:      Record<string, unknown>;
  created_at: string;
}

export async function fetchNotifications(mobileToken?: string, limit = 50): Promise<AppNotification[]> {
  const token = mobileToken ?? process.env.EXPO_PUBLIC_MOBILE_TOKEN ?? '';
  try {
    const res = await fetch(`${BACKEND_URL}/api/notifications?limit=${limit}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data = await res.json() as { notifications: AppNotification[] };
    return data.notifications ?? [];
  } catch { return []; }
}

export async function markNotificationRead(id: string, mobileToken?: string): Promise<boolean> {
  const token = mobileToken ?? process.env.EXPO_PUBLIC_MOBILE_TOKEN ?? '';
  try {
    const res = await fetch(`${BACKEND_URL}/api/notifications/${id}/read`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch { return false; }
}

export async function backfillClientIntelligence(mobileToken?: string): Promise<{ ok: boolean; message: string }> {
  const token = mobileToken ?? process.env.EXPO_PUBLIC_MOBILE_TOKEN ?? '';
  try {
    const res = await fetch(`${BACKEND_URL}/api/clients/backfill`, {
      method:  'POST',
      headers: { Authorization: `Bearer ${token}` },
      signal:  AbortSignal.timeout(30000),
    });
    const data = await res.json() as { ok?: boolean; message?: string; error?: string };
    if (!res.ok) return { ok: false, message: data.error ?? 'Backfill échoué' };
    return { ok: true, message: data.message ?? 'Backfill terminé' };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

export interface Payment {
  id:         string;
  booking_id: string;
  amount:     number;
  type:       'avance' | 'solde' | 'virement' | 'especes' | 'autre';
  note?:      string;
  created_at: string;
}

export async function fetchBookingPayments(bookingId: string, mobileToken?: string): Promise<Payment[]> {
  const token = mobileToken ?? process.env.EXPO_PUBLIC_MOBILE_TOKEN ?? '';
  try {
    const res = await fetch(`${BACKEND_URL}/api/bookings/${bookingId}/payments`, {
      headers: { Authorization: `Bearer ${token}` },
      signal:  AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data = await res.json() as { payments: Payment[] };
    return data.payments ?? [];
  } catch { return []; }
}

export async function recordPayment(
  bookingId: string,
  amount: number,
  type: Payment['type'],
  note?: string,
  mobileToken?: string,
): Promise<{ ok: boolean; totalPaid?: number; paymentStatus?: string; error?: string }> {
  const token = mobileToken ?? process.env.EXPO_PUBLIC_MOBILE_TOKEN ?? '';
  try {
    const res = await fetch(`${BACKEND_URL}/api/bookings/${bookingId}/payments`, {
      method:  'POST',
      headers: authHeaders(token),
      body:    JSON.stringify({ amount, type, note }),
      signal:  AbortSignal.timeout(10000),
    });
    const data = await res.json() as { totalPaid?: number; paymentStatus?: string; error?: string };
    if (!res.ok) return { ok: false, error: data.error };
    return { ok: true, totalPaid: data.totalPaid, paymentStatus: data.paymentStatus };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
