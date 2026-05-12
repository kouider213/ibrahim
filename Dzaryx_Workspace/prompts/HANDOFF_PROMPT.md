# Handoff Prompt — Dzaryx Core System

Copier-coller ce prompt pour reprendre la session demain.

---

```
PROJECT HANDOFF — DZARYX CORE SYSTEM — suite session 2026-05-11

Repo: kouider213/ibrahim
HEAD: 82e83eb
Backend: https://ibrahim-backend-production.up.railway.app
Railway auto-deploy: ✅ active

ÉTAT:
- P15 Orchestrator Brain: 8 fichiers créés + wired + TypeScript 0 erreurs
- Action Engine: recordToolExecution hookée dans tous les tool calls ✅
- Memory Engine: dual-write (memory_facts + ibrahim_memory) ✅
- computeMemoryKey: SHA256 hash pour dédup case/ponctuation ✅
- Redis content: lisible (tronqué 120 chars, pas [binary]) ✅
- Endpoint GET /api/orchestrator/actions/:sessionId: LIVE ✅

FICHIERS P15:
  backend/src/orchestrator/
    anti-hallucination.ts  ✅
    priority-engine.ts     ✅
    memory-engine.ts       ✅ (writeMemory + computeMemoryKey exportés)
    action-engine.ts       ✅ (recordToolExecution + BINARY_ARG_KEYS sans content)
    context-engine.ts      ✅
    focus-manager.ts       ✅
    agent-router.ts        ✅
    orchestrator-engine.ts ✅
  backend/src/api/routes/chat.ts         ← wired à orchestrator-engine
  backend/src/api/routes/orchestrator.ts ← GET /api/orchestrator/*
  backend/src/index.ts                   ← initOrchestratorEngine ajouté

WORKSPACE:
  Dzaryx_Workspace/
  ├── roadmap/NEXT_SESSION.md      ← LIRE EN PREMIER
  ├── reports/P15_AUDIT_2026-05-11.md
  ├── deploy-history/P15_SESSION_2026-05-11.md
  ├── logs/RUNTIME_PROOFS_2026-05-11.md
  └── memory/ARCHITECTURE_SNAPSHOT.md

PARTIAL (non testé live):
  - focus-manager: dedup + rate limit
  - priority-engine: CRITICAL scoring
  - agent-router: CRITICAL scope
  - remember_info post-deploy: SHA256 key dans DB (sessions fresh = pas de tool calls via curl)

PROCHAINE TÂCHE — PRIORITÉ MAJEURE:
  🔥 AI Provider Router + Survival Architecture
  → backend/src/llm/ + providers/
  → Groq (SIMPLE) / Gemini (NORMAL+VISION) / Claude (COMPLEX) / Ollama (LOCAL)
  → Fallback automatique si Anthropic down
  → /api/health-ai endpoint
  → Variables Railway: GEMINI_API_KEY, GROQ_API_KEY, OPENROUTER_API_KEY
  → Voir: roadmap/FULL_ROADMAP.md pour détail complet

  Alternatives P15 si pas encore commencé:
  Option A: Runtime verification focus-manager + priority-engine via Railway logs
  Option B: Test live remember_info via Telegram → vérifier SHA256 dans memory_facts.key
  Option C: Context pruning (billing risk — limiter history à 20 messages)
  Option D: last_attempt_at migration pour reminders

RÈGLES:
- NEVER invent DB data, logs, or runtime status
- TypeScript strict — 0 errors before commit
- commit + push après chaque étape
- Do NOT recreate existing systems
- Auth token: f6214183be37ad5e3c593590870077db247a4047c7de3cd72ae008e0f8d447d2
- Telegram Chat ID: 809747124 → sessionId: telegram_809747124
```
