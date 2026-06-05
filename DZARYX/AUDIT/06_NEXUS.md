# 06 — Nexus (Agent PC)

> Dossier : `ibrahim/nexus` · Techno : **Python + Socket.IO** · Tourne sur le **PC Windows de Kouider**
> Retour : [[🏠 HUB]]

---

## Rôle

Nexus donne à Dzaryx le contrôle du **PC de Kouider** (façon Jarvis). Connecté au backend Railway via
Socket.IO namespace **`/nexus`**. Plus complet et sécurisé que l'alternative `pc-agent/` (TypeScript, namespace `/pc`).

```mermaid
graph LR
    K["Kouider (app/voix)"] --> BACK["Backend Railway"]
    BACK -->|"Socket.IO /nexus"| NEXUS["Nexus (PC)"]
    NEXUS -->|shell, fichiers, vision, voix| PC["PC Windows"]
    NEXUS -->|résultats / screenshots| BACK
```

---

## Démarrage

```powershell
cd ibrahim/nexus
python nexus.py          # ou launcher.py
```
- **Watchdog** : `nexus_watchdog.py` redémarre Nexus s'il crash.
- Redémarrage **manuel** après modif (pas d'auto-deploy, c'est sur le PC).

---

## Fichiers principaux

| Fichier | Rôle |
|---------|------|
| `nexus.py` | Point d'entrée |
| `launcher.py` | Lanceur |
| `nexus_watchdog.py` | Redémarre si crash |
| `modules/ws_client.py` | ⭐ Connexion Socket.IO + tous les events |
| `modules/os_agent.py` | Terminal avec streaming SSE live (asyncio) |
| `modules/pc_control.py` / `pc_agent.py` | Contrôle PC |
| `modules/file_manager.py` | Lecture/écriture fichiers |
| `modules/git_manager.py` | Opérations git |
| `modules/claude_code.py` | Intégration Claude Code |
| `modules/vision.py` | Capture écran / caméra / vision |
| `modules/voice.py` + `wake_word.py` | Voix + mot d'activation |
| `modules/input_control.py` | Clavier/souris |
| `modules/app_installer.py` | Installe des apps |
| `modules/morning_briefing.py` / `night_watch.py` / `proactive.py` | Briefings + surveillance proactive |
| `modules/tiktok.py` / `music.py` | TikTok, musique |
| `modules/wol.py` / `auto_unlock.py` | Wake-on-LAN, déverrouillage auto |
| `modules/agents.py` | Agents locaux |

---

## Events Socket.IO (`/nexus`)

| Event | Action |
|-------|--------|
| `nexus:command` | Commande IA relayée |
| `nexus:run_command` | Shell avec sécurité + blocklist |
| `nexus:terminal_run` | Terminal streaming SSE live |
| `nexus:terminal_chunk` | Chunk streaming par ligne |
| `nexus:screenshot` | Capture écran → app/Telegram |
| `nexus:sysinfo` | RAM, CPU, uptime |
| `nexus:write_file` / `nexus:save_file` | Écriture fichiers |
| `nexus:live_frame` | Caméra live |

---

## Sécurité

- **Blocklist** : `format`, `diskpart`, `rm -rf`, `del /f`, `shutdown`, `reboot`, `mkfs`...
- **Allowlist** de commandes sûres.
- Contrôle d'accès via `PC_AGENT_TOKEN`.

---

## Notifications proactives Nexus

Réglage env **`NEXUS_PROACTIVE_ENABLED`** : `'true'` = Nexus peut pousser des proactifs vers l'app.
**Absent/autre = OFF par défaut** (anti-spam : Kouider recevait les mêmes alertes Nexus en boucle).
Voir [[08_DECISIONS]].

---

## Obsidian bridge

Nexus accède au **vault Obsidian** local (mémoire long-terme : profils clients, notes). Outils côté backend :
`obsidian_find_vault, obsidian_read_client, obsidian_update_client, obsidian_list_clients, obsidian_write_note`.
Si Nexus offline → l'agent Obsidian répond "Nexus offline, impossible d'accéder au vault".
