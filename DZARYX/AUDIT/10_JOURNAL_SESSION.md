# 10 — Journal de Session (VIVANT)

> ⭐ **Le fichier le plus important pour reprendre.** À chaque changement (ajout / modif / suppression),
> on note ici **en temps réel**. Si la session se ferme brusquement, le prochain Claude lit ce journal
> et sait EXACTEMENT où on s'est arrêté et quoi faire ensuite.
> Retour : [[🏠 HUB]]

---

## 📌 Comment utiliser ce journal (pour le prochain Claude)

1. **Lis l'entrée la plus récente en haut** → tu sais où on en est.
2. Regarde **"⏭️ Prochaine étape"** → tu sais quoi faire.
3. Avant de coder : `tsc --noEmit` doit être à 0. Après chaque action : **ajoute une ligne ici**.
4. Format d'une entrée :
   ```
   ### YYYY-MM-DD HH:MM — Titre court
   - **Quoi** : ce qui a été fait
   - **Pourquoi** : la raison
   - **Fichiers** : chemins touchés
   - **Commit** : hash si poussé
   - **État** : ✅ déployé / 🟡 en cours / ❌ bloqué
   - **⏭️ Prochaine étape** : ...
   ```

---

## 🟢 ÉTAT ACTUEL (dernière mise à jour : 2026-06-11)

- **Migrations Supabase** : ✅ TOUTES LANCÉES (confirmé Kouider 2026-06-11) — `migration_car_currency.sql`,
  `migration_inspection_upgrade.sql`, `migration_phase_extras.sql`. Plus aucune migration en attente.
- **Darija (06-10)** : réponse 100% darija oranaise max-arabe (labels traduits, noms propres/montants gardés),
  voix TTS arabe dédiée auto-switch (`ELEVENLABS_VOICE_ID_AR`), arabizi prononcé phonétique (3→ع etc., chiffres
  réels intacts), STT primaire = **OpenAI gpt-4o-transcribe** (Groq Whisper → Google en fallback).
- **Vocal (06-10)** : tap micro = hard reset (recorder bloqué, AudioContext, stream mort) — plus besoin de fermer
  l'app. Watchdog thinking 12s. Auto-recover micro mort au tap.
- **Features actives (06-10, décision Kouider — garder 3/6)** : `estimate_damage` (estimation dégâts par photo,
  Vision Sonnet), `create_signature_link` + page publique `/sign/:token` (signature électronique contrat, table
  `contract_signatures`), `apply_dynamic_pricing` (bloque sous prix proprio). **Retirés** : dépenses/P&L,
  alertes expiration, compteur location (`0ef121b`).
- **Scan ID (06-10)** : auto-archivage dans la fiche client (bucket `client-documents` + table `client_documents`),
  regex tolérante aux fautes (paseport, carte/pièce d'identité, CIN).
- **RESAS fix (06-10)** : MARGE calculée live = (client − proprio) × jours (champ `profit_kouider` stale ignoré).
- **Docs (06-10)** : handoff A→Z créé → **`DZARYX/HANDOFF/`** (hub + H01-H15 interliées, reprise de zéro).
- **Site (06-09, commit `eebc960`)** : autocomplétion adresse Google dans l'admin immo → carte précise sur l'annonce.

### Rappel état antérieur (2026-06-07)

- **Site** : LIVE, mode dispo "à confirmer" ON, chatbot retiré.
- **Backend** : LIVE sur Railway. Bot WhatsApp client **désactivé** (commit `fbf2a3c`). Immo unifié (commit `c6c4fd3`).
- **Immo** : schéma `properties` unifié app+site. Table prod **vide** (0 bien).
- **Migrations** : 0015/0016/0017/0018 faites. Aucune migration en attente.
- **Packs** : déployés + SQL 0018 lancé. Liés à l'inventaire réel. Gérables via chat Dzaryx. 100% opérationnel.
- **Simulateur (= l'UI réelle de l'app)** : LIVE github.io. Cache SW **v43**. ⚠️ Après chaque deploy, Kouider
  doit **fermer l'app à FOND + rouvrir** (sinon l'ancien SW sert l'ancienne UI). Voir [[dzaryx_ui_architecture]].
- **App native** : redesign Gemini fait (vocal + chat + vision). Overlay flottant **OK** (testé OnePlus 5T).
  Wake word "Zaria" (Porcupine) **branché mais ne fire PAS encore en vocal** (init/sensibilité — la notif tap
  marche comme substitut). Dernier APK installé = build wake word. **Sécu** : tokens mobiles sortis du repo → **env**
  (`5efb8e7`). EAS relié au compte Play officiel `@fikdzaryx/dzaryx` (`819a3e7`).
- **Chat Dzaryx (06-07 PM)** : façon ChatGPT/Gemini — copier, markdown, dictée vocale, régénérer, éditer, recherche
  historique, streaming typewriter, **graphiques** (barres/camembert/courbe), **téléchargement** photos+graphes.
- **Création annonces via chat (06-07 PM)** : Dzaryx crée voiture loc/vente, immo loc/vente, pack — et **attache
  les photos jointes au chat** automatiquement. **Testé live, vert.** Vision marche aussi dans le chat.

### 🛑 OÙ ON S'EST ARRÊTÉ EXACTEMENT (fin session 2026-06-07 ~18h15)

Session clôturée proprement (changelog `aa8b2d0`, journal à jour). Tout déployé + testé live. **Reste 3 trucs,
tous OPTIONNELS** (Kouider a explicitement exclu le Play Store pour l'instant) :

1. **Wake word "Zaria" en vocal ne fire pas** — Porcupine s'initialise mais ne détecte pas la voix. La notif tap +
   l'overlay marchent comme substitut. → **Besoin des logs du device** (logcat OnePlus 5T) pour debugger. Pistes :
   version Porcupine vs `.ppn` v4, sensibilité (0.85), micro déjà capté par l'app.
2. **Upload + analyse PDF/Excel dans le chat** — pas fait. Envoyer un contrat/facture/tableau → Dzaryx lit/analyse.
   ~1h de boulot, besoin parsing backend.
3. **Vérifs côté Kouider (juste tester sur l'app réelle, pas du code)** : vision chat, store photos Jumpy,
   création annonce + photos sur autolux. (Tout vert en test backend, à confirmer sur device.)

**Play Store** = exclu pour l'instant (build prod AAB + clé de signature Google requise quand on voudra publier).

---

## Entrées (plus récent en haut)

### 2026-06-11 — Résilience "jamais mort" : crédits finis → bascule auto gratuit (commit `72af321`) ⭐
- **Objectif Kouider** : payé ce mois-ci, mais quand les abonnements/crédits finissent, tout doit basculer
  automatiquement sur du gratuit — jamais mort, puissance conservée.
- **Fait** :
  1. **Cerveau de secours AGENTIQUE** (`backend/src/integrations/agentic-fallback.ts`, nouveau) : Claude mort
     (crédits 400/401/429) → les **MÊMES 151 outils** tournent sur **Groq llama-3.3** puis **Gemini 2.0 Flash**
     (free tiers, API compatible OpenAI tool-calling) puis OpenAI. Branché en PREMIER fallback dans
     `orchestrator.ts` → résas/finance/photos continuent vraiment (avant : fallback texte SANS outils).
  2. **TTS jamais muet** (`dispatcher.ts`) : ElevenLabs échoue → **Gemini TTS** gratuit (PCM→WAV, lu tel quel
     par decodeAudioData, zéro changement client) → sinon event **`Dzaryx:tts_fallback`** → le **device parle**
     (speechSynthesis, `speakOnDevice()` dans `simulator/api.ts`, voix fr/ar auto).
  3. **Failover backend multi-URL** (`simulator/api.ts`) : `VITE_BACKEND_BACKUPS` = liste d'URLs backup.
     Erreur réseau / 502-504 / 4× connect_error socket → **bascule auto** + persistée localStorage.
     `BACKEND_URL`/`WS_URL` = live bindings → tous les écrans suivent.
  4. **`JOBS_ENABLED=false`** (`index.ts`) : l'instance backup ne lance pas scheduler/workers (pas de doubles
     notifs) — API/chat/sockets complets.
  5. **`render.yaml`** (racine) : blueprint Render free prêt pour déployer le backend backup en 1 clic.
  6. **Backup DB** (`.github/workflows/supabase-backup.yml`) : pg_dump hebdo (dimanche 03:00 UTC) → artefact
     GitHub 90 jours + déclenchement manuel.
- **Déployé** : backend Railway (push `72af321`) + simulateur gh-pages **v84** (Published). tsc 0, build OK.
- **🛑 ACTIONS REQUISES (Kouider, ~10 min)** :
  1. Créer compte **render.com** (login GitHub) → New → Blueprint → repo ibrahim → copier les env vars Railway
     → me donner l'URL Render pour la mettre dans `VITE_BACKEND_BACKUPS` + rebuild.
  2. Secret GitHub **`SUPABASE_DB_URL`** (repo Settings → Secrets → Actions) = connection string Supabase
     (Dashboard → Database) → le backup hebdo s'active.
  3. (optionnel) Compte **UptimeRobot** → monitors /health Railway + Render + site → alerte Telegram + garde
     Render éveillé.
- **⏭️ Reste** : URL Render dans les backups une fois le compte créé ; même failover pour le site (api côté
  Next.js) si souhaité.

### 2026-06-11 — 3 chantiers PRO gratuits (audit site/app → exécution) ⭐
- **Contexte** : audit complet site+app demandé → 3 améliorations à **0 € fixe**, branchées sur le vrai code.
- **1. Docs client sur `/suivi/[id]`** (site, commit `f633265`) : nouvelle route service-role
  `pages/api/booking-documents.js` → la page suivi affiche **paiement** (acompte/reste, multi-devise),
  **contrat** (statut signature + bouton "Signer" si pending → `/sign/:token` backend), **état des lieux
  avant/après** (photos Cloudinary + marqueurs dégâts colorés par sévérité + bannière accident + lightbox).
  Branché sur `payments`, `vehicle_states`, `contract_signatures`. Transparence anti-litige = pro.
- **2. Planning flotte admin** (site) : nouvelle page `pages/admin/planning.js` + entrée nav "Planning flotte" :
  **timeline Gantt** (voitures × 30j, fenêtre navigable, barres par statut, week-ends, today, lien résa) +
  **détection double-booking** + **dashboard relances** (départs/retours auj.+demain, soldes impayés avec
  **relance WhatsApp 1-clic**). Source impayés = `bookings.paid_amount`/`payment_status`.
- **3. Briefing matin = centre de commande + recouvrement** (backend, commit `f778d8c`) :
  `jobMorningBriefing` enrichi → bloc **"À encaisser"** (soldes dus) + bloc **"Documents à vérifier"**
  (passeport/permis qui expirent ≤7j). `getUnpaidBookings` génère par client une **relance WhatsApp en
  darija oranaise prête** (lien wa.me pré-rempli, multi-devise). Tool `get_unpaid_bookings` : dire
  *"relance les impayés"* / *"recouvrement"* → messages prêts. tsc 0, build site 0.
- **Déployé** : site → Vercel (push `f633265`), backend → Railway (push `f778d8c`).
- **Note** : `/api/booking-documents` utilise `SUPABASE_SERVICE_ROLE_KEY` (déjà présent sur Vercel via `booking.js`).
- **⏭️ Suite proposée (non faite, validée plus tard)** : acompte en ligne **Chargily** (0 € fixe, commission
  par transaction) — le seul qui demande un compte marchand. + compte client OTP + avis vérifiés post-location.

### 2026-06-11 — Audit complet + migrations confirmées + journal rattrapé
- **Quoi** : audit complet site+Dzaryx (docs vault + git des 2 repos). Kouider confirme : **toutes les migrations
  SQL sont lancées** (`car_currency`, `inspection_upgrade`, `phase_extras`). Journal mis à jour avec les sessions
  06-09/06-10 qui manquaient (le code était commité mais pas documenté ici).
- **Reste ouvert** : B025 (révoquer token GitHub `ghp_d8Vch...`), B030 (wake word Zaria — logcat), restreindre clé
  Google Maps, upload PDF/Excel chat (optionnel), vérifs device (darija vocal, signature, estimation dégâts, scan ID).
- **État** : ✅ docs à jour.

### 2026-06-10 — Estimation dégâts + signature électronique + pricing dynamique (3 features gardées sur 6)
- **Quoi** : 6 features additives livrées (`1d088f1`) puis **réduites à 3 sur décision Kouider** (`0ef121b`) :
  - `estimate_damage` — estimation coût dégâts depuis une photo (Claude Sonnet Vision).
  - `create_signature_link` + route publique **`/sign/:token`** — le client signe le contrat en ligne, archivé
    dans `contract_signatures` (migration `supabase/migration_phase_extras.sql` ✅ lancée).
  - `apply_dynamic_pricing` — modifie le prix/jour d'une voiture, **bloque sous le prix proprio**.
  - **Retirés** : add_car_expense/get_car_pnl, set_vehicle_documents/check_expirations, record_rental_meter.
- **Fix routing signature** (`f0f1059`) : "envoie le contrat à signer à X" routait vers l'agent clients qui n'avait
  pas `create_signature_link` → outil + keywords sign/signe/signer/signature ajoutés à l'agent clients.
- **Fichiers** : `backend/src/agents/agent-registry.ts`, `backend/src/api/routes/sign.ts`, `backend/src/index.ts`,
  `tool-executor.ts`, `tools.ts`, `supabase/migration_phase_extras.sql`.
- **État** : ✅ déployé Railway, tsc 0 erreur.

### 2026-06-10 — Darija oranaise à fond : réponse 100% arabe, voix TTS arabe, arabizi, STT gpt-4o-transcribe
- **Problème** : darija parlée massacrée par Groq Whisper turbo ("larbiëulak iver"), réponses mi-FR mi-darija,
  ElevenLabs lisait "3andek" → "trois-andek".
- **Fait** :
  - `225ebce` — **STT primaire = OpenAI gpt-4o-transcribe** (meilleur dialectes) + prompt biaisé darija,
    fallback Groq Whisper → Google.
  - `581bff2` + `8a6d51a` + `df8d434` — règle langue durcie (les 2 acteurs) : input darija → réponse **entièrement**
    darija oranaise, même pour rapports data/news/recherche revenus en FR ; max écriture arabe, labels traduits
    (acompte→التسبيق, payé→خلّص…), seuls noms propres/montants/emprunts authentiques restent en latin.
  - `7c69a5e` — **voix ElevenLabs arabe dédiée** auto-choisie par langue de la réponse (env `ELEVENLABS_VOICE_ID_AR`,
    fallback voix de base si absente).
  - `60dd650` — **arabizi phonétique** avant TTS (3=ع, 7=ح, 9=ق, 5=خ, 2=ء) seulement quand le chiffre touche une
    lettre → prix/dates (1200€, 27) intacts.
- **Fichiers** : `backend/src/conversation/context-builder.ts`, `backend/src/api/routes/transcribe.ts` (chaîne STT),
  TTS dispatcher.
- **État** : ✅ déployé. ⏭️ valider accent/compréhension sur device réel.

### 2026-06-10 — Vocal : hard reset micro au tap + auto-recover (plus besoin de fermer l'app)
- **Problème** : "le micro marche pas parfois" — stream suspendu (iOS/WebView), état "thinking" gelé, il fallait
  tuer l'app.
- **Fait** : `d0ddce5` — tap micro ré-initialise si track mort puis enregistre. `8a6d51a` — **hard reset** au tap
  (kill recorder bloqué, reset refs, resume/recreate AudioContext, re-init stream) + watchdog thinking 22s→**12s**
  + clear flag recording bloqué. SW **v81→v83**.
- **Fichiers** : `simulator/src/components/screens/VoiceScreen.tsx`, `simulator/public/sw.js`.
- **État** : ✅ déployé gh-pages. ⏭️ valider sur device.

### 2026-06-10 — RESAS : MARGE calculée live (fix 142€ faux)
- **Problème** : MARGE affichait 142€ (2/6 résas) — somme du champ stocké `profit_kouider`, **null** sur les résas
  créées sans le calcul (Sophia/Abdelkader/Omar avaient prix+jours mais pas de profit stocké).
- **Fix** : `dc4fa40` — marge calculée à la volée = (prix client − prix proprio) × jours par résa (jours dérivés
  des dates si absents). Auto-réparant. Ligne détail pareille. SW v82.
- **Fichiers** : `simulator/src/components/screens/BookingsScreen.tsx`.
- **État** : ✅ déployé.

### 2026-06-10 — Scan ID : archivage auto fiche client + regex tolérante
- **Fait** :
  - `f66b96f` — `scanIdentity` upload l'image dans le bucket **`client-documents`** + insert `client_documents`
    sous le nom extrait (données OCR incluses) → chaque scan archivé et retrouvable. Chaînage scan→résa déjà câblé.
  - `4b5a63d` — `ID_SCAN_RE` élargie : passeport/passport/pasport/**paseport** (typo), permis, carte/pièce
    d'identité, CIN → le verdict déterministe d'âge est utilisé (avant : Claude faisait son propre OCR contradictoire).
- **État** : ✅ déployé.

### 2026-06-10 — Handoff A→Z en notes Obsidian interliées
- **Quoi** : `af94eac` — dossier **`DZARYX/HANDOFF/`** : hub `00 HANDOFF HUB` + 15 notes H01-H15 (vue d'ensemble,
  stack, archi, agents/gardes, darija, outils, images, finance, écrans, DB, déploiement, env, démarrage local,
  état/trous/roadmap, fichiers clés). Version HTML single-file (`0d7b667`) supprimée au profit des notes.
- **But** : reprise du projet de zéro par n'importe quel dev/agent.
- **État** : ✅ commité.

### 2026-06-09 — Site : autocomplétion adresse admin immo → carte précise
- **Quoi** : site `eebc960` — admin immo du site utilise l'autocomplétion Google (via API publique backend)
  pour l'adresse → la carte de l'annonce immo est précise.
- **État** : ✅ déployé Vercel.

### 2026-06-08 — SARF retirée + reskin or + Houari loue en DZD (prix par voiture + CA dinars séparé)
- **Demandes** : (1) supprimer la page SARF ; (2) design pro façon Gemini partout ; (3) Houari loue en **dinars**
  avec SES prix (Kouider reste en € inchangé), avec un **CA en dinars en plus**, sans rien casser.
- **Fait** :
  - **SARF supprimée** de la nav + routage (CurrencyScreen plus utilisée). Backend rates.ts laissé tel quel (inutilisé).
  - **Reskin or** (Kouider) : accent cyan → or `#e9b949` sur lock/login/home + barre de nav + icône (cohérent IMMO/ACHAT).
    Houari garde le violet. (Les écrans internes cyan = reskin or à faire ensuite — décision Kouider.)
  - **Prix Houari DZD par voiture** : colonnes `cars.houari_base_price` / `houari_resale_price` (migration
    `migration_car_currency.sql`). PATCH `/api/cars/:id` accepte ces champs + `owner_price_per_day`.
  - **PARC actor-aware** (`FleetScreen`) : Houari voit/édite ses prix en **DA** (bouton ✎ → modal prix proprio/client),
    Kouider voit/édite en **€**. Badge devise par ligne.
  - **CA dinars séparé** : `finance.ts` — les totaux EUR **excluent** les locations DZD (chiffres actuels inchangés) +
    bloc `dzd` (ca, houariCA, encaissé, à encaisser). `RevenueScreen` affiche une carte "💱 CA en dinars (Houari)".
  - **RESAS** gérait déjà le choix EUR/DZD à la réservation (devise auto = DZD pour Houari, KPIs CA €/CA DZD séparés).
- **Commits** : `cdccf91` (SARF retiré + reskin or), `12a22fa` (Houari DZD + CA dinars). Simulateur **v51**. tsc backend EXIT 0.
- **🛑 ACTION REQUISE (Kouider)** : lancer **`supabase/migration_car_currency.sql`** (colonnes prix Houari DZD).
  Tant que pas fait, l'édition des prix DZD échoue (colonnes manquantes). Ensuite : me donner les prix DZD par voiture
  (ou les saisir via ✎ sur le login Houari).
- **⏭️ Reste** : reskin or des écrans internes (PARC/RESAS/CA/CLIENTS/CONFIG…) ; option : préremplir le prix DZD du
  véhicule à la résa Houari.

### 2026-06-08 — IMMO/ACHAT : annonces complètes + photos + adresse + Opportunités (veille marché)
- **Demandes Kouider** (suite refonte) : (1) remplacer "ce que Dzaryx sait faire" par un court "comment utiliser" ;
  (2) formulaires d'annonce aussi complets que le site (toutes les infos + **plusieurs photos**) ; (3) **adresse**
  autocomplétée (façon RESAS/Google) → **carte** sur l'annonce immo du site ; (4) remplacer "Opportunités" par une
  **vraie veille business** (marché auto Algérie, nouveautés, **lois d'import**, blocage bateaux été, quand importer…).
- **Fait** :
  1. **Forms complets** (app) : immo = type/surface/pièces/chambres/SDB/étage/adresse/description ; voiture à vendre =
     carburant/boîte/ville/état/description. **Multi-photos** (1ʳᵉ = principale). Backend `immo.ts` POST accepte tous
     les champs + `photos[]` → Cloudinary → `property_photos`/`vehicle_sale_photos` + `image_url`.
  2. **Adresse autocomplétée** via `/api/maps/autocomplete` (Google Places, déjà existant) → composant `AddressInput`
     débouncé. La **carte** est **déjà** rendue sur `immo/[id].js` du site (embed par adresse) → rien à changer côté site.
  3. **"Comment utiliser"** (4 lignes) remplace les cartes capacités sur IMMO + ACHAT.
  4. **Opportunités = veille réelle** : `backend/src/integrations/opportunities.ts` — Claude **Sonnet + web_search natif**
     → briefing JSON (marché/location/nouveautés/lois/import) orienté Oran, **cache Redis 12h**. Route
     `GET /api/deals/opportunities?force=`. App : onglet Opportunités dynamique (résumé + cartes catégorie + urgence +
     bouton Actualiser). **Testé live : 8 items pertinents** (Fiat Tafraoui, marques chinoises, etc.).
- **Piège résolu** : le modèle écrivait une longue analyse avant le JSON → tronqué. Fix : **JSON-only strict** +
  `max_tokens 4500` (commit `60719d5`).
- **Commits** : `68295d5` (forms+photos+adresse+comment utiliser), `a1d254b` + `60719d5` (opportunités). Simulateur **v49**.
  tsc backend EXIT 0, build sim EXIT 0.
- **⏭️ Reste (optionnel)** : **auto-veille quotidienne** — job scheduler qui rafraîchit les opportunités chaque jour
  et **pousse une notif proactive** si une opportunité `urgent` apparaît ("Kouider, bientôt import -10 ans…").
  Aujourd'hui c'est à la demande (bouton Actualiser) + cache 12h. (Champ debug `_raw` laissé sur réponse vide.)

### 2026-06-08 — Refonte nav : pages IMMO + ACHAT/REVENTE premium (Gemini), Capacités → Config
- **Demande Kouider** : virer l'onglet **DZARYX** (Capacités/Proactif, inutile) → le mettre dans Config ; le
  remplacer par une page **IMMO** (location+vente, connectée au site, + capacités Dzaryx immo) ; ajouter une page
  **ACHAT/REVENTE** (voitures + immo + opportunités) ; design **premium façon Gemini**, sans rien casser.
- **Fait** (simulateur = l'UI réelle) :
  - Onglet `capacites` (DZARYX) **retiré de la nav** → `CapacitesScreen` intégré **en bas de CONFIG** (repliable).
  - **`ImmoProScreen.tsx`** (nouveau) : hub immo premium — filtres Tous/À louer/À vendre, stats, ajout bien, cycle
    statut, **état des lieux** (réutilise `InspectionModal`, exporté depuis FleetScreen), section "Ce que Dzaryx fait
    pour l'immo". Données via `/api/immo` (site).
  - **`DealsScreen.tsx`** (nouveau) : ACHAT/REVENTE — onglets Voitures / Immo / Opportunités, ajout voiture à vendre,
    cycle statut, exemples d'analyse d'opportunités, section capacités Dzaryx (estimer prix, marge, créer annonce…).
  - Design : noir + or, typo sans-serif, cartes douces, dégradés, pills statut — rupture avec le cyberpunk
    (Orbitron/cyan) des autres écrans.
  - Nav Kouider : VOIX·CHAT·**IMMO**·**ACHAT**·RESAS·PARC·CA·CLIENTS·DEMANDES·AGENDA·DOCS·CONFIG. IMMO+ACHAT visibles
    aussi Houari ; SARF reste Houari, DOCS reste Kouider. Ancien `ImmoScreen.tsx` (Houari) = **fichier mort** (plus importé).
- **Commit** : `e49c978`. Simulateur gh-pages **v47**. Build EXIT 0.
- **⏭️ Suite possible** : rendre les autres écrans (PARC/RESAS/CA…) au même style Gemini si Kouider valide la direction ;
  brancher "Opportunités" sur une vraie analyse Dzaryx (outil estimation marge).

### 2026-06-08 — Inspection avant/après : véhicule + immobilier (Vision Sonnet, photo stockée, marqueurs, lien réservation) ⭐
- **Demande Kouider** : quand on prend une photo avant/après d'un véhicule (loué à un client), l'enregistrer **avec
  la réservation du client**, l'**analyser avec Claude Vision** (accident/dégâts en détail, vrai avant/après), et
  **montrer où sont les défauts**. Pareil pour les **biens immobiliers**.
- **Ce qui existait** : table `vehicle_states` + analyse Vision (Haiku) avant/après, mais photo **non stockée**
  (`photos: []`), **pas liée** à la réservation, **pas d'immo**, défauts en texte seulement.
- **Fait** :
  1. **`backend/src/integrations/inspection-core.ts`** (nouveau) — moteur partagé : analyse **Claude Sonnet 4.6**
     → **JSON structuré** = pour chaque dégât { label, severity, location, is_new, **box {x,y,w,h}** normalisé 0..1 }
     + flag **accident** + sévérité globale. Upload photo → **Cloudinary** (`uploadInspectionPhoto`).
  2. **`vehicle-state.ts`** réécrit — stocke la **photo Cloudinary**, **lie la réservation** du client
     (`resolveBookingId` : cherche le booking par client + voiture → `booking_id`), enregistre `damage_boxes`,
     `accident`, `severity`. Retour structuré (photoUrl + analysis) pour l'app.
  3. **`property-state.ts`** (nouveau) — même système pour l'**immobilier** (état des lieux entrée/sortie), table
     **`property_states`**, lié au bien (`property_id`) + locataire.
  4. **REST** `backend/src/api/routes/inspections.ts` : `POST /api/inspections/vehicle|property` (analyse) +
     `GET` (historique). Monté dans `index.ts`.
  5. **Chat** : tools `save_property_state_before/after`, `get_property_states` (tools.ts + tool-executor.ts) ;
     **fast-path** orchestrator étendu — détecte véhicule **ou** bien (mots immo + état des lieux) sur photo+message.
  6. **App** (`simulator/.../FleetScreen.tsx`) : modal **`InspectionModal`** générique (véhicule + bien). Affiche la
     **photo avec marqueurs numérotés** des dégâts (boîtes colorées par sévérité) + **légende** + bannière 🚨
     **accident** + rapport texte. Bouton 📷 ajouté aussi sur chaque **bien** de l'onglet IMMO.
- **Décisions (validées Kouider)** : marqueurs visuels sur la photo + modèle **Sonnet 4.6** (preuve litige → précision).
- **Fichiers** : voir liste ci-dessus + `simulator/src/services/api.ts` (méthodes `inspect`/`fetchInspections` + types),
  `supabase/migration_inspection_upgrade.sql`.
- **Commit** : `84583b4` (poussé → Railway). Simulateur gh-pages **v44** (Published). tsc backend EXIT 0, build sim EXIT 0.
- **🛑 ACTION REQUISE (Kouider)** : lancer **`supabase/migration_inspection_upgrade.sql`** dans Supabase > SQL Editor
  (ajoute `damage_boxes`/`accident`/`severity` à `vehicle_states` + crée `property_states`). **Tant que pas fait,
  l'enregistrement d'une inspection échoue** (colonnes/table manquantes).
- **Multi-photos ✅ (ajouté ensuite, commit `bb50152`)** : une inspection accepte **plusieurs photos** (angles).
  `inspection-core.analyzeInspectionPhotos` + `processInspection` (chaque dégât tagué `photo_index`). REST accepte
  `images[]`. App : sélection multi (miniatures + retrait), bouton ANALYSER (N), résultat = chaque photo avec ses
  marqueurs + légende globale. Pas de changement SQL (photos `TEXT[]`, `damage_boxes` JSONB). Simulateur **v45**.
- **⏭️ Idées suite** : PDF du constat avant/après signable, rattacher l'inspection au PDF de contrat de location.

### 2026-06-08 — Vérif toggle dispo/indispo + fix refresh catalogue site
- **Demande** : vérifier que le bouton DISPO (écran PARC de l'app) passe vraiment les véhicules
  disponible/indisponible **et** que ça se reflète sur le site.
- **Vérif (chaîne complète, OK)** : `FleetScreen.toggle` → `api.toggleCar(id, !available)` →
  **`PATCH /api/cars/:id {available}`** → backend `cars.ts` (zod whitelist inclut `available`) →
  `supabase.from('cars').update({available})`. ✅ écrit bien la colonne `cars.available`.
- **Côté site** (`rental-system`) : la dispo par voiture = `car.available && !réservation_active_aujourdhui`.
  - **Détail** `/cars/[id]` : `getServerSideProps` → instant. ✅
  - **Home** `/` : getStaticProps r:10 **+ refetch client** → instant au reload ; une voiture indispo est
    **cachée** du carrousel (dans les 2 modes).
  - **Catalogue** `/cars` : ⚠️ ne faisait QUE `getStaticProps revalidate:30` (pas de refetch client) → un
    toggle n'apparaissait qu'après revalidation ISR (même classe de bug que la page avis).
- **Fix** : ajout d'un **refetch client des cars au mount** dans `pages/cars.js` (pattern de la home). SSR/ISR gardé
  pour le SEO. Build site EXIT 0.
- **⚠️ Rappel mode dispo** (important pour Kouider plus tard) : tant que le **mode "à confirmer"** est **ON**
  (état actuel), le **catalogue** affiche TOUT en "Sur demande" / "Vérifier la dispo" et **ignore** `available`
  pour le badge → un toggle indispo n'a pas d'effet visuel sur `/cars` (la home, elle, cache quand même la voiture).
  Quand Kouider aura les vraies dates → **Admin → Réglages → "Disponibilité des voitures" → 🟢 Dispos réelles**
  (`availability_mode=false`, migration 0017 déjà faite) → là le catalogue + détail montrent vert "Disponible" /
  rouge "Indisponible" selon le toggle. Voir [[08_DECISIONS#mode-dispo]].
- **Commit** : site `c247974` (poussé → Vercel). **État** : ✅ déployé.

### 2026-06-07 17:06 — Dzaryx crée les annonces + attache les photos du chat (+ fixes) ⭐ DERNIER TRAVAIL
- **Quoi** : Dzaryx peut maintenant **créer une annonce depuis le chat** et y **attacher les photos jointes**
  au message, pour les 4 types :
  | Type | Outil | Photos |
  |---|---|---|
  | Voiture location | `add_car` | ✅ multi → `car_photos` + `image_url` |
  | Immobilier (loc/vente) | `create_property` | ✅ multi → `property_photos` + `image_url` |
  | Voiture à vendre | `add_vehicle_for_sale` | ✅ multi → `vehicle_sale_photos` + `image_url` |
  | Pack | `create_pack` | ✅ photo principale (`image_url`) |
- **Mécanique photos** : nouveau endpoint **`POST /api/cars/session-photos`** → upload Cloudinary + cache Redis
  `session:photos:{sessionId}` (TTL 15 min). À la création, `attachSessionPhotos()` consomme le cache et lie les
  photos à la nouvelle ligne. Frontend `TextScreen` : fonction `isCreateIntent` distingue **3 cas** quand tu joins
  des photos → (a) *"crée une voiture/appart/pack…"* = nouvelle annonce + photos ; (b) *"range/enregistre les photos
  du Clio"* = ajout à une annonce **existante** ; (c) *"tu vois quoi"* = analyse **vision**.
- **Bugs trouvés + fixés dans la foulée** :
  - `d4aa670` — **matching voiture** par score de tokens (≥3 lettres) dans `/api/cars/photos`. Avant, le fallback
    exigeait TOUS les mots → un token "9" cassait "Jumpy 9 Places".
  - `e54811b` — **vision dans le chat** : bypass des guards business (`fastPathGuard`/`checkAntiHallucination`)
    quand `imageBase64` présent. La réponse décrit l'image (pas une requête DB) → était écrasée à tort par
    `FAST_PATH_REFUSAL`.
  - `4856275` — **`add_car` débloqué** : il était scopé HORS des agents → Dzaryx ne pouvait PAS créer de voiture
    de location. Ajouté aux agents **Réservations + Général**.
- **Exemples à dire à Dzaryx** : *"crée une nouvelle voiture de location Clio 5, citadine, essence, prix client
  4500, prix proprio 3500"* (+ photos jointes) · *"ajoute un appartement à louer à Oran, 3 pièces, 50000 DA/mois"*
  (+ photos) · *"ajoute une voiture à vendre Golf 7, 2018, 280 DA"* (+ photos).
- **Fichiers** : `backend/src/api/routes/cars.ts` (endpoint + attach), `backend/src/integrations/tool-executor.ts`,
  `backend/src/integrations/tools.ts`, `backend/src/agents/agent-registry.ts`,
  `simulator/src/components/screens/TextScreen.tsx`, `simulator/src/services/api.ts` (`uploadSessionPhotos`).
- **Commits** : `1d5bd08` (upload multi-photos), `d4aa670`, `e54811b`, `4856275`, `9e45312` (attach), `aa8b2d0` (changelog).
- **Test live end-to-end (prod Railway + Supabase)** : ✅ `session-photos: 200 {count:2}` → `chat: 202` →
  `CAR CREATED + image_url:true` → `PHOTOS attached: 2 (position 0,1)` → `CLEANED UP`. Tout vert.
- **État** : ✅ déployé (backend Railway `9e45312` + web gh-pages **v43**). Session clôturée.
- **⏭️ Prochaine étape** : voir **"OÙ ON S'EST ARRÊTÉ"** en haut (wake word logs / PDF-Excel / vérifs device).

### 2026-06-07 13:30→16:00 — Chat façon ChatGPT/Gemini + sécu tokens env + EAS relink
- **Quoi** (tout dans le **simulateur** `TextScreen.tsx`, = l'UI réelle ; ordre chronologique) :
  - `5022f43` — **bouton Copier** visible (façon Gemini/ChatGPT) + affichage du **texte complet** + espace en bas.
  - `4f67b83` — **rendu markdown** (gras / listes / titres / tableaux / code) façon ChatGPT/Claude.
  - `11ba8c6` — **dictée vocale** dans le chat (micro → transcription dans l'input).
  - `e12395d` — bouton **Régénérer** (renvoie le dernier message).
  - `70f7f88` + `6d95e21` — **graphiques** : Dzaryx génère barres/camembert/courbe via un **bloc `chart` JSON**
    dans sa réponse. ⚠️ `6d95e21` corrige une confusion : le backend prenait le chat texte pour du vocal →
    flag **`textOnly`** ajouté pour que markdown + graphes ne s'affichent QUE en chat texte.
  - `1001514` — **streaming typewriter** + **téléchargement** des photos ET des graphiques en galerie
    (`expo-media-library` côté natif).
  - `265bcfd` — **éditer un message** déjà envoyé + **recherche** dans l'historique.
- **Sécu** : `5efb8e7` — **tokens mobiles sortis du repo** (Kouider/Houari) → lus via **variables d'env** au build
  (plus en dur dans `dzaryx-native/app/index.tsx`). Voir [[08_DECISIONS#tokens-env]].
- **EAS** : `819a3e7` — projet relié au compte Play **officiel** `@fikdzaryx/dzaryx` (pour les futurs builds de prod).
- **Fichiers** : `simulator/src/components/screens/TextScreen.tsx`, `simulator/src/services/api.ts`,
  `backend/src/conversation/context-builder.ts`, `backend/src/conversation/orchestrator.ts`,
  `dzaryx-native/app/index.tsx`, `dzaryx-native/app.json`, `simulator/public/sw.js` (bumps v37→v43).
- **État** : ✅ déployé (web gh-pages + backend Railway).

### 2026-06-07 14:39 — Réservations : attribution Kouider/Houari robuste + "qui a bloqué ?"
- **Quoi** : `create_booking` attribue maintenant la réservation au **bon acteur** (Kouider/Houari) de façon
  robuste ; le **check de dispo** dit désormais **QUI** a bloqué le créneau (acteur + client + dates) au lieu d'un
  simple "indispo" ; la **liste** des réservations est filtrée **par acteur**.
- **Pourquoi** : Kouider et Houari sont parfois connectés **en même temps**, chacun sur son login → il faut que rien
  ne se mélange et qu'on voie d'où vient un conflit de dates.
- **Fichiers** : `backend/src/integrations/tool-executor.ts`. **Commit** : `7283337`.
- **État** : ✅ déployé (Railway). tsc backend EXIT 0.

### 2026-06-07 — Vocal: tap-to-talk partout + wake service robuste + vision overlay→app
- **Bug central** : le VAD (détection volume) flicke sur le micro de Kouider → coupe le micro instantanément
  (app ET overlay). SpeechRecognition Google **cassé dans la WebView** (gèle si activé). 
  → **Solution** : SpeechRecognition DÉSACTIVÉ partout ; **tap-to-talk par défaut** (tap micro=enregistre,
  re-tap=envoie ; VAD ne tourne que si "Mains libres" activé manuellement). App vocal = **OK confirmé** par Kouider.
  Commits web : `0e3103a`, `a94d671`, `8fbe382`, etc.
- **Overlay micro** : AudioContext suspendu en overlay → VAD coupait → tap-to-talk (MediaRecorder, indép. AudioContext).
- **Wake/notif cassés après réinstall+reboot** : service fond tué + Porcupine perd son activation (cache effacé,
  besoin internet). → Build robuste : **service ne se tue JAMAIS** (notif reste même si Porcupine échoue) + **retry**
  Porcupine (8-10s) + **BootReceiver** (auto-start après reboot) + **exemption batterie** (popup au lancement).
- **Vision overlay** : le micro/file-chooser en overlay = limité → bouton caméra overlay fait `window.location='dzaryx://vision'`,
  capté par le WebViewClient de l'overlay (`shouldOverrideUrlLoading`) → ouvre l'app + `__triggerVision` → `toggleLiveCam`.
- **Fichiers** : `plugins/withDzaryxWakeWord.js` (resilient+boot+battery), `plugins/withDzaryxOverlay.js` (deep-link),
  `app/index.tsx` (dzaryx://vision), `VoiceScreen.tsx` (tap-to-talk, __triggerVision, bouton vision deep-link).
- **Commit** : `7962f96`. Prebuild clean validé. Build EAS robuste en cours.
- **État** : 🟡 build en cours. APK précédents : wake `nTAdWGSKpDR6XyyEAWXdmg.apk`.
- **⏭️ Reste** : confirmer overlay micro marche (sinon Android bloque le micro en fenêtre overlay = pivoter wake→ouvre app) ;
  Play Store (prod AAB, besoin clé Google) ; sécu tokens en dur dans index.tsx.

### 2026-06-06 — Wake word "Zaria" (Porcupine, service fond) + barre fine overlay
- **Barre fine** : overlay passé d'un panneau 42% à une **barre fine 88dp** en haut (plugin `density*88`, fond transparent)
  + rendu web compact `compact` (App.tsx `?overlay=1` → VoiceScreen compact = logo/texte/caméra/mic, commit `380bf46`).
- **Fix micro overlay** : SpeechRecognition KO dans la WebView overlay → en `compact` on force **VAD+Whisper**
  (`startSRDictation` return false si compact ; + fallback si SR error fatal). Commit `2ed7dd2`. (Web, pas de build.)
- **Wake word** : Picovoice approuvé. Wake word entraîné = **"Zaria"** (en, Android, `Zaria_en_android_v4_0_0.ppn`)
  — "Dzaryx" refusé par le vocab Porcupine (mot inventé). Modèle copié `dzaryx-native/assets/wakeword/Zaria_android.ppn`.
  Plugin `withDzaryxWakeWord.js` : dépendance `ai.picovoice:porcupine-android:3.0.2`, **Service fond** `DzaryxWakeWordService`
  (PorcupineManager → onWake → démarre `DzaryxOverlayService`), activity trampoline `dzaryxwake://start`, copie .ppn en assets.
  Démarrage : `index.tsx` → `Linking.openURL('dzaryxwake://start')` au lancement (1.5s delay).
- **⚠️ Clé Picovoice** : PAS dans le repo (bloqué par classifier, à raison). Stockée en **variable d'env EAS**
  `PICOVOICE_ACCESS_KEY` (env production, sensitive). Plugin la lit via `process.env`. Révocable sur console.picovoice.ai.
- **⚠️ Risques** : (1) version Porcupine 3.0.2 vs .ppn v4 → mismatch possible (wake silencieux) → bumper si besoin ;
  (2) pas d'auto-start au boot (rouvrir app 1× après reboot) ; (3) vision dans overlay pas encore (file chooser natif).
- **Commits** : `380bf46` (barre), `2ed7dd2` (fix micro), `252c259` (wake word). Prebuild validé. Build EAS en cours.
- **État** : 🟡 build wake word en cours. APK barre fine OK avant : `rrmAjmp9rhQCR7ofdbzy6J.apk`.

### 2026-06-06 — Overlay flottant natif (Build A — itération 1)
- **Quoi** : config plugin Expo `dzaryx-native/plugins/withDzaryxOverlay.js` qui injecte au prebuild :
  permissions (SYSTEM_ALERT_WINDOW, FOREGROUND_SERVICE_MICROPHONE), un **Service Kotlin** `DzaryxOverlayService`
  (WebView chargeant la page vocale `?overlay=1` PAR-DESSUS les autres apps via WindowManager TYPE_APPLICATION_OVERLAY,
  onPermissionRequest→grant micro, bouton ✕), et une Activity trampoline `DzaryxOverlayLauncherActivity`
  (deep link `dzaryxoverlay://go` → demande permission overlay puis démarre le service).
- **Déclenchement** : bouton ⧉ (web VoiceScreen) → `sendNativeAction({__native_action:'open_overlay'})` →
  `index.tsx` → `Linking.openURL('dzaryxoverlay://go')`. (Plus tard : notif + wake word Picovoice → même deep link.)
- **⚠️ android/ est gitignored (managed)** → EAS régénère au prebuild → TOUT le natif DOIT passer par config plugin
  (pas d'édition directe de android/). Validé en local : `npx expo prebuild -p android` OK, Kotlin + manifest injectés.
- **Fichiers** : `dzaryx-native/plugins/withDzaryxOverlay.js`, `app.json` (plugin ajouté), `app/index.tsx` (handler open_overlay),
  `simulator/.../VoiceScreen.tsx` (bouton ⧉), `simulator/public/sw.js` (v24).
- **Commit** : `8221357`. Build EAS APK lancé (preview).
- **État** : ✅ **OVERLAY FONCTIONNE** (testé OnePlus 5T 2026-06-06) — la fenêtre Dzaryx s'affiche par-dessus
  l'écran d'accueil avec la voix compacte (logo, texte, mic, caméra, scan, ✕). APK : `hN4hgiVDV2DtZY7GGn3AoT.apk`
  (versionCode 16, keystore zlb4WDEwpw). Mode compact web `?overlay=1` (App.tsx → VoiceScreen seul, commit `455ab76`).
  ⚠️ Install : signature EAS ≠ signature Play (Google re-signe) → désinstaller l'app Play avant d'installer l'APK test.
- **⏭️ Itérations prévues** : (1) overlay COMPACT (voix seule, pas le shell complet) via mode `?overlay=1` dans App.tsx ;
  (2) passer l'auth/acteur dans l'URL (WebView overlay = session séparée) ; (3) déclencher depuis la notif + wake word ;
  (4) greeting auto "Je suis à ton écoute" au lancement overlay. Picovoice = en attente d'appro (Build B).

### 2026-06-06 — Itérations vocal Gemini (suite)
- **Quoi** : (1) **conversation continue mains-libres par défaut** (`handsFree`+`continuousMode` = true) → plus besoin
  d'appuyer, le VAD s'arme seul, détecte début/fin de phrase, répond, reboucle. (2) **Logo Dzaryx au centre**
  (remplace l'étoile) — `simulator/public/logo.png` (copié de `ibrahim/logo.png`), via `import.meta.env.BASE_URL`.
  (3) **Filtre anti-hallucination Whisper** côté backend (`transcribe.ts`) — jette "Merci/Sous-titres/amara.org…"
  inventés sur silence/bruit. (4) **Bump SW cache v17→v18** — l'ancien service worker cachait l'UI = les MAJ ne
  s'affichaient pas (cause des "ça change pas"). (5) **Barge-in** : coupe l'audio dès qu'on reparle (basé sur
  `isAudioPlaying()`, indépendant du statut). (6) **Flip caméra** avant/arrière en mode vision (+ miroir cam avant).
- **⚠️ Limite web confirmée** : Whisper-après-silence comprend moins bien que Gemini (= Google STT temps réel).
  Vrai saut = **STT natif** (`@react-native-voice` = Google SpeechRecognizer) → nécessite build EAS. Idem pour
  "Hey Dzaryx" fond/app fermée (Porcupine + foreground service Android). iPhone = Siri only.
- **⚠️ Cache** : à chaque déploiement, l'utilisateur doit **fermer l'app à FOND + rouvrir** (le SW sert l'ancienne
  version sinon). Network-first sur le HTML donc OK après 1 réouverture une fois le SW v18 actif.
- **Fichiers** : `simulator/src/components/screens/VoiceScreen.tsx`, `simulator/public/sw.js`, `simulator/public/logo.png`, `backend/src/api/routes/transcribe.ts`.
- **Commits** : `b8f9c87` (continu défaut), `49e4e98` (logo+filtre+SW), `c1187d7` (barge-in+flip). Build simulateur EXIT 0, tsc backend EXIT 0.
- **État** : ✅ github.io Published + backend poussé (Railway). Voir [[dzaryx_ui_architecture]].

### 2026-06-06 — Redesign UI Gemini : vocal + chat + vision (simulateur)
- **Quoi** : refonte visuelle des écrans VOIX (`VoiceScreen.tsx`) et CHAT (`TextScreen.tsx`) du **simulateur web**
  vers un style épuré façon Google Gemini, en gardant l'**or Dzaryx** comme accent unique. **Logique 100% intacte**
  (VAD, wake word, caméra live, vision, scan, mode continu, mains libres, socket, historique, proactifs).
  - VOIX : fond noir + lueur or basse (plus de scanlines/HUD/coins/Orbitron/monospace), header minimal,
    **étoile or au centre** + grand texte fin (salutation/réponse), **orbe pill lumineux en bas** (caméra·orbe·scan)
    avec barres d'onde réactives au volume, **vision = caméra plein écran**, overlay activation épuré.
  - CHAT : fond noir, header minimal, **bulles user grises à droite**, **réponse IA plein texte sans bulle/avatar**,
    **input pill** (mic si vide, flèche si texte), liens/docs en or.
- **⚠️ Découverte clé** : l'UI réelle utilisée = le **simulateur web** (`simulator/`) chargé en WebView par l'app
  native (`dzaryx-native/app/index.tsx` → `kouider213.github.io/ibrahim/`). Les écrans natifs `app/voice.tsx`/`chat.tsx`
  ne sont PAS affichés (route `_layout` ne déclare que `index`). Donc le travail UI se fait dans `simulator/`.
  (`app/voice.tsx` natif a quand même été modernisé au passage — inoffensif.)
- **Déploiement** : `cd simulator && npm run build && npx gh-pages -d dist` → **github.io (Published)**. Visible au
  reload de l'app. (Netlify build aussi possible via netlify.toml base=simulator.)
- **Fichiers** : `simulator/src/components/screens/VoiceScreen.tsx`, `TextScreen.tsx`, `dzaryx-native/app/voice.tsx`.
- **Commit** : `a086d33`. Build simulateur EXIT 0 (tsc+vite). Build natif tsc EXIT 0.
- **État** : ✅ déployé github.io.
- **⏭️ Reste possible** : (1) son d'activation micro "trop stylé" comme Gemini — assets `dzaryx-native/assets/page1_voice_vision/audio/listening.wav` existent (branchés côté natif, à brancher côté web si voulu) ;
  (2) **vrai wake word fond/app fermée** = nécessite natif Android (Porcupine + foreground service) — iPhone restera Siri ;
  (3) **sécu** : tokens en dur dans `dzaryx-native/app/index.tsx` (TOKEN_KOUIDER/HOUARI) à sortir du bundle.

### 2026-06-06 — Fix avis invisibles sur /reviews
- **Quoi** : page `/reviews` n'affichait pas les avis seedés (visibles sur la home seulement).
- **Cause** : home fait un refresh client-side (useEffect supabase) → toujours frais ; `/reviews` dépendait
  UNIQUEMENT de getStaticProps + ISR `revalidate:30` → page figée au build, avis seedés après build pas affichés
  tant qu'aucune revalidation Netlify déclenchée.
- **Fix** : ajout refresh client-side dans `/reviews` (même pattern que la home : `reviews` en state, useEffect
  qui re-fetch `reviews` approved au mount).
- **Fichiers** : `pages/reviews.js` (repo site).
- **Commit** : `418e08e`. Build OK.
- **État** : ✅ poussé → redéploiement auto.

### 2026-06-05 — Seed avis (reviews) tous services + multilingue
- **Quoi** : 31 avis insérés dans `reviews` (approved=true) couvrant location, immo (loc+vente), vente voiture,
  packs. Mix français / **darija oranaise** (arabizi + arabe) / arabe classique. **100% Oran** (Fik ne sert qu'Oran).
- **Pourquoi** : Kouider — il n'y avait que des avis location ; il en faut pour tous les services + en arabe/darija.
- **Important darija** : 100% algérien (koulech/fissa3/tonobil/walou, négation -ch, كيما/مليح/الطوموبيل) — PAS de
  mots marocains (kolxi/dghya/بحال/زوين/مزيان/الكار). Tous les avis mentionnent Oran.
- **Comment** : INSERT SQL collé en prod par Kouider (Success). Pas de fichier repo (données pures).
- **État** : ✅ en prod. Visibles home (6 derniers) + /reviews. Gérables admin → Avis.

### 2026-06-05 — Packs sur la home + conditions
- **Quoi** : (1) section "Packs séjour" sur la home (`pages/index.js`) avec le slider `ShowcaseCarousel`
  (même composant que vente/immo) — badge gamme, inclusions, prix, bouton "Tous les packs", dispo dérivée
  (cache les packs dont la voiture/bien est loué). Data chargée en getStaticProps + refresh client.
  (2) Section "Packs séjour (tout-en-un)" ajoutée aux **conditions** (`lib/conditions.js`, FR/AR) — apparaît
  sur /conditions ET dans l'admin conditions (SECTIONS itéré).
- **Pourquoi** : Kouider — la home doit présenter les packs comme la location/immo ; et les conditions doivent
  couvrir les packs maintenant qu'on en gère.
- **Fichiers** : `pages/index.js`, `lib/conditions.js` (repo site).
- **Commit** : `9f41878`. Build OK.
- **État** : ✅ déployé (Vercel).

### 2026-06-05 — Fix RLS packs (insert bloqué) + feature validée
- **Quoi** : à l'ajout d'un pack depuis l'admin → "new row violates row-level security policy for table packs".
  Cause : la policy d'écriture utilisait un sous-select `profiles` (`auth.uid() IN (SELECT id FROM profiles WHERE role IN ...)`)
  qui échoue à l'INSERT (la RLS de `profiles` empêche le sous-select de voir la ligne). Remplacée par
  `auth.role() = 'authenticated'` (USING + WITH CHECK) → admin connecté écrit, public (anon) lit seulement.
- **Fix appliqué** : SQL passé en prod par Kouider (DROP + CREATE POLICY). Fichier repo mis à jour (`0018_packs.sql`).
- **Commit** : site `fdbe109`. **Pack ajouté avec succès — feature confirmée OK par Kouider.**
- **⚠️ RÈGLE pour les prochaines tables du site** : pour l'écriture admin, utiliser
  `USING (auth.role()='authenticated') WITH CHECK (auth.role()='authenticated')` — PAS le sous-select sur `profiles`.

### 2026-06-05 — Packs : liés à l'inventaire réel + gestion Dzaryx
- **Quoi** :
  1. Chaque pack pointe vers un VRAI véhicule (`packs.car_id`→`cars`) + un VRAI bien (`packs.property_id`→`properties`),
     nullable (pack entreprise/chauffeur = sans voiture du parc). Admin = dropdowns inventaire. Dispo du pack DÉRIVÉE :
     indispo si la voiture (`available=false`) ou le bien (`status≠disponible`) est déjà loué. Pages publiques affichent
     le vrai véhicule + bien (cartes cliquables) + badge indispo.
  2. Backend Dzaryx : outils chat `list_packs`, `create_pack` (lie véhicule+bien par nom), `set_pack_status`
     (câblés agents Réservation + Général). Route REST `/api/packs` (CRUD, whitelist PATCH).
- **Pourquoi** : Kouider — un pack = mêmes voitures/biens que ceux loués à l'unité sur le site. Prendre un pack
  bloque ce véhicule + ce bien. Gérable aussi en parlant à Dzaryx (comme immo).
- **Fichiers** : site (`0018_packs.sql` + car_id/property_id, `packs.js`, `packs/[id].js`, `admin/packs.js`),
  Dzaryx (`tool-executor.ts`, `tools.ts`, `agent-registry.ts`, `api/routes/packs.ts`, `index.ts`).
- **Commits** : site `a0ffc19`, Dzaryx `d235f7d`. Build site OK, tsc backend OK.
- **État** : ✅ déployé (Vercel + Railway).
- **⚠️ ACTION REQUISE** : lancer **`supabase/0018_packs.sql`** dans Supabase (table `packs` + `pack_photos` +
  liens car_id/property_id + 4 packs seed). Les FK exigent que `cars` et `properties` existent (OK).
- **⏭️ Reste possible (plus tard)** : le pack entreprise (voiture avec chauffeur) — Kouider n'a pas encore la
  voiture-chauffeur, il l'ajoutera. Blocage par DATES (pas juste statut) si besoin d'un vrai calendrier packs.

### 2026-06-05 — Nouvelle feature : Packs séjour (site)
- **Quoi** : section "Packs" sur le site (combos voiture + immo + jet ski + chauffeur), même stack que
  immo/vente-voitures. Table `packs` + `pack_photos` (migration `0018`, RLS, 4 packs seed). Page publique
  `/packs` (filtres par gamme, cards, inclusions, bilingue FR/AR), détail `/packs/[id]`, admin CRUD
  `/admin/packs` (photos, gamme, inclusions par cases, features, statut, featured). Liens Navbar + sidebar admin.
- **Pourquoi** : Kouider veut vendre des séjours clé en main par paliers de gamme (entrée: voiture+appart,
  médium: voiture+villa, premium: voiture+villa+jetski, entreprise/groupe: villa+voiture avec chauffeur).
- **Fichiers** (repo `autolux-location`/`rental-system`) : `supabase/0018_packs.sql`, `pages/packs.js`,
  `pages/packs/[id].js`, `pages/admin/packs.js`, `components/Navbar.js`, `components/AdminLayout.js`.
- **Commit** : `debfeed` (repo site). Build Next.js OK (EXIT=0).
- **État** : ✅ déployé (Vercel).
- **⚠️ ACTION REQUISE** : lancer **`supabase/0018_packs.sql`** dans Supabase SQL Editor pour créer la table
  `packs` (+ 4 packs d'exemple). Tant que pas fait, `/packs` affiche "bientôt disponibles" (vide, sans erreur).
- **⏭️ Prochaine étape possible** : ajouter la gestion Packs côté Dzaryx (route `/api/packs` + outils chat
  `list_packs`/`create_pack`... comme immo) **si** Kouider veut gérer les packs depuis l'app, pas juste l'admin site.

### 2026-06-05 — Création du centre de documentation Obsidian
- **Quoi** : audit complet site + Dzaryx écrit dans `DZARYX/AUDIT/` (10 notes + hub + canvas).
  Notes : HUB, 01 Démarrage, 02 Architecture, 03 Site, 04 Backend, 05 Apps, 06 Nexus, 07 Data Model,
  08 Décisions, 09 Env/Déploiement, 10 Journal (ce fichier), + `system-map.canvas`.
- **Pourquoi** : Kouider veut qu'une personne qui n'a jamais vu le projet puisse reprendre comme si elle
  l'avait construit, avec le pourquoi de chaque décision. + un journal vivant pour ne jamais perdre le fil.
- **Fichiers** : `ibrahim/DZARYX/AUDIT/*`
- **État** : ✅ fait
- **⏭️ Prochaine étape** : tenir ce journal à jour à chaque changement. Toute nouvelle session commence par le lire.

### 2026-06-05 — Unification du schéma `properties` (immo app + site)
- **Quoi** : `immo.ts` réécrit pour écrire le schéma site unifié (`title`+`name` mirror, `transaction`,
  `price`, `price_type`, `status` normalisé). Whitelist sur PATCH properties + vehicles-for-sale.
  `ImmoScreen` simulateur mis à jour (titre/opération/prix/ville, statuts unifiés).
- **Pourquoi** : la table avait 2 schémas (ancien Houari vs site) → biens cassés entre app et site.
  Kouider gère par les deux → "mêmes biens, vue unifiée". Voir [[08_DECISIONS#properties]].
- **Fichiers** : `backend/src/api/routes/immo.ts`, `simulator/src/components/screens/ImmoScreen.tsx`
- **Commit** : `c6c4fd3`
- **État** : ✅ déployé (Railway). Vérifié : table prod vide (0 ligne) → rien cassé, SQL de normalisation inutile.

### 2026-06-05 — Désactivation du bot WhatsApp client
- **Quoi** : route `/api/whatsapp` débranchée dans `index.ts` (import + `app.use` commentés). Code conservé.
- **Pourquoi** : Kouider — "pas utile pour l'instant". + ferme un risque sécu (webhook public sans
  signature/limiter/dédup). Voir [[08_DECISIONS#whatsapp]].
- **Fichiers** : `backend/src/index.ts`
- **Commit** : `fbf2a3c`
- **État** : ✅ déployé. Endpoint renvoie 404.

### 2026-06-05 — Audit du batch d'hier (4 juin)
- **Quoi** : audit complet du travail de la veille (bot WhatsApp, module immo, leads, nouveaux écrans).
- **Résultat** : code compile, mais bot WhatsApp pas sécurisé + immo désynchro schéma. → corrigé (voir ci-dessus).
- **État** : ✅ analysé et traité.

---

## 🕓 Avant cette session (résumé — détails dans [[CHANGELOG]] et [[CURRENT_STATE]])

- **2026-06-04 (soir)** : construction du bot WhatsApp client + module immo + leads + écrans (clients, leads, fleet, docs).
- **2026-06-03** : latence réduite (thinking vocal off), fix vidéos TikTok (bucket `videos`), fix micro simulateur.
- **2026-06-03** : chatbot "Fik" retiré du site.
- **2026-06-01** : redesign admin WOW, multi-photos voitures, gallery Dzaryx, repos GitHub → privés.
- **2026-05-31** : site autolux v2 (Next.js 14) + 15 outils backend.

> Les anciens journaux détaillés : [[11_JOURNAL]], [[12_GUIDE_REPRISE]], [[CHANGELOG]] (51 Ko d'historique).
