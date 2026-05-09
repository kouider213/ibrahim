# SPRINT STATUS — Dzaryx / Ibrahim / NEXUS
> **Date :** 2026-05-09  
> **Auteur :** Claude Code (Sonnet 4.6) — session Kouider  
> **But :** Permettre à n'importe quel Claude Code de reprendre instantanément le projet sans perdre le contexte.

---

## 1. État global

| Indicateur | État |
|---|---|
| TypeScript | ✅ 0 erreurs (`npx tsc --noEmit`) |
| Railway deploy | ✅ Commit `d473b41` poussé + déployé |
| Dernier commit | `d473b41` — NL Router pour OS Agent |
| Git branch | `main` — tout committé, 0 fichiers non suivis liés au projet |
| Nexus Python | Actif sur PC Windows (port 7778 WebSocket GUI, port 7777 HTTP) |
| Socket.IO | Namespace `/nexus` connecté — heartbeat 30s actif |

---

## 2. Architecture globale

```
┌─────────────────────────────────────────────────────────────────────┐
│  iPhone (App iOS / Telegram)                                        │
│    │  HTTPS + Socket.IO  /mobile                                    │
│    ▼                                                                │
│  Railway Backend (Express + TypeScript)                             │
│  https://ibrahim-backend-production.up.railway.app                  │
│    │  Socket.IO  /nexus  (PC_AGENT_TOKEN auth)                      │
│    ▼                                                                │
│  PC Windows (NEXUS — Python)                                        │
│  C:\Users\douba\OneDrive\Bureau\ibrahim\ibrahim\nexus\              │
│    nexus.py  →  modules/ws_client.py  →  modules/os_agent.py       │
└─────────────────────────────────────────────────────────────────────┘
```

### Couches

| Couche | Technologie | Rôle |
|---|---|---|
| Mobile/Telegram | iOS App + Bot Telegram | Interface utilisateur Kouider |
| Railway Backend | Express.js + TypeScript + Socket.IO | Orchestration, API REST, IA Claude |
| PC Agent (Nexus) | Python 3 + python-socketio | Agent autonome sur le PC Windows |
| OS Agent | `os_agent.py` (Python) | Contrôle fichiers, fenêtres, processus, apps, écran |
| NL Router | `nexus-nl-router.ts` (TS) | Parse les commandes naturelles Telegram → OS Agent |

---

## 3. Commits importants (2026-05-09)

```
d473b41  feat: NL router for Nexus OS Agent — intercepts Nexus, commands before Python AI
051c852  feat(nexus): OS Agent v1 — File Explorer, Window Manager, Process Manager, App Launcher, Screen Understanding
9bf38bd  feat(nexus): remote exec/restart/sysinfo/screenshot/jobs API endpoints
2c6b8ba  cleanup: zero TS errors + full production hardening
d0520c1  hardening: security + heartbeat + screenshot + sysinfo + jobstore
16f69dd  fix(workflow): cast req.params to string
25f510b  feat(test10): nexus real-execution proof endpoint
f02062b  fix(test9): autonomous pipeline — 3 bugs corrected
6abfb08  fix(workflow): async pipeline with job store to avoid Railway 60s timeout
bb88dd5  feat(multi-agent): true parallel multi-LLM agent architecture
```

---

## 4. Fichiers clés du projet Nexus

### Backend TypeScript (`backend/src/`)

| Fichier | Lignes | Rôle |
|---|---|---|
| `actions/handlers/nexus-relay.ts` | ~640 | Relais Socket.IO, télémétrie, heartbeat, sécurité, job store, tous les exports relay |
| `actions/handlers/nexus-nl-router.ts` | ~290 | **NOUVEAU** — NL Router : split, detect, execute, test |
| `api/routes/nexus.ts` | ~247 | Endpoints HTTP `/api/nexus/*` + test phantom + nl-test |
| `api/routes/nexus-os.ts` | ~167 | **NOUVEAU** — Endpoints HTTP `/api/nexus/os/*` |
| `api/routes/telegram.ts` | ~800 | Webhook Telegram + intégration NL Router |
| `index.ts` | ~278 | Express setup, Socket.IO namespaces, init services |
| `config/env.ts` | — | Validation Zod des variables d'environnement Railway |

### Python Nexus (`nexus/`)

| Fichier | Lignes | Rôle |
|---|---|---|
| `nexus.py` | 831 | Point d'entrée principal + GUI tkinter |
| `modules/ws_client.py` | 626 | Client Socket.IO, tous les event handlers |
| `modules/os_agent.py` | 541 | **NOUVEAU** — OS Agent v1 : 5 capacités |
| `modules/nexus_logger.py` | — | Logging structuré (nexus_log, jobs_log, security_log) |
| `modules/music.py` | — | Contrôle Spotify / YouTube |
| `modules/pc_control.py` | — | Volume, lock, luminosité |
| `modules/vision.py` | — | Intégration Claude Vision |
| `modules/voice.py` | — | Synthèse vocale |
| `start.bat` | — | Lance `python3.exe nexus.py` |
| `install-nexus-launcher.bat` | — | Installe Launcher comme service Windows |
| `launcher.py` | — | Veille et relance automatique de Nexus |

---

## 5. WebSocket — Namespaces Socket.IO

### Namespace `/nexus` (PC Agent ↔ Backend)

**Auth :** `PC_AGENT_TOKEN` dans `socket.handshake.auth.token`

**Events que le PC émet vers le backend :**
```
nexus:register       { mac, hostname, python, py_ver, os, os_release,
                       ram_used_mb, ram_total_mb, cpu_percent, uptime_s }
nexus:message        { text, source?, session? }  → ack({ text })
nexus:journal        { text }  → Telegram
nexus:telegram_photo { image: base64, caption? }  → sendTelegramPhoto()
nexus:telegram_file  { data: base64, filename, caption? }  → sendTelegramDocument()
```

**Events que le backend émet vers le PC (avec ack return-value) :**
```
nexus:ping              {}                          → ack({ time, hostname })
nexus:command           { text, source, chatId }    → (Python AI dispatch)
nexus:wake              { source, chatId }
nexus:run_command       { command, cwd, timeout_ms }→ ack({ ok, exit_code, stdout, stderr })
nexus:write_file        { path, content, encoding } → ack({ ok, path })
nexus:screenshot        { caption? }               → ack({ ok, size_bytes, hostname, timestamp })
nexus:sysinfo           {}                          → ack({ ok, cpu, ram, disk, ... })
nexus:save_file         { filename, data, dir }     → ack({ ok, path })
nexus:live_frame        {}                          → ack({ frame: base64 })
nexus:file_list         { path? }                   → ack(OsResult)
nexus:file_search       { query, root?, max_results? } → ack(OsResult)
nexus:file_read         { path }                    → ack(OsResult)
nexus:file_send         { path, caption? }          → ack(OsResult)
nexus:file_open         { path }                    → ack(OsResult)
nexus:window_list       {}                          → ack(OsResult)
nexus:window_focus      { title }                   → ack(OsResult)
nexus:window_close      { title }                   → ack(OsResult)
nexus:window_screenshot { caption? }               → ack(OsResult)
nexus:process_list      { top, sort }               → ack(OsResult)
nexus:process_kill      { name?, pid? }             → ack(OsResult)
nexus:app_launch        { app }                     → ack(OsResult)
nexus:screen_understand { question?, send_to_telegram, caption? } → ack(OsResult)
```

### Namespace `/launcher` (Launcher ↔ Backend)

**Auth :** `PC_AGENT_TOKEN`  
**Events :**
- `launcher:register` → identifie le Launcher (hostname, version)
- `launcher:wake` ← backend envoie pour démarrer Nexus

### Namespace `/mobile` (App iOS ↔ Backend)

**Auth :** JWT `MOBILE_ACCESS_TOKEN`

### Namespace `/desktop`

**Auth :** `PC_AGENT_TOKEN`

---

## 6. Télémétrie (`NexusTelemetry`)

Stockée dans `_tel` (nexus-relay.ts, in-memory) :

```typescript
interface NexusTelemetry {
  lastConnectedAt      : string | null   // ISO date dernière connexion
  lastDisconnectedAt   : string | null
  totalConnections     : number          // compteur lifetime
  totalDisconnections  : number
  lastDisconnectReason : string | null   // ex: "transport close"
  lastHostname         : string | null   // ex: "DESKTOP-DOUBA"
  lastSocketId         : string | null   // socket.id courant
  lastPythonExe        : string | null   // chemin python3.exe
  lastPythonVer        : string | null   // ex: "3.11.4"
  lastHeartbeatAt      : string | null
  lastHeartbeatLatency : number | null   // ms
  missedHeartbeats     : number
  lastOs               : string | null   // "Windows"
  lastOsRelease        : string | null   // "11"
  lastRamUsedMb        : number | null
  lastRamTotalMb       : number | null
  lastCpuPercent       : number | null
  lastUptimeS          : number | null
}
```

**Exposé via :** `GET /api/nexus/telemetry` et `getNexusStatus()`

---

## 7. Heartbeat

- **Intervalle :** 30 secondes
- **Mécanisme :** `nexus:ping` avec ack return-value
- **Timeout par battement :** 8 secondes
- **Seuil de déconnexion :** 3 battements manqués consécutifs
- **Action à 3 manqués :** `socket.disconnect(true)` + alerte Telegram `⚠️ NEXUS — heartbeat timeout`
- **Implémentation :** `_startHeartbeat(socket)` / `_stopHeartbeat()` dans `nexus-relay.ts`

---

## 8. Sécurité

### Côté Backend (TypeScript — `nexus-relay.ts`)

**Patterns bloqués dans `nexusRunCommand` :**
```
format [a-z]:     — formatage disque
diskpart          — outil de partition
del .*/[fsq]      — suppression forcée
rmdir /[sq]       — suppression dossier
rd /[sq]          — alias rmdir
rm -rf /          — UNIX destructif
shutdown /[rsf]   — extinction forcée
mkformat          — formatage
bcdedit           — boot config
bootrec           — réparation boot
cipher /w         — effacement sécurisé
```

Commande bloquée → status `'blocked'` dans le job, `blocked: true` dans la réponse.

### Côté Python (`os_agent.py`)

**Racines de fichiers autorisées (`_ALLOWED_ROOTS`) :**
```python
C:\Users\douba\Desktop
C:\Users\douba\Documents
C:\Users\douba\Downloads
C:\Users\douba\Pictures
C:\Users\douba\Videos
C:\Users\douba\Music
C:\Users\douba\OneDrive\Bureau
C:\Users\douba\AppData\Local\Temp
```

Toute opération fichier hors de ces racines → refus + `log_security_event()`

**Processus qu'on peut tuer (`_KILL_WHITELIST`) :**
```
chrome, msedge, firefox, brave, opera,
spotify, discord, telegram, code,
capcut, notepad, wordpad, vlc, wmplayer,
runwayml, runway
```

**Apps pouvant être lancées (`_APP_REGISTRY`) :**
```
chrome    → C:\Program Files\Google\Chrome\Application\chrome.exe
vscode    → C:\Users\douba\AppData\Local\Programs\Microsoft VS Code\Code.exe
telegram  → C:\Users\douba\AppData\Roaming\Telegram Desktop\Telegram.exe
spotify   → C:\Users\douba\AppData\Roaming\Spotify\Spotify.exe
terminal  → wt
notepad   → notepad
explorer  → explorer
dzaryx    → explorer C:\Users\douba\OneDrive\Bureau\ibrahim\ibrahim
capcut    → powershell Start-Process "shell:AppsFolder\7468.309454D4F49E_wbnn1bbqfj7rb!App"
```

---

## 9. Job Store (`nexus-relay.ts`)

```typescript
interface NexusJob {
  jobId      : string          // "njob_{timestamp}_{random5}"
  command    : string
  cwd        : string | null
  status     : 'pending' | 'running' | 'completed' | 'failed' | 'timeout' | 'blocked'
  startedAt  : string          // ISO
  completedAt?: string
  exit_code? : number
  stdout?    : string
  stderr?    : string
  error?     : string
  retries    : number
}
```

- **Capacité :** 100 jobs max (FIFO sur overflow)
- **OS Agent IDs :** `os_{timestamp_ms}_{uuid5}`
- **Endpoints :** `GET /api/nexus/jobs`, `GET /api/nexus/jobs/:jobId`

---

## 10. OS Agent — Phase 1 (COMPLET)

### Fichier Python : `nexus/modules/os_agent.py` (541 lignes)

### Capacité 1 : File Explorer
| Fonction | Event Socket.IO | Description |
|---|---|---|
| `file_list(data)` | `nexus:file_list` | Liste un répertoire (défaut: Bureau) |
| `file_search(data)` | `nexus:file_search` | Recherche récursive par nom (max 50 résultats) |
| `file_read(data)` | `nexus:file_read` | Lit un fichier texte |
| `file_send(data, sio)` | `nexus:file_send` | Envoie un fichier sur Telegram via `nexus:telegram_file` |
| `file_open(data)` | `nexus:file_open` | Ouvre dans l'app par défaut (PowerShell `Start-Process`) |

### Capacité 2 : Window Manager
| Fonction | Event Socket.IO | Description |
|---|---|---|
| `window_list(data)` | `nexus:window_list` | Liste les fenêtres ouvertes (Get-Process MainWindowTitle) |
| `window_focus(data)` | `nexus:window_focus` | Met une fenêtre en avant (AppActivate VB) |
| `window_close(data)` | `nexus:window_close` | Ferme une fenêtre (taskkill /IM, whitelist) |
| `window_screenshot(data, sio)` | `nexus:window_screenshot` | Screenshot + Telegram via `nexus:telegram_photo` |

### Capacité 3 : Process Manager
| Fonction | Event Socket.IO | Description |
|---|---|---|
| `process_list(data)` | `nexus:process_list` | Top N processus par RAM ou CPU (psutil) |
| `process_kill(data)` | `nexus:process_kill` | Kill par nom ou PID (whitelist obligatoire) |

### Capacité 4 : App Launcher
| Fonction | Event Socket.IO | Description |
|---|---|---|
| `app_launch(data)` | `nexus:app_launch` | Lance une app du registry (DETACHED_PROCESS) |

### Capacité 5 : Screen Understanding
| Fonction | Event Socket.IO | Description |
|---|---|---|
| `screen_understand(data, sio)` | `nexus:screen_understand` | Screenshot → Claude Haiku Vision → analyse + Telegram |

**Modèle IA utilisé :** `claude-haiku-4-5-20251001`  
**Taille screenshots observée :** 162–214 KB  
**Retour :** `{ ok, job_id, analysis, sent_to_telegram, size_bytes, hostname }`

---

## 11. Endpoints HTTP existants (complet)

### `/api/nexus/*`

| Méthode | Endpoint | Body / Query | Réponse |
|---|---|---|---|
| GET | `/api/nexus/status` | — | `{ connected, mac, ip }` |
| POST | `/api/nexus/ping` | — | `{ ok, time, hostname, latency_ms }` |
| POST | `/api/nexus/wake` | — | `{ ok, status, message }` |
| GET | `/api/nexus/full-status` | — | `{ nexus: {...}, launcher: {...} }` |
| GET | `/api/nexus/telemetry` | — | Tous les champs `NexusTelemetry` |
| POST | `/api/nexus/exec` | `{ command, cwd?, timeout_ms? }` | `{ ok, exit_code, stdout, stderr, jobId, blocked }` |
| POST | `/api/nexus/sysinfo` | — | `{ ok, cpu, ram, disk, ... }` |
| POST | `/api/nexus/screenshot` | `{ caption? }` | `{ ok, sent_to_telegram, size_bytes, size_kb, timestamp, hostname }` |
| GET | `/api/nexus/jobs` | — | `{ ok, jobs: [...] }` (20 derniers, inversés) |
| GET | `/api/nexus/jobs/:jobId` | — | `{ ok, job }` |
| POST | `/api/nexus/restart` | — | Rolling restart (répond immédiatement, process async) |
| POST | `/api/nexus/test-phantom` | `{ scenario? }` | Test du phantom guard |
| POST | `/api/nexus/nl-test` | `{ text? }` ou `{ cases[] }` | **NOUVEAU** Dry-run NL Router |

### `/api/nexus/os/*`

| Méthode | Endpoint | Body | Réponse `OsResult` |
|---|---|---|---|
| POST | `/api/nexus/os/file/list` | `{ path? }` | `{ ok, job_id, entries[] }` |
| POST | `/api/nexus/os/file/search` | `{ query, root?, max_results? }` | `{ ok, job_id, results[] }` |
| POST | `/api/nexus/os/file/read` | `{ path }` | `{ ok, job_id, content }` |
| POST | `/api/nexus/os/file/send` | `{ path, caption? }` | `{ ok, job_id }` |
| POST | `/api/nexus/os/file/open` | `{ path }` | `{ ok, job_id }` |
| GET | `/api/nexus/os/window/list` | — | `{ ok, job_id, windows[] }` |
| POST | `/api/nexus/os/window/focus` | `{ title }` | `{ ok, job_id }` |
| POST | `/api/nexus/os/window/close` | `{ title }` | `{ ok, job_id }` |
| POST | `/api/nexus/os/window/screenshot` | `{ caption? }` | `{ ok, job_id }` |
| GET | `/api/nexus/os/process/list` | `?top=30&sort=ram` | `{ ok, job_id, processes[] }` |
| POST | `/api/nexus/os/process/kill` | `{ name } ou { pid }` | `{ ok, job_id }` |
| POST | `/api/nexus/os/app/launch` | `{ app }` | `{ ok, job_id }` |
| POST | `/api/nexus/os/screen/understand` | `{ question?, send_to_telegram?, caption? }` | `{ ok, job_id, analysis }` |

**Tous les endpoints `/api/nexus/*` et `/api/nexus/os/*` :**
- Auth : `requireMobileAuth` middleware
- Rate limit : `apiLimiter` (120 req/min)
- Guard : `isNexusOnline()` → 503 si hors ligne

---

## 12. NL Router (`nexus-nl-router.ts`)

### Objectif
Intercepter les messages Telegram préfixés `Nexus, ...` et les router vers l'OS Agent au lieu du Python AI (qui misclassifiait "montre-moi mon bureau" comme commande caméra).

### Architecture du flux Telegram

```
Telegram message "Nexus, montre-moi mon bureau"
    ↓
NEXUS_WAKE_RE ?  → non
    ↓
NEXUS_CMD_RE match ? → oui : routeNexusMessage(text)
    ↓
splitCommands("Nexus, montre-moi mon bureau")
    → ["montre-moi mon bureau"]
    ↓
detectIntent("montre-moi mon bureau")
    → { type: "screen_understand", confidence: 0.88 }
    ↓
executeIntent → nexusScreenUnderstand(question, true, ...)
    ↓
sendMessage(chatId, "👁️ Analyse de l'écran : ...")

                      ↘ si intent=unknown & cmd seul
                          → Python AI (nexus:command)
```

### Intents supportés (15)

| Intent | Exemple | Confiance |
|---|---|---|
| `screen_understand` | "montre-moi mon bureau", "que vois-tu", "analyse l'écran" | 0.88 |
| `screenshot` | "screenshot", "capture écran", "prends un screenshot" | 0.92 |
| `app_launch` | "lance chrome", "ouvre spotify", "démarre vscode" | 0.90 |
| `nexus_status` | "nexus en ligne ?", "tu es là ?" | 0.90 |
| `file_send` | "envoie le fichier rapport.pdf" | 0.88 |
| `file_list` | "liste les fichiers du bureau" | 0.85 |
| `file_search` | "cherche un fichier config" | 0.85 |
| `file_read` | "lis le fichier readme.txt" | 0.85 |
| `process_list` | "liste les processus", "top RAM" | 0.85 |
| `process_kill` | "tue chrome", "kill notepad" | 0.85 |
| `window_list` | "liste les fenêtres ouvertes" | 0.85 |
| `window_screenshot` | "screenshot de la fenêtre" | 0.85 |
| `file_open` | "ouvre le fichier test.pdf" | 0.82 |
| `window_close` | "ferme la fenêtre chrome" | 0.82 |
| `window_focus` | "focus sur vscode" | 0.78 |
| `unknown` | "joue du Lacrim", "appelle maman" | 0.00 → Python AI |

### Aliases path (résolution automatique)

| Alias | Chemin réel |
|---|---|
| `bureau` / `desktop` | `C:\Users\douba\OneDrive\Bureau` |
| `documents` | `C:\Users\douba\Documents` |
| `téléchargements` / `downloads` | `C:\Users\douba\Downloads` |
| `images` / `photos` | `C:\Users\douba\Pictures` |
| `vidéos` / `videos` | `C:\Users\douba\Videos` |
| `ibrahim` / `projet` | `C:\Users\douba\OneDrive\Bureau\ibrahim\ibrahim` |
| `nexus` | `...\ibrahim\ibrahim\nexus` |
| `backend` | `...\ibrahim\ibrahim\backend` |

### Aliases app

| Alias | App |
|---|---|
| chrome, google, navigateur, browser | `chrome` |
| vscode, vs code, code, éditeur | `vscode` |
| telegram, tg | `telegram` |
| spotify | `spotify` |
| terminal, cmd, powershell, console, wt | `terminal` |
| notepad, bloc-notes | `notepad` |
| explorer, explorateur | `explorer` |
| dzaryx, ibrahim | `dzaryx` |
| capcut | `capcut` |

### Comportement multi-ligne

```
"Nexus,
1. montre-moi mon bureau
2. liste les fichiers du bureau  
3. lance chrome"

→ splitCommands → 3 commandes
→ detectIntent × 3 : screen_understand, file_list, app_launch
→ executeIntent × 3 séquentiellement
→ sendMessage × 3 résultats
```

Commande inconnue dans un message multi-ligne : `ℹ️ Non reconnu : _appelle maman_`  
Commande inconnue seule : fall-through vers Python AI (`nexus:command`)

### Tests validés (inline, sans serveur)

```
✅ "Nexus, montre-moi mon bureau"                → screen_understand (0.88)
✅ "Nexus, screenshot"                           → screenshot (0.92)
✅ "Nexus, lance chrome"                         → app_launch (0.90)
✅ "Nexus, lance spotify"                        → app_launch (0.90)
✅ "Nexus, liste les fenetres ouvertes"          → window_list (0.85)
✅ "Nexus, liste les processus"                  → process_list (0.85)
✅ "Nexus, capture ecran"                        → screenshot (0.92)
✅ "Nexus, joue du Lacrim"                       → unknown → Python AI
8/8 passed
```

---

## 13. Logs

### Format des logs NL Router
```
[NL-ROUTER] cmd="montre-moi mon bureau" intent=screen_understand confidence=0.88 route=os_agent elapsed=2ms
[NL-ROUTER] executed intent=screen_understand success=true elapsed=4231ms
```

### Format logs Nexus relay
```
[NEXUS] PC Agent connected: abc123 — IP: 41.x.x.x
[NEXUS] Registered: MAC=AA:BB:CC:DD:EE:FF host=DESKTOP-DOUBA py=C:\...\python3.exe ram=4200/16384MB cpu=12%
[NEXUS] Heartbeat missed (1/3)
[NEXUS] 3 missed heartbeats — forcing disconnect
[NEXUS] Old PID 9940 killed. New socket: xyz789
[NEXUS] Socket ID unchanged after 20s — new process may not have connected yet
```

### Format logs OS Agent (Python)
```
nexus_log: file_list OK path=C:\Users\douba\OneDrive\Bureau entries=42
security_log: BLOCKED file_list_denied path=C:\Windows\System32
jobs_log: os_1234567890_abc12 completed ok=True
```

### Logs Telegram
```
[NL-ROUTER] cmd="..." intent=... → visible dans Railway logs
[incoming-dedupe] blocked=true key="..." messageId=... age=2300ms
[incoming-dedupe] allowed=true key="..."
```

---

## 14. Tests validés

| Test | Résultat | Date |
|---|---|---|
| TEST 10 : nexus real-exec shell command | ✅ Commit `25f510b` | 2026-05-09 |
| TEST 11 : kill zombie PID 9940, restart Nexus | ✅ Manuel via Claude Code local | 2026-05-09 |
| OS Agent file_list, file_search | ✅ Via `/api/nexus/os/file/*` | 2026-05-09 |
| OS Agent file_read | ✅ Testé sur fichier réel | 2026-05-09 |
| OS Agent file_send → Telegram | ✅ Fichier reçu sur Telegram | 2026-05-09 |
| OS Agent window_list | ✅ Retour JSON correct | 2026-05-09 |
| OS Agent process_list | ✅ Top 20 processus RAM | 2026-05-09 |
| OS Agent app_launch (chrome) | ✅ Chrome s'ouvre | 2026-05-09 |
| OS Agent screen_understand | ✅ Analyse Claude Haiku 162-214KB | 2026-05-09 |
| NL Router : 8 patterns inline | ✅ 8/8 passed | 2026-05-09 |
| TypeScript : 0 erreurs | ✅ `npx tsc --noEmit` | 2026-05-09 |
| Railway deploy : d473b41 | ✅ Pusher + déployé | 2026-05-09 |

---

## 15. Configuration système (PC Windows)

```
User     : C:\Users\douba
Python   : C:\Users\douba\AppData\Local\Python\bin\python3.exe
Nexus    : C:\Users\douba\OneDrive\Bureau\ibrahim\ibrahim\nexus\nexus.py
Backend  : C:\Users\douba\OneDrive\Bureau\ibrahim\ibrahim\backend\
Git repo : https://github.com/kouider213/ibrahim.git
Port WS  : 7778 (Nexus GUI WebSocket)
Port HTTP: 7777 (Nexus HTTP interne)
Railway  : https://ibrahim-backend-production.up.railway.app
```

### Démarrage Nexus
```batch
cd C:\Users\douba\OneDrive\Bureau\ibrahim\ibrahim\nexus
python3.exe nexus.py
```
ou double-cliquer `start.bat`

### Restart à distance
```
POST /api/nexus/restart
→ Répond immédiatement
→ Lance nouvelle instance python3.exe nexus.py (détachée)
→ Attend 20s que nouvelle connexion Socket.IO s'établisse
→ Kill ancienne instance par PID
→ Vérification via GET /api/nexus/telemetry (socket_id doit changer)
```

---

## 16. `OsResult` — Interface de retour OS Agent

```typescript
export interface OsResult {
  ok      : boolean
  job_id  : string
  error?  : string
  // Champs additionnels selon la commande :
  // file_list    → entries: [{ name, type, size?, modified }]
  // file_search  → results: string[]
  // file_read    → content: string
  // window_list  → windows: [{ title, process? }]
  // process_list → processes: [{ name, pid, ram_mb, cpu }]
  // screen_understand → analysis: string, sent_to_telegram: bool, size_bytes: number
  // screenshot   → sent_to_telegram: bool, size_bytes: number, hostname: string
  [k: string]: unknown
}
```

---

## 17. Phantom Guard (protection anti-hallucination)

**Fichier :** `src/conversation/response-guard.ts`  
**Fonction :** `phantomGuard(response, toolsExecuted, userMessage, requestId)`

- Bloque les réponses Claude qui prétendent avoir fait une action sans outil réel
- Si outil `success: false` → bloque la réponse "Corrigé ✅"
- Si aucun outil exécuté mais réponse contient "corrigé/modifié/pushé" → bloque
- Réponse bloquée → remplacée par `PHANTOM_REFUSAL`
- **Test endpoint :** `POST /api/nexus/test-phantom?scenario=phantom_no_tool|legitimate_with_tool|phantom_failed_tool|normal_response`

---

## 18. Problèmes résolus (historique session)

| Problème | Fix |
|---|---|
| Port 7778 occupé par zombie (PID 9940) | `Get-NetTCPConnection -LocalPort 7778 | OwningProcess` → `taskkill /PID 9940 /F` |
| `nexus_restart_err.log: can't open nexus_main.py` | Fix `restart` endpoint : `nexus.py` au lieu de `nexus_main.py`, `NEXUS_EXE` corrigé |
| Dead code TS error dans nexus-os.ts | Suppression des helpers `offline()` et `nexusCheck()` inutilisés |
| "montre-moi mon bureau" → Python AI → caméra | **NL Router** : intercepte `NEXUS_CMD_RE`, route vers `screen_understand` |
| datetime manquant dans ws_client.py | Import ajouté (commit `a82122d`) |

---

## 19. Problèmes restants / À surveiller

1. **NL Router — test réel Telegram non encore fait**  
   → Envoyer "Nexus, montre-moi mon bureau" depuis Telegram après deploy Railway  
   → Vérifier : réponse `👁️ Analyse de l'écran :` au lieu de `📺 NEXUS: 📷 Caméra → app + PC`

2. **`/api/nexus/nl-test` non testé en production**  
   → Appeler `POST /api/nexus/nl-test` (pas de body) pour valider la suite de 7 cas

3. **`screen_understand` : champ `analysis` dans la réponse Python**  
   → Confirmer que `os_agent.py::screen_understand()` retourne bien `analysis` dans le dict  
   → Sinon le NL Router affiche "Analyse terminée — envoyée sur Telegram." sans le texte

4. **Path aliases : bureau ≠ Desktop Windows**  
   → `bureau` résout vers `C:\Users\douba\OneDrive\Bureau` (OneDrive), pas `C:\Users\douba\Desktop`  
   → C'est intentionnel (Desktop Windows est vide, le "bureau" de travail est OneDrive\Bureau)

5. **Messages multi-lignes : test réel manquant**  
   → Envoyer depuis Telegram :
   ```
   Nexus,
   1. liste les fichiers du bureau
   2. lance chrome
   3. screenshot
   ```
   → Doit retourner 3 réponses séquentielles

6. **Camera commands (auto-route) non touchées**  
   → `NEXUS_MUSIC_RE`, `NEXUS_VOL_RE`, `NEXUS_PAUSE_RE`, `NEXUS_MEDIA_RE`, `NEXUS_SCREEN_RE`  
   → Toujours routées vers Python AI directement (intentionnel — musique fonctionne bien)

---

## 20. TODO exact pour demain

### Priorité 1 — Validation réelle
- [ ] **Tester Telegram** : "Nexus, montre-moi mon bureau" → doit retourner analyse écran
- [ ] **Tester Telegram** : message multi-lignes numérotés → 3 réponses séquentielles
- [ ] **Tester** `POST /api/nexus/nl-test` via curl/Postman → valider suite 7 cas
- [ ] **Confirmer** que `os_agent.py::screen_understand()` retourne `analysis` dans le dict

### Priorité 2 — OS Agent Phase 2 (si Phase 1 validée)
- [ ] **Clipboard** : lire/écrire le presse-papier Windows (`pyperclip` ou PowerShell)
- [ ] **Keyboard/Mouse** : `pyautogui` — taper du texte, cliquer, scroller
- [ ] **Audio** : contrôle volume système, mute/unmute (déjà partiellement dans `pc_control.py`)
- [ ] **Notifications** : envoyer une notification Windows toast
- [ ] **Display** : changer résolution, luminosité, disposition écrans

### Priorité 3 — NL Router améliorations
- [ ] **Intent `clipboard`** : "lis le presse-papier", "copie X dans le presse-papier"
- [ ] **Intent `type_text`** : "tape 'hello' dans la fenêtre active"
- [ ] **Intent `open_url`** : "ouvre google.com dans Chrome"
- [ ] **Améliorer confidence** sur les faux positifs potentiels (window_focus vs file_open)

### Priorité 4 — Infrastructure
- [ ] **Nexus auto-reconnect** : si Railway redémarre (rolling deploy), Nexus doit se reconnecter automatiquement (actuellement géré par `launcher.py`)
- [ ] **Persistent job store** : Supabase pour les jobs (actuellement in-memory, perdu au restart)
- [ ] **Rate limit OS Agent** : limiter les opérations lourdes (screen_understand) à 5/min par user

---

## 21. Variables d'environnement Railway (obligatoires)

```env
ANTHROPIC_API_KEY       — Claude API
SUPABASE_URL            — Base de données
SUPABASE_SERVICE_KEY    — Auth Supabase
REDIS_URL               — Queue jobs
MOBILE_ACCESS_TOKEN     — Auth app mobile
PC_AGENT_TOKEN          — Auth Nexus WebSocket
WEBHOOK_SECRET          — Telegram webhook
SESSION_SECRET          — Sessions
PUSHOVER_USER_KEY       — Notifications Pushover
PUSHOVER_APP_TOKEN      — Notifications Pushover
ELEVENLABS_API_KEY      — TTS
ELEVENLABS_VOICE_ID     — Voix TTS
TELEGRAM_BOT_TOKEN      — Bot Telegram
BACKEND_URL             — https://ibrahim-backend-production.up.railway.app
```

---

## 22. Commandes utiles pour reprendre

```bash
# Vérifier TypeScript
cd backend && npx tsc --noEmit

# Voir l'état Nexus
curl -H "Authorization: Bearer $TOKEN" https://ibrahim-backend-production.up.railway.app/api/nexus/status

# Tester NL Router (dry-run)
curl -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  https://ibrahim-backend-production.up.railway.app/api/nexus/nl-test

# Tester une commande OS Agent
curl -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"path": "C:\\Users\\douba\\OneDrive\\Bureau"}' \
  https://ibrahim-backend-production.up.railway.app/api/nexus/os/file/list

# Commit + push standard
cd backend
git add -A && git commit -m "feat: ..." && git push origin main

# Rebuild TS local (si besoin de tester le dist/)
npx tsc
```

---

*Généré le 2026-05-09 par Claude Code (Sonnet 4.6) — session ibrahim/Kouider*
