"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Verification script: document_access_logs table in production Supabase.
 * Run: npx tsx --env-file ../.env src/tests/verify-doc-access-logs.ts
 */
const supabase_js_1 = require("@supabase/supabase-js");
const supabase = (0, supabase_js_1.createClient)(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
let passed = 0;
let failed = 0;
function ok(label) { console.log(`  ✅ ${label}`); passed++; }
function fail(label, detail) { console.error(`  ❌ ${label}: ${detail}`); failed++; }
async function run() {
    console.log('\n─── VÉRIFICATION document_access_logs ───\n');
    // 1. Table exists — select 0 rows
    console.log('1. Table exists?');
    const { error: selErr } = await supabase
        .from('document_access_logs')
        .select('id')
        .limit(1);
    if (selErr) {
        fail('Table exists', selErr.message);
    }
    else {
        ok('Table document_access_logs accessible');
    }
    // 2. Insert test row
    console.log('\n2. Insert test?');
    const testRow = {
        user_id: 999999999,
        action: 'view',
        doc_type: 'test_verify',
        client_name: 'TEST_VERIFY_SCRIPT',
        is_admin: true,
        masked: false,
        created_at: new Date().toISOString(),
    };
    const { data: inserted, error: insErr } = await supabase
        .from('document_access_logs')
        .insert(testRow)
        .select('id')
        .single();
    if (insErr) {
        fail('Insert test row', insErr.message);
    }
    else {
        ok(`Insert OK — id=${inserted?.id}`);
    }
    // 3. Read back
    console.log('\n3. Read back inserted row?');
    if (inserted?.id) {
        const { data: row, error: readErr } = await supabase
            .from('document_access_logs')
            .select('*')
            .eq('id', inserted.id)
            .single();
        if (readErr) {
            fail('Read back', readErr.message);
        }
        else {
            ok(`Read back OK — action=${row.action} doc_type=${row.doc_type} is_admin=${row.is_admin}`);
        }
        // 4. Cleanup test row
        console.log('\n4. Cleanup test row?');
        const { error: delErr } = await supabase
            .from('document_access_logs')
            .delete()
            .eq('id', inserted.id);
        if (delErr) {
            fail('Cleanup', delErr.message);
        }
        else {
            ok('Test row deleted');
        }
    }
    // 5. Count total rows (sanity)
    console.log('\n5. Row count sanity?');
    const { count, error: countErr } = await supabase
        .from('document_access_logs')
        .select('*', { count: 'exact', head: true });
    if (countErr) {
        fail('Count', countErr.message);
    }
    else {
        ok(`Total rows in table: ${count ?? 0}`);
    }
    console.log(`\n${'─'.repeat(45)}`);
    console.log(`Results: ✅ ${passed} passed | ❌ ${failed} failed`);
    if (failed > 0)
        process.exit(1);
}
run().catch(err => { console.error('FATAL:', err); process.exit(1); });
//# sourceMappingURL=verify-doc-access-logs.js.map