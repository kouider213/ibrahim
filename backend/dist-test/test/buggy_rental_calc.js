"use strict";
/**
 * buggy_rental_calc.ts — MODULE TEST POUR PIPELINE AUTONOME TEST 9
 *
 * Ce fichier contient 3 bugs intentionnels détectés et corrigés automatiquement
 * par le Developer Agent + Code Reviewer Agent de Dzaryx.
 *
 * NE PAS CORRIGER MANUELLEMENT — géré par autonomous-pipeline.ts
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateRentalCost = calculateRentalCost;
exports.isEligibleAge = isEligibleAge;
exports.applySeasonalDiscount = applySeasonalDiscount;
/** Calcule le coût total d'une location (prix/jour × nombre de jours). */
function calculateRentalCost(pricePerDay, days) {
    // BUG 1: opérateur + au lieu de * → retourne 1000+3=1003 au lieu de 1000*3=3000
    return pricePerDay * days;
}
/** Vérifie si un client est éligible à la location (âge minimum légal Algérie: 18 ans). */
function isEligibleAge(age) {
    // BUG 2: opérateur > strict au lieu de >= → refuse les clients de 18 ans exactement
    return age >= 18;
}
/** Applique une réduction saisonnière (ex: 10% sur le coût de base). */
function applySeasonalDiscount(baseCost, discountPercent) {
    // BUG 3: soustraction directe au lieu de % → retire 10 DZD au lieu de 10% du total
    return baseCost - (baseCost * discountPercent) / 100;
}
//# sourceMappingURL=buggy_rental_calc.js.map