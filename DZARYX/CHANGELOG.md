# DZARYX — Changelog

> Format : Date | Commit | Fichiers | Description
> Plus récent en haut.

---


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

## 2026-10-12 (soir) — Démarchage : relance, suivi des visites, contact@, WhatsApp, RDV, bilan | `14bd2bc` + app SW v126
- feat : relance unique après 5 jours sans réponse, dans la même conversation et la langue du 1er mail (`runFollowUps`)
- feat : lien de suivi `?ref=` par société (clients → /entreprises) ; job 30 min lit `page_views` → notif « 👀 X vient de visiter ton site »
- feat : expéditeur `FIK Conciergerie <contact@fikconciergerie.com>` automatique dès que l'alias est validé dans Gmail (sendAs), sinon Gmail
- feat : partenaires d'Oran sans email mais avec mobile → message WhatsApp préparé (bouton wa.me dans la page)
- feat : réponse « intéressé » → 3 créneaux libres de l'agenda (freeBusy) dans la réponse + lignes de devis → bouton « Préparer le devis » (page Devis pré-remplie)
- feat : bilan démarchage chaque lundi 9h (envois, relances, réponses, visites, RDV, taux par type de société et par langue)
- ⏳ site (`autolux-location`) : `pages/_app.js` doit enregistrer `pathname + search` à la 1re page (commit prêt, push refusé : clé en lecture seule)

## 2026-10-12 — Notifs réparées, page Démarchage, grands comptes, outils Jarvis
- fix : notifications et tâches planifiées ne dépendent plus d'Upstash Redis (Supabase + croner)
- fix : une société = un seul mail (doublon Nad Car)
- feat : page Démarchage dans l'app ; grands comptes + décideurs LinkedIn ; récap du matin
- feat : convert_currency, get_weather_alerts, get_football

## 2026-10-12 — Démarchage automatique quotidien + suivi des réponses

### backend
- `integrations/prospect-autopilot.ts` — job **`prospect-outreach`** (10h Oran, chaque jour) : cherche de NOUVELLES sociétés (agences de voyage, entreprises en mission à Oran, loueurs, immobilier ; requêtes web + LinkedIn en rotation, via Tavily), garde seulement les emails écrits tels quels dans les pages (anti-invention), écrit un mail personnalisé (Sonnet) à partir du site fikconciergerie.com (relu chaque jour) avec le lien du site + mention STOP, envoie 5/jour par défaut (max 15, plafond boîte 30/jour). Jamais 2 fois la même société (doublons email/nom + seuls les `a_contacter` jamais contactés). Récap dans l'app.
- Job **`prospect-replies`** (toutes les 30 min, 7h-22h) : repère les réponses (même conversation Gmail ou même adresse), STOP → statut stop, rebond → stop, réponse auto ignorée ; sinon résumé + réponse proposée stockée (`suggested_reply`) + notif dans l'app « dis « réponds à X » ».
- Outils `prospect_replies` (voir la réponse + le texte proposé) et `prospect_autopilot` (état / on / off / nb par jour / lancer maintenant). `draft_email` accepte `reply_to_prospect` → réponse dans la même conversation (In-Reply-To + threadId). L'envoi reste soumis au « oui » de Kouider (`send_email`).
- `gmail.ts` — `sendEmail` gère les réponses en fil + renvoie `threadId` ; `listInboxMessages`, `getMessageIdHeader`.
- `prospects.ts` — colonnes de suivi Gmail + table `prospect_autopilot` (créées au boot).
- Routage : « réponds… » → Claude + outils (plus de fast mode).

## 2026-10-12 — Fix : web_search jamais exécuté (Tavily ignoré)

### backend
- **Fix** `integrations/claude-api.ts` — la boucle d'outils répondait « Recherche web effectuée par le serveur Anthropic » à tout bloc `tool_use` nommé `web_search`, sans rien exécuter. Or le web_search natif Anthropic arrive en `server_tool_use` : ce court-circuit bloquait notre outil local (Tavily → Apify → SearxNG…). Dzaryx recevait un résultat vide et inventait des agences. Branche supprimée.

## 2026-10-12 — Prospection B2B (fichier prospects + démarchage par mail)

### backend
- `integrations/prospects.ts` — table `prospects` (créée au boot via API Management si absente, SQL dans `supabase/migration_prospects.sql`) : segments proprietaire_appart / loueur_voitures / agence_voyage / entreprise, statuts a_contacter → contacte → a_repondu → interesse → client / refus / stop.
- Outils `add_prospect`, `list_prospects`, `update_prospect` (Agent Général). Après `send_email` → prospect marqué « contacte ». `draft_email` refuse une adresse en STOP/refus.
- `agents/agent-registry.ts` — contexte FIK Conciergerie Oran + argumentaire par cible + méthode (web_search → add_prospect avec source, jamais d'email inventé ; un brouillon validé par prospect ; LinkedIn = rédaction seulement).
- Routage : « prospect », « démarche » → Claude + outils.
- **Fix** `web-search-provider.ts` — pages anti-bot DuckDuckGo / erreur Yahoo ne sont plus prises pour des résultats ; nouveau provider **Tavily** en tête (actif si `TAVILY_API_KEY`).

## 2026-10-12 — Envoi de mails depuis fikconciergerie@gmail.com (avec accord)

### backend
- `integrations/gmail.ts` — scope `gmail.send` ajouté (reconnexion requise une fois), `sendEmail()`, `canSendEmail()`.
- `integrations/tool-executor.ts` / `tools.ts` — outils `draft_email` (brouillon 24 h, mention STOP si démarchage) et `send_email`. Le serveur refuse l'envoi si le dernier message de Kouider n'est pas une confirmation postérieure au brouillon (un mail reçu ne peut pas déclencher d'envoi). Limite 30 mails/jour.
- **Fix** brouillons gardés en mémoire du serveur et limite/jour comptée dans Gmail (`countSentToday`) — Redis Upstash était en rate-limit (« Erreur technique côté serveur »).
- **Fix** `send_email` envoie le dernier brouillon montré AVANT le « oui » (le LLM perdait le draft_id et refaisait un brouillon → refus). Refus en `❌` (comptés comme échecs), pas de relance automatique (évite double envoi), `send_email` ajouté aux WRITE_TOOLS du phantom-guard.
- `agents/agent-registry.ts` — outils ajoutés à l'Agent Général + consigne brouillon → accord → envoi.
- **Fix** `integrations/llm-router.ts` / `claude-api.ts` — un « oui » / « vas-y » en réponse à une question de Dzaryx garde Claude + outils (avant : Groq/fast mode sans outils, l'action validée ne partait jamais).

## 2026-10-12 — Gmail limité à fikconciergerie@gmail.com

### backend/
- **Fix** `integrations/claude-api.ts` / `llm-router.ts` — « mail/gmail/connect » ne partent plus en FAST MODE (Haiku sans
  outils) : Dzaryx inventait un faux lien OAuth au lieu d'appeler `connect_gmail`.
- `api/routes/calendar.ts` — `GET /api/calendar/gmail-connect` : lien court fixe qui redirige vers le consentement Google
  (fikconciergerie@gmail.com). `connect_gmail` donne ce lien (Claude abîmait la longue URL OAuth).
- **Fix** `agents/agent-registry.ts` — `list_emails`, `read_email`, `connect_gmail` ajoutés à l'Agent Général (catch-all) :
  ils n'étaient dans aucun agent, donc jamais proposés à Claude (« connecte mes mails » répondait « je peux pas »).
- `integrations/tool-executor.ts` / `tools.ts` — les outils `list_emails`, `read_email`, `connect_gmail` lisent
  uniquement `fikconciergerie@gmail.com` (paramètre `account` retiré, demande Kouider). La boîte perso n'est plus proposée.

---

## 2026-10-12 — Lecture Gmail (lecture seule)

### backend/
- **Nouveau** `integrations/gmail.ts` — OAuth Gmail (`gmail.readonly`) pour `kouiderpablo@gmail.com` (perso, défaut)
  et `fikconciergerie@gmail.com` (pro). Tokens dans `google_oauth_tokens` sous `gmail:<adresse>` (n'écrase pas
  le token agenda). Refresh auto ; si révoqué → l'outil renvoie le lien de reconnexion.
- Outils Claude : `list_emails` (recherche Gmail, non lus, max 25), `read_email` (texte, HTML converti, 6000 car.),
  `connect_gmail` (donne le lien de connexion). Contenu des mails balisé comme externe (anti prompt-injection).
- `api/routes/calendar.ts` — le callback OAuth existant gère aussi Gmail via `state=gmail:…`
  → aucune nouvelle URI de redirection à déclarer dans Google Cloud.
- **À faire par Kouider** : activer l'API Gmail dans le projet Google Cloud, puis demander « connecte mes mails »
  et ouvrir le lien.

---

## 2026-10-12 — Nexus : idées reprises de JARVIS (TechEnClair)

Comparaison faite avec JARVIS v10.3 ; seules les fonctions absentes ou moins bien faites dans Dzaryx
ont été ajoutées (réécrites dans le style Nexus, pas copiées). Non testé sur le PC Windows.

### nexus/ — commit « feat: orbe Voice Mode + Nexus »
- `modules/voice.py` — **voix de secours edge-tts** (`fr-FR-HenriNeural`, gratuite) entre ElevenLabs et
  pyttsx3 ; lecture via pygame → **parole interruptible** (`voice.stop()`). Env : `EDGE_TTS_VOICE`.
- `modules/wake_word.py` — **mode conversation** : « Nexus, ouvre Chrome » exécute directement ; session
  de `NEXUS_SESSION_TIMEOUT` s (30 par défaut) sans redire « Nexus » ; « merci Nexus » / « c'est tout »
  → veille ; « tais-toi » / « stop » coupe la parole. Plus de conflit micro avec le bouton micro du GUI.
- `modules/file_manager.py` — **rangement** : « range le bureau » (par type), « … par date » (AAAA-MM),
  « crée un dossier X », « renomme X en Y », « déplace X dans Y », « annule le rangement ».
  Raccourcis `.lnk`/`.url`/`desktop.ini` jamais déplacés. Dossiers sans accents reconnus.
- `modules/vision_click.py` (nouveau) — **clic guidé par la vision** : « clique sur le bouton Envoyer »,
  « écris bonjour dans la barre de recherche » → capture → Claude Opus 5.5 localise → clic pyautogui.
  Env : `NEXUS_VISION_CLICK_MODEL`.
- `nexus.py` — branchement des deux derniers dans le routeur (sections 5c0 et 5d).
- `requirements.txt` — + edge-tts, pygame, pyperclip.

### Non repris (Dzaryx fait déjà mieux ou inutile)
Orchestration IA (JSON regex vs tool use Claude), mémoire JSON (Supabase), musique, caméra/écran,
météo, recherche web, agenda, mobile (ChatInterface > app Compagnon), multi-LLM, serveur WebSocket
sans auth. Domotique Home Assistant + double clap : seulement si Kouider a un Home Assistant.

---

## 2026-10-12 — Orbe de particules Voice Mode

### mobile/ — commit « feat: orbe Voice Mode + Nexus »
- **Nouveau** `components/dashboard/panels/ParticleOrb.tsx` — sphère de 420 particules en Canvas 2D
  (sans dépendance), 4 états idle/listening/thinking/speaking avec transitions douces, prop `volume`
  optionnelle (pulsation simulée en phase speaking), respecte `prefers-reduced-motion`. ~60 fps.
- `VoiceMode.tsx` — remplace l'ancien `OrbParticles` (24 points framer-motion) par `ParticleOrb`.
- Inspiré de l'orbe de JARVIS (TechEnClair) mais **code écrit de zéro** : l'orbe d'origine dérive de
  `ethanplusai/jarvis`, licence non commerciale → incompatible avec Fik Conciergerie.
- tsc 0 erreur, build OK.

---

## 2026-10-12 — Fin du crash loop Redis + VPS Claude opérationnel + jobs réactivés

### backend/ — Commit `9c81ace`
- **Garde-fou global** `index.ts` — `process.on('uncaughtException'/'unhandledRejection')` : log sans tuer
  le process. Cause historique du 502 : Upstash saturé → BullMQ émet event `'error'` non écouté →
  `uncaughtException` → Node meurt → crash loop.
- **Listeners `.on('error')`** sur toutes les Queue/Worker BullMQ : `queue.ts` (actions/voice/notify),
  `scheduler.ts` (queue + worker), `worker.ts` (actions + voice), `proactive-jobs.ts` (smart-alarm).
- Backend survit maintenant à un Redis HS/saturé (API/chat/sockets restent up). tsc 0 erreur.

### Infra
- **Jobs réactivés** : `JOBS_ENABLED=true` remis sur Railway prod + redeploy. Logs prod confirment
  scheduler + reminder-worker actifs, erreur Upstash catchée, health 200. Rappels/briefing de retour.
- **VPS Hostinger opérationnel** (`45.9.190.54`, Ubuntu 24.04) : repo cloné `/root/dzaryx` (sync `9c81ace`),
  `.env` transféré, Node v22 + Claude Code 2.1.296, Claude loggé. Permet de bosser PC éteint (tmux).
  Détail : `DZARYX/SESSION_2026-10-11.md`.

## 2026-06-11 — Résilience "jamais mort" (crédits finis → bascule auto gratuit)

### backend/ + simulator/ + .github/ — Commit `72af321`
- **`agentic-fallback.ts`** (nouveau) — Claude mort → mêmes 151 outils sur Groq/Gemini free (tool calling
  compatible OpenAI), 1er fallback orchestrator. Puissance conservée (résas/finance/photos réelles).
- **TTS chain** — ElevenLabs → Gemini TTS free (PCM→WAV) → voix device (`Dzaryx:tts_fallback` + `speakOnDevice`).
- **Failover backend** — `VITE_BACKEND_BACKUPS`, bascule auto réseau/502-504/socket, localStorage.
- **`JOBS_ENABLED=false`** — instance backup sans jobs doublés. **`render.yaml`** — blueprint Render free.
- **`supabase-backup.yml`** — pg_dump hebdo → artefact 90j. ⚠️ Secret `SUPABASE_DB_URL` à créer.
- Simulateur **v84**. tsc 0, builds OK. 🛑 Kouider : compte Render + secret GitHub + UptimeRobot (10 min).

## 2026-06-11 — Audit + migrations confirmées lancées
- Toutes les migrations Supabase en attente sont **lancées** (confirmé Kouider) : `migration_car_currency.sql`,
  `migration_inspection_upgrade.sql`, `migration_phase_extras.sql`.
- Journal de session rattrapé (entrées 06-09/06-10 ajoutées).

## 2026-06-10 — Darija totale + STT gpt-4o + voix arabe + signature électronique + estimation dégâts + pricing dynamique

### backend/ + simulator/
- **`1d088f1`** + **`0ef121b`** — 3 features gardées (décision Kouider) : `estimate_damage` (photo → estimation coût,
  Sonnet Vision), `create_signature_link` + page publique `/sign/:token` (signature contrat archivée dans
  `contract_signatures`), `apply_dynamic_pricing` (bloque sous prix proprio). Retirés : dépenses/P&L, alertes
  expiration, compteur location. Migration `supabase/migration_phase_extras.sql`.
- **`f0f1059`** — agent clients reçoit `create_signature_link` (+ `generate_contract`) + keywords signer/signature.
- **`225ebce`** — STT primaire = **OpenAI gpt-4o-transcribe** (darija), fallback Groq Whisper → Google.
- **`581bff2`** / **`8a6d51a`** / **`df8d434`** — darija : réponse 100% darija oranaise max-arabe (labels traduits,
  noms propres/montants en latin), y compris rapports data/news.
- **`7c69a5e`** — TTS : voix ElevenLabs arabe dédiée auto-switch (`ELEVENLABS_VOICE_ID_AR`).
- **`60dd650`** — TTS : arabizi phonétique (3=ع, 7=ح…) sans toucher aux vrais nombres.
- **`d0ddce5`** / **`8a6d51a`** — vocal : hard reset micro au tap + auto-recover stream mort + watchdog 12s. SW v81→v83.
- **`dc4fa40`** — RESAS : MARGE calculée live (client−proprio)×jours, champ `profit_kouider` stale ignoré.
- **`f66b96f`** / **`4b5a63d`** — scan ID : archivage auto fiche client (`client_documents`) + regex tolérante typos.
- **`af94eac`** — docs : handoff A→Z `DZARYX/HANDOFF/` (hub + H01-H15).

## 2026-06-09 — Site : adresse autocomplétée admin immo
- **site `eebc960`** — autocomplétion Google (API publique backend) dans l'admin immo → carte précise sur l'annonce.

## 2026-06-08 — Inspection avant/après véhicule + immobilier (Vision Sonnet, marqueurs, lien réservation)

### backend/ + simulator/ + supabase/
- **`84583b4`** — Inspection complète. `inspection-core.ts` : Claude **Sonnet 4.6** → JSON structuré (dégâts en
  boîtes `{x,y,w,h}` normalisées + sévérité + flag `accident`) + upload **Cloudinary**. `vehicle-state.ts` :
  photo stockée + **lien réservation** (`booking_id` auto via client+voiture) + `damage_boxes`/`accident`/`severity`.
  `property-state.ts` (nouveau) : même chose pour l'**immobilier** (table `property_states`, état des lieux
  entrée/sortie). REST `POST/GET /api/inspections/{vehicle,property}`. Tools chat immo + fast-path orchestrator
  étendu au bien. App `FleetScreen` : modal `InspectionModal` (véhicule + bien) avec **photo + marqueurs numérotés**
  des dégâts + légende + bannière accident ; bouton 📷 sur chaque bien IMMO.
- **⚠️ ACTION REQUISE** : lancer **`supabase/migration_inspection_upgrade.sql`** (colonnes `vehicle_states` +
  table `property_states`). Sinon l'enregistrement échoue.
- Build : tsc backend EXIT 0, build simulateur EXIT 0, gh-pages **v44**.

## 2026-06-08 — Fix refresh catalogue site (toggle dispo)
- **site `c247974`** — `pages/cars.js` : refetch client-side des véhicules (le catalogue était figé par
  `getStaticProps revalidate:30` → un toggle dispo/indispo n'apparaissait qu'après ISR). Home + détail OK déjà.

## 2026-06-07 — Création annonces + photos via chat, vision chat, fixes matching

### backend/ + simulator/
- **`9e45312`** — Dzaryx attache les photos jointes au chat à la NOUVELLE annonce (voiture location `add_car`/`car_photos`, immo `create_property`/`property_photos`, vente `add_vehicle_for_sale`/`vehicle_sale_photos`, pack `image_url`). Endpoint `POST /api/cars/session-photos` (upload Cloudinary + cache Redis `session:photos:{sid}` 15min) → `attachSessionPhotos()` consommé par les tools create. Frontend `TextScreen` : détection `isCreateIntent` distingue création / store voiture existante / vision.
- **`4856275`** — `add_car` ajouté aux agents Réservations + Général (était scopé hors → Dzaryx ne pouvait PAS créer de voiture de location via chat).
- **`e54811b`** — Vision dans le chat : bypass des guards business (`fastPathGuard`/`checkAntiHallucination`) quand `imageBase64` présent (la réponse décrit l'image, pas une requête DB → écrasée à tort par `FAST_PATH_REFUSAL`).
- **`d4aa670`** — Matching voiture par score de tokens (≥3 lettres) dans `/api/cars/photos` (le fallback exigeait tous les mots, un token "9" cassait "Jumpy 9 Places").
- **Tests live (Railway + Supabase)** : création voiture via chat OK, création + 2 photos attachées (car_photos + image_url) OK, cleanup OK.

## 2026-06-03 — Latence réduite (réponses plus rapides) + fix native expo-fs

### backend/ — Réflexion étendue (thinking) optimisée pour la vitesse
- **`src/integrations/claude-api.ts`** :
  - **Tours vocaux (`voice_`) : thinking DÉSACTIVÉ** → plus de phase de réflexion de plusieurs secondes avant le premier mot. Outils + gates anti-hallucination garantissent déjà l'exactitude. Le mode texte garde la réflexion.
  - **Budgets thinking réduits** (texte) : high 10000→6000, codage 5000→4000, finance 6000→2500, recommandation 6000→3000, résumé 3000→1500.
- **Raison** : Kouider — "Dzaryx met trop de temps à répondre, surtout en vocal/vision".

### dzaryx-native/ — Fix build SDK 54
- **`app/voice.tsx`** : `EncodingType` retiré d'expo-file-system v19 → import via `expo-file-system/legacy`. Native TS = 0 erreur.

### simulator/ — Micro plus de re-tap (kouider213.github.io/ibrahim)
- **`src/components/screens/VoiceScreen.tsx`** : `audioUnlocked` persiste pour la session (flag module-level) → changer d'onglet VOIX↔CHAT ne réaffiche plus "ACTIVER DZARYX" à chaque retour. Au remontage, si déjà débloqué cette session → `initMic()` auto. SW `dzaryx-v9`→`v10`.

### backend/ + Supabase — Vidéos TikTok ne s'affichaient plus (boîte noire)
- **Cause racine** : le bucket Supabase Storage **`videos` n'existait pas** → tout upload vidéo échouait. De plus le job `jobWeeklyMarketing` affichait l'**image** de la voiture dans un `<video>` = boîte noire.
- **Fix** : bucket `videos` créé (public). **`src/queue/jobs/proactive-jobs.ts`** : la vidéo générée (buffer) est uploadée vers `videos` et son URL permanente utilisée dans le message proactif (au lieu de l'image).

### Suivi (non résolu — besoin test live)
- "Il répond pas / MIC 0.0" en vocal : l'analyser ne capte pas (AudioContext suspendu ?) — à débugger avec l'app ouverte. Le fix auto-initMic devrait aider.
- Compréhension vocale (Whisper turbo) : itérer avec exemples réels.
- `buildContext` charge ~20 sources en parallèle même en vocal — optimisation lean-context vocale possible.

---

## 2026-06-01 — Admin UI WOW + Multi-photos voitures + Gallery Dzaryx + Protection GitHub

### autolux-location (Vercel) — Commits : `39ed840`, `233f3f5`, `96caa8c`, `cf16200`, `81923f8`, `5377056`, `3ee5784`

#### Design system admin — Pattern premium appliqué à toutes les pages

**Principe :** Chaque carte KPI admin suit ce template :
```jsx
// Ligne gradient colorée en haut (1px)
<div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-{color}-500/0 via-{color}-500 to-{color}-500/0" />
// Halo ambient dans le coin supérieur droit
<div className="absolute -top-10 -right-10 w-32 h-32 rounded-full bg-{color}-500/8 blur-3xl pointer-events-none" />
// Nombre en gradient coloré (bg-clip-text text-transparent)
<div className="font-display text-3xl font-black bg-gradient-to-br from-{color}-300 to-{color}-500 bg-clip-text text-transparent tabular-nums" />
```
Couleurs disponibles : `gold` (or), `blue` (bleu), `emerald` (vert), `amber` (amber/orange), `purple` (violet)

#### `pages/admin/index.js` — Dashboard (commit `39ed840`, `cf16200`)
- **Supprimé** : ancien code avec emoji 📅 ⏳ 💰 📈 et cartes plates
- **Ajouté** : composant `KpiCard(Icon, accentColor, label, value, sub, delta)`
  - `delta` : affiche `<Delta v={caDelta} />` avec `ChevronUp`/`ChevronDown` en vert/rouge
  - `DeltaBadge` → `Delta` component (plus propre)
- **Ajouté** : composant `FinanceCard(title, rows, accent, accentColor)`
  - Rows = `[{label, value, highlight}]` — highlight = couleur accent
  - Accent = bloc du bas avec total en grand gradient
- **Greeting** : `"Bonjour, <span gradient-or>Kouider</span>"` au lieu de `Bonjour Kouider 👋`
- **Section headers** : lignes gradient `from-gold-500/30 to-transparent` + label centré
- **Table réservations** : headers en `text-[10px] font-black uppercase tracking-widest`, montants en gradient or
- **StatusBadge** : `{label, bg, text, dot}` par statut, inline-flex avec dot coloré

#### `pages/admin/bookings.js` — Réservations (commit `96caa8c`)
- **Supprimé** : emoji 📭 dans l'empty state
- **Ajouté** : `CalendarCheck` Lucide dans l'empty state
- **Modifié** : filter tabs → `rounded-xl` + count badge `text-[10px] px-1.5 rounded-md`
- **Ajouté** : `CalendarCheck` dans les imports Lucide

#### `pages/admin/clients.js` — Clients (commit `233f3f5`, `cf16200`)
- **Supprimé** : émojis 👥 ⭐ 💰 dans les KPI cards
- **Ajouté** : 4 KPI cards avec pattern premium (grid 2×2 sur mobile)
  - `Users` (bleu) → total clients
  - `Repeat2` (vert) → clients fidèles (bookings > 1)
  - `TrendingUp` (or) → CA total
  - `Users` (or) → valeur moyenne client
- **Modifié** : layout `grid-cols-1 lg:grid-cols-3` → liste (col-1) + détail (col-2)
- **Modifié** : client sélectionné → grid info avec 2 cartes gold highlighted (Réservations, Total dépensé)
- **Modifié** : bouton Appeler avec `Phone` Lucide icon

#### `pages/admin/reviews.js` — Avis (commit `233f3f5`, `cf16200`)
- **Supprimé** : cartes KPI plates avec emoji
- **Ajouté** : 3 KPI cards premium
  - `Star` (or) → note moyenne (calcul `reviews.reduce / reviews.length`)
  - `Clock` (amber) → en attente
  - `CheckCircle2` (vert) → publiés
- **Modifié** : filter tabs → même style que bookings
- **Modifié** : card avis → header avec avatar gold, date complète FR, étoiles avec `fill-current`
- **Actions** : `CheckCircle2` + "Publier", `Trash2` + "Supprimer" (plus d'emoji ✓ 🗑)

#### `pages/admin/analytics.js` — Analytics (commit `96caa8c`, `cf16200`)
- **Refait** : `StatCard` component — pattern premium complet
  - `colors` objet → `c` objet avec `{line, glow, icon, grad}` par couleur
  - Gradient text pour la valeur principale
- **Modifié** : period selector → container `bg-white/[0.04] border border-white/[0.08] rounded-xl p-1` avec boutons internes
- **Modifié** : section headers → `text-white/60 text-xs font-bold uppercase tracking-widest`
- **Modifié** : Clarity section → `Monitor` Lucide icon (plus de ⬡ emoji)

#### `pages/admin/cars.js` — Véhicules (commit `96caa8c`, `5377056`)
- **Imports ajoutés** : `Car, Plus, Edit2, Trash2, Eye, EyeOff, Camera, ImageIcon, Loader2, X, ChevronLeft, ChevronRight, GripVertical`
- **State ajouté** : `photos: [{url}]` (tableau de photos), `photoIdx: {[carId]: number}` (index carousel par voiture)
- **Fonctions ajoutées** :
  - `uploadPhoto(file)` : FileReader → base64 → POST `/api/upload-car-image` → push dans `photos[]`
  - `removePhoto(idx)` : `setPhotos(prev => prev.filter((_, i) => i !== idx))`
  - `movePhoto(idx, dir)` : swap photos[idx] ↔ photos[idx+dir]
  - `openEdit(car)` : charge `car.car_photos.sort(position).map(url)` dans `photos` state
  - `handleSave()` : `DELETE car_photos WHERE car_id` + `INSERT car_photos[]` + `image_url = photos[0]?.url`
- **Card voiture redesignée** :
  - Hauteur photo 44 (h-44) vs ancienne h-36
  - Badge statut en haut gauche (pill coloré)
  - Compteur `1/3` en haut droit
  - Navigation carousel `ChevronLeft`/`ChevronRight` au hover (opacity-0 group-hover:opacity-100)
  - Dots de navigation en bas (cliquables)
  - Gradient overlay `from-[#141414] to-transparent` sur 1/3 bas de l'image
  - Infos : 3 colonnes Proprio/Marge/Photos dans `bg-white/[0.04] rounded-xl`
  - Boutons : `Edit2 Modifier`, `EyeOff/Eye` (sans texte), `Trash2` (rouge)
- **Modal formulaire redesigné** :
  - `rounded-t-3xl sm:rounded-2xl` (bottom sheet sur mobile)
  - `bg-black/80 backdrop-blur-sm` (overlay premium)
  - Header sticky avec titre + `X` button rond
  - Marge preview : `bg-emerald-500/10` si ≥0, `bg-red-500/10` si <0
  - Section photos : grille 3 colonnes
    - Badge "PRINCIPALE" or sur photo[0]
    - Overlay hover avec ◀ 🗑 ▶
  - Boutons upload : camera + galerie avec Loader2 animé

#### `components/AdminLayout.js` — Sidebar (commit `39ed840`)
- **Logo** : `<img src="/logo.png" className="w-9 h-9 object-contain drop-shadow-[0_0_12px_rgba(226,182,20,0.4)]" />` au lieu de div "FK"

#### `styles/globals.css`
- **Modifié** : `.card-dark` → `bg-[#141414]` (plus #1a1a1a → plus sombre)
- **Ajouté** : `.admin-section-label` (text-white/30 text-[10px] font-black uppercase tracking-[0.15em])
- **Ajouté** : `.admin-number` (font-display font-black tabular-nums gradient or)

#### `supabase/0004_car_photos.sql` (nouveau)
```sql
CREATE TABLE car_photos (
  id         UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  car_id     UUID REFERENCES cars(id) ON DELETE CASCADE NOT NULL,
  url        TEXT NOT NULL,
  position   INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_car_photos_car      ON car_photos(car_id);
CREATE INDEX idx_car_photos_position ON car_photos(car_id, position);
ALTER TABLE car_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "car_photos: read public" ON car_photos FOR SELECT USING (true);
CREATE POLICY "car_photos: admin write" ON car_photos FOR ALL
  USING (auth.uid() IN (SELECT id FROM profiles WHERE role IN ('kouider', 'houari')));
```

#### `LICENSE` (nouveau dans autolux-location)
- "All Rights Reserved — Fik Conciergerie — Oran, Algeria"
- Interdit : copie, fork commercial, reverse engineering de la logique IA

---

### ibrahim (Railway + Netlify) — Commits : `c3f8f85`, `fd6352b`

#### `backend/src/integrations/tool-executor.ts` (commit `c3f8f85`)
- **Watermark ajouté** : header JSDoc avec signature `DZX-FK-OAN-2024-K7X9M2Q1`
- **`getCarPhotoTool()` reécrit** :
  - Avant : `select('id, name, image_url')` → 1 seule photo
  - Après : `select('id, name, image_url, car_photos(url, position)')` → toutes les photos
  - Trie `car_photos` par `position` ASC
  - Fallback : si `car_photos` vide → utilise `image_url`
  - Émet chaque photo : `emitProactive(label, 'info', label + '\n' + url)` avec 400ms delay
  - Retourne : `"✅ 3 photos envoyées pour 'Berlingo':\n1. url1\n2. url2\n3. url3"`

#### `mobile/src/services/api.ts` (commit `fd6352b`)
- **Interface `SocketCallbacks`** : ajout `onProactive?: (text: string, type: string, imageUrls: string[]) => void`
- **Handler socket `Dzaryx:proactive`** :
  ```typescript
  _socket.on('Dzaryx:proactive', (data: { text: string; type: string }) => {
    const imageUrls = (data.text.match(/https?:\/\/\S+\.(?:jpg|jpeg|png|webp|gif)(?:\?\S*)?/gi) ?? [])
      .filter(u => !u.includes('📹'));
    callbacks.onProactive?.(data.text, data.type ?? 'info', imageUrls);
  });
  ```

#### `mobile/src/components/ChatInterface.tsx` (commit `fd6352b`)
- **State ajouté** :
  ```typescript
  const [galleryPhotos,  setGalleryPhotos]  = useState<string[]>([]);
  const [galleryTitle,   setGalleryTitle]   = useState('');
  const [galleryOpen,    setGalleryOpen]    = useState(false);
  const [galleryFullIdx, setGalleryFullIdx] = useState<number | null>(null);
  const [sharingSaving,  setSharingSaving]  = useState(false);
  const galleryAccumRef = useRef<{urls: string[]; title: string; timer: ReturnType<typeof setTimeout>|null}>(...);
  ```
- **`onProactive` callback** : accumule dans `galleryAccumRef`, timer 1.2s puis affiche gallery
- **Gallery overlay** : `position:fixed inset-0 z-200`
  - Header : label "DZARYX — PHOTOS" + titre + compteur
  - Grid `repeat(2, 1fr)` aspect-ratio 4/3 → tap → fullscreen
  - Button WhatsApp : `wa.me/?text=📸 titre\n\nPhoto 1: url\nPhoto 2: url...`
  - Button "Enregistrer tout" : loop `window.open(url, '_blank')` avec 400ms delay
- **Fullscreen overlay** : `position:fixed inset-0 z-300`
  - Image `max-h-80vh object-contain`
  - Navigation ‹ › avec `setGalleryFullIdx(i => i-1/i+1)`
  - Button WhatsApp photo unique
  - Button Enregistrer `window.open(url, '_blank')`
  - Tap extérieur → `setGalleryFullIdx(null)`

#### Protection GitHub
- API GitHub PATCH : `{"private":true}` sur `autolux-location` et `ibrahim`
- `git remote set-url origin` : token supprimé de l'URL
- `LICENSE` All Rights Reserved dans les deux repos

---

## 2026-05-31 — Site autolux-location v2 (Next.js 14) + Widget Dzaryx + 15 nouveaux outils (Claude Sonnet 4.6)

### Commits rental-system ✅ — `aca07a4` ← dernier (5 commits hier)
### Commits ibrahim ✅ — `aca07a4` côté backend (déjà pushés Railway)

---

### rental-system (autolux-location.vercel.app) — Site Next.js 14 refactorisé

**Stack:** Next.js 14 + Tailwind + Framer Motion + GSAP + Supabase + Twilio + jsPDF
**Repo:** https://github.com/kouider213/autolux-location → Netlify auto-deploy

**Pages publiques:**
- `pages/index.js` — Homepage dark/gold, carousel avantages Framer Motion + swipe mobile
- `pages/reservation.js` — Formulaire multi-étapes (véhicule → dates → client), calcul prix, WhatsApp auto-formaté + lien suivi
- `pages/cars.js` + `pages/cars/[id].js` — Catalogue + fiche détaillée véhicule
- `pages/immo.js` + `pages/immo/[id].js` — Section immobilière Douba Groupe
- `pages/contact.js` — Page contact premium
- `pages/conditions.js` + `pages/reviews.js` — CGV + avis clients
- `pages/suivi/[id].js` — Suivi réservation client (status + WhatsApp)

**Admin (`/admin`):**
- `admin/index.js` — Dashboard KPIs temps réel (revenus, réservations, calculs alignés Dzaryx)
- `admin/bookings.js` — Gestion réservations
- `admin/clients.js` — Gestion clients
- `admin/cars.js` — Gestion parc (Realtime Supabase)
- `admin/immo.js` — Gestion annonces immobilières (20 photos)
- `admin/calendar.js` — Agenda
- `admin/reviews.js` — Modération avis
- `admin/analytics.js` — Tableau analytics (pages vues, devices, top véhicules)

**API Routes:**
- `api/notify-dzaryx.js` — Hook → insère dans table `notifications` Supabase → Dzaryx reçoit nouvelle réservation/avis en temps réel
- `api/track.js` — Tracking analytics pages vues
- `api/booking.js` — Création réservation
- `api/update-booking-status.js` — MAJ statut + WhatsApp auto au client si accepté
- `api/calendar-event.js` — Création Google Calendar
- `api/upload-car-image.js` — Upload photo véhicule

**Librairies:**
- `lib/tracker.js` — Analytics client-side (sessionId, device, referrer)
- `lib/booking.js` — Logique réservation partagée
- `lib/supabase.js` — Client Supabase

**Infra:**
- `netlify.toml` → `@netlify/plugin-nextjs`, build Node 20, headers sécurité
- `public/widget.js` — Widget chatbot copie locale (servi par Netlify)
- SEO : `sitemap.xml.js`, `robots.txt`, `404.js`

---

### ibrahim/backend — 15 nouveaux outils Dzaryx

**`backend/src/integrations/tools.ts` ← +15 outils:**
- `update_calendar_event` — Modifier événement Google Agenda existant
- `transform_image` — Image-to-image conservation visage (fal.ai IP-Adapter → Flux → Replicate)
- `obsidian_find_vault` — Détecter vault Obsidian via Nexus
- `obsidian_read_client` / `obsidian_update_client` / `obsidian_list_clients` — Fiches clients Obsidian
- `obsidian_write_note` / `obsidian_read_note` — Notes libres Obsidian
- `health_check_all` — Test tous les services (Railway/Claude/ElevenLabs/Supabase/Calendar/Nexus/GitHub)
- `track_habit` — Suivi habitudes/routines Kouider (BullMQ cron)
- `export_accounting` — Rapport compta PDF mensuel → Telegram
- `add_car` / `update_car` / `delete_car` — Gestion parc via Dzaryx
- `get_site_analytics` — Stats site (visites, conversion, top véhicules)
- `list_reviews` / `approve_review` / `delete_review` — Modération avis site
- `get_my_location` — Position GPS acteur depuis app mobile
- `save_vehicle_state_before` / `save_vehicle_state_after` / `get_vehicle_states` — Inspection véhicule avant/après location
- `suggest_smart_pricing` — Suggestions tarifaires IA
- `update_vehicle_maintenance` / `get_vehicle_maintenance` — Suivi entretien (km, vidange, révision)
- `set_phone_alarm` — Alarme native téléphone

**`backend/src/api/routes/widget.ts` ← NOUVEAU:**
- `POST /api/widget/chat` — Assistant client public (rate limit 20/min)
- `GET /api/widget/embed.js` — Script JS à intégrer sur n'importe quel site
- LLM waterfall: Groq → Gemini → OpenAI → Claude Haiku
- Cache flotte Supabase 3 min → affiche DISPONIBLE/NON DISPONIBLE temps réel

**`backend/src/whatsapp/` ← NOUVEAU dossier:**
- `client-session.ts` — Sessions WhatsApp in-memory (TTL 2h), logs → `whatsapp_messages`
- `language-detector.ts` — Détection FR/AR (MSA + darija latine)/EN + templates multilingues

---

### Connexion site ↔ Dzaryx

```
Client réserve sur autolux-location
  → api/booking.js → Supabase bookings
  → api/notify-dzaryx.js → Supabase notifications (pending)
  → Dzaryx dispatcher → Socket.IO → app Kouider (alerte instantanée)
```

---

## 2026-05-26 — SaaS Chat Fix + Sector Personas + Plan Ultimate IoT (Claude Sonnet 4.6)

### 3 commits ✅ — `e04401e` + `f5785b3` + simulator gh-pages

**SaaS Chat HTTP fix (critique) :**
- `backend/src/api/routes/saas-chat.ts` : chat via Anthropic SDK direct (Claude Haiku)
  - **Root cause** : Socket.IO auth rejette les SaaS JWT → silence complet
  - Fix : bypass Socket.IO, appel HTTP direct, retourne `{ text, ai_name }`
  - `buildSectorPrompt()` totalement réécrit — 10 secteurs avec personas IA riches
  - `sectorBehavior` map : règles de format/ton par secteur (style médecin, avocat, BTP...)

**SaasPortal.tsx — Adaptation secteur complète :**
- `simulator/src/components/SaasPortal.tsx` :
  - Socket.IO supprimé (badge hardcodé EN LIGNE vert)
  - `QUICK_ACTIONS` réécrits pour 11 secteurs — prompts détaillés actionnables
  - `SECTOR_FEATURES` réécrits pour 11 secteurs — descriptions valeur business réelle
  - `SECTOR_ITEM_EXTRA` : ajout beauty, auto_school, construction, ecommerce
  - Plan Ultimate IoT : nouveau tier doré dans l'UI upgrade

**Plan Ultimate IoT :**
- `backend/src/api/routes/saas.ts` : plan `ultimate` ajouté (199€/mois, messages illimités, IoT features)
- `backend/src/api/routes/saas-billing.ts` : `ultimate` → 19 900 DA/mois Chargily
- `backend/src/api/routes/saas-admin.ts` : `ultimate_orgs` compté, revenue = pro*29 + ent*99 + ult*199

**Actions manuelles requises :**
- [ ] Appliquer `supabase/migration_saas_notifications.sql` dans Supabase SQL editor
- [ ] Configurer SMTP Railway : `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` pour emails réels

---

## 2026-05-22 — Per-Actor Notifications + Dzaryx Living Brain (Claude Sonnet 4.6)

### 2 commits ✅ — `326ce67` + `4a7da96`

**Per-actor notification targeting (`326ce67`) :**
- `backend/src/queue/jobs/proactive-jobs.ts` : 11 jobs Kouider-only tagués `emitProactive(..., 'kouider')`
- `backend/src/notifications/mobile-push.ts` : `getRecentProactives(actor?)` merge global + actor Redis
- `backend/src/api/routes/notifications.ts` : `/proactive/recent?actor=` query param
- `simulator/src/services/api.ts` : Socket.IO filtre `targetActor`, API passe `?actor=`

**Dzaryx Living Brain (`4a7da96`) :**
- `backend/src/integrations/client-brain.ts` (NEW) :
  - `getClientBrain()` — profil enrichi avec voitures, mois, patterns vol, insights IA
  - `addClientNote()` — note permanente client
  - `setArrivalPattern()` — patterns d'arrivée (heure, jour, origine vol)
  - `saveObservation()` — mémoire libre `dzaryx_observations`
  - `analyzeAllClients()` — batch Claude AI → insights naturels (séparé par acteur)
  - `learnFromConversation()` — détecte vocab approbation/rejet → `actor_brain`
  - `getActorBrainContext()` — injecté dans prompt système
- `backend/src/integrations/tools.ts` : 3 nouveaux outils (`get_client_brain`, `add_client_note`, `set_arrival_pattern`)
- `backend/src/integrations/tool-executor.ts` : dispatch 3 nouveaux outils (actor détecté via sessionId)
- `backend/src/conversation/context-builder.ts` : brain + actor brain injectés auto si client mentionné
- `backend/src/queue/scheduler.ts` : job `client-brain-update` dimanche 3h00 Algeria
- `backend/src/queue/jobs/proactive-jobs.ts` : `jobClientBrainUpdate` — analyse tous acteurs + résumé Kouider
- `supabase/migrations/20260522_dzaryx_brain.sql` (NEW) : 3 nouvelles tables + colonnes `client_intelligence`

**Actions manuelles Kouider :**
- ✅ Migration `20260522_dzaryx_brain.sql` appliquée Supabase

---

## 2026-05-21 — GPS + Simulateur Phase 8 + GitHub Pages + Houari Token (Claude Sonnet 4.6)

### Session complète — commit `34b0fb7` ✅
- **Commits** : `34b0fb7` (GPS + Simulator + GitHub Pages deploy)
- **Backend** :
  - `backend/src/config/env.ts` : ajout `GOOGLE_MAPS_API_KEY` (optional)
  - `backend/src/integrations/tools.ts` : ajout outil `calculate_delivery_fee`
  - `backend/src/integrations/tool-executor.ts` : implémentation `calculateDeliveryFeeTool`
    - Dépôt : Es Sénia (35.6459, -0.6050) hardcodé
    - Tarif défaut : 200 DZD/km configurable
    - Returns : distance km, temps, frais DZD, lien Waze, lien Google Maps
- **Simulator** (GitHub Pages — pas Netlify) :
  - `simulator/src/components/Phone.tsx` : tab Telegram SUPPRIMÉ (décision Kouider), 12 tabs
  - `simulator/src/components/screens/SettingsScreen.tsx` : "RÈGLES APPRISES (PHASE 8)" panel, fix `nexus_online?: boolean`
  - `simulator/src/components/screens/DocumentsScreen.tsx` : "GÉNÉRER CONTRAT PDF" panel
  - `simulator/src/components/screens/BookingsScreen.tsx` : panel GPS (`GpsCalculator`) avec 6 landmarks Oran
- **Railway** (Kouider ajouté manuellement) :
  - `MOBILE_TOKEN_HOUARI` = 99c3dba3...
  - `GOOGLE_MAPS_API_KEY` = AIzaSyAv7s2...
- **Supabase** : Migration Phase 8 appliquée (7 tables + seeds)
- **GitHub Pages** : `https://kouider213.github.io/ibrahim/` déployé — simulateur principal désormais
- **Documentation** : `CURRENT_STATE.md` + `HANDOVER_CLAUDE2.md` mis à jour intégralement
- **Décisions Kouider** : WhatsApp → août 2026, iOS → non, Chargily → non, Telegram → backup seulement

---

## 2026-05-21 — Phase 8 : Learned Rules + PDF Contrat + Excel + Nexus Health + STT + FCM (Claude Sonnet 4.6)

### Phase 8 complète — 3 commits ✅
- **Commits** : `96c6376` + `bbead09` + `e096a55`
- **Fichiers** :
  - `backend/src/integrations/learned-rules.ts` (NEW — CRUD règles apprises, formatage contexte)
  - `backend/src/integrations/generate-contract.ts` (NEW — contrat PDF signable avec CGV)
  - `backend/src/integrations/excel-export.ts` (NEW — export .xlsx comptable via SheetJS)
  - `backend/src/notifications/fcm.ts` (NEW — Firebase Admin SDK, dual push Expo/FCM)
  - `backend/src/integrations/tool-executor.ts` (+4 cases: save/list learned_rules, contract, excel)
  - `backend/src/integrations/tools.ts` (+4 outils Phase 8, -create_payment_link Chargily)
  - `backend/src/conversation/context-builder.ts` (inject learned rules dans system prompt)
  - `backend/src/actions/handlers/nexus-relay.ts` (heartbeat → Redis nexus:health TTL=120s)
  - `backend/src/api/routes/transcribe.ts` (Google STT provider + fallback Groq)
  - `backend/src/notifications/mobile-push.ts` (route FCM natif vs Expo)
  - `backend/src/config/env.ts` (FIREBASE_SERVICE_ACCOUNT_JSON)
  - `simulator/src/services/api.ts` (nexus() → /api/nexus/live-status)
  - `simulator/src/components/screens/SettingsScreen.tsx` (grille Nexus live HOST/CPU/RAM)
  - `supabase/migration_phase8.sql` (NEW — 7 tables + seeds)
- **Packages** : `xlsx`, `@google-cloud/speech`, `firebase-admin`
- **Note** : migration_phase8.sql à appliquer manuellement dans Supabase Dashboard

---

## 2026-05-20 — Simulator Capacités + Telegram Demo + Power-off (Claude Sonnet 4.6)

### 2 nouveaux écrans + power-off + Obsidian mis à jour ✅
- **Commit** : `d88dbaa`
- **Fichiers** :
  - `simulator/src/components/screens/TelegramScreen.tsx` (NEW — 280 lignes)
  - `simulator/src/components/screens/CapacitesScreen.tsx` (NEW — 380 lignes)
  - `simulator/src/components/Phone.tsx` (power-off + 2 nouveaux tabs)
  - `DZARYX/CURRENT_STATE.md`, `DZARYX/ROADMAP.md`, `DZARYX/HANDOFF.md` (mis à jour)
- **Changements** :
  - **TelegramScreen** : simulation Telegram 6 canaux (ALL/FINANCE/RESAS/DOCS/NEXUS/MARKETING)
    - Bulles messages Kouider (droite bleue) vs Dzaryx (gauche sombre)
    - Tous types : text, alert (tag coloré + actions), photo, video, file
    - Badges unread par canal, sélecteur onglets scrollable
    - Messages pré-chargés : briefing matinal, alertes impayés, résa créée, doc passeport, rapport CA, vidéo marketing, PC nexus terminal
  - **CapacitesScreen** : 3 onglets
    - "14 AGENTS" : tous les agents expandables avec description + 4 exemples de commandes chacun
    - "PROACTIF" : timeline journée type + 8 fonctionnalités proactives avec couleur et desc
    - "CAPACITÉS" : 8 sections complètes (IA, communication, réservations, finance, docs, PC, web, marketing)
  - **Phone.tsx** : power button → animation fade out → DZARYX logo → "ARRÊT EN COURS" → retour lock screen
  - Tabs : 13 tabs total (VOIX/CHAT/TELEGRAM/DZARYX/RESAS/PARC/CA/CLIENTS/AGENDA/ALERTES/RAPPELS/DOCS/CONFIG)
- **Netlify** : `6a0d57e1` → https://dzaryx-simulator.netlify.app ✅
- **Build** : 364KB JS, 0 erreurs TS

---

## 2026-05-20 — FleetScreen compact banner restore (Claude Sonnet 4.6)

### Restauration design original FleetScreen ✅
- **Commit** : `86eec58`
- **Fichier** : `simulator/src/components/screens/FleetScreen.tsx`
- **Changement** : banner 90px full-width, objectFit cover (après itérations utilisateur)
- **Netlify** : `6a0d5409` ✅

---

## 2026-05-19 — Simulator All Screens HUD Redesign (Claude Sonnet 4.6)

### 7 screens redesigned with cyberpunk HUD aesthetic ✅
- **Commit** : `9232dc3`
- **Fichiers** : `BookingsScreen`, `FleetScreen`, `RevenueScreen`, `ClientsScreen`, `RemindersScreen`, `DocumentsScreen`, `SettingsScreen`
- **Changements** :
  - Header HUD uniforme sur tous les écrans (Orbitron + gradient separator)
  - KPI stat cards avec glow neon (Bookings: actives/CA/profit, Fleet: total/dispo/occup/indispo, Revenue: jour/sem/mois, Clients: total/VIP/CA)
  - Bookings: cartes avec dot status glow, gradient bg par statut, expanded detail panel
  - Fleet: barre occupancy par voiture animée, toggle buttons colorés
  - Revenue: bar chart visuel, carte profit gold, top-clients avec classement
  - Clients: avatar avec initiales, badge VIP glow, intel panel expandable
  - Reminders: barre accent colorée à gauche, badge URGENT pulsant, compteurs par priorité
  - Documents: progress bar animation OCR, panel orange thème scan
  - Settings: actor cards avec icône glow, status pills avec dot pulse
  - Corner brackets HUD sur tous les écrans
  - 0 erreurs TypeScript, build propre
- **Netlify** : `6a0c1bb5` → https://dzaryx-simulator.netlify.app ✅

---

## 2026-05-19 — Simulator UI Redesign Cyberpunk Robot (Claude Sonnet 4.6)

### VoiceScreen + TextScreen redesign ✅
- **Commit** : `fdbbe4e`
- **Fichiers** :
  - `simulator/src/components/screens/VoiceScreen.tsx` (REWRITE — robot SVG)
  - `simulator/src/components/screens/TextScreen.tsx` (REWRITE — HUD header)
  - `simulator/src/index.css` (robot keyframe animations)
- **Features** :
  - `DzaryxRobot` SVG : tête chrome + visor + yeux LED cyan + oreilles avec 5 barres audio + bouche LED (parle/plat) + antenne clignotante + anneau thinking jaune + anneaux rotatifs externes
  - VoiceScreen : header DZARYX + subtitle "IA DE FIK CONCIERGERIE · ORAN", badge status animé, robot centré animé (float / floatListen), 3 boutons SCAN/MIC/VISION avec labels
  - Couleur thinking : `#9b59b6` → `#ffaa00` (jaune comme référence images)
  - TextScreen : header HUD avec connexion + titre DZARYX + subtitle, avatar `RobotAvatar` mini SVG dans les bulles (remplace "D"), typo Share Tech Mono, input HUD-style
  - Canvas réduit à background (particles + anneaux ambiants, sans orb central)
  - Netlify deploy : `6a0c0af3` → https://dzaryx-simulator.netlify.app ✅

---

## 2026-05-18 — Simulator Full Parity + APK Bugs (Claude Sonnet 4.6)

### Simulator — 9 onglets, parité APK complète ✅
- **Commit** : `56b3fa1`
- **Fichiers** :
  - `simulator/src/components/Phone.tsx` (REWRITE — 9-tab navigation)
  - `simulator/src/services/api.ts` (actor management + business API layer)
  - `simulator/src/components/screens/BookingsScreen.tsx` (NEW)
  - `simulator/src/components/screens/FleetScreen.tsx` (NEW)
  - `simulator/src/components/screens/RevenueScreen.tsx` (NEW)
  - `simulator/src/components/screens/ClientsScreen.tsx` (NEW)
  - `simulator/src/components/screens/RemindersScreen.tsx` (NEW)
  - `simulator/src/components/screens/DocumentsScreen.tsx` (NEW)
  - `simulator/src/components/screens/SettingsScreen.tsx` (NEW)
  - `simulator/src/components/screens/VoiceScreen.tsx` (SCAN button added)
- **Features** :
  - Phone.tsx : `Page` type 9 valeurs, `TABS` array, `NavBar` scrollable horizontal (overflowX auto), `renderScreen()` routing
  - api.ts : `HOUARI_TOKEN`, `setSimActor/getSimActor`, `getToken()` actor-scoped, `getOrCreateSessionId()` → `voice_${actor}`, `business` export (15 méthodes : fetchBookings, fetchCars, fetchFleet, fetchRevenue, fetchReminders, dismissReminder, fetchClients, fetchClientIntel, toggleCar, deleteBooking, createBooking, clearCache, fetchJobs, triggerJob, health, nexus)
  - BookingsScreen : liste + search + expand détail + delete + create form inline (profit live)
  - FleetScreen : stats (total/dispo/occupancy%) + toggle disponibilité + revenus 30j + intel
  - RevenueScreen : CA today/week/month + profit Kouider + top clients scorés (VIP=#ffd700)
  - ClientsScreen : search + score badges + intelligence expand + phone link
  - RemindersScreen : HIGH/MEDIUM/LOW groupés + dismiss + phone link
  - DocumentsScreen : fetch PASSEPORT/PERMIS/CONTRAT par nom + OCR file input → /api/vision/scan
  - SettingsScreen : acteur switcher (Kouider/Houari) + backend health + nexus status + cache clear + scheduler jobs trigger
- **TypeScript** : 0 erreurs
- **Déployé** : https://dzaryx-simulator.netlify.app (make-zip.mjs POSIX zip)

### APK — Bugs fixés + Écran Documents ✅
- **Commit** : `56b3fa1`
- **Fichiers** :
  - `dzaryx-native/app/voice.tsx` (Houari token fix + SCAN button)
  - `dzaryx-native/app/documents.tsx` (NEW)
  - `dzaryx-native/app/_layout.tsx` (route documents)
  - `dzaryx-native/app/settings.tsx` (bouton Documents + styles)
- **B020 fixé** : `voice.tsx` utilisait `MOBILE_TOKEN` hardcodé (Kouider) → `useStore(s => s.mobileToken)` + `useStore(s => s.sessionId)` dynamique
- **B021 fixé** : Bouton SCAN OCR absent dans voice.tsx APK → ajouté (ImagePicker.launchCameraAsync → /api/vision/scan → /api/chat → TTS)
- **documents.tsx** : écran complet — section fetch (TextInput nom + 3 boutons PASSEPORT/PERMIS/CONTRAT → POST /api/chat) + section OCR (launchCameraAsync → POST /api/vision/scan)
- **TypeScript** : 0 erreurs

---

## 2026-05-17 — Feature Parity Session (Claude Sonnet 4.6) — Autonomous

### Native App — Écrans Réservations ✅
- **Commits** : `222e64c`, `2e1cbb3`, `7596ebc`
- **Fichiers** : `dzaryx-native/app/bookings.tsx` (NEW), `app/new-booking.tsx` (NEW), `app/settings.tsx`, `app/_layout.tsx`, `lib/api.ts`
- **Features** :
  - Écran Réservations : liste temps réel, stats (total/actif/retard), filtres par statut, retards mis en évidence
  - Boutons rapides par carte : 📞 APPELER (tel:), 💳 PAYÉ, ✓ ACTIVER (sans passer par le chat AI)
  - Écran Création Réservation : picker voiture, champs client+dates+prix, calcul profit live, submit via REST API
  - Bouton RÉSERVATIONS dans Settings → navigation vers écran réservations
- **Nouveaux helpers API** : `fetchBookings()`, `fetchCars()`, `updateBookingField()`, `Booking` interface, `Car` interface

### Backend — Nouveaux Outils AI ✅
- **Commit** : `222e64c`
- **Outils** : `export_accounting`, `get_client_profile`, `track_habit`
  - `export_accounting` : PDF comptable mensuel (tableau réservations + KPIs) → upload Supabase + envoi Telegram
  - `get_client_profile` : profil comportemental client depuis `client_intelligence` (voitures préférées, fiabilité, score)
  - `track_habit` : ajouter/mettre à jour habitudes dans `memory_habits` via conversation (vitamines, sport, check clients...)
- **Agent routing** : FINANCE_AGENT, CLIENTS_AGENT, MEMORY_AGENT toolNames + keywords étendus

### Backend — Améliorations API ✅
- **Commits** : `e0e501d`, `2e1cbb3`
- `GET /api/bookings/cars` : liste flotte (id, name, category, available) pour formulaire réservation mobile
- `PATCH /api/bookings/:id` : insertion automatique paiement dans `payments` table quand `payment_status='PAID'`
- `jobBIReminders` : envoi push mobile en plus de Telegram

### Backend — Alert Missing Owner PPD ✅
- **Commit** : `222e64c`
- `create_booking` : si `owner_price_per_day` null → alerte Telegram immédiate (profit non calculable)

### Memory Engine ✅
- **Commits** : `1a7f482`, `20f10f8`
- B018 : `writeMemory()` utilisait `source` comme `user_id` → corrigé
- B019 : Houari écrivait sous `user_id='kouider'` → `inferUserId(sessionId)` acteur-scoped
- Nouveaux domaines mémoire : `vehicle`, `client`, `finance`, `learning`, `note`
- Scoring mémoire étendu pour les nouveaux domaines

### Episode Auto-Tracking ✅
- **Commit** : `84420bc`
- `episode-tracker.ts` (NEW) : sauvegarde automatique d'épisodes importants (bookings, paiements, documents)
- Context builder injecte les épisodes récents si question historique

### Scheduler — Nouveaux Jobs ✅
- **Commits** : `69dcf0d`, `84420bc`
- `vehicle-utilization` (sam 9h) : rapport 30j utilisation parc avec suggestions
- `habit-check` (8h15 quotidien) : vérification habitudes actives
- `monthly-report` (1er du mois 9h) : bilan mensuel auto avec push mobile
- `long-idle-alert` (lun 10h) : alerte véhicules immobilisés 14+ jours

---

## 2026-05-17 — Remote Control Mission (Claude Sonnet 4.6)

### Conversation Engine V2 ✅
- **Commits** : `aed62e3`, `c98bd8d`
- **Fichiers** : `backend/src/conversation/normalizer.ts` (NEW), `entity-extractor.ts` (NEW), `pending-action.ts` (NEW), `engine-v2.ts` (NEW), `tests/engine-v2.test.ts` (NEW)
- **Résultat** : 41/41 tests pass. Typos corrigés, entités extraites, pending actions Redis 5min.

### Native App — Dzaryx Android ✅
- **Commits** : `3c144cc`, `42be09b`, `b3b33df`
- **Fichiers** : `dzaryx-native/app/onboarding/mode.tsx` (NEW), `app/settings.tsx` (NEW), `app.json`, `app/_layout.tsx`, `app/chat.tsx`, `app/onboarding/business.tsx`, `app/onboarding/personal.tsx`, `lib/api.ts`
- **Features** : Settings screen, quick commands, RÉGLAGES button, actor-scoped token, auth/login après onboarding
- **Bugs fixés** : B010 (mode.tsx manquant), B011 (app.json trailing comma), B012 (4 TS errors), B013 (Houari token), B014 (onboarding flow), TypeScript : 0 erreurs

### Backend Améliorations ✅
- **Commit** : `35fdaed`
- **Fichiers** : `backend/src/conversation/orchestrator.ts`, `backend/src/api/routes/transcribe.ts`
- **B015** : Whisper auto-detect language (fr/ar/darija)
- **B016** : Delete gate — confirmation obligatoire avant suppression

---

## 2026-05-15 — Session soir (Claude Code / Sonnet 4.6)

### Anti-hallucination — Fix complet ✅
- **Commit** : `71d2b1c`
- **Fichiers** :
  - `backend/src/orchestrator/anti-hallucination.ts` (Gates 4/4b/4c + fastPathGuard)
  - `backend/src/conversation/orchestrator.ts` (fastPathGuard appliqué fast-path + fallback)
  - `backend/src/config/constants.ts` (RÈGLE ABSOLUE CONNAISSANCE EN TEMPS RÉEL)
  - `backend/src/tests/anti-hallucination.test.ts` (26 tests unitaires)
- **DATA_TOOLS** : ajout `get_fleet_status` + `get_client_document`
- **Gate 2 étendu** : 6 nouveaux patterns — revenus/bénéfice/profit casual
- **Gate 3 étendu** : 4 nouveaux patterns — "j'ai consulté la base", "d'après mes données"
- **Gate 4 (nouveau)** : booking count bloqué sans list_bookings/check_anomalies
- **Gate 4b (nouveau)** : disponibilité véhicule bloquée sans check_car_availability/get_fleet_status
- **Gate 4c (nouveau)** : claims paiement bloqués sans get_payment_status/get_unpaid_bookings
- **fastPathGuard (nouveau)** : Groq/Gemini/OpenAI bloqués dès qu'ils affirment données business (montants, réservations, disponibilités, chiffres) — renvoient refusal propre
- **System prompt** : RÈGLE ABSOLUE CONNAISSANCE EN TEMPS RÉEL — Dzaryx ne donne aucun chiffre business sans outil appelé dans le même tour
- **Tests** : 26/26 ✅ — TypeScript 0 erreurs

---

## 2026-05-15 — Session après-midi (Claude Code / Sonnet 4.6)

### Phase 6 Mobile ✅ — 3 nouveaux panels Dashboard
- **Commit** : `bc06bc4`
- **Fichiers** :
  - `mobile/src/components/dashboard/panels/BookingForm.tsx` (nouveau)
  - `mobile/src/components/dashboard/panels/CalendarView.tsx` (nouveau)
  - `mobile/src/components/dashboard/panels/ClientsView.tsx` (nouveau)
  - `mobile/src/components/dashboard/Dashboard.tsx` (3 lazy imports + PANELS Record)
  - `mobile/src/components/dashboard/DashboardNav.tsx` (BottomNav scrollable)
  - `mobile/src/dashboard.css` (`.no-scrollbar` utility)
- **BookingForm** : formulaire création réservation — sélection voiture (avec dispo), client nom+téléphone, dates, prix client/Houari DA/j, calcul profit live, soumis via `api.chat()` → BOOKING_AGENT
- **CalendarView** : grille mois calendrier (lundi en premier), heatmap intensité réservations (4 niveaux cyan), aujourd'hui surligné, stats mois, état parc voitures
- **ClientsView** : liste clients avec score VIP/FREQUENT/REGULAR/NEW, recherche nom, filtre par score, total dépensé, lien tel: téléphone
- **Nav** : `DashSection` type étendu (7→10 items), BottomNav overflow-x scroll sans scrollbar visible
- **Build** : 0 erreurs TS, 0 erreurs build Vite, 12 chunks propres

---

## 2026-05-15 — Session matin/midi (Claude Code / Sonnet 4.6)

### B002 ✅ — Cache Redis revenus 30 min → 5 min + endpoint clear
- **Fichiers** : `backend/src/bi/revenue-intelligence.ts`, `backend/src/api/routes/bi.ts`
- **Fix** : TTL Redis 1800s → 300s. Endpoint `POST /api/bi/cache/clear` vide `bi:revenue` + `bi:full` + `bi:fleet` instantanément.
- **Commit** : `0f67e9d`

### B003 ✅ — `checkAnomalies()` filtre dates corrigé (overlap)
- **Fichier** : `backend/src/integrations/phase5-finance.ts` ligne ~488
- **Fix** : `.lte('start_date', monthEnd).gte('end_date', monthStart)` — réservations actives ce mois visibles même si démarrées le mois précédent.
- **Commit** : `bb692ac`

---

## 2026-05-15 — Session matin (Claude Code / Sonnet 4.6)

### B006 ✅ — "Donne moi les revenu" bloqué anti-hallucination (fast-mode bug)
- **Fichiers** : `backend/src/integrations/claude-api.ts`, `backend/src/agents/agent-registry.ts`, `backend/src/integrations/llm-router.ts`
- **Cause réelle** : Message 20 chars < 30 → `isFastModeEligible` returnait `true` → Claude Haiku sans outils → Gate 2 bloquait.
- **Fix** :
  - `needsAction` regex élargi : ajout `revenu|revenus|bénéfice|profit|gagné|gain|argent|chiffre|recette|encaissé|dette|caisse|trésorerie`
  - FINANCE_AGENT keywords : ajout `revenu|revenus|bénéfice|profit|gagné|gain|rapport\s+fi`
  - FINANCE_AGENT provider : `openai/gpt-4o` → `claude-sonnet-4-6` (tool-calling fiable)
  - TOOL_KEYWORDS llm-router : ajout des mots FR manquants
- **Commits** : `55db5da`, `62de8d5`

### Revenus prorabilisés — today/week/month = jours réels (pas contrat entier)
- **Fichier** : `backend/src/bi/revenue-intelligence.ts`
- **Fix** : `proratedCA()` calcule uniquement les jours qui tombent dans la fenêtre demandée. Today = 1 jour × tarif journalier. Semaine = overlap 7 jours. Mois = overlap mois complet.

### Planning Kouider embarqué dans Dzaryx
- **Fichiers** : `backend/src/config/constants.ts`, `backend/src/conversation/proactive-engine.ts`
- **Ajouté** : `KOUIDER_SCHEDULE` (7 jours, wake/travail/business/famille), notifications proactives per-day, compréhension employé remise véhicules.

---

## 2026-05-14 — Session après-midi/soir (Claude Code / Sonnet 4.6)

### GENERAL_AGENT — recherche web toujours active, sans demander permission
- **Commits** : `61b41b9`, `b2b13b1`, `05baced`
- **Fichiers** : `backend/src/agents/agent-registry.ts`, `backend/src/integrations/tool-executor.ts`
- **Problème** : Dzaryx demandait "puis-je faire une recherche ?" au lieu de chercher directement.
- **Fix** :
  - GENERAL_AGENT créé avec `web_search` comme outil principal
  - Minimum 2 tentatives `web_search` avant de répondre
  - Messages courts (< 30 chars) routés vers Claude (pas Groq) pour garder le contexte business
  - Plus jamais de demande de permission pour chercher sur internet

### `get_car_photo` — photos réelles du parc dans les vidéos/images marketing
- **Commit** : `85a60bd`
- **Fichiers** : `backend/src/integrations/tools.ts`, `backend/src/integrations/tool-executor.ts`
- **Ajouté** : Outil `get_car_photo` — récupère URL photo Cloudinary réelle d'un véhicule depuis Supabase `cars` table. Claude utilise la vraie photo du parc, pas un placeholder.

### Cloudinary images → Telegram (envoi direct URL)
- **Commit** : `d1d45d3`
- **Fichiers** : `backend/src/integrations/tool-executor.ts`
- **Fix** : Les images générées via Cloudinary étaient perdues. Fix : forcer l'URL dans la réponse Claude + envoi direct `sendPhoto(cloudinaryUrl)` dans Telegram.

### CODE_AGENT — retrait du keyword générique 'créer'
- **Commit** : `4e53a11`
- **Fichier** : `backend/src/agents/agent-registry.ts`
- **Problème** : "crée une vidéo" / "crée une image" routait vers CODE_AGENT au lieu de TIKTOK_AGENT.
- **Fix** : Retiré `créer` des keywords CODE_AGENT. Seuls les vrais contextes code (bug, script, python, deploy...) activent cet agent.

### NETWORK_ANALYST — anti-hallucination agressive
- **Commit** : `0e48393`
- **Fichier** : `backend/src/agents/agent-registry.ts`
- **Fix** : NETWORK_ANALYST reçoit désormais une instruction explicite de bloquer toute affirmation de données concurrentes sans avoir appelé `web_search`.

### Recherche web — SearXNG + Jina Reader (remplace DDG/Bing cassés)
- **Commits** : `cf50433`, `162052b`
- **Fichiers** : `backend/src/integrations/web-search.ts`
- **Fix** : DDG et Bing scrapers retournaient des erreurs. Ajout de :
  - **SearXNG** (instance publique, pas de clé API)
  - **Jina Reader** (`r.jina.ai/URL`) — fonctionne aussi sur YouTube, TikTok
  - **Cascade** : SearXNG → Jina → fallback texte

### Concurrent/veille — route vers Claude agentic loop
- **Commit** : `e0c4dbc`, `d5dc597`
- **Fichiers** : `backend/src/integrations/llm-router.ts`, `backend/src/agents/agent-registry.ts`
- **Fix** : "Analyse les concurrents" ne routait pas vers Claude → aucun outil appelé. Fix : ajout keywords concurrent dans TOOL_KEYWORDS + NETWORK_ANALYST keywords élargis. Résultats multi-sources avec hashtags contextuels.

---

## 2026-05-14 — Session matin (Claude Code / Sonnet 4.6)

### Documents clients — système complet réécrit
- **Commits** : `759c32d`, `caee9b2`, `c2a0e06`, `793f7b3`, `e765c92`, `0950cbc`, `bc5e555`, `ee4a0fd`, `492bf03`
- **Fichiers** : `backend/src/integrations/tool-executor.ts`, `backend/src/integrations/tools.ts`, `backend/src/agents/agent-registry.ts`
- **Problèmes résolus** :
  - `URLSearchParams` encodait `*` en `%2A` → filtre ilike Supabase cassé
  - Documents téléchargés depuis URL publique (au lieu de service key Supabase)
  - Mauvais envoi Telegram (`sendPhoto` marketing au lieu de `sendPhoto` API)
  - Doublon tool `get_client_document` dans le registry
  - `passeport` absent de TOOL_KEYWORDS → routait vers Groq sans outils
- **Fix** : Réécriture avec `axios` REST direct + service key + envoi buffer + `store_document` schema corrigé

### Réservations — série de correctifs critiques
- **Commits** : `f9d34a4`, `431e3ac`, `7b57580`, `927f2a0`, `617ce9b`, `df700c5`, `93d9282`, `1e14530`, `b912528`, `828faef`, `0801f81`
- **Fichiers** : `backend/src/integrations/tool-executor.ts`, `backend/src/integrations/tools.ts`, `backend/src/agents/agent-registry.ts`
- **Correctifs** :
  - `car_id` maintenant résolu depuis `car_name` (Claude donnait un nom, pas un UUID)
  - `payment_status` normalisé `UNPAID` (contrainte Supabase)
  - `client_age` réajouté dans INSERT (colonne NOT NULL existante)
  - Colonnes inconnues stripées avant INSERT
  - Plus de confirmation demandée avant `create_booking` — crée directement
  - Messages numériques courts gardent le contexte de langue (arabe/français)
  - Grille tarifaire corrigée (colonnes `vehicle_name`, `houari_price`)
  - Gate 2 anti-hallucination : `create_booking`/`update_booking` exemptés (opérations légitimes)

### Google Calendar — suppression événement + log erreur
- **Commits** : `89eb578`, `ea43e32`
- **Fichiers** : `backend/src/integrations/tool-executor.ts`
- **Fix** : Suppression réservation → suppression automatique événement Google Calendar. Log complet erreur API Google (était silencieux avant).

### Vision — Claude Haiku comme fallback final
- **Commit** : `1636000`
- **Fichier** : `backend/src/integrations/llm-router.ts`
- **Ajouté** : Cascade vision : Gemini Flash → OpenAI GPT-4o Vision → Claude Haiku. Plus de crash si Gemini et OpenAI échouent.

### Routing — historique conversationnel ne hijacke plus les agents
- **Commits** : `989aa89`, `5af1cf6`
- **Fichiers** : `backend/src/agents/core-router.ts`, `backend/src/conversation/orchestrator.ts`
- **Problème** : L'historique conversation forçait BOOKING_AGENT même sur des messages clients/documents sans lien avec une réservation.
- **Fix** : Priority override retiré. `detectAgentFromHistory` inclut maintenant les messages user (pas seulement assistant) pour une meilleure détection.

### Nexus — messages réservation ne routent plus vers Nexus music
- **Commit** : `e2c7561`
- **Fichier** : `nexus/modules/ws_client.py`
- **Fix** : Le router Nexus interceptait des messages "réservation" pour le module music. Filtrage corrigé.

---

## 2026-05-14 — Session nuit (Claude Code / Sonnet 4.6)

### B005 ✅ — Vidéo marketing réellement livrée dans Telegram
- **Fichiers** : `backend/src/marketing/create-marketing-video.ts`, `backend/src/integrations/tool-executor.ts`
- **Problème** : Bot disait "✅ Vidéo créée" mais rien dans Telegram. Causes : zoompan OOM Railway, `sendPhoto(URL)` silencieux, phantom guard trompé.
- **Fix** :
  - Résolution 1080×1920 → **720×1280** (moins RAM Railway)
  - **Zoompan retiré** des deux branches FFmpeg (buildVideo1080)
  - `sendPhotoBuffer` (buffer multipart) remplace `sendPhoto(URL)` dans tous fallbacks outer
  - Messages échec commencent par `❌` → phantom guard bloque "✅ créée"
- **Commit** : `956117d`

---

## 2026-05-14 — Session soir (Claude Cowork)

### Obsidian vault "brain dzaryx" — refonte complète
- **Type** : Documentation
- **Vault** : `C:\Users\douba\OneDrive\Bureau\ibrahim\brain dzaryx\`
- **Notes créées/mises à jour** : 12 notes (INDEX, PROJET, ARCHITECTURE, FEUILLE DE ROUTE, BUGS, REGLES AGENT, INFRASTRUCTURE, JOURNAL, LES 12 AGENTS, VIDEO MARKETING, BASE DE DONNEES, FLUX REQUETE, ETAT ACTUEL)
- **Contenu ajouté** : 12 agents détaillés, flux requête complet, grille tarifaire véhicules, schéma DB, système vidéo
- **Graphe** : configuré avec couleurs par catégorie, nœuds plus grands, liens visibles

### VIDEO_MARKETING.md — nouveau fichier DZARYX/
- **Type** : Documentation
- **Fichier** : `DZARYX/VIDEO_MARKETING.md`
- **Contenu** : pipeline vidéo complet, styles, fonds Pexels, workflow approbation, bugs connus

---

## 2026-05-14 — Session matin (Claude Code / Sonnet 4.6)

### B001 ✅ — create_booking stocke maintenant les prix réels
- **Fichiers** : `backend/src/integrations/tool-executor.ts`, `backend/src/integrations/tools.ts`
- **Champs ajoutés** : `client_price_per_day`, `owner_price_per_day`, `nb_days`, `owner_total`, `profit_kouider`, `discount_applied`

### B004 ✅ — "fais une vidéo" route vers TIKTOK_AGENT
- **Fichier** : `backend/src/agents/agent-registry.ts`
- **Fix** : TIKTOK_AGENT priority 6→7, keywords élargis ("fais/crée/génère une vidéo"), LLM groq→claude-sonnet

### B005-partial ✅ — Photo fallback vidéo via buffer multipart
- **Fichiers** : `backend/src/api/routes/telegram.ts`, `backend/src/marketing/create-marketing-video.ts`
- **Fix** : `sendPhotoBuffer()` — envoi image en buffer (plus d'URL Supabase privée)

---

## 2026-05-14

### Supabase — Backfill owner_price_per_day
- **Type** : Données (SQL, pas code)
- **Action** : UPDATE manuel dans Supabase SQL Editor
- **Véhicules mis à jour** :
  - Jumpy 9 Places → 44€/j
  - Fiat 500 X → 37€/j
  - Clio 4 → 19€/j
  - i10 → 19€/j
- **Résultat** : 6 réservations avec owner_price_per_day renseigné, profits calculables

### Obsidian Documentation créée
- **Type** : Documentation
- **Fichiers** : `DZARYX/` (dossier complet)
- **Contenu** : INDEX, PROJET, ARCHITECTURE, ROADMAP, BUGS, CHANGELOG, HANDOFF, ENV, DATABASE, REGLES_METIER

---

## 2026-05-13 — Sprint Critique Stabilisation + Finance

### Commit `f54e8c2` — fix(finance): remove all catalog fallbacks
- **Fichiers modifiés** :
  - `backend/src/integrations/finance.ts` — réécriture complète `computeBookingFinancials()`
  - `backend/src/integrations/phase5-finance.ts` — `resolveFinancials()` strict
  - `backend/src/bi/revenue-intelligence.ts` — vraies colonnes + overlap dates + `realBookingCA()`
  - `backend/src/bi/bi-engine.ts` — fallback `RevenueSummary` mis à jour
  - `backend/src/tests/financial-calculations.test.ts` — 9 tests financiers (nouveau)
- **Résultat** : 9/9 tests passent, 0 erreurs TypeScript

### Commit `c62b70a` — fix: normalize financial calculations
- **Fichiers modifiés** :
  - `backend/src/integrations/finance.ts`
  - `backend/src/integrations/phase5-finance.ts`
  - `backend/src/integrations/supabase.ts` — 5 nouveaux champs dans interface Booking
  - `backend/src/bi/revenue-intelligence.ts`
  - `backend/src/conversation/context-builder.ts`
  - `backend/src/tests/verify-doc-access-logs.ts` — nouveau
  - `supabase/migration_financial_fields.sql` — nouveau
- **Migration SQL exécutée** : colonnes `client_price_per_day`, `owner_price_per_day`, `owner_total`, `profit_kouider`, `discount_applied` ajoutées à `bookings`

### Commit `50aa0b3` — Sprint Critique (Security + Stability)
- **Gates 2&3** : `anti-hallucination.ts` → hard block (étaient log-only)
- **Orchestrator** : Guard pass 4 ajouté avec vrais `toolsExecuted`
- **Nonce** : RAM Set → Redis `SET NX EX 600`
- **document_access_logs** : table créée + catch non-silencieux
- **SSE terminal** : asyncio streaming par ligne
- **Tests** : `anti-hallucination.test.ts` (11 tests), `verify-doc-access-logs.ts` (5 tests)
- **Migration** : `migration_document_access_logs.sql` exécutée en prod

---

## 2026-05-10 à 2026-05-12 — Audit + Phase 2

- Audit complet 11 sections (score 62/100)
- Phase 2 Business Intelligence
- Multi-agent orchestration
- Context builder
- Revenue intelligence
- Schéma DB phase 2

---

## Avant 2026-05-10 — Phase 1

- Socle backend TypeScript
- Bot Telegram
- Gestion réservations de base
- Connexion Supabase initiale
- Phase 1 complète

---

## Comment ajouter une entrée

```markdown
## YYYY-MM-DD

### Commit `xxxxx` — description courte
- **Fichiers modifiés** : liste des fichiers
- **Résumé** : ce qui a changé et pourquoi
- **Tests** : résultat des tests
```
