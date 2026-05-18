# 05 — Simulateur Android Web

> Répertoire : `simulator/`
> Stack : React 18 + TypeScript + Vite + Tailwind CSS v4 + Framer Motion
> But : Tester visuellement l'app AVANT de builder l'APK

---

## Structure

```
simulator/
├── package.json          ← React 18 + Vite + Tailwind v4 + Framer Motion
├── vite.config.ts
├── tsconfig.json
├── netlify.toml          ← base=simulator, publish=dist
├── index.html            ← Google Fonts : Orbitron + Exo 2 + Share Tech Mono
└── src/
    ├── main.tsx
    ├── App.tsx            ← Layout : fond grille cyan + téléphone centré + bouton feedback
    ├── index.css          ← Animations : scanlines, rings, particles, fadeIn, bubbleIn
    ├── services/
    │   └── api.ts         ← BACKEND_URL, Socket.IO /mobile, audio helpers
    └── components/
        ├── Phone.tsx      ← Coque Android 375×812px, barre statut, nav bar
        └── screens/
        │   ├── VoiceScreen.tsx   ← Canvas visualiseur + VAD + TTS + Vision
        │   └── TextScreen.tsx    ← Chat streaming + Socket.IO
        └── feedback/
            └── FeedbackPanel.tsx ← 3 onglets : feedback / checklist / historique
```

---

## Lancer en local

```bash
cd simulator
npm install
npm run dev
# → http://localhost:5174
```

---

## Déployer sur Netlify — MÉTHODE OBLIGATOIRE (API ZIP)

**Site existant** : https://dzaryx-simulator.netlify.app
**Site ID** : `4734de84-0223-4bec-ba6c-d3e1eb87217e`
**Token Netlify** : `nfp_TEgxUYzHhsYxN2cX9L1q2PXqWZGQNjqJ553e`

```bash
cd simulator
npm run build             # compile vers dist/
node make-zip.mjs         # crée dist.zip avec POSIX paths (OBLIGATOIRE)
curl -s -X POST "https://api.netlify.com/api/v1/sites/4734de84-0223-4bec-ba6c-d3e1eb87217e/deploys" \
  -H "Authorization: Bearer nfp_TEgxUYzHhsYxN2cX9L1q2PXqWZGQNjqJ553e" \
  -H "Content-Type: application/zip" \
  --data-binary @dist.zip
```

**POURQUOI make-zip.mjs et PAS PowerShell Compress-Archive** :
PowerShell crée des chemins avec backslashes Windows : `assets\index-abc123.js`
Netlify interprète ça comme chemin littéral → navigateur cherche `/assets%5Cindex.js` → 404
`make-zip.mjs` normalise avec `.replace(/\\/g, '/')` → POSIX paths → Netlify 200 ✅

**Fichier .env.local (local uniquement — NE PAS COMMITTER)** :
```
VITE_BACKEND_URL=https://ibrahim-backend-production.up.railway.app
VITE_WS_URL=wss://ibrahim-backend-production.up.railway.app
VITE_ACCESS_TOKEN=f6214183be37ad5e3c593590870077db247a4047c7de3cd72ae008e0f8d447d2
```

---

## VoiceScreen — VAD et Visualiseur Canvas

### Constantes VAD (après tests AirPods Pro)
```typescript
const SPEECH_RMS    = 0.004;  // RMS > ce seuil = parole (très sensible)
const SILENCE_RMS   = 0.008;  // RMS < ce seuil = silence (élevé pour bruit AirPods BT)
const SILENCE_DELAY = 1000;   // 1s de silence → stop enregistrement
const MIN_SPEECH_MS = 200;    // min 200ms pour être une vraie utterance
const MAX_REC_MS    = 8000;   // force-stop au bout de 8s (sécurité)
```

### Implémentation RMS (TIME DOMAIN — pas fréquences)
```typescript
// IMPORTANT : fftSize=2048, smoothingTimeConstant=0.3
// NE PAS utiliser getByteFrequencyData — trop dilué pour la parole
analyser.getByteTimeDomainData(timeData);  // valeurs 0-255, 128=silence
let sum = 0;
for (let i = 0; i < timeData.length; i++) {
  const v = (timeData[i] - 128) / 128;
  sum += v * v;
}
const rms = Math.sqrt(sum / timeData.length);  // RMS réel
```

### Chrome AudioContext Autoplay Policy
```typescript
// NE PAS appeler initMic() au mount du composant
// L'overlay est OBLIGATOIRE pour que AudioContext soit créé dans un user gesture
// Overlay click handler :
unlockAudio();           // déverrouille AudioContext global
setAudioUnlocked(true);  // cache l'overlay
initMic();               // maintenant on peut créer AudioContext
```

### Visualiseur Canvas
```typescript
// Frame de dessin (60fps via requestAnimationFrame)
function frame(t: number) {
  // Utilise rmsRef.current (même RMS calculé par VAD, pas recalculé)
  // 3 anneaux concentriques (rayon proportionnel au RMS)
  // Hex ring rotatif
  // Glow orb central
  // Particules flottantes
  // Scanlines overlay
  // Canvas height = 704 (PHONE_H=812 - FRAME*2=28 - STATUSBAR=44 - NAVBAR=36)
}
```

---

## FeedbackPanel — 77 features à checker

**Tab 1 — Feedback rapide**
- Zone texte + catégorie (Design/Bug/Fonctionnalité/Autre)
- Envoi vers `POST /api/feedback` (Railway)

**Tab 2 — Checklist complète (77 items)**
Groupes :
- VOCAL & IA (6 items)
- IA VISION (5 items)
- BUSINESS FIK CONCIERGERIE (15 items)
- APP WEB IBRAHIM Netlify (15 items)
- BOT TELEGRAM (10 items)
- MÉMOIRE IA (4 items)
- CONTRÔLE NEXUS PC (5 items)
- CRÉATION CONTENU (2 items)
- SYSTÈME (5 items)

Statuts par item : ☐ → ✅ → ⚠️ → ❌ (cycle au clic)
Note éditable pour ⚠️ et ❌

**Tab 3 — Historique**
Timeline des modifications avec date + description + statut

**Export**
Bouton → génère `dzaryx-report-{timestamp}.json`

---

## Connexions backend dans le simulateur

Toutes les connexions passent par Railway (pas Supabase direct) :
- `POST /api/transcribe` ← audio base64 → texte Groq Whisper
- `POST /api/chat` ← message → réponse Claude
- `POST /api/tts` ← texte → audio ElevenLabs base64
- `POST /api/vision/analyze` ← image base64 → description
- `GET /api/nexus/status` ← état Nexus PC
- `Socket.IO /mobile` ← streaming temps réel

---

## Build stats

```
dist/index.html         0.73 kB │ gzip: 0.42 kB
dist/assets/*.css       9.14 kB │ gzip: 2.62 kB
dist/assets/*.js      228.55 kB │ gzip: 72.51 kB
Build time: 916ms
TypeScript errors: 0
```

---

#simulateur #web #vite #react #canvas #vad
