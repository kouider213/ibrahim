# DZARYX — Instructions Agent AI (CLAUDE.md)

> Lu automatiquement par Claude Code à chaque session.
> Tout agent AI (Claude, Codex, Cursor) suit ces règles SANS EXCEPTION.

---

## ÉTAPE 1 — LIRE EN PREMIER (obligatoire)

1. `DZARYX/CURRENT_STATE.md` ← **état exact du projet maintenant**
2. `DZARYX/BUGS.md` ← bugs ouverts (priorité travail)
3. `DZARYX/ROADMAP.md` ← feuille de route
4. `DZARYX/ARCHITECTURE.md` ← si tu ne connais pas le projet

---

## STRUCTURE DU PROJET (tout le dossier ibrahim/)

```
ibrahim/
├── backend/          ← API Node.js TypeScript — Railway (PRINCIPAL)
├── mobile/           ← App React PWA — Netlify
├── nexus/            ← Agent Python PC — tourne sur PC Kouider (PRINCIPAL)
├── pc-agent/         ← Agent TypeScript PC — alternative à Nexus
├── flight-bot/       ← Bot Telegram vols (usage personnel Kouider)
├── interface-ibrahim/ ← Prototypes HTML design
├── supabase/         ← Migrations SQL
├── scripts/          ← migrate.mjs et autres scripts
└── DZARYX/           ← Documentation Obsidian (CE DOSSIER)
```

---

## LES 4 COMPOSANTS PRINCIPAUX

### 1. BACKEND (`backend/`) — TypeScript + Express + Railway
Point d'entrée de toute l'intelligence. Reçoit les messages Telegram/Mobile,
orchestre Claude AI, exécute les outils Supabase, répond.

**Démarrage dev** : `cd backend && npm run dev`
**Build** : `cd backend && npm run build`
**Push main** → Railway redéploie automatiquement

**Namespace Socket.IO** :
- `/` — connexions mobiles/générales
- `/nexus` — agent Python Nexus
- `/pc` — agent TypeScript pc-agent

---

### 2. NEXUS (`nexus/`) — Python — Agent PC principal
Agent Python qui tourne sur le **PC Windows de Kouider**.
Connecté au backend via Socket.IO namespace `/nexus`.
Plus complet et sécurisé que pc-agent/.

**Démarrage** : `python nexus.py` (ou via `launcher.py`)
**Watchdog** : `nexus_watchdog.py` redémarre si crash

**Events Socket.IO gérés** :
- `nexus:command` — commande AI relayée
- `nexus:run_command` — shell avec sécurité + blocklist
- `nexus:terminal_run` — terminal avec streaming SSE live (asyncio)
- `nexus:terminal_chunk` — chunk streaming par ligne
- `nexus:screenshot` — capture écran → Telegram
- `nexus:sysinfo` — RAM, CPU, uptime
- `nexus:write_file`, `nexus:save_file`
- `nexus:live_frame` — caméra live

**Sécurité** : blocklist (format, diskpart, rm -rf...), allowlist commandes sûres

---

### 3. MOBILE (`mobile/`) — React 18 + Vite + TailwindCSS — Netlify
PWA accessible depuis iPhone/Android de Kouider.

**Pages** :
- `/` — ChatInterface (chat avec Dzaryx)
- `/dashboard` — Dashboard complet

**Panels Dashboard** :
- `LiveRevenue` — revenus temps réel
- `AIAlerts` — alertes AI
- `LiveFleet` — état du parc véhicules
- `WhatsAppAI` — intégration WhatsApp
- `TikTokAI` — automatisation TikTok
- `DzaryxCore` — état du système AI
- `VoiceMode` — mode vocal
- `ValidationQueue` — file d'attente validations

**Démarrage dev** : `cd mobile && npm run dev`
**Build** : `cd mobile && npm run build`
**Deploy** : Netlify (netlify.toml à la racine)

---

### 4. PC-AGENT (`pc-agent/`) — TypeScript — Agent PC alternatif
Version TypeScript plus légère que Nexus. Namespace `/pc`.

**Actions** : `pc_run_command`, `pc_open_file`, `pc_screenshot`, `pc_list_files`, `pc_read_file`
**Sécurité** : blocklist rm -rf, del /f, format, shutdown, reboot, mkfs

---

### 5. FLIGHT-BOT (`flight-bot/`) — Python — Bot vols personnel
Bot Telegram séparé. Surveille les vols Bruxelles/Paris/Lille → Oran (juillet 2026).
Alerte Kouider si prix < 1500€. Indépendant du reste de Dzaryx.

---

## RÈGLES DE CODE (jamais déroger)

```
1. cd backend && npx tsc --noEmit → 0 erreurs AVANT tout commit
2. Profit = (client_price_per_day - owner_price_per_day) × nb_days
   JAMAIS catalog.benefit / catalog.kouiderPrice / catalog.houariPrice
3. Si owner_price_per_day NULL → profit = null (jamais inventé)
4. git add <fichiers spécifiques> — JAMAIS git add -A ou git add .
5. Tests obligatoires après changements financiers :
   cd backend && npx tsx --env-file ../.env src/tests/financial-calculations.test.ts
```

---

## APRÈS CHAQUE MODIFICATION (obligatoire)

| Action | Fichier à mettre à jour |
|---|---|
| Bug fixé | `DZARYX/BUGS.md` → 🔴 OUVERT → ✅ FIXÉ |
| Feature ajoutée | `DZARYX/ROADMAP.md` → 🔵 → ✅ |
| N'importe quoi | `DZARYX/CHANGELOG.md` → nouvelle entrée en haut |
| Fin de session | `DZARYX/CURRENT_STATE.md` → mettre à jour tout |

---

## FICHIERS CRITIQUES

| Fichier | Rôle |
|---|---|
| `backend/src/conversation/orchestrator.ts` | Point entrée AI + Guards 1-4 |
| `backend/src/integrations/finance.ts` | `computeBookingFinancials()` — calculs réels |
| `backend/src/integrations/phase5-finance.ts` | `resolveFinancials()` — dashboard |
| `backend/src/bi/revenue-intelligence.ts` | Revenus semaine/mois |
| `backend/src/orchestrator/anti-hallucination.ts` | Gates 2+3 bloquants |
| `backend/src/integrations/tool-executor.ts` | Outils Claude → Supabase |
| `nexus/modules/ws_client.py` | Events Socket.IO Nexus |
| `nexus/modules/os_agent.py` | Terminal streaming SSE |
| `mobile/src/app.tsx` | Routes Mobile PWA |
| `DZARYX/HANDOFF.md` | Guide complet agent AI |

---

## DÉPLOIEMENT

```bash
# Backend (Railway auto-deploy)
git add <fichiers backend/>
git commit -m "type: description\n\nCo-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
git push origin main

# Mobile (Netlify — si modifs mobile/)
cd mobile && npm run build
# puis commit + push → Netlify détecte automatiquement

# Nexus (PC Kouider — redémarrage manuel)
# Modifier nexus/ → redémarrer nexus.py sur le PC
```

---

## BASE DE DONNÉES

Supabase. Tables : `bookings`, `cars`, `profiles`, `payments`, `reviews`, `pricing`, `document_access_logs`, `payment_logs`
Voir `DZARYX/DATABASE.md` pour schéma complet.
