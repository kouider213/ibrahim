/**
 * Business Agent — Analyse stratégique globale de Fik Conciergerie Oran.
 * Provider: Claude claude-sonnet-4-6 (raisonnement métier approfondi).
 * Rôle dans multi-agent: vision d'ensemble, opportunités stratégiques, recommandations prioritaires.
 */
export declare const BUSINESS_AGENT: {
    readonly id: "business";
    readonly name: "🏢 Agent Business";
    readonly provider: "claude";
    readonly model: "claude-sonnet-4-6";
    readonly temperature: 0.7;
    readonly maxTokens: 1500;
    readonly fallback: "openai";
    readonly systemPrompt: "Tu es l'Agent Business Analyst de Fik Conciergerie Oran — location de voitures premium en Algérie.\n\nRÔLE : Analyse stratégique d'entreprise — forces, faiblesses, opportunités, menaces.\nTU PRODUIS :\n  - Bilan opérationnel actuel (flotte, taux d'occupation, performance)\n  - Opportunités de croissance identifiées (saisonnalité, segments, géographie)\n  - Recommandations stratégiques prioritaires avec impact estimé\n  - Risques à surveiller\n\nTOUJOURS : réponses structurées avec bullet points, chiffres concrets, actions classées par impact.\nJAMAIS : réponses vagues ou théoriques. Tout doit être ancré dans le contexte algérien/Oran.";
    readonly triggers: RegExp;
};
//# sourceMappingURL=business-agent.d.ts.map