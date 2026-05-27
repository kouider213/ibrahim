"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.insertReminder = insertReminder;
exports.findByDedupKey = findByDedupKey;
exports.getPendingDue = getPendingDue;
exports.getRetryEligible = getRetryEligible;
exports.updateReminderStatus = updateReminderStatus;
exports.resetToRetry = resetToRetry;
exports.listReminders = listReminders;
const supabase_js_1 = require("../integrations/supabase.js");
// Insert a new PENDING reminder — returns null if dedup_key already exists
async function insertReminder(input) {
    // Check dedup first if key provided
    if (input.dedup_key) {
        const existing = await findByDedupKey(input.dedup_key);
        if (existing)
            return null; // duplicate — caller handles
    }
    const { data, error } = await supabase_js_1.supabase
        .from('reminders')
        .insert({
        message: input.message,
        remind_at: input.remind_at.toISOString(),
        timezone: input.timezone ?? 'Europe/Brussels',
        utc_offset: input.utc_offset ?? null,
        local_time_iso: input.local_time_iso ?? null,
        timezone_source: input.timezone_source ?? null,
        title: input.title ?? null,
        created_by: input.created_by ?? null,
        session_id: input.session_id ?? null,
        telegram_target: input.telegram_target ?? null,
        pushover_target: input.pushover_target ?? true,
        dedup_key: input.dedup_key ?? null,
        job_id: input.job_id ?? null,
        status: 'PENDING',
    })
        .select()
        .single();
    if (error) {
        console.error('[reminders] Insert failed:', error.message);
        return null;
    }
    return data;
}
// Find by dedup key
async function findByDedupKey(key) {
    const { data } = await supabase_js_1.supabase
        .from('reminders')
        .select()
        .eq('dedup_key', key)
        .maybeSingle();
    return data;
}
// Get all PENDING reminders due within next 90 seconds (worker buffer)
async function getPendingDue(bufferSeconds = 90) {
    const cutoff = new Date(Date.now() + bufferSeconds * 1000).toISOString();
    const { data, error } = await supabase_js_1.supabase
        .from('reminders')
        .select()
        .eq('status', 'PENDING')
        .lte('remind_at', cutoff)
        .order('remind_at', { ascending: true });
    if (error) {
        console.error('[reminders] getPendingDue error:', error.message);
        return [];
    }
    return (data ?? []);
}
// Get FAILED reminders eligible for retry (retry_count < 3, past due).
// Throttling is handled by the Redis lock (5min TTL) in reminder-worker — not by this query.
async function getRetryEligible() {
    const { data, error } = await supabase_js_1.supabase
        .from('reminders')
        .select()
        .eq('status', 'FAILED')
        .lt('retry_count', 3)
        .lte('remind_at', new Date().toISOString())
        .order('remind_at', { ascending: true })
        .limit(20);
    if (error)
        return [];
    return (data ?? []);
}
// Update status after send attempt
async function updateReminderStatus(id, status, opts = {}) {
    const update = { status };
    if (opts.sent_at)
        update['sent_at'] = opts.sent_at.toISOString();
    if (opts.failed_reason)
        update['failed_reason'] = opts.failed_reason;
    if (opts.provider_response)
        update['provider_response'] = opts.provider_response;
    if (opts.retry_count !== undefined)
        update['retry_count'] = opts.retry_count;
    const { error } = await supabase_js_1.supabase.from('reminders').update(update).eq('id', id);
    if (error)
        console.error(`[reminders] updateStatus(${id}) failed:`, error.message);
}
// Mark as PENDING again (retry reset)
async function resetToRetry(id, retryCount) {
    await supabase_js_1.supabase.from('reminders').update({ status: 'PENDING', retry_count: retryCount, failed_reason: null }).eq('id', id);
}
// List recent reminders for admin/debug
async function listReminders(limit = 20) {
    const { data } = await supabase_js_1.supabase
        .from('reminders')
        .select()
        .order('created_at', { ascending: false })
        .limit(limit);
    return (data ?? []);
}
//# sourceMappingURL=reminders.js.map