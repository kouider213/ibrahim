# DZARYX — État Actuel du Projet

> **CE FICHIER EST MIS À JOUR À CHAQUE FIN DE SESSION.**
> Tout agent AI lit ce fichier EN PREMIER pour savoir où en est le projet.
> Dernière mise à jour : 2026-05-14

---

## Où en est le projet (maintenant)

**Phase active : Phase 5 (Finance) — TERMINÉE. Prêt pour Phase 6.**

Le système financier est maintenant normalisé. Les profits s'affichent avec les vrais prix négociés, pas les prix catalogue. 6 réservations existantes ont leurs prix Houari renseignés. Les tests passent.

---

## Ce qui fonctionne ✅

- Bot Telegram : répond, gère réservations, affiche rapports
- Calculs financiers : vrais prix (client_price_per_day × nb_days)
- Profit Kouider : calculé correctement depuis Supabase
- Revenue Intelligence : revenus jour/semaine/mois avec overlap filter
- Anti-hallucination Gates 1/2/3 : bloquants (pas log-only)
- document_access_logs : table OK, logs écrits
- Nonce anti-replay : Redis NX EX 600
- SSE terminal Nexus : streaming live par ligne
- Tests : 9/9 financiers, 11/11 anti-hallucination, 5/5 doc access logs
- TypeScript : 0 erreurs
- Railway : déployé, auto-deploy sur push main

---

## Ce qui ne fonctionne pas / incomplet ❌

### PRIORITÉ 1 — `create_booking` ne stocke pas client/owner price
- **Fichier** : `backend/src/integrations/tool-executor.ts`
- **Problème** : Quand Dzaryx crée une réservation via outil, `client_price_per_day` et `owner_price_per_day` ne sont pas stockés → profits manquants pour toutes les nouvelles résa
- **Fix** : Chercher l'outil `create_booking` dans `tool-executor.ts` → ajouter ces 2 champs dans l'INSERT

### PRIORITÉ 2 — `checkAnomalies()` filtre dates incorrect
- **Fichier** : `backend/src/integrations/phase5-finance.ts` ~ligne 440
- **Problème** : Filtre `start_date` seulement, pas overlap
- **Fix** : `.lte('start_date', monthEnd).gte('end_date', monthStart)`

### PRIORITÉ 3 — Cache Redis 30 min trop long
- **Fichier** : `backend/src/bi/revenue-intelligence.ts` ligne ~37
- **Problème** : Après modif Supabase, faut attendre 30 min
- **Fix** : Endpoint cache clear OU réduire TTL

---

## Prochaine priorité (à faire maintenant si tu reprends)

**FIX B001** : `tool-executor.ts` → `create_booking` → ajouter `client_price_per_day` + `owner_price_per_day` dans l'INSERT Supabase.

Après ce fix :
1. Tester : créer réservation via Dzaryx → vérifier dans Supabase les colonnes sont remplies
2. Mettre à jour BUGS.md (B001 → FIXÉ)
3. Mettre à jour CHANGELOG.md

---

## Dernière session (2026-05-14)

**Travail effectué :**
- Créé documentation Obsidian complète (dossier `DZARYX/`, 10 fichiers)
- Créé `CLAUDE.md` (lu automatiquement par Claude Code)
- Backfill `owner_price_per_day` dans Supabase pour 6 réservations existantes
- Réécriture système financier complet (9 tests passent)
- Sprint sécurité : Gates 2&3, nonce Redis, document_access_logs

**Commit dernier** : merge + docs DZARYX

---

## Stack rapide

```
Backend  : Node.js TypeScript / Express / Railway
DB       : Supabase (PostgreSQL)
Cache    : Upstash Redis
AI       : Claude Sonnet 4.6 (primary)
Mobile   : React 18 PWA (Vite)
PC Agent : Python (Nexus) — tourne sur PC Kouider
Telegram : canal principal Kouider
```

---

## Comment mettre à jour ce fichier

À la fin de chaque session, mettre à jour :
- La date en haut
- La section "Ce qui fonctionne"
- La section "Ce qui ne fonctionne pas"
- La section "Prochaine priorité"
- La section "Dernière session"
