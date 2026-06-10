---
tags: [handoff, architecture]
---
# 🏗️ H03 — Architecture & flux
[[00 HANDOFF HUB|← Hub]]

## Composants du dépôt `ibrahim/`
- **backend/** — API Express TS, cœur de l'intelligence (Railway)
- **simulator/** — l'UI réelle React/Vite dans la WebView native (GitHub Pages) → [[H09 Écrans]]
- **nexus/** — agent Python sur le PC de Kouider (Socket.IO `/nexus`)
- **mobile/** — PWA React (Netlify)
- **rental-system/** — site vitrine + admin (Next.js, Vercel)
- **supabase/** — migrations SQL → [[H10 Base de données]]

## Flux d'une requête IA
```
Message (Chat / Voix / Telegram / WhatsApp)
   ↓
chat.ts  (POST /api/chat → 202, réponse via Socket.IO)
   ↓
orchestrator-engine.ts  → focus (dedup/rate-limit) + priorité + contexte
   ↓
orchestrator.ts (processMessage) — POINT CENTRAL
   ├─ pré-routes serveur : inspection · scan ID · édition image
   ├─ context-builder.ts → contexte (résas, finance, profil, LANGUE)
   ├─ core-router.ts     → choisit l'agent + sous-ensemble d'outils
   ├─ claude-api.ts (chatWithTools) → boucle agentique + outils
   │      └─ tool-executor.ts → exécute (Supabase, image…)
   └─ GARDES : response-guard (phantom) + anti-hallucination
   ↓ (auto-retry : force l'outil si une garde bloque)
Réponse → Socket.IO TEXT_COMPLETE + audio ElevenLabs
```

Détail cerveau : [[H04 Cerveau Agents & gardes]]. Fichiers : [[H15 Fichiers clés]].
