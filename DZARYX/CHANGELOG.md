# DZARYX — Changelog

> Format : Date | Commit | Fichiers | Description
> Plus récent en haut.

---

## 2026-05-26 — SaaS Chat Fix + Sector Personas + Plan Ultimate IoT (Claude Sonnet 4.6)

### 3 commits ✅ — `e04401e` + `f5785b3` + simulator gh-pages

**SaaS Chat HTTP fix (critique) :**
- `backend/src/api/routes/saas-chat.ts` : chat via Anthropic SDK direct (Claude Haiku)
  - **Root cause** : Socket.IO auth rejette les SaaS JWT → silence complet
  - Fix : bypass Socket.IO, appel HTTP direct, retourne `{ text, ai_name }`
  - `buildSectorPrompt()` totalement réécrit — 10 secteurs avec personas IA riches
  - `sectorBehavior` map : règles de format/ton par secteur (style médecin, avocat, BTP...)

**SaasPortal.tsx — Adaptation secteur complète :**
- `simulator/src/components/SaasPortal.tsx` :
  - Socket.IO supprimé (badge hardcodé EN LIGNE vert)
  - `QUICK_ACTIONS` réécrits pour 11 secteurs — prompts détaillés actionnables
  - `SECTOR_FEATURES` réécrits pour 11 secteurs — descriptions valeur business réelle
  - `SECTOR_ITEM_EXTRA` : ajout beauty, auto_school, construction, ecommerce
  - Plan Ultimate IoT : nouveau tier doré dans l'UI upgrade

**Plan Ultimate IoT :**
- `backend/src/api/routes/saas.ts` : plan `ultimate` ajouté (199€/mois, messages illimités, IoT features)
- `backend/src/api/routes/saas-billing.ts` : `ultimate` → 19 900 DA/mois Chargily
- `backend/src/api/routes/saas-admin.ts` : `ultimate_orgs` compté, revenue = pro*29 + ent*99 + ult*199

**Actions manuelles requises :**
- [ ] Appliquer `supabase/migration_saas_notifications.sql` dans Supabase SQL editor
- [ ] Configurer SMTP Railway : `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` pour emails réels

---

## 2026-05-22 — Per-Actor Notifications + Dzaryx Living Brain (Claude Sonnet 4.6)

### 2 commits ✅ — `326ce67` + `4a7da96`

**Per-actor notification targeting (`326ce67`) :**
- `backend/src/queue/jobs/proactive-jobs.ts` : 11 jobs Kouider-only tagués `emitProactive(..., 'kouider')`
- `backend/src/notifications/mobile-push.ts` : `getRecentProactives(actor?)` merge global + actor Redis
- `backend/src/api/routes/notifications.ts` : `/proactive/recent?actor=` query param
- `simulator/src/services/api.ts` : Socket.IO filtre `targetActor`, API passe `?actor=`

**Dzaryx Living Brain (`4a7da96`) :**
- `backend/src/integrations/client-brain.ts` (NEW) :
  - `getClientBrain()` — profil enrichi avec voitures, mois, patterns vol, insights IA
  - `addClientNote()` — note permanente client
  - `setArrivalPattern()` — patterns d'arrivée (heure, jour, origine vol)
  - `saveObservation()` — mémoire libre `dzaryx_observations`
  - `analyzeAllClients()` — batch Claude AI → insights naturels (séparé par acteur)
  - `learnFromConversation()` — détecte vocab approbation/rejet → `actor_brain`
  - `getActorBrainContext()` — injecté dans prompt système
- `backend/src/integrations/tools.ts` : 3 nouveaux outils (`get_client_brain`, `add_client_note`, `set_arrival_pattern`)
- `backend/src/integrations/tool-executor.ts` : dispatch 3 nouveaux outils (actor détecté via sessionId)
- `backend/src/conversation/context-builder.ts` : brain + actor brain injectés auto si client mentionné
- `backend/src/queue/scheduler.ts` : job `client-brain-update` dimanche 3h00 Algeria
- `backend/src/queue/jobs/proactive-jobs.ts` : `jobClientBrainUpdate` — analyse tous acteurs + résumé Kouider
- `supabase/migrations/20260522_dzaryx_brain.sql` (NEW) : 3 nouvelles tables + colonnes `client_intelligence`

**Actions manuelles Kouider :**
- ✅ Migration `20260522_dzaryx_brain.sql` appliquée Supabase

---

## 2026-05-21 — GPS + Simulateur Phase 8 + GitHub Pages + Houari Token (Claude Sonnet 4.6)

### Session complète — commit `34b0fb7` ✅
- **Commits** : `34b0fb7` (GPS + Simulator + GitHub Pages deploy)
- **Backend** :
  - `backend/src/config/env.ts` : ajout `GOOGLE_MAPS_API_KEY` (optional)
  - `backend/src/integrations/tools.ts` : ajout outil `calculate_delivery_fee`
  - `backend/src/integrations/tool-executor.ts` : implémentation `calculateDeliveryFeeTool`
    - Dépôt : Es Sénia (35.6459, -0.6050) hardcodé
    - Tarif défaut : 200 DZD/km configurable
    - Returns : distance km, temps, frais DZD, lien Waze, lien Google Maps
- **Simulator** (GitHub Pages — pas Netlify) :
  - `simulator/src/components/Phone.tsx` : tab Telegram SUPPRIMÉ (décision Kouider), 12 tabs
  - `simulator/src/components/screens/SettingsScreen.tsx` : "RÈGLES APPRISES (PHASE 8)" panel, fix `nexus_online?: boolean`
  - `simulator/src/components/screens/DocumentsScreen.tsx` : "GÉNÉRER CONTRAT PDF" panel
  - `simulator/src/components/screens/BookingsScreen.tsx` : panel GPS (`GpsCalculator`) avec 6 landmarks Oran
- **Railway** (Kouider ajouté manuellement) :
  - `MOBILE_TOKEN_HOUARI` = 99c3dba3...
  - `GOOGLE_MAPS_API_KEY` = AIzaSyAv7s2...
- **Supabase** : Migration Phase 8 appliquée (7 tables + seeds)
- **GitHub Pages** : `https://kouider213.github.io/ibrahim/` déployé — simulateur principal désormais
- **Documentation** : `CURRENT_STATE.md` + `HANDOVER_CLAUDE2.md` mis à jour intégralement
- **Décisions Kouider** : WhatsApp → août 2026, iOS → non, Chargily → non, Telegram → backup seulement

---

## 2026-05-21 — Phase 8 : Learned Rules + PDF Contrat + Excel + Nexus Health + STT + FCM (Claude Sonnet 4.6)

### Phase 8 complète — 3 commits ✅
- **Commits** : `96c6376` + `bbead09` + `e096a55`
- **Fichiers** :
  - `backend/src/integrations/learned-rules.ts` (NEW — CRUD règles apprises, formatage contexte)
  - `backend/src/integrations/generate-contract.ts` (NEW — contrat PDF signable avec CGV)
  - `backend/src/integrations/excel-export.ts` (NEW — export .xlsx comptable via SheetJS)
  - `backend/src/notifications/fcm.ts` (NEW — Firebase Admin SDK, dual push Expo/FCM)
  - `backend/src/integrations/tool-executor.ts` (+4 cases: save/list learned_rules, contract, excel)
  - `backend/src/integrations/tools.ts` (+4 outils Phase 8, -create_payment_link Chargily)
  - `backend/src/conversation/context-builder.ts` (inject learned rules dans system prompt)
  - `backend/src/actions/handlers/nexus-relay.ts` (heartbeat → Redis nexus:health TTL=120s)
  - `backend/src/api/routes/transcribe.ts` (Google STT provider + fallback Groq)
  - `backend/src/notifications/mobile-push.ts` (route FCM natif vs Expo)
  - `backend/src/config/env.ts` (FIREBASE_SERVICE_ACCOUNT_JSON)
  - `simulator/src/services/api.ts` (nexus() → /api/nexus/live-status)
  - `simulator/src/components/screens/SettingsScreen.tsx` (grille Nexus live HOST/CPU/RAM)
  - `supabase/migration_phase8.sql` (NEW — 7 tables + seeds)
- **Packages** : `xlsx`, `@google-cloud/speech`, `firebase-admin`
- **Note** : migration_phase8.sql à appliquer manuellement dans Supabase Dashboard

---

## 2026-05-20 — Simulator Capacités + Telegram Demo + Power-off (Claude Sonnet 4.6)

### 2 nouveaux écrans + power-off + Obsidian mis à jour ✅
- **Commit** : `d88dbaa`
- **Fichiers** :
  - `simulator/src/components/screens/TelegramScreen.tsx` (NEW — 280 lignes)
  - `simulator/src/components/screens/CapacitesScreen.tsx` (NEW — 380 lignes)
  - `simulator/src/components/Phone.tsx` (power-off + 2 nouveaux tabs)
  - `DZARYX/CURRENT_STATE.md`, `DZARYX/ROADMAP.md`, `DZARYX/HANDOFF.md` (mis à jour)
- **Changements** :
  - **TelegramScreen** : simulation Telegram 6 canaux (ALL/FINANCE/RESAS/DOCS/NEXUS/MARKETING)
    - Bulles messages Kouider (droite bleue) vs Dzaryx (gauche sombre)
    - Tous types : text, alert (tag coloré + actions), photo, video, file
    - Badges unread par canal, sélecteur onglets scrollable
    - Messages pré-chargés : briefing matinal, alertes impayés, résa créée, doc passeport, rapport CA, vidéo marketing, PC nexus terminal
  - **CapacitesScreen** : 3 onglets
    - "14 AGENTS" : tous les agents expandables avec description + 4 exemples de commandes chacun
    - "PROACTIF" : timeline journée type + 8 fonctionnalités proactives avec couleur et desc
    - "CAPACITÉS" : 8 sections complètes (IA, communication, réservations, finance, docs, PC, web, marketing)
  - **Phone.tsx** : power button → animation fade out → DZARYX logo → "ARRÊT EN COURS" → retour lock screen
  - Tabs : 13 tabs total (VOIX/CHAT/TELEGRAM/DZARYX/RESAS/PARC/CA/CLIENTS/AGENDA/ALERTES/RAPPELS/DOCS/CONFIG)
- **Netlify** : `6a0d57e1` → https://dzaryx-simulator.netlify.app ✅
- **Build** : 364KB JS, 0 erreurs TS

---

## 2026-05-20 — FleetScreen compact banner restore (Claude Sonnet 4.6)

### Restauration design original FleetScreen ✅
- **Commit** : `86eec58`
- **Fichier** : `simulator/src/components/screens/FleetScreen.tsx`
- **Changement** : banner 90px full-width, objectFit cover (après itérations utilisateur)
- **Netlify** : `6a0d5409` ✅

---

## 2026-05-19 — Simulator All Screens HUD Redesign (Claude Sonnet 4.6)

### 7 screens redesigned with cyberpunk HUD aesthetic ✅
- **Commit** : `9232dc3`
- **Fichiers** : `BookingsScreen`, `FleetScreen`, `RevenueScreen`, `ClientsScreen`, `RemindersScreen`, `DocumentsScreen`, `SettingsScreen`
- **Changements** :
  - Header HUD uniforme sur tous les écrans (Orbitron + gradient separator)
  - KPI stat cards avec glow neon (Bookings: actives/CA/profit, Fleet: total/dispo/occup/indispo, Revenue: jour/sem/mois, Clients: total/VIP/CA)
  - Bookings: cartes avec dot status glow, gradient bg par statut, expanded detail panel
  - Fleet: barre occupancy par voiture animée, toggle buttons colorés
  - Revenue: bar chart visuel, carte profit gold, top-clients avec classement
  - Clients: avatar avec initiales, badge VIP glow, intel panel expandable
  - Reminders: barre accent colorée à gauche, badge URGENT pulsant, compteurs par priorité
  - Documents: progress bar animation OCR, panel orange thème scan
  - Settings: actor cards avec icône glow, status pills avec dot pulse
  - Corner brackets HUD sur tous les écrans
  - 0 erreurs TypeScript, build propre
- **Netlify** : `6a0c1bb5` → https://dzaryx-simulator.netlify.app ✅

---

## 2026-05-19 — Simulator UI Redesign Cyberpunk Robot (Claude Sonnet 4.6)

### VoiceScreen + TextScreen redesign ✅
- **Commit** : `fdbbe4e`
- **Fichiers** :
  - `simulator/src/components/screens/VoiceScreen.tsx` (REWRITE — robot SVG)
  - `simulator/src/components/screens/TextScreen.tsx` (REWRITE — HUD header)
  - `simulator/src/index.css` (robot keyframe animations)
- **Features** :
  - `DzaryxRobot` SVG : tête chrome + visor + yeux LED cyan + oreilles avec 5 barres audio + bouche LED (parle/plat) + antenne clignotante + anneau thinking jaune + anneaux rotatifs externes
  - VoiceScreen : header DZARYX + subtitle "IA DE FIK CONCIERGERIE · ORAN", badge status animé, robot centré animé (float / floatListen), 3 boutons SCAN/MIC/VISION avec labels
  - Couleur thinking : `#9b59b6` → `#ffaa00` (jaune comme référence images)
  - TextScreen : header HUD avec connexion + titre DZARYX + subtitle, avatar `RobotAvatar` mini SVG dans les bulles (remplace "D"), typo Share Tech Mono, input HUD-style
  - Canvas réduit à background (particles + anneaux ambiants, sans orb central)
  - Netlify deploy : `6a0c0af3` → https://dzaryx-simulator.netlify.app ✅

---

## 2026-05-18 — Simulator Full Parity + APK Bugs (Claude Sonnet 4.6)

### Simulator — 9 onglets, parité APK complète ✅
- **Commit** : `56b3fa1`
- **Fichiers** :
  - `simulator/src/components/Phone.tsx` (REWRITE — 9-tab navigation)
  - `simulator/src/services/api.ts` (actor management + business API layer)
  - `simulator/src/components/screens/BookingsScreen.tsx` (NEW)
  - `simulator/src/components/screens/FleetScreen.tsx` (NEW)
  - `simulator/src/components/screens/RevenueScreen.tsx` (NEW)
  - `simulator/src/components/screens/ClientsScreen.tsx` (NEW)
  - `simulator/src/components/screens/RemindersScreen.tsx` (NEW)
  - `simulator/src/components/screens/DocumentsScreen.tsx` (NEW)
  - `simulator/src/components/screens/SettingsScreen.tsx` (NEW)
  - `simulator/src/components/screens/VoiceScreen.tsx` (SCAN button added)
- **Features** :
  - Phone.tsx : `Page` type 9 valeurs, `TABS` array, `NavBar` scrollable horizontal (overflowX auto), `renderScreen()` routing
  - api.ts : `HOUARI_TOKEN`, `setSimActor/getSimActor`, `getToken()` actor-scoped, `getOrCreateSessionId()` → `voice_${actor}`, `business` export (15 méthodes : fetchBookings, fetchCars, fetchFleet, fetchRevenue, fetchReminders, dismissReminder, fetchClients, fetchClientIntel, toggleCar, deleteBooking, createBooking, clearCache, fetchJobs, triggerJob, health, nexus)
  - BookingsScreen : liste + search + expand détail + delete + create form inline (profit live)
  - FleetScreen : stats (total/dispo/occupancy%) + toggle disponibilité + revenus 30j + intel
  - RevenueScreen : CA today/week/month + profit Kouider + top clients scorés (VIP=#ffd700)
  - ClientsScreen : search + score badges + intelligence expand + phone link
  - RemindersScreen : HIGH/MEDIUM/LOW groupés + dismiss + phone link
  - DocumentsScreen : fetch PASSEPORT/PERMIS/CONTRAT par nom + OCR file input → /api/vision/scan
  - SettingsScreen : acteur switcher (Kouider/Houari) + backend health + nexus status + cache clear + scheduler jobs trigger
- **TypeScript** : 0 erreurs
- **Déployé** : https://dzaryx-simulator.netlify.app (make-zip.mjs POSIX zip)

### APK — Bugs fixés + Écran Documents ✅
- **Commit** : `56b3fa1`
- **Fichiers** :
  - `dzaryx-native/app/voice.tsx` (Houari token fix + SCAN button)
  - `dzaryx-native/app/documents.tsx` (NEW)
  - `dzaryx-native/app/_layout.tsx` (route documents)
  - `dzaryx-native/app/settings.tsx` (bouton Documents + styles)
- **B020 fixé** : `voice.tsx` utilisait `MOBILE_TOKEN` hardcodé (Kouider) → `useStore(s => s.mobileToken)` + `useStore(s => s.sessionId)` dynamique
- **B021 fixé** : Bouton SCAN OCR absent dans voice.tsx APK → ajouté (ImagePicker.launchCameraAsync → /api/vision/scan → /api/chat → TTS)
- **documents.tsx** : écran complet — section fetch (TextInput nom + 3 boutons PASSEPORT/PERMIS/CONTRAT → POST /api/chat) + section OCR (launchCameraAsync → POST /api/vision/scan)
- **TypeScript** : 0 erreurs

---

## 2026-05-17 — Feature Parity Session (Claude Sonnet 4.6) — Autonomous

### Native App — Écrans Réservations ✅
- **Commits** : `222e64c`, `2e1cbb3`, `7596ebc`
- **Fichiers** : `dzaryx-native/app/bookings.tsx` (NEW), `app/new-booking.tsx` (NEW), `app/settings.tsx`, `app/_layout.tsx`, `lib/api.ts`
- **Features** :
  - Écran Réservations : liste temps réel, stats (total/actif/retard), filtres par statut, retards mis en évidence
  - Boutons rapides par carte : 📞 APPELER (tel:), 💳 PAYÉ, ✓ ACTIVER (sans passer par le chat AI)
  - Écran Création Réservation : picker voiture, champs client+dates+prix, calcul profit live, submit via REST API
  - Bouton RÉSERVATIONS dans Settings → navigation vers écran réservations
- **Nouveaux helpers API** : `fetchBookings()`, `fetchCars()`, `updateBookingField()`, `Booking` interface, `Car` interface

### Backend — Nouveaux Outils AI ✅
- **Commit** : `222e64c`
- **Outils** : `export_accounting`, `get_client_profile`, `track_habit`
  - `export_accounting` : PDF comptable mensuel (tableau réservations + KPIs) → upload Supabase + envoi Telegram
  - `get_client_profile` : profil comportemental client depuis `client_intelligence` (voitures préférées, fiabilité, score)
  - `track_habit` : ajouter/mettre à jour habitudes dans `memory_habits` via conversation (vitamines, sport, check clients...)
- **Agent routing** : FINANCE_AGENT, CLIENTS_AGENT, MEMORY_AGENT toolNames + keywords étendus

### Backend — Améliorations API ✅
- **Commits** : `e0e501d`, `2e1cbb3`
- `GET /api/bookings/cars` : liste flotte (id, name, category, available) pour formulaire réservation mobile
- `PATCH /api/bookings/:id` : insertion automatique paiement dans `payments` table quand `payment_status='PAID'`
- `jobBIReminders` : envoi push mobile en plus de Telegram

### Backend — Alert Missing Owner PPD ✅
- **Commit** : `222e64c`
- `create_booking` : si `owner_price_per_day` null → alerte Telegram immédiate (profit non calculable)

### Memory Engine ✅
- **Commits** : `1a7f482`, `20f10f8`
- B018 : `writeMemory()` utilisait `source` comme `user_id` → corrigé
- B019 : Houari écrivait sous `user_id='kouider'` → `inferUserId(sessionId)` acteur-scoped
- Nouveaux domaines mémoire : `vehicle`, `client`, `finance`, `learning`, `note`
- Scoring mémoire étendu pour les nouveaux domaines

### Episode Auto-Tracking ✅
- **Commit** : `84420bc`
- `episode-tracker.ts` (NEW) : sauvegarde automatique d'épisodes importants (bookings, paiements, documents)
- Context builder injecte les épisodes récents si question historique

### Scheduler — Nouveaux Jobs ✅
- **Commits** : `69dcf0d`, `84420bc`
- `vehicle-utilization` (sam 9h) : rapport 30j utilisation parc avec suggestions
- `habit-check` (8h15 quotidien) : vérification habitudes actives
- `monthly-report` (1er du mois 9h) : bilan mensuel auto avec push mobile
- `long-idle-alert` (lun 10h) : alerte véhicules immobilisés 14+ jours

---

## 2026-05-17 — Remote Control Mission (Claude Sonnet 4.6)

### Conversation Engine V2 ✅
- **Commits** : `aed62e3`, `c98bd8d`
- **Fichiers** : `backend/src/conversation/normalizer.ts` (NEW), `entity-extractor.ts` (NEW), `pending-action.ts` (NEW), `engine-v2.ts` (NEW), `tests/engine-v2.test.ts` (NEW)
- **Résultat** : 41/41 tests pass. Typos corrigés, entités extraites, pending actions Redis 5min.

### Native App — Dzaryx Android ✅
- **Commits** : `3c144cc`, `42be09b`, `b3b33df`
- **Fichiers** : `dzaryx-native/app/onboarding/mode.tsx` (NEW), `app/settings.tsx` (NEW), `app.json`, `app/_layout.tsx`, `app/chat.tsx`, `app/onboarding/business.tsx`, `app/onboarding/personal.tsx`, `lib/api.ts`
- **Features** : Settings screen, quick commands, RÉGLAGES button, actor-scoped token, auth/login après onboarding
- **Bugs fixés** : B010 (mode.tsx manquant), B011 (app.json trailing comma), B012 (4 TS errors), B013 (Houari token), B014 (onboarding flow), TypeScript : 0 erreurs

### Backend Améliorations ✅
- **Commit** : `35fdaed`
- **Fichiers** : `backend/src/conversation/orchestrator.ts`, `backend/src/api/routes/transcribe.ts`
- **B015** : Whisper auto-detect language (fr/ar/darija)
- **B016** : Delete gate — confirmation obligatoire avant suppression

---

## 2026-05-15 — Session soir (Claude Code / Sonnet 4.6)

### Anti-hallucination — Fix complet ✅
- **Commit** : `71d2b1c`
- **Fichiers** :
  - `backend/src/orchestrator/anti-hallucination.ts` (Gates 4/4b/4c + fastPathGuard)
  - `backend/src/conversation/orchestrator.ts` (fastPathGuard appliqué fast-path + fallback)
  - `backend/src/config/constants.ts` (RÈGLE ABSOLUE CONNAISSANCE EN TEMPS RÉEL)
  - `backend/src/tests/anti-hallucination.test.ts` (26 tests unitaires)
- **DATA_TOOLS** : ajout `get_fleet_status` + `get_client_document`
- **Gate 2 étendu** : 6 nouveaux patterns — revenus/bénéfice/profit casual
- **Gate 3 étendu** : 4 nouveaux patterns — "j'ai consulté la base", "d'après mes données"
- **Gate 4 (nouveau)** : booking count bloqué sans list_bookings/check_anomalies
- **Gate 4b (nouveau)** : disponibilité véhicule bloquée sans check_car_availability/get_fleet_status
- **Gate 4c (nouveau)** : claims paiement bloqués sans get_payment_status/get_unpaid_bookings
- **fastPathGuard (nouveau)** : Groq/Gemini/OpenAI bloqués dès qu'ils affirment données business (montants, réservations, disponibilités, chiffres) — renvoient refusal propre
- **System prompt** : RÈGLE ABSOLUE CONNAISSANCE EN TEMPS RÉEL — Dzaryx ne donne aucun chiffre business sans outil appelé dans le même tour
- **Tests** : 26/26 ✅ — TypeScript 0 erreurs

---

## 2026-05-15 — Session après-midi (Claude Code / Sonnet 4.6)

### Phase 6 Mobile ✅ — 3 nouveaux panels Dashboard
- **Commit** : `bc06bc4`
- **Fichiers** :
  - `mobile/src/components/dashboard/panels/BookingForm.tsx` (nouveau)
  - `mobile/src/components/dashboard/panels/CalendarView.tsx` (nouveau)
  - `mobile/src/components/dashboard/panels/ClientsView.tsx` (nouveau)
  - `mobile/src/components/dashboard/Dashboard.tsx` (3 lazy imports + PANELS Record)
  - `mobile/src/components/dashboard/DashboardNav.tsx` (BottomNav scrollable)
  - `mobile/src/dashboard.css` (`.no-scrollbar` utility)
- **BookingForm** : formulaire création réservation — sélection voiture (avec dispo), client nom+téléphone, dates, prix client/Houari DA/j, calcul profit live, soumis via `api.chat()` → BOOKING_AGENT
- **CalendarView** : grille mois calendrier (lundi en premier), heatmap intensité réservations (4 niveaux cyan), aujourd'hui surligné, stats mois, état parc voitures
- **ClientsView** : liste clients avec score VIP/FREQUENT/REGULAR/NEW, recherche nom, filtre par score, total dépensé, lien tel: téléphone
- **Nav** : `DashSection` type étendu (7→10 items), BottomNav overflow-x scroll sans scrollbar visible
- **Build** : 0 erreurs TS, 0 erreurs build Vite, 12 chunks propres

---

## 2026-05-15 — Session matin/midi (Claude Code / Sonnet 4.6)

### B002 ✅ — Cache Redis revenus 30 min → 5 min + endpoint clear
- **Fichiers** : `backend/src/bi/revenue-intelligence.ts`, `backend/src/api/routes/bi.ts`
- **Fix** : TTL Redis 1800s → 300s. Endpoint `POST /api/bi/cache/clear` vide `bi:revenue` + `bi:full` + `bi:fleet` instantanément.
- **Commit** : `0f67e9d`

### B003 ✅ — `checkAnomalies()` filtre dates corrigé (overlap)
- **Fichier** : `backend/src/integrations/phase5-finance.ts` ligne ~488
- **Fix** : `.lte('start_date', monthEnd).gte('end_date', monthStart)` — réservations actives ce mois visibles même si démarrées le mois précédent.
- **Commit** : `bb692ac`

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

## 2026-05-14 — Session après-midi/soir (Claude Code / Sonnet 4.6)

### GENERAL_AGENT — recherche web toujours active, sans demander permission
- **Commits** : `61b41b9`, `b2b13b1`, `05baced`
- **Fichiers** : `backend/src/agents/agent-registry.ts`, `backend/src/integrations/tool-executor.ts`
- **Problème** : Dzaryx demandait "puis-je faire une recherche ?" au lieu de chercher directement.
- **Fix** :
  - GENERAL_AGENT créé avec `web_search` comme outil principal
  - Minimum 2 tentatives `web_search` avant de répondre
  - Messages courts (< 30 chars) routés vers Claude (pas Groq) pour garder le contexte business
  - Plus jamais de demande de permission pour chercher sur internet

### `get_car_photo` — photos réelles du parc dans les vidéos/images marketing
- **Commit** : `85a60bd`
- **Fichiers** : `backend/src/integrations/tools.ts`, `backend/src/integrations/tool-executor.ts`
- **Ajouté** : Outil `get_car_photo` — récupère URL photo Cloudinary réelle d'un véhicule depuis Supabase `cars` table. Claude utilise la vraie photo du parc, pas un placeholder.

### Cloudinary images → Telegram (envoi direct URL)
- **Commit** : `d1d45d3`
- **Fichiers** : `backend/src/integrations/tool-executor.ts`
- **Fix** : Les images générées via Cloudinary étaient perdues. Fix : forcer l'URL dans la réponse Claude + envoi direct `sendPhoto(cloudinaryUrl)` dans Telegram.

### CODE_AGENT — retrait du keyword générique 'créer'
- **Commit** : `4e53a11`
- **Fichier** : `backend/src/agents/agent-registry.ts`
- **Problème** : "crée une vidéo" / "crée une image" routait vers CODE_AGENT au lieu de TIKTOK_AGENT.
- **Fix** : Retiré `créer` des keywords CODE_AGENT. Seuls les vrais contextes code (bug, script, python, deploy...) activent cet agent.

### NETWORK_ANALYST — anti-hallucination agressive
- **Commit** : `0e48393`
- **Fichier** : `backend/src/agents/agent-registry.ts`
- **Fix** : NETWORK_ANALYST reçoit désormais une instruction explicite de bloquer toute affirmation de données concurrentes sans avoir appelé `web_search`.

### Recherche web — SearXNG + Jina Reader (remplace DDG/Bing cassés)
- **Commits** : `cf50433`, `162052b`
- **Fichiers** : `backend/src/integrations/web-search.ts`
- **Fix** : DDG et Bing scrapers retournaient des erreurs. Ajout de :
  - **SearXNG** (instance publique, pas de clé API)
  - **Jina Reader** (`r.jina.ai/URL`) — fonctionne aussi sur YouTube, TikTok
  - **Cascade** : SearXNG → Jina → fallback texte

### Concurrent/veille — route vers Claude agentic loop
- **Commit** : `e0c4dbc`, `d5dc597`
- **Fichiers** : `backend/src/integrations/llm-router.ts`, `backend/src/agents/agent-registry.ts`
- **Fix** : "Analyse les concurrents" ne routait pas vers Claude → aucun outil appelé. Fix : ajout keywords concurrent dans TOOL_KEYWORDS + NETWORK_ANALYST keywords élargis. Résultats multi-sources avec hashtags contextuels.

---

## 2026-05-14 — Session matin (Claude Code / Sonnet 4.6)

### Documents clients — système complet réécrit
- **Commits** : `759c32d`, `caee9b2`, `c2a0e06`, `793f7b3`, `e765c92`, `0950cbc`, `bc5e555`, `ee4a0fd`, `492bf03`
- **Fichiers** : `backend/src/integrations/tool-executor.ts`, `backend/src/integrations/tools.ts`, `backend/src/agents/agent-registry.ts`
- **Problèmes résolus** :
  - `URLSearchParams` encodait `*` en `%2A` → filtre ilike Supabase cassé
  - Documents téléchargés depuis URL publique (au lieu de service key Supabase)
  - Mauvais envoi Telegram (`sendPhoto` marketing au lieu de `sendPhoto` API)
  - Doublon tool `get_client_document` dans le registry
  - `passeport` absent de TOOL_KEYWORDS → routait vers Groq sans outils
- **Fix** : Réécriture avec `axios` REST direct + service key + envoi buffer + `store_document` schema corrigé

### Réservations — série de correctifs critiques
- **Commits** : `f9d34a4`, `431e3ac`, `7b57580`, `927f2a0`, `617ce9b`, `df700c5`, `93d9282`, `1e14530`, `b912528`, `828faef`, `0801f81`
- **Fichiers** : `backend/src/integrations/tool-executor.ts`, `backend/src/integrations/tools.ts`, `backend/src/agents/agent-registry.ts`
- **Correctifs** :
  - `car_id` maintenant résolu depuis `car_name` (Claude donnait un nom, pas un UUID)
  - `payment_status` normalisé `UNPAID` (contrainte Supabase)
  - `client_age` réajouté dans INSERT (colonne NOT NULL existante)
  - Colonnes inconnues stripées avant INSERT
  - Plus de confirmation demandée avant `create_booking` — crée directement
  - Messages numériques courts gardent le contexte de langue (arabe/français)
  - Grille tarifaire corrigée (colonnes `vehicle_name`, `houari_price`)
  - Gate 2 anti-hallucination : `create_booking`/`update_booking` exemptés (opérations légitimes)

### Google Calendar — suppression événement + log erreur
- **Commits** : `89eb578`, `ea43e32`
- **Fichiers** : `backend/src/integrations/tool-executor.ts`
- **Fix** : Suppression réservation → suppression automatique événement Google Calendar. Log complet erreur API Google (était silencieux avant).

### Vision — Claude Haiku comme fallback final
- **Commit** : `1636000`
- **Fichier** : `backend/src/integrations/llm-router.ts`
- **Ajouté** : Cascade vision : Gemini Flash → OpenAI GPT-4o Vision → Claude Haiku. Plus de crash si Gemini et OpenAI échouent.

### Routing — historique conversationnel ne hijacke plus les agents
- **Commits** : `989aa89`, `5af1cf6`
- **Fichiers** : `backend/src/agents/core-router.ts`, `backend/src/conversation/orchestrator.ts`
- **Problème** : L'historique conversation forçait BOOKING_AGENT même sur des messages clients/documents sans lien avec une réservation.
- **Fix** : Priority override retiré. `detectAgentFromHistory` inclut maintenant les messages user (pas seulement assistant) pour une meilleure détection.

### Nexus — messages réservation ne routent plus vers Nexus music
- **Commit** : `e2c7561`
- **Fichier** : `nexus/modules/ws_client.py`
- **Fix** : Le router Nexus interceptait des messages "réservation" pour le module music. Filtrage corrigé.

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
