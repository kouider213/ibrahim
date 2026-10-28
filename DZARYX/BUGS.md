# DZARYX — Tracker Bugs

> Format : ID | Statut | Fichier(s) | Description | Fix
> Légende : 🔴 OUVERT | 🟡 EN COURS | ✅ FIXÉ | ⚪ WON'T FIX

---

## Bugs Ouverts 🔴

### B047 — Permis + passeport de Halfi envoyés sur Telegram sans demande (28/10 15h30) ✅ FIXÉ
get_client_brain (outil de LECTURE, utilisé aussi par Total Recall, Conscience, agents internes) appelait get_client_document qui envoie les papiers. Déclenché par le test Jarvis 4 de Claude (total_recall « Halfi »).
Fix : get_client_brain n'envoie plus rien (indice « get_client_document » dans le résultat). Même passe : décisions à boutons périmées après 3 h (au lieu de 12 h, « RDV 13h » ressortait dans le brief CarPlay), promesses « Dzaryx / déjà fait » ignorées, brouillons WhatsApp > 24 h plus comptés comme « clients en attente », Total Recall a search_conversations.

### B046 — Siri lent, coupé, « je regarde… » sans réponse (28/10) ✅ FIXÉ
Consigne SIRI (~3 000 caractères) gardée dans chaque vieux message → historique au-dessus du seuil → résumé de compaction relancé à CHAQUE tour (+5 s), réponses de 20 à 48 s, le Raccourci abandonnait (Kouider redemandait 3 fois l'actualité). Réponse coupée net à 600 caractères. La consigne SIRI n'était pas retirée avant le choix du modèle (spokenText).
Fix : context-builder shortPreamble() remplace les consignes Siri/appel des anciens messages par « [via Siri] » / « [au téléphone] » (≈5 300 → 1 500 tokens) ; spokenText() retire aussi [SIRI…] ; siriTurn : 25 s max puis « je t'envoie la réponse sur Telegram », coupe en fin de phrase + réponse complète sur Telegram, « je regarde… » relancé une fois.

### B045 — « Ange gardien contact Fatima +32… » ignoré, réponse sur l'ancienne question Halfi + permis du client envoyé sur Telegram (28/10) ✅ FIXÉ
13h45 : contact jamais enregistré ; le cerveau a « vérifié » sa réponse précédente (10 h inventé à 13h16) via list_bookings + get_client_document, qui a envoyé permis + passeport sur Telegram, puis a écrit « je ne les ai pas envoyés ».
Fix : orchestrator.ts angelContactCommand() enregistre le contact sans dépendre du modèle ; relances anti-hallu/fantôme citent le DERNIER message et interdisent l'ancien sujet ; get_client_document send:false = lecture seule, et le résultat dit quand la photo est partie sur Telegram.
Suite 14h01 : réponse ange gardien directe (sans cerveau) ; message resté sans réponse après une panne marqué « n'y réponds pas » (context-builder) ; « vérifie / a bien / valide… » sans « envoie / montre » = get_client_document forcé en lecture seule par le code (setDocReadOnly).

### B044 — Résa WhatsApp enregistrée « Client (+numéro) », papiers pas dans le dossier, contact pas enregistré (27/10) ✅ FIXÉ
Crédit Claude à 0 → secours Gemini : passeport/permis jamais lus (lecture = Claude Haiku seul), save_client jamais appelé, PDF de papiers pas lu, prix proprio absent (profit 0).
Fix : readDocVision (Claude → Gemini → Groq → OpenAI, PDF via Gemini) pour OCR + type de pièce ; save_client lit les PDF, renomme résas/profil, anti-doublon 30 min ; create_booking lance save_client tout seul (résultat Telegram) et prend cars.base_price comme prix proprio ; secours agentique relancé avec outils obligatoires au lieu de « pas accès aux données en temps réel » ; bot Telegram : image markdown ![](url) ne plante plus (« Petit souci technique ») ; fiche client app : négociation/fiabilité en menus FR.

### B043 — « Rappel trajet » 9h35 (~25 min) faux, horaire du dimanche faux (25/10) ✅ FIXÉ
- Symptôme : dans l'app, « 📡 Horaire Kouider — Dimanche : réveil 08:30, départ trajet 9h35 (25min) » et « Rappel trajet Bruxelles, départ idéal 9h35 (~25min) » alors que la maison → travail fait quelques minutes et que le vrai planning (réveil 6h40, sport…) est ailleurs.
- Cause : vieux `conversation/proactive-engine.ts` (pre-work, personal-schedule, calendar-appt) avec horaires écrits en dur d'avant la routine et un trajet fixe `commute_minutes_avg` = 25 min, sans GPS ni trafic.
- Fix : ces 3 rappels supprimés ; les départs restent dans `departures.ts` (position GPS Telegram + trafic Google réel) et le planning dans `morning-routine.ts`.

### B042 — Reprise après « ne pas déranger » (son fils aux urgences, 22/10) ✅ FIXÉ
- Symptôme : à 6h28 Dzaryx réactive tout (vrai pause_calls), puis au message suivant écrit « je ne l'ai pas fait, l'outil n'a jamais été lancé » ; ne demande pas ce qu'avait son fils ; « comme c'est jeudi, ton jour de congé » alors que Kouider bosse depuis 5h ; récap « Pendant ta pause (06h19 → 06h19) » avec des lignes d'agenda déjà passées ; « je te le note » sans outil puis aveu.
- Cause : l'historique ne gardait que le texte (pas les outils lancés) → le cerveau ne voit aucune preuve et s'accuse ; consigne DND sans volet humain ; dossier « jour de congé » sans exception travail ; récap sans cas même minute.
- Fix : metadata.tools sauvée à chaque tour + note « outils réellement lancés » dans l'historique (`withToolTrace`) ; dnd.ts : raison perso → demander des nouvelles d'abord + remember_info, pas de « congé » s'il est au travail ; dossier : congé annulé s'il travaille ; tg-outbox : une seule heure si même minute, lignes « • HHhMM » passées retirées ; règle « je te le note » = outil dans le même tour.

### B041 — Sans crédit Claude, Dzaryx répond « Service temporairement indisponible » (21/10) ✅ FIXÉ
- Symptôme : test « tout gratuit » (`backend/scripts/free-mode-test.ts free`) → chat 2/11 ; « Je n'ai pas accès aux données en temps réel » alors que list_bookings avait tourné ; photos décrites au hasard (« citadine blanche » pour une Clio rouge) dans les tâches de fond.
- Cause : Groq reçoit 237 outils (max 128) et ~9 000 tokens de prompt (free = 8 000 tokens/min) → 400/413 ; un seul modèle Gemini (souvent 503/429) ; `fastPathGuard` appliqué au secours agentique même quand de vrais outils avaient tourné ; images retirées en silence par le secours.
- Fix : `agentic-fallback.ts` — 7 modèles Gemini (quota 429 → modèle sauté 15 min), puis Groq compact (prompt court `compact-prompt.ts` + date, 8 outils choisis par `pickFallbackTools`, historique tronqué, 2e essai si outil inconnu, attente si 429 court) ; photos envoyées à Gemini (chat, appel vidéo, tâches de fond), Groq prévenu qu'il ne voit pas l'image ; `callGroq`/`callGroqVision` passent au prompt court si trop gros ; orchestrator ne bloque plus une réponse appuyée sur des outils. Kouider 21/10 : Gemini autorisé pour les photos quand Claude est en panne.

### B040 — Démarchage : aucun mail n'arrive lundi 19 et mardi 20/10 ✅ FIXÉ
- Symptôme : tous les mails du matin (13 le 19, 12 le 20) rejetés « 550 5.4.6 Unusual sending activity » par Zoho (envoi « en tant que » contact@fikconciergerie.com).
- Cause : la bascule vers l'adresse Gmail ne se faisait qu'au passage du scanner de réponses, après coup → toute la fournée partait dans le vide avant.
- Fix : `sendEmail` vérifie la conversation ~3-16 s après chaque envoi depuis contact@ ; rejet 5.4.6 → mail renvoyé aussitôt depuis fikconciergerie@gmail.com, rejet mis à la corbeille, 24 h sur Gmail (kv `mail:zoho-blocked-at`), alerte Telegram une fois. Les prospects rejetés les 19-20 étaient déjà remis en file (repartis le 21 / en cours).

### B039 — « Pas de salle demain, ne me dérange pas le matin » pas respecté + rafale de messages (20/10) ✅ FIXÉ
- Symptôme : séance annulée mais le réveil 6h40 (message + appel) restait prévu, les blocs sport restaient dans l'agenda ; à 23h30 l'app a reçu « Demain 🚗 Trajet → salle… réveil » et un rappel « Réveil Kouider ! » était programmé à 6h15 ; à sa réponse, tous les messages gardés pendant la pause sont partis d'un coup.
- Cause : la routine du matin ignorait le skip sport ; pause_calls ne savait faire qu'un silence « à partir de maintenant » (et resume l'effaçait) ; vieux job smart-alarm (heure d'Algérie, Haï Badr) sans aucun garde-fou ; tg-outbox renvoyait chaque message gardé séparément.
- Fix : silences programmés (dnd:planned, pause_calls day/from_time/until_time, resume ne les efface pas) ; routine du matin muette si sport annulé ou silence à l'heure du réveil ; skip sport = trajet/séance/retour/douche enlevés de l'agenda (unskip = remis) ; smart-alarm coupé ; messages gardés → UN récap (doublons + alertes sport d'un jour annulé jetés).

### B038 — Actions refaites en double + « vraies vérifications » parasites (18/10) ✅ FIXÉ
- Symptôme : « envoie la photo de la Clio » → Dzaryx renvoie aussi le PDF de la veille ; « fais-moi un plan » → la réponse commence par re-vérifier PDF/photo/passeport. Plan livré en texte (titres « ## » bruts), pas en PDF ; photo/passeport en liens.
- Cause : phantomGuard ne connaissait que WRITE_TOOLS → « ✅ PDF envoyé » après send_doc_pdf (ou get_car_photo…) = « invention » → relance « ta réponse précédente affirmait une action » → le modèle refaisait les actions des messages précédents.
- Fix : ACTION_TOOLS + tout outil réussi dont le résultat commence par ✅/📄 ; relance limitée au DERNIER message ; règle PLAN/DOSSIER → business_simulator + create_presentation_doc (PDF) ; /turn : « ## » → gras, ![](url) et « 📹 url » → vraies photos (tgcall : lien en secours).

### B037 — Dossier « gagner de l'argent avec Dzaryx » : « réponse non JSON » + graphiques en code brut sur Telegram ✅
- Cause : le rédacteur (askJson) lisait le JSON de Claude à la main ; une réponse coupée (max_tokens) ou un guillemet non échappé = échec après 2 essais. Les blocs ```chart (dessinés seulement par l'app) arrivaient en texte brut sur Telegram, et le dossier Google Docs ne savait pas faire de graphiques.
- Fix : sortie structurée de l'API (schéma JSON imposé → JSON valide garanti) pour les dossiers ; askJson en streaming, relance avec 2× plus de place si coupée, réparation si JSON cassé (sert aussi capabilities, sites clients/démo, studio vidéo). Blocs chart dans les dossiers → PNG (chart-image.ts, SVG → Cloudinary) insérés dans le Doc ; sur Telegram, /api/call/turn renvoie `images` et tgcall les envoie en photos (+ textes > 4 000 car. coupés proprement).

### B036 — Mail jamais envoyé pendant un appel (« le serveur exige ton oui » en boucle) ✅
- **Statut** : ✅ FIXÉ — 2026-10-18
- **Fichier(s)** : `backend/src/integrations/tool-executor.ts` (`sendEmailTool`)
- **Description** : en appel, le message de Kouider est enregistré avec la consigne « [APPEL TÉLÉPHONIQUE EN COURS …] » devant.
  Le verrou d'envoi cherchait « oui/envoie » au tout début → toujours refusé, même après « CONFIRMÉ AU TÉLÉPHONE »
  (réponse à Hello Appart Hôtel, 17/10 18h09, 4 refus).
- **Fix** : consigne d'appel retirée avant le test ; en appel seul « CONFIRMÉ AU TÉLÉPHONE » vaut accord (et le brouillon refait ce tour-là est accepté).

### B035 — Messages Telegram à Dzaryx toujours en échec ✅
- **Statut** : ✅ FIXÉ — 2026-10-14 (`5cde7bf`)
- **Fichier(s)** : `tgcall/dzaryx_tg.py` (`on_message`, `voice_command`)
- **Description** : `send_chat_action(uid, 'typing')` → « 'str' object has no attribute 'name' » : texte, vocal et photo
  envoyés au compte Telegram de Dzaryx répondaient « Petit souci technique ». Les appels n'étaient pas touchés.
- **Fix** : `enums.ChatAction.TYPING / RECORD_AUDIO`. Prévention : tgcall remonte ses erreurs → auto-test quotidien.

### B034 — Anciens codes d'accès encore valides (visibles dans les vieilles versions publiques de l'app) ✅
- **Statut** : ✅ FIXÉ — 2026-10-14 13:19 (tgcall a son jeton d'appareil, auth:legacy=off, ancien code → 403 vérifié)
- **Fichier(s)** : `backend/src/auth/device-auth.ts` (app_kv `auth:legacy`), `tgcall/.env` (`ACCESS_TOKEN`)
- **Description** : la nouvelle app n'a plus de code dedans (connexion par mot de passe + jeton d'appareil), mais
  `MOBILE_ACCESS_TOKEN` reste dans l'historique public de gh-pages et reste accepté. Il ne peut pas être coupé tant
  que le service d'appels Telegram l'utilise.
- **Fix prévu** : donner à tgcall son propre jeton d'appareil (`issueDeviceToken('kouider', 'service:tgcall')`),
  le mettre dans `tgcall/.env`, `pm2 restart dzaryx-tg`, puis `setLegacyOff(true)` (app_kv `auth:legacy`=`off`).
- **Avancement** : script prêt `backend/scripts/tgcall-token.ts`. Nexus pas concerné (`PC_AGENT_TOKEN`), Houari
  n'utilise pas l'app. Avant de couper : vérifier le raccourci Siri (en-tête `x-dzaryx-token`).

### B033 — Jours de location comptés sans le jour de retour (contrat, part Houari, CA) ✅
- **Statut** : ✅ FIXÉ — 2026-10-14 (`3174fc9`)
- **Fichier(s)** : `generate-contract.ts`, `queue/jobs/proactive-jobs.ts` (prévision CA, part Houari, occupation)
- **Description** : 4 calculs utilisaient (fin − début) jours au lieu de jours inclus → contrat avec 1 jour de moins
  et prix/jour faux, part de Houari sous-estimée d'un jour.
- **Fix** : `rentalDays()` (finance.ts) partout ; test financier 5 aligné + sections 9-10.

### B032 — Route Siri toujours refusée ✅
- **Statut** : ✅ FIXÉ — 2026-10-14 (`5087064`) — en-tête lu `x-Dzaryx-token` alors que Node met tout en minuscules.

### B031 — Notifs push iOS jamais demandées (prompt hors geste utilisateur) ✅
- **Statut** : ✅ FIXÉ — 2026-06-19 (commit `83621e8`, SW v115)
- **Fichier(s)** : `simulator/src/services/api.ts`, `simulator/src/components/Phone.tsx`, `simulator/src/components/screens/SettingsScreen.tsx`
- **Description** : `registerWebPush()` (→ `Notification.requestPermission()`) appelé au montage (`Phone.tsx` useEffect) + dans `setTimeout(600)` après login → hors geste utilisateur. iOS Safari/PWA ignore en silence la demande hors tap → plus de prompt ni de notifs (pire après réinstall : permission iOS remise à zéro).
- **Fix** : split `api.ts` — `registerWebPush()` geste seul (prompt) ; `resumeWebPush()` silencieux (re-souscrit si déjà `granted`) ; `subscribePush()` réutilise `getSubscription()` + re-POST backend ; `notifStatus()`. Montage/login → `resumeWebPush()`. Bouton tap **🔔 ACTIVER** dans Réglages + guide install PWA iOS.
- **Confirmé par Kouider le 2026-10-13** : les notifications marchent.

### B025 — Token GitHub exposé dans git remote (SÉCURITÉ) ✅
- **Statut** : ✅ FIXÉ — 2026-10-13 (token supprimé sur GitHub par Kouider)
- **Fichier** : `.git/config` du repo ibrahim (local PC Kouider)
- **Description** : un token `ghp_d8Vch…` était dans l'URL git remote, puis écrit en clair ici (repo public). Supprimé de l'URL.
- **Fix** : token révoqué sur github.com/settings/tokens par Kouider le 2026-10-13 ; valeur retirée de ce fichier (elle reste dans l'historique git mais ne sert plus à rien).

---

## Bugs Fixés (Audit complet 2026-06-02) ✅

### B026 — Vercel/Pages perdent accès quand repo privé
- **Statut** : ✅ RÉSOLU — 2026-06-02
- **Description** : Plan Hobby Vercel + GitHub Pages gratuit ne supportent pas repos privés. Mise en privé a cassé les 2 déploiements.
- **Fix** : Les 2 repos (`autolux-location`, `ibrahim`) remis en PUBLIC. Vercel redéploie, GitHub Pages réactivé (`gh-pages` branch). Protection réelle = API keys Railway + données Supabase (jamais exposées).

### B027 — Simulateur servait vieille build après réactivation Pages
- **Statut** : ✅ RÉSOLU — 2026-06-02
- **Description** : Réactivation GitHub Pages pointait sur build `gh-pages` du 06-01 12:14. Les changements TextScreen 06-01 (RichText) cassaient persist chat + proactifs en apparence (en réalité = cache SW stale).
- **Fix** : Restauré base 05-31 + réappliqué RichText proprement. Vrai bug trouvé : `URL_RE.test()` regex global stateful → détection URL erratique. Fixé avec regex non-global ancré `URL_IS`. SW v3→v7 pour cache bust.

### B028 — TTS latence élevée (eleven_multilingual_v2)
- **Statut** : ✅ AMÉLIORÉ — 2026-06-02
- **Fichier** : `backend/src/notifications/dispatcher.ts`
- **Description** : Stream TTS sans `optimize_streaming_latency` → premier son lent.
- **Fix** : Ajout `?optimize_streaming_latency=3` au stream endpoint. Voix inchangée, premier chunk audio plus rapide. (Note : `eleven_flash_v2_5` possible amélioration future mais risque phonétique français.)

### B029 — Mobile TS error (SarfPanel outputLabel inutilisé)
- **Statut** : ✅ FIXÉ — 2026-06-02
- **Fichier** : `mobile/src/components/dashboard/panels/SarfPanel.tsx`
- **Fix** : Variable `outputLabel` supprimée. Mobile TS = 0 erreur.

---

## Résultats Audit Complet 2026-06-02

| Composant | TS/Build | État |
|---|---|---|
| Backend (Railway) | ✅ 0 erreur | OK |
| Simulateur (gh-pages) | ✅ 0 erreur | OK — orbe premium |
| Mobile PWA (Netlify) | ✅ 0 erreur | OK |
| Site autolux (Vercel) | ✅ 32 routes | OK |
| App native (dzaryx-native) | présent | OK |
| Latence TTS | optimisé | OK |
| Routing LLM | salutations→Groq, business→Claude | équilibré |
| Délais artificiels chat | aucun | OK |

---

## Bugs Fixés cette session (2026-05-17 — Feature Parity) ✅

### B018 — memory_facts user_id toujours 'remember_info' (mémoire inutilisable) [CRITIQUE]
- **Statut** : ✅ FIXÉ — 2026-05-17
- **Fichier** : `backend/src/orchestrator/memory-engine.ts`
- **Description** : `writeMemory()` utilisait `source` comme `user_id`. Chaque fait sauvegardé via `remember_info` avait `user_id='remember_info'` au lieu de `'kouider'`. `getMemoryFacts({ user_id: 'kouider' })` retournait donc 0 résultats. Tout le système mémoire ne fonctionnait pas.
- **Fix** : `WriteMemoryParams` + optional `userId` field. `userId = userIdParam ?? 'kouider'`. `insertPayload` inclut `user_id: userId`. Step 2 dedup filtre par `user_id`.

### B019 — rememberInfo sans user_id acteur (Houari écrivait sous 'kouider') [MOYEN]
- **Statut** : ✅ FIXÉ — 2026-05-17
- **Fichier** : `backend/src/integrations/tool-executor.ts`
- **Description** : `rememberInfo()` ne prenait pas en compte l'acteur. Houari sauvegardait ses mémoires sous `user_id='kouider'`. `recallMemory()` ne cherchait que dans `ibrahim_memory` (legacy), pas dans `memory_facts`.
- **Fix** : `inferUserId(sessionId)` extrait 'houari' ou 'kouider' depuis le sessionId. Passé à `writeMemory()` et `getMemoryFacts()`. `recallMemory` cherche d'abord dans `memory_facts` (moderne), fallback `ibrahim_memory`.

---

## Bugs Fixés cette session (2026-05-17) ✅

### B017 — Socket.IO mauvais namespace → aucun event temps réel reçu [CRITIQUE]
- **Statut** : ✅ FIXÉ — 2026-05-17
- **Fichier** : `dzaryx-native/app/chat.tsx` ligne 138
- **Description** : `io(BACKEND_URL)` connectait au namespace racine `/`. Le backend émet tous les events (`Dzaryx:text_complete`, `Dzaryx:audio_chunk`, `Dzaryx:status`, `Dzaryx:proactive`) sur le namespace `/mobile` avec middleware auth. L'app native ne recevait AUCUN event temps réel — la réponse n'apparaissait qu'au retour HTTP de `/api/chat`.
- **Fix** : `io(BACKEND_URL + '/mobile', { auth: { token: MOBILE_TOKEN } })` — bonne namespace + token auth.

### B010 — app/onboarding/mode.tsx manquant → crash navigation
- **Statut** : ✅ FIXÉ — 2026-05-17
- **Fichier** : `dzaryx-native/app/onboarding/mode.tsx` (créé)
- **Description** : `_layout.tsx` déclarait `Stack.Screen name="onboarding/mode"` mais le fichier n'existait pas → crash potentiel si navigué.
- **Fix** : Créé `mode.tsx` qui redirige immédiatement vers `/onboarding/welcome`.

### B011 — app.json trailing comma → JSON invalide
- **Statut** : ✅ FIXÉ — 2026-05-17
- **Fichier** : `dzaryx-native/app.json` ligne 50
- **Description** : Virgule après le dernier élément du tableau `plugins` → JSON invalide → EAS build échouerait.
- **Fix** : Virgule supprimée. Version bumped 1.0.0 → 1.1.0. versionCode 2 ajouté.

### B012 — chat.tsx : 4 erreurs TypeScript préexistantes
- **Statut** : ✅ FIXÉ — 2026-05-17
- **Fichier** : `dzaryx-native/app/chat.tsx`
- **Description** :
  1. `NotificationBehavior` manquait `shouldShowBanner` + `shouldShowList`
  2. `handleSend` déclaré APRÈS `stopRecord` qui l'utilise → ordering error TS
  3. `takePictureAsync` → `takePicture` (Expo Camera SDK 54)
  4. `CameraViewRef` cast requis pour prop ref de `CameraView` composant
- **Fix** : Ajouté les 2 props, déplacé `handleSend` avant `stopRecord`, `takePicture`, cast `ref as unknown as React.RefObject<CameraView>`.

### B013 — lib/api.ts token Kouider hardcodé (Houari envoie avec mauvais acteur)
- **Statut** : ✅ FIXÉ — 2026-05-17
- **Fichier** : `dzaryx-native/lib/api.ts`
- **Description** : `sendMessage()` et `registerDevice()` utilisaient `process.env.EXPO_PUBLIC_MOBILE_TOKEN` au niveau module → Houari envoyait toujours avec le token Kouider.
- **Fix** : `mobileToken` param ajouté aux deux fonctions. `chat.tsx` passe `MOBILE_TOKEN` (depuis store, acteur-scoped).

### B014 — onboarding → /chat directement (acteur non sélectionné)
- **Statut** : ✅ FIXÉ — 2026-05-17
- **Fichiers** : `dzaryx-native/app/onboarding/business.tsx`, `personal.tsx`
- **Description** : Après onboarding, `router.replace('/chat')` → `actorId` null → token par défaut Kouider pour tout le monde.
- **Fix** : `router.replace('/auth/login')` pour sélectionner l'acteur avant d'accéder au chat.

### B015 — Whisper hardcode `language: 'fr'` (arabe/darija non reconnu)
- **Statut** : ✅ FIXÉ — 2026-05-17
- **Fichier** : `backend/src/api/routes/transcribe.ts` ligne 33
- **Description** : Groq Whisper avec `language: 'fr'` refuse/mal-transcrit l'arabe et le darija.
- **Fix** : Ligne supprimée — Whisper auto-détecte fr/ar/darija.

### B016 — Actions delete s'exécutent sans confirmation
- **Statut** : ✅ FIXÉ — 2026-05-17
- **Fichier** : `backend/src/conversation/orchestrator.ts`
- **Description** : "Supprime la réservation de Ahmed" → Claude exécutait directement → risque suppression accidentelle.
- **Fix** : Gate ajouté : si `v2.entities.isAdminAction && action === 'delete' && !pendingResolved` → stoppe avant Claude, stocke `delete_confirm` en Redis, demande confirmation. Retry avec "oui" → pendingResolved=true → exécution.

---

## Bugs Fixés ✅ (sessions précédentes)

### B006 — "Donne moi les revenu" bloqué par anti-hallucination Gate 2
- **Statut** : ✅ FIXÉ — 2026-05-15
- **Fichiers** : `backend/src/integrations/claude-api.ts`, `backend/src/agents/agent-registry.ts`, `backend/src/integrations/llm-router.ts`
- **Description** : Message court "Donne moi les revenu" (20 chars) triggait fast-mode Haiku sans outils. Claude répondait de mémoire, Gate 2 bloquait "revenu total sans outil". Aussi : `revenu` absent des keywords FINANCE_AGENT (seulement English `revenue`) et absent de TOOL_KEYWORDS.
- **Fix** : 1) `needsAction` dans `isFastModeEligible` élargi avec `revenu|bénéfice|profit|gagné|gain|argent|chiffre|recette|encaissé|dette|caisse|trésorerie`. 2) FINANCE_AGENT keywords + TOOL_KEYWORDS complétés avec mots FR. 3) FINANCE_AGENT provider : `openai/gpt-4o` → `claude-sonnet-4-6`.

### B005 — Vidéo "créée" mais rien dans Telegram (livraison silencieuse)
- **Statut** : ✅ FIXÉ — 2026-05-14
- **Fichiers** : `backend/src/marketing/create-marketing-video.ts` + `backend/src/integrations/tool-executor.ts`
- **Description** : Bot disait "✅ Vidéo Clio 4 créée" mais rien n'apparaissait dans Telegram.
- **Causes** : 1) FFmpeg zoompan 1080×1920 → OOM Railway. 2) `sendPhoto(URL)` swallowait erreur, tombait sur texte → `telegramDelivered=true` faux. 3) Message échec sans `❌` → phantom guard passait.
- **Fix** : Résolution 720×1280, zoompan retiré, `sendPhotoBuffer` (buffer direct) dans tous fallbacks, messages échec avec `❌`.

---

## Bugs Fixés ✅

### B004 — `create_marketing_video` inaccessible (agent routing cassé)
- **Statut** : ✅ FIXÉ — 2026-05-14
- **Fichier** : `backend/src/agents/agent-registry.ts`
- **Description** : `MARKETING_AGENT` (priority 6) avait `vidéo` dans ses keywords mais pas `create_marketing_video` dans ses toolNames → "fais une vidéo" routait vers cet agent → Claude ne pouvait pas appeler le tool.
- **Fix** : Keywords `TIKTOK_AGENT` élargis pour catcher "fais/crée/génère une vidéo". Priority TIKTOK_AGENT 6→7. Provider TIKTOK_AGENT : groq → claude (tool-calling). MARKETING_AGENT : ajout des outils vidéo création comme fallback.

### B001 — `create_booking` ne stocke pas les prix réels
- **Statut** : ✅ FIXÉ — 2026-05-14
- **Fichiers** : `backend/src/integrations/tool-executor.ts` + `backend/src/integrations/tools.ts`
- **Fix** : INSERT Supabase enrichi avec `client_price_per_day`, `owner_price_per_day`, `owner_total`, `profit_kouider`, `discount_applied`, `nb_days`. Schema outil mis à jour — Claude sait maintenant qu'il doit fournir ces champs.

### B002 — Cache Redis 30 min bloque les tests live
- **Statut** : ✅ FIXÉ — 2026-05-15
- **Fichiers** : `backend/src/bi/revenue-intelligence.ts`, `backend/src/api/routes/bi.ts`
- **Fix** : TTL réduit 1800s → 300s (5 min). Endpoint `POST /api/bi/cache/clear` ajouté pour flush immédiat.
- **Commit** : `0f67e9d`

### B003 — `checkAnomalies()` filtre start_date seulement (pas overlap)
- **Statut** : ✅ FIXÉ — 2026-05-15
- **Fichier** : `backend/src/integrations/phase5-finance.ts` ligne ~488
- **Description** : `checkAnomalies()` utilisait `.gte('start_date', monthStart).lte('start_date', monthEnd)` — ratait les réservations commencées le mois précédent encore actives.
- **Fix** : `.lte('start_date', monthEnd).gte('end_date', monthStart)` — overlap correct.
- **Commit** : `bb692ac`

---

## Bugs Fixés ✅

### F001 — Calculs financiers utilisaient prix catalogue au lieu des prix réels
- **Statut** : ✅ FIXÉ — 2026-05-13
- **Fichiers** : `finance.ts`, `phase5-finance.ts`, `revenue-intelligence.ts`
- **Description** : Le système utilisait `catalog.benefit`, `catalog.kouiderPrice`, `catalog.houariPrice` au lieu des colonnes `client_price_per_day` et `owner_price_per_day` stockées en base. Revenus affichés : ~2290€ au lieu de ~1050€ réel.
- **Fix** : Réécriture complète de `computeBookingFinancials()` et `resolveFinancials()` avec règle stricte : jamais de catalogue fallback. Si données manquantes → `null`.

### F002 — Gates 2&3 anti-hallucination en mode log-only (non bloquants)
- **Statut** : ✅ FIXÉ — 2026-05-13
- **Fichiers** : `orchestrator.ts`, `anti-hallucination.ts`, `orchestrator-engine.ts`
- **Description** : Les gates 2 et 3 loggaient l'anomalie mais retournaient `safe: true` → Claude pouvait halluciner des chiffres financiers ou prétendre avoir consulté des données sans le faire.
- **Fix** : Return `{ safe: false, blocked: '⚠️...' }` dans les deux gates. Déplacé l'appel dans `orchestrator.ts` (avait `toolsExecuted: []` dans orchestrator-engine → toujours passait).

### F003 — Nonce anti-replay en RAM (reset sur restart Railway)
- **Statut** : ✅ FIXÉ — 2026-05-13
- **Fichier** : `backend/src/api/middleware/nexus-security.ts`
- **Description** : Les nonces anti-replay étaient stockés dans un `Set<string>` en mémoire. Chaque redémarrage Railway effaçait tout → attaque replay possible après restart.
- **Fix** : Redis `SET NX EX 600` atomique. Vérifié en prod : 409 sur replay.

### F004 — document_access_logs catch silencieux
- **Statut** : ✅ FIXÉ — 2026-05-13
- **Fichier** : `backend/src/security/document-access-log.ts`
- **Description** : `catch {}` vide — les erreurs d'insertion dans `document_access_logs` étaient silencieuses, impossible de débugger.
- **Fix** : `console.error('[DOC_ACCESS_LOG] ...')` avec message d'erreur Supabase.

### F005 — `document_access_logs` table manquante en production
- **Statut** : ✅ FIXÉ — 2026-05-13
- **Migration** : `supabase/migration_document_access_logs.sql`
- **Description** : La table n'existait pas en production. Tous les accès documents n'étaient pas loggés.
- **Fix** : Migration SQL exécutée dans Supabase. 5 tests de vérification passent.

### F006 — Filtre date revenus incorrect (start_date seulement)
- **Statut** : ✅ FIXÉ — 2026-05-13
- **Fichiers** : `finance.ts`, `phase5-finance.ts`, `revenue-intelligence.ts`
- **Description** : Les requêtes filtraient `.gte('start_date', startDate).lte('start_date', endDate)` → ratait les réservations démarrant avant la période mais encore actives.
- **Fix** : `.lte('start_date', endDate).gte('end_date', startDate)` — filtre overlap.

### F007 — `houariRevenue` propriété inexistante sur `FinancialReport`
- **Statut** : ✅ FIXÉ — 2026-05-13
- **Fichiers** : `revenue-intelligence.ts`, `context-builder.ts`
- **Description** : `finReport?.houariRevenue` — propriété renommée en `ownerTotal` mais pas mis à jour dans les callers.
- **Fix** : `houariRevenue` → `ownerTotal` dans les 2 fichiers.

### F008 — `owner_price_per_day` NULL pour réservations existantes
- **Statut** : ✅ FIXÉ — 2026-05-14
- **Type** : Données Supabase (pas code)
- **Description** : Après la migration des colonnes financières, `owner_price_per_day` restait NULL pour les 6 réservations existantes → profit = null dans tous les rapports.
- **Fix** : SQL UPDATE executé dans Supabase avec prix Houari réels par véhicule.

### F009 — SSE terminal streaming non fonctionnel
- **Statut** : ✅ FIXÉ — 2026-05-13
- **Fichiers** : `nexus/modules/os_agent.py`, `nexus/modules/ws_client.py`
- **Description** : `terminal_run()` ne streamait pas les lignes en live — tout était retourné en une fois à la fin.
- **Fix** : `asyncio` + `_read_stream()` coroutine + `nexus:terminal_chunk` event par ligne. `sio` passé en paramètre.

---

## Bugs Won't Fix ⚪

### B030 — Wake word "Zaria" ne fire pas en vocal (Porcupine) ⚪
- **Statut** : ⚪ WON'T FIX — 2026-10-13, Kouider n'en a pas besoin
- **Fichier(s)** : `dzaryx-native/plugins/withDzaryxWakeWord.js`, `dzaryx-native/assets/wakeword/Zaria_android.ppn`
- **Description** : le service de fond Porcupine s'initialise (notif "Zaria active" visible) mais la détection
  vocale ne déclenche pas l'overlay. La **notif tap** + l'overlay marchent comme substitut.
- **Pistes** : version lib Porcupine vs `.ppn` **v4** (mismatch silencieux), sensibilité (0.85 actuel), micro déjà
  capté par l'app. Clé Picovoice = env EAS `PICOVOICE_ACCESS_KEY`.
- **Fix** : récupérer le **logcat** du OnePlus 5T pendant un essai, vérifier l'init PorcupineManager + onWake.
  Voir [[AUDIT/08_DECISIONS#wakeword-zaria]] et [[AUDIT/10_JOURNAL_SESSION]].

---

## Comment ajouter un bug

```markdown
### BXXX — Titre court
- **Statut** : 🔴 OUVERT
- **Priorité** : HAUTE / MOYENNE / BASSE
- **Fichier** : `chemin/fichier.ts` ligne X
- **Description** : Ce qui se passe vs ce qui devrait se passer.
- **Impact** : Conséquence pour l'utilisateur.
- **Fix attendu** : Explication de la correction à apporter.
```
