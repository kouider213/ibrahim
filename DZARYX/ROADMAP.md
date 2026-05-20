# DZARYX — Feuille de Route

> Mise à jour : 2026-05-20
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
- ✅ Interface saisie `owner_price_per_day` depuis mobile native (formulaire nouvelle résa)
- ✅ Alert Telegram automatique si nouvelle résa sans owner_ppd

---

## Phase 6.5 — Simulateur Web Complet (✅ Terminé — 2026-05-20)

- ✅ Simulateur Android web (Netlify) : https://dzaryx-simulator.netlify.app
- ✅ 13 onglets : VOIX/CHAT/TELEGRAM/DZARYX/RESAS/PARC/CA/CLIENTS/AGENDA/ALERTES/RAPPELS/DOCS/CONFIG
- ✅ Boot simulation : locked → home → login (kouider/houari) → app
- ✅ Power button animation : power-off → DZARYX logo → arrêt
- ✅ Session persistée localStorage (auto-login)
- ✅ TelegramScreen : 6 canaux, tous types messages, démos réalistes
- ✅ CapacitesScreen : 14 agents, proactif timeline, 40+ capacités
- ✅ Design cyberpunk HUD uniforme (Orbitron + Share Tech Mono + corner brackets)
- ✅ Connexions réelles Railway API + Socket.IO
- ✅ Multi-acteur Kouider (cyan) / Houari (violet)

---

## Phase 6 — Mobile Native (✅ Terminé — dzaryx-native — 2026-05-18)

- ✅ App Expo SDK 54 / React Native / EAS Build APK
- ✅ Orb JARVIS animé (idle/listen/think/speak)
- ✅ Voice mode (Whisper → Claude → ElevenLabs)
- ✅ Push notifications acteur-scoped
- ✅ Écrans : bookings, new-booking, booking-detail, fleet, revenue, reminders, clients, settings, **documents**
- ✅ Saisie `client_price_per_day` + `owner_price_per_day` à la création (1 POST)
- ✅ Gestion clients avancée (scoring VIP, search, profil intelligence)
- ✅ Client intelligence backfill automatique (historique → profils IA)
- ✅ Rappels smart (HIGH/MEDIUM/LOW) dans app + contexte AI matinal
- ✅ **Bouton SCAN OCR** dans voice.tsx (caméra → OCR → AI → TTS)
- ✅ **Token acteur-scoped corrigé** dans voice.tsx (B020 fixé)
- ✅ **Écran Documents** : fetch passeport/permis/contrat + scan caméra OCR (B022 fixé)
- ✅ **Simulateur web parité complète** : 9 onglets identiques à l'APK — https://dzaryx-simulator.netlify.app

---

## Phase 7 — APK Android & iOS (❌ Bloqué EAS — Reset 1er juin 2026)

> Objectif : quitter Telegram + simulateur web → APK natif iOS + Android

- ❌ **APK Android** — EAS Free plan épuisé ce mois → reset 1er juin 2026
  - Commande : `EXPO_TOKEN=G7nmf_7VE1RreEeM3E5orMQJiVvGhLYt7Ze1jCN6 npx eas build --platform android --profile preview --non-interactive`
  - Résultat : fichier `.apk` à installer sur les téléphones Kouider + Houari
- 🔵 **App Store iOS** — EAS Submit après APK android validé
  - Nécessite compte Apple Developer (99$/an) + provisioning profile
  - Alternative : distribution via TestFlight pour test interne
- ✅ Code `dzaryx-native/` prêt — 9 écrans, voix, push notifs, OCR, multi-acteur

### Checklist avant lancement APK
- [ ] Railway : ajouter `MOBILE_TOKEN_HOUARI`
- [ ] Tester APK android sur téléphone Kouider + Houari
- [ ] Valider voix → Whisper → Claude → TTS end-to-end
- [ ] Valider push notifications (app fermée)
- [ ] Valider scan OCR passeport
- [ ] Google Maps API restreindre à Distance Matrix only
- [ ] Révoquer EAS token `G7nmf_7VE1RreEeM3E5orMQJiVvGhLYt7Ze1jCN6` après build

---

## Phase 8 — Automatisation Avancée (🔵 Planifié)

> Objectif : Dzaryx gère 100% du business de façon autonome

### 8.1 — WhatsApp Bot Client
- 🔵 Clients réservent via WhatsApp (pas par téléphone)
- 🔵 Twilio WhatsApp Cloud API ou Meta Cloud API
- 🔵 Flux : client envoie "je veux louer" → Dzaryx collecte infos → crée résa → envoie confirmation
- 🔵 Variables Railway manquantes : `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`
- Fichiers : `backend/src/api/routes/whatsapp.ts` (à créer)

### 8.2 — Contrats PDF Automatiques
- 🔵 Génération contrat de location à chaque réservation confirmée
- 🔵 PDFKit déjà installé (recettes PDF existent)
- 🔵 Template : nom client, voiture, dates, prix, conditions, signature zone
- 🔵 Upload Supabase bucket `client-documents`, URL stockée dans `bookings.contract_url`
- 🔵 Envoi automatique Telegram + WhatsApp

### 8.3 — Signature Électronique
- 🔵 Client signe via lien WhatsApp (canvas HTML → image PNG → stocké Supabase)
- 🔵 Alternative : PDF signable via HelloSign/DocuSign API

### 8.4 — Paiement Chargily (Algérie)
- 🔵 Chargily Pay API (paiement CB/CIB algérien)
- 🔵 Génération lien paiement → envoyé WhatsApp client
- 🔵 Webhook → Dzaryx reçoit confirmation → `record_payment()` → mise à jour Supabase

### 8.5 — Export Comptable Excel
- 🔵 Export mensuel/annuel : toutes réservations, paiements, profits K/H
- 🔵 Bibliothèque : `xlsx` ou `exceljs`
- 🔵 Envoi Telegram automatique le 1er de chaque mois

### 8.6 — TikTok Auto-post
- 🔵 Publication automatique vidéos TikTok (via Apify ou TikTok Business API)
- 🔵 Nexus PC peut lancer un script Python de post automatique
- 🔵 Calendrier publication : 1 vidéo/semaine, timing optimal (17h-19h vendredi)

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
