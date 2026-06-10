---
tags: [handoff, env, securite]
---
# 🔑 H12 — Variables d'environnement & intégrations
[[00 HANDOFF HUB|← Hub]]

Déclarées (Zod) dans `backend/src/config/env.ts`. **Local** = `.env` (gitignoré, dev). **Prod** = Variables **Railway**.

## Essentielles
`ANTHROPIC_API_KEY` · `SUPABASE_URL` · `SUPABASE_SERVICE_KEY` · `REDIS_URL` · `MOBILE_ACCESS_TOKEN` · `ELEVENLABS_API_KEY` · `ELEVENLABS_VOICE_ID`

## Renforts / features
- `OPENAI_API_KEY` → image **gpt-image-1**, STT **gpt-4o-transcribe**, édition photo, fallback texte
- `ELEVENLABS_VOICE_ID_AR` → **voix darija clonée** (auto-switch) → [[H05 Langues (darija)]]
- `GROQ_API_KEY` · `GEMINI_API_KEY` · `GOOGLE_MAPS_API_KEY` · `CLOUDINARY_*`
- `GITHUB_TOKEN` · `RAILWAY_TOKEN` · `NETLIFY_TOKEN` · `PUSHOVER_*` · `TELEGRAM_BOT_TOKEN`
- `MOBILE_TOKEN_HOUARI` (optionnel — sinon override par sessionId `voice_houari`)

> 🔴 Sécurité : ne JAMAIS committer une clé. Révoquer toute clé exposée. Détail : [[ENV]].

Suite : [[H13 Démarrage local]]
