/**
 * buggy_rental_calc.ts — MODULE TEST POUR PIPELINE AUTONOME TEST 9
 *
 * Ce fichier contient 3 bugs intentionnels détectés et corrigés automatiquement
 * par le Developer Agent + Code Reviewer Agent de Dzaryx.
 *
 * NE PAS CORRIGER MANUELLEMENT — géré par autonomous-pipeline.ts
 */
/** Calcule le coût total d'une location (prix/jour × nombre de jours). */
export declare function calculateRentalCost(pricePerDay: number, days: number): number;
/** Vérifie si un client est éligible à la location (âge minimum légal Algérie: 18 ans). */
export declare function isEligibleAge(age: number): boolean;
/** Applique une réduction saisonnière (ex: 10% sur le coût de base). */
export declare function applySeasonalDiscount(baseCost: number, discountPercent: number): number;
//# sourceMappingURL=buggy_rental_calc.d.ts.map