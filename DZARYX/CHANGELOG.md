# DZARYX — Changelog

> Format : Date | Commit | Fichiers | Description
> Plus récent en haut.

## 29/10 nuit — LIBERTÉ v3 : quantité exacte + 10 aides (app v207)
- Quantité EXACTE : « 1 comprimé et demi », « 3 demis », un quart ; « en tout aujourd'hui / hier j'en ai pris X » (total corrigé) ; annuler une erreur. Sélecteur précis dans l'app.
- Mission anti-zombie du jour (+1 € cagnotte), victoires du jour (rappelées les jours durs), cohérence cardiaque 5 min, allié choisi par lui (jamais contacté par Dzaryx), « j'allège ta journée ? » les jours de marche, rappels d'eau les jours de manque, coucher protégé, musique + parc le plus proche pendant une envie, anniversaires 1/3/6/12 mois + appel, point désir/énergie 3 semaines après le zéro (prise de sang si besoin).

## 29/10 nuit — LIBERTÉ v2 : 13 aides en plus (app v206)
- Cagnotte « gestion des contingences » (gain qui monte chaque jour validé, remis à 2 € après un écart, récompenses choisies), heures à risque apprises + message 15 min avant, plans « si… alors… », lettre à soi-même (relue au jour zéro / après un écart), vocal avec SA propre voix à chaque envie, « ce qui revient » (énergie, désir, joie, clarté chaque semaine), dépistage PHQ-2, rapport médecin (la veille du RDV + bouton), appel les jours de marche, jour zéro = rapporter les boîtes à la pharmacie, alerte montre (sommeil / cœur au repos), rituel du réveil, guidage respiration à voix haute en appel.

## 29/10 soir — LIBERTÉ : programme d'accompagnement privé (app v205)
- Nouvelle page LIBERTÉ (menu Plus) + outil `liberte` (cerveau, appels, Siri) + tâche `liberte` (*/5) : paliers qui descendent jusqu'à zéro, prises à heure fixe avec boutons, SOS envie 10 min (respiration guidée + ses raisons), manque et moral, médecin, bilan du dimanche, agenda (titres discrets), GPS.
- Ne remonte jamais : manque fort 2 jours ou dépassement → palier allongé ; dépassement → appel. Fin seulement quand Kouider le dit, puis vigilance 60 jours.
- Données uniquement en base (app_kv `kouider:liberte:*`), rien de personnel dans le code (dépôt public).

## 29/10 — Fiabilité : quota Gemini, mémoire par le sens, voitures, agenda
- Quota Gemini gratuit = 20 requêtes/jour/modèle : un modèle épuisé est sauté jusqu'à l'heure donnée par Google (« retry in 20h ») au lieu de 15 min → plus une requête perdue à chaque message.
- gemini-flash-latest refusait la réflexion « minimal » (400 à chaque appel) → « low ».
- Mémoire par le sens : 100 % Gemini (gratuit, toutes les clés), index neuf emb:*:g1. Avant : crédit OpenAI à 0 → questions Gemini comparées à des souvenirs OpenAI = résultats au hasard. Index gardé paquet par paquet.
- Voitures : « Fiat 500X » = « Fiat 500 X » (espaces/tirets/accents ignorés) — résa refusée le 29/10 7h43.
- Agenda : faux id (« last_created_event_id ») → modification sur le dernier RDV créé ; suppression → jamais deviné, liste des RDV renvoyée.

## 29/10 — Fix « ⚠️ Réponse de secours NON vérifiée » (11h42)
- Cause : Gemini lançait un outil puis prenait un 429 (quota) au tour suivant → tout le secours agentique abandonnait et Groq répondait sans données ni historique.
- agentic-fallback.ts : le cerveau suivant (autre Gemini → NVIDIA → OpenRouter → Groq) REPREND le tour avec les résultats d'outils déjà obtenus, sans les relancer (pas de doublon). Testé en simulation : 4 × 429 → NVIDIA finit avec l'outil.
- orchestrator.ts : l'étiquette ⚠️ « non vérifiée » seulement sur une vraie question de données (résa, client, argent, mails…), plus sur un message perso.

## 29/10 — Cerveaux gratuits boostés (« aussi puissant qu'avant »)
- Chaîne classée par PUISSANCE : gros Gemini → Nemotron Ultra (NVIDIA, OpenRouter) → Gemini lite → Groq (lite inventait : « Marseille », faux envoi à Houari).
- Course relais : cerveau lent (> 8-14 s) ou en panne doublé par le suivant, le 1er qui répond gagne (hedgedRace).
- Garde anti-invention : jusqu'à 2 relances, chacune sur un AUTRE cerveau (avant : même modèle faible → « pas accès aux données »).
- Réflexion Gemini « medium » sur les demandes de fond (analyse, calcul, rédaction) et tâches QUALITY ; 10 tours d'outils au lieu de 6.
- Photos : cerveaux qui voient en premier (OpenRouter nemotron-3.5-super-vl). Appels d'outils écrits en texte (Nemotron) convertis en vrais appels.
- GEMINI_API_KEYS : plusieurs clés Gemini gratuites (autres projets) = quota multiplié. Modèle 404/410 sauté 24 h. Tâches de fond sans outils sur Gemini lite (garde le quota des gros pour Kouider).

## 29/10 — NVIDIA : nemotron-3-ultra en 1er
- Compte NVIDIA de Kouider : seul nemotron-3-ultra répond → 1re préférence (agentic-fallback.ts).

## 2026-10-29 | Dzaryx à 0 € : mode gratuit par défaut | anthropic-compat.ts, agentic-fallback.ts, llm-router.ts, fallback-probe.ts, billing.ts, tools.ts
- Kouider : « Dzaryx gratuit sauf Railway, jamais en panne, aussi puissant qu'avec Claude ». MODE GRATUIT (défaut, app_kv brain:free, env FREE_BRAIN=0 pour couper) : claudeKnownDead() vrai → chat = agentic fallback ; compatFetch n'appelle JAMAIS api.anthropic.com : non-streamé → freeBrain, streamé (forme, pro-doc…) → réponse rejouée en SSE (toSSE), count_tokens estimé. callClaudeVision et la sonde Claude coupés.
- Chaîne gratuite : Gemini → NVIDIA → Mistral (nouveau, MISTRAL_API_KEY) → Cerebras → OpenRouter → Groq. OpenAI (payant) retiré en mode gratuit.
- Gemini : reasoning_effort « minimal » (2 s au lieu de 10 s ; avec « low » la réflexion mangeait max_tokens → réponses coupées « Select 3 well-known »).
- billing free_on / free_off (« remets Claude » seulement si Kouider le demande). Testé en local : texte, tool_use, stream OK via gemini-3.5-flash.
- Clés NVIDIA / Mistral / Cerebras / OpenRouter : à créer par Kouider (gratuites) puis à mettre sur Railway.

## 2026-10-29 | Dzaryx 100 % oranais : guide darija + connaissance Oran/Algérie | config/oran-knowledge.ts (nouveau), context-builder.ts, call.ts, constants.ts, orchestrator.ts, compact-prompt.ts
- ORAN_DARIJA_GUIDE (grammaire راني/تاع/ما...ش, questions شوالا/كي راك, vocabulaire oranais + mots espagnols, argent en centimes « مليون », prononciation, mots marocains/tunisiens/orientaux interdits) + ORAN_KNOWLEDGE (histoire, monuments, quartiers, côte, transport, MCO/ASMO, raï, cuisine, Algérie).
- Texte : guide chargé quand on parle darija, connaissance chargée si darija ou sujet Oran/Algérie (ORAN_TOPIC_RE). Appels (Kouider + invités) : les deux toujours.
- Sources : Guerrero (Arabic of Oran), Wikipédia arabe oranais, memoblog, et 5 vidéos YouTube regardées par Gemini via l'URL (yt-dlp bloqué « not a bot » sur le VPS).
- Correction d'après les sources : غادي (futur) et نبغي/بغى SONT oranais → retirés des interdits partout (constants, context-builder, compact, oranize) ; فين/علاش aussi autorisés.

## 2026-10-29 | Darija : exemples réels de Kouider | constants.ts, orchestrator.ts
- Vidéo envoyée par Kouider (40 s, transcrite via Groq Whisper, Gemini 429) → EXEMPLES RÉELS ajoutés à DZ_IDENTITY_RULE (حنا، خطرة جاية، عفسة، ماشي مليحة، الفريرو، الفاميليا، زعما…).
- Correction : نبغي/تبغي est ORANAIS (« 58 ولاية تبغيني ») → retiré des mots interdits et du remplacement automatique ; seul le préfixe marocain ك (كنبغي) reste interdit.

## 2026-10-29 | Dzaryx 100 % algérien | constants.ts, call.ts, compact-prompt.ts, orchestrator.ts
- Kouider : Dzaryx se disait « algérien marocain » et parlait darija marocaine. Nouvelle règle DZ_IDENTITY_RULE (constants.ts) : 100 % algérien d'Oran, créé par Kouider ; darija oranaise (wesh, kifach, derk, bezzaf, ta3…) et liste des mots marocains interdits (dyal, daba, ghadi, bghit, wakha, chnou…). Injectée dans le prompt principal, le prompt court (Groq), les appels Telegram/app (Kouider + invités).
- oranize() appliqué à TOUT le monde (avant : Houari seul) + remplacement des mots marocains en lettres arabes (ديال→تاع، دابا→درك، واخا→واه، فين→وين…).

## 2026-10-29 00h30 | ROUTE (copilote avec des yeux) | road.ts (nouveau), jarvis.ts, eye.ts, simulator RouteScreen.tsx + Phone.tsx, sw v204
- Page ROUTE (app v204) : caméra arrière + vitesse GPS → /api/jarvis/road toutes les 4 s → Gemini Lite : limite lue (gardée 3 km / 15 min), alerte vitesse > limite+4, dangers, panneaux (radar, école, sens interdit), plaques (road:plates + eye:log), boîte noire (chute ≥ 25 km/h en 6 s → 15 images en album Telegram, liens 30 j). Testé prod : panneau 50, 48 → rien, 63 → alerte.
- Message du réveil 29/10 05:16 programmé (crontab VPS, /root/dzaryx-morning-msg → tgcall/outbox).

## 2026-10-29 00h | L'ŒIL + double vidéo | eye.ts (nouveau), my-voice.ts, call.ts, jarvis3-tools.ts, tgcall/dzaryx_tg.py
- L'ŒIL : appel vidéo Telegram → image toutes les 8 s → Gemini Flash Lite → mémoire visuelle 7 j (lieu, objets + où ils sont, textes/plaques/prix, GPS) ; phrase spontanée (texte étranger traduit, courrier, danger, chose guettée) dite par la voix de l'appel quand personne ne parle. Outil memoire_visuelle (ask, watch/unwatch, status, on/off, clear).
- Double vidéo (ma_voix photo/video/histoire_video, Replicate bytedance/omni-human testé OK) — Kouider : « ça ne servira à rien », laissé en place sans le mettre en avant.

## 2026-10-28 23h30 | TA VOIX | my-voice.ts (nouveau), call.ts, jarvis3-tools.ts, whatsapp-web.ts, tools.ts, tgcall/dzaryx_tg.py
- Ses propres vocaux Telegram (pas transférés) → tgcall les garde (tgcall/voice-samples, hors dépôt, ~2 min 30 max) et envoie l'échantillon → clonage MiniMax (Replicate, sinon fal) dès 20 s, réappris quand il y a 2× plus de voix.
- Outil ma_voix : dire (traduit + parle avec SA voix dans n'importe quelle langue → mp3 Telegram), histoire (histoire du soir pour Ibrahim avec la voix de papa, FR ou darija), status, clone. whatsapp_web send_voice + ma_voix:true.
- Lien audio public à jeton aléatoire /api/call/voice-file/<32 hex>.mp3 (app_kv, 2 j).

## 2026-10-28 23h | effet wow | wow.ts (nouveau), gps-life.ts, jarvis3-tools.ts, scheduler.ts
- Retard prédit (wow-watch */5) : RDV avec lieu dans < 100 min, GPS + trafic → arrivée ≥ 5 min après l'heure → boutons « prévenir sur WhatsApp avec l'heure » / « décaler le RDV » / rien.
- Parcmètre malin (outil parcmetre) : voiture = position au paiement, alerte quand il faut repartir selon le temps À PIED depuis où il est.
- Déjà-vu : arrêt dans un lieu déjà visité (< 6 fois) → quand, combien de temps, RDV de l'agenda ce jour-là.
- Carte de la journée (day-map 21h45 + outil carte_journee) : trajet dessiné (Static Maps) + km, volant, lieux, pas.

## 2026-10-28 22h30 | bonus coach salle | gym-live.ts, tools.ts
- Minuteur de repos (notif + Telegram quand le repos est fini, 💧 tous les 3 repos ; op timer on/off), fantôme (même série à la dernière séance, force estimée), séries d'approche au 1er exercice d'un muscle, calcul des disques pour les exercices à la barre, superset biceps/triceps proposé si retard, force max estimée (Epley) et séries/muscle sur 7 jours dans le bilan, vidéo d'une série = analyse technique /10, photo de machine = réglages + alternative.
- Programme officiel 4 séances sans jambes (Pecs/Tri, Dos/Bi, Épaules, Bras) ; vendredi = Épaules, maison 7h20 (ba53a87 : override = rotation suivante → avance).

## 2026-10-28 22h | coach en direct à la salle | gym-live.ts (nouveau), sport-coach.ts, tools.ts, api/routes/call.ts
- « À la maison à 7h20 » (`home_by`) : départ de la salle recalculé avec le trafic toutes les 5 min, rappel 10 min avant, APPEL « pars maintenant » + Waze maison.
- sport_coach `live` : à l'arrivée (GPS ou « je suis à la salle ») plan minuté tapis → muscu → elliptique « le temps qui reste » ; chaque série « 60 kg 12 » notée avec conseil (monter / garder / baisser / repos), exercice suivant + charge conseillée, retard → séries coupées ; relance si rien depuis 8 min ; bilan + points à améliorer au départ. Santé du matin (sommeil, cœur, VFC) prise en compte.
- Vendredi 30/10 programmé : tapis 20 min → Jour 3 Jambes (photo) → elliptique jusqu'au départ, maison 7h20.

## 2026-10-28 soir | vidéos + séance dictée | sport-coach.ts, video-understand.ts, jarvis.ts, jarvis-hub.ts, tools.ts, jarvis3-tools.ts, tgcall/dzaryx_tg.py
- Toute vidéo Telegram (sport, appli à coder, site, voiture…) : 16 images + voix transcrite → description → cerveau normal avec la consigne (texte avec la vidéo ou dans les 15 s). Voiture sans consigne / « départ … » = état des lieux comme avant.
- sport_coach `plan_day` : séance dictée pour un jour (cardio avant/après + exercices de la vidéo), créneau agenda créé ou ajusté, séance exacte (pas de coupe ni de finisher).
- Raccourci Santé : comparaison bloc par bloc (tapis / muscu / elliptique) avec la séance dictée.
- se_coder : la description complète de la vidéo part dans la tâche de l'atelier.

## 2026-10-28 21h30 — Siri : tout à l'oral, Telegram seulement sur demande
- jarvis-hub siriTurn : réponse > 8 s gardée et DITE au tour suivant (« alors ») au lieu d'aller sur Telegram ; réponse > 600 car. → « Tu veux la suite ? » ; nouvelle question pendant l'attente → l'ancienne réponse d'abord. Telegram seulement s'il dit « envoie-moi / sur Telegram / par écrit ».
- Consigne SIRI « mains prises » : mails/WhatsApp lus à l'oral, rien sur Telegram sans demande (19h07 : mails partis sur Telegram, 11,6 s).

## 2026-10-28 21h — Économies Claude (cache) + atelier : annuler, se vérifier, carnet d'idées, grand ménage
- claude-api : outils de base toujours dans le même ordre, en premier, point de cache 1 h ; outils de l'agent du moment + web_search après. Testé : changement de sujet = 23k jetons RELUS au lieu de ~29k réécrits (chat-voice = 97 % de la facture).
- se_coder undo (« annule ce que tu as codé cette nuit » / un chantier) : l'atelier note from_sha/to_sha, revert + remise en ligne.
- Atelier : auto-test après mise en ligne (Railway, /health, bac à sable) + annulation automatique si le serveur de secours ne répond plus ; rapports de nuit gardés pour 5h.
- Carnet d'idées : « ce serait bien que… » → « je me le code cette nuit ? » (chat + appel).
- Job tools-cleanup le 1er du mois 10h : outils toujours chargés jamais utilisés en 30 jours → proposés au rangement (« fais le ménage »).

## 2026-10-28 19h30 — Dzaryx se code lui-même + WhatsApp direct en appel
- Appel : nouvel outil whatsapp_send = envoi DIRECT depuis WA Business (relecture puis oui) ; whatsapp_link seulement si Kouider demande le lien. Avant, « envoie un message au 04 91… » donnait un lien Telegram et « via WhatsApp directement » était mal compris.
- Appel : la boîte « j'ai N choses pour toi » jette les alertes périmées (« ton RDV est à 13h… il est 13h10 » lu à 19h) et les doublons du même sujet.
- Outil se_coder (file app_kv dev:queue) + atelier VPS backend/scripts/night-dev.mjs (crontab */5) : Claude Code en mode auto code, teste, met en ligne ; nuit 0h30-4h45 (4 tâches max), « maintenant » tout de suite ; rapport Telegram à 5h. Bugs de l'auto-critique (déplacée à 0h15) partent seuls à l'atelier. Veille hebdo nuit de samedi à dimanche (Anthropic, GitHub, Hermes Agent…).

## 2026-10-28 18h — Dzaryx connaît les conditions du site
- Outil conditions_fik (toujours chargé, aussi pour les réponses WhatsApp) : texte exact des pages Conditions + FAQ de fikconciergerie.com + fiche agence (publicInfo du gardien de nuit, cache 6 h).
- Consigne : jamais « je n'ai pas de fiche de conditions ».

## 2026-10-28 17h30 — Photos WhatsApp hors écran + Siri 8 s
- cloudpc whatsapp_web.py JS_PHOTOS : fait défiler chaque miniature floue à l'écran et capture au fur et à mesure, puis revient en bas (le billet de Djillali à 20h54 n'était jamais lu).
- Siri : erreur même à 13 s → budget 8 s puis réponse sur Telegram.

## 2026-10-28 17h — Horaires des clients lus sur leurs photos WhatsApp
- whatsapp_web look (lecture seule) : lit billets / cartes d'embarquement / captures d'horaires, rien envoyé sur Telegram.
- Photo de billet reçue → horaires notés dans la réservation + message Telegram tout seul.
- list_bookings montre la note (horaires, adresse) ; Siri : jamais « rien envoyé » sans look.

## 2026-10-28 16h30 — Siri « Une erreur s'est produite »
- Log Railway : le Raccourci coupe vers 17 s (HTTP 499), Dzaryx répondait en 23 s (dont 4 s de résumé d'historique à chaque tour).
- Voix/Siri : historique coupé aux 10 derniers messages sans résumé IA ; budget Siri 25 s → 13 s puis réponse sur Telegram.

## 2026-10-28 16h — Fiche vol courte
- Telegram/app : fiche Air Algérie réduite à aller, retour, prix total, lien (shortFiche) ; fiche complète gardée dans le job.
- Railway : échecs 020d836→541cff2 = registry Railway (image non tirée, incident), pas le code.

## 2026-10-28 (suite 12) — Vols : plus de surveillance en double, promesses par nom
- `air-algerie.ts` startWatch : une surveillance lancée dans le quart d'heure par la même session est remplacée (Siri 15h43 : 20/02→09/03 puis 03/03→17/03 = 2 surveillances).
- `foresight.ts` promisesTool done : le nom est cherché aussi dans le texte (« la promesse pour Houari est faite »). `jarvis4-tools.ts` : description promesses → pas memoire_gens.
- ⚠️ Railway n'a déployé aucun push depuis 663b38e (13:41 UTC) : 3849dd1, 3be8722, 020d836, cb09122 en attente.

## 2026-10-28 (suite 11) — Test Jarvis 4 (16 outils, 0 crash) + corrections (B047)
- `tool-executor.ts` get_client_brain : plus d'envoi de papiers (lecture seule).
- `conscience.ts` pendingDecisions : 3 h max. `foresight.ts` promesses : ignore « Dzaryx » / « déjà fait ».
- `whatsapp-web.ts` waPendingDrafts : brouillons < 24 h seulement. `readonly-agent.ts` : search_conversations en lecture (Total Recall).

## 2026-10-28 (suite 10) — Siri plus rapide, plus jamais coupé (B046)
- `context-builder.ts` shortPreamble() : consignes [SIRI…] / [APPEL TÉLÉPHONIQUE…] raccourcies dans l'historique → plus de compaction à chaque tour.
- `claude-api.ts` spokenText() : retire aussi [SIRI…] avant le routage (recherche web / Sonnet à tort).
- `jarvis-hub.ts` siriTurn() : budget 25 s puis réponse sur Telegram, coupe propre en fin de phrase + suite sur Telegram, relance si « je regarde… ».
- `foresight.ts` parseLifeGoalCommand() : lit seulement ce que Kouider a dit (sans [SIRI…]/[APPEL…]/« CONFIRMÉ AU TÉLÉPHONE ») → « mets à jour mon poids à 80 kg » en appel marche (9h52 rien n'avait été fait).

## 2026-10-28 (suite 9) — GPS de vie : objectifs de Kouider
- `foresight.ts` : objectif « poids » lit le poids du profil FORME quand Santé n'envoie pas de pesée.
- Objectifs ajoutés (app_kv lifegps) : quitter la Belgique fin 2028 (% prêt, manuel), recompo 80→75 kg (30/06/2027), CA FIK 3000 €/mois (30/06/2028).
- `brain-plus.ts` fortune() + `jarvis-hub.ts` commandCenter() : « ce que les clients doivent » ignore les résas payment_status PAID (amount_remaining jamais remis à 0 → 3 850 € fantômes).
- Objectif épargne globale 15 000 → 50 000 € (31/12/2028, manuel).
- `orchestrator.ts` savingsCommand() : « j'ai épargné 17 000 » / « épargne 17k » / « 17 000 de côté » = total, « j'ai mis 500 de côté » = ajout → objectif Épargne mis à jour, réponse directe (pas « économisé » : faux positifs courses).
- `foresight.ts` parseLifeGoalCommand/runLifeGoalCommand (remplace savingsCommand) : épargne, « je pèse 78 » (met aussi à jour le profil FORME), « départ 20 % », « où j'en suis de mes objectifs ? » → réponse directe ; « trop tôt pour juger » les 14 premiers jours au lieu de « 3 % de chances ».
- Guide Jarvis : CarPlay coupé, chargeur, montre abandonnés par Kouider ; mot de réveil OnePlus abandonné.

## 2026-10-28 (suite 8) — B045 suite : test réel de 14h01 raté
- `orchestrator.ts` : « ange gardien contact » répond directement, sans passer par le cerveau ; « vérifie… » sans « envoie/montre » → setDocReadOnly (aucun papier envoyé).
- `context-builder.ts` : un message resté sans réponse (panne/redéploiement) est marqué pour que le cerveau n'y réponde plus au tour suivant.
- `tool-executor.ts` : get_client_document forcé en send:false pour ces tours.

## 2026-10-28 (suite 7) — B045 ange gardien ignoré + permis envoyé par erreur
- `orchestrator.ts` : « ange gardien contact <nom> <numéro> » enregistré directement (angelTool) ; les 2 relances de garde ne traitent que le dernier message.
- `tools.ts` / `tool-executor.ts` : get_client_document `send:false` (vérification sans envoi) ; résultat honnête « envoyé sur Telegram ».
- Contact d'urgence de l'ange gardien enregistré à la main (app_kv angel:cfg).

---

## 2026-10-28 (suite 6) — Rappels « prend X demain » : une seule fois
- `proactive-jobs.ts` (jobBIReminders, */30) : chaque rappel HIGH (arrivée demain, préparer le véhicule…) ne part plus qu'une fois (`reminders:pushed:kouider`, 4 j) et respecte les rappels écartés dans l'app. Avant : la même alerte toutes les 30 min (Halfi / Fiat 500 X le 28/10).

## 2026-10-28 (suite 5) — La Conscience : fin du faux « RDV » répété
- `conscience.ts` : le créneau de travail (« Belgique — travail ») n'est plus vu comme un RDV ; événement déjà commencé marqué ; ce que Kouider a dit ces 2 h (`kouider_a_dit_2h`) prime sur l'agenda ; même sujet jamais redit en 3 h, même en urgence 3 ; appel d'urgence max 1 / 6 h. (Le 28/10 : 4 alertes « retard-rdv » + appels entre 12h50 et 13h20 alors qu'il était au travail.)

## 2026-10-28 (suite 4) — Siri : « vérifie » = lecture seule
- `jarvis-hub.ts` (prompt Siri) + `tools.ts` (whatsapp_web) : « regarde / vérifie / c'est quand / à quelle heure » → list_bookings, dossier, whatsapp_web 'read' ; plus jamais 'photos' / 'documents' / get_client_document / air_algerie_* pour une simple vérification (Siri envoyait les photos du client sur Telegram au lieu de répondre). Photos et papiers seulement sur « envoie-moi / montre-moi ».

## 2026-10-28 (suite 3) — JARVIS 4 : la Conscience + 30 fonctions (app v203)
- `conscience.ts` : LA CONSCIENCE (job */10) regarde lieu, route, agenda, locations, vols, WhatsApp, promesses, santé, humeur, énergie, modes → parle seulement si utile (max 6/j, nuit/bouclier = urgence seule, pas de redite via `tg:sentlog`, apprend des réactions `conscience:scores`). Décisions à boutons (réponse « 1/2/3 » sur Telegram interceptée dans /api/call/turn, boutons dans l'app, menu Raccourci). Bouclier famille (maison le soir → DND + gardien), relais quand il est tendu (humeur en direct), énergie prévue (profil hebdo + énergie du jour), `jarvis4Context` injecté dans le prompt.
- `gps-life.ts` : trace + visites nommées, ange gardien (arrêt net / nuit inhabituelle → message → appel → contact WhatsApp d'urgence), fatigue au volant, parking, mode Oran auto (Houari prévenu), check-list au départ, prospects sans site autour (FR/DZ), banque du temps (dim 20h).
- `foresight.ts` : simulation de demain (21h, prières, trajets), gardien des promesses (toutes les 2 h, bouton « je le fais »), GPS de vie (dim 19h), plan B des locations (8h/18h), chances de réservation par client, leçons de vente (dim 18h30), anti-regret (version calme avant envoi WhatsApp, prix sous plancher après create_booking).
- `jarvis4.ts` : /api/jarvis/event (CarPlay on/off, chargeur le soir, décisions), /widget (Scriptable), Total Recall, salle de crise, usine à outils (testée en lecture seule, en ligne après oui, job horaire), écran partagé, débrief vocal, répétition d'appel difficile.
- 20 outils (`jarvis4-tools.ts`), 9 jobs, app : onglet JARVIS › 🧠 Cerveau (widget, décisions, crise, écran plein écran).

## 2026-10-28 (suite 2) — Santé montre, Siri en conversation, papiers WhatsApp analysés seuls (app v201-v202)
- Santé (Raccourci du soir 21h30, pas de sommeil : pas de montre la nuit) : séance Apple Watch cochée (coach + FORME), cœur au repos haut / VFC basse → séance de demain allégée (si pas de note de forme), pas/poids/calories actives dans FORME (cible +½ du surplus > 400 kcal, max +300), ligne santé dans le bilan du dimanche (`healthWeekLine`).
- Siri : micro rouvert après CHAQUE réponse (fin = « merci / c'est bon / stop » ou silence) ; « appelle-moi » → appel Telegram immédiat (vraie conversation). Guide app étapes 2, 6, 7.
- get_client_document : nom approximatif (un mot suffit), photo du document envoyée sur Telegram ; décrit comme outil à appeler EN PREMIER (Siri envoyait une capture bancaire de FIK au lieu du passeport).
- WhatsApp : toute photo / tout document d'un client est analysé seul (20 s après) → pièce d'identité au dossier, résa renommée, contact enregistré ; empreintes `wa:papers:seen` = jamais deux fois le même fichier ; Telegram seulement si une pièce est trouvée.
- Telegram : texte envoyé ≤ 8 s après une photo sans légende = sa légende.

## 2026-10-28 (suite) — Rappels « véhicule prêt » + secours honnête
- Rappel 9h « vérifie que le véhicule est prêt » : sauté si la résa porte « ✅ Véhicule prêt » (update_booking notes, consigne dans l'outil : jamais « noté » sans outil).
- update_booking : la note s'AJOUTE à l'existante (adresse de livraison…) au lieu de l'écraser.
- Dernier secours sans outils (Groq texte) : sur une question métier, réponse préfixée « ⚠️ Réponse de secours NON vérifiée » (7h32 il affirmait à tort que le passeport n'était pas enregistré).

## 2026-10-28 — B044 : résa WhatsApp sans nom / papiers / contact (app v200)
- backend : llm-router `readDocVision`, tool-executor (OCR avec secours + PDF, nom provisoire remplacé, prix proprio par défaut, save_client auto après create_booking), whatsapp-web (save_client lit les PDF, renomme, anti-doublon), orchestrator (2e essai du secours avec outils).
- tgcall : images markdown envoyées en photo, texte brut si markdown refusé.
- app : ClientsScreen négociation / fiabilité en français (menus).
- Données : la résa concernée corrigée à la main en base (nom, papiers au dossier, prix proprio, profit).

## 2026-10-27 (suite 12) — « Dis Siri, Dzaryx » en conversation suivie (app v199)
- `jarvis-hub.ts` `siriTurn` : Dzaryx utilise TOUS ses outils comme sur Telegram, retrouve les noms déformés par la dictée Siri, envoie les papiers d'un client (passeport, permis…) sur Telegram, prépare les réponses WhatsApp Business et attend le « oui ».
- Question posée (réponse finie par « ? ») → champ `listen: true` : le Raccourci se relance tout seul, micro rouvert.
- App JARVIS › Santé·Siri : étape 6 du guide (« listen » → Exécuter le raccourci « Dzaryx »).

## 2026-10-27 (suite 11) — Jarvis 3 : 32 nouveautés d'un coup (app v198)
Outils déclarés dans `jarvis3-tools.ts` (ajoutés à Dzaryx_TOOLS, exécutés avant le switch de tool-executor) ; utilitaires communs `ai-util.ts`.
- Assistant de vie : 🧠 `memoire_gens` (fiches + fiche envoyée avant un RDV, anniversaires — `people-memory.ts`) ; 🌙 `liste_nuit` (2h → résultats 6h45) ; ⚖️ `avocat_de_poche` + 📬 `courrier_admin` (échéance dans l'agenda, `doc-review.ts`) ; 💸 `economies` ; 🎓 `prof` ; 🏛️ `conseil_sages` (3 voix, 2 tours, vote — `life-helpers.ts`).
- Monde : 🛰️ `vue_satellite` (Esri World Imagery gratuit — Google Static Maps refusé 403 — + Street View) ; 💶 `change_euros` (historique square `square:history`, alerte au plus haut 3 semaines) ; 🎯 `opportunites` (lundi) — `world-watch.ts`.
- Cerveau : 🎼 `projet` (pilote auto, replanifie) ; 🏖️ `mode_vacances` (gardien 24/24 + DND planifié + résumé de retour) ; 💭 humeur du soir (`mood:log`, dans le dossier de Dzaryx) ; 🔮 habitudes apprises le dimanche → préparées avant la demande ; 🪞 `rapport_moi` (1er du mois) ; 💰 `fortune` — `brain-plus.ts`.
- Veille : 🧬 `auto_amelioration` (3h relit ses erreurs → règles appliquées après oui, bugs gardés dans `improve:dev` : jamais de code modifié seul) ; 🩺 se répare seul (connections-watch lance la réparation possible + pm2 `dzaryx-heal` toutes les 10 min relance dzaryx-tg / dzaryx-cloudpc bloqués, 3×/6 h max, jamais pendant un appel) ; 🛡️ garde du corps (alertes sécurité Gmail, usurpation du nom FIK le lundi, numéros signalés) — `guardian-ops.ts`, `scripts/self-heal-vps.ts`.
- Marché (recherche web, sans aspiration de site — l'accès direct à Ouedkniss a été refusé) : 📡 `radar_concurrence` (9h10, résumé pour le détecteur de bluff) ; 🚘 `chasseur_voitures` (mercredi, ROI au taux d'occupation réel) — `market-hunters.ts`.
- Construire / vendre : 📢 `commercial` (annonce du jour 10h, publiée par le Chrome du PC cloud après oui) ; 🛠️ `atelier` (page complète servie par le cerveau : route publique `/atelier/:slug`, le jeton GitHub étant refusé) ; 🏭 `usine_business` (escouade + page) — `builders.ts`. 🧠 `autonomie` progressive (5 oui → propose ; jamais dispo/réservation/paiement) — `autonomy.ts`, branché dans `onWaNew`/`handleWaYesNo`.
- App (v198) : JARVIS › 🖥️ Salle (salle de commande plein écran TV/PC, fortune, 🔭 machine à voir le futur avec curseurs) ; 🩺 Santé·Siri (données santé + guides des Raccourcis « Dzaryx Santé » → `/api/jarvis/health` et « Dis Siri, Dzaryx » → `/api/jarvis/siri`) ; Copilote : réveil par « Dzaryx » (écoute permanente, 25 s de suite après une question) ; Carte live : ▶ Briefing 3D (agenda, vol, euro, projet, prédiction).
- 🎭 Détecteur de bluff dans le souffleur (contradictions sur 30 répliques + prix du radar).

## 2026-10-27 (suite 10) — Souffleur réparé, gardien = assistant IA + conditions du site, visage retiré (app v197)
- 🎧 Souffleur : l'essai de Kouider (16h16) n'a envoyé qu'UN passage en 37 s. Causes iPhone : lecture du son restée « en cours » (onended jamais reçu) → micro en pause pour toujours ; AudioContext suspendu ; seuil de voix trop haut en pièce bruyante. Corrigé : filet de fin de lecture (durée + 2 s) et resume() borné dans `api.ts` ; segmenter : resume du contexte, seuil plafonné (0,03), et en souffleur il CONTINUE d'écouter pendant qu'il souffle (écouteurs). Transcription en arabe si la langue indiquée est darija/arabe. L'écran affiche « entendu, rien d'utile à te souffler ».
- 🌙 Gardien de nuit : se présente comme l'assistant IA de FIK ; TOUTES les conditions (pages Conditions + FAQ de fikconciergerie.com relues toutes les 6 h + fiche widget) ; renvoie vers le site (/reservation, /conditions, /faq, /packs) ; pour tout ce qui est important : « je ne peux pas prendre cette décision, une vraie personne vous répond dans les plus brefs délais ». Darija algérienne. Testé (dispo + remise, « je confirme », immobilier + vente en arabe, 33 ans + livraison hôtel).
- 🙂 Visage retiré (Kouider : « il va nous servir à rien ») : sphère neuronale de retour sur l'écran vocal ; `dzaryxFace.ts` + images supprimés ; tgcall : show_face toujours False.

## 2026-10-27 (suite 9) — Jarvis 2 : HUD, copilote, escouade, négociateur, prédictions, rappels de lieu, gardien de nuit (app v196)
- 🕶️ HUD (JARVIS › HUD, `hud.ts`, `/api/jarvis/hud`) : caméra arrière, une image / 2,5 s → étiquettes posées sur l'image (voiture de la flotte + client/retour, traduction, reçu déjà vu via `fraud:receipts`, valeurs lues, danger). Pas de visages. Plaques apprises par l'état des lieux vidéo (`hud:plates`). Voix sur les nouveautés.
- 🚗 COPILOTE (JARVIS › Copilote, `copilot.ts`) : mains libres en voiture, micro coupé aux pauses → oui/non/vocal WhatsApp ou Dzaryx complet (consigne « il conduit ») → réponse dite ; nouveaux WhatsApp lus à voix haute (fil `copilot:feed`) ; écran gardé allumé.
- 🛰️ ESCOUADE (JARVIS › Escouade, `squad.ts`, outil `escouade`) : le chef découpe en 2-4 agents lecture seule qui travaillent en parallèle (`runReadOnlyAgent` + `onStep`), fenêtres en direct dans l'app, plan final sur Telegram. Testé : 4 agents, 85 s.
- 🤝 NÉGOCIATEUR (`negotiator.ts`, outil `negociateur`) : pros donnés ou trouvés (Google Places + téléphone), 1er message validé par Kouider, puis Dzaryx négocie seul sous un plafond secret (jamais dit/dépassé, n'accepte rien, filet sur les montants), 6 échanges/contact, 48 h, rapport + meilleur prix. Branché dans `onWaNew` avant tout.
- 🔮 PRÉDICTIONS (`predictions.ts`, outil `predictions`, lundi 9h) : jours tendus, délai de réservation, vidange au rythme réel des km, papiers, impayés, saisons → 3-6 prédictions + action.
- 📍 RAPPELS DE LIEU (`place-reminders.ts`, outil `rappel_lieu`) : maison/salle/travail, « ici », adresse ou lieu Google ; vérifié à chaque position GPS (`presence.ts`).
- 🌙 GARDIEN DE NUIT (`night-guard.ts`, outil `gardien_nuit`, 23h→6h30 par défaut) : répond seul sur WhatsApp avec infos/conditions/prix/véhicules SEULEMENT (règle Kouider 27/10 : jamais de dispo, aucune réservation notée) ; pas d'outil, flotte sans statut de dispo, filet regex → message sûr ; situation délicate = chemin normal ; 4 réponses max/client/nuit ; récap au réveil. Testé FR/darija/« réservez-moi » : aucune dispo donnée. `WIDGET_BASE_PROMPT` exporté (conditions).

## 2026-10-27 (suite 8) — Mode JARVIS : 8 nouveautés (app v195)
- Page JARVIS (app, menu Plus, `JarvisScreen.tsx`) + route `/api/jarvis` (`jarvis-live.ts`) :
  - 🎧 SOUFFLEUR : micro découpé aux pauses → transcription (Groq, langue libre) → Haiku décide quoi souffler (traduction, prix, piège, argument) → voix dans les écouteurs. Testé : vocal arabe « 15 000 DA/jour, caution 100 000 DA » → souffle en 2,3 s.
  - 📝 RÉUNION : morceaux de 15-28 s → compte rendu Sonnet (décisions, qui a promis quoi, rappels créés via schedule_reminder, message de suivi) → Telegram + kv `meetings`. Outil `meetings` pour le retrouver à la voix.
  - 🥊 ENTRAÎNEMENT : Dzaryx joue le rôle choisi (client, garagiste…), répond en voix ; fin → débrief noté /10 + phrases à réutiliser.
  - ⚡ PROTOCOLES (`protocols.ts`, outil `protocol`, kv `protocols`) : départ Oran, panne, fin de journée + création à la voix ; run = étapes exécutées, envois/paiements après son oui.
  - 🎥 ÉTAT DES LIEUX VIDÉO : l'app tire 12 images de la vidéo (canvas) ou tgcall (ffmpeg, vidéo Telegram avec « départ Clio Benali ») → `/api/jarvis/inspection-frames` (`video-inspection.ts`) : location déduite, plaque/km/essence/voyants lus, vues extérieures → saveBefore/AfterState + recordCarKm.
- 🧠 MÉMOIRE PHOTOGRAPHIQUE (`photo-memory.ts`, outil `photo_memory`) : chaque photo envoyée par Kouider (pas la caméra live, pas Houari, pas le mode privé, jamais les photos du corps) → description + texte lu + lieu GPS + photo ; kv `photomem:AAAA-MM`.
- 🛡️ ANTI-ARNAQUE (`anti-fraud.ts`, outil `anti_arnaque`) : reçus BaridiMob/CCP/virement, papiers : analyse Sonnet, reçu déjà présenté (empreinte image + référence, kv `fraud:receipts`), logiciel de retouche, expiration, numéros signalés (kv `fraud:numbers`). Testé sur un faux reçu : date impossible + police du montant différente + doublon détectés.
- 🎙️ RÉCEPTIONNISTE VOCAL WHATSAPP : `whatsapp_web.py` action `voice_notes` (intercepte play() pour récupérer le blob opus déchiffré — le client voit « écouté ») ; `onWaNew` transcrit les vocaux, traduction FR, réponse proposée ; « vocal » → réponse envoyée en message vocal (TTS, fichier audio) ; outil whatsapp_web actions `voice` / `send_voice`.
- Transcription : `transcribeAudio()` exportée ; mode `neutral` SANS consigne (consigne FR = l'arabe traduit, consigne arabe = vocal FR coupé après « salam alaykoum »).
- ⚠️ Cloudinary DÉSACTIVÉ (« cloud_name is disabled ») → `uploadInspectionPhoto` bascule sur Supabase Storage (bucket public `media`, chemins aléatoires) : les photos d'état des lieux remarchent.

## 2026-10-27 (suite 7) — Cerveau de secours : 3 fournisseurs gratuits de plus + note de passation
- `agentic-fallback.ts` : Cerebras, NVIDIA (build.nvidia.com), OpenRouter (modèles `:free` avec outils) entre Gemini et Groq. Modèle choisi tout seul dans leur liste (relue toutes les 6 h, préférences : Cerebras gpt-oss-120b/qwen-3-235b ; NVIDIA kimi-k2 / glm-5 / deepseek-v4 ; OpenRouter nemotron-3-ultra / inkling / gemma-4), sautés 15 min sur 429/503/figé. Inactifs tant que `CEREBRAS_API_KEY` / `NVIDIA_API_KEY` / `OPENROUTER_API_KEY` manquent (Railway + VPS .env).
- `brain-handoff.ts` : NOTE DE PASSATION donnée au secours (objectif récent, dernière question posée, outils déjà réussis à ne pas refaire, réponse WhatsApp en attente de oui) ; RETOUR DE PASSATION donné une fois à Claude quand il revient (ce que le secours a répondu/fait pendant la coupure, kv `brain:handoff:back`).
- `anthropic-compat.ts` (tâches de fond) : mêmes fournisseurs, vision seulement pour Gemini/OpenAI.

## 2026-10-27 (suite 6) — Visage : micro rétabli + lèvres sur le son (app v194)
- Kouider : en v193 « quand je parle il n'écoute pas » et lèvres pas synchronisées. Cause probable : les 2 `<video>` (même muettes) qui jouent coupent le micro sur iPhone → plus AUCUNE vidéo : planches d'images `public/dzaryx-talk.jpg` / `dzaryx-listen.jpg` (60 images 240×373 chacune, 12 i/s, ~1,1 Mo), mp4 supprimés.
- Lèvres : ouverture de la bouche mesurée sur chaque image de « il parle » (dents visibles, tgcall/models YuNet) → table OPEN ; toutes les 70 ms l'app prend l'image dont l'ouverture colle au VOLUME réel de sa voix (getVoiceLevel), en restant proche de l'image courante.

## 2026-10-27 (suite 5) — Visage = VRAIES vidéos IA (Kling 3, ~1,12 $ une fois) dans l'app v193
- Kouider (enregistrement 14h59) : en v192 la bouche « glisse » (lèvre dédoublée par la déformation d'image).
- Studio (/api/studio, rendus 31ff1abc « il parle » + d2e41d7f « il écoute », 5 s, depuis public/dzaryx-face.jpg) → `public/dzaryx-talk.mp4` / `dzaryx-listen.mp4` (540×840, boucle aller-retour, sans son, ~1 Mo).
- `ui/dzaryxFace.ts` : « il écoute » en boucle, fondu vers « il parle » quand sa voix joue (getVoiceLevel, maintien 450 ms) ; mêmes effets hologramme ; l'image animée reste en secours tant que les vidéos chargent.

## 2026-10-27 (suite 5) — Visage = VRAIES vidéos IA (Kling 3, ~1,12 $ une fois) dans l'app v193
- Studio (/api/studio, rendus 31ff1abc « il parle » + d2e41d7f « il écoute », 5 s, depuis public/dzaryx-face.jpg) → `public/dzaryx-talk.mp4` / `dzaryx-listen.mp4` (540×840, boucle aller-retour, sans son, ~1 Mo).
- `ui/dzaryxFace.ts` : « il écoute » en boucle, fondu vers « il parle » quand sa voix joue (getVoiceLevel, maintien 450 ms) ; mêmes effets hologramme ; l'image animée reste en secours tant que les vidéos chargent.

## 2026-10-27 (suite 4) — Appels Telegram : vidéo du visage COUPÉE (cause du son muet) ; visage plus naturel (app v192)
- Appels 13h26 / 13h29 (app fermée) toujours muets dans les deux sens avec la vidéo, même après passage en son seul (« External source not initialized ») ; sans vidéo l'appel de 12h23 marchait → la vidéo externe ntgcalls casse le son en appel privé. `tgcall/cache/no-face` posé : appels en son seul. À creuser avec TG_DEBUG=1 + un appel test.
- `ui/dzaryxFace.ts` + `avatar_real.py` : mâchoire moins ample (lèvre du bas 1, menton ½ : la barbe ne s'étire plus), ombre douce au lieu de fausses dents, clignement = vraie peau de la paupière étirée, petits hochements quand Kouider parle.
- App : bouche = VRAI volume de la voix (`getVoiceLevel()`, AnalyserNode dans `services/api.ts`) au lieu d'un rythme inventé. sw v192.

## 2026-10-27 (suite 3) — Visage RÉALISTE (hologramme choisi par Kouider) + garde-fou appel vidéo muet (app v191)
- `tgcall/avatar_real.py` (nouveau) + `tgcall/assets/dzaryx_bust.png` (recadré de l'affiche envoyée par Kouider) : mâchoire qui descend avec la voix (cv2.remap + intérieur de bouche), clignements, tête qui respire/hoche, halo + balayage ; ~13 ms/image. Remplace le bonhomme dans `realtime._face_loop` (bonhomme en secours).
- Bug « en vidéo il ne parle pas et n'entend pas » (13h14/13h15 : volume reçu 0) : cause pas encore prouvée (vidéo envoyée OU app qui garde le micro). `mute_guard` : appel avec visage muet 6 s → passage en son seul SANS raccrocher ; si le son revient → visage coupé (`cache/no-face`) pour les appels suivants.
- App : `ui/dzaryxFace.ts` = même hologramme réaliste en canvas (`public/dzaryx-face.jpg`), sw v191.

## 2026-10-27 (suite 2) — Visage animé de Dzaryx (appels Telegram + app v190)
- `tgcall/avatar_cute.py` (nouveau) : petit bonhomme dessin animé (choisi par Kouider après 2 versions jugées « qui font peur » : hologramme filaire puis visage bleu) — tête ronde, grands yeux qui clignent et regardent, cheveux courts, barbe légère, sourire qui s'ouvre avec la voix ; style 'orb' (bulle) gardé en réserve. ~10 ms/image.
- `realtime.py` : `_face_loop()` 15 i/s → `send_frame(Device.CAMERA)`, bouche = volume instantané de sa voix (`out_now`), écoute = volume de Kouider (`in_now`).
- `dzaryx_tg.py` : flux `ExternalMedia.AUDIO | VIDEO` 360×480 ; repli son seul si l'appel vidéo est refusé ; commande « visage on/off ».
- App : `ui/dzaryxFace.ts` (même bonhomme en canvas) remplace la sphère de `VoiceScreen` ; sw v190.

## 2026-10-27 (suite) — WhatsApp : numéros dictés, photo à un numéro, documents, validation client ; visage dans l'app
- `whatsapp-web.ts` : `waNumber()` (« 06… » → +33/+213 avec question si 06/07 sans pays, 04 → BE, 05 → DZ, 00/+ gérés) ; `send_file` sans fichier = dernière photo envoyée (app 5 min / Telegram 30 min, `forme.lastTelegramPhoto`) copiée sur le PC cloud ; `documents` (PDF/Word du client → Telegram) ; `save_contact` ; `save_client` (validation : passeport/CNI/permis repérés par Haiku → `scanIdentity` dossier client, PDF → `client_documents`, contact WhatsApp au nom lu sur la pièce).
- `cloudpc/whatsapp_web.py` : `documents()` (défilement écran par écran, aperçu → Télécharger, testé sur un vrai PDF) ; `save_contact()` (Nouvelle discussion → Nouveau contact, pays au vrai clic, synchro téléphone cochée ; testé à blanc FR + DZ, jamais enregistré pour de vrai).
- `cloudpc/agent.py` : `cloud:face` (tgcall/face.py) ; `orchestrator.ts` `faceHint()` → « [VISAGE : …] » sur les images de l'app (caméra en direct : 1×/5 min).

## 2026-10-27 — Dzaryx reconnaît le visage de Kouider (Telegram photos + appels vidéo)
- `tgcall/face.py` (nouveau) : OpenCV YuNet (détection) + SFace (empreinte 128 nombres), local au VPS comme `speaker.py` ; `faceprints/` (ignoré par git, repo public) ; modèles dans `tgcall/models/` (opencv_zoo). Seuil 0,40 ; selfie de test 0,96–1,00, autre visage 0,06.
- `dzaryx_tg.py` : photo + légende « retiens mon visage » → apprend ; toute photo → « [VISAGE : … Kouider …] » ajouté au message pour le cerveau ; photo de Kouider très sûre (≥ 0,50) enrichit l'empreinte.
- `realtime.py` : 1re image caméra d'un appel vidéo → note système « VISAGE : … » (ne remplace pas la vérification de la voix).

## 2026-10-26 (suite) — FORME : fiches exercices + bibliothèque, réveil sauté si déjà debout (app v189)
- `exercise-lib.ts` (nouveau) + `/api/forme/exlib`, `/exlib/:id`, `/exlib-match` : ~817 exercices free-exercise-db (domaine public), noms FR (Haiku, `sport:exlib:names:fr`), fiche FR étapes/erreurs/respiration (`sport:exlib:fr:<id>`), exercice de séance → fiche la plus proche (`sport:exlib:match`).
- `forme/Exercises.tsx` (nouveau) : fiche exercice (démo animée, schéma du corps face/dos muscles principaux rouge / secondaires orange — SVG wger.de CC BY-SA dans `public/muscles/`, étapes, erreurs à éviter) + bibliothèque « 📚 Tous les exercices » filtrée par muscle + recherche ; ouverte depuis la liste des exercices et pendant la séance (« ⓘ Comment faire · muscles »), pour Kouider et Fatima. `Sheet` accepte `z`.
- `morning-routine.ts` : plus de « tu es réveillé ? » ni d'appel s'il a déjà parlé à Dzaryx depuis 4 h ou si son GPS (≤ 30 min) le place hors de la maison (`presence.kouiderOutSince`) — message de motivation quand même, sans question. `set_day` : séance déplacée → réveil et départ suivent avec les mêmes écarts (26/10 : séance 6h mais réveil resté à 6h40).

## 2026-10-26 — FORME : Fatima ne doit plus se reconnecter, envies de la semaine, glisser un plat (app v188)
- `forme.ts` / `routes/forme.ts` : une erreur Supabase en lisant le lien de Fatima renvoie 503 (réessaie) au lieu de 401 « Lien expiré » ; 1 nouvel essai après 400 ms.
- `forme/App.tsx` : le lien de Fatima n'est effacé du téléphone QUE sur un vrai 401 « Lien expiré » (avant : tout message contenant token/auth, ou une panne serveur, effaçait le lien → reconnexion).
- `generateWeek(…, wishes)` : « Mes envies de la semaine » (texte libre, gardé sur la semaine) passe en priorité dans le menu + les courses ; outil Dzaryx `forme` action `regenerate` + `wishes` (à l'oral / Telegram).
- `swapRecipe` : la liste de courses suit le changement de plat (ajoute ce qui manque, retire ce qui ne servait qu'à l'ancien plat, total recalculé).
- `forme/Week.tsx` : carte « Mes envies de la semaine » + chaque plat se glisse à gauche/droite → Claude propose un autre plat (mêmes macros) ; images non déplaçables (`ui.tsx`).

## 2026-10-25 (nuit, suite 3) — Courses FORME sans doublons + photos, séances de la semaine visibles, tuiles plus faciles (app v187)
- `forme.ts` : fusion des courses du foyer par mots (singulier/pluriel, haché = viande hachée, braiser = mijoter, variantes en conserve/demi-écrémé…) → 63 → 56 articles ; photos manquantes complétées (boucherie, fruits & légumes, lots → Pexels ; épicerie → Open Food Facts), cache `forme:off:img3` ; menu : max 1 plat à base de haché par semaine, morceaux variés, noms au singulier.
- `sport-coach.ts` : `planned` (toutes les séances de la semaine) + objectif ; finisher brûle-graisse à chaque séance muscu (objectif ventre de Kouider).
- `forme/Sport.tsx` : jours de la semaine cliquables, liste « Ta semaine » avec exercices, finisher affiché, séance faite un autre jour enregistrée à la date du jour.
- `folie` : Tuiles Fondantes plus faciles (1,5 s avant chute, tuiles plus grandes, étages rapprochés, 65 % qualifiés, 90 s).

## 2026-10-25 (nuit, suite 2) — Invitation à jouer = notification sur le téléphone de Fatima ; caméra FORME dézoomée (app v186)
- `couple-games.ts` + `forme.ts pushForme()` : quand Kouider invite, notification push FORME à Fatima (même appli fermée, AR/FR), lien `forme/?jeu=<jeu>` qui ouvre directement le jeu ; si elle n'a pas activé les notifications → Telegram à Kouider pour le dire. `sw.js` : notif d'invitation qui reste affichée + icône FORME.
- `forme/App.tsx` : bandeau « Activer les notifications » toujours proposé dans l'appli installée + réabonnement automatique à chaque ouverture.
- `forme/Body.tsx`, `Tools.tsx` : aperçu caméra en `contain` + résolution 4:3 (plus de zoom/recadrage).

## 2026-10-25 (nuit, suite) — La Grande Folie : parties toujours différentes, on s'attrape, solo sans attente (app v185)
- `src/folie/course.ts` : 5 ambiances (jour, coucher, nuit, neige, bonbon), 4 nouveaux obstacles (tapis roulants, champignons rebondissants, poings, ventilateurs), course de 5 à 7 obstacles tirés au sort, 2 nouvelles manches (Chasse aux Queues, Montagne Folle à couronne).
- `src/folie/main.ts` : bouton ✋ (appui court = pousser, long = attraper/ralentir, voler la queue), aussi entre Kouider et Fatima à distance (événements de salle) ; repères : nom ⭐ jaune / ♥ rose, anneau sous les pieds, flèche vers l'autre hors écran ; solo : dès qu'on a fini on passe à la suite ; à deux : la manche finit quand les deux ont fini (l'hôte donne le signal) ; ordre des manches tiré au sort.

## 2026-10-25 (nuit) — JEUX du couple : La Grande Folie, Les Gardiens, L'Œil (app v184)
- Page **JEUX** (app Dzaryx + carte « Nos jeux » dans FORME pour Fatima) → `simulator/jeux/`.
- **La Grande Folie** (`simulator/folie/`, `src/folie/*`) : jeu de fête façon Fall Guys/Stumble Guys, physique Rapier, 20 haricots (2 humains + bots), 3 manches (course d'obstacles tirée au sort, tuiles fondantes, saute-barre), couronnes, costumes.
- **Les Gardiens** (`simulator/gardiens/`, `src/gardiens/*`) : action coop (vagues + boss), lien du cœur entre les 2 héros, 13 pouvoirs, île commune à reconstruire (serveur `games:island`).
- **L'Œil** (`simulator/oeil/`, `src/oeil/*`) : jeu des différences, 10 décors dessinés, 3 modes, zoom, indices, gel, défi du jour, mode photos.
- Backend `integrations/couple-games.ts` + `/api/forme/games*` : records Kouider/Fatima, salle à deux en direct (positions, revendications, événements), Telegram quand Fatima bat un record ou invite.
- RUSH (runner) gardé dans le code mais non publié (Kouider : pas un clone de Subway Surfers). Resto en Folie : cuisine 3D commencée (`src/resto/kitchen.ts`), pas encore jouable.

## 2026-10-25 (nuit) — FORME de Fatima depuis l'écran d'accueil (app v183)
- `simulator/src/forme/App.tsx` : sur iPhone l'icône « Sur l'écran d'accueil » ne partage pas la mémoire de Safari → le lien d'invitation était perdu et l'icône ouvrait la connexion pré-remplie « kouider ». Le jeton reste maintenant dans l'adresse + manifeste (start_url) ; champ identifiant vide ; on peut coller le lien d'invitation dans le 1er champ pour entrer.

## 2026-10-25 (soir) — Dzaryx retrouve ses réflexes

- Appels : START_SENSITIVITY_LOW (c505b7e) n'entendait plus Kouider du tout (appel 17h40 : 0 phrase transcrite) → retour en HIGH ; le filtre anti-bruit (speaks/meaningful) reste. pm2 dzaryx-tg relancé. (oui = outils, conversions, réponses WhatsApp)

- `claude-api.ts` : un « Oui » qui suit une offre de Dzaryx sans « ? » (« je te fais la conversion si tu veux. ») partait en mode rapide SANS outils → « je n'ai pas d'outil de change ». Tout oui/ok après un message de Dzaryx garde les outils ; euro/dinar/taux/WhatsApp ne sont plus jamais en mode rapide.
- Conversion : `convert_currency` chargé d'office + consigne « jamais un chiffre de tête, DA + € au square directement, 230 millions = centimes » (avant : 2 300 000 DA ≈ 15 900 € inventé).
- Cerveau (Kouider) : sport/routine (séance, salle, repas, coach…) et business (FIK, clients, résas, voitures, prix, paiements, prospects, Houari…) → Sonnet, y compris le « oui » qui suit une proposition sur ces sujets ; le reste (météo, rappels, petites questions) reste sur Haiku.
- Cause du « Oui » ignoré : la note interne « [outils lancés à ce tour : …] » en fin d'historique cachait le « ? » de « Je l'envoie ? » → mode rapide sans outils. « Oui » à une proposition d'envoi (WhatsApp/mail) → Sonnet ; consigne : lancer send tout de suite, jamais « pas connecté » sans réponse d'un outil.
- WhatsApp : les demandes WhatsApp passent sur Sonnet (textes pour clients) ; `unread`/`read` donnent la conversion 💱, la réponse déjà proposée et l'ordre « propose une réponse + demande « je lui envoie ? » ».

## 2026-10-25 (nuit) — Appels plus stables + montants en dinars convertis

- Appels Telegram (tgcall/gemini_live.py) : détection de parole START_SENSITIVITY_LOW (+ 300 ms de marge, 700 ms de silence) — en HIGH, un « allô », un souffle ou l'écho coupait Dzaryx en pleine phrase ; un bruit ne coupe plus (≥ 2 mots ou 6 lettres) ; transcriptions de bruit (« <noise> », chiffres persans) ignorées ; consigne « bruit ≠ demande, jamais d'outil ni de CONFIRMÉ ». pm2 dzaryx-tg relancé.
- WhatsApp → Telegram : `dzd-convert.ts` repère les montants en dinars (2300000, 2 300 000 DA, 230 millions = centimes, 1 milliard 200, 250 مليون, 50 mille) et ajoute « 💱 … DA ≈ … € au square (taux de l'or / de Kouider) · … € officiel ».

## 2026-10-25 (nuit) — Surveillance des connexions (WhatsApp coupé 30 h sans alerte)

- WhatsApp Business était déconnecté du PC cloud depuis le 24/10 8h40 : l'unique alerte avait été avalée par le tri anti-bruit. Nouveau `integrations/connections-watch.ts` + job `connections-watch` (*/15) : WhatsApp (statut réel via le PC cloud), PC cloud (2 échecs de suite), service Telegram (heartbeat), Gmail et Agenda Google (toutes les 2 h). Coupure → Telegram + app tout de suite (bypassDigest), rappel toutes les 2 h de 8h à 22h, « ✅ reconnecté » à la fin ; `connectionsText()` dans le dossier de Dzaryx. Alerte `cloud:wa_state` aussi en direct.
- cloudpc/whatsapp_web.py : `link_code` attend jusqu'à 15 s le champ du numéro (« null.focus » le 25/10).

## 2026-10-25 (nuit) — FORME : 100 % arabe en mode arabe

- Traduction à la volée : en mode arabe, tout texte encore en français à l'écran (recettes déjà créées, exercices de sport-coach, analyses, textes avec chiffres, morceaux variables) part en lot à `/api/forme/translate` (Claude Haiku, liste ordonnée, cache serveur `forme:tr:ar` + téléphone `forme:ar-live`) et revient en arabe ; chaque nœud garde son texte d'origine pour être retraduit. Textes déjà arabes ignorés. Mode cuisine lu en arabe. App v182 (657bc53).

## 2026-10-25 (soir) — FORME : photo → cercles + séance de demain partout, 20 nouveautés, agenda de sa femme

- Photo du corps : Claude place ses cercles sur une grille graduée (bien plus juste) ; objectif (« le ventre ») ou, sans rien dire, le coach dit lui-même quoi perdre. Dans FORME : « 📸 Photo + adapter ma séance » et « Le coach choisit pour moi ». Sur Telegram : la photo est gardée 30 min (`kouider:forme:tg-photo`), outil `forme` action `body_photo` → photo rangée, analysée, image avant/maintenant entourée renvoyée (@napi-rs/canvas, bucket privé), séance du lendemain refaite (sport-coach + agenda Google).
- Semaine de repas : TOUS les repas différents (21-28 recettes/semaine, génération en streaming ~1 min, doublons corrigés automatiquement).
- Notifications : aussi sur Telegram pour Kouider (réglable), bannière « activer » dans l'appli installée, rappels perso.
- 20 nouveautés : jeûne (Ramadan / lundi-jeudi), frigo vide, batch cooking, bilan pour le médecin, mes rappels, sommeil, pas, IMC & tour de taille, anti-fringale (respiration), portions à la main, agenda 7 jours dans l'app (+ export calendrier iPhone .ics), micro pour parler au coach (FR/AR) et réponses lues, mode cuisine pas à pas (voix + écran allumé), portions famille ×2-×4, recettes favorites ❤️ reprises, défi de la semaine, date estimée d'objectif, « Mes goûts » (re-swipe), « 🏠 déjà à la maison » dans les courses.
- Sa femme : jours de repos jeudi + dimanche (`restDays`), programme et séance sur mesure jamais ces jours-là, visibles dans son agenda in-app ; tout en arabe (traductions ajoutées). App v179.

## 2026-10-25 — « La grande course de Fennou » : vrai jeu 3D pour le petit

- `simulator/run/` (→ /ibrahim/run/, tuile « La grande course » en haut de Fennou) : jeu three.js à la Subway Surfers. Fennou (fennec 3D, tenues) court seul sur 3 voies ; l'enfant touche les images. 6 mondes (désert, oasis, ferme, plage d'Oran, ville, étoiles) × 6 niveaux + course libre. Missions cerveau : trouver (animaux + cris, fruits, véhicules), couleurs, formes (portes), grand/petit, compter les étoiles, cache-cache dans les cadeaux (avec échange), musique (Frère Jacques), famille (photos papa/maman de Fennou).
- Apprentissage sans échec (indice qui brille, puis Fennou y va seul en nommant), difficulté adaptative (2 → 3 choix), album d'autocollants, 7 tenues débloquées par les étoiles, fin de session « Fennou fait dodo » (durée des parents), coin parents par appui long 2 s, voix de maman réutilisée (+ nouveaux mots à enregistrer dans Fennou). Progression en localStorage `fennou-run`, parties notées via `fennou:session`. App v178.

## 2026-10-25 — FORME : l'appli sport + nutrition halal (remplace COACH), pour Kouider et sa femme

- App : nouvelle appli **FORME** (`simulator/forme/` → kouider213.github.io/ibrahim/forme/, installable seule sur l'écran d'accueil) et page **FORME** dans Dzaryx (remplace COACH). Design repris de MacroSave : questionnaire en 11 étapes (objectif, salle, magasins belges, repas/jour, halal, séances, swipe de plats en vraies photos, âge/taille/poids, budget, traitement + dose), « On compose ta semaine », accueil (anneau kcal + macros, injection, eau, menu du jour), semaine de recettes (photos TheMealDB, étapes, remplacer une recette), courses avec vraies photos de produits belges (Open Food Facts, Boni/Colruyt…), sport (mode séance : démo animée, charges, minuteur de repos), corps (courbe de poids, mensurations, caméra avec l'ancienne photo en transparence + minuteur 10 s, analyse avant/maintenant entourée par Claude, conseils), 12 outils (traitement + sites d'injection, photo d'assiette → kcal, scanner code-barres + verdict halal, protéines, eau, effets, produits belges, resto/snack, coach, minuteur, besoins, badges).
- Deux profils : Kouider + sa femme (lien d'invitation, jeton valable seulement pour /api/forme, arabe littéraire par défaut avec interface RTL traduite, ou français). Suivis séparés ; **liste de courses commune** (cases partagées, ajout à la main, envoi WhatsApp).
- « Je veux perdre le ventre » (+ photos) → prochaine séance refaite sur mesure : FORME (bouton) ou Dzaryx (outil `forme` action `adapt_tomorrow` après une photo sur Telegram) ; Kouider : séance du jour dans sport-coach (`kouider:sport:custom`) + agenda.
- Backend : `integrations/forme.ts`, `/api/forme/*`, outil `forme`, jobs `forme-reminders` (*/15 7-22h) et `forme-weekly` (dimanche 19h), `formeText` dans le dossier de Dzaryx. La nutrition revient (demande de Kouider 25/10) uniquement via FORME, jamais dans l'agenda. Données santé/photos : app_kv + bucket privé `forme-private`.

## 2026-10-25 — FENNOU : le compagnon de jeu du petit + rappels « temps avec le petit »

- App : page **FENNOU** (menu ⋯ Plus, Kouider) → `public/fennou.html` ouvert par-dessus toute l'app (pas de barre du bas, pas d'accès au business). 5 jeux : Ma famille (où est papa/maman + « attrape-moi », photos gardées sur l'appareil), Cache-cache (mémoire, s'adapte : 2 → 3 buissons → buissons qui bougent), Attrape le lapin, Où est… ?, Les bulles. Coin parents par appui long de 2 s : durée (10 min conseillé), vitesse, photos, **voix de maman** (enregistrements darija dans IndexedDB, joués à la place de la voix française), « Quitter Fennou ». App v176.
- Backend : `integrations/papa-time.ts` + outil `papa_time` (log / status / idea / profile) ; `/api/kid/profile` et `/api/kid/session` (chaque partie notée) ; jobs `papa-time` (9h30 jour off : idée de sortie ; 18h30 : rien depuis 2 jours → rappel) et `papa-weekly` (dimanche 18h30, bilan) ; « bien rentré » propose 15 min avec lui + une idée sans écran. Prénom, goûts et journal UNIQUEMENT dans app_kv (`kouider:kid:*`), jamais dans le code.

## 2026-10-25 — Réponse STOP : traitée en 10 min max + message Telegram

- `queue/scheduler.ts` : `prospect-replies` toutes les 10 min (au lieu de 30) de 7h à 22h → un STOP est mis en « Pas intéressé » avant que Kouider le voie.
- `integrations/prospect-autopilot.ts` : chaque STOP envoie aussi un message Telegram à Kouider (société, adresse, objet du mail), plus seulement une notif dans l'app.
- `integrations/prospects.ts` : `findProspect` tolère les fautes (« hiponne azure » → Agence Hippone Azur : accents, lettres doublées, e/s final).
- Agence Hippone Azur passée à la main en « Pas intéressé » (STOP du 25/10 11h19).

## 2026-10-25 — Trajet faux de 25 min supprimé, messages de nouveau en direct

- `conversation/proactive-engine.ts` : suppression des vieux rappels « Rappel trajet Bruxelles », « Horaire Kouider » et « Agenda — prochains RDV » (horaires en dur + trajet fixe 25 min) → les départs viennent seulement de `departures.ts` (GPS + trafic réel) (B043).
- `notifications/digest.ts` : liste « secondaire » vidée (Kouider : « le message direct remet-les ») → tout part tout de suite, seul l'inutile reste filtré. Aucun coût Claude en plus.
- Cerveau du chat laissé en mode auto (Haiku au quotidien, Sonnet pour réflexion/clients/photos/web) : Kouider ne veut pas tout sur Sonnet.

## 2026-10-24 — Moins de messages (tri anti-bruit + 2 points par jour), vrais visiteurs, voitures en haut de l'accueil, Houari bof

- `notifications/digest.ts` + hooks `emitProactive` / `queueTelegramMessage` : inutile (« image en cours », « aucune donnée », « journée terminée », prépa RDV vide) → jamais envoyé ; secondaire (agenda, BI, véhicules inactifs, démarchage du jour, opportunités, contenu…) → rangé, envoyé en UN « point » à 12h30 et 19h (jobs `digest`, `digest-evening`) ; le reste part tout de suite. Le bilan de 21h passe directement.
- `site-traffic.ts` : visites sans aucun geste humain (signal `engaged` du site) comptées comme robots probables.
- Site (autolux-location) : section voitures remontée juste sous l'accueil + bouton « Réserver sur WhatsApp » ; `_app.js` envoie `engaged` au 1er défilement/toucher.
- Dossier privé (app_kv) : « Houari bof » = beau-frère, associé et bras droit (≠ Houari propriétaire) → le mentor peut l'inclure.

## 2026-10-24 — Site : adresses de voitures lisibles + parcours visiteurs

- Site (autolux-location a79e429) : `lib/carUrl.js` → /cars/clio-4-essence-location-oran-<id> (sitemap, liens, JSON-LD) ; l'ancienne adresse /cars/<id> redirige en 301. `lib/tracker.js` : `trackEvent` aussi dans page_views (page « #event:… ») ; `_app.js` compte les clics WhatsApp / téléphone.
- `site-traffic.ts` (2b929ee) : rapport de 21h → « Parcours : visiteurs → voiture vue → réservation ouverte → demande envoyée · contacts », alerte si des réservations sont ouvertes sans être envoyées.
- Comparateurs : Trip.com accepte les loueurs locaux (registre de commerce location + assurance) → question envoyée à Kouider.

## 2026-10-24 — Crédit Claude suivi pour de vrai, bilan santé du matin, rapport du dimanche, Google Search Console

- `orchestrator.ts` `claudeRechargeAmount()` : « 14 $ je rajoute sur Claude » est enregistré dans À PAYER (avant : le cerveau disait « noté » sans rien enregistrer). Solde 13,68 $ saisi le 24/10.
- `billing.ts` : solde estimé + « ~N jours au rythme actuel » ; alerte à 3 $ restants (Telegram + app), contrôle à 10h ET 18h.
- `self-test.ts` + tgcall `call_event` + `/api/call/health-event` : le bilan de 7h45 compte les appels de la veille (réussis / pas décrochés / muets / basculés sur Claude) et le crédit Claude ; problème → aussi sur Telegram.
- `dzaryx-weekly.ts` (job `dzaryx-weekly`, dimanche 19h) : « ce que j'ai fait pour toi cette semaine » (messages, appels, démarchage, idées, visites, coût Claude).
- `search-console.ts` + `/api/calendar/gsc-connect` : rapport de 21h + bloc Google (vues, clics, place moyenne, 5 recherches) une fois le lien cliqué.

## 2026-10-24 — Dzaryx ne se tait plus toute la journée ; appels qui basculent sur Claude ; micro libéré pendant les appels

- `dnd.ts`, `call.ts` : appel pas décroché / refusé → silence de 1 h (avant : jusqu'à sa réponse → muet de 8h à 12h45 le 24/10) ; s'il écrit, le silence finit aussitôt.
- `auto-call.ts` : fin du silence → ce qui attendait (boîte d'appels) part en UN message Telegram.
- `incident-call.ts` : plus jamais d'APPEL pour un bug (tâche plantée…) : message Telegram + alerte app.
- `realtime.py`, `dzaryx_tg.py` : voix temps réel (Gemini) muette en plein appel (sa voix arrive mais aucune réponse 7 s, ou session coupée) → l'appel continue sur l'ancienne chaîne (transcription → cerveau Claude avec tous les outils → voix) avec « Pardon, je t'entendais mal… ». Commande Telegram « appels claude on/off » pour tout passer sur Claude.
- `call.ts` /tg-live, /tg-live-state + `VoiceScreen.tsx` (SW v175) : pendant un appel Telegram, l'app lâche le micro même au premier plan (bannière d'appel iPhone = pas de visibilitychange → appels « volume max 0 », 4 le 23/10).

## 2026-10-24 — Sites v4 « waouh » : ouverture cinéma, incontournables en photos IA, chiffres, appel final

- `site-design.ts` : dès 2 photos, ouverture plein écran (vraies photos en fondu + zoom lent, nom lettre par lettre, flèche de défilement) ; section « Nos incontournables » (3 grandes cartes photo, prix, « Commander ») ; bande de chiffres animés (note Google, avis, jours d'ouverture) ; appel final plein écran en parallaxe. Typo française (espace insécable avant ? !), avis coupés sans casser les émojis.
- `demo-site.ts` : le texte écrit aussi `showcase` (3 incontournables + consigne photo) et `cta` ; `showcasePhotos()` crée les photos par IA (fal.ai Flux Pro ≈ 0,04 $/image, sinon Pollinations gratuit, l'une après l'autre avec 3 essais), rangées dans le stockage public `fik-sites/showcase/` et signalées dans « inventé ».
- Testé en local sur Caramelia pastry (captures Chrome, aucune erreur JS) — en local seul le gratuit marche (pas de clé fal) : sur Railway les photos passent par Flux Pro.

## 2026-10-24 — Plus jamais « Bruxelles » ni de date de RDV envoyée sans Kouider ; commandes WhatsApp sur les sites clients

- `site-prospecting.ts`, `prospect-autopilot.ts` : les mails de démo et les réponses aux prospects ne proposent plus AUCUN créneau de l'agenda ni « heure de Bruxelles » (Caramelia 24/10 a reçu 3 créneaux « heure de Bruxelles »). Ils disent que Kouider revient vers eux ; Kouider reçoit « dis-moi quand tu es dispo ».
- `rdv-booking.ts` : la page /rdv/ ne montre plus de créneaux : le commerçant écrit quand il est joignable (+ tél) → alerte Telegram/app + appel à Kouider, qui fixe la date.
- `context-builder.ts`, `call.ts` : règle DISCRÉTION — jamais la Belgique/Bruxelles dans un message client, heures en heure du client, aucune date de RDV que Kouider n'a pas donnée.
- `site-design.ts`, `client-sites.ts`, `client-site-admin.ts`, `demo-site.ts` : nouveau mode « commande » (pâtisserie, boulangerie, traiteur, fleuriste, boutique ; café/restaurant : choix « Réserver une table / Commander à emporter »). Après l'envoi, bouton « 📲 Envoyer aussi sur WhatsApp » avec la demande déjà écrite au numéro du patron. Testé dans Chrome sans écran (fetch simulé).

## 2026-10-24 — FIK Sites : grille de prix alignée sur le marché

- `site-tarifs.ts` : France Vitrine 19 → 29 €/mois (290 €/an), Pro 39 → 49 €/mois (490 €/an), Achat unique 390 € + 60 → 490 € + 90 €/an. Algérie : Vitrine 1 500 et Pro 2 500 DA/mois inchangés (panel d'acheteurs : 0 % à 2 500 DA sans garantie), Achat unique 25 000 → 30 000 DA (+ 6 000/an). Modifiable par message.

## 2026-10-24 — Démarchage : alertes sur Telegram + fiche vente (prix + arguments) après chaque démo

- `site-prospecting.ts` : les « oui », démos envoyées, échecs de démo et réponses des commerces partent maintenant AUSSI sur Telegram (`tellKouider`) — avant, seulement dans l'app (Caramelia pastry 24/10 : Kouider n'a rien vu).
- `salesBrief()` : juste après l'envoi d'une démo, fiche vente pour Kouider : pack conseillé au prix de SA grille (`site-tarifs.ts`, jamais inventé), autres packs, offre en cours, 4-5 arguments pour ce commerce, objection probable + réponse, phrase pour conclure.
- Rappel : la réponse est vue au passage suivant (toutes les 30 min, 7h-22h Oran) ; la démo a déjà un secours si Netlify n'a plus de crédit (hébergée sur Railway /demo/<slug>/, be7cc9b).

## 2026-10-24 — Secours sans crédit Claude réparé (Gemini + « Oui »), plus d'appels « tâche plantée »

- `anthropic-compat.ts` : Gemini 3 refusait (400 « missing thought_signature ») tout 2e tour avec outils → mentor-news / business-mentor plantaient sans crédit Claude. La signature est gardée par id d'appel et renvoyée. Erreur des cerveaux de secours maintenant écrite dans le log.
- `agentic-fallback.ts` : réponse courte (« Oui ») → outils choisis sur les derniers échanges et parmi tous les outils ; mots pondérés par rareté (23/10 : « Oui » pour avancer le sport → morning_routine absent, rien fait).
- `scheduler.ts` : tâche en échec pour crédit Claude vide → pas d'appel d'incident (l'alerte « recharge » suffit).

## 2026-10-23 — Appel muet raccroché, heure des mails, Gmail déconnecté sans incident

- `tgcall/dzaryx_tg.py` : appel 15h (10 s de silence total, Kouider raccroche avant le contrôle des 12 s) → aucun message ni 2e essai. Maintenant un appel sortant raccroché avec volume 0 = appel muet : message écrit + astuce + 2e essai dans 10 min.
- `tool-executor.ts` list_emails : date en heure belge (slice(0, 22) coupait le fuseau → mail de 15h18 annoncé « 13h18 »).
- `prospect-autopilot.ts` : Gmail déconnecté → prospect-replies saute au lieu de planter (appel d'incident 15h).
- `billing.ts` : alerte « plus de crédit » lisible (plus de JSON brut d'Anthropic).
- Google OAuth passé « In production » par Kouider : plus d'expiration Gmail tous les 7 jours.

## 2026-10-23 — Secours sans Claude : appels plus rapides, tâches de fond, mémoire des appels, « je vérifie »

- Appel 6h : réponse en 48 s (gemini-flash-latest figé, timeout 45 s) → Kouider a raccroché. `agentic-fallback.ts` : timeout Gemini 20 s, modèle sauté 15 min sur 429/503/timeout, flash-latest en dernier.
- `anthropic-compat.ts` (tâches de fond : mentor-news, business-mentor plantaient « credit balance too low ») : Gemini 30 s + sauté sur 429/503/figé, Groq descriptions d'outils raccourcies + attente du retry-after sur 429. Testé : réponse servie par gemini-3.5-flash-lite en 3-4 s. Veille actu : date du jour donnée (cherchait « janvier 2025 »).
- `provider-manager.ts` : dernier recours Gemini puis Groq quand Claude + OpenAI sont morts (/api/call/summary renvoyait 500).
- `realtime.py` : « Attends, je vérifie ça. » à 7 s puis « Je cherche encore, quelques secondes. » à 22 s pendant ask_dzaryx (PCM en cache dans tgcall/cache/wait).
- `call.ts` : la note interne « [note interne, ne pas recopier…] » n'est plus renvoyée à la voix ; une info à retenir (famille, goûts) est enregistrée directement, et la voix ne dit plus « je l'ajoute » si le cerveau demandait encore « Je l'enregistre ? ».

## 2026-10-23 — Playlists 100 % rap FR + plus de « Petit souci technique » sans crédit Claude

- `presence.ts` : playlists de séance = « les indispensables » de 2 rappeurs FR du jour (SoSo Maness, Lacrim, Jul, Naps, SCH, Kofs, L'Algérino, Ninho, Rim'K, Werenoi, Gazo, Alonzo, Kaaris, Hornet La Frappe) + « Le Code ». Retirés : Pure Gym / Sport Rap / Phonk (rap US), Magh Rap, Hits Rap, Soolking, Didine.
- 6h42/6h44 : « Petit souci technique » ×2 = Telegram coupait à 90 s pendant que le secours (crédit Claude à 0) répondait. `orchestrator.ts` saute Claude quand son crédit est connu épuisé (`claudeKnownDead`), `dzaryx_tg.py` attend 180 s et dit clairement si c'est un délai dépassé.

## 2026-10-22 — Secours sans Claude : les conseils ne sont plus remplacés par « pas accès aux données »

- Crédit Claude vide → cerveau de secours (Gemini). Deux demandes d'avis de Kouider (« quel tarif proposer au propriétaire de Bir El Djir ? ») ont reçu le message tout fait FAST_PATH_REFUSAL, parce que la réponse contenait un montant et qu'aucun outil n'avait tourné.
- `orchestrator.ts` (secours agentique) : fastPathGuard sauté quand Kouider demande un avis (tu en penses quoi, conseil, quel tarif, intéressant…). phantomGuard (« j'ai vérifié… » sans outil) reste actif.

## 2026-10-22 — Cerveau selon la demande : quotidien sur Haiku, réflexion sur Sonnet

- Kouider : « +310 €/mois c'est trop ». `claude-api.ts` `pickChatModel()` : résas, dispo, agenda, rappels, lectures WhatsApp/mails, oui/non → Haiku 5.5 (~20× moins cher, mêmes outils, effort medium). Réflexion, conseils, plans/dossiers, textes envoyés à un client (rédaction ou retouche d'un brouillon), photos, recherche web, long message → Sonnet 5.5. Si Haiku échoue (hors 429/crédit) → Sonnet prend le relais.
- `spokenText()` : les consignes « [APPEL TÉLÉPHONIQUE…] » / « [Contexte : …] » ne déclenchent plus à tort réflexion, recherche web ou Sonnet. Recherche web : plus sur « aujourd'hui », « anthropic », « cours », « résultat » seuls.
- Test sur 147 vrais messages du 15 au 22/10 : 89 Haiku / 58 Sonnet (avant : tout Sonnet).
- Interrupteur `billing` chat_auto (défaut) / chat_sonnet (« mets tout sur Sonnet »), app_kv `billing:chat_model`.

## 2026-10-22 — Coût Claude : tout est compté, par origine (billing claude_usage)

- Constat : coût par message ×2 depuis le 15/10 (≈ 0,08 $ → 0,15-0,23 $) : à chaque message ~35k caractères de consignes + 86 outils « toujours chargés » (98k caractères, +38 % d'outils en une semaine) ; 22/10 = 37 messages. Le cache 1 h (b839a12) transforme ces réécritures en relectures (~10× moins cher).
- `anthropic-compat.ts` : compatFetch compte TOUS les appels non streamés (vrai modèle de la réponse, donc Haiku quand le mode éco bascule) avec leur origine (fichier appelant ou début du prompt). Avant, seules les conversations étaient comptées.
- `cost-tracker.ts` : `source` → `claude:cost:<jour>:src:<origine>:usd|n` + `getDailyCostBySource()`. Chat : `chat-<session>`, `chat-rapide`, `pro-doc` (streamés).
- Comptage manuel retiré de prospect-whatsapp, mail-digest, prospect-autopilot, site-prospecting, chat rapide Haiku (doublons, et mauvais tarif quand éco).
- Outil `billing` action `claude_usage` : « qu'est-ce qui mange mon crédit Claude ? » → coût du jour par origine.

## 2026-10-22 — Crédit Claude vidé trop vite + app bloquée sur « CONNEXION… »

- Dépense suivie du jour (app_kv claude:cost) : Sonnet 966k entrée / 1,69M écriture cache / 2,48M lecture cache / 16k sortie ≈ 6,8 $ ; 62 % = écritures de cache. Pas de signe de clé volée.
- `claude-api.ts` : prompt système en cache 1 h (au lieu de 5 min, Kouider écrit souvent à > 5 min d'écart) + cache automatique de la fin de conversation à chaque tour d'outil (les ~11k jetons de consignes du jour + historique étaient repayés plein tarif à chaque tour).
- App (`simulator/src/services/api.ts`, SW v174) : le choix du serveur de secours n'est plus gardé en mémoire (l'app restait collée au secours Render, mort, après 4 coupures réseau) ; bascule seulement si le secours répond à /health, retour automatique sur Railway dès qu'il répond.
- Constaté : Upstash (REDIS_URL) limité, mais le code n'utilise plus Redis (KvRedis = mémoire + app_kv) → sans effet.

## 2026-10-22 — WhatsApp : Dzaryx MONTRE les photos des clients (whatsapp_web action photos)

- Kouider : « tu peux me montrer les photos ? » → Dzaryx répondait qu'il ne pouvait pas (l'outil ne lisait que le texte).
- `cloudpc/whatsapp_web.py` : action `photos` (chat, n ≤ 10). WhatsApp garde l'image pleine taille (blob 1500×2000) dans la bulle, albums compris → redessinée en JPEG 1600 px sur un canvas, avec qui l'a envoyée, heure, légende ; clique les ↓ des photos pas encore téléchargées.
- `cloudpc/agent.py` : copie aussi chaque photo dans les Téléchargements du PC cloud (`wa-<contact>-<date>-N.jpg`), renvoyable avec send_file.
- `whatsapp-web.ts` : action `photos` → chaque photo part sur le Telegram de Kouider + courte description (vision Groq gratuite, OpenAI en secours) ; la lecture d'une discussion avec des photos rappelle à Dzaryx qu'il peut les montrer. `tools.ts` : description + enum.
- Testé sur la vraie discussion +33 6 51 91 53 69 : 10 photos récupérées et envoyées à Kouider sur Telegram.

## 2026-10-22 — FIK Sites : des sites uniques (5 styles + touche FIK), interactifs, style dans l'espace admin, accès du patron géré depuis l'app

- `site-design.ts` (nouveau, la page publique sort de demo-site.ts) : 5 univers (luxe, editorial, vibrant, minimal, urban) avec chacun son héros, sa présentation, sa carte (liste à points ou cartes), ses formes et son fond ; variante tirée du nom. Touche FIK commune : badge « Ouvert maintenant / Ouvre à … » en direct, bandeau des points forts qui défile, barre de progression, apparitions animées, onglets de la carte par catégorie, parallaxe du héros, cartes qui s'inclinent sous la souris, visionneuse photos, avis qui défilent, barre Appeler / Itinéraire / WhatsApp sur téléphone, signature FIK. Respecte « réduire les animations ».
- `demo-site.ts` : Claude choisit le style + une phrase signature, palette et polices propres au commerce (14 paires de polices), évite les combinaisons des 6 dernières démos. Testé sur 2 vraies démos (garage Oran → urban, salon Lille → editorial), supprimées ensuite.
- `client-sites.ts` : SITE_VERSION 3 (les sites existants passent au nouveau design au job du matin), ADMIN_VERSION 3 ; style/signature modifiables par message ; actions `account` (+ `send_to_client` : accès envoyés au patron par e-mail) et `account_off` (couper l'accès).
- Espace admin du patron : carte « Style du site » (5 styles) + phrase signature.
- App v173 : bloc « Qui a accès à l'espace admin » (toi toujours, le patron : donner / nouveau mot de passe / couper, envoi par e-mail).

## 2026-10-22 — FIK Sites : grille de prix, fiche client, vrai site après paiement, documents Telegram

- `site-tarifs.ts` (nouveau) : grille Algérie (Vitrine 1 500 DA/mois · Pro 2 500 DA/mois · achat unique 25 000 DA + 6 000/an) et France (19 € · 39 € · 390 € + 60/an), options (visibilité, domaine), offres ; app_kv `fik:tarifs`, modifiable par message (`manage_client_site action=tarifs changes`).
- `client-sites.ts` : `pack` + `contact` sur chaque site ; `applyPack()` règle l'abonnement depuis la grille et note le paiement ; `create_client_site` avec pack/period/paid_amount → site + abonnement + paiement + espace client (e-mail du démarchage par défaut) + prospect « client » + message « il ne te reste QUE le nom de domaine » (idée de domaine). Action `pack`, fiche client dans `info` (client depuis, total payé, services). Overview : fiche client + grille.
- `site-prospecting.ts` : `classifySiteReply()` séparé (testable) ; une réponse « je veux un site / appelez-moi » AVANT la démo envoie aussi la démo. Testé : 6 réponses types bien lues + vrai mail de démo envoyé à notre boîte.
- `tools.ts` : documents (PDF, photo, Word, Excel) pour un site client → tout recopié dans edit, sans résumer.
- `tgcall/dzaryx_tg.py` : Word (.docx), Excel (.xlsx), CSV, TXT lus sans bibliothèque ; PDF scanné → 1re page envoyée en image.
- App (`SitesScreen.tsx`) : section « Mes tarifs » (Algérie/France, détails, changer un prix), FICHE CLIENT au clic (contact, téléphone, e-mail, client depuis, formule, il paie, total payé, services, changer de formule), choix de la formule et du paiement en créant le vrai site.

## 2026-10-22 — Démos de sites : secours gratuit quand Netlify n'a plus de crédit

- `demo-site.ts` : `deployDemo()` essaie Netlify ; s'il refuse (crédit épuisé, jeton, panne), les fichiers vont dans le stockage Supabase (bucket privé `fik-demos`) et la démo est servie par le backend → la démo se fait toujours. Message Telegram le signale. L'adresse ne bouge plus ensuite (déjà envoyée au prospect).
- `index.ts` : route publique `/demo/<slug>/` (sans CSP, cache 5 min, 404 sinon).
- Testé sans jeton Netlify (page + photo + redirection). Les vrais sites clients (domaine) restent sur Netlify.

## 2026-10-22 — « L'euro est à combien ? » → taux du marché noir

- `gold.ts` / `tools.ts` : `gold_watch` action `change` = taux du square du jour (ExchangeDZ, € et $), conversion d'un montant (amount_eur / amount_dzd), jamais le taux des banques ni une recherche web. Outil déjà dans ALWAYS_TOOLS (écrit) et via ask_dzaryx (appels).

## 2026-10-22 — Or : retour au square du jour (Kouider s'était trompé, 227 était faux)

- `gold.ts` : plus de taux fixé par défaut ; € ↔ DA au square ExchangeDZ du jour (274,8 le 22/10), capital 600 € = 164 898 DA, suit le square chaque jour. `eur_dzd` en settings reste possible s'il le demande, `eur_dzd: 0` = retour au square.

## 2026-10-22 — Or : euros comptés au taux du marché noir de Kouider (1 € = 227 DA)

- `gold.ts` : `my_eur_dzd` (défaut 227) = taux auquel Kouider change vraiment ses € ; prioritaire sur le square ExchangeDZ (274,8, affiché à côté) pour toutes les conversions €↔DA. Capital gardé en € (`capital_eur`) et recalculé à son taux : 600 € = 136 200 DA (3 × 45 400). Le prix de l'or 18 carats en DA ne change pas (prix bijoutier).
- `tools.ts` : `gold_watch` settings `eur_dzd` = « je change à 230 maintenant ».

## 2026-10-22 — Or : prix algérien du 18 carats en dinars (au lieu du cours mondial en euros)

- `gold.ts` : Kouider achète en Algérie, en bijou 18 carats ou en louis → cours suivi = prix 18 carats DA/g d'ExchangeDZ (or mondial × dollar au square, historique jour par jour), gold-api en direct au même calcul, secours Yahoo GC=F × dernier taux du square. Tout compté en dinars avec l'équivalent en € au square ; prix du louis entier (6,45 g, 0,900). Carnet `kouider:gold` converti des € vers les DA au 1er passage (600 € → 164 898 DA). Achats/ventes en `amount_dzd` (ou € converti), karat 21.6 = louis.
- `tools.ts` : description de `gold_watch` mise à jour (DA, louis, square).

## 2026-10-22 — Or : surveillance du cours + capital à faire grossir ; conseiller élargi aux business hors FIK

- `gold.ts` (nouveau, outil `gold_watch`, job `gold-watch` 10h15/15h15/20h15 en semaine) : cours Yahoo (GC=F + EUR/USD, 1 an) + gold-api en direct, en €/g pur et 18 carats. Alerte d'achat (message + appel `autoCall` normal) quand l'or est ≥ 5 % sous son plus haut du mois et sous sa moyenne, pas de rappel au même niveau (−3 % ou 14 jours). Capital en tranches (600 € → 3 × 200 €), achats/ventes notés (€ ou dinars + taux square), revente conseillée à +10 % net frais compris. « Rentable en combien de temps » = hausse nécessaire (marge vendeur 5 % + retenue bijoutier 5 % ≈ 10,5 %) au rythme de 8 %/an et au rythme de la dernière année. Portefeuille dans app_kv `kouider:gold` (capital 600 € enregistré).
- `business-mentor.ts` : un jour sur deux l'idée du jour est HORS de FIK (business à lancer, revenu en plus) ; la veille 8h/17h cherche aussi les occasions de gagner de l'argent, et une vraie opportunité chiffrable → appel (1 max par veille, gardé les jours de congé).

## 2026-10-22 — Surveillance de vol : Dzaryx appelle quand le prix est vraiment bon

- `air-algerie.ts` : surveillance (`watch_hours`, 24 h / 1 semaine…) → vrai appel (`callOwner`, donc Telegram) quand le total avec bagages passe sous `call_below` (« appelle-moi si moins de 900 € »), ou sans seuil dès −12 % sous le 1er prix vu. Pas de rappel tant que le prix ne baisse pas encore de 5 %. Jamais la nuit (attend le récap de 7h) ; « ne pas déranger » respecté. La fiche + lien partent sur Telegram comme avant.
- `tools.ts` : paramètre `call_below` + consigne « cherche pendant 1 semaine et appelle-moi si bon prix » = watch_hours 168 sans demander de seuil.

## 2026-10-22 — App : plus de faux « Dzaryx ne répond pas » + recherche de vol qui rend toujours quelque chose

- App v172 (`TextScreen.tsx`) : si la réponse n'arrive pas par Socket.IO, l'app la récupère dans l'historique (toutes les 4 s, 3 min max) au lieu d'afficher l'erreur à 45 s.
- `nexus/modules/browser_agent.py` : boucle détectée ou limite d'étapes → dernier appel forcé `done` avec ce qui a déjà été lu (avant : tout perdu).
- `air-algerie.ts` : bagage en plus = barème officiel (PDF sept. 2026 : France 40 € aller / 6 000 DZD retour, Europe 60 € / 9 000 DZD), l'agent ne le cherche plus sur le site (il s'était perdu dans le PDF) ; aucune autre page ni PDF.

## 2026-10-22 — Profil voyage privé (Air Algérie) + fiche avion du Globe

- `air-algerie.ts` : profil voyage dans app_kv `kouider:travel:profile` (dates de naissance de la famille, séjour minimum) via `air_algerie_watch action profile` ; recherche sans passagers = toute la famille, prénoms acceptés, âges recalculés à la date du vol ; sans retour = aller-retour avec le séjour minimum. Vérifié : app_kv illisible avec la clé publique du site.
- App v171 (2995f70) : Globe, fiche avion complète (compagnie, départ → arrivée, reste + heure d'arrivée, appareil, photo) via adsbdb.

## 2026-10-22 — Soin de la famille (family_care) + récap clair

- `family-care.ts` (nouveau, outil `family_care`) : carnet santé privé (`kouider:family:health`) + rappel « prendre RDV pédiatre » (week-end → lundi), `list` pour le médecin, `hard_day` (journée dure = congé pour les tâches de fond via `isDayOff`, consigne douce dans le dossier), `urgence` (112, 1733, pharmacie de garde, antipoison + pharmacies proches) sur Telegram.
- `tg-outbox.ts` : plusieurs messages gardés → un récap « ce que tu as raté / ce qui compte aujourd'hui » (Haiku), liste brute en secours.
- Houari = propriétaire des voitures/immobilier seulement, jamais pour les clients (Kouider 22/10).

## 2026-10-22 — Nouvelles de la famille, courte nuit, départ pour un souci

- `dnd.ts` : souci perso pendant un silence → `kouider:family:followup` ; nouvelles demandées au retour à la maison (`presence.ts`) ou dans le plan de 20h30 (`life-coach.ts`), une seule fois. Prénoms retirés du code (dépôt public).
- `life-coach.ts` + `tools.ts` : `life_coach log sleep_hours` ; sous 6 h, coucher du soir avancé (1 h à 1 h 30) tout de suite, puis Dzaryx propose séance plus légère / réveil plus tard (rien sans son oui).
- `presence.ts` : « je pars à l'hôpital / urgence… » en réponse au « tu vas où ? » → ni musique, ni business, ni brief ; humain + trajet + pause_calls proposé.

## 2026-10-22 — Reprise après une nuit aux urgences (B042)

Analyse de la conversation Telegram du 21-22/10 (son fils aux urgences). `orchestrator.ts` sauve les outils lancés dans `metadata.tools`, `context-builder.ts` les rappelle au cerveau (`withToolTrace`, supabase.ts) → plus de faux aveux « je ne l'ai pas fait ». `dnd.ts` : silence pour raison perso → prendre des nouvelles d'abord et les retenir ; jamais « jour de congé » s'il est au travail (`kouider-dossier.ts` aussi). `tg-outbox.ts` : récap sans « 06h19 → 06h19 », sans lignes d'agenda déjà passées. `constants.ts` : « je te le note » = outil dans le même tour.

## 2026-10-21 — Survie sans Claude : secours gratuits réparés (B041)

Clés Groq + Gemini ajoutées au `.env` du VPS (serveur de secours redémarré). `agentic-fallback.ts` : Gemini d'abord (7 modèles, quota épuisé → sauté 15 min), Groq en mode compact (prompt court + date, 8 outils pertinents, historique tronqué, rappel des outils si `tool_use_failed`, attente si 429 ≤ 20 s), photos transmises aux modèles qui voient. `compact-prompt.ts` (nouveau) utilisé aussi par `callGroq`/`callGroqVision`. `anthropic-compat.ts` (tâches de fond) : 120 outils max, images → `image_url` pour Gemini, avertissement anti-invention pour Groq. Orchestrator : `fastPathGuard` seulement si aucun outil n'a tourné ; Gemini vision en dernier recours pour l'appel vidéo. Test : `scripts/free-mode-test.ts free|paid` (ONLY, PAUSE, LOGFILE).

## 2026-10-21 — Revue sécurité + revue de code (site + Dzaryx)

- Site (autolux-location cbe0cc0) : APIs admin protégées (session admin ou clé serveur `x-service-key` de Dzaryx), numéro de passeport retiré de « Mes réservations », newsletter réservée aux admins.
- Dzaryx 681a4ab : les appels app→site envoient `x-service-key` (publié avant le site pour ne rien casser).
- Dzaryx 42f501f : `/api/vision/analyze` et `/scan` exigent le token de l'app (évite qu'un inconnu consomme les crédits Claude).
- Dzaryx ba2e12f : 5 bugs de la revue de code — ne-pas-déranger (job en retard), récap outbox, coach sport (deload ne monte jamais les séries, `parseFormScore` ignore « 3 min », « 2 km »…).
- Étude de marché + synthèse PDF, Excel et présentation : /root/reports (envoyés sur Telegram).

## 2026-10-21 — DNS mail (DMARC/DKIM) posés par le backend via Vercel

`integrations/mail-dns.ts` `startMailDnsSync()` (instance avec jobs, au démarrage + toutes les 6 h) : avec VERCEL_TOKEN (compte perso ou équipe), ajoute le TXT `_dmarc.fikconciergerie.com` (`p=none`) s'il manque, et `zoho._domainkey` dès que la clé DKIM Zoho est dans app_kv `mail:zoho-dkim`. État dans app_kv `mail:dns-setup`.

## 2026-10-21 — Démarchage : rejet Zoho rattrapé à l'envoi (B040)

`gmail.ts sendEmail` : après un envoi depuis contact@ (Zoho), `waitSenderBlockedBounce` lit la conversation (3 s, 5 s, 8 s) ; un rejet 5.4.6 → `markProAliasBlocked`, kv `mail:rescued-bounce:<id>` + `mail:zoho-blocked-at` (24 h, levé par `mail:zoho-unblocked-at`), rejet à la corbeille, mail renvoyé depuis fikconciergerie@gmail.com (même fil). `checkProspectReplies` ignore les rejets rattrapés et prévient Kouider une fois par jour (lien UnblockMe).

## 2026-10-21 — Forme du matin, bilan sport du dimanche, objectif de la semaine

FORME DU MATIN : les jours de sport, le message du réveil demande « ta forme de 1 à 5 ». `noteKouiderActivity(message)` (chat + /api/call/turn) lit un chiffre clair (« 2 », « 4/5 », « forme 3 », « … 2/5 mal dormi ») → `setMorningForm` ; en mots, le cerveau appelle `sport_coach form score`. 1-2 → séance du jour 45 min max, séries ×0,6, charges −10 %, pas de finisher, titre agenda « (courte) », bandeau 😴 (state.form, 14 j). BILAN DU DIMANCHE : job `sport-weekly` dim 20h Bruxelles → `sportWeeklyReport` : séances faites/prévues + ratées, volume vs semaine d'avant, records de la semaine, objectif atteint ?, séances de la semaine prochaine (semaine allégée signalée), nouvel objectif, niveau du jeu ; Telegram + notif app ; `sport_coach weekly` à la demande. OBJECTIF DE LA SEMAINE (state.goal) : régularité (N séances sur N) si la semaine n'était pas pleine, sinon une charge à battre (exercice en progression de la semaine qui vient) ; suivi dans `progress` et `/sport` overview (goal + done/reached).

## 2026-10-21 — Mode repos, semaine allégée automatique, playlist de séance

Kouider valide les 3 idées. MODE REPOS : `sport_coach rest` / `rest_off` (+ date, reason) → `notifications/rest-day.ts` (app_kv `kouider:rest:<date>`) : `routinePausedReason` renvoie « jour de repos » (pas de réveil, routine, brief, alertes sport), `callOwner` garde les appels dans la boîte (sauf force), séance skip « 🛌 … » (blocs enlevés de l'agenda) ; les messages passent. SEMAINE ALLÉGÉE : `checkDeload` au job sport-plan 20h15 → après 7 semaines (ou ≥ 5 semaines + RPE moyen ≥ 8,5 sur les 3-4 dernières) et ≥ 12 séances, semaine allégée du lundi suivant (`deload` dans `kouider:sport:state`) : séries ×0,6 (min 2), charges conseillées −10 %, pas de finisher, titre agenda « (allégée) », bandeau dans la séance, `deload` dans `/sport` overview ; `sport_coach deload` mode on/off/status. PLAYLIST DE SÉANCE : `presence.sportPlaylistText(type)` = playlist Apple Music Fitness belge selon la séance (force : Sport Rap / Pure Gym / Pour tout donner / Phonk ; cardio : 100 % Cardio / Hits pour courir / Sport 45 min ; core : Pilates et abdos / Énergie fluide) + « les indispensables » d'un de ses artistes ; `sendSportPlaylist` une fois par jour (départ maison GPS, rappel de départ ou arrivée à la salle), `settings playlist`, `sport_coach playlist`.

## 2026-10-20 (soir) — Ne pas déranger programmé, sport annulé partout, programme officiel, bagages, vraies playlists (B039)

Kouider : « je ne vais pas à la salle demain, ne me dérange pas le matin » → doit être respecté ET enlevé de l'agenda, sans rafale de messages. `dnd.ts` : silences programmés `dnd:planned` (planDnd / dndAt), `pause_calls` day + from_time + until_time + cancel_planned (resume ne les efface plus). Routine du matin : rien si sport annulé ou silence à l'heure du réveil. `sport_coach skip` : blocs de la routine enlevés de l'agenda ce jour-là (unskip → séries recréées). `smart-alarm` (22h30 heure d'Algérie) coupé : doublon de la routine. tg-outbox : messages gardés → un seul récap. PROGRAMME OFFICIEL : `sport_coach set_program / edit_session / program / reset_program` (app_kv `kouider:sport:program`, 6 séances max, exercices reconnus = même id/démo/historique) → rotation, agenda, app, Telegram ; consignes « coach d'élite » (technique, progression, récup, alternatives, dos). Vols : 1 valise en soute par personne + 1 bagage en plus pour le groupe + 1 bagage à main par personne (2 adultes + bébé → 4 soute, 3 main), fiche « PRIX TOTAL AVEC BAGAGES ». Playlists : boutique Apple Music belge (le lien /fr/ ouvrait l'app sans la playlist) + `gps_assistant playlist query` = artistes demandés.

## 2026-10-20 — Vols Air Algérie : Telegram + fiche billet + lien + surveillance de prix (65c174a, 2a9c5f1)

Kouider : résultat aussi sur Telegram avec photo, vols DIRECTS seulement (le moins cher sans escale), toutes les infos du billet + le lien, et « cherche pendant X heures / jours / semaines », même la nuit avec récap le matin. browser-worker `flight_result_to_outbox` : capture de la page Air Algérie (sans pied de page) + texte dans tgcall/outbox (recherche ratée = texte seul). Fiche billet imposée (trajet, passagers par catégorie, bagages, aller/retour avec horaires + n° de vol, PRIX TOTAL AVEC 1 BAGAGE + détail, lien). Lien court public `GET /api/vol?f&t&d&r&a&c&i` → refait le POST airalgerie.dz et redirige (le lien Amadeus expire). Surveillance : `air_algerie_search` + `watch_hours` / `every_hours` (défaut 2 h / 6 h / 12 h), job `flight-watch` toutes les 10 min, app_kv `flight:watches` ; prévenu seulement au 1er prix, à chaque baisse et à la fin ; 22h-7h muet puis à 7h recherche fraîche + récap de la nuit ; outil `air_algerie_watch` (list/stop). `/api/browser/update` renvoie {ok, notify, text}. LoopGuard : click/type/select comptés par lecture de page (les refs changent).

## 2026-10-20 — air_algerie_search : âges des passagers + tout un mois

Kouider : « regarde-moi une date en janvier », et donner les âges (« 24, 25 et mon fils 1 an ») sans que Dzaryx se trompe de catégorie. `passengers` = âges ou dates de naissance → adulte 12+ / enfant 2-11 / bébé <2 (catégories du site), âge pris au dernier vol, alerte si 1 an / 11 ans ou si la catégorie change pendant le voyage. `month` (AAAA-MM) + `stay_days` / `one_way` : 5 liens Amadeus (centres 4, 11, 18, 25, fin de mois), Dzaryx demande aller simple / durée si non dit. Page « vols » (au lieu de la grille) : l'agent clique l'aller Light pour voir la barre du retour. Agent navigateur : LoopGuard compte wait/read_page/scroll/screenshot par page ouverte ; worker MAX_STEPS 45. Testé janvier 2027, 7 j, [24, 25, 1] : 336,20 € Light, ≈ 411,70 € avec 1 bagage.

## 2026-10-20 — Recherche de vols Air Algérie (air_algerie_search)

Kouider : vols Air Algérie uniquement, aux dates qu'il donne, avec le nombre de passagers, TOUJOURS 1 seul bagage en soute en plus pour tout le groupe, départ Lille → Oran par défaut. Nouvel outil `air_algerie_search` (backend/src/integrations/air-algerie.ts) : le backend rejoue le POST du formulaire airalgerie.dz (dates AAAAMMJJ0000) → 302 vers la grille Amadeus FlexPricer (±3 jours, prix totaux du groupe) ; la page est derrière Imperva donc lue par browser_task dans le Chrome du PC cloud (aucune clé). Bagage : Light = 0 soute, Economique Promo = 23 kg/pax → prix 1 bagage ≈ Light groupe + (Promo − Light) ÷ nb passagers (1 passager en Promo, 2 réservations), + prix « tous en Promo ». Jamais de saisie passager ni de réservation. Testé 3 adultes 02→09/12 : 424,80 € Light, ≈ 460,81 € avec 1 bagage. Agent navigateur : max_tokens 4000 + done coupé redemandé, read_page 12 000 caractères compactés.

## 2026-10-20 — Pas de 2e appel pendant un appel : l'info est dite dans l'appel en cours

Kouider : s'il est déjà en appel avec Dzaryx et qu'un rappel / appel programmé doit partir, Dzaryx ne doit pas le rappeler après mais dire « ah attends, j'ai aussi une autre info » dans l'appel en cours. tgcall : appel en attente pendant un appel actif → /api/call/merge (retire l'appel en attente, rend le motif) → RealtimeCall.announce() attend la fin de sa phrase puis glisse l'info et reprend la conversation. Pas possible (quelqu'un d'autre au téléphone, ancienne voix, appel fini) → gardé pour son prochain appel (keep).

## 2026-10-20 — Ne pas déranger, vraies playlists, Waze seulement, arrivée « pas prévue »

Demandes de Kouider (captures Telegram du 20/10 à 7h41) :
- **Ne pas déranger** (notifications/dnd.ts) : appel pas décroché ou refusé → un seul message (« je n'insiste pas, dis-moi à partir de quelle heure »), puis PLUS AUCUN appel (même programmé : réveil, sport, rappels — callOwner les garde dans la boîte des appels) ni message Telegram (tg-outbox les garde) ni notif de l'app, jusqu'à sa réponse. Sa réponse « dispo à 15h » → pause_calls until_time ; « ne me dérange pas (jusqu'à X) » → pause_calls (appels + messages). À la fin, les messages gardés partent d'un bloc (« pendant ta pause… », jetés après 4 h). Ses propres demandes reçoivent quand même une réponse (fenêtre 10 min). call_me « maintenant » passe outre. tgcall : plus de 2e essai sauf son muet.
- **Musique** : vraies playlists Apple Music « <artiste> : les indispensables » (API iTunes + page artiste, cache 30 j) + Magh Rap / Le Code / Hits Rap, au lieu de liens de recherche.
- **Waze seulement** : départs, sport, assistant GPS, outils trajet/livraison → plus de point Plans ni de lien Google Maps.
- **Arrivée pas prévue** : au travail alors que l'agenda dit autre chose (ex. PUSH DAY) → « tout va bien ? tu fais quoi là-bas ? » au lieu de « bien arrivé au travail » ; et plus de « je te vois partir de la maison » quand la position passe directement maison → autre lieu.

## 2026-10-20 — Contrôle général : relance Gemini fantôme + météo en cache

- tgcall/gemini_live.py : quand Gemini Live coupe (1011) et que l'appel se reconnecte, l'ancienne session gardait sa surveillance « Gemini ne répond pas → relance » active : boucle à vide toutes les 10 s pendant 2 h 30 après l'appel de 7h50 (911 lignes de log). La surveillance s'arrête maintenant quand la session se ferme.
- backend web-search.ts : météo d'Oran en cache 10 min + dernière valeur connue si Open-Meteo renvoie 429 (autotest de 7h45 en rouge).

## 2026-10-20 — Visites du site : vrais visiteurs / nous / robots

Le site (track.js, repo autolux-location 4c909e4) trie chaque visite dans page_views.visitor : « nous » = appareil qui a ouvert l'admin ou le lien ?moi=1 (retenu dans le navigateur), le serveur Dzaryx / PC cloud (45.9.190.54, + FIK_OWNER_IPS), ou un autre appareil sur la même connexion ce jour-là ; « robot » = Google, aperçus de liens, Jina, navigateurs pilotés. Pays via les en-têtes Vercel. Dzaryx envoie le bilan chaque soir à 21h (site-traffic.ts), le brief du matin et l'outil stats ne comptent plus que les vrais visiteurs.

## 2026-10-20 — Démarchage séparé de contact@

Les mails de démarchage partent de contact@fikconciergerie.com, 1 toutes les 1 à 2 min au lieu de 20 s (plus de rafale → Zoho ne bloque plus). Si Zoho rebloque quand même, bascule auto sur fikconciergerie@gmail.com (3c43008). Kouider a refusé le démarchage 100 % Gmail.

## 2026-10-20 — Mails bloqués par Zoho (5.4.6)

Depuis le 18/10, Zoho bloque l'envoi depuis contact@fikconciergerie.com (« Unusual sending activity ») : 31 mails de démarchage rejetés, et chaque rejet classait le prospect en « adresse invalide » (stop). `gmail.ts` : un rejet 5.4.6 de moins de 24 h → envoi depuis fikconciergerie@gmail.com. `prospect-autopilot.ts` : rejet Zoho ≠ adresse invalide → prospect remis dans la file (ou relance à refaire) + alerte Kouider avec le lien de déblocage. 31 prospects réparés en base.

## 2026-10-19 — Survie sans crédit : voix d'appel gratuite Gemini Live (49f0a7b, 363ee55, 5d41244)
- Appels muets : crédit OpenAI épuisé, la socket temps réel s'ouvrait puis renvoyait l'erreur → l'appel ne basculait pas. Le 1er événement est maintenant vérifié.
- Voix d'appel : OpenAI Realtime → **Gemini Live gratuit** (tgcall/gemini_live.py imite la socket OpenAI, `/api/call/realtime-gemini`, 1er son < 1 s, outils OK) → ancienne voix. OpenAI sauté 30 min après une erreur de crédit.
- STT Groq → OpenAI → Google → Gemini ; voix ElevenLabs → Gemini → Google Traduction sans clé ; images OpenAI → Flux → Pollinations gratuit ; disjoncteur `integrations/credit-guard.ts`.
- Vocaux Telegram : si la voix temps réel échoue, la même réponse est relue par /api/tts (avant : le cerveau était rappelé une 2e fois).

## 2026-10-18 — Assistant GPS (position en direct) + Clio 4 Essence / i10 à 25 €
- Prix : Clio 4 Essence et i10 → 25 €/j client (Houari 16 €, marge 9 €), prix plancher retiré ; site, admin, partenaires, grille Dzaryx.
- `integrations/presence.ts` (job `presence-watch` toutes les 5 min 5h–22h + à chaque position Telegram, ≤ 1/45 s) : lieux maison/salle/travail (adresses routine:config).
  - Départ de la maison → « je te vois partir, tu vas où ? » ; vers la salle : point GPS + playlist Apple Music (rap DZ/FR, goûts dans app_kv `presence:prefs`). S'il répond → il est SEUL (45 min), Dzaryx parle librement ; le matin → appel du brief.
  - Salle EN AVANCE → « tu y es ? » → « oui » : `sport-coach.confirmGymArrival` valide la séance, coupe les alertes départ/« oublié », avance trajet/séance/retour/douche dans l'agenda.
  - Arrivé au travail → programme du jour ; rentré le soir → demain en 2 lignes. Trou dans le partage → recalage sans message.
  - BRIEF DU MATIN (hier, agenda, locations, mails, WhatsApp en attente, visites du site, 3 conseils ; écrit + oral) : seulement s'il répond qu'il est seul ; sinon redemandé 10 min avant le travail ; sans réponse 25 min → écrit sur Telegram. Le récap de 10h ne sonne plus si le brief est fait.
- Réponses Telegram à ces questions interceptées dans `/api/call/turn` avant WhatsApp (le vieux brouillon WA est annulé).
- Outil `gps_assistant` : status, eta (trafic + Waze), nearby (station, pharmacie…), brief, playlist, music, settings.

## 2026-10-18 — Immo par jour/mois + lieu de prise en charge
- Immo : location « Par mois / Par jour » (app Immo + PARC, `price_type` jour|mois, `monthly_rent` vide si par jour, outil `create_property` price_type). Site : « /jour » ou « /mois » sur les annonces + choix dans l'admin.
- Prise en charge des voitures : agence de Hay Badr OU aéroport d'Oran (site : contact, étapes, FAQ, pages SEO, contexte assistant ; app : Bon de réservation « Agence Hay Badr (Oran) »).

## 2026-10-18 — Prix : une seule source (table cars), changé partout d'un coup
- `config/pricing.ts` : la grille de Dzaryx (contexte, finance, marketing) se recharge depuis `cars` (base_price = Houari, resale_price = client) au démarrage, toutes les 2 min et après chaque changement ; la liste en dur ne sert plus que de secours. Prix plancher de ristourne dans app_kv `pricing:discount_floors` (jamais affiché sur le site).
- `update_car` : nouveau champ `discount_floor` ; grille rafraîchie aussitôt ; confirmation corrigée (prix client et prix Houari étaient inversés) + marge.
- `create_booking` : le contrôle « prix < coût Houari » lit `cars.base_price` au lieu de l'ancienne table `pricing`.
- `business_simulator apply_prices` et `partners` (offre liée au parc) rafraîchissent aussi la grille.
- Données : Clio 4 → « Clio 4 Essence » (Houari 16 €, client 30 €, ristourne 25 €), Clio 4 (2) → « Clio 4 Diesel » (24/35), i10 (16/30, ristourne 25).

## 2026-10-18 — Partenaires (Houari, Karim…)
- `partners.ts` (app_kv `partners:v1`) : fiche partenaire (rôle, contacts, paiement, commission, caution, contrat, note, statut) + offres véhicule/immobilier/service/activité/autre avec photos (Cloudinary), prix partenaire, prix client, unité, capacité, lieu. Véhicule lié au parc (cars = source de vérité, add_to_fleet), bien publiable sur le site (properties). Houari créé avec les 15 voitures du parc.
- Routes `/api/partners` (Kouider) ; outil `partners` ; `business_simulator scenario partner=…`.

## 2026-10-18 — Simulateur business + dossier « refais avec cette hypothèse »
- `business-simulator.ts` (outil `business_simulator`) : baseline (chiffres réels 2026), scenario (nouveau fournisseur −X %, prix client ±%, prix par voiture, voitures en plus, demande, autres activités, charges), target_income (« 2 000 € net/mois » : leviers, tableau marge × volume, plan réaliste voiture par voiture), price_car, price_grid, apply_prices (aperçu puis confirm=true). Tout est calculé, ancré sur la marge RÉELLE (prix négociés), jamais estimé par l'IA.
- `pro-doc.ts` : le dernier dossier (titre, but, matière, lien) est gardé (`dossier:last`) ; `create_presentation_doc revise_last=true + changes` le refait avec l'hypothèse.

## 2026-10-18 — Documents en PDF sur Telegram
- `google-docs.ts` : `exportGooglePdf` (lien d'export, marche avec drive.file), `sendGooglePdfToTelegram`, outil `send_doc_pdf` (« envoie-le-moi en PDF ») ; `create_google_doc` accepte `send_pdf`.
- `pro-doc.ts` startDossierJob : chaque dossier prêt part en fichier PDF sur Telegram (légende = lien Google Docs) ; si l'export rate → lien seul comme avant.
- `nexus-relay.ts` : `queueTelegramFile` exporté (lien temporaire 30 min que tgcall télécharge).

## 2026-10-18 — B037 : dossiers fiables + vrais graphiques (Docs et Telegram)
- `pro-doc.ts` : schéma DOSSIER_SCHEMA en sortie structurée, 32k tokens, bloc `chart` (bar/pie/line) que le rédacteur ajoute quand il y a des chiffres ; images refusées par Google → nouvel essai sans images (chiffres en liste).
- `askJson` : streaming, `schema` optionnel, relance si coupée / JSON invalide (3 essais).
- `chart-image.ts` : graphique SVG thème FIK → PNG Cloudinary ; `extractCharts()` pour Telegram.
- `call.ts` /turn (message écrit) : ```chart → `images` ; `tgcall/dzaryx_tg.py` reply_out : texte découpé + photos.

## 2026-10-18 — Jours facturés = tranches de 24 h + nutrition oubliée (demandes de Kouider)
- `rentalDays()` : 03/11 → 07/11 = **4 jours** (avant : 5, jours inclus). +1 jour seulement si le retour est plus tard que l'heure de départ (03/11 10h → 07/11 14h = 5 j). Paramètres start_time/end_time (create_booking). Les ~10 calculs recopiés (route bookings, check_car_availability, contrat signé, appels rapides, CA, voucher, excel, fiche client) passent par la même règle. Anciennes réservations : nb_days déjà enregistré → aucun chiffre passé ne change.
- Consigne Dzaryx (constants.ts) : 4 jours, jamais « 5 jours inclus », ne demande plus « lequel tu factures ».
- App v156 : formulaires de réservation, liste, carte (argent du mois, prolongation) alignés.
- Coach : plus AUCUNE nutrition, même si Kouider la demande ; ne cite plus ses traitements dans ce cas. Crash-test : nouveaux scénarios calcul-retard + nutrition. Tests financiers 11/11.

## 2026-10-18 — Crash-test de Dzaryx (faux messages, rien ne part)
- `backend/scripts/crash-test.ts` : 18 scénarios passent par le vrai cerveau (processWithOrchestration, comme Telegram), un juge Claude note chaque réponse, rapport .md, messages de test effacés de `conversations`. Run : `cd backend && npx tsx --env-file ../.env scripts/crash-test.ts rapport.md [filtre]`.
- `integrations/crash-test-sandbox.ts` (AsyncLocalStorage) : outils de lecture réels, tout le reste simulé (relecture imitée pour whatsapp_web / send_whatsapp_to_client sans confirmed). Branché dans executeTool ; pas de mémoire auto, d'apprentissage ni d'épisode pendant un test.
- 1er run : 7 OK · 9 moyen · 2 KO · 0 crash. Fix : `prospect_autopilot set_cities` avec une ville belge (Liège…) répondait OK alors que la ville était retirée en silence → Dzaryx disait « j'ai ciblé Liège ». Il refuse maintenant clairement (France + Algérie seulement).

## 2026-10-18 — Coach : nutrition retirée (demande de Kouider)
- Page COACH : plus d'onglet 🍽️ Nutrition (reste Sport · Mental · Progrès) ; « Préparer ma journée » + coucher passent dans Mental. App v155.
- Plus aucun repas ni eau : ni dans le plan du soir (20h30), ni dans l'agenda FIK, ni dans le jeu (points repas/eau, quête 4 repas → quête respiration, journée parfaite = humeur + respiration + gratitude). Le coach ne propose plus de nutrition.
- Purge unique sur Railway des repas déjà posés dans l'agenda (J-2 → J+14), drapeau app_kv `kouider:coach:meals-purged`.

## 2026-10-18 — B036 : envoi de mail confirmé au téléphone
- `sendEmailTool` : le « oui » dit en appel (« CONFIRMÉ AU TÉLÉPHONE ») est enfin reconnu ; avant, la consigne d'appel en tête du message faisait refuser tous les envois de mail demandés par la voix.

## 2026-10-17 (soir) — Page COACH : sport + nutrition + mental + jeu — 3e5b3b0
- Page app SPORT → COACH (onglets 🏋️ Sport · 🍽️ Nutrition · 🧠 Mental · 🎮 Progrès), app v154.
- Nutrition/mental dans l'agenda : `buildCoachDay` (life-coach.ts) génère en JSON 4 repas + eau + objectif mental + coucher, écrits chaque soir (20h30, rattrapage `ensureCoachDays` dans sport-watch) comme événements LIBRES (transparents) 🍳🍽️🥜🍲🧠😴 ; jamais de santé/poids/moral dans l'agenda. meeting-prep et departures ignorent ces événements (fenêtre meeting-prep 20 → 40).
- Jeu (`coach-game.ts`) : points recalculés depuis l'historique (séance, séries, records, arrivée GPS, repas, eau, respiration, gratitude, humeur, pesée), niveaux, 14 badges, 5 quêtes hebdo ; pesée = points pour la régularité seulement. API `/api/coach`.
- Démos animées de chaque exercice (free-exercise-db, domaine public) + bouton vidéo YouTube, dans la fiche et en mode séance. Courbes : charge par exercice, poids (+ objectif), humeur.

## 2026-10-17 — Coach sportif (sport_coach) + page SPORT — a8655c3
- `backend/src/integrations/sport-coach.ts` : rotation PUSH / PULL / LEG / CARDIO / UPPER / CORE & MOBILITÉ posée sur chaque créneau 🏋️ de l'agenda FIK (titre + exercices, séries × reps, charge conseillée dans la description). Créneau raccourci par un RDV → séance courte ; séance ratée → refaite au créneau suivant (clôture à 20h15) ; progression +step kg quand toutes les séries sont réussies. Programme sans charge lourde sur la colonne.
- Rappels : au message « pars à… » d'un créneau sport (departures.ts) → point GPS de la salle (send_venue Telegram) + séance + appel (sauf si la routine du matin vient d'appeler) ; `sport-watch` */5 : arrivé à la salle (GPS < 400 m) → séance sur Telegram, séance commencée +10 min et GPS loin → appel « tu as oublié le sport ? » + point GPS ; pas de GPS → message.
- Outil `sport_coach` (week/session/swap/skip/unskip/log/progress/settings/sync), API `/api/sport`, page app SPORT (mode séance, minuteur de repos parlé + vibration, remplacement d'exercice, wake lock, récupération musculaire, records, volume), app v153.
- tgcall : messages `location` → `send_venue`. Plan du coach de vie (20h30) reprend la séance prévue.
- Dossier investisseur PDF (25 p.) envoyé sur Telegram.

## 2026-10-17 — Coach de vie (life_coach)
- Dzaryx devient aussi coach de vie, coach sportif et nutritionniste : outil `life_coach` (plan du jour/demain calé sur l'agenda, suivi moral/poids, profil privé), injecté dans le dossier Kouider (chat, app, voix, appels).
- Tâches : `life-coach-evening` 20h30 (plan de demain + « ton moral ? », moral bas 2 jours → appel), `life-coach-weekly` dimanche 18h (bilan au téléphone).
- Données perso et santé UNIQUEMENT en base (app_kv `kouider:coach:*`), jamais dans le code (dépôt public). Règles de sécurité : jamais de conseil de dose, numéros d'aide, rien de santé à un tiers.
- Nexus : interface servie sans cache (Cache-Control no-cache) — les mises à jour de l'interface s'affichent tout de suite.

## 2026-10-17 (12) — GLOBE dans l'app (le globe de Nexus sur le téléphone)
- Nouvel écran **GLOBE** (Plus → 🌍) : `simulator/public/globe.html` (copie mobile de nexus/gui/globe.html, CesiumJS) dans `GlobeScreen.tsx`.
- Barre de recherche (Aller), actions : vols vers… / départs de… (Oran par défaut), caméras ici, caméras du monde, par catégorie, « que se passe-t-il ? ». Couches : satellite, rotation, avions, séismes, satellites, caméras, météo. Panneaux en bas d'écran sur téléphone.
- Données côté serveur (marche PC éteint) : `backend/src/integrations/globe-data.ts` (port de nexus/modules/globe.py) via `GET /api/nexus/globe/:kind` (jeton de l'app). Testé : avions, séismes, satellites, météo, lieux, vols vers Oran, caméras Londres ; Windy = clé Railway.

## 2026-10-17 (11) — Nexus récupère le dernier APK au démarrage du PC
- `backend/src/integrations/apk-release.ts` : dernier build réussi de build-apk.yml (lecture publique), téléchargement de l'artefact avec GITHUB_TOKEN, extraction de l'APK (cache /tmp), lien privé signé 3 jours. L'APK n'est jamais publié en public (il contient les clés de l'app).
- Routes : `POST /api/nexus/apk-check` (jeton PC) → envoi Telegram une seule fois par build (kv `apk:telegram_run`) ; `GET /api/nexus/apk/:token` → le fichier.
- Nexus (`modules/apk_update.py`) : 20 s après le démarrage, range le nouvel APK dans Téléchargements\Dzaryx (une fois par build), le note dans le journal et le dit à voix haute.
- tgcall : délai de téléchargement des documents porté à 300 s (APK ~40 Mo).

## 2026-10-17 (10) — Logo central VOIX + barre du bas sans coupure
- Page VOIX « Activer Dzaryx » : l'ancien orbe est remplacé par l'emblème hexagonal + deux anneaux HUD qui tournent. `OrbIcon` (carte réponse, chat) affiche aussi l'emblème. Emblème partagé dans `ui/DzaryxLogo.tsx`.
- Barre du bas : le trait du haut ne coupe plus le bouton micro (bosse arrondie autour de l'orbe), fond de page #030712 pour ne plus voir de bande noire sous la barre.

## 2026-10-17 (9) — App au style Nexus partout + tableau de bord Nexus + nouveau logo
- Palette Nexus (bleu nuit, cyan) sur tous les écrans, coque refaite : barre du haut, menu du bas à vraies icônes, grille « Plus », titres (Hero) et recherche.
- **Nouveau logo** : emblème hexagonal holographique + monogramme D (barre du haut, verrouillage, connexion, icônes web + APK). Le point rouge est remplacé par « EN LIGNE / CONNEXION… » sous DZARYX.
- **MON PC → tableau de bord Nexus** (`NexusDeck.tsx`) : horloge, jauges CPU/RAM/disque en direct, météo Oran, départs/retours du jour, actions rapides (Chrome, VS Code, capture, analyse écran, briefing, musique, ménage, verrouiller), boutons « afficher sur l'écran Nexus » (météo, réservations, disque, serveur).
- Serveur : `/api/nexus/sysinfo` renvoie CPU/RAM/disque/uptime ; nouvelle route `POST /api/nexus/widget` → event `nexus:widget`. Nexus : disque dans sysinfo + handler `nexus:widget`.
- APK v1.4.0 (versionCode 17) : nouvelle icône, fond #050b1a.

## 2026-10-17 (8) — Nouveau design de la page VOIX (style Nexus holographique)
- `VoiceScreen.tsx` : fond bleu nuit + **sphère neuronale 3D** animée (110 nœuds, liaisons, cœur lumineux) qui gonfle/ondule avec la voix, anneaux HUD qui tournent, grille au sol en perspective, particules de données.
- Teinte selon l'état : veille cyan, écoute turquoise, analyse violet (rotation rapide), réponse bleu.
- Libellé d'état (EN VEILLE / ÉCOUTE / ANALYSE / RÉPONSE), réponse dans une carte en verre, raccourcis rapides (agenda, mails, réservations, mon PC).
- Dock en verre en bas : caméra · gros micro avec anneau réactif · scan. Canvas net en haute densité (DPR) et adapté à la taille de l'écran.
- Logique inchangée (micro, appel, caméra, scan, mains libres, conversation continue).

## 2026-10-17 (7) — Caméra du téléphone → Nexus (widget en direct, vision, photos/vidéos rangées sur le PC)
- App : nouvel écran **CAMÉRA → PC** (`PhoneCamScreen.tsx`) : « Montrer à Nexus » envoie ~3 images/s, boutons photo / vidéo 10 s /
  retourner, et usages en un geste (état voiture, lire document, permis/CNI, plaque/km, voyant, ticket/facture, identifier) :
  Nexus regarde, répond (lu à voix haute) et range la photo.
- Backend `api/routes/phonecam.ts` (Kouider seulement, limite à part) : `/frame`, `/media`, `/ask`, `/stop` ;
  `/api/nexus/data/phonecam-cmd` pour les ordres de Nexus vers l'app. Ancien `/api/vision/relay-frame` sans auth retiré.
- Nexus `modules/phonecam.py` : widget « CAMÉRA TÉLÉPHONE · LIVE » (holo.js), « tu vois ça ? » = vision sur l'image du téléphone
  quand elle est ouverte, « prends-la en photo » / « filme 15 secondes » → l'app capture en pleine qualité → Images/Dzaryx Caméra/<date>/.
  Outils agent : `phone_camera`, `look_phone_camera`, `phone_media` (réafficher en widget ou renvoyer sur Telegram).

## 2026-10-17 (6) — Dzaryx : bugs trouvés dans les échanges du 14 au 17/10
- « je n'ai pas d'outil WhatsApp / pour supprimer un événement / pour programmer l'appel » : l'agent choisi selon les mots
  (Réservations, Finance…) ne voyait QUE ses outils. `claude-api.ts` : ses outils sont « préférés », tous les autres restent
  trouvables par la recherche d'outils. `delete_agenda_event` ajouté aux outils toujours chargés.
- « ⚠️ Je n'ai pas exécuté cette action » renvoyé 3 fois de suite (« oui envoie-lui », « envoie-moi le reçu Anthropic ») :
  `orchestrator.ts` relance maintenant Claude une fois en l'obligeant à vraiment appeler l'outil (comme pour les chiffres).
- Appels pour des créneaux perso (« Temps famille », « Libre — RDV possibles », « Belgique — travail ») : `meeting-prep.ts`
  ignore les blocs perso sans participant, et n'appelle plus si la fiche ne trouve aucun interlocuteur (« ORAL: AUCUN »).
- « Je suis pas dispo, rappelle-moi à 11h » puis appels à 9h30 et 9h41 : call_me programmé = ne pas déranger jusqu'à l'heure dite
  (`autocall:quiet_until`, appels non urgents mis en file, pas de 2e essai d'appel manqué) ; nouvel outil `pause_calls`
  (« ne m'appelle pas avant 14h », « je suis en réunion »).

## 2026-10-17 (5) — Nexus : il entend, se souvient, ouvre les bons dossiers, fait un vrai ménage, affiche tout en widgets
- Micro : `modules/mic.py` — sounddevice quand PyAudio manque (PyAudio n'a pas de paquet pour Python 3.13/3.14 → Nexus
  n'entendait rien). Mot « Nexus » + bouton micro passent par là. requirements : audioop-lts / standard-aifc (Python 3.13+).
- Mémoire : l'agent PC recevait chaque message seul (`messages=[instruction]`) → il repartait de zéro. Il reçoit maintenant
  les 16 derniers échanges. Modèle Sonnet 5.5 (au lieu de Haiku), 14 étapes max (au lieu de 6), repli Haiku si indispo.
- Dossiers : `find_folders()` cherche par nom approché (Bureau réel OneDrive ou non, Documents, Téléchargements, Images,
  Vidéos, OneDrive) ; « ouvre le dossier factures » trouve « Factures_2026 ». Fini « cherche… » = Google et « écoute… » = Spotify.
- Ménage : `modules/cleaner.py` — temp utilisateur + Windows, caches Chrome/Edge/Brave/Opera/Firefox, Discord/Spotify/Teams/
  CapCut/pip/npm, caches DirectX/NVIDIA/AMD, rapports de plantage, Windows Update installé. Fait directement sur
  « nettoie le PC », puis propose la corbeille (« oui » à la voix). « vide la corbeille » direct.
- Widgets : outil `show_widget` de l'agent (texte, liste, tableau, infos, image, vidéo) → widgets holographiques déplaçables ;
  réponses longues affichées aussi en widget ; « ferme les widgets ».

## 2026-10-17 (4) — Nexus : interface holographique façon JARVIS v10 (2e vidéo TikTok)
- `nexus/gui/holo.js` (nouveau) : sphère neuronale 3D (three.js, 1 500 neurones + synapses) qui respire en veille,
  pulse quand Nexus parle, se tord en ruban quand il réfléchit ; « sphère bleue / verte / violette », « ancien affichage ».
  Horloge HUD encadrée (météo + disque), terminal de sous-titres tapés à la machine, bandeau orange « VOUS : … », bouton ⏹ stop.
- Widget mails holographique déplaçable : « montre mes mails » (boîte pro, lecture seule via `/api/nexus/data/emails`),
  « ouvre le deuxième / le mail de Booking », « retour à la liste », « ferme les mails ».
- Contrôle à la main par la webcam (MediaPipe, dans la page) : « active le contrôle gestuel » ou bouton ✋ ;
  index = curseur, pincer = cliquer / attraper un widget / faire défiler / tourner la sphère ou le globe,
  deux mains pincées = zoom, balayage main ouverte = fermer le widget / caméra suivante.
- Globe : mini-sphère dans le coin, bandeau de caméras par catégorie (« caméras de plage », « de montagne en Suisse »,
  onglets Plage/Ville/Montagne/Port/Trafic… ; Windy via le backend), « affiche les caméras du monde » (liste cliquable).
- Backend : `/api/nexus/data/webcams` (clé Windy côté serveur : variable Railway `WINDY_WEBCAMS_KEY`).

## 2026-10-17 (3) — Nexus : globe 3D façon JARVIS (vidéo TikTok) + vols vers une ville + caméras du monde
- `nexus/modules/globe.py` + `nexus/gui/globe.html` (CesiumJS, calque du HUD) : « montre le globe », « fais-le tourner »,
  « vue satellite », « va sur Oran », avions en direct, séismes (USGS), satellites + orbite ISS (CelesTrak), météo/heure locale.
- Look holo : continents néon dessinés (Natural Earth) sur bleu nuit, aurore boréale animée, intro « NEXUS » ;
  en zoomant, fondu vers la vraie image satellite en couleurs.
- « Y a-t-il des avions qui vont vers Oran ? » / « les vols qui partent d'Alger » : OpenSky + routes adsbdb →
  widget à droite (compagnie, départ → arrivée, altitude, vitesse, distance, arrivée ≈ HH:MM), trajectoires sur le globe.
- « Montre les caméras à Londres » : caméras publiques officielles (TfL Londres, Caltrans Californie, Digitraffic
  Finlande ; monde entier avec `WINDY_WEBCAMS_KEY` gratuite dans nexus/.env) → widget sous le globe (◀ ▶ agrandir),
  position sur le globe (faisceau). « ouvre la caméra » reste la webcam du PC.
- Serveur HTTP local de Nexus passé en multi-thread (une requête lente ne bloque plus le HUD).

## 2026-10-17 (2) — Chat app : photo « invisible » pour Dzaryx corrigée
- `TextScreen.tsx` : « modifie ma photo, crée une image de moi… » était pris pour « créer une annonce avec photos »
  (le mot « crée » suffisait) → photo rangée pour une annonce, pas envoyée en vision → Dzaryx disait ne rien recevoir.
  Nouvelle règle `isImageEditIntent` (image, retouche, vidéo, « de moi », ultra réaliste…) → toujours vision ;
  « créer » ne déclenche une annonce que s'il parle de voiture / bien / annonce. sw v152.

## 2026-10-17 — STUDIO VIDÉO (vidéos IA niveau Higgsfield, sans Higgsfield)
- `marketing/video-studio.ts` : idée → scénario viral (Claude) → plans IA réalistes via fal.ai (Kling 3.0 Pro,
  Veo 3.1 / Veo 3.1 Fast, Seedance 2.0), effets caméra (drone, FPV, travelling, 360°, zoom rapide, ralenti…)
  → montage ffmpeg 1080×1920 : transitions, voix off ElevenLabs (FR/darija/arabe), sous-titres mot par mot
  (style CapCut), accroche, CTA, logo, musique IA (CassetteAI), volume TikTok (-14 LUFS)
  → Supabase `videos/studio/` + Telegram (tgcall document) + notification app. Coût estimé avant, coût réel noté.
- Route `/api/studio` (options, plan, render, jobs) ; outil Dzaryx `video_studio` (plan → accord → render → status).
- App : page 🎬 STUDIO VIDÉO (Kouider) : vidéo virale complète ou plan unique, photo de la flotte, scénario modifiable,
  choix du modèle avec prix, suivi du rendu, lecteur + téléchargement + légende à copier. sw v151.
- `generate_ai_video` / `animate_car_photo` : Kling 1.6 standard → Kling 3.0 Pro.

## 2026-10-16 (4) — Mails : pièces jointes, conversation entière, réponse à tout mail, rangement, résumé du soir
- `read_email` liste les pièces jointes ; `read_email_attachment` lit PDF (texte, sinon Claude), images (Claude), texte,
  et peut envoyer le fichier sur Telegram (lien temporaire `/api/pdf/:token` → `tgcall` `send_document`).
- `read_email_thread` : tout l'échange (citations retirées) + qui a écrit en dernier.
- `draft_email.reply_to_email_id` : répondre dans le même fil à n'importe quel mail (pas seulement les prospects).
- `manage_emails` : lu / non lu / archiver / corbeille / remettre en boîte, par IDs ou recherche. Scope `gmail.modify`
  ajouté → reconnecter la boîte une fois (lien connect_gmail).
- `mail-digest.ts` : 20h (Bruxelles) résumé Telegram + app : importants du jour, réponses prospects, sans réponse ≥ 3 j ;
  rien d'important → pas de message.

## 2026-10-16 (3) — Ordres exécutés pour de vrai avant de rappeler
- `integrations/call-tasks.ts` : `call_me` + `task` → le travail démarre tout de suite (business plan via le conseiller
  business, sinon agent lecture seule avec recherche web), résultat écrit sur Telegram/app, et dit à l'oral au rappel
  (`reminder-worker` → `callTaskReason`). Travail perdu (redémarrage) → refait juste avant d'appeler. Avant : « rappelle-moi
  dans 1h avec un business plan » programmait un appel vide.
- Consigne ORDRES dans la voix temps réel ; `keepMentorIdea()` ; greeting d'appel jusqu'à 1200 caractères.

## 2026-10-16 (2) — WhatsApp : bonne discussion, qui a écrit, répondu ou pas
- `cloudpc/whatsapp_web.py` : `_open_chat` vérifie le titre de la discussion ouverte (avant : la discussion précédente
  restait affichée → messages d'un autre client) + vrai clic souris ; lecture : attend le chargement complet, remonte
  l'historique, expéditeur selon le côté de la bulle (les coches ne sont que sur la 1re bulle d'une série), dates des
  séparateurs, notice de chiffrement ignorée, messages supprimés, documents hors écran affichés, liens, message cité.
- `integrations/whatsapp-web.ts` : `waConversationText()` — du plus ancien au plus récent, CLIENT / TOI / RÉPONSE AUTO
  (message d'accueil WhatsApp Business), statut « déjà répondu » ou « pas encore répondu → propose une réponse » ;
  listes unread/récentes indiquent qui a écrit le dernier message.

## 2026-10-16 — Appels : reconnaissance de la voix, confidentialité, famille, chant, recherche web
- `tgcall/speaker.py` : empreinte vocale locale (sherpa-onnx + modèle 3D-Speaker CAM++ `tgcall/models/spk.onnx`, empreintes
  dans `tgcall/voiceprints/`, non versionnés). Kouider s'apprend tout seul (ses vocaux Telegram non transférés + appels
  reconnus ; 1er appel qu'il passe lui-même tant qu'aucune empreinte n'existe). « code secret … » sur Telegram = code de
  secours (haché, message effacé).
- `tgcall/realtime.py` : avec une empreinte connue, l'appel démarre en mode « qui parle ? » (accueil neutre, pas de réponse
  auto, motif / messages en attente retenus) ; Kouider reconnu → consignes complètes + motif ; sinon consignes invitées
  (aucune info business, outils bloqués sauf web_search / call_back_later / leave_message / learn_voice / verify_code /
  end_call). Re-vérification toutes les 4 s de parole (téléphone passé à Fatima ou repris par Kouider).
- `tgcall/dzaryx_tg.py` : outils call_back_later (rappel avec le vrai motif, jamais dit à la personne), leave_message,
  learn_voice (Fatima apprise quand elle se présente), verify_code ; apprentissage de la voix en fin d'appel.
- `routes/call.ts` : `guestInstructions()` (famille, Fatima chaleureuse, confidentialité), `HUMAN_RULES` (chanter
  vraiment une berceuse, web_search en parallèle de la conversation, discuter comme un ami), web_search en lecture rapide ;
  `/api/call/realtime` renvoie `instructions` + `guestInstructions`. `kouider-dossier.ts` : `familyText()`.
  `call-memory.ts` : `speaker` sur les lignes (résumé dit qui a décroché).

## 2026-10-15 (15) — Routine du matin, départs avec trafic, voyages + check-lists
- `integrations/morning-routine.ts` : sport chaque matin sauf jeudi (ouverture 6h30), douche + petit-déj ; message de réveil
  + motivation (Fatima, Ibrahim, santé, business, mental, citation) à l'heure du réveil ; pas de réponse → appel à +7 min,
  rappel +20 min. Pause/vacances/réglages : outil `morning_routine`. Séries « 🏋️ Sport », « 🚿 Douche » créées dans l'agenda
  FIK + adresses sur « ✈️ Belgique — travail » et « 🏠 Maison » (une fois, flag `routine:calendar:v1`).
- `integrations/departures.ts` (job departure-watch */5) : pour chaque RDV de l'agenda avec adresse, heure de départ selon
  le trafic Google, message 15 min avant, appel si pas parti (GPS Telegram en direct, sinon pas de réponse).
- `integrations/trips.ts` : outil `travel` (billet → vol + « être à l'aéroport » dans l'agenda, check-list, pause routine),
  check-lists clients auto (début/fin de location), rappels 19h30 dès J-5, appel J-2 ; billets dans la boîte pro importés
  (flight-mail-import */15). Appel de veille 18h : ajoute ce qui manque à la check-list client.
- tgcall : position (et position en direct) → `/api/call/location` ; PDF reçus → texte → Dzaryx.

## 2026-10-15 (14) — Agenda FIK réorganisé (3 h libres / jour) + créneaux RDV
- Séries renommées pour le bonhomme : « ✈️ Belgique — travail », « 🏢 Agence FIK — business Algérie », « 🏠 Maison — temps famille ».
- Raccourcies (business + famille seulement, travail inchangé) pour libérer 3 h/jour → séries « 🟢 Libre — RDV possibles »
  (transparentes, Europe/Brussels) : jeu 16-19 ; ven/sam/mar 10-12 + 20-21 ; mer 11-13 + 20-21 ; dim 9-10, 18-19, 20-21 ; lun 12-15.
- `findFreeSlots` propose d'abord ces créneaux (1 RDV/jour, hors congés lun/jeu et ven/sam) → autopilot prospects, FIK Sites, page RDV.
- `update_agenda_event` whole_series / `PATCH /api/calendar/agenda/:id {series:true}` ; `/add` accepte recurrence/transparent/timeZone.
- Carte : « Belgique » → aéroport, « Agence » / « Libre » → agence. SW v150.

## 2026-10-15 (13) — Dzaryx : agenda FIK seulement, jamais l'agenda perso
- Décision Kouider : Dzaryx n'accède QU'À l'agenda FIK (fikconciergerie@gmail.com). Supprimé : tout accès à kouiderpablo@gmail.com
  (outils *_personal_event, contexte « AGENDA PERSO », préparation des RDV, agenda en appel, /calendar/all, freeBusy, RDV FIK Sites).
- Nouveaux outils sur l'agenda FIK : `list_agenda_events` (jour/période, heure, lieu, id), `create_agenda_event` (heure + lieu),
  `update_agenda_event` (date ET heure), `delete_agenda_event` ; « pas d'accès » dit clairement. Les RDV FIK Sites vont dans l'agenda FIK.
- Carte : le bonhomme lit l'agenda FIK (`/api/calendar/me`, `PATCH|DELETE /api/calendar/agenda/:id`). SW v149.

## 2026-10-15 (12) — Agenda perso Dzaryx + bonhomme Kouider + vrais avions
- Backend : `update_personal_event` (modifier un RDV perso), `list_personal_events` par jour/période avec les id + lieu,
  `create_personal_event` avec lieu ; si Google refuse → message « pas d'accès » + marche à suivre (avant : « agenda vide »).
  `personalCalendarAccess()`. Routes `GET /api/calendar/me`, `PATCH|DELETE /api/calendar/personal/:id` (Kouider seulement).
  Constat prod 2026-10-15 : kouiderpablo@gmail.com N'EST PAS partagé avec id-ibrahim-calendar@ibrahim-493817.iam.gserviceaccount.com.
- Carte : bonhomme de Kouider (polo FIK) qui marche vers le lieu de son RDV (mots-clés aéroport/garage/banque…), maison la nuit,
  plage les jours de repos ; bulle = RDV en cours / suivant ; fiche = agenda 7 jours perso + FIK, ajouter/modifier/supprimer,
  « Organise ma journée ». Avions de ligne réalistes (fuselage, ailes en flèche, réacteurs, dérive, hublots, train, feux de
  navigation + strobe), vraie trajectoire roulage/décollage/tour/atterrissage avec inclinaison ; balisage de piste ; passerelle ;
  ferry Oran ⇄ Espagne qui arrive/reste à quai/repart. SW v148 (gh-pages publié).

## 2026-10-15 (11) — Carte live : voitures qui bougent + ambiance sonore
- Mission « Remettre » validée → la voiture sort du parking (allée, sortie, avenue) puis roule en ville ; « Récupérer »
  validée → elle rentre se garer. L'affichage du jour tient compte des missions faites (`shown` dans CarteScreen).
- `sfx.ts` : ambiance synthétisée (vagues en houle, circulation, mouettes/klaxons le jour, grillons la nuit, pluie si
  météo pluvieuse), démarre au 1er toucher sur la carte, suit jour/nuit (`scene.mood()`), coupée par 🔊 ou app en arrière-plan. SW v147.

## 2026-10-15 (10) — Carte live : graphisme réaliste + nouveautés
- `scene.ts` : rendu PBR (MeshStandard, tone mapping ACES, reflets d'environnement sur carrosseries/vitres/mer), halo des
  lumières la nuit (bloom), MSAA ; textures procédurales (herbe, asphalte, béton, sable), façades avec fenêtres allumées au
  hasard la nuit, citernes et clims sur les toits ; arbres en feuillage ; trottoirs, passages piétons, marquage, feux tricolores.
- Nouveautés : mosquée avec minaret, mouettes au port, parapluies quand il pleut, feu d'artifice (journée parfaite / fin de
  visite si tout est fait), panneau LED défilant sur l'agence (CA du mois, libres, départs, retours) visible au zoom. SW v146.

## 2026-10-15 (9) — Carte live v2 : réaliste, missions du jour, visite guidée
- `scene.ts` : vraie heure d'Oran (lever/coucher calculés, ciel, soleil qui tourne, nuit avec fenêtres allumées, lampadaires,
  phares, faisceau du phare) ; vraie météo Open-Meteo (pluie, orages avec éclairs, brouillard, nuages, vent sur les vagues) ;
  mer animée ; voitures réalistes (citadine/SUV/utilitaire selon le modèle, vraie peinture, jantes qui tournent, virages doux),
  statut = anneau au sol ; noms des voitures au zoom ; flèches dorées sur les missions ; pluie de pièces quand une mission est faite.
- `Missions.tsx` : missions du jour (remettre/récupérer, encaisser, urgences, demandes, voiture qui dort) + XP, niveaux, série de
  journées parfaites (sur l'appareil). Paiement/urgence réglés ailleurs → mission réussie toute seule.
- `CarteScreen.tsx` : ▶ Visite guidée (caméra + voix), 🕒/☀️/🌙, 🔊 sons (`sfx.ts`), heure + météo sur la carte. SW v145.

## 2026-10-15 (8) — Bilan mensuel FIK Sites, mode économie Claude, rendez-vous en 1 clic
- `client-site-stats.ts` : compteur sans cookie dans les vrais sites (visite/session, clics Appeler, Itinéraire, WhatsApp →
  `POST /api/client-sites/public/:id/hit`, compteurs Redis `fiksite:stats:*`). Job `client-sites-monthly` le 1er à 10h : bilan
  du mois au patron par mail + résumé à Kouider avec une idée de vente par site. Outil manage_client_site : `stats`, `send_report`.
  SITE_VERSION 2 : les anciens sites sont republiés par le job du matin (compteur).
- `anthropic-compat.ts` : mode économie (app_kv `billing:eco`, ON par défaut) : appels NON streamés Sonnet → Haiku, sauf
  `QUALITY` (mails prospects, conseiller business, inspections), réflexion ou outils serveur. Interrupteur page À PAYER / outil billing.
- `rdv-booking.ts` + `/rdv/:token` : lien signé dans le mail de démo (et les réponses proposées) → vrais créneaux libres →
  RDV dans l'agenda perso, mail de confirmation, alerte app + Telegram + appel. App SW v144.

## 2026-10-15 (7) — « À PAYER » : étiquettes OBLIGATOIRE (Railway seul) / FACULTATIF / GRATUIT · INDISPENSABLE + encadré « minimum obligatoire » (SW v142)

## 2026-10-15 (6) — « À PAYER » + Dzaryx ne meurt jamais tant que Railway est payé
- `backend/src/integrations/billing.ts` (nouveau) : liste des services (vital/important/optionnel, ce qui casse si pas payé, lien
  pour payer). Railway lu en direct (GraphQL : facture en cours + date), domaine lu en direct (RDAP, Name.com, expire 2027-06-03),
  Claude : crédit épuisé détecté + solde estimé depuis la dernière recharge (compteur `claude:spend:total_usd`). Tâche 10h
  `billing-watch` : J-30 (domaine), J-7, J-3, J-1, J0, retard → app + Telegram, appel la veille pour les services VITAUX.
  Outil `billing` (list / paid / set). API `/api/billing`. Page app 💳 À PAYER (SW v141).
- `anthropic-compat.ts` : crédit Claude épuisé / clé coupée → TOUS les appels non streamés (tâches de fond) passent sur
  Groq → Gemini → OpenAI (format traduit, outils compris), revérif de Claude toutes les 10 min, fin auto quand Claude remarche.
  Le chat streamé garde son repli agentique (orchestrator). Testé en simulant « credit balance is too low ».

## 2026-10-15 (5) — WhatsApp seulement après une réponse au mail de démarchage
- `backend/src/integrations/prospect-whatsapp.ts` (nouveau) : un prospect répond (oui à la démo, question, RDV) et a un mobile
  BE/FR/DZ → Dzaryx prépare un court message pour continuer sur WhatsApp. Jamais de 1er contact automatique (risque de ban du numéro).
  Envoi seulement après validation : bouton « 📤 Envoyer » (page Démarchage, via le PC cloud) ou outil `whatsapp_web` (relecture + oui).
- App (SW v140) : section WhatsApp ouverte aux prospects qui ont répondu ; « ✓ Envoyé » ne remet plus le statut à « contacté ».
- App (SW v139, 557b540) : choix Sites web / Conciergerie / Les deux, villes réglables, filtre 🌐.

## 2026-10-15 (4) — Démarchage « sites web » (FIK Sites) en Belgique, France, Algérie
- `backend/src/integrations/site-prospecting.ts` (nouveau) : Google Places → commerces SANS vrai site (Facebook/Insta seuls = cible),
  e-mail public trouvé sur le web et vérifié (jamais deviné). Rotation villes BE/FR/DZ × 20 métiers. 1er mail = proposition de démo
  gratuite uniquement ; démo faite (`buildDemo`) et envoyée SEULEMENT après un « oui », avec la liste de ce qui a été inventé
  (remplacé par ses vraies infos dans la version finale) + créneaux de RDV. Relances courtes, réponses → proposées à Kouider.
- `prospect-autopilot.ts` : mode `sites` (défaut) / `conciergerie` / `both` ; outil `prospect_autopilot` : set_mode, set_cities, retry_demo.

## 2026-10-15 (3) — Dzaryx envoie vraiment sur WhatsApp
- `backend/src/integrations/claude-api.ts` : `whatsapp_web`, `business_mentor`, `kouider_dossier` ajoutés aux CORE_TOOLS (ils étaient cachés derrière la recherche d'outils → Dzaryx répondait « pas d'outil WhatsApp »).
- `backend/src/integrations/tool-executor.ts` + `tools.ts` : `send_whatsapp_to_client` (Twilio coupé) → passe par `whatsapp_web` send (relecture puis confirmed).
- `cloudpc/whatsapp_web.py` : nouveau DOM WhatsApp Web (`[data-testid^=conv-msg-]`, coches msg-check) → `read` et la vérif de `send` marchent. Premier envoi réel OK (+33 6 50 11 24 04, 07:26).

## 2026-10-15 (2) — WhatsApp Business sur le PC cloud | b301d40

- web.whatsapp.com dans le Chrome du PC cloud (appareil connecté, code par numéro). Nouveaux messages non lus → réponse
  proposée par Dzaryx (vraies dispos/prix via outils de lecture) → app + Telegram ; appel si demande de location ou
  situation délicate. Outil `whatsapp_web` : lire, réponses en attente, envoyer APRÈS accord (relecture obligatoire). Voir `cloudpc/A_LIRE.md`.

## 2026-10-15 — Conseiller business, dossier « qui est Kouider », jours de congé, appels situations délicates

- **Conseiller business** (`integrations/business-mentor.ts`) : chaque jour travaillé à 11h30 (Bruxelles), Dzaryx analyse les
  données FIK + le web et APPELLE Kouider avec UNE proposition (idée, projet, plan, contact, risque, opportunité), chiffrée.
  Détail écrit sur Telegram + app. Outil `business_mentor` : new (focus) / history / show / paper (business plan Google Docs) /
  execute (mission de suivi chaque mercredi 10h) / reject. Historique `app_kv mentor:history` (pas de répétition).
- **Veille actu** (job `mentor-news`, 8h + 17h) : risque/opportunité nouveau → message ; URGENT → appel.
- **Dossier Kouider** (`integrations/kouider-dossier.ts`) : portrait réécrit chaque nuit 3h30 (mémoire, règles, messages,
  appels), donné au chat et aux appels. Outil `kouider_dossier` (show / add / days_off).
- **Jours de congé lundi + jeudi** : `autoCall(..., { level: 'normal' })` gardé pour le jour travaillé suivant (papiers,
  objectifs, prospects, vidange, anniversaires) ; urgences toujours. Récap 10h court et seulement s'il y a des départs/retours/retards.
  Conseiller sauté ces jours-là. `season-watch` déplacé au mardi.
- **Situations délicates WhatsApp** (plainte, accident, panne, police, vol…) → appel urgent.
- Testé : génération réelle d'une proposition (Toussaint, parc vide, relance clients diaspora), dossier réécrit (2,6 k car.).

## 2026-10-14 (soir 12) — PC cloud : fichiers, copier-coller, onglets, surveillance de pages, tâches programmées | 8f6b60f →, app SW v137

- Fichiers (envoi du téléphone, téléchargements → Drive + notification, Telegram en document, LibreOffice FR), presse-papiers,
  onglets, zoom, capture → Telegram, lien « Regarder » des notifications (`nexus-cloud`), outils `watch_page` + `web_routine`
  (jobs `cloud-watch`, `cloud-routines`), routes PC réservées à Kouider. Détails : `cloudpc/A_LIRE.md`.
- Testé en production : vrai téléchargement (.docx) → Drive, envoi/lien/suppression de fichier, presse-papiers (accents),
  lecture de page en arrière-plan, surveillance + tâche programmée créées par Dzaryx (puis supprimées), app 390 px.

## 2026-10-14 (soir 11) — PC cloud toujours allumé | ad86be8 → 691f79b, app SW v136

- **PC cloud** (VPS) : bureau virtuel Xvfb + openbox + Google Chrome (profil gardé), agent `cloudpc/agent.py` (namespace `/cloudpc`), pm2 `dzaryx-cloudpc-desktop` / `dzaryx-cloudpc`. Voir `cloudpc/A_LIRE.md`.
- **App MON PC** : choix 💻 Laptop / ☁️ PC cloud (auto si le laptop est éteint), adresse + sites, clavier navigateur, « Demande à Dzaryx », relancer Chrome. Routes `/api/nexus/live/*` + `target:'cloud'`, `/targets`, `/open`, `/restart-browser`.
- **Dzaryx** : outil `cloud_pc` (status/open_url/read_page/tabs/restart_browser) ; `browser_task` tourne dans le Chrome visible (browser-worker en CDP, `BROWSER_CDP_URL`) ; Nexus hors ligne → propose le PC cloud ; auto-test vérifie le PC cloud.
- **Sauvegarde Drive** : API activée par Kouider → 1re sauvegarde OK (92 tables).
- Testé en production : téléphone 390 px (page ouverte, direct, toucher = clic), outil cloud_pc via Dzaryx, browser_task réel (Wikipédia Alger) dans le Chrome visible.

## 2026-10-14 (soir 10) — Sauvegardes, auto-test, saisons, apprentissage des méthodes, Nexus plus solide | 5cde7bf → 8fbbd72

- **Bug (B035)** : tous les messages Telegram à Dzaryx (texte, vocal, photo) plantaient — `send_chat_action` attend `enums.ChatAction`, pas une chaîne. Corrigé (`5cde7bf`).
- **Sauvegardes** (`integrations/db-backup.ts`) : les 92 tables en `.json.gz`. VPS : cron 3h30 `scripts/backup-local.ts` → `/root/backups/db` (30 gardés) + copie des photos/documents Storage (`/root/backups/storage`, 221 fichiers, 147 Mo). Railway : job `db-backup` 3h → Drive pro « Dzaryx — Sauvegardes » — **bloqué tant que l'API Google Drive n'est pas activée** dans le projet Google 1041982301741. Restauration : `scripts/backup-restore.ts` (aperçu, `--yes` pour écrire, `--table`).
- **Auto-test** (`integrations/self-test.ts`) : job `self-test` 7h45, ~23 vérifications en lecture seule (base, Claude + secours, 16 outils, Gmail, agenda, sauvegardes, tgcall + ses erreurs, tâches auto, Nexus). Message seulement si problème (+ résumé le lundi). Outil `run_self_test` (full / last / backup / backup_now). tgcall remonte ses erreurs dans le battement (`app_kv tgcall:errors`).
- **Saisons** (`integrations/seasons.ts`) : vacances FR/BE 2026-27, été diaspora, Ramadan/Aïd/Mawlid (Umm al-Qura, ±1 j), fêtes nationales + remplissage réel du parc et conseil prix. Outil `get_upcoming_seasons`, job `season-watch` lundi 9h15 (J-42 / J-14).
- **Apprentissage** : la relecture des conversations voit aussi les outils utilisés → retient une méthode qui a marché (≥ 3 outils + Kouider satisfait) et améliore une méthode corrigée (idée Hermes Agent).
- **Nexus** : chaque partie sous surveillance (une exception ne coupe plus tout), mot « Nexus » sans PyAudio ne boucle plus, PyAudio installé par la mise à jour à distance, `rester-joignable.bat`. Testé sur le VPS contre le backend local : connexion, ping, sysinfo, exec, reconnexion.
- **Ouedkniss** : bloqué depuis le VPS (« problème de chargement », même avec un vrai navigateur) → à faire depuis Nexus (IP du PC).

## 2026-10-14 (soir 9) — Carte live : barre de temps, argent, état des lieux, commandes vocales | app SW v135

- **Barre de temps** : 14 jours, une colonne par jour (part du parc dehors, voitures libres, rouge = complet). Toucher un jour → la ville 3D passe à ce jour (départs, retours, parking). L'atelier reste l'état actuel.
- **L'argent du mois** (‹ › pour changer de mois) : chiffre d'affaires, bénéfice, reste à encaisser, top 3 et voitures qui dorment. Même règle que finance.ts : jours inclus, bénéfice = (prix client − prix propriétaire) × jours uniquement si owner_price_per_day est saisi sur la location, sinon « inconnu ». Bouton 💶 : étiquettes argent au-dessus de chaque voiture.
- **Fiche voiture** : ligne argent du mois + 📸 état des lieux départ/retour (InspectionModal réutilisé). Nouveau dégât au retour → un toucher : voiture en réparation (🔧 Carrosserie : …) + rappel J+2 ; ✨ coût + message client.
- **Voix** : `update_car` accepte `state` (disponible/reparation/indisponible) + `reason` ; nouvel outil `update_import_status` (client/véhicule/réf → étape REQUESTED…DELIVERED + note, via /api/update-import-order du site).

## 2026-10-14 (soir 8) — Carte live 3D : tous les métiers, tout modifiable | app SW v134

- **Carte en vraie 3D (three.js)** — `simulator/src/components/carte/scene.ts` : agence, parking location agrandi,
  atelier, ville, **vente auto** (showroom + parking), **port d'import** (bateau), **immobilier**, packs séjour,
  aéroport & conciergerie, entreprises (B2B), FIK Sites. Nouveautés animées (voiture/bien/import ajouté).
- **Plein écran** (⛶) + **🔗 PC** : lien `?carte=1` pour ouvrir la carte sur le PC/TV (rafraîchie chaque minute).
- **Fiche voiture modifiable** (`carte/CarSheet.tsx`) : état dispo / réparation / indispo + motif, location en cours
  (tout payé, prolonger, terminer), km, vidange, assurance, CT, vignette, notes, **rappels datés** (Telegram + app).
  Backend : champs entretien dans `PATCH /api/cars/:id` + `/api/cars/:id/reminders`.
- **Fiche modifiable pour tous les autres métiers** (`carte/ItemSheet.tsx`) : vente auto (statut en vente/réservé/vendu,
  prix, km), immobilier (louer/vendre, loyer, locataire, statut, supprimer), imports (étapes Demande → Livré,
  véhicule, budget, pays, notes internes), packs, demandes de l'agence (accepter/refuser, en cours/conclu).
  Bouton ➕ dans chaque zone pour ajouter. Euro par défaut, dinar au choix.
  Backend : `POST /api/demandes/update` accepte `patch` (import) ; `GET /api/demandes` renvoie `fields` des imports.
- **Ajouter des locations** (`carte/AddRentals.tsx`) : une par une ou en lot depuis un texte/photo du carnet
  (`POST /api/bookings/import/parse`, `integrations/bookings-import.ts`, acomptes compris).
- **Offre FIK « Carte live »** : démo publique personnalisée (`?demo=carte&k=…&n=…`) + outil Dzaryx `carte_live_demo_link`.

## 2026-10-14 (soir 7) — Carte live : le parc vu comme un jeu | app SW v133

- **Nouvel écran 🗺️ CARTE LIVE** (Plus → CARTE LIVE, Kouider seul) — `simulator/src/components/screens/CarteScreen.tsx`.
  Ville isométrique en SVG (agence AutoLux, parking, atelier, ville, mer) ; chaque voiture est placée selon son
  statut réel : dispo/départ du jour → parking, louée/retour du jour → en ville, indispo sans résa → atelier.
  Position symbolique (pas de GPS). Pastilles : ! (rappel HIGH), € (à encaisser), ↩ retour, 🔑 départ.
- Toucher une voiture → la caméra zoome dessus + fiche (client, dates, montant dû, alertes, WhatsApp, appel,
  « Demander à Dzaryx » → chat via `dz:ask_prompt`). Zoom +/−/⤢ et glisser pour se déplacer.
- Jauge de la journée (dehors/total, départs, retours, à encaisser), filtres par statut, panneau Assistant
  (rappels `/api/bi/reminders` + bouton Briefing du jour).
- Données : `/api/cars`, `/api/bookings?limit=300` (`business.fetchBookingsWindow`, `car_id` ajouté au type),
  `/api/bi/reminders`, `/api/insights/today`. Aucun changement backend.

## 2026-10-14 (soir 6) — FIK Sites : « Ouvrir son espace (moi) » + guide domaine copier-coller | app SW v132

- **Accès FIK à l'espace client** : bouton 🔓 « Ouvrir son espace (moi) » dans la fiche du site → POST
  `/api/fik-sites/:id/open-admin` → `openAsStaff()` : session `staff` de 2 h (jeton dans le #fragment, gardé en
  sessionStorage), le mot de passe du patron et ses connexions ne changent pas. Bandeau « Mode FIK Conciergerie »,
  carte mot de passe masquée (et refusée côté API). `ADMIN_VERSION`/`adminV` : les anciennes pages /admin/ sont
  republiées automatiquement à la première ouverture.
- **Bloc Nom de domaine** : 4 étapes expliquées (acheter → brancher → zone DNS → attendre), chaque valeur DNS avec
  bouton Copier (`dnsTarget` dans l'overview), + « Copier le message pour le client » prêt pour WhatsApp.

## 2026-10-14 (soir 5) — FIK Sites étapes 3 à 6 + page « Sites clients » dans l'app | app SW v131

- **Étape 3 — domaine** : `manage_client_site` domain / domain_check / domain_remove. Netlify `custom_domain` + alias www,
  réglages DNS (A @ → 75.2.60.5, CNAME www → <site>.netlify.app), vérif DNS + certificat https (POST /sites/:id/ssl),
  vérif quotidienne. `publicUrl()` = domaine actif sinon netlify.app (`url` garde toujours l'adresse netlify.app).
- **Étape 4 — formulaire** sur chaque vrai site (`renderHtml` opts.formApi, `formKind`) : réservation de table
  (restaurant/café/bar/hôtel), rendez-vous (coiffure/beauté/garage/santé), sinon message. POST public
  `/api/client-sites/public/:id/message` (piège à robots, < 2,5 s ignoré, 5/10 min par IP, 60/jour par site) →
  app_kv `fik:msgs:<id>`, e-mail au patron (boîte pro, Reply-To = visiteur ; `sendEmail` accepte `replyTo`),
  copie Telegram à Kouider en option (`notify`), rubrique « Réservations et messages » dans l'espace client.
- **Étape 5 — abonnements à la main** : billing (prix, monnaie, payé jusqu'au, pause auto + délai), paid (mois,
  montant, note → historique ; remet en ligne si pause pour impayé). Tâche `client-sites` 9h : rappel J-3, retard J+1
  puis chaque semaine, pause auto après le délai, un seul message Telegram.
- **Étape 6 — voix** : report (« qui n'a pas payé ? », revenus mensuels, retards), messages, notify ; outil mis à jour.
- **App** : écran `SitesScreen.tsx` (menu Plus → 🌐 SITES CLIENTS, Kouider seulement) : chiffres, nouvelle démo,
  démos → vrai site, fiche par site (abonnement + paiement, messages, modifier, domaine, espace client, inventé, pause).
  API `/api/fik-sites` (requireMobileAuth + Kouider seulement), mêmes fonctions que l'outil vocal.

## 2026-10-14 (soir 4) — FIK Sites (plan A) : vrais sites clients + espace client type Shopify

- **`create_client_site`** (`integrations/client-sites.ts`) : une démo devient un vrai site. Les vraies infos de Kouider
  (`real_info`) remplacent ce qui était inventé (Claude met à jour la liste `invented`), photos copiées dans le
  stockage Supabase public `fik-sites/<id>/`, site Netlify sans « démo » ni noindex. Avec `client_email` → espace
  client, mot de passe envoyé à Kouider sur Telegram. Données : app_kv `fik:site:<id>`, index `fik:sites`.
- **`manage_client_site`** : list / info / edit (langage naturel → Claude → remise en ligne) / pause (page
  « momentanément indisponible ») / resume / account (nouveau mot de passe + coupe les sessions).
- **Espace client** `<site>/admin/` (`integrations/client-site-admin.ts`, déployé avec chaque site) : infos, horaires,
  présentation, offre (catégories/éléments/prix), points forts, photos (envoi redimensionné, ordre, suppression),
  couleurs, mot de passe → « Publier » ≈ 4 s. Tout en textContent/value (pas d'innerHTML).
- **API** `/api/client-sites` (`api/routes/client-sites.ts`) : login (scrypt, 8 échecs → 15 min bloqué), me, PUT me
  (seules les photos du site, pas de touche à `invented`/polices), me/photo (≤ 8 Mo), me/password, logout.
  Sessions app_kv `fik:sess:<sha256>` 30 j, coupées par `fik:epoch:<id>`.
- `demo-site.ts` : renderHtml(opts.demo), deployNetlify(slug, files, siteId?) → {url, siteId}, loadDemo().
- Clé `GOOGLE_MAPS_API_KEY` ajoutée au backend de secours (VPS).
- Test : https://restaurant-pralin-illusion.netlify.app (+ /admin/), créé depuis la démo Pralin en 11 s.

## 2026-10-14 (soir 3) — Démo de site d'un commerce en 1–2 min (create_demo_site)

- **`create_demo_site`** (`integrations/demo-site.ts`) : lien Google Maps (ou nom + ville) → Google Places (API
  « legacy » findplacefromtext + details, clé `GOOGLE_MAPS_API_KEY` ou `GOOGLE_PLACES_API_KEY`) : nom, adresse, tél.,
  horaires, 8 photos, note, avis, services → Claude écrit les textes et INVENTE seulement ce qui manque (menu,
  prestations, prix…) en le listant → page HTML responsive (hero photo, carte/prestations, galerie, avis, horaires,
  plan, bouton appel) → Netlify (déploiement par empreintes SHA1, nouveau site `demo-<nom>-xxxx`). ~20 s testé
  (restaurant + garage à Oran). Lien + liste « inventé » envoyés sur Telegram et dans l'app.
- **`get_demo_site`** : démos gardées dans app_kv `demo:site:<slug>` (+ index `demo:sites`) avec vraies infos / inventé,
  base pour le vrai site.
- Le VPS de secours n'a pas `GOOGLE_MAPS_API_KEY` dans `.env` (Railway oui).

## 2026-10-14 (soir 2) — Dossiers de présentation soignés (create_presentation_doc)

- **Nouvel outil `create_presentation_doc`** (`integrations/pro-doc.ts`) : Google Doc prêt à remettre — page de garde
  avec le logo FIK (`backend/assets/fik-logo.jpg`, en ligne sur Supabase `client-documents/branding/fik-logo.jpg`,
  ou `BRAND_LOGO_URL`), résumé, sommaire cliquable avec les VRAIS numéros de page (export PDF via
  docs.google.com/…/export + pdfjs-dist), une partie par page, titres or, pied de page. Claude (Sonnet) rédige en JSON
  à partir de `material` uniquement (rien d'inventé). Tourne en arrière-plan (1–2 min) ; lien envoyé sur Telegram
  (tg-outbox) + dans l'app.
- `list_my_capabilities output=google_doc` → dossier « Dzaryx — dossier de présentation » : liste des outils lue dans le
  code (aucun oublié, testé 203/203), chaque outil réécrit en français clair (12 rédactions en parallèle, ~20 s).
- À savoir : l'API Google Drive n'est PAS activée dans le projet Google (1041982301741) → pas de suppression/liste de
  fichiers via Drive ; l'export PDF passe par le lien Docs.

## 2026-10-14 (soir) — B034 terminé ; Dzaryx connaît sa vraie liste d'outils

- **B034 fermé** : tgcall a son propre jeton, `auth:legacy`=off. Ancien `MOBILE_ACCESS_TOKEN` → 403 sur Railway et le VPS.
- **Nouvel outil `list_my_capabilities`** (`integrations/capabilities.ts`) : nom, nombre EXACT d'outils (202), agents,
  chaque outil par catégorie, lu dans `tools.ts`. Avant, avec la recherche d'outils, Dzaryx ne voyait qu'une partie de
  ses outils et inventait le nombre quand on lui demandait « un document avec toutes tes capacités ».
- **Routage** : « crée un document… » partait vers l'Agent Clients (mot « document »), sans `create_google_doc`.
  `list_my_capabilities`, `create_google_doc`, `create_google_sheet` ajoutés aux outils de TOUS les agents
  (`ALWAYS_TOOLS`) et aux outils toujours chargés (`CORE_TOOLS`). L'agent choisi d'après l'historique
  (`conversation/orchestrator.ts`) reçoit aussi `ALWAYS_TOOLS` (avant : non).
- **Appels** : la voix temps réel répondait « je ne peux pas créer de Google Doc » sans demander au cerveau.
  Consignes : jamais « je ne peux pas » sans ask_dzaryx (qui a 200+ outils) ; document/tableau → ask_dzaryx puis lien
  par écrit (send_text_to_me). `/api/call/turn` : le cerveau recopie les liens à la fin de sa réponse.
  `list_my_capabilities` `output: google_doc | google_sheet` crée le document directement (9 s, testé : Doc 231 lignes,
  Sheet 1 ligne/outil) — le modèle n'a plus 200 lignes à réécrire (limite de 90 s pendant un appel).

## 2026-10-14 (après-midi) — Appels : Dzaryx sait qu'il a appelé ; dictée sans jargon ; jeton tgcall prêt

- **Appel sortant** (`tgcall/realtime.py` `greet`) : consigne ajoutée « c'est TOI qui appelles, motif : … ».
  Au récap 10h, « c'est toi qui m'as appelé » était compris comme « qui m'a appelé ? ».
- **Dictée pendant l'appel** (`api/routes/call.ts` `/turn`) : Dzaryx demande « Je l'enregistre ? » au lieu de
  réciter la consigne interne « dis confirmé au téléphone ».
- **B034** : `backend/scripts/tgcall-token.ts` donne à tgcall son propre jeton (à lancer par Kouider).
  Nexus utilise `PC_AGENT_TOKEN` (pas concerné). Houari n'utilise pas l'app. Reste : raccourci Siri.

## 2026-10-14 — Mails : Dzaryx annonce bien contact@ ; appel automatique en cas de panne

- **Mails** : les envois partaient déjà de `contact@fikconciergerie.com` (vérifié dans « Envoyés »), mais le brouillon
  affichait « De: fikconciergerie@gmail.com » → Dzaryx disait à Kouider que ça ne partait pas de contact@.
  Brouillon + confirmation + descriptions d'outils + prompt : envoi depuis contact@, réception dans fikconciergerie@gmail.com.
  `proAliasReady()` : une erreur passagère ne fait plus repasser 1 h sur l'adresse Gmail.
- **Appel sur incident** (`notifications/incident-call.ts`, `reportIncident`) : alerte écrite + Dzaryx appelle Kouider
  (Telegram + app). Branché sur : erreur grave du serveur (uncaughtException/unhandledRejection), tâche planifiée
  en échec, service d'appels Telegram coupé, démarchage bloqué (boîte à reconnecter) ou mails de démarchage en échec.
  Une même panne = 1 appel / 3 h ; max 6 appels d'incident / jour (au-delà : écrit seulement).
- **Railway complètement tombé** (`tgcall/watchdog.py`, cron VPS chaque minute) : vérifie `/health` ; 3 échecs
  de suite (~3 min) → message Telegram + appel d'alarme, rappel toutes les 2 h, message « rétabli » au retour.
  Passe par `tgcall/outbox` : un fichier `*.call` fait appeler Kouider (`alarm_call` dans `dzaryx_tg.py`) sans
  le backend, avec le message préenregistré `fillers/alarm.mp3`. Test réel OK (appel reçu à 12h21).
  Test à blanc : `python3 tgcall/watchdog.py --dry-run [--url URL]`.

## 2026-10-14 (soir) — Nexus : « ouvre Chrome » corrigé, interface HUD animée plein écran | `8f002eb`, `a15166d`

- **Bug** `nexus.py` : « ouvre <app> » cherchait d'abord un fichier au Bureau (ouvrait un `.json` de photos dans VS Code).
  Les applications connues (`APP_MAP`) sont maintenant lancées en priorité.
- **Interface** `nexus/gui/index.html` refaite de zéro (HUD Canvas animé : anneaux à graduations en contre-rotation,
  globe fil de fer, orbite, 4 états veille/écoute/réflexion/parole ; cartes réservations/météo/disque/serveur ;
  rail d'actions ; conversation). Pas de code copié de TechEnClair (licence non commerciale).
- Ouverture en plein écran (`--start-fullscreen`), bouton ⛶. `install-nexus-autostart.bat` : démarrage avec Windows.
- `handle_widget_request` : + `weather`, `bookings`, `railway` (cartes remplies à la connexion). Statut GUI : `mic_available`.
- **Reste** : installer PyAudio (micro + mot « Nexus » vocal) — pas de build prêt testé pour Python 3.14.
- **Panneaux métier** (`nexus/modules/panels.py` + panneaux dans `gui/index.html`) : « montre-moi les dernières réservations »
  (agenda calendrier + liste), « montre le passeport/permis de X » (consultation journalisée dans `document_access_logs`),
  « crée une facture (pour X) » (PDF sauvegardé dans `Bureau\Nexus\Factures`), « envoie-moi le lien … » (Telegram),
  « fais de la place sur le PC » (analyse + bouton ; seuls les temp > 2 j sont supprimés), « crée un dossier avec les
  réservations » (CSV), « crée-moi un graphique » (SVG). Plusieurs étapes dans une phrase = enchaînées, onglets.
- **backend** `api/routes/nexus-data.ts` (nouveau, `/api/nexus/data/*`, jeton PC uniquement) : bookings, documents (liens
  signés 10 min), invoice, notify. `generatePdfReceipt` : jours **inclus** via `rentalDays` (comme B033).
- **Bug corrigé** : le jeton PC était refusé (403) par `/api/bookings` et le briefing lisait la mauvaise clé → « 0 réservation »
  toujours affiché. Le compteur utilise maintenant `/api/nexus/data/bookings` (en cours aujourd'hui).
- **Sécurité Nexus** : le serveur local n'expose plus que `/gui/` (avant : tout le dossier, `.env` compris) ; le WebSocket
  7778 refuse les pages web extérieures (contrôle de l'Origin).

---

## 2026-10-14 (après-midi) — Claude 5.5, mémoire par le sens, connexion sécurisée, voix temps réel du PC | `3174fc9`, `19f9f12`, `5087064`, `92daa52`, `c7695cb`

- **Modèles** : tout le backend passe à Claude Sonnet 5.5 (cerveau) et Haiku 5.5 (réponses rapides) via un client
  unique `integrations/anthropic-compat.ts`, qui adapte chaque requête (temperature retirée, budget de réflexion →
  niveau d'effort, `between_tools`, repli serveur en cas de refus). Grille de prix du suivi de coûts mise à jour.
- **Recherche d'outils** (route Générale, 201 outils) : seuls ~45 outils courants restent chargés, les autres sont
  trouvés à la demande (`tool_search_tool_bm25`). Prompt par message : ~145 000 → ~30 000 tokens.
- **Bugs d'argent corrigés** : contrat, part de Houari, prévision de CA et taux d'occupation comptaient un jour de
  moins (jours non inclus). Une seule règle : `rentalDays()` dans `integrations/finance.ts`. Tests 11/11.
- **Mémoire par le sens** (`integrations/semantic-memory.ts`) : souvenirs et conversations retrouvés même formulés
  autrement (empreintes OpenAI 256 dim, Gemini en secours, stockées dans app_kv, sans migration).
- **Sécurité** : l'app ne contient plus aucun code d'accès ni mot de passe. Connexion vérifiée par le serveur
  (`/api/auth/login`, mots de passe hashés scrypt), jeton propre à chaque appareil, anti-devinette + alerte Telegram,
  Réglages → Sécurité (changer son mot de passe, appareils connectés). ⚠️ Les anciens codes restent acceptés tant que
  `app_kv auth:legacy` ≠ `off` : le service d'appels Telegram (`tgcall/.env ACCESS_TOKEN`) les utilise encore.
- **Siri** : l'en-tête du jeton était lu avec des majuscules (jamais trouvé) → corrigé.
- **Nexus** : voix temps réel sur le PC (`modules/realtime_voice.py`, « Nexus » ouvre une vraie conversation, on peut
  lui couper la parole), « regarde avec moi » (écran joint à chaque phrase), clics par lecture des fenêtres Windows
  (`modules/ui_automation.py`, clic par vision en secours). Non testé sur le PC (éteint).

---

## 2026-10-14 — Piloter le PC (Nexus) depuis le téléphone

- **App « MON PC »** (`simulator/…/NexusScreen.tsx`, réécrit + enfin dans le menu) : écran du PC en direct au doigt
  (toucher = clic, double toucher, appui long = clic droit, glisser = défiler ou déplacer), plein écran, clavier,
  télécommande (médias/volume), « Demande à Nexus » à l'écrit ou à la voix, réveiller / mettre à jour / redémarrer.
  Coordonnées relatives (nx/ny) → clic juste quelle que soit la résolution. Anciens boutons cassés supprimés
  (clic en 0,0, « RESTART » = taskkill de tous les Python).
- **Backend** : `api/routes/nexus-live.ts` (`/api/nexus/live/*`, limite à part 600/min — le direct ne mange plus la
  limite générale de 120/min), `/api/nexus/say|wake-pc|remote-status|update|soft-restart`,
  `integrations/nexus-remote.ts` (commande avec réponse, état, réveil, capture → Telegram, **mise à jour automatique
  de Nexus au rallumage du PC** s'il a du retard sur `nexus/` — coupure : app_kv `nexus:autoupdate`=off),
  `send_nexus_command` renvoie la vraie réponse de Nexus, `wake_nexus` tente le réveil réseau (MAC gardée en base).
- **Appels Telegram** : outils `pc_command` (relecture + oui pour éteindre/veille/supprimer), `pc_status`, `pc_wake`,
  `pc_screen_to_telegram`, `pc_look` (Dzaryx voit l'écran du PC pendant l'appel). `notifications/tg-outbox.ts` :
  messages/photos du backend envoyés par le compte Telegram de Dzaryx (via `/api/call/pending`, aussi en plein appel).
- **Nexus** : `nexus:command_sync` (réponse renvoyée au lieu de Telegram), capture rapide mss+Pillow avec curseur
  (+ correctif : l'ancienne capture PowerShell enregistrait du PNG), `nexus:mouse_drag`, flèches/médias/F5/F11,
  « mets le PC en veille (et réveille-le demain à 8h) », « réveille le PC à 14h » (tâche Windows qui sort de veille).

---

## 2026-10-14 — Navigateur du serveur activé + mise à jour de Nexus à distance | `f738157`, `2243eab`

- **Navigateur sur le serveur** (demande explicite de Kouider) : outils `browser_task` / `browser_reply` / `browser_status`,
  `integrations/browser-relay.ts`, `api/routes/browser.ts`, service VPS `browser-worker/worker.py` (pm2 `dzaryx-browser`,
  à démarrer par Kouider — le démarrage a été bloqué par le garde-fou de Claude Code).
- **`update_nexus`** : « mets à jour Nexus » depuis le téléphone → git pull + pip install + Chromium + redémarrage
  (via `nexus:sysinfo` pour le dossier et le Python du PC, puis `nexus:run_command`).

---

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
