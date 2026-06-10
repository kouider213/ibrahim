---
tags: [handoff, finance, regles-metier, critique]
---
# 💰 H08 — Finance & règles métier (CRITIQUE)
[[00 HANDOFF HUB|← Hub]]

> **Profit = (client_price_per_day − owner_price_per_day) × nb_days.** JAMAIS depuis le catalogue. Si owner_price NULL → profit null (jamais inventé).

## Qui déduit le prix proprio ?
- **Kouider loue** → il loue le véhicule du proprio → marge = `(prix client − prix proprio) × jours`. Plancher : prix client ≥ prix proprio.
- **Houari loue** → c'est **lui** le propriétaire → son CA = sa marge complète, **rien à déduire**.

Réf : [[dzaryx-margin-rule|note mémoire : règle marge]].

## Devises
- **€** : `base_price` (proprio) / `resale_price` (client).
- **DZD** : prix par voiture dans `houari_resale_price` (affiché "K: … DA" dans PARC). `houari_base_price` peu utilisé.
- CA et MARGE **séparés par devise** (€ et DZD). La MARGE est calculée **à la volée** (pas le champ stocké `profit_kouider`, souvent vide) = (client−proprio)×jours.

## Fichiers
`backend/src/integrations/finance.ts` (calculs réels), `phase5-finance.ts` (dashboard), `bi/revenue-intelligence.ts` (semaine/mois). UI : `BookingsScreen.tsx` (MARGE), `RevenueScreen.tsx` (CA + DZD).

## Pricing dynamique
`apply_dynamic_pricing` met à jour le prix/jour d'une voiture (bloque sous le prix proprio).

Suite : [[H09 Écrans]]
