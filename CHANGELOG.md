# Changelog — Ibrahim AI Backend

All notable changes are documented here in reverse chronological order.

---

## [Phase 6] — 2026-04 — WhatsApp Client Flow

### Added
- `src/integrations/whatsapp.ts` — WhatsApp service layer: language detection (AR/FR/EN), multilingual templates for booking confirmations, 24h reminders, return reminders
- `src/api/routes/whatsapp.ts` rewritten — client flow: auto-reply for simple queries, validation requests for bookings/complaints, new `POST /api/whatsapp/send` endpoint
- Tools: `send_whatsapp_to_client`, `check_car_availability`
- Proactive jobs: `wa-booking-confirmations` (every 10 min), `wa-24h-reminders` (10h), `wa-return-reminders` (9h)

### Fixed
- `package-lock.json` out of sync with `cloudinary` dependency — caused Railway `npm ci` failure

---

## [Phase 14] — 2026-03 — Cloudinary Media Processing

### Added
- `src/integrations/media-processing.ts` — image/video processing via Cloudinary
- `src/integrations/media-executor.ts` — media tool executor
- `cloudinary` npm package

---

## [Phase 13] — 2026-03 — Continuous Learning

### Added
- `src/actions/handlers/learning.ts` — feedback recording, monthly improvement reports, learning evolution tracking, Kouider preference calibration
- `src/integrations/feedback-system.ts` — learning patterns and preference analysis
- `src/integrations/improvement-report.ts` — monthly report generator + evolution comparison

---

## [Phase 5] — 2026-02 — Financial Management

### Added
- `src/integrations/phase5-finance.ts` — payments, CA reports, PDF invoices, anomaly detection, financial dashboard
- `src/actions/handlers/finance.ts` — finance action handler
- `src/api/routes/finance.ts` — finance API endpoints
- `pdfkit` npm package for PDF generation

### Fixed
- Tool executor returning objects instead of strings caused `tool_result` malformed errors (commit `b3f27e1`)

---

## [Phase 5 — Performance] — 2026-02 — Latency Optimisation

### Changed
- Conversation history reduced from 15 to 6 messages
- Heavy data (news, calendar, finance, memories) loaded conditionally based on message content
- Rules, fleet, bookings caches: 2 min TTL
- Weather cache: 5 min TTL

---

## [Core Developer Infrastructure] — 2026-04 — Reliability & Operations

### Added
- `scripts/predeploy.ts` — 6-check pre-deploy verification script (TypeScript, package-lock sync, env vars, critical files, conflict markers, Node version)
- Structured JSON logger in `src/audit/logger.ts` — `logger.info/warn/error/debug/time()`, Railway-compatible JSON output
- `TECHNICAL_NOTES.md` — architecture decisions, deployment rules, key patterns
- `CHANGELOG.md` — this file

### Changed
- `package.json` scripts: added `typecheck`, `check`, `predeploy`
- `src/config/constants.ts`: added `SOCKET_EVENTS.PC_REGISTER`
- `src/index.ts`: fixed `validateToken` call (added `'mobile'` type arg), fixed `registerPcAgent` call signature

### Fixed
- 15 TypeScript errors post-merge: wrong import path in `learning.ts`, missing `handleLearning` export, unused imports in `telegram.ts` and `improvement-report.ts`, implicit `any` in all Supabase callback parameters

---

## Recurring Deployment Pitfall

**Always run `cd backend && npm install` after adding a package to `package.json`.**  
Railway uses `npm ci` which requires `package-lock.json` to be fully synchronized.  
This caused outages for `pdfkit` and `cloudinary`. The `predeploy` script now checks for this automatically.
