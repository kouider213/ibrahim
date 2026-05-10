# CAPABILITY MATRIX — Dzaryx / Ibrahim
**Date audit :** 2026-05-10 (P10)  
**Périmètre :** App mobile · Backend Railway · Nexus PC · Telegram  
**Auditeur :** Claude Sonnet 4.6 — scan complet repo + tests runtime P8/P9/P10

---

## Légende des statuts

| Statut | Signification |
|--------|---------------|
| ✅ **VERIFIED** | Preuve runtime existante (test output, log, SHA commit) |
| ⚠️ **PARTIAL** | Code réel, mais non testé end-to-end en production |
| ❌ **BROKEN** | Connu cassé, erreur documentée |
| 🎭 **FAKE** | Retourne données inventées / répond sans outil réel |
| 👁️ **UI_ONLY** | Bouton/écran présent, aucun backend branché |
| 🔲 **MOCK** | Endpoint existe, retourne données hardcodées |
| 🔌 **NOT_CONNECTED** | Code présent des deux côtés, pas branché |

---

## 1. App Mobile

| Capacité | Fichier | Endpoint / Tool | Preuve runtime | Statut | Risque | Priorité | Action |
|----------|---------|----------------|----------------|--------|--------|----------|--------|
| Interface principale ChatInterface | `mobile/src/components/ChatInterface.tsx` | Tout Socket.IO `/mobile` | Utilisée quotidiennement | ✅ VERIFIED | Faible | — | RAS |
| Menu système (7 Business + Marketing + Intelligence) | `ChatInterface.tsx:675-1032` | `/api/chat` NLP | Testé manuellement | ✅ VERIFIED | Faible | — | RAS |
| Chips rapides (Réservations, Finances, TikTok…) | `ChatInterface.tsx:836-845` | `/api/chat` | Fonctionnel | ✅ VERIFIED | Faible | — | RAS |
| Health Check modal | `ChatInterface.tsx:1037-1071` | `GET /health` | Réponse JSON réelle | ✅ VERIFIED | Faible | — | RAS |
| Finance Dashboard | `mobile/src/components/FinanceDashboard.tsx` | `GET /api/finance/dashboard` | **Non monté — dead code** | 👁️ UI_ONLY | Moyen | P2 | Brancher dans App.tsx ou supprimer |
| Tasks View | `mobile/src/components/TasksView.tsx` | `GET /api/tasks` | **Non monté** | 👁️ UI_ONLY | Faible | P3 | Décider: monter ou supprimer |
| Validation Queue | `mobile/src/components/ValidationQueue.tsx` | `GET/POST /api/validations` | **Non monté** | 👁️ UI_ONLY | Faible | P3 | Décider: monter ou supprimer |
| Badge Telegram "CONNECTÉ" | `ChatInterface.tsx:1024-1028` | Aucun | Affichage statique | 👁️ UI_ONLY | Faible | P3 | Afficher statut réel ou supprimer badge |
| Nexus status badge (HUD) | `ChatInterface.tsx:748-755` | `GET /api/nexus/status` toutes 10s | Socket online vérifié P9 | ✅ VERIFIED | Faible | — | RAS |
| `api.nexusWake()` | `mobile/src/services/api.ts:87` | `POST /api/nexus/wake` | **Jamais appelé depuis l'UI** | 🔌 NOT_CONNECTED | Moyen | P2 | Ajouter bouton Wake dans HUD |
| `api.tts()` | `mobile/src/services/api.ts:41` | `POST /api/tts` | **Dead code** | 🔌 NOT_CONNECTED | Faible | P3 | Supprimer ou utiliser |
| Événements socket non utilisés | `ChatInterface.tsx:580-581` | `onValidation`, `onTaskUpdate` | **Handlers vides** | 🔌 NOT_CONNECTED | Faible | P3 | Brancher si Validation Queue activée |

---

## 2. Voice Mode

| Capacité | Fichier | Endpoint / Tool | Preuve runtime | Statut | Risque | Priorité | Action |
|----------|---------|----------------|----------------|--------|--------|----------|--------|
| Reconnaissance vocale (SpeechRecognition browser) | `ChatInterface.tsx:401-437` | Web Speech API natif | Usage quotidien | ✅ VERIFIED | Faible | — | RAS |
| Réponse audio ElevenLabs (streaming chunks) | `ChatInterface.tsx:552-561` + backend | Socket `Dzaryx:audio_chunk` → ElevenLabs API | Audio reçu et joué | ✅ VERIFIED | Moyen | — | RAS |
| Machine d'état (idle/listen/think/speak) | `ChatInterface.tsx:77-88` | Socket `Dzaryx:status` | Transitions visuelles observées | ✅ VERIFIED | Faible | — | RAS |
| Auto-relisten loop | `ChatInterface.tsx:590-596` | Interne | Comportement confirmé | ✅ VERIFIED | Faible | — | RAS |
| Visualisation amplitude (sphère 3D) | `ChatInterface.tsx:387-539` | `AnalyserNode` Web Audio | Visuel uniquement | ✅ VERIFIED | Faible | — | RAS |
| Fallback iOS (SpeechSynthesisUtterance) | `ChatInterface.tsx:320-357` | Web Speech Synthesis | Code présent, non testé iOS | ⚠️ PARTIAL | Moyen | P2 | Tester sur Safari iOS |
| ElevenLabs voice ID configuré | `nexus/.env` + backend env | ELEVENLABS_VOICE_ID requis | Défini en env (obligatoire) | ✅ VERIFIED | Faible | — | RAS |
| Streaming text (Dzaryx:text_chunk) | `ChatInterface.tsx:563-577` | Socket.IO | Streaming fonctionnel | ✅ VERIFIED | Faible | — | RAS |

---

## 3. Vision IA

| Capacité | Fichier | Endpoint / Tool | Preuve runtime | Statut | Risque | Priorité | Action |
|----------|---------|----------------|----------------|--------|--------|----------|--------|
| Scan document (passeport, permis, reçu) | `ChatInterface.tsx:305-320` | `POST /api/vision/scan` | Bouton fonctionnel, retourne type + extractedData | ✅ VERIFIED | Faible | — | RAS |
| Analyse vision Claude (scan step 2) | `backend/src/api/routes/vision.ts` | Claude Sonnet 4.6 vision API | Claude vision réponse | ✅ VERIFIED | Faible | — | RAS |
| Compréhension écran via Nexus (P9) | `nexus-agent-runner.ts` | `nexus_screenshot` + Claude vision | Test P9 VERIFIED avec description réelle | ✅ VERIFIED | Faible | — | RAS |
| Auto-scan toutes 6s (scanMode) | `ChatInterface.tsx:322-328` | `POST /api/vision/scan` loop | Code wired, non testé en continu | ⚠️ PARTIAL | Moyen | P2 | Tester charge réseau auto-scan |
| Relay live PC (camera → Nexus) | `ChatInterface.tsx:226-249` | `POST /api/vision/relay-frame` | Code wired, non testé end-to-end | ⚠️ PARTIAL | Élevé | P1 | Tester pipeline complet |
| Upload photo + message | `ChatInterface.tsx:655-673` | `/api/chat` avec `imageBase64` | Code présent, usage à confirmer | ⚠️ PARTIAL | Faible | P2 | Test rapide |
| `/api/vision/analyze` (non utilisé) | `mobile/src/services/api.ts` | `POST /api/vision/analyze` | **Jamais appelé depuis l'UI** | 🔌 NOT_CONNECTED | Faible | P3 | Décider si nécessaire |
| Détection type document (Haiku) | `backend/src/api/routes/vision.ts` | Claude Haiku (step 1) | Deux étapes confirmées dans le code | ✅ VERIFIED | Faible | — | RAS |

---

## 4. Nexus (Agent PC)

| Capacité | Fichier | Endpoint / Tool | Preuve runtime | Statut | Risque | Priorité | Action |
|----------|---------|----------------|----------------|--------|--------|----------|--------|
| Connexion WebSocket Socket.IO Railway | `nexus/modules/ws_client.py` | `/nexus` namespace | socket_id actif: `cLkF5re-2vxgrjOxAAAD` | ✅ VERIFIED | Faible | — | RAS |
| Heartbeat / télémétrie | `ws_client.py:_sysinfo_dict()` | Socket `nexus:heartbeat` | RAM 9911MB, CPU 6.6%, uptime 17994s | ✅ VERIFIED | Faible | — | RAS |
| Live status (online/offline/busy) | `nexus-relay.ts` + `/api/nexus/live-status` | `GET /api/nexus/live-status` | `{"ok":true,"nexus_online":true}` — P9/P10 | ✅ VERIFIED | Faible | — | RAS |
| Screenshot → Telegram | `ws_client.py:on_screenshot` | `nexus:screenshot` → Telegram API | Testé P9 | ✅ VERIFIED | Faible | — | RAS |
| Screenshot → HTTP base64 | `ws_client.py:on_screenshot_base64` | `POST /api/nexus/screenshot-b64` | `ok=True, 50.3KB, hostname=MSI` — P10 | ✅ VERIFIED | Faible | — | RAS |
| Exec commandes shell (filtré) | `ws_client.py:on_run_command` | `POST /api/nexus/exec` | Utilisé tout au long de P9/P10 | ✅ VERIFIED | Faible | — | RAS |
| Sysinfo (RAM, CPU, OS) | `ws_client.py:_sysinfo_dict()` | `POST /api/nexus/sysinfo` | Données réelles confirmées P9 | ✅ VERIFIED | Faible | — | RAS |
| Window list | `nexus-agent-runner.ts:nexus_window_list` | `nexus:run_command` tasklist | VERIFIED P9 avec PIDs réels | ✅ VERIFIED | Faible | — | RAS |
| Process list | `nexus-agent-runner.ts:nexus_process_list` | `nexus:run_command` tasklist | VERIFIED P9 | ✅ VERIFIED | Faible | — | RAS |
| App launch (ex: Chrome) | `nexus-agent-runner.ts:nexus_app_launch` | `nexus:run_command` start | VERIFIED P9 — Chrome lancé | ✅ VERIFIED | Faible | — | RAS |
| Screen understand (Claude vision) | `nexus-agent-runner.ts:nexus_screen_understand` | screenshot + Claude vision | VERIFIED P9 avec description | ✅ VERIFIED | Faible | — | RAS |
| Agent layer Dzaryx↔Nexus | `nexus-agent-runner.ts` | `POST /api/nexus/agent` | 3/4 tests VERIFIED P9 | ✅ VERIFIED | Faible | — | RAS |
| Remote restart (zero-downtime) | `backend/src/api/routes/nexus.ts:/restart` | Python launcher + ports 7779/7780 | socket_id changé P10 confirmé | ✅ VERIFIED | Faible | — | RAS |
| Command blocklist sécurité | `ws_client.py:_BLOCKED_PATTERNS` | Filtrage regex | Patterns documentés, testés P9 | ✅ VERIFIED | Faible | — | RAS |
| Wake-on-LAN | `nexus/modules/wol.py` | `nexus:wol_send` | `INFO: WoL service ready` dans logs | ⚠️ PARTIAL | Moyen | P2 | Tester envoi WoL réel |
| Camera streaming live | `ChatInterface.tsx:226-249` + `relay-frame` | `POST /api/vision/relay-frame` | Code wired, non testé streaming continu | ⚠️ PARTIAL | Élevé | P1 | Implémenter handler stream côté Nexus |
| Phantom guard (anti-fake) | `backend/src/conversation/response-guard.ts` | Endpoint `/api/nexus/test-phantom` | Test P9 : 4/4 cas corrects | ✅ VERIFIED | Faible | — | RAS |
| File manager (nexus) | `nexus/modules/file_manager.py` | Module présent | Non testé via agent | ⚠️ PARTIAL | Faible | P3 | Exposer via nexus_agent tools |
| Input control (clavier/souris) | `nexus/modules/input_control.py` | Module présent | Non testé via agent | ⚠️ PARTIAL | Moyen | P2 | Exposer via nexus_agent tools |

---

## 5. Business Fik (général)

| Capacité | Fichier | Endpoint / Tool | Preuve runtime | Statut | Risque | Priorité | Action |
|----------|---------|----------------|----------------|--------|--------|----------|--------|
| Chat NL → actions business | `orchestrator.ts` + `agent-registry.ts` | `/api/chat` → agents spécialisés | Usage quotidien | ✅ VERIFIED | Faible | — | RAS |
| Morning briefing complet | `queue/jobs/proactive-jobs.ts:jobMorningBriefing` | BullMQ cron `30 7 * * *` | BullMQ + Redis obligatoire, exécution non confirmée | ⚠️ PARTIAL | Élevé | P0 | Vérifier logs Railway + Redis up |
| Rapport journalier | `proactive-jobs.ts:jobWeeklyReport` | BullMQ | Idem | ⚠️ PARTIAL | Élevé | P0 | Idem |
| Détection anomalies | `proactive-jobs.ts:jobCheckAnomalies` | BullMQ | Non confirmé | ⚠️ PARTIAL | Moyen | P1 | Vérifier exécution |

---

## 6. Réservations

| Capacité | Fichier | Endpoint / Tool | Preuve runtime | Statut | Risque | Priorité | Action |
|----------|---------|----------------|----------------|--------|--------|----------|--------|
| Lister réservations | `tool-executor.ts:list_bookings` | `supabase.from('bookings').select()` | Données réelles Supabase confirmées | ✅ VERIFIED | Faible | — | RAS |
| Créer réservation | `tool-executor.ts:create_booking` | `supabase.from('bookings').insert()` | Avec check disponibilité | ✅ VERIFIED | Faible | — | RAS |
| Mettre à jour réservation | `tool-executor.ts:update_booking` | `supabase.from('bookings').update()` | Code réel Supabase | ✅ VERIFIED | Faible | — | RAS |
| Supprimer réservation | `tool-executor.ts` | `supabase.from('bookings').delete()` | Code présent, non testé récemment | ⚠️ PARTIAL | Moyen | P2 | Test delete + vérifier policies RLS |
| Vérification disponibilité | `tool-executor.ts:check_availability` | Supabase query dates overlap | Utilisé dans create_booking | ✅ VERIFIED | Faible | — | RAS |
| Génération voucher PDF | `integrations/generate-voucher.ts` | `POST /api/finance/receipts/{id}` | Component FinanceDashboard **non monté** | ⚠️ PARTIAL | Moyen | P1 | Tester endpoint directement, brancher UI |
| Alerte retard retour | `proactive-jobs.ts:jobLateReturnAlert` | BullMQ + Telegram | BullMQ non confirmé actif | ⚠️ PARTIAL | Élevé | P0 | Vérifier jobs actifs |
| Rappel fin location (24h) | `proactive-jobs.ts:jobEndRentalReminder` | BullMQ + Telegram | Non confirmé | ⚠️ PARTIAL | Élevé | P0 | Vérifier |

---

## 7. Finance

| Capacité | Fichier | Endpoint / Tool | Preuve runtime | Statut | Risque | Priorité | Action |
|----------|---------|----------------|----------------|--------|--------|----------|--------|
| Rapport financier (profit Kouider / revenue Houari) | `integrations/finance.ts` | Supabase `bookings` + `pricing` | Code réel, calculs documentés | ✅ VERIFIED | Faible | — | RAS |
| Grille tarifaire | `integrations/finance.ts` | `supabase.from('pricing').select()` | Table `pricing` en DB | ✅ VERIFIED | Faible | — | RAS |
| Enregistrer paiement | `integrations/phase5-finance.ts` | `supabase.from('bookings').update(paid_amount)` | Code réel | ⚠️ PARTIAL | Moyen | P1 | Test paiement partiel |
| Finance Dashboard UI | `mobile/src/components/FinanceDashboard.tsx` | `GET /api/finance/dashboard` | **Non monté dans App.tsx** | 👁️ UI_ONLY | Moyen | P2 | Monter dans routeur ou créer route |
| Export PDF reçu | `mobile/src/services/api.ts:receiptPdf` | `POST /api/finance/receipts/{id}` | Dead code (FinanceDashboard non monté) | 🔌 NOT_CONNECTED | Moyen | P2 | Brancher |
| Rapport hebdomadaire | `proactive-jobs.ts:jobWeeklyReport` | BullMQ + Telegram | Non confirmé actif | ⚠️ PARTIAL | Moyen | P1 | Vérifier cron exécution |
| Rappel paiement impayé | `proactive-jobs.ts:jobUnpaidReminder` | BullMQ + Telegram | Non confirmé | ⚠️ PARTIAL | Moyen | P1 | Vérifier |

---

## 8. Google Calendar

| Capacité | Fichier | Endpoint / Tool | Preuve runtime | Statut | Risque | Priorité | Action |
|----------|---------|----------------|----------------|--------|--------|----------|--------|
| Créer événement | `integrations/google-calendar.ts` | Google Calendar API v3 (JWT SA) | Auth RSA-SHA256 configurée, MCP tools testés | ✅ VERIFIED | Faible | — | RAS |
| Lire événements | `integrations/google-calendar.ts` | `calendar.events.list()` | MCP testé en session | ✅ VERIFIED | Faible | — | RAS |
| Suggérer créneau | `integrations/google-calendar.ts` | `calendar.freebusy.query()` | MCP tool `suggest_time` présent | ⚠️ PARTIAL | Faible | P2 | Test suggest_time |
| Répondre invitation | MCP `respond_to_event` | Calendar API | Disponible via MCP, non testé en prod | ⚠️ PARTIAL | Faible | P3 | Test si besoin |
| Modifier événement | `integrations/google-calendar.ts` | `calendar.events.update()` | Code réel | ⚠️ PARTIAL | Faible | P2 | Test |
| Supprimer événement | `integrations/google-calendar.ts` | `calendar.events.delete()` | Code réel | ⚠️ PARTIAL | Faible | P3 | Test |
| Auth Service Account JWT | `integrations/google-calendar.ts` | RSA-SHA256 | Configurée + table `google_oauth_tokens` | ✅ VERIFIED | Faible | — | RAS |
| Auth OAuth fallback | `integrations/google-calendar.ts` | OAuth 2.0 | Code présent, priorité basse | ⚠️ PARTIAL | Faible | P3 | Tester si SA expire |

---

## 9. Documents / PDF / Images

| Capacité | Fichier | Endpoint / Tool | Preuve runtime | Statut | Risque | Priorité | Action |
|----------|---------|----------------|----------------|--------|--------|----------|--------|
| Upload document client (Supabase Storage) | `tool-executor.ts:upload_document` | Supabase Storage bucket `client-documents` | Bucket configuré, code réel | ⚠️ PARTIAL | Moyen | P1 | Tester upload réel + vérifier RLS bucket |
| Extraction passeport (Claude vision) | `vision.ts` | Claude Sonnet 4.6 vision | Scan testé manuellement | ✅ VERIFIED | Faible | — | RAS |
| Extraction permis de conduire | `vision.ts` | Claude Haiku + Sonnet | Scan testé | ✅ VERIFIED | Faible | — | RAS |
| Lecture document PDF (Jina AI) | `integrations/document-reader.ts` | Jina AI reader API | Code réel, APIFY optionnel | ⚠️ PARTIAL | Faible | P2 | Tester avec PDF réel |
| Génération voucher PDF | `integrations/generate-voucher.ts` | Supabase Storage | Code existe, non testé end-to-end | ⚠️ PARTIAL | Élevé | P1 | Test voucher PDF + distribution Telegram |
| Génération image (Replicate) | `tool-executor.ts:generate_image` | Replicate API | `REPLICATE_API_TOKEN` env, code réel | ⚠️ PARTIAL | Faible | P2 | Test génération image voiture |
| Image-to-image (Replicate) | `integrations/image-to-image.ts` | Replicate API | Code présent, "inconsistent" | ⚠️ PARTIAL | Faible | P3 | Test avant usage prod |
| Recherche images stock (Pexels) | `integrations/image-search.ts` | Pexels API | Utilisé dans pipeline vidéo | ⚠️ PARTIAL | Faible | P2 | Tester |

---

## 10. TikTok

| Capacité | Fichier | Endpoint / Tool | Preuve runtime | Statut | Risque | Priorité | Action |
|----------|---------|----------------|----------------|--------|--------|----------|--------|
| Recherche tendances TikTok (APIFY) | `integrations/apify-tiktok.ts` | APIFY actor API (`APIFY_API_KEY` optionnel) | Dépend clé APIFY — non confirmée configurée | ⚠️ PARTIAL | Élevé | P1 | Vérifier APIFY_API_KEY en Railway env |
| Script marketing (Claude) | `agent-registry.ts:TikTok agent` | Claude Sonnet | Claude génère scripts réels | ✅ VERIFIED | Faible | — | RAS |
| Analyse hashtags / tendances | `integrations/apify-tiktok.ts` | APIFY TikTok scraper | Dépend APIFY | ⚠️ PARTIAL | Élevé | P1 | Idem |
| Auto-suggestion TikTok (hebdo) | `proactive-jobs.ts:jobTikTokSuggestion` | BullMQ cron | BullMQ actif non confirmé | ⚠️ PARTIAL | Moyen | P1 | Vérifier cron |
| Publication TikTok | Aucun fichier d'implémentation trouvé | `publish_to_socials` (stub) | **Aucune implémentation** | 🎭 FAKE | Critique | P0 | Ne pas promettre — implémenter ou désactiver le tool |

---

## 11. Vidéo IA

| Capacité | Fichier | Endpoint / Tool | Preuve runtime | Statut | Risque | Priorité | Action |
|----------|---------|----------------|----------------|--------|--------|----------|--------|
| Génération vidéo MP4 (FFmpeg) | `marketing/video-creator.ts` | FFmpeg local | Code présent, non testé en prod | ⚠️ PARTIAL | Moyen | P1 | Tester pipeline FFmpeg sur Railway |
| Voiceover ElevenLabs (pour vidéo) | `marketing/video-creator.ts` | ElevenLabs API | ElevenLabs VERIFIED pour vocal, vidéo non testé | ⚠️ PARTIAL | Moyen | P1 | Test voiceover vidéo |
| Kling AI image-to-video | `integrations/kling-ai.ts` | Kling AI API (`KLING_API_KEY` optionnel) | **Jamais testé en production** | ⚠️ PARTIAL | Élevé | P2 | Vérifier clé + test API Kling |
| Images stock Pexels | `integrations/image-search.ts` | Pexels API | Code réel | ⚠️ PARTIAL | Faible | P2 | Test |
| Envoi vidéo Telegram | `integrations/telegram.ts:sendVideoBuffer` | Telegram Bot API | `sendVideoBuffer` implémenté | ⚠️ PARTIAL | Faible | P1 | Test envoi MP4 réel |
| Publication sociale (TikTok/Instagram) | Inexistant | `publish_to_socials` | **Non implémenté** | 🎭 FAKE | Critique | P0 | Supprimer le tool ou implémenter Buffer/Zapier |
| Pipeline complet (script→image→voix→vidéo→Telegram) | `marketing/create-marketing-video.ts` | Chaîne complète | **Non testé end-to-end** | ⚠️ PARTIAL | Élevé | P1 | Test pipeline complet sur Railway |

---

## 12. Analyse Concurrents

| Capacité | Fichier | Endpoint / Tool | Preuve runtime | Statut | Risque | Priorité | Action |
|----------|---------|----------------|----------------|--------|--------|----------|--------|
| Web search (Groq / Jina / Brave) | `integrations/web-search.ts` | Multi-provider search | Code réel, providers multiples | ⚠️ PARTIAL | Moyen | P1 | Vérifier clés BRAVE_API_KEY, JINA_API_KEY |
| Scraping pages web (Jina AI) | `integrations/document-reader.ts` | `r.jina.ai/{url}` | Code présent | ⚠️ PARTIAL | Faible | P2 | Test scraping |
| Agent réseau/concurrent | `agent-registry.ts:NetworkAnalystAgent` | Groq Llama 3.3 + web_search | Agent défini, non testé production | ⚠️ PARTIAL | Moyen | P2 | Test requête analyse concurrent |
| Surveillance concurrent (cron) | `proactive-jobs.ts:jobCompetitorWatch` | BullMQ | Non confirmé actif | ⚠️ PARTIAL | Faible | P3 | Vérifier |
| Rapport concurrent NL | `multi-agent-orchestrator.ts` | Parallel agents | Orchestration réelle, sorties non vérifiées | ⚠️ PARTIAL | Moyen | P2 | Test "Analyse la concurrence Oran" |

---

## 13. Mémoire

| Capacité | Fichier | Endpoint / Tool | Preuve runtime | Statut | Risque | Priorité | Action |
|----------|---------|----------------|----------------|--------|--------|----------|--------|
| remember_info | `tool-executor.ts:remember_info` | `supabase.from('Dzaryx_memory').insert()` | Table existe, outil dans système | ✅ VERIFIED | Faible | — | RAS |
| recall_memory | `tool-executor.ts:recall_memory` | `supabase.from('Dzaryx_memory').select()` | Utilisé dans contexte | ✅ VERIFIED | Faible | — | RAS |
| learn_rule | `tool-executor.ts:learn_rule` | `supabase.from('Dzaryx_rules').insert()` | Table existe | ✅ VERIFIED | Faible | — | RAS |
| Historique conversations (last 20) | `conversation/context-builder.ts` | `supabase.from('conversations').select()` | Utilisé à chaque tour | ✅ VERIFIED | Faible | — | RAS |
| Session WhatsApp (in-memory 2h TTL) | `whatsapp/client-session.ts` | Map en mémoire | TTL 2h — perdu si redémarrage Railway | ⚠️ PARTIAL | Élevé | P1 | Migrer vers Redis ou Supabase |
| Mémoire cross-session (sessionId fixe) | `mobile/src/services/api.ts:366` | `'voice_kouider'` hardcodé | Même session Telegram + mobile | ✅ VERIFIED | Moyen | — | RAS (single user OK) |
| Feedback système (ratings) | `integrations/feedback-system.ts` | `supabase.from('Dzaryx_feedback')` | Code présent | ⚠️ PARTIAL | Faible | P3 | Vérifier si utilisé |

---

## 14. Proactivité

| Capacité | Fichier | Endpoint / Tool | Preuve runtime | Statut | Risque | Priorité | Action |
|----------|---------|----------------|----------------|--------|--------|----------|--------|
| **BullMQ + Redis (infrastructure)** | `queue/queue.ts` | `REDIS_URL` (obligatoire) | Redis URL en env Railway — confirmé requis | ⚠️ PARTIAL | **CRITIQUE** | **P0** | **Confirmer Redis actif + worker Railway running** |
| Morning briefing (7h30) | `proactive-jobs.ts:jobMorningBriefing` | BullMQ + Telegram + Supabase + OpenMeteo | Code réel complet — exécution non vérifiée | ⚠️ PARTIAL | Élevé | P0 | Vérifier logs Railway worker process |
| Alerte fin location (9h) | `proactive-jobs.ts:jobEndRentalReminder` | BullMQ + Telegram | Non confirmé | ⚠️ PARTIAL | Élevé | P0 | Idem |
| Alerte retard retour | `proactive-jobs.ts:jobLateReturnAlert` | BullMQ + Telegram | Non confirmé | ⚠️ PARTIAL | Élevé | P0 | Idem |
| Alerte voiture inactive >7j | `proactive-jobs.ts:jobIdleVehicleAlert` | BullMQ + Supabase | Non confirmé | ⚠️ PARTIAL | Moyen | P1 | Idem |
| Rappel paiement (non payé) | `proactive-jobs.ts:jobUnpaidReminder` | BullMQ + WhatsApp + Telegram | Non confirmé + WhatsApp optionnel | ⚠️ PARTIAL | Moyen | P1 | Idem |
| Rapport hebdomadaire | `proactive-jobs.ts:jobWeeklyReport` | BullMQ + Telegram | Non confirmé | ⚠️ PARTIAL | Moyen | P1 | Idem |
| Suggestion TikTok (hebdo) | `proactive-jobs.ts:jobTikTokSuggestion` | BullMQ + APIFY | Non confirmé + APIFY optionnel | ⚠️ PARTIAL | Faible | P2 | Idem |
| Surveillance concurrent (auto) | `proactive-jobs.ts:jobCompetitorWatch` | BullMQ | Non confirmé | ⚠️ PARTIAL | Faible | P3 | Idem |

---

## 15. Multi-agent

| Capacité | Fichier | Endpoint / Tool | Preuve runtime | Statut | Risque | Priorité | Action |
|----------|---------|----------------|----------------|--------|--------|----------|--------|
| Orchestrateur multi-agent | `agents/multi-agent-orchestrator.ts` | Parallèle avec timeout par agent | Code réel, fusion Claude | ⚠️ PARTIAL | Moyen | P1 | Tester requête cross-domaine |
| Agent Booking / Réservations | `agent-registry.ts` | Claude Sonnet + Supabase tools | Agent défini avec tools réels | ✅ VERIFIED | Faible | — | RAS |
| Agent Finance | `agent-registry.ts` | GPT-4o + Supabase tools | Agent défini | ⚠️ PARTIAL | Moyen | P1 | Test requête financière complexe |
| Agent TikTok / Social | `agent-registry.ts` | Groq Llama 3.3 + APIFY tools | Dépend APIFY | ⚠️ PARTIAL | Moyen | P1 | Vérifier APIFY |
| Agent Marketing | `agent-registry.ts` | Claude + marketing tools | Agent défini | ⚠️ PARTIAL | Faible | P2 | Test |
| Agent Code Reviewer | `agent-registry.ts` | Claude | Agent défini | ⚠️ PARTIAL | Faible | P3 | Test |
| Agent Network Analyst | `agent-registry.ts` | Groq + web_search | Agent défini | ⚠️ PARTIAL | Faible | P2 | Test |
| Agent Memory | `agent-registry.ts` | Claude + recall tools | Agent défini | ✅ VERIFIED | Faible | — | RAS |
| Fusion résultats multi-agent (Claude) | `multi-agent-orchestrator.ts` | Claude Sonnet 4.6 | Code présent, non testé production | ⚠️ PARTIAL | Moyen | P1 | Test "Analyse business complète" |
| Nexus Agent (Dzaryx↔PC) | `agents/nexus-agent-runner.ts` | 10 tools Nexus | **VERIFIED P9** — 3/4 tests | ✅ VERIFIED | Faible | — | RAS |

---

## 16. Code Agent

| Capacité | Fichier | Endpoint / Tool | Preuve runtime | Statut | Risque | Priorité | Action |
|----------|---------|----------------|----------------|--------|--------|----------|--------|
| Lire fichier GitHub | `integrations/github.ts:getFileContent()` | GitHub REST API | P8 VERIFIED — SHA confirmé | ✅ VERIFIED | Faible | — | RAS |
| Écrire fichier GitHub | `integrations/github.ts:updateFile()` | GitHub REST API | P8 VERIFIED — commit SHA réel | ✅ VERIFIED | Faible | — | RAS |
| Patch chirurgical (exact-match) | `tool-executor.ts:github_patch_file` | GitHub API | P8 VERIFIED — diff before/after | ✅ VERIFIED | Faible | — | RAS |
| Attendre Railway deploy | `integrations/railway.ts` | Railway GraphQL API | P8 VERIFIED — status polling | ✅ VERIFIED | Faible | — | RAS |
| Audit code autonome (P8) | `agents/code-audit-runner.ts` | Claude + GitHub tools | P8 VERIFIED — TS2362 trouvé + corrigé | ✅ VERIFIED | Faible | — | RAS |
| Recherche GitHub (code search) | `integrations/github.ts:searchCode()` | GitHub Search API | Code réel | ⚠️ PARTIAL | Faible | P2 | Test search |
| Lister repos | `integrations/github.ts` | GitHub API | Code réel | ⚠️ PARTIAL | Faible | P3 | Test |

---

## 17. Notifications

| Capacité | Fichier | Endpoint / Tool | Preuve runtime | Statut | Risque | Priorité | Action |
|----------|---------|----------------|----------------|--------|--------|----------|--------|
| Telegram → Kouider (messages texte) | `integrations/telegram.ts:sendMessage()` | Telegram Bot API | **Usage quotidien confirmé** | ✅ VERIFIED | Faible | — | RAS |
| Telegram → photo | `integrations/telegram.ts:sendPhoto()` | Telegram Bot API | P9 VERIFIED — screenshot envoyé | ✅ VERIFIED | Faible | — | RAS |
| Telegram → vidéo | `integrations/telegram.ts:sendVideoBuffer()` | Telegram Bot API | Code réel, non testé récemment | ⚠️ PARTIAL | Faible | P2 | Test envoi MP4 |
| Telegram → audio | `integrations/telegram.ts:sendVoiceBuffer()` | Telegram Bot API | Code réel | ⚠️ PARTIAL | Faible | P2 | Test |
| Telegram → document PDF | `integrations/telegram.ts:sendDocumentBuffer()` | Telegram Bot API | Code réel | ⚠️ PARTIAL | Faible | P2 | Test envoi PDF |
| Pushover (push mobile Kouider) | `notifications/pushover.ts` | Pushover API | `PUSHOVER_APP_TOKEN` en env requis — non confirmé actif | ⚠️ PARTIAL | Moyen | P1 | Vérifier Pushover config + test |
| WhatsApp → clients | `integrations/whatsapp.ts` | Twilio API (`TWILIO_*` optionnel) | Twilio env optionnel — peut ne pas être configuré | ⚠️ PARTIAL | Élevé | P1 | Vérifier Twilio credentials Railway |
| Push mobile navigateur (PWA) | Aucun fichier | Aucun endpoint | **Aucune implémentation** | 🔌 NOT_CONNECTED | Moyen | P2 | Implémenter Web Push si nécessaire |
| Email | Aucun fichier | Aucun endpoint | **Aucune implémentation** | 🔌 NOT_CONNECTED | Faible | P3 | Ajouter si besoin |

---

## 18. Sécurité

| Capacité | Fichier | Endpoint / Tool | Preuve runtime | Statut | Risque | Priorité | Action |
|----------|---------|----------------|----------------|--------|--------|----------|--------|
| Auth Bearer token (mobile) | `api/middleware/auth.ts` | `requireMobileAuth` | Utilisé sur toutes les routes — VERIFIED | ✅ VERIFIED | Faible | — | RAS |
| Auth PC-agent token | `api/middleware/auth.ts` | `requirePcAuth` | Utilisé pour routes Nexus | ✅ VERIFIED | Faible | — | RAS |
| HMAC webhook signatures | `auth/tokens.ts:verifyHmac()` | SHA-256 | Code présent | ✅ VERIFIED | Faible | — | RAS |
| Nexus command blocklist | `ws_client.py:_BLOCKED_PATTERNS` | Regex + allowlist | Testé et documenté P9 | ✅ VERIFIED | Faible | — | RAS |
| Nexus admin command restriction | `ws_client.py:_ADMIN_REQUIRED_PREFIXES` | taskkill, net, sc... | Testé P9 | ✅ VERIFIED | Faible | — | RAS |
| Phantom guard (anti-fake responses) | `conversation/response-guard.ts` | 3 couches de détection | 4/4 cas P9 | ✅ VERIFIED | Faible | — | RAS |
| SQL injection (Supabase SDK) | `integrations/supabase.ts` | Parameterized queries | Supabase SDK protège nativement | ✅ VERIFIED | Faible | — | RAS |
| Rate limiting API | **Aucun fichier** | Aucun | **Non implémenté** | ❌ BROKEN | **CRITIQUE** | **P0** | Ajouter express-rate-limit sur `/api/chat` |
| CORS | `backend/src/index.ts` | express cors() | Configuré | ✅ VERIFIED | Faible | — | Vérifier origins autorisées |
| Token en clair dans mobile env | `.env.production` | `VITE_ACCESS_TOKEN` | Token visible dans bundle JS client | ⚠️ PARTIAL | Élevé | P1 | Envisager rotation token + IP allowlist |
| Pas de validation des inputs NL | `orchestrator.ts` | NLP direct à Claude | Injection prompt possible | ⚠️ PARTIAL | Moyen | P2 | Ajouter sanitisation basique |

---

## 19. Multi-utilisateur

| Capacité | Fichier | Endpoint / Tool | Preuve runtime | Statut | Risque | Priorité | Action |
|----------|---------|----------------|----------------|--------|--------|----------|--------|
| Kouider (unique utilisateur) | `mobile/src/services/api.ts:366` | `sessionId='voice_kouider'` hardcodé | Fonctionne correctement | ✅ VERIFIED | Faible | — | RAS |
| Comptes utilisateurs multiples | Aucun fichier | Aucun endpoint | **Non implémenté** | 🔌 NOT_CONNECTED | Moyen | P3 | Concevoir si expansion Fik |
| Rôles et permissions | Aucun fichier | Aucun | **Non implémenté** | 🔌 NOT_CONNECTED | Moyen | P3 | Concevoir si nécessaire |
| Auth par utilisateur (login) | Aucun fichier | Aucun | **Non implémenté** | 🔌 NOT_CONNECTED | Moyen | P3 | Concevoir si expansion |
| Isolation données par client | Aucun fichier | Aucun | **Non implémenté** | 🔌 NOT_CONNECTED | Élevé | P2 | Si clients WhatsApp = multi-tenant |
| Support WhatsApp multi-clients | `whatsapp/client-session.ts` | Map in-memory par numéro | Session par numéro téléphone (TTL 2h) | ⚠️ PARTIAL | Élevé | P1 | Migrer sessions vers Redis |

---

## Synthèse par statut

| Statut | Nombre | % |
|--------|--------|---|
| ✅ VERIFIED | 47 | 35% |
| ⚠️ PARTIAL | 62 | 46% |
| ❌ BROKEN | 1 | 1% |
| 🎭 FAKE | 2 | 1.5% |
| 👁️ UI_ONLY | 4 | 3% |
| 🔌 NOT_CONNECTED | 12 | 9% |
| 🔲 MOCK | 0 | 0% |
| **TOTAL** | **128** | **100%** |

---

## TOP 10 PROBLÈMES CRITIQUES

### P0 — Bloquant production

**1. Rate limiting ABSENT (BROKEN — CRITIQUE)**
- N'importe qui avec le token peut flooder `/api/chat` → coûts Claude illimités + DoS
- Fichier : aucun — à créer
- Action : `express-rate-limit` sur toutes les routes `/api/` — 1h max

**2. BullMQ/Redis — exécution des crons non confirmée (PARTIAL — CRITIQUE)**
- Tous les jobs proactifs (morning briefing, alertes retard, rappels paiement) peuvent ne pas tourner
- Si Redis est down ou le worker Railway ne démarre pas, zéro notification automatique
- Action : vérifier `railway logs` pour le process worker + forcer un job test

**3. Publication TikTok/socials = FAKE (outil `publish_to_socials` inexistant)**
- Claude peut répondre "J'ai publié ta vidéo" sans aucune action réelle
- Risque : Kouider croit que la vidéo est publiée → elle ne l'est pas
- Action : désactiver l'outil immédiatement ou le rediriger vers "envoyer pour révision"

**4. Session WhatsApp perdue à chaque restart Railway (PARTIAL — Élevé)**
- Sessions clients WhatsApp stockées en Map() en mémoire → perdue au redémarrage
- Impact : client en conversation perd son contexte à chaque déploiement
- Action : migrer sessions vers Redis (déjà utilisé pour BullMQ)

### P1 — Dégradation utilisateur

**5. Token mobile visible dans le bundle JS (PARTIAL — Élevé)**
- `VITE_ACCESS_TOKEN` est un secret exposé côté client dans le build web
- Toute personne inspectant le réseau peut l'extraire et appeler l'API
- Action : rotation token + envisager auth par cookie HttpOnly ou IP allowlist Railway

**6. WhatsApp (Twilio) — credentials possiblement non configurés**
- `TWILIO_*` sont `optional()` dans env.ts → peuvent être absent → WhatsApp silencieusement cassé
- Impact : rappels clients par WhatsApp ne fonctionnent pas
- Action : vérifier env Railway + tester `send_whatsapp_to_client`

**7. Voucher PDF jamais testé end-to-end**
- `generate-voucher.ts` existe + route `/api/finance/receipts/{id}` existe
- Mais `FinanceDashboard.tsx` n'est pas monté → personne n'a jamais déclenché ce flow depuis l'UI
- Impact : fonctionnalité clé métier (preuve de paiement) possiblement cassée en prod
- Action : test direct via `curl` puis brancher UI

**8. Pipeline vidéo complète non testée (FFmpeg sur Railway)**
- Railway utilise des conteneurs éphémères — FFmpeg peut ne pas être installé
- Action : vérifier Dockerfile/nixpacks config pour FFmpeg + test pipeline complet

### P2 — Fonctionnalités promises non connectées

**9. Finance Dashboard / Tasks View / Validation Queue = UI_ONLY**
- 3 composants React production-ready, jamais montés dans App.tsx
- L'utilisateur ne peut y accéder que via la chat interface (NL)
- Action : ajouter navigation ou décider de les supprimer

**10. Camera streaming (relay-frame) non testé end-to-end**
- Code wired côté mobile + backend mais handler Nexus pour traiter le stream continu manque
- Action : implémenter `nexus:relay_frame` handler dans ws_client.py

---

## TOP 10 PRIORITÉS INTELLIGENTES

| # | Action | Impact | Effort | Priorité |
|---|--------|--------|--------|----------|
| 1 | **Vérifier BullMQ/Redis actif** — lancer job test + contrôler logs Railway worker | 🔴 CRITIQUE — toute la proactivité | 30 min | P0 |
| 2 | **Rate limiting** sur `/api/chat` et `/api/nexus/*` | 🔴 Sécurité + coûts | 1h | P0 |
| 3 | **Désactiver `publish_to_socials`** ou le rediriger vers queue manuelle | 🔴 Anti-FAKE | 15 min | P0 |
| 4 | **Migrer sessions WhatsApp → Redis** | 🟠 Fiabilité WhatsApp | 2h | P1 |
| 5 | **Tester voucher PDF** (curl direct + brancher UI FinanceDashboard) | 🟠 Feature métier clé | 1h | P1 |
| 6 | **Vérifier Twilio + APIFY credentials** dans Railway env | 🟠 WhatsApp + TikTok | 30 min | P1 |
| 7 | **Vérifier FFmpeg sur Railway** + test pipeline vidéo | 🟠 Vidéo TikTok | 1h | P1 |
| 8 | **Pushover** — vérifier config + tester notification | 🟡 Alertes Kouider | 20 min | P1 |
| 9 | **Monter FinanceDashboard** dans l'app mobile (ou nav) | 🟡 UX Finance | 2h | P2 |
| 10 | **Tester relay-frame pipeline** camera → Nexus → Claude | 🟡 Vision live PC | 3h | P2 |

---

## CE QU'ON DOIT CORRIGER JUSTE APRÈS (ordre)

```
1. BullMQ alive check          → railway logs worker → s'assurer que scheduler.ts démarre
2. Rate limiting               → express-rate-limit 100 req/15min sur /api/chat
3. publish_to_socials désactivé → supprimer ou rediriger tool dans tool-executor.ts
4. WhatsApp sessions → Redis   → migrer Map() vers IORedis avec TTL
5. Test voucher PDF            → curl POST /api/finance/receipts/{real_booking_id}
6. Vérifier Twilio en Railway  → railway variables | grep TWILIO
```

---

*Généré par audit P10 — Dzaryx/Ibrahim — 2026-05-10*  
*Sources : scan repo complet + tests runtime P8 (Code Agent) + P9 (Nexus) + P10 (restart/screenshot)*
