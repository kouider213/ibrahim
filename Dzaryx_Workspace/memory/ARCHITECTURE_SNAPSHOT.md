# Architecture Snapshot — 2026-05-11

## Stack

| Layer | Tech | Version |
|-------|------|---------|
| Runtime | Node.js | TypeScript strict |
| Framework | Express + Socket.IO | — |
| DB | Supabase (PostgreSQL) | project febrrgqpyqqrewcohomx |
| Cache/Queue | Redis (Upstash) | BullMQ + custom keys |
| Deploy | Railway | auto-deploy from main |
| AI | Anthropic Claude | claude-3-5 (processMessage) |
| TTS | ElevenLabs | — |
| Images | fal.ai + Replicate | — |
| Bot | Telegram | webhook auto-registered |

## Key Files

```
backend/src/
├── index.ts                          ← server + Socket.IO + service init
├── config/
│   ├── env.ts                        ← validated env vars
│   └── constants.ts                  ← SOCKET_EVENTS etc
├── api/
│   ├── middleware/auth.ts             ← requireMobileAuth
│   └── routes/
│       ├── chat.ts                   ← POST /api/chat → processWithOrchestration
│       ├── orchestrator.ts           ← GET /api/orchestrator/*
│       └── [20+ other routes]
├── orchestrator/                     ← P15 Brain (created this session)
│   ├── orchestrator-engine.ts        ← main entry: processWithOrchestration
│   ├── action-engine.ts              ← recordToolExecution + getActionHistory
│   ├── memory-engine.ts              ← writeMemory + computeMemoryKey
│   ├── focus-manager.ts              ← dedup + rate limit
│   ├── priority-engine.ts            ← CRITICAL/HIGH/NORMAL/LOW scoring
│   ├── context-engine.ts             ← channel + cross-channel context
│   ├── agent-router.ts               ← routing decisions
│   └── anti-hallucination.ts         ← phantom guard + trace logger
├── conversation/
│   └── orchestrator.ts               ← processMessage (UNCHANGED — core pipeline)
├── integrations/
│   ├── tool-executor.ts              ← executeTool wrapper + ALL tool dispatch
│   ├── supabase.ts                   ← DB client
│   ├── claude-api.ts                 ← Anthropic API calls
│   └── [20+ integration files]
├── workers/
│   └── reminder-worker.ts            ← BullMQ reminder delivery
└── queue/
    └── queue.ts                      ← Redis client + BullMQ setup
```

## DB Tables (Supabase)

| Table | Purpose |
|-------|---------|
| cars | Vehicle fleet |
| bookings | Rental bookings |
| clients | Client profiles |
| profiles | User profiles |
| payments | Payment records |
| reviews | Client reviews |
| reminders | Scheduled reminders (v2 schema) |
| memory_facts | Modern memory (scored, domain-typed, SHA256 keyed) |
| ibrahim_memory | Legacy memory (FIFO, category-based) |
| client_documents | Uploaded docs |

## Redis Keys

| Pattern | TTL | Purpose |
|---------|-----|---------|
| `action:history:{sessionId}` | 3600s | Last 50 tool executions |
| `action:dedup:{session}:{tool}:{fp}` | 30s | Tool dedup window |
| `focus:dedup:{sha1hash}` | 10s | Message dedup |
| `focus:rate:{sessionId}` | 65s | Rate limit counter |
| `session:lastseen:{sessionId}` | 7d | Last activity |
| `user:tz:{sessionId}` | 7d | User timezone |
| `user:tz` | 7d | Global tz fallback |

## Auth

- Mobile: Bearer token `f6214183be37ad5e3c593590870077db247a4047c7de3cd72ae008e0f8d447d2`
- Socket.IO mobile namespace: same token
- Socket.IO desktop namespace: pc-agent token
- Telegram: TELEGRAM_BOT_TOKEN + WEBHOOK_SECRET

## Channels

| Channel | SessionId prefix | Notes |
|---------|-----------------|-------|
| Telegram | `telegram_{chatId}` | Primary — chatId=809747124 |
| Mobile voice | `voice_*` | — |
| Mobile text | `mobile_*` | — |
| Unknown | anything else | Default |
