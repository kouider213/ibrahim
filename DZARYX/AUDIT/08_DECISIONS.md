# 08 — Journal des Décisions (le POURQUOI)

> Pourquoi on a **enlevé**, **remplacé**, ou **gardé** chaque chose. Pour qu'on ne refasse pas les
> mêmes erreurs et qu'on comprenne les choix. Retour : [[🏠 HUB]]

Format : **Décision → Pourquoi → État**.

---

## 🎙️ Wake word entraîné = "Zaria" (pas "Dzaryx") {#wakeword-zaria}

**CHOISI AINSI** (2026-06-06, Picovoice Porcupine).

- **C'était quoi le besoin** : "Hey Dzaryx" qui réveille l'app comme "Hey Google" / Gemini.
- **Pourquoi "Zaria"** : Porcupine **refuse "Dzaryx"** (mot inventé, hors de son vocabulaire d'entraînement). Le
  mot prononçable le plus proche accepté = **"Zaria"**. Modèle : `Zaria_en_android_v4_0_0.ppn` (en, Android, v4),
  copié dans `dzaryx-native/assets/wakeword/Zaria_android.ppn`.
- **Clé Picovoice** : **PAS dans le repo** (bloquée par le classifier de secrets, à raison). Stockée en **variable
  d'env EAS** `PICOVOICE_ACCESS_KEY` (env production, sensible). Le plugin la lit via `process.env`. Révocable sur
  console.picovoice.ai.
- **État** : 🟡 le service Porcupine s'initialise mais **ne fire pas encore en vocal**. La **notif tap** + l'overlay
  servent de substitut. À débugger avec les **logs device** (logcat). Pistes : version lib Porcupine vs `.ppn` v4,
  sensibilité (0.85), micro déjà capté par l'app. Voir [[10_JOURNAL_SESSION]] "OÙ ON S'EST ARRÊTÉ".

---

## 🖐️ Tap-to-talk par défaut (VAD désactivé) {#tap-to-talk}

**REMPLACÉ** (2026-06-07, commits `0e3103a`, `a94d671`).

- **Le problème** : le **VAD** (détection de volume qui arme le micro tout seul) **flicke** sur le micro de Kouider
  → coupe le micro instantanément (dans l'app ET l'overlay). Et **SpeechRecognition Google est cassé dans la
  WebView** (gèle l'app si activé).
- **Décision** : **SpeechRecognition désactivé partout** ; **tap-to-talk par défaut** (tap micro = enregistre,
  re-tap = envoie). Le VAD "mains libres" ne tourne **que si activé manuellement** (opt-in). En overlay, on utilise
  `MediaRecorder` (indépendant de l'`AudioContext` qui est suspendu en fenêtre overlay).
- **Conséquence assumée** : Whisper-après-silence comprend un peu moins bien que le STT temps réel de Gemini. Le vrai
  saut nécessiterait un **STT natif** (`@react-native-voice`) → autre build. Mais tap-to-talk = **fiable**, confirmé OK.
- **État** : ✅ app vocal OK confirmé par Kouider.

---

## ⧉ Overlay flottant = plugin natif Expo (pas d'édition `android/`) {#overlay}

**AJOUTÉ** (2026-06-06, commit `8221357`, validé sur OnePlus 5T).

- **C'est quoi** : une fenêtre Dzaryx (voix compacte) qui flotte **par-dessus les autres apps** (comme Gemini),
  via un **Service Kotlin** `DzaryxOverlayService` (WebView `?overlay=1` en `TYPE_APPLICATION_OVERLAY`) + une Activity
  trampoline (deep link `dzaryxoverlay://go` → demande la permission overlay → démarre le service).
- **⚠️ Règle d'or native** : `dzaryx-native/android/` est **gitignored** (projet Expo "managed") → EAS le **régénère**
  au prebuild. Donc **TOUT le natif DOIT passer par un config plugin** (`plugins/withDzaryxOverlay.js`,
  `plugins/withDzaryxWakeWord.js`) — **jamais** d'édition directe de `android/` (elle serait écrasée).
- **Vision en overlay** : le file-chooser/micro natif est limité en fenêtre overlay → le bouton caméra fait
  `window.location='dzaryx://vision'`, capté par le WebViewClient (`shouldOverrideUrlLoading`) → **ouvre l'app** +
  `__triggerVision`.
- **Install APK de test** : la signature EAS ≠ signature Play (Google re-signe) → **désinstaller l'app Play avant**
  d'installer un APK de test, sinon conflit de signature.
- **État** : ✅ overlay fonctionne. Service wake rendu **résilient** (ne se tue jamais, retry Porcupine, BootReceiver
  auto-start, exemption batterie) — commit `7962f96`.

---

## 🔐 Tokens mobiles (Kouider/Houari) sortis du repo → env {#tokens-env}

**REMPLACÉ** (2026-06-07, commit `5efb8e7`).

- **Le problème** : `dzaryx-native/app/index.tsx` contenait les **tokens d'auth en dur** (`TOKEN_KOUIDER`,
  `TOKEN_HOUARI`) → présents dans le bundle APK et dans le repo.
- **Décision** : lus via **variables d'env** au build (plus en dur dans le code source).
- **⚠️ Reste** : un token dans un bundle APK reste extractible par un attaquant déterminé (c'est du client). La vraie
  parade serait une auth serveur par compte. Acceptable pour l'usage actuel (2 utilisateurs de confiance).
- **État** : ✅ retiré du repo et poussé.

---

## 🔴 Bot WhatsApp client (Dzaryx répond aux clients) {#whatsapp}

**ENLEVÉ / DÉSACTIVÉ** (2026-06-05, commit `fbf2a3c`).

- **C'était quoi** : un bot (`backend/src/conversation/client-responder.ts` + route `whatsapp.ts`) où Dzaryx
  répondait directement aux clients sur WhatsApp (persona commercial, jamais confirmer dispo, crée un lead).
- **Pourquoi enlevé** : Kouider — "pas utile pour l'instant, ça sert à rien". Les clients passent déjà par le
  formulaire du site → son WhatsApp perso. Un bot intermédiaire n'apporte rien maintenant.
- **Comment** : import + `app.use('/api/whatsapp', ...)` commentés dans `index.ts`. L'endpoint renvoie 404.
  Le code est **conservé** pour réactivation future.
- **Bonus sécurité** : ça ferme un risque — le webhook était **public, sans signature Meta, sans rate limiter,
  sans déduplication** → exploitable (appels Claude payants par n'importe qui).
- **Si réactivation** : décommenter dans `index.ts` **ET** d'abord sécuriser : vérifier la signature
  `X-Hub-Signature-256` de Meta + ajouter un rate limiter + dédup sur `msg.id`. Besoin des creds Meta
  (`WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`) + un 2ᵉ numéro dédié.

---

## 🏠 Table `properties` à deux schémas → UNIFIÉE {#properties}

**REMPLACÉ** (2026-06-05, commit `c6c4fd3`).

- **Le problème** : `properties` venait d'un vieux module Houari (`name`, `monthly_rent`, `tenant_name`,
  statut `libre/loué`). Puis le site a ajouté ses colonnes (`title`, `transaction`, `price`, `city`...) via
  migration `0014`. Résultat : **deux "langues" pour une table**. L'app écrivait l'ancien schéma, le site lisait
  le nouveau → un bien ajouté dans l'app s'affichait cassé sur le site et inversement.
- **Pourquoi unifier** (et pas séparer) : Kouider gère l'immo **par les deux** (app + admin site) et veut que
  ce soit **les mêmes biens** partout.
- **Comment** : `backend/src/api/routes/immo.ts` réécrit pour écrire le schéma unifié — `title` (+ `name` mirror
  car colonne legacy NOT NULL), `transaction`, `price`, `price_type`, `status` normalisé (`libre`→`disponible`).
  `monthly_rent`/`tenant_name` **gardés** pour la gestion interne des locations. `ImmoScreen` du simulateur mis
  à jour pareil. Le tool `create_property` (chat Dzaryx) écrivait déjà le bon schéma.
- **Bonus sécurité** : whitelist sur les PATCH `properties` et `vehicles-for-sale` (fermé une faille
  mass-assignment qui laissait modifier n'importe quelle colonne, ex: `id`).
- **Vérifié** : table `properties` **vide en prod** (0 ligne) → aucun ancien data à migrer, rien cassé. Le SQL
  de normalisation (`status libre→disponible`...) n'a PAS été lancé car inutile (0 ligne).

---

## 🟡 Mode "disponibilité à confirmer" {#mode-dispo}

**GARDÉ / CONÇU AINSI** (volontaire).

- **C'est quoi** : un toggle `availability_mode` (migration `0017`). ON = catalogue en "Sur demande" + bouton
  "Vérifier la dispo". OFF = "Réserver" direct.
- **Pourquoi** : Kouider **ne connaît pas les vraies dispos avant fin août** (il bosse avec Houari, gestion en
  Algérie par clics seulement à partir du 29/07). Il faut un site "sûr" qui ne promet jamais une dispo fausse.
- **Décision de design clé** : le bouton "Vérifier la dispo" mène au **formulaire `/reservation`** (PAS WhatsApp
  direct). Le client choisit ses dates dans un calendrier réel + remplit les conditions (âge ≥35) → tout arrive
  sur le WhatsApp de Kouider. **C'est voulu** : Kouider veut VOIR les dates demandées + que le client soit
  qualifié au conditionnel avant qu'il réponde.
- **Sûreté** : une réservation est **toujours `PENDING`** (jamais auto-confirmée). Donc le toggle ne change que
  l'affichage du catalogue, le tunnel reste un "demande à confirmer". Pas de fausse promesse possible.
- **En août** : admin → toggle OFF → "dispos réelles" → site repasse en "Réserver".

---

## 💬 Chatbot "Fik" du site {#chatbot}

**ENLEVÉ** (2026-06-03).

- **C'était quoi** : un widget chatbot IA sur le site (chargé depuis le backend Railway), renommé "Fik".
- **Pourquoi enlevé** : Kouider l'a jugé **inutile** (le site présente déjà toutes les infos) et qu'il
  **dérangeait** les clients.
- **Comment** : widget retiré de `_app.js`, toggle admin retiré. Backend (`/api/assistant-context`,
  `migration_0012_chatbot_toggle`, `widget.ts`) **conservé** au cas où.
- **Si réactivation** : recharger le script widget dans `_app.js` + brancher le backend sur `/api/assistant-context`.

---

## ⚡ "Thinking" Claude désactivé en vocal {#thinking}

**REMPLACÉ** (2026-06-03).

- **Pourquoi** : Kouider — "Dzaryx met trop de temps à répondre, surtout en vocal/vision". La phase de réflexion
  étendue ajoutait plusieurs secondes avant le premier mot.
- **Comment** : `integrations/claude-api.ts` — thinking **désactivé** pour les tours vocaux (`voice_`), le mode
  texte le garde. Budgets thinking réduits en texte (high 10000→6000, finance 6000→2500, etc.).
- **Pourquoi c'est sûr** : les outils + les gates anti-hallucination garantissent déjà l'exactitude sans le thinking.

---

## 🔕 Notifications proactives Nexus OFF par défaut

**GARDÉ OFF** (anti-spam).

- **Pourquoi** : Kouider recevait les **mêmes alertes Nexus en boucle**.
- **Comment** : env `NEXUS_PROACTIVE_ENABLED` — il faut explicitement `'true'` pour activer. Absent = OFF.

---

## 🔓 CORS `origin: '*'` + `credentials: true`

**GARDÉ** (à resserrer un jour).

- **Pourquoi gardé** : pratique en dev/multi-clients. L'impact est limité car l'auth se fait par **Bearer token**
  (pas par cookie de session pour les routes sensibles).
- **Dette** : combinaison techniquement invalide/risquée. À resserrer quand on aura le temps.

---

## 🎥 Bucket Supabase `videos` créé

**AJOUTÉ** (2026-06-03).

- **Pourquoi** : les vidéos TikTok ne s'affichaient plus (boîte noire). Cause : le bucket Storage `videos`
  **n'existait pas** → tout upload vidéo échouait. De plus un job affichait l'**image** dans une balise `<video>`.
- **Comment** : bucket `videos` créé (public) + `proactive-jobs.ts` upload la vidéo générée vers ce bucket.

---

## 🔐 Repos GitHub passés en PRIVÉ

**FAIT** (2026-06-01).

- **Pourquoi** : protection du code propriétaire. `autolux-location` et `ibrahim` étaient publics.
- **Comment** : repos → privés (API GitHub). `LICENSE` propriétaire ajouté. Watermark `DZX-FK-OAN-2024-K7X9M2Q1`
  dans `tool-executor.ts`.
- ⚠️ **Reste à faire** : révoquer l'ancien token GitHub exposé (`ghp_d8Vch6X9...`) sur github.com/settings/tokens.

---

## Conventions gardées (et pourquoi)

| Convention | Pourquoi |
|------------|----------|
| `tsc --noEmit` 0 erreur avant commit | Railway build casse sinon |
| `git add <fichiers précis>` jamais `-A` | Éviter de committer secrets/fichiers parasites |
| Outils retournent une string | Le pipeline LLM attend du texte |
| `image_url = photos[0].url` | Rétrocompat avec l'ancien code mono-photo |
| `emitProactive` + 400ms entre photos | Évite la congestion du socket |
| Déployer après chaque étape sans demander | Kouider veut de l'autonomie (feedback explicite) |
