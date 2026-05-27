"use strict";
/**
 * WhatsApp Client Session Manager
 * Gère l'état de la conversation client (étape, langue, données collectées)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSession = getSession;
exports.createSession = createSession;
exports.updateSession = updateSession;
exports.deleteSession = deleteSession;
exports.logWhatsAppMessage = logWhatsAppMessage;
exports.ensureWhatsAppTable = ensureWhatsAppTable;
exports.ensureClientValidationsTable = ensureClientValidationsTable;
const supabase_js_1 = require("../integrations/supabase.js");
// In-memory sessions (Redis pourrait remplacer en prod)
const sessions = new Map();
const SESSION_TTL = 2 * 60 * 60 * 1000; // 2 heures
function getSession(phone) {
    const s = sessions.get(phone);
    if (!s)
        return null;
    // Expirer si inactif > 2h
    if (Date.now() - s.lastMessage > SESSION_TTL) {
        sessions.delete(phone);
        return null;
    }
    return s;
}
function createSession(phone, lang) {
    const session = {
        phone,
        language: lang,
        step: 'greeting',
        lastMessage: Date.now(),
        messageCount: 0,
    };
    sessions.set(phone, session);
    return session;
}
function updateSession(phone, updates) {
    const existing = sessions.get(phone);
    if (!existing) {
        throw new Error(`Session not found for ${phone}`);
    }
    const updated = {
        ...existing,
        ...updates,
        lastMessage: Date.now(),
        messageCount: existing.messageCount + 1,
    };
    sessions.set(phone, updated);
    return updated;
}
function deleteSession(phone) {
    sessions.delete(phone);
}
// Persister la session dans Supabase pour logs
async function logWhatsAppMessage(phone, direction, body, metadata) {
    try {
        await supabase_js_1.supabase.from('whatsapp_messages').insert({
            from_number: phone,
            body,
            direction,
            metadata: metadata ?? {},
        });
    }
    catch {
        // table might not exist yet — silently ignore
    }
}
// Créer la table si elle n'existe pas
async function ensureWhatsAppTable() {
    try {
        await supabase_js_1.supabase.rpc('exec_sql', {
            sql: `
        CREATE TABLE IF NOT EXISTS whatsapp_messages (
          id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          from_number TEXT NOT NULL,
          body        TEXT NOT NULL,
          direction   TEXT NOT NULL CHECK (direction IN ('inbound','outbound')),
          media_count INT  DEFAULT 0,
          metadata    JSONB DEFAULT '{}',
          created_at  TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS whatsapp_messages_phone_idx ON whatsapp_messages(from_number);
        CREATE INDEX IF NOT EXISTS whatsapp_messages_dir_idx   ON whatsapp_messages(direction);
      `,
        });
    }
    catch {
        // ignore
    }
}
// Créer la table des validations client pending
async function ensureClientValidationsTable() {
    try {
        await supabase_js_1.supabase.rpc('exec_sql', {
            sql: `
        CREATE TABLE IF NOT EXISTS client_booking_requests (
          id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          phone        TEXT NOT NULL,
          client_name  TEXT,
          car_name     TEXT,
          car_id       UUID,
          start_date   DATE,
          end_date     DATE,
          days         INT,
          total_price  NUMERIC,
          language     TEXT DEFAULT 'fr',
          status       TEXT DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
          notes        TEXT,
          created_at   TIMESTAMPTZ DEFAULT NOW(),
          updated_at   TIMESTAMPTZ DEFAULT NOW()
        );
      `,
        });
    }
    catch {
        // ignore
    }
}
//# sourceMappingURL=client-session.js.map