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

---

## 🖥️ Simulateur (`simulator`)

**React + Vite + Tailwind.** Déployé sur **GitHub Pages** (branche `gh-pages`) → https://kouider213.github.io/ibrahim/.
Simule un téléphone (`components/Phone.tsx`) avec plusieurs onglets/écrans.

### Écrans (`src/components/screens/`)

`VoiceScreen` (vocal, gère le déverrouillage micro), `TextScreen` (chat), `BookingsScreen`, `FleetScreen`,
`ClientsScreen`, `DocumentsScreen`, **`ImmoScreen`** (immobilier — refait 2026-06-05 schéma unifié),
**`LeadsScreen`** (demandes clients). Service API : `src/services/api.ts` (`apiFetch`, gestion Socket.IO, callback `onProactive`).

> 💡 Pour déployer le simulateur : `npm run build` puis push du build sur la branche `gh-pages`.
> ⚠️ Le simulateur n'est PAS redéployé automatiquement — c'est manuel.

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
