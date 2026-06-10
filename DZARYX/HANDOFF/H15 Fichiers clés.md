---
tags: [handoff, fichiers, code]
---
# 🗂️ H15 — Fichiers clés (par où commencer)
[[00 HANDOFF HUB|← Hub]]

| Fichier | Rôle |
|---|---|
| `backend/src/conversation/orchestrator.ts` | Point central : pré-routes, gardes, auto-retry, audio → [[H03 Architecture & flux]] |
| `backend/src/conversation/context-builder.ts` | Contexte + miroir de langue (darija) → [[H05 Langues (darija)]] |
| `backend/src/conversation/language-detector.ts` | Détection FR/darija/arabe/ES/EN (+ arabizi) |
| `backend/src/integrations/tools.ts` | Définitions des ~150 outils → [[H06 Outils]] |
| `backend/src/integrations/tool-executor.ts` | Exécution des outils |
| `backend/src/agents/agent-registry.ts` | Agents + outils + mots-clés → [[H04 Cerveau Agents & gardes]] |
| `backend/src/integrations/finance.ts` | Calculs financiers réels → [[H08 Finance & règles métier]] |
| `backend/src/orchestrator/anti-hallucination.ts` | Gardes anti-mensonge |
| `backend/src/notifications/dispatcher.ts` | TTS ElevenLabs + nettoyage + switch voix |
| `backend/src/config/constants.ts` | `SYSTEM_PROMPT` (personnalité + règles) |
| `backend/src/api/routes/chat.ts` · `transcribe.ts` · `sign.ts` | Endpoints chat / STT / signature |
| `simulator/src/components/screens/` | Tous les écrans → [[H09 Écrans]] |
| `simulator/src/services/api.ts` | Appels API + Socket.IO + audio |
| `simulator/public/sw.js` | Service Worker (bumper le cache) → [[H11 Déploiement]] |
| `CLAUDE.md` | Règles agent IA (lu à chaque session) |

Retour : [[00 HANDOFF HUB]]
