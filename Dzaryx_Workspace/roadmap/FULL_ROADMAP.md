# Dzaryx / Nexus — Roadmap Complète

**Dernière mise à jour:** 2026-05-11  
**HEAD:** 82e83eb  
**Règle absolue:** Chaque phase VERIFIED avant suivante. Jamais casser l'existant.

---

## PHASES COMPLÉTÉES ✅

### P1–P14 (historique)
- Business logic: bookings, cars, clients, payments
- Telegram bot + webhook
- Reminders v2: dedup triple-layer, worker delivery, timezone chain
- BullMQ: 16 repeatable jobs, Redis/Upstash
- Nexus PC relay + Launcher relay
- BI Layer: 5 agents (fleet/revenue/reminders/whatsapp/tiktok)
- Operator Dashboard: Jarvis/Nexus dark UI

### P15 — AI Orchestrator Brain ✅ (2026-05-11)
- 8 modules: focus-manager, priority-engine, context-engine, agent-router, action-engine, memory-engine, anti-hallucination, orchestrator-engine
- recordToolExecution hookée dans tous les tool calls
- Dual-write memory: memory_facts (SHA256 dedup) + ibrahim_memory (legacy)
- isToolFailureResult: détection erreurs business
- Redis action:history: 50 records/session, TTL 3600s
- Endpoint: GET /api/orchestrator/actions/:sessionId
- TypeScript: 0 erreurs. Railway: live.

---

## 🔥 PRIORITÉ SUIVANTE — AI Provider Router + Survival Architecture

### Objectif
Dzaryx survit sans Anthropic. Claude devient premium/fallback, pas dépendance unique.

### Ce Qui Doit Continuer Sans Anthropic
- Telegram → continuer
- App mobile → continuer
- Mémoire → continuer
- Rappels → continuer
- Business (bookings/agenda) → continuer
- Nexus → continuer partiellement
- Vision → fallback Gemini Vision
- Dzaryx ne doit jamais paraître "mort"

### Fichiers à Créer

```
backend/src/llm/
├── ai-provider-router.ts      ← routing principal + fallback chain
├── provider-health.ts         ← health check + disponibilité par provider
├── provider-cost-engine.ts    ← choisir le moins cher automatiquement
├── provider-priority.ts       ← config priorités par task type
└── provider-monitor.ts        ← quota / coûts / erreurs / fallback actif

backend/src/llm/providers/
├── anthropic-provider.ts      ← Claude (actuel — wrappé)
├── gemini-provider.ts         ← Google Gemini Flash + Vision
├── groq-provider.ts           ← Groq (rapide, gratuit/cheap)
├── openrouter-provider.ts     ← OpenRouter (multi-model)
└── ollama-provider.ts         ← Ollama local (Nexus PC allumé)
```

### Routing Logic

| Task Type | Providers | Priorité |
|-----------|-----------|---------|
| SIMPLE (reminders, météo, messages courts, business simple) | Groq → Gemini Flash | Gratuit d'abord |
| NORMAL (conversations, assistant, résumé, agenda, conseils) | Gemini → OpenRouter | Coût moyen |
| VISION (caméra, dégâts voiture, OCR, PDF, analyse image) | Gemini Vision → Claude Vision | Gemini principal |
| COMPLEX (code, architecture, reasoning lourd, audits) | Claude → OpenAI | Premium seulement |
| LOCAL (Nexus allumé) | Ollama local | Gratuit, 0 latence réseau |

### Endpoint Nouveau
```
GET /api/health-ai
→ {
    providers: { anthropic: "🟢", gemini: "🟢", groq: "🟢", openrouter: "🟡", ollama: "🔴" },
    active_fallback: null | "gemini" | "groq",
    costs_today: { anthropic: "$0.42", gemini: "$0.03", groq: "$0.00" },
    errors_1h: { anthropic: 0, gemini: 0 },
    quota_remaining: { anthropic: "82%", gemini: "unlimited" }
  }
```

### Règles Fallback
1. Provider principal down → fallback automatique (invisible utilisateur)
2. Quota épuisé → passer au suivant dans la chaîne
3. Latence > 10s → timeout + retry sur fallback
4. Ollama dispo (Nexus allumé) → tâches simples en local prioritaire

### Mini-Steps Implémentation
1. Créer interface `LLMProvider` + `LLMRequest`/`LLMResponse` types
2. Wrapper `anthropic-provider.ts` (existing claude-api.ts wrappé)
3. Ajouter `gemini-provider.ts` (Gemini 1.5 Flash)
4. Ajouter `groq-provider.ts` (llama3-8b-8192 gratuit)
5. Créer `provider-health.ts` (ping interval 60s)
6. Créer `ai-provider-router.ts` (routing + fallback chain)
7. Wirer dans `processMessage` (conversation/orchestrator.ts)
8. Endpoint `/api/health-ai`
9. TypeScript 0 erreurs → commit → deploy → verify

---

## P16 — Android Native Core
- Foreground services
- Overlays système
- Notifications vocales
- Mode voiture
- Wake word
- Waze/Spotify intents

## P17 — Voice + Realtime
- ElevenLabs streaming (chunks, pas attente fin)
- Animations listening/speaking/thinking
- Interruption vocale mid-sentence
- Low latency audio (<300ms)

## P18 — Life Awareness Engine
- Habitudes + routines
- Famille (enfants, dates importantes)
- Nutrition + hydratation
- Temps écran
- Fatigue detection
- Conseils contextuels proactifs

## P19 — Travel Intelligence
- Trafic temps réel
- Vols Belgique ↔ Algérie
- Ferry (si applicable)
- Départ intelligent (calcul horaire optimal)
- Waze auto-launch intent

## P20 — Nexus Full Control
- Terminal commandes
- Chrome automation
- VSCode control
- Fichiers (lecture/écriture/recherche)
- Screenshots + analyse
- Automation PC avancée
- CapCut/Runway integration

## P21 — Vision Intelligence
- Gemini Vision realtime (caméra téléphone)
- Analyse dégâts voiture (photo → rapport)
- OCR (documents, passeports, permis)
- Mémoire visuelle privée
- Reconnaissance personnes autorisées
- Embeddings visage locaux (plus tard)

## P22 — Self-Healing AI
- Auto-debug (Railway logs → Claude Code auto-fix)
- Auto-repair (detect crash → redeploy)
- Auto-deploy pipeline
- Claude Code orchestration depuis Dzaryx

## P23 — Final Jarvis Interface
- Animations Jarvis holographiques
- Mobile cockpit UI
- Live camera feed + analyse
- Nexus dashboard realtime
- Orchestration complète depuis téléphone

---

## Modes Opérationnels

### MODE CLOUD (PC éteint)
```
Telegram → Dzaryx → [Groq/Gemini/OpenRouter] → réponse
App mobile → mémoire → rappels → agenda → business
Vision → Gemini Vision API
ElevenLabs → audio
Supabase + Redis → persistance
```

### MODE NEXUS (PC allumé)
```
+ Ollama local (tâches simples gratuites)
+ Claude Code (reasoning lourd)
+ Terminal + fichiers
+ Contrôle Chrome/VSCode
+ Génération vidéo locale
+ Agents locaux lourds
```

---

## Providers IA — État Actuel + Cibles

| Provider | Actuel | Cible P_Router | Coût |
|----------|--------|---------------|------|
| Anthropic Claude | ✅ Principal | Premium/Fallback | Payant |
| Google Gemini Flash | ❌ Non intégré | Principal NORMAL | Cheap/Free tier |
| Google Gemini Vision | ❌ Non intégré | Principal VISION | Cheap |
| Groq (Llama3) | ❌ Non intégré | Principal SIMPLE | Gratuit |
| OpenRouter | ❌ Non intégré | Fallback NORMAL | Variable |
| Ollama (local) | ❌ Non intégré | Local NEXUS | Gratuit |
| ElevenLabs | ✅ TTS | Conserver | Payant |
| OpenAI | ❌ Non intégré | Fallback COMPLEX | Payant |

---

## Variables Env à Ajouter (Railway)
```
GEMINI_API_KEY=
GROQ_API_KEY=
OPENROUTER_API_KEY=
OLLAMA_BASE_URL=http://[nexus-ip]:11434   (optionnel, quand Nexus allumé)
```
