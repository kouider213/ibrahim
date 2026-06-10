---
tags: [handoff, stack]
---
# 🧱 H02 — Stack technique
[[00 HANDOFF HUB|← Hub]]

| Couche | Techno | Détail |
|---|---|---|
| Backend | Node.js + TypeScript (Express) | **Railway**, déploiement auto au push |
| Base de données | Supabase (PostgreSQL) | RLS activé · Storage fichiers → [[H10 Base de données]] |
| Cache / Queue | Redis (Upstash) + BullMQ | sessions, cache image, jobs async |
| Cerveau IA | Claude `claude-sonnet-4-6` | boucle agentique + outils → [[H04 Cerveau Agents & gardes]] |
| Renforts IA | OpenAI · Groq · Gemini | image gpt-image-1, STT gpt-4o-transcribe, fallback texte |
| Voix | ElevenLabs (TTS) + voix clonée AR | STT = gpt-4o-transcribe → [[H05 Langues (darija)]] |
| Simulateur (UI) | React 18 + Vite + Tailwind | PWA, **GitHub Pages** → [[H09 Écrans]] |
| Agent PC | Python 3 + Socket.IO (Nexus) | tourne sur le PC de Kouider |
| Notifs | Pushover + Web Push (VAPID) | iPhone/Android |

Voir aussi [[ARCHITECTURE]]. Suite : [[H03 Architecture & flux]]
