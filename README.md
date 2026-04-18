# Ibrahim — AI Business Assistant
### Fik Conciergerie · Oran, Algérie

---

## Stack

| Couche | Technologie |
|--------|------------|
| Backend | Node.js + TypeScript + Express + Socket.IO |
| Queue | BullMQ + Redis (Upstash) |
| Base de données | Supabase (PostgreSQL) |
| IA | Claude (Anthropic) |
| Voix | ElevenLabs (TTS) + Web Speech API (STT) |
| Mobile | React PWA + Vite |
| PC Agent | Node.js + Socket.IO client |
| Notifications | Pushover (iPhone) |

---

## Démarrage rapide

### 1. Variables d'environnement

```bash
cp .env .env.local
# Remplir toutes les valeurs dans .env.local
```

### 2. Base de données Supabase

Exécuter dans Supabase SQL Editor :
```sql
-- supabase/schema-phase1.sql
```

### 3. Backend

```bash
cd backend
npm install
npm run dev          # Serveur + API
npm run worker       # Worker BullMQ (terminal séparé)
```

### 4. PC Agent (Windows/Mac)

```bash
cd pc-agent
npm install
# Copier .env à la racine avec BACKEND_URL et PC_AGENT_TOKEN
npm run dev
```

### 5. Mobile PWA

```bash
cd mobile
npm install
# Créer mobile/.env.local avec VITE_ACCESS_TOKEN, VITE_BACKEND_URL
npm run dev
# Ouvrir http://localhost:5173 sur iPhone (Safari → Ajouter à l'écran d'accueil)
```

---

## Architecture

```
Ibrahim
├── backend/          ← API REST + WebSocket + BullMQ workers
│   └── src/
│       ├── api/       ← Routes: /chat, /tasks, /validations, /notifications
│       ├── conversation/ ← Orchestrator, intent detection, context builder
│       ├── actions/   ← Registry + executor + handlers (reservation, content, pc)
│       ├── queue/     ← BullMQ queue + worker
│       ├── validations/ ← Gate (règles) + Approver (workflow)
│       └── notifications/ ← ElevenLabs TTS + Pushover
├── pc-agent/         ← Agent WebSocket sur le PC Windows
├── mobile/           ← PWA React — interface Jarvis
└── supabase/         ← Schema SQL Phase 1
```

---

## Règles métier Ibrahim

| Règle | Valeur |
|-------|--------|
| Durée minimum location | 2 jours |
| Pas de livraison | Vendredi |
| Tarif Ramadan | +20% |
| Remise client VIP | -10% automatique |
| Supplément aéroport Es-Sénia | 1 500 DZD |
| Seuil validation financière | 50 000 DZD |

---

## Validations requises

Ibrahim agit **de façon autonome** sauf pour :
1. **Répondre à un client** (WhatsApp / email) → validation obligatoire
2. **Engagement financier > 50 000 DZD** → validation obligatoire

---

## Variables d'environnement

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Clé API Claude |
| `SUPABASE_URL` | URL projet Supabase |
| `SUPABASE_SERVICE_KEY` | Service role key Supabase |
| `REDIS_URL` | URL Redis Upstash |
| `MOBILE_ACCESS_TOKEN` | Token auth app mobile |
| `PC_AGENT_TOKEN` | Token auth PC agent |
| `PUSHOVER_USER_KEY` | Clé utilisateur Pushover |
| `PUSHOVER_APP_TOKEN` | Token app Pushover |
| `ELEVENLABS_API_KEY` | Clé API ElevenLabs |
| `ELEVENLABS_VOICE_ID` | ID voix ElevenLabs |
