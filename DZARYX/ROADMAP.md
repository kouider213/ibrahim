# DZARYX — Feuille de Route

> Mise à jour : 2026-05-21
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

## Phase 6.5 — Simulateur Web Complet (✅ Terminé — 2026-05-21)

- ✅ Simulateur Android web (GitHub Pages) : **https://kouider213.github.io/ibrahim/**
- ✅ 12 onglets : VOIX/CHAT/DZARYX/RESAS/PARC/CA/CLIENTS/AGENDA/ALERTES/RAPPELS/DOCS/CONFIG
- ✅ Boot simulation : locked → home → login (kouider/houari) → app
- ✅ Power button animation : power-off → DZARYX logo → arrêt
- ✅ Session persistée localStorage (auto-login)
- ✅ CapacitesScreen : 14 agents, proactif timeline, 40+ capacités
- ✅ Design cyberpunk HUD uniforme (Orbitron + Share Tech Mono + corner brackets)
- ✅ Connexions réelles Railway API + Socket.IO
- ✅ Multi-acteur Kouider (cyan #00e5ff) / Houari (violet #7c3aed)
- ✅ **GPS LIVRAISON panel** (RESAS) : adresse → distance/temps/frais DZD/Waze/GMaps
- ✅ **Contrat PDF panel** (DOCS) : génération contrat simulée — Phase 8
- ✅ **Règles Apprises panel** (CONFIG) : 6 règles seed — Phase 8
- ⚠️ Tab Telegram SUPPRIMÉ — décision Kouider définitive (backup/admin seulement)

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
- ✅ Railway : `MOBILE_TOKEN_HOUARI` ajouté 2026-05-21
- ✅ Railway : `GOOGLE_MAPS_API_KEY` ajouté 2026-05-21
- [ ] Tester APK android sur téléphone Kouider + Houari
- [ ] Valider voix → Whisper → Claude → TTS end-to-end
- [ ] Valider push notifications (app fermée)
- [ ] Valider scan OCR passeport
- [ ] Google Maps API restreindre à Distance Matrix only (Google Cloud Console)
- [ ] Révoquer EAS token `G7nmf_7VE1RreEeM3E5orMQJiVvGhLYt7Ze1jCN6` après build

---

## Phase 8 — Automatisation Avancée (🔄 Partiellement terminé — 2026-05-21)

> Objectif : Dzaryx gère 100% du business de façon autonome

### 8.0 — Mémoire & Apprentissage (✅ Terminé — 2026-05-21)
- ✅ Table `learned_rules` : règles apprises par conversation
- ✅ Outils `save_learned_rule` / `list_learned_rules`
- ✅ Règles injectées automatiquement dans contexte Claude (`context-builder.ts`)
- ✅ "Dzaryx retiens que..." → sauvegarde immédiate
- ✅ Table `assistant_profiles` : profil Dzaryx par acteur (Kouider/Houari)
- ✅ Tables `user_behavior` + `conversation_patterns`
- ✅ Migration Phase 8 SQL appliquée Supabase (7 tables)

### 8.1 — WhatsApp Bot Vitrine (🔵 Août 2026 — décision Kouider)
- 🔵 Bot vitrine SEULEMENT : liste véhicules dispo + tarifs + promotions
- 🔵 PAS de réservation automatique (info uniquement)
- 🔵 Twilio WhatsApp Cloud API
- 🔵 Variables Railway à ajouter : `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`
- 🔵 Table `whatsapp_messages` déjà créée (Phase 8 migration)

### 8.2 — Contrats PDF Automatiques (✅ Terminé — 2026-05-21)
- ✅ `generate_contract` tool : contrat PDF signable avec CGV + zones signature
- ✅ `backend/src/integrations/generate-contract.ts`
- ✅ Table `contracts` créée (Phase 8 migration)
- ✅ Simulateur : panel "GÉNÉRER CONTRAT PDF" dans DOCS
- 🔵 Upload Supabase bucket + envoi WhatsApp automatique (attendre WhatsApp août 2026)

### 8.3 — Signature Électronique (🔵 Planifié)
- 🔵 Client signe via lien (canvas HTML → image PNG → stocké Supabase)
- 🔵 Dépend de WhatsApp (août 2026)

### 8.4 — Paiement Chargily (⚪ Won't Fix — décision Kouider)
- ⚪ Chargily Pay API — Kouider a décidé de ne pas faire pour l'instant
- ⚪ Table `payment_links` créée mais non utilisée

### 8.5 — Export Comptable Excel (✅ Terminé — 2026-05-26)
- ✅ `export_excel` tool : rapport .xlsx envoyé Telegram (3 feuilles : resas, bilan, par voiture)
- ✅ `backend/src/integrations/excel-export.ts`
- ✅ Package `xlsx` installé
- ✅ `jobMonthlyExcel` BullMQ — cron `30 9 1 * *` → 9h30 le 1er du mois, envoi Telegram + Cloudinary

### 8.6 — GPS & Livraison (✅ Terminé — 2026-05-21)
- ✅ `maps.ts` : Google Distance Matrix API + fallback vol d'oiseau
- ✅ `calculate_delivery_fee` tool : dépôt Es Sénia → adresse client, 200 DZD/km
- ✅ `get_travel_time` tool : temps trajet + trafic + Waze + Google Maps
- ✅ 8 landmarks Oran préchargés (aéroport, centre, port, Bir El Djir, Ain Turk, Arzew...)
- ✅ `GOOGLE_MAPS_API_KEY` configuré Railway
- ✅ Simulateur : panel GPS LIVRAISON interactif dans RESAS
- 🔵 Suivi flotte GPS live → nécessite hardware trackers (~25-50€/voiture + SIM 4G)

### 8.7 — Firebase FCM Natif (🔵 Attendre APK juin 2026)
- ✅ `fcm.ts` : Firebase Admin SDK, dual push Expo/FCM
- ❌ `FIREBASE_SERVICE_ACCOUNT_JSON` pas encore ajouté Railway — attendre APK
- 🔵 Après APK : Google Cloud → Service Account → JSON → Railway

### 8.8 — Google STT (✅ Terminé — 2026-05-21)
- ✅ `/api/transcribe` : Google STT provider + fallback Groq Whisper automatique

### 8.9 — TikTok Auto-post (🔵 Planifié — Phase 4 restant)
- 🔵 Publication automatique vidéos TikTok (via Apify ou TikTok Business API)
- 🔵 Nexus PC peut lancer script Python de post automatique
- 🔵 Calendrier : 1 vidéo/semaine, timing optimal (17h-19h vendredi)

---

---

## Phase 9 — Ultimate IoT (🔵 Planifié — Q3 2026)

> Plan 19 900 DA/mois = Enterprise + contrôle maison + voiture

### 9.1 — Maison connectée (🔵 Planifié)
- 🔵 Raspberry Pi 4 + Zigbee dongle (CC2531 ou ConBee II)
- 🔵 Home Assistant OS sur le Pi (open source, local)
- 🔵 Agent Python `nexus-iot/` → API Home Assistant → relais Dzaryx
- 🔵 Commandes vocales : "Dzaryx éteins les lumières du salon", "quelle est la température ?"
- 🔵 Capteurs : température, humidité, présence, fenêtres, prises intelligentes
- 🔵 Tableau de bord IoT temps réel dans SaasPortal

### 9.2 — Voiture connectée (🔵 Planifié)
- 🔵 Dongle OBD-II Bluetooth/WiFi (ELM327, ~20-50€)
- 🔵 App mobile → Bluetooth → lecture données CAN bus
- 🔵 Stats : carburant, vitesse, RPM, codes erreurs DTC, kilométrage
- 🔵 Alertes : niveau carburant bas, entretien à prévoir, codes pannes

### 9.3 — Hardware bundle (🔵 Planifié)
- 🔵 Matériel vendu séparément à l'inscription Ultimate (~150-300€ one-time)
- 🔵 Guide d'installation automatique envoyé par email
- 🔵 Support téléphonique pour installation (SLA Ultimate)

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
