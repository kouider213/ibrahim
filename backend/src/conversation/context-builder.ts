import { getConversationHistory, getActiveRules } from '../integrations/supabase.js';
import { IBRAHIM } from '../config/constants.js';
import type { Message } from '../integrations/claude-api.js';

export interface ConversationContext {
  messages:    Message[];
  systemExtra: string;
  sessionId:   string;
}

export async function buildContext(
  sessionId: string,
  userMessage: string,
): Promise<ConversationContext> {
  const [history, rules] = await Promise.all([
    getConversationHistory(sessionId, 15),
    getActiveRules(),
  ]);

  const rulesText = rules.length > 0
    ? `\n\nRÈGLES MÉTIER ACTIVES:\n${rules.map(r => `- [${r.category}] ${r.rule}`).join('\n')}`
    : '';

  const dateInfo = `\n\nDate actuelle: ${new Date().toLocaleDateString('fr-DZ', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })}`;

  const systemExtra = rulesText + dateInfo;

  const messages: Message[] = [
    ...history.map(h => ({
      role:    h.role as 'user' | 'assistant',
      content: h.content,
    })),
    { role: 'user', content: userMessage },
  ];

  return { messages, systemExtra, sessionId };
}

export function formatIbrahimGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return `Bonjour, je suis ${IBRAHIM.NAME}, votre assistant ${IBRAHIM.AGENCY}.`;
  if (hour < 18) return `Bon après-midi, je suis ${IBRAHIM.NAME}.`;
  return `Bonsoir, je suis ${IBRAHIM.NAME}, assistant de ${IBRAHIM.AGENCY}.`;
}
