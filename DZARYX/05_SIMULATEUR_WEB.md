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

## Déployer sur Netlify

1. Créer nouveau site Netlify (≠ ibrahim-fik-conciergerie.netlify.app)
2. Connecter le repo GitHub `kouider213/ibrahim`
3. Configurer :
   - **Base directory** : `simulator`
   - **Build command** : `npm install && npm run build`
   - **Publish directory** : `dist`
4. Variables d'environnement Netlify :
   - `VITE_BACKEND_URL` = `https://ibrahim-backend-production.up.railway.app`
   - `VITE_WS_URL` = `wss://ibrahim-backend-production.up.railway.app`
   - `VITE_ACCESS_TOKEN` = token Kouider (ou laisser vide si backend accepte sans auth)

---

## VoiceScreen — Visualiseur Canvas

Le visualiseur utilise Web Audio API + requestAnimationFrame :

```typescript
// Connexion micro
const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
const audioCtx = new AudioContext();
const analyser = audioCtx.createAnalyser();
audioCtx.createMediaStreamSource(stream).connect(analyser);

// Frame de dessin (60fps)
function frame(t: number) {
  analyser.getByteTimeDomainData(dataArray);
  // RMS → amplitude → rayon des anneaux
  // 3 anneaux concentriques + hex ring rotatif
  // Glow orb central + particules flottantes
  // Barres fréquence (mode listen)
  // Scanlines overlayées
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
