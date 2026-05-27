"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeMemoryKey = computeMemoryKey;
exports.writeMemory = writeMemory;
exports.invalidateMemory = invalidateMemory;
exports.readMemory = readMemory;
exports.getMemoryStats = getMemoryStats;
exports.listMemoryByDomain = listMemoryByDomain;
const supabase_js_1 = require("../integrations/supabase.js");
const memory_selector_js_1 = require("../conversation/memory-selector.js");
const crypto_1 = __importDefault(require("crypto"));
// ── Normalize content for dedup comparison ───────────────────────────────────
// Lowercase, trim, strip simple punctuation, collapse whitespace
function normalizeContent(content) {
    return content
        .toLowerCase()
        .trim()
        .replace(/[.!?;:]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}
// ── Build a SHA256 dedup_key from normalized content + domain + user_id ──────
function buildDedupKey(value, domain, userId) {
    const normalized = normalizeContent(value);
    const raw = `${normalized}|${domain}|${userId}`;
    return crypto_1.default.createHash('sha256').update(raw, 'utf8').digest('hex');
}
/**
 * Exported for callers (e.g. rememberInfo) to compute a stable key before calling writeMemory.
 * Passing this as the `key` param means writeMemory's Step 2 domain+key check catches
 * normalized near-duplicates (punctuation/case variations of the same fact).
 */
function computeMemoryKey(content, domain, userId = 'kouider') {
    return buildDedupKey(content, domain, userId);
}
async function writeMemory(params) {
    const { key, value, domain, confidence = 0.9, source = 'orchestrator' } = params;
    // user_id: use source as user discriminator (rememberInfo passes 'remember_info')
    const userId = source;
    const dedupKey = buildDedupKey(value, domain, userId);
    try {
        // ── Step 1: Dedup check via normalized SHA256 hash ───────────────────────
        // Try to use the dedup_key column if it exists in the schema.
        // If the column does not exist, Supabase returns an error — we catch it and
        // fall back to a fuzzy ILIKE search on the first 100 chars of normalised value.
        let existingId = null;
        const { data: dedupHit, error: dedupErr } = await supabase_js_1.supabase
            .from('memory_facts')
            .select('id')
            .eq('dedup_key', dedupKey)
            .eq('is_current', true)
            .maybeSingle();
        if (!dedupErr && dedupHit) {
            // Exact hash match — definitive duplicate
            existingId = dedupHit.id;
            console.log(`[memory-engine] DUPLICATE_SKIPPED (hash) domain=${domain} dedup_key=${dedupKey.slice(0, 16)}… source=${source}`);
            return { success: true, id: existingId, operation: 'updated' };
        }
        if (dedupErr) {
            // dedup_key column probably doesn't exist yet → fallback: ILIKE on normalised content
            const normalizedSlice = normalizeContent(value).slice(0, 100);
            const { data: ilikHit } = await supabase_js_1.supabase
                .from('memory_facts')
                .select('id')
                .eq('domain', domain)
                .ilike('value', `%${normalizedSlice}%`)
                .eq('is_current', true)
                .maybeSingle();
            if (ilikHit) {
                existingId = ilikHit.id;
                console.log(`[memory-engine] DUPLICATE_SKIPPED (ilike fallback) domain=${domain} source=${source}`);
                return { success: true, id: existingId, operation: 'updated' };
            }
        }
        // ── Step 2: Check for existing fact with same domain+key (for update) ────
        const { data: existing, error: fetchErr } = await supabase_js_1.supabase
            .from('memory_facts')
            .select('id')
            .eq('domain', domain)
            .eq('key', key)
            .eq('is_current', true)
            .maybeSingle();
        if (fetchErr)
            throw fetchErr;
        if (existing) {
            // Build update payload — include dedup_key if column exists
            const updatePayload = {
                value,
                confidence,
                updated_at: new Date().toISOString(),
            };
            if (!dedupErr)
                updatePayload['dedup_key'] = dedupKey;
            const { error: updateErr } = await supabase_js_1.supabase
                .from('memory_facts')
                .update(updatePayload)
                .eq('id', existing.id);
            if (updateErr)
                throw updateErr;
            console.log(`[memory-engine] UPDATED domain=${domain} key="${key}" source=${source}`);
            return { success: true, id: existing.id, operation: 'updated' };
        }
        // ── Step 3: Insert new fact with dedup_key if column exists ──────────────
        const insertPayload = {
            domain, key, value, confidence, is_current: true, source,
        };
        if (!dedupErr)
            insertPayload['dedup_key'] = dedupKey;
        const { data: inserted, error: insertErr } = await supabase_js_1.supabase
            .from('memory_facts')
            .insert(insertPayload)
            .select('id')
            .single();
        if (insertErr)
            throw insertErr;
        console.log(`[memory-engine] CREATED domain=${domain} key="${key}" dedup_key=${dedupKey.slice(0, 16)}… source=${source}`);
        return { success: true, id: inserted.id, operation: 'created' };
    }
    catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        console.error(`[memory-engine] WRITE FAILED domain=${domain} key="${key}": ${error}`);
        return { success: false, id: null, operation: 'failed', error };
    }
}
async function invalidateMemory(domain, key) {
    try {
        const { error } = await supabase_js_1.supabase
            .from('memory_facts')
            .update({ is_current: false, updated_at: new Date().toISOString() })
            .eq('domain', domain)
            .eq('key', key)
            .eq('is_current', true);
        if (error)
            throw error;
        console.log(`[memory-engine] INVALIDATED domain=${domain} key="${key}"`);
        return true;
    }
    catch (err) {
        console.error(`[memory-engine] INVALIDATE FAILED ${domain}/${key}: ${err instanceof Error ? err.message : err}`);
        return false;
    }
}
// Read: delegates to existing scored memory-selector
async function readMemory(query, maxTokens = 300) {
    return (0, memory_selector_js_1.buildMemoryContext)(query, maxTokens);
}
async function getMemoryStats() {
    try {
        const { data, error } = await supabase_js_1.supabase
            .from('memory_facts')
            .select('domain')
            .eq('is_current', true);
        if (error)
            throw error;
        const domains = {};
        for (const row of data ?? []) {
            domains[row.domain] = (domains[row.domain] ?? 0) + 1;
        }
        return { total: (data ?? []).length, domains };
    }
    catch {
        return { total: 0, domains: {} };
    }
}
async function listMemoryByDomain(domain, limit = 20) {
    try {
        const { data, error } = await supabase_js_1.supabase
            .from('memory_facts')
            .select('id, domain, key, value, confidence, is_current, updated_at')
            .eq('domain', domain)
            .eq('is_current', true)
            .order('updated_at', { ascending: false })
            .limit(limit);
        if (error)
            throw error;
        return (data ?? []);
    }
    catch {
        return [];
    }
}
//# sourceMappingURL=memory-engine.js.map