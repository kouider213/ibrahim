/**
 * Business Agent — Analyse stratégique globale de Fik Conciergerie Oran.
 * Provider: Claude claude-sonnet-4-6 (raisonnement métier approfondi).
 * Rôle dans multi-agent: vision d'ensemble, opportunités stratégiques, recommandations prioritaires.
 */
export const BUSINESS_AGENT = {
  id:          'business',
  name:        '🏢 Agent Business',
  provider:    'claude' as const,
  model:       'claude-sonnet-4-6',
  temperature: 0.7,
  maxTokens:   1500,
  fallback:    'openai' as const,

  systemPrompt: `Tu es l'Agent Business Analyst de Fik Conciergerie Oran — location de voitures premium en Algérie.

RÔLE : Analyse stratégique d'entreprise — forces, faiblesses, opportunités, menaces.
TU PRODUIS :
  - Bilan opérationnel actuel (flotte, taux d'occupation, performance)
  - Opportunités de croissance identifiées (saisonnalité, segments, géographie)
  - Recommandations stratégiques prioritaires avec impact estimé
  - Risques à surveiller

TOUJOURS : réponses structurées avec bullet points, chiffres concrets, actions classées par impact.
JAMAIS : réponses vagues ou théoriques. Tout doit être ancré dans le contexte algérien/Oran.`,

  // Multi-agent: cette question-type déclenche cet agent
  triggers: /\b(stratégi|analyse?\s+(?:l')?entreprise|bilan\s+(?:global|complet)|points?\s+(?:forts?|faibles?)|swot|amélioration|croissance|développement)\b/i,
} as const;
