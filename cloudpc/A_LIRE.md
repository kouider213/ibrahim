# PC cloud — bureau virtuel toujours allumé (VPS) — 2026-10-14

Pour quand le laptop de Kouider (Nexus) est éteint ou qu'il est en Algérie. Ce n'est PAS son laptop : pas ses
fichiers ni ses logiciels Windows — un deuxième ordinateur avec Google Chrome qui garde ses connexions.

| pm2 | rôle |
|---|---|
| `dzaryx-cloudpc-desktop` | `desktop.sh` : Xvfb :50 (1366×768) + openbox + Google Chrome (profil `/root/cloudpc-data/profile`, CDP 127.0.0.1:9223), relancé s'il se ferme |
| `dzaryx-cloudpc` | `agent.py` (venv `cloudpc/.venv`) : Socket.IO `/cloudpc` du backend Railway, jeton PC_AGENT_TOKEN — image, clic/glisser/défiler (xdotool), clavier, ouvrir une adresse, onglets, texte de la page |
| `dzaryx-browser` | `browser-worker/worker.py` avec `BROWSER_CDP_URL` (dans `/root/dzaryx/.env`) : les `browser_task` de Dzaryx tournent dans CE Chrome, visibles en direct |

Backend : `actions/handlers/cloudpc-relay.ts` (outil `cloud_pc`), routes `/api/nexus/live/*` avec `target:'cloud'`,
`/targets`, `/open`, `/restart-browser`. App : MON PC → bouton « ☁️ PC cloud » (choisi tout seul si le laptop est éteint).
Auto-test 7h45 : vérifie agent + Chrome.

Limites : serveur aux Pays-Bas (Google en néerlandais au début, résultats localisés ; Ouedkniss bloque l'adresse).
Ne pas automatiser WhatsApp Web (risque de blocage du numéro).
Dépannage : `pm2 logs dzaryx-cloudpc`, `curl 127.0.0.1:9223/json/version`, `/root/cloudpc-data/chrome.log`.
