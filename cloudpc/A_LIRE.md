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

## Fonctions (2026-10-14 soir)
- **Fichiers** : dossier `/root/cloudpc-data/downloads` = téléchargements de Chrome (sans question) + fichiers envoyés du
  téléphone (`/upload`, 15 Mo). Nouveau téléchargement → Supabase Storage (bucket privé `cloudpc`, lien 72 h) → copie dans
  le Drive pro « Dzaryx — PC cloud » + notification (lien « Regarder » = `nexus-cloud`). Boutons : 📱 téléphone (lien 24 h),
  ✈️ Telegram (dépôt dans `tgcall/outbox` : `<stamp>.txt` + `<stamp>.<nom>` → envoyé comme document), 📂 ouvrir
  (Word/Excel → LibreOffice en français, sinon Chrome), 🗑️.
- **Presse-papiers** (xclip) : coller du téléphone vers le PC (avec Ctrl+V auto) et récupérer.
- **Onglets** listés dans l'app (afficher / fermer), zoom, Ctrl+F, capture → Telegram.
- **Surveillance de pages** (`watch_page`, job `cloud-watch` */15) : page lue en arrière-plan (onglet CDP `background`),
  valeur suivie extraite par Haiku ou changement important de la page → app + Telegram. 3 échecs → prévenu.
- **Tâches web programmées** (`web_routine`, job `cloud-routines` */5, heure de Bruxelles) → `browser_task`.
- Routes `/api/nexus/live/*` réservées à Kouider ; outils cloud/browser refusés aux sessions de Houari.

Limites : serveur aux Pays-Bas (Google en néerlandais au début, résultats localisés ; Ouedkniss bloque l'adresse).

## WhatsApp Business (2026-10-15, demande de Kouider)
`whatsapp_web.py` : web.whatsapp.com connecté comme APPAREIL (numéro +32 466 31 14 69, code par numéro). Toutes les 20 s,
liste les discussions non lues SANS les ouvrir → `cloud:wa_new` → backend `integrations/whatsapp-web.ts` : réponse
proposée (agent lecture seule), app + Telegram, appel si location / situation délicate. Outil `whatsapp_web`
(unread/read/drafts/send/status/connect) : envoi seulement après relecture + oui de Kouider (même texte, 20 min).
Connexion : `connect` → code ; pendant 30 min (`/root/cloudpc-data/wa_link_until`) chaque nouveau code → Telegram.
Risque : WhatsApp n'aime pas l'automatisation — pas d'envoi en masse, pas de premier contact, réponses tapées comme un humain.
Alternative officielle si besoin : API WhatsApp Cloud en « coexistence » avec l'appli Business (webhook déjà dans `api/routes/whatsapp.ts`).
Dépannage : `pm2 logs dzaryx-cloudpc`, `curl 127.0.0.1:9223/json/version`, `/root/cloudpc-data/chrome.log`.
