import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env.js';

export const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── Typed table helpers ───────────────────────────────────────

export type TaskStatus =
  | 'pending' | 'queued' | 'running' | 'waiting_validation'
  | 'completed' | 'failed' | 'cancelled';

export interface Task {
  id:          string;
  project_id?: string;
  title:       string;
  description?: string;
  action_type: string;
  payload:     Record<string, unknown>;
  status:      TaskStatus;
  priority:    number;
  created_by:  string;
  result?:     Record<string, unknown>;
  error?:      string;
  created_at:  string;
  updated_at:  string;
  completed_at?: string;
}

export interface Reservation {
  id:               string;
  client_name:      string;
  client_phone?:    string;
  client_email?:    string;
  vehicle_id:       string;
  vehicle_name:     string;
  start_date:       string;
  end_date:         string;
  pickup_location:  string;
  return_location:  string;
  daily_rate:       number;
  total_amount:     number;
  deposit?:         number;
  is_vip:           boolean;
  discount_pct:     number;
  status:           string;
  notes?:           string;
  created_at:       string;
}

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

// ── Query helpers ─────────────────────────────────────────────

export async function getActiveRules(): Promise<IbrahimRule[]> {
  const { data, error } = await supabase
    .from('ibrahim_rules')
    .select('*')
    .eq('active', true)
    .order('category');
  if (error) throw new Error(`Rules fetch failed: ${error.message}`);
  return (data ?? []) as IbrahimRule[];
}

export async function getConversationHistory(sessionId: string, limit = 20) {
  const { data, error } = await supabase
    .from('conversations')
    .select('role, content, created_at')
    .eq('session_id', sessionId)
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

export async function checkVehicleAvailability(
  vehicleId: string,
  startDate: string,
  endDate: string,
  excludeId?: string,
): Promise<boolean> {
  let query = supabase
    .from('reservations')
    .select('id', { count: 'exact', head: true })
    .eq('vehicle_id', vehicleId)
    .in('status', ['confirmed', 'active'])
    .lt('start_date', endDate)
    .gt('end_date', startDate);

  if (excludeId) query = query.neq('id', excludeId);

  const { count, error } = await query;
  if (error) throw new Error(`Availability check failed: ${error.message}`);
  return (count ?? 0) === 0;
}

export async function isVipClient(phone: string): Promise<boolean> {
  const { count } = await supabase
    .from('reservations')
    .select('id', { count: 'exact', head: true })
    .eq('client_phone', phone)
    .eq('is_vip', true);
  return (count ?? 0) > 0;
}
