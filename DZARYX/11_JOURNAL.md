# 11 — Journal de Développement

> Une entrée par session de travail.
> **La dernière ligne de ce fichier indique EXACTEMENT où le travail s'est arrêté.**

---

## Session 2026-05-18 — Jarvis Redesign + Simulateur Web

### Ce qui a été fait

**SIMULATEUR ANDROID WEB (simulator/)**
- Créé de zéro : React 18 + TypeScript + Vite + Tailwind CSS v4 + Framer Motion
- Coque Android réaliste (375×812px, punch-hole, barre statut, barre nav)
- VoiceScreen : visualiseur canvas (anneaux concentriques + hex ring + particules + RMS audio)
- VAD web : MediaRecorder + AnalyserNode + seuil 22 avg freq + délai silence 1200ms
- TextScreen : chat Jarvis streaming, messages couleur (orange user / cyan ai)
- FeedbackPanel : 3 onglets (feedback / checklist 77 items / historique)
- Connexions réelles Railway Socket.IO `/mobile` + REST API
- Build propre : 228KB JS, 0 erreurs TypeScript
- Commits : `9bc0dad`

**APP NATIVE (dzaryx-native/) — Jarvis Redesign**
- `voice.tsx` créé : écran principal Jarvis avec VAD continu (150ms, -28dB, 1400ms)
  3 anneaux rotatifs animés (5s/8s/12s), orbe pulsant, 4 états colorés
  Socket.IO proactif, TTS ElevenLabs, vision caméra, KeepAwake
- `text.tsx` créé : chat sombre Jarvis, Socket.IO streaming, audio TTS
- `index.tsx` mis à jour : redirect `/chat` → `/voice` après login
- `_layout.tsx` mis à jour : enregistrement screens voice + text
- `lib/api.ts` mis à jour : export `MOBILE_TOKEN` + `MOBILE_TOKEN_H`
- 0 erreurs TypeScript
- Commits : `f151bab`

**DOCUMENTATION**
- `DZARYX/CURRENT_STATE.md` mis à jour
- `DZARYX/00_INDEX.md` créé
- `DZARYX/04_APP_MOBILE_DZARYX.md` créé
- `DZARYX/05_SIMULATEUR_WEB.md` créé
- `DZARYX/11_JOURNAL.md` créé (ce fichier)
- `DZARYX/12_GUIDE_REPRISE.md` créé

### Ce qui a été testé
- TypeScript 0 erreurs : dzaryx-native/ ✅ + simulator/ ✅
- Build production simulator : 228KB ✅
- EAS build tenté → échoue (plan épuisé, reset June 1)
- Git push main ✅

### Bugs rencontrés et solutions
- `Corner` component en RN : spread object incompatible avec StyleSheet → solution : chaque propriété explicite
- `typingRow` style : shorthand CSS `padding: '0 12px'` invalide en RN → `paddingHorizontal: 12`
- `import.meta as Record<string, unknown>` TS2352 → `as any` + cast

### PROCHAINE ÉTAPE : Déployer simulator/ sur nouveau site Netlify (base=simulator, publish=dist)

---

## Session 2026-05-17 — Remote Control + Feature Parity

### Ce qui a été fait
- Conversation Engine V2 complet (normalizer + entity-extractor + pending-action)
- 41 tests passent (engine-v2.test.ts)
- Admin delete gate (confirmation avant Claude)
- Whisper auto-detect language (fr/ar/darija)
- Native app : mode.tsx, settings.tsx, chat.tsx fixes
- Écrans settings.tsx : SYSTÈME BACKEND + NEXUS PC KOUIDER + tâches IA
- Heatmap 60 jours dans revenue.tsx
- expo-image-picker + scan document dans chat.tsx
- EAS env vars créés (BACKEND_URL + MOBILE_TOKEN + MOBILE_TOKEN_HOUARI)
- eas.json : `"environment": "production"` ajouté aux 2 profils
- Commits : plusieurs dont `71d2b1c`

### PROCHAINE ÉTAPE (à l'époque) : Redesign Jarvis → fait en session 2026-05-18

---

## Session 2026-05-15 — Dashboard Mobile Phase 6

### Ce qui a été fait
- BookingForm : création réservation depuis mobile
- CalendarView : heatmap mois, stats
- ClientsView : liste scorée VIP/FRÉQUENT
- BottomNav 10 items
- Revenus prorabilisés (today/week/month = jours réels × tarif)
- B006 fixé : finance → FINANCE_AGENT + Claude-Sonnet

---

## Session 2026-05-14 — Documents + Recherche Web

### Ce qui a été fait
- get_client_document : récupère passeport/permis depuis Supabase, envoi Telegram
- Réservations : car_id depuis nom, payment_status normalisé
- Recherche web réelle : SearXNG + Jina Reader
- GENERAL_AGENT : web_search toujours actif, min 2 tentatives
- Vidéo 720×1280 FFmpeg livrée Telegram

---

#journal #sessions #changelog
