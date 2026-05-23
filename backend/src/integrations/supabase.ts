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
  // ── Champs financiers normalisés (migration_financial_fields.sql) ──────────
  /** Prix réellement négocié avec le client par jour */
  client_price_per_day?: number;
  /** Prix payé à Houari (propriétaire) par jour */
  owner_price_per_day?:  number;
  /** Total payé à Houari = owner_price_per_day × nb_days */
  owner_total?:          number;
  /** Bénéfice net Kouider = (client_price_per_day - owner_price_per_day) × nb_days */
  profit_kouider?:       number;
  /** Remise accordée au client */
  discount_applied?:     number;
  // ──────────────────────────────────────────────────────────────────────────
  status:                'PENDING' | 'CONFIRMED' | 'REJECTED' | 'COMPLETED' | 'ACTIVE';
  payment_status?:       'UNPAID' | 'PENDING' | 'PARTIAL' | 'PAID';
  paid_amount?:          number;
  rented_by?:            string;
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

// ── Dzaryx internal types ─────────────────────────────────────

export type TaskStatus =
  | 'pending' | 'queued' | 'running' | 'waiting_validation'
  | 'completed' | 'failed' | 'cancelled';

export interface IbrahimRule {
  id:           string;
  category:     string;
  rule:         string;
  conditions:   Record<string, unknown>;
  action:       Record<string, unknown>;
  confidence:   number;
  source:       string;
  active:       boolean;
  // P12a columns
  priority?:    number;
  trigger_type?: string;
  auto_apply?:  boolean;
  last_applied?: string;
  apply_count?:  number;
}

export interface IbrahimMemory {
  id:         string;
  content:    string;
  category:   string;
  created_at: string;
  updated_at: string;
}

// ── P12 Memory Engine types ───────────────────────────────────

export type MemoryDomain =
  | 'identity' | 'habit' | 'routine' | 'preference' | 'goal'
  | 'health' | 'family' | 'business' | 'vehicle' | 'client'
  | 'finance' | 'learning' | 'general';

export interface MemoryFact {
  id:          string;
  user_id:     string;
  domain:      MemoryDomain;
  key:         string;
  value:       string;
  value_type:  'text' | 'boolean' | 'number' | 'json' | 'date';
  value_json?: Record<string, unknown>;
  confidence:  number;
  source:      string;
  verified:    boolean;
  is_current:  boolean;
  valid_from?:  string;
  valid_until?: string;
  created_at:  string;
  updated_at:  string;
}

export type EpisodeType =
  | 'conversation_summary' | 'booking_event' | 'calendar_event'
  | 'financial_event' | 'vehicle_event' | 'notification_sent'
  | 'user_request' | 'proactive_trigger' | 'document_scan' | 'manual';

export interface MemoryEpisode {
  id:           string;
  episode_type: EpisodeType;
  summary:      string;
  entities:     Record<string, unknown>;
  sentiment:    'positive' | 'neutral' | 'negative' | 'urgent';
  importance:   1 | 2 | 3 | 4 | 5;
  session_id?:  string;
  source:       'telegram' | 'app' | 'cron' | 'nexus' | 'system' | 'manual';
  occurred_at:  string;
  expires_at:   string;
}

export interface MemoryHabit {
  id:             string;
  user_id:        string;
  habit_name:     string;
  schedule_type:  'daily' | 'weekly' | 'interval' | 'condition';
  schedule_cron?: string;
  interval_hours?: number;
  condition?:     string;
  description:    string;
  action_type:    'remind' | 'check' | 'notify' | 'auto_do';
  action_data:    Record<string, unknown>;
  last_done_at?:  string;
  streak_days:    number;
  missed_count:   number;
  active:         boolean;
  created_at:     string;
}

export interface UserProfile {
  id:                    string;
  user_id:               string;
  name:                  string;
  languages:             string[];
  location_primary:      string;
  location_secondary:    string;
  timezone_primary:      string;
  timezone_secondary:    string;
  work_days:             number[];
  work_start:            string;
  work_end:              string;
  flex_hours:            boolean;
  commute_mode:          string;
  commute_minutes_avg:   number;
  wake_time:             string;
  morning_vitamins:      boolean;
  morning_coffee:        boolean;
  breakfast:             boolean;
  sleep_time:            string;
  wind_down_minutes:     number;
  family_members:        unknown[];
  quality_time_gap_days: number;
  medications:           string[];
  supplements:           string[];
  health_reminders:      boolean;
  preferred_channel:     string;
  response_style:        string;
  voice_mode:            boolean;
  language_auto:         boolean;
  business_name:         string;
  business_role:         string;
  business_partner:      string;
  business_location:     string;
  profit_split_pct:      number;
  created_at:            string;
  updated_at:            string;
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
  q?: string;
}): Promise<Booking[]> {
  let query = supabase
    .from('bookings')
    .select('*, cars(name, category)')
    .order('created_at', { ascending: false })
    .limit(filters?.limit ?? 50);

  if (filters?.status) query = query.eq('status', filters.status);
  if (filters?.clientPhone) query = query.eq('client_phone', filters.clientPhone);
  if (filters?.carId) query = query.eq('car_id', filters.carId);
  if (filters?.q) query = query.ilike('client_name', `%${filters.q}%`);

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

// ── Dzaryx conversation helpers ───────────────────────────────

export async function getActiveRules(): Promise<IbrahimRule[]> {
  const { data, error } = await supabase
    .from('Dzaryx_rules')
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

// ── P12 Memory Engine helpers ──────────────────────────────────

export async function getUserProfile(userId = 'kouider'): Promise<UserProfile | null> {
  const { data, error } = await supabase
    .from('user_profile')
    .select('*')
    .eq('user_id', userId)
    .single();
  if (error) return null;
  return data as UserProfile;
}

export async function getMemoryFacts(filters?: {
  domain?: MemoryDomain;
  is_current?: boolean;
  limit?: number;
  user_id?: string;
}): Promise<MemoryFact[]> {
  let query = supabase
    .from('memory_facts')
    .select('*')
    .eq('user_id', filters?.user_id ?? 'kouider')
    .order('confidence', { ascending: false })
    .order('updated_at', { ascending: false })
    .limit(filters?.limit ?? 50);

  if (filters?.domain)     query = query.eq('domain', filters.domain);
  if (filters?.is_current !== undefined) query = query.eq('is_current', filters.is_current);

  const { data, error } = await query;
  if (error) throw new Error(`memory_facts fetch failed: ${error.message}`);
  return (data ?? []) as MemoryFact[];
}

export async function upsertMemoryFact(
  domain: MemoryDomain,
  key: string,
  value: string,
  opts?: Partial<Pick<MemoryFact, 'value_type' | 'value_json' | 'confidence' | 'source' | 'verified' | 'valid_from' | 'valid_until'>>,
  userId = 'kouider',
): Promise<void> {
  const { error } = await supabase
    .from('memory_facts')
    .upsert(
      {
        user_id:    userId,
        domain,
        key,
        value,
        value_type:  opts?.value_type  ?? 'text',
        value_json:  opts?.value_json,
        confidence:  opts?.confidence  ?? 1.0,
        source:      opts?.source      ?? 'explicit',
        verified:    opts?.verified    ?? true,
        valid_from:  opts?.valid_from,
        valid_until: opts?.valid_until,
        is_current:  true,
        updated_at:  new Date().toISOString(),
      },
      { onConflict: 'user_id,domain,key' },
    );
  if (error) throw new Error(`upsertMemoryFact failed [${domain}/${key}]: ${error.message}`);
}

export async function addMemoryEpisode(
  episode: Omit<MemoryEpisode, 'id' | 'occurred_at' | 'expires_at'> & {
    occurred_at?: string;
    expires_at?: string;
  },
): Promise<MemoryEpisode> {
  const { data, error } = await supabase
    .from('memory_episodes')
    .insert(episode)
    .select()
    .single();
  if (error) throw new Error(`addMemoryEpisode failed: ${error.message}`);
  return data as MemoryEpisode;
}

export async function getRecentEpisodes(options?: {
  episode_type?: EpisodeType;
  min_importance?: number;
  limit?: number;
}): Promise<MemoryEpisode[]> {
  let query = supabase
    .from('memory_episodes')
    .select('*')
    .gt('expires_at', new Date().toISOString())
    .order('occurred_at', { ascending: false })
    .limit(options?.limit ?? 20);

  if (options?.episode_type)    query = query.eq('episode_type', options.episode_type);
  if (options?.min_importance)  query = query.gte('importance', options.min_importance);

  const { data, error } = await query;
  if (error) throw new Error(`getRecentEpisodes failed: ${error.message}`);
  return (data ?? []) as MemoryEpisode[];
}

export async function getActiveHabits(userId = 'kouider'): Promise<MemoryHabit[]> {
  const { data, error } = await supabase
    .from('memory_habits')
    .select('*')
    .eq('user_id', userId)
    .eq('active', true)
    .order('created_at');
  if (error) throw new Error(`getActiveHabits failed: ${error.message}`);
  return (data ?? []) as MemoryHabit[];
}
