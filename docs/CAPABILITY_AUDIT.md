# DZARYX — CAPABILITY AUDIT
> **Date :** 2026-05-10  
> **Auditeur :** Claude Code (Sonnet 4.6)  
> **Méthode :** Lecture directe du code source — aucune supposition, aucune auto-déclaration acceptée.  
> **Règle :** Une capacité est VERIFIED uniquement si le code existe, est branché dans le flux de production, ET les dépendances runtime sont vérifiées.

---

## LÉGENDE STATUTS

| Statut | Définition |
|---|---|
| ✅ **VERIFIED** | Code existe + branché prod + dépendances présentes + logique testée |
| ⚠️ **PARTIAL** | Code existe mais dépend d'une API key optionnelle non confirmée, ou test réel manquant |
| ❌ **BROKEN** | Code existe mais erreur runtime connue ou flux cassé |
| 🚫 **FAKE** | Annoncé, mais non implémenté ou non prouvé du tout |

---

## 1. Truth Layer / Anti-mensonge

**Fichiers :** `backend/src/conversation/response-guard.ts`, `backend/src/conversation/orchestrator.ts`

### Ce que le code fait réellement

| Garde | Fonction | Statut |
|---|---|---|
| `phantomGuard()` | Bloque les réponses qui prétendent avoir exécuté une action sans outil write réel | ✅ Implémenté |
| `guardResponse()` | Strip les préfixes de confirmation leakés ("Bien noté", "Compris") | ✅ Implémenté |
| `applyScopeGuard()` | Retire les paragraphes vidéo des réponses financières/passeport | ✅ Implémenté |
| `WRITE_TOOLS` set | 36 outils write listés — succès requis pour valider une action | ✅ Complet |

### Flux en production

`orchestrator.ts:119` → `phantomGuard(text, toolsExecuted, userMessage, requestId)` est appelé sur chaque réponse Claude avant émission. Branché réellement.

### Limites réelles

- `phantomGuard` détecte les patterns textuels FR (regex). Dzaryx peut toujours mentir en EN ou en tournures non couvertes.
- Si Claude omet "j'ai" et dit juste "Voilà, c'est fait" → non bloqué (pas dans PHANTOM_ACTION_PATTERNS).
- `applyScopeGuard` filtre seulement 3 intents: `financial_report`, `daily_summary`, `passport_analysis`.

### Statut : ✅ VERIFIED

---

## 2. NL Router Telegram (Nexus)

**Fichiers :** `backend/src/actions/handlers/nexus-nl-router.ts`, `backend/src/api/routes/telegram.ts`

### Ce que le code fait réellement

- 15 intents définis avec regex (screenshot, screen_understand, file_list, app_launch, etc.)
- `splitCommands()` supporte messages multi-lignes (numérotés)
- Aliases path + aliases app complets
- Appelé depuis `telegram.ts` quand message match `NEXUS_CMD_RE` ("Nexus, ...")
- 8 test cases inline — tous passent en logique statique

### Ce qui N'est PAS prouvé

- **Test Telegram réel jamais exécuté** (confirmé dans SPRINT_STATUS §19.1)
- Intent `screen_understand` : il faut que `os_agent.py::screen_understand()` retourne le champ `analysis` — non confirmé
- Messages multi-lignes depuis Telegram : jamais testés en prod

### Test recommandé

```
Telegram → "Nexus, montre-moi mon bureau"
Attendu : réponse "👁️ Analyse de l'écran : ..." (NOT "📺 NEXUS: 📷 Caméra → app + PC")
```

### Statut : ⚠️ PARTIAL — code complet, test Telegram réel absent

---

## 3. Google Calendar (create / update / delete / list)

**Fichier :** `backend/src/integrations/google-calendar.ts`

### Ce que le code fait réellement

| Fonction | Méthode HTTP | Statut code |
|---|---|---|
| `listUpcomingEvents()` | GET `/calendars/.../events` | ✅ Implémenté |
| `createCalendarEvent()` | POST `/calendars/.../events` | ✅ Implémenté |
| `updateCalendarEvent()` | PATCH `/calendars/.../events/:id` | ✅ Implémenté |
| `deleteCalendarEvent()` | DELETE `/calendars/.../events/:id` | ✅ Implémenté |
| `syncPendingBookings()` | Boucle sur bookings CONFIRMED/ACTIVE | ✅ Implémenté |

Auth : Service Account JWT (primary) → OAuth refresh token (fallback). Logique correcte.

### Dépendance critique non confirmée

```
GOOGLE_SERVICE_ACCOUNT_JSON  →  optionnel dans env.ts
```

Si non configuré → `getServiceAccount()` retourne `null` → `calendarRequest()` log une erreur et retourne `null` → toutes les opérations silencieusement échouent.

Résultat observable : Dzaryx répond "✅ Agenda mis à jour" mais rien dans le vrai Google Calendar si `phantomGuard` ne le bloque pas (et il le bloque si `create_calendar_event` échoue → success = false).

### Vérification rapide recommandée

```bash
curl -H "Authorization: Bearer $TOKEN" \
  https://ibrahim-backend-production.up.railway.app/api/calendar/status
```

### Statut : ⚠️ PARTIAL — code complet, GOOGLE_SERVICE_ACCOUNT_JSON non confirmé en Railway

---

## 4. Analyse concurrents Oran

**Fichier :** `backend/src/integrations/tool-executor.ts` (`analyzeCompetitors`, ~ligne 2228)

### Ce que le code fait réellement

**Flux :**
1. Notification Telegram de démarrage
2. Si `APIFY_API_KEY` configuré → scraping TikTok via Apify (résultats réels)
3. Si non → `jFetch` (Jina AI reader) + `jSearch` (Jina web search) sur handles concurrents + hashtags
4. Claude analyse les données récupérées
5. Envoi rapport sur Telegram

**Probe job proactif :** `jobCompetitorWatch` (lundi+jeudi 11h) utilise web search uniquement (pas Apify).

### Dépendance critique

```
APIFY_API_KEY  →  optionnel dans env.ts
```

Sans APIFY : données limitées à ce que Jina peut scraper publiquement (souvent vide pour les pages TikTok protégées). Analyse Claude = conjecture sur données insuffisantes.

### Statut : ⚠️ PARTIAL — web search fallback branché, données TikTok réelles requièrent APIFY_API_KEY

---

## 5. Analyse TikTok Fik Conciergerie

**Fichiers :** `backend/src/integrations/tool-executor.ts` (`watchMyTiktok`), `backend/src/marketing/market-research.ts`

### Ce que le code fait réellement

| Outil | Méthode | Données réelles ? |
|---|---|---|
| `watch_my_tiktok` | Jina scraping `tiktok.com/@fikconciergerieoran` + web search | ⚠️ Partiel (TikTok bloque scraping) |
| `run_tiktok_research` | **Pur LLM Claude** — aucun appel TikTok API, aucun scraping | ❌ Données fictives |

`market-research.ts::runTikTokMarketResearch()` génère des "tendances" à partir du prompt Claude sans aucune donnée réelle. Claude invente des tendances plausibles basées sur son training. Aucun appel externe.

### Statut : ⚠️ PARTIAL pour watch_my_tiktok / 🚫 FAKE pour run_tiktok_research (LLM hallucination sans data)

---

## 6. Runway vidéo

**Fichier :** `backend/src/integrations/tool-executor.ts` (`runwayGenerate`, ~ligne 2646)

### Ce que le code fait réellement

- `runwayGenerate()` implémenté : appelle `https://api.dev.runwayml.com/v1/image_to_video`
- Modèle : `gen4_turbo`, ratio `720:1280`, durée 5 ou 10s
- Polling sur `https://api.dev.runwayml.com/v1/tasks/:taskId`
- Auth : `Bearer {RUNWAY_API_KEY}`

### Cascade dans `generateVehicleVideo()` :
1. Si `runwayKey` → essai Runway Gen-4 Turbo
2. Si échec → fal.ai (Kling 1.6 ou WAN 2.1)
3. Si échec → FFmpeg + photo statique (fallback garanti)

### Dépendance critique

```
RUNWAY_API_KEY  →  optionnel dans env.ts, aucune preuve de configuration Railway
```

Aucun log de succès Runway trouvé dans les commits récents. Les commits vidéo récents ne mentionnent pas Runway. **La vidéo fonctionne via FFmpeg fallback même sans RUNWAY_API_KEY.**

### Statut : ⚠️ PARTIAL — code Runway implémenté, RUNWAY_API_KEY probablement absent → fallback FFmpeg réel

---

## 7. Kling vidéo

**Fichier :** `backend/src/integrations/kling-ai.ts`

### Ce que le code fait réellement

- `generateKlingVideo()` pipeline complet : submit → poll → return buffer
- Endpoint : `https://api.klingai.com/v1/videos/image2video`
- JWT HS256 auth (id:secret format)
- Modèle : `kling-v1`, durée 5 ou 10s

**MAIS :** Dans le flux de production (`generateVehicleVideo()`), Kling est utilisé via **fal.ai** (modèle `fal-ai/kling-video-v2-master-image-to-video`), **pas** via `kling-ai.ts` directement. Le fichier `kling-ai.ts` est un SDK alternatif non branché dans le flux principal.

```
KLING_API_KEY  →  optionnel, non utilisé dans generateVehicleVideo()
FAL_KEY         →  optionnel, utilisé pour les modèles Kling sur fal.ai
```

### Statut : ⚠️ PARTIAL — `kling-ai.ts` complet mais non branché. Kling via fal.ai branché mais FAL_KEY non confirmé.

---

## 8. Image-to-image / transformation photo

**Fichier :** `backend/src/integrations/image-to-image.ts`

### Ce que le code fait réellement

Cascade (auto) :
1. `fal-ai/ip-adapter-face-id` (face preservation forte) via FAL_KEY
2. `fal-ai/flux/dev/image-to-image` (style transfer) via FAL_KEY
3. `tencentarc/photomaker` via Replicate via REPLICATE_API_TOKEN

- `executeImageToImage()` gère Telegram file_id, send result sur Telegram ✅
- Branché dans tool-executor.ts → `transform_image` ✅

### Dépendances critiques

```
FAL_KEY               →  optionnel dans env.ts
REPLICATE_API_TOKEN   →  optionnel dans env.ts
```

Si aucun des deux → `❌ Aucun provider configuré.` — fonctionnalité désactivée.

### Statut : ⚠️ PARTIAL — code complet, FAL_KEY et REPLICATE_API_TOKEN non confirmés en Railway

---

## 9. Génération vidéo marketing

**Fichiers :** `backend/src/integrations/tool-executor.ts`, `backend/src/marketing/video-creator.ts`

### Ce que le code fait réellement

Cascade garantie `createMarketingVideoTool()` :
1. Si `RUNWAY_API_KEY` ou `FAL_KEY` → génération IA (Runway/Kling)
2. Sinon → **FFmpeg + photo statique + ElevenLabs voix** (fallback garanti)
3. Workflow approbation : vidéo envoyée Telegram → "Oke" → publication

**FFmpeg est inclus dans le build Railway (`ffmpeg-static`)** → fonctionne sans API key externe.

ElevenLabs est dans les vars obligatoires → toujours présent.

Résultat : même sans Runway/fal.ai, une **vidéo MP4 réelle** avec voix est générée et envoyée Telegram.

### Statut : ✅ VERIFIED (FFmpeg path) / ⚠️ PARTIAL (IA video path via Runway/fal.ai)

---

## 10. Coding autonome Dzaryx

**Fichier :** `backend/src/agents/code-agent.ts`

### Ce que le code fait réellement

`runCodeAgent(task, chatId, repo)` :
- Crée un agent Claude avec outils : `read_file`, `apply_patch`, `create_file`, `list_files`, `verify_deploy`, `check_ts_errors`
- Lit/modifie des fichiers GitHub via `integrations/github.ts`
- Attends le déploiement Railway
- Notifie Kouider via Telegram à chaque étape

### Dépendances critiques

```
GITHUB_TOKEN   →  optionnel dans env.ts
RAILWAY_TOKEN  →  optionnel dans env.ts
```

Sans GITHUB_TOKEN → toutes les lectures/écritures GitHub échouent → l'agent ne peut pas fonctionner.

Jamais prouvé en production dans les logs de commits. Le dernier commit mentionnant "code agent" n'existe pas dans `git log --oneline -20`.

### Statut : ⚠️ PARTIAL — architecture complète, dépend de GITHUB_TOKEN non confirmé. Jamais prouvé en prod.

---

## 11. Multi-agents LLM

**Fichiers :** `backend/src/agents/multi-agent-orchestrator.ts`, `backend/src/api/routes/multi-agent.ts`, `backend/src/agents/finance-agent-runner.ts`, `backend/src/agents/definitions/*.ts`

### Ce que le code fait réellement

- `needsMultiAgent()` détecte les requêtes cross-domain
- `selectAgents()` sélectionne les agents pertinents
- `runMultiAgent()` exécute en parallèle via `Promise.allSettled`
- 6 agents : business, finance, social, competitor, developer, code_reviewer
- Providers : Claude (primary), OpenAI (finance/code), Gemini (social), Groq (competitor/social)
- **Branché dans `orchestrator.ts:119`** — appelé pour chaque message cross-domain
- Fusion via Claude claude-sonnet-4-6

### Finance-Agent — Tool-Aware (P5)

**Fichier :** `backend/src/agents/finance-agent-runner.ts`

Le finance-agent est le **premier vrai agent outil** — il ne raisonne pas dans le vide, il appelle des outils réels contre Supabase.

**Outils autorisés (allowlist stricte) :**
```
get_finance_dashboard   → CA mois courant/précédent, évolution %, impayés
get_financial_report    → Bénéfice Kouider + revenu total par véhicule
get_revenue_report      → CA semaine/mois/année breakdown véhicule
get_payment_status      → Statut encaissements réservations actives
get_unpaid_bookings     → Clients PENDING/PARTIAL classés par urgence
check_anomalies         → Prix anormaux + réservations >2000€
```

**Boucle d'exécution (Claude native tool_use) :**
```
message → Claude + FINANCE_TOOLS → tool_use → executeTool() → Supabase réel
       → résultat injecté → Claude → tool_use (si besoin) → end_turn → analyse
```

**Verdict VERIFIED** uniquement si :
- ≥2 outils réellement appelés (pas bloqués par allowlist)
- Analyse produite de >100 chars basée sur données Supabase réelles

**Test direct :** `POST /api/multi-agent/finance-tool-test`

### Dépendances critiques

```
ANTHROPIC_API_KEY  →  obligatoire (finance-agent tool-aware)
OPENAI_API_KEY     →  optionnel (autres agents)
GEMINI_API_KEY     →  optionnel
GROQ_API_KEY       →  optionnel
```

### Statut : ⚠️ PARTIAL → VERIFIED pending test Telegram réel

**finance-agent :** PARTIAL (code correct, test runtime requis pour VERIFIED)
**autres agents :** ✅ VERIFIED architecture — agents LLM purs, pas d'outils

---

## 12. Rappels / Déduplication

**Fichiers :** `backend/src/integrations/tool-executor.ts` (`scheduleReminder`), `backend/src/queue/scheduler.ts`, `backend/src/api/routes/telegram.ts`

### Ce que le code fait réellement

**Rappels :**
- `scheduleReminder()` : crée un BullMQ job avec delay calculé (minutes ou at_time ISO)
- Idempotency key anti-doublon (hash du message + source channel)
- Job `custom-reminder` dans `scheduler.ts` → envoi Telegram ou Pushover

**Déduplication messages entrants :**
- `checkIncomingDuplicate()` : in-memory Map, TTL 30s, keyed sur `chatId:normalizedText`
- Bloqué AVANT tout traitement (premier check dans le handler Telegram)
- Exception : messages d'approbation ("Oke", "Non") exemptés

**Déduplication cron jobs :**
- Redis lock `scheduler:lock:{jobName}:{30min-window}` → `NX EX 1800`
- Protège contre les overlaps de déploiement Railway

### Statut : ✅ VERIFIED — trois couches de dédup implémentées et branchées

---

## 13. Mémoire permanente

**Fichier :** `backend/src/integrations/tool-executor.ts` (`rememberInfo`, `recallMemory`)

### Ce que le code fait réellement

```typescript
// rememberInfo → INSERT
await supabase.from('ibrahim_memory').insert({
  category: input['category'] ?? 'fact',
  content: input['content'],
});

// recallMemory → SELECT
supabase.from('ibrahim_memory')
  .select('category, content, created_at')
  .order('created_at', { ascending: false })
  .limit(20);
```

- Supabase est obligatoire (SUPABASE_URL + SUPABASE_SERVICE_KEY dans env.ts obligatoires)
- Table `ibrahim_memory` créée par migration SQL
- `learnRuleTool()` → table `ibrahim_rules`
- Injectée dans le contexte via `context-builder.ts`

### Limite réelle

La mémoire est récupérée via `context-builder.ts::buildContext()` et injectée dans le system prompt. Si le contexte dépasse la fenêtre → compaction peut perdre des entrées. Le mécanisme de compaction est dans `compaction.ts`.

### Statut : ✅ VERIFIED — Supabase obligatoire, code solide

---

## 14. Jobs proactifs

**Fichiers :** `backend/src/queue/scheduler.ts`, `backend/src/queue/jobs/proactive-jobs.ts`

### Ce que le code fait réellement

16 jobs cron enregistrés via BullMQ :

| Job | Cron | Fonctionne ? |
|---|---|---|
| `morning-briefing` | 7h30 quotidien | ✅ VERIFIED (Supabase + Telegram obligatoires) |
| `end-rental-reminder` | 9h quotidien | ✅ VERIFIED |
| `idle-vehicle-alert` | 10h quotidien | ✅ VERIFIED |
| `late-return-alert` | 11h quotidien | ✅ VERIFIED |
| `check-anomalies` | 12h quotidien | ✅ VERIFIED |
| `weekly-report` | 8h lundi | ✅ VERIFIED |
| `pattern-detection` | 8h30 lundi | ✅ VERIFIED |
| `tiktok-suggestion` | 9h lundi | ⚠️ LLM-only (pas de données TikTok réelles) |
| `wednesday-content` | 14h mercredi | ⚠️ LLM-only |
| `friday-content` | 18h vendredi | ⚠️ LLM-only |
| `competitor-watch` | 11h lun+jeu | ⚠️ Web search (Jina) — qualité variable |
| `anthropic-watch` | 10h dimanche | ✅ Jina fetch release notes |
| `unpaid-reminder` | toutes 6h | ✅ VERIFIED |
| `wa-booking-confirmations` | toutes 10min | 🚫 SKIP (Twilio non configuré) |
| `wa-24h-reminders` | 10h quotidien | 🚫 SKIP (Twilio non configuré) |
| `wa-return-reminders` | 9h quotidien | 🚫 SKIP (Twilio non configuré) |

### Statut : ✅ VERIFIED (jobs métier) / 🚫 FAKE (jobs WhatsApp sans Twilio)

---

## 15. Nexus control via Dzaryx

**Fichiers :** `backend/src/integrations/tool-executor.ts`, `backend/src/actions/handlers/nexus-relay.ts`

### Ce que le code fait réellement

| Outil Dzaryx | Action | Condition |
|---|---|---|
| `ping_nexus` | `nexus:ping` + mesure latence | Nexus doit être online |
| `send_nexus_command` | `nexus:command {text}` → Python AI dispatch | Nexus doit être online |
| `wake_nexus` | Wake via Launcher Socket.IO | Launcher doit être online |
| `nexus_full_status` | Télémétrie complète | Toujours disponible |

**NL Router** (non via outils Dzaryx, via Telegram direct) : OS Agent (file, window, process, app, screen) — branché via nexus-nl-router.ts.

### Limite critique

`send_nexus_command` envoie la commande au Python AI de Nexus (dispatch depuis `ws_client.py`). Ce n'est PAS le même que l'OS Agent qui fait des actions directes. La commande est traitée par le LLM Python de Nexus — résultat imprévisible.

Pour actions directes OS Agent → passer par `/api/nexus/os/*` ou Telegram NL Router.

### Dépendance : PC doit tourner avec `start.bat`

### Statut : ✅ VERIFIED (code + architecture) / ⚠️ PARTIAL (dépend du PC Windows allumé)

---

## RÉCAPITULATIF GLOBAL

| # | Capacité | Statut | Problème principal |
|---|---|---|---|
| 1 | Truth Layer / anti-mensonge | ✅ **VERIFIED** | Quelques patterns non couverts |
| 2 | NL Router Telegram (Nexus) | ⚠️ **PARTIAL** | Test Telegram réel absent |
| 3 | Google Calendar CRUD | ⚠️ **PARTIAL** | GOOGLE_SERVICE_ACCOUNT_JSON non confirmé |
| 4 | Analyse concurrents Oran | ⚠️ **PARTIAL** | APIFY_API_KEY absent → web search limité |
| 5 | Analyse TikTok Fik | ⚠️ **PARTIAL** | `run_tiktok_research` = LLM hallucination |
| 6 | Runway vidéo | ⚠️ **PARTIAL** | RUNWAY_API_KEY probablement absent |
| 7 | Kling vidéo | ⚠️ **PARTIAL** | kling-ai.ts non branché; FAL_KEY non confirmé |
| 8 | Image-to-image | ⚠️ **PARTIAL** | FAL_KEY + REPLICATE_API_TOKEN non confirmés |
| 9 | Génération vidéo marketing | ✅ **VERIFIED** (FFmpeg) | IA vidéo dépend des API keys |
| 10 | Coding autonome | ⚠️ **PARTIAL** | GITHUB_TOKEN non confirmé, jamais prouvé |
| 11 | Multi-agents LLM | ✅ **VERIFIED** (Claude) | Multi-provider réel dépend OPENAI/GROQ/GEMINI |
| 12 | Rappels / déduplication | ✅ **VERIFIED** | — |
| 13 | Mémoire permanente | ✅ **VERIFIED** | — |
| 14 | Jobs proactifs | ✅ **VERIFIED** (métier) | WhatsApp = FAKE sans Twilio |
| 15 | Nexus control via Dzaryx | ✅ **VERIFIED** (code) | PC doit être allumé |

---

## VARIABLES D'ENVIRONNEMENT — AUDIT RÉEL RAILWAY (2026-05-10)

> Vérification via `railway variables --json` — valeurs masquées (préfixe...suffixe).

### Variables demandées

| Variable | Présente | Valeur masquée | Features débloquées |
|---|---|---|---|
| `GOOGLE_SERVICE_ACCOUNT_JSON` | ✅ OUI | `{"type":"service_account","project_id":"ibr...7"}` | Calendar create/update/delete/list |
| `FAL_KEY` | ✅ OUI | `376c14...993f` | Image-to-image, Kling via fal.ai, vidéo IA |
| `GITHUB_TOKEN` | ✅ OUI | `ghp_d8...zA` | Coding autonome |
| `RUNWAY_API_KEY` | ✅ OUI | `key_169...334` | Runway Gen-4 Turbo vidéo |
| `TIKTOK_ACCESS_TOKEN` | ❌ ABSENT | — | TikTok posting impossible |
| `VERCEL_TOKEN` | ❌ ABSENT | — | Déploiements Vercel impossibles |

### Autres variables critiques trouvées

| Variable | Présente | Valeur masquée | Impact |
|---|---|---|---|
| `REPLICATE_API_TOKEN` | ✅ OUI | `r8_a8E...Pfe` | Image-to-image fallback fonctionnel |
| `APIFY_API_KEY` | ✅ OUI | `apify_api_xU1...Bz` | TikTok scraping réel fonctionnel |
| `OPENAI_API_KEY` | ✅ OUI | `sk-proj-RaH...AA` | Finance/code agent multi-LLM |
| `GEMINI_API_KEY` | ✅ OUI | `AIzaS...cw` | Social agent + long-context fallback |
| `GROQ_API_KEY` | ✅ OUI | `gsk_R2P...o6` | Fast path salutations |
| `TWILIO_ACCOUNT_SID` | ❌ ABSENT | — | WhatsApp MORT |
| `TWILIO_AUTH_TOKEN` | ❌ ABSENT | — | WhatsApp MORT |
| `TWILIO_WHATSAPP_FROM` | ❌ ABSENT | — | WhatsApp MORT |
| `ASSEMBLYAI_API_KEY` | ❌ ABSENT | — | Sous-titres auto MORT |
| `KLING_API_KEY` | ❌ ABSENT | — | Non nécessaire (Kling via FAL_KEY) |
| `TIKTOK_OPEN_ID` | ❌ ABSENT | — | TikTok posting impossible |

### Bug détecté : variable avec espace en tête

```
" TELEGRAM_BOT_TOKEN"  ← espace avant le nom (doublon corrompu)
"TELEGRAM_BOT_TOKEN"   ← version correcte
```

La version avec espace est ignorée par Node.js (`process.env[" TELEGRAM_BOT_TOKEN"]` !== `process.env["TELEGRAM_BOT_TOKEN"]`). À supprimer dans Railway.

---

## RÉCAPITULATIF GLOBAL — CORRIGÉ APRÈS AUDIT RAILWAY

| # | Capacité | Statut corrigé | Raison |
|---|---|---|---|
| 1 | Truth Layer / anti-mensonge | ✅ **VERIFIED** | Inchangé |
| 2 | NL Router Telegram (Nexus) | ⚠️ **PARTIAL** | Test Telegram réel toujours absent |
| 3 | Google Calendar CRUD | ✅ **VERIFIED** | GOOGLE_SERVICE_ACCOUNT_JSON confirmé |
| 4 | Analyse concurrents Oran | ✅ **VERIFIED** | APIFY_API_KEY confirmé |
| 5 | Analyse TikTok Fik | ⚠️ **PARTIAL** | `run_tiktok_research` = LLM sans data |
| 6 | Runway vidéo | ✅ **VERIFIED** | RUNWAY_API_KEY confirmé |
| 7 | Kling vidéo (via fal.ai) | ✅ **VERIFIED** | FAL_KEY confirmé |
| 8 | Image-to-image | ✅ **VERIFIED** | FAL_KEY + REPLICATE_API_TOKEN confirmés |
| 9 | Génération vidéo marketing | ✅ **VERIFIED** | Runway + fal.ai + FFmpeg tous actifs |
| 10 | Coding autonome | ✅ **VERIFIED** | GITHUB_TOKEN confirmé |
| 11 | Multi-agents LLM | ✅ **VERIFIED** | OpenAI + Gemini + Groq + Claude tous actifs |
| 12 | Rappels / déduplication | ✅ **VERIFIED** | Inchangé |
| 13 | Mémoire permanente | ✅ **VERIFIED** | Inchangé |
| 14 | Jobs proactifs | ✅ **VERIFIED** (métier) | WhatsApp = 🚫 FAKE (Twilio absent) |
| 15 | Nexus control via Dzaryx | ✅ **VERIFIED** | Inchangé (PC doit être allumé) |

---

## VARIABLES MANQUANTES — À AJOUTER DANS RAILWAY

| Variable | Priorité | Obtenir ici |
|---|---|---|
| `TIKTOK_ACCESS_TOKEN` | 🟡 MOYENNE | TikTok Developer Portal → app credentials |
| `TIKTOK_OPEN_ID` | 🟡 MOYENNE | Même portal (lié à TIKTOK_ACCESS_TOKEN) |
| `TWILIO_ACCOUNT_SID` | 🟡 MOYENNE | console.twilio.com |
| `TWILIO_AUTH_TOKEN` | 🟡 MOYENNE | console.twilio.com |
| `TWILIO_WHATSAPP_FROM` | 🟡 MOYENNE | Format : `whatsapp:+14155238886` |
| `ASSEMBLYAI_API_KEY` | 🟢 FAIBLE | assemblyai.com → API keys |

## ACTIONS RESTANTES

### P1 — Supprimer la variable corrompue dans Railway
```
Supprimer : " TELEGRAM_BOT_TOKEN"  (avec espace en tête)
Garder    : "TELEGRAM_BOT_TOKEN"   (correct)
```

### P2 — Tests réels manquants (code OK, jamais prouvé en prod)
1. **NL Router :** envoyer "Nexus, montre-moi mon bureau" depuis Telegram → réponse doit être analyse écran
2. **Calendar :** demander à Dzaryx de créer un événement → vérifier dans Google Calendar
3. **Image-to-image :** envoyer une photo → "transforme en style guerrier algérien" → vérifier résultat
4. **Coding autonome :** demander à Dzaryx "ajoute un console.log dans chat.ts" → vérifier commit GitHub

### P3 — Corriger FAKE confirmé : `run_tiktok_research`
- Actuellement : Claude invente des tendances sans aucune vraie donnée TikTok
- Fix recommandé : brancher APIFY (déjà configuré !) pour récupérer les vrais trending hashtags avant d'analyser

---

*Mis à jour le 2026-05-10 après vérification `railway variables --json` — valeurs masquées, aucune clé exposée.*
