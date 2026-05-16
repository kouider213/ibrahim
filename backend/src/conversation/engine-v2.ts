/**
 * Conversation Engine V2 — Dzaryx
 * Pipeline: normalize → extract entities → resolve pending action → inject context
 *
 * Called by orchestrator.ts BEFORE buildContext() to enrich the user message.
 */

import { normalizeMessage, type NormalizedMessage } from './normalizer.js';
import { extractEntities, type ExtractedEntities } from './entity-extractor.js';
import {
  getPendingAction,
  clearPendingAction,
  resolveReply,
  buildPendingContext,
  type PendingAction,
} from './pending-action.js';

export interface V2ProcessResult {
  // The message Claude should receive (may differ from original)
  processedMessage: string;
  // Original user message (for logging/saving)
  originalMessage:  string;
  // Extracted structured data
  entities:         ExtractedEntities;
  // Normalization metadata
  normalized:       NormalizedMessage;
  // Pending action if one was active
  pendingAction:    PendingAction | null;
  // Whether a pending action was resolved
  pendingResolved:  boolean;
  // Extra context to inject into system prompt
  contextAddition:  string;
  // Whether the message was modified
  wasModified:      boolean;
}

export async function preprocessMessage(
  rawMessage: string,
  sessionId:  string,
  knownClientNames: string[] = [],
): Promise<V2ProcessResult> {

  // ── Step 1: Normalize ────────────────────────────────────────────────────
  const normalized = normalizeMessage(rawMessage);

  // ── Step 2: Extract entities ─────────────────────────────────────────────
  const entities = extractEntities(normalized.normalized, knownClientNames);

  // ── Step 3: Resolve pending action ───────────────────────────────────────
  const pendingAction = await getPendingAction(sessionId);
  let pendingResolved = false;
  let contextAddition = '';
  let processedMessage = normalized.normalized;

  if (pendingAction) {
    const reply = resolveReply(normalized.normalized);

    if (reply === 'confirm' || reply === 'cancel') {
      // Clear the pending action — it's resolved
      await clearPendingAction(sessionId);
      pendingResolved = true;

      // Build context injection
      contextAddition = buildPendingContext(pendingAction, reply);

      // Enrich the processed message with context
      if (normalized.isShort) {
        processedMessage = `${normalized.normalized} [CONTEXTE: en réponse à ${pendingAction.type}${pendingAction.clientName ? ` pour ${pendingAction.clientName}` : ''}]`;
      }
    } else if (reply === 'ambiguous') {
      // Inject context but don't clear — may need further clarification
      contextAddition = buildPendingContext(pendingAction, 'ambiguous');
    }
  }

  // ── Step 4: Log corrections if any ───────────────────────────────────────
  if (normalized.corrections.length > 0) {
    console.log(
      `[engine-v2] corrections=[${normalized.corrections.join(' | ')}]` +
      ` session=${sessionId.slice(0, 20)}`,
    );
  }

  if (pendingAction && pendingResolved) {
    console.log(
      `[engine-v2] pending_resolved type=${pendingAction.type}` +
      ` client=${pendingAction.clientName ?? 'n/a'}` +
      ` session=${sessionId.slice(0, 20)}`,
    );
  }

  const wasModified = processedMessage !== rawMessage;

  return {
    processedMessage,
    originalMessage: rawMessage,
    entities,
    normalized,
    pendingAction,
    pendingResolved,
    contextAddition,
    wasModified,
  };
}

// ── Helpers for other modules to set pending actions ─────────────────────────
export { setPendingAction, clearPendingAction } from './pending-action.js';
export type { PendingAction, PendingActionType } from './pending-action.js';
