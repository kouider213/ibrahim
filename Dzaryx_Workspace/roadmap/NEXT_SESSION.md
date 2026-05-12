# Next Session Roadmap — reprise après 2026-05-11

**HEAD:** a4a8ea3  
**Backend:** https://ibrahim-backend-production.up.railway.app  
**Railway auto-deploy:** ✅ (push to main → live ~90s)  
**TypeScript:** 0 erreurs  

---

## État Réel P15 — Ce Qui Fonctionne

### FONCTIONNEL EN PRODUCTION ✅

1. **P15 Orchestrator Brain** — 8 modules wired, TypeScript clean
   - `processWithOrchestration` remplace `processMessage` dans chat.ts
   - `initOrchestratorEngine` lancé au startup dans index.ts

2. **Action Engine** — LIVE VERIFIED
   - `recordToolExecution` appelé après chaque `executeTool`
   - Écrit dans Redis `action:history:{sessionId}` (LPUSH + LTRIM 50 + EXPIRE 3600)
   - `channel` détecté: telegram/mobile_voice/mobile_text/unknown
   - `success` détecté correctement via `isToolFailureResult`

3. **Memory Engine** — LIVE VERIFIED
   - `remember_info` écrit dans `memory_facts` (moderne) ET `ibrahim_memory` (legacy)
   - `domain` mappé depuis `category` (preference, note, business, etc.)
   - `computeMemoryKey` = SHA256(normalize(content)+domain+userId)
   - Dédup via `unique_fact` constraint sur (user_id, domain, key)
   - Retour honnête: ✅/⚠️/❌ selon quelles écritures ont réussi

4. **Orchestrator API** — LIVE VERIFIED
   - `GET /api/orchestrator/actions/:sessionId` — lit Redis, retourne ActionRecord[]
   - `GET /api/orchestrator/health` — confirme version p15

5. **Tool Success Detection** — LIVE VERIFIED
   - Patterns couverts: Erreur / Error / Outil inconnu / Impossible / Échec / Failed / introuvable / not found
   - generate_reservation_voucher (UUID invalide) → success=false ✅
   - list_bookings → success=true ✅

6. **Redis content readable** — LIVE VERIFIED
   - `content` retiré de BINARY_ARG_KEYS
   - Nouveau: strings tronqués à 120 chars au lieu de [binary]
   - Proof: execute_code_task.task visible tronqué dans Redis

### CE QUI EST PARTIAL ⚠️

| Module | Problème | Effort Fix |
|--------|----------|-----------|
| Focus Manager | Dedup + rate limit non testés live | 10min — envoyer 2 messages identiques |
| Priority Engine | CRITICAL non testé live | 5min — envoyer "voiture volée" |
| Agent Router | CRITICAL scope non testé live | 5min — vérifier logs Railway |
| recallMemory | DB lisible ✅ mais tool pas appelé en session vide | Architectural — pas urgent |
| Semantic dedup | Phrasing différent → 2 rows malgré même fait | pgvector — effort majeur |
| Mobile /api/chat | Tool calls pas visibles en session fresh curl | App réelle OK, curl limite |

### CE QUI N'EST PAS COMMENCÉ 🔲

- WhatsApp Twilio (TWILIO_* non configurés)
- Siri Shortcut
- TikTok automatique
- `last_attempt_at` column migration pour reminders
- Création sites clients Netlify
- Context pruning (risque billing Anthropic)

---

## Architecture Actuelle

### Services Actifs en Prod
```
Railway (backend Node.js/TypeScript)
├── Express HTTP API (:3000)
├── Socket.IO (namespace /mobile + /desktop)
├── BullMQ workers (16 repeatable jobs)
├── Telegram webhook auto-registration
└── Redis/Upstash connection

Supabase (PostgreSQL)
├── cars, bookings, clients, profiles
├── payments, reviews
├── reminders (v2 schema)
├── memory_facts (moderne, SHA256 keyed)
├── ibrahim_memory (legacy, FIFO)
└── client_documents

Redis/Upstash
├── BullMQ queues
├── action:history:{sessionId} (P15)
├── focus:dedup:{hash} (P15)
├── focus:rate:{sessionId} (P15)
├── action:dedup:{session}:{tool}:{fp} (P15)
└── session:lastseen:{sessionId} (P15)
```

### Providers IA
| Provider | Usage | Priorité |
|----------|-------|---------|
| Anthropic Claude | Main LLM (processMessage) | P1 — core |
| ElevenLabs | TTS voice responses | P2 |
| Telegram Bot | Canal principal utilisateur | P1 — core |
| fal.ai | Image generation | P3 |
| Replicate | Image/video | P3 |
| Pexels | Stock photos | P4 |
| Cloudinary | Image storage/CDN | P3 |

---

## 🔥 PRIORITÉ MAJEURE — AI Provider Router + Survival Architecture

**Dzaryx ne doit plus dépendre d'Anthropic pour survivre.**

Voir détail complet: `roadmap/FULL_ROADMAP.md`

### Résumé
- Créer `backend/src/llm/` : ai-provider-router, provider-health, provider-cost-engine, provider-priority, provider-monitor
- Créer `backend/src/llm/providers/` : anthropic, gemini, groq, openrouter, ollama
- Routing: SIMPLE→Groq, NORMAL→Gemini, VISION→Gemini Vision, COMPLEX→Claude, LOCAL→Ollama
- Fallback automatique si provider down (invisible utilisateur)
- Endpoint `/api/health-ai` : status + coûts + quota + fallback actif
- Variables Railway à ajouter: GEMINI_API_KEY, GROQ_API_KEY, OPENROUTER_API_KEY

### Mini-Steps (dans l'ordre)
1. Interface `LLMProvider` + types Request/Response
2. Wrapper `anthropic-provider.ts` (claude-api.ts existant)
3. `gemini-provider.ts` (Gemini 1.5 Flash)
4. `groq-provider.ts` (llama3-8b-8192 gratuit)
5. `provider-health.ts` (ping 60s)
6. `ai-provider-router.ts` (routing + fallback chain)
7. Wirer dans `conversation/orchestrator.ts`
8. Endpoint `/api/health-ai`
9. TypeScript 0 erreurs → commit → deploy → verify

---

## Prochaines Mini-Étapes P15 (si Provider Router pas encore commencé)

### Option A — Vérification P15 Runtime (1-2h)
**Objectif:** confirmer que les 5 modules non testés fonctionnent en prod

1. Tester focus-manager:
   - Envoyer message identique 2× en <10s → vérifier log `FOCUS_BLOCK duplicate`
   - Via Railway logs (pas action:history)

2. Tester priority-engine:
   - Envoyer "ma voiture a été volée" → vérifier log `[p15:xxx] priority=CRITICAL(10)`
   - Via Railway logs

3. Tester agent-router CRITICAL:
   - Même message → vérifier `routing.reason="critical_emergency"`
   - Via Railway logs

4. Tester live remember_info avec nouveau code:
   - Envoyer via Telegram (pas curl) une info unique
   - Vérifier action:history montre `content` tronqué (pas [binary])
   - Vérifier memory_facts a key = SHA256 hash (pas texte brut)

### Option B — Live Test remember_info post-deploy (30min)
**Objectif:** prouver que computeMemoryKey produit hash comme DB key

1. Via Telegram, envoyer: "Retiens: ma couleur préférée est le bleu."
2. Vérifier memory_facts: key = SHA256 hash (64 chars hex)
3. Envoyer: "Retiens: ma couleur préférée c'est le bleu!"
4. Vérifier: 0 nouveau row (UPDATE, pas INSERT) → dedup prouvé live

### Option C — Context Pruning (risque billing)
**Objectif:** limiter les tokens envoyés à Claude API par message

Problème: `telegram_809747124` envoie historique complet à chaque message.
Fix: limiter `getConversationHistory` à N derniers messages (ex: 20).
Localisation: `conversation/orchestrator.ts` — paramètre `limit` dans getConversationHistory.

### Option D — last_attempt_at migration
**Objectif:** colonne manquante pour retry throttle des reminders

```sql
ALTER TABLE reminders ADD COLUMN last_attempt_at TIMESTAMPTZ;
```
Localisation: `supabase/migrations/` ou Supabase SQL Editor.

### Option E — WhatsApp Twilio
**Prérequis:** configurer TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_WHATSAPP_FROM dans Railway env.

---

## Comment Reprendre Demain

1. Lire ce fichier en premier
2. Lire `reports/P15_AUDIT_2026-05-11.md` pour les preuves runtime
3. Lire `deploy-history/P15_SESSION_2026-05-11.md` pour les commits
4. Vérifier HEAD: `git log --oneline -5`
5. Vérifier deploy: `curl https://ibrahim-backend-production.up.railway.app/api/orchestrator/health -H "Authorization: Bearer f6214183be37ad5e3c593590870077db247a4047c7de3cd72ae008e0f8d447d2"`
6. Choisir Option A/B/C/D/E et mini-step

---

## Règles Absolues (ne pas oublier)

- NEVER invent DB data, logs, or runtime status
- NEVER say "vérifié" without proof
- TypeScript strict — 0 erreurs avant tout commit
- commit + push après chaque étape
- Ne pas modifier les systèmes qui fonctionnent
- Toujours tester le TS avant push: `cd backend && npx tsc --noEmit`
- Token auth: `f6214183be37ad5e3c593590870077db247a4047c7de3cd72ae008e0f8d447d2`
- Telegram Chat ID: `809747124` → sessionId: `telegram_809747124`
- Supabase service key: voir `.env` à la racine du projet

---

## Problèmes Connus à Ne Pas Ignorer

### Billing Risk — Anthropic
Historique complet envoyé à chaque message. Pas de pruning. Coût augmente avec longueur session.
**Mitigation urgente:** limiter history à 20 derniers messages dans conversation/orchestrator.ts

### Double Call remember_info
Claude appelle parfois remember_info 2× par message avec phrasing légèrement différent.
SHA256 dédup couvre punctuation/case mais pas reformulation.
**Impact:** 2 rows identiques en substance dans memory_facts. Pas critique mais consomme tokens.

### Fresh Session Tool Gap
/api/chat avec session nouvelle → Claude répond sans appeler les tools.
Raison probable: pas de system context sans historique.
**Impact:** action:history vide pour nouvelles sessions. Telegram OK car historique existe.
