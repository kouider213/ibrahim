# 05 — Les Apps de Kouider (native / simulateur / PWA)

> Trois interfaces, **un seul backend**. Retour : [[🏠 HUB]]

---

## Pourquoi trois ?

| App | Dossier | Hébergement | À quoi ça sert |
|-----|---------|-------------|----------------|
| **Native** | `dzaryx-native` | APK (Expo) | La VRAIE app du téléphone, usage quotidien Kouider |
| **Simulateur** | `simulator` | GitHub Pages | Même UI sur le web, pour tester/démontrer sans APK |
| **PWA mobile** | `mobile` | Netlify | Ancienne version web installable, toujours en ligne |

Toutes tapent `https://ibrahim-backend-production.up.railway.app` avec un **Bearer `MOBILE_ACCESS_TOKEN`**.

---

## 📱 App native (`dzaryx-native`)

**Expo SDK 54 / React Native 0.81.5.** Routeur : `expo-router` (dossier `app/` = routes fichiers).

> ⚠️ **Avant de coder ici** : lire https://docs.expo.dev/versions/v54.0.0/ (versions exactes). Voir `dzaryx-native/AGENTS.md`.

### Écrans (`app/*.tsx`)

| Écran | Rôle |
|-------|------|
| `index.tsx` | Accueil / dashboard |
| `chat.tsx` | Chat texte avec Dzaryx |
| `text.tsx` | Mode texte |
| `voice.tsx` | ⭐ Mode vocal (ElevenLabs + Whisper). Fix expo-file-system v19 → import `/legacy` |
| `bookings.tsx` + `booking-detail.tsx` + `new-booking.tsx` | Réservations |
| `fleet.tsx` | Parc véhicules |
| `clients.tsx` + `client-detail.tsx` | Clients |
| `documents.tsx` | Documents clients |
| `revenue.tsx` | Revenus / finance |
| `tasks.tsx` | Tâches |
| `reminders.tsx` | Rappels |
| `notifications.tsx` | Notifications / proactifs |
| `settings.tsx` | Réglages |
| `auth/login.tsx` | Connexion |
| `onboarding/*` | welcome, mode, business, personal (1er lancement) |

### Lib
- `lib/api.ts` — client API (REST + types `Property`, `VehicleForSale`, `ClientDeal`...). **Déjà sur le schéma immo unifié** (`title/transaction/price`).
- Fonctionnalités natives ajoutées (2026-05-27) : **verrou biométrique**, **cache offline**, **app shortcuts**.

### ⚠️ ARCHITECTURE RÉELLE — l'app native est une coquille WebView

> 🔑 **À comprendre avant TOUT travail UI.** `_layout.tsx` ne déclare QUE la route `index`. Et `app/index.tsx` est
> une **WebView** qui charge `https://kouider213.github.io/ibrahim/` = le **simulateur web**. Donc les écrans natifs
> du tableau ci-dessus (`voice.tsx`, `chat.tsx`…) **ne sont PAS affichés** (quasi code mort, deep-link only).
> **Tout ce que Kouider voit à l'écran se modifie dans `simulator/`, pas dans `app/*.tsx`.** Voir [[dzaryx_ui_architecture]].
>
> Le **vrai** rôle du natif = les **capacités hors-web** : permissions, services de fond, overlay, wake word, partage.

### Plugins natifs (config plugins Expo — `dzaryx-native/plugins/`)

> ⚠️ `dzaryx-native/android/` est **gitignored** (Expo managed) → EAS le régénère au prebuild. **Tout le natif
> Android passe par des config plugins**, jamais d'édition directe de `android/`. Voir [[08_DECISIONS#overlay]].

- **`withDzaryxOverlay.js`** (2026-06-06, `8221357`) — fenêtre flottante par-dessus les autres apps (façon Gemini).
  Service Kotlin `DzaryxOverlayService` (WebView `?overlay=1` en `TYPE_APPLICATION_OVERLAY`) + Activity trampoline
  (deep link `dzaryxoverlay://go`). Permissions `SYSTEM_ALERT_WINDOW`, `FOREGROUND_SERVICE_MICROPHONE`.
  **✅ testé OnePlus 5T.** Vision overlay → `dzaryx://vision` rouvre l'app.
- **`withDzaryxWakeWord.js`** (2026-06-06, `252c259` ; durci `7962f96`) — wake word **"Zaria"** via Picovoice
  Porcupine, **Service de fond** `DzaryxWakeWordService` (onWake → démarre l'overlay). Service **résilient** (ne se
  tue jamais), **retry** Porcupine, **BootReceiver** (auto-start après reboot), **exemption batterie** au lancement.
  Clé Picovoice via env EAS `PICOVOICE_ACCESS_KEY`. **🟡 ne fire pas encore en vocal** (voir [[08_DECISIONS#wakeword-zaria]]).
- **Déclenchement** : bouton overlay (web) → `index.tsx` → `Linking.openURL('dzaryxoverlay://go')` ; wake/notif → idem.

### Sécurité (2026-06-07)
- Tokens mobiles Kouider/Houari **sortis du repo** → lus via env au build (`5efb8e7`). Voir [[08_DECISIONS#tokens-env]].
- EAS relié au compte Play officiel **`@fikdzaryx/dzaryx`** (`819a3e7`) pour les builds de prod.
- ⚠️ Install d'un APK de test : **désinstaller l'app Play d'abord** (signature EAS ≠ signature Play).

---

## 🖥️ Simulateur (`simulator`)

**React + Vite + Tailwind.** Déployé sur **GitHub Pages** (branche `gh-pages`) → https://kouider213.github.io/ibrahim/.
Simule un téléphone (`components/Phone.tsx`) avec plusieurs onglets/écrans.

### Écrans (`src/components/screens/`)

`VoiceScreen` (vocal, gère le déverrouillage micro), `TextScreen` (chat), `BookingsScreen`, `FleetScreen`,
`ClientsScreen`, `DocumentsScreen`, **`ImmoScreen`** (immobilier — refait 2026-06-05 schéma unifié),
**`LeadsScreen`** (demandes clients). Service API : `src/services/api.ts` (`apiFetch`, gestion Socket.IO, callback `onProactive`).

#### Redesign Gemini + nouvelles capacités (2026-06-06/07)
- **`VoiceScreen`** : refonte épurée style Gemini (or Dzaryx en accent), logo au centre, **barge-in** (coupe Dzaryx
  quand on reparle), **flip caméra** avant/arrière, **mode compact** `?overlay=1` (voix seule, pour l'overlay),
  **tap-to-talk** par défaut (VAD opt-in). Voir [[08_DECISIONS#tap-to-talk]].
- **`TextScreen`** (chat) : **copier**, **rendu markdown** (gras/listes/tableaux/code), **dictée vocale**,
  **régénérer**, **éditer** un message, **recherche** dans l'historique, **streaming typewriter**, **graphiques**
  (barres/camembert/courbe via bloc `chart` JSON), **téléchargement** photos+graphes (`expo-media-library`).
- **Création d'annonces depuis le chat** : joins des photos + *"crée une voiture/appart/pack…"* → Dzaryx crée
  l'annonce et **attache les photos** (voiture loc/vente, immo, pack). Détection d'intention dans `TextScreen`
  (`isCreateIntent`) : création vs store voiture existante vs vision. Upload via `api.uploadSessionPhotos`.

> 💡 Pour déployer le simulateur : `npm run build` puis `npx gh-pages -d dist` (branche `gh-pages`).
> ⚠️ Le simulateur n'est PAS redéployé automatiquement — c'est manuel.
> ⚠️ **Cache SW** : bumper la version dans `public/sw.js` (ex `dzaryx-v43`) à chaque deploy, sinon l'ancienne UI est
> servie. Côté Kouider : **fermer l'app à fond + rouvrir** une fois après un deploy.

---

## 📲 PWA mobile (`mobile`)

**React 18 + Vite + Tailwind.** Déployé **Netlify** → https://ibrahim-fik-conciergerie.netlify.app.
Pages : `/` (ChatInterface), `/dashboard`. Panels dashboard : LiveRevenue, AIAlerts, LiveFleet, WhatsAppAI,
TikTokAI, DzaryxCore, VoiceMode, ValidationQueue.
- `src/services/api.ts` : callback `onProactive` + handler `Dzaryx:proactive` (gallery photos).
- `ChatInterface.tsx` : gallery photos plein écran avec partage WhatsApp + "Enregistrer tout".
- Déploiement : `cd mobile && npm run build` puis push → Netlify détecte.

---

## Le pont temps réel (proactifs)

Le backend pousse des messages non sollicités ("🚗 Nouvelle réservation", photos, alertes) via Socket.IO
namespace `/mobile`, dans les chambres `actor:kouider` / `actor:houari` / `actor:all`. Côté app, le callback
`onProactive(text, type, imageUrls)` les reçoit. Les URLs d'images sont détectées par regex → ouvrent une gallery.
