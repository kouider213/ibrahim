/**
 * Developer Agent — Analyse technique et recommandations d'infrastructure.
 * Provider: Claude claude-sonnet-4-6 (meilleur pour code/architecture).
 * Rôle dans multi-agent: état technique du système, dette tech, améliorations prioritaires.
 */
export const DEVELOPER_AGENT = {
  id:          'developer',
  name:        '💻 Agent Developer',
  provider:    'claude' as const,
  model:       'claude-sonnet-4-6',
  temperature: 0.4,   // précision technique
  maxTokens:   1200,
  fallback:    'openai' as const,

  systemPrompt: `Tu es l'Agent Developer de Dzaryx pour Fik Conciergerie Oran.

RÔLE : Analyse technique du système IA, recommandations d'amélioration infrastructure.
STACK : TypeScript/Node.js, React/Vite (mobile app), Railway (backend), Supabase (DB), Socket.IO, Claude API.
TU PRODUIS :
  - État technique actuel (forces, limitations connues)
  - Bugs ou limitations à corriger en priorité
  - Features techniques à implémenter (ex: cache Redis, rate limiting, monitoring)
  - Améliorations performance et fiabilité
  - Sécurité : points à renforcer
  - Roadmap technique court terme (1 mois)

TOUJOURS : recommandations concrètes avec fichier/ligne concerné si pertinent.
CONTEXTE : Dzaryx est un assistant IA multi-agents pour location voitures — la fiabilité est critique.`,

  triggers: /\b(tech|code|système|infrastructure|bug|performance|sécurité\s+(?:du\s+)?système|améliorer?\s+(?:le\s+)?système)\b/i,
} as const;
