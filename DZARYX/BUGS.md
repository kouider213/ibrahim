# DZARYX — Tracker Bugs

> Format : ID | Statut | Fichier(s) | Description | Fix
> Légende : 🔴 OUVERT | 🟡 EN COURS | ✅ FIXÉ | ⚪ WON'T FIX

---

## Bugs Ouverts 🔴

_(aucun bug critique ouvert — tous fixés)_

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

_(aucun pour l'instant)_

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
