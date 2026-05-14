# DZARYX — Changelog

> Format : Date | Commit | Fichiers | Description
> Plus récent en haut.

---

## 2026-05-14

### Supabase — Backfill owner_price_per_day
- **Type** : Données (SQL, pas code)
- **Action** : UPDATE manuel dans Supabase SQL Editor
- **Véhicules mis à jour** :
  - Jumpy 9 Places → 44€/j
  - Fiat 500 X → 37€/j
  - Clio 4 → 19€/j
  - i10 → 19€/j
- **Résultat** : 6 réservations avec owner_price_per_day renseigné, profits calculables

### Obsidian Documentation créée
- **Type** : Documentation
- **Fichiers** : `DZARYX/` (dossier complet)
- **Contenu** : INDEX, PROJET, ARCHITECTURE, ROADMAP, BUGS, CHANGELOG, HANDOFF, ENV, DATABASE, REGLES_METIER

---

## 2026-05-13 — Sprint Critique Stabilisation + Finance

### Commit `f54e8c2` — fix(finance): remove all catalog fallbacks
- **Fichiers modifiés** :
  - `backend/src/integrations/finance.ts` — réécriture complète `computeBookingFinancials()`
  - `backend/src/integrations/phase5-finance.ts` — `resolveFinancials()` strict
  - `backend/src/bi/revenue-intelligence.ts` — vraies colonnes + overlap dates + `realBookingCA()`
  - `backend/src/bi/bi-engine.ts` — fallback `RevenueSummary` mis à jour
  - `backend/src/tests/financial-calculations.test.ts` — 9 tests financiers (nouveau)
- **Résultat** : 9/9 tests passent, 0 erreurs TypeScript

### Commit `c62b70a` — fix: normalize financial calculations
- **Fichiers modifiés** :
  - `backend/src/integrations/finance.ts`
  - `backend/src/integrations/phase5-finance.ts`
  - `backend/src/integrations/supabase.ts` — 5 nouveaux champs dans interface Booking
  - `backend/src/bi/revenue-intelligence.ts`
  - `backend/src/conversation/context-builder.ts`
  - `backend/src/tests/verify-doc-access-logs.ts` — nouveau
  - `supabase/migration_financial_fields.sql` — nouveau
- **Migration SQL exécutée** : colonnes `client_price_per_day`, `owner_price_per_day`, `owner_total`, `profit_kouider`, `discount_applied` ajoutées à `bookings`

### Commit `50aa0b3` — Sprint Critique (Security + Stability)
- **Gates 2&3** : `anti-hallucination.ts` → hard block (étaient log-only)
- **Orchestrator** : Guard pass 4 ajouté avec vrais `toolsExecuted`
- **Nonce** : RAM Set → Redis `SET NX EX 600`
- **document_access_logs** : table créée + catch non-silencieux
- **SSE terminal** : asyncio streaming par ligne
- **Tests** : `anti-hallucination.test.ts` (11 tests), `verify-doc-access-logs.ts` (5 tests)
- **Migration** : `migration_document_access_logs.sql` exécutée en prod

---

## 2026-05-10 à 2026-05-12 — Audit + Phase 2

- Audit complet 11 sections (score 62/100)
- Phase 2 Business Intelligence
- Multi-agent orchestration
- Context builder
- Revenue intelligence
- Schéma DB phase 2

---

## Avant 2026-05-10 — Phase 1

- Socle backend TypeScript
- Bot Telegram
- Gestion réservations de base
- Connexion Supabase initiale
- Phase 1 complète

---

## Comment ajouter une entrée

```markdown
## YYYY-MM-DD

### Commit `xxxxx` — description courte
- **Fichiers modifiés** : liste des fichiers
- **Résumé** : ce qui a changé et pourquoi
- **Tests** : résultat des tests
```
