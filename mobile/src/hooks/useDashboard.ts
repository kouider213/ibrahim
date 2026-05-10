import { useState, useEffect, useCallback, useRef } from 'react';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _env = (import.meta as any).env ?? {};
const BACKEND_URL  = (_env['VITE_BACKEND_URL']  as string | undefined) ?? 'http://localhost:3000';
const ACCESS_TOKEN = (_env['VITE_ACCESS_TOKEN'] as string | undefined) ?? '';

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
  });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json() as Promise<T>;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json() as Promise<T>;
}

function usePoll<T>(path: string, intervalMs = 30_000) {
  const [data, setData]     = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const result = await get<T>(path);
      setData(result);
      setError(null);
      setLastUpdated(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    fetchData();
    const iv = setInterval(fetchData, intervalMs);
    return () => clearInterval(iv);
  }, [fetchData, intervalMs]);

  return { data, loading, error, lastUpdated, refetch: fetchData };
}

// ── Fleet ────────────────────────────────────────────────────
export interface FleetStat {
  car_id:             string;
  car_name:           string;
  base_price:         number;
  resale_price:       number;
  total_bookings_30d: number;
  revenue_30d:        number;
  occupied_days_30d:  number;
  occupancy_pct:      number;
  last_booked:        string | null;
  next_free_date:     string | null;
  available_now:      boolean;
}

export interface FleetIntelligence {
  stats:               FleetStat[];
  total_cars:          number;
  available_now_count: number;
  occupancy_avg_pct:   number;
  most_profitable:     string | null;
  idle_vehicles:       string[];
  low_fleet_alert:     boolean;
  generated_at:        string;
}

export function useFleet() {
  return usePoll<FleetIntelligence>('/api/bi/fleet', 30_000);
}

// ── Revenue ──────────────────────────────────────────────────
export interface ClientScore {
  client_name:    string;
  client_phone?:  string;
  bookings_count: number;
  total_spent:    number;
  last_booking:   string;
  score:          'VIP' | 'FREQUENT' | 'REGULAR' | 'NEW';
}

export interface RevenueSummary {
  today_revenue:          number;
  week_revenue:           number;
  month_revenue:          number;
  kouider_profit_month:   number;
  houari_revenue_month:   number;
  avg_booking_value:      number;
  total_bookings_month:   number;
  rejected_count:         number;
  rejected_revenue_lost:  number;
  top_clients:            ClientScore[];
  generated_at:           string;
}

export function useRevenue() {
  return usePoll<RevenueSummary>('/api/bi/revenue', 60_000);
}

// ── Heatmap ──────────────────────────────────────────────────
export interface HeatmapDay { date: string; count: number; }
export function useHeatmap() {
  return usePoll<HeatmapDay[]>('/api/bi/heatmap', 120_000);
}

// ── Reminders ────────────────────────────────────────────────
export interface SmartReminder {
  type:        'arrival_tomorrow' | 'missing_passport' | 'missing_deposit' | 'return_soon' | 'vehicle_prep' | 'age_alert';
  priority:    'HIGH' | 'MEDIUM' | 'LOW';
  client_name: string;
  car_name:    string;
  date:        string;
  message:     string;
  action:      string;
}

export function useReminders() {
  return usePoll<{ count: number; reminders: SmartReminder[] }>('/api/bi/reminders', 30_000);
}

// ── TikTok ───────────────────────────────────────────────────
export interface PostingWindow { day: string; time: string; score: number; reason: string; }
export interface TikTokIdea   { hook: string; style: string; car_name?: string; virality_score: number; }

export interface TikTokIntelligence {
  best_posting_windows:   PostingWindow[];
  ideas:                  TikTokIdea[];
  current_virality_score: number;
  apify_available:        boolean;
  generated_at:           string;
}

export function useTikTok() {
  return usePoll<TikTokIntelligence>('/api/bi/tiktok', 60_000);
}

// ── WhatsApp ─────────────────────────────────────────────────
export interface WhatsAppIntelligence {
  language:         string;
  intent:           string;
  is_booking_request: boolean;
  is_complaint:     boolean;
  age_check:        { should_decline: boolean; reason?: string };
  extracted:        {
    client_name?: string; start_date?: string; end_date?: string;
    budget?: number; age?: number; car_preference?: string;
  };
  suggested_response: string;
}

export function useWhatsAppAnalyze() {
  const [result, setResult]   = useState<WhatsAppIntelligence | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const analyze = useCallback(async (text: string, clientAge?: number) => {
    setLoading(true);
    setError(null);
    try {
      const data = await post<WhatsAppIntelligence>('/api/bi/whatsapp/analyze', { text, client_age: clientAge });
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur analyse');
    } finally {
      setLoading(false);
    }
  }, []);

  const generateResponse = useCallback(async (booking: { client_name: string; car_name: string; start_date?: string; end_date?: string; final_price?: number }) => {
    setLoading(true);
    try {
      const data = await post<{ message: string }>('/api/bi/whatsapp/response', booking);
      return data.message;
    } catch {
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { result, loading, error, analyze, generateResponse };
}

// ── TikTok hook generator ────────────────────────────────────
export function useTikTokHook() {
  const [hook, setHook]       = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const generate = useCallback(async (carName: string, style: 'lifestyle' | 'prix' | 'temoignage') => {
    setLoading(true);
    try {
      const data = await post<{ hook: string }>('/api/bi/tiktok/hook', { car_name: carName, style });
      setHook(data.hook);
    } finally {
      setLoading(false);
    }
  }, []);

  return { hook, loading, generate };
}

// ── System Health ────────────────────────────────────────────
export interface SystemHealth {
  redis:    { ok: boolean; ping_ms: number };
  supabase: { ok: boolean; ping_ms: number };
  scheduler: {
    queue: string; waiting: number; active: number;
    completed: number; failed: number; delayed: number;
    repeatable: number; redis_ping_ms: number;
  };
  process:  { uptime_s: number; memory_mb: number };
  claude:   { calls_today: number; tokens_in_today: number; tokens_out_today: number };
  generated_at: string;
}

export function useHealth() {
  return usePoll<SystemHealth>('/api/bi/health', 15_000);
}

// ── Live clock ───────────────────────────────────────────────
export function useClock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const iv = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(iv);
  }, []);
  return time;
}

// ── Logs ring buffer ─────────────────────────────────────────
const MAX_LOGS = 50;

export interface LogEntry { ts: string; level: 'INFO' | 'WARN' | 'ERROR'; msg: string; }

export function useLogStream() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    // Simulate log stream via polling scheduler status and generating structured logs
    const addLog = (level: LogEntry['level'], msg: string) => {
      setLogs(prev => [{ ts: new Date().toISOString(), level, msg }, ...prev].slice(0, MAX_LOGS));
    };

    addLog('INFO', 'Dashboard connecté — Dzaryx P14');

    const iv = setInterval(async () => {
      try {
        const res = await get<{ waiting: number; active: number; failed: number }>('/api/bi/health');
        if (res.failed > 0) addLog('WARN', `BullMQ: ${res.failed} job(s) échoué(s)`);
        else addLog('INFO', `Scheduler OK — active: ${res.active}`);
      } catch {
        addLog('ERROR', 'Ping backend échoué');
      }
    }, 20_000);

    return () => { clearInterval(iv); wsRef.current?.close(); };
  }, []);

  return logs;
}

// ── Formatter helpers ────────────────────────────────────────
export function fmtDZD(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M DA`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k DA`;
  return `${n.toLocaleString('fr-DZ')} DA`;
}

export function fmtPct(n: number): string {
  return `${Math.round(n)}%`;
}
