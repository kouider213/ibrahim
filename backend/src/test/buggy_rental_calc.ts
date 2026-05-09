/**
 * buggy_rental_calc.ts — MODULE TEST POUR PIPELINE AUTONOME TEST 9
 *
 * Ce fichier contient 3 bugs intentionnels détectés et corrigés automatiquement
 * par le Developer Agent + Code Reviewer Agent de Dzaryx.
 *
 * NE PAS CORRIGER MANUELLEMENT — géré par autonomous-pipeline.ts
 */

/** Calcule le coût total d'une location (prix/jour × nombre de jours). */
export function calculateRentalCost(pricePerDay: number, days: number): number {
  // BUG 1: opérateur + au lieu de * → retourne 1000+3=1003 au lieu de 1000*3=3000
  return pricePerDay + days;
}

/** Vérifie si un client est éligible à la location (âge minimum légal Algérie: 18 ans). */
export function isEligibleAge(age: number): boolean {
  // BUG 2: opérateur > strict au lieu de >= → refuse les clients de 18 ans exactement
  return age > 18;
}

/** Applique une réduction saisonnière (ex: 10% sur le coût de base). */
export function applySeasonalDiscount(baseCost: number, discountPercent: number): number {
  // BUG 3: soustraction directe au lieu de % → retire 10 DZD au lieu de 10% du total
  return baseCost - discountPercent;
}
