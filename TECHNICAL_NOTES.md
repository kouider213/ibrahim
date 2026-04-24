# Ibrahim — Technical Notes

## Architecture

```
ibrahim/
├── backend/          # Express + TypeScript — deployed on Railway
│   ├── src/
│   │   ├── api/       # HTTP routes + middleware
│   │   ├── audit/     # Structured JSON logger + Supabase audit trail
│   │   ├── actions/   # Action registry + handler dispatch
│   │   ├── config/    # Env vars, constants, pricing
│   │   ├── conversation/ # Context builder + orchestrator
│   │   ├── integrations/ # Claude API, Supabase, tools, WhatsApp, Telegram…
│   │   └── queue/     # BullMQ jobs + scheduler (cron)
│   └── scripts/
│       └── predeploy.ts  # 6-check verification before every push
├── mobile/           # React — deployed on Netlify
└── pc-agent/         # Node script running on Kouider's PC
```

## Deployment Rules

### Railway (backend)

Railway runs `npm ci` — it requires `package.json` and `package-lock.json` to be **in perfect sync**.

**CRITICAL**: Whenever a new package is added to `package.json`, you MUST run:
```bash
cd backend && npm install
```
then commit the updated `package-lock.json` in the same commit.

Failure to do this causes `npm ci` to error out with:
```
npm error `npm ci` can only install packages when your package.json and package-lock.json or npm-shrinkwrap.json are in sync.
```

This pattern caused two production outages: once for `pdfkit` and once for `cloudinary`.

**Pre-deploy check**: `cd backend && npm run predeploy` runs 6 verification checks.

### Netlify (frontend)

Mobile app auto-deploys from `main` branch on push.

## TypeScript Configuration

`tsconfig.json` has `strict: true` which enables:
- `noImplicitAny` — all parameters must be typed
- `noUnusedLocals` / `noUnusedParameters` — unused imports cause errors

**Supabase pattern**: Supabase's `PromiseLike` return does not have `.catch()`. Use:
```typescript
// WRONG:
const data = await supabase.from('table').select('*').catch(() => []);

// CORRECT:
const data = await supabase.from('table').select('*').then((r: any) => r.data ?? []);
```

## Tool Execution Flow

```
WhatsApp/Telegram message
  → buildContext() [context-builder.ts]
  → chatWithTools() [claude-api.ts]
    → Claude API (tool_use blocks)
    → executeTool() [tool-executor.ts]
      → returns string (NEVER object/array — Claude requires strings)
  → Response sent back
```

Tool executor must always return `string | Promise<string>` — returning objects caused `tool_result` errors (fixed in Phase 5 commit `b3f27e1`).

## Key Environment Variables

| Variable | Required | Used for |
|---|---|---|
| `ANTHROPIC_API_KEY` | ✅ | Claude API calls |
| `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` | ✅ | Database |
| `REDIS_URL` | ✅ | BullMQ job queue |
| `MOBILE_ACCESS_TOKEN` | ✅ | Mobile app auth |
| `PC_AGENT_TOKEN` | ✅ | PC agent WebSocket auth |
| `WEBHOOK_SECRET` | ✅ | Webhook verification |
| `SESSION_SECRET` | ✅ | Express sessions |
| `PUSHOVER_USER_KEY` + `PUSHOVER_APP_TOKEN` | ✅ | Push notifications |
| `ELEVENLABS_API_KEY` + `ELEVENLABS_VOICE_ID` | ✅ | Voice synthesis |
| `TWILIO_*` | optional | WhatsApp outbound |
| `TELEGRAM_BOT_TOKEN` | optional | Telegram bot |
| `CLOUDINARY_*` | optional | Media upload |
| `FLIGHT_BOT_TOKEN` | optional | Flight search bot |

## Action System

Actions are registered in `src/actions/registry.ts` and dispatched through `src/actions/executor.ts`. Each handler maps to a module in `src/actions/handlers/`.

| Handler | File | Actions |
|---|---|---|
| `reservation` | handlers/reservation.ts | CRUD bookings, car management |
| `content` | handlers/content.ts | TikTok, captions, descriptions |
| `pc-relay` | handlers/pc-relay.ts | Execute commands on Kouider's PC |
| `finance` | handlers/finance.ts | Payments, CA reports, invoices |
| `learning` | handlers/learning.ts | Feedback, preferences, improvement reports |

## Proactive Jobs (BullMQ / cron)

| Job | Schedule | Description |
|---|---|---|
| `daily-brief` | 8h Africa/Algiers | Morning summary with fleet + weather |
| `car-rental-alerts` | every 30 min | Returns due today/tomorrow |
| `wa-booking-confirmations` | every 10 min | Send WhatsApp confirmation for new bookings |
| `wa-24h-reminders` | 10h daily | 24h before rental start |
| `wa-return-reminders` | 9h daily | Day of return reminder |

## Structured Logging

All logs are emitted as JSON to stdout/stderr, compatible with Railway's log aggregation:

```typescript
import { logger } from '../audit/logger.js';

logger.info('module-name', 'Message', { optional: 'data' });
logger.error('module-name', 'Error message', error.message);
logger.warn('module-name', 'Warning');
await logger.time('module-name', 'operation label', async () => { ... });
```

Set `LOG_LEVEL=debug` on Railway to enable debug-level output.

## Context Caching

`context-builder.ts` uses in-memory caches to avoid redundant DB calls:
- Fleet + Bookings + Rules: 2 minutes TTL
- Weather: 5 minutes TTL

Heavy data (news, calendar, finance, memories) is only loaded when the user's message matches specific regex patterns.
