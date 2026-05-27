import type { ToolExecution } from '../integrations/claude-api.js';
export declare const PHANTOM_REFUSAL = "\u26A0\uFE0F Je n'ai pas ex\u00E9cut\u00E9 cette action. Aucun outil r\u00E9el n'a \u00E9t\u00E9 appel\u00E9 \u2014 je ne peux pas confirmer avoir effectu\u00E9 quoi que ce soit.";
/**
 * Protection bloquante anti-phantom : si la réponse contient une affirmation
 * d'action write SANS qu'un outil write ait réellement été appelé avec succès,
 * retourne le PHANTOM_REFUSAL à la place.
 */
export declare function phantomGuard(text: string, toolsExecuted: ToolExecution[], userMessage: string, requestId: string): string;
/**
 * Check if the user's message requires a specific tool.
 * Returns a blocking message if the tool is unavailable or didn't succeed,
 * or null if the request is fine to proceed.
 *
 * Call BEFORE sending the message to Claude.
 */
export declare function checkToolRequirements(userMessage: string, toolsExecuted: ToolExecution[], requestId: string): string | null;
/**
 * Early-exit check for requests that require unavailable tools.
 * Returns a refusal string if the required API key is missing, null otherwise.
 * Call BEFORE invoking Claude.
 */
export declare function earlyToolAvailabilityCheck(userMessage: string, requestId: string): string | null;
export declare function isNewInstruction(userMessage: string): boolean;
/**
 * Strip a leaked confirmation prefix from a Claude response.
 * Last-resort safety net — main fix is context-builder.ts history slimming.
 */
export declare function guardResponse(text: string, userMessage: string, requestId: string): string;
/**
 * Remove paragraphs that contain old video task results from non-video responses.
 * Applied AFTER guardResponse for a two-pass cleanup.
 */
export declare function applyScopeGuard(text: string, userMessage: string, requestId: string): string;
//# sourceMappingURL=response-guard.d.ts.map