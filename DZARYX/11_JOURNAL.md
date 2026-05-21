# 11 — Journal de Développement

> Une entrée par session de travail.
> **La dernière ligne de ce fichier indique EXACTEMENT où le travail s'est arrêté.**

---

## Session 2026-05-21 — GPS + Phase 8 Simulateur + GitHub Pages + Houari (Claude Sonnet 4.6)

### Contexte
Session de reprise après interruption. Fils de Kouider avait fermé session précédente. Reprise depuis memory + HANDOVER.

### Ce qui a été fait (dans l'ordre)

**1. Railway — Variables manuelles ajoutées par Kouider**
- `MOBILE_TOKEN_HOUARI` = 99c3dba3359626a99f527dba6dd994a64049cc0984036933b7f96adddb41bfe2
- `GOOGLE_MAPS_API_KEY` = AIzaSyAv7s2qAJiHwsAzVmeA25UEOmo8p6FIsyo

**2. Supabase — Migration Phase 8 appliquée**
- 7 tables créées : learned_rules, assistant_profiles, user_behavior, conversation_patterns, contracts, payment_links, whatsapp_messages
- Seeds : profils Kouider + Houari, 8 règles initiales

**3. Backend — GPS complet**
- `backend/src/config/env.ts` : `GOOGLE_MAPS_API_KEY: z.string().optional()`
- `backend/src/integrations/tools.ts` : outil `calculate_delivery_fee` ajouté
- `backend/src/integrations/tool-executor.ts` : `calculateDeliveryFeeTool` implémenté
  - Dépôt Es Sénia : lat=35.6459, lng=-0.6050 (hardcodé, modifier si garage change)
  - Tarif : 200 DZD/km (paramètre rate_per_km optionnel)
  - Avec GOOGLE_MAPS_API_KEY : trafic temps réel via Distance Matrix
  - Sans clé : fallback estimation vol d'oiseau ±20%
  - Output : distance, temps, frais DZD, Waze link, Google Maps link

**4. Simulateur GitHub Pages — Phase 8 + GPS**
- `Phone.tsx` : tab Telegram SUPPRIMÉ (Kouider a dit "je n'ai pas besoin de ça") — 12 tabs final
- `SettingsScreen.tsx` : panel "RÈGLES APPRISES (PHASE 8)" avec 6 règles seed, fix TS `nexus_online?: boolean`
- `DocumentsScreen.tsx` : panel "GÉNÉRER CONTRAT PDF" avec ContractGenerator composant
- `BookingsScreen.tsx` : panel GPS `GpsCalculator` en haut — 6 landmarks Oran préchargés :
  - aéroport (3.2km, 8min, 640 DZD)
  - centre-ville (11.4km, 22min, 2280 DZD)
  - Bir El Djir (15.1km, 28min, 3020 DZD)
  - Aïn Türck (21.8km, 38min, 4360 DZD)
  - Arzew (35.6km, 45min, 7120 DZD)
  - Port d'Oran (12.1km, 25min, 2420 DZD)
  - Input libre pour autres adresses (affiche "distance réelle depuis backend")

**5. GitHub Pages déployé**
```bash
cd simulator && npm run build
git worktree add ../gh-pages-deploy gh-pages
cp simulator/dist/index.html ../gh-pages-deploy/
cp -r simulator/dist/assets ../gh-pages-deploy/assets
cd ../gh-pages-deploy && git add . && git commit -m "deploy: GPS + Phase 8 panels"
git push --force origin gh-pages  # force nécessaire — remote avait avancé
```
- URL live : https://kouider213.github.io/ibrahim/
- Logins : kouider/kouider31 (cyan) | houari/houari31 (violet)

**6. Documentation**
- `HANDOVER_CLAUDE2.md` : créé — guide complet pour tout agent/dev qui reprend le projet
- `DZARYX/CURRENT_STATE.md` : mis à jour intégralement

### Décisions Kouider (DÉFINITIVES — ne pas revenir dessus)
- ❌ iOS → jamais (unless demande explicite)
- ❌ Chargily paiement → pas pour l'instant
- ❌ Telegram = backup/admin SEULEMENT (pas canal principal ni tab simulateur)
- ✅ WhatsApp → août 2026 (bot vitrine simple : dispo + tarifs, PAS réservation auto)
- ✅ Simulateur GitHub Pages = zone test principale AVANT APK

### Prochaines étapes (DANS L'ORDRE)
1. Kouider teste simulateur : https://kouider213.github.io/ibrahim/
2. APK Android : 1er juin 2026 — `EXPO_TOKEN=G7nmf_7VE1RreEeM3E5orMQJiVvGhLYt7Ze1jCN6 npx eas build --platform android --profile preview --non-interactive`
3. Après APK : FIREBASE_SERVICE_ACCOUNT_JSON dans Railway → FCM natif
4. Août 2026 : WhatsApp bot (TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_WHATSAPP_FROM)

### Erreur GitHub Pages (à retenir)
`git push --force origin gh-pages` nécessaire quand remote a été modifié entre worktree create et push.
Sur Windows : `git worktree remove` → "Permission denied" → ignorer, faire `git worktree prune` plus tard.

### Commit final session
`34b0fb7` — docs: comprehensive session update — Phase 8 + GPS + GitHub Pages simulator

---

## Session 2026-05-18 PART 2 — Simulateur Tests & Fixes (+ Audit complet)

### Ce qui a été fait

**BUGS SIMULATEUR FIXÉS (tests en direct avec Kouider)**

#### Bug 1 — .env.local manquant → ACCESS_TOKEN vide → 401 sur toutes les API
- **Fix** : Créé `simulator/.env.local` (gitignored, jamais committer) :
  ```
  VITE_BACKEND_URL=https://ibrahim-backend-production.up.railway.app
  VITE_WS_URL=wss://ibrahim-backend-production.up.railway.app
  VITE_ACCESS_TOKEN=f6214183be37ad5e3c593590870077db247a4047c7de3cd72ae008e0f8d447d2
  ```

#### Bug 2 — Audio TTS silencieux (textOnly:true envoyé → backend skip TTS)
- **Root cause** : `api.ts chat()` avait `textOnly: !imageBase64` = toujours true → backend ne générait jamais d'audio
- **Fix** : `simulator/src/services/api.ts` :
  ```ts
  chat: (message, sessionId, imageBase64?, imageMime?, textOnly = false) =>
    apiFetch('/api/chat', { body: JSON.stringify({ message, sessionId, textOnly: textOnly && !imageBase64, imageBase64, imageMime }) })
  ```

#### Bug 3 — Micro détecté 1/5 fois avec AirPods Pro
- **Root cause** : VAD utilisait moyenne fréquences (128 bins, 0-22050Hz) → parole dans ~20 bins → moyenne diluée
- **Fix** : `VoiceScreen.tsx` → RMS time-domain (`getByteTimeDomainData`) :
  ```ts
  const SPEECH_RMS    = 0.004;  // seuil détection parole
  const SILENCE_RMS   = 0.008;  // seuil silence (élevé pour bruit AirPods)
  const SILENCE_DELAY = 1000;   // ms silence → stop recording
  const MIN_SPEECH_MS = 200;    // minimum utterance valide
  const MAX_REC_MS    = 8000;   // force-stop après 8 secondes
  ```
  fftSize=2048, smoothingTimeConstant=0.3

#### Bug 4 — AudioContext suspendu (Chrome autoplay policy)
- **Root cause** : `initMic()` appelé au mount du composant (pas user gesture) → AudioContext suspendu
- **Fix** : Overlay "🎙️ APPUYER POUR ACTIVER" → clic → `unlockAudio()` + `setAudioUnlocked(true)` + `initMic()`
- HUD affiche `MIC: X.X | SEUIL: 4.0 | PARLE-MOI` pour calibration AirPods

#### Bug 5 — Enregistrement bloqué (bruit AirPods > seuil silence)
- **Root cause** : AirPods Bluetooth = bruit constant > ancien SILENCE_RMS=0.002 → silence jamais détecté
- **Fix** : SILENCE_RMS=0.008 + MAX_REC_MS=8000ms force-stop obligatoire

#### Bug 6 — Canvas height mismatch (660 vs 704)
- **Root cause** : PHONE_H=812, FRAME*2=28, STATUSBAR=44, NAVBAR=36 → CONTENT_H=704 (pas 660)
- **Fix** : `<canvas height={704}>` dans VoiceScreen.tsx

#### Bug 7 — Netlify 404 sur assets JS/CSS après déploiement
- **Root cause** : PowerShell `Compress-Archive` crée ZIP avec backslashes Windows dans les chemins → Netlify 404
- **Fix** : Créé `simulator/make-zip.mjs` (normalise paths POSIX) + commande curl API Netlify :
  ```bash
  node make-zip.mjs  # → dist.zip avec forward slashes
  curl -X POST "https://api.netlify.com/api/v1/sites/4734de84-0223-4bec-ba6c-d3e1eb87217e/deploys" \
    -H "Authorization: Bearer nfp_TEgxUYzHhsYxN2cX9L1q2PXqWZGQNjqJ553e" \
    -H "Content-Type: application/zip" --data-binary @dist.zip
  ```

#### Bug 8 — App.tsx ne s'adapte pas aux petits écrans
- **Fix** : Scale automatique min 45% dans `simulator/src/App.tsx` :
  ```tsx
  const s = Math.min((window.innerWidth-40)/PHONE_W, (window.innerHeight-120)/PHONE_H, 1);
  setScale(Math.max(s, 0.45));
  ```

#### Bug 9 — TextScreen sans unlock audio → TTS silencieux
- **Fix** : `simulator/src/components/screens/TextScreen.tsx` → `onClick={() => unlockAudio()}` sur wrapper div

**FEEDBACK LOOP CRÉÉ**
- `simulator/feedback-server.mjs` : serveur HTTP localhost:4567, POST /feedback → `feedback-inbox.json`
- `simulator/feedback-inbox.json` : tableau JSON, surveillé par Claude en loop
- FeedbackPanel → Railway `/api/feedback` + `localhost:4567` (dual-send)
- Monitor actif sur feedback-inbox.json → Claude corrige bugs en temps réel pendant les tests

**AUDIT COMPLET DZARYX — 2026-05-18**
- Toutes les fonctions Telegram ✅ vérifiées
- App web Netlify (10 panels) ✅ vérifiée
- Simulateur : bugs majeurs fixés, déployé https://dzaryx-simulator.netlify.app ✅
- Documentation complète mise à jour pour handoff (12_GUIDE_REPRISE.md + CURRENT_STATE.md)

### SIMULATEUR — ÉTAT APRÈS FIXES
- URL : https://dzaryx-simulator.netlify.app
- Audio TTS : ✅ fonctionnel (textOnly:false)
- Micro VAD : ✅ barre rouge/bleue confirmée (RMS time-domain)
- Chrome AudioContext : ✅ overlay unlock obligatoire
- AirPods Pro : ✅ seuil adapté + force-stop 8s
- Canvas : ✅ height=704 correct

### PROCHAINE ÉTAPE (exactement où on s'est arrêtés)
1. Confirmer que Dzaryx PARLE (TTS audio joue après réponse)
2. Tester message complet : parler → transcription → réponse Claude → audio
3. Interface/logo (demandé par Kouider)
4. EAS APK build June 1, 2026
5. Railway : ajouter MOBILE_TOKEN_HOUARI manuellement

---

## Session 2026-05-18 PART 1 — Jarvis Redesign + Simulateur Web

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
