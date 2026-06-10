---
tags: [handoff, ui, ecrans, simulateur]
---
# 📱 H09 — Écrans (simulateur React)
[[00 HANDOFF HUB|← Hub]]

Dossier : `simulator/src/components/screens/`. Navigation : `Phone.tsx`. Appels API + Socket.IO + audio : `services/api.ts`.

## Onglets
VOIX · CHAT · IMMO · ACHAT · LOCATIONS · PARC · CA · CLIENTS · DEMANDES · AGENDA · DOCS · CONFIG (+ écrans : Notifications, Rappels, Nexus, Telegram, Currency, Capacités)

## Détails utiles
- **VOIX** (`VoiceScreen.tsx`) : push-to-talk + mains-libres, barge-in, reset dur du micro au tap, vision live caméra.
- **CHAT** (`TextScreen.tsx`) : streaming, images, régénérer/éditer façon ChatGPT, scroll auto en bas, analyse PDF/Excel.
- **LOCATIONS** (`BookingsScreen.tsx`) : résas €/DZD, MARGE par devise, création avec prix proprio + plancher.
- **PARC** (`FleetScreen.tsx`) : prix/voiture, calendrier résa, photos, inspection.
- **CA** (`RevenueScreen.tsx`) : revenus + bloc dinars (Houari CA + Kouider bénéf DZD).

## Thème
Obsidian sombre + accent **emerald #10b981** (Houari = violet #a78bfa). Police système. Service Worker `simulator/public/sw.js` (bumper le cache à chaque déploiement → [[H11 Déploiement]]).

Suite : [[H10 Base de données]]
