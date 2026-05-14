# DZARYX — Architecture Technique

## Stack

| Couche | Technologie | Détails |
|---|---|---|
| Backend | Node.js + TypeScript | Express, Railway |
| Base de données | Supabase (PostgreSQL) | RLS activé |
| Cache / Queue | Redis (Upstash) | BullMQ pour jobs async |
| AI principal | Claude (Anthropic) | claude-sonnet-4-6 |
| AI fallback | OpenAI / Gemini / Groq | via LLM Router |
| Mobile | React 18 + Vite + Tailwind | PWA |
| PC Agent | Python 3 + Socket.IO | Nexus |
| Notifications | ElevenLabs (TTS) + Pushover | iPhone |
| Stockage fichiers | Supabase Storage | PDFs, documents |

---

## Flux principal d'une requête AI

```
Message (Telegram / Mobile / WhatsApp)
    ↓
orchestrator.ts          ← Point d'entrée unique
    ↓
context-builder.ts       ← Construit le contexte (réservations, finance, profil)
    ↓
core-router.ts           ← Route vers le bon agent
    ↓
orchestrator-engine.ts   ← Appelle Claude API avec outils
    ↓
tool-executor.ts         ← Exécute les outils (Supabase, etc.)
    ↓
response-guard.ts        ← Guard 1: Phantom Guard
anti-hallucination.ts    ← Guard 2+3: Finance / State claims
    ↓
Réponse envoyée
```

---

## Structure des dossiers backend

```
backend/src/
├── actions/          ← Handlers d'actions métier (réservation, client, etc.)
├── agents/           ← Multi-agent orchestration + core-router
├── api/routes/       ← 26 routes Express
├── bi/               ← Business Intelligence (revenue, fleet, reminders)
├── config/           ← pricing.ts, constants.ts
├── conversation/     ← orchestrator.ts, context-builder.ts, intent-detector.ts
├── integrations/     ← supabase.ts, finance.ts, phase5-finance.ts, claude-api.ts
├── orchestrator/     ← anti-hallucination.ts, orchestrator-engine.ts
├── queue/            ← BullMQ worker + jobs
├── security/         ← document-access-log.ts, nexus-security.ts
├── tests/            ← Tests unitaires et d'intégration
└── validations/      ← gate.ts, approver.ts
```

---

## Fichiers critiques (lire en priorité)

| Fichier | Rôle |
|---|---|
| `backend/src/conversation/orchestrator.ts` | Point d'entrée AI, Guards 1-4 |
| `backend/src/orchestrator/anti-hallucination.ts` | Gates 2&3 anti-hallucination |
| `backend/src/conversation/response-guard.ts` | Gate 1: Phantom Guard |
| `backend/src/integrations/finance.ts` | Calculs financiers normalisés |
| `backend/src/integrations/phase5-finance.ts` | Dashboard financier, CA, alertes |
| `backend/src/bi/revenue-intelligence.ts` | Revenus semaine/mois, scoring clients |
| `backend/src/integrations/supabase.ts` | Client Supabase + interfaces TypeScript |
| `backend/src/config/pricing.ts` | Prix catalogue véhicules (référence seulement) |
| `backend/src/integrations/tool-executor.ts` | Exécution des outils Claude |
| `backend/src/security/nexus-security.ts` | Auth Nexus + nonce anti-replay |

---

## Nexus PC Agent (Python)

```
nexus/
├── nexus.py              ← Orchestrateur principal
├── nexus_watchdog.py     ← Watchdog (redémarre si crash)
├── launcher.py           ← Wrapper de démarrage
├── modules/
│   ├── ws_client.py      ← Connexion WebSocket vers backend
│   ├── os_agent.py       ← Exécution commandes terminal (avec streaming SSE)
│   ├── file_manager.py   ← Gestion fichiers
│   ├── git_manager.py    ← Opérations Git
│   ├── vision.py         ← Capture écran
│   └── pc_control.py     ← Contrôle souris/clavier
└── gui/index.html        ← Interface web locale
```

**Namespace Socket.IO** : `/nexus`
**Events** : `nexus:terminal_run`, `nexus:terminal_chunk`, `nexus:file_read`, etc.

---

## Sécurité

### Anti-hallucination (3 Gates)
- **Gate 1 (Phantom Guard)** : bloque si Claude prétend avoir écrit sans outil Write exécuté
- **Gate 2 (Financial)** : bloque si Claude donne des chiffres financiers sans avoir appelé un outil finance réel
- **Gate 3 (State)** : bloque si Claude prétend avoir consulté des données sans requête réelle

### Nonce anti-replay
- Redis `SET NX EX 600` — TTL 10 min, survit aux redémarrages Railway

### Document access logs
- Table Supabase `document_access_logs` — chaque accès loggé
- Masquage automatique données sensibles pour non-admins

---

## Déploiement

- **Push sur `main`** → Railway redéploie automatiquement
- Variables d'env dans Railway Dashboard (voir [[ENV]])
- Pas de build local nécessaire — Railway compile TypeScript

---

## Base de données

Voir [[DATABASE]] pour le schéma complet.

Tables principales : `bookings`, `cars`, `profiles`, `payments`, `reviews`, `pricing`, `document_access_logs`, `payment_logs`
