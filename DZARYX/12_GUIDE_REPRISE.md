# 12 — Guide Reprise Projet

> Pour un développeur (ou un agent AI) qui reprend le projet à zéro.
> Lis ce guide en entier avant de toucher quoi que ce soit.

---

## Étape 1 — Lire ces fichiers dans l'ordre

1. `DZARYX/CURRENT_STATE.md` ← ce que le projet fait MAINTENANT
2. `DZARYX/BUGS.md` ← bugs ouverts (travailler là-dessus en priorité)
3. `DZARYX/ROADMAP.md` ← feuille de route
4. `DZARYX/00_INDEX.md` ← vue d'ensemble + liens
5. `CLAUDE.md` (racine) ← règles que l'agent AI DOIT suivre

---

## Étape 2 — Comprendre la structure

```
ibrahim/
├── backend/         ← API Node.js TypeScript (PRINCIPAL) — Railway
├── mobile/          ← React PWA (dashboard + chat) — Netlify
├── simulator/       ← Simulateur Android web — à déployer Netlify
├── dzaryx-native/   ← App React Native Expo — APK Android
├── nexus/           ← Agent Python PC Kouider
├── pc-agent/        ← Agent TypeScript PC (alternative)
├── flight-bot/      ← Bot Telegram vols (indépendant)
├── supabase/        ← Migrations SQL
├── scripts/         ← Utilitaires
└── DZARYX/          ← Cette documentation
```

---

## Étape 3 — Vérifier que tout tourne

```bash
# Backend Railway → doit répondre
curl https://ibrahim-backend-production.up.railway.app/health

# App Web Netlify → doit s'ouvrir
# https://ibrahim-fik-conciergerie.netlify.app/

# Simulateur local → si tu veux tester
cd simulator && npm install && npm run dev
# → http://localhost:5174
```

---

## Étape 4 — Tâches en attente (priorité)

1. **PRIORITÉ 1 — Confirmer TTS audio fonctionne** :
   - Ouvrir https://dzaryx-simulator.netlify.app
   - Cliquer overlay "🎙️ APPUYER POUR ACTIVER"
   - Parler une phrase → attendre réponse → Dzaryx DOIT parler (audio)
   - Si silencieux : vérifier console du navigateur pour erreurs audio

2. **PRIORITÉ 2 — Interface/Logo** (demandé par Kouider le 2026-05-18) :
   - Kouider veut modifier l'interface du simulateur ET le logo de l'app
   - Demander à Kouider : quel style de logo ? couleurs ?

3. **EAS Build APK** (à partir du 1 juin 2026) :
   ```bash
   cd dzaryx-native
   EXPO_TOKEN=G7nmf_7VE1RreEeM3E5orMQJiVvGhLYt7Ze1jCN6 \
   npx eas build --platform android --profile preview --non-interactive
   ```
   - Token EAS valide : G7nmf_7VE1RreEeM3E5orMQJiVvGhLYt7Ze1jCN6
   - RÉVOQUER sur expo.dev après build terminé

4. **Railway** : Ajouter MOBILE_TOKEN_HOUARI + Twilio vars (action MANUELLE Kouider sur railway.app) :
   ```
   MOBILE_TOKEN_HOUARI = 99c3dba3359626a99f527dba6dd994a64049cc0984036933b7f96adddb41bfe2
   ```

5. **Google Cloud** : Restreindre Maps API key `AIzaSyAv7s2qAJiHwsAzVmeA25UEOmo8p6FIsyo`
   → Distance Matrix API uniquement

6. **Phase 7** (planifié) : WhatsApp bot, PDF contrats, Chargily Pay, export Excel

7. **Phase 4 restant** : Wake word "Dzaryx", TikTok auto-posting, Spotify, auto-unlock PC

---

---

## Simulateur Android Web — Tout ce qu'un Claude doit savoir

**URL live** : https://dzaryx-simulator.netlify.app
**Site Netlify ID** : `4734de84-0223-4bec-ba6c-d3e1eb87217e`
**Token Netlify** : `nfp_TEgxUYzHhsYxN2cX9L1q2PXqWZGQNjqJ553e`

### Fichiers importants

| Fichier | Rôle |
|---------|------|
| `simulator/src/services/api.ts` | Backend URL, Socket.IO, audio helpers |
| `simulator/src/components/screens/VoiceScreen.tsx` | VAD + TTS + Canvas (MODIFIÉ 2026-05-18) |
| `simulator/src/components/screens/TextScreen.tsx` | Chat streaming |
| `simulator/src/App.tsx` | Layout + auto-scale responsive |
| `simulator/make-zip.mjs` | Crée dist.zip avec POSIX paths pour Netlify |
| `simulator/feedback-server.mjs` | Serveur local port 4567, reçoit feedbacks |
| `simulator/feedback-inbox.json` | Feedbacks reçus (surveillé par Monitor) |
| `simulator/.env.local` | Tokens locaux — NE JAMAIS COMMITTER |

### Build + Deploy Netlify (IMPORTANT — NE PAS utiliser PowerShell Compress-Archive)
```bash
cd simulator
npm run build
node make-zip.mjs   # crée dist.zip avec POSIX paths (forward slashes)
curl -s -X POST "https://api.netlify.com/api/v1/sites/4734de84-0223-4bec-ba6c-d3e1eb87217e/deploys" \
  -H "Authorization: Bearer nfp_TEgxUYzHhsYxN2cX9L1q2PXqWZGQNjqJ553e" \
  -H "Content-Type: application/zip" --data-binary @dist.zip
```
**POURQUOI** : PowerShell crée des chemins avec backslashes (`/assets\index.js`) → Netlify 404

### VAD — Constantes importantes
```ts
const SPEECH_RMS    = 0.004;  // RMS au-dessus = parole détectée
const SILENCE_RMS   = 0.008;  // RMS en-dessous = silence (élevé pour AirPods Pro)
const SILENCE_DELAY = 1000;   // ms silence → stop recording
const MIN_SPEECH_MS = 200;    // utterance minimum valide
const MAX_REC_MS    = 8000;   // force-stop si enregistrement trop long
```
- fftSize = 2048 (pas 256 comme avant)
- smoothingTimeConstant = 0.3
- RMS calculé sur getByteTimeDomainData (TIME DOMAIN, pas fréquences)
- Si tu changes SPEECH_RMS : test avec/sans AirPods → valeurs différentes

### Chrome AudioContext — OBLIGATOIRE
L'utilisateur DOIT cliquer l'overlay avant d'utiliser le micro. Sans ça, AudioContext reste suspendu.
- Overlay : "🎙️ APPUYER POUR ACTIVER" (fond noir transparent)
- Sur clic : `unlockAudio()` + `setAudioUnlocked(true)` + `initMic()`
- NE PAS appeler initMic() au mount du composant

### Audio TTS — CRITIQUE
`api.ts chat()` doit envoyer `textOnly: false` (ou ne pas passer ce param du tout).
```ts
// CORRECT :
chat: (msg, sessionId, imageBase64?, imageMime?, textOnly = false) =>
  apiFetch('/api/chat', { body: JSON.stringify({ message: msg, sessionId, textOnly: textOnly && !imageBase64, ... }) })
// Si textOnly=true → backend skip ElevenLabs → pas d'audio → Dzaryx muet
```

### Feedback Loop (pendant les tests)
```bash
# Terminal 1 : feedback server
node simulator/feedback-server.mjs   # → http://localhost:4567

# Terminal 2 : surveiller feedbacks (Claude /loop actif)
# Claude surveille feedback-inbox.json et corrige les bugs en temps réel
```

---

## Audit Fonctionnalités Dzaryx — État 2026-05-18

### TELEGRAM BOT ✅ (toutes fonctions opérationnelles)
| Fonction | Statut | Notes |
|---------|--------|-------|
| Chat IA (réponse texte) | ✅ | Claude Sonnet 4.6 principal |
| Voice (Whisper → Claude → TTS) | ✅ | Auto-detect fr/ar/darija |
| Réservations (créer/modifier/annuler) | ✅ | car_id depuis nom, prix réels |
| Finances (CA/profit/revenus) | ✅ | Vrais prix Supabase, prorabilisés |
| Documents clients (passeport/permis) | ✅ | Service key, envoi buffer Telegram |
| Parc véhicules (disponibilité) | ✅ | |
| Clients (scoring VIP/FRÉQUENT/etc.) | ✅ | |
| Rappels automatiques | ✅ | BullMQ 7 jobs |
| Morning briefing | ✅ | KOUIDER_SCHEDULE 7 jours |
| Recherche web | ✅ | SearXNG + Jina Reader |
| Vidéo marketing | ✅ | FFmpeg 720×1280, livraison Telegram |
| Vision (photo → analyse) | ✅ | Gemini → OpenAI → Claude Haiku |
| Google Calendar | ✅ | Lecture + création + suppression |
| Nexus PC Agent | ✅ | Terminal streaming, screenshot, sysinfo |
| Mémoire IA | ✅ | memory_facts Supabase, acteur-scoped |
| Veille concurrents | ✅ | SearXNG multi-sources |
| Anti-hallucination | ✅ | 7 gates bloquants + fastPathGuard |
| Multi-acteur (Kouider + Houari) | ✅ | Token acteur-scoped |

### APP WEB NETLIFY ✅ (https://ibrahim-fik-conciergerie.netlify.app)
| Section | Statut | Notes |
|---------|--------|-------|
| Chat direct (/) | ✅ | REST + Socket.IO streaming |
| LiveFleet (/dashboard) | ✅ | État parc temps réel |
| LiveRevenue (/dashboard) | ✅ | CA temps réel |
| AIAlerts (/dashboard) | ✅ | Rappels HIGH priority |
| BookingForm (/dashboard) | ✅ | Création réservation mobile |
| CalendarView (/dashboard) | ✅ | Heatmap mois |
| ClientsView (/dashboard) | ✅ | Liste scorée, search |
| DzaryxCore (/dashboard) | ✅ | État système AI |
| VoiceMode (/dashboard) | ✅ | Mode vocal |
| WhatsAppAI (/dashboard) | 🔵 | Interface prête, API non configurée |
| TikTokAI (/dashboard) | 🔵 | Interface prête, automation planifiée |

### SIMULATEUR WEB ✅ (https://dzaryx-simulator.netlify.app)
| Fonction | Statut | Notes |
|---------|--------|-------|
| Coque Android (VoiceScreen) | ✅ | Canvas height=704, anneaux, particules |
| VAD micro | ✅ | RMS time-domain, SPEECH_RMS=0.004 |
| AirPods Pro compatible | ✅ | SILENCE_RMS=0.008, MAX_REC_MS=8s |
| Chrome AudioContext unlock | ✅ | Overlay obligatoire |
| TTS audio Dzaryx | ✅ | textOnly=false confirmé |
| Chat texte (TextScreen) | ✅ | Streaming Socket.IO |
| FeedbackPanel (77 items) | ✅ | 3 onglets + export JSON |
| Responsive (petits écrans) | ✅ | Auto-scale min 45% |

### APP NATIVE (dzaryx-native) — APK À BUILDER LE 1 JUIN
| Fonction | Statut | Notes |
|---------|--------|-------|
| Voice screen Jarvis | ✅ Code prêt | VAD -28dB, 1400ms silence |
| 14 écrans | ✅ Code prêt | bookings/fleet/revenue/clients/etc. |
| Push notifications | ✅ Code prêt | Token Expo en Redis |
| Multi-acteur | ✅ Code prêt | Kouider cyan / Houari violet |
| APK | ❌ Non buildé | EAS reset June 1, 2026 |

---

## Règles absolues à ne jamais oublier

### Code
```
1. npx tsc --noEmit → 0 ERREURS avant tout commit
2. git add <fichiers spécifiques> — JAMAIS git add -A ou git add .
3. NE JAMAIS committer .env ou fichiers secrets
4. Profit = (client_price_per_day - owner_price_per_day) × nb_days
   JAMAIS catalog.benefit, jamais de valeur inventée
```

### Sécurité
```
- EXPO_TOKEN G7nmf_... → révoquer sur expo.dev quand builds terminés
- Google Maps API key → restreindre à Distance Matrix API
- MOBILE_TOKEN_HOUARI → jamais logguer
```

### Après chaque modification
```
| Action        | Fichier à mettre à jour            |
|---------------|-------------------------------------|
| Bug fixé      | DZARYX/BUGS.md → 🔴 → ✅            |
| Feature       | DZARYX/ROADMAP.md + CHANGELOG.md    |
| Fin session   | DZARYX/CURRENT_STATE.md             |
| Journal       | DZARYX/11_JOURNAL.md                |
```

---

## Déploiement

```bash
# Backend (Railway auto-deploy)
git push origin main  ← Railway détecte et redéploie automatiquement

# Mobile PWA (Netlify auto-deploy)
# Modifs dans mobile/ → push → Netlify redéploie automatiquement

# Nexus PC Agent (manuel)
# Modifier nexus/ → copier sur PC Kouider → redémarrer nexus.py
```

---

## Variables d'environnement importantes

| Variable | Service | Note |
|----------|---------|------|
| `EXPO_PUBLIC_BACKEND_URL` | EAS | URL Railway |
| `EXPO_PUBLIC_MOBILE_TOKEN` | EAS | Token Kouider |
| `EXPO_PUBLIC_MOBILE_TOKEN_HOUARI` | EAS | Token Houari |
| `VITE_BACKEND_URL` | Netlify simulateur | URL Railway |
| `VITE_WS_URL` | Netlify simulateur | URL WSS Railway |
| `MOBILE_TOKEN_HOUARI` | Railway | `99c3dba3...` (à ajouter) |

---

## Pièges à éviter

1. **EAS build sans env** → app cassée (backend URL undefined) → toujours utiliser profile avec `"environment": "production"` dans eas.json ✅ (déjà fait)
2. **Supabase maybeSingle()** → throw si plusieurs résultats → utiliser `select().limit(1)` ou gérer array
3. **Groq/Gemini sans outils** → hallucinations finance → fastPathGuard bloque ✅ (déjà fait)
4. **`git add .`** → peut inclure .env → JAMAIS

---

## Questions fréquentes

**Q: L'app mobile répond pas au micro ?**
R: Vérifier dans Paramètres Android → Permissions → Microphone → Dzaryx = Autorisé

**Q: La vision marche pas ?**
R: Vérifier quota Gemini Flash. Fallback → OpenAI → Claude Haiku. Vérifier backend logs Railway.

**Q: Le bot Telegram répond pas ?**
R: Vérifier Railway → bouton "Redeploy". Vérifier `health` endpoint.

**Q: Où voir les logs Railway ?**
R: https://railway.app → projet → service backend → Logs

**Q: Comment ajouter un écran dans l'app native ?**
R: 1. Créer `dzaryx-native/app/mon-ecran.tsx` 2. Ajouter `<Stack.Screen name="mon-ecran" />` dans `_layout.tsx` 3. `router.push('/mon-ecran')`

---

#guide #reprise #onboarding #documentation
