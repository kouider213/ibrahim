# DZARYX — Changelog

> Format : Date | Commit | Fichiers | Description
> Plus récent en haut.

---

## 2026-05-15 — Session matin (Claude Code / Sonnet 4.6)

### B006 ✅ — "Donne moi les revenu" bloqué anti-hallucination (fast-mode bug)
- **Fichiers** : `backend/src/integrations/claude-api.ts`, `backend/src/agents/agent-registry.ts`, `backend/src/integrations/llm-router.ts`
- **Cause réelle** : Message 20 chars < 30 → `isFastModeEligible` returnait `true` → Claude Haiku sans outils → Gate 2 bloquait.
- **Fix** :
  - `needsAction` regex élargi : ajout `revenu|revenus|bénéfice|profit|gagné|gain|argent|chiffre|recette|encaissé|dette|caisse|trésorerie`
  - FINANCE_AGENT keywords : ajout `revenu|revenus|bénéfice|profit|gagné|gain|rapport\s+fi`
  - FINANCE_AGENT provider : `openai/gpt-4o` → `claude-sonnet-4-6` (tool-calling fiable)
  - TOOL_KEYWORDS llm-router : ajout des mots FR manquants
- **Commits** : `55db5da`, `62de8d5`

### Revenus prorabilisés — today/week/month = jours réels (pas contrat entier)
- **Fichier** : `backend/src/bi/revenue-intelligence.ts`
- **Fix** : `proratedCA()` calcule uniquement les jours qui tombent dans la fenêtre demandée. Today = 1 jour × tarif journalier. Semaine = overlap 7 jours. Mois = overlap mois complet.

### Planning Kouider embarqué dans Dzaryx
- **Fichiers** : `backend/src/config/constants.ts`, `backend/src/conversation/proactive-engine.ts`
- **Ajouté** : `KOUIDER_SCHEDULE` (7 jours, wake/travail/business/famille), notifications proactives per-day, compréhension employé remise véhicules.

---

## 2026-05-14 — Session nuit (Claude Code / Sonnet 4.6)

### B005 ✅ — Vidéo marketing réellement livrée dans Telegram
- **Fichiers** : `backend/src/marketing/create-marketing-video.ts`, `backend/src/integrations/tool-executor.ts`
- **Problème** : Bot disait "✅ Vidéo créée" mais rien dans Telegram. Causes : zoompan OOM Railway, `sendPhoto(URL)` silencieux, phantom guard trompé.
- **Fix** :
  - Résolution 1080×1920 → **720×1280** (moins RAM Railway)
  - **Zoompan retiré** des deux branches FFmpeg (buildVideo1080)
  - `sendPhotoBuffer` (buffer multipart) remplace `sendPhoto(URL)` dans tous fallbacks outer
  - Messages échec commencent par `❌` → phantom guard bloque "✅ créée"
- **Commit** : `956117d`

---

## 2026-05-14 — Session soir (Claude Cowork)

### Obsidian vault "brain dzaryx" — refonte complète
- **Type** : Documentation
- **Vault** : `C:\Users\douba\OneDrive\Bureau\ibrahim\brain dzaryx\`
- **Notes créées/mises à jour** : 12 notes (INDEX, PROJET, ARCHITECTURE, FEUILLE DE ROUTE, BUGS, REGLES AGENT, INFRASTRUCTURE, JOURNAL, LES 12 AGENTS, VIDEO MARKETING, BASE DE DONNEES, FLUX REQUETE, ETAT ACTUEL)
- **Contenu ajouté** : 12 agents détaillés, flux requête complet, grille tarifaire véhicules, schéma DB, système vidéo
- **Graphe** : configuré avec couleurs par catégorie, nœuds plus grands, liens visibles

### VIDEO_MARKETING.md — nouveau fichier DZARYX/
- **Type** : Documentation
- **Fichier** : `DZARYX/VIDEO_MARKETING.md`
- **Contenu** : pipeline vidéo complet, styles, fonds Pexels, workflow approbation, bugs connus

---

## 2026-05-14 — Session matin (Claude Code / Sonnet 4.6)

### B001 ✅ — create_booking stocke maintenant les prix réels
- **Fichiers** : `backend/src/integrations/tool-executor.ts`, `backend/src/integrations/tools.ts`
- **Champs ajoutés** : `client_price_per_day`, `owner_price_per_day`, `nb_days`, `owner_total`, `profit_kouider`, `discount_applied`

### B004 ✅ — "fais une vidéo" route vers TIKTOK_AGENT
- **Fichier** : `backend/src/agents/agent-registry.ts`
- **Fix** : TIKTOK_AGENT priority 6→7, keywords élargis ("fais/crée/génère une vidéo"), LLM groq→claude-sonnet

### B005-partial ✅ — Photo fallback vidéo via buffer multipart
- **Fichiers** : `backend/src/api/routes/telegram.ts`, `backend/src/marketing/create-marketing-video.ts`
- **Fix** : `sendPhotoBuffer()` — envoi image en buffer (plus d'URL Supabase privée)

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
