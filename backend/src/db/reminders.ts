import { supabase } from '../integrations/supabase.js';

export interface ReminderRow {
  id:                string;
  title:             string | null;
  message:           string;
  remind_at:         string;
  timezone:          string;
  utc_offset:        string | null;
  local_time_iso:    string | null;
  timezone_source:   string | null;
  status:            'PENDING' | 'SENT' | 'FAILED' | 'CANCELLED' | 'DUPLICATE';
  sent_at:           string | null;
  failed_reason:     string | null;
  retry_count:       number;
  created_by:        string | null;
  session_id:        string | null;
  telegram_target:   string | null;
  pushover_target:   boolean;
  dedup_key:         string | null;
  provider_response: string | null;
  job_id:            string | null;
  created_at:        string;
}

export interface InsertReminderInput {
  message:          string;
  remind_at:        Date;
  timezone?:        string;
  utc_offset?:      string;
  local_time_iso?:  string;
  timezone_source?: string;
  title?:           string;
  created_by?:      string;
  session_id?:      string;
  telegram_target?: string;
  pushover_target?: boolean;
  dedup_key?:       string;
  job_id?:          string;
}

// Insert a new PENDING reminder — returns null if dedup_key already exists
export async function insertReminder(input: InsertReminderInput): Promise<ReminderRow | null> {
  // Check dedup first if key provided
  if (input.dedup_key) {
    const existing = await findByDedupKey(input.dedup_key);
    if (existing) return null; // duplicate — caller handles
  }

  const { data, error } = await supabase
    .from('reminders')
    .insert({
      message:          input.message,
      remind_at:        input.remind_at.toISOString(),
      timezone:         input.timezone ?? 'Europe/Brussels',
      utc_offset:       input.utc_offset ?? null,
      local_time_iso:   input.local_time_iso ?? null,
      timezone_source:  input.timezone_source ?? null,
      title:            input.title ?? null,
      created_by:       input.created_by ?? null,
      session_id:       input.session_id ?? null,
      telegram_target:  input.telegram_target ?? null,
      pushover_target:  input.pushover_target ?? true,
      dedup_key:        input.dedup_key ?? null,
      job_id:           input.job_id ?? null,
      status:           'PENDING',
    })
    .select()
    .single();

  if (error) {
    console.error('[reminders] Insert failed:', error.message);
    return null;
  }
  return data as ReminderRow;
}

// Find by dedup key
export async function findByDedupKey(key: string): Promise<ReminderRow | null> {
  const { data } = await supabase
    .from('reminders')
    .select()
    .eq('dedup_key', key)
    .maybeSingle();
  return (data as ReminderRow | null);
}

// Get all PENDING reminders due within next 90 seconds (worker buffer)
export async function getPendingDue(bufferSeconds = 90): Promise<ReminderRow[]> {
  const cutoff = new Date(Date.now() + bufferSeconds * 1000).toISOString();
  const { data, error } = await supabase
    .from('reminders')
    .select()
    .eq('status', 'PENDING')
    .lte('remind_at', cutoff)
    .order('remind_at', { ascending: true });

  if (error) {
    console.error('[reminders] getPendingDue error:', error.message);
    return [];
  }
  return (data ?? []) as ReminderRow[];
}

// Get FAILED reminders eligible for retry (retry_count < 3, past due).
// Throttling is handled by the Redis lock (5min TTL) in reminder-worker — not by this query.
export async function getRetryEligible(): Promise<ReminderRow[]> {
  const { data, error } = await supabase
    .from('reminders')
    .select()
    .eq('status', 'FAILED')
    .lt('retry_count', 3)
    .lte('remind_at', new Date().toISOString())
    .order('remind_at', { ascending: true })
    .limit(20);

  if (error) return [];
  return (data ?? []) as ReminderRow[];
}

// Update status after send attempt
export async function updateReminderStatus(
  id: string,
  status: 'SENT' | 'FAILED' | 'CANCELLED',
  opts: { sent_at?: Date; failed_reason?: string; provider_response?: string; retry_count?: number } = {},
): Promise<void> {
  const update: Record<string, unknown> = { status };
  if (opts.sent_at)           update['sent_at']           = opts.sent_at.toISOString();
  if (opts.failed_reason)     update['failed_reason']      = opts.failed_reason;
  if (opts.provider_response) update['provider_response']  = opts.provider_response;
  if (opts.retry_count !== undefined) update['retry_count'] = opts.retry_count;

  const { error } = await supabase.from('reminders').update(update).eq('id', id);
  if (error) console.error(`[reminders] updateStatus(${id}) failed:`, error.message);
}

// Mark as PENDING again (retry reset)
export async function resetToRetry(id: string, retryCount: number): Promise<void> {
  await supabase.from('reminders').update({ status: 'PENDING', retry_count: retryCount, failed_reason: null }).eq('id', id);
}

// List recent reminders for admin/debug
export async function listReminders(limit = 20): Promise<ReminderRow[]> {
  const { data } = await supabase
    .from('reminders')
    .select()
    .order('created_at', { ascending: false })
    .limit(limit);
  return (data ?? []) as ReminderRow[];
}
