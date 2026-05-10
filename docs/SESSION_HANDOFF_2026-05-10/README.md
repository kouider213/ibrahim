# SESSION HANDOFF — 2026-05-10

**Repo:** kouider213/ibrahim  
**Branch:** main  
**HEAD:** `bab90ba`  
**Backend:** https://ibrahim-backend-production.up.railway.app  
**Mobile:** https://ibrahim-fik-conciergerie.netlify.app  
**Supabase project:** febrrgqpyqqrewcohomx  
**Railway auto-deploy:** ✅ active (push to main = deploy)

---

## 1. CHRONOLOGIE AUJOURD'HUI

### Audit initial (pas de code)
- Audit complet du système Dzaryx existant
- 3 bugs critiques identifiés dans le pipeline reminder avant tout codage

### Fix 1 — Double-send (commit `bab90ba`)
- `schedule_reminder` créait un job BullMQ custom-reminder + un row DB
- Worker polled DB toutes les 30s → trouvait le row PENDING → envoyait
- BullMQ tirait aussi au bon moment → envoyait aussi → **double Telegram**
- Fix: BullMQ custom-reminder retiré de `schedule_reminder`. Worker = seul path de livraison.
- BullMQ handler conservé comme fallback safe (vérifie lock Redis + statut DB avant d'envoyer)

### Fix 2 — Telegram failure invisible (commit `bab90ba`)
- `sendMessage()` avalait toutes les erreurs silencieusement → retournait `void`
- Worker croyait avoir envoyé → marquait SENT → mensonge
- Fix: `sendMessage` throw `TELEGRAM_SEND_FAILED` si les deux tentatives échouent
- Dedup-block retourne silencieusement (pas une erreur réelle)

### Fix 3 — Retry eligibility colonne incorrecte (commit `bab90ba`)
- `getRetryEligible()` filtrait `.lt('remind_at', retryAfter)` — utilisait `remind_at` comme proxy du dernier essai
- Pour rappels ayant échoué récemment (remind_at < 5min passé), condition FALSE → jamais retentés
- Fix: filtre retiré. Redis lock (5min TTL) gère déjà le throttle.

### Migration Supabase (manuelle par l'utilisateur)
- Exécutée dans Supabase SQL Editor project `febrrgqpyqqrewcohomx`
- Table `reminders` créée (était absente)
- Colonnes v2 ajoutées via `ALTER TABLE`
- Voir section 4 pour SQL exact

### Tests runtime complets
- Tous VERIFIED (voir section 10)

---

## 2. COMMITS EXACTS

```
bab90ba  fix(reminders): eliminate double-send, fix Telegram failure propagation, fix retry logic
43703fb  fix(p15-v2): Timezone orchestration complète — zero Algiers hardcode
c8b6059  fix(p15): Reminder Reliability — zéro faux rappel, persistance DB réelle
59a7dd1  feat(p14): Operator Dashboard — Jarvis/Nexus dark UI avec 7 modules
53bcf29  feat(p13): Business Intelligence Layer — 5 agents
```

---

## 3. FICHIERS MODIFIÉS (commit bab90ba)

| Fichier | Changement |
|---------|-----------|
| `backend/src/integrations/telegram.ts` | `sendMessage` throw sur échec (était silencieux) |
| `backend/src/db/reminders.ts` | `getRetryEligible` — retiré filtre remind_at incorrect |
| `backend/src/workers/reminder-worker.ts` | Lock key = `dedup_key ?? id` (partagé avec BullMQ path) |
| `backend/src/queue/scheduler.ts` | BullMQ custom-reminder handler: check lock + DB avant envoi |
| `backend/src/integrations/tool-executor.ts` | Retiré `schedulerQueue.add('custom-reminder')` de `schedule_reminder` |

### Fichiers créés dans les sessions précédentes (P15 v1+v2)
```
backend/src/db/reminders.ts                    — CRUD Supabase pour reminders
backend/src/db/reminders_migration.sql         — DDL table reminders v1
backend/src/db/reminders_migration_v2.sql      — ALTER TABLE colonnes timezone
backend/src/workers/reminder-worker.ts         — Worker polling 30s
backend/src/utils/timezone.ts                  — Resolver + DST + parseLocalHHMM
backend/src/api/routes/scheduler.ts            — Endpoints /api/scheduler/*
```

---

## 4. MIGRATIONS SUPABASE EXÉCUTÉES MANUELLEMENT

**Projet:** febrrgqpyqqrewcohomx  
**Date exécution:** 2026-05-10  
**Méthode:** Supabase SQL Editor

### SQL v1 (table principale)
```sql
CREATE TABLE IF NOT EXISTS reminders (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title             TEXT,
  message           TEXT        NOT NULL,
  remind_at         TIMESTAMPTZ NOT NULL,
  timezone          TEXT        NOT NULL DEFAULT 'Europe/Brussels',
  status            TEXT        NOT NULL DEFAULT 'PENDING'
                                CHECK (status IN ('PENDING','SENT','FAILED','CANCELLED','DUPLICATE')),
  sent_at           TIMESTAMPTZ,
  failed_reason     TEXT,
  retry_count       INTEGER     NOT NULL DEFAULT 0,
  created_by        TEXT,
  session_id        TEXT,
  telegram_target   TEXT,
  pushover_target   BOOLEAN     NOT NULL DEFAULT true,
  dedup_key         TEXT        UNIQUE,
  provider_response TEXT,
  job_id            TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS reminders_status_remind_at ON reminders(status, remind_at) WHERE status = 'PENDING';
CREATE INDEX IF NOT EXISTS reminders_dedup_key ON reminders(dedup_key) WHERE dedup_key IS NOT NULL;
ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;
```

### SQL v2 (colonnes timezone — exécuté séparément car table pré-existante)
```sql
ALTER TABLE reminders ADD COLUMN IF NOT EXISTS utc_offset      TEXT;
ALTER TABLE reminders ADD COLUMN IF NOT EXISTS local_time_iso  TEXT;
ALTER TABLE reminders ADD COLUMN IF NOT EXISTS timezone_source TEXT;
```

---

## 5. ÉTAT PRODUCTION RAILWAY (vérifié 2026-05-10T18:40Z)

```
HEAD déployé:     bab90ba
Status:           RUNNING
Node.js:          v22.22.2
Server TZ:        UTC (Railway default)
Redis ping:       8ms (Upstash, TLS)
BullMQ:           waiting=0 active=0 completed=5 failed=0 delayed=16 repeatable=16
Repeatable jobs:  16 cron jobs actifs (morning-briefing, BI, whatsapp, etc.)
```

**Variables Railway requises (toutes présentes):**
- `ANTHROPIC_API_KEY` ✅
- `SUPABASE_URL` / `SUPABASE_SERVICE_KEY` ✅
- `REDIS_URL` (Upstash rediss://) ✅
- `MOBILE_ACCESS_TOKEN` ✅
- `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` (809747124) ✅
- `ELEVENLABS_API_KEY` / `ELEVENLABS_VOICE_ID` ✅
- `PUSHOVER_USER_KEY` / `PUSHOVER_APP_TOKEN` ✅

---

## 6. ÉTAT DZARYX TELEGRAM (backend seulement)

- Canal actif: Telegram chat ID `809747124`
- Dzaryx répond aux messages via webhook Telegram
- Reminders envoyés sur ce canal
- Triggers actifs: "Nexus réveille-toi", "Nexus [commande]" → forward au PC agent
- **Dernière livraison confirmée:** `[RUNTIME-PROOF-001]` → `provider_response=telegram:809747124` ✅

---

## 7. ÉTAT APP MOBILE / DASHBOARD

- **Mobile PWA:** https://ibrahim-fik-conciergerie.netlify.app — RUNNING (Netlify)
- **Stack:** React + Vite
- **Auth:** Bearer token (`MOBILE_ACCESS_TOKEN`)
- **X-Timezone header:** envoyé par app → stocké Redis `user:tz:{sessionId}` → utilisé par reminder resolver
- **Dashboard:** interface Jarvis/Nexus dark UI avec 7 modules (P14)
- Pas de modifications côté mobile dans cette session

---

## 8. BUGS CRITIQUES CORRIGÉS (cette session)

### BUG 1 — Double-send ✅ FIXED
**Avant:** `schedule_reminder` créait BullMQ delayed job + DB row. Worker + BullMQ envoyaient tous les deux.  
**Après:** Worker seul envoie. BullMQ vérifie lock Redis partagé (`reminder:sending:{dedup_key}`) et statut DB avant tout envoi. Premier arrivé gagne, second skip.  
**Preuve runtime:** `retry_count=1` (1 seul envoi), `provider_response=telegram:809747124`

### BUG 2 — Telegram failure propagation ✅ FIXED
**Avant:** `sendMessage()` catch all errors → return void → worker marquait SENT même si Telegram échouait.  
**Après:** `sendMessage` throw `Error('TELEGRAM_SEND_FAILED: ...')` si les deux tentatives échouent.  
**Preuve runtime:** `failed_reason="TELEGRAM_SEND_FAILED: Request failed with status code 400"` dans DB

### BUG 3 — Retry eligibility ✅ FIXED
**Avant:** `getRetryEligible()` utilisait `.lt('remind_at', retryAfter)` — filtre incorrect bloquant les retries récents.  
**Après:** Filtre retiré. Redis lock 5min gère le throttle. `getRetryEligible` retourne tous FAILED avec retry_count < 3.  
**Preuve runtime:** Row FAILED retry_count=1 → SENT retry_count=2 après force-scan

---

## 9. BUGS / LIMITES RESTANTS (réels, vérifiés)

### PARTIAL — parseLocalHHMM DST edge
- `parseLocalHHMM("03:00", "Europe/Brussels")` lors de la nuit de passage heure d'été → offset calculé au moment actuel, pas au moment cible → erreur 1h
- Fréquence: 1 nuit/an (dernier dimanche de mars, ~02:00)
- Fix: recalculer l'offset à la date cible (nécessite itération)

### PARTIAL — Worker fires up to 90s early
- Lookahead de 90s: rappel "18:00" peut partir à 17:58:30
- By design, acceptable pour reminders. Pas acceptable si précision à la seconde requise.

### PARTIAL — Pas de colonne `last_attempt_at`
- Retry throttle basé sur Redis lock TTL 5min
- Si Redis restart (Upstash est persistant, risque quasi-nul) → retry immédiat possible
- Fix propre: ajouter colonne `last_attempt_at` + migration SQL

### PARTIAL — Anti-hallucination tool path non testable via REST
- `schedule_reminder` appelé uniquement via pipeline conversationnel Claude
- Pas d'endpoint direct. Code vérifié correct. `TIMEZONE_UNKNOWN` confirmé par diagnostic.
- Pas de preuve HTTP live du path tool executor.

### NOT STARTED — Orchestrateur P15
```
orchestrator/
  orchestrator-engine.ts    — NOT CREATED
  priority-engine.ts        — NOT CREATED
  memory-engine.ts          — NOT CREATED
  action-engine.ts          — NOT CREATED
  context-engine.ts         — NOT CREATED
  anti-hallucination.ts     — NOT CREATED
  agent-router.ts           — NOT CREATED
  focus-manager.ts          — NOT CREATED
```

---

## 10. TESTS RUNTIME (preuves 2026-05-10T18:40Z)

### DB Insert Proof
```json
{
  "db_id": "af615552-dd89-4a96-80ca-180a91315cb0",
  "status": "SENT",
  "timezone_used": "Europe/Brussels",
  "timezone_source": "fallback",
  "utc_offset": "+02:00",
  "provider_response": "telegram:809747124",
  "retry_count": 1
}
```

### Dedup Proof
```
HTTP 409
"duplicate key value violates unique constraint \"reminders_dedup_key_key\""
```
Triple-layer: Redis 5min → `findByDedupKey()` → DB UNIQUE constraint

### FAILED Propagation Proof
```json
{
  "id": "a3221901-93fe-402d-8aea-bf9f0dab082f",
  "telegram_target": "-1",
  "status": "FAILED",
  "retry_count": 1,
  "failed_reason": "TELEGRAM_SEND_FAILED: Request failed with status code 400"
}
```

### Retry Proof
```json
{
  "id": "5dd762e2-6600-41b6-87b6-11a13730312b",
  "before": { "status": "FAILED", "retry_count": 1 },
  "after":  { "status": "SENT",   "retry_count": 2 },
  "telegram_target": "809747124"
}
```

### Timezone Chain Proof
```json
{
  "resolved": { "timezone": "Europe/Brussels", "source": "fallback", "valid": true },
  "belgium_summer": { "utc_offset": "+02:00", "is_dst": true },
  "belgium_winter": { "utc_offset": "+01:00", "is_dst": false },
  "algeria_year_round": { "utc_offset": "+01:00", "is_dst": false },
  "anti_hardcode_check": { "algiers_hardcoded": false }
}
```

### BullMQ Proof
```json
{
  "queue": "Dzaryx-scheduler",
  "waiting": 0, "active": 0, "completed": 5,
  "failed": 0, "delayed": 16, "repeatable": 16,
  "redis_ping_ms": 8
}
```

---

## 11. ENDPOINTS DISPONIBLES

Tous nécessitent: `Authorization: Bearer {MOBILE_ACCESS_TOKEN}`

| Endpoint | Méthode | Description |
|----------|---------|-------------|
| `/api/scheduler/status` | GET | BullMQ health + Redis ping |
| `/api/scheduler/reminders` | GET | Liste reminders DB récents |
| `/api/scheduler/reminder-test` | POST | Crée reminder réel + BullMQ + preuve |
| `/api/scheduler/reminder-scan` | POST | Force scan worker maintenant |
| `/api/scheduler/reminder-audit` | GET | Snapshot pending + retry eligible |
| `/api/scheduler/timezone-test` | GET | Diagnostic timezone complet |
| `/api/scheduler/test-telegram` | POST | Envoie message Telegram via BullMQ |
| `/api/scheduler/memory-test` | GET | Vérifie memory engine + Telegram |
| `/api/scheduler/proactive-test` | GET | Run proactive engine maintenant |
| `/api/scheduler/jobs` | GET | Liste repeatable jobs avec next fire |
| `/api/scheduler/trigger/:name` | POST | Déclenche job cron manuellement |

---

## 12. VERIFIED / PARTIAL / BROKEN

### VERIFIED ✅
- Supabase connection (service_role)
- Redis / Upstash (8ms ping)
- BullMQ worker alive (0 failed)
- Telegram send (real delivery proof)
- DB insert reminders (table existe, colonnes v2 présentes)
- Dedup triple-layer (Redis + DB query + UNIQUE constraint)
- Worker = single delivery path (double-send éliminé)
- Telegram throws on failure (FAILED propagation exacte)
- Retry from FAILED (retry_count incrémenté, status=SENT)
- Timezone fallback chain (explicit→session→global→Brussels)
- DST Brussels correct (UTC+2 été, UTC+1 hiver)
- Algiers UTC+1 year-round, no DST
- Africa/Algiers jamais hardcodé
- TypeScript strict (0 erreurs)
- Railway auto-deploy (push → prod en ~90s)

### PARTIAL ⚠️
- parseLocalHHMM DST edge (1 nuit/an, fix connu)
- Anti-hallucination tool path (code correct, pas de preuve HTTP live)
- Retry throttle sans `last_attempt_at` (fonctionne via Redis, mais fragile)

### NOT STARTED 🔲
- Orchestrateur P15 (8 fichiers à créer)
- WhatsApp Twilio (TWILIO_* env non configurés)
- Siri Shortcut
- TikTok automatique
- Création sites clients Netlify

### BROKEN ❌
- Aucun système actuellement cassé

---

## 13. PROCHAINE ÉTAPE RECOMMANDÉE

**Implémenter l'orchestrateur P15.** Tous les prérequis sont VERIFIED.

Ordre suggéré:
1. `orchestrator/anti-hallucination.ts` — moteur central de validation
2. `orchestrator/memory-engine.ts` — fusion mémoire long/court terme
3. `orchestrator/action-engine.ts` — confirmation runtime pour chaque action
4. `orchestrator/priority-engine.ts` — scoring priorité tâches
5. `orchestrator/context-engine.ts` — fusion contexte multi-canal
6. `orchestrator/agent-router.ts` — routing Telegram/mobile/NEXUS
7. `orchestrator/focus-manager.ts` — anti-spam, anti-doublon
8. `orchestrator/orchestrator-engine.ts` — assembleur principal

Avant d'attaquer P15, corriger optionnellement:
- `parseLocalHHMM` DST edge (petit fix dans `timezone.ts`)
- Ajouter colonne `last_attempt_at` + migration SQL

---

## 14. PROMPT EXACT POUR LE PROCHAIN CLAUDE CODE

```
PROJECT HANDOFF — DZARYX CORE SYSTEM — suite session 2026-05-10

Repo: kouider213/ibrahim (git clone ou déjà présent localement)
Répertoire de travail: ibrahim/ (sous-dossier du repo)
HEAD actuel: bab90ba

Stack: Node.js / TypeScript strict / Express / Railway / Supabase / Redis (Upstash) / BullMQ

URLs production:
- Backend: https://ibrahim-backend-production.up.railway.app
- Mobile: https://ibrahim-fik-conciergerie.netlify.app
- Supabase: febrrgqpyqqrewcohomx

ÉTAT AU MOMENT DE CETTE REPRISE:
- Bugs critiques reminders: TOUS CORRIGÉS (commit bab90ba)
- Table reminders: EXISTE dans Supabase avec colonnes v2
- Worker reminder: seul path de livraison (BullMQ = fallback safe)
- Telegram throw: actif sur échec
- Retry eligibility: filtre incorrect retiré
- Tests runtime: TOUS VERIFIED

HANDOFF COMPLET: docs/SESSION_HANDOFF_2026-05-10/README.md

PROCHAINE TÂCHE: Implémenter l'orchestrateur P15.

RÈGLES ABSOLUES (ne pas modifier):
- NEVER invent DB data, Telegram sends, logs, or runtime status
- If action fails: return FAILURE explicitly (DB_FAILED / JOB_NOT_CREATED / TELEGRAM_SEND_FAILED)
- NEVER say "programmé" if DB insert + proof don't exist
- TypeScript strict — zero compilation errors before commit
- commit + push après chaque étape

COMMENCER PAR: lire docs/SESSION_HANDOFF_2026-05-10/README.md puis auditer
backend/src/ avant tout code. Créer orchestrator/ dans backend/src/.
```
