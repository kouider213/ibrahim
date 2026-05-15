# DZARYX — Handoff Agent AI

> Ce fichier est la première chose à lire pour tout agent AI (Claude Code, Codex, Cursor, etc.) qui reprend le projet.
> Dernière mise à jour : 2026-05-15

---

## Contexte rapide

**Dzaryx** (ex-Ibrahim) = assistant AI pour Kouider, gérant de Fik Conciergerie Oran (location de voitures). Backend TypeScript sur Railway, DB Supabase, PC Agent Python (Nexus).

---

## Étapes obligatoires avant de toucher au code

### 1. Lire dans l'ordre
1. [[INDEX]] — Vue d'ensemble
2. [[BUGS]] — État des bugs (ouverts en priorité)
3. [[ROADMAP]] — Ce qui est prévu
4. [[ARCHITECTURE]] — Comprendre le flux

### 2. Vérifier l'état du code
```bash
cd backend
npx tsc --noEmit        # DOIT retourner 0 erreurs
```

### 3. Lancer les tests existants
```bash
# Tests financiers (purs, sans Supabase)
npx tsx src/tests/financial-calculations.test.ts

# Avec env (nécessite .env)
npx tsx --env-file ../.env src/tests/anti-hallucination.test.ts
npx tsx --env-file ../.env src/tests/verify-doc-access-logs.ts
```

---

## Règles de développement ABSOLUES

### Ne jamais faire
- `tsc` avec erreurs → commit bloqué
- Utiliser prix catalogue pour calculer profits (voir [[BUGS]] #F001)
- Modifier `orchestrator-engine.ts` pour les Guards AI (voir [[ARCHITECTURE]])
- Committer sans `npx tsc --noEmit` = 0 erreurs

### Toujours faire
- `computeBookingFinancials()` depuis `finance.ts` pour tout calcul financier
- `resolveFinancials()` depuis `phase5-finance.ts` pour les dashboards
- Retourner `null` (jamais catalogue) si `owner_price_per_day` absent
- Mettre à jour [[BUGS]] et [[CHANGELOG]] après chaque modification

---

## Déploiement

```bash
git add <fichiers spécifiques>
git commit -m "fix: description courte

Détails...

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
git push origin main   # Railway redéploie automatiquement
```

**Jamais** : `git add -A` (risque d'inclure .env), `--no-verify`, `--force`

---

## Architecture en 1 paragraphe

Une requête arrive via Telegram/Mobile → `orchestrator.ts` construit le contexte via `context-builder.ts` → route vers un agent via `core-router.ts` → `orchestrator-engine.ts` appelle Claude API avec outils → `tool-executor.ts` exécute les outils Supabase → 4 Guards filtrent la réponse (Phantom, Financial, State, Scope) → réponse envoyée. Le PC Agent Nexus tourne en Python sur le PC de Kouider, connecté au backend via Socket.IO namespace `/nexus`.

---

## Calcul financier — règle fondamentale

```
profit_kouider = (client_price_per_day - owner_price_per_day) × nb_days

JAMAIS :
- catalog.benefit × nb_days     ← FAUX
- catalog.kouiderPrice           ← FAUX
- catalog.houariPrice            ← FAUX

SI owner_price_per_day = NULL :
→ profit = null  (jamais inventé, jamais catalogue)
→ Afficher : "Impossible de calculer sans données financières réelles"
```

Fonction à utiliser : `computeBookingFinancials()` dans `backend/src/integrations/finance.ts`

---

## Variables d'environnement

Voir [[ENV]] pour la liste complète. Le fichier `.env` est à la racine du projet (jamais committer).

---

## Comment noter le travail dans Obsidian après chaque modification

### Si bug fixé
Ouvrir [[BUGS]] → trouver le bug → changer `🔴 OUVERT` en `✅ FIXÉ` → ajouter date et description fix

### Si nouvelle feature
Ouvrir [[ROADMAP]] → trouver l'item → changer statut → ajouter note

### Toujours
Ouvrir [[CHANGELOG]] → ajouter entrée en haut avec date, fichiers modifiés, description

---

## Contacts et accès

- **Propriétaire** : Kouider (kouiderpablo@gmail.com)
- **Repo GitHub** : kouider213/ibrahim
- **Railway** : déployé sur compte Kouider
- **Supabase** : compte Kouider

---

## Si quelque chose ne marche pas

1. Vérifier Railway logs (backend crash ?)
2. Vérifier Supabase (table existe ?)
3. Vérifier Redis (Upstash UP ?)
4. `npx tsc --noEmit` → lire les erreurs
5. Chercher dans [[BUGS]] si déjà connu
6. Ajouter dans [[BUGS]] si nouveau

---

## État système au 2026-05-15 — ce qui est opérationnel

| Fonctionnalité | Statut | Notes |
|---|---|---|
| Bot Telegram | ✅ | Répond, réservations, rapports |
| Calculs financiers | ✅ | Vrais prix Supabase, zéro catalogue |
| Revenus prorabilisés | ✅ | today/week/month = jours réels |
| Documents clients | ✅ | Passeport/permis/contrat → Telegram |
| create_booking | ✅ | Prix réels stockés, car_id résolu depuis nom |
| Recherche web | ✅ | SearXNG + Jina Reader, sans clé API |
| Vidéo marketing | ✅ | FFmpeg 720×1280, livraison Telegram buffer |
| Planning Kouider | ✅ | KOUIDER_SCHEDULE 7 jours embarqué |
| Anti-hallucination | ✅ | Gates 1/2/3 bloquants |
| Nexus PC Agent | ✅ | Terminal streaming SSE live |
| Google Calendar | ✅ | Lecture + création + suppression |
| Vision | ✅ | Gemini → OpenAI → Claude Haiku cascade |

## Ce qui reste à faire (priorité)

1. **B003** : Fix `checkAnomalies()` filtre dates → `phase5-finance.ts` ~ligne 440
2. **B002** : Endpoint `POST /api/bi/cache/clear` ou TTL Redis 300s
3. **Phase 6 Mobile** : formulaire réservation avec saisie prix client + propriétaire
4. **Phase 4 restant** : TikTok posting automatique, Voice wake word, Music Spotify
