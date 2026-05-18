# 04 — App Mobile Dzaryx (React Native)

> Répertoire : `dzaryx-native/`
> Stack : Expo SDK 54 / React Native 0.81.5 / EAS Build
> État : Code 100% prêt — APK non buildé (EAS free plan épuisé jusqu'au 1 juin 2026)

---

## Architecture

```
dzaryx-native/
├── app/
│   ├── _layout.tsx          ← Stack navigator racine
│   ├── index.tsx            ← Splash → redirige vers /voice
│   ├── voice.tsx            ← ★ ÉCRAN PRINCIPAL — Jarvis vocal (VAD auto)
│   ├── text.tsx             ← Écran chat texte (fallback vocal)
│   ├── chat.tsx             ← Ancien écran chat + scanner doc
│   ├── settings.tsx         ← Paramètres + Nexus PC + santé système
│   ├── revenue.tsx          ← Revenus + heatmap 60 jours
│   ├── bookings.tsx         ← Liste réservations
│   ├── booking-detail.tsx   ← Détail + édition réservation
│   ├── new-booking.tsx      ← Création réservation
│   ├── fleet.tsx            ← Parc véhicules
│   ├── reminders.tsx        ← Rappels automatiques
│   ├── clients.tsx          ← Liste clients scorés
│   ├── client-detail.tsx    ← Détail client
│   ├── tasks.tsx            ← Tâches IA background
│   ├── notifications.tsx    ← Notifications push
│   └── auth/login.tsx       ← Connexion acteur
├── lib/
│   ├── api.ts               ← BACKEND_URL + MOBILE_TOKEN exports
│   └── store.ts             ← Zustand state (actor)
├── app.json                 ← Config Expo (package, versionCode, plugins)
└── eas.json                 ← Config EAS (profile preview/production)
```

---

## Design Jarvis (2 écrans principaux)

### `voice.tsx` — Écran principal
- **Fond** : noir `#000` avec dégradé
- **Orbe** : cercle central animé (scale pulse 1→1.12)
- **3 anneaux rotatifs** : 5s / 8s / 12s (sens alternés)
- **Couleurs d'état** :
  - `idle`    → cyan `#00d4e8`
  - `listen`  → rouge `#ff3366`
  - `think`   → violet `#9b59b6`
  - `speak`   → vert `#00e676`
- **VAD automatique** : sondage 150ms, seuil -28dB, silence 1400ms, min 350ms
- **3 boutons** : 👁 VISION (bas gauche), ⌨️ TEXTE (bas droite), indicateur VAD (centre)
- **Brackets HUD** aux 4 coins

### `text.tsx` — Écran texte
- **Fond** : noir `#03050f`
- **Messages utilisateur** : droite, teinte orange `#ffb347`
- **Messages Dzaryx** : gauche, teinte cyan `#a8e8ff`
- **Zone saisie** : bord cyan `#00d4e8`
- **Socket.IO** : streaming temps réel

---

## VAD — Implémentation détaillée

```typescript
// Constants
const SPEAK_DB    = -28;   // dB seuil parole
const SILENCE_END = 1400;  // ms silence → fin utterance
const MIN_SPEECH  = 350;   // ms minimum parole valide
const VAD_POLL    = 150;   // ms intervalle sondage

// Cycle
1. Audio.requestPermissionsAsync()
2. Audio.setAudioModeAsync({ staysActiveInBackground: true })
3. new Audio.Recording() → prepareToRecordAsync({ isMeteringEnabled: true })
4. setInterval(150ms) → rec.getStatusAsync() → status.metering
5. metering > -28dB → début parole → setAppState('listen')
6. silence → timer 1400ms → processRecording()
7. processRecording() → POST /api/transcribe → POST /api/chat → TTS
8. restart loop
```

---

## Dépendances clés

| Package | Version | Usage |
|---------|---------|-------|
| expo | 54.0.17 | SDK base |
| expo-av | ~15.0.2 | Audio recording + playback |
| expo-camera | ~16.0.18 | Camera vision |
| expo-image-picker | ^55.0.20 | Galerie + scan doc |
| expo-keep-awake | ~14.0.3 | Écran allumé en veille |
| expo-notifications | ~0.29.14 | Push notifications |
| expo-location | ~18.0.6 | Position GPS |
| socket.io-client | ^4.8.1 | WebSocket temps réel |

---

## Build APK

### Commandes

```bash
# Preview build (APK direct)
cd dzaryx-native
EXPO_TOKEN=G7nmf_7VE1RreEeM3E5orMQJiVvGhLYt7Ze1jCN6 npx eas build \
  --platform android --profile preview --non-interactive

# Production build (AAB pour Play Store)
EXPO_TOKEN=... npx eas build \
  --platform android --profile production --non-interactive
```

### Variables EAS (déjà configurées sur environment "production")
- `EXPO_PUBLIC_BACKEND_URL` → `https://ibrahim-backend-production.up.railway.app`
- `EXPO_PUBLIC_MOBILE_TOKEN` → token Kouider
- `EXPO_PUBLIC_MOBILE_TOKEN_HOUARI` → token Houari

### État actuel
- EAS Free plan épuisé → reset **June 1, 2026**
- versionCode actuel : **4** (app.json)
- version : **1.2.0**

---

## Écrans disponibles

| Écran | Route | Accès depuis |
|-------|-------|-------------|
| Jarvis vocal | `/voice` | Splash (login done) |
| Chat texte | `/text` | Bouton ⌨️ dans voice |
| Chat IA (ancien) | `/chat` | Interne |
| Réservations | `/bookings` | Settings |
| Nouvelle résa | `/new-booking` | Bookings |
| Détail résa | `/booking-detail` | Bookings |
| Parc | `/fleet` | Settings |
| Revenus | `/revenue` | Settings |
| Rappels | `/reminders` | Settings |
| Clients | `/clients` | Settings |
| Détail client | `/client-detail` | Clients |
| Tâches IA | `/tasks` | Settings |
| Notifications | `/notifications` | Settings |
| Paramètres | `/settings` | voice.tsx → bouton |

---

## Bugs connus

| Bug | Statut | Note |
|-----|--------|------|
| VAD n'entend pas sur certains devices | À tester | Seuil -28dB peut nécessiter ajustement |
| Vision lente sur 4G | Normal | API Gemini latency |
| Navigation freeze (ancien chat) | Résolu en redesign | chat.tsx remplacé par voice.tsx |

---

#mobile #expo #react-native #jarvis #vad
