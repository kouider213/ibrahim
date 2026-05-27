export declare const supabase: import("@supabase/supabase-js").SupabaseClient<any, "public", "public", any, any>;
export interface Car {
    id: string;
    name: string;
    base_price: number;
    resale_price: number;
    image_url: string;
    category: string;
    seats: number;
    fuel: string;
    transmission: string;
    available: boolean;
    description?: string;
    created_at: string;
}
export interface Booking {
    id: string;
    car_id: string;
    user_id?: string;
    client_name: string;
    client_email?: string;
    client_phone?: string;
    client_age?: number;
    client_passport?: string;
    start_date: string;
    end_date: string;
    base_price_snapshot: number;
    resale_price_snapshot: number;
    final_price: number;
    profit: number;
    /** Prix réellement négocié avec le client par jour */
    client_price_per_day?: number;
    /** Prix payé à Houari (propriétaire) par jour */
    owner_price_per_day?: number;
    /** Total payé à Houari = owner_price_per_day × nb_days */
    owner_total?: number;
    /** Bénéfice net Kouider = (client_price_per_day - owner_price_per_day) × nb_days */
    profit_kouider?: number;
    /** Remise accordée au client */
    discount_applied?: number;
    status: 'PENDING' | 'CONFIRMED' | 'REJECTED' | 'COMPLETED' | 'ACTIVE';
    payment_status?: 'PENDING' | 'PARTIAL' | 'PAID';
    paid_amount?: number;
    rented_by?: string;
    notes?: string;
    whatsapp_sent: boolean;
    sms_sent: boolean;
    pdf_url?: string;
    nb_days?: number;
    created_at: string;
    updated_at: string;
}
export interface ClientDocument {
    id: string;
    booking_id?: string;
    client_phone: string;
    client_name: string;
    type: 'passport' | 'license' | 'contract' | 'other';
    file_url: string;
    storage_path: string;
    notes?: string;
    created_at: string;
}
export type TaskStatus = 'pending' | 'queued' | 'running' | 'waiting_validation' | 'completed' | 'failed' | 'cancelled';
export interface IbrahimRule {
    id: string;
    category: string;
    rule: string;
    conditions: Record<string, unknown>;
    action: Record<string, unknown>;
    confidence: number;
    source: string;
    active: boolean;
    priority?: number;
    trigger_type?: string;
    auto_apply?: boolean;
    last_applied?: string;
    apply_count?: number;
}
export interface IbrahimMemory {
    id: string;
    content: string;
    category: string;
    created_at: string;
    updated_at: string;
}
export type MemoryDomain = 'identity' | 'habit' | 'routine' | 'preference' | 'goal' | 'health' | 'family' | 'business' | 'vehicle' | 'client' | 'finance' | 'learning' | 'general';
export interface MemoryFact {
    id: string;
    user_id: string;
    domain: MemoryDomain;
    key: string;
    value: string;
    value_type: 'text' | 'boolean' | 'number' | 'json' | 'date';
    value_json?: Record<string, unknown>;
    confidence: number;
    source: string;
    verified: boolean;
    is_current: boolean;
    valid_from?: string;
    valid_until?: string;
    created_at: string;
    updated_at: string;
}
export type EpisodeType = 'conversation_summary' | 'booking_event' | 'calendar_event' | 'financial_event' | 'vehicle_event' | 'notification_sent' | 'user_request' | 'proactive_trigger' | 'document_scan' | 'manual';
export interface MemoryEpisode {
    id: string;
    episode_type: EpisodeType;
    summary: string;
    entities: Record<string, unknown>;
    sentiment: 'positive' | 'neutral' | 'negative' | 'urgent';
    importance: 1 | 2 | 3 | 4 | 5;
    session_id?: string;
    source: 'telegram' | 'app' | 'cron' | 'nexus' | 'system' | 'manual';
    occurred_at: string;
    expires_at: string;
}
export interface MemoryHabit {
    id: string;
    user_id: string;
    habit_name: string;
    schedule_type: 'daily' | 'weekly' | 'interval' | 'condition';
    schedule_cron?: string;
    interval_hours?: number;
    condition?: string;
    description: string;
    action_type: 'remind' | 'check' | 'notify' | 'auto_do';
    action_data: Record<string, unknown>;
    last_done_at?: string;
    streak_days: number;
    missed_count: number;
    active: boolean;
    created_at: string;
}
export interface UserProfile {
    id: string;
    user_id: string;
    name: string;
    languages: string[];
    location_primary: string;
    location_secondary: string;
    timezone_primary: string;
    timezone_secondary: string;
    work_days: number[];
    work_start: string;
    work_end: string;
    flex_hours: boolean;
    commute_mode: string;
    commute_minutes_avg: number;
    wake_time: string;
    morning_vitamins: boolean;
    morning_coffee: boolean;
    breakfast: boolean;
    sleep_time: string;
    wind_down_minutes: number;
    family_members: unknown[];
    quality_time_gap_days: number;
    medications: string[];
    supplements: string[];
    health_reminders: boolean;
    preferred_channel: string;
    response_style: string;
    voice_mode: boolean;
    language_auto: boolean;
    business_name: string;
    business_role: string;
    business_partner: string;
    business_location: string;
    profit_split_pct: number;
    created_at: string;
    updated_at: string;
}
export declare function getFleet(): Promise<Car[]>;
export declare function getAvailableCars(startDate: string, endDate: string): Promise<Car[]>;
export declare function checkCarAvailability(carId: string, startDate: string, endDate: string, excludeBookingId?: string): Promise<boolean>;
export declare function getBookings(filters?: {
    status?: string;
    clientPhone?: string;
    carId?: string;
    limit?: number;
}): Promise<Booking[]>;
export declare function getClientHistory(phone: string): Promise<{
    bookings: Booking[];
    totalSpent: number;
    bookingCount: number;
    isVip: boolean;
}>;
export declare function createBooking(booking: Omit<Booking, 'id' | 'created_at' | 'updated_at'>): Promise<Booking>;
export declare function getActiveRules(): Promise<IbrahimRule[]>;
export declare function getRecentUserMessages(limit?: number): Promise<string[]>;
export declare function getConversationHistory(sessionId: string, limit?: number): Promise<{
    role: any;
    content: any;
    created_at: any;
}[]>;
export declare function saveConversationTurn(sessionId: string, role: 'user' | 'assistant' | 'system', content: string, metadata?: Record<string, unknown>): Promise<void>;
export declare function saveClientDocument(doc: Omit<ClientDocument, 'id' | 'created_at'>): Promise<ClientDocument>;
export declare function getClientDocuments(clientPhone: string): Promise<ClientDocument[]>;
export declare function checkVehicleAvailability(vehicleId: string, startDate: string, endDate: string, excludeId?: string): Promise<boolean>;
export declare function isVipClient(phone: string): Promise<boolean>;
export declare function getUserProfile(userId?: string): Promise<UserProfile | null>;
export declare function getMemoryFacts(filters?: {
    domain?: MemoryDomain;
    is_current?: boolean;
    limit?: number;
    user_id?: string;
}): Promise<MemoryFact[]>;
export declare function upsertMemoryFact(domain: MemoryDomain, key: string, value: string, opts?: Partial<Pick<MemoryFact, 'value_type' | 'value_json' | 'confidence' | 'source' | 'verified' | 'valid_from' | 'valid_until'>>, userId?: string): Promise<void>;
export declare function addMemoryEpisode(episode: Omit<MemoryEpisode, 'id' | 'occurred_at' | 'expires_at'> & {
    occurred_at?: string;
    expires_at?: string;
}): Promise<MemoryEpisode>;
export declare function getRecentEpisodes(options?: {
    episode_type?: EpisodeType;
    min_importance?: number;
    limit?: number;
}): Promise<MemoryEpisode[]>;
export declare function getActiveHabits(userId?: string): Promise<MemoryHabit[]>;
//# sourceMappingURL=supabase.d.ts.map