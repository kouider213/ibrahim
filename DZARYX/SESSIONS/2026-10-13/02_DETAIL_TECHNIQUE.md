# Détail technique — 2026-10-13

> Copie des entrées du CHANGELOG de la journée (plus récent en haut).

## 2026-10-13 — Objectifs, tâches Houari avec suivi, procédures apprises, mémoire côté clients | `ce4e3fa`

### backend/
- `integrations/goals.ts` — **objectifs** (Hermes « /goal ») : `create_goal` / `list_goals` / `update_goal` ; job `goals`
  9h (Bruxelles) : point mesuré (lecture seule), 1 à 3 actions du jour, arrêt quand atteint ou à l'échéance ; appel si
  échéance ≤ 2 jours. Test réel : « Jumpy ce week-end » → libre 17-18/10, relancer 3 anciens clients Jumpy, story.
- `integrations/team-tasks.ts` — **tâches pour Houari** (Hermes « kanban ») : `assign_task` / `complete_task` /
  `list_team_tasks` ; notif app de Houari, rappel 1 h avant + à l'heure, alerte au créateur si pas confirmé 1 h après,
  Kouider prévenu quand c'est fait ; tâches ouvertes injectées dans le contexte de Houari. Job `team-tasks` 15 min.
- `integrations/procedures.ts` — **procédures apprises** (Hermes « skills » + « curator ») : `save_procedure` /
  `list_procedures` / `delete_procedure` ; aussi extraites par la relecture auto (self-learning) ; injectées seulement
  quand le message parle du sujet (racines de 5 lettres) ; archivées après 60 j sans usage (ménage de nuit).
- `conversation/client-responder.ts` — réponse WhatsApp client : **mémoire de la conversation** (avant : seul le
  dernier message) + propositions d'extras RÉELS (livraison gratuite aéroport Es-Sénia, 7-9 places, logement du
  catalogue, prolongation). Même consigne dans le chat du site (`widget.ts`). NB : canal WhatsApp client non branché
  en prod (0 conversation) — prêt pour le jour où il l'est.
- ⛔ Navigateur sur le serveur (Hermes « bot screen ») : code écrit (`browser-worker/`, non suivi par git) mais
  **déploiement bloqué** par le garde-fou de sécurité de Claude Code (agent qui navigue seul sans surveillance).

## 2026-10-13 — Rappels d'événement, recherche dans les conversations, ménage mémoire, réveil local, mode privé

### backend/
- `integrations/intentions.ts` — **rappels déclenchés par un événement** (OpenClaw « standing intents ») : outils
  `create_intention` / `list_intentions` / `cancel_intention`. Événements : nouvelle réservation (tous canaux), mail
  reçu (boîte pro), WhatsApp client, ou Kouider/Houari qui en parle à Dzaryx (glissé dans le contexte de la réponse).
  Job `intentions` toutes les 5 min. Notif ou appel. Testé : « Jumpy → pneu » déclenché une seule fois.
- `integrations/conversation-search.ts` — outil `search_conversations` (« qu'est-ce que je t'avais dit sur… ») :
  toutes les conversations (app, Telegram, appels), sans accents, extraits datés + canal ; Houari ne voit que les siennes.
- `integrations/memory-consolidation.ts` — **ménage de la mémoire** chaque nuit à 3h : doublons / contradictions dans
  les règles apprises → garde la plus récente, désactive les autres (rien supprimé) ; notif ; `undo_memory_cleanup`.
- `integrations/privacy.ts` — **mode privé** (`set_private_mode`) : pas de mémoire auto, pas d'apprentissage, pas de
  résumé d'appel ; à la fin (« fin du mode privé » ou durée écoulée, job 10 min) les messages de la période sont
  effacés. `show_my_memory` (« montre tout ce que tu sais sur moi ») et `forget_memory_fact`.
- `agents/core-router.ts` — outils toujours disponibles quel que soit l'agent : search_conversations, create_intention,
  list_intentions, set_private_mode, show_my_memory.

### nexus/
- `modules/wake_word.py` — **réveil local** : Vosk (modèle fr 41 Mo, téléchargé au 1er démarrage) avec grammaire
  restreinte → hors session, le son ne part chez Google que si « Nexus » est entendu ; « tais-toi / stop » reconnu en
  local pendant que Nexus parle. Test voix de synthèse : 8/8 détectés, 0 faux déclenchement / 6. `NEXUS_LOCAL_WAKE=0`.
- `requirements.txt` : + vosk.

## 2026-10-13 — Apprentissage automatique, missions permanentes, préparation des RDV | `b104752`

### backend/
- `integrations/readonly-agent.ts` (nouveau) — Dzaryx qui travaille SEUL avec ~58 outils de **lecture** (liste blanche
  partagée avec `/api/mcp`) ; la boucle refuse tout autre outil même si le modèle le demande (claude-sonnet-5-5).
- `conversation/self-learning.ts` (nouveau) — **apprentissage automatique** (idée OpenClaw) : 10 min après le dernier
  message de Kouider/Houari, relecture de la conversation (claude-haiku-5-5) → corrections et consignes durables
  enregistrées dans `learned_rules` (déjà injectées à chaque réponse), seulement si la citation vient vraiment de
  l'humain ; notif « 📚 J'ai retenu … ». Outil `forget_learned_rule` (« oublie la règle … »). Off : app_kv `selflearn:off`.
  Test réel : « Clio 35 €/jour » + « jamais la Jumpy < 3 jours » retenus, la résa ponctuelle ignorée.
- `integrations/missions.ts` (nouveau) — **missions permanentes** (idée OpenClaw « standing orders ») : outils
  `create_mission` / `list_missions` / `update_mission` / `run_mission_now` ; job `missions` toutes les 5 min (Bruxelles),
  max 1×/heure, 15 missions ; lecture seule → rapport + propositions ; notif, appel si `call` ou si IMPORTANT.
  Silence si « rien à signaler » (sauf `always_report`). Stockage app_kv `missions`.
- `integrations/meeting-prep.ts` (nouveau) — **préparation des RDV** : job `meeting-prep` toutes les 10 min, RDV dans
  45–80 min (agendas perso + business, hors réservations/anniversaires) → fiche (prospect, mails, client, quoi proposer)
  en notif + appel auto. Outil `prepare_meeting` (« prépare-moi mon RDV de 15h »). Off : app_kv `meetprep:off`.
  Test réel (faux RDV Sonatrach) : prospect contacté le 13/10 retrouvé, aucune réponse, 3 SUV proposés.
- `agents/agent-registry.ts` — nouvel Agent Missions (priorité 11) ; outils ajoutés au Général et à l'Agent Mémoire.
- ⛔ Extension Chrome (Nexus dans le Chrome de Kouider) : création bloquée par le garde-fou de sécurité de Claude Code
  (contrôle du navigateur connecté à tous ses comptes) — en attente de la décision de Kouider.

## 2026-10-13 — Nexus : les 5 idées des autres « Jarvis » (bertrandmbanwi/Jarvis, OpenClaw, Open.Jarvis)

### nexus/
1. **Pilote de navigateur** `modules/browser_agent.py` (Playwright + Claude `NEXUS_BROWSER_MODEL`, défaut claude-sonnet-5-5) :
   « va sur le site X et remplis le formulaire / cherche / télécharge… ». Chromium visible, profil gardé
   (`nexus/data/browser-profile`, les connexions restent), page lue en éléments numérotés (pas de clic « à l'œil »),
   téléchargements → Téléchargements. Jamais de mot de passe/carte : Kouider se connecte lui-même. **Pause avant
   toute action irréversible** (payer, envoyer, réserver, publier…) → « oui continue » reprend. « ferme le navigateur ».
   Testé sur le VPS (headless) : population d'Oran sur Wikipédia OK ; formulaire httpbin rempli → pause → envoyé après « oui continue ».
2. **Serveur MCP** `mcp_server.py` : les outils de Dzaryx **en lecture seule** (≈60 : réservations, clients, finances,
   flotte, mails pro, agenda, prospects…) dans Claude Code / Claude Desktop / Cursor :
   `claude mcp add dzaryx -- python C:\…\nexus\mcp_server.py`. Backend : `GET /api/mcp/tools`, `POST /api/mcp/call`
   (token PC ou mobile Kouider, liste blanche lecture seule — aucune écriture par cette porte). Testé de bout en bout
   (SDK mcp 1.30 et 2.3) : 58 outils, get_fleet_status OK ; supabase_execute / create_booking refusés, sans token 401.
   Note : le 1er déploiement (9ed717f) a échoué (apostrophes dans tools.ts, tsc ne l'a pas vu) → corrigé f218f82.
3. **Mode hors ligne** `modules/offline_brain.py` : sans internet (ou Claude en panne) → cerveau local Ollama
   (`NEXUS_OLLAMA_MODEL`, défaut qwen3:4b-instruct — qwen3:4b « pense à voix haute », écarté) ; reconnaissance vocale
   Google → faster-whisper local si pas de réseau. « installe le mode hors ligne » = winget Ollama + modèle + whisper.
   Testé sur le VPS avec Ollama : réponses FR courtes, ~5 s.
4. **Bulle flottante** `modules/overlay.py` (tkinter) : orbe en bas à droite (veille/écoute/réfléchit/parle) + dernière
   phrase ; clic = micro, glisser = déplacer, clic droit = menu. Raccourcis globaux **ctrl+alt+n** (micro) et
   **ctrl+alt+b** (afficher/masquer). `NEXUS_OVERLAY=0` pour couper. Testé sous Xvfb.
5. **Garde-fou anti-boucle** `modules/loop_guard.py` (idée OpenClaw) : 3 erreurs identiques d'affilée ou 4 appels
   identiques → stop. Dans l'agent PC et le pilote de navigateur.

### backend/
- `integrations/claude-api.ts` : même garde-fou dans la boucle d'outils de Dzaryx (1er déclenchement = avertissement
  au modèle, 2e = boucle arrêtée avec message clair).
- `api/routes/mcp.ts` (nouveau) + description de `send_nexus_command` (navigateur, minuteurs, volume…).
- `nexus/requirements.txt` : + playwright, mcp, httpx, keyboard. Sur le PC : `python -m playwright install chromium`.

## 2026-10-13 — 3e passe JARVIS (TechEnClair v10.3, version Mac) : extras locaux Nexus

### nexus/
- `modules/extras.py` (nouveau) — commandes **sans IA, sur le PC** (phrase entière, sinon ça part vers Dzaryx) :
  - **minuteurs** : « minuteur de 10 minutes pour les pâtes », « préviens-moi dans une demi-heure », « il reste
    combien », « annule les minuteurs » → bip + Nexus parle + message Telegram quand ça sonne ;
  - **notes / courses / to-do** (fichier `nexus/data/extras.json`) : « note que… », « lis mes notes »,
    « ajoute du lait et du pain à la liste de courses », « enlève lait de… », « montre ma to-do » ;
    « note pour le client X » reste pour Dzaryx (fiche client) ;
  - **système** : volume (monte/baisse/à 40/coupe/remets, via pycaw), luminosité (écran portable), « éteins le PC
    (dans 10 minutes) » toujours avec 60 s minimum + « annule l'arrêt », redémarrage, verrouillage, vider la corbeille ;
  - **petits outils** : mot de passe (copié, jamais dit à voix haute), pile ou face, dés, heure à Oran/Bruxelles/Dubaï… ;
  - **mode boulot** : ouvre `NEXUS_WORK_APPS` (défaut Chrome + Téléchargements + Documents) + playlist `NEXUS_WORK_PLAYLIST`.
- `nexus.py` — route 0b2 (après les réponses instantanées). `requirements.txt` — + pycaw, comtypes, tzdata.
- Phrases testées sur le VPS (actions Windows simulées) ; **pas encore testé sur le PC Windows**.
- Repos de comparaison téléchargés dans `downloads/ext/` (non suivis par git) : bertrandmbanwi/Jarvis (MIT),
  dmrr35/Open.Jarvis (MIT), openclaw/openclaw (MIT).

## 2026-10-13 — Appel la veille de chaque départ et de chaque retour
- (`queue/jobs/call-jobs.ts`, `queue/scheduler.ts`) : job `rental-eve-call` 18h Bruxelles → un seul appel pour tout le lendemain. Départ : reste à payer, contrat pas signé (`contract_signatures`), papiers qui expirent. Retour : reste à encaisser, prochain départ de la voiture. Propose un message client / contrat / prolongation. Demande de Kouider. Testé à blanc (`AUTOCALL_DRY_RUN`) sur la résa Motam (départ 21/10, retour 23/10).

## 2026-10-13 — Modifier/annuler, répondre aux mails, contrat, papiers des voitures (appel)
- (`integrations/call-quick.ts`, `integrations/car-papers.ts`, `api/routes/call.ts`, `tgcall/dzaryx_tg.py`, `queue/scheduler.ts`) :
  - `quick_modify_booking` : décaler dates / changer de voiture / prix / annuler en 1-2 s. Dispo vérifiée hors la résa elle-même, prix/jour gardé, bénéfice recalculé (`owner_price_per_day` de la résa, ou `base_price` de la nouvelle voiture), `owner_total`/`profit_kouider`/`payment_status` recalculés, voiture libérée/occupée, événement Google Agenda modifié ou supprimé. Alerte trop-perçu si déjà payé > nouveau prix.
  - `quick_email_reply` : répond au dernier mail reçu d'une personne (boîte PRO seulement, même conversation, depuis contact@). Sans `body` → lit le mail ; relecture complète puis `confirmed:true`. Opt-out, permission d'envoi et plafond 30/jour vérifiés.
  - `send_contract` : `create_signature_link` + lien WhatsApp avec le message de signature → envoyé à Kouider sur Telegram (outil local tgcall).
  - Papiers : outils `set_car_papers` / `get_car_papers` (chat + appel) sur `cars.insurance_expiry/technical_expiry/vignette_expiry` (colonnes existantes, jamais utilisées, toutes vides). Job `car-papers-call` 9h30 Bruxelles : notif à 30 j, **appel** à 7 j et à l'échéance (signale si la voiture est en location). Relecture de `quick_booking`/`quick_modify_booking` : alerte si un papier expire avant la fin.
  - Testé sur la vraie base en relecture (rien écrit/envoyé) ; papiers testés sur la Sandero puis remis à vide. Pas encore en vrai appel.

## 2026-10-13 — Réservation, paiement, devis, agenda rapides dans l'appel
- `63f9638` (`integrations/call-quick.ts`, `api/routes/call.ts`) : `quick_booking` (dispo, prix catalogue `resale_price` ou dit, coût Houari `base_price`, bénéfice, client à risque ; relecture sans `confirmed`, `create_booking` après oui), `quick_payment` (retrouve la résa pas soldée du client, « laquelle ? » si plusieurs, reste à payer), `quick_quote` (dispo + prix client + livraison + devis prêt à envoyer), `quick_agenda` (départs/retours, agenda FIK + perso, rappels du jour), `schedule_reminder` en écriture rapide confirmée.
- Fix `create_booking` : car_name « Clio » prenait une Clio au hasard → « laquelle ? ».
- Fix `check_car_availability` : affichait `base_price` (coût Houari) comme prix client en « DZD » et comptait un jour de moins → prix client €, coût Houari, prix Houari DA, jours inclus.
- Testé : relectures sur la vraie base (rien écrit), conversation simulée (bon outil, relecture, oui → confirmed). Pas encore en vrai appel.

## 2026-10-13 — Nouveautés DANS l'appel Telegram (voix temps réel)
- `7dfa7ea` + `5decf02` (`api/routes/call.ts`, `tgcall/realtime.py`, `tgcall/dzaryx_tg.py`) :
  - **Réponses rapides** (< 1 s, `/api/call/tool`) : `check_client`, `get_expenses`, `get_vehicle_maintenance`. (`get_client_profile` écarté : il pousse des notifs de documents.)
  - **Dictée rapide** : `record_expense`, `record_car_km`, `update_vehicle_maintenance` directement depuis l'appel, avec paramètre `confirmed` obligatoire (refusé sans `confirmed:true` → relecture + « oui » d'abord).
  - **« J'ai des choses pour toi »** : boîte `app_kv autocall:inbox` (infos sur quota atteint, appels coupés, appel manqué via `POST /api/call/missed`, retirées si le 2e essai sonne) + file d'appels → annoncées au décroché quand c'est Kouider qui appelle (`waitingGreeting`), puis vidées.
  - **Lien WhatsApp client** : outil `whatsapp_link` → numéro retrouvé dans les réservations (`clientWhatsappLink`, « lequel ? » si homonymes) → lien wa.me pré-rempli envoyé à Kouider sur Telegram.
  - **Interprète** : outil `interpreter` (on/off, langue) → `session.update` (transcription toutes langues, VAD `low`) + règles de traduction dans les 2 sens.
  - **Fix** : `update_vehicle_maintenance` « Clio » modifiait TOUTES les Clio (ilike) → une seule voiture (`findCar`), sinon « laquelle ? ».
  - Testé : outils sur la vraie base (sans écriture), session OpenAI acceptée, conversation simulée par écrit (bon outil choisi à chaque fois, relecture avant dictée, traduction FR↔EN). Pas encore testé dans un vrai appel.

## 2026-10-13 — Client à risque, km → vidange, anniversaires, avis WhatsApp, + d'appels
- `b609905` (`notifications/client-care.ts`) :
  - `clientRisk` : historique (locations, notes `[NOTE CLIENT]`, impayés terminés, dégâts `vehicle_states`) ajouté au résultat de `create_booking`, aux notifs nouvelle résa site + demande WhatsApp, et dit dans l'appel auto. Outil `check_client`.
  - Km : `km` sur `save_vehicle_state_before/after` (Dzaryx le demande sinon), outil `record_car_km` → prochaine vidange (`next_service_km` ou dernière + intervalle) ; ≤ 1000 km ou dépassée → alerte + appel. Compteur qui baisse refusé. `update_vehicle_maintenance` : vidange faite → `next_service_km` recalculé. ⚠️ Aucune voiture n'a encore de km/dernière vidange en base.
  - Job `client-birthdays` 9h15 : date de naissance OCR passeport/permis → message WhatsApp prêt (-10% prochaine location, `BIRTHDAY_DISCOUNT`) + appel groupé.
  - Job `review-whatsapp` 10h30 : locations finies hier, client SANS email → lien wa.me avec demande d'avis Google, marque `review_request_sent_at` (les clients avec email l'ont déjà via le cron reminders du site).
  - Appels auto : quota 8 → 12/jour ; appel aussi sur réserve prospects vide.

## 2026-10-13 — Dépenses à la voix / photo de ticket + alerte panne appels Telegram
- `235c653` : outils `record_expense` / `get_expenses` / `delete_expense` (agent Finance, `integrations/expenses.ts`). Dépense dictée (« 3000 DA d'essence dans la Clio ») ou photo de ticket → `cash_entries` (même caisse que l'app/site), reliée à la voiture (`car_id` ajoutée au démarrage via runSql ; repli : voiture dans le libellé). `get_expenses` : total, par catégorie, **bénéfice réel par voiture** = bénéfice Kouider des locations du mois − dépenses, devise par devise (jamais mélangées, prix proprio manquant signalé). Testé sur la vraie base (ligne test créée puis supprimée).
- `e9a961e` : tgcall envoie `POST /api/call/heartbeat` chaque minute (`connected` = Telegram connecté) ; job `tgcall-watch` (*/5) → alerte « Appels Telegram en panne » après 5 min sans signe de vie (une fois), puis « rétablis » au retour. Clés `app_kv` `tgcall:heartbeat` / `tgcall:down`.

## 2026-10-13 — Démarchage : alerte réserve de prospects vide
- `584d598` : si la recherche du jour ne trouve pas assez de sociétés avec email → alerte « plus assez de sociétés à contacter » (1er, 3e, 7e jour puis hebdo, compteur `app_kv prospect:dry_days`), avec pistes (nouveau secteur, noms donnés par Kouider). Récap du jour : ligne « 📦 Réserve : plus que N » sous 2 jours de stock. Avant : arrêt silencieux.
- Vérifié : relances J+5 (`runFollowUps`) et bilan du lundi 9h (`prospect-weekly`) existaient déjà — 1res relances le 17/10.

## 2026-10-13 — Appel manqué → 2e essai auto + ménage roadmap
- `1265bb5` : appel Telegram manqué → message écrit + **2e essai 10 min plus tard** (une seule fois, annulé si Kouider a rappelé entre-temps). Route `POST /api/call/retry`, `RETRY_S` dans tgcall.
- `ea2c901` : roadmap — projets payants retirés (WhatsApp Twilio, GPS trackers, App Store, TikTok, IoT, PC auto-unlock/Spotify) ; signature électronique marquée ✅ (déjà en place : `create_signature_link` + `/sign/<token>`). tgcall ignore ses propres messages.

## 2026-10-13 — call_me : texte « appel Telegram + app » (était « l'app sonnera »). Rappel 20h30 vérifié en base.

## 2026-10-13 — Appel vidéo Telegram : Dzaryx voit la caméra (comme l'app)

### backend/ + tgcall/
- `tgcall` : `RecordStream(camera=True)`, dernière image caméra gardée (I420 → JPEG, rotation), envoyée à la voix
  temps réel quand Kouider parle (max 1 / 3 s) ; outil `look` (image fraîche) ; image jointe à `ask_dzaryx`.
- Consignes voix : décrire sans inventer, état des lieux / dégâts via ask_dzaryx avec accord oral.
- Testé hors appel (le modèle lit une image). Réception vidéo Telegram P2P pas encore testée en vrai.

## 2026-10-13 — Appels : par écrit, rappel plus tard, raccrocher, appel manqué, photos Telegram

### backend/ + tgcall/
- Voix temps réel : `send_text_to_me` (message Telegram immédiat), `call_me` programmé (via `/api/call/tool`,
  refusé sans délai/heure), `end_call` (raccroche après l'au revoir ; le résumé est quand même fait).
- Appel de Dzaryx non décroché / refusé / occupé → message Telegram avec ce qu'il voulait dire.
- Photo / image envoyée au compte Dzaryx → `/api/call/turn` avec image (même cerveau que l'app).
- `/api/call/turn` `channel: 'message'` : pas de consigne « appel en cours » pour les messages écrits.

## 2026-10-13 — Appels : lectures rapides, même voix pour les vocaux, choix de la voix

### backend/ + tgcall/
- `POST /api/call/tool` : outils lecture seule (list_bookings, get_fleet_status, check_car_availability,
  get_unpaid_bookings, get_finance_dashboard, list_emails, read_email) appelés directement par la voix temps réel (0,2–0,6 s).
- Vocaux Telegram : réponse dite par la voix temps réel (`realtime.speak`), repli ElevenLabs.
- Message « voix » → 6 échantillons ; « voix N » → choix (app_kv `call:voice`, `POST /api/call/voice`).

## 2026-10-13 — Mémoire des appels + actions avec accord oral (3e12b43)

### backend/ + tgcall/
- `notifications/call-memory.ts` + `POST /api/call/summary` : fin d'appel → résumé + « à faire » (Claude), gardés 30 j
  (app_kv `callmem:<actor>`, 10 derniers) + memory_facts. Injectés dans la voix temps réel et le contexte du chat.
- `tgcall` : transcription de l'appel gardée, résumé envoyé à Kouider en message Telegram après l'appel.
- Voix temps réel : toute action en 2 temps (relecture + « je le fais ? », puis `ask_dzaryx` « CONFIRMÉ AU TÉLÉPHONE : … »).

## 2026-10-13 — Appels Telegram en voix temps réel (OpenAI Realtime)

### backend/ + tgcall/
- `POST /api/call/realtime` : clé OpenAI temporaire (120 s) + session fixée côté backend (gpt-realtime, voix `cedar`,
  semantic_vad, coupure de parole, outil `ask_dzaryx`). La vraie clé reste sur Railway.
- `tgcall/realtime.py` (nouveau) : voix de Kouider (24 kHz) → OpenAI en continu ; voix de Dzaryx → appel par tranches
  de 10 ms au rythme réel (ExternalMedia + send_frame), sans trou ; Kouider peut couper Dzaryx.
  `ask_dzaryx` → `/api/call/turn` textOnly (vrai cerveau : réservations, mails, agenda…).
- Mesuré : 1er son 0,4 s (avant 4-7 s). `REALTIME=0` dans tgcall/.env → ancienne chaîne. Si OpenAI indisponible → ancienne chaîne auto.
- `/api/call/answer { noAudio }` : pas de voix ElevenLabs inutile pour l'accueil.

## 2026-10-13 — Appels Telegram : moins de coupures

### tgcall/dzaryx_tg.py
- Fin de phrase après 1,1 s de silence (au lieu de 0,7 : coupait Kouider en pleine phrase) — réglable `END_SILENCE_S`.
- Écoute pendant que Dzaryx réfléchit : si Kouider reprend sa phrase, le tour est annulé et relancé avec la phrase entière.
- Phrases suivantes assemblées en un seul fichier (ffmpeg concat → wav) : plus de blanc entre les phrases.
- Si la réponse tarde (> 3,5 s) : « Je cherche, deux secondes. » pour que la ligne ne paraisse pas morte.

## 2026-10-13 — Démarchage : signaux d'affaires (sociétés qui arrivent à Oran)

### backend/
- `integrations/prospect-autopilot.ts` : `SIGNALS` — 1 recherche de plus chaque jour (contrats signés, chantiers, usines,
  recrutements d'expatriés à Oran/Arzew/Béthioua) → la société est cherchée, son email public trouvé, mail auto comme les autres.
- LinkedIn : reste en « préparé, Kouider envoie » (envoi auto = risque de blocage du compte, pas d'API officielle).

## 2026-10-13 — Dzaryx appelle Kouider tout seul pour les infos importantes

### backend/
- `notifications/auto-call.ts` (nouveau) : `autoCall(key, phrase)` fait sonner Kouider (Telegram) en plus de la notif.
  Garde-fous : 8h–22h heure de Bruxelles (la nuit → appel groupé à 8h), 10 min mini entre 2 appels (sinon groupé),
  1 seul appel par info (24 h), interrupteur app_kv `autocall:off` = '1'.
- Déclencheurs (moments importants seulement, choix de Kouider) : récap quotidien 10h Bruxelles (`queue/jobs/call-jobs.ts`),
  quelqu'un répond à un de ses mails (prospects + `mail-reply-call` toutes les 15 min, `gmail.isReplyToUs`), nouvelle réservation
  site, nouvelle demande WhatsApp, client WhatsApp qui dit avoir payé l'acompte, retard de retour, impayé urgent. Max 8/jour.
  Pas d'appel pour le point du matin de 7h30 ni les visites de site des prospects (notif seulement). `AUTOCALL_DRY_RUN=1` = test sans sonner.
  Boîte pro fikconciergerie@gmail.com UNIQUEMENT (envois via contact@fikconciergerie.com) — jamais la boîte perso (choix de Kouider).
- Scheduler : job `auto-call-flush` toutes les 15 min (appels mis en file).

## 2026-10-13 — Appels Telegram plus rapides + vrai test des secours IA

### backend/ + tgcall/
- `6c816db` — `integrations/fallback-probe.ts` (nouveau) : `/api/health-ai` envoie un vrai message test à Claude,
  Groq, Gemini, OpenAI (cache 30 min, `?force=1`) au lieu de vérifier la présence des clés. Job `fallback-watch`
  9h30 (Alger) : alerte si un provider est « down » (crédit épuisé / modèle retiré). Vérifié en prod : tous 🟢.
- `6c816db` — `agents/core-router.ts` : toute phrase avec « mail / email / gmail / boîte de réception » va à
  l'agent Général (« j'ai reçu un email » partait en Finance → « pas d'accès à ta messagerie »).
- `b22bdb8` / `800f2d4` — appels : `/api/transcribe` `provider:'fast'` = Groq Whisper turbo en français (0,4 s au
  lieu de 1,0 s) ; `/api/call/turn` `stream:true` = NDJSON, 1re phrase envoyée seule puis la suite (voix en
  parallèle) ; `tgcall/dzaryx_tg.py` enchaîne les morceaux. Mesuré : ~2-3 s de réflexion + 1re voix, ~3-4 s par
  tour au total. Pas encore testé dans un vrai appel. Darija et compte Telegram de Houari abandonnés (Kouider).

## 2026-10-13 — Secours sans Claude réparé (Groq + Gemini)

### backend/
- Les secours gratuits étaient **morts sans que ça se voie** : Groq avait retiré `llama-3.3-70b-versatile` et
  `llama-4-scout` (vision), Google `gemini-2.0-flash` / `2.0-flash-lite` / `1.5-flash`. Si Claude tombait (crédit
  épuisé), seul OpenAI GPT-4o (payant) prenait le relais. `/api/health-ai` disait quand même « ✅ survive » (il ne
  vérifie que la présence des clés).
- Remplacés partout : Groq → `openai/gpt-oss-120b` (texte + outils), `qwen/qwen3.8-27b` (vision) ; Gemini →
  `gemini-3.5-flash`, secours `gemini-3.1-flash-lite` puis `gemini-flash-latest`.
- Testé avec les clés de prod : aller-retour d'outil OK sur gpt-oss-120b (1 s) et gemini-3.5-flash (3,4 s) ; vision
  OK sur qwen3.8 et gemini-3.5/3.1. (gemini-3.7/3.8-flash et flash-latest étaient en 503 « high demand » au test.)

## 2026-10-13 — 2e passe JARVIS (TechEnClair) : WhatsApp, réponses instantanées, Google Docs/Sheets, classement foot

### nexus/
- `modules/quick_answers.py` (nouveau) — **réponses sans IA** : heure, date, calculs (« combien font 12 fois 8 »,
  « 15 pourcent de 4000 », « racine carrée de 144 »), batterie, CPU/RAM. Phrase entière seulement (« à quelle
  heure arrive Ahmed ? » part toujours vers Dzaryx). Instantané, gratuit, marche sans internet.
- `modules/whatsapp_call.py` (nouveau) — **« appelle Houari sur WhatsApp »** (+ « en vidéo ») : ouvre WhatsApp
  Desktop, cherche le contact, **vérifie par la vision que c'est la bonne conversation** (sinon n'appelle
  personne), Ctrl+Maj+C / V, clic vision en secours. « whatsapp » obligatoire dans la phrase.
- `nexus.py` — routes 0b et 0c (avant la musique). Non testé sur le PC Windows.

### backend/
- `get_football` : paramètre `league` → **classement** (Ligue 1, Ligue 1 algérienne, Premier League, Liga,
  Bundesliga, Serie A ; saison en cours auto). Base gratuite TheSportsDB = top 5.
- `integrations/google-docs.ts` (nouveau) — outils **`create_google_doc`** et **`create_google_sheet`** (Drive de
  fikconciergerie@gmail.com, renvoient le lien). Permission `drive.file` ajoutée à la connexion Gmail (Dzaryx ne
  voit que les fichiers qu'il crée). Gmail reconnecté + API Docs/Sheets activées le 13/10 → **testé OK par Kouider**.

## 2026-10-13 — Dzaryx sur Telegram : vrais appels vocaux sans Twilio (en attente du compte)
- `tgcall/` : service Python (pyrofork + py-tgcalls) sur le VPS, connecté à un compte Telegram « Dzaryx » (pas de pièce d'identité, juste un numéro)
  - appel sortant : sonde `/api/call/pending` → appelle Kouider/Houari sur Telegram, phrase d'accueil, puis conversation (détection fin de phrase → `/api/transcribe` → `/api/call/turn` → voix ElevenLabs dans l'appel)
  - appel entrant : Kouider appelle le compte Dzaryx → il décroche et converse
  - messages privés : texte → texte, vocal → vocal
- backend : `POST /api/call/turn` (réponse synchrone texte + mp3, session `voice_<actor>`)
- connexion : `tgcall/login.py send <numéro>` puis `login.py code <code>` ; config `tgcall/.env` (TG_API_ID/HASH, KOUIDER_TG)

## 2026-10-13 — Fix : Dzaryx répondait en arabe à Kouider qui parle français
- STT : prompt neutre FR-first (l'ancien lexique darija faisait inventer « wesh rak » et recopier le prompt) + filtre d'écho du prompt
- Kouider : darija latine / mélange → réponse en français ; écriture arabe seulement si le message est en arabe

## 2026-10-13 — Fix : Dzaryx n'entend pas toujours (micro « sourd ») | app SW v128
- fix VAD : une ré-init du micro (watchdog) laissait l'ancienne boucle VAD tourner sur un micro mort → elle lisait du silence et JETAIT tes phrases au bout de 0,4 s. Chaque boucle a maintenant un numéro de génération ; l'ancienne s'arrête
- fix : `initMic` attendait `audioCtx.resume()` → sans geste utilisateur la promesse pouvait ne jamais se résoudre → VAD jamais démarré. Resume non bloquant + ancien AudioContext fermé + plus de `sampleRate: 44100` forcé
- fix watchdog : réveille l'AudioContext s'il est suspendu/interrompu (iOS après lecture d'une réponse, retour d'arrière-plan) — avant, l'analyseur renvoyait du silence
- feat : seuils VAD adaptatifs au bruit ambiant (mêmes ratios que le calibrage 3.8, mais suivent l'ambiant : voiture, dehors, haut-parleur en appel)

## 2026-10-13 — Appels Dzaryx dans l'app (sans numéro de téléphone) | app SW v127
- feat backend : `notifications/voice-call.ts` + routes `/api/call` (`pending`, `answer`, `decline`, `test`) — Dzaryx « appelle » = push `📞 Dzaryx t'appelle` (TTL 3 min, urgence haute) + appel en attente (`app_kv call:pending:<actor>`) ; décrocher → phrase d'accueil ElevenLabs, enregistrée dans `voice_<actor>` pour le contexte
- feat outil `call_me` : « appelle-moi » (tout de suite) ou « appelle-moi dans 20 min / demain à 9h » (rappel `[APPEL] …` → le reminder-worker fait sonner l'app)
- feat app : écran de sonnerie (Décrocher / Refuser), bouton « 📞 Appeler » sur l'écran Voix, barre d'appel (durée, raccrocher), mains libres VAD, raccroche seul après 15 min ; `?deeplink=` géré au lancement à froid
- fix : « appel/téléphone » ne part plus en fast mode sans outils
