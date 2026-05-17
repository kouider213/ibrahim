# DZARYX — PROGRESS LOG
> Auto-maintained. Last update: 2026-05-17. Session: Remote Control Mission.

---

## WHAT KOUIDER ASKED FOR (complete list from all conversations)

### Core AI Features
- [x] Understands typos / darija / arabe / français naturel (Conversation Engine V2)
- [x] Voice input (STT via Groq Whisper → /api/transcribe)
- [x] Voice output (TTS via ElevenLabs eleven_turbo_v2_5 + eleven_multilingual_v2 for Arabic)
- [x] Camera vision (photo → Claude vision analysis → voice response)
- [x] Anti-hallucination (4 gates blocking phantom writes, financial claims, system state)
- [x] Pending action memory (Redis TTL 5min — confirm/cancel flow for risky ops)
- [ ] Spanish language support (mentioned in vision, not yet implemented)

### Car Rental Management (Fik Conciergerie Oran)
- [x] Réservations (create/read/update/delete via Claude tools → Supabase)
- [x] Clients (search, disambiguation when multiple matches)
- [x] Paiements (record, CA report, unpaid bookings)
- [x] Document masking (passport/license shown masked by default)
- [x] Original document request (isAdminAction gate + pending action)
- [x] Voucher PDF generation (bon de réservation via Telegram)
- [x] Client profit calculation (client_price_per_day - owner_price_per_day × days)
- [x] Fleet status (cars available/rented/maintenance)
- [x] Financial dashboard (revenue week/month)
- [x] Google Calendar sync (bookings → calendar events)
- [ ] Admin confirmation gate ENFORCED in orchestrator (isAdminAction flag extracted but not hard-gated)

### Mobile App (Android APK — OnePlus 5T)
- [x] Expo SDK 54 / React Native 0.81.5
- [x] Multi-user: Kouider (cyan) + Houari (purple)
- [x] Orb UI (JARVIS-style dark interface)
- [x] Voice mode (hold mic → Groq Whisper → Claude → ElevenLabs)
- [x] Car mode (hands-free, auto-listen 8s)
- [x] Camera vision button
- [x] Text overlay input
- [x] Content panel (TikTok pending + WhatsApp status)
- [x] Settings screen (backend ping, actor info, logout)
- [x] Quick commands palette (4 tap buttons)
- [x] Push notifications (Expo token registered to backend)
- [x] Navigation: Waze/Maps links from AI response
- [x] Socket.IO real-time (text_complete, audio_chunk, status, proactive)
- [x] app.json: version 1.1.0, versionCode 2, no trailing comma
- [x] TypeScript: 0 errors
- [ ] **APK BUILD BLOCKED — needs EXPO_TOKEN** → user must run: `! eas login`

### PC Control (Nexus)
- [x] Terminal commands (run_command with blocklist)
- [x] Screenshot capture → Telegram
- [x] VS Code / Chrome / file operations
- [x] Streaming terminal output (nexus:terminal_chunk)
- [x] Security: nonce anti-replay, Redis-backed

### Notifications & Proactive
- [x] Push notifications (Expo push token stored in Redis)
- [x] Proactive alerts (BullMQ jobs → Telegram + mobile)
- [x] Reminder system (insertReminder → BullMQ)

### Content / Marketing
- [x] TikTok video generation (approve/reject flow)
- [ ] TikTok auto-post (EXPLICITLY EXCLUDED by user: "sauf le tiktok")
- [x] WhatsApp (code ready, Twilio NOT configured — user needs env vars)

### Config Needed by User (Railway)
- [ ] MOBILE_TOKEN_HOUARI = 99c3dba3359626a99f527dba6dd994a64049cc0984036933b7f96adddb41bfe2
- [ ] TWILIO_ACCOUNT_SID
- [ ] TWILIO_AUTH_TOKEN
- [ ] TWILIO_WHATSAPP_FROM
- [ ] GOOGLE_SERVICE_ACCOUNT_JSON

---

## SESSION LOG

### 2026-05-16 (Session start — context recovery)
- Read full project state from compacted summary
- Identified critical bug: app/onboarding/mode.tsx missing → crash

### 2026-05-16 to 2026-05-17 (Current session)

**Backend — Conversation Engine V2** (commits aed62e3, c98bd8d)
- Created backend/src/conversation/normalizer.ts — typo correction, synonym expansion, isShort
- Created backend/src/conversation/entity-extractor.ts — docType, carName, action, dates, amounts
- Created backend/src/conversation/pending-action.ts — Redis TTL 5min confirm/cancel
- Created backend/src/conversation/engine-v2.ts — pipeline orchestrator
- Created backend/src/tests/engine-v2.test.ts — 41 tests, all pass
- Fixed document-reader.ts: maskSensitiveText, document_access_logs
- Fixed client-intelligence.ts: disambiguation instead of .maybeSingle()
- Integrated V2 into orchestrator.ts (preprocessMessage before buildContext)

**Native App fixes** (commits 3c144cc, 42be09b)
- Created dzaryx-native/app/onboarding/mode.tsx (was declared in _layout but MISSING → crash)
- Created dzaryx-native/app/settings.tsx (backend ping, actor, version, logout)
- Fixed dzaryx-native/app.json: trailing comma removed, version 1.1.0, versionCode 2
- Updated dzaryx-native/app/_layout.tsx: added settings route
- Fixed dzaryx-native/app/chat.tsx:
  - Added useRouter + React import
  - Fixed NotificationBehavior (added shouldShowBanner, shouldShowList)
  - Moved handleSend before stopRecord (ordering fix)
  - Fixed CameraViewRef cast (ref as unknown as React.RefObject<CameraView>)
  - Changed takePictureAsync → takePicture (SDK 54)
  - Added RÉGLAGES button to toolbar
  - Added quick commands row (4 tap buttons)

**Files modified this session:**
- backend/src/conversation/normalizer.ts (NEW)
- backend/src/conversation/entity-extractor.ts (NEW)
- backend/src/conversation/pending-action.ts (NEW)
- backend/src/conversation/engine-v2.ts (NEW)
- backend/src/tests/engine-v2.test.ts (NEW)
- backend/src/integrations/document-reader.ts (MODIFIED: masking + access logs)
- backend/src/orchestrator/client-intelligence.ts (MODIFIED: disambiguation)
- backend/src/orchestrator/orchestrator-engine.ts (MODIFIED: responseAllowed fix)
- backend/src/conversation/orchestrator.ts (MODIFIED: V2 integration)
- dzaryx-native/app/onboarding/mode.tsx (NEW)
- dzaryx-native/app/settings.tsx (NEW)
- dzaryx-native/app.json (MODIFIED: version, versionCode, trailing comma)
- dzaryx-native/app/_layout.tsx (MODIFIED: settings route)
- dzaryx-native/app/chat.tsx (MODIFIED: multiple fixes + features)

---

## REMAINING TASKS

### CRITICAL (blocking APK)
1. **EXPO_TOKEN** — user must run `! eas login` in Claude Code terminal
   OR generate token at expo.dev → Account Settings → Access Tokens
   Then run: `! cd dzaryx-native && eas build --platform android --profile preview --non-interactive`

### HIGH (functionality gaps)
2. Admin confirmation gate — isAdminAction flag exists but not hard-enforced in orchestrator
3. Backend health endpoint — verify /health route exists and responds
4. MOBILE_TOKEN_HOUARI in Railway env vars (Houari can't use app without this)

### MEDIUM (nice to have)
5. Spanish language normalizer entries
6. `/api/transcribe` endpoint — verify Groq Whisper works end-to-end
7. Socket.IO proactive notifications test

### USER MUST DO (requires their credentials)
- Railway: add MOBILE_TOKEN_HOUARI, TWILIO vars, GOOGLE_SERVICE_ACCOUNT_JSON
- Expo: eas login or EXPO_TOKEN
- Google Cloud Console: restrict Maps API key to Distance Matrix only

---

## ARCHITECTURE SNAPSHOT

```
Mobile (Expo SDK 54)              Backend (Railway)
  chat.tsx ──────────────────────── orchestrator.ts
    Socket.IO events                  ↓
    - Dzaryx:text_complete          engine-v2.ts (normalize+extract)
    - Dzaryx:audio_chunk              ↓
    - Dzaryx:status               buildContext() → Claude API
    - Dzaryx:proactive                ↓
                                  anti-hallucination (4 gates)
  lib/api.ts                          ↓
    sendMessage() → HTTP POST     tool-executor.ts → Supabase
    /api/transcribe → Groq            ↓
    /api/push-token               ElevenLabs TTS → audio chunks

PC (Nexus Python)                 Redis
  nexus.py ←──── Socket.IO /nexus   pending:action:{sessionId} (5min)
                                    mobile:expo_push_token
                                    nonce:{...} (anti-replay)
```

---

## HOW TO CONTINUE FROM HERE

1. Clone: `git clone https://github.com/kouider213/ibrahim.git`
2. Backend: `cd backend && npm install && npm run dev`
3. Native: `cd dzaryx-native && npm install && npx expo start`
4. APK: `cd dzaryx-native && eas login && eas build --platform android --profile preview`
5. Env vars needed: see CLAUDE.md in project root
