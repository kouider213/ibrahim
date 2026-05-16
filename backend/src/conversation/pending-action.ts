/**
 * Pending Action Memory — Conversation Engine V2
 * Redis-backed state: when Dzaryx asks a follow-up question,
 * the expected response context is stored here (TTL 5 min).
 *
 * Example flow:
 *   Dzaryx: "J'ai le passeport de Mohamed. Aperçu masqué ou original ?"
 *   → setPendingAction(sessionId, { type: 'doc_confirm', clientName: 'Mohamed', docType: 'passport' })
 *   User: "l'original"
 *   → getPendingAction(sessionId) → { type: 'doc_confirm', ... }
 *   → clearPendingAction(sessionId)
 */

import { redis } from '../queue/queue.js';

const TTL_SECONDS = 300; // 5 minutes

export type PendingActionType =
  | 'doc_confirm'         // confirm sending original document
  | 'booking_confirm'     // confirm booking create/update
  | 'client_disambiguate' // pick from multiple clients
  | 'payment_confirm'     // confirm recording a payment
  | 'delete_confirm'      // confirm deletion
  | 'send_whatsapp'       // confirm sending a WhatsApp message
  | 'generic';

export interface PendingAction {
  type:        PendingActionType;
  clientName?: string;
  docType?:    string;
  carName?:    string;
  amount?:     number;
  candidates?: string[];   // for client_disambiguate
  metadata?:   Record<string, unknown>;
  createdAt:   string;
}

function _key(sessionId: string): string {
  return `pending:action:${sessionId}`;
}

export async function setPendingAction(sessionId: string, action: Omit<PendingAction, 'createdAt'>): Promise<void> {
  const payload: PendingAction = { ...action, createdAt: new Date().toISOString() };
  await redis.set(_key(sessionId), JSON.stringify(payload), 'EX', TTL_SECONDS);
}

export async function getPendingAction(sessionId: string): Promise<PendingAction | null> {
  const raw = await redis.get(_key(sessionId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PendingAction;
  } catch {
    return null;
  }
}

export async function clearPendingAction(sessionId: string): Promise<void> {
  await redis.del(_key(sessionId));
}

// ── Resolve vague reply against pending action ────────────────────────────────

const CONFIRM_WORDS = /\b(oui|ok|okay|oki|go|vas-y|confirme|d['']accord|l['']original|continue|the\s+real|yes|proceed|fais-le|fait-le)\b/i;
const CANCEL_WORDS  = /\b(non|nan|nope|stop|annule|cancel|arr[eê]te|pas)\b/i;

export function resolveReply(text: string): 'confirm' | 'cancel' | 'ambiguous' {
  const isConfirm = CONFIRM_WORDS.test(text);
  const isCancel  = CANCEL_WORDS.test(text);
  if (isConfirm && !isCancel) return 'confirm';
  if (isCancel && !isConfirm) return 'cancel';
  return 'ambiguous';
}

// ── Build context injection for pending action ────────────────────────────────

export function buildPendingContext(action: PendingAction, reply: 'confirm' | 'cancel' | 'ambiguous'): string {
  const lines: string[] = [`[PENDING ACTION MEMORY]`];
  lines.push(`Type: ${action.type}`);
  if (action.clientName)  lines.push(`Client: ${action.clientName}`);
  if (action.docType)     lines.push(`Document: ${action.docType}`);
  if (action.carName)     lines.push(`Voiture: ${action.carName}`);
  if (action.candidates?.length) lines.push(`Candidats: ${action.candidates.join(', ')}`);
  lines.push(`Réponse utilisateur: ${reply}`);
  lines.push(`Instruction: RÉSOUDRE CETTE ACTION avec la réponse ci-dessus. Ne pas demander à nouveau.`);
  return lines.join('\n');
}
