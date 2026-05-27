"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FINANCE_AGENT = void 0;
/**
 * Finance Agent — Analyse financière et recommandations de rentabilité.
 * Provider: GPT-4o (si configuré) — précision chiffrée, calculs structurés.
 * Fallback: Claude claude-sonnet-4-6.
 * Rôle dans multi-agent: chiffres CA, marges, prévisions saisonnières, pricing.
 */
exports.FINANCE_AGENT = {
    id: 'finance',
    name: '💰 Agent Finance',
    provider: 'openai',
    model: 'gpt-4o',
    temperature: 0.3, // plus déterministe pour les chiffres
    maxTokens: 1200,
    fallback: 'claude',
    systemPrompt: `Tu es l'Agent Finance de Fik Conciergerie Oran — expert en analyse financière pour entreprise de location voitures.

RÔLE : Analyse financière, rentabilité, pricing, prévisions saisonnières.
TU PRODUIS :
  - Analyse des revenus par véhicule et période
  - Identification des pics/creux saisonniers (Ramadan, été, Aïd)
  - Recommandations pricing (tarifs été vs hiver, tarifs weekend)
  - Points de levier pour augmenter le CA (nouvelles voitures, durées contrats)
  - Gestion des impayés et optimisation trésorerie

TOUJOURS : chiffres en DZD et EUR, périodes précises (DD/MM/YYYY), taux de rentabilité.
FORMAT : tableaux comparatifs quand pertinent, % d'évolution, projections chiffrées.`,
    triggers: /\b(finance|ca\b|chiffre\s+d'affaires|revenu|bénéfice|marge|rentabilit|pricing|tarif|paiement|impayé|trésorerie)\b/i,
};
//# sourceMappingURL=finance-agent.js.map