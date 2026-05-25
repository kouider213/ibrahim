# DZARYX — État Actuel du Projet

> **CE FICHIER EST MIS À JOUR À CHAQUE FIN DE SESSION.**
> Tout agent AI lit ce fichier EN PREMIER pour savoir où en est le projet.
> Dernière mise à jour : 2026-05-25 (Session — APK ✅ + Telegram→Chat migration + SaaS multi-tenant complet)

---

## Où en est le projet (maintenant)

**Phase active : Phases 1-8 TERMINÉES ✅ + Brain System LIVE + APK BUILDÉ ✅ + SaaS COMPLET ✅.**

APK Android build réussi 2026-05-25. Migration complète Telegram→Chat : zéro message Telegram pour usage normal, tout passe par emitProactive(). Houari reçoit 8 types de notifs business. SaaS multi-tenant complet : plans, WhatsApp Pro, Calendar Pro, briefings quotidiens. 1 migration SQL à appliquer : `migration_saas_notifications.sql`.

---

## URLs IMPORTANTES

| Service | URL |
|---|---|
| **Backend Railway** | https://ibrahim-backend-production.up.railway.app |
| **Simulateur GitHub Pages** | https://kouider213.github.io/ibrahim/ |
| **Mobile PWA Netlify** | https://ibrahim-fik-conciergerie.netlify.app |
| **GitHub repo** | https://github.com/kouider213/ibrahim |
| **Supabase** | https://supabase.com/dashboard/project/febrrgqpyqqrewcohomx |
| **Railway dashboard** | https://railway.app |

---

## Ce qui fonctionne ✅

### Finance & Revenus
- ✅ Calculs financiers : vrais prix (client_price_per_day × nb_days), zéro catalogue
- ✅ Profit Kouider : calculé depuis Supabase, null si données manquantes (jamais inventé)
- ✅ Revenus prorabilisés : today = 1 jour × tarif, semaine = overlap 7 jours, mois = overlap mois
- ✅ Anti-hallucination Gates 1/2/3/4/4b/4c : bloquants (pas log-only)
- ✅ fastPathGuard : Groq/Gemini/OpenAI bloqués si claims business data sans outils
- ✅ Fast-mode exclu pour finance : tous les mots FR (revenu/bénéfice/profit...) → full Claude + tools

### Réservations
- ✅ `create_booking` : crée directement sans confirmation, stocke vrais prix financiers
- ✅ `car_id` résolu depuis `car_name` (plus d'UUID demandé à Claude)
- ✅ `payment_status` normalisé UNPAID par défaut
- ✅ Suppression réservation → suppression événement Google Calendar automatique
- ✅ Anti double réservation : RPC `check_car_availability`

### GPS & Livraison — NOUVEAU 2026-05-21
- ✅ `maps.ts` : Distance Matrix API Google + fallback vol d'oiseau ±20%
- ✅ Landmarks Oran : aéroport, centre-ville, port, gare, Bir El Djir, Es Sénia, Arzew, Ain Turk
- ✅ `get_travel_time` tool : temps trajet réel + trafic + Waze + Google Maps
- ✅ `calculate_delivery_fee` tool : dépôt Es Sénia → adresse client, 200 DZD/km
- ✅ `GOOGLE_MAPS_API_KEY` ajouté Railway + env.ts
- ✅ Simulateur RESAS : panneau "GPS LIVRAISON" interactif

### Documents Clients
- ✅ `get_client_document` : récupère passeport/permis/contrat depuis Supabase
- ✅ Envoi automatique document dans Telegram
- ✅ `generate_contract` : contrat PDF signable avec CGV + signatures
- ✅ `export_excel` : rapport .xlsx envoyé Telegram (3 feuilles : resas, bilan, par voiture)

### Mémoire / Apprentissage — Phase 8
- ✅ `learned_rules` table : règles apprises par conversation
- ✅ `save_learned_rule` / `list_learned_rules` outils
- ✅ Règles injectées automatiquement dans contexte Claude (context-builder.ts)
- ✅ "Dzaryx retiens que..." → sauvegarde immédiate
- ✅ `assistant_profiles` : profil Kouider (français/direct) + Houari (darija/terrain)
- ✅ `user_behavior` + `conversation_patterns` tables
- ✅ Migration Phase 8 appliquée Supabase ✅

### Multi-acteur
- ✅ Kouider : token `MOBILE_ACCESS_TOKEN` Railway
- ✅ Houari : token `MOBILE_TOKEN_HOUARI` Railway (ajouté 2026-05-21)
- ✅ Session persistée localStorage simulateur
- ✅ Profil Dzaryx différent par acteur (langue, style, focus)

### Recherche Web & Veille
- ✅ `web_search` : cascade SearXNG → Jina Reader → fallback
- ✅ Jina Reader : YouTube, TikTok, sites normaux
- ✅ GENERAL_AGENT : minimum 2 recherches, jamais de demande permission
- ✅ NETWORK_ANALYST : veille concurrents multi-sources

### Marketing & Médias
- ✅ Vidéo marketing : TIKTOK_AGENT → FFmpeg 720×1280
- ✅ `get_car_photo` : photos réelles du parc depuis Supabase/Cloudinary

### Planning & Proactivité
- ✅ `KOUIDER_SCHEDULE` embarqué : 7 jours (réveil, travail Belgique, business Algérie)
- ✅ Notifications proactives : heure réveil par jour, message personnalisé
- ✅ 25 jobs schedulés BullMQ (briefing, impayés, retards, rapports...)
- ✅ **Per-actor targeting** : Houari = notifs business only | Kouider = tout
- ✅ Redis history per-actor : `proactive:history` global + `proactive:history:kouider`
- ✅ Socket.IO filtering côté simulateur par `targetActor` field

### Dzaryx Living Brain — NOUVEAU 2026-05-22
- ✅ `client-brain.ts` : module intelligence client complet
- ✅ `getClientBrain()` : profil enrichi (voitures préférées, mois, vol, insights IA)
- ✅ `analyzeAllClients()` : analyse batch Claude AI → insights naturels (auto hebdo)
- ✅ `learnFromConversation()` : détecte vocabulaire approbation/rejet Kouider/Houari
- ✅ `getActorBrainContext()` : injecté auto dans context-builder.ts
- ✅ Tools : `get_client_brain`, `add_client_note`, `set_arrival_pattern`
- ✅ `client-brain-update` job : dimanche 3h00 Algeria, analyse tous acteurs
- ✅ Séparation acteur COMPLÈTE : `owner_id` / `actor_id` partout
- ✅ Désambiguïsation clients homonymes via `passport_number`
- ✅ Migration SQL appliquée Supabase ✅ (3 nouvelles tables + colonnes)

### Agents & Routing
- ✅ 14 agents spécialisés : routing automatique par keywords + priority
- ✅ Vision cascade : Gemini Flash → OpenAI GPT-4o Vision → Claude Haiku

### Infrastructure
- ✅ Bot Telegram : répond, full opérationnel (canal backup/admin)
- ✅ Nexus PC Agent : streaming SSE terminal live (asyncio par ligne)
- ✅ Google Calendar : lecture + création + suppression événements
- ✅ Scan caméra live, OCR passeport, Voucher PDF
- ✅ TypeScript : 0 erreurs | Railway déployé | Netlify déployé
- ✅ Prompt caching activé (80% réduction coûts)
- ✅ Firebase FCM : `fcm.ts` + `firebase-admin` (tokens natifs)
- ✅ Google STT : `/api/transcribe` avec fallback Groq

### Simulateur GitHub Pages — 12 ONGLETS
- ✅ URL : https://kouider213.github.io/ibrahim/
- ✅ Deploiement : push `dist/` sur branch `gh-pages` manuellement
- ✅ Login : Kouider (kouider31) / Houari (houari31)
- ✅ Boot screen → home → login → app
- ✅ Power button : fade noir → logo → lock screen
- ✅ 12 onglets : VOIX / CHAT / DZARYX / RESAS / PARC / CA / CLIENTS / AGENDA / ALERTES / RAPPELS / DOCS / CONFIG
- ✅ RESAS : GPS LIVRAISON panel (adresse → distance/temps/frais/Waze/GMaps)
- ✅ DOCS : Générer Contrat PDF section
- ✅ CONFIG : Règles Apprises panel (Phase 8)
- ✅ Build : 365KB JS, 0 erreurs TS

---

### APK Android ✅ BUILD RÉUSSI — 2026-05-25
- ✅ APK buildé avec succès — token `i7Xv61ZWOwdh4omHYty7sHtNd48J5bHqM0nr06rT`
- 📲 **Téléchargement direct** : https://expo.dev/artifacts/eas/xjD2ccEpeRkDF1mqYukMrq.apk
- Logs build : https://expo.dev/accounts/fikkouider/projects/dzaryx/builds/fda58045-48f6-4000-bda7-ce070542a8ce

**TODO — À faire maintenant :**
- [ ] Installer APK sur téléphone Kouider
- [ ] Installer APK sur téléphone Houari
- [ ] Tester voix → Whisper → Claude → TTS end-to-end
- [ ] Tester push notifications (app fermée)
- [ ] Tester scan OCR passeport

### SaaS Multi-tenant ✅ — 2026-05-25
- ✅ `/api/saas/register` + `/api/saas/login` + `/api/saas/config`
- ✅ `/api/saas/chat` — chat IA avec données business réelles injectées
- ✅ `/api/saas/plans` — 3 plans : starter(0€/200msg) | pro(29€/2000msg) | enterprise(99€/∞)
- ✅ `/api/saas/upgrade` — changer de plan
- ✅ `/api/saas/notifications` — briefings quotidiens + alertes
- ✅ WhatsApp Pro : per-tenant Twilio creds → `POST /api/saas/whatsapp/configure` + send
- ✅ Google Calendar Pro : per-tenant service account → `POST /api/saas/calendar/configure` + CRUD
- ✅ `jobSaasDailyBriefing` — 8h chaque matin, briefing pour chaque org SaaS
- ✅ `jobSaasMonthlyReset` — 1er du mois 1h, reset compteurs messages
- ✅ Migration SQL `migration_saas_notifications.sql` — à appliquer Supabase
- ✅ Landing page HTML : `interface-ibrahim/dzaryx-saas-landing.html`

**TODO — Actions manuelles requises :**
- [ ] Appliquer `supabase/migration_saas_notifications.sql` dans Supabase SQL editor

## Ce qui ne fonctionne pas / incomplet ❌

### Suivi flotte GPS live
- ❌ Requires hardware GPS trackers dans chaque voiture (~25-50€/voiture + SIM 4G)
- Distance Matrix fonctionne sans ça

### WhatsApp bot client
- ❌ Prévu août 2026 (Kouider attend d'avoir les dates)
- Bot vitrine : voitures disponibles + tarifs + promos (pas de réservation)
- Besoin : compte Twilio + TWILIO_ACCOUNT_SID/AUTH_TOKEN/WHATSAPP_FROM

---

## Prochaine priorité

### IMMEDIATE — Tester brain Dzaryx
Demander à Dzaryx (Mobile ou Simulateur) :
- "C'est qui Mohamed ?" → doit utiliser `get_client_brain`
- "Dzaryx retiens que Mohamed préfère les voitures familiales" → `add_client_note`
- "Mohamed arrive souvent le soir à l'aéroport" → `set_arrival_pattern`
- Brain auto-run dans ~1 semaine (dimanche 3h) ou déclencher manuellement via API

### OPTIONNEL — Lancer premier brain-update manuellement
Brain analysera tous les clients existants immédiatement (sans attendre dimanche).
Kouider peut demander à Dzaryx : "lance l'analyse du cerveau clients maintenant"
Ou via API admin endpoint `triggerJob('client-brain-update')`.

### IMMEDIATE — Test simulateur (Kouider)
→ https://kouider213.github.io/ibrahim/
1. Tester les 12 onglets
2. RESAS → GPS LIVRAISON → taper "aéroport" → vérifier résultat
3. DOCS → Générer Contrat PDF → taper nom client + voiture
4. CONFIG → voir Règles Apprises
5. VOIX / CHAT → parler à Dzaryx (backend Railway connecté)

### JUIN 1 — APK Android
```bash
EXPO_TOKEN=G7nmf_7VE1RreEeM3E5orMQJiVvGhLYt7Ze1jCN6 npx eas build --platform android --profile preview --non-interactive
```
Puis configurer `FIREBASE_SERVICE_ACCOUNT_JSON` Railway.

### AOÛT — WhatsApp bot
- Créer compte Twilio
- Configurer TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_WHATSAPP_FROM Railway
- Bot vitrine : liste voitures + tarifs + promos (pas de réservation)

### DÉCISIONS PRISES (ne pas revenir dessus)
- iOS app : NE PAS faire tant que Kouider ne dit pas
- Chargily paiement : NE PAS faire pour l'instant
- Telegram : canal BACKUP/ADMIN seulement (pas canal principal)
- Simulateur GitHub Pages : zone de test PRINCIPALE avant APK

---

## Sessions récentes détaillées

### Session 2026-05-22 (aujourd'hui)

**Feature 1 — Per-actor notification targeting :**
- Kouider-only jobs : `emitProactive(..., 'kouider')` — 11 jobs tagués
- Redis per-actor : `proactive:history:kouider` séparé du global
- API `/proactive/recent?actor=kouider` — merge global + actor-specific
- Simulateur : Socket.IO filtre `targetActor` côté client

**Feature 2 — Dzaryx Living Brain :**
- `client-brain.ts` nouveau module : intelligence profonde, analyse AI, learning vocab
- 3 nouveaux outils Claude : `get_client_brain`, `add_client_note`, `set_arrival_pattern`
- `analyzeAllClients()` : batch Claude AI → insights naturels par client
- `actor_brain` table : apprend vocabulaire Kouider ("oke", "parfait") et Houari
- `dzaryx_observations` : mémoire libre accumulée des conversations
- `client_intelligence` enrichi : arrival_patterns, passport_number, ai_insights
- Job dimanche 3h : analyse automatique tous les clients des 2 acteurs
- Context-builder : brain injecté auto dans prompt si client mentionné
- Séparation complète acteur à chaque layer (DB, tools, context)

**Actions manuelles Kouider :**
1. ✅ Migration SQL `20260522_dzaryx_brain.sql` appliquée → Supabase

**Commits :**
- `326ce67` feat: per-actor notification targeting (Kouider-only vs all)
- `4a7da96` feat(brain): Dzaryx living memory — deep client profiles + auto-learning

---

### Session 2026-05-21 (avant — session complète)

**Actions manuelles effectuées par Kouider :**
1. ✅ `MOBILE_TOKEN_HOUARI=99c3dba3359626a99f527dba6dd994a64049cc0984036933b7f96adddb41bfe2` → Railway
2. ✅ Migration Phase 8 SQL appliquée → Supabase (7 tables créées)
3. ✅ `GOOGLE_MAPS_API_KEY=AIzaSyAv7s2qAJiHwsAzVmeA25UEOmo8p6FIsyo` → Railway

**Code ajouté par Claude :**
- Simulateur : Phase 8 features (Règles Apprises, Contrat PDF, Excel demo)
- Simulateur : Tab Telegram supprimé (12 onglets)
- Backend : `calculate_delivery_fee` tool (200 DZD/km, dépôt Es Sénia)
- Backend : `GOOGLE_MAPS_API_KEY` dans env.ts
- Backend : `maps.ts` déjà existait complet — juste l'env var manquait
- Simulateur : GPS LIVRAISON panel dans RESAS
- GitHub Pages : simulateur déployé sur branch `gh-pages`

**Commits principaux :**
- `ccbea86` feat(simulator): Phase 8 — Telegram tab + learned rules + contrat PDF + Excel
- `af1e6bd` fix(simulator): remove Telegram tab
- `c5c4589` feat(gps): Distance Matrix + calculate_delivery_fee + simulator GPS panel
- gh-pages branch mis à jour manuellement (worktree git)

### Session 2026-05-21 (Phase 8 code)
- `96c6376` feat(phase8): learned rules, PDF contract, Excel export
- `bbead09` feat(phase8/nexus): Redis health key + rich Nexus telemetry
- `e096a55` feat(phase8): Google STT + Firebase FCM push notifications
- `c963fd1` docs(dzaryx): update CURRENT_STATE + CHANGELOG for Phase 8

---

## Comment déployer le simulateur sur GitHub Pages

```bash
# 1. Modifier code simulateur dans simulator/src/
# 2. Build
cd simulator && npm run build

# 3. Copier dist sur branch gh-pages via worktree
cd .. # racine ibrahim/
git worktree add ../gh-pages-deploy gh-pages
cp simulator/dist/index.html ../gh-pages-deploy/index.html
rm -rf ../gh-pages-deploy/assets
cp -r simulator/dist/assets ../gh-pages-deploy/assets
cd ../gh-pages-deploy
git add index.html assets/
git commit -m "deploy: description"
git push origin gh-pages

# 4. Nettoyer worktree
cd ../ibrahim
git worktree remove --force ../gh-pages-deploy
```

---

## Stack technique complète

```
Backend   : Node.js TypeScript / Express / Railway (auto-deploy push main)
DB        : Supabase (PostgreSQL) — projet febrrgqpyqqrewcohomx
Cache     : Upstash Redis
AI        : Claude Sonnet 4.6 (primary) + OpenAI/Gemini/Groq fallback
Voice     : ElevenLabs (voice ID: pNInz6obpgDQGcFmaJgB)
STT       : Groq Whisper primary / Google STT fallback
Maps      : Google Distance Matrix API (GOOGLE_MAPS_API_KEY)
Vision    : Gemini Flash → GPT-4o Vision → Claude Haiku cascade
Mobile    : React 18 PWA (Vite + Tailwind) — Netlify
Simulateur: React + Vite + Tailwind — GitHub Pages (branch gh-pages)
Native    : Expo SDK 54 / React Native 0.81.5 (APK juin 2026)
PC Agent  : Python Nexus (nexus/) — tourne sur PC Kouider
Telegram  : canal backup/admin (pas canal principal)
Queue     : BullMQ + Redis (Upstash) — 25 jobs schedulés
Calendar  : Google Calendar (service account fikconciergerie@gmail.com)
Storage   : Cloudinary (images/vidéos) + Supabase Storage (documents)
Push      : Expo Push + Firebase FCM (firebase-admin)
```

## Variables Railway (toutes configurées)

**Obligatoires ✅:**
- `ANTHROPIC_API_KEY`
- `SUPABASE_URL` + `SUPABASE_SERVICE_KEY`
- `REDIS_URL`
- `MOBILE_ACCESS_TOKEN` (Kouider)
- `MOBILE_TOKEN_HOUARI` ✅ ajouté 2026-05-21
- `ELEVENLABS_API_KEY` + `ELEVENLABS_VOICE_ID`
- `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID`
- `GOOGLE_MAPS_API_KEY` ✅ ajouté 2026-05-21
- `PC_AGENT_TOKEN` + `WEBHOOK_SECRET` + `SESSION_SECRET`
- `PUSHOVER_USER_KEY` + `PUSHOVER_APP_TOKEN`

**Optionnels configurés ✅:**
- `GOOGLE_SERVICE_ACCOUNT_JSON` (Google Calendar)
- `CLOUDINARY_*` (images/vidéos)
- `GROQ_API_KEY` + `OPENAI_API_KEY` + `GEMINI_API_KEY`
- `ASSEMBLYAI_API_KEY`

**Optionnels manquants ❌:**
- `FIREBASE_SERVICE_ACCOUNT_JSON` (FCM natif — attendre APK juin)
- `TWILIO_*` (WhatsApp — août 2026)

## Tables Supabase

**Fik Conciergerie (existantes) :**
- `cars` — véhicules
- `bookings` — réservations (status: PENDING/CONFIRMED/REJECTED/ACTIVE/COMPLETED)
- `profiles` — admins
- `payments` — paiements
- `reviews` — avis clients

**Ibrahim/Dzaryx (créées) :**
- `ibrahim_memory` — mémoire permanente
- `conversations`, `ibrahim_rules`, `integrations`, `notifications`, `tasks`
- `task_runs`, `validations`, `user_preferences`, `projects`
- `learned_rules` ✅ Phase 8 — règles apprises par conversation
- `assistant_profiles` ✅ Phase 8 — profil Dzaryx par acteur
- `user_behavior` ✅ Phase 8
- `conversation_patterns` ✅ Phase 8
- `contracts` ✅ Phase 8 — contrats PDF générés
- `payment_links` ✅ Phase 8 — liens paiement Chargily (futur)
- `whatsapp_messages` ✅ Phase 8 — log WhatsApp (futur)
- `document_access_logs`, `payment_logs`
- `vehicle_states` — inspection avant/après location
- `client_intelligence` — score VIP/FREQUENT/REGULAR/NEW + brain (arrival_patterns, passport_number, ai_insights) ✅ 2026-05-22
- `dzaryx_observations` ✅ 2026-05-22 — observations libres accumulées par acteur
- `actor_brain` ✅ 2026-05-22 — apprentissage vocabulaire/style Kouider et Houari

**RPC fonctions :** `check_car_availability`, `check_vehicle_availability`, `create_booking_safe`, `get_booking_summary`

## Structure fichiers backend critiques

```
backend/src/
├── api/routes/
│   ├── chat.ts              # Route principale chat + streaming
│   ├── vision.ts            # Vision caméra + SCAN temps réel
│   ├── telegram.ts          # Bot Telegram (photos, PDF, OCR)
│   ├── bookings.ts          # API réservations
│   ├── finance.ts           # Dashboard financier
│   ├── calendar.ts          # Google Calendar
│   ├── tts.ts               # ElevenLabs TTS
│   ├── documents.ts         # Stockage documents
│   └── widget.ts            # Widget AutoLux
├── integrations/
│   ├── claude-api.ts        # Wrapper Claude API (streaming + caching)
│   ├── tool-executor.ts     # Exécuteur outils (DOIT retourner string)
│   ├── tools.ts             # Définitions outils Claude (14 agents)
│   ├── maps.ts              # Google Distance Matrix + Waze/GMaps links ← GPS
│   ├── finance.ts           # computeBookingFinancials()
│   ├── phase5-finance.ts    # resolveFinancials() dashboard
│   ├── media-processing.ts  # Cloudinary
│   ├── learned-rules.ts     # Phase 8 — règles apprises
│   ├── generate-contract.ts # Phase 8 — contrat PDF
│   └── client-brain.ts      # Brain — intelligence client + actor learning ← NOUVEAU
├── notifications/
│   ├── mobile-push.ts       # emitProactive() — Socket.IO + Expo + FCM
│   └── fcm.ts               # Firebase FCM natif
├── conversation/
│   ├── context-builder.ts   # buildContext() — règles injectées ici
│   ├── orchestrator.ts      # Point entrée AI + Guards anti-hallucination
│   └── proactive-engine.ts  # Moteur proactif
└── queue/
    ├── scheduler.ts         # BullMQ jobs cron (12 jobs)
    └── jobs/
        └── proactive-jobs.ts # Implémentation de chaque job
```

## Structure simulateur

```
simulator/src/
├── components/
│   ├── Phone.tsx            # Coque Android, tabs, login/logout
│   └── screens/
│       ├── VoiceScreen.tsx      # VOIX — vocal + SCAN OCR
│       ├── TextScreen.tsx       # CHAT — streaming + TTS
│       ├── CapacitesScreen.tsx  # DZARYX — 14 agents + proactif + capacités
│       ├── BookingsScreen.tsx   # RESAS — liste + GPS LIVRAISON ← GPS panel
│       ├── FleetScreen.tsx      # PARC — flotte + toggle dispo
│       ├── RevenueScreen.tsx    # CA — revenus K/H + annuel
│       ├── ClientsScreen.tsx    # CLIENTS — VIP score + search
│       ├── CalendarScreen.tsx   # AGENDA — grille mensuelle
│       ├── NotificationsScreen.tsx # ALERTES — HIGH/MED/LOW
│       ├── RemindersScreen.tsx  # RAPPELS — URGENT priority
│       ├── DocumentsScreen.tsx  # DOCS — fetch + OCR + Contrat PDF ← Phase 8
│       └── SettingsScreen.tsx   # CONFIG — acteur + Nexus live + Règles ← Phase 8
└── services/
    └── api.ts               # Client API backend Railway
```

## Logins simulateur

| Acteur | Login | Mot de passe | Couleur |
|---|---|---|---|
| Kouider | kouider | kouider31 | Cyan #00e5ff |
| Houari | houari | houari31 | Violet #7c3aed |

## Règles de code (jamais déroger)

```
1. cd backend && npx tsc --noEmit → 0 erreurs AVANT tout commit
2. Profit = (client_price_per_day - owner_price_per_day) × nb_days — JAMAIS catalogue
3. Si owner_price_per_day NULL → profit = null (jamais inventé)
4. git add <fichiers spécifiques> — JAMAIS git add -A ou git add .
5. Tool executor : TOUJOURS retourner string, jamais objet/array
6. Simulateur : builder + pousser sur gh-pages branch manuellement
7. Simulateur = zone test principale AVANT APK Android
```
