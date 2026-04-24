/**
 * WhatsApp Client Session Manager
 * Gère l'état de la conversation client (étape, langue, données collectées)
 */

import { supabase } from '../integrations/supabase.js';
import type { ClientLanguage } from './language-detector.js';

export type ConversationStep =
  | 'greeting'
  | 'collecting_car'
  | 'collecting_dates'
  | 'collecting_name'
  | 'collecting_phone_confirm'
  | 'awaiting_owner_validation'
  | 'confirmed'
  | 'complaint'
  | 'open_chat';

export interface ClientSession {
  phone:       string;
  language:    ClientLanguage;
  step:        ConversationStep;
  name?:       string;
  carName?:    string;
  carId?:      string;
  startDate?:  string;
  endDate?:    string;
  totalPrice?: number;
  days?:       number;
  bookingId?:  string;
  lastMessage: number; // timestamp
  messageCount: number;
}

// In-memory sessions (Redis pourrait remplacer en prod)
const sessions = new Map<string, ClientSession>();

const SESSION_TTL = 2 * 60 * 60 * 1000; // 2 heures

export function getSession(phone: string): ClientSession | null {
  const s = sessions.get(phone);
  if (!s) return null;
  // Expirer si inactif > 2h
  if (Date.now() - s.lastMessage > SESSION_TTL) {
    sessions.delete(phone);
    return null;
  }
  return s;
}

export function createSession(phone: string, lang: ClientLanguage): ClientSession {
  const session: ClientSession = {
    phone,
    language:     lang,
    step:         'greeting',
    lastMessage:  Date.now(),
    messageCount: 0,
  };
  sessions.set(phone, session);
  return session;
}

export function updateSession(phone: string, updates: Partial<ClientSession>): ClientSession {
  const existing = sessions.get(phone);
  if (!existing) {
    throw new Error(`Session not found for ${phone}`);
  }
  const updated = {
    ...existing,
    ...updates,
    lastMessage:  Date.now(),
    messageCount: existing.messageCount + 1,
  };
  sessions.set(phone, updated);
  return updated;
}

export function deleteSession(phone: string): void {
  sessions.delete(phone);
}

// Persister la session dans Supabase pour logs
export async function logWhatsAppMessage(
  phone:     string,
  direction: 'inbound' | 'outbound',
  body:      string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    await supabase.from('whatsapp_messages').insert({
      from_number: phone,
      body,
      direction,
      metadata: metadata ?? {},
    });
  } catch {
    // table might not exist yet — silently ignore
  }
}

// Créer la table si elle n'existe pas
export async function ensureWhatsAppTable(): Promise<void> {
  try {
    await supabase.rpc('exec_sql', {
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
  } catch {
    // ignore
  }
}

// Créer la table des validations client pending
export async function ensureClientValidationsTable(): Promise<void> {
  try {
    await supabase.rpc('exec_sql', {
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
  } catch {
    // ignore
  }
}
