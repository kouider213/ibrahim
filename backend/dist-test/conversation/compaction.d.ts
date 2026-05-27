/**
 * COMPACTION — Compression intelligente de l'historique de conversation
 *
 * Quand la conversation devient trop longue (>20 messages ou >8000 tokens estimés),
 * Dzaryx résume les anciens échanges en un bloc compact "mémoire de session"
 * sans perdre les informations importantes (réservations, décisions, préférences).
 *
 * Stratégie:
 *   1. Garder les 6 derniers messages toujours intacts (contexte immédiat)
 *   2. Résumer les messages plus anciens en un seul bloc "RÉSUMÉ DE SESSION"
 *   3. Stocker le résumé en DB pour les sessions longues
 *   4. Réinjecter le résumé comme premier message de l'historique
 */
import type { Message } from '../integrations/claude-api.js';
export declare function needsCompaction(messages: Message[]): boolean;
export declare function loadCompactionSummary(sessionId: string): Promise<string | null>;
export declare function compactIfNeeded(messages: Message[], sessionId: string): Promise<Message[]>;
export declare function emergencyCompact(messages: Message[], sessionId: string): Promise<Message[]>;
//# sourceMappingURL=compaction.d.ts.map