import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env.js';

export const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── Fik Conciergerie real table types ─────────────────────────

export interface Car {
  id:           string;
  name:         string;
  base_price:   number;
  resale_price: number;
  image_url:    string;
  category:     string;
  seats:        number;
  fuel:         string;
  transmission: string;
  available:    boolean;
  description?: string;
  created_at:   string;
}

export interface Booking {
  id:                    string;
  car_id:                string;
  user_id?:              string;
  client_name:           string;
  client_email?:         string;
  client_phone?:         string;
  client_age?:           number;
  client_passport?:      string;
  start_date:            string;
  end_date:              string;
  base_price_snapshot:   number;
  resale_price_snapshot: number;
  final_price:           number;
  profit:                number;
  status:                'PENDING' | 'CONFIRMED' | 'REJECTED' | 'COMPLETED' | 'ACTIVE';
  notes?:                string;
  whatsapp_sent:         boolean;
  sms_sent:              boolean;
  pdf_url?:              string;
  nb_days?:              number;
  created_at:            string;
  updated_at:            string;
}

export interface ClientDocument {
  id:          string;
  booking_id?: string;
  client_phone: string;
  client_name:  string;
  type:         'passport' | 'license' | 'contract' | 'other';
  file_url:     string;
  storage_path: string;
  notes?:       string;
  created_at:   string;
}

// ── Ibrahim internal types ─────────────────────────────────────

export type TaskStatus =
  | 'pending' | 'queued' | 'running' | 'waiting_validation'
  | 'completed' | 'failed' | 'cancelled';

export interface IbrahimRule {
  id:         string;
  category:   string;
  rule:       string;
  conditions: Record<string, unknown>;
  action:     Record<string, unknown>;
  confidence: number;
  source:     string;
  active:     boolean;
}

// ── Fik Conciergerie queries ───────────────────────────────────

export async function getFleet(): Promise<Car[]> {
  const { data, error } = await supabase
    .from('cars')
    .select('*')
    .order('name');
  if (error) throw new Error(`Fleet fetch failed: ${error.message}`);
  return (data ?? []) as Car[];
}

export async function getAvailableCars(startDate: string, endDate: string): Promise<Car[]> {
  try {
    const { data } = await supabase
      .rpc('check_car_availability', { p_start: startDate, p_end: endDate });
    if (data) return data as Car[];
  } catch { /* RPC not available, fallback below */ }

  // Fallback: filter by available flag
  const { data: cars } = await supabase.from('cars').select('*').eq('available', true);
  return (cars ?? []) as Car[];
}

export async function checkCarAvailability(
  carId: string,
  startDate: string,
  endDate: string,
  excludeBookingId?: string,
): Promise<boolean> {
  let query = supabase
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .eq('car_id', carId)
    .in('status', ['PENDING', 'CONFIRMED', 'ACTIVE'])
    .lt('start_date', endDate)
    .gt('end_date', startDate);

  if (excludeBookingId) query = query.neq('id', excludeBookingId);

  const { count, error } = await query;
  if (error) throw new Error(`Availability check failed: ${error.message}`);
  return (count ?? 0) === 0;
}

export async function getBookings(filters?: {
  status?: string;
  clientPhone?: string;
  carId?: string;
  limit?: number;
}): Promise<Booking[]> {
  let query = supabase
    .from('bookings')
    .select('*, cars(name, category)')
    .order('created_at', { ascending: false })
    .limit(filters?.limit ?? 50);

  if (filters?.status) query = query.eq('status', filters.status);
  if (filters?.clientPhone) query = query.eq('client_phone', filters.clientPhone);
  if (filters?.carId) query = query.eq('car_id', filters.carId);

  const { data, error } = await query;
  if (error) throw new Error(`Bookings fetch failed: ${error.message}`);
  return (data ?? []) as Booking[];
}

export async function getClientHistory(phone: string): Promise<{
  bookings: Booking[];
  totalSpent: number;
  bookingCount: number;
  isVip: boolean;
}> {
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('client_phone', phone)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Client history fetch failed: ${error.message}`);
  const bookings = (data ?? []) as Booking[];
  const confirmed = bookings.filter(b => b.status === 'CONFIRMED' || b.status === 'COMPLETED');
  const totalSpent = confirmed.reduce((sum, b) => sum + (b.final_price ?? 0), 0);
  const isVip = confirmed.length >= 5 || totalSpent > 1000;

  return { bookings, totalSpent, bookingCount: confirmed.length, isVip };
}

export async function createBooking(booking: Omit<Booking, 'id' | 'created_at' | 'updated_at'>): Promise<Booking> {
  // Anti-doublon: check availability before creating
  const available = await checkCarAvailability(booking.car_id, booking.start_date, booking.end_date);
  if (!available) {
    throw new Error(`Le véhicule n'est pas disponible du ${booking.start_date} au ${booking.end_date}.`);
  }

  const { data, error } = await supabase
    .from('bookings')
    .insert(booking)
    .select()
    .single();

  if (error) throw new Error(`Booking creation failed: ${error.message}`);
  return data as Booking;
}

// ── Ibrahim conversation helpers ───────────────────────────────

export async function getActiveRules(): Promise<IbrahimRule[]> {
  const { data, error } = await supabase
    .from('ibrahim_rules')
    .select('*')
    .eq('active', true)
    .order('category');
  if (error) throw new Error(`Rules fetch failed: ${error.message}`);
  return (data ?? []) as IbrahimRule[];
}

export async function getRecentUserMessages(limit = 40): Promise<string[]> {
  const { data } = await supabase
    .from('conversations')
    .select('content')
    .eq('role', 'user')
    .order('created_at', { ascending: false })
    .limit(limit);
  return (data ?? []).map((r: { content: string }) => r.content).reverse();
}

export async function getConversationHistory(sessionId: string, limit = 20) {
  const { data, error } = await supabase
    .from('conversations')
    .select('role, content, created_at')
    .eq('session_id', sessionId)
    .in('role', ['user', 'assistant'])
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Conversation fetch failed: ${error.message}`);
  return (data ?? []).reverse();
}

export async function saveConversationTurn(
  sessionId: string,
  role: 'user' | 'assistant' | 'system',
  content: string,
  metadata: Record<string, unknown> = {},
) {
  const { error } = await supabase
    .from('conversations')
    .insert({ session_id: sessionId, role, content, metadata });
  if (error) throw new Error(`Conversation save failed: ${error.message}`);
}

// ── Client documents ───────────────────────────────────────────

export async function saveClientDocument(doc: Omit<ClientDocument, 'id' | 'created_at'>): Promise<ClientDocument> {
  const { data, error } = await supabase
    .from('client_documents')
    .insert(doc)
    .select()
    .single();
  if (error) throw new Error(`Document save failed: ${error.message}`);
  return data as ClientDocument;
}

export async function getClientDocuments(clientPhone: string): Promise<ClientDocument[]> {
  const { data, error } = await supabase
    .from('client_documents')
    .select('*')
    .eq('client_phone', clientPhone)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`Documents fetch failed: ${error.message}`);
  return (data ?? []) as ClientDocument[];
}

// Legacy compatibility
export async function checkVehicleAvailability(
  vehicleId: string,
  startDate: string,
  endDate: string,
  excludeId?: string,
): Promise<boolean> {
  return checkCarAvailability(vehicleId, startDate, endDate, excludeId);
}

export async function isVipClient(phone: string): Promise<boolean> {
  const { isVip } = await getClientHistory(phone);
  return isVip;
}
