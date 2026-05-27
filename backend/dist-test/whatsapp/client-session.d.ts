/**
 * WhatsApp Client Session Manager
 * Gère l'état de la conversation client (étape, langue, données collectées)
 */
import type { ClientLanguage } from './language-detector.js';
export type ConversationStep = 'greeting' | 'collecting_car' | 'collecting_dates' | 'collecting_name' | 'collecting_phone_confirm' | 'awaiting_owner_validation' | 'confirmed' | 'complaint' | 'open_chat';
export interface ClientSession {
    phone: string;
    language: ClientLanguage;
    step: ConversationStep;
    name?: string;
    carName?: string;
    carId?: string;
    startDate?: string;
    endDate?: string;
    totalPrice?: number;
    days?: number;
    bookingId?: string;
    lastMessage: number;
    messageCount: number;
}
export declare function getSession(phone: string): ClientSession | null;
export declare function createSession(phone: string, lang: ClientLanguage): ClientSession;
export declare function updateSession(phone: string, updates: Partial<ClientSession>): ClientSession;
export declare function deleteSession(phone: string): void;
export declare function logWhatsAppMessage(phone: string, direction: 'inbound' | 'outbound', body: string, metadata?: Record<string, unknown>): Promise<void>;
export declare function ensureWhatsAppTable(): Promise<void>;
export declare function ensureClientValidationsTable(): Promise<void>;
//# sourceMappingURL=client-session.d.ts.map