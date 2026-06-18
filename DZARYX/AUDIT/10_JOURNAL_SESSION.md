# 10 — Journal de Session (VIVANT)

> ⭐ **Le fichier le plus important pour reprendre.** À chaque changement (ajout / modif / suppression),
> on note ici **en temps réel**. Si la session se ferme brusquement, le prochain Claude lit ce journal
> et sait EXACTEMENT où on s'est arrêté et quoi faire ensuite.
> Retour : [[🏠 HUB]]

---

## 📌 Comment utiliser ce journal (pour le prochain Claude)

1. **Lis l'entrée la plus récente en haut** → tu sais où on en est.
2. Regarde **"⏭️ Prochaine étape"** → tu sais quoi faire.
3. Avant de coder : `tsc --noEmit` doit être à 0. Après chaque action : **ajoute une ligne ici**.
4. Format d'une entrée :
   ```
   ### YYYY-MM-DD HH:MM — Titre court
   - **Quoi** : ce qui a été fait
   - **Pourquoi** : la raison
   - **Fichiers** : chemins touchés
   - **Commit** : hash si poussé
   - **État** : ✅ déployé / 🟡 en cours / ❌ bloqué
   - **⏭️ Prochaine étape** : ...
   ```

---

## 🟢 ÉTAT ACTUEL (dernière mise à jour : 2026-06-17)

> **Session 2026-06-17 (grosse) — clôturée proprement, tout déployé + testé.** Voir les entrées `### 2026-06-17` ci-dessous (plus récent en haut). Résumé : widget chatbot tué ; **dates "jours inclus" partout** + CA cohérent + scan passeport→résa (file_url/storage_path NOT NULL) ; rappels à date précise ; fuseau + GPS auto ; **résilience €0 re-prouvée live** (Groq/Gemini, sauf Railway ~5€/mois + domaine ~12€/an) ; **page B2B `/entreprises`** (3 packs, 100% FR/AR/EN, hero S580) + devis entreprise depuis l'app ; **notifs site `await`** (Telegram réparé) + lead→push app ; fiche client éditable + suppr demandes in-app ; **CMS Admin→Contenu** (textes/photos, SQL `0032` lancé ✅) ; photos hero compressées ; hero accueil S580 ; agenda = liste résas du mois. **SW simulateur = v112.** Tous SQL du jour lancés ✅ (0031, nb_days/paid fixes, 0032). Devise reste par-annonce (€/DA) — option taux global discutée, NON faite (choix Kouider : laisser tel quel).


- **⭐ SUIVI IMPORTATION (13-06)** : construit + déployé (commit `66bdb7f`), voir `### 2026-06-13`. **🛑 Kouider doit
  lancer `rental-system/supabase/0022_import_orders.sql`** sinon la feature échoue (table manquante).
- **SITE FIK (12-06)** : grosse session, voir `### 2026-06-12 — SESSION SITE FIK COMPLÈTE`. Tout déployé+testé live.
  SQL site lancés par Kouider : `0020_newsletter_reminders.sql`, `0021_cash_register.sql`.
- **Migrations Supabase (app/backend)** : ✅ TOUTES LANCÉES (confirmé Kouider 2026-06-11) — `migration_car_currency.sql`,
  `migration_inspection_upgrade.sql`, `migration_phase_extras.sql`. Plus aucune migration en attente.
- **Darija (06-10)** : réponse 100% darija oranaise max-arabe (labels traduits, noms propres/montants gardés),
  voix TTS arabe dédiée auto-switch (`ELEVENLABS_VOICE_ID_AR`), arabizi prononcé phonétique (3→ع etc., chiffres
  réels intacts), STT primaire = **OpenAI gpt-4o-transcribe** (Groq Whisper → Google en fallback).
- **Vocal (06-10)** : tap micro = hard reset (recorder bloqué, AudioContext, stream mort) — plus besoin de fermer
  l'app. Watchdog thinking 12s. Auto-recover micro mort au tap.
- **Features actives (06-10, décision Kouider — garder 3/6)** : `estimate_damage` (estimation dégâts par photo,
  Vision Sonnet), `create_signature_link` + page publique `/sign/:token` (signature électronique contrat, table
  `contract_signatures`), `apply_dynamic_pricing` (bloque sous prix proprio). **Retirés** : dépenses/P&L,
  alertes expiration, compteur location (`0ef121b`).
- **Scan ID (06-10)** : auto-archivage dans la fiche client (bucket `client-documents` + table `client_documents`),
  regex tolérante aux fautes (paseport, carte/pièce d'identité, CIN).
- **RESAS fix (06-10)** : MARGE calculée live = (client − proprio) × jours (champ `profit_kouider` stale ignoré).
- **Docs (06-10)** : handoff A→Z créé → **`DZARYX/HANDOFF/`** (hub + H01-H15 interliées, reprise de zéro).
- **Site (06-09, commit `eebc960`)** : autocomplétion adresse Google dans l'admin immo → carte précise sur l'annonce.

### Rappel état antérieur (2026-06-07)

- **Site** : LIVE, mode dispo "à confirmer" ON, chatbot retiré.
- **Backend** : LIVE sur Railway. Bot WhatsApp client **désactivé** (commit `fbf2a3c`). Immo unifié (commit `c6c4fd3`).
- **Immo** : schéma `properties` unifié app+site. Table prod **vide** (0 bien).
- **Migrations** : 0015/0016/0017/0018 faites. Aucune migration en attente.
- **Packs** : déployés + SQL 0018 lancé. Liés à l'inventaire réel. Gérables via chat Dzaryx. 100% opérationnel.
- **Simulateur (= l'UI réelle de l'app)** : LIVE github.io. Cache SW **v43**. ⚠️ Après chaque deploy, Kouider
  doit **fermer l'app à FOND + rouvrir** (sinon l'ancien SW sert l'ancienne UI). Voir [[dzaryx_ui_architecture]].
- **App native** : redesign Gemini fait (vocal + chat + vision). Overlay flottant **OK** (testé OnePlus 5T).
  Wake word "Zaria" (Porcupine) **branché mais ne fire PAS encore en vocal** (init/sensibilité — la notif tap
  marche comme substitut). Dernier APK installé = build wake word. **Sécu** : tokens mobiles sortis du repo → **env**
  (`5efb8e7`). EAS relié au compte Play officiel `@fikdzaryx/dzaryx` (`819a3e7`).
- **Chat Dzaryx (06-07 PM)** : façon ChatGPT/Gemini — copier, markdown, dictée vocale, régénérer, éditer, recherche
  historique, streaming typewriter, **graphiques** (barres/camembert/courbe), **téléchargement** photos+graphes.
- **Création annonces via chat (06-07 PM)** : Dzaryx crée voiture loc/vente, immo loc/vente, pack — et **attache
  les photos jointes au chat** automatiquement. **Testé live, vert.** Vision marche aussi dans le chat.

### 🛑 OÙ ON S'EST ARRÊTÉ EXACTEMENT (fin session 2026-06-07 ~18h15)

Session clôturée proprement (changelog `aa8b2d0`, journal à jour). Tout déployé + testé live. **Reste 3 trucs,
tous OPTIONNELS** (Kouider a explicitement exclu le Play Store pour l'instant) :

1. **Wake word "Zaria" en vocal ne fire pas** — Porcupine s'initialise mais ne détecte pas la voix. La notif tap +
   l'overlay marchent comme substitut. → **Besoin des logs du device** (logcat OnePlus 5T) pour debugger. Pistes :
   version Porcupine vs `.ppn` v4, sensibilité (0.85), micro déjà capté par l'app.
2. **Upload + analyse PDF/Excel dans le chat** — pas fait. Envoyer un contrat/facture/tableau → Dzaryx lit/analyse.
   ~1h de boulot, besoin parsing backend.
3. **Vérifs côté Kouider (juste tester sur l'app réelle, pas du code)** : vision chat, store photos Jumpy,
   création annonce + photos sur autolux. (Tout vert en test backend, à confirmer sur device.)

**Play Store** = exclu pour l'instant (build prod AAB + clé de signature Google requise quand on voudra publier).

---

## Entrées (plus récent en haut)

### 2026-06-17 (feat) — CMS contenu site + devis entreprise app + compression photos ⭐⭐
> Site `rental-system` (`ca15ebb`, `2b37137`) + simulateur (`711215c`, SW v111).
- **CMS contenu** : `site_settings.content` (JSONB, SQL `0032_site_content.sql` 🛑 à lancer) + `lib/content.js` (`cText`/`cImg` + schéma `CONTENT_FIELDS`) + **Admin → Contenu (textes/photos)** (`/admin/contenu`, FR/AR/EN + upload). Câblé : page entreprises (hero photo/titre/sous-titre, 3 packs nom+desc) + accueil (titres sections services/pourquoi). Vide = valeur par défaut (zéro risque). Extensible : ajouter une entrée à `CONTENT_FIELDS`. Hero accueil + contact déjà éditables via Admin→Paramètres.
- **Devis entreprise depuis l'app** : DevisScreen → boutons packs Platinium/Gold/Diamant → PDF+WhatsApp.
- **Perf** : photos hero compressées (2.5Mo→257Ko, 2.4Mo→244Ko). Bandeau réassurance /reservation.

### 2026-06-17 — Vérif résilience €0 (re-test live) + page B2B + hero + traductions ⭐⭐⭐
> Session longue. Récap des travaux du jour (tout déployé) :
- **Résilience €0 re-prouvée LIVE** (sans toucher prod) : `/health` `survives_zero_cost:true` groq+gemini 🟢 ; test-fallback (provider forcé HS → relais auto + vraies données, 0 crash) ; **Groq site** /api/translate FR→EN ✅ ; **Groq backend** /api/translate FR→AR ✅ (= clé du `agentic-fallback`). Cascade confirmée code : chat+151 outils Claude→Groq/Gemini agentic→Groq→OpenAI ; vision Claude→Groq→OpenAI ; STT OpenAI→Groq Whisper→Google ; TTS ElevenLabs→Gemini→device ; site translate/blog Groq. Limite : endpoint test-fallback câblé Claude (ne montre pas Groq) ; preuve ultime = couper clé Claude prod (pas fait, "rien casser"). Conclusion : **app+site tournent à €0 sauf Railway (~5€/mois, 24/7) + domaine (~12€/an, site).**
- **Page B2B `/entreprises`** créée (3 packs Platinium/Gold/Diamant sur devis, formulaire→lead `entreprise`→Telegram+push app+WhatsApp), hero photo S580 chauffeur, 100% trilingue FR/AR/EN en dur. Voir [[b2b_entreprises_page]].
- **Notifs site** : `notifyTelegram` passé en `await` partout (serverless tuait l'envoi → Telegram perdu) ; lead notifie aussi push app. Voir [[serverless_await_notif]].
- **App** : fiche client éditable (résa: passeport/prix/dates/statut + profil négo) ; supprimer demandes depuis DEMANDES ; rappel à date précise (`at_date`) ; GPS auto au démarrage ; fuseau auto (X-Timezone). Scan passeport→résa (file_url/storage_path NOT NULL fixés). Dates "jours inclus". CA cohérent partout. Auto-reload app sur nouvelle version (SW). SW v110.
- **Accueil** : nouvelle photo hero S580 + label véhicule retiré.

### 2026-06-17 (fix+feat) — Notifs site await + supprimer demandes depuis l'app ⭐⭐
> Site `rental-system` + backend/sim Dzaryx.
- **Notifs Telegram perdues** (`5160811`) : `notifyTelegram` non-`await` en serverless → tué quand la réponse part (app push marchait car await). Tous les envois (lead/dossier/import/avis/newsletter/résa) passés en await. + lead notifie maintenant AUSSI le push app (`26a0341` via webhook `/api/fik-site/notify`). Voir [[serverless_await_notif]]. Vérifié : env Vercel TELEGRAM_*/IBRAHIM_WEBHOOK_SECRET présentes ; webhook backend testé `{ok:true}`.
- **Supprimer demandes depuis l'app** (`d4b1bca`, SW v110) : backend `POST /api/demandes/delete` (lead/dossier/import/booking, direct Supabase) + bouton 🗑️ Suppr (2 taps confirmer) dans DemandesScreen.

### 2026-06-17 (feat) — Fiche client : voir + modifier toute la résa + profil ⭐⭐
> Backend (`8331677`) + simulateur (SW v108).
- **Demande Kouider** : depuis CLIENTS, voir toutes les infos résa (passeport/permis/dates/modèle) + tout modifier (négociation, etc.).
- `getClientHistory` fait déjà `select('*')` → résa contient passeport/prix/payé. Étendu type `ClientBookingHistory`.
- **Affichage** par résa : prix client/proprio/j, marge, payé+reste, statut, N° passeport+expiration.
- **Édition résa** : bouton "Modifier la réservation" → dates (jours inclus), prix/j, payé, statut, paiement, passeport ; recalc nb_days/final_price/profit ; PATCH `/api/bookings/:id` (accepte déjà tous champs).
- **Édition profil** : "Modifier le profil" → négociation, fiabilité, durée typique, notes → nouveau `PATCH /api/clients/intelligence` (par owner_id + client_name).

### 2026-06-17 (feat) — Fuseau auto (déjà OK) + détection GPS auto ⭐
> Simulateur (`806e83d`, SW v106).
- **Fuseau horaire rappels** : DÉJÀ automatique. L'app envoie `X-Timezone` (= `Intl…timeZone` du device) à chaque message ; chat route le stocke (Redis `user:tz:session`) ; `schedule_reminder` l'utilise (priorité device > Bruxelles). Bascule Algérie/Belgique selon le réglage auto du tél. Rien à coder.
- **GPS position (Réglages)** : était manuel (clic "Partager ma position" à chaque fois). Rendu AUTO : si permission accordée, refresh silencieux au montage (`permissions.query` + `shareLocation(true)`). Fix bug : `onClick={shareLocation}` passait l'event comme arg `silent`.
- **GPS auto APP-WIDE** (`9ab670b`, SW v107) : détection aussi au login dans `Phone.tsx` → position rafraîchie en silence à chaque ouverture de l'app (pas que l'écran Réglages). 1ʳᵉ fois = autoriser, ensuite auto.

### 2026-06-17 (feat) — Rappel à une DATE future précise ⭐⭐
> Backend (`54869e9`, Railway).
- **Bug Kouider** : "fais le rappel pour le 29 juillet" → Dzaryx "impossible, met toujours demain" + rappel répété chaque jour.
- **Cause** : `schedule_reminder` n'avait que `delay_minutes` + `at_time` (HH:MM, retombe sur demain). Aucune date.
- **Fix** : param `at_date` (YYYY-MM-DD) + helper `parseLocalDateTime` (date+heure en timezone→UTC, refuse le passé). Rappel UNIQUE ce jour-là. Description outil corrigée (Dzaryx sait qu'une date future est possible).

### 2026-06-17 (fix) — Persist scan : storage_path AUSSI NOT NULL (2e colonne) ⭐⭐⭐
> Backend (`8bcce41`, Railway). `client_documents` a DEUX colonnes NOT NULL que scanIdentity ne fournissait pas : `file_url` ET `storage_path`. Donc scanIdentity n'a JAMAIS persisté (les docs avril/mai venaient de `/api/documents/upload` qui les remplit). Fix : fournir `storage_path` (chemin uploadé, '' si échec). Insert vérifié OK (201). 🛑 Kouider : refaire un NOUVEAU scan (envoyer la photo) pour tester — la récup seule ne crée rien.

### 2026-06-17 (fix) — CAUSE RACINE persist scan : file_url NOT NULL ⭐⭐⭐
> Backend (`470e5ec`, Railway) + sim SW v104. Pourquoi les scans ne s'enregistraient jamais (table `client_documents` vide pour Morald malgré scans répétés).
- **Test direct (curl service key)** : insert `client_documents` avec `file_url:null` → **erreur 23502 "null value in column file_url violates not-null constraint"**. L'upload bucket lui marche (HTTP 200). Donc quand l'upload photo échouait, `file_url` null → insert rejeté → AUCUN doc enregistré (même pas les données OCR).
- **Fix** : `file_url: fileUrl ?? ''` (jamais null) → la fiche + données OCR se sauvent toujours, photo si dispo. ClientsScreen affiche "(sans photo)" si pas d'URL. Retrieval fallback (n° sur la résa) couvre déjà le cas "pas de photo".
- ⚠️ Kouider : re-scanner Morald via le bouton CLIENTS → doit persister cette fois.

### 2026-06-17 (feat) — Ajouter passeport/permis depuis la fiche client (sans chat) ⭐⭐
> Backend (`c197cc3`, `547933b`) + simulateur (SW v103). Demande Kouider : pouvoir ajouter le passeport directement depuis l'écran CLIENTS, enregistré auto avec la résa.
- **Scan via chat amélioré** (`c197cc3`) : message final adapté si la pièce est rattachée à une résa existante (ne propose plus de "créer la réservation") ; upload photo et insert `client_documents` SÉPARÉS (la fiche s'enregistre même si l'upload échoue) + logs d'erreur explicites.
- **Nouveau** (`547933b`) : `POST /api/clients/scan-document` → `scanIdentity` avec override `{clientName, clientPhone}` (stocke sous le bon client AVEC téléphone → visible dans la fiche, et rattache le n° à la résa par téléphone exact). Boutons "🪪 Ajouter passeport" / "🚘 Ajouter permis" dans le détail client (ClientsScreen) → photo → scan → recharge fiche + toast.

### 2026-06-17 (fix) — Passeport photo détourné vers "photos-voiture" (vraie cause) ⭐⭐⭐
> Simulateur (`a22907c`, SW v102). LE bug que Kouider voyait ("il enregistre pas").
- **Symptôme** : photo passeport + "Enregistre le passeport de Morald avec sa réservation" → réponse "❌ Je n'ai pas reconnu la voiture".
- **Cause (FRONTEND, pas backend)** : `TextScreen.send` ligne 303 — `isStoreIntent` capte "Enregistre" → route vers `api.uploadCarPhotos` (ranger photo sur une VOITURE existante) → aucune voiture → erreur. L'image n'atteignait JAMAIS le pré-route scan ID backend.
- **Fix** : ajout `isIdDocIntent` (passeport/permis/CIN, typos tolérées) qui exclut les pièces d'identité du rangement photo-voiture → l'image part au chat normal → pré-route `scanIdentity` backend s'exécute (puis rattache à la résa, cf entrée précédente).

### 2026-06-17 (feat) — Scan passeport rattaché auto à la réservation ⭐⭐
> Backend `ibrahim` (`257ad3d`, Railway).
- `scanIdentity` : après OCR d'une pièce, écrit `client_passport` + `passport_expiry` sur la résa du client (match nom flexible, gère ordre prénom/nom inversé "MORALD BOUFRAINE" vs "Boufraine Morald"). Message "🔗 Passeport rattaché à la réservation".
- Bug latent corrigé : `scanIdentity` stockait `type` en FRANÇAIS ('passeport'/'permis') alors que tout le reste + la récup attendent l'ANGLAIS ('passport'/'license') → normalisé. (Cause probable d'échecs de récup par type.)

### 2026-06-17 (fix) — Récup passeport : fallback sur le n° de la résa ⭐
> Backend `ibrahim` (`3ba7df9`, Railway). `client_documents` marche (10 docs) mais le scan de Morald (aujourd'hui) n'a PAS persisté (dernier save 12/05) — cause non reproduite (OCR/upload ?). À surveiller si ça se répète.
- `get_client_document` ne lisait QUE `client_documents` → "donne-moi le passeport de X" échouait si pas de photo scannée, même si le n° est sur la résa (`client_passport`). Ajouté fallback : cherche `bookings.client_passport` et renvoie le numéro en texte.
- Boufraine corrigé en base (acompte 150 PARTIAL + passeport 308542744 / exp 2033-01-24 sur la résa).

### 2026-06-17 (fix) — create_booking via chat : acompte + passeport étaient PERDUS ⭐⭐⭐
> Backend `ibrahim` (`8493e92`, Railway).
- **Symptôme Kouider** : donne passeport + acompte + total + dates dans le chat → Dzaryx n'enregistre que l'acompte et les dates (en fait même l'acompte était perdu).
- **Bugs trouvés dans `createBooking` (tool-executor)** : `payment_status` CODÉ EN DUR à `'UNPAID'` + `paid_amount` JAMAIS inséré → acompte jeté même si extrait. `client_passport`/`passport_expiry` absents du schéma ET de l'insert (les colonnes EXISTENT pourtant sur `bookings`) → passeport perdu. `nb_days` encore en exclusif (raté au passage inclus).
- **Fix** : paid_amount inséré + payment_status déduit (payé vs total) ; client_passport/passport_expiry ajoutés à `create_booking` ET `update_booking` (+ déduction auto statut sur update d'acompte) ; nb_days inclus. Descriptions outils renforcées (toujours remplir acompte/passeport). tsc 0.
- 🛑 SQL Kouider pour Boufraine (acompte 150 réel + passeport scanné) — voir réponse.

### 2026-06-17 (fix) — CA identique entre écrans + Mohamed nb_days + tests ⭐⭐
> Simulateur (`5c06086`, SW v101). Suite vérif chiffres Kouider.
- **Incohérence vue** : écran CA (Finances) = 4.4k€ vs écran Réservations = 6.2k€. **Cause** : BookingsScreen sommait `final_price` de TOUTES les résas (REJECTED + tests inclus) ; Finances ne compte que CONFIRMED/COMPLETED/ACTIVE. **Fix** : BookingsScreen exclut les REJETÉES du CA + marge → même définition partout.
- **Bug introduit par le passage "jours inclus"** : Mohamed Bendaoud a `nb_days=null` → fallback inclus = 10j×50 = 500€ au lieu des 450€ facturés (9j). 🛑 SQL Kouider : `update bookings set nb_days=9 where client_name='Mohamed Bendaoud' and start_date='2026-05-08'`.
- **3 résas test REJECTED** (client "Kouider" : i10 50€, Clio4 70€, Jumpy 1705€) → polluent la liste. 🛑 SQL Kouider (optionnel) : `delete from bookings where status='REJECTED' and client_name ilike 'Kouider%'`.
- Après ces 2 SQL : CA = 4.35k identique sur Finances ET Réservations ; marge ≈ 486€ = profit annuel.

### 2026-06-17 (fix) — Jours de location = JOURS INCLUS partout + correction data ⭐⭐⭐
> Backend `ibrahim` (`f01466c`) + simulateur (SW v100) + site `rental-system` (`c3af9ab`). Déployé Railway + gh-pages + Vercel.
- **Demande Kouider** : vérifier que les chiffres CA sont corrects + identiques sur chaque page. Audit data réelle (7 résas 2026 via Supabase REST).
- **Diagnostic** : totaux cohérents entre eux MAIS plusieurs prix individuels faux car `nb_days` stocké ≠ plage de dates, et l'app recalcule `prix/jour × nb_days`. Omar (nb_days 15→16), Sophia (24→25), Boufraine (null→16), Taoufik payé 240 au lieu de 210.
- **Convention décidée (Kouider)** : location = **JOURS INCLUS** (jour départ + jour retour comptent). 24/07→08/08 = 16j. Ristourne = éditer nb_days. Prix = prix/jour × jours (recalcul).
- **Fix data** : SQL UPDATE donné à Kouider (nb_days Omar/Sophia/Boufraine + paid_amount Taoufik=210). 🛑 À lancer par Kouider dans Supabase.
- **Fix code** : `+1` jour inclus à TOUTES les créations (app BookingsScreen helper `daysInclusive`, backend bookings.ts + reservation.ts) + cœur `computeBookingFinancials` + tous fallbacks d'affichage (clients, revenue-intelligence, index, sign, excel, client-brain) + site (reservation, admin/bookings, calcNbDays, pdf). `daysBetween` générique site (dispo/overlap) INCHANGÉ. tsc 0 backend+sim, build site OK.
- ⚠️ Effet : le total client sur le site compte désormais le jour de retour aussi (+1 jour de prix). Voir [[day_count_inclusive]].

### 2026-06-17 (fix) — Dates cohérentes partout (fin décalage fuseau UTC) ⭐⭐
> Backend `ibrahim` + simulateur. Commits `53cda26` (fix) + `0fb1cad` (SW v98→v99). Déployé Railway + gh-pages.
- **Symptôme Kouider** : résa notée 24/07→08/08 affichée incorrecte ET différente selon la page (agenda vs clients).
- **Cause racine = mélange UTC/local** : `CalendarScreen.isoDate` et `FleetScreen.eachDay/todayIso` formataient les jours via `toISOString()` (UTC) alors que les cellules/dates sont construites en LOCAL → décalage d'1 jour en Algérie (UTC+1) → pastilles de résa et jours indispo sur le mauvais jour.
- **Cause 2** : backend `/api/clients` renvoyait `lastBookingDate = created_at` (date de création = aujourd'hui) au lieu de `start_date` (date de location) → "Dernière : 2026-06-17" au lieu de 07-24, incohérent avec l'historique.
- **Fix** : `isoDate` format LOCAL + `parseYmd` (lit date-only sans bascule UTC) dans CalendarScreen ; `eachDay`/`todayIso` en local dans FleetScreen ; `/api/clients` ajoute `start_date` au select → `lastBookingDate = start_date`. tsc 0 backend+simulateur.
- ⚠️ RÈGLE : pour les dates-only ("YYYY-MM-DD"), JAMAIS `new Date(str)` ni `toISOString()` (=UTC) ; formater/parser en LOCAL. Voir [[date_handling_local]].

### 2026-06-17 (fix) — Widget chatbot résiduel tué pour de bon ⭐
> Site `rental-system` commit `c84411c` (Vercel). SQL 0031 lancé ✅.
- **Symptôme Kouider** : le vieux widget chatbot réapparaissait parfois (au-dessus du bouton WhatsApp) puis disparaissait au refresh, même après vidage historique.
- **Cause racine** : `_document.js` chargeait ENCORE `<script src="/widget.js" async />` → injecté à chaque page (flash), puis retiré tardivement par le cleanup `_app.js` (qui cherchait un id inexistant `ibr-widget-script` + ne retirait qu'UN élément). Le widget (`ibr-btn`/`ibr-win`) partage la position du bouton WhatsApp.
- **Fix** : retiré le `<script>` de `_document.js`, supprimé `public/widget.js`, renforcé le cleanup `_app.js` (tue TOUS les `[id^="ibr-"]` + scripts `widget.js`, re-tente à 800ms pour le HTML servi par un SW en cache). Build OK.

### 2026-06-17 — Bon de réservation + concurrence sans "didano" ⭐
> Backend `ibrahim` (`99a8952`) + site SQL (`a4db0ca`). Déployé Railway + gh-pages (SW v94).
- **Bon de réservation** (comme le devis) : tuile **BON RÉSA** dans Plus d'outils → `ReservationVoucherScreen`. Confirme résa véhicule + acompte. Champs : prénom/nom, n° passeport, véhicule (datalist voitures), période, lieu récupération + dépôt (chips Aéroport/Bureau), total/acompte/reste, langue. → PDF pro (`/api/reservation-voucher/pdf`, pdfkit→bucket, signatures) + WhatsApp 3 langues + historique. **Testé live HTTP 200** (BON-HRGNHA.pdf).
- ✅ SQL `rental-system/supabase/0031_reservation_vouchers.sql` lancé par Kouider (2026-06-17) → historique "Bons récents" actif.
- **Concurrence** (`795513d`) : retiré "didanolocation" codé en dur (n'existe pas) de 7 fichiers → Dzaryx découvre les vrais concurrents par recherche web réelle. Analyse confirmée RÉELLE (web_search, verdict VERIFIED/PARTIAL/FAKE).

### 2026-06-15 (+3) — SEO conciergerie + décisions Kouider ⭐
> Site `rental-system` commit `cc3a8fe` (Vercel). + clarifs.
- **SEO positionnement conciergerie** : title/description accueil + `_app.js` (og/twitter) + `/api/og` (image partage) + JSON-LD `@type AutoRental → [LocalBusiness, AutoRental, RealEstateAgent]`. Avant : tout criait "location de voiture". Contenu accueil déjà OK (hero + 6 pôles rendus). Reste Kouider (optionnel, auto sinon) : re-crawl Search Console + FB sharing debugger + catégories Google Business.
- **Décisions Kouider 2026-06-15** :
  - ❌ **Pas de paiement/acompte en ligne** (Stripe/PayPal/Chargily) — frais cassent le €0. Résa WhatsApp, paiement sur place. NE PLUS reproposer. Voir [[no_online_payment]].
  - ❌ **Chatbot site retiré DÉFINITIF** — dérangeait/chevauchait le bouton WhatsApp. NE PLUS reproposer.
  - ✅ **Token GitHub `ghp_d8Vch…` RÉVOQUÉ** (confirmé Kouider). Plus une action en attente.
  - 🟡 **App Play Store** : Kouider le fera ce soir (PC éteint maintenant).

### 2026-06-15 (+2) — Opportunités : notif urgentes + "Demander à Dzaryx" ⭐
> Commit `1566b6c`. Déployé Railway + gh-pages (SW v93).
- **Notif push urgentes** : `jobOpportunitiesRefresh` (quotidien) notifie SEULEMENT les NOUVELLES urgentes (dédup redis `deals:opp:notified:v1`, pas de spam). Deep-link → écran `opportunities`. Digest hebdo aussi re-pointé sur `opportunities`.
- **Bouton "🤖 Demander à Dzaryx d'approfondir"** sur chaque opportunité (modal) → stash `localStorage dz:ask_prompt` + nav vers chat ; `TextScreen` consomme au montage + auto-envoie un prompt d'analyse (titre+detail+action+contexte business Kouider).

### 2026-06-15 (fix) — Opportunités : endpoint non-bloquant (écran gelé) ⭐
> Commit `634ad79`. Cause racine trouvée + corrigée + vérifiée live.
- **Symptôme** : écran bloqué sur "Dzaryx analyse le marché…". **Cause** : `GET /api/deals/opportunities` faisait le web search Claude EN SYNCHRONE (≥90s, `curl` timeout HTTP 000). Front sans timeout → gel infini.
- **Fix** : endpoint NON-BLOQUANT. `getAutoOpportunities()` sert le cache direct + lance la génération en arrière-plan (fire-and-forget, dédup via `_inFlight`). 1ʳᵉ fois sans cache → `{pending:true}` immédiat. `generateOpportunities()` (bloquant) extrait pour les crons.
- **Front** : état "analyse en cours, reste ici" + **auto-poll toutes les 12s** (8 essais) jusqu'à remplissage. Plus jamais de spinner infini.
- **Vérifié live** : endpoint répond ~0.1s, **14 items, 9 axes** (import/loi/change/location/immo/vente/invest/aide/business). Élargi aux ajouts du jour (devises euro-dinar +70% parallèle, IDE, ANADE/ANGEM, tourisme médical, agro…). SW v92.

### 2026-06-15 (suite) — Opportunités : onglet dédié + analyse multi-axes ⭐
> Commit `cbdc749`. Déployé Railway + gh-pages (SW v89→v90).
- **Tuile OPPORTUNITÉS** ajoutée dans "Plus d'outils" (`Phone.tsx` TABS + Page + route) → `OpportunitiesScreen.tsx` dédié (avant : caché dans 3e onglet d'ACHAT, dur à trouver).
- Écran : Hero, synthèse + Actualiser, **filtres par axe** (Tout/Location/Achat-Revente/Immo/Import/Business/Lois) avec compteurs, cartes cliquables → modal lecture complète.
- **Analyse élargie** (`opportunities.ts`) : plus seulement l'auto. Prompt couvre location, achat/revente, **immobilier**, import, lois, **autre potentiel business** Oran. 8-12 items multi-axes. Catégories `location|vente|import|immo|business|loi|marche`, cache `v1→v2`.
- DealsScreen onglet Opportunités gardé (OPP_META synchro nouvelles catégories).

### 2026-06-15 — Opportunités : quotidien dans l'app + digest hebdo sur le chat ⭐
> Backend `ibrahim` (commits `4b14406`, `e2fed74`) + simulateur (gh-pages). Demande Kouider : voir les opportunités TOUS LES JOURS dans l'onglet, mais notif chat 1×/semaine avec l'important.
- **Bug ressenti "marche pas"** : 1ʳᵉ ouverture sans cache → web search Claude ~30-40s, spinner infini si lent/échec, aucun feedback. Fix : états erreur/vide explicites + bouton **Réessayer** (`DealsScreen.tsx`).
- **Lecture complète** : cartes opportunités cliquables → **modal** (detail complet + bloc "À FAIRE"). Carte tronquée 2 lignes + "Lire →". Prompt backend assoupli (detail 3-6 phrases).
- **Quotidien vs hebdo** (séparé) : cron `opportunities-refresh` 7h/jour = **refresh SILENCIEUX du cache** (onglet frais chaque jour, pas de notif) ; cron `opportunities-watch` samedi 9h = **digest "important de la semaine" sur le chat** (`emitProactive`). Cache TTL 12h→25h. `jobOpportunitiesRefresh` ajouté.
- tsc backend 0 + simulateur 0. Déployé Railway + gh-pages.
- **⏭️ Kouider** : fermer/rouvrir l'app à fond (SW v89) pour voir l'onglet maj. La 1ʳᵉ analyse peut prendre ~40s puis c'est instantané (cache).

### 2026-06-14 (soir 3) — Finitions + vault Obsidian interactif ⭐
- **Design "wow"** : écran Clients validé → style premium propagé PARTOUT (`ui/Premium.tsx` : Hero, StatCard, SearchPill, OrbIcon, SkeletonCards). Voix/Chat : logo doré → orbe. Bulles chat distinctes.
- **Petits +** : devis PDF joint au WhatsApp ; réglages notifications par type (Redis `push:prefs`, route `/api/push-token/prefs`) ; **gérer photos** (voir/ajouter/supprimer) sur annonces immo (`ImmoProScreen`) ET vente (`VentePane`) — endpoints `/api/immo/.../photos` GET+DELETE.
- **Recherche cliquable** + **skeletons** + **onboarding 3 écrans** (commit `bc639fb`).
- **Vault Obsidian refait** (`ec0f101`) : ACCUEIL/ARCHITECTURE/ECOSYSTEME/BASE_DONNEES/ROADMAP/canvas + SITE/ + APP/ + GUIDE/ + DECISIONS + FAQ + Nexus. Mermaid + callouts + liens.
- Houari : reste kouiderOnly (décision). Sécurité clean. Tous SQL lancés (0028/0029/0030).
- Commits clés : `71cf350` (PDF WA + notif prefs), `4f502e8` (photos immo), `41d6984` (photos vente + docs).

### 2026-06-14 (après-midi 2) — App "pro €0" : icône, offline, + 9 features business ⭐⭐⭐
> Simulateur + backend. Tout €0 (Groq/Supabase/wa.me), seul Railway payant.

**Design** : icône d'app = Orbe IA (turquoise+or, ni robot ni logo Fik) — `simulator/public/icons` + `DzaryxIcon` SVG. PARC/CA headers premium + prix PARC "Proprio/Client/Marge" (clip retiré). ⚠️ NE PAS redessiner à l'aveugle (échecs cartes, revert) — voir [[app_design_and_offline]].

**Mode hors-ligne** (`d856298`) : apiFetch cache GET (localStorage) → resert dernière donnée + bannière offline. SW v89.

**9 features business livrées** (onglets, tous kouiderOnly sauf indiqué) :
- **Devis instantané** multi-service → WhatsApp langue client (`8988846`).
- **Assistant WhatsApp rédactionnel** `/api/whatsapp/draft` Groq (`aff1855`).
- **Accepter résa depuis l'app → Google Agenda** (`060859e`, demandes.ts createCalendarEvent).
- **Aujourd'hui** (command center), **Prévision** saison, **Relance** CRM : backend `insights.ts` (`3fe984c`).
- **Social** (captions+hashtags Groq `social.ts`), **Recherche globale** (`search.ts`).
- **Parrainage** (`referrals.ts`, SQL `0029_referrals.sql` À LANCER), **Prix conseillés** (occupation+saison).

**Finitions (soir 2)** : nav regroupée (8 essentiels + menu ⋯ Plus = ToolsGrid) ; fix `window.confirm` bloqué WebView → suppression inline 2-taps (Parrainage/Avis/Blog/Immo) ; **PDF devis** (`/api/quote/pdf` pdfkit→bucket) ; **tracking auto parrainage** (champ code sur réservation site + `/api/referral-use` incrément). SQL `0029_referrals` lancé ✅.

**🛑 Action Kouider** : lancer `rental-system/supabase/0029_referrals.sql` ✅ fait. Révoquer token GitHub `ghp_d8Vch…` (reste). Groq/Gemini régénérés ✅.
**Reste** : design "wow" (perfectionner 1 écran labo avec feedback) ; PDF devis ; tracking auto parrainage (intégration site) ; nav chargée (~26 onglets → à regrouper).


### 2026-06-14 — Audit code A→Z + avancement étapes dossier/import DEPUIS l'app ⭐⭐
> Backend `ibrahim` (Dzaryx) + simulateur (UI réelle). Push natif/wake word/briefing/PDF = confirmés FAITS (docs périmées rattrapées : CURRENT_STATE + ROADMAP).

**Audit** : vérif code réel. Push natif (FCM+Expo+WebPush, `FIREBASE_SERVICE_ACCOUNT_JSON` sur Railway = live), wake word Zaria (plugins), briefing matin (`jobMorningBriefing`), PDF chat (`api/routes/pdf.ts`) — TOUS déjà faits + buildés. Docs disaient "à faire" → corrigées.

**Actions in-app dossier/import (nouveau)** : avant, avancer un dossier achat/immo/pack ou une importation = bouton "Gérer" → renvoyait au site. Maintenant pilotable depuis l'app.
- Backend `api/routes/demandes.ts` : `/api/demandes/update` proxyait DÉJÀ dossier+import vers le site (`update-dossier`/`update-import-order`). Ajouté `kind` au payload dossier (pour choisir le bon parcours).
- Simulateur `DemandesScreen.tsx` : parcours d'étapes (codes identiques `lib/importStatus`+`lib/dossierStatus` du site) : import 8 étapes, dossier voiture/immo/pack. Bouton **"→ ÉTAPE SUIVANTE"** (déclenche email/WhatsApp auto client via le site) + "Annuler" + label étape courante. "✓ Terminé" à la dernière.
- tsc backend 0 + simulateur 0. Déployé : push main (Railway) + `npm run deploy` (gh-pages).

**Upload photos in-app (suite, même jour)** : bouton "📷 Ajouter une photo" sur cartes dossier/import.
- Backend `POST /api/demandes/photos` : upload via site `/api/upload-car-image` (bucket) → url ; lit `photos[]` existant (Supabase direct) ; append ; patch via site `update-import-order`/`update-dossier`. Visible aussitôt sur page suivi publique client.
- Simulateur `DemandesScreen` : `<input type=file>` → base64 → POST. Toast compteur photos.

**Machine à avis Google** (repo autolux). Cron lendemain fin location → email avis Google langue client, 1×, flag `review_request_sent_at` (SQL `0028`). ⚠️ Vercel Hobby = 2 crons max → fusionné dans cron `reminders` (commit `dce6ade`). Levier #1 ranking Oran.

**Audit app↔site + 3 features (après-midi)** — l'app gère ~80% du site, manques comblés :
1. **Fiche client complète** (`6d4e1b6`) : `/api/clients` ajoute dernière voiture+date ; `/api/clients/:phone` enrichit historique avec nom véhicule ; ClientsScreen affiche "Dernière: <voiture>·date" + au dépli historique résas complet + documents (passeport/permis/contrat cliquables).
2. **Créer dossier/import depuis l'app** (`1d6a62e`) : `POST /api/demandes/create` proxy vers create-dossier/create-import-order ; bouton "+ Nouveau" + formulaire DemandesScreen.
3. **Photos sur annonce existante** (`8e5956e`) : `/api/immo/properties/:id/photos` + `/vehicles-for-sale/:id/photos` (append Cloudinary) ; boutons ImmoScreen + VentePane. (Voitures location avaient déjà le bouton.)
**Gestion site complète depuis l'app (soir)** — combler les derniers modules site-only :
- **Newsletter** (`85f76ec`/`e2e661a`) : onglet NEWS, envoi test + à tous via site/Resend (token interne `INTERNAL_API_TOKEN` Railway=Vercel), liste abonnés. ⚠️ écran DEMANDES était branché sur LeadsScreen (mort) → corrigé vers DemandesScreen (`7a856b4`).
- **Caisse & Compta** (`6e0ebf3`) : onglet CAISSE, `/api/cash` (cash_entries), totaux mois + ajout/suppr mouvements.
- **Avis** (`34167df`) : onglet AVIS, `/api/reviews`, publier/masquer/supprimer + note moyenne.
- **Blog** (`838f197`) : onglet BLOG, rédaction IA (`/api/blog-generate`) + publication (`/api/blog`, blog_posts), site auto-traduit.
- ⚠️ PIÈGE écrans morts : nav = `Phone.tsx renderScreen` (IMMO=ImmoProScreen pas ImmoScreen ; DEMANDES=DemandesScreen). Voir [[simulator_dead_screens]].
- **⏭️ Reste** : équipe/comptes admin (sensible, garder site), pages légales/FAQ (rare), analytics (lecture) = site-only volontaire ; distribution Play Store.

### 2026-06-13 (nuit 5) — Audit Dzaryx A→Z + survie €0 PROUVÉE + WhatsApp centralisé ⭐⭐
> Backend `ibrahim` (Dzaryx) + site `rental-system`. Commit Dzaryx `85daa12` (health résilience), site `6a1f701` (WhatsApp).

**Audit Dzaryx A→Z** : backend 50 512 lignes TS / 193 fichiers, **tsc 0 erreur**, **live** (Railway /health 200). 40 routes API,
**151 outils**, 6 agents, orchestrateur (gates anti-hallucination 1-4, mémoire, mood, focus…), résilience multi-LLM.
Risques : token GitHub `ghp_d8Vch…` jamais révoqué, clé Maps non restreinte, routes debug `/test_*` en prod, PWA Netlify morte.

**Survie €0 PROUVÉE par test réel** (clés Groq+Gemini fournies par Kouider, à régénérer) :
- ✅ Chat + appel d'outils + **vraies données Supabase** (15 voitures listées) via **Groq** gratuit.
- ✅ **Vision** : "Fiat 500 grise" sur vraie photo via **Groq llama-4-scout** (déjà dans la cascade vision, ligne 348 orchestrator).
- ✅ **TTS** (voix) via Gemini · ✅ **STT** via **Groq Whisper** (retranscrit "Bonjour bienvenue chez Fik Conciergerie").
- Bascule auto quand Claude meurt (agentic-fallback, mêmes outils). TTS→device, STT→Groq. **Tout le quotidien tourne à €0.**
- `/health` enrichi : `resilience.survives_zero_cost: true`. Confirmé live `groq 🟢 gemini 🟢`.
- **Seule limite €0** : l'hébergement. Railway payant (~5€/mois) = 24/7. Render gratuit (render.yaml prêt) **dort** → proactif 24/7 KO.
  Marketing vidéo payant (Kling/fal/Apify) s'arrête. Kouider GARDE Railway.

**WhatsApp centralisé (site)** (`6a1f701`) : le n° WhatsApp vient de `site_settings.whatsapp` → changer dans Admin→Paramètres
le remplace PARTOUT (29 pages client + emails via `refreshBrand()`). **Modif réservée au super admin** (is_super, champs verrouillés
sinon, exclus du payload). 3 numéros (principal + 2 associés sur Contact). **Limite dite** : wa.me = 1 destinataire (pas de broadcast
3 numéros) ; les formulaires arrivent sur Telegram quoi qu'il arrive ; le WhatsApp direct (client tape lui-même) = WhatsApp only (normal,
le site ne voit pas les messages WhatsApp privés sans l'API Business). Téléphone schema SEO = champ à part (maj manuelle si changement définitif).

### 2026-06-13 (nuit 4) — Système de comptes admin complet + relance auto leads + notifs newsletter/avis ⭐⭐
> Site `rental-system`. Commits `8176199` (notifs newsletter/avis) · `3d9f7d6` (relance leads) · `275fd70`/`3313f9a`/`9ff87b6` (auth admin). SQL `0026`, `0027` lancés ✅.

**Relance auto leads** (`3d9f7d6`, SQL `0026`) : `client_leads.client_email` + `relance_sent_at`. Champ email optionnel
dans LeadCapture. Cron `/api/cron/lead-followup` (quotidien 9h) : email de relance trilingue aux leads nouveau/en_cours
avec email, créés >2j (`LEAD_FOLLOWUP_DAYS`), jamais relancés. `leadFollowUpEmail`. (keep-alive cron retiré, redondant avec reminders.)

**Notifs Telegram étendues** (`8176199`) : aussi nouvel abonné newsletter + nouvel avis (en plus de résa/lead/import/dossier).

**Système de comptes admin** (`275fd70` → `9ff87b6`, SQL `0027`) :
- `profiles.username` (unique) + `is_super`. **⚠️ Kouider ET Houari ont role='admin'** (pas 'kouider'/'houari') →
  l'`UPDATE where role='kouider'` n'a rien mis ; Kouider défini super via `update profiles set is_super=true where name='Kouider'`.
- **Login** par username OU email (`/api/resolve-login` mappe username→email) + **"mot de passe oublié"** (reset email → `/reset-password`).
- **`/admin/compte`** : changer son email/mot de passe (confirme avec mot de passe actuel = re-auth).
- **`/admin/equipe`** (super admin) : créer/lister/supprimer admins, **réinitialiser mot de passe** (jamais lisible — chiffré),
  changer email/rôle/username. `/api/admin-users` (clé service, vérif super-admin via token).
- **PIÈGE WebView re-confirmé** : `window.prompt`/`confirm` bloqués → boutons "Mot de passe/Email/Suppr" remplacés par
  panneaux intégrés (`9ff87b6`). Cf [[site_pwa_sw_trap]].
- Fix loupe barre suivi : `input-dark` force `px-4` qui écrasait `pl-11` → padding **inline** (priorité). À retenir.

**🛑 Actions Kouider** : Supabase → Auth → URL Configuration : Site URL + Redirect URL `…/reset-password` (sinon reset KO).
Changer emails login (Kouider→doubakouider@gmail.com via /admin/equipe) + mettre usernames. Nettoyer données test.
**Vérité dite** : mots de passe chiffrés, non lisibles même par super admin (réinit possible). Login username = mapping interne.

### 2026-06-13 (nuit 3) — Packs dans le suivi + re-réservation pré-remplie + notifs Telegram autonomes ⭐⭐
> Site `rental-system`. Commits `c150f12` (packs+rebook) · `74994f7` (note docs) · `3f3462f` (notifs Telegram). Live ✅.

**Packs ajoutés au suivi de dossiers** : 3e kind `pack` (ref `PCK-XXXX`) stages Demande→Confirmé→Acompte→Préparé→
En cours→Terminé. `StartDossier` sur détail pack ; admin filtre/création/icône pack ; emails trilingues. Testé `PCK-57UL`.

**Re-réservation pré-remplie** : `my-bookings` renvoie `car_id` + infos client ; bouton "Re-réserver" (mes-reservations)
→ `/reservation?car=&name=&phone=&email=&age=&passport=` → form pré-rempli (voiture + client). `reservation.js` lit la query.
Bandeau "infos modifiables" + note sous passeport (photos passeport/permis = à l'étape contrat, toujours fraîches/non périmées).

**Notifications Telegram DIRECTES du site** (`3f3462f`) — indépendant de Railway :
- `lib/telegramNotify` (`TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` sur Vercel). Notif à chaque **réservation, lead,
  commande import, dossier** (nom, tél, objet, langue, lien admin). `booking-received` appelé systématiquement (notif même sans email).
- **Nouveau bot Telegram dédié** créé par Kouider (`@Fiknotifsbot`, distinct du bot Dzaryx pour la sécu). Chat ID `809747124`.
  Variables mises sur Vercel + redeploy. **Testé live : Kouider reçoit bien les notifs.**
- ⚠️ L'ancien token Dzaryx (`@Ibrahimfikbot`) a été collé en clair dans le chat 2026-06-13 — partagé avec Railway,
  non révoqué (révoquer casserait Dzaryx). Le site utilise le NOUVEAU bot, pas celui-là.

🛑 Kouider : supprimer les tests (lead "TEST Notif", dossiers `VTE-C77V` `PCK-57UL`, import `IMP-YXK7W`).

### 2026-06-13 (nuit 2) — Résilience €0 + traduction autonome + suivi de dossiers achat/immo ⭐⭐⭐
> Site `rental-system`. Commits `4cd72a6` (résilience) · `ab1349a` (traduction autonome) · `e381518` (dossiers). SQL `0025` lancé ✅.

**Résilience "jamais down" à €0** (`4cd72a6`) :
- `/api/health` (200/503) pour monitoring · `/api/cron/keep-alive` (quotidien, vercel.json) → **empêche la pause
  Supabase free** (7j inactivité = la vraie cause de panne) · workflow GitHub `supabase-backup.yml` (pg_dump hebdo,
  90j, **secret `SUPABASE_DB_URL` requis** côté Kouider). Pages ISR servent même si DB blip. Dégradation propre partout.
- **Vérité dite à Kouider** : à €0 le site tourne (Vercel+Supabase+Resend gratuits) ; seul **le domaine ~12€/an est
  obligatoire**. Multi-hébergement failover = possible mais overkill, déconseillé. Actions Kouider : UptimeRobot + secret backup.

**Traduction AUTONOME** (`ab1349a`) : `/api/translate` hébergé SUR le site (Vercel) + `lib/groqTranslate` :
**Groq (gratuit, `GROQ_API_KEY` Vercel) → repli Railway → texte original**. `autoTranslate`+`serverTranslate` pointent
sur l'endpoint local. **Kouider a ajouté `GROQ_API_KEY` sur Vercel** → traduction 100% gratuite, ne dépend plus de Railway.

**Suivi de DOSSIERS achat véhicule + immobilier** (`e381518`, SQL `0025_dossiers.sql` lancé) — comme l'import/résa :
- Table `dossiers` (kind voiture/immo, ref `VTE-XXXX`/`IMM-XXXX`, RLS insert public + R/W admin).
- `lib/dossierStatus` (stages par kind, FR/AR/EN) : voiture = Demande→Réservé→Documents→Paiement→Prêt→Livré ;
  immo = Demande→Visite→Dossier→Contrat→Finalisé (+CANCELLED). `dossierStatusEmail` trilingue.
- APIs `create-dossier`/`dossier`/`update-dossier` (clé service, **email auto au statut dans la langue client**).
- Page publique `/suivi-dossier/[ref]` (timeline, photos, 3 langues+RTL, refresh 25s).
- Admin `/admin/dossiers` (nav "Dossiers achat/immo") : créer, statuts, photos, **WhatsApp statut+suivi multilingue**,
  badge langue, traduire notes (TranslateToFr), supprimer.
- `StartDossier` (bouton public "Suivre mon dossier" sur détail vente + immo) → n° + lien. `mes-reservations` retrouve aussi les dossiers.
- **Testé live** : create VTE-C77V, lookup sanitisé, changement statut, page 200. 🛑 Kouider : supprimer le test VTE-C77V.

**Messages WhatsApp client EN** (`65e0118`) : l'anglais manquait dans les constructeurs WhatsApp (réservation,
commande/import, détail voiture/immo/vente/pack) → tombait en FR. Corrigé : FR/AR/EN partout.

**+ 2 bonus** (`df370a7`) : 3 pages SEO (aéroport-oran, importation-algerie, occasion-oran) + sitemap/footer ;
perf polices Google via `<link>`+preconnect (au lieu de `@import` render-blocking) ; newsletter manuelle auto-traduite
par langue d'abonné (serverTranslate préserve img/boutons).

### 2026-06-13 (nuit) — Multilingue communications + audit i18n + traduction texte libre ⭐⭐
> Site `rental-system`. Commits `f8ff640` (langue client) · `1c2b73e` (audit i18n + trad admin). SQL `0024` lancé ✅.

**Langue du client mémorisée + réponses dans SA langue** (demande forte Kouider — "client arabe → réponse arabe") :
- SQL `0024_client_lang.sql` : `bookings.client_lang`, `client_leads.lang` (import_orders.lang existait). **Lancé ✅.**
- Capture : `reservation.js` (client_lang=lang), `LeadCapture` (lang), commande-import (lang déjà).
- **Emails 100% trilingues FR/AR/EN + RTL arabe** : `lib/email.js` refait avec helper `T(lang,{fr,ar,en})` + `wrap(lang)`
  (chrome, libellés, sujets, boutons traduits). Touche : demande reçue, confirmée, tous statuts, rappel J-1, import, avis, bienvenue.
- **WhatsApp admin dans la langue du client** : réservations (`sendStatusWA`+`handleWhatsApp`), import, relance leads.
- **Badge "Langue du client"** 🇫🇷/🇩🇿/🇬🇧 visible admin (réservations/import/leads) → Kouider sait quelle langue parler.
- Email réservation : seulement si client_email rempli. **Piège trouvé** : les résas test avaient `Kouider@autolux.dz`
  (login bidon) → mails rebondissaient. Ajout **édition email client** dans le modal admin (`client_email` whitelisté).

**Audit i18n (fuites FR corrigées)** : filtres prix/tri/villes/reset (immo+vente), options carburant/boîte + placeholders
(commande-vehicule), placeholder avis. Clés `common.*` réutilisables ajoutées (3 langues). Toasts client : aucun FR en dur (vérifié).

**Traduction texte libre client → FR pour l'admin** : `translateToFR()` (moteur Groq backend) + composant `TranslateToFr`
(bouton "Traduire en français") sur notes réservation, critères/notes leads, specs import. Kouider comprend un message arabe/anglais.

**Copy pro** (`a512af9`) : tous les messages emails+WhatsApp réécrits polis/chaleureux (avant : trop secs).

**Confirmation réservation** (`1d8a2dd`) : bouton "Suivre ma demande" + email "demande reçue" + encart explicatif (suivi mes-réservations).

**Fix** : barre recherche mes-reservations (loupe chevauchait le texte).

**⏭️ Reste** : audit i18n = fuites visibles corrigées, mais pas un balayage exhaustif de CHAQUE chaîne (le site utilise
t()/L() partout). Si Kouider repère un détail FR résiduel → corriger au cas par cas. Perf framer-motion : toujours laissé.

### 2026-06-13 (soir) — Newsletter médias + SEO/NAP + cookies RGPD + capture leads ⭐⭐
> Site `rental-system`. Suite de la session. Commits `e9e7a84` → `9344500`.

**Newsletter — éditeur riche** (`e9e7a84`, `4752834`) : barre d'outils Photo (upload→img responsive), **Vidéo galerie**
(upload direct navigateur→bucket `videos`, contourne limite Vercel, miniature 1ère image auto via canvas), Vidéo (lien
YouTube, miniature auto), Bouton CTA, Gras, **Aperçu live**. Email : vidéo = miniature cliquable + bouton ▶ (les emails
ne lisent pas `<video>`). Sauts de ligne → `<br>`.

**Emails PRO** (`1f2f1b0`) : `lib/email.js wrap()` refait — logo, header marque, bandeau contact (WhatsApp+site
cliquables), footer numéro lisible + adresse→Maps + avis Google + preheader. Touche TOUS les emails.

**Capture leads** (`730f595`) : `LeadCapture` (bouton "Être rappelé" + mini-form, 3 langues) sur immo/vente/packs détail
→ `/api/lead` (insert public clé-service dans `client_leads`). Admin `/admin/leads` (KPI, filtres, relance WhatsApp,
suppr). Bouton WhatsApp direct conservé.

**SEO / identité (être #1 Oran)** :
- **Favicon** = déjà le logo Fik (liens dans `_app.js`). Le "globe" = Google pas re-crawlé + cache. Rien à coder.
- **NAP unifié** (`fab8305`) : adresse officielle (= fiche Google) `Rue Derbouz Draoua, Houari, Oran 31300` mise
  PARTOUT (footer, schema `_document`+`_app`+`index`, emails, i18n FR/AR/EN). **Avant : incohérence Hay Badr vs Google
  → nuit au SEO local.** Kouider a aussi mis l'adresse dans Admin→Paramètres (la DB écrase le code sur le footer).
- **Schema enrichi** (`5cfe4de`, `9344500`) : Organization/LocalBusiness, `makesOffer` (location/vente/import/immo/packs),
  `sameAs` réels (Instagram/Facebook/TikTok/Maps), email, alternateName, langues. Aide Google à montrer NOTRE fiche
  (le concurrent "Privilege Concierge" sortait à cause d'une fiche GBP plus complète + NAP incohérent).
- **Cookies RGPD** (`fab8305`) : `CookieBanner` Accepter/Refuser + lien confidentialité ; **Microsoft Clarity chargé
  UNIQUEMENT après consentement** (sorti du `_document`) = RGPD + perf (plus de script tiers au 1er rendu).

**🛑 Actions Kouider (hors-code, pour être #1)** : optimiser fiche Google Business (catégories, 20+ photos, NAP
identique, posts) ; **avis** (lien à chaque client, viser 50+) ; re-soumettre sitemap Search Console ; même NAP
Ouedkniss/réseaux. Le ranking = GBP + avis + NAP + temps, PAS du code. Chargily (paiement en ligne) : **exclu** par Kouider.

**⏭️ Reste** : perf framer-motion (laissé, risqué). **Prochaine étape = TEST COMPLET client + admin** (checklist 1→24 fournie).

### 2026-06-13 (PM) — Newsletter réparée + emails pro + pièges PWA/Resend ⭐⭐
> Site `rental-system`. Debug live avec Kouider. Plusieurs causes racines trouvées.

**Bugs newsletter (tous corrigés) :**
1. **Inscription n'écrivait rien** (`380c82e`) : `upsert(onConflict:'email')` mais l'index unique est sur
   `lower(email)` (expression) → Postgres "no unique constraint matching" → message contient "unique" → avalé à
   tort comme doublon → réponse `ok` SANS insertion. Fix : `insert` simple + réactivation idempotente sur vrai doublon.
2. **Admin voyait 0 abonné** (SQL `0023_newsletter_rls_fix.sql`, lancé par Kouider) : `0020` n'avait créé qu'une
   policy INSERT → pas de SELECT → RLS refuse la lecture même à l'admin. Ajouté select/update/delete `authenticated`.
3. **"Envoyer à tous" ne faisait rien** (`1ce3151`) : `window.confirm()` est **bloqué dans le WebView mobile** →
   renvoie false → sortait sans envoyer. Remplacé par confirmation intégrée Confirmer/Annuler. + champ "email de test"
   (défaut `doubakouider@gmail.com`, l'email de login `kouider@autolux.dz` est bidon).
4. **Diagnostic** (`b3dfa58`, `be91a2d`) : `sendEmail` remonte la vraie cause (Resend/domaine), bandeau résultat
   permanent à l'écran (le toast disparaissait trop vite sur mobile).

**🛑 PIÈGE SW PWA (`da26d1c`) — à retenir** : `public/sw.js` mettait `/_next/*.js` en **cache-first** → en PWA la nav
est côté-client, les nouveaux bundles ne chargeaient JAMAIS → Kouider testait l'ancien code pendant des heures.
Fix : `/admin` + `/api` jamais cachés ; JS/CSS en **réseau d'abord** ; images cache-first ; bump `fik-v1→fik-v2`.
**Règle : après un deploy, si un changement n'apparaît pas, suspecter le SW (fermer/rouvrir à fond).** Cf simulateur.

**Emails PRO (`1f2f1b0`)** : `lib/email.js wrap()` refait — logo image, header marque, bandeau contact (boutons
WhatsApp `wa.me/32466311469` + site cliquables), footer numéro lisible `+32 466 31 14 69`, adresse→Google Maps,
lien avis Google, preheader. S'applique à TOUS les emails (newsletter, résa reçue/confirmée, rappel J-1, suivi import,
avis). Constantes marque centralisées (SITE/LOGO/WA_NUM/ADDRESS/MAPS/REVIEW).

**Resend** : confirmé configuré sur Vercel (welcome + test reçus). Domaine OK.

### 2026-06-13 — SUIVI D'IMPORTATION VÉHICULE A→Z (construit + déployé) ⭐⭐⭐
> Site `rental-system` (Vercel). La feature planifiée la veille. Commit `66bdb7f`. Build OK.

**Ce qui a été construit (la spec du 12/06 réalisée intégralement) :**
1. **SQL `supabase/0022_import_orders.sql`** : table `import_orders` (`order_ref` unique type `IMP-XXXXX`,
   client, véhicule demandé, budget, photos JSONB, notes_admin/notes_client, statut, `updated_at` auto via trigger).
   RLS : **insert public** (formulaire), **lecture/écriture admin authentifié**. Le suivi public passe par API clé-service.
2. **Module partagé `lib/importStatus.js`** : source unique des statuts FR/AR/EN + icônes + hints :
   `REQUESTED → SEARCHING → FOUND → PURCHASED → SHIPPING → CUSTOMS → READY → DELIVERED` (+ `CANCELLED`).
3. **APIs** (clé service) : `create-import-order.js` (insert public, génère le ref, retourne n°+id),
   `import-order.js` (lookup par n°/email/tél, **payload sanitisé** : pas de notes_admin, téléphone masqué),
   `update-import-order.js` (whitelist + photos + **email auto au client si le statut change**).
4. **Page publique `pages/suivi-import/[ref].js`** : timeline verticale, photos+lightbox, infos véhicule,
   message équipe, WhatsApp, 3 langues + RTL, `noindex`, **refresh auto 25s** (pas de realtime → RLS protège les données).
5. **Admin `pages/admin/import.js`** (lien nav "Importation", icône Ship) : liste + recherche, cartes dépliables,
   **boutons statut** (déclenche l'email), **upload multi-photos** (réutilise `/api/upload-car-image`), édition infos
   véhicule + client, notes client/privées, **copier le lien de suivi** + voir page client.
6. **`commande-vehicule.js`** : à l'envoi, crée aussi la commande en base (best-effort, ne bloque jamais WhatsApp),
   ajoute le **n° de commande** au message WhatsApp, affiche un **écran de confirmation** (n° + copier + lien suivi).
7. **`mes-reservations.js`** : recherche désormais **aussi les imports** (par n°/email/tél) → carte import + lien suivi.
8. **Email** `lib/email.js importStatusEmail` : template "nouvelle étape" (label 3 langues + CTA suivi).

**Pattern respecté** : pas de compte (suivi par n°), 3 langues + RTL, écritures admin clé-service, dégrade proprement.

**🛑 ACTION REQUISE (Kouider, ~1 min)** : lancer **`rental-system/supabase/0022_import_orders.sql`** dans
Supabase → SQL Editor. **Tant que pas fait** : la création de commande et l'admin import échouent (table manquante).
Les emails ne partent que si `RESEND_API_KEY`/`RESEND_FROM` sont sur Vercel (déjà le cas).

**Vérifié LIVE** : create/lookup/update/suppression OK, page suivi 200. Bouton supprimer admin ajouté (commit `a8cfcfe`).
SQL 0022 **lancé par Kouider ✅**.

### 2026-06-13 — CAPTURE LEADS immo/vente/packs (déployé) ⭐
> Site `rental-system`. Commit `730f595`. Build OK, vérifié live (`/api/lead` 405, `/admin/leads` 200).

**But** : immo/vente/packs ne passaient QUE par WhatsApp → contact perdu si le client n'envoie pas le message.
- **`components/LeadCapture.js`** : bouton "Être rappelé" + mini-modal (nom+tél, 3 langues + RTL) → POST `/api/lead`
  → écran succès + raccourci WhatsApp. Le **bouton WhatsApp direct reste intact** (aucune friction ajoutée au flux existant).
- **`pages/api/lead.js`** : insert public clé-service dans `client_leads` (RLS write=authenticated, donc service-key).
- Branché sur pages **détail** : `immo/[id]` (immo_vente/immo_location), `vente-voitures/[id]` (voiture_vente), `packs/[id]` (pack).
- **`pages/admin/leads.js`** (lien nav "Leads / Demandes", icône UserPlus) : KPI par statut, filtres, recherche,
  changement statut (nouveau/en_cours/conclu/perdu), **relance WhatsApp 1-clic**, suppression.
- **Aucun nouveau SQL** : réutilise `client_leads` (0016, déjà en prod). `category='pack'` ajouté (champ texte libre).

**⏭️ Reste (optionnel)** :
- **Perf accueil** (framer-motion, gain modéré, découpage risqué) — non fait volontairement.
- 🛑 Kouider : supprimer les lignes de **test** (`IMP-YXK7W` dans /admin/import) via le bouton Supprimer.

### 2026-06-12 — SESSION SITE FIK COMPLÈTE (favoris, PWA, newsletter, caisse, blog IA, SEO, Google, trad 100%) ⭐⭐⭐

> **Pour le prochain Claude : ceci est LE récap complet de la journée du 12/06 sur le SITE `rental-system`
> (= Fik Conciergerie, le site public, repo GitHub `kouider213/autolux-location`, hébergé Vercel,
> domaine `fikconciergerie.com`). PAS l'app Dzaryx. Lis tout, tu sauras exactement où on en est.**

#### CONTEXTE / QUI / QUOI
- **Kouider** (proprio Fik Conciergerie, Oran). Active **caveman mode** (réponses télégraphiques, mais code/commits normaux).
- Le site vend : **location voiture** (pipeline complet) + **vente voiture** + **immobilier** + **packs séjour**. Clientèle = **diaspora algérienne** (FR/AR/EN).
- Objectif global Kouider : **"le meilleur site d'Algérie"**, gérable A→Z depuis l'admin sans coder, **$0 de coût fixe**, traduit 100%.
- **2 repos distincts** :
  - SITE : `C:\Users\douba\OneDrive\Bureau\rental-system` → GitHub `kouider213/autolux-location` → Vercel. Next.js 14 (pages router), Tailwind, lucide-react, Supabase.
  - BACKEND Dzaryx : `C:\Users\douba\OneDrive\Bureau\ibrahim\ibrahim\backend` → GitHub `kouider213/ibrahim` → Railway. Express/TS. Sert `/api/translate` (Groq), `/api/blog-generate` (nouveau), `/sign/:token` (contrats).
- Workflow : build (`npm run build`) → `git add -A` → commit → push → Vercel auto-deploy. Backend = push sur son repo → Railway auto-deploy. **Toujours `npx tsc --noEmit` à 0 avant de commit le backend.**

#### CE QU'ON A CONSTRUIT AUJOURD'HUI (tout déployé + vérifié live, dans l'ordre)

1. **Favoris ❤️ universels** (sans compte, localStorage)
   - `lib/favorites.js` : hook `useFavorites()`. Clé localStorage `fik:favorites` = tableau de strings `"type:id"` (ex `car:uuid`, `immo:uuid`, `vente:uuid`, `pack:uuid`). Rétro-compat : anciens ids nus → préfixés `car:`. API : `toggle(id, type='car')`, `isFav(id, type)`, `byType()`, `count`. Event custom `fik:favchange` pour sync multi-composants.
   - Boutons cœur sur cartes : `pages/cars.js`, `pages/immo.js`, `pages/vente-voitures.js`, `pages/packs.js` (toujours `e.preventDefault()+stopPropagation()` car dans un `<Link>`, position `absolute bottom-3 right-3 z-20`).
   - Page `pages/favoris.js` : sections par type (voitures/immo/vente/packs), fetch chaque table par `.in('id', ids)`, 3 langues + RTL. Lien navbar avec compteur (`components/Navbar.js`, icône Heart desktop + mobile).
   - **Pourquoi localStorage et pas de compte** : Kouider veut "pas de création de compte" (friction diaspora). Décision validée.

2. **PWA → AJOUTÉE PUIS RETIRÉE (la pop-up)**
   - Créé : `public/sw.js` (service worker offline), `public/offline.html`, icônes via `sharp` (`public/icons/icon-192/512/maskable-512.png`), `public/manifest.json` enrichi (shortcuts), `components/PWAInstall.js` (bouton installer Android + astuce iOS).
   - **Kouider a demandé de RETIRER la pop-up "installer l'app"** → `<PWAInstall />` retiré de `pages/_app.js` (commit `aa6b954`). Les fichiers SW/manifest/icônes **restent** (inoffensifs, manifest toujours lié). Si la pop-up réapparaît chez lui = vieux SW en cache, fermer/rouvrir le navigateur.

3. **Newsletter diaspora + rappel J-1**
   - SQL `supabase/0020_newsletter_reminders.sql` : table `newsletter_subscribers` (email unique lower, lang, status active/unsubscribed) + colonne `bookings.reminder_sent_at`. **✅ LANCÉ par Kouider.**
   - Inscription : `components/NewsletterSignup.js` dans le footer. API `pages/api/newsletter-subscribe.js` (upsert + email bienvenue). `pages/api/newsletter-unsubscribe.js` (GET lien email).
   - Admin : `pages/admin/newsletter.js` (campagne : objet+message HTML, test à soi, envoi à tous, export CSV, liste). API `pages/api/newsletter-send.js` (vérifie token session Supabase admin, boucle ~8/s pour limite Resend).
   - **Rappel J-1** : `pages/api/cron/reminders.js` (résas qui démarrent DEMAIN, statut confirmé, `reminder_sent_at` null → email → marque). Protégé par `CRON_SECRET` (Vercel, optionnel). Cron dans `vercel.json` (`0 8 * * *`). **Testé live `{ok:true,candidates:0,sent:0}`.**
   - **BUG corrigé** : le cron sélectionnait `pickup_location` → colonne **inexistante** sur `bookings` (elle vit dans `contract_signatures.details` JSON). Retiré du select (commit `02abe8f`).
   - Templates email dans `lib/email.js` : `bookingReminderEmail`, `newsletterWelcomeEmail`, `newsletterCampaignEmail`. (Resend HTTP, `RESEND_API_KEY` + `RESEND_FROM` sur **VERCEL pas Render**, domaine `fikconciergerie.com` vérifié.)

4. **Caisse + Export comptable** (admin)
   - SQL `supabase/0021_cash_register.sql` : table `cash_entries` (kind income/expense, category, label, amount, currency, entry_date, booking_id). RLS = `auth.role()='authenticated'`. **✅ LANCÉ par Kouider.**
   - `pages/admin/comptabilite.js` (lien navbar admin "Comptabilité") : KPI mois (entrées/sorties/solde), ajout mouvement, liste, **export CSV comptable** (résas du mois) + **export caisse**. Client-side via supabase (RLS authentifié).

5. **Devise auto → AJOUTÉE PUIS RETIRÉE**
   - Créé `lib/currency.js` (détection pays, taux live `open.er-api.com`) + `components/ApproxPrice.js` + sélecteur navbar.
   - **Kouider : "on en a pas besoin, ça bloque la navigation"** → retiré du navbar + des cartes (commit `44bb10f`). Fichiers `lib/currency.js` + `ApproxPrice.js` restent mais **plus utilisés**. Raison : le `<select>` dans la navbar gênait le menu mobile.

6. **Blog auto IA (Dzaryx)**
   - BACKEND (repo ibrahim) : `backend/src/api/routes/blog-generate.ts`, monté `/api/blog-generate` dans `index.ts`. Réutilise les clés LLM déjà sur Railway → **Groq llama-3.3-70b** puis **OpenAI** fallback. Prompt = rédacteur SEO FR, sortie JSON `{title, excerpt, body}` (body HTML). `tsc` à 0, commit `191ed74`. **Testé live : article complet.**
   - SITE : `pages/admin/blog.js` → bouton "Rédiger avec l'IA". Appelle le backend, remplit FR, puis **traduit AR auto** via `translateMany([...], 'ar')`. L'admin relit + image + publie.
   - Rendu : `pages/blog/[slug].js` détecte HTML (`isHtml`) → `dangerouslySetInnerHTML` (contenu admin). Styles `.blog-content` dans `styles/globals.css`.

7. **SEO — pages métier + schema**
   - `components/SeoLanding.js` : composant réutilisable (hero, bullets, why, FAQ accordéon, CTA, JSON-LD `@graph` Service/RealEstateAgent + BreadcrumbList + FAQPage). Contenu FR en props, auto-traduit via `<T>`.
   - 4 pages : `pages/conciergerie-oran.js`, `location-voiture-oran.js`, `vente-voiture-oran.js`, `immobilier-oran.js`. Ajoutées au `sitemap.xml.js` (prio 0.9) + liens footer. **Testées 200 + schema présent.**
   - **AggregateRating accueil** : `pages/index.js` getStaticProps calcule `reviewStats` (count+moyenne avis approuvés réels) → JSON-LD LocalBusiness étoiles. **Vérifié.**
   - **FAQPage** sur `pages/faq.js`.

8. **Google Business branché** (Kouider a donné ses 2 liens)
   - `lib/google.js` : `GOOGLE_REVIEW_URL = https://g.page/r/CSluTI58e1CwEBM/review`, `GOOGLE_MAPS_URL = https://share.google/N4itFBIAR9Z1JX8Aw`.
   - Bouton "Laisser un avis Google" (logo Google SVG, 3 langues) sur `pages/reviews.js` + écran remerciement `pages/avis/[id].js`.
   - Email avis (`lib/email.js reviewRequestEmail`) → CTA principal = avis Google.
   - Lien "Voir sur Google Maps" footer (adresse cliquable → NAP/SEO local).

9. **Traduction 100% FR/AR/EN** (demande récurrente forte — "chaque détail compte")
   - Moteur `lib/autoTranslate.js`. Ajouté composant **`<T>texte FR</T>`** (auto-traduit l'enfant via `useTranslated` → backend `/api/translate` Groq, cache localStorage). `translateMany(texts, target)`. FR inchangé, arabe déjà saisi non re-traduit.
   - Pages réparées : **`investir.js`** (`<T>` + RTL), **`blog/[slug].js`** (titre/corps/extrait via `useTranslated`, le blog n'a que FR+AR en base → EN tombait en FR), **`mes-reservations.js`** (helper `L(fr,ar,en)` + statuts + barre + RTL), **`suivi/[id].js`** (statuts/étapes maps `{fr,ar,en}`, paiement, contrat, état des lieux, RTL), **`avis/[id].js`** (formulaire + RTL).
   - Barre recherche mes-reservations : icône à droite en arabe, input RTL, bouton `min-w-[52px]`.
   - **Scan final** : plus aucune page publique non traduite.
   - Voir mémoire `i18n_full_coverage`.

#### COMMITS SITE (ordre chrono ce jour)
`f142dec` favoris · `c3dd94a` PWA · `942c057` newsletter+J-1 · `883fd8c` devise+caisse · `238dfda` blog IA+perf · `02abe8f` fix cron · `44bb10f` retrait devise · `aa6b954` retrait pop-up PWA · `3307815` trad+favoris universels · `b113f6f` SEO+schema · `4cbc3c3` Google links · `9791c19` trad suivi+avis.
BACKEND : `191ed74` route blog-generate.

#### PERF ACCUEIL (partiel)
`pages/_app.js` preconnect Supabase/Unsplash + dns-prefetch Cloudinary. `pages/index.js` hero `fetchPriority="high" decoding="async"`. Reste optimisable (framer-motion, 32 usages) — **pas fait, gain modéré, risqué**.

#### CE QUI RESTE (optionnel)
1. **Capture lead immo/vente/packs** — ces 3 passent QUE par WhatsApp (aucune trace si pas de message). Proposé : mini-formulaire qui enregistre en base. **Kouider pas encore tranché.**
2. **Perf accueil** (framer-motion) — optionnel.

#### CÔTÉ KOUIDER (SEO local, pas du code)
- Search Console : fait (balise déjà dans `_app.js`). Doit **re-soumettre `sitemap.xml`** pour les 4 pages neuves.
- Google Business : 20+ photos, post 1×/sem, envoyer le lien d'avis à chaque client (viser 50+), Ouedkniss même NAP.

#### ⏭️ PROCHAINE ÉTAPE = DEMAIN : **SUIVI D'IMPORTATION VÉHICULE A→Z** (voir spec ci-dessous)

---

### 📋 SPEC DEMAIN — Suivi d'importation véhicule (À CONSTRUIRE, demande Kouider 12/06 soir)

**Besoin Kouider (résumé verbatim)** : pour les clients qui **commandent un véhicule à importer**, un suivi A→Z.
Depuis l'admin, quand Kouider cherche/trouve/achète le véhicule, il change les **statuts** (recherche → achat →
importation → dédouanement → etc.). Le **client suit avec son numéro de commande**. Kouider gère tout depuis
l'admin, et **quand il achète le véhicule il peut ajouter des photos + infos**, visibles/enregistrables par lui
ET le client.

**Existant à réutiliser** :
- `pages/commande-vehicule.js` (formulaire → WhatsApp ; champs nom/prenom/whatsapp/ville…). Point d'entrée de la commande d'import → à faire **créer un enregistrement en base** (pas juste WhatsApp).
- Pattern suivi : `pages/suivi/[id].js` (résa, timeline + realtime) + `pages/mes-reservations.js` (recherche par n°).
- Pattern admin : `pages/admin/bookings.js` (statuts + photos).
- Upload photos : `pages/api/upload-car-image.js` (base64 → bucket Supabase → url).

**Plan proposé (à valider/affiner demain)** :
1. **SQL `0022_import_orders.sql`** : table `import_orders` (id, `order_ref` court unique type `IMP-XXXX`,
   client_name, client_phone, client_email, lang, **status**, vehicle_brand, vehicle_model, vehicle_year,
   vehicle_specs JSON/text, budget, country_origin, notes_admin, notes_client, created_at, updated_at) +
   `import_order_photos` (order_id, url, position) OU colonne `photos` JSON. RLS : insert public, lecture par ref
   via API service-key (comme `my-bookings`), écriture admin service-key.
2. **Statuts** (proposition) : `REQUESTED` → `SEARCHING` → `FOUND` (photos+infos) → `PURCHASED` → `SHIPPING`
   (transport maritime) → `CUSTOMS` (dédouanement) → `READY` → `DELIVERED` + `CANCELLED`. Labels FR/AR/EN
   (pattern maps `{fr,ar,en}` de `suivi/[id].js`).
3. **Page publique `pages/suivi-import/[ref].js`** (ou réutiliser `/suivi`) : timeline verticale, photos véhicule,
   infos, live realtime Supabase, WhatsApp. 3 langues + RTL.
4. **Recherche** : dans `pages/mes-reservations.js` (ou page dédiée) recherche par n° commande d'import. API
   `pages/api/import-order.js` (lookup ref/email/phone, service-key).
5. **Admin `pages/admin/import.js`** (lien navbar admin) : liste, changer statut (dropdown), éditer infos véhicule,
   **uploader photos**, notes. API service-key `pages/api/update-import-order.js` (whitelist champs).
6. **Email auto** à chaque changement de statut (`lib/email.js` + Resend) : "Votre import passe à l'étape X".
7. **commande-vehicule.js** : après WhatsApp, créer aussi la ligne `import_orders` (REQUESTED) + donner au client
   son **numéro de commande** + lien de suivi.

**Style à garder** : pas de compte (suivi par n°), 3 langues + RTL, service-key pour écritures admin, realtime live.

---

### 2026-06-11 — Résilience "jamais mort" : crédits finis → bascule auto gratuit (commit `72af321`) ⭐
- **Objectif Kouider** : payé ce mois-ci, mais quand les abonnements/crédits finissent, tout doit basculer
  automatiquement sur du gratuit — jamais mort, puissance conservée.
- **Fait** :
  1. **Cerveau de secours AGENTIQUE** (`backend/src/integrations/agentic-fallback.ts`, nouveau) : Claude mort
     (crédits 400/401/429) → les **MÊMES 151 outils** tournent sur **Groq llama-3.3** puis **Gemini 2.0 Flash**
     (free tiers, API compatible OpenAI tool-calling) puis OpenAI. Branché en PREMIER fallback dans
     `orchestrator.ts` → résas/finance/photos continuent vraiment (avant : fallback texte SANS outils).
  2. **TTS jamais muet** (`dispatcher.ts`) : ElevenLabs échoue → **Gemini TTS** gratuit (PCM→WAV, lu tel quel
     par decodeAudioData, zéro changement client) → sinon event **`Dzaryx:tts_fallback`** → le **device parle**
     (speechSynthesis, `speakOnDevice()` dans `simulator/api.ts`, voix fr/ar auto).
  3. **Failover backend multi-URL** (`simulator/api.ts`) : `VITE_BACKEND_BACKUPS` = liste d'URLs backup.
     Erreur réseau / 502-504 / 4× connect_error socket → **bascule auto** + persistée localStorage.
     `BACKEND_URL`/`WS_URL` = live bindings → tous les écrans suivent.
  4. **`JOBS_ENABLED=false`** (`index.ts`) : l'instance backup ne lance pas scheduler/workers (pas de doubles
     notifs) — API/chat/sockets complets.
  5. **`render.yaml`** (racine) : blueprint Render free prêt pour déployer le backend backup en 1 clic.
  6. **Backup DB** (`.github/workflows/supabase-backup.yml`) : pg_dump hebdo (dimanche 03:00 UTC) → artefact
     GitHub 90 jours + déclenchement manuel.
- **Déployé** : backend Railway (push `72af321`) + simulateur gh-pages **v84** (Published). tsc 0, build OK.
- **🛑 ACTIONS REQUISES (Kouider, ~10 min)** :
  1. Créer compte **render.com** (login GitHub) → New → Blueprint → repo ibrahim → copier les env vars Railway
     → me donner l'URL Render pour la mettre dans `VITE_BACKEND_BACKUPS` + rebuild.
  2. Secret GitHub **`SUPABASE_DB_URL`** (repo Settings → Secrets → Actions) = connection string Supabase
     (Dashboard → Database) → le backup hebdo s'active.
  3. (optionnel) Compte **UptimeRobot** → monitors /health Railway + Render + site → alerte Telegram + garde
     Render éveillé.
- **⏭️ Reste** : URL Render dans les backups une fois le compte créé ; même failover pour le site (api côté
  Next.js) si souhaité.

### 2026-06-12 — Contrat doc-validation + traduction auto + gros pack admin/site pro ⭐⭐
> Session marathon. Site `rental-system` (Vercel) + backend `sign.ts` (Railway).

**Contrat de location (refonte totale)** — `backend/src/api/routes/sign.ts` :
- **Cause racine de TOUS les bugs JS de la page contrat** : la **CSP globale helmet** (`script-src 'self'`)
  bloquait tout `<script>` inline → ni signature ni upload ne tournaient. Fix : middleware CSP relâchée sur `/sign`
  (`unsafe-inline` + img data/blob/https). Voir [[../../memory|csp_inline_script]]. **À retenir : vérifier les headers AVANT de débugger la logique.**
- Signature dessinée **abandonnée** → validation par **case "J'accepte" + photo passeport + photo permis**
  (inputs natifs, compression canvas, bucket `client-documents` passé **PUBLIC**).
- **Vrai PDF téléchargeable** `GET /sign/:token/pdf` (pdfkit) : design pro (bande or, **logo** chargé depuis URL site,
  sections, encadré tarifs, **lieux récupération/restitution**, conditions, validation + photos passeport/permis).
- Admin : `/api/generate-contract-link` accepte pickup/return ; modal affiche statut + photos + bouton PDF.

**Traduction automatique du site (FR→AR/EN)** :
- Moteur `backend/.../translate.ts` `POST /api/translate` — **Groq d'abord** (gratuit ; Gemini était en 429 quota),
  cache Redis 30j (succès only). Site `lib/autoTranslate.js` (`useTranslated`, cache localStorage). Branché :
  FAQ, conditions, descriptions voiture/immo/pack. Valeurs fixes (carburant/boîte/catégorie) : `localizeValue()` i18n.
- **Anglais complet** : dictionnaire EN (~320 clés) + sélecteur **FR/ع/EN** Navbar. Specs voitures + boutons
  "Vérifier la dispo"/"Sur demande"/"/day" localisés. **"Douba Groupe" retiré** (badge immo, 3 langues).

**Pack admin pro (le tout gérable sans coder)** :
- **Gestion réservation réparée** : l'update direct était bloqué par la RLS → passe par `/api/update-booking` (clé service).
- **Avis vérifiés** : page `/avis/[id]` post-location → `/api/submit-review` (verified=true) + badge "Vérifié" + bouton admin "Demander un avis".
- **Pages légales éditables** : `/admin/pages` (éditeur 3 langues, auto-traduction) + `legal_pages` table ; pages CGV/mentions/confidentialité/à-propos lisent la DB (fallback défaut). API `/api/save-legal`.
- **Maintenance véhicules** : champs assurance/CT/vignette/révision/note sur `/admin/cars` + **alertes** dans Planning flotte (≤30j/expiré). Retry gracieux avant migration.
- **Blog** : ajouté au menu + **4 images** (Unsplash) sur les articles.
- Accueil déjà éditable via **Paramètres** (hero, annonce, stats, contacts, réseaux, mode dispo).
- **État des lieux manuel** (multi-photos + tap-to-mark) déjà fait la veille.

**🛑 ACTION REQUISE (Kouider)** : lancer **`rental-system/supabase/0019_admin_pack.sql`** dans Supabase > SQL Editor
(avis vérifiés `reviews.verified`/`booking_id`, table `legal_pages`, colonnes maintenance `cars`). Tout dégrade
proprement sans, mais ces 3 features ne s'activent qu'après.

**Suite (faite ensuite, même journée)** :
- **Espace client** `/mes-reservations` : recherche par téléphone (8 derniers chiffres), liste résas + suivi/avis/re-réserver. Sans compte. API `/api/my-bookings`. Lien menu.
- **Emails auto** : `lib/email.js` (Resend HTTP, gratuit, graceful sans clé). Email "réservation reçue" (à la création) + "confirmée" (à l'acceptation). 🛑 Kouider : créer compte Resend + `RESEND_API_KEY` + `RESEND_FROM` (domaine vérifié) sur Vercel pour activer l'envoi.
- **SEO** : sitemap complété (packs/légal/mes-reservations + hreflang EN), **JSON-LD AutoRental/LocalBusiness** global (`_document.js`), robots no-index `/suivi /avis /sign`.
- **Migration 0019 lancée par Kouider ✅** (avis vérifiés + legal_pages + maintenance cars actifs).

**Reste (exclu/plus tard)** : acompte en ligne Chargily (**exclu Kouider**), SEO perf accueil 57 Ko (découpage risqué), rappel J-1 par email (scheduler à brancher).

### 2026-06-11 (soir) — Contrat pro + gestion admin complète + état des lieux manuel ⭐
- **Contexte** : test live de la page suivi → 3 manques identifiés par Kouider (contrat vide, admin lecture seule, marquage dégâts manuel).
- **1. Contrat pro** (backend `sign.ts`, commit `7bfcf8d`) : la page `/sign/:token` affiche un VRAI contrat —
  n° contrat, locataire, véhicule, période, durée, prix/jour, total, **acompte 3j**, reste ; **vraies conditions
  Fik** (35 ans, **aucune caution**, passeport conservé, km illimité, assurance, accident, sous-location interdite) ;
  case obligatoire "J'accepte" + signature horodatée. Tire les détails réels via `booking_id`.
- **2. Gestion admin réservation** (site `9a077ca`) : le modal `/admin/bookings` est désormais **gérable à tout
  statut** (plus lecture seule après confirmation) — changer statut, éditer dates+prix, **paiements acompte/solde**
  (→ maj `paid_amount`/`payment_status` + table `payments`), **générer le contrat à signer** (`/api/generate-contract-link`,
  service-role) + envoi WhatsApp au client.
- **3. État des lieux manuel** (site `21011e5`) : `components/InspectionTool.js` + `/api/inspection` — depuis le
  modal réservation : choisir départ/retour, **multi-photos** (appareil/galerie), **TAP sur la photo** pour placer
  un marqueur de défaut, gravité (légère/moyenne/grave) + libellé (ex "rayure jante avant droite"), flag accident,
  notes. Sauvé dans `vehicle_states` lié au `booking_id` → **visible côté client sur `/suivi`**. Liste les états déjà faits.
- **Build site 0, tsc backend 0.** Déployé Vercel + Railway.
- **⏭️ Demandé ensuite par Kouider** : audit pro de TOUT le site (immo, vente voitures, packs, perf, confiance), pas
  que la location → exécuter les améliorations.

### 2026-06-11 — 3 chantiers PRO gratuits (audit site/app → exécution) ⭐
- **Contexte** : audit complet site+app demandé → 3 améliorations à **0 € fixe**, branchées sur le vrai code.
- **1. Docs client sur `/suivi/[id]`** (site, commit `f633265`) : nouvelle route service-role
  `pages/api/booking-documents.js` → la page suivi affiche **paiement** (acompte/reste, multi-devise),
  **contrat** (statut signature + bouton "Signer" si pending → `/sign/:token` backend), **état des lieux
  avant/après** (photos Cloudinary + marqueurs dégâts colorés par sévérité + bannière accident + lightbox).
  Branché sur `payments`, `vehicle_states`, `contract_signatures`. Transparence anti-litige = pro.
- **2. Planning flotte admin** (site) : nouvelle page `pages/admin/planning.js` + entrée nav "Planning flotte" :
  **timeline Gantt** (voitures × 30j, fenêtre navigable, barres par statut, week-ends, today, lien résa) +
  **détection double-booking** + **dashboard relances** (départs/retours auj.+demain, soldes impayés avec
  **relance WhatsApp 1-clic**). Source impayés = `bookings.paid_amount`/`payment_status`.
- **3. Briefing matin = centre de commande + recouvrement** (backend, commit `f778d8c`) :
  `jobMorningBriefing` enrichi → bloc **"À encaisser"** (soldes dus) + bloc **"Documents à vérifier"**
  (passeport/permis qui expirent ≤7j). `getUnpaidBookings` génère par client une **relance WhatsApp en
  darija oranaise prête** (lien wa.me pré-rempli, multi-devise). Tool `get_unpaid_bookings` : dire
  *"relance les impayés"* / *"recouvrement"* → messages prêts. tsc 0, build site 0.
- **Déployé** : site → Vercel (push `f633265`), backend → Railway (push `f778d8c`).
- **Note** : `/api/booking-documents` utilise `SUPABASE_SERVICE_ROLE_KEY` (déjà présent sur Vercel via `booking.js`).
- **⏭️ Suite proposée (non faite, validée plus tard)** : acompte en ligne **Chargily** (0 € fixe, commission
  par transaction) — le seul qui demande un compte marchand. + compte client OTP + avis vérifiés post-location.

### 2026-06-11 — Audit complet + migrations confirmées + journal rattrapé
- **Quoi** : audit complet site+Dzaryx (docs vault + git des 2 repos). Kouider confirme : **toutes les migrations
  SQL sont lancées** (`car_currency`, `inspection_upgrade`, `phase_extras`). Journal mis à jour avec les sessions
  06-09/06-10 qui manquaient (le code était commité mais pas documenté ici).
- **Reste ouvert** : B025 (révoquer token GitHub `ghp_d8Vch...`), B030 (wake word Zaria — logcat), restreindre clé
  Google Maps, upload PDF/Excel chat (optionnel), vérifs device (darija vocal, signature, estimation dégâts, scan ID).
- **État** : ✅ docs à jour.

### 2026-06-10 — Estimation dégâts + signature électronique + pricing dynamique (3 features gardées sur 6)
- **Quoi** : 6 features additives livrées (`1d088f1`) puis **réduites à 3 sur décision Kouider** (`0ef121b`) :
  - `estimate_damage` — estimation coût dégâts depuis une photo (Claude Sonnet Vision).
  - `create_signature_link` + route publique **`/sign/:token`** — le client signe le contrat en ligne, archivé
    dans `contract_signatures` (migration `supabase/migration_phase_extras.sql` ✅ lancée).
  - `apply_dynamic_pricing` — modifie le prix/jour d'une voiture, **bloque sous le prix proprio**.
  - **Retirés** : add_car_expense/get_car_pnl, set_vehicle_documents/check_expirations, record_rental_meter.
- **Fix routing signature** (`f0f1059`) : "envoie le contrat à signer à X" routait vers l'agent clients qui n'avait
  pas `create_signature_link` → outil + keywords sign/signe/signer/signature ajoutés à l'agent clients.
- **Fichiers** : `backend/src/agents/agent-registry.ts`, `backend/src/api/routes/sign.ts`, `backend/src/index.ts`,
  `tool-executor.ts`, `tools.ts`, `supabase/migration_phase_extras.sql`.
- **État** : ✅ déployé Railway, tsc 0 erreur.

### 2026-06-10 — Darija oranaise à fond : réponse 100% arabe, voix TTS arabe, arabizi, STT gpt-4o-transcribe
- **Problème** : darija parlée massacrée par Groq Whisper turbo ("larbiëulak iver"), réponses mi-FR mi-darija,
  ElevenLabs lisait "3andek" → "trois-andek".
- **Fait** :
  - `225ebce` — **STT primaire = OpenAI gpt-4o-transcribe** (meilleur dialectes) + prompt biaisé darija,
    fallback Groq Whisper → Google.
  - `581bff2` + `8a6d51a` + `df8d434` — règle langue durcie (les 2 acteurs) : input darija → réponse **entièrement**
    darija oranaise, même pour rapports data/news/recherche revenus en FR ; max écriture arabe, labels traduits
    (acompte→التسبيق, payé→خلّص…), seuls noms propres/montants/emprunts authentiques restent en latin.
  - `7c69a5e` — **voix ElevenLabs arabe dédiée** auto-choisie par langue de la réponse (env `ELEVENLABS_VOICE_ID_AR`,
    fallback voix de base si absente).
  - `60dd650` — **arabizi phonétique** avant TTS (3=ع, 7=ح, 9=ق, 5=خ, 2=ء) seulement quand le chiffre touche une
    lettre → prix/dates (1200€, 27) intacts.
- **Fichiers** : `backend/src/conversation/context-builder.ts`, `backend/src/api/routes/transcribe.ts` (chaîne STT),
  TTS dispatcher.
- **État** : ✅ déployé. ⏭️ valider accent/compréhension sur device réel.

### 2026-06-10 — Vocal : hard reset micro au tap + auto-recover (plus besoin de fermer l'app)
- **Problème** : "le micro marche pas parfois" — stream suspendu (iOS/WebView), état "thinking" gelé, il fallait
  tuer l'app.
- **Fait** : `d0ddce5` — tap micro ré-initialise si track mort puis enregistre. `8a6d51a` — **hard reset** au tap
  (kill recorder bloqué, reset refs, resume/recreate AudioContext, re-init stream) + watchdog thinking 22s→**12s**
  + clear flag recording bloqué. SW **v81→v83**.
- **Fichiers** : `simulator/src/components/screens/VoiceScreen.tsx`, `simulator/public/sw.js`.
- **État** : ✅ déployé gh-pages. ⏭️ valider sur device.

### 2026-06-10 — RESAS : MARGE calculée live (fix 142€ faux)
- **Problème** : MARGE affichait 142€ (2/6 résas) — somme du champ stocké `profit_kouider`, **null** sur les résas
  créées sans le calcul (Sophia/Abdelkader/Omar avaient prix+jours mais pas de profit stocké).
- **Fix** : `dc4fa40` — marge calculée à la volée = (prix client − prix proprio) × jours par résa (jours dérivés
  des dates si absents). Auto-réparant. Ligne détail pareille. SW v82.
- **Fichiers** : `simulator/src/components/screens/BookingsScreen.tsx`.
- **État** : ✅ déployé.

### 2026-06-10 — Scan ID : archivage auto fiche client + regex tolérante
- **Fait** :
  - `f66b96f` — `scanIdentity` upload l'image dans le bucket **`client-documents`** + insert `client_documents`
    sous le nom extrait (données OCR incluses) → chaque scan archivé et retrouvable. Chaînage scan→résa déjà câblé.
  - `4b5a63d` — `ID_SCAN_RE` élargie : passeport/passport/pasport/**paseport** (typo), permis, carte/pièce
    d'identité, CIN → le verdict déterministe d'âge est utilisé (avant : Claude faisait son propre OCR contradictoire).
- **État** : ✅ déployé.

### 2026-06-10 — Handoff A→Z en notes Obsidian interliées
- **Quoi** : `af94eac` — dossier **`DZARYX/HANDOFF/`** : hub `00 HANDOFF HUB` + 15 notes H01-H15 (vue d'ensemble,
  stack, archi, agents/gardes, darija, outils, images, finance, écrans, DB, déploiement, env, démarrage local,
  état/trous/roadmap, fichiers clés). Version HTML single-file (`0d7b667`) supprimée au profit des notes.
- **But** : reprise du projet de zéro par n'importe quel dev/agent.
- **État** : ✅ commité.

### 2026-06-09 — Site : autocomplétion adresse admin immo → carte précise
- **Quoi** : site `eebc960` — admin immo du site utilise l'autocomplétion Google (via API publique backend)
  pour l'adresse → la carte de l'annonce immo est précise.
- **État** : ✅ déployé Vercel.

### 2026-06-08 — SARF retirée + reskin or + Houari loue en DZD (prix par voiture + CA dinars séparé)
- **Demandes** : (1) supprimer la page SARF ; (2) design pro façon Gemini partout ; (3) Houari loue en **dinars**
  avec SES prix (Kouider reste en € inchangé), avec un **CA en dinars en plus**, sans rien casser.
- **Fait** :
  - **SARF supprimée** de la nav + routage (CurrencyScreen plus utilisée). Backend rates.ts laissé tel quel (inutilisé).
  - **Reskin or** (Kouider) : accent cyan → or `#e9b949` sur lock/login/home + barre de nav + icône (cohérent IMMO/ACHAT).
    Houari garde le violet. (Les écrans internes cyan = reskin or à faire ensuite — décision Kouider.)
  - **Prix Houari DZD par voiture** : colonnes `cars.houari_base_price` / `houari_resale_price` (migration
    `migration_car_currency.sql`). PATCH `/api/cars/:id` accepte ces champs + `owner_price_per_day`.
  - **PARC actor-aware** (`FleetScreen`) : Houari voit/édite ses prix en **DA** (bouton ✎ → modal prix proprio/client),
    Kouider voit/édite en **€**. Badge devise par ligne.
  - **CA dinars séparé** : `finance.ts` — les totaux EUR **excluent** les locations DZD (chiffres actuels inchangés) +
    bloc `dzd` (ca, houariCA, encaissé, à encaisser). `RevenueScreen` affiche une carte "💱 CA en dinars (Houari)".
  - **RESAS** gérait déjà le choix EUR/DZD à la réservation (devise auto = DZD pour Houari, KPIs CA €/CA DZD séparés).
- **Commits** : `cdccf91` (SARF retiré + reskin or), `12a22fa` (Houari DZD + CA dinars). Simulateur **v51**. tsc backend EXIT 0.
- **🛑 ACTION REQUISE (Kouider)** : lancer **`supabase/migration_car_currency.sql`** (colonnes prix Houari DZD).
  Tant que pas fait, l'édition des prix DZD échoue (colonnes manquantes). Ensuite : me donner les prix DZD par voiture
  (ou les saisir via ✎ sur le login Houari).
- **⏭️ Reste** : reskin or des écrans internes (PARC/RESAS/CA/CLIENTS/CONFIG…) ; option : préremplir le prix DZD du
  véhicule à la résa Houari.

### 2026-06-08 — IMMO/ACHAT : annonces complètes + photos + adresse + Opportunités (veille marché)
- **Demandes Kouider** (suite refonte) : (1) remplacer "ce que Dzaryx sait faire" par un court "comment utiliser" ;
  (2) formulaires d'annonce aussi complets que le site (toutes les infos + **plusieurs photos**) ; (3) **adresse**
  autocomplétée (façon RESAS/Google) → **carte** sur l'annonce immo du site ; (4) remplacer "Opportunités" par une
  **vraie veille business** (marché auto Algérie, nouveautés, **lois d'import**, blocage bateaux été, quand importer…).
- **Fait** :
  1. **Forms complets** (app) : immo = type/surface/pièces/chambres/SDB/étage/adresse/description ; voiture à vendre =
     carburant/boîte/ville/état/description. **Multi-photos** (1ʳᵉ = principale). Backend `immo.ts` POST accepte tous
     les champs + `photos[]` → Cloudinary → `property_photos`/`vehicle_sale_photos` + `image_url`.
  2. **Adresse autocomplétée** via `/api/maps/autocomplete` (Google Places, déjà existant) → composant `AddressInput`
     débouncé. La **carte** est **déjà** rendue sur `immo/[id].js` du site (embed par adresse) → rien à changer côté site.
  3. **"Comment utiliser"** (4 lignes) remplace les cartes capacités sur IMMO + ACHAT.
  4. **Opportunités = veille réelle** : `backend/src/integrations/opportunities.ts` — Claude **Sonnet + web_search natif**
     → briefing JSON (marché/location/nouveautés/lois/import) orienté Oran, **cache Redis 12h**. Route
     `GET /api/deals/opportunities?force=`. App : onglet Opportunités dynamique (résumé + cartes catégorie + urgence +
     bouton Actualiser). **Testé live : 8 items pertinents** (Fiat Tafraoui, marques chinoises, etc.).
- **Piège résolu** : le modèle écrivait une longue analyse avant le JSON → tronqué. Fix : **JSON-only strict** +
  `max_tokens 4500` (commit `60719d5`).
- **Commits** : `68295d5` (forms+photos+adresse+comment utiliser), `a1d254b` + `60719d5` (opportunités). Simulateur **v49**.
  tsc backend EXIT 0, build sim EXIT 0.
- **⏭️ Reste (optionnel)** : **auto-veille quotidienne** — job scheduler qui rafraîchit les opportunités chaque jour
  et **pousse une notif proactive** si une opportunité `urgent` apparaît ("Kouider, bientôt import -10 ans…").
  Aujourd'hui c'est à la demande (bouton Actualiser) + cache 12h. (Champ debug `_raw` laissé sur réponse vide.)

### 2026-06-08 — Refonte nav : pages IMMO + ACHAT/REVENTE premium (Gemini), Capacités → Config
- **Demande Kouider** : virer l'onglet **DZARYX** (Capacités/Proactif, inutile) → le mettre dans Config ; le
  remplacer par une page **IMMO** (location+vente, connectée au site, + capacités Dzaryx immo) ; ajouter une page
  **ACHAT/REVENTE** (voitures + immo + opportunités) ; design **premium façon Gemini**, sans rien casser.
- **Fait** (simulateur = l'UI réelle) :
  - Onglet `capacites` (DZARYX) **retiré de la nav** → `CapacitesScreen` intégré **en bas de CONFIG** (repliable).
  - **`ImmoProScreen.tsx`** (nouveau) : hub immo premium — filtres Tous/À louer/À vendre, stats, ajout bien, cycle
    statut, **état des lieux** (réutilise `InspectionModal`, exporté depuis FleetScreen), section "Ce que Dzaryx fait
    pour l'immo". Données via `/api/immo` (site).
  - **`DealsScreen.tsx`** (nouveau) : ACHAT/REVENTE — onglets Voitures / Immo / Opportunités, ajout voiture à vendre,
    cycle statut, exemples d'analyse d'opportunités, section capacités Dzaryx (estimer prix, marge, créer annonce…).
  - Design : noir + or, typo sans-serif, cartes douces, dégradés, pills statut — rupture avec le cyberpunk
    (Orbitron/cyan) des autres écrans.
  - Nav Kouider : VOIX·CHAT·**IMMO**·**ACHAT**·RESAS·PARC·CA·CLIENTS·DEMANDES·AGENDA·DOCS·CONFIG. IMMO+ACHAT visibles
    aussi Houari ; SARF reste Houari, DOCS reste Kouider. Ancien `ImmoScreen.tsx` (Houari) = **fichier mort** (plus importé).
- **Commit** : `e49c978`. Simulateur gh-pages **v47**. Build EXIT 0.
- **⏭️ Suite possible** : rendre les autres écrans (PARC/RESAS/CA…) au même style Gemini si Kouider valide la direction ;
  brancher "Opportunités" sur une vraie analyse Dzaryx (outil estimation marge).

### 2026-06-08 — Inspection avant/après : véhicule + immobilier (Vision Sonnet, photo stockée, marqueurs, lien réservation) ⭐
- **Demande Kouider** : quand on prend une photo avant/après d'un véhicule (loué à un client), l'enregistrer **avec
  la réservation du client**, l'**analyser avec Claude Vision** (accident/dégâts en détail, vrai avant/après), et
  **montrer où sont les défauts**. Pareil pour les **biens immobiliers**.
- **Ce qui existait** : table `vehicle_states` + analyse Vision (Haiku) avant/après, mais photo **non stockée**
  (`photos: []`), **pas liée** à la réservation, **pas d'immo**, défauts en texte seulement.
- **Fait** :
  1. **`backend/src/integrations/inspection-core.ts`** (nouveau) — moteur partagé : analyse **Claude Sonnet 4.6**
     → **JSON structuré** = pour chaque dégât { label, severity, location, is_new, **box {x,y,w,h}** normalisé 0..1 }
     + flag **accident** + sévérité globale. Upload photo → **Cloudinary** (`uploadInspectionPhoto`).
  2. **`vehicle-state.ts`** réécrit — stocke la **photo Cloudinary**, **lie la réservation** du client
     (`resolveBookingId` : cherche le booking par client + voiture → `booking_id`), enregistre `damage_boxes`,
     `accident`, `severity`. Retour structuré (photoUrl + analysis) pour l'app.
  3. **`property-state.ts`** (nouveau) — même système pour l'**immobilier** (état des lieux entrée/sortie), table
     **`property_states`**, lié au bien (`property_id`) + locataire.
  4. **REST** `backend/src/api/routes/inspections.ts` : `POST /api/inspections/vehicle|property` (analyse) +
     `GET` (historique). Monté dans `index.ts`.
  5. **Chat** : tools `save_property_state_before/after`, `get_property_states` (tools.ts + tool-executor.ts) ;
     **fast-path** orchestrator étendu — détecte véhicule **ou** bien (mots immo + état des lieux) sur photo+message.
  6. **App** (`simulator/.../FleetScreen.tsx`) : modal **`InspectionModal`** générique (véhicule + bien). Affiche la
     **photo avec marqueurs numérotés** des dégâts (boîtes colorées par sévérité) + **légende** + bannière 🚨
     **accident** + rapport texte. Bouton 📷 ajouté aussi sur chaque **bien** de l'onglet IMMO.
- **Décisions (validées Kouider)** : marqueurs visuels sur la photo + modèle **Sonnet 4.6** (preuve litige → précision).
- **Fichiers** : voir liste ci-dessus + `simulator/src/services/api.ts` (méthodes `inspect`/`fetchInspections` + types),
  `supabase/migration_inspection_upgrade.sql`.
- **Commit** : `84583b4` (poussé → Railway). Simulateur gh-pages **v44** (Published). tsc backend EXIT 0, build sim EXIT 0.
- **🛑 ACTION REQUISE (Kouider)** : lancer **`supabase/migration_inspection_upgrade.sql`** dans Supabase > SQL Editor
  (ajoute `damage_boxes`/`accident`/`severity` à `vehicle_states` + crée `property_states`). **Tant que pas fait,
  l'enregistrement d'une inspection échoue** (colonnes/table manquantes).
- **Multi-photos ✅ (ajouté ensuite, commit `bb50152`)** : une inspection accepte **plusieurs photos** (angles).
  `inspection-core.analyzeInspectionPhotos` + `processInspection` (chaque dégât tagué `photo_index`). REST accepte
  `images[]`. App : sélection multi (miniatures + retrait), bouton ANALYSER (N), résultat = chaque photo avec ses
  marqueurs + légende globale. Pas de changement SQL (photos `TEXT[]`, `damage_boxes` JSONB). Simulateur **v45**.
- **⏭️ Idées suite** : PDF du constat avant/après signable, rattacher l'inspection au PDF de contrat de location.

### 2026-06-08 — Vérif toggle dispo/indispo + fix refresh catalogue site
- **Demande** : vérifier que le bouton DISPO (écran PARC de l'app) passe vraiment les véhicules
  disponible/indisponible **et** que ça se reflète sur le site.
- **Vérif (chaîne complète, OK)** : `FleetScreen.toggle` → `api.toggleCar(id, !available)` →
  **`PATCH /api/cars/:id {available}`** → backend `cars.ts` (zod whitelist inclut `available`) →
  `supabase.from('cars').update({available})`. ✅ écrit bien la colonne `cars.available`.
- **Côté site** (`rental-system`) : la dispo par voiture = `car.available && !réservation_active_aujourdhui`.
  - **Détail** `/cars/[id]` : `getServerSideProps` → instant. ✅
  - **Home** `/` : getStaticProps r:10 **+ refetch client** → instant au reload ; une voiture indispo est
    **cachée** du carrousel (dans les 2 modes).
  - **Catalogue** `/cars` : ⚠️ ne faisait QUE `getStaticProps revalidate:30` (pas de refetch client) → un
    toggle n'apparaissait qu'après revalidation ISR (même classe de bug que la page avis).
- **Fix** : ajout d'un **refetch client des cars au mount** dans `pages/cars.js` (pattern de la home). SSR/ISR gardé
  pour le SEO. Build site EXIT 0.
- **⚠️ Rappel mode dispo** (important pour Kouider plus tard) : tant que le **mode "à confirmer"** est **ON**
  (état actuel), le **catalogue** affiche TOUT en "Sur demande" / "Vérifier la dispo" et **ignore** `available`
  pour le badge → un toggle indispo n'a pas d'effet visuel sur `/cars` (la home, elle, cache quand même la voiture).
  Quand Kouider aura les vraies dates → **Admin → Réglages → "Disponibilité des voitures" → 🟢 Dispos réelles**
  (`availability_mode=false`, migration 0017 déjà faite) → là le catalogue + détail montrent vert "Disponible" /
  rouge "Indisponible" selon le toggle. Voir [[08_DECISIONS#mode-dispo]].
- **Commit** : site `c247974` (poussé → Vercel). **État** : ✅ déployé.

### 2026-06-07 17:06 — Dzaryx crée les annonces + attache les photos du chat (+ fixes) ⭐ DERNIER TRAVAIL
- **Quoi** : Dzaryx peut maintenant **créer une annonce depuis le chat** et y **attacher les photos jointes**
  au message, pour les 4 types :
  | Type | Outil | Photos |
  |---|---|---|
  | Voiture location | `add_car` | ✅ multi → `car_photos` + `image_url` |
  | Immobilier (loc/vente) | `create_property` | ✅ multi → `property_photos` + `image_url` |
  | Voiture à vendre | `add_vehicle_for_sale` | ✅ multi → `vehicle_sale_photos` + `image_url` |
  | Pack | `create_pack` | ✅ photo principale (`image_url`) |
- **Mécanique photos** : nouveau endpoint **`POST /api/cars/session-photos`** → upload Cloudinary + cache Redis
  `session:photos:{sessionId}` (TTL 15 min). À la création, `attachSessionPhotos()` consomme le cache et lie les
  photos à la nouvelle ligne. Frontend `TextScreen` : fonction `isCreateIntent` distingue **3 cas** quand tu joins
  des photos → (a) *"crée une voiture/appart/pack…"* = nouvelle annonce + photos ; (b) *"range/enregistre les photos
  du Clio"* = ajout à une annonce **existante** ; (c) *"tu vois quoi"* = analyse **vision**.
- **Bugs trouvés + fixés dans la foulée** :
  - `d4aa670` — **matching voiture** par score de tokens (≥3 lettres) dans `/api/cars/photos`. Avant, le fallback
    exigeait TOUS les mots → un token "9" cassait "Jumpy 9 Places".
  - `e54811b` — **vision dans le chat** : bypass des guards business (`fastPathGuard`/`checkAntiHallucination`)
    quand `imageBase64` présent. La réponse décrit l'image (pas une requête DB) → était écrasée à tort par
    `FAST_PATH_REFUSAL`.
  - `4856275` — **`add_car` débloqué** : il était scopé HORS des agents → Dzaryx ne pouvait PAS créer de voiture
    de location. Ajouté aux agents **Réservations + Général**.
- **Exemples à dire à Dzaryx** : *"crée une nouvelle voiture de location Clio 5, citadine, essence, prix client
  4500, prix proprio 3500"* (+ photos jointes) · *"ajoute un appartement à louer à Oran, 3 pièces, 50000 DA/mois"*
  (+ photos) · *"ajoute une voiture à vendre Golf 7, 2018, 280 DA"* (+ photos).
- **Fichiers** : `backend/src/api/routes/cars.ts` (endpoint + attach), `backend/src/integrations/tool-executor.ts`,
  `backend/src/integrations/tools.ts`, `backend/src/agents/agent-registry.ts`,
  `simulator/src/components/screens/TextScreen.tsx`, `simulator/src/services/api.ts` (`uploadSessionPhotos`).
- **Commits** : `1d5bd08` (upload multi-photos), `d4aa670`, `e54811b`, `4856275`, `9e45312` (attach), `aa8b2d0` (changelog).
- **Test live end-to-end (prod Railway + Supabase)** : ✅ `session-photos: 200 {count:2}` → `chat: 202` →
  `CAR CREATED + image_url:true` → `PHOTOS attached: 2 (position 0,1)` → `CLEANED UP`. Tout vert.
- **État** : ✅ déployé (backend Railway `9e45312` + web gh-pages **v43**). Session clôturée.
- **⏭️ Prochaine étape** : voir **"OÙ ON S'EST ARRÊTÉ"** en haut (wake word logs / PDF-Excel / vérifs device).

### 2026-06-07 13:30→16:00 — Chat façon ChatGPT/Gemini + sécu tokens env + EAS relink
- **Quoi** (tout dans le **simulateur** `TextScreen.tsx`, = l'UI réelle ; ordre chronologique) :
  - `5022f43` — **bouton Copier** visible (façon Gemini/ChatGPT) + affichage du **texte complet** + espace en bas.
  - `4f67b83` — **rendu markdown** (gras / listes / titres / tableaux / code) façon ChatGPT/Claude.
  - `11ba8c6` — **dictée vocale** dans le chat (micro → transcription dans l'input).
  - `e12395d` — bouton **Régénérer** (renvoie le dernier message).
  - `70f7f88` + `6d95e21` — **graphiques** : Dzaryx génère barres/camembert/courbe via un **bloc `chart` JSON**
    dans sa réponse. ⚠️ `6d95e21` corrige une confusion : le backend prenait le chat texte pour du vocal →
    flag **`textOnly`** ajouté pour que markdown + graphes ne s'affichent QUE en chat texte.
  - `1001514` — **streaming typewriter** + **téléchargement** des photos ET des graphiques en galerie
    (`expo-media-library` côté natif).
  - `265bcfd` — **éditer un message** déjà envoyé + **recherche** dans l'historique.
- **Sécu** : `5efb8e7` — **tokens mobiles sortis du repo** (Kouider/Houari) → lus via **variables d'env** au build
  (plus en dur dans `dzaryx-native/app/index.tsx`). Voir [[08_DECISIONS#tokens-env]].
- **EAS** : `819a3e7` — projet relié au compte Play **officiel** `@fikdzaryx/dzaryx` (pour les futurs builds de prod).
- **Fichiers** : `simulator/src/components/screens/TextScreen.tsx`, `simulator/src/services/api.ts`,
  `backend/src/conversation/context-builder.ts`, `backend/src/conversation/orchestrator.ts`,
  `dzaryx-native/app/index.tsx`, `dzaryx-native/app.json`, `simulator/public/sw.js` (bumps v37→v43).
- **État** : ✅ déployé (web gh-pages + backend Railway).

### 2026-06-07 14:39 — Réservations : attribution Kouider/Houari robuste + "qui a bloqué ?"
- **Quoi** : `create_booking` attribue maintenant la réservation au **bon acteur** (Kouider/Houari) de façon
  robuste ; le **check de dispo** dit désormais **QUI** a bloqué le créneau (acteur + client + dates) au lieu d'un
  simple "indispo" ; la **liste** des réservations est filtrée **par acteur**.
- **Pourquoi** : Kouider et Houari sont parfois connectés **en même temps**, chacun sur son login → il faut que rien
  ne se mélange et qu'on voie d'où vient un conflit de dates.
- **Fichiers** : `backend/src/integrations/tool-executor.ts`. **Commit** : `7283337`.
- **État** : ✅ déployé (Railway). tsc backend EXIT 0.

### 2026-06-07 — Vocal: tap-to-talk partout + wake service robuste + vision overlay→app
- **Bug central** : le VAD (détection volume) flicke sur le micro de Kouider → coupe le micro instantanément
  (app ET overlay). SpeechRecognition Google **cassé dans la WebView** (gèle si activé). 
  → **Solution** : SpeechRecognition DÉSACTIVÉ partout ; **tap-to-talk par défaut** (tap micro=enregistre,
  re-tap=envoie ; VAD ne tourne que si "Mains libres" activé manuellement). App vocal = **OK confirmé** par Kouider.
  Commits web : `0e3103a`, `a94d671`, `8fbe382`, etc.
- **Overlay micro** : AudioContext suspendu en overlay → VAD coupait → tap-to-talk (MediaRecorder, indép. AudioContext).
- **Wake/notif cassés après réinstall+reboot** : service fond tué + Porcupine perd son activation (cache effacé,
  besoin internet). → Build robuste : **service ne se tue JAMAIS** (notif reste même si Porcupine échoue) + **retry**
  Porcupine (8-10s) + **BootReceiver** (auto-start après reboot) + **exemption batterie** (popup au lancement).
- **Vision overlay** : le micro/file-chooser en overlay = limité → bouton caméra overlay fait `window.location='dzaryx://vision'`,
  capté par le WebViewClient de l'overlay (`shouldOverrideUrlLoading`) → ouvre l'app + `__triggerVision` → `toggleLiveCam`.
- **Fichiers** : `plugins/withDzaryxWakeWord.js` (resilient+boot+battery), `plugins/withDzaryxOverlay.js` (deep-link),
  `app/index.tsx` (dzaryx://vision), `VoiceScreen.tsx` (tap-to-talk, __triggerVision, bouton vision deep-link).
- **Commit** : `7962f96`. Prebuild clean validé. Build EAS robuste en cours.
- **État** : 🟡 build en cours. APK précédents : wake `nTAdWGSKpDR6XyyEAWXdmg.apk`.
- **⏭️ Reste** : confirmer overlay micro marche (sinon Android bloque le micro en fenêtre overlay = pivoter wake→ouvre app) ;
  Play Store (prod AAB, besoin clé Google) ; sécu tokens en dur dans index.tsx.

### 2026-06-06 — Wake word "Zaria" (Porcupine, service fond) + barre fine overlay
- **Barre fine** : overlay passé d'un panneau 42% à une **barre fine 88dp** en haut (plugin `density*88`, fond transparent)
  + rendu web compact `compact` (App.tsx `?overlay=1` → VoiceScreen compact = logo/texte/caméra/mic, commit `380bf46`).
- **Fix micro overlay** : SpeechRecognition KO dans la WebView overlay → en `compact` on force **VAD+Whisper**
  (`startSRDictation` return false si compact ; + fallback si SR error fatal). Commit `2ed7dd2`. (Web, pas de build.)
- **Wake word** : Picovoice approuvé. Wake word entraîné = **"Zaria"** (en, Android, `Zaria_en_android_v4_0_0.ppn`)
  — "Dzaryx" refusé par le vocab Porcupine (mot inventé). Modèle copié `dzaryx-native/assets/wakeword/Zaria_android.ppn`.
  Plugin `withDzaryxWakeWord.js` : dépendance `ai.picovoice:porcupine-android:3.0.2`, **Service fond** `DzaryxWakeWordService`
  (PorcupineManager → onWake → démarre `DzaryxOverlayService`), activity trampoline `dzaryxwake://start`, copie .ppn en assets.
  Démarrage : `index.tsx` → `Linking.openURL('dzaryxwake://start')` au lancement (1.5s delay).
- **⚠️ Clé Picovoice** : PAS dans le repo (bloqué par classifier, à raison). Stockée en **variable d'env EAS**
  `PICOVOICE_ACCESS_KEY` (env production, sensitive). Plugin la lit via `process.env`. Révocable sur console.picovoice.ai.
- **⚠️ Risques** : (1) version Porcupine 3.0.2 vs .ppn v4 → mismatch possible (wake silencieux) → bumper si besoin ;
  (2) pas d'auto-start au boot (rouvrir app 1× après reboot) ; (3) vision dans overlay pas encore (file chooser natif).
- **Commits** : `380bf46` (barre), `2ed7dd2` (fix micro), `252c259` (wake word). Prebuild validé. Build EAS en cours.
- **État** : 🟡 build wake word en cours. APK barre fine OK avant : `rrmAjmp9rhQCR7ofdbzy6J.apk`.

### 2026-06-06 — Overlay flottant natif (Build A — itération 1)
- **Quoi** : config plugin Expo `dzaryx-native/plugins/withDzaryxOverlay.js` qui injecte au prebuild :
  permissions (SYSTEM_ALERT_WINDOW, FOREGROUND_SERVICE_MICROPHONE), un **Service Kotlin** `DzaryxOverlayService`
  (WebView chargeant la page vocale `?overlay=1` PAR-DESSUS les autres apps via WindowManager TYPE_APPLICATION_OVERLAY,
  onPermissionRequest→grant micro, bouton ✕), et une Activity trampoline `DzaryxOverlayLauncherActivity`
  (deep link `dzaryxoverlay://go` → demande permission overlay puis démarre le service).
- **Déclenchement** : bouton ⧉ (web VoiceScreen) → `sendNativeAction({__native_action:'open_overlay'})` →
  `index.tsx` → `Linking.openURL('dzaryxoverlay://go')`. (Plus tard : notif + wake word Picovoice → même deep link.)
- **⚠️ android/ est gitignored (managed)** → EAS régénère au prebuild → TOUT le natif DOIT passer par config plugin
  (pas d'édition directe de android/). Validé en local : `npx expo prebuild -p android` OK, Kotlin + manifest injectés.
- **Fichiers** : `dzaryx-native/plugins/withDzaryxOverlay.js`, `app.json` (plugin ajouté), `app/index.tsx` (handler open_overlay),
  `simulator/.../VoiceScreen.tsx` (bouton ⧉), `simulator/public/sw.js` (v24).
- **Commit** : `8221357`. Build EAS APK lancé (preview).
- **État** : ✅ **OVERLAY FONCTIONNE** (testé OnePlus 5T 2026-06-06) — la fenêtre Dzaryx s'affiche par-dessus
  l'écran d'accueil avec la voix compacte (logo, texte, mic, caméra, scan, ✕). APK : `hN4hgiVDV2DtZY7GGn3AoT.apk`
  (versionCode 16, keystore zlb4WDEwpw). Mode compact web `?overlay=1` (App.tsx → VoiceScreen seul, commit `455ab76`).
  ⚠️ Install : signature EAS ≠ signature Play (Google re-signe) → désinstaller l'app Play avant d'installer l'APK test.
- **⏭️ Itérations prévues** : (1) overlay COMPACT (voix seule, pas le shell complet) via mode `?overlay=1` dans App.tsx ;
  (2) passer l'auth/acteur dans l'URL (WebView overlay = session séparée) ; (3) déclencher depuis la notif + wake word ;
  (4) greeting auto "Je suis à ton écoute" au lancement overlay. Picovoice = en attente d'appro (Build B).

### 2026-06-06 — Itérations vocal Gemini (suite)
- **Quoi** : (1) **conversation continue mains-libres par défaut** (`handsFree`+`continuousMode` = true) → plus besoin
  d'appuyer, le VAD s'arme seul, détecte début/fin de phrase, répond, reboucle. (2) **Logo Dzaryx au centre**
  (remplace l'étoile) — `simulator/public/logo.png` (copié de `ibrahim/logo.png`), via `import.meta.env.BASE_URL`.
  (3) **Filtre anti-hallucination Whisper** côté backend (`transcribe.ts`) — jette "Merci/Sous-titres/amara.org…"
  inventés sur silence/bruit. (4) **Bump SW cache v17→v18** — l'ancien service worker cachait l'UI = les MAJ ne
  s'affichaient pas (cause des "ça change pas"). (5) **Barge-in** : coupe l'audio dès qu'on reparle (basé sur
  `isAudioPlaying()`, indépendant du statut). (6) **Flip caméra** avant/arrière en mode vision (+ miroir cam avant).
- **⚠️ Limite web confirmée** : Whisper-après-silence comprend moins bien que Gemini (= Google STT temps réel).
  Vrai saut = **STT natif** (`@react-native-voice` = Google SpeechRecognizer) → nécessite build EAS. Idem pour
  "Hey Dzaryx" fond/app fermée (Porcupine + foreground service Android). iPhone = Siri only.
- **⚠️ Cache** : à chaque déploiement, l'utilisateur doit **fermer l'app à FOND + rouvrir** (le SW sert l'ancienne
  version sinon). Network-first sur le HTML donc OK après 1 réouverture une fois le SW v18 actif.
- **Fichiers** : `simulator/src/components/screens/VoiceScreen.tsx`, `simulator/public/sw.js`, `simulator/public/logo.png`, `backend/src/api/routes/transcribe.ts`.
- **Commits** : `b8f9c87` (continu défaut), `49e4e98` (logo+filtre+SW), `c1187d7` (barge-in+flip). Build simulateur EXIT 0, tsc backend EXIT 0.
- **État** : ✅ github.io Published + backend poussé (Railway). Voir [[dzaryx_ui_architecture]].

### 2026-06-06 — Redesign UI Gemini : vocal + chat + vision (simulateur)
- **Quoi** : refonte visuelle des écrans VOIX (`VoiceScreen.tsx`) et CHAT (`TextScreen.tsx`) du **simulateur web**
  vers un style épuré façon Google Gemini, en gardant l'**or Dzaryx** comme accent unique. **Logique 100% intacte**
  (VAD, wake word, caméra live, vision, scan, mode continu, mains libres, socket, historique, proactifs).
  - VOIX : fond noir + lueur or basse (plus de scanlines/HUD/coins/Orbitron/monospace), header minimal,
    **étoile or au centre** + grand texte fin (salutation/réponse), **orbe pill lumineux en bas** (caméra·orbe·scan)
    avec barres d'onde réactives au volume, **vision = caméra plein écran**, overlay activation épuré.
  - CHAT : fond noir, header minimal, **bulles user grises à droite**, **réponse IA plein texte sans bulle/avatar**,
    **input pill** (mic si vide, flèche si texte), liens/docs en or.
- **⚠️ Découverte clé** : l'UI réelle utilisée = le **simulateur web** (`simulator/`) chargé en WebView par l'app
  native (`dzaryx-native/app/index.tsx` → `kouider213.github.io/ibrahim/`). Les écrans natifs `app/voice.tsx`/`chat.tsx`
  ne sont PAS affichés (route `_layout` ne déclare que `index`). Donc le travail UI se fait dans `simulator/`.
  (`app/voice.tsx` natif a quand même été modernisé au passage — inoffensif.)
- **Déploiement** : `cd simulator && npm run build && npx gh-pages -d dist` → **github.io (Published)**. Visible au
  reload de l'app. (Netlify build aussi possible via netlify.toml base=simulator.)
- **Fichiers** : `simulator/src/components/screens/VoiceScreen.tsx`, `TextScreen.tsx`, `dzaryx-native/app/voice.tsx`.
- **Commit** : `a086d33`. Build simulateur EXIT 0 (tsc+vite). Build natif tsc EXIT 0.
- **État** : ✅ déployé github.io.
- **⏭️ Reste possible** : (1) son d'activation micro "trop stylé" comme Gemini — assets `dzaryx-native/assets/page1_voice_vision/audio/listening.wav` existent (branchés côté natif, à brancher côté web si voulu) ;
  (2) **vrai wake word fond/app fermée** = nécessite natif Android (Porcupine + foreground service) — iPhone restera Siri ;
  (3) **sécu** : tokens en dur dans `dzaryx-native/app/index.tsx` (TOKEN_KOUIDER/HOUARI) à sortir du bundle.

### 2026-06-06 — Fix avis invisibles sur /reviews
- **Quoi** : page `/reviews` n'affichait pas les avis seedés (visibles sur la home seulement).
- **Cause** : home fait un refresh client-side (useEffect supabase) → toujours frais ; `/reviews` dépendait
  UNIQUEMENT de getStaticProps + ISR `revalidate:30` → page figée au build, avis seedés après build pas affichés
  tant qu'aucune revalidation Netlify déclenchée.
- **Fix** : ajout refresh client-side dans `/reviews` (même pattern que la home : `reviews` en state, useEffect
  qui re-fetch `reviews` approved au mount).
- **Fichiers** : `pages/reviews.js` (repo site).
- **Commit** : `418e08e`. Build OK.
- **État** : ✅ poussé → redéploiement auto.

### 2026-06-05 — Seed avis (reviews) tous services + multilingue
- **Quoi** : 31 avis insérés dans `reviews` (approved=true) couvrant location, immo (loc+vente), vente voiture,
  packs. Mix français / **darija oranaise** (arabizi + arabe) / arabe classique. **100% Oran** (Fik ne sert qu'Oran).
- **Pourquoi** : Kouider — il n'y avait que des avis location ; il en faut pour tous les services + en arabe/darija.
- **Important darija** : 100% algérien (koulech/fissa3/tonobil/walou, négation -ch, كيما/مليح/الطوموبيل) — PAS de
  mots marocains (kolxi/dghya/بحال/زوين/مزيان/الكار). Tous les avis mentionnent Oran.
- **Comment** : INSERT SQL collé en prod par Kouider (Success). Pas de fichier repo (données pures).
- **État** : ✅ en prod. Visibles home (6 derniers) + /reviews. Gérables admin → Avis.

### 2026-06-05 — Packs sur la home + conditions
- **Quoi** : (1) section "Packs séjour" sur la home (`pages/index.js`) avec le slider `ShowcaseCarousel`
  (même composant que vente/immo) — badge gamme, inclusions, prix, bouton "Tous les packs", dispo dérivée
  (cache les packs dont la voiture/bien est loué). Data chargée en getStaticProps + refresh client.
  (2) Section "Packs séjour (tout-en-un)" ajoutée aux **conditions** (`lib/conditions.js`, FR/AR) — apparaît
  sur /conditions ET dans l'admin conditions (SECTIONS itéré).
- **Pourquoi** : Kouider — la home doit présenter les packs comme la location/immo ; et les conditions doivent
  couvrir les packs maintenant qu'on en gère.
- **Fichiers** : `pages/index.js`, `lib/conditions.js` (repo site).
- **Commit** : `9f41878`. Build OK.
- **État** : ✅ déployé (Vercel).

### 2026-06-05 — Fix RLS packs (insert bloqué) + feature validée
- **Quoi** : à l'ajout d'un pack depuis l'admin → "new row violates row-level security policy for table packs".
  Cause : la policy d'écriture utilisait un sous-select `profiles` (`auth.uid() IN (SELECT id FROM profiles WHERE role IN ...)`)
  qui échoue à l'INSERT (la RLS de `profiles` empêche le sous-select de voir la ligne). Remplacée par
  `auth.role() = 'authenticated'` (USING + WITH CHECK) → admin connecté écrit, public (anon) lit seulement.
- **Fix appliqué** : SQL passé en prod par Kouider (DROP + CREATE POLICY). Fichier repo mis à jour (`0018_packs.sql`).
- **Commit** : site `fdbe109`. **Pack ajouté avec succès — feature confirmée OK par Kouider.**
- **⚠️ RÈGLE pour les prochaines tables du site** : pour l'écriture admin, utiliser
  `USING (auth.role()='authenticated') WITH CHECK (auth.role()='authenticated')` — PAS le sous-select sur `profiles`.

### 2026-06-05 — Packs : liés à l'inventaire réel + gestion Dzaryx
- **Quoi** :
  1. Chaque pack pointe vers un VRAI véhicule (`packs.car_id`→`cars`) + un VRAI bien (`packs.property_id`→`properties`),
     nullable (pack entreprise/chauffeur = sans voiture du parc). Admin = dropdowns inventaire. Dispo du pack DÉRIVÉE :
     indispo si la voiture (`available=false`) ou le bien (`status≠disponible`) est déjà loué. Pages publiques affichent
     le vrai véhicule + bien (cartes cliquables) + badge indispo.
  2. Backend Dzaryx : outils chat `list_packs`, `create_pack` (lie véhicule+bien par nom), `set_pack_status`
     (câblés agents Réservation + Général). Route REST `/api/packs` (CRUD, whitelist PATCH).
- **Pourquoi** : Kouider — un pack = mêmes voitures/biens que ceux loués à l'unité sur le site. Prendre un pack
  bloque ce véhicule + ce bien. Gérable aussi en parlant à Dzaryx (comme immo).
- **Fichiers** : site (`0018_packs.sql` + car_id/property_id, `packs.js`, `packs/[id].js`, `admin/packs.js`),
  Dzaryx (`tool-executor.ts`, `tools.ts`, `agent-registry.ts`, `api/routes/packs.ts`, `index.ts`).
- **Commits** : site `a0ffc19`, Dzaryx `d235f7d`. Build site OK, tsc backend OK.
- **État** : ✅ déployé (Vercel + Railway).
- **⚠️ ACTION REQUISE** : lancer **`supabase/0018_packs.sql`** dans Supabase (table `packs` + `pack_photos` +
  liens car_id/property_id + 4 packs seed). Les FK exigent que `cars` et `properties` existent (OK).
- **⏭️ Reste possible (plus tard)** : le pack entreprise (voiture avec chauffeur) — Kouider n'a pas encore la
  voiture-chauffeur, il l'ajoutera. Blocage par DATES (pas juste statut) si besoin d'un vrai calendrier packs.

### 2026-06-05 — Nouvelle feature : Packs séjour (site)
- **Quoi** : section "Packs" sur le site (combos voiture + immo + jet ski + chauffeur), même stack que
  immo/vente-voitures. Table `packs` + `pack_photos` (migration `0018`, RLS, 4 packs seed). Page publique
  `/packs` (filtres par gamme, cards, inclusions, bilingue FR/AR), détail `/packs/[id]`, admin CRUD
  `/admin/packs` (photos, gamme, inclusions par cases, features, statut, featured). Liens Navbar + sidebar admin.
- **Pourquoi** : Kouider veut vendre des séjours clé en main par paliers de gamme (entrée: voiture+appart,
  médium: voiture+villa, premium: voiture+villa+jetski, entreprise/groupe: villa+voiture avec chauffeur).
- **Fichiers** (repo `autolux-location`/`rental-system`) : `supabase/0018_packs.sql`, `pages/packs.js`,
  `pages/packs/[id].js`, `pages/admin/packs.js`, `components/Navbar.js`, `components/AdminLayout.js`.
- **Commit** : `debfeed` (repo site). Build Next.js OK (EXIT=0).
- **État** : ✅ déployé (Vercel).
- **⚠️ ACTION REQUISE** : lancer **`supabase/0018_packs.sql`** dans Supabase SQL Editor pour créer la table
  `packs` (+ 4 packs d'exemple). Tant que pas fait, `/packs` affiche "bientôt disponibles" (vide, sans erreur).
- **⏭️ Prochaine étape possible** : ajouter la gestion Packs côté Dzaryx (route `/api/packs` + outils chat
  `list_packs`/`create_pack`... comme immo) **si** Kouider veut gérer les packs depuis l'app, pas juste l'admin site.

### 2026-06-05 — Création du centre de documentation Obsidian
- **Quoi** : audit complet site + Dzaryx écrit dans `DZARYX/AUDIT/` (10 notes + hub + canvas).
  Notes : HUB, 01 Démarrage, 02 Architecture, 03 Site, 04 Backend, 05 Apps, 06 Nexus, 07 Data Model,
  08 Décisions, 09 Env/Déploiement, 10 Journal (ce fichier), + `system-map.canvas`.
- **Pourquoi** : Kouider veut qu'une personne qui n'a jamais vu le projet puisse reprendre comme si elle
  l'avait construit, avec le pourquoi de chaque décision. + un journal vivant pour ne jamais perdre le fil.
- **Fichiers** : `ibrahim/DZARYX/AUDIT/*`
- **État** : ✅ fait
- **⏭️ Prochaine étape** : tenir ce journal à jour à chaque changement. Toute nouvelle session commence par le lire.

### 2026-06-05 — Unification du schéma `properties` (immo app + site)
- **Quoi** : `immo.ts` réécrit pour écrire le schéma site unifié (`title`+`name` mirror, `transaction`,
  `price`, `price_type`, `status` normalisé). Whitelist sur PATCH properties + vehicles-for-sale.
  `ImmoScreen` simulateur mis à jour (titre/opération/prix/ville, statuts unifiés).
- **Pourquoi** : la table avait 2 schémas (ancien Houari vs site) → biens cassés entre app et site.
  Kouider gère par les deux → "mêmes biens, vue unifiée". Voir [[08_DECISIONS#properties]].
- **Fichiers** : `backend/src/api/routes/immo.ts`, `simulator/src/components/screens/ImmoScreen.tsx`
- **Commit** : `c6c4fd3`
- **État** : ✅ déployé (Railway). Vérifié : table prod vide (0 ligne) → rien cassé, SQL de normalisation inutile.

### 2026-06-05 — Désactivation du bot WhatsApp client
- **Quoi** : route `/api/whatsapp` débranchée dans `index.ts` (import + `app.use` commentés). Code conservé.
- **Pourquoi** : Kouider — "pas utile pour l'instant". + ferme un risque sécu (webhook public sans
  signature/limiter/dédup). Voir [[08_DECISIONS#whatsapp]].
- **Fichiers** : `backend/src/index.ts`
- **Commit** : `fbf2a3c`
- **État** : ✅ déployé. Endpoint renvoie 404.

### 2026-06-05 — Audit du batch d'hier (4 juin)
- **Quoi** : audit complet du travail de la veille (bot WhatsApp, module immo, leads, nouveaux écrans).
- **Résultat** : code compile, mais bot WhatsApp pas sécurisé + immo désynchro schéma. → corrigé (voir ci-dessus).
- **État** : ✅ analysé et traité.

---

## 🕓 Avant cette session (résumé — détails dans [[CHANGELOG]] et [[CURRENT_STATE]])

- **2026-06-04 (soir)** : construction du bot WhatsApp client + module immo + leads + écrans (clients, leads, fleet, docs).
- **2026-06-03** : latence réduite (thinking vocal off), fix vidéos TikTok (bucket `videos`), fix micro simulateur.
- **2026-06-03** : chatbot "Fik" retiré du site.
- **2026-06-01** : redesign admin WOW, multi-photos voitures, gallery Dzaryx, repos GitHub → privés.
- **2026-05-31** : site autolux v2 (Next.js 14) + 15 outils backend.

> Les anciens journaux détaillés : [[11_JOURNAL]], [[12_GUIDE_REPRISE]], [[CHANGELOG]] (51 Ko d'historique).
