"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logDocumentAccess = logDocumentAccess;
const supabase_js_1 = require("../integrations/supabase.js");
// Console + optional Supabase table (document_access_logs)
async function logDocumentAccess(ev) {
    const line = `[DOC_ACCESS] ${ev.timestamp} action=${ev.action} user=${ev.user_id}` +
        ` type=${ev.doc_type} admin=${ev.is_admin} masked=${ev.masked}` +
        ` client="${ev.client_name ?? '-'}" phone="${ev.client_phone ?? '-'}"`;
    console.log(line);
    try {
        const { error } = await supabase_js_1.supabase.from('document_access_logs').insert({
            user_id: ev.user_id,
            action: ev.action,
            doc_type: ev.doc_type,
            client_name: ev.client_name ?? null,
            client_phone: ev.client_phone ?? null,
            is_admin: ev.is_admin,
            masked: ev.masked,
            ip: ev.ip ?? null,
            created_at: ev.timestamp,
        });
        if (error) {
            console.error(`[DOC_ACCESS_LOG] Supabase insert failed: ${error.message} (code=${error.code}) — create table document_access_logs if missing`);
        }
    }
    catch (err) {
        console.error('[DOC_ACCESS_LOG] Unexpected error writing access log:', err);
    }
}
//# sourceMappingURL=document-access-log.js.map