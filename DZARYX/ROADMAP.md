# DZARYX — Feuille de Route

> Mise à jour : 2026-05-15
> Légende : ✅ Terminé | 🔄 En cours | 🔵 Planifié | ❌ Bloqué

---

## Phase 1 — Socle (✅ Terminé)

- ✅ Backend Express + TypeScript
- ✅ Connexion Supabase (bookings, cars, profiles)
- ✅ Bot Telegram fonctionnel
- ✅ Gestion réservations (créer, modifier, annuler)
- ✅ Disponibilité véhicules
- ✅ Calcul prix de base
- ✅ Schéma DB initial (`schema-phase1.sql`)

---

## Phase 2 — Intelligence (✅ Terminé)

- ✅ Multi-agent orchestration (core-router.ts)
- ✅ LLM Router (Claude + OpenAI + Gemini + Groq)
- ✅ Context builder (charge données avant réponse AI)
- ✅ Intent detector (comprend ce que veut l'utilisateur)
- ✅ Business Intelligence (revenue-intelligence.ts)
- ✅ Scoring clients (VIP / Frequent / Regular / New)
- ✅ Proactive engine (rappels automatiques)
- ✅ Schéma DB phase 2 (`schema-phase2.sql`)

---

## Phase 3 — Sécurité & Stabilisation (✅ Terminé — Sprint 2026-05)

- ✅ **Gate 1 Phantom Guard** — bloque write claims sans outil Write réel
- ✅ **Gates 2&3 Anti-hallucination** — hard block (étaient log-only → fixé)
- ✅ **document_access_logs** — table Supabase + log non-silencieux
- ✅ **Nonce anti-replay** — Redis NX EX 600 (était RAM, reset sur restart)
- ✅ **SSE streaming terminal** — nexus:terminal_chunk par ligne
- ✅ **11 tests anti-hallucination** — tous passent
- ✅ **5 tests document_access_logs** — tous passent

---

## Phase 4 — Nexus PC Agent (✅ Terminé — core fonctionnel)

- ✅ WebSocket client Python connecté
- ✅ Exécution commandes terminal
- ✅ Streaming SSE terminal live
- ✅ Gestion fichiers
- ✅ Git manager
- ✅ Vision (capture écran)
- ✅ Wake on LAN
- ✅ Morning briefing proactif (KOUIDER_SCHEDULE embarqué, notifications per-day)
- 🔵 Voice (wake word "Dzaryx" → commande vocale)
- 🔵 Auto-unlock (déverrouillage PC automatique)
- 🔵 TikTok automation (posting automatique)
- 🔵 Music control (Spotify)

---

## Phase 5 — Finance Normalisée (✅ Terminé — 2026-05-14)

- ✅ Colonnes Supabase : `client_price_per_day`, `owner_price_per_day`, `owner_total`, `profit_kouider`, `discount_applied`
- ✅ Backfill `client_price_per_day` depuis `final_price` existant
- ✅ Backfill `owner_price_per_day` pour réservations existantes
- ✅ `computeBookingFinancials()` — calcul strict sans catalogue
- ✅ `resolveFinancials()` — zéro catalogue fallback
- ✅ Revenue Intelligence — vraies colonnes financières
- ✅ Filtres dates overlap (start ≤ période ≤ end)
- ✅ Revenus prorabilisés (today/week/month = jours réels × tarif journalier)
- ✅ 9 tests financiers — tous passent
- ✅ Profit = null si owner_ppd absent (jamais inventé)
- ✅ create_booking stocke client_price_per_day + owner_price_per_day (B001 fixé)
- ✅ Recherche documents clients + envoi Telegram (passeport, permis, contrat)
- ✅ Recherche web réelle (SearXNG + Jina Reader, sans clé API)
- ✅ GENERAL_AGENT (web_search toujours actif, min 2 tentatives)
- ✅ Veille concurrents multi-sources réelle
- ✅ Création vidéo marketing 720×1280 livrée Telegram (B005 fixé)
- 🔵 Interface de saisie `owner_price_per_day` depuis mobile (pour nouvelles résa)
- 🔵 Alert automatique si nouvelle résa sans owner_ppd

---

## Phase 6 — Mobile PWA (🔵 Planifié)

- 🔵 Dashboard financier interactif
- 🔵 Saisie `client_price_per_day` et `owner_price_per_day` à la création réservation
- 🔵 Vue calendrier disponibilités
- 🔵 Gestion clients avancée
- 🔵 Notifications push mobile

---

## Phase 7 — Automatisation avancée (🔵 Planifié)

- 🔵 WhatsApp bot client (réservations automatiques)
- 🔵 Génération automatique contrats PDF
- 🔵 Signature électronique
- 🔵 Intégration paiement (Chargily ou autre)
- 🔵 Reporting comptable automatique (export Excel)

---

## Bugs prioritaires à corriger (voir [[BUGS]])

1. ~~`create_booking` ne stocke pas les prix réels~~ → ✅ FIXÉ (B001 — 2026-05-14)
2. ~~Revenus sur contrat entier au lieu de jours réels~~ → ✅ FIXÉ (proratedCA — 2026-05-15)
3. ~~"Donne moi les revenu" bloqué anti-hallucination~~ → ✅ FIXÉ (B006 — 2026-05-15)
4. **B003** 🔴 `checkAnomalies()` filtre start_date seulement (pas overlap) — PRIORITÉ 1
5. **B002** 🔴 Cache Redis 30 min trop long — PRIORITÉ 2

---

## Notes stratégiques

- **Phase 6 mobile** : priorité suivante — formulaire réservation avec saisie prix client + propriétaire
- **TikTok posting automatique** : Phase 4 restant — nécessite Apify ou API TikTok
- **Objectif long terme** : Dzaryx gère 100% du business de façon autonome (relances, facturation, contrats, posting TikTok)
