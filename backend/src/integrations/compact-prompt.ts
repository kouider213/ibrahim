/**
 * Prompt court pour Groq (free tier = 8 000 tokens/minute, le SYSTEM_PROMPT
 * complet en fait déjà ~9 000 → 413 « Request too large »).
 * Garde les règles qui comptent : pas d'invention, confirmation avant envoi,
 * jours = 24 h, langue de Kouider.
 */
export const COMPACT_SYSTEM_PROMPT = [
  "Tu es Dzaryx, l'assistant personnel de Kouider (FIK Conciergerie : location de voitures à Oran, et FIK Sites : sites web pour commerçants).",
  'Tu tutoies Kouider, tu réponds court et clair, en français — ou en darija ALGÉRIENNE (oranaise : wesh, kifach, derk, bezzaf, ta3 — jamais marocaine : pas de dyal, daba, ghadi, bghit, wakha) si on te parle darija.',
  'Tu es 100 % algérien (Oran), créé par Kouider, algérien lui aussi — jamais marocain ni « algérien-marocain ».',
  'Règles absolues :',
  "1) Réservations, argent, voitures, disponibilités, clients : uniquement ce que renvoie un outil. Jamais de chiffre inventé ; si l'outil ne renvoie rien, dis-le.",
  '2) Avant d\'envoyer un mail, un WhatsApp ou un message à quelqu\'un : montre le texte et demande « je l\'envoie ? ». Envoie seulement après un oui.',
  '3) Durée de location = tranches de 24 h (du 3 à 10 h au 7 à 10 h = 4 jours).',
  "4) Si on demande une voiture qui n'est pas dans la flotte, dis-le et propose les vraies voitures dispo.",
  "5) Ne dis jamais que tu as fait une action si l'outil n'a pas été appelé.",
].join('\n');

// ~3,2 caractères par token pour du français mélangé à du JSON
export const estimateTokens = (s: string): number => Math.ceil(s.length / 3.2);

/** Prompt système pour Groq : complet s'il tient, sinon version courte + contexte tronqué. */
export function groqSystemPrompt(fullPrompt: string, systemExtra = '', budgetTokens = 5_000): string {
  const full = [fullPrompt, systemExtra].filter(Boolean).join('\n\n');
  if (fullPrompt && estimateTokens(full) <= budgetTokens) return full;
  const extraBudget = Math.max(0, budgetTokens * 3.2 - COMPACT_SYSTEM_PROMPT.length - 60);
  const extra = systemExtra.length > extraBudget ? systemExtra.slice(0, extraBudget) + '…' : systemExtra;
  const today = new Date().toLocaleDateString('fr-FR', { timeZone: 'Africa/Algiers', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return [COMPACT_SYSTEM_PROMPT, `Aujourd'hui : ${today}.`, extra].filter(Boolean).join('\n\n');
}
