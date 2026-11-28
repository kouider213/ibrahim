## 28/11 (2) — Plus de pilier « Amis »
- Kouider : « pas de truc sur les amis, que la famille et l'argent, pas le temps de faire des amis ». Équilibre = Business, Santé, Famille ; score d'évolution /100 = moyenne des 3 ; mission Liberté « appelle un ami » → « appelle ta mère ou un frère ».

## 28/11 — Équilibre de la semaine en vrais chiffres, « augmente mon autorisé » appliqué, pub TikTok validée → meilleure heure
- Kouider (capture du bilan de samedi) : Business 0/10, Famille 0/10, Amis 0/10 = faux. grand-coach piliersDetail : Business = tout l'argent gagné de la semaine (ventes nettes du journal + bénéfice FIK) face à l'objectif par semaine du plan Algérie, + ligne « tout ton cash » ; Santé = séances + sommeil ; Famille = vrais moments (journal Mon esprit) + temps avec Ibrahim ; Amis = proches vus. Sans donnée → « pas de donnée » (plus de faux 0). Chaque pilier montre ses chiffres ; conseil basé sur ces chiffres, sans célébrité.
- Programme privé : il a demandé d'augmenter son autorisé du jour, le cerveau a répondu « c'est mis à jour » sans rien changer. Nouvelle action `autoriser` (n) : la marche du jour devient n puis redescend d'1 demi tous les 3 jours (jamais au-dessus du niveau d'avant la baisse), le reste du plan recule d'autant, le dépassement du jour est effacé. Pré-route code (parseAllowRaise) → plus de « fait » inventé.
- Pub TikTok : les boutons partent par le bot des notifs ; dans le chat Dzaryx « je valide » / « elle est bien » / « partage-la » = publication programmée au MEILLEUR créneau (heure annoncée), tout de suite seulement s'il dit « maintenant ». Le pack TikTok le dit.

## 27/11 soir (7) — FORME : la prochaine séance peut être une séance MAISON (app v333)
- Kouider (capture 22h13) : en Maison, la séance était « LUN 30 · ABDOS + CARDIO » (la prochaine séance de SALLE traduite) alors que samedi (séance annulée) et dimanche sont des jours maison. Sport.tsx : séance du jour faite → la prochaine = le premier jour à venir, jour maison compris (homeDays du backend).
- presence « Bien rentré » : une séance annulée demain n'est plus annoncée (« Demain 06h00 HAUT C » alors que samedi = repos).

## 27/11 soir (6) — Bilan de chaque pub TikTok + l'équipe apprend de nos pubs
- Kouider : « il n'a même pas fait le récap de la vidéo partagée hier » + « il doit apprendre le maximum des pubs pour booster mon compte ». Cause : le suivi lisait seulement les vidéos les PLUS VUES de TikTok Studio (la pub d'hier n'y était pas) et ne tournait qu'à 4h30 (9 h après la publication → trop tôt).
- PC cloud : action `recent` (profil @fik_conciergerie, /api/post/item_list/ → vues, j'aime, partages, enregistrements des dernières vidéos) ; ajoutée aussi à `insights`.
- tiktok-growth : vidéos récentes fusionnées dans tt:growth ; job `tt-pub-followup` (chaque heure 9h-22h) : pub ≥ 20 h → bilan Telegram (chiffres, % d'une vidéo normale, leçon simple de l'IA), relu à 7 jours ; tout gardé dans tt:pub:results et redonné à l'équipe pour chaque nouvelle pub (growthContext « Résultats de nos dernières pubs »).

## 27/11 soir (5) — Mails : prospects exclus ; argent hors location = net
- Kouider : « aucune collaboration avec cette personne, elle a envoyé STOP à la prospection ». L'expéditeur était un prospect démarché (déjà en « refus ») ; mail-digest exclut les expéditeurs de la table prospects des sections « importants » et « sans réponse » (ils ont leur section « réponses de prospects »).
- La revue comptait les ventes hors location sans retirer ce qu'il a pris dessus : periodMoney.net = ventes − pris ; revue « gardés — vendus − pris », total en net ; « Hier » du point du jour aussi en net.
- Commentaires de code sans montants.

## 27/11 soir (4) — MES VOYAGES : « Mon budget » au lieu de « La dernière fois » (app v332)
- Kouider (capture 21h41) : « je veux pas la dernière fois, je veux noter mon budget ». Champ « Mon budget (€) » → budget ; le plan doit tenir dedans (prompt) ; comparaison « en dessous / au-dessus de ton budget » (fiche, liste, dépenses, Telegram, PDF, impact départ). Anciens voyages avec « dernière fois » toujours affichés.

## 27/11 soir (3) — Relecture de tous les messages du jour avec Kouider
- Liberté : la question « qu'est-ce qui a déclenché la prise ? » (boutons) part 30 min après une prise de trop dès qu'il n'est pas au travail (GPS), le bouclier famille ne la bloque plus (avant : seulement 21h30-22h30, bloquée par le silence du soir).
- Conscience : « prendre de ses nouvelles » 1×/jour s'il n'a rien écrit depuis 5 h et qu'il est libre (heures_sans_message_de_kouider).
- Revue du patron : leçon en français simple (« Cette semaine : … / Semaine prochaine : … »), sans citation ni jargon, action un jour LIBRE (kouider-dossier weekScheduleText) ; « Payé par les clients » ; trésorerie vide = une phrase claire.
- Chiffres du mois du coach = getFinancialReport (une seule règle, comme l'app).
- Réveil : la ligne 💼 n'est plus écrite par l'IA (elle inventait « 2 dossiers en attente d'acompte ») → « Priorité FIK du jour » du point du jour.
- 16h anti-procrastination : actions déjà faites cochées avant (big3Fresh).
- Records de séance : la série la plus lourde (pas la 1re au-dessus du record).
- « kcal brûlées » : une fois par jour, après 19h (6 messages aujourd'hui).

## 27/11 soir (2) — Revue du patron = tout son argent, « 0/3 » expliqué
- Kouider : « la revue du patron prend juste la location, pas le snus, l'achat-revente, l'argent ». mon-argent `periodMoney(from,to)` (ventes hors FIK par source, pièces, achats de stock, dépenses) → revue : ligne hors location, achats, dépenses, total gagné locations + le reste ; le coach IA voit tout (snus Belgique ≠ locations Oran).
- Bilan du soir : « Les 3 actions pour faire rentrer de l'argent que je t'ai proposées ce matin (7h15) » + plus de « 0/3 … règle des grands » ; aucune cochée → « écris fait 1 ».

## 27/11 soir — Dzaryx plus clair et plus présent (Kouider, capture 21h17)
- Bilan du soir : plus de « vérifie avec Houari / réponds-lui » pour un client déjà répondu. wa-demandes garde `replied_at` (notre dernière réponse) ; une demande ne revient en action que si le client a RÉÉCRIT après. Les actions du jour se cochent seules à midi/au soir si le client a déjà eu sa réponse.
- « Examen du soir (Franklin) » → « 3 questions pour finir ta journée ».
- Mails du soir : chaque mail expliqué en une phrase (qui, ce qu'il veut, quoi faire) ; un mail sans réponse n'est signalé qu'une fois ; ligne « réponds au mail de X » seulement si un mail attend une réponse.
- Bouclier famille : seulement quand il est À LA MAISON (plus dehors) ; message d'annonce expliqué en clair.
- Conscience : le bouclier de journée ne bloque plus les conseils (seul le temps famille du soir = urgences). Nouveaux `pistes_business` (vrais signaux FIK, cache 1 h) → un conseil business concret si libre, rien depuis 3 h, < 4 conseils par jour.

## 27/11 nuit — Plan de départ : dépendance à un business projeté affichée (app v331)
- departDetail renvoie `biz` (nom, clients/mois, gain/mois, début, date sans le business) depuis buildPlan ; carte + fiche affichent un avertissement. Cache `curves` recalculé s'il date de l'ancien format.
- « Ce mois-ci » absent = normal tant qu'aucune photo perso:capital n'existe (1re au monthEndRecap de fin de mois).

## 27/11 nuit — Fiche « Ton plan de départ » refaite (app v330)
- Kouider (2 captures 19h49) : la fiche glissait de gauche à droite (bouton « Ajouter / modifier mes étapes (maison en Belgique, appartement…) » sans retour à la ligne) et le graphique en barres jusqu'en 2036 était « éclaté ».
- Kit Sheet : overflowX hidden sur le contenu → plus aucune fiche ne peut glisser de côté.
- DepartPlan : en-tête date + J-x + barre + M DA + au mieux/au pire ; « Ce que tu dois faire » (par mois/semaine, ce mois-ci) ; vraie courbe SVG (réel passé en orange, prévu, simulé en vert pointillé, lignes des étapes, repères aujourd'hui/départ, années, doigt = montant du mois), bornée au départ + 1 an ; étapes en frise avec barre de progression ; « Modifier » en lien ; simulateur regroupé ; leviers en liste ; points de contrôle ✅ si atteints ; 5 idées + « voir les autres ».

## 27/11 nuit — CarPlay + Mon argent + plan de départ (app v329)
- Kouider (photo CarPlay 5h52) : l'agenda montrait « 🕊️ Liberté — étape » et le widget « Route fluide vers le travail » alors qu'il partait à la salle (séance 6h).
- CarPlay : séance de l'agenda (🏋️, HAUT/BAS, séance, salle…) passe TOUJOURS avant l'heure de travail ; adresse floue → adresse de sa salle (routine) ; sinon « Séance dans X min » (car-widget-plus.ts).
- Agenda : garde-fou dans createAgendaEvent/updateAgendaEvent (titre avec Liberté/🕊️/médicament/sevrage/dose → « 🎯 Objectif perso ») ; nettoyage des anciens titres Liberté chaque jour au lieu d'une seule fois (liberte.ts).
- Plan de départ : J-x, à mettre de côté par mois/semaine, « ce mois-ci » (épargne depuis la photo de fin de mois vs prévu), prochaine étape et ce qui manque, objectif en M DA, années sous la courbe ; simulateur avec la VRAIE marge snus/FIK du serveur (avant 2,25 € figé), curseur « achat maintenant » (mois plus tard), remise à zéro ; « il manque X » → « encore X à mettre de côté d'ici là ».
- Mon argent : carte départ remontée ; virgule dans les soldes/étapes (14000,50 devenait 1 400 050) ; plus de crash si 30 jours / jours de semaine vides ; curseur collé au bord corrigé.

## 27/11 — Page Aujourd'hui réorganisée (app v328)
- Kouider : « améliore la page Aujourd'hui ».
- Nouvelle carte « Ta journée » juste sous la carte cash : RDV agenda FIK, départs, retours, tâches à heure fixe et argent à encaisser, dans l'ordre des heures, avec une ligne rouge « maintenant » ; heure des mouvements reprise de /api/taches (moves) ; tâche passée pas faite = « en retard » en rouge ; bouton WhatsApp sur les départs/retours.
- Avant : agenda, départs, retours et « à encaisser » étaient tout en bas → supprimés là (doublons), tuiles « Demandes 24 h / Arrivées 7 j » retirées (déjà dans À traiter / En ce moment).
- Si /api/insights/today ne répond pas, la page ne montre plus « Pas de connexion » en entier : argent, messages et tâches restent, bandeau « toucher pour réessayer ».
- Résumé du haut : voitures qui bougent · RDV · tâches · à encaisser.
- Carte Mon argent : « MON ARGENT · AUJOURD'HUI » ne chevauche plus « 16 snus · stock ».

## 27/11 — Algérie = Oran + tout est privé (app v327)
- Kouider : « en Algérie je vis à Oran, j'arrive toujours à Oran ; tout ce qu'on fait et va faire, personne ne doit le voir à part moi ».
- Règle SA VIE (constants.ts, tous les cerveaux) + dossier : arrivée toujours Oran, Oran = sa base (jamais d'hôtel à Oran), autres villes = sorties depuis Oran ; tout ce qui le concerne est privé (ni Houari, ni clients, ni quelqu'un sur son téléphone ; rien dans WhatsApp/mail/doc/post sans sa demande).
- MES VOYAGES : même règle Oran dans le planificateur ; recherches web sans son nom, sa famille, ses montants ni sa ville.
- App : un accès refusé (401/403) ne ressert plus la copie gardée hors-ligne ; déconnexion = copies privées effacées du téléphone (dz:cache:*, dz:ma:*, dz:analyse:*).
- Vérifié : outils perso (Jarvis 4 : finances, voyages, analyse, tâches…) déjà refusés aux sessions Houari ; routes app = compte Kouider seulement.

## 27/11 — Améliorations MES VOYAGES + MON ANALYSE (app v326)
- Kouider : « rajoute des améliorations au maximum ».
- VOYAGES : modifier le plan en une phrase (« moins cher », « ajoute Tlemcen », « 3 semaines » → refait avec les mêmes recherches, coches gardées), 30 nouvelles options (garde celles cochées), date de départ → J-x + combien mettre de côté par semaine, onglet Dépenses (budget restant, par jour pendant le voyage), dépenses « -50 essence » ajoutées seules au voyage en cours, check-list → À faire (datée depuis le départ : « 1 mois avant », « la veille »…), lieux → Google Maps (app + liens dans le PDF), PDF avec dépenses. Outil voyage : modifier/options/date/taches/depense.
- PDF : le signe € était effacé (filtre Latin-1) → gardé.
- ANALYSE : engagements « je le fais » gardés sur le serveur (perso:analyse:engage, « je m'engage sur la 3 » sur Telegram) et repris dans l'avis ; historique quotidien (perso:analyse:hist) → « le JJ/MM : … » sur chaque objectif ; simulateur « et si » (pièces/jour, dépenses, jours FIK, autre revenu → date de départ) ; options numérotées.
- Aujourd'hui : la tuile Stock snus montre pièces + jours restants (rouge sous 7 j).

## 27/11 — Tout mon cash sans « 127 », raccourci Stock snus, MON ANALYSE, MES VOYAGES
- Kouider : « la 1re fois il reste à 127, il va pas direct au total » → la carte de secours « À récupérer » s'affichait tant que /api/mon-argent n'avait pas répondu. Dernier chiffre gardé sur le téléphone (dz:ma:last) et affiché tout de suite ; ancienne carte seulement sur un vrai 403. CountUp part du chiffre affiché (plus de retour à 0).
- Stock snus : « 📦 stock › » cliquable dans la carte argent du jour + 3 raccourcis sur Aujourd'hui (Stock snus, Mon analyse, Mes voyages) ; menu renommé STOCK SNUS.
- MON ANALYSE (analyse-vie.ts, GET /api/mon-argent/analyse + /analyse/avis, outil mon_analyse, page app) : objectifs calculés (départ Oran, record du mois, poids, sommeil, stock, part FIK) + 20 options « si tu fais ça → tu atteins ça au lieu de ça » (même courbe que le plan de départ) + avis IA court (cache 6 h, seulement les chiffres calculés).
- MES VOYAGES (voyage-plan.ts, outil voyage, /api/mon-argent/voyages, page app) : demande libre (Telegram ou app) → recherche web + plan JSON (route jour par jour, villes, 20+ lieux pour lui + sa femme + Ibrahim, budget ligne par ligne vs la dernière fois, objectifs, check-list) + 30 options (+ secours Algérie en voiture) → PDF + résumé Telegram. 3-5 min en fond. Testé hors envoi : 30 options, 20 lieux, PDF OK ; la ligne « TOTAL » de l'IA est ignorée (doublait le budget).
- App v325.

## 27/11 — Carte « Mon argent · aujourd'hui » (Aujourd'hui) = même chiffre que MON ARGENT
- Kouider : la petite carte ne montrait pas le même montant du jour que MON ARGENT (ventes sans enlever ce qu'il a pris).
- MonArgentMini (app v324) : montant = ventes − pris, ligne « ventes − pris · heure · lu à », lien « ➖ J'ai pris dessus », « ↩ Annuler la dernière » (avec confirmation), stock en rouge ≤ 30.

## 27/11 — PLAN DE DÉPART vérifié : chiffres en direct, repères corrigés, curseurs qui ne font plus bouger la page
- Kouider : « vérifie que tout ce qu'il dit est correct, que les chiffres changent au fur et à mesure ; quand je bouge le curseur toute la page bouge ».
- departDetail : courbes (cache 6 h) recalées sur son total du jour → chaque vente/prise/dépense change dates, % et « prochain point » tout de suite.
- Repère « Départ pour Oran » = même calcul que la fiche (avant : janv. 2030 contre déc. 2029).
- Snus : prix moyen seulement sur les ventes en pièces (l'arrondi des ventes en euros donnait > 6 €/pièce) ; pièces/jour = moyenne des jours de vente NOTÉS sur 30 j (avant : 7 j avec les jours non notés à 0 → 2,1/jour, stock « 112 jours » faux).
- Coussin de sécurité : charges + vie courante du plan, pas le salaire entier.
- App v323 : DepartPlan curseur maison (touch-action none, capture du doigt, gros bouton) — la page ne défile plus.

## 27/11 — ARGENT FIK RÉCUPÉRÉ : il choisit où il va (cash / compte / utilisé)
- Kouider : « quand je récupère l'argent des locations, parfois je l'utilise, parfois je l'économise (ex. je l'ai utilisé pour acheter de l'or) ».
- real-profit.ts : setCollected/markAllCollected(dest, label) ; ProfitItem dest/destLabel/moved ; applyDest : cash → cash +, compte → épargne +, utilisé → dépense notée (mon-argent fikUsed, rien n'entre). Décocher défait seulement ce que Dzaryx avait déplacé.
- Outil financial_report collected : destination + usage, le cerveau demande où va l'argent s'il ne le dit pas. Route /ledger/collect : dest + label.
- App v322 (CA) : cocher « récupéré » ouvre « il va où ? » (cash / compte / utilisé + pour quoi).

## 27/11 — TOUT MON CASH sur Aujourd'hui + « chez Houari » compté + « Déjà répondu » dans À traiter
- Kouider : le total ne comptait pas l'argent FIK à récupérer chez Houari ; la carte d'Aujourd'hui ne montrait que les locations ; il ne pouvait pas retirer des demandes auxquelles il avait déjà répondu.
- mon-argent.ts : balances.aRecuperer (profitLedger.toCollect) inclus dans le total ; argent-direct totalText ajoute la ligne « À récupérer chez Houari ».
- real-profit.ts : marquer récupéré (une location ou tout) → l'argent passe dans le cash (moveCash), décocher → retiré.
- App v321 : carte « Tout mon cash » (cash en main + chez Houari, détail : cash en main / chez Houari / aujourd'hui, ligne FIK en dessous ; ancienne carte pour les autres comptes) ; MON ARGENT affiche « Chez Houari » ; InboxCard bouton « ✓ Déjà répondu — retirer » (action inbox `repondu` → demande fermée « contacté »).

## 27/11 — CASH À JOUR : chaque vente entre dans le cash, chaque « pris » en sort
- Kouider (capture MON ARGENT) : le cash n'incluait pas l'argent du jour, il doit être cash + argent du jour.
- mon-argent.ts : moveCash() exporté ; monArgentAdd (+montant), monArgentTake (−), monArgentSetDay (±écart), monArgentUndo (inverse, seulement si la ligne est après le dernier cash donné à la main = sideCashTs).
- argent-direct.ts : vente Telegram (« snus 150 ») → +cash (pas pour « cash +20 » qui le fait déjà, ni FIK) ; cash donné à la main → sideCashTs ; réponse « pris » affiche le cash.
- Données : cash du jour ajouté une fois à la main. App v320 (texte du formulaire « pris »).

## 27/11 — ARGENT DU JOUR : « j'ai pris 20 € sur le cash d'aujourd'hui » compris + heures + montant modifiable
- Kouider : « je pris 20 € sur le cash d'aujourd'hui, il pense que j'ai [son cash global]… il a pas calculé les 20 €… je sais même pas à combien je suis aujourd'hui ».
- Cause : la phrase retirait 20 € du cash GLOBAL ; « Cash +20€ » était noté comme une vente de snus ; « je suis à combien aujourd'hui » n'était pas compris.
- argent-direct.ts : `take` (pris sur l'argent du jour, le cash global ne bouge pas), `setDay` (« aujourd'hui je suis à 70 », « corrige le montant du jour à 70 » → ligne de correction, stock inchangé), question du jour → ventes − pris = reste, chaque ligne avec l'heure, « lu à HH:MM ».
- mon-argent.ts : dayMoney / monArgentTake / monArgentSetDay, entrée journal `prise` (supprimable) ; routes POST /prise et /jour.
- App v319 : carte « Argent d'aujourd'hui » (reste, ventes − pris, heure de chaque ligne, lu à…), boutons « J'ai pris dessus » et « Modifier le montant » ; heures dans l'historique, filtre « Pris ».
- Journal du jour corrigé à la main (fausse vente +20 € retirée, prise de 20 € ajoutée).

## 27/11 — DÉPART TRAVAIL : plus d'appel « pars maintenant » quand il est déjà au travail
- Kouider : appelé à 11h55 « il faut partir pour le travail à 12h, 3 min de route » alors qu'il y était déjà.
- Cause : la position en direct Telegram n'est mise à jour que quand il bouge. Immobile au travail → plus « fraîche » après 20 min → trajet calculé depuis la maison (450 m du travail, au-delà du rayon 350 m) → appel.
- departures.ts : dernière position de moins de 4 h sans mouvement depuis, à moins de 350 m du RDV = déjà sur place → aucun message ni appel.

## 27/11 — PROMOS AIR ALGÉRIE : Dzaryx les trouve, les lit et dit si ça te concerne (app v318)
- Kouider : « je reçois une notif de promo Air Algérie mais je sais pas de quoi ; Dzaryx doit me le dire ».
- Constat : les promos n'arrivent pas dans la boîte pro (seule boîte lue) → Dzaryx va les chercher lui-même.
- backend ah-promos.ts, job ah-promos 8h/13h/18h : offres du site (éditions Algérie, France, International : nouveau trajet / baisse ≥ 5 %), bannières de l'accueil + « Nouveautés et promotions » (rendues via r.jina.ai), presse 2×/jour. IA appelée seulement s'il y a du nouveau, après avoir LU la page de chaque promo ; « pour toi » seulement si elle couvre clairement Europe ↔ Oran/Alger ou tous les vols / les familles. Message avec boutons (cherche le prix / surveille / pas intéressé). 1re passe = mémorisation sans message.
- Outil promos_air_algerie : list, check, explain (texte ou capture de la notif reçue), dismiss. Carte « À faire » : bandeau promo quand une promo te concerne.

## 27/11 — MES TÂCHES reliées aux clients et aux voyages + 20 options (app v317)
- Kouider : « connecte ça avec les arrivées et départs des clients, et pour moi quand je vais en Algérie, + 20 options ».
- backend taches-lies.ts : arrivées/retours clients 3 jours (check-lists trips.ts, téléphone de la résa), ses vols 10 jours (check-list + demandes Houari/famille), lieu actuel (mode Oran GPS ou voyage vers l'Algérie). trips.ts : tickTripItem + syncClientTrips.
- 20 options : 1 clients dans « À faire » · 2 check-list client cochable · 3 boutons WhatsApp/Appeler · 4 heure d'arrivée/retour inconnue · 5 acompte pas reçu à J-3 · 6 même voiture rendue et reprise le même jour · 7 journée chargée (≥ 3) · 8 « tu es à Oran ce jour-là » · 9 ton vol + compte à rebours + check-list cochable · 10 demandes Houari/famille + message J-2 · 11 tâches « en Algérie » (devinées dans la phrase) · 12 tâches « au retour » · 13 liste envoyée à l'arrivée en Algérie / au retour · 14 tâches d'Algérie pas faites gardées pour le prochain voyage · 15 jour du départ : bouton « tout décaler au retour » · 16 8h : clients du jour + ton vol · 17 20h30 : ce qui manque pour les clients de demain · 18 dimanche : semaine avec clients et vols · 19 1 h avant une arrivée/un retour client : ce qui manque · 20 cocher par la voix (outil mes_taches check) + badge 🇩🇿.

## 27/11 — AUJOURD'HUI : boîte « À traiter » (WhatsApp, TikTok, relances, réservations) + MES TÂCHES (app v316)
- Kouider : « sur la page Aujourd'hui je dois pouvoir accepter, refuser, répondre… pour TikTok et WhatsApp » + « des rappels des tâches que je lui demande (lundi appeler le médecin pour ma femme…) ».
- backend inbox.ts + /api/inbox (Kouider seulement) : brouillons WhatsApp/TikTok, demandes, relances, réservations site → boutons Envoyer (5 s pour annuler), Dispo, Complet, réécrire (court, pro, darija, langues), réponses rapides, traduire, discussion, vocal, plus tard, conclu/perdu, note. booking-status.ts partagé avec demandes.ts.
- no-dispo : « Voici nos disponibilités… » est maintenant reconnu comme une promesse de dispo (brouillon remplacé par « on vérifie »).
- backend taches.ts + /api/taches + outil mes_taches : tâches perso (app_kv perso:taches) avec jour (« lundi », « demain », « 3 décembre »), heure, pour qui, catégorie, répétition semaine/mois. Messages : 8h liste du jour (boutons ✅ si ≤ 3), à l'heure dite (Fait / 1 h / Demain), 20h30 ce qui reste, dimanche 19h la semaine, tâche repoussée 3 fois → choix. « tâche 1 faite » (« fait 1 » reste au Grand Coach).
- App : carte « À faire » sous « À traiter » : cocher, Demain, autre jour, supprimer, ajouter (jour + heure), promesses et rappels à heure fixe affichés à côté.

## 27/11 — STOCK & COMMANDES : stock par modèle (en points), factures, ruptures, commande conseillée (app v315)
- Kouider : factures fournisseur + modèles qu'il vend, noter par nombre de points, comptage de l'après-midi, prévenir quand recommander, best-sellers, gains, meilleurs jours, ruptures et remplacements.
- backend stock-produits.ts (générique, AUCUN nom de produit ni prix dans le dépôt) : catalogue / factures / comptage dans app_kv perso:stock:* (catalogue privé avec alias, points, couleur, rupture → remplacement) ; stock = comptage + arrivages − ventes par modèle ; coût réel par pièce = prix × total payé / articles (DHL + taxes répartis) ; rythme des commandes (écarts entre factures) ; commande conseillée (couvre rythme + délai 4 j, ruptures remplacées) ; best-sellers, bénéfice et marge par modèle, jours restants, meilleurs jours en pièces ; conseils (stock qui dort, marge faible, frais par pièce, ventes sans modèle…).
- Ventes : modèle choisi avant +1 (gardé sur le téléphone, aussi sur la carte Aujourd'hui) ; Telegram « 3 + nom du modèle » via alias du catalogue privé (aliasHit en mémoire, jamais « 3 enfants »).
- Alerte Telegram « c'est le moment de recommander » + commande conseillée (job argent, 1×/jour).
- App : page STOCK (menu Perso, lien depuis la carte snus) : recommande, compter mon stock, nouvelle facture, modèles (rupture/remplacement/caché), best-sellers, conseils, jours, commandes.

## 27/11 — MON ARGENT : 20 options en plus (app v314)
- Kouider : « regarde s'il n'y a pas des trucs à améliorer, tu sais mes objectifs, rajoute 20 options ».
- Saisie : (1) Telegram/Siri « 3 pièces », « 10 pièces à 5 », « 12 pièces lot », « hier 4 pièces » (jamais « appartement 3 pièces ») ; (2) question de 20h30 en pièces ; (3) dépense rapide par catégorie (cash → le cash baisse) ; (4) arrivage de stock (pièces + prix) ; (5) dépôt cash → compte / retrait compte → cash avec motif (cash_log).
- Suivi : (6) stock de snus en direct (« Compter » puis − ventes + arrivages) + alerte Telegram ≤ 30 ; (7) objectif pièces/jour ; (8) objectif du mois € + reste par jour ; (9) carte « Hier » ; (10) dépenses du mois par catégorie + taux d'épargne réel ; (11) courbe réelle (perso:capital) dans le plan ; (12) âge des soldes + rappel dimanche si > 7 j ; (13) filtre de l'historique.
- Confidentialité : (14) mode discret (montants masqués, aussi sur Aujourd'hui) ; (15) € ↔ DA au taux square.
- Plan : (16) simulateur « et si… » (pièces, jours FIK, dépenses) → date de départ en direct ; (17) bouton récap PDF du mois ; (18) « Hier : X € » dans le Grand Coach ; (19) alerte cash qui dort (samedi, ≥ 1 500 €) ; (20) prochain point de contrôle sur la carte départ.
- jobMonArgent branché sur le job « argent » existant (pas de nouveau cron). Pas de doublon avec argent-coach (20h30, dimanche, PDF fin de mois, zakat).

## 27/11 — MON ARGENT : gros bouton « Valider la vente » + historique de toutes les ventes supprimables (app v313)
- Kouider : « je dois pouvoir valider la vente de 10 et supprimer des anciennes ventes ».
- Après +1/+2/+5/+10 : grand bouton vert « ✅ Valider la vente : N pièces » (N × prix = total) + « Annuler ».
- Historique de TOUTES ses ventes (app + Telegram + anciennes sans heure), groupé par jour, 🗑 avec confirmation ; clé stable keyed() (horodatage, sinon date|source|montant|occurrence) ; undo accepte key.

## 27/11 — Plan de départ : la maison passe toujours avant la voiture en Algérie
- Kouider : « la maison doit toujours passer avant l'achat de la voiture en Algérie ». Étapes par défaut : réserve → maison → voiture → déménagement ; houseFirst() remet la maison avant la voiture même dans un ordre qu'il enregistre.

## 27/11 — MON ARGENT : départ = plan par étapes cliquable (3 scénarios, leviers, points faibles, 20 options) + conseiller corrigé (app v312)
- Kouider : « il parle d'acheter une 2e voiture alors que je n'en ai même pas une : elles sont toutes à Houari, sauf l'Audi Q3 qui est ma voiture perso » + « au rythme actuel il doit rajouter des phases (maison Algérie, voiture, maison Belgique…), une vraie analyse, quand je clique plus d'infos, un départ potentiel, où je dois m'améliorer, + 20 options ».
- Conseiller : fait ajouté (FIK ne possède aucune voiture, tout est à Houari ; Audi Q3 = voiture perso) + exemple corrigé.
- departDetail (GET /api/mon-argent/plan, POST /goals) : courbe d'épargne de la projection (3 scénarios), étapes cumulées (réserve, voiture, maison + frais + meubles, déménagement, + les siennes, ordre modifiable, kv perso:argent:goals) avec date au mieux / réaliste / prudent ; leviers (snus, FIK, dépenses, heures sup, appartement) en mois gagnés ; points faibles calculés ; points de contrôle 3/6/12 mois ; 20 options (fin 2028, maison −20 %, crédit 20 %, occasion, taux du dinar, inflation, remplacer snus/salaire, appartement à Oran, réserve 3 mois, zakat, papiers, école, retraite belge…).
- App : carte « Départ potentiel » avec frise des étapes → fiche détaillée (courbe vs objectif, étapes cliquables, édition des étapes).

## 27/11 — MON ARGENT : tarifs snus corrigés + « 1 pièce à 6 € / à 5 € » en un appui (app v311)
- Kouider : « 12 pièces au prix normal = 6 € × 12 = 72 € ; à partir de 10 c'est 10 × 5 et en plus 5 € aussi (11 = 55 €) ; pour les ristournes client, 2 touches : 1 pièce à 6 € et 1 pièce à 5 € ».
- snusPrice : normal = × 6 ; lot = dès 10 pièces × 5 (sous 10 : × 6) ; cinq = 5 € ; six = 6 €. Boutons « 1 pièce à 6 € » / « 1 pièce à 5 € » (page + carte Aujourd'hui).

## 27/11 — Liberté : la limite suit ses progrès (2 jours sous la limite → elle baisse)
- Kouider : « quand il voit qu'après 2-3 jours je prends moins que la limite, il diminue… parfois j'arrive à 3 demis mais je recommence à augmenter car je me dis : je suis autorisé à 6 ».
- liberte.ts : LibState.cap ; allowedOn = min(plan du médecin, limite personnelle) ; capCheck chaque matin (≥ 5h) : 2 jours notés (> 0) sous la limite → limite = le plus haut des 2 jours, message Telegram + prochaine marche. Jamais au-dessus du plan, jamais remontée seule ; jours vides ignorés.
- Manque ≥ 7/10 → limite personnelle retirée (retour au plan du médecin). Action 'limite_plan' pour la retirer. Au-dessus de sa limite mais dans le plan : message ferme, pas d'appel, pas de « dépassement ».

## 27/11 — MON ARGENT v2 : snus à la pièce, appartement = prix client − propriétaire, graphiques, départ, 20 repères, conseiller + carte sur Aujourd'hui (app v310)
- Kouider : « le +1 c'est le nombre de pièces de snus : 6 € la pièce, 5 € pour certains clients, dès 10 = 50 € les 10 sauf certains (60 €) ; appartement = prix client − prix propriétaire ; vente voiture / autre (heures sup) = je donne le montant ; dans Aujourd'hui ; meilleurs graphiques ; un vrai suivi qui conseille, avance ou recule le départ ; 20 trucs auxquels je n'aurais pas pensé ».
- Snus : +1/+2/+5/+10 pièces, tarifs Normal (6 €, ≥ 10 → 5 €), Client à 5 €, Sans ristourne (6 €) ; qty/unit/tarif gardés dans perso:journal ; marge réelle/pièce = prix moyen − coût du stock (perso:finances.side.order).
- Appartement : prix client − prix propriétaire (pas encore relié à IMMO : les biens n'ont ni prix propriétaire ni réservations). Vente voiture / Autre : montant + note.
- Page : carte verte façon Aujourd'hui, anneau des sources du mois, barres empilées 6 mois + 30 jours, départ pour Oran (algerie-plan buildPlan, cache 6 h) avec barre de progression, 20 repères calculés par le code (marge, ristournes, stock, rythme, coussin, cash qui dort, 50/30/20, taux d'épargne, part FIK, ce qui suit à Oran, zakat…), conseiller (POST /api/mon-argent/advise : capital + revenus + départ, recherche web, 5 parties).
- Aujourd'hui : carte « Mon argent » (total du jour, snus du jour, +1/+5/+10 → Noter), cachée pour un autre compte.

## 27/11 — Voiture : récap global du matin (WhatsApp, TikTok, réservations, priorité)
- Kouider : « le matin quand je vais à la salle… un récap global WhatsApp, TikTok, réservations et autre sur le CarPlay ou en appel ».
- jarvis4 carBrief avant 11h : + recap_matin (TikTok sans réponse / en cours, demandes WhatsApp ouvertes, réservations des 7 jours, priorité du Grand Coach), 4 phrases / 65 mots. Numéros jamais lus (priorité anonymisée), demandes « sans suite » plus annoncées, plus de « je ne peux pas vous annoncer… ».

## 27/11 — MON ARGENT (privé) + page CA : véhicules cliquables, évolution, quand les clients écrivent (app v309)
- Kouider : noter chaque vente hors FIK (snus, appartement, vente de voiture, autre) en +1/+10, total de tout son argent, meilleurs jours, ce qui rapporte le plus ; « rien ne doit être visible pour d'autres personnes ».
- Backend mon-argent.ts + route /api/mon-argent (compte Kouider seulement, 403 sinon) sur le MÊME journal que Telegram (perso:journal / perso:finances) ; FIK = bénéfice des réservations automatiquement. Aucune donnée dans le dépôt.
- App : page MON ARGENT (Plus › Perso) : soldes compte + cash modifiables, +1/+5/+10/+20/+50/+100 cumulables, aujourd'hui/semaine/mois, sources (mois + 12 mois), 30 derniers jours, moyenne par jour de semaine, records, dernières ventes avec ×.
- argent-direct : « Xk sur le compte et Y en cash », « épargne X » compris (avant : rien, alors que la réponse disait de l'écrire ainsi).
- Page CA : le bloc « Mon bénéfice depuis le début » ne s'affiche plus sur les autres mois (vu sur septembre avec les résas de novembre) ; voitures cliquables → leurs locations (client, dates, prix, marge) ; onglet Année : évolution réservations/mois + « quand les clients écrivent » (jour, moment, délai 1er message → réservation quand le numéro correspond).

## 27/11 — Cerveaux gratuits saturés à 07h33 : compteur par module + Conscience plus sobre la nuit
- Kouider : message « cerveaux gratuits saturés » le matin (Gemini 20 req/jour/modèle, remise à zéro ~9h). Seulement 2 appels Claude de secours (< 1 centime) : pas un problème de crédit Claude.
- anthropic-compat : chaque appel gratuit compté par fichier appelant (app_kv free:calls:<jour>:<source>) pour savoir qui consomme.
- conscience : la nuit (22h45-6h, urgence 3 seulement) une seule réflexion IA par heure au lieu de toutes les 10 min.
- Grand Coach : demande qui finit par « d'accord merci » sans date = pas un lead (Halima classée « sans suite »).

## 27/11 — Grand Coach : le message de 7h15 devient un vrai point du jour
- Kouider : « c'est pas très intéressant ce qu'il dit, faut que ce soit pertinent et compréhensible, un vrai truc pro ». Avant : histoire d'un grand (Hormozi 3× ce mois), 3 actions vagues (« publie la liste des seize voitures disponibles », contraire à la règle « jamais de dispo »), livre jour 26, compte à rebours, 8-10 blocs.
- Maintenant (makeBrief / briefSignals, kv gc:brief:<date>) : 🎯 1 priorité choisie par le CODE dans les vraies données (demande client sans réponse > acompte avant départ > demande répondue pas conclue > remise à préparer > flotte vide 14 j > retard objectif > FIK Sites) + pourquoi chiffré ; 📊 5 chiffres (mois vs objectif, bénéfice, rythme, acomptes, demandes ouvertes, départs 7 j) ; ✅ 3 actions avec vrais noms (fallback = actions des signaux) ; 💡 leçon d'un grand appliquée à la priorité (2 phrases).
- Défi + compte à rebours seulement le lundi, baraka le vendredi ; livre sur demande. Vocal = point du jour parlé. Grand du jour : pas le même avant 20 jours. Report des actions de la veille : seulement celles du point du jour, jamais « voitures disponibles ». « avant 20:00 » → « après 20:00 » (pas de pause au travail).

## 27/11 — Conseils et récaps : plus de location finie ni de texte de la veille
- Kouider : « revient AUJOURD'HUI » répété le 26/11 (13h20, 19h20, 22h50) pour un client dont la voiture était déjà rendue à 08h00, avec un WhatsApp d'un autre numéro collé dessus ; récap 05h30 du 27/11 reprenait « AUJOURD'HUI … attend depuis 2 h » écrit la veille.
- conscience : location COMPLETED (ou retour passé de 2 h) = « TERMINÉE, n'en parle pas » ; interdiction de relier un WhatsApp à un client sans nom/numéro exact.
- 07h20 encore « La Clio 4 arrive aujourd'hui… attend l'âge (35 ans) » : le modèle recopiait ses conseils ignorés de la veille. Garde dans le code : un conseil qui nomme un client dont la location est finie (sans autre location en cours) ou qui recopie à ≥ 50 % un conseil ignoré d'un autre jour n'est pas envoyé.
- auto-call staleTimed : un texte en relatif (aujourd'hui, ce soir, maintenant, depuis X h, dans X min) mis en boîte un autre jour = périmé.

## 27/11 — Plus d'appel « tu n'es pas à la salle » quand la séance est déjà faite
- Kouider : appel 07h00 « ta séance a commencé à 06h00, tu n'es pas à la salle » alors qu'il rentrait (bilan 9/10 envoyé 06h46). GPS figé depuis 05h30 → arrivée jamais vue ; au retour, position fraîche à 2,4 km → alerte.
- jobSportWatch : séance notée ce jour (bilan sport-review, journal kouider:sport:log ou séance en cours dans l'app) → arrivée marquée, aucune alerte.

## 27/11 — Récap « tu n'avais pas décroché » : plus de rappel de départ périmé
- Kouider : « il m'a dit d'aller à la salle alors que j'y étais ». Appel 05h30 « pars à 05h42 » refusé → silence 1 h → récap 06h45 reprenait « C'est l'heure du sport… pars à 05h42 » pendant qu'il finissait sa séance (bilan 06h46).
- auto-call staleTimed : « pars/partir/départ … à HHhMM » périmé 10 min après cette heure ; réveil / « il faut partir maintenant » / « l'heure du sport » périmés 30 min après leur mise en boîte.

## 26/11 — FORME : chiffres faux retirés (vérif « kcal brûlées »)
- Audit : métabolisme de base (Mifflin 1705), actif montre (785, cohérent 17 433 pas), brûlé « maintenant », objectif = dépense − 500 : justes.
- FAUX corrigé : « vraie dépense mesurée 1625, la montre surestime de 884 » (aucune pesée depuis le 17/11 ; Kouider note TOUS ses repas — ne jamais dire le contraire) → affiché seulement si pesées couvrent la période (dernière ≤ 4 j) et résultat ≥ 1,25 × métabolisme ; sinon adaptiveWhy dit pourquoi (app v308).
- FAUX corrigé : « 0 kg/semaine » quand plus de pesée depuis > 5 j → vitesse inconnue + bilan « ta dernière pesée date du 17/11 » (au lieu de « il me faut 5 pesées (tu en as 9) »).
- Échauffement rameur/vélo/elliptique compté dans les kcal de séance (seul le tapis l’était).

## 26/11 — Pubs : musique douce automatique si pas de musique IA
- Kouider : « beaucoup de temps sans son » (pub 9f7a0969 gratuite = 0 musique, 8,9 s de silence). Bibliothèque de 7 musiques douces libres de droits (Pixabay, usage commercial sans mention ; 60 s, -20 LUFS) dans Supabase videos/studio-music/. tiktok-pub : sans musique IA → pickLibraryMusic (pas les 3 dernières, kv pub:music:recent), volume 0,4 + baisse sous la voix. Échantillon envoyé sur Telegram. Musique TikTok + épinglage auto abandonnés (casse-tête anti-robot).

## 26/11 — Pub publiée : prévenu même pendant le bouclier famille
- Kouider : « Dzaryx m’a pas prévenu qu’il a partagé la vidéo ». Le « ✅ publiée sur ton TikTok » de 19h30 (créneau choisi) était gardé par le bouclier famille jusqu’à 22h30. queueTelegramMessage(…, passShield) : résultat de publication + rappel « meilleur moment » passent le bouclier (pas le « ne me dérange pas » explicite).

## 26/11 — FORME calories : plus d’huile devinée
- Photo repas : huile/beurre/sauce comptés SEULEMENT si visibles (1 c. à soupe max/plat), sinon 5 g max (salade, sauté) et signalé ; toujours sur une ligne à part (✕). Lignes 0 g / 0 kcal retirées. Cas réel : bissara + pain-merguez + salade = 965 kcal dont 180 d’huile non visible → test texte 543 kcal.

## 26/11 — FORME repas : ✕ pour retirer un aliment (v307)
- Fiche repas : bouton ✕ par aliment, lignes à 0 g retirées à l’enregistrement, plus rien = repas supprimé ; prorata des grammes basé sur la valeur d’origine de chaque ligne.

## 26/11 — Dispo confirmée par Kouider → Dzaryx s'en sert
Kouider : « si moi je lui dis cette voiture est dispo, Dzaryx le sait et répond avec ça ; si je confirme que j'ai des voitures, il demande au client ses préférences ». no-dispo.ts : kv dispo:confirmed (ses mots exacts, 72 h, par client ou général) ; noDispoRule(chat) ajoute l'exception aux prompts WA + TikTok, filtre levé si confirmé. Réponse à un brouillon « (oui) la Clio est dispo » / « j'ai des voitures » / « c'est complet » → retenu + réponse réécrite (draftFromConfirmation, Sonnet, exemples darija d'Oran) — avant, « oui la clio est dispo » aurait envoyé l'ancienne réponse. Outil dispo_confirmee (set/list/clear) toujours disponible.

## 26/11 — Jamais de dispo annoncée à un client
Kouider (capture WA : « Chendkom les voitures disponibles ?? » → réponse « nos véhicules… ») : « faut jamais qu'il dise qu'il a un véhicule de dispo, moi-même je dois demander à chaque fois à Houari ; à partir du 15 décembre on est presque au complet ». Nouveau integrations/no-dispo.ts : NO_DISPO_RULE dans les prompts WA + TikTok (plus de check_car_availability pour répondre au client), claimsAvailability() filtre la réponse proposée → checkingText() « on vérifie la dispo pour vos dates et on revient vers vous » dans la langue du client (+ « période très demandée » si décembre/janvier). Relance panier : plus de « toujours disponible / la X est libre ». Accès prioritaire : plus de « il reste N voitures ». Houari jamais nommé au client.

## 26/11 — Relances : jamais un message de plus d'une semaine
Kouider : « si c'est un message de plus de 1 semaine on relance pas ». relance-clients : MAX_AGE 7 j pour le réveil TikTok (ttWinback, avant 200 j → Minou du 23/10 proposé) et ttSilent (avant 14 j ; client sans réponse > 7 j sauté). WhatsApp (1-7 j) et paniers (4 j) l'étaient déjà. Titre « 4 clients » au lieu de 5 corrigé (present() vidait le même tableau). File du 26/11 (5 anciens TikTok) vidée.

## 26/11 — Démarchage relancé jusqu'à 3 fois après une mise en ligne
2 mises en ligne de suite (10h03, 10h27) : la relance (slot:retry) a été coupée à son tour et n'était plus relancée → 0 démarchage le 26/11. resumeInterrupted : jusqu'à :retry3 dans les 3 h. Aussi : échéance VPS Hostinger fixée au 25 de chaque mois (coupé 11 h le 25/11 faute de paiement, aucune alerte car pas de date).

## 26/11 — Une pub TikTok fabriquée chaque jour, toute seule
Kouider : « qu'il crée autant de vidéos que possible pour que je sois régulier ». jobDailyPlan (10h15) : chaque jour, pub_tiktok free_only (vraies vidéos/photos, 0 €, jamais de vidéo IA qui déforme), idée du calendrier de l'équipe sinon pub libre → boutons publier maintenant / meilleur moment / non. Saute si pub créée ou publiée aujourd'hui ; si 2 pubs prêtes depuis 48 h non publiées → simple rappel, pas d'empilement.

## 26/11 — Pubs en plans photo de nouveau autorisées (malentendu du matin corrigé)
Kouider : « pas assez pro » = la pub d'hier où les voitures se déformaient et les plaques changeaient (vidéo IA), PAS les plans photo. Le blocage d'eff66bb8 (« pas de pub sans vidéo filmée quand le crédit IA est vide ») est retiré de pub_tiktok (+ force_photo, + description d'outil). Sans crédit : vraies vidéos filmées sinon VRAIE photo (photoClip). Gardé : bestModel vérifie fal ; vidéos auto du studio toujours sautées sans crédit.

## 26/11 — Dzaryx voit ses propres notifications + plus de pub en photos par erreur
- tg-outbox.recentNotifNote : message court de Kouider sur Telegram → les notifications automatiques des 45 dernières minutes (tg:sentlog) sont mises en contexte (« la », « ça », « vas-y » = cette notification). Cause du « partage-la » → bilan calories.
- video-studio.bestModel : un drapeau « fal vide » expiré ne veut plus dire « crédit rechargé » : on vérifie toujours chez fal. Sinon Kling échouait → pub montée en photos animées malgré la règle du 26/11 (pub 9f7a0969, 0/4 scènes réelles).

## 26/11 — « Partage-la au meilleur moment » après une pub → programmée sur TikTok
Il a répondu en texte (pas les boutons) 5 min après la pub ; le cerveau a cru que « la » = le bilan calories. tiktok-pub.handlePubPublishReply (pré-route call.ts) : verbe publier/partager/poster + pub/vidéo/« la », pub prête < 24 h non publiée → créneau prime (pub:tiktok:slots) ou maintenant. WhatsApp/photo/bilan/lien exclus. Fix aussi cloudpc : plus de fausse alerte « TikTok déconnecté ».

## 26/11 — « De la part de X » → X devient prioritaire tout seul
Le remerciement promet la priorité si un ami « donne simplement votre nom », mais rien ne le repérait (il fallait créer un code + ＋ à la main). priority-referral.detectReferral, appelé par recordDemande (WhatsApp + TikTok) : mot de recommandation (FR + darija/arabe) + nom complet d'un ancien client (ou prénom unique) → +1 dans PARRAINAGE (fiche créée si besoin) + message Telegram ; 1 fois par discussion. Aussi : plus de message « 0 client prioritaire » ni d'alerte d'annulation quand il n'y a aucun prioritaire.

## 26/11 — Réponses clients : siège bébé offert, pas de carte SIM
client-responder.ts disait « pas de siège bébé » alors qu'il est GRATUIT. Maintenant : famille avec bébé → siège bébé offert ; jamais de carte SIM proposée (le client l'active lui-même sur place).

## 26/11 — Parrainage = priorité en haute saison (plus de remise)
Kouider choisit l'option 1. integrations/priority-referral.ts : client avec code parrain compté (referrals.uses ≥ 1) = prioritaire. Job priority-early-access 9h30 : 6 semaines avant chaque vague (WAVES), messages prêts (1 appui) pour les prioritaires s'il reste des voitures ; si tout est pris → pas de message, Kouider prévenu. Réservation annulée/refusée sur une vague → voiture proposée d'abord aux prioritaires. WhatsApp : « ⭐ Client prioritaire » + règle du brouillon (jamais retirer la voiture d'un client déjà réservé ; autres dates/voiture + premier prévenu). Remerciement après location (fr/ar/en) explique l'avantage. App : campagne diaspora et PARRAINAGE sans −5 %/−10 %.

## 26/11 — Traduction française sous les messages TikTok (et réponses non françaises)
Kouider : message TikTok en arabe sans traduction. client-lang frTranslations/frLines : « 🇫🇷 Traduction » du message client + « 🇫🇷 En français » de la réponse proposée si elle n'est pas en français (TikTok nouveau message, file de propositions, réécriture ; WhatsApp réponse proposée + nouvelle version). Rien ajouté si tout est en français.

## 26/11 — Post Google Maps FIK chaque lundi + client rassuré quand son vol est en retard
- marketing/fik-google-post.ts + job fik-google-post (lundi 10h Alger) : texte « mise à jour » de la fiche Google FIK (voiture de la semaine qui tourne, moment de l'année, conditions exactes, mots « location voiture Oran / aéroport Oran ») + vraie photo de la voiture sur Telegram. Historique kv gbp:fik:history.
- flight-live : vol d'un client vers Oran retardé ≥ 30 min (2 lectures concordantes) → message WhatsApp « votre voiture vous attend » (fr/ar/en selon client_lang) mis en attente du « oui » (ou lien wa.me si un autre brouillon attend). Une fois par palier de 30 min.
- Parrainage : Kouider refuse toute remise pour l'instant (marges) — rien fait. Avis Google après location existait déjà (client-care, 05/11).

## 26/11 — « Écris-la en darija » géré par le code
07:20 Kouider : « Change écris le en darija » → le cerveau libre a écrit « Ch-hal fi omrak t-3ich ? » (sens faux). handleWaYesNo / handleTtYesNo : askedLang() (darija / arabe / français / anglais / comme lui) → rewriteInLang forcé avec le guide darija d'Oran ; si la version en attente est déjà dans cette langue (ratée), on repart de la réponse d'origine.

## 26/11 — Langue du client partout (gardien de nuit, relances, 1er message, refus âge)
client-lang appliqué aussi à : night-guard (réponse envoyée seule la nuit : langRule + réécriture, messages sûrs en darija latine), relance-clients (relances du matin), 1er message automatique aux nouveaux numéros et refus < 35 ans (version darija latine). « غادي » (marocain) remplacé par « راح » dans les messages sûrs. Testé : « salam, chhal la Clio l nhar ? » → réponse de nuit en darija latine.

## 26/11 — Réponses clients dans la langue du client
Kouider : un client WA écrit « 18 hata 22 décembre » (darija en lettres latines), la réponse proposée était en français. Nouveau integrations/client-lang.ts : detectClientLang (darija_latin / darija_ar / arabe / fr / en), langRule ajoutée aux brouillons WhatsApp et TikTok, replyMatches → rewriteInLang si la langue ne colle pas (guide darija d'Oran + exemples, rejet des mots marocains), phrase dates+âge dans la langue du client. Testé : 11 phrases détectées correctement, réécriture « Saha, c'est noté men 18 hata 22 décembre… ».

## 26/11 — Plafond vidéo IA 15 $/mois
Accord de Kouider : dépenses fal.ai comptées par mois (kv studio:spent_month:AAAA-MM, plafond kv studio:month_cap_usd = 15 par défaut). Plafond atteint → bestModel() = gratuit (donc pas de pub sans vraies vidéos) + message Telegram une seule fois. Contrôle du 26/11 : rappel VPS 13h du 25/11 bien envoyé (KO du replay = faux positif) ; auto-test = seulement Google plein (connu, action de Kouider).

## 26/11 — Pubs : plus jamais de pub « photo qui bouge »
Kouider n'a pas partagé « Le Convoi Illimité » (25/11) : faite sans crédit fal = photos animées, pas pro. Désormais, sans crédit vidéo IA, si une voiture de la pub n'a pas de vraie vidéo filmée, video_studio pub_tiktok ne fabrique rien et répond quoi filmer (liste des plans). « même en photo » / force_photo:true = forcer. Les vidéos auto (mer/ven) sont sautées sans crédit IA.

## 26/11 — Croissance TikTok : stats réparées + réveil des anciens clients TikTok. (1) Premier vrai envoi TikTok vérifié (Zaki, 04:44). (2) Carte de contact TikTok : acceptée automatiquement à sa prochaine apparition (accord de Kouider), capture dans cloudpc-data. (3) Stats équipe TikTok fausses (« -1111 abonnés », « 0 vue ») : la dernière case de follower_num_history arrive en {status:2} sans valeur → series() ignore les cases vides ; vv_history n'existe plus → vues 7 j lues dans le texte « Vues de la vidéo » de TikTok Studio (parseCount) ; la page analytics est attendue jusqu'à « Sources de trafic » (recherches/sources étaient vides). (4) Réveil des anciens clients TikTok (relance-clients.ts ttWinback) : 24 clients ont écrit de juillet à octobre sans réponse ; quand une vague de voyages (WAVES, exporté d'insights.ts) arrive dans 7-60 j, 5 par matin dans les relances : discussion lue, message de reprise (excuses si jamais répondu, vague, dates + âge, un avantage vrai, aucun modèle de voiture cité), envoyé seulement après « oui ». Une fois par client et par vague (relance:done:ttwb:<vague>:<pseudo>). read_chat fait défiler la liste (TikTok web n'en montre que ~28).

## 26/11 — Relances TikTok + Dzaryx de secours (app v305). (1) Relances du matin : ttSilent (relance-clients.ts) = messages privés TikTok sans réponse > 24 h (réponse proposée avec toute la discussion) ou FIK a répondu en dernier il y a 1-7 j (judgeRelance) ; « oui » = envoyé sur TikTok, puis relance suivante (tt:pending relance:true). Dates des messages lues dans les séparateurs TikTok (read_chat when, ttMsgDate). (2) Bot de secours : message écrit au bot des notifs FIK (site /api/telegram-notif) → POST /api/jarvis/backup-chat (jeton interne, 202) → integrations/backup-bot.ts : même cerveau (/api/call/turn) → réponse par /api/dzaryx-buttons sans bouton. Marche VPS coupé. L'alerte « Telegram coupé » le dit. (3) Réponse aux commentaires TikTok PAS faite : la page vidéo affiche un puzzle anti-robot (jamais contourné) et TikTok Studio n'a aucun commentaire sur 30 j pour tester.

## 26/11 — 2 bugs des journaux : (1) cerveaux de secours NVIDIA/OpenRouter refusaient toute la requête (« unexpected end of hex escape ») quand un pseudo en lettres stylées (« 𝒁𝒂𝒌𝒊 ») était coupé par un .slice() → anthropic-compat wellFormedJson retire les moitiés d'emoji. (2) Agenda de Houari non partagé → 404 à chaque ouverture de l'Agenda : listHouariEvents ne réessaie qu'1×/12 h.

## 26/11 — TikTok : répondre aux messages privés comme WhatsApp (app v304). Bug : « montre les messages tiktok » sur Telegram montrait le brouillon WhatsApp (SHOW_RE) puis lançait un browser_task lent. Maintenant : handleTtYesNo passe avant WhatsApp → liste des messages privés TikTok en attente (tt:demandes « nouveau », 14 j), discussion lue sur le PC cloud (tiktok_web read_chat), réponse proposée UNE PAR UNE ; « oui » = envoyée sur TikTok (tiktok_web reply : Draft editor + Entrée, vérifie que le message apparaît), « non » = suivante, « change … » = réécrite. Nouveau message privé → même proposition directe sur Telegram (kv tt:pending ; un seul oui en attente à la fois avec wa:pending). Commentaires : réponse à copier seulement. Fenêtre TikTok « Utiliser la carte de contact » fermée (« Plus tard ») : elle bloquait le clavier. App DEMANDES : bouton ✍️ Répondre sur les fiches TikTok (POST /api/demandes/tt-draft, /tt-reply). Testé à blanc (écrit puis effacé) ; vrai envoi pas encore testé.

## 25/11 23h — PUBS = VRAIES VIDÉOS des voitures (Kouider : « qualité nulle, voitures déformées, pneu à l'envers, plaque qui change → ultra réaliste »). Test Wan 2.2 sur GPU Kaggle gratuit = défauts IA → abandonné pour les voitures. Nouveau `marketing/car-rushes.ts` : vidéo envoyée sur Telegram avec « pub Clio 5 Alpine » (RUSH_CMD dans tgcall) → compressée, stockée (videos/rushes), vérifiée par vision (bonne voiture, utilisable, type de plan), rangée en kv `pub:rushes` ; nom ambigu (« pub Clio » avec 5 Clio) → demande laquelle. Pub TikTok : scène = vraie vidéo (passage le plus vivant, horizontale recadrée sur fond flou, convoi = coupes voiture par voiture) → sinon Kling si crédit fal → sinon plan showroom sur la VRAIE photo (plus jamais Wan/HF gratuit qui déforme). Réalisateur privilégie les voitures filmées ; après la pub, Telegram dit quelles voitures filmer + liste des plans. Outil video_studio action=rushes / rush_delete ; route POST /api/studio/rush.

## 25/11 22h30 — Revue 24-25/11 : le VPS s'est figé de 02h10 à 12h56 (heure de Paris ; aucune trace d'arrêt, ni mémoire ni charge anormale → côté hébergeur ; redémarré sur noyau 6.8.0-149). Railway voyait « coupé : cloudpc, telegram » toutes les 15 min mais les alertes partaient par Telegram… qui passe par le VPS. connections-watch tell() : si le battement tgcall a > 12 min, l'alerte part AUSSI par le bot des notifs FIK (createDecision → fikconciergerie.com, indépendant du VPS). Constats sans code : crédit fal.ai épuisé (pub « Le Convoi Illimité » de 9h30 faite sans décor/voiture IA), crédit Claude épuisé (tout passe par les cerveaux gratuits), aucune publication TikTok tentée.

## 25/11 22h15 — LIBERTÉ « moins d'un mois » : plan_rapide = 8 j par marche (zéro 22/12) + alt 10 j (zéro 28/12) ; matin 9h : 2 boutons de validation (version 8 j / 10 j), plan_rapide_valide alt:true.

## 25/11 22h — LIBERTÉ : plan rapide préparé (zéro 28/12) en attente du médecin → chaque matin de semaine 9h (≤ 7 j) : phrase à dire au médecin + boutons « il valide » (plan_rapide_valide) / « autres dates » / « pas encore joint ». Plan actuel inchangé tant qu'il n'a pas validé CE plan.

## 25/11 21h30 — LIBERTÉ « au plus vite » : la date du zéro ne recule plus toute seule (dépassement → plus de +2 j ; manque fort 2 j → choix tenir / +3 j / médecin) ; action `plan_rapide` (mêmes marches que le médecin, 10 j chacune → proposition sur Telegram, rien appliqué), `plan_rapide_valide` (confirm, seulement si le médecin a validé) ; `plus_vite` prépare aussi le plan rapide ; message du matin : 🏁 zéro le … (J-n).

## 25/11 21h — LIBERTÉ moments + plus vite (app v303) : MOMENTS (réveil/matin/midi/aprèm/soir/nuit), momentStats sur journées COMPLÈTES à heures sûres seulement (moment dit, ou prise notée ≤ 40 min après une heure de rappel ; un bloc « 4 à 10h54 » n'est pas deviné) ; action `journee` (journée par moment), `moments`, prise.moment ; action `plus_vite` = note + rapport médecin avec sa question + rappel d'appel en semaine 9h (Dzaryx n'accélère jamais seul) ; rapport médecin avec moments ; app : TakeSheet « ⏰ Par moment », carte Pourquoi → Tes moments (barre vs plan).

## 25/11 20h30 — LIBERTÉ : action `adoucir` (grosse baisse découpée en marches de 1 demi tous les 3 j, jamais plus haut, zéro recule) ; 2 j avant une baisse ≥ 2 demis, 19h : choix à boutons (garder / marches de 1 / en parler) ; hier non noté → 9h30 « combien en vrai ? » à boutons ; total 0 = jour noté (note) ; bilan du dimanche : « pas noté ❔ » au lieu de « 0 ✅ ».

## 25/11 20h — LIBERTÉ au max (app v302) : heures à risque incluent les prises EN TROP (extraHours) ; cause `rebond` ; question du soir avec SA piste (suspectOf : veille basse, nuit courte, manque, moral) ; cause par bouton → plan si-alors proposé (IF_THEN, « je garde » / « j'écris le mien ») ; 21h15 jour bas → alerte rebond pour demain ; bilan du dimanche + rapport médecin avec le pourquoi (whyFacts) ; overview.insight → app LIBERTÉ carte « 🔎 Pourquoi tu prends plus » (14 j colorés, rebond, pistes, causes, « pourquoi ? » par jour inconnu + CauseSheet).

## 25/11 19h — LIBERTÉ : le POURQUOI. dayFactors/whyText : jours où il prend plus (> plan ou +3 sur la veille) comparés aux autres (veille basse, nuit < 6 h de la montre, travail/congé, manque, moral, causes données). Action `cause` (+ causeKey), `analyse` = rythme + pourquoi. 21h30 un jour au-dessus (ou 9h le lendemain) : « c'était plutôt… » avec 4 boutons. Règle cerveau : enquête une question à la fois, puis plan si-alors.

## 25/11 18h — LIBERTÉ : rythme des prises (libPattern/patternText). Outil liberte action `analyse` : jours de la semaine au-dessus/en dessous du plan, effet yo-yo (jour bas ≤ autorisé−2 → lendemain), écart moyen jour à jour, moyenne 7 j vs plan, heures, jours non notés. Résumé court dans le dossier. Jour à surveiller (hier très bas, ou son jour le plus chargé) : ligne dans le message du matin + passage 14h avec boutons (job liberte). Données seulement dans app_kv.

## 25/11 12h55 — FORME carte Séance : « Protéines 0 / 154 g » toujours à 0 — formeOverview ne renvoyait jamais `eaten` (lu par Dashboard.tsx). Ajouté : total du jour depuis le compteur Repas (mealsOf), même source que FORME → Repas.

## 24/11 23h55 — TikTok : meilleurs moments PAR JOUR (app v301). Historique de l'activité des abonnés heure par heure par date (kv tt:activity, 120 j, heure d'Oran) → profil par jour de la semaine (score soirée + bonus jours où nos vidéos ont marché) → créneaux par jour (bestPostSlots) + weekPlan : 7 prochains jours ⭐/⭐⭐/⭐⭐⭐, heure, 2e heure, idée de l'équipe sur les 5 meilleurs jours. Sources de trafic lues (Recherche 75,9 % → SEO prioritaire, dans l'analyse + brief). Réunion du dimanche = calendrier de la semaine ; app MONTAGE › 📈 TikTok « 🗓️ Ta semaine » (bouton 🎬 par jour) ; job tt-daily-plan 10h15 = vidéo du jour proposée (bouton), sauf si une pub est déjà créée/publiée ; outil equipe_tiktok action semaine.

## 24/11 23h30 — TikTok + DEMANDES (app v300) : statut « sans suite » (fermé, jamais relancé) ; 142 conversations TikTok lues (défilement), les 45 sans réponse > 14 j rangées « sans suite » avec leur vraie date (aucune relance, demande de Kouider) ; archiveStale : WhatsApp/TikTok sans nouvelles 30 j → « sans suite » (à chaque ouverture de DEMANDES). Page MONTAGE onglet 📈 TikTok (TiktokTeam.tsx, GET /api/studio/tiktok) : abonnés, vues 7 j, heure à poster, graphe des heures d'activité, idées de l'équipe avec « Créer cette vidéo » (POST /api/studio/pub-tiktok), meilleures vidéos, ce qui marche / à arrêter, banque de hooks (copier), mots-clés, vraies questions clients → vidéo-réponse, créateurs à contacter, « Réunion maintenant » (POST /api/studio/tiktok-meeting). Suivi de pub : le lendemain d'une pub publiée, ses vues vs la médiane de nos vidéos (job tt-growth-refresh, kv tt:followup:done).

## 24/11 23h10 — FORME Repas (app v299) : « encore 2 chiffres différents » — le soir la carte déficit montrait 577 / 495 / 496 à la fois. Maintenant : haut « Objectif : déficit d'au moins 496 · ce soir : 577 », carte « 577 − 496 = tu peux encore manger 81 kcal (le même chiffre que « kcal restantes » en haut) » ; ligne « pour l'instant 2464 − 1969 = 495 » retirée.

## 24/11 23h — Réponses proposées aux clients : conditions EXACTES dans le prompt (night-guard exactConditions) pour WhatsApp (REPLY_SYSTEM) et TikTok (nouveau : ttDraft, « ✍️ Réponse à copier-coller dans TikTok » dans le Telegram de chaque DM/commentaire). Test avant fix : « la caution est obligatoire » (FAUX, aucune caution) + dispo promise. Site (2e4c19b) : réservation « Téléphone WhatsApp », exemple « +33 6… ou +213 6… » au lieu de « +213 6XX » (un client croyait qu'il fallait un numéro algérien) + rappel de l'indicatif si le numéro commence par 0 ; commande-vehicule idem.

## 24/11 22h45 — 2 bugs : (1) « 1 » à la réunion TikTok envoyé pendant un redéploiement Railway : l'ancien serveur a marqué le choix fait puis est mort avant de lancer la pub ; la reprise (même turnId) a envoyé « 1 » au cerveau qui a inventé « C'est envoyé au client +33 7 49… » (rien n'est parti, vérifié dans WhatsApp). Fix : décisions startedAt/finished, un chiffre seul après un choix < 15 min n'arrive JAMAIS au cerveau (« déjà fait » / « en cours » / relance si coupé) ; garde-fou call.ts : réponse qui dit « envoyé » à un client sans vrai envoi WhatsApp pendant le tour (noteWaSent) → correction ajoutée. Décision réunion remise en attente. (2) FORME Repas (app v298) : carte déficit le soir = chiffres de la JOURNÉE (brûlé journée − mangé = déficit du jour, même chiffre que le ✅) ; le direct passe en petit.

## 24/11 — Équipe TikTok + savoir de Dzaryx : fikKnowledge() (conditions exactes publicInfo, flotte dispo, réservations 6 mois, saisons 150 j, vraies questions clients WhatsApp 30 j + TikTok, sans numéros) → stocké dans tt:growth.fik, donné à l'analyse (ne promettre que le vrai ; question fréquente = vidéo-réponse). Nouvelles sorties : selling_points (arguments vrais) + client_questions, injectés dans le brief de chaque pub.

## 24/11 — ÉQUIPE TIKTOK (marketing/tiktok-growth.ts) : stats RÉELLES lues dans TikTok Studio par le PC cloud (tiktok_web.insights : réponses /aweme/v2/data/insight/ des pages analytics → heures d'activité des followers, pays/villes/âges/sexe, vues/likes/saves/partages des vidéos, recherches tapées) + inspiration = API Inspiration « trending/video/v2 » Véhicules France + monde (pas de recherche TikTok : puzzle anti-robot). Analyse par l'équipe (CMO, CBO, Head of Social, Creative/Art Director, Copywriter, SEO, Community, Influencer, Data Analyst…) → kv tt:growth : ce qui marche chez nous, à éviter, banque de hooks, formats (mécaniques, jamais copie), 5 idées, mots-clés SEO, créateurs à contacter. Branché dans teamBrief (brief de chaque pub) + comité élargi (note seo) + bestPostSlots = heures réelles (pic 21h → 20h30). Jobs : tt-growth-refresh 4h30, tt-weekly-meeting dimanche 17h30 (Telegram + bouton « crée la vidéo n°1 »). Outil equipe_tiktok (reunion/stats/idees/actualiser).

## 24/11 — Pub vidéo : choix « valider et publier sur TikTok » (app v297). À la livraison d'une pub (renderPub) → boutons Telegram (createDecision) : ✅ publier maintenant · ⏰ publier au meilleur créneau · ❌ ne pas publier (remplace le schedule_reminder : rappel au créneau via kv pub:tiktok:slots + job pub-tiktok-slots */10 s'il ne choisit rien). video_studio action=publish_tiktok (job_id, at, decline) ; page MONTAGE : bouton « Valider et publier sur TikTok » (POST /api/studio/publish-tiktok, résultat sur Telegram). PC cloud : tiktok_web.publish (onglet neuf TikTok Studio, import, légende DraftJS, Publier, confirmations ; captcha/déconnexion → erreur + capture). Essai à blanc OK (vidéo importée, légende écrite, brouillon supprimé) ; vraie publication pas encore faite. Verrou anti double clic.

## 24/11 — DEMANDES (app v296) : statut tout seul — réponse WhatsApp envoyée par Dzaryx (oui, 1er message, autonomie, send, sendWaDirect) → « contacté » ; create_booking avec ce téléphone → « conclu » (markDemande, même numéro = 9 derniers chiffres). list_leads (Dzaryx Telegram/voix) inclut WhatsApp + TikTok. Commentaires TikTok : vraie structure (inbox-list-item / inbox-title / inbox-content « a commenté : … · 9-26 »), > 45 j ignorés, > 2 j sans Telegram ; fiche mal lue « clyn91 a commenté : Salem » supprimée. « Ouvrir TikTok » ouvre la vidéo commentée. Titres de fiches communs (demandeTitle).

## 24/11 — Fix demandes WhatsApp/TikTok : écritures en file (serial) — 5 messages TikTok arrivés en même temps n'en gardaient qu'1 (lecture-écriture kv concurrente). 4 manquants rajoutés.

## 24/11 — TikTok → DEMANDES (app v295) : compte fik_conciergerie connecté dans le Chrome du PC cloud (QR + code e-mail lu sur la Gmail FIK). cloudpc/tiktok_web.py (LECTURE SEULE, ~8 min) : messages privés non lus (Suite entreprise, sans ouvrir les discussions) + Activité → Commentaires → cloud:tt_new → integrations/tiktok-web.ts → fiche 🎵 TikTok (kv tt:demandes via wa-demandes.ts recordDemande) + Telegram. Reprise : messages non lus des 45 derniers jours (sans Telegram). Puzzle anti-robot / déconnexion → cloud:tt_state → alerte Telegram 1×/6 h (jamais contourné). App : filtre 🎵 TikTok, « Ouvrir TikTok », Conclu / Perdu.

## 24/11 — DEMANDES (app v294) : les demandes WhatsApp arrivent aussi dans DEMANDES (avant : site seulement). whatsapp-web onWaNew → wa-demandes.ts (kv wa:demandes, 1 fiche par discussion ouverte, mise à jour à chaque message) si location/prix/dispo/âge/appel manqué (pas plainte, urgence, prospects FIK Sites) ; âge < 35 = « Refusé (âge) ». /api/demandes source 'whatsapp' (update/delete) ; app : filtre 💬 WhatsApp, texte du client, boutons WhatsApp / Conclu / Perdu. 3 demandes des 7 derniers jours reprises du journal wa:convlog.

## 24/11 — PARC (app v293) : « ＋ Ajouter » + « Modifier » = une seule fiche (nom, catégorie, carburant, boîte, places, prix Houari/client en €, description + « ✨ Écrire pour moi »), photos juste après l'ajout. Toute voiture créée (app, add_car, partenaires) = currency EUR + description auto si vide (car-describe.ts, sans IA). Site : admin voitures devise par défaut Euro (Clio campus s'affichait « 25 DA » → corrigée en EUR). Descriptions écrites pour les 13 voitures qui n'en avaient pas.

## 24/11 — Humeur : plus de « tu as l'air sous pression » à cause de plusieurs messages — mood-guard : on n'en parle QUE si la montre le confirme (watchSignal 'tendu' = au moins 2 signes sur 3 : VFC < 85 % de sa moyenne, pouls repos > +4, nuit < 5 h 30) ; sans données = silence (avant : pas de données = question). conscience (décision « je prends le relais ») + brain-plus (3 jours) : idem, et l'IA ignore le nombre / la rapidité des messages (« il travaille vite, pas du stress »). mood-detector : indice de style seulement, jamais dit à Kouider.

## 24/11 — Jours maison : aussi séance REPOUSSÉE (move_day), annulée sans raison (« repos demandé »), fatigué, « pas allé », ou salle ratée aujourd'hui sans rien dire (créneau passé, pas de GPS salle, rien noté) → séance maison du jour. Pas de séance seulement si malade / blessé / mode repos 🛌 / voyage.

## 24/11 — FORME : JOURS MAISON (app v292) — « quand je vais pas à la salle je les fais, comme aujourd'hui, dimanche et jeudi » : homeDayPlans (forme-home) = séance annulée pour un empêchement + jours choisis (kv kouider:forme:home_days, défaut dim + jeu) sans salle → séance du jour choisie pour ne pas refaire les muscles de la veille / du lendemain (+1 si même séance à ± 3 j), jamais de jambes. GET /api/sport renvoie homeDays ; l'app montre 🏠 dans la semaine, « Aujourd'hui · jour maison » et la séance maison du jour (plus la version maison de demain). Photos : chaque exercice maison a sa photo haltères / poids du corps (plus de machines de salle).

## 24/11 — FORME repas : photo d'un POT = 1 portion, pas le pot entier — VISION_PROMPT : pot / emballage montré (pâte à tartiner, confiture, beurre, fromage…) = portion par tartine (≈ 15 g pâte à tartiner, 8 g beurre, 20 g fromage) + le pain de la tartine ; pot entier seulement s'il dit l'avoir fini (10h30 : pot Boni compté en entier, supprimé à la main ; petit-déj renoté 330 kcal).

## 24/11 10h15 — WhatsApp : « Le message n'apparaît pas comme envoyé » — Entrée n'envoyait plus (WhatsApp Web), le texte restait dans la zone de saisie et s'empilait (5 brouillons collés, vidé à la main). send() : zone vidée avant, clic souris sur le bouton « Envoyer », vérif (dernière bulle = moi + même début + zone vide) jusqu'à 8 s, zone revidée si échec.

## 24/11 10h — WhatsApp : « Discussion +33749766304 introuvable » + fausse alerte « WhatsApp Business déconnecté » — cloudpc/whatsapp_web.py : un numéro ouvrait send?phone= (rechargement complet > 30 s avec 52 non lus) → échec ; pendant ce rechargement connections-watch voyait la page vide = « déconnecté », puis l'auto-réparation (link_code) re-naviguait. Maintenant : numéro → discussion trouvée dans la liste (chiffres du titre) ou la recherche, sans recharger ; send?phone= en dernier (75 s) ; status attend l'action en cours + 30 s si écran de chargement ; link_code passe par status. pm2 dzaryx-cloudpc redémarré.

## 24/11 — WhatsApp : « Envoie le message » mangé par la question du brief — 09h48 réponse proposée (client Clio 4), 09h50 « Tu es seul ? … écris-le », 09h51 « Envoie le message » → WRITE (envoie-le) = brief écrit + clearWaPending → rien envoyé au client. handlePresenceReply : question brief + réponse WhatsApp en attente + message qui parle de message/WhatsApp/client/réponse (sans « brief »/« écris ») → laissé à handleWaYesNo (hasWaPending).

## 24/11 — FORME : bouton 🏋️ Salle / 🏠 Maison dans Entraînement (app v291) — « tout doit être comme à la salle, exactement pareil, sauf une version maison » : GET /api/sport/home traduit CHAQUE exercice de la séance de salle 1 pour 1 (même ordre, muscle, séries ; bras + dos compris) avec 2 haltères 7 kg + planche à pompes (forme-home homeOf, ids home_* → progression maison séparée des charges salle), échauffement maison, abdos ajoutés si absents ; même lecteur (séries, kg, chrono, bilan). Séance maison faite un jour annulé = jour « fait ». Le message Telegram « séance maison » utilise la même traduction. 3 photos bras du 23/11 rangées dans FORME.

## 24/11 — FORME : séance maison quand il ne va pas à la salle — « je vais pas aller demain à la salle, j'ai des trucs à régler » / « je peux pas aller à la salle » → parseSportCancel (raison « empêché ») annule ET envoie la même séance version maison (forme-home.ts) : 2 haltères 7 kg + planche à pompes (kv kouider:forme:home_gear), bas/milieu/haut des pecs + abdos, pas de jambes, élévations latérales en bouteilles d'eau (≤ 5 kg), bras droit d'abord. forme actions home_session / home_gear ; kcal MET 4 ; montre « Renforcement musculaire ».

## 23/11 soir — Secours plus rapide quand Gemini sature + Liberté « j'arrête quand ? » — agentic-fallback : un 503 « high demand » saute toutes les clés de ce modèle (+5 min) ; 2 modèles Gemini en 503 → tout Gemini sauté ce tour, direct NVIDIA/Mistral… (avant 1-3 min à essayer 5 clés × 4 modèles). liberteStruggleHint : question médicament + quand/arrêter/baisse → plan réel (palier, prochaine baisse, jour zéro, plan du médecin) au lieu d'un avertissement général (19h06 : autre médicament cité, aucune date).

## 23/11 — Telegram : plus de réponse perdue ni vide — 17h50 Gemini saturé (503) → réponse prête en 3 min 28, tgcall lâchait à 3 min (« ⏳ renvoie ») et ne l'envoyait jamais : maintenant « je réfléchis encore » puis tgcall récupère la réponse via POST /api/call/turn-result (turn:done:<turnId>, jusqu'à +6 min). 18h28 : filtres → réponse vide « … » : le secours agentique ne renvoie plus jamais de texte vide. + Raccourci « Dzaryx santé » et widget Scriptable repassés sur la clé service:raccourcis-iphone (santé muette 16→23/11).

## 23/11 — FORME : SES produits dans « Protéines en 1 geste » — whey ESN Flexpresso caramel (30 g = 108 kcal / 22 g P) remplace « Shake whey », créatine Myprotein = bouton « pris aujourd'hui » (/food/supp). kv kouider:forme:products, forme action my_product (changement de marque) + supp_taken (app v290).

## 23/11 — Rappel balance du lundi : jobSportWatch → mondayScaleReminder (lundi + GPS Telegram à la salle + pas de compo ce jour → 1 message Telegram, pas d'appel).

## 23/11 — FORME : composition corporelle (balance impédance de la salle) — capture Telegram → forme log kind compo (gras/muscle/eau, jour.compo), compoTrend (masse maigre kg, écart ≥ 6 j, verdict) dans cutStatus + formeSnapshot, carte « Balance de la salle » dans Sèche (app v289). 1re mesure 23/11 enregistrée.

## 23/11 — FORME : « Pull-over poulie haute » affichait la photo du face pull (rattaché à l'id face_pull) → exercise-lib reconnaît pull-over poulie/corde/haltère (Straight-Arm_Pulldown…), pull-over ≠ face pull dans sameMove. Charges gardées.

## 22/11/2026 nuit — Veille hebdo : résumé d'appel honnête (« À vérifier ») + secrets masqués
- Constat : la voix temps réel dit « c'est noté / c'est ajouté à l'agenda » parfois sans lancer d'outil, et le résumé de fin d'appel (mémoire 30 j + message Telegram) le recopiait comme fait (ex. 13/11 « Dzaryx a confirmé l'ajout à l'agenda… »).
- tgcall realtime.py : chaque outil lancé pendant l'appel (ask_dzaryx, outils rapides, outils locaux) va dans la transcription (role 'tool', nom + demande + résultat) ; la reprise après micro-coupure l'affiche « (outil) … ».
- call-memory.ts : lignes [OUTIL] = seules actions vraiment faites ; champ `unverified` (idée Hermes Agent v0.23 : lignes UNVERIFIED dans les résumés) + filet du code `claimsWithoutTool` ; une action dite faite sans outil passe dans « À faire ». Telegram : bloc « ⚠️ À vérifier (dit au téléphone, mais aucun outil ne l'a fait) ». Les cerveaux voient « NON VÉRIFIÉ » dans DERNIERS APPELS et ne le redisent pas comme fait.
- utils/redact-secrets.ts (idée OpenClaw 2026.10.33 : secrets masqués dans les résumés) : codes dictés, mots de passe, PIN/OTP, IBAN, cartes (Luhn), clés d'API masqués avant le résumé et la mémoire. Téléphones, montants, dates, vols intacts.
- Test bac à sable src/tests/_x.ts (13/14 masquages attendus, le 14e = faux numéro de carte valide Luhn, masqué à raison ; résumé réel : faux « ajouté à l'agenda » repéré, code d'alarme absent).

## 22/11 (nuit) — Fix heure de remise client lue dans les notes + voiture de Faycel
Kouider (capture Telegram 22:30) : « il dit la i10 alors que c'est la Clio essence ». Réservation Delli Faycel 23-26/11 passée de i10 → Clio 4 Essence (mêmes prix 16/25 €, Clio libre). Et le message annonçait 10h30 au lieu de 14:05 : `bookingTimes` prenait la DERNIÈRE heure après « arrivée », donc « arrivée 26/11 10:30 » (arrivée à Paris du vol retour, ligne « ✈️ Voyage du client »). La ligne brute du billet est maintenant ignorée ; « avant son vol du 26/11 à 08:00 » donne l'heure de retour. Le titre des check-lists client suit la voiture de la réservation.

## 22/11 (soir) — FORME : poids maximum par exercice (règle sport)
Kouider : « un exercice du vendredi où je soulève 8 kg, on m'a dit c'est trop, je veux le diminuer » = Élévations latérales (20/11 : 3×12 à 8 kg ; la progression allait proposer 9 kg + objectif de la semaine « 9 kg »). Une règle sport « <exercice> : maximum N kg » (kouider:sport:rules) plafonne maintenant `suggestFor` (app FORME, coach live gym-live, objectif de la semaine, up=false). Règle posée : « Élévations latérales : maximum 6 kg » ; objectif semaine 23/11 corrigé en « 6 kg, lentement et sans élan ». Outil sport_coach rule documenté pour les poids max.

## 22/11 (soir) — App v288 : GLOBE « 🧳 Vols suivis » = vols de Kouider ET des clients
Kouider : « il met que mes vols, faut les vols des clients aussi ». Le bouton « Mon vol » ne lisait que les billets enregistrés (trips:v1). Maintenant `upcomingFlights()` (flight-live.ts) ajoute les vols notés dans les réservations (notes « vol AH1061, arrivée 14:05 », « ✈️ Voyage du client : … (ORY) → … (ORN), départ …, arrivée … », « avant son vol du 26/11 à 08:00 ») : aller + retour, 14 jours devant, sans doublon avec les billets. Globe : liste de tous les vols (Toi / nom du client), toucher un vol = tracé + avion sur le globe (bleu clair = client, or = Kouider). Coordonnées fixes des aéroports courants (Orly ne se géocodait pas).

## 22/11 (nuit) — App v287 : page GLOBE au style « Aujourd'hui » (Kouider : « la page aujourd'hui est incroyable, fais la page globe du même style ») : en-tête date + heures Oran/Bruxelles + ce qui est en direct, recherche en verre avec bouton dégradé, raccourcis ronds à icônes au trait (Vols vers, Départs, Mon vol, Caméras, Monde, Catégories, Actu), couches en pilule (actif = dégradé bleu-violet), carte météo façon carte bancaire, fenêtres en verre Geist, intro orbe conique.

## 22/11 (nuit) — Marge FIK : nouvel outil check_margin (AVANT une remise / un jour offert : bénéfice total et /jour, perte vs prix du site, coût du jour offert payé au proprio, conseil « négocie 2-3 €/j » dès 10 jours), même bilan ajouté après create_booking (remplace l'ancien anti-regret à -15 %) et après update_booking (free_days, prix, dates). Constat : Djillali 40 €/j et Berlingo 50 €/j étaient déjà 5 € SOUS le prix du site (45/55). Site : Creta, Fiat 500 X, Renault Duster en avant (meilleure marge catalogue 21/16/14 €/j), Clio 5 Alpine retirée (6 €/j).

## 22/11 (soir) — FORME + messages du dimanche : programme (kv) bas des pecs (Dips buste penché, écarté poulie haute vers le bas), dos renforcé (tractions assistées HAUT A, pull-over poulie HAUT C), avant-bras/veines (curl inversé EZ, curl poignets HAUT B) + objectifs par zone ; analyse photo : règle bas/haut des pecs (elle conseillait « développé incliné / pompes déclinées » pour le bas), 3 analyses du 22/11 refaites. Messages : « ventes » nettoyé (###, tableaux, ---, ** → texte + puces) ; journal Mon esprit à la 2e personne ; semaine d'Ibrahim sans ligne Fennou à 0 (page retirée) ni invitation Fennou le jour off ; GPS de vie : CA du mois affiché « X € ce mois-ci (but … €/mois) » sans % de chances vers 2028, dates en JJ/MM/AAAA.

## 22/11 — Bilans FORME vérifiés et corrigés : (1) samedi 21/11 = « repos demandé » dans le planning sport mais restDays du profil (lun+jeu) → « pas de séance (jour d'entraînement) », entraînement 0, coach « sans négocier » : les bilans suivent maintenant le planning du coach sportif (sportDayKinds), restDays seulement à défaut ; (2) nutrition : < 1 200 kcal notées = déficit non mesurable (30/60 au lieu de 60) + ligne « repas sûrement pas tous notés » ; protéines affichées en g, « point fort » seulement si ≥ 80 % (fini « Nutrition 82 point fort » + « sous 80 % » dans le même bilan) ; (3) plus de « Leg Extensions/Leg Curl/Abductor → +kg » ni de jambes dans le graphique quand sa règle dit « plus de jambes » (Leg Curl était classé bras) ; (4) noms de séance réels (16/11 pecs, 17/11 jambes affichées « HAUT B ») ; (5) PDF : graduations rondes, « pas de donnée » + « x/7 jours mesurés », points vides sur la courbe des calories quand les repas ne sont pas tous notés, ⏳ ne sort plus « #ò » ; (6) « Montre : rien reçu depuis le 16/11 » en tête des points à améliorer quand le raccourci Dzaryx Santé ne tourne plus.

## 22/11 — FORME analyse photo plus honnête : photos du 26/10 prises de près / par en dessous / autre pièce vs 22/11 de plus loin → « réduction nette », summaries qui partaient des kg perdus, score 78 le 15/11 puis 70 le 22/11 vs la même photo. Prompt : champ comparable oui|moyen|non (distance, angle, lumière, pièce), « semble/léger » si moyen, rien déduit du poids, barème de score fixe, 1er conseil = comment refaire la photo. Code : comparable non → 50, moyen → score plafonné 35-65. Rejoué au banc sur ses 3 photos : profil/dos « non » (50), face « moyen » 62.

## 22/11 — Agenda sans doublon : le message renvoyé après le 1er essai raté (17:36, « 📅 À l'agenda FIK : « 🚗 i10 — Delli Faycel »… » 1 h) avait créé un 2e événement à 17:53. Avec un titre entre « », un événement du même 1er jour dont le titre contient ce titre est maintenant supprimé puis recréé proprement (« Remplacé dans l'agenda FIK… ») ; séries jamais touchées.

## 22/11 — Agenda + client accepté après refus : (1) « Ajoute à l'agenda FIK : « titre », du 23/11 à 14h05 au 26/11 à 6h00 (heure d'Oran), lieu … » → titre = toute la phrase, début perdu, 1 h. agendaAnything lit maintenant le titre entre « », la période du … au … (avec ou sans heures), le lieu et l'heure d'Oran ; le reste va dans la description. (2) Papiers validés (save_client) d'un client dont la demande du site est encore REFUSÉE / EN ATTENTE → ligne 📌 « dis « accepte X » » ; « accepte X » marche aussi sur une demande refusée à venir (confirmée + agenda + email).

## 22/11 — WhatsApp « save_contact » (1er vrai usage) : « Pays +33 pas sélectionné (affiché : BE +32) ». La recherche trouvait « France +33 » mais le clic souris envoyé d'un coup (survol+appui+relâche sans pause) ne la choisissait pas (Entrée / flèche non plus). Fix cloudpc/whatsapp_web.py : pauses 0,12 s entre les événements + 2e essai décalé. Testé en vrai : contact client enregistré et synchronisé sur le téléphone.

## 22/11 — Réservations site (suite) : refus → 2 WhatsApp au choix (🚗 autre véhicule / 📅 complet à ces dates) ; site : location minimum 4 jours (1-3 j : 0 abouties en 2026), « ⚠️ PEU RENTABLE » si bénéfice < 40 €, ✅ Accepter → WhatsApp de confirmation prêt (dates, total, prise, acompte 3 j), date de naissance pré-remplie au re-book ; Dzaryx : job client-ids-cleanup 04:20 (photos d'identité effacées 30 j après retour, 7 j après refus, orphelines 3 j). Site fe7047d.

## 22/11 — Réservations site : (1) refus (bouton Telegram du site ou « refuse X » à Dzaryx) → le bouton / lien WhatsApp ouvre le chat client avec un message poli « véhicule pas disponible » déjà écrit (FR/EN/AR selon la langue du formulaire) ; (2) formulaire de réservation : âge remplacé par la DATE DE NAISSANCE (âge calculé, 35 ans min.) + PHOTO du passeport / de la carte d'identité obligatoire → bucket Supabase PRIVÉ client-ids (/api/upload-id), envoyée à Kouider sur Telegram sous la demande (lien signé 1 h), ligne « 🎂 Né(e) le … · 🪪 pièce reçue » dans les notes. Site ceb27af.

## 22/11 — Revue appel + messages du 21-22/11 : (1) appel 10h46 : « Montesarchio » mal entendu → « je suis algérien, d'Oran, c'est Kouider qui m'a créé » sans question → DZ_IDENTITY_RULE : seulement sur question claire, jamais sur un bruit ; (2) prononciation « Kwi-dère » (pas « Kou-i-dère ») : règle dans les consignes d'appel + « Kouider »→« Kwider » dans cleanTextForTTS et les textes Siri/voiture (speakable) ; (3) appel : réponse d'abord (« qui aura le plus de temps libre ? » → esquive), plus de « comment puis-je t'aider aujourd'hui ? » ; (4) « du 31 mai 2025 à aujourd'hui combien de mois ? » → le cerveau disait « aujourd'hui (26 novembre) » : calcul par le code (fr-commands dateDiff, hors jours de location) ; (5) « mon rebeu » ajouté aux surnoms interdits (son message du 21/11 17h59 était arrivé avant le correctif).

## 22/11 — App page AUJOURD'HUI (v286) : (1) une voiture qui part/rentre aujourd'hui n'apparaît plus 2× (« En ce moment » + Départs/Retours) ; (2) case « À encaisser aujourd'hui » (déjà sur la carte bleue + liste) remplacée par « Arrivées (7 j) » ; (3) bandeau « réservations en attente » ouvre Demandes ; (4) /api/insights/today calcule la date en heure d'Oran (avant : UTC, la veille entre minuit et 1 h) ; (5) mise à jour auto au retour dans l'app (max 1×/2 min). Ajouts : carte « Relances du matin » (GET /api/insights/relances, bouton → POST /relances/next = relance suivante sur Telegram) et « Ton agenda du jour » (agenda FIK seulement).

## 22/11 — Grand Coach (correctif du 20/11 resté non commité) : « je comprends rien à ce texte, faut que ça soit plus simple, et surtout il se répète 2× ». Texte du matin 4-6 lignes courtes en mots simples, cleanCoachText() retire la consigne recopiée par le modèle + paragraphes en double + tirets longs ; COACH_SYS : « Fatima et Ibrahim » vivent avec lui (jamais « les rejoindre ») ; idée du livre tutoyée et simple.

## 22/11 — Veille actu : « ⚠️ Risque — brouillard Alger/Oran mercredi 18-19 nov » envoyé le 22/11. Cause : seul filtre = date > 8 jours, rien sur un événement déjà terminé, date manquante acceptée. Fix business-mentor.ts : date obligatoire, ≤ 3 jours, pastEvent() écarte une actu dont toutes les dates citées (« 18-19 nov », « 21 novembre ») sont passées ; consigne « événement déjà passé = interdit ».

## 21/11 — Analyse générale des échanges 20-21/11 : (1) agenda routine resté sur la config PAR DÉFAUT (départ 07:00, salle 07:20) créée pendant l'incident kv du matin alors que la vraie config (05:30/06:00) avait été restaurée → appel du samedi « pars à 07h00 » et dimanche fantôme ; agenda resynchronisé (séances 06:00). (2) Compteur calories : même phrase envoyée 2× à 20 s = 2 repas (kcal différentes selon l'IA) → doublon aussi détecté par phrase identique < 5 min ; doublon du 21/11 retiré.

## 21/11 — FORME / coach : (1) une pesée après 12h n'écrase plus celle du matin (FormeDay.weightAt/weightPm, outil forme log weight + force, sync santé jarvis-hub) ; (2) VÉRITÉS FIXES dans formeSnapshot (tous les cerveaux) : écart de poids matin/soir normal, pas de cm de tour de bras promis en sèche, curl barre = 2 portions (courte = pupitre), protéines = seul chiffre FORME, pas de séance inventée ; (3) analyse photo : protéines = formeTargets() au lieu d'un autre calcul.

## 21/11 — 🔮 Simulation de demain (20h, foresight) : « réveil 05:00, sport 06:00 à Wemmel » + fausse collision « trajet salle 07:00-07:30 » pour dimanche 22/11 alors que dimanche = pas d'entraînement (il travaille). Cause : routine:config dimanche = kind « none » mais heures wake/leave/sport restées dedans, envoyées brutes à l'IA. Fix : jour sans séance (kind ≠ sport ou séance annulée) → routine envoyée sans heures sport/trajet salle + contrainte « PAS de sport demain ». Même trou : message « Bien rentré » (Demain : réveil 05h00) et coucher conseillé (forme-food) ignorent le réveil d'un jour « none ».

## 21/11 — 🔮 Habitudes (19h30) : « planning sport de demain » préparé par research() dans l'agenda → « 07:00 Départ salle de Wemmel, 07:05 Retour maison » alors que dimanche = pas d'entraînement. Fix brain-plus sportPlanText : toute habitude sport répond depuis le VRAI plan de sport-coach (nextSessionDate/sportSessionFor/isSportSkipped) : « 😴 Demain : pas d'entraînement, repos. Prochaine séance : … ».

## 21/11 — Sport : « Je pas été m'entraîner aujourd'hui annulé ma séance » (7h27) → séance bien annulée par le code, mais le cerveau répondait « comme demain c'est ton jour de repos… » sans jamais dire « annulée ». Message court sans question → le CODE répond « ✅ séance du … annulée … Prochaine séance : … ». parseSportCancel comprend aussi « j'ai pas été à la salle ce matin », « je suis pas allé au sport aujourd'hui », « pas pu aller à la salle » (raison « pas allé »).

## 21/11 — « Plus jamais tu m'appelle mon rebeu » (18h59) → compris « ne m'appelle plus au téléphone », réponse inventée « j'ai annulé ton appel » → « ⚠️ Je n'ai pas exécuté cette action ». Fix : banned-words.ts — le CODE comprend « ne m'appelle plus X / arrête de m'appeler X / ne dis plus « X » » (pas « ne m'appelle plus le soir » = appels), liste kv kouider:banned_words, consigne dans le cerveau + ai(), X retiré de toute réponse et de tout message Telegram (« Salam Kouider, mon rebeu ! » → « Salam Kouider ! »). « tu peux m'appeler X » = levé. Cerveau de secours : 1 relance au lieu du message mort quand il invente une action. call_me : 1 seul appel par créneau ±10 min (2 appels à 20h05 ce soir, doublon annulé).

## 21/11 — RELANCES CLIENTS (relance-clients.ts, outil relances, jobs relance-clients 9h45 / jeudi 13h30) : chaque matin, une par une sur Telegram (oui = envoyé WhatsApp, non = suivante, via wa:pending + nextRelance dans handleWaYesNo) : 📅 prolongation aux clients qui rendent dans 1-2 j si la voiture est libre après ; 🛒 paniers du site (étape 2 de /reservation avec nom + tél, jamais validée → /api/cart-draft, client_leads notes « 🛒 panier {json} », conclu à la validation) ; 💬 WhatsApp silencieux (FIK a répondu en dernier il y a 1-7 j, juge IA : jamais un client qui a déjà loué/dit non/<35 ans/ami/proprio). 1 fois / 21 j par client. lead-cold ignore les paniers.

## 21/11 — Routine : « 📸 Radar fixe dans 950 m » à la maison. Cause : le 20/11 au soir une lecture app_kv en échec (kvGet renvoie null sur erreur) → routine:config par défaut (maison « Bruxelles, Belgique », réveil 6h40) ré-enregistrée par la resync agenda → maison inconnue (garde radar 500 m, présence, gym…). Fix : kvGetStrict (erreur = exception), rawRoutineConfig garde la dernière config lue, saveConfig refuse d'écraser les vraies adresses par celles par défaut. Config à restaurer depuis la sauvegarde VPS du 20/11.

## 20/11 — FORME agenda : guessMuscle prenait « velo » dans « deVELOppé » → séance pecs & dos du 20/11 nommée « CARDIO & DOS ». Cardio = mot entier (velo/course/marche), papillon = pecs.

## 20/11 — FORME repas : appel meal_text en double dans le même tour (< 2 min) → réponse « ✅ Noté (une seule fois) » + bilan du jour, au lieu de « PAS compté une 2e fois » (19h58 : Kouider a cru que sa tartine + barre n était pas notée).

## 20/11 — Scheduler : reprise du démarchage interrompu par un redémarrage (mise en ligne 10h03 → 0 mail le 20/11). jobdone:NAME:SLOT à la fin ; au démarrage +3 min, si prospect-outreach a démarré < 3 h sans finir → relancé une fois (slot :retry). Pas de doublon : il compte les mails du jour en base.

## 20/11 — FORME bilan : repos / défi / exercices prévus envoyés par l app gardés (kouider:sport:review-in:DATE) et repris quand le bilan est recalculé.

## 20/11 — FORME bilan : prévision « prochain palier » sur les 3 dernières séances seulement (Papillon 66/66/66 ne prédit plus 70 kg en 4 j), délai min 7 j ; « meilleur mois » seulement face à un mois avec ≥ 6 séances notées (octobre = 1 509 kg ignoré).

## 20/11 — FORME bilan : compte les séries faites À la charge max (16/11 élévations : 1 série à 8 kg puis 6, 6 → « = pareil » faux face à 3 × 8 kg). Graphique « 8 kg × 12 · 3 séries », tag « ▲ +2 séries à 8 kg », vert si même charge avec plus de séries, point fort ajouté. Bilan du 20/11 régénéré (sans renvoi Telegram).

## 20/11 — FORME bilan : nouveau graphique (barres horizontales, nom complet, meilleure série kg × reps vs la dernière fois sur CET exercice + date, ▲/▼ kg, vert/orange) ; noms par jour + accents ; « avant » retrouve le même exercice sous un autre nom

## 20/11 — FORME bilan : « Pas refait » = seulement les exercices du programme du jour non faits (plus de comparaison avec l'ancien programme du 16/11)

## 20/11 — Famille : femme + Ibrahim toujours avec Kouider (jamais « en Algérie »), Algérie = s'y installer ensemble

## 20/11 — FORME : bonnes photos curl pupitre / écarté vis-à-vis / rowing incliné / abdos machine, fiche sans « exercice inconnu » (v285)

## 20/11 — Conscience : retours de voiture toujours à l'aéroport d'Oran, plus jamais « chez toi »

## 20/11 — Sport : PRÉCÉDENT reconnaît le même exercice sous un autre nom (tirage poulie basse = rowing assis poulie, poulie haute, papillon)

## 20/11 — FORME : photos visibles dans « Remplacer par… » (mode sombre), bouton muscle actif lisible (v284)

## 19/11/2026 (suite 9) — FORME Agenda plus pro, avec photos des exercices (app v283)
- /api/sport/agenda renvoie la photo animée (2 images) de chaque exercice fait ou prévu (demoFor + fillDemos).
- Cartes repensées : badge statut, chiffres en pastilles, aperçu des exercices en photos ; ouvertes = photo + tableau SÉRIE | OBJECTIF | DERNIÈRE FOIS (à venir) ou SÉRIE | POIDS | REPS (faites), record à battre / nouveau record ; toucher un exercice = sa fiche complète.

## 19/11/2026 (suite 8) — FORME : Agenda des séances (app v282)
- Onglet Séance → bouton « 📅 Agenda des séances » : calendrier du mois (faites ✓ / à venir / ratées / repos), séances faites avec chaque série kg × reps, durée, tonnage, effort, records battus 🏆 ; séances à venir avec poids prévu série par série, objectif de progression, record à battre et dernière perf. Route GET /api/sport/agenda (sportAgenda). Anciennes séances sans nom → nom tiré des exercices notés (plus le nom de la case actuelle du programme).

## 19/11/2026 (suite 7) — Règles sport durables + plus de jambes
- Programme : « BAS + ABDOS » → « ABDOS + CARDIO » (tapis incliné, abdos, obliques, gainage, elliptique).
- Nouvelle action sport_coach `rule` (add/remove/list, kv `kouider:sport:rules`) : « plus de X sauf si je demande » est gardé pour toujours, injecté dans formeSnapshot (tous les cerveaux) et affiché avec le programme. Règle 1 : plus de jambes sauf demande de Kouider.

## 19/11/2026 (suite 6) — App v281 : texte tapé visible dans le Chat
- La zone de saisie du Chat avait une couleur de texte noire codée en dur → invisible en thème sombre. Elle suit maintenant le thème (var(--dz-text)).

## 19/11/2026 (suite 5) — Contrat : article 2 « DOCUMENTS » (sans le mot caution)
- Le contrat disait « CAUTION ET DOCUMENTS » alors que le site / la signature promettent « aucune caution ». Kouider garde bien le passeport → règle gardée, titre « DOCUMENTS » + « Aucune caution ni dépôt d'argent n'est demandé ».

## 19/11/2026 (suite 4) — Banc à 197/197 + « marre du travail » sans recherche d'article
- coach-week : « j'en ai marre moralement, je suis au travail » lançait la recherche web de l'article sur la librairie et disait au cerveau « il reprend le 14/11 » → recherche seulement s'il parle de fermeture / article ; contexte « il y retravaille depuis le 13/11 ».
- Banc privé (hors dépôt) : une IA d'appoint (message FORME du réveil…) n'est plus comptée comme « le cerveau » (requête sans liste d'outils) ; fr-meteo à la date réelle. phase1 = 197 OK · 0 KO.

## 19/11/2026 (suite 3) — Un seul « Bien arrivé au travail », Agence FIK hors check-list, livraison sans faux trajet
- Arrivée au travail annoncée 2 fois (grand-coach-plus « 🏢 » au 1er point GPS + presence « 💼 » 4 min après) → un seul message (presence) qui inclut la mission du Grand Coach (workMissionLine).
- Check-list de départ : les créneaux « Agence FIK » ne comptent plus (« tes dossiers pour l'Agence FIK »).
- jobDeliveryDepartureAlert : seulement en mode Oran (avant : « X min depuis Bruxelles → aéroport » pour une livraison à Oran) ; destination = aéroport d'Oran.

## 19/11/2026 (suite 2) — Humeur = supposition, vérifiée avec la montre (mood-guard.ts)
- Kouider : « il m'envoie "je sens que tu es stressé", comment il peut confirmer ça ? » → l'humeur est devinée par une IA d'après ses mots.
- 1) Jamais affirmée ni chiffrée : moodText (dossier), jarvis4Context, Conscience (humeur_supposee), life-plus, rapport mensuel → « supposition, demande-le ».
- 2) Croisée avec la montre (VFC < 85 % de la moyenne 14 j, pouls repos +4, nuit < 5,5 h) : montre normale → silence ; pas de données → question seulement.
- 3) « non ça va », « je suis pas stressé », « tout va bien »… → mood:denied:<date>, plus un mot sur son humeur jusqu'au lendemain (moodNowTick, alerte 3 jours, cerveaux).

## 19/11/2026 (suite) — Appels de nuit / pendant le travail, check-list sans caution, faux refus
- 18/11 01h20 : APPEL de la Conscience « ton stress est à 8/10, dors maintenant ». Moral / sommeil / santé / sport / famille = urgence 2 max → jamais d'appel, et rien la nuit.
- 18/11 19h30 : appel « urgent » pendant le travail pour la check-list du retour d'un client dans 2 jours. Les check-lists clients restent en message ; seuls ses propres voyages (≤ J-2) appellent. « Caution rendue » retiré (FIK loue sans caution, anciennes listes filtrées).
- 13/11 : « remets mes horaires » → morning_routine ✅ puis faux « ⚠️ Je n'ai pas exécuté cette action » : morning_routine ajouté aux outils d'action du phantomGuard.
- sport_coach skip : la consigne interne « (dis exactement celle-ci…) » s'affichait → « ➡️ Prochaine séance prévue (la seule vraie) : … ».

## 19/11/2026 — Revue de la semaine : GPS en retard, calories FORME, Agence FIK, journée famille
- « 🏢 Bien arrivé au travail » à 6h47 alors qu'il y était à 6h30 + « 🎒 Tu as bien : tes dossiers… » à 6h48 : l'iPhone n'a envoyé AUCUNE position entre 5h30 et 6h47. gps-life `fresh` (point précédent ≤ 10 min) : après un trou, pas de check-list de départ, pas de sas maison, et le Grand Coach dit « Au travail : » au lieu de « Bien arrivé ».
- « Journée famille » (family_care hard_day) rendait isDayOff vrai → atWorkNow faux alors qu'il travaille jusqu'à 13h le jeudi. Nouveau `isOffWork()` (congé réel, sans journée dure) utilisé par atWorkNow.
- FORME Repas : 932 kcal restantes mais protéines 109 g + glucides « encore 41 à 64 » + lipides « encore 29 à 39 » ≈ 1 040 kcal. Le « encore » des glucides = kcal restantes − protéines manquantes − gras (36 à 58 g ce jour-là).
- Agence FIK : Kouider travaille pour FIK de n'importe où, jamais à l'agence. Conscience ne voit plus ces créneaux (avant : « pars maintenant depuis la maison » 15/11 + 17/11, puis « Je pars » → 2 492 km), departures.ts les saute ; lieu en Algérie hors mode Oran marqué « à distance ».
- Brief du matin : conseils business jamais « ce matin / pendant le travail » (aucune pause).
- phantomGuard : « 🔄 Mise à jour… (en plus du précédent) » sans outil (shaker 18/11 14h14, rien dans FORME) bloqué.
- Vérifié : trajet travail → maison Google = 5 min (le « 45 min » du 18/11 était déjà corrigé 55b9ea04).

## 18/11/2026 (nuit) — iPhone : lien « touche pour lancer » sous Telegram + lecture de l'état
- Automatisation iPhone « Telegram Fermée → Dzaryx faire » faite par Kouider ; bouton Action → Dzaryx déjà en place.
- Il quitte rarement Telegram → `/api/call/turn` (channel message) ajoute « 📲 Touche pour lancer sur l'iPhone : …/api/jarvis/go-iphone » quand une action iPhone a été mise en file pendant le message. `/go-iphone` (public) = page qui ouvre `shortcuts://run-shortcut?name=Dzaryx faire`.
- Lecture : POST `/api/jarvis/phone-state` (jeton Kouider) stocke l'état envoyé par le raccourci (alarmes, batterie, photos…) dans app_kv `iphone:state` ; outil `iphone` action `status` le lit (avec l'âge du relevé).

## 18/11/2026 — Raccourci « Dzaryx faire » : branche alarme OK sur le vrai iPhone + alarme fiable
- Kouider a construit la branche `alarm` du raccourci (GET phone-do → items → boucle → do → Text → Si Text est alarm → time → Créer une alarme). Test direct par la file : alarme 23:58 créée ✅.
- Bug : « mets une alarme à 23h59 » sur Telegram → Claude sans crédit, Gemini 503, le secours gemini-3-flash a appelé schedule_reminder (rappel) au lieu de `iphone` et a dit « c'est fait ». En plus normalizer.ts réécrivait « mets » → « ouvre ».
- Fix : synonyme « mets → ouvre » retiré ; raccourci code ALARM dans orchestrator.ts (sur ownWords, phrase entière « mets/règle/programme une alarme à HHhMM », « réveille-moi à … ») → queuePhoneAction direct, quel que soit le modèle.
- Conscience (17:20) : « pour être à la maison à 20h, vise une sortie vers 19h15 (≈45 min de route) » alors qu'il finit à 20h et que le trajet est de ~7 min. Le snapshot n'avait ni fin de travail ni trajet → inventé (modèle de secours nvidia). Fix : `fin_travail_aujourdhui` + `trajet_travail_maison_min` (Google, cache 30 min) dans le snapshot + règle « jamais partir avant la fin, jamais de trajet inventé ».

## 17/11/2026 (soir) — Dzaryx pilote l'iPhone (outil `iphone` + raccourci « Dzaryx Faire ») + app v278
- Kouider (vidéo OpenJarvis) : « qu'il crée une alarme ou autre si je lui demande, comme s'il avait un accès complet à mon téléphone », « que moi qui ai accès ».
- `set_phone_alarm` ne marchait que sur Android (rien sur iPhone) → remplacé par l'outil `iphone` (25 actions : alarme, minuteur, Ne pas déranger, silence, lampe, Wi-Fi, Bluetooth, données, avion, économie d'énergie, mode sombre, volume, luminosité, rappel, note, dire un texte, presse-papiers, Shazam, média, appel, SMS pré-rempli, Waze, Musique, ouvrir une appli, lien).
- File `iphone:queue` (app_kv, 12 h max) ; GET `/api/jarvis/phone-do` (jeton Kouider) la vide ; `/api/jarvis/siri` renvoie `act: '1'` quand une action attend.
- Sécurité : sessions Houari / WhatsApp / jobs autonomes / tests refusées ; liens limités à une liste blanche ; SMS jamais envoyé seul.
- iphone-tool-def.ts sans import (sinon import circulaire tools.ts → ai-util → claude-api → tools, vu sur le backend VPS).
- App JARVIS › Santé·Siri : carte « Dzaryx pilote ton iPhone » (guide raccourci, automatisation Telegram fermé, Toucher le dos / bouton Action = Dzaryx à la place de Siri). Non testé sur le vrai iPhone.

## 17/11/2026 (après-midi) — Escouade + document, pesée Telegram → FORME
- Kouider : « fais une recherche pour le business … et crée un document, envoie-le-moi » → l'escouade a fait la recherche mais Dzaryx promettait un Google Doc + PDF que l'escouade ne sait pas faire (rien n'est arrivé). Dossier « Saveurs d'Oran — étude du business » créé à la main à partir des résultats + PDF via tgcall/outbox.
- escouade : `document: true` (+ doc_title) → à la fin, create_presentation_doc (Google Doc soigné + PDF Telegram) tout seul ; sans ça, la réponse de l'outil interdit de promettre un document.
- prospect_replies dismiss=true : « pas intéressant, oublie-les » classe vraiment (status stop, suggested_reply null) — avant Dzaryx disait « classé » sans outil. Keyin-DZ + SIAHA classés.
- life_coach log weight (« je me suis trompé c'est 76,9 ») écrit aussi dans FORME (remplace la pesée du jour).

## 17/11/2026 (midi) — Séance : vraies séries précédentes, progression 1→2→3 séries, échauffement = 1er exercice (07df79b0 + app v277)
- Kouider (photo triceps corde) : la dernière fois 1 seule série à 20,3 kg (puis 18, 18) mais PRÉCÉDENT affichait 20,3 × 12 sur les 3 lignes et proposait 20,3 partout. Pareil curl barre (30/25/25), élévations latérales (8/6/6).
- Backend suggestFor : `prev` (séries réelles dans l'ordre), `plan` (kg série par série), `goal` (phrase). Règle : 1 série de plus au poids lourd à chaque séance (si les reps du bas de la fourchette sont faites) ; toutes les séries réussies → +step (2,5 par défaut) sur la 1re série, les autres restent, et ça recommence. « facile » = on monte, « dur » = −step.
- App : PRÉCÉDENT = série réelle ou « — » ; lignes pré-remplies avec `plan` ; encadré 🎯 Objectif (remplace le défi du jour).
- Échauffement = vrai exercice n°1 (warmupFor) : jambes → vélo, dos → rameur, épaules/bras/pecs → elliptique, sinon tapis (pente 8 %, 5,5 km/h) ; réglages + machine de rechange + mobilité ; chrono dans la carte ; durée retenue (forme:warmMin) ; noté « Échauffement — rameur X min ». Ancienne bannière cachée quand il est là.

## 17/11/2026 (matin 6) — Corriger / supprimer une pesée (backend + app v276)
- Kouider : « je dois pouvoir remodifier le poids si je me suis trompé (76,9 au lieu de 76) ». Pesée du 17/11 corrigée à 76,9.
- App FORME (Évolution + Sèche) : « ✏️ Mes pesées — corriger une erreur » → 10 dernières pesées, toucher = corriger le chiffre ou supprimer (WeighIns.tsx). Retaper le poids du jour remplace déjà celui du jour (placeholder le dit).
- Backend : kind `weight-del` (le poids actuel du profil redevient la dernière pesée restante) ; outil `forme` log accepte `date` + weight-del, et une correction « je me suis trompé c'est X » remplace la pesée du jour.

## 17/11/2026 (matin 5) — Agenda : titre de séance en double
- Les séances du programme Aïd s'appellent « HAUT B — ÉPAULES & BRAS » : la synchro agenda gardait tout ce qui suit le 1er « — » comme lieu → « HAUT B — ÉPAULES & BRAS — ÉPAULES & BRAS — salle de Wemmel » (et ça grossissait à chaque synchro). Le lieu = seulement le dernier segment s'il parle de salle.
- Noms des séances passés en « HAUT B · ÉPAULES & BRAS » (kv kouider:sport:program) pour que widget voiture / GPS / messages, qui coupent au « — », affichent le nom complet.

## 17/11/2026 (matin 4) — Programme « transformation Aïd 10/03/2027 » (backend + données)
- Programme officiel (kouider:sport:program) : HAUT A Pecs & Dos · BAS + ABDOS · HAUT B Épaules & Bras · HAUT C Pecs, Dos & Bras — haut du corps 2-3×/semaine, jambes en entretien, 1-2 reps en réserve. Rotation reprise sur HAUT B (state.next = 2), agenda resynchronisé (POST /api/sport/sync sur Railway).
- Objectif : wantBy/eta 2027-03-10, 7 étapes datées (photos 21/11, 19/12, 16/01, 06/02 bilan ramadan, 10/03 Aïd ; poids 76 kg 05/12, 75 kg 02/01 puis maintien — jamais sous 75).
- Charges suggérées : un exercice qui change de séance garde ses charges (même nom / même id sans préfixe), mais un autre exercice noté sous le même id n'est plus pris (shoulder_press = « Écarté assis machine » ≠ développé épaules).

## 17/11/2026 (matin 3) — FORME : corps cliquable → séance par muscles, objectifs par zone, programme sur mesure, historique cliquable (app v275 + backend)
- Séance › « Ton corps — touche un muscle » (BodyZones.tsx) : les 2 silhouettes (face/dos) se touchent muscle par muscle (test au pixel sur les calques wger), plusieurs à la fois, + puces pour les 19 zones (avant-bras, cou, adducteurs, lombaires, cardio…). Couleur = récupération, bleu = choisi, alerte si pas récupéré. « Créer ma séance » (30-75 min) → forme-zones.ts choisit les exercices par CODE (bibliothèque + ce qu'il a déjà fait/scanné/mis en favori d'abord, pas de soulevé de terre lourd — dos à ménager) → lecteur habituel → enregistrée dans son journal avec son vrai nom (bilan /10, records).
- « Mon objectif ici » : par zone moins de gras / plus dessiné / plus gros / plus fort / entretenir + ses mots (kouider:forme:zonegoals) → séries/reps des séances, finisher cardio si « moins de gras » (avec l'explication honnête : pas de perte de gras localisée), ligne dans le dossier des cerveaux (goalsText).
- « Mon programme sur mesure » : makeGoalPlan (photos de suivi + objectifs par zone) puis adaptProgram (agenda + FORME).
- Historique : le vrai nom de la séance (SessionLog.label → séance perso → bilan → muscles travaillés) au lieu de la case du programme (« ÉPAULES » pour la séance jambes) ; chaque séance se touche → détail (bilan /10, fait à la demande s'il manque, + séries kg × reps). GET /api/sport/session.
- Routines et séance libre de Kouider : enregistrées dans son journal de sport (avant : seulement FORME → pas de bilan, pas de record).

## 17/11/2026 (matin 2) — FORME : records sur TOUS les exercices, regroupés par nom (app v274 + backend)
- Curl barre 30 kg pas compté en record : le même exercice avait 2 identifiants (« pull_curl_barre » 25 kg le 13/11, « Barbell_Curl~… » ajouté depuis la liste). exKeyer() (sport-coach) = clé par NOM (kouider:sport:exnames) → records à l'enregistrement, records de la semaine, bilan de séance (« avant », 🏆) et liste Records.
- Liste Records : avant = seulement les exercices du programme, 6 visibles ; maintenant tous (photo + liste), les plus récents en premier, bouton « Voir tous mes records ». Bilan du 17/11 recalculé (🏆 Curl barre 30 kg × 12).

## 17/11/2026 (matin) — FORME : bilan comparé à la bonne séance, calories de séance sans montre, photo machine qui ne charge plus à l'infini (app v273 + backend)
- Bilan de séance : la « dernière pareille » = la plus récente qui partage vraiment ≥ 30 % de ses exercices (avant : même case de rotation → JAMBES du 17 comparée aux PECS du 16, « vs la dernière ÉPAULES », « Pas refait : Papillon »). Bilan du 17/11 recalculé. Carte « Bilan de ta dernière séance » : si le bilan du jour n'est pas encore prêt, l'appli continue de le chercher au lieu de rester sur celui d'hier.
- Calories : séance pas lancée sur la montre → dépense de la séance calculée (MET selon l'effort × poids × durée + tapis) ; dépense active du jour = au moins journée sans sport typique × 0,9 + séance. Visible dans Repas et les bilans jour/semaine.
- Scanner une machine : envoi limité à 40 s, 2e essai automatique, puis message clair (pas de réseau / réseau lent) au lieu de la roue infinie.

## 16/11/2026 (soir 6) — Campagne diaspora, protéines en 1 geste, « Toi » + « Ta semaine », leads qui refroidissent (app v272 + backend)
- CAMPAGNE DIASPORA (Saison diaspora) : Kouider « mes clients vivent en Europe, les voitures sont en Algérie → que pour le tourisme ». Prochaines vagues (fêtes 19/12→3/1, Aïd el-Fitr ≈ 10/3, printemps, Aïd el-Adha ≈ 16/5, été) avec voitures libres / réservées et l'an dernier ; feuille « Préparer la campagne » : offre réserve-tôt (−0/5/10/15 % jusqu'à J-21), anciens clients joignables (WhatsApp perso 1 appui, FR/AR, code parrain créé à la volée −5 % famille = nouveaux clients), bandeau du site (site_settings.announcement), légende TikTok. GET /api/insights/waves, POST /api/insights/waves/announce. Numéros normalisés (04… belge, 05/06/07 Oran, faux numéros écartés).
- FORME Repas : « Protéines en 1 geste » (shake, skyr, œufs, poulet, thon, fromage blanc) + « refaire un repas récent », sans IA (GET/POST /api/forme/food/quick).
- Aujourd'hui : « Toi aujourd'hui » (séance, protéines, demis Liberté, nuit, RDV médecin) + « Ta semaine » (7 j vs 7 j d'avant : poids, séances, sommeil, protéines, demis ; CA du mois = getFinancialReport) + rappel de la prochaine vague diaspora. GET /api/insights/me (me-week.ts). Dimanche 19h30 : même carte sur Telegram (job week-card).
- Leads : job lead-cold 10h30 (demande ouverte > 48 h → liste sur Telegram, J+2 et J+5 max) ; Demandes : badge « attend depuis X j » + bouton « Relancer » avec vrai message de relance FR/AR/EN.

## 16/11/2026 (soir 5) — Réponses plus rapides : réflexion ciblée + quota Gemini épargné (backend)
- Mesure 15/11 (journaux Railway) : chaque étape Gemini en « réflexion medium » = 8-20 s. Elle se déclenchait à tort : texte de plus de 220 caractères à cause des blocs [ … ] ajoutés par le système (notification de RDV citée → 38 s pour « calcule mon trajet » ; « c'était quoi les compléments ? » → 32 s). `ownWords()` : on juge sur les mots de Kouider seulement (agentic-fallback). Log « réflexion demandée pour : … » pour vérifier.
- fallback-probe : le test des cerveaux appelait CHAQUE modèle × CHAQUE clé (Gemini 7 × 5 = 35 requêtes, quota 20/jour/modèle) à l'autotest, à la veille du matin et à l'ouverture de À PAYER. Maintenant 1 essai par fournisseur (Gemini sur un « lite »), timeout 20 s : 30 s → 1,3 s.

## 16/11/2026 (soir 4) — Revue de solidité : 40 pages passées au robot (app v271)
- Audit automatique des 40 pages (erreurs JS, appels serveur en échec, débordements, « NaN/undefined ») : aucune page ne plante.
- Demandes : les leads « perdu »/« conclu » et dossiers terminés/annulés étaient comptés « 3 demandes en cours » → rangés à part (« Voir les 3 terminées »), compteurs des filtres sur les demandes ouvertes, statut en badge (Perdu/Conclu) au lieu de « Statut : perdu ».
- FORME : le tableau de bord disait « 7 semaines d'affilée » alors que c'est 7 SÉANCES (stats.streak compte les séances) — en haut « 4 sem. » était juste. Libellé corrigé ; 🔥 → icône.
- Liberté : « RDV médecin : 2026-11-20 » → « ven. 20 nov. (dans 4 j) ».
- Cases de chiffres : Démarchage et Sites clients passent de 4 à 2 colonnes (« Aujourd' », « Décideu », « Messag » coupés). Kit Kpi : mode compact automatique (container query) quand une case fait < 96 px.

## 16/11/2026 (soir 3) — Sèche : vraie série au lieu du « 1RM estimé » (app v270)
- Kouider : « je n'ai pas fait 92 kg au butterfly ». 92,4 = 1RM estimé (Epley) de 66 kg × 12. « Ta force pendant la sèche » affiche maintenant la meilleure série réelle (66 kg × 12), l'estimation en petit ; même chose dans le contexte des cerveaux. Noms d'exercices sans l'id « ~mwiuf57z0 » (les séries du même exo sont enfin regroupées → la comparaison sur 2 semaines marche).

## 16/11/2026 (soir 2) — Sommeil réparé, FORME graphiques partout, emojis finis, étiquettes non coupées (app v269)
- SOMMEIL : 5 nuits sur 7 vides (le Raccourci « Dzaryx Sommeil » du matin ne part presque plus, montre pas portée la nuit). Le 1er envoi de la montre du matin (sans nuit), avant l'heure de réveil prévue + 1 h 30, compte maintenant comme « levé » → nuit estimée (sleep-phone `wakeFromHealthSend`, appelé par receiveHealth). FORME lisait le jour FORME seulement : `formeOverview.week7` prend aussi sommeil/pas de health:daily.
- FORME : Repas (graphique mangé vs brûlé + déficit du jour, protéines vs objectif), Sèche (même graphique « Ton déficit », grille sans emojis), Progrès (courbe du tour de taille dès 2 mesures), Exercices (bandeau « Tes records »). forme/WeekCharts.tsx.
- Emojis → icônes : Mon PC (pastilles, boutons, Laptop/PC cloud), Sites clients, Démarchage, Partenaires, Montage (lecture), Caméra → PC, Opportunités, Achat-revente, Liberté, À payer (+ interrupteur mode éco). ~60 emojis ajoutés à la table d'icônes (+ icônes watch, scissors, flag, utensils, leaf, ship).
- Kit Kpi : étiquette sur 2 lignes avec césure au lieu de « Mails … » coupé. Immobilier : « Location / Vente ».

## 16/11/2026 (soir) — Capacités refait + emojis restants (app v268)
- Réglages › Capacités & agents : les cartes étaient écrasées dans une boîte de 520 px (capture de Kouider). Maintenant ouvert dans une feuille plein écran, refait au style v4 (segments Agents/Proactif/Tout, avatars, exemples « dis par exemple », frise de la journée type). Liste IA mise à jour (Gemini par défaut, Claude, Gemini Live).
- Emojis → icônes : Documents (Passeport/Permis/Contrat), Immobilier (« Comment l'utiliser »), À payer (pastilles d'état), Demandes (badge Lead).

## 16/11/2026 (après-midi) — Clients, Réglages, FORME graphiques, Fennou + Route retirés du menu (app v267)
- CLIENTS : héros « CA cumulé » + 3 chiffres (profils, reviennent, panier moyen) + top 5 clients en barres ; filtres Tous / VIP / Fidèles / Nouveaux / À relancer (> 4 mois) ; tri Récents / CA / A→Z ; cartes avec avatar, « il y a X », boutons WhatsApp + appel ; fond blanc de la carte ouverte en mode sombre corrigé.
- RÉGLAGES refaits façon Réglages iPhone : carte profil (statut serveur + version), aperçus clair/sombre/auto, lignes avec tuiles d'icônes, mot de passe et appareils repliables (vu il y a…), position, état système, tâches et règles repliables.
- FORME › Séance : nouveau tableau de bord (forme/Dashboard.tsx) — anneaux d'activité (séances semaine, pas, protéines), graphique à onglets (volume 8 semaines, pas, sommeil, calories ; onglets vides masqués), courbe de poids en aire avec objectif.
- Menu Plus : FENNOU et ROUTE retirés à la demande de Kouider (code gardé).

## 16/11/2026 — Design v4 « Signature » (Dzaryx + FORME) + Vitalité retiré + bouton LIBERTÉ
- LIBERTÉ : la feuille « Combien exactement ? » restait sous la barre du bas → impossible de valider. Toutes les feuilles (Kit Sheet) et toasts passent en portail dans <body> (z ≥ 1000).
- Module Vitalité retiré partout (demande de Kouider) : onglet COACH supprimé (VitaliteTab.tsx), job/rappels coupés, rien dans le dossier des cerveaux, outil `vitalite` limité aux prises de sang ; LIBERTÉ sans « désir / libido » (« Ce qui revient » = énergie, joie, clarté).
- Design v4 (analyse de 40 apps → DZARYX/APP/DESIGN_40_APPS.md) : barre du bas flottante en verre + orbe animé, menu Plus en grille d'icônes d'applis (+ « Les plus utilisés »), lueur de couleur par page, police Geist + étiquettes Geist Mono, cartes en verre fumé, bouton principal monochrome (`T.onInk`), icônes au trait (Icon.tsx) à la place des emojis (Label/Ico automatiques), nouveau logo. FORME : identité orange énergie, barre flottante, cartes verre.

## 15/11/2026 nuit — Mode sombre Dzaryx + FORME, nouvelle palette FORME (app v264-v265)
- Réglages › Apparence (Dzaryx) et Mon profil › Apparence (FORME) : Clair / Sombre / Auto (suit l'iPhone). Clé partagée `dz:theme` : Dzaryx et FORME (même dans l'iframe) changent ensemble, sans flash au démarrage.
- Toutes les couleurs neutres passent par des variables (`--dz-*` dans index.css, `--f-*` dans forme/index.html) ; T.* / F.* = variables. En sombre les boutons noirs deviennent bleus ; écran vocal (canvas) suit le thème.
- FORME : palette alignée sur Dzaryx (fond #f2f2f5, encre #0c0e1a, bleu #2f5bff), sombre noir total façon Whoop ; photos d'exercices sans « multiply » en sombre.
- Analyse de 30 apps → règles de design : DZARYX/APP/DESIGN_30_APPS.md.

## 15/11/2026 (3) — Boutons forme du réveil + correction auto des mots étrangers / vouvoiement
- Jour de sport : sous le message du réveil, le bot des notifs FIK envoie « ☀️ Ta forme ce matin ? » avec 5 boutons (dz:forme:n) → réveillé + forme notée + séance adaptée, confirmation dans la conversation Dzaryx. Le chiffre écrit marche toujours.
- fixLanguageSlips (response-guard, via oranize) : « immédiata » → « immédiate », « spams coliques » → « spasmes », et pour Kouider seulement « Vos taux / Votre santé » → « Tes taux / Ta santé » (lignes citées « … » / > laissées : brouillons clients).

## 2026-11-15 soir — Refonte design de l'app (v263)
- Navigation : bouton ‹ Retour en haut sur toutes les sous-pages + geste retour iPhone (history), onglets du bas = racines.
- Fiche client unique (ClientSheet.tsx, openClient/ClientName) : nom touché n'importe où (Réservations, Clients, CA, Aujourd'hui, Relance) → coordonnées, passeport, chiffres (locations, dépensé, à encaisser, marge réelle du site), ce que Dzaryx sait, toutes les locations, documents, notes, actions Appeler/WhatsApp/E-mail/Dzaryx.
- Kit v3 : verre + reflets, aurore animée dans les en-têtes, titres en dégradé, chiffres qui défilent (CountUp), appui qui s'enfonce, feuilles qui glissent, entrée des pages en cascade, barres haut/bas en verre dépoli, menu Plus coloré par thème.
- Aujourd'hui : carte « Mon argent » (à récupérer, CA du mois), raccourcis, « En ce moment » (voitures dehors + barre de progression, arrivées 7 j).
- Harmonisation : onglets Immo/Achat, boutons Clients/Partenaires/Immo au style commun.
- Backend : liste Clients « 0 € » corrigée (ACTIVE/COMPLETED comptés dans le total dépensé).

## 2026-11-15 — Argent juste partout + écran CA « récupéré / à récupérer » + fiche client (app v262)
- **Règles de Kouider : voiture récupérée = tout payé (statut → PAID auto), acompte = 3 jours déduit du total** (pickedUp/acompteOf, fiche client « Acompte (3 jours) ✓ reçu / à demander » + « Reste à la remise des clés »).
- **« Payé » = payé en entier partout** : paidOf()/dueOf() (finance.ts) ; le site/l'app/Dzaryx passaient PAID sans toucher paid_amount (Belarbi 75/150, Abdelkader 120/720, Fatima 380/420) → faux « reste à encaisser » (CA 715 €), appel de la veille qui aurait annoncé « il reste 75 € », contrat, rapports, export Excel, paiement par la voix. Job `payments-repair` */15 remet paid_amount + amount_remaining d'aplomb (refusées = 0). update_booking / create_booking / PATCH app : PAID sans montant → montant total.
- Écran CA : carte « 💰 Mon bénéfice » (gagné / déjà récupéré / à récupérer, € + DA, même source que le site) avec ✓ Récupéré par location ; part Houari bien nommée ; par véhicule au prorata du mois. Routes /api/finance/ledger(+/collect).
- Réservations : fiche complète au clic (client, passeport, e-mail, location, argent, notes, documents, autres locations). Opérations : bouton Supprimer (DELETE /api/clients/operations/:id) ; record_client_deal refuse location_voiture (doublon Djillali « 440 DA »).

## 15/11/2026 (2) — Vrais boutons sous les choix de Dzaryx
- Kouider : « ajoute le bouton comme sur les notifs FIK, on clique au lieu de mettre 1 ou 2 ». Les décisions (createDecision, conscience.ts) partent maintenant par le bot des notifs FIK avec un bouton par choix (seuls les bots Telegram ont des boutons). Clic → site /api/telegram-notif (dz:id:n) → Railway POST /api/jarvis/decisions-button (jeton interne) → choix exécuté, résultat dans la conversation Dzaryx. Répondre « 1 » à Dzaryx marche toujours ; si le bot échoue → ancien texte. DECISION_BUTTONS=0 coupe.
- Liberté : palier gardé à 5 demis jusqu'au médecin (RDV 20/11) à sa demande, prochaine baisse 21/11.

## 15/11/2026 — Revue des échanges 14-15/11 : conseils Belgique/Algérie, douleur, moral, appel démarchage
- « Rester en Belgique ou partir vivre en Algérie, quand ? » → le cerveau inventait ses seuils (15-20 k€, 1 500 €/mois, « été prochain »). algerieAdviceHint (algerie-plan.ts) : son plan calculé (maison + voiture payées, date de départ) mis à côté de la question. Rejoué : date déc. 2029 / janv. 2032 citée, plus rien d'inventé.
- Douleur au flanc : « problème de rein très peu probable » à cause de la prise de sang. health-advisor : une prise de sang normale n'exclut pas calcul/infection/appendicite + signes qui imposent le médecin le jour même. Rejoué OK.
- « Je n'arrive plus à baisser, je replonge depuis la reprise du travail » → réponse sans son vrai statut (« ne culpabilise pas si tu as freiné » alors qu'il était dans le plan) ni la baisse du lendemain. liberteStruggleHint : statut réel + prochaine baisse + il choisit (garder / palier plus long), jamais pendant le travail.
- Les chiffres fournis par le code (Liberté, plan Algérie, dossier santé) ne sont plus remplacés par « je n'ai pas accès aux données en temps réel » (fastPathGuard).
- Démarchage à court de sociétés : message seulement, plus d'appel (appelé au travail dimanche 10h16).

## 15/11/2026 nuit — Veille hebdo : notes « [Contexte : …] » périmées purgées de l'historique
- Bug vécu 14/11 20h07 : « aucun des 2 mails n'est intéressant » → « je t'appelle dans 20 secondes pour ton brief du matin ». Cause : la note GPS de 10h54 (« je l'appelle dans 20 s pour son brief ») restait en entier devant son message dans l'historique, le cerveau gratuit la rejouait.
- context-builder shortPreamble : dans l'historique (jamais le message courant) chaque note « [Contexte : …] » est réduite à sa 1re phrase + « contexte passé, déjà traité » (idée du « context editing » d'Anthropic : purger le contexte périmé). Aussi après « [au téléphone] ».
- crash-test : scénario note-perimee (OK), resa-semaine / suivi-contexte / whatsapp-confirm OK.

## 14/11/2026 (2) — Contrôle de nuit : pause au travail, « marqués lus », bilan semaine
- Bilan « mauvaise semaine » proposait « marche rapide pendant tes pauses boulot / étirements au bureau » malgré WORK_FACT → stripWorkBreak (response-guard) appliqué à toute réponse via oranize : puce/phrase « pause au travail / au bureau / pause déjeuner » retirée par le code (pauses entre séries gardées).
- « 2 marquée lu » → « ✅ Les 2 sont marqués lus » sans outil → phantomGuard reconnaît « marqué(s) lu(s) / archivé(s) » (refus + relance du cerveau).
- coach-week : une séance annulée/déplacée/ratée non faite n'est jamais comptée comme « jour de repos » (le cerveau se contredisait).

## 14/11/2026 (1) — Panier compléments : vrais liens produit
- Kouider : « il m'envoie que le lien du site, pas des articles ». La recherche ne rendait que des pages d'accueil → le cerveau mettait https://fr.myprotein.com ou un lien Google.
- health-advisor fixBasketLinks : après la réponse (wrapper processMessage, questions « compléments + acheter »), chaque lien accueil/Google du panier → vraie page produit trouvée par « site:<boutique> <produit> » (DDG lite + Yahoo via r.jina.ai, texte complet). Testé sur la réponse du 14/11 : 4/4 liens produit (~14 s).

## 13/11/2026 (11) — Heure d'arrivée client, photo analysée par le code, liens compléments
- Belarbi : résa « arrivée 18:05 » mais fiche d'arrivée à 10:00 (trips.ts forçait 10:00 à chaque synchro). bookingTimes(notes) lit l'arrivée / le retour (dernière mention gagne) → fiche d'arrivée / de retour à la bonne heure.
- update_booking arrival_time (+ arrival_flight) : l'ancienne heure d'arrivée est remplacée dans la note ; l'agenda 🚗 de la location suit (début = arrivée, fin = retour). Heure donnée par le client sur WhatsApp (texte / photo billet) → arrival_time.
- Photo + légende sur son corps (veines, bras, dos, ventre, pecs…) : forme body_photo lancé par le CODE avant le cerveau (le cerveau répondait des généralités sans analyse).
- Compléments : liens DuckDuckGo décodés, panier obligatoirement avec liens cliquables (sinon lien de recherche Google).
- Conseils corps : la proposition « mets … en priorité » reprend les zones dont il parle (plus « dos et pecs » pour une question sur les veines).

## 13/11/2026 (10) — Coach de semaine, travail, photos de zones, panier compléments
- « mauvaise semaine / pas beaucoup entraîné / adapte la semaine prochaine à partir de lundi » → coach-week.ts : le CODE garde l'histoire de la semaine (kv kouider:week:story:<lundi>), met une reprise en douceur lun→mer si ≤ 1 séance faite (setReprise), replanifie la semaine (planSportWeek) ; le cerveau répond en coach de vie + sport (semaine, tête, corps, plan, pourquoi). fr-commands laisse passer ces phrases.
- Travail (librairie de Jette fermée par la police, « je m'y sens mal ») : ressenti gardé (kv kouider:work:feelings), article cherché par le code (Le Soir / La Libre 12/11 trouvés), conseils prudents (aucune supposition, droits du salarié).
- Garde anti-invention : les actions faites par le CODE (semaine replanifiée, séance annulée) comptent comme outils réussis (codeActions) → plus de ⚠️ à tort.
- Photos du corps : gros plans bras / ventre / pecs (nouvelles poses, devinées depuis le focus), comparés au même gros plan ; veines = leviers réels (gras, muscle avant-bras, congestion, hydratation), jamais diurétique.
- Conseils corps : « je fais quoi pour… », « pas de changement au dos… je veux me métamorphoser » déclenchent la réponse personnalisée + proposition priorité / photo de la zone.
- Compléments « les meilleurs pas chers, tous au même endroit » : recherche boutiques/prix par le code, réponse = UNE boutique, panier, total/mois, quoi demander au médecin.

## 13/11/2026 (9) — « Remets mes horaires de travail » marchait pas
- 21h47 « tu peux remettre aussi mes horaires de travail je recommence à travailler demain à la librairie » → ⚠️ « Je n'ai pas exécuté cette action » : no_work n'avait pas d'inverse, le cerveau a inventé « c'est fait » et le garde-fou l'a bloqué.
- Nouvelle action morning_routine work_back (+ phrase directe workBack : « remets mes horaires de travail », « je reprends le boulot lundi », « la librairie rouvre ») : congés no_work annulés à partir de la date, plans « jour de congé » retirés, créneaux de travail effacés de l'agenda FIK remis (restoreAgendaRange, occurrences annulées → confirmed).

## 13/11/2026 (8) — Site → Dzaryx réparé + titres Google
- Le site n'a jamais pu prévenir Dzaryx (« //api/fik-site/notify » 404 : IBRAHIM_BACKEND_URL finit par « / ») → corrigé côté site (autolux 40e74db). Contrôle client + appel « tu l'acceptes ? » reviennent ; le texte Telegram n'est plus doublé (le site l'envoie déjà avec les boutons) ; avis / changement de statut fait par Kouider : pas de doublon.
- SEO site : 12 pages sans <title> (voitures, vente, immo, packs, blog, pages légales) → titres rendus ; voiture = « Location X à Oran — prix/jour, sans caution | Fik ».
- Search Console jamais connectée (gscReport = null) → lien à cliquer par Kouider.

## 13/11/2026 (7) — Quotas cerveaux + vraies stats du site
- Vérif logs Railway 13/11 : les vrais messages de Kouider sont servis par le gros Gemini (gemini-3.5-flash) ; la « saturation » du contrôle de nuit vient du banc lancé exprès SANS clés Gemini → pas un problème en vrai.
- OpenRouter « free-models-per-day » (429 sans délai) n'était pas reconnu comme quota du jour → réessayé toutes les 15 min (2 appels perdus/heure par les tâches auto). Maintenant sauté jusqu'à 00:01 UTC.
- get_site_analytics comptait les robots comme vrais visiteurs (30 j : 351 « sessions » dont 254 ordinateurs Chine/Singapour/USA sans aucun geste) → seules les visites avec #event:engaged comptent (comme le rapport de 21h), les #event: ne sont plus des « pages ». Réel : ≈ 2 humains/jour ; la réservation n'est pas le point de fuite, c'est le volume.

## 13/11/2026 (6) — Fiabilité + site 100 % depuis Telegram
- Secours : réponse VIDE d'un cerveau (Gemini 12/11 22h31, après 6 outils) → le suivant reprend avec les résultats (avant : tout le secours abandonnait → Groq sans outils, « réponse NON vérifiée »).
- Anti « c'est fait » mensonger : phantomGuard reconnaît « c'est fait / c'est parti », « a été envoyé au… », « message/mail/pdf … envoyé » sans vrai envoi (testé 7/7).
- Outil site_admin (toujours disponible) : demandes en attente, accept/reject avec effets du site (email client + Google Agenda), réglages (annonce, WhatsApp, acompte, titre…), FAQ, conditions (arabe auto), blog, newsletter (relecture + test), dossiers/import.
- SÉCURITÉ site (autolux 4e1cde7) : 9 routes /api d'administration étaient ouvertes au public (accepter/refuser, modifier résa, pages légales, uploads, dossiers, import, contrats, état des lieux) → session admin ou jeton interne (INTERNAL_API_TOKEN) ; pages admin via adminFetch. Vérifié : 401 sans jeton, OK avec.
- Notif Telegram nouvelle réservation : « dis à Dzaryx : accepte <nom> ».

## 13/11/2026 (5) — FORME : bugs poids + « plus boosté »
- Bug : « 0.8099999999999999 kg/semaine » (arrondi r1(x*10)/10) → toFixed(2) + virgule française ; courbe et cases Dernier/Mini/Maxi = vraies pesées (affichaient la tendance 78,6 alors que la pesée était 77).
- Courbe double (pesées + tendance verte) comme Happy Scale / Libra.
- Gras & abdos : % de gras méthode US Navy (taille + cou + hauteur), kg de gras / muscle, poids des abdos visibles (~12 %) et date ; plancher 75 kg respecté (sinon → recomposition). Mesure « cou » ajoutée.
- Supersets (🔗) dans le mode séance : A → B sans repos, repos puis retour sur A.
- Hors ligne : séance gardée sans réseau, envoi automatique au retour du réseau ; page FORME mise en cache par le service worker (v261) et enregistrée depuis FORME.

## 13/11/2026 (4) — Revue des discussions 11→13/11 (47 messages)
- WhatsApp 11/11 18h07 : « Oui » → Dzaryx a dit « envoyé » mais rien n'était parti (cerveau gratuit : brouillon réécrit sans relecture, puis confirmation refusée en silence). Fix : le texte réécrit montré à Kouider redevient le brouillon en attente (captureWaRewrite, call.ts) ; signature tolérante au gras/citations ; confirmation refusée = « ⛔ PAS ENVOYÉ » dans le résultat de l'outil.
- Sport 12/11 : « demain on reprend les Épaules » alors que le planning disait Dos & Biceps → skip renvoie la VRAIE prochaine séance.
- Santé 11/11 : « Quel protéine je dois prendre ? » pas reconnu comme question compléments (réponse sans dossier, « achète en Algérie ») → SUPP élargi.
- 12/11 22h29 « cerveau hors service » = Gemini saturé (503) + quota Gemini et OpenRouter du jour épuisés : externe, pas de code.
- Vérifié OK : prise de sang du 9/11 réelle (vit D 20, testo 6,96), demis 3+1+1 = 5/5, séances lun+mar, retour Djillali, brief du matin, améliorations de nuit.

## 13/11/2026 (3) — Bénéfice réel : site + Dzaryx = même chiffre
- Kouider : « gagné depuis le début » + « à récupérer » qui repart à zéro quand il récupère ; tout avant Djillali (29/10) déjà récupéré ; bénéfice réel en DA (Djillali 15 000 DA, Belarbi 12 500 DA).
- Site (autolux ca9c9c3, 48ed22f) : section « Mon bénéfice » ; source = site_settings.content.profit {rate, cutoff, items{id:{da|eur,collected}}}.
- Dzaryx : real-profit.ts lit la même source ; getFinancialReport utilise le bénéfice noté à la main ; get_financial_report + action ledger / collected (« j'ai récupéré mon argent ») / set_profit (« Belarbi bnf 1250000 »).

## 13/11/2026 (2) — Bouclier WhatsApp : plus jamais 2 fois le même message
- Kouider : l'assistant IA a renvoyé à Belarbi le même message tout fait (« je ne peux pas prendre ce genre de décision… ») à 19h00 puis à 20h10, en réponse à « Merci beaucoup / Également ».
- night-guard.ts : simple merci / au revoir / ok après un 1er message IA → rien envoyé ; déjà présenté → réponse NOUVELLE à sa question (conditions, papiers…) avec un court rappel « assistant IA » + « une personne revient vers vous » ; cerveau en panne → 2e essai rapide puis message court différent (« Bien reçu 👍… ») ; texte déjà envoyé à ce client → jamais renvoyé.

## 13/11/2026 — FORME : le cardio n'est plus une série
- Kouider : « marche sur le tapis, il le considère en série, c'est pas correct ».
- Mode séance (Sport.tsx) : tapis / vélo / elliptique / rameur / escalier / corde / exercice cardio = une seule ligne ⏱ minutes + ✓ (pas de KG, PRÉCÉDENT, Disques, Échauffement, repos) ; hors du compteur séries/volume ; noté « Cardio — … min » dans la note de la séance (2a24d159).
- Site : accepter une demande écrit CONFIRMED (la base refuse ACCEPTED, erreur bookings_status_check) — autolux 197a3e1.

## 2026-11-11 (5) — Client sans réponse depuis 1 h → l'assistant IA répond
- Kouider : « avec la localisation il sait qu'il doit mettre le bouclier ; si ça fait 1 h que notre client n'a pas de réponse, donne-lui les conditions, demande date et âge, sans rien réserver, en disant qu'on reviendra vers lui ».
- Pendant le bouclier (levé par le GPS) ou la nuit, un client sans réponse seule (client CONNU…) est noté en attente (`wa:waiting`) ; job `client-waiting-reply` */10 : 1 h sans réponse de FIK → réponse de l'assistant IA (draftNightReply : conditions, dates + âge, jamais de dispo ni de réservation, « une personne de FIK reviendra vers vous »), 1 fois / 6 h par client, Telegram prévenu. Envoi par Kouider → attente effacée.

## 11/11/2026 — Conseiller santé & compléments personnel
- `health-advisor.ts` : question santé / compléments (créatine, whey, vitamines, magnésium, analyses, symptômes…) → tout son dossier santé posé à côté de la question : profil FORME, sèche + plancher 75 kg, protéines visées, charges, récupération, sommeil, dernière prise de sang (normes du labo), traitement en baisse + interactions (sérotoninergiques, sédatifs), halal, dos.
- Consigne : réponse directe puis « Pour toi » chiffré, forme/dose/moment/preuve/prix, ce qui est inutile, web_search pour marques/prix en Belgique, « à demander au pharmacien » si risque.

## 11/11/2026 — Revue complète de la semaine 04→11/11 (276 messages relus)
- Liberté : « je rajoute un demi », « je reprends un demi », « rajoute 1 demi » = prise EN PLUS lue par le code.
- Argent : « aucun / rien gagné aujourd'hui » → réponse directe (05/11 : « ⚠️ Je n'ai pas exécuté cette action »).
- Vidéo studio : vidéo compressée avant envoi (06/11 : 1re pub perdue « object exceeded the maximum allowed size » → 5 relances, ≈ 9 $ Kling).
- Cerveau : numéro WhatsApp FIK +32 466 31 14 69 connu (06/11 : « je ne connais pas ton numéro »).
- Grand Coach futur : bénéfice recalculé (client − propriétaire) × jours au lieu de la colonne `profit` (0 sur Djillali, réel 121 €).
- FORME : plus la même séance 2 jours de suite autour du samedi (13 et 14/11 = DOS & BICEPS) ; bilan de séance avec le nom de la séance demandée (10/11 « PECTORAUX & ABDOS » titré « PECTORAUX & TRICEPS »).
- Déjà corrigés pendant la semaine (vérifiés sur le code) : « dispo à 6:30 », eau + demis dans le même message, « je viens de prendre 2 demi », « +200 euro en cas> », séance fantôme dans le brief, SOS envie du 10/11, « je prie » = pris.

## 11/11/2026 — Fix « cette semaine je travaille pas » = routine en pause
- Bug : le cerveau a utilisé `morning_routine pause` jusqu'au 17/11 → plus de réveil ni de séance (même celle déplacée à jeudi).
- Nouvelle action `morning_routine no_work` (from/until/days) : congé jour par jour (`kouider:dayoff:*`), travail retiré de l'agenda, sport gardé (plans du jour déjà déplacés respectés). `pause` avec raison travail/congé → redirigé vers no_work.
- Données corrigées : pause levée, congé 11→15/11, séances gardées (jeudi 12, vendredi 13, samedi 14).

## 11/11/2026 — Voix CarPlay : ciblée / coupée / toujours
- `car-voice-mode.ts` : kv `car:voice:mode` = `cible` (défaut) | `off` | `toujours`. Ciblé = parle seulement au départ maison → salle (heure de départ routine ±40 min) et en quittant le travail ; sinon son muet (WAV 0,3 s, le raccourci iPhone ne plante pas).
- Arrivée (carplay_off) muette si coupé ou si le départ n'a pas parlé ; vocal préparé (car-prep) sauté pour les trajets muets.
- Commandes directes Telegram/app : « coupe le CarPlay », « réactive le CarPlay », « CarPlay à chaque démarrage ».

## 2026-11-11 (4) — Revue de tout depuis dimanche
- Moins d'appels (Kouider « oui ») : actus de la veille, opportunités, idée du mentor et récap du jour = MESSAGE seulement (18 appels 08-10/11, 11 refusés). Appels gardés : réveil, sport, RDV clients, urgences ; appel manqué → message (déjà le cas).
- Fichier (PDF…) gardé pendant « ne pas déranger » : lien valable 26 h au lieu de 30 min (08/11 23h30 : 404, jamais reçu).
- Liberté : le doublon « Déjà noté » ne lui montre plus la consigne interne du cerveau (« rappelle liberte prise avec nouvelle:true ») → « Si c'est une prise EN PLUS, écris « j'en ai repris N demis en plus » » ; « repris / en plus / nouvelle prise » = vraie prise en plus.
- « je prie 5 demis » (faute pour « pris ») corrigé avant tout cerveau : plus de « qu'Allah accepte ta prière » (10/11 05h50).
- Relance de réveil : plus de « tu pars à 05 h 30 » à 06h10 → « ton départ était à 05 h 30, pars dès que tu peux ou dis « pas de sport aujourd'hui » » ; plus d'appel de réveil une fois la séance finie.
- Vérifié, déjà réglé : SOS envie direct (17h49 du 10/11), séance à 8h/6h + location, lundi sans appel, faux RDV Agence FIK, séance déplacée jeudi 12/11.

## 2026-11-11 (3) — Vitalité : analyse de la prise de sang
- Kouider : « si je lui envoie ma prise de sang il doit pouvoir l'examiner et modifier ce qu'il doit modifier ».
- `vitalite action analyse_labo` + détection directe (légende « prise de sang » ou PDF texte avec ≥ 3 analyses) : toutes les valeurs lues avec les normes IMPRIMÉES par le labo, rangées dans app_kv (`kouider:vitalite:labs`, jamais dans le dépôt), plusieurs photos = même bilan complété page par page.
- Plan recalculé : testostérone basse (refaire + médecin), hormones hors norme, vitamine D / fer bas, cholestérol, sucre → nouveaux leviers ; plus de relance « fais ta prise de sang ».
- tgcall : PDF scanné → jusqu'à 6 pages envoyées (avant : la 1re seulement).

## 2026-11-11 (2) — Agenda : « ajoute n'importe quoi »
- Kouider : « je dois pouvoir lui demander tout et n'importe quoi : la date de sortie de GTA 6, l'anniversaire d'un client… ».
- Commande directe `agendaAnything` (fr-commands) : date dite → ajout ; anniversaire d'un client → date de naissance de sa pièce scannée (client_documents), chaque année ; sinon recherche internet + date officielle la plus récente, ajout seulement si le jour exact est sûr (source dans la note).
- `create_agenda_event` : tout type d'événement + `repeat` yearly/monthly/weekly ; journée entière = fin le lendemain.

## 2026-11-11 — Bugs de la conversation du 10/11
- Gardien de nuit dès 22h30 (B065) · plus de faux RDV « Agence FIK » (B066) · `sport_coach move_day` + commande directe, un seul jour changé (B067) · écriture d'agenda ratée jamais confirmée (B067) · SOS envie élargi (B068).

## 2026-11-10 (8) — Mode présent : 2 h d'écran par jour + blocage si limite dépassée
- Kouider : « au moins 2 h de temps d'écran » → les applis s'ouvrent tant que les 2 h du jour ne sont pas utilisées (compteur entre les événements `app_open` et `app_close`), blocage ensuite. Réglable (`budget`).
- Sa règle : limite du jour de son programme privé dépassée → applis bloquées partout jusqu'au lendemain, sans pause ni raison, avec un message d'encouragement discret (rien de privé dans la notification).

## 2026-11-10 (7) — Mode présent : déblocage avec une bonne raison
- Kouider : toilettes, famille qui dort, quelque chose d'important à montrer → il a le droit de débloquer, mais avec un rappel à chaque fois.
- `focusTool` action `raison` : 10 min (jusqu'à la fin de la plage si la famille dort), ne compte pas dans les 3 pauses, rappel « si tu mens… », raisons du jour listées dans le statut. Commande directe dans `fr-commands.ts`.

## 2026-11-10 (6) — Mode présent : moins de téléphone en famille
- Demande de Kouider : être obligé de lâcher le téléphone quand il est à la maison avec sa femme et son fils.
- `family-focus.ts` : actif à la maison + hors travail (congé ou soirée libre), 9h–22h30. Une automatisation iPhone « à l'ouverture de l'app » appelle `POST /api/jarvis/event {type:'app_open', app}` ; `block:true` → le raccourci renvoie à l'écran d'accueil.
- Soupapes : 3 pauses de 10 min par jour (refus ensuite), « je suis seul » = 3 h. Outil `mode_present` + commandes directes (« mode présent », « pause », « mode présent ? »).
- Limite : Dzaryx ne sait pas si sa femme est dans la pièce ; la règle est « maison + temps libre ».
- Programme privé : nouveau plan de paliers enregistré via l'API (données en base seulement).

## 2026-11-10 (5) — FORME : scan de machine 50 s → 6 s
- Kouider : « quand je prends une machine en photo ça marche pas ». Journaux Railway : les scans réussissaient mais en 35-50 s (`POST /machine 200 +50225ms`) — la consigne longue (liste des exercices) déclenchait la réflexion « medium » du cerveau gratuit.
- `anthropic-compat.ts` : option `FAST` (en-tête `x-dz-fast`) → pas de réflexion longue ; `vision(..., { fast: true })` utilisé par `scanMachine`. Test : 6,5 s, bonne machine.
- Séance du 23/10 (développé incliné 17,5 kg, faux) corrigée à 8 kg à sa demande.

## 2026-11-10 (4) — FORME : corriger un ancien poids mal noté
- Kouider en séance : « 30 kg » affiché en PRÉCÉDENT au développé incliné haltères (noté le 09/11), jamais fait. Il doit pouvoir le changer lui-même.
- App v260 : toucher la colonne PRÉCÉDENT → écrire le vrai poids. Si un poids plus lourd reste noté un autre jour, l'app demande s'il est faux aussi. La charge conseillée et le record suivent.
- Backend : `POST /api/forme/fix-prev` (`fixSportKg` dans `sport-coach.ts`, `fixExKg` dans `forme.ts`).
- Donnée du 09/11 corrigée à 8 kg (dit par Kouider).

## 2026-11-10 (3) — Trois petites protections
- **Espace Google** : nouvel auto-test `Espace Google` (`googleStorage()` dans `db-backup.ts`) — alerte dès 90 % (un rappel par semaine), tous les matins à 98 % et plus. La ligne « Sauvegarde Google Drive » dit la vraie cause quand le compte est plein.
- **Prédictions** : `guardPredictions()` retire tout prix absent des vraies données (tarifs `resale_price`, impayés) et ramène Facebook / Instagram / statut WhatsApp à TikTok. Les vrais tarifs sont maintenant donnés au cerveau.
- **Délai de réponse** : `replyDelayYesterday()` — ligne « ⚡ Mes réponses hier » dans le briefing de 7h30 + auto-test `Délai de réponse hier` (alerte si médiane > 40 s ou plus de 20 % de réponses différées).

## 2026-11-10 (2) — Contrôle général de fin de session
- Prédiction du briefing régénérée (l'ancien texte « sept impayés » restait en mémoire jusqu'au lundi suivant).
- Sauvegarde Google Drive arrêtée depuis le 05/11 : compte Google plein (16,15 Go / 16,11). `db-backup.ts` dit maintenant clairement quoi faire ; la copie VPS tourne chaque nuit.
- Banc : phase 1 = 192/197 (5 faux positifs : date figée + cerveau en arrière-plan), outils 23/25 (jour offert réel du 07/11), finances 11/11.
- Usage réel 04-10/11 : 127 réponses, 1 saturation, 1 erreur.

## 2026-11-10 — Réponses plus rapides : le contexte de Kouider se charge en parallèle
- Mesure (conversations 01-09/11) : délai médian d'une réponse 17 s, 90 % à 62 s.
- `kouider-dossier.ts` : les 11 modules (forme, finances, coach…) se lisaient l'un après l'autre → `Promise.all`.
- `forme.ts` (`formeText`) : nourriture/objectifs/course/profil femme en parallèle.
- `forme-cut.ts` (`cutStatus`) : les 14 jours de calories lus en parallèle (c'était 2 s à lui seul).
- Résultat banc : dossier 8,6 s → 0,8 s (à chaud), 2,2 s à froid.
- Suite : `cutStatus` (profil, jours, séances lues 2×, exercices, santé, début de sèche) et `goalsText`/`pace` en parallèle, sortie vérifiée identique à l'ancienne version → dossier 0,8 s → 0,4 s.
- `agentic-fallback.ts` : la liste des modèles gratuits à quota épuisé est gardée dans app_kv (`brain:quota_until`) et relue au démarrage. Avant, chaque redéploiement Railway l'effaçait et les messages suivants refaisaient le tour de tous les Gemini épuisés avant de répondre.

## 2026-11-09 nuit (7) — Appels Telegram : Dzaryx apprend de tes refus, ne raccroche plus en pleine phrase
- Constat (journaux tgcall 07-09/11) : 14 appels sortants, 10 refusés ou non décrochés, 2 muets.
- `auto-call.ts` : apprentissage des refus par type d'appel (`callCategory`, app_kv `autocall:stats`). 3 refus de suite → ce type est ÉCRIT sur Telegram au lieu de sonner (prévenu une fois) ; un appel décroché remet à zéro ; retente 1 appel après 21 jours. Jamais coupés : vital, urgent, paiements, retards, impayés, client en difficulté, vols, papiers, rappels demandés. Signaux : `/api/call/missed` (refus) et `/api/call/health-event ok` (décroché).
- Phrases faites par le code : « tu peux m'appeler pour tout » (remise à zéro), « pourquoi tu m'appelles plus ? » (ce qu'il a appris).
- `tgcall/dzaryx_tg.py` mute_guard : à 12 s sans son du téléphone, Dzaryx finit d'abord son message (40 s max) et revérifie le son avant de raccrocher. ⚠️ Actif seulement après `pm2 restart dzaryx-tg`.

## 2026-11-09 nuit (6) — Plancher 75 kg tenu par le code, faux impayés, mois du widget
- `forme.ts` formeTool profile : `targetKg` sous le plancher (app_kv `kouider:forme:floor_kg`, défaut 75) → refus + consigne au cerveau ; passe seulement avec `floor_change_confirmed: true`. Au banc le cerveau avait accepté « objectif 72 kg » malgré la règle écrite.
- `predictions.ts` : impayé = reste > 0 ET paiement ≠ payé (la colonne `amount_remaining` reste périmée sur des locations payées → « sept impayés » inventés dans le briefing).
- `jarvis-hub.ts` commandCenter : CA / bénéfice du mois = `getFinancialReport` (prorata) → widget et centre de commande n'affichent plus 0 €.
- Test de conversation au banc (12 questions, sans Gemini) : 10 « cerveaux saturés » la nuit — normal sans Gemini, réservé aux vrais messages de Kouider ; en réel 1 seule saturation sur 6 jours.

## 2026-11-09 nuit (5) — App principale : chiffres qui disaient faux (app v259)
- Balayage en lecture seule des 30 pages de l'app : aucune erreur serveur ni JS ; 4 incohérences de chiffres corrigées.
- PARC (`FleetScreen.tsx`) : une voiture en location aujourd'hui n'est plus « disponible » (badge « En location → date · client », compteurs). Avant : 15/15 disponibles avec la Fiat 500 X louée.
- LOCATIONS (`BookingsScreen.tsx`) : « En cours » comptait 0 (statuts en majuscules) ; une demande refusée / annulée n'est plus affichée « À payer ».
- CA (`finance.ts` getFinancialReport, `revenue-intelligence.ts`) : totaux au prorata des jours dans la période, comme l'outil de Dzaryx — la location 29/10 → 10/11 (440 €) était comptée en entier en octobre ET en novembre. Maintenant 110 € + 330 €.
- OPPORTUNITÉS (`opportunities.ts`) : le taux du square du jour (mesuré, même source que l'or) est imposé au rédacteur de la veille.

## 2026-11-09 nuit (4) — Plancher de poids : 75 kg = minimum ET cible
- `forme-cut.ts` : le poids visé de Kouider est un plancher. À moins de 1,5 kg : décision « déficit 250 ». À 75 kg (pesée ou tendance) : déficit coupé d'office (maintien), message unique sur Telegram, décision « on construit : abdos, bras, pecs ». Sous 74,5 : +200 kcal.
- `formeSnapshot` : règle de poids ajoutée à l'état physique lu par tous les cerveaux (jamais conseiller de descendre sous 75).
- `forme-report.ts` : bilan d'une période en cours sans comparaison injuste (déjà poussé en 54c33d46).

## 2026-11-09 nuit (3) — Dzaryx autonome sans Claude Code + bilans comparés (app v258)
- `self-test.ts` : `remedy()` — chaque problème de l'auto-test est suivi de ce que Kouider peut faire lui-même (phrase à dire à Dzaryx, site à ouvrir, redémarrage du VPS). Plus aucun message « demande à Claude Code » (`connections-watch.ts`, `tgcall-watch.ts`, `cloudpc-relay.ts`).
- Bilans semaine / mois : carte « face à la période d'avant » (`Versus` dans `Bilans.tsx`, `prev` renvoyé par `/api/forme/report`) ; la semaine est toujours tracée du lundi au dimanche.

## 2026-11-09 nuit (2) — Sommeil jamais vide, bonnes photos d'exercices (app v257)
- `sleep-phone.ts` : réveil sans « bonne nuit » la veille → coucher estimé (`estimateBed` : heure habituelle `min_bed`, ou dernier vrai message de la soirée s'il est plus tard), nuit notée et annoncée, corrigeable par « couché à 23h30 ». Avant : nuit vide (5 jours sur 9 début novembre).
- `sport-coach.ts` : `sameMove()` — un exercice sur mesure ne prend plus l'identifiant, la photo ni l'historique d'un exercice de base au matériel / mouvement différent (« Développé couché (barre) » → haltères). `demoFor()` à l'affichage pour les séances déjà enregistrées.
- `exercise-lib.ts` : table `KNOWN` (≈ 70 exercices courants) reconnue par le code avant toute IA.
- Lecteur de séance : le chrono d'échauffement suit la durée écrite dans la séance (8 min), texte sur 2 lignes.

## 2026-11-09 nuit — FORME : graphiques partout + chiffres cohérents ; atelier de nuit qui survit à la fin de l'abonnement (app v256)
- **Graphiques dans l'app** (`simulator/src/forme/Charts.tsx`, `Bilans.tsx`) : bilans Jour / Semaine / Mois avec radar des 6 notes, note jour par jour, barres pas / sommeil / volume / calories / mangé-brûlé / protéines / eau (objectif + jours réussis), courbes VFC / cœur / poids, séries par muscle. Serveur : `reportSeries()` dans `forme-report.ts`, renvoyé par `/api/forme/report` (`days`).
- **`LineChart` refait** (`ui.tsx`) : tactile (doigt = valeur + date), moyenne, Dernier / Moyenne / Mini / Maxi, prévision en pointillés jusqu'à l'objectif (Progrès + Sèche). Bug corrigé : toutes les courbes partageaient le dégradé de la première (id SVG en double).
- **Un seul rythme de poids** : `weightPace()` (`forme-cut.ts`, tendance lissée) utilisé aussi par `formeOverview` — Progrès disait 2 kg/sem et arrivée le 16/11, Sèche 1,17 kg/sem et le 21/11.
- **Faux pourcentages** : `sport-review.ts` ne compare plus le volume à une séance notée à moitié (« +439 % ») ; `forme-cut.ts` n'affiche plus un 1RM à +71 % en 2 semaines ; `forme-goals.ts` arrête la projection à l'objectif (« prévu 61,8 kg pour 75 visés »).
- **Atelier de nuit** (`scripts/night-dev.mjs`, `self-dev.ts`) : sans abonnement Claude Code il se met en pause (`dev:atelier_off`), prévient une fois, garde la file, re-teste 1×/jour et reprend seul. `se_coder` dit la vérité au lieu de promettre « je le code cette nuit ».

## 2026-11-09 soir (4) — Retour à l'heure habituelle complet, locations sans effet sur la séance (B064)
- `computeDayMove` : au retour à une heure plus tôt, la douche revient à son heure habituelle (id d'occurrence) ; la durée d'origine est gardée dans `kouider:sport:timemove_full` et rendue à la séance.
- Une location « 🚗 Client — Voiture » n'est plus ni un conflit ni une limite pour la séance ; les trajets 🚗 comptent toujours.

## 2026-11-09 soir (3) — Congés qui ne s'effacent plus, séance d'un jour précis (B063)
- `kouider_dossier` days_off : `days` = jours à ajouter, `remove_days` = jours à retirer ; une liste vide ne change rien. Le dimanche dès 18h avait été effacé en reparlant du lundi (remis en base : [0,1,4]).
- `parseSportMove` : « vendredi sport à 8h », « mets ma séance de mercredi à 7h » faits par le code (`weekday` dans `moveSportTime`, prochain jour de ce nom). Habitude (« chaque vendredi »), plusieurs jours ou autre sujet (« après la salle », rdv) restent au cerveau.

## 2026-11-09 soir (2) — Changer l'heure de la séance pour la semaine
- `sport_coach` move_time + phrase directe (`parseSportMove`) : « cette semaine ma séance à 8h », « demain ma séance à 7h ». Séance, trajet, retour, douche déplacés dans l'agenda ; réveil et départ suivent (`kouider:sport:timemove`, `effectiveDay`). RDV ou Agence FIK derrière : séance raccourcie ou jour refusé, dit dans la réponse.

## 2026-11-09 soir — Lundi sans appel, séances combinées (B062)
- `calls:never_days` (défaut lundi) : `callOwner` garde tout sauf ce qu'il demande et le vital (accident/panne/police client, son vol). « le lundi tu m'appelles jamais » / « tu peux m'appeler le lundi » traités par le code.
- `autoCall` sans niveau = non urgent ; actu du mentor jamais urgente ; préparation de RDV sans appel les jours de repos.
- `sport_coach` swap/plan_day : « Pectoraux & Abdos », « Abdos »… séance composée pour ce jour.
- `phantomGuard` : dernier outil en échec + « C'est fait » → l'échec est dit.

## 2026-11-09 — WhatsApp : fin des réponses en boucle aux clients connus (B061)
- `onWaNew` : si notre réponse est la dernière de la discussion et que le dernier message client est déjà traité (`wa:lastin:<chat>`), on s'arrête. Un vrai nouveau message ou un appel manqué passe toujours.
- Gardien de nuit : seulement les numéros non enregistrés sans vraie réponse de Kouider ; une seule présentation (`assistant IA` déjà dans la discussion = plus de présentation).
- Clients connus : message + réponse proposée sur Telegram, même pendant le bouclier famille (`ne me dérange pas` les retient toujours).
- Bouclier famille (règle de Kouider 09/11) : levé dès qu'il ne travaille pas (9h-22h, maison ou dehors), coupé à la salle et au travail, relevé au retour. Silence Telegram/appels seulement le soir à la maison. Fin à 22h30 Bruxelles (partait à 23h30, heure UTC de Railway).

## 2026-11-08 matin (3) — Récap argent en PDF, retraits avec motif, Conscience
- Conscience : les tours d'appel (reformulations de la voix) ne servent plus ni à l'humeur ni à ses messages ; elle ne répond jamais à une demande à la place de la conversation.
- `parseCashOut` : « -X pour une commande », « moins X pour les courses », « j'ai pris X du cash pour… » → journal (commande/dépense par catégorie) + caisse.
- `perso:cash_log` : livre de caisse, chaque mouvement avec le solde après. Doublon de vente = même phrase rejouée en 2 min (deux ventes égales dans la journée sont comptées).
- `argent-recap.ts` : PDF sans IA (courbe du cash, entrées/sorties, meilleurs jours, calendrier, sources, sorties, cash libre, marge, rythme). « récap de mon argent » + mes_finances 'recap' + envoi le dernier jour du mois (21h30) avec photo du capital.

## 2026-11-08 matin (2) — Fortune : cash compté deux fois
- `fortune` ignorait que son cash a déjà une source (perso:finances.sideCash) : de vieilles lignes « Caisse… » s'ajoutaient. Ces lignes sont ignorées et un `set` de caisse met à jour la vraie caisse.
- L'outil annonce deux chiffres nommés : argent disponible (épargne + cash) et fortune nette (après crédits). « Combien j'ai / au total / mon cash » → mes_finances.
- Appels : le cerveau reçoit aussi ses mots exacts, en plus de la reformulation de la voix.
- Après un silence perso : sa demande d'abord, les nouvelles ensuite.

## 2026-11-08 matin — Appels : argent mal compris ; FORME : calories du matin
- Appels : la voix temps réel reformulait ses demandes (« Fournis le montant total des gains… ») et donnait ses gains du mois pour son cash. `heard` : ses vrais mots passent d'abord au code argent (lecture seule) ; consignes ARGENT → toujours ask_dzaryx avec ses mots exacts.
- Gemini Live : transcription forcée en français (`languageCodes: ['fr-FR']`, acceptée par 3.8-live, 3.1-flash-live et 2.5 native-audio) + règle « faux portugais/italien qui sonne français = lui ».
- argent-direct : « au total en cash » = la caisse, « tout confondu » sans « ? » = question, « c'est quoi mon cash » / « quel est mon cash » gérés par le code. « +35 en cash » sans « aujourd'hui » compte aussi comme vente du jour (des ventes manquaient au compteur du mois).
- mes_finances : cash actuel et total (épargne + cash) écrits clairement, distincts des gains du mois.
- FORME : dès que la montre a envoyé (`active_at`), l'activité part de SA valeur et n'estime que le temps écoulé depuis. Texte du déficit : la base = ce que le corps brûle seul depuis minuit, même en dormant (d'où un chiffre déjà élevé au réveil, c'est normal).

## 2026-11-08 nuit — Veille hebdo : garde-fou anti-fuite (repo public)
- `scripts/git-hooks/secret-guard.mjs` : bloque des lignes ajoutées contenant une vraie valeur des .env (comparaison exacte, jamais affichée, ignorée si déjà dans le repo), un nom PRIVATE_MED_TERMS, une forme de clé connue (Anthropic, OpenAI, GitHub, Google, HF, Replicate, Slack, AWS, JWT, bot Telegram, clé privée) ou un fichier .env/credentials/session. `--test` (auto-test), `--range A..B` (audit). Faux positif : `secret-guard:ok` sur la ligne.
- Atelier de nuit (night-dev.mjs) : contrôle les commits de chaque chantier avec le garde-fou ; fuite → chantier marqué ÉCHEC + alerte dans le rapport (sans recopier la valeur). Le prompt demande le contrôle avant chaque push.
- `scripts/git-hooks/pre-commit` fourni mais PAS activé (installation refusée en mode auto) : `git config core.hooksPath scripts/git-hooks` pour l'activer.
- Audit de tout l'historique : jeton NETLIFY_TOKEN encore ACTIF (API 200, utilisé par FIK Sites) publié depuis mai 2026 dans DZARYX/05_SIMULATEUR_WEB.md et 11_JOURNAL.md → masqué dans les fichiers actuels, MAIS il reste dans l'historique git : à changer par Kouider (nouveau jeton Netlify → Railway + .env, puis supprimer l'ancien).
- Inspiration : Hermes Agent v0.21 (validation avant écriture des fichiers protégés), Claude Agent SDK hooks `onFailure: "block"`.

## 2026-11-07 soir — Faux « c'est noté » sur une résa
- CAUSE des erreurs de la journée : clé Gemini gratuite limitée à 20 requêtes/jour/modèle (GenerateRequestsPerDayPerProjectPerModel-FreeTier = 20), épuisée dès 6h → Haiku secours (6/6 à 19h52) puis Nemotron/petits cerveaux. Solution : plus de clés Gemini (nouveaux projets Google) dans GEMINI_API_KEYS.
- Gros Gemini RÉSERVÉ aux messages de Kouider : les tâches du planificateur (Conscience, coach, mentor…) passent par Nemotron/autres gratuits puis Gemini lite, gros Gemini en dernier (bg-context.ts ; brain-retry garde le gros cerveau).
- Radar : même radar saisi 2-3 fois dans OSM à quelques mètres → 1 seule alerte (radar annoncé < 10 min à < 300 m couvre ses doublons). Matin 07/11 : 6 « 📸 Radar » en 5 min.
- « Ne pas déranger » après appel manqué : la consigne « tu étais en ne pas déranger » n'est plus recollée à chaque message (3× à 19h52) ni le délai relancé.
- « +200 euro en cas> aujourd'hui » : faute sur cash (cas/cach/kash…) comprise par le code → caisse + vente du jour (avant : fortune répondue, rien noté). « en cas de » intact.
- Djillali : « ramène quand ? » → « le 9 » alors que Kouider avait donné le 10 à 6h (jour offert) : le cerveau avait dit « noté » sans update_booking. phantomGuard bloque maintenant « noté / location prolongée / jour offert noté » sur une résa sans écriture réelle → relance avec le vrai outil.

## 07/11/2026 soir — places Claude gardées pour les questions importantes
- Gros Gemini épuisés : les 6 places Claude Haiku/jour ne sont plus prises par les messages banals (« je pars », « ok », retours de « ne pas déranger », contexte [..] retiré avant le tri) → `importantAsk()` (agentic-fallback.ts).
- Question importante + plus de place Claude → plus de réponse devinée par un petit cerveau : question gardée (`keepImportant`, brain-retry.ts), rejouée seulement quand un gros Gemini revient (18 h max), réponse sur Telegram.
- 2 nouvelles clés Gemini (nouveaux projets) ajoutées à GEMINI_API_KEYS sur Railway (5 clés au total).

## 2026-11-07 — Bugs du jour + protections anti-arnaque
- Coach salle « fantôme » à 12h55 au travail : une séance finie n'est plus relancée par la montre/GPS le même jour ; note séance > 3 h ignorée.
- Djillali (client en cours) appelé 2× comme « nouvelle demande de location » : l'appel location seulement pour une discussion jamais répondue.
- Heures WhatsApp en UTC (« 14h04 » au lieu de 15h05) → remises à l'heure de Bruxelles.
- Papiers : même n° de permis/passeport envoyé par un autre numéro → « ⚠️ ARNAQUE POSSIBLE » ; scan < 35 ans → numéro marqué refusé.
- Messages WhatsApp : 🚩 signaux (quelqu'un d'autre récupère, sans caution, payer après, capture de virement, sortie du territoire, location très longue, problème de permis) → alerte, jamais d'envoi auto.
- Contrat : clause 8 CONDUCTEUR UNIQUE (35 ans, présent avec ses originaux, prêt du volant interdit).

## 2026-11-07 — Anti-contournement de l'âge
- Client refusé (< 35) mémorisé 180 j par numéro (wa:refused:<9 derniers chiffres>). S'il revient avec un autre âge, une date de naissance, « mon père / au nom de… » ou des papiers → refus maintenu proposé + alerte « ⚠️ RISQUE D'ARNAQUE » sur Telegram, rien d'auto.
- Papiers reçus d'un numéro refusé → avertissement dans le message « Papiers reçus ».
- create_booking bloqué sur un numéro refusé, sauf refus_age_leve:true après accord explicite de Kouider.

## 2026-11-07 — WhatsApp : âge < 35 refusé, 1er message auto aux nouveaux clients, plus de doublon
- clientAge() lit l'âge du client (« j'ai 24 ans », pas les années de permis) : < 35 → réponse forcée = refus poli, jamais de liste de voitures.
- Nouveau client (numéro non enregistré, FIK n'a jamais répondu) qui demande une location / dit bonjour / appel WhatsApp manqué → Dzaryx envoie SEUL le 1er message (dates et/ou âge manquants, ou refus si < 35), Kouider prévenu sur Telegram.
- Récap « Pendant ton silence » : une discussion WhatsApp déjà lue avec Kouider depuis n'est plus renvoyée avec un vieux brouillon (wa:handled:<chat>).

## 2026-11-07 — Bugs d'appel (suite)
- Mémoire des appels jamais enregistrée : domaine 'note' refusé par chk_facts_domain → rangé en 'general' ; vraie erreur Supabase loguée.
- En appel, « vérifie WhatsApp » = un seul unread (plus d'ouverture des discussions/photos une par une).
- Début d'appel : un « allô » ou un bruit ne coupe plus la phrase d'accueil (coupure seulement sur une vraie phrase).

## 2026-11-07 — Jour offert payé au proprio par Kouider + appels plus solides
- Jour offert : le proprio est payé par Kouider → coût proprio sur tous les jours, déduit du bénéfice (offeredDays() dans finance.ts + phase5). Djillali : 348 € proprio, bénéfice 92 €.
- update_booking trouvé par nom ne renomme plus le client.
- Appel : ask_dzaryx > 60 s → « je t'envoie sur Telegram », la recherche continue et part sur Telegram (avant : coupée à 90 s, perdue).
- Appel : jamais de réponse en espagnol/chinois (gens autour de lui) ; transcriptions ¿¡/CJK ignorées.

## 2026-11-07 — Jour offert sur une résa + nom client tolérant
- update_booking : free_days (jours offerts, prix total inchangé via nb_days facturés) + return_time (heure de retour notée). Ex. Djillali 9→10/11 offert.
- list_bookings / résa par nom : « Djilali » retrouve « Djillali » (lettres doublées ignorées).
- Vérifié : lien d'avis Google auto sur WhatsApp à 10h30 le lendemain du retour (client-care.ts).

## 2026-11-07 ~13h — 4 bugs signalés par Kouider (B054)
- Brief : « travail jusqu'à 21h » → le brief reçoit la vraie fin du travail (kv kouider:work_end, 20:00) ; one-shot `routine:fix:famille-20h` recale dans l'agenda FIK les séries « temps famille » qui commencent après 20h (et « travail » qui finit après) sur mar/mer/ven/sam (résultat dans kv routine:fix:famille-20h:result).
- « Bien arrivé au travail (12:52) » 1 h après l'arrivée : Telegram n'a envoyé aucune position de 11:30 à 12:47. Vu au travail > 30 min après l'heure du travail (« 12:00 travail ») = arrivée non annoncée.
- Rappel dos « debout depuis 2 h » trop tôt : la maison est à ~430 m du travail, un saut GPS à la maison (09:45) passait sous le rayon de 400 m. Maintenant basé sur l'arrivée vue par l'assistant GPS (presence.workPresence).
- Démarchage : relance vers une adresse déjà rejetée (les rejets arrivent dans la boîte Zoho, que Dzaryx ne lit pas). Contrôle MX avant chaque 1er mail et chaque relance (mailDomainDead / dropIfDeadMail) ; 3 prospects morts passés en stop (Sorfert, La Table Fleurie, Zenata Voyages).

## 2026-11-07 ~10h — 11 options sport autour du bilan (app v254)
- Bilan vocal de la séance (voix du coach Gemini, gratuit, pas pendant le travail).
- Bilan : sommeil de la nuit + protéines de la veille ; liens « après 7 h de sommeil tes séances valent X/10 contre Y » dès 2+2 bilans.
- Repos réel mesuré par l'app (heure de chaque série validée − 30 s) → repos moyen vs prévu, exercices trop lents.
- Défi du jour : un exercice déjà fait (choisi selon la date), bandeau dans la séance, réussi / raté dans le bilan.
- Ce mois vs meilleur mois (volume) ; prévision « X à N kg vers le JJ/MM » (tendance 6 semaines, 3 points min).
- Note /10 de la semaine (moyenne des bilans) dans le bilan sport du dimanche.
- Séance : 💧 rappel « bois » toutes les 20 min ; carte échauffement général 5 min chronométré avant la 1re série.
- Carte bilan : bouton 📤 partager (image avec la note /10 et les records).
- Déjà existants (non refaits) : charge conseillée, courbe de force dans la fiche, séance ratée replacée, séries d'échauffement, rappel photo.

## 2026-11-07 ~09h — bilan de séance complet (notes /10, avis, graphique) (app v253)
- Fin de séance dans FORME → bilan calculé par le code (sport-review.ts) : volume, séries, records, comparaison avec la dernière séance du même type, notes /10 (progression, volume, intensité, régularité, densité) ; le cerveau gratuit écrit seulement l'avis + conseils à partir de ces chiffres.
- Envoyé sur Telegram (texte + graphique QuickChart) et visible dans FORME › Entraînement (« Bilan de ta dernière séance », détail + barres vs la dernière fois). GET /api/sport/review.
- L'app envoie les noms des exercices (plus de « Face pull poulie » pour 3 exercices différents : recherche exacte par id). Densité comparée seulement si les deux séances durent ≥ 25 min.
- Plus de 2e bilan au départ de la salle si le bilan est déjà fait.

## 2026-11-07 ~08h — radars : vitesse juste (ou rien)
- « La vitesse à l'approche d'un radar n'est pas correcte » : elle était calculée en ligne droite entre 2 positions Telegram, avec l'heure d'ARRIVÉE au serveur (positions groupées / en retard, jusqu'à 6 min d'écart).
- tgcall envoie l'heure réelle (edit_date) + précision ; positions > 60 m de précision ignorées, positions en retard ignorées ; vitesse affichée seulement si segments de 3-60 s, médiane des 3 dernières (90 s), arrondie à 5 ; sinon le message ne donne pas de vitesse. « Ralentis » si > limite + 3.

## 2026-11-07 ~07h40 — « au travail AUCUNE pause » appliqué partout
- 07/11 il a de nouveau reçu « 🏢 Bien arrivé au travail. Ta mission pour la pause » (grand-coach-plus onGps) : la règle du 05-06/11 n'était que dans le cerveau principal + foresight.
- Arrivée au travail → mission pour la SORTIE du travail. Point de midi 12h30 et rappel 16h : au travail (atWorkNow = pas congé et avant work_end) → « dès que tu sors ». Geste pour sa femme : plus « à midi ».
- FORME repas : collation 10h, « tu as mangé à midi ? » 13h45 et goûter 16h coupés pendant le travail.
- ai-util : WORK_FACT ajouté au system de tout texte généré qui parle de Kouider. Récap ne-pas-déranger : « Pendant ton silence » (plus « ta pause »).

## 2026-11-07 ~07h20 — séance : l'app mène, plus le chrono (app v252)
- Bug vu 07/11 7h10 : « 🏁 Muscu terminée au chrono » alors qu'il restait 3 exercices (ajoutés par lui) + notifs « exercice suivant » pendant qu'il était encore sur un exercice.
- L'app FORME envoie sa progression (POST /api/sport/live-app : exercice actuel, ce qui reste, séries) à chaque changement + toutes les 8 min. Tant qu'elle est fraîche (60 min) : gym-live ne fait plus d'enchaînement au chrono, ni « muscu terminée », la montre ne déclare plus la muscu finie ; « terminée » seulement sur Terminer → Enregistrer dans l'app (finished). Départ / appel « pars » et bilan au départ GPS gardés ; « il reste » du rappel départ = liste de l'app. liveNote dit au cerveau que l'app mène.

## 2026-11-07 ~07h — FORME : corriger un jour passé après coup (app v251)
- Calendrier › un jour (passé ou aujourd'hui) › « ✏️ Ajouter / corriger » : eau (± verre), sommeil, pas, poids, repas oublié (texte, compté sur CE jour), séance cochée / décochée.
- Enregistré partout : journée FORME + health:daily pour sommeil/pas (sleep_src 'manuel', la montre ne l'écrase plus), repas datés (logMealText date), journal sport (setSessionDone). Une vieille pesée ne remplace plus le poids actuel s'il existe une pesée plus récente. Nouveau kind 'water-set'.

## 2026-11-07 ~06h40 — FORME : machine scannée ajoutée à la séance + retirer un exercice (app v250)
- Pendant la séance : tuile 📷 à côté de ＋ → photo de la machine → coche les exercices → ajoutés à la séance (séries, kg, reps, note, enregistrés comme les autres).
- Écran Scanner hors séance : « Ajouter à ma séance en cours » si une séance est en cours.
- 🗑️ à côté de Remplacer : retire l'exercice de la séance (confirmation s'il a des séries validées). La liste modifiée est gardée sur le téléphone même sans série validée.

## 2026-11-07 — FORME : cocher / décocher les séances de la semaine (app v249)
- « Il note ma séance d'aujourd'hui comme faite alors qu'elle est pas faite » : arrivé à la salle (GPS) = « en cours » (cercle pointillé), faite seulement quand la séance est notée ou l'heure de fin passée.
- La bande de la semaine va de lundi à dimanche ; en touchant un jour passé ou aujourd'hui → case « faite / pas faite ». Décocher = journal, FORME et arrivée GPS effacés (gardés de côté pour recocher), séance remise dans la rotation, exercices affichés à nouveau ; ni le GPS ni la montre ne la recochent. POST /api/sport/done, setSessionDone/undoneDates (sport-coach.ts), calendrier/objectif FORME suivent.

## 2026-11-07 ~06h20 — FORME : vrai poids + séances de la montre (cff5e84a, app v248)
- « Ton objectif » disait 79,4 kg alors qu'il s'est pesé 78 le 06/11 : c'était la tendance lissée. Poids affiché / kg restants / date = dernière vraie pesée ; la tendance sert seulement à la vitesse.
- Séances vues par la montre (tapis, marche, musculation traditionnelle, renforcement…) : toutes gardées par jour (FormeDay.watch) et affichées dans le bilan du jour, de la semaine, le PDF (« Vu par ta montre ») et le détail du jour de l'app. Avant : seulement 2 noms dans une note, jamais lus par les bilans.

## 2026-11-06 ~23h — appel manqué ≠ réplique dans le chat (B058)
- Appel Dzaryx refusé / pas décroché / muet : son accueil n'apparaît plus comme une réplique dans l'historique (note « appel manqué » à la place) → plus de sujet d'appel qui surgit au milieu d'une tâche business.
- Plus de « Allô Kouider, c'est Dzaryx. Salut Kouider, c'est Dzaryx » : présentation dite une seule fois (appel, message d'appel manqué, boîte des appels).

## 2026-11-06 ~22h40 — soirée : bilans FORME, objectif, nuit, agenda, fautes SMS, contrôle de nuit
- Agenda (30e93172) : location en cours (ni remise ni retour ce jour-là) retirée des plans du jour — plus de « dossier Djillali » samedi.
- Sommeil (a688cdc6, 5792cb8a) : coucher minimum 23:00 sauf heure donnée ; « bonne nuit » = silence jusqu'au réveil ; « j'ai dit bonne nuit à Ibrahim » ignoré.
- Carte journée (a1ed3f5a) : nuit d'hier « la nuit, jusqu'à 05h49 », lieu actuel, lieu connu le plus proche.
- Fautes (f4471643) : correcteur SMS avant les commandes du code ; « +100€ en cash aujourd'hui » = vente ; caisse pas redemandée.
- FORME (eff6035d, f4ae7a92, d9947b45, app v246-v247) : bilans jour/semaine/mois + PDF graphiques, objectif (temps restant, quoi faire), adapter le programme, priorité muscle, muscles oubliés ajoutés, plateau.
- Contrôle de nuit (VPS cron, /root/dzaryx-bench/nightly.sh) : replay des vrais messages d'hier + liste au matin.

## 2026-11-06 ~21h30 — fautes comprises + pub pas payée 2 fois + auto-test
- Auto-test du matin (3a7f24d7) : mode gratuit voulu ≠ « Cerveau en panne » ; démarchage coupé ou muet > 50 h signalé (l'arrêt du 29/10 n'avait été vu par personne).
- Pub TikTok (74be896f) : si une pub est encore en fabrication (< 40 min), « crée moi la pub » ne relance pas un 2e rendu Kling payé (06/11 : 5 rendus ≈ 13 $). « fais une autre pub » / force:true = vraie nouvelle pub.
- Fautes (a0da1000) : « rapelle moi dan 2h » donnait DEMAIN 02:00 → fixWhenTypos (dan/demin/auj…) dans parseWhen ; « met moi un rappel … » reconnu ; « dapelé » → « appeler » ; Liberté « jé pris 2 demie » ; « ne me derenge pas ».
- Silence « ne me dérange pas jusqu'à demain 9h » programmé par le code (avant : cerveau « OK » sans outil).
- Coach : règle LIBERTÉ — jamais « t'as pris ton médicament ? » ni proposer d'en prendre (banc « j'ai mal au dos » le faisait).
- Agenda illisible : le cerveau doit commencer par « ⚠️ Je n'ai pas pu lire ton agenda » (banc : emploi du temps présenté comme lu).
- Banc : vrai réveil du jour masqué (sleep:phone:*), tests ajoutés (cash rien, pub en cours, fautes) → 160/160 ; replay fautes sur le vrai cerveau 12 phrases (2 faux positifs du juge).

## 2026-11-06 ~20h15 — CarPlay : vocal préparé testé en vrai + retour du travail reconnu
- 1er vrai test 20h06 : vocal préparé à 19h56 utilisé, son servi en 47 ms (avant : 31 s). Texte préparé en 88 s (quotas Gemini gratuits épuisés ce soir) → sans la préparation, ~2 min de silence.
- Bug : maison et travail à ~450 m → isHomeward testait « < 600 m de chez lui » AVANT « près du travail » → le retour du travail n'était jamais reconnu (discours normal au lieu du discours retour). Ordre corrigé : plus près du travail que de chez lui = retour.

## 2026-11-06 ~21h30 — démarchage relancé (5/jour : 3 conciergerie + 2 FIK Sites)
- Bug : le 29/10 (« je me repose, profite de ma famille ») le cerveau a mis la journée dure ET coupé le démarchage pour de bon → aucun mail du 30/10 au 06/11.
- Journée dure = pause du jour seulement : runDailyOutreach saute le jour (isHardDay) ; prospect_autopilot off pendant une journée dure ne coupe plus (sauf forever=true, « pour de bon »).
- Mode both : 2/5 sites, 3/5 conciergerie (Math.round(n*2/5)) ; réglage remis à enabled, per_day 5 (Kouider 06/11).

## 2026-11-06 ~21h — CarPlay : vocal préparé à l'avance (démarrage plus rapide)
- Mesure 06/11 11h42 : 31 s avant que Jarvis parle (texte 6,8 s + voix 24,7 s).
- Nouveau integrations/car-prep.ts + job car-prep (*/5, 4h-22h) : 5 à 12 min avant un départ habituel (routine : départ maison, fin de séance, début/fin du travail, + ses vrais démarrages répétés des 5 dernières semaines), texte + voix Jarvis fabriqués d'avance (max 6/jour).
- Au démarrage : même mode (retour/famille/normal) et même tranche d'heure → son joué tout de suite ; l'heure est dite arrondie (« un peu plus de 7 heures », choix de Kouider). Sinon chemin direct inchangé. Vacances / avec Houari = toujours direct.
- Point du trajet préparé : « le travail commence à 13 heures » (jamais « dans X min » ni marge, inconnus d'avance).
- Logs : [car-prep] et [car-timing] vocal PRÉPARÉ utilisé.

## 2026-11-06 ~19h30 — recherche internet faite par le CODE (questions du monde)
- Banc (Tavily autorisé, lecture seule) : la règle FAITS DU MONDE seule était suivie 1 fois sur 2 (banques belges → aucune recherche, grève → requête « novembre 2024 », devises → aucune source).
- Nouveau integrations/world-facts.ts : question actu/loi/économie/banque/grève… (hors business, Square, or, vols, Liberté) → multiProviderWebSearch(question + mois année) AVANT le cerveau, résultats + consigne pays/date/source posés à côté de la question.
- Si le code a trouvé des résultats, fastPathGuard (« pas d'outil = inventé ») ne remplace plus la réponse (devises remplacée par « pas accès aux données en temps réel »).
- Banc f-greve / f-banque / f-loi-devise ✅ (grève 23-25/11 bien dite tunisienne, garantie 100 000 € + avis séparé, 1 000 € + sources).

## 2026-11-06 ~20h — faits vérifiés (veille + toutes les réponses)
- Veille actu : 03/11 grève carburant 23-25/11 TUNISIENNE annoncée comme algérienne (« fais le plein, appelle les clients ») ; 01/11 seuil 1 000 € présenté comme nouveau (en vigueur depuis janvier). Le JSON de veille demande country + date ; actu d'un autre pays du Maghreb ou de plus de 8 jours = écartée ; le pays est écrit dans le message.
- Toutes les questions : règle « FAITS DU MONDE » dans le prompt complet ET le prompt court (cerveaux gratuits) → web_search d'abord pour actu/loi/taux/prix/grève/économie/santé, réponse avec pays + date + source, « pas de source sûre » sinon, sûr vs avis séparés. (Les logs du jour : aucun web_search appelé ; Tavily OK sur Railway.)
- Liberté appel 12h30 : « ton palier descend à 7 demis maximum » au lieu de « tu es descendu à 7 demis » (c'était le palier, pas ses prises).

## 2026-11-06 ~19h30 — pubs = TikTok uniquement
- Kouider : « je déjà partagé une pub » = noter une NOUVELLE pub publiée ; ses pubs ne vont QUE sur TikTok, jamais WhatsApp. markPubPosted : chaque annonce = nouvelle entrée pub:posted (même si la dernière pub studio est déjà notée = son propre montage ; doublon < 10 min ignoré). Contexte cerveau (pubStatusContext, toujours présent) : règle TikTok seul, jamais WhatsApp/Insta/FB ni repost, + pubs publiées 3 j → ne pas pousser une autre pub. Vidéos auto lun/mer/ven sautées aussi si une pub a été publiée ces 3 jours.

## 2026-11-06 ~19h — rappel confirmé sans jargon
- 09h27 Dzaryx confirmait un rappel avec « ID DB e504982c…, fuseau Europe/Brussels (UTC+01:00) » : la règle de l'outil schedule_reminder l'y obligeait. Désormais le résultat donne say_to_kouider (« ⏰ Rappel programmé aujourd'hui à 14h00 : … ») et interdit les ID/fuseau.

## 2026-11-06 ~18h45 — relecture des conversations du jour
- Appel sport « Aujourd'hui c'est épaules, Épaules » : le focus n'est plus répété quand il est identique au nom de la séance (sport-coach.ts).
- Veille actu : appel 18h « l'euro a pété un record au Square à 282 » alors que le square était à 274,5 → une actu de change dont aucun chiffre ne colle (± 2 %) au vrai taux du square (goldMarket) est écartée, ni message ni appel (business-mentor.ts).
- Vérifié, déjà corrigé dans la journée : prises Liberté, eau 2 L, numéro FIK, note interne, « je partager la pub », bilan séance. Les 6 pubs lancées = session de réglage du matin. Le bouton « Noter repos à 20h » a bien modifié l'agenda (réponse dans l'app).

## 2026-11-06 ~18h15 — pas de vidéo auto s'il en a déjà eu une
- Vendredi 18h la pub auto « Prix Choc » est arrivée alors que Kouider venait d'avoir sa pub TikTok. autoStudioVideo (lundi TikTok / mercredi Lifestyle / vendredi Prix Choc) est sautée si une vidéo demandée (pub, studio, montage ; pas retouche ni auto) existe sur les 3 derniers jours (recentRequestedVideo).

## 2026-11-06 ~17h — « Je partager la pub TikTok » = J'AI partagé (info)
- Kouider voulait dire « j'ai partagé la pub » : Dzaryx renvoyait la pub. Phrase au passé (j'ai partagé/posté/publié, je partager, c'est publié) → note kv pub:posted + bravo + conseil 1re heure ; « renvoie/envoie-moi la pub » → renvoi. Contexte cerveau : pub PUBLIÉE par Kouider.

## 2026-11-06 ~16h30 — bugs de la journée (captures Kouider)
- « Envoie moi notre numéro » → « je ne le connais pas » : numéro FIK +32 466 31 14 69 (wa.me/32466311469, celui du site) ajouté au prompt complet ET au prompt court.
- « Je partager la pub TikTok » → le cerveau a refait un clip Runway de la CLS (50 €/j) et donné un lien .jpeg comme « vidéo », alors que « Le Grand Retour FIK » était prête depuis 13h49. Nouveau raccourci sharePub (partage/publie/poste/renvoie la pub) + publish_to_socials sans id → resendLatestPub : renvoie la dernière pub terminée (vidéo + légende + « numéro en bio » + numéro), rien de régénéré.
- Le cerveau ne voyait pas l'état des pubs (12h12 « je lance la pub ? » alors que 2 tournaient, 14h25 « je t'envoie dès qu'elle est prête » alors qu'elle était arrivée) → contexte « PUBS TIKTOK DES 12 DERNIÈRES HEURES » (pubStatusContext, 1 lecture si aucune pub récente).
- La note interne « [note interne, ne pas recopier…] » recopiée par le cerveau (12h32, 15h06) restait dans l'historique (retirée à l'envoi Telegram, mais réapprise) → retirée aussi à l'enregistrement.

## 2026-11-06 — Pub TikTok complète (video_studio action=pub_tiktok)
- marketing/tiktok-pub.ts : réalisateur IA (hook + 2 hooks de secours, motion design tiré de son message, 3 voitures, CTA) → hook sur le moment le plus fort mesuré (scene score) → intro motion design fond noir calée sur la voix → voitures (vraie photo → Kling, nom doré + atout) → CTA → signature FIK ; zone sûre TikTok, étalonnage premium, musique baissée sous la voix.
- Pack community manager sur Telegram : vidéo, miniature, légende + hashtags, commentaire à épingler, réponses types, conseils, meilleur créneau (habitudes Algérie) + rappel à l'heure.
- fr-commands pubTiktok : « crée-moi la vidéo/pub » après un message TikTok → lancé direct (même cerveaux saturés) ; avis/« je vais faire » → cerveau.

## 2026-11-06 ~13h20 — eau « Je déjà bu 2 litre »
- Sans le mot « eau », le raccourci ne marchait pas → le cerveau AJOUTAIT 2 L aux 0,6 L déjà notés (« 2,6 L »). Maintenant « bu 2 litres » sans autre boisson = eau, et « déjà / aujourd'hui » = TOTAL du jour (remplace, n'ajoute pas).

## 2026-11-06 ~13h15 — pub TikTok : conduite comme dans la vraie vie
- Kouider : « parfois la voiture va en marche arrière, pas dans la même direction que les autres ». Réalisateur + image de départ + prompt Kling : toutes les voitures en marche avant, même sens, même voie, voiture qui reste grande jusqu'à la fin ; negative prompt marche arrière / contresens / demi-tour / dérapage / voiture qui rapetisse.
- Contrôle après chaque scène (vision 4 images) : COULEUR + MOUVEMENT → 1 nouvel essai, sinon coupe au dernier moment réaliste. Testé sur le job 9f0463ef : Jumpy et Duster repérés, convoi et Jogger OK.

## 2026-11-06 ~12h45 — audit des conversations du jour
- LIBERTÉ : « Je déjà prix 5 demis » et « Je viens de prendre 2 demi je dois plus prendre après » n'étaient PAS notés (« prix » inconnu, « dois » bloquait) alors que Dzaryx répondait « noté » → parseMedTake comprend « prix » et une prise passée même suivie de « je dois / je veux ».
- Séance live : bilan ne dit plus « X pas fait » pour un exercice simplement non dicté (on ne lui demande jamais ses séries) ; seul un exercice passé est signalé.
- Pub TikTok : année passée dans la légende/hashtags (« #noel2024 ») → année en cours.

## 2026-11-06 — Vidéo IA aussi sur Telegram + « si j'ai envie je te ferai signe » ≠ envie
- tgVideo (tool-executor) : la vidéo partait seulement dans l'app → aussi envoyée sur Telegram (queueTelegramMessage file).
- craving (fr-commands) : phrase au conditionnel/plan (« si j'ai envie… je te ferai signe ») ne déclenche plus le SOS envie.

# DZARYX — Changelog

> Format : Date | Commit | Fichiers | Description
> Plus récent en haut.

## 2026-11-05 (43) — samedi : maison à 08:30 + plus grosse séance
- `morning-routine.ts` : fin de séance = heure maison − 25 min pour CHAQUE jour de sport (07:05 en semaine, 08:05 le samedi), retour → 07:30 / 08:30 ; resync unique kv routine:resync:2026-11-05c.
- `gym-live.ts` defaultHomeBy(date) : 08:30 le samedi (alerte de départ au vrai trafic). `foresight.ts` utilise la même heure.
- `sport-coach.ts` planSportWeek : le samedi reçoit la séance qui travaille le plus ses priorités FORME (dos > bras > pecs > abdos → DOS & BICEPS), toujours le samedi ; reste aussi en semaine (2×) sauf si la séance du samedi disparaîtrait de la semaine → échange (jours faits / choisis par lui jamais touchés).

## 2026-11-05 (42) — agenda : à la maison à 07:30
- `morning-routine.ts` syncRoutineCalendar : séance = jusqu'à 07:05 (07:30 − 20 min de route − 5), « 🚗 Retour maison » 07:05→07:30 (avant : séance 06:00-07:30 puis retour jusqu'à 09:15). Description : gym-live prévient 10 min avant le départ (vrai trafic) et appelle à l'heure. Resync unique (kv routine:resync:2026-11-05b) au prochain departure-watch.

## 2026-11-05 (41) — planning de demain : ses vraies contraintes
- 21h « 🔮 Demain » : « retour maison 07:30-07:50 », « déjeuner + micro-sieste au travail », « coucher 22:30 ». Il doit être À la maison à 07:30 max, n'a AUCUNE pause au travail, dort vers 23h.
- `foresight.ts` facts.contraintes (home_by de gym-live, pas de pause au travail, coucher 23:00) + consigne de les respecter strictement.
- `constants.ts` ⏰ SES CONTRAINTES (pour tous les cerveaux) ; `life-coach.ts` coucher par défaut 23:00, plus tôt seulement après une nuit courte.

## 2026-11-05 (40) — ses fautes comprises par les raccourcis (banc 41 phrases t-*)
- Liberté : « je viens de prendre 2 demis », « j'ai prit un demi » notés ; « j'ai oublié de prendre / il faut prendre » ignorés.
- Eau : « jai bu 1l deau », « je boi 50cl d'eau ». Argent : « snu 170 ». Sommeil : « bonne nui », « je suis réveiller ». Rappels : « rapel moi… », « rappel moi dans 10 minute… ». Silence : « me derange pas jusqua 18h ».
- Banc phase1 : 150/152 (fr-journee hors bac à sable connu ; t-couche-a OK, cerveau appelé en fond), phase1b 25/25.

## 2026-11-05 (39) — « aucune vente » à la question du soir
- `fr-commands.ts` noSales : réponse « aucun / rien / pas gagné de cash » après « 💵 Combien de snus aujourd'hui ? » (kv argent:sent:soir:date) → réponse directe, rien inscrit (20h50 : « ⚠️ Je n'ai pas exécuté cette action »). Mot d'argent exigé sauf réponse ≤ 3 mots, aucun chiffre.

## 2026-11-05 (38) — réponses rapides aux raccourcis
- `orchestrator.ts` : les raccourcis du code (eau, comprimés, sommeil, argent, rappels…) mettaient 9-15 s (médiane 2 jours) parce qu'ils attendaient le contexte complet du cerveau. Le contexte + notes (intentions/procédures/tâches) se chargent maintenant en parallèle et ne sont attendus que si le cerveau répond ; les consignes du code s'empilent dans `pre[]` puis sont posées sur le contexte. Même ordre qu'avant.
- `fr-commands.ts` water : « corige » (1 r) / « mets l'eau à » reconnus (20h41 : faux « C'est noté » du cerveau, 4 L restés) (eba53699).

## 2026-11-05 (37) — raccourcis aveugles en « ne pas déranger » + eau en total
- `liberte.ts` parseMedTake, `sleep-phone.ts` sleepFromMessage, `sport-coach.ts` parseSportCancel : la consigne « [Contexte : ne pas déranger…] » devant le message le rendait trop long → 19h53 « Je pris 8 demis aujaurdhui » pas noté + réponse vide (et « bonne nuit » n'aurait pas noté le coucher). Consignes retirées avant lecture ; « aujaurdhui » = total du jour.
- `fr-commands.ts` water : « j'ai bu que 2 L / en tout / au total / corrige l'eau à 2 L » = total du jour (remplace), plus un ajout (05/11 : 4 L comptés au lieu de 2).

## 2026-11-05 (36) — dates des jours + actions inventées
- `fr-commands.ts` water : « Je pris 7 demi comprime est bu 2l d'eau » → la prise Liberté est notée aussi (0ba80871).
- `context-builder.ts` : liste des 7 prochains jours avec leur date (« dimanche 1er novembre » dit au lieu du 8) + « demain » le matin ≠ aujourd'hui (« demain jeudi » dit un jeudi).
- `conscience.ts` bouton de notification → le cerveau ne dit que ce que ses outils ont fait (« j'ai nettoyé ton agenda » après une simple lecture).

## 2026-11-05 (35) — « dispo à 6:30 » respecté, pas de sport inventé au réveil
- `fr-commands.ts` dispoAt : « je suis dispo à 6:30 / joignable après 14h / dispo à partir de 9h » → pause_calls until_time par le code (le cerveau faisait resume:true et ignorait l'heure). Heure déjà passée → reprise.
- `forme-food.ts` message du réveil : jour sans séance → « PAS DE SPORT AUJOURD'HUI » dans les faits + consigne sport seulement si séance prévue (jeudi 05/11 : « séance très légère » inventée).

## 2026-11-05 (34) — « La tâche conscience a planté » (05:20)
- `life-coach.ts` : le sommeil noté par message enregistrait health:daily en JSON doublé → `.find is not a function` dans conscience. Écriture corrigée + donnée réparée.
- `ai-util.ts` kvJson : relit aussi une valeur doublement encodée (plus de plantage si ça revient ailleurs).

## 2026-11-05 (33) — Réveil du jeudi, « couché à 23:30 », avis Google automatique
- `morning-routine.ts` : le 31/10 « jeudi repos » avait mis le jeudi à « rien » → plus de réveil le jour d'ouverture du magasin (05/11). Jeudi remis en jour de travail (05:15) ; un jour de travail ne devient plus jamais « rien » sauf `no_work` explicite ; agenda resynchronisé une fois.
- `sleep-phone.ts` : « couché à 23:30 » le matin → nuit calculée par le code (avant : le cerveau répondait « demain (jeudi) » un jeudi).
- `context-builder.ts` : AUJOURD'HUI + DEMAIN écrits en toutes lettres dans le contexte.
- `client-care.ts` jobReviewWhatsapp : le lendemain du retour (10h30 Oran), remerciement + lien d'avis Google ENVOYÉ tout seul sur WhatsApp à chaque client (avec ou sans email) ; WhatsApp injoignable → lien prêt en 1 clic sur Telegram.

## 2026-11-04 (32) — Rejeu de ses 80 vraies questions (2 semaines) + juge automatique
- Banc `replay.ts` : ses vraies questions rejouées sur le vrai cerveau, chaque réponse contrôlée contre les résultats d'outils. 36 passées (24 OK, 12 signalées dont 1 vrai bug), 44 non jouées (quota gratuit épuisé par le rejeu).
- `fr-commands.ts` rentalTotal : « du 29 octobre au 9 novembre à 40 €, total ? » → 11 j × 40 = 440 € par le code (avant : prix de la flotte).
- `car-price-direct.ts` : plus d'interception quand il y a des dates / « total » / « au prix de ».
- `constants.ts` : RÉPONDS À TOUT — chaque partie de la question ; « annulée / en pause / en attente » jamais changés en « aucun » ; « vérifie » = dire ce qui a été vérifié.

## 2026-11-04 (31) — « Je suis pas allé à la salle, c'est mauvais ? » : réponse honnête
- `sport-coach.ts` session : jour annulé par lui → « séance ANNULÉE à ta demande (raison) » (avant : « aucune séance programmée ») + ligne semaine (faites / annulées / prévues).
- `fr-commands.ts` skipJudge : vrais faits (aujourd'hui, demain, repas du jour) + consigne : juger la semaine, protéines qui manquent, déficit un jour de repos, prévenir si séances enchaînées.

## 2026-11-04 (30) — Question jamais perdue pendant un redéploiement + réponses sport plus perso
- `orchestrator-engine.ts` + `brain-retry.ts` + `queue.ts` : questions en cours suivies ; au SIGTERM (redéploiement Railway) elles vont dans la file « question gardée » et la réponse part sur Telegram après le redémarrage — jamais si un outil qui écrit (cash, résa…) a déjà tourné (pas de doublon). Cause de « veines » sans réponse le 04/11 à 09:57.
- `forme-cut.ts` formeSnapshot : + charges actuelles (1RM estimé, évolution 2 sem.), déficit et protéines visés.
- `rich-answer.ts` : chaque section part de SES données, dos ménagé, section « À quoi tu n'as peut-être pas pensé ».
- `constants.ts` : message client → aucune règle FIK inventée (frais de retard…), [à compléter par Kouider] sinon.
- Banc : 13 scénarios « vie de tous les jours » (journée de demain, oublis, essence, snus, courses sèche, achat voiture, anniversaire, fièvre d'Ibrahim, week-end en Belgique, flemme, message client, octobre vs novembre, bonjour) → OK.

## 2026-11-04 (29) — Ses vrais messages rejoués : questions perso avec SES chiffres, générales sans FIK
- `context-builder.ts` : question générale (langue, culture, science…) sans mot business → flotte, résas, agenda, finances, clients, dossier PAS envoyés au cerveau.
- `orchestrator.ts` : consigne du code aussi À CÔTÉ de la question ; prise Liberté + moral seul → soutien cadré sans outils.
- `fr-commands.ts` : eau → FORME ; « dans combien de temps… » → calcul réel Sèche ; jours de location avec heures → rentalDays ; « ma semaine dans la tête » → Mon esprit ; conseil business → ses vrais chiffres.
- `forme-food.ts` + `call.ts` : photo de plat + question → kcal sans enregistrer ; légende gardée.

## 2026-11-04 (28) — Style du cerveau de secours
- `constants.ts` : jamais de mot vulgaire ni d'expression étrangère bricolée (« cojones »), pas de FIK dans les exemples d'une question générale, rien d'inventé sur sa vie (« un appart FIK »), pas de page de l'app citée hors sujet.
- `fr-commands.ts` : consigne du code sur les questions de langue/culture (exemples de la vie de tous les jours) + programme de voyage sans FIK.
- Banc : plan-voyage, traductions, darija OK ; « je veux / je souhaite » donne encore des exemples clients (gros Gemini), réponse juste.

## 2026-11-04 (27) — Vocal CarPlay plus court (« trop long, parfois il coupe »)
- `car-coach.ts` : discours de motivation / de courage 2-3 phrases (45 mots max) au lieu de 4-5 ; UNE seule récitation par démarrage, en alternance verset du jour / protection (avant : les deux à chaque fois) ; (Ayat al-Kursi remis le soir même à la demande de Kouider) ; « Je reste en veille » sans la phrase Siri.
- `jarvis4.ts` carBrief : point en 2-3 phrases courtes (45 mots max) au lieu de 3-5.
- Total ~50 s au lieu de 1 min 45-2 min 30 → synthèse plus rapide (la voix Gemini coupait parfois les textes longs).

## 2026-11-04 (26) — Derniers scénarios du banc : salle, visites du site, horizon d'épargne
- `fr-commands.ts` sportSkip : « je suis crevé je vais pas à la salle demain » → séance annulée par le code (agenda, réveil, départ) ; avant : « je n'ai pas exécuté cette action ».
- `fr-commands.ts` siteVisits : « combien de visites sur le site hier ? » → vrai trafic du jour (visiteurs / nous / robots) ; avant : visites des prospects.
- `fr-commands.ts` financePlans : « fin 2027 » / « dans 3 ans » → projection jusqu'à cette date (avant : toujours déc. 2028).
- Banc : 16 scénarios restants repassés → tous OK (Liège déjà bloqué par le code ; agenda OK sur Railway, clé Google absente seulement au VPS/banc).

## 2026-11-04 (25) — Fin du banc questions générales : image, atelier, programme de voyage
- `fr-commands.ts` (toolIntent) : « crée-moi une image » → consigne generate_image / transform_image ; « ajoute-toi une fonction » → se_coder (noté pour l'atelier de la nuit) ; « programme de N jours / week-end » → programme écrit en entier dans la réponse. Avant, le petit cerveau disait « je n'ai pas d'outil » ou promettait un Google Doc.
- `orchestrator.ts` : une réponse du cerveau de secours qui promet sans rien faire (« je te prépare… je t'envoie tout de suite ») et sans outil → relancée sur un autre cerveau avec « écris la réponse maintenant ».
- Banc : g-image, g-coder-dzaryx, g-plan-voyage, g-memoire-suite, b-jours-retard → OK.

## 2026-11-04 (24) — Questions générales testées avec le vrai cerveau (24/25 OK) + 3 corrections
- `car-price-direct.ts` : « si je place 10000 € à 4 % » répondait les prix des Clio (le « 4 » de « Clio 4 » suffisait) → il faut un mot du nom ; placements/intérêts/% exclus.
- `oran-knowledge.ts` + `context-builder.ts` : « rani mqalleq » traduit « bloqué » → lexique des émotions (mqalleq = énervé ≠ m3allaq = bloqué) et guide darija chargé aussi quand on demande le sens d'un mot.
- `constants.ts` : actualité/lois récentes seulement depuis un outil ; recherche en échec → aucun « fait certain » de mémoire.
- Banc phase 2 « g- » : veux/souhaite, orthographe, histoire, sciences, maths, %, traductions, code, Excel, recette, droit, philo, islam, darija, mails, quiz, actu → OK.

## 2026-11-04 (23) — Culture générale : gros Gemini ou Claude Haiku, jamais un petit cerveau + nom privé hors du code
- `anthropic-compat.ts` : `factualQuestion()` (histoire, religion, droit, santé, langue, définitions…) → seulement le gros Gemini ; saturé → secours Claude Haiku (quota 'tout') ; sans secours possible, petits cerveaux en dernier recours (option A choisie).
- `config/private-terms.ts` : noms de médicament lus depuis `PRIVATE_MED_TERMS` (env Railway + .env), retirés de fr-commands / jarvis4 / mon-esprit (dépôt public).
- Banc : phase 1 112/112 · outils 25/25.

## 2026-11-04 (22) — Réponses d'argent directes + règle d'exactitude
- `fr-commands.ts` : plan Algérie, projection d'épargne, CA FIK du mois/année et suivi de vol = réponse DIRECTE du code (en « consigne », le cerveau gratuit disait « aucune donnée sur un plan Algérie » ou donnait le bénéfice FIK comme épargne perso). « combien je vais avoir », « dans N ans » reconnus.
- `constants.ts` SYSTEM_PROMPT : règle EXACTITUDE (date/chiffre/nom seulement si sûr, jamais de statistique inventée, pas de FIK dans une question qui n'en parle pas) — banc : résumé guerre d'Algérie avec 4 dates fausses par un cerveau de secours.
- Banc tour 3 arrêté à 70 scénarios : le banc épuisait le quota gratuit partagé avec le vrai Dzaryx.

## 2026-11-04 (21) — Secours Claude sur TOUT + voiture/réveil jamais muets + kilométrage
- `anthropic-compat.ts` : tous les cerveaux gratuits en échec → la requête part sur Claude Haiku (quota 'tout' 100/jour) au lieu d'une erreur ; réglages Sonnet retirés (réflexion, repli serveur). Quotas chat 30 / voix 20 ; 1 info Telegram par jour.
- `ai-util.ts` ai({emergency}) + `car-coach.ts`, `jarvis4.ts` carBrief, `morning-routine.ts` : discours voiture (aller/retour), point voiture et réveil → secours Claude si le gratuit tombe.
- `fr-commands.ts` carKm : « la fiat 500x est à 45200 km » noté par le code (avant : faux « ✅ Noté » ; remember_info plantait) ; `client-care.ts` recordCarKm trouve « Fiat 500 X » sans espaces ; `remember_info` accepte {key, value}.
- `tool-executor.ts` set_cities Belgique : parle en « tu », ne propose jamais de « forcer ».
- Banc : phase 1 112/112 · outils 25/25 · Haiku testé en vrai (200).

## 2026-11-04 (20) — Banc phase 2, tour 2 : question gardée, secours Claude, SOS envie, CA du mois juste, impayés UNPAID
- `brain-retry.ts` (nouveau, job */5) : tous les cerveaux gratuits saturés → la question est GARDÉE et rejouée, réponse sur Telegram (avant : « Service temporairement indisponible », question perdue).
- `anthropic-compat.ts` + `orchestrator.ts` + `claude-api.ts` : secours Claude Haiku seulement si tout le gratuit a échoué, messages de Kouider seulement, 5×/jour max, info Telegram au 1er usage.
- `fr-commands.ts` : « j'ai trop envie d'en prendre un » → SOS Liberté direct (avant : « Quelle voiture t'intéresse ? ») ; « j'ai encore pris un demi » reste au cerveau ; « mon salaire est tombé / j'ai touché ma paie » noté ; plan Algérie / projection / CA par le code.
- `phase5-finance.ts` getCAReport : location à cheval sur 2 mois comptée au prorata (29/10→9/11 comptée entière dans octobre ET novembre), montants arrondis.
- Impayés : `payment_status` UNPAID ajouté partout (relances, appels, moteur proactif) — les clients qui n'avaient RIEN payé n'étaient jamais relancés.
- `generate_contract` : par nom de client (« fais le contrat de Halfi » → « quel est l'ID ? »).
- Banc : phase 1 112/112 · outils 25/25 · finances 11/11.

## 2026-11-04 (19) — Banc « comme Kouider » phase 2 (vrai cerveau, 43 scénarios) : 20 bugs corrigés
- `tool-executor.ts` aliasToolInput : le cerveau écrit booking_id / price_per_day / total_price… → « ID manquant » / « Prix manquant » ×10 puis « Clio INDISPONIBLE » inventé ou « Service indisponible » (prolonger une résa ne marchait JAMAIS). Synonymes traduits pour tous les outils de réservation.
- `agentic-fallback.ts` : même appel d'outil = pas réexécuté, 3 échecs du même outil = stop → il dit la vraie erreur.
- `fr-commands.ts` (nouveau, exécuté par le code) : rappels (« le 1er décembre », « mardi prochain », « dans 10 min »… → avant create_intention qui ne sonne jamais + « Rappel noté ! »), RDV agenda (avant rappel_lieu / « je l'ajoute ? »), « ne me dérange pas jusqu'à 18h » (avant MODE VACANCES), « j'ai dormi 5h » (rien noté), soirée à deux (restaurants inventés à Oran + vin → coach couple maison), météo J→J+6 Open-Meteo (« pas d'info »), ramadan/aïd calculés (« février 2026 »), « il est où mon vol », « Houari m'a demandé du parfum » (faux « Noté » ; gardé avant billet puis ajouté à la check-list à l'envoi du billet, trips.ts), verrou santé : jamais partager traitement/santé avec quelqu'un.
- `car-price-direct.ts` (nouveau) : « la Clio 4 diesel on la loue combien ? » (« pas accès aux données ») + « quelle voiture rapporte le plus ? » (« aucune donnée ») lus dans la flotte / les résas.
- `argent-direct.ts` : « combien ON a gagné » = FIK, pas la caisse snus ; « 230 millions en euros ? » = conversion, pas « tes gains ».
- `tool-executor.ts` set_cities : une ville belge dans la liste = rien changé (Liège était enregistré + liste de villes inventée), description sans exemple belge.
- `mon-esprit.ts` : « ma journée 8/10 » noté par le code (« c'est top » sans rien noter) ; note du jour = 60 % esprit / 25 % sport / 15 % famille ; jamais médicament/libido/santé dans le journal (filet + 2 jours nettoyés).
- Banc : phase 1 112/112 · outils 25/25 (le cas agenda été non testable ici : pas de clé Google sur le VPS).

## 2026-11-04 (18) — Banc « comme Kouider » phase 1 : 7 bugs de dates / prix / oui-non corrigés
- Banc isolé PRIVÉ (hors dépôt, /root/dzaryx-bench) : vrai code, écritures Supabase dans une couche mémoire, sorties bloquées, horloge pilotée. 80 phrases + 25 tests d'outils.
- `tool-executor.ts` create_booking : dates FR (16/11/2026), avec heure (…T10:00 → start_time), année passée écrite par le cerveau (2025 → 2026, signalé), prix en texte (« 240 € »), prix/jour client déduit du total (bénéfice n'était plus calculé) et total déduit du prix/jour (était vide) ; prix manquant → refus clair.
- update_booking : mêmes normalisations + jours, part Houari et bénéfice RECALCULÉS quand dates/prix changent (prolonger une résa gardait l'ancien bénéfice) ; dates incohérentes refusées.
- `utils/timezone.ts` normalizeYMD/normalizeHHMM : rappels « 01/12/2026 » et « 18h30 » n'étaient pas acceptés.
- `google-calendar.ts` : heure sans fuseau = Bruxelles (Oran s'il y est) au lieu d'Alger → la routine aurait été décalée d'1 h dès l'heure d'été (28/03/2027).
- `pending-action.ts` : oui/non en darija et argot (wakha, ih, saha, c'est bon envoie / laisse tomber, la la, nn, mazal).

## 2026-11-04 (17) — MON ESPRIT : journal de chaque jour + classement des jours de la semaine + 20 options
- `mon-esprit.ts` (nouveau) : journal du soir 23h10 (`esprit-day`) écrit depuis ses vrais messages + montre + sport (même dit à la voix) + humeur → note 1-10, moral/énergie/stress, moments en famille, meilleur/pire moment, gratitude (app_kv `esprit:days`, privé, jamais de médicament).
- Dimanche 18h (`esprit-sunday`) : classement 🥇🥈🥉 des 7 jours, meilleur/pire jour, moyenne vs semaine d'avant, record du mois, moments en famille, recette chiffrée (famille/sport/sommeil/congé/pas), déclencheurs, gratitude, défi famille.
- 18h15 (`esprit-watch`) : mot doux après 3 jours durs, « tu remontes », rappel après 3 jours sans moment famille (jamais d'appel, respecte ne-pas-déranger).
- Outil `esprit` (jarvis4-tools) : semaine, aujourdhui, jour, noter, famille, recette, declencheurs, gratitude, demain, mois, options ; dossier du cerveau : « meilleurs moments = sa femme et Ibrahim » + ses 7 derniers jours.
- Testé sur ses vrais jours 29/10→04/11 (7 journaux écrits, rien envoyé).

## 2026-11-04 (16) — Liberté : un message « prise + moral » reçoit une vraie réponse
- `liberte.ts` parseMedTake → `rest` quand le message dit autre chose que la prise (moral, travail, ≥ 3 mots en plus) ; `orchestrator.ts` : la prise est notée par le code puis le cerveau répond à ce qu'il vit (avant : seul « ✅ Noté : 1 demi… Prochaine 19:30 », son « j'en peux plus » ignoré).

## 2026-11-04 (15) — Vols : clé AirLabs vérifiée + rappel d'expiration
- `trips.ts` set_key AirLabs : la clé est testée chez AirLabs avant d'être enregistrée (clé refusée = ❌) et Dzaryx annonce sa date de fin.
- `flight-live.ts` : date d'expiration gardée dans app_kv `cfg:airlabs_exp` ; si elle tombe avant un vol de Kouider dans les 10 jours → 1 rappel Telegram par jour (9h-21h) pour reprendre une clé gratuite. Clé free actuelle : jusqu'au 04/12/2026.

## 2026-11-04 (14) — Vols : services AirLabs/Aviationstack + 9 bugs trouvés par test « comme Kouider »
- `flight-live.ts` : statut AirLabs (1000/mois) → Aviationstack (100/mois) → Gemini ; clé par `travel set_key` (app_kv `cfg:*_key`) ou env `AIRLABS_API_KEY`/`AVIATIONSTACK_API_KEY`.
- Banc isolé (faux Telegram/appels/agenda/mémoire, horloge + radar pilotés) : 83/83 + 8 tours avec le vrai cerveau. Bugs corrigés :
  numéro « ah 1015 » → doublon de vol (normalisé AH1015) ; billet aller renvoyé seul effaçait la pause retour ; statut « à l'heure » malgré 75 min de retard ;
  arrivée pas décalée dans le message de retard ; ETA au décollage trop tard ; vol client : agenda arrivée décalé à l'heure de départ + décollage jamais vu (aéroport d'arrivée pris pour départ) ;
  année passée (le cerveau écrivait 2025) → crash + agenda dans le passé (année corrigée, départ passé refusé) ; recherche par référence PNR ; alias remove/add/item ;
  add_items « au retour / pour Houari » → demande ; réponses check/add/remove commencent par ✅ (garde anti-invention bloquait à tort) ; « terminal Terminal A ».

## 2026-11-04 (13) — Vols suivis en direct + demandes de Houari
- `flight-live.ts` (job `flight-live` */5) : pour chaque vol des 30 h à venir (Kouider ET clients) → statut web (Gemini + Google Search, retard appliqué après 2 lectures concordantes), radar ADS-B en direct (adsb.lol → airplanes.live, indicatif OACI ou immatriculation), décollage / atterrissage / « pas encore décollé » +20 et +60 min.
- Retard → agenda FIK décalé (vol + « être à l'aéroport ») + `dep:<id>` remis à zéro → heure de partir recalculée avec le trafic ; ≥ 60 min → appel ; annulation → appel urgent ; changement de terminal / porte.
- Veille 20h : briefing (départ, arrivée, heure de partir, réveil si vol tôt, météo d'arrivée, décalage, taux €→DA, check-list, demandes, locations FIK pendant l'absence, rappel 10 000 € liquide) ; H-24 enregistrement en ligne ; jour J fiche + appel réveil si aucun signe de vie ; pendant le vol pas d'appels (mode avion) ; « bien atterri » + décalage horaire.
- `travel` : actions `track` (où est le vol) et `request` (« Houari m'a demandé de ramener X » → check-list aller ou retour, rappelée veille / jour J / réveil) ; Houari peut faire sa demande lui-même ; billets : référence PNR + terminal.
- Lien public famille `/api/vol/suivi/<jeton>` (carte Leaflet, avion en direct) ; globe de l'app : bouton « 🧳 Mon vol » (`kind=myflight`).

## 2026-11-04 (12) — CarPlay : mode vacances + qui est dans la voiture
- `car-company.ts` : vacances = voyage enregistré, > 300 km de la maison ou « je suis en vacances » (jusqu'à « fin des vacances », 45 j max).
- En vacances : famille par défaut, heure du pays (fuseau GPS via Open-Meteo), zéro travail/business, prochaine étape voyage seulement, « Bienvenue au pays » 1×/jour en Algérie, logement = point de départ du matin.
- « je suis avec Houari » / « on est en famille » / « je suis seul » → valable jusqu'à la fin de la journée (aussi hors vacances) ; mode associés : salue les deux, rien de privé.
- Jeudi famille à partir de 13h30 (febc12cf).

## 2026-11-04 (11) — CarPlay : verset en cycle (jamais le même avant le tour complet) + protection qui tourne (voyage 43:13-14, Al-Falaq, An-Nas, Ayat al-Kursi) ; point voiture = temps restant avant la prochaine étape (agenda, sinon travail de la routine), plus jamais de « décision » ; MODE FAMILLE lundi après le sport et jeudi après le travail (bonjour à la famille + protection, zéro business)

## 2026-11-04 (10) — CarPlay voix v3 : plus de son de démarrage ; une seule synthèse = une seule voix ; « Dzaryx » lu « D'zarix » (app_kv jarvis:say:dzaryx) ; à chaque démarrage verset du jour (sens FR + vraie récitation Alafasy) + invocation du voyage 43:13-14 ; Gemini TTS en chaîne de modèles (quota gratuit ~10/jour/modèle), consigne de style seulement pour 2.5 (les 3.x la lisaient à voix haute), secours ElevenLabs/voix Google

## 2026-11-04 (9) — Couple : idées À LA MAISON par défaut (mercredi → samedi soir après le coucher d'Ibrahim) ; SORTIE seulement pour le lundi (congé), envoyée chaque dimanche 17h ; plus de rappel « garde d'Ibrahim » pour une soirée maison ; un seul message (plus de doublon décision + texte)

## 2026-11-04 (8) — CarPlay voix « cinéma » + widget v6 + messages repris après redémarrage + soirée à deux réaliste
- jarvis-audio.ts : voix Jarvis habillée (séquence de démarrage : souffle, basse, bips de scan, carillon ; écho stéréo ; nappage grave ; carillon de veille), synthèse en 3 morceaux parallèles, secours voix nue
- car-coach.ts : séquence de démarrage dite + « Protocole mission / retour au foyer / famille / journée douce / vendredi » ; discours avec tournures d'IA futuriste sans chiffre inventé ; jarvis4 : fin « Je reste en veille, Dis Siri, Jarvis »
- Widget v6 : cadre de visée HUD aux 4 coins, lignes de balayage, graduations, ligne « SCAN · MÉTÉO ✓ · ROUTE ⚠ · AGENDA ✓ · CLIENTS ✓ » ; libellés PROTOCOLE …
- B053 : message Telegram perdu pendant un redémarrage Railway (10h57) → tgcall attend le serveur et renvoie la même question (turnId, réponse déjà faite = redonnée, pas de doublon) ; messages automatiques nettoyés (### / *)
- life-plus.ts : soirée à deux tient compte d'Ibrahim (garde ou formule maison), horaires de travail du jour et du lendemain, sommeil/dette, forme, moral, sèche

## 2026-11-04 (7) — Widget : Scriptable en arabe → rangées inversées (RTL) ; ordre des éléments inversé quand data.rtl (app_kv car:widget:rtl, défaut true) ou langue ar/he/fa/ur

## 2026-11-04 (6) — Widget net (vraiment) : tout le texte en texte natif iPhone (ListWidget stacks) posé aux mêmes places ; l'image ne garde que photo, logo, HUD, ciel. iOS compressait l'image → texte flou

## 2026-11-04 (5) — Widget net : dessiné à la taille exacte en pixels de l'iPhone (Device.screenSize × screenScale, K), plus de réduction par iOS → texte net

## 2026-11-04 (4) — Widget : appui = raccourci Siri « Jarvis » (vrai nom chez Kouider, pas « Dzaryx »)

## 2026-11-04 (3) — Widget : travail de la routine + atelier sans crédit API
- car-widget-plus.ts : sans RDV dans l'agenda, « quand partir » / trafic / retard utilisent l'heure de travail de la routine (ex. mercredi 13:00) et l'adresse travail, 3 h avant.
- night-dev.mjs : Claude Code lancé SANS ANTHROPIC_API_KEY → abonnement claude.ai, le crédit API (10 € rechargés le 04/11) reste à Dzaryx ; veille hebdo plus en double (date UTC vs Bruxelles), file nettoyée (8 → 2).

## 2026-11-04 (2) — Widget CarPlay v5 « Jarvis + route » + discours d'arrivée
- car-widget-plus.ts : quand partir (prochain RDV avec adresse ≤ 3 h, en mots), trafic en mots (RDV ou maison au retour, Google Maps caché 10 min), retard prédit, « un client attend votre réponse » (wa:convlog, sans nom), phrase Jarvis adaptée.
- Widget : 2e ligne route/client (moyen, petit), 3 lignes en grand, écran verrouillé priorise départ/retard ; appui = raccourci Siri « Dzaryx ».
- carplay_off : discours d'arrivée Jarvis (maison : bienvenue + demain + prochain mouvement FIK ; ailleurs : phrase courte) + voix audio_url.
- Kouider confirme fonctionnels : voix CarPlay, widget, Jarvis 4, radars, course GPS, retouche IA, WARP.

## 2026-11-04 — VPS↔Railway via WARP, sommeil sans montre, FORME semaine
- VPS : l'hébergeur ne routait plus vers Railway → trafic Railway seul via Cloudflare WARP (proxy + redsocks + iptables, systemd railway-via-warp). Watchdog : vérif externe check-host (plus de fausse « PANNE ») ; heal ne relance plus TG/PC cloud si Railway injoignable.
- 😴 Sommeil sans montre : POST /api/jarvis/sleep {kind auto|couche|leve} (sleep-phone.ts) → nuit estimée (coucher → réveil − 15 min) dans health:daily (sleep_src telephone, la montre la remplace).
- 😴 Sommeil par message Telegram/app : « bonne nuit » (19h→4h) = coucher, 1er message du matin (4h30→13h) = réveil → nuit dans health:daily (sleepFromMessage, orchestrator). Raccourci iPhone abandonné par Kouider.
- FORME Repas : activité estimée démarre au vrai réveil (plus 6h) ; note « normal le matin » ; section « Ma semaine » 7 jours (GET /api/forme/food/week), appui = plats du jour passé. App v244.

## 2026-11-03 (nuit) — Widget v4 + Dzaryx « comme ChatGPT / Google »
- Widget : vendredi Jumu'a, Ramadan (Iftar/Shour, vert), Aïd (ciel doré), jour de congé (mode repos), match des Fennecs du jour (TheSportsDB, cache 3 h), météo de demain matin le soir, couleur par mode, grand format + écran verrouillé.
- Garde-fou fastPath limité aux questions FIK/argent perso (« explique l'inflation » était remplacé par « pas accès aux données » à cause d'un exemple en €).
- rich-answer : aussi « c'est quoi / pourquoi / différence / prix / qui a gagné » ; web_search obligatoire si actu/prix, sources citées ; tutoiement ; aucun chiffre FIK inventé.
- Testé : grounding Google Search de Gemini NON dispo en gratuit (429 sur toutes les clés) ; Tavily OK sur Railway.

## 2026-11-03 (soir) — Widget CarPlay v3 « Jarvis HUD », zéro chiffre
- Plus de voitures louées / argent / mot Ibrahim. Vrai ciel sur la photo (aube/jour/couchant/nuit + étoiles), pluie/neige/brouillard, arc soleil/lune à la position réelle (Open-Meteo sunrise/sunset), HUD qui tourne, mode départ/mission/retour/veille, prochain mouvement FIK en mots (« demain matin »), prière qui approche, phrase Jarvis selon le moment. Aperçu vérifié avec une simulation Scriptable.

## 2026-11-03 (soir) — Réponses de conseil « comme ChatGPT »
- Question « comment faire / conseils » (hors demandes de travail) → consigne À CÔTÉ de la question (rich-answer.ts) : intro, son cas avec ses vrais chiffres FORME, sections **1. Titre** + puces, « Ton plan », photos d'exercices choisies à la main (free-exercise-db). Le cerveau gratuit ignorait la consigne dans le prompt système.
- tgcall : tg_format() transforme ### / --- / * en gras et • (Telegram affichait les symboles bruts).

## 2026-11-03 (soir) — Argent : mouvements de caisse lus par le code
- « je pris 200 du cash… retombé à 2200… je récupère 400 » n'était pas lu → le cerveau a répondu « Cash +400 € enregistré » sans rien écrire. Parseur : total + mouvements après le total, « -200€ en cash », « cash +400 », « moins 200 », « j'ai pris 150 de la caisse » (appliqué au cash enregistré). Garde-fou phantom : « ✅ **Cash** … enregistré » bloqué sans outil.

## 2026-11-03 — CarPlay mode RETOUR + annulation sport faite par le code
- 🚗 Jarvis CarPlay : en RENTRANT (après 11 h, près du travail ou plus rien de prévu, pas déjà à la maison) → plus aucune tâche ; discours de courage (il a tenu, le pire est passé, boulot + exil = une étape vers Oran), citation de courage, « reposez-vous » (car-coach.ts isHomeward/homewardSpeech).
- 🏋️ « annule ma séance de demain » : le cerveau disait « ✅ annulée » sans outil (tools: []) → parseSportCancel/runSportCancel exécutés par le code avant le cerveau (jour le plus proche du mot séance) ; planSportWeek retire de l'agenda les séances encore présentes sur un jour annulé. 4/11 marqué annulé.

## 2026-11-03 (17h30) — Vitalité : pause, idées, « avant », confidentialité
- Actions 'regles' (semaine en pause, rien compté ni relancé), 'idee' (24 idées tirées sans répétition), 'avant' (quoi manger/faire avant, sourcé).
- Rappel du soir : idée le mercredi/vendredi si l'objectif de la semaine n'est pas atteint (pas en pause). Messages ouverts par « 🔒 Privé » (aperçu neutre).
- Confidentialité : vitaliteText interdit d'en parler de lui-même (appels, briefs, voiture, agenda, WA) ; filtre CarPlay élargi (PRIVATE_RX).

## 2026-11-03 (17h) — Vitalité : prise de sang planifiée
- Action 'prise_de_sang' + date (base privée) → rappels Telegram : veille 20 h (préparation : sommeil, à jeun, pas de sport, avant 10 h), jour J 6 h (liste des analyses), résultats demandés à J+3 et J+6 s'ils ne sont pas notés.

## 2026-11-03 (16h45) — Vitalité : action 'causes'
- Action 'causes' (+ note, stockée en base privée) : ce qu'il pense être l'origine ; met les leviers correspondants en tête (nouveau levier stress) pour les rappels du soir et le coach.

## 2026-11-03 (16h) — FORME : repas texte en double
- « 250 g de skyr » noté 2× à 24 s d'écart (2 appels meal_text) → logMealText ignore un repas texte de calories proches noté il y a < 5 min. Doublon du jour supprimé.

## 2026-11-03 (16h30) — Vitalité : rappel chaque soir
- Il veut que Dzaryx lui rappelle quoi faire pour son envie : rappel privé à 20h30 (sauf dimanche = bilan), UN geste concret tiré de ses leviers (sommeil, sport, couple, prise de sang, moral, déficit, programme) + une idée d'assiette (base méditerranéenne sourcée) ; rien à acheter sans pharmacien.
- Outil vitalite : 'rappel' quotidien true/false + heure, 'jour' = geste du jour maintenant. Job vitalite toutes les 15 min 6h-22h.

## 2026-11-03 (16h) — B055 : « 6 demi » ≠ 6 dattes
- « j'ai pris 2 demis », « je pris 6 demi aujourd'hui » (= total du jour, n'ajoute que la différence), « 1 comprimé et demi » → noté par le CODE dans le programme privé, réponse directe.
- forme meal_text/meal_fix/food_check refuse un texte de comprimés (rien enregistré, renvoie vers l'outil liberte).
- Prise notée → le rappel à boutons 🕊️ est fermé ; la Conscience ignore ce sujet (plus de « 0/9 » périmé).

## 2026-11-03 (après-midi) — CarPlay : Liberté invisible + widget alerte route
- Sa capture CarPlay montrait « 🕊️ Liberté — étape… » (événement agenda FIK) → titres neutres « 🎯 Objectif perso — étape x/n », « 📞 Appel perso », « 📌 RDV perso », descriptions sans dose ; purge unique des anciens titres (kv liberte:agenda-neutral-v1) ; syncAgenda ne touche plus rien sans accès Google (le VPS avait vidé les ids).
- Widget : photo Audi devant FIK, haut assombri sur CarPlay (logo lisible), alerte route en rouge (verglas ≤ 3°, pluie, vent fort).

## 2026-11-03 (midi) — WIDGET CARPLAY v2, app v243
- Retour Kouider (capture) : mise en page inversée (droite à gauche), Audi mal cadrée, « 0 € aujourd'hui ».
- Widget dessiné en image (DrawContext) → plus d'inversion ; photos dédiées large (Audi à droite, dégradé à gauche) + carré (CarPlay), app_kv car:widget:photo:wide|square.
- Grande température, « PROCHAIN · FIK » + date en or, phrase Jarvis entre guillemets, voitures louées + € du jour ou du mois, heure de mise à jour.
- Script collé = petit chargeur : le rendu vient de GET /api/jarvis/car-widget/script (car-widget-script.ts) → les prochains changements arrivent sans recopier.

## 2026-11-03 — WIDGET CARPLAY (Audi + Jarvis), app v242
- GET /api/jarvis/car-widget (météo réelle, prochain départ/retour FIK sur 14 j, argent du jour, voitures louées, phrase Jarvis qui tourne chaque heure, 0 € sans IA) + /car-widget/photo (photo stylée de son Audi, en app_kv `car:widget:photo`, jamais dans le repo).
- App JARVIS › Cerveau : carte « Ton widget CarPlay » → copie le script Scriptable (jeton inclus) + étapes CarPlay / écran d'accueil. Rouge Jarvis + or, logo hexagone D. Rien de santé sur le widget.

## 2026-11-03 (5h) — B054 Supabase bloqué (quota de transfert) → Dzaryx muet
- Cause : trace GPS (170 Ko) relue/réécrite toutes les 30 s avec la position en direct + fichiers audio 3 Mo relus en base → quota gratuit dépassé, Supabase restreint depuis 02/11 23h21 : jetons d'appareil illisibles → « Invalid token » partout, sauvegarde 402.
- gps-life.ts : trace en mémoire, écrite en base max toutes les 10 min ; my-voice.ts : fichiers audio/média servis depuis la mémoire ; device-auth.ts : liste d'appareils gardée si la lecture revient vide.
- Déblocage : Kouider passe Supabase en Pro.

## 2026-11-02 (nuit) — LE QUOTIDIEN : courses + poubelles remplacées
- Remplacées (à sa demande, sport/santé ou business) par : anglais du jour pour clients FIK (10h) + étirements 5 min avant de dormir (21h45, selon la séance).

## 2026-11-02 (nuit) — LE QUOTIDIEN : 10 options
- quotidien.ts + outil quotidien + job */15 : sac veille de sport, givre, pluie 30 min, courses au magasin, darija+jeu Ibrahim, pause dos au travail, poubelles, montre en charge, caisse du soir, taux € → DA.

## 2026-11-02 (soir) — corrections
- Rappel de lieu : ne sonne plus en boucle (verrou + enregistré avant envoi), pas tout de suite si créé sur place (armement hors zone), option from (pas avant date).
- Ne pas déranger : ses demandes sont exécutées (agenda ignoré → « profite de ta soirée ») ; plus de « à partir de quelle heure je peux te rappeler » chaque matin.
- Séance finie : séries oubliées notées après coup. VFC basse le soir → conseil pour demain.

## 2026-11-02 — Retour salle 7h30 par défaut
- getHomeBy(date, start) : séance du matin sans heure dite → maison 7h30 max (départ + appel recalculés avec le trafic) ; le cerveau ne demande plus l'heure de retour.

## 2026-11-02 — FORME Repas : déficit visé vs réel expliqué + fourchettes glucides/lipides
- « Objectif : déficit d'au moins X » ; carte brûlé : « Déficit à HH:MM » + « ce soir si tu ne manges plus rien » + phrase qui relie les deux.
- macroRange() : lipides 0,8 g/kg (≥20 %) → 35 % kcal, glucides = reste ; affiché avec statut + donné au cerveau.

## 2026-11-02 (soir, 2) — 🧹 23 outils morts cachés + appels résistants au redéploiement
- tools.ts : HIDDEN_TOOLS (Nexus ×7, Obsidian ×6, anciennes vidéos TikTok ×7, netlify_deploy, get_learning_evolution, get_monthly_improvement_report) retirés de Dzaryx_TOOLS (306 → 283). Code gardé : retirer un nom de la liste pour le remettre.
- 9a87a78 tgcall : HTTP 502 du backend (redéploiement Railway) pendant un appel → nouvel essai 6 s après au lieu de OpenAI (sans crédit) + voix de secours lente.

## 2026-11-02 (soir) — 🖼️ FORME galerie + 🚗 discours voiture
- 672ae10 FORME Progrès (app v241) : bouton « Choisir une photo … dans ma galerie » + « Photo de ma galerie + adapter ma séance » ; le bouton Galerie de la caméra n'a plus `capture` (l'iPhone ouvrait l'appareil photo au lieu de la photothèque).
- 4e266ae car-coach.ts : vrai discours de motivation 5-7 phrases (30-40 s) + phrase de boost au re-démarrage < 30 min.
- Raccourci CarPlay de Kouider : audio_url joué via « Émettre un son » (voix Jarvis Gemini TTS).
- Crash-test 21 scénarios : 15 OK · 1 moyen · 5 KO → corrigés : 🔒 « à voix haute / ma femme est là / en voiture avec… » = filtre privé (santé, Liberté, médicament) sur la réponse (orchestrator-engine OTHERS_PRESENT_RX) ; set_private_mode ≠ « mode invité » (n'existe pas) ; darija « bezzaf » jamais « bzaf ». KO Belgique = artefact du bac à sable (le vrai set_cities refuse Liège). Re-test : liberte-prive ✅ mode-invite ✅.
- Crash-test : scénarios mis à jour (jour du retour jamais compté, nutrition via FORME) + darija-oranaise + liberte-prive.

## 2026-11-02 — 🚗 « Bonjour Kouider » en montant en voiture
- car-coach.ts : à l'événement CarPlay (POST /api/jarvis/event type carplay_on), bonjour/bonsoir + 3 phrases de coach business (Grand Coach, doux si journée dure, famille si congé, jamais d'action au téléphone en conduisant) + citation vérifiée avec sa source (20 citations, rotation sans répétition), puis le point pratique existant (carBrief). « Re-bonjour » si moins de 30 min.
- Constat : aucun événement CarPlay jamais reçu (gps:parking vide) → automatisation iPhone à installer.
- Carte du corps FORME : bleu/jaune/rouge exacts (masques CSS) + chiffre sur chaque muscle (app v240).

## 2026-11-02 — FORME : page Objectifs « pro » en images (app v239)
- GoalsVisual.tsx : 📸 évolution en photos (curseur avant/maintenant à glisser, par pose, frise datée avec poids), héros avant → arrivée + anneau du parcours + J-xx, carte du corps colorée par niveau + cartes par zone (image d'exercice, anneau), « aujourd'hui pour ton objectif » (score Sèche), courbe de poids, parcours à étapes « tu es ici », exercices en grandes images (fiche au toucher), conseils en cartes, badges.
- Kouider : « l'évolution avec des images, pas une explication détaillée » → explications cachées derrière « 📖 Voir les explications du coach ».
- Backend goalsOverview : `evolution` = ses 24 dernières photos de suivi signées (+ poids du jour).

## 2026-11-02 — COACH › 🔥 Vitalité (privé) (app v238)
- Nouveau module backend/src/integrations/vitalite.ts : désir (questionnaire IIEF domaine désir 2-10 + note /10), rapports/semaine (objectif 1-2), érections du matin, prise de sang (testostérone vs plage 19-39 ans 264-916 ng/dL), croisé avec FORME, montre, sommeil, LIBERTÉ, moral → leviers calculés sans IA.
- Base de 21 faits sourcés (FACTS) : seule base autorisée pour les conseils ; interactions dangereuses avec l'antidouleur rappelées. Nom du médicament lu dans app_kv (dépôt public).
- Outil `vitalite` (etat/question/rapport/bilan/iief/labo/objectif/rappel/faits), contexte dans le dossier Kouider (cache 10 min), route /api/vitalite (Kouider seulement, pas de jeton FORME invité), job dimanche 21h30 (bilan privé Telegram, IIEF toutes les 4 semaines).
- App : page COACH, onglet 🔥 Vitalité (VitaliteTab.tsx).

## 2026-11-02 — FORME : objectifs vérifiés (rien d'inventé) + suivi automatique (app v237)
- Vérification du plan sur ses vraies photos : corrigé dos noté depuis une photo de face, jours de séance inventés, seuils en cm sans mesure de départ, « vergetures » inventées, abdos promis trop tôt, « 1 séance sur 8 » (ne lisait que FORME).
- Plan : toutes ses poses récentes (face/dos/profil), vraies données imposées (protéines formeTargets, pas, jours du programme), zone non visible = « ? » (now null), filtre peau + filtre jalons en cm sans mesure, règles anti-flatterie et abdos ≥ 16 sem.
- 📅 « Résultats voulus d'ici le » (wantBy, aussi réglable en parlant au coach) → jalon honnête à cette date.
- Auto : défis remplis seuls (séances toutes sources = trainedDays, pas montre, pompes/tractions/dips/squats/gainage depuis l'exlog), jalons cochés seuls (poids, mensurations, séances).
- Suivi avance/retard (vitesse lissée du module Sèche + séances 14 j vs prévues) ; dimanche 19h (forme-weekly) : bilan + si retard → séance refaite et déficit ajusté via la règle Sèche (bornes 250-750, pauses diète), push + Telegram ; interrupteur autoAdjust + bouton « Vérifier maintenant ».

## 2026-11-02 — FORME : Objectifs & défis (app v236)
- Progrès → carte 🎯 « Mes objectifs & défis » : zones (pecs, bras, ventre plat + abdos, épaules, dos, jambes, posture, force), ⭐ muscles prioritaires, objectif avec ses mots, raccourci « haut du corps d'abord, le bas ensuite » (phases).
- Plan lu sur la DERNIÈRE photo : niveau /100 par zone, délai + date d'arrivée, priorités choisies par le coach si rien n'est coché, répartition de la semaine, exercices, deadlines à cocher, mensurations, habitudes, « auxquelles tu n'aurais pas pensé », défis proposés.
- « Mettre ça dans ma prochaine séance », « Faire le point » quand une photo plus récente existe (historique des niveaux).
- 🔮 « Toi à l'arrivée » : fal.ai Nano Banana d'abord (~0,04 $, accord Kouider), plus de crédit → gratuit (HF FLUX Kontext puis Qwen Image Edit). 02/11 : les 2 Spaces HF répondaient « error null » (quota) → à retester.
- 🏆 Défis : quotidien / cumul / record / case, 10 prêts + ceux du coach, séances et pas comptés tout seuls.
- 💬 Coach : questions libres, et il change l'objectif/priorités en parlant (`goalChat`).
- Backend : `forme-goals.ts`, routes /api/forme/goals*, ligne objectif dans formeText.

## 2026-11-02 — FORME : « Reprendre la photo » (app v235)
- Dans « Avant / maintenant » : bouton 📸 Reprendre la photo → caméra même pose (ancienne photo AVANT en transparence), la nouvelle REMPLACE l'ancienne (liste + stockage) et garde la même photo AVANT. « Refaire l'analyse » reste (même photo).
- Backend : `removeBodyPhoto()`, POST /api/forme/body-photo accepte `replace` + `vs`.

## 2026-11-02 — FORME : photo AVANT au choix + minuteur 3 s (app v234)
- `forme/Body.tsx` : dans « Avant / maintenant », bandeau de toutes les photos (même pose d'abord) → toucher une photo la prend comme AVANT et relance la comparaison. Une photo pas encore analysée s'ouvre aussi (analyse lancée).
- Caméra : le gros bouton lance un compte à rebours 3 s par défaut (bip chaque seconde), bouton ⏱ 3 s → 10 s → off (mémorisé), re-appui = annuler.
- Backend : `analyzeBodyPhoto(uid, id, goal, vsId)` + POST /api/forme/analyze { id, vs }.

## 2026-11-02 — Argent réel : questions « total » sans invention
- `argent-direct.ts` : « j'ai combien au total / en tout / d'argent ? » et « c'est quoi mon épargne ? » partaient encore au cerveau (risque de chiffre inventé) → maintenant calculés par le code (épargne + cash). « combien de clients/réservations/messages au total » n'est plus pris pour de l'argent (pluriels FIK reconnus).

## 2026-11-02 — FORME : montre en direct (app v232)
- `jarvis-hub.ts` : chaque envoi Santé note `health:lastsync`. `routes/forme.ts` : GET /api/forme/watch-sync.
- `forme/App.tsx` : à l'ouverture/retour sur FORME, si la montre n'a rien envoyé depuis 20 min → lance le Raccourci « Dzaryx Santé » (1×/20 min, 5h-23h). Réglage « ⌚ Montre en direct » pour couper.


## 2026-11-02 — FORME en direct + argent réel (v231)
- FORME › Séance : séance du jour faite → carte « ✓ Séance du jour faite » + la PROCHAINE séance (plus de « Aujourd'hui · Démarrer » après l'avoir faite).
- Forme du jour : toujours un score (VFC/cœur les plus récents ≤ 3 j + sommeil de la nuit, `effectiveToday` dans workout-live.ts) + ⚡ énergie en direct (récup − heures éveillé − séances du jour) ; heure de réveil = 1er sommeil reçu (`kouider:woke`) ; l'écran se recalcule à l'ouverture, au retour sur l'appli et chaque minute.
- Calories : `burnedNow` (base au prorata de l'heure + activité déjà faite, montre si elle a envoyé) → « Brûlé jusqu'ici / Déficit maintenant » en direct + fin de journée prévue ; rafraîchi chaque minute.
- Argent : `argent-direct.ts` — « hier j'ai fait 300 avec le snus », « cash 2400 », « combien j'ai gagné hier ? », « quel jour je gagne le plus ? », « je suis à combien tout confondu ? » exécutés PAR LE CODE dans l'orchestrateur (le cerveau disait « Noté » sans rien noter puis inventait 7 950 €). mes_finances + 'gains' / 'meilleur_jour' / 'total' / 'cash'. « épargne 15 000 » met aussi à jour les finances perso.

## 2026-11-01 soir — FORME : calories fiables + page SÈCHE
- 1c4d562 calories : produit exact (marque/étiquette, code-barres → Open Food Facts), ❓ question quand un aliment est ambigu, outil forme `meal_fix` (correction par message, sans double compte), eau ≠ repas, envoi montre du matin pas pris pour la journée.
- 171c3d8 onglet **Sèche** (Kouider seulement, remplace Course ; ami/femme gardent Course) : poids tendance lissé, vitesse %/sem, dépense adaptative (après 10 j notés), force 1RM, score du jour, bilan hebdo + bouton « Appliquer », tour de taille ; backend `forme-cut.ts`, `/api/forme/cut(+/apply)`, outil forme `food_cut`.

## 2026-11-01 — Sport : changer la séance d'un jour + FORME : calories brûlées et déficit réel + exos maison à 21h
- « Demain lundi au lieu des épaules je fais les bras » : sport_coach swap accepte le NOM de la séance du programme ; un swap efface aussi une séance dictée (plan_day) ce jour-là et réactive un jour annulé. App FORME › Entraînement : bouton « 🔁 Changer la séance de ce jour » (POST /api/sport/swap).
- FORME › Repas : carte « 🔥 Calories brûlées aujourd'hui » = brûlé (base + montre) − mangé = déficit réel vs visé, bouton « ⌚ Mettre à jour avec ma montre » (lance le raccourci Dzaryx Santé), bouton « 🏠 Exercices maison » (GET /api/forme/food/burn).
- 21h (job forme-food) : s'il n'est pas en déficit → bilan + circuit maison sans matériel chiffré en MET (tours de 5 min, 30 min max, sans jambes lourdes ni charge sur le dos). Outil forme action home_burn. Avant 20h45 la dépense montre n'est pas encore envoyée (raccourci à 22h) → ajouter une automatisation 20h45.

## 2026-11-01 — Retouche IA : bascule gratuite quand le crédit fal est à 0
- Photo « Max » sans crédit → FLUX Kontext gratuit tout seul. Vidéo : Kling d'abord ; crédit épuisé (avant ou pendant) → Space HF gratuit « Qwen video edit » par tranches de 2,8 s (16 i/s, 368×656 remis en 1080×1920), son d'origine gardé.
- Limite réelle : quota ZeroGPU gratuit du compte HF ≈ 3 min GPU/jour, 1 tranche ≈ 190 s → ≈ 3 s de vidéo gratuite par jour. Pour du gratuit en volume : Kaggle GPU (vérif téléphone) ou clé Pollinations.

## 2026-11-01 — MONTAGE : 🪄 Retouche IA (photo + vidéo) + envoi des grosses vidéos
- Nouvel onglet « 🪄 Retouche IA » : photo/vidéo + phrase (« remplace la voiture par une Ferrari Purosangue »). Photo = FLUX Kontext HF (0 €, ≈ 30 s), qualité max = Nano Banana fal (≈ 0,04 $). Vidéo = Kling O1 edit (fal, ≈ 0,17 $/s, max 30 s) par tranches ≤ 10 s guidées par la même image de référence, son d'origine gardé ; devis affiché avant.
- Vidéos > 45 Mo (limite Supabase 50 Mo) : envoi en morceaux de 40 Mo → /api/studio/upload-join recolle + compresse en 1080p (testé : 4K 24 s 296 Mo → 48 s). Cause de l'échec de la vidéo de 24 s.
- Outil video_studio action="retouche" (photo directe, vidéo seulement après accord sur le prix). Fichier : backend/src/marketing/ai-edit.ts.

## 2026-11-01 — B053 : faux refus « pas accès aux données » + Conscience anti-radotage
- fastPathGuard : « tu as gagné » / « tes revenus » autorisés quand Kouider a lui-même donné des montants ; une somme inventée reste bloquée.
- Conscience : ignores_24h dans ce qu'elle voit + règle « type ignoré 2× en 24 h → silence 24 h ».

## 2026-11-01 — Promesses : auto-clôture + « tout est réglé »
- Promesse rappelée sans réponse depuis 3 jours → fermée seule ; la Conscience ne parle plus des promesses en retard de plus de 2 jours.
- Outil promesses : action done_all (« toutes mes promesses sont faites », « tout est réglé »).

## 2026-11-01 — B052 : fausses promesses en retard
- Gardien des promesses : ignore les promesses vagues / déjà faites / refus déjà donnés ; toutes les anciennes marquées tenues (Kouider : « tout est réglé »).

## 2026-11-01 — B051 : boutons 🧠 « Outil inconnu »
- Conscience : outils inventés par l'IA filtrés contre Dzaryx_TOOLS ; choix d'un bouton sans outil → cerveau complet (processMessage) qui exécute vraiment l'action.

## 2026-11-01 — Règle Kouider : 1re réponse location = dates + âge
- Brouillons WhatsApp, lecture d'une discussion (appel/Telegram) et gardien de nuit : à une demande de location, la PREMIÈRE réponse demande toujours les dates (début/fin) et l'âge du conducteur, sans liste de voitures ni prix. Filet : si le brouillon l'oublie, la question est ajoutée (FR ou arabe).

## 2026-11-01 — B049 : brouillon WhatsApp jamais montré + faux « pas accès aux données »
- Garde fast-path : le motif argent `[\d\s,]+\s*(da|€…)` matchait « dans », « dates » (aucun chiffre requis) → réponses légitimes remplacées par « ⚠️ Je n'ai pas accès aux données en temps réel ». Chiffre + fin de mot obligatoires ; montants donnés par Kouider lui-même = pas bloqués.
- « Montre / monte-moi le message » → le brouillon WhatsApp en attente est affiché tel quel (sans IA) et reste en attente (« oui » l'envoie).
- La relecture `whatsapp_web send` devient le brouillon en attente (la version réécrite, pas l'ancienne) ; vidée après envoi.
- Décision à boutons « Envoyer au client » : le texte du message est maintenant dans la notification.
- tgcall : 502/503/504 (Railway qui redémarre pendant un push) → message clair au lieu de « Petit souci technique ».

## 2026-11-01 — FORME : prise de masse pour son ami + audit d'accès + course ↔ salle (app v227)
- Objectif « muscle » d'un invité = SURPLUS calorique (lent/normal/rapide : +250/+350/+500 kcal) au lieu du déficit ; Kouider garde son DÉFICIT (« je veux un déficit et me muscler ») sauf s'il fait lui-même le questionnaire.
- Questionnaire prise de masse (7 questions : corps, poids visé, physique, niveau, appétit, semaine/travail/autres sports, rythme) → plan chiffré (kcal, protéines, glucides, lipides, kg/mois, date d'arrivée, conseils) — `bulkPlan` sans IA ; s'ouvre tout seul pour l'ami.
- Coach repas des invités : n'est plus « Dzaryx, bras droit de Kouider » ; selon SON objectif (prise de masse = l'encourager à manger assez). Coach photos/séances : la règle « dos à ménager » de Kouider ne s'applique plus aux autres hommes ; gros exercices (développé couché, squat, tractions…) ajoutés pour les hommes ; règles hypertrophie ; programme refait au 1er questionnaire.
- Audit : toutes les routes /api/forme lisent l'utilisateur du jeton ; photos dans `<uid>/` (bucket privé, liens temporaires) ; jeton invité valable seulement sur /api/forme ; Dzaryx ne lit pas le suivi de l'ami.
- Kouider : ses sorties de course (FORME) entrent dans le coach de salle en direct et le message du réveil (jambes chargées → leg day allégé) ; kcal des sorties comptées au budget repas si la montre n'a pas mesuré la journée.

## 2026-11-01 — FORME COURSE « PRO » après l'analyse de 20 applis (app v226)
- `forme-runs-pro.ts` : VO2max (VDOT Daniels, vérifié : 5 km 25:00 → 38,3) + temps prévus 5/10/semi/marathon + allures d'entraînement ; charge d'entraînement forme/fatigue/fraîcheur (CTL/ATL/TSB) + alerte montée trop rapide ; plans guidés (débuter 0→5 km, 5 km, 10 km, semi : semaines de récup, semaine de course) ; « Mes parcours » = même trajet reconnu + classement ; météo au départ (Open-Meteo) ; chaussures (km d'usure) ; défis du mois + 12 badges ; export GPX ; analyse du coach IA ; suivi en direct public (?suivi=…, lien secret 24 h).
- App : séance guidée pas à pas (étape, compte à rebours, voix à chaque changement, « accélère / ralentis »), cadence pas/min (accéléromètre), bouton « Envoyer le suivi », cartes Ma forme / Charge / Défis / Plan, chaussures + suivi dans les réglages.
- Splits = temps en mouvement (avant : la pause comptait dans le km).

## 2026-11-01 — FORME : appli de son AMI + COURSE GPS façon Strava (app v225)
- 3e profil FORME « ami » (lien d'invitation comme sa femme, réglages → « L'appli de mon ami ») : SON suivi à lui, rien en commun avec Kouider, jamais lu par Dzaryx, pas de jeux du couple, pas de Wegovy, en français.
- Nouveau `forme-runs.ts` + onglet COURSE : course/marche/vélo/rando au GPS, carte en direct (OpenStreetMap), chrono, allure instantanée/moyenne, pause auto, tours, voix tous les X km, allure cible, objectif distance/durée, course contre son « fantôme », mode poche, écran gardé allumé, sortie gardée sur le téléphone (reprise après crash).
- Après la sortie : carte colorée par l'allure + bornes km, splits (temps en mouvement), courbe allure/altitude au doigt, meilleurs efforts 400 m→marathon + records, image à partager, ressenti/note. Tableau de bord : semaine vs objectif, mois/année/total, 12 semaines, calendrier 6 mois, records, tendance d'allure.
- BUG trouvé au test : lien invité en français = boucle infinie de rechargement (arabe par défaut → profil fr → reload). Langue gardée sur le téléphone + `&l=fr|ar` dans le lien et l'icône d'accueil.

## 2026-11-01 — PLAN ALGÉRIE (mes_finances action 'algerie')
- Nouveau `algerie-plan.ts` : date de départ quand maison + frais 7 % + meubles + voiture + déménagement sont PAYÉS (+ 6 mois d'avance), avec et sans le projet business.
- Vie à Oran mois par mois : budget détaillé (vie de famille, école privée du fils selon son âge, voiture, santé, CASNOS, CAT-NAT, voyages, imprévus, impôts IFU, zakat) → « salaire » = ce qui reste.
- Investissements lancés seulement si 6 mois de dépenses restent après paiement (le moins cher d'abord) : voitures de location à soi (prix FIK réel/jour), appartement F3 à louer, salle des fêtes (saison des mariages) ; année par année, retour sur investissement.
- PDF 4 pages : départ + graphique, budget DA/€, business, « ce à quoi tu n'avais pas pensé », sources. Réglages « clé=valeur » retenus dans perso:finances.algeriePlan.

## 2026-11-01 — Projection : quitter la librairie = déménager à Oran
- Scénario départ : fin salaire + charges belges + snus ; voiture + maison à Oran (comptant ET crédit comparés : mensualité, apport, 6 mois d'avance), vie en Algérie, patrimoine = liquide + maison − reste du crédit.
- Dates « prêt à partir » (crédit / comptant), clients minimum pour que partir vaille rester, conditions (revenus prouvés pour le crédit).
- Défauts sourcés (ALGERIE_DEFAUT) modifiables : maison_da, voiture_da, vie_da, taux, duree, apport, appoint_algerie (retenus dans perso:finances.algerie ; essai = test).

## 2026-11-01 — Projection : « Quitter la librairie ? » + matériel à tester
- Avec un projet : point de liberté calculé (70 % du cash gardé ≥ salaire + heures sup ET 6 mois de charges + vie de côté), scénario démission vs rester (courbes), clients minimum pour partir, conditions avant de démissionner (page dédiée du PDF).
- `projet_invest` (matériel à tester sans l'enregistrer), `quit` (date), `clients_after_quit`.

## 2026-11-01 — Projection : objectif (« 100k d'ici 2028 ») + scénario « et si j'ajoute un projet business »
- `mes_finances` projection + `target` : objectif retenu (perso:finances.goal), date d'atteinte par scénario, ce qu'il faut changer (cash gardé, épargne/mois, FIK, clients du projet) ; ligne objectif sur le graphique.
- `projet` / `offer` / `clients` / `projet_start` : ajoute la part de Kouider d'un projet de `projet_business` (montée 1/3 → 2/3 → 100 %), comparé à la courbe sans le projet. Helper `projetForProjection` (projets-business.ts).

## 2026-11-01 — Projection perso « où je serai en 2028 » : vrai calcul + PDF avec graphiques
- Nouveau `perso-projection.ts` : mois par mois (salaire + heures sup + appoint net des commandes de stock + bénéfice FIK réel des réservations − charges avec fin du crédit − dépenses de vie), 3 scénarios, PDF 3 pages (courbes, mois type, FIK 12 mois, trimestres, hypothèses, analyse 100 % calculée sans IA) → Telegram.
- Outil `mes_finances` action `projection` (+ réglages side_days / order_cost / order_every_days / order_pieces).
- « Le rapport : qui tu es » : règles anti-invention (plus d'événements familiaux inventés à partir de bribes), CA du mois écoulé seulement, finances perso injectées.
- Rapport santé : mention sommeil mise à jour (mesuré depuis le 01/11).

## 2026-11-01 — Sommeil Apple Watch : enfin reçu + coach sommeil qui s'adapte chaque semaine
- Raccourci « Dzaryx Santé » : case sleep = Échantillons Sleep · Durée ; phases « 5:28 » = min:s lues correctement (jarvis-hub.ts, 8a11ce8/f2f8a8d) ; « j'ai dormi 7h » remplit aussi health:daily (life-coach.ts).
- sleep-coach.ts : nuit + moyenne 7 j + dette + tendance → ligne injectée dans TOUTES les conversations (jarvis4Context), le message du réveil, le mentor business ; coucher du soir avancé (plan + dette) ; bilan dimanche 20h (job sleep-weekly) : pas de progrès = un levier de plus (coucher −30 min → écrans/café → sport plus tôt → business coupé le soir → plan fort/médecin), progrès = on garde, objectif tenu = on relâche ; outil sommeil (etat/bilan/reset).
- Radars : plus de fausse alerte au réveil (saut GPS) — 2 mesures en mouvement + jamais à < 500 m de la maison (8bd6514).

## 2026-10-31 23h — FORME : compteur calories photo (style Cal AI) + coach déficit/sommeil sur Telegram (app v224)
- forme-food.ts : photo du plat → aliments, grammes, kcal, protéines/glucides/lipides (vision gratuite, cuisine algérienne/halal) ; budget = métabolisme de base + calories actives de la montre − déficit (500 par défaut, 0-750, plancher 1500) ; correction des grammes ; « j'ai mangé… » en texte ; « si je mange ça ? » (marche/pompes pour compenser).
- Routes /api/forme/food (+ /photo, /text, /edit, /cfg) ; onglet Repas dans FORME ; outil forme meal_photo / meal_text / food_check / food_today / food_settings / food_morning ; photo de plat sur Telegram → analysée.
- Job forme-food */15 4-22h : message du réveil (nuit de la montre → sport/business/moral + budget, séance allégée si < 6 h), collations 10h/16h, rappel photo du midi, « ce soir il te reste X », avant de dormir (bilan + heure de coucher + montre). Envoi Santé du matin avec le sommeil → message du réveil tout de suite.
- Règles « jamais de nutrition » assouplies : pas de plans repas/courses, mais compteur calories autorisé (life-coach, tools, constants, formeText).

## 2026-10-31 21h — FORME : stats pro (10 grosses applis) + reprise de séance + page COACH réparée (app v223)
- forme-insights.ts + GET /api/forme/insights : objectif semaine (anneau) + semaines tenues, séries par muscle 7 j vs zone 10-20, calendrier 12 semaines, badges, tendances montre 30 j (VFC, cœur, pas, sommeil) — onglet Progrès + anneau en tête de Séance. sport-coach exerciseMuscles().
- Séance en cours gardée sur le téléphone (forme:live) → bandeau « Reprendre » ; note par exercice gardée (forme:exnote:*).
- Page COACH : les boutons du Grand Coach (texte sur une ligne) élargissaient la page → contenu coupé à gauche sur iPhone ; grille minmax(0,1fr) + texte qui passe à la ligne.

## 2026-10-31 20h30 — Sommeil de la montre : lecture robuste
- jarvis-hub receiveHealth : durées de sommeil lues ligne par ligne en heures (« 25200 », « 420 », « 7 h 12 min », « 1:35:00 »…), lignes « Au lit » / « Éveillé » ignorées, plafond 16 h ; dernier envoi brut gardé 7 j (kv health:lastraw:any) pour vérifier le format. Kouider dort avec sa montre la nuit du 31/10 pour tester.

## 2026-10-31 20h — FORME + montre (gratuit) : idées de Whoop, Strava, Nike Training Club, Freeletics, Apple Fitness (app v222)
- ⌚ Forme du jour (Whoop/Fitbit) en haut de Séance : anneau de récupération (readiness), VFC / cœur au repos vs habitudes, pas, sommeil, tendance 14 j — données de l'Apple Watch via le raccourci Santé (GET /api/forme/watch). Guide « Dzaryx depuis ma montre » (Siri « Dzaryx » sur la Watch).
- 🔊 Coach vocal (NTC) : annonce exercice / charge, « encore 10 secondes », « c'est reparti ».
- 😌👍🥵 Ressenti par exercice (Freeletics) : noté dans la séance → sport-coach suggestRaw +2,5 kg si facile, −2,5 kg si dur ; routines idem (fb dans exlog).
- 📤 Carte de séance à partager (Strava) : image 1080×1350.
- Plus de passage automatique à l'exercice suivant (le ressenti le fait).

## 2026-10-31 19h — FORME façon Hevy + Strong + Fitbod réunis (app v221)
- Images manquantes : exercices sur mesure sans photo → photo de l'exercice le plus proche (matchExerciseId/fillDemos, cache sport:exlib:match) dans GET /api/sport.
- Mes routines (créer/modifier/supprimer, kv <uid>:forme:routines) + Séance libre ; « Précédent » repris de l'historique (GET /api/forme/exlast).
- Mode séance : types de série W/D/F, échauffement auto (50/70/85 %), calculateur de disques, Remplacer (même muscle) / ＋ Ajouter un exercice, record battu en direct, résumé par exercice ; toutes les séries vont aussi dans l'historique des fiches (POST /api/forme/exlog-batch).

## 2026-10-31 18h — FORME : courses supprimées partout + Séance « pro » façon Hevy/Fitbod (app v220)
- Serveur : routes et code repas/semaine/liste de courses du foyer/Open Food Facts supprimés (5873ec2) ; consigne du coach de vie : jamais repas ni courses.
- Onglet Séance refait : pastilles de la semaine, carte du jour avec exercices en images, carte de RÉCUPÉRATION du corps (vert/orange/rouge), stats + graphe séances/semaine, records, historique.
- Mode séance en direct : chrono, tableau SÉRIE | PRÉCÉDENT | KG | REPS | ✓ (séries validées en vert, + ajouter une série), barre de repos en bas (−15/+15/Passer), résumé de fin (durée, volume, séries, RPE).

## 2026-10-31 17h — Page COACH = coach de vie ; FORME refaite (style « Library »), scanner de machines, zéro nourriture (app v219)
- Page COACH (menu Plus, 🏆) : Grand Coach + Ma vie (sortis de JARVIS). FORME = le sport.
- FORME refaite au style de la vidéo TikTok de Kouider : fond lavande, onglets Séance / Exercices / Scanner / Progrès, bibliothèque avec bonshommes de muscles, filtre matériel, marque-pages, fiche À propos / Historique / Progrès + YouTube / Partager.
- 📷 Scanner : photo d'une machine → appareil reconnu, réglage, 4-8 exercices en images (free-exercise-db) + lien vidéo YouTube ; « Mes machines » gardées (kv <uid>:forme:machines). Route POST /api/forme/machine, testé : presse à cuisses reconnue en 18 s.
- Nourriture retirée : écrans Semaine/Courses/outils nutrition supprimés, plus de rappels repas/eau, plus de semaine de repas le dimanche, formeText et outil `forme` sans nutrition (actions week/shopping/regenerate retirées, + action machines).
- Les dessins 3D de la vidéo sont la propriété de Gym visual (licence payante) → photos libres free-exercise-db à la place.

## 2026-10-31 15h20 — Appels : oui obligatoire, tâches de fond, mémoire propre (663fd09)
- confirmed:true / CONFIRMÉ refusé dans tgcall si sa dernière phrase n'est pas un oui.
- ask_dzaryx background:true : étude/PDF/site en fond, résultat glissé dans l'appel ou sur Telegram ; questions générales répondues sans le cerveau.
- Résumés d'appel sans technique (coupures, allô) ; 2 souvenirs faux du 31/10 supprimés de callmem:kouider.
- Testé sur gemini-3.8-live : étude → background, rappel → « je te programme ça ? » puis exécuté après « oui vas-y ».

## 2026-10-31 15h — Appels : Gemini Live 3.8 (46396a1)
- Appel 13h57 : coupure 1011 + « allô ? » au bruit + motif absurde (« sa femme m'a dit ») hérité du rappel de 12h56.
- Backend choisit maintenant gemini-3.8-live puis 3.1-flash-live (testés avec vraie config : 0 coupure, ~0,9 s), 2.5 native-audio en secours.
- NOISE_RULE : plus de « allô ? / je t'entends plus » sur un bruit, pas de phrase répétée.

## 31/10 — APPELS : il te comprend mieux au téléphone
- `tgcall/dzaryx_tg.py` : quand c'est Kouider qui appelle, plus de « ta femme a décroché » (call_back_later refusé) ; end_call refusé tant qu'aucune phrase de lui n'a été comprise (12h56 : raccroché sans l'avoir entendu).
- `tgcall/realtime.py` : reprise après coupure Gemini sans « Pardon, petite coupure » ; même demande ask_dzaryx envoyée 2 fois → faite une seule fois (30/10 17h58 prise Liberté en double) ; modèle Gemini noté dans les logs.
- `tgcall/gemini_live.py` : un mot seul en minuscules hors liste (« very », « see », « sur ») = bruit ; ce qui est ignoré est maintenant écrit dans les logs.
- `backend/src/api/routes/call.ts` : outil rapide quick_liberte (prise / état / envie) au lieu de ask_dzaryx (44-55 s).

## 31/10 — B049 + B050
- `integrations/readonly-agent.ts` : outil whatsapp_lecture (unread/drafts/status) → les messages 🔮 « préparé avant que tu demandes » lisent enfin WhatsApp.
- `nexus/modules/free_llm.py` + `browser_agent.py` : navigateur (Air Algérie, browser_task) sur Gemini gratuit d'abord, Claude en secours (NEXUS_BROWSER_PROVIDER=claude pour forcer).

## 31/10 — COACH ARGENT + PROJETS BUSINESS
- `integrations/argent-coach.ts` (outil mes_finances, nouvelles actions) : caisse du jour (vente cash/carte, commande de stock, dépense + garde-fou 80/100 % du budget), bilans semaine (dimanche 18h) et mois (le 1er : vrai revenu total + compteur Oran), compteur départ Oran, crédit (remboursement anticipé, indemnité belge), valeur de l'heure, fonds d'urgence, zakat (nissab or, rappel 3 j avant), cagnottes. Job `argent` */15 9-22h : « combien aujourd'hui ? » à 20h30 + rappel de stock. Données privées app_kv perso:journal / perso:argent.
- `integrations/projets-business.ts` (outil projet_business) : projet + associé + partage, offres (prix client DA/€, coût technicien), coûts (invest / mensuel / par client) → chiffres exacts au taux square (marge par client, part de chacun, rentabilisation, scénarios 5-40 clients), étude de marché + business plan PDF (recherche web + ses finances) sur Telegram. Données app_kv projets.

## 31/10 — FINANCES PERSO : outil mes_finances
- `integrations/perso-finances.ts` : emploi salarié, salaire, charges fixes (avec date de fin), épargne mensuelle, revenu d'appoint, épargne — données PRIVÉES dans app_kv `perso:finances` (rien dans le dépôt public). Injecté dans le dossier Kouider (privé, jamais dans un document pour un tiers), compté dans « ma fortune » (épargne + crédits restants en dette) et dans le Miroir du futur (épargne mensuelle, crédit déduit).

## 31/10 — B048 : mentor business planté (signature Gemini) corrigé
- Appels d'outils venus d'un autre cerveau → signature « skip_thought_signature_validator » pour Gemini 3 ; mentor relancé 45 min plus tard si tout est saturé.

## 31/10 — MIROIR DU FUTUR : « si je continue comme ça, je serai quoi dans 1, 2, 5, 10 ans ? » (app v217)
- `integrations/grand-coach-futur.ts` : CA/bénéfice 12 mois réels → projection 1/2/3/5/10 ans « comme ça » vs « meilleure version » (croissance nécessaire pour l'objectif CA du GPS de vie, plafonnée à l'objectif puis +15 %/an), épargne = part « répartition », fiabilité selon les mois de données, portrait IA (entrepreneur + personne) + 3 changements. Ton : lucide sans humilier, pas de verdict famille/santé avant 3 semaines de mesures, patrimoine « non renseigné » plutôt que 0.
- Score d'évolution /100 (4 piliers) : photo chaque dimanche 22h → courbe ; envoyé le samedi avec l'équilibre ; projection complète le 15 de chaque mois. Actions grand_coach futur / evolution ; app JARVIS › Coach › 🔭.

## 31/10 — GRAND COACH + : 20 capacités pour l'accompagner toute la journée (app v216)
- `integrations/grand-coach-plus.ts` : vocal du coach (Gemini TTS) après le texte de 7h15, compte à rebours avant le départ de Belgique, GPS arrivée au travail → mission de la pause, sas de décompression avant la maison (GPS, 15h30-22h30), lettre du Kouider de 2036 (1er du mois), pré-mortem du mardi, bocal des victoires (auto 21h30 + « victoire : »), anti-procrastination 16h + report au lendemain (max 2 fois), score de parole (samedi), technique de négo / gym du vendeur notée /10 (12h30, un jour sur deux), Principes de Kouider (réservation annulée/refusée → règle), lettres à Ibrahim (dimanche 10h), mentor du mois, toi vs il y a 30 j, liste « j'arrête de… » (mercredi), défi épargne 52 semaines, baraka du vendredi, geste pour sa femme (mardi/samedi).
- Le coach sait se taire : fenêtres souples de 90 min, attend s'il conduit (gps:state) ou en « ne me dérange pas », budget 7 messages/jour hors messages principaux. Sections ajoutées aux messages existants plutôt que des messages en plus.
- Hook dans gps-life.ts (onGps). Testé sur le VPS (compte à rebours, pré-mortem, objection notée, toi vs 30 j, lettre 2036, geste, baraka).

## 31/10 — LE GRAND COACH : 10 options business + 10 options coach de vie (app v215)
- Recherche : Rebrab (Cevital), Yassir, Dangote, statut auto-entrepreneur ANAE (0,5 %), label startup (LF 2026) + classiques (Buffett, Munger, Bezos, Jobs, Hormozi, Dalio, Kroc, Walton, Ibn Khaldoun…) → `integrations/grand-coach-sages.ts` (23 grands, 12 livres, 10 démarches statut Algérie).
- `integrations/grand-coach.ts`, outil `grand_coach`, job `grand-coach` */15 6-22h, contexte dans kouider-dossier, routes GET /api/jarvis/coach + POST /coach/action, app JARVIS › 🏆 Coach.
- BUSINESS : tableau du patron, rythme du mois (objectif auto +20 % ou « objectif du mois X € »), rentabilité par voiture 90 j, 3 actions qui rapportent (« fait 1 » + série), réveil des anciens clients (messages prêts), répartition de l'argent encaissé 50/30/20, délégation (ton heure vaut…), statut & indépendance en Algérie (10 étapes), revue du patron vendredi 17h, trésorerie 30 j.
- VIE : texte du matin 7h15 (histoire vraie d'un grand + leçon du jour), suivi 12h30 + bilan 18h30, « que ferait X à ma place ? », livre du mois, défi de la semaine (lundi), cercle d'or (réseau Algérie, mardi), examen du soir (Franklin), vision 10 ans/1 an/mois, mode tempête, équilibre des 4 piliers (samedi 10h). Jours de congé : pas de business.
- Testé sur le VPS avec les vraies données (tableau, rythme, voitures, anciens clients, trésorerie, statut, texte, grand, livre, tempête) ; pas encore vu tourner en planifié sur Railway.

## 31/10 — Vidéos IA : Kling d'abord, Hugging Face gratuit quand plus de crédit (app v214)
- Choix de Kouider : modèle par défaut = Kling 3.0 Pro (fal.ai) partout (app, outil video_studio, vidéos auto de la semaine). Erreur de crédit fal → app_kv studio:fal_empty_until 6 h + plans restants faits en Hugging Face (FLUX → Wan 2.2), message Telegram le signale. /api/studio/options renvoie defaultModel.

## 31/10 — Photo → vidéo IA façon Higgsfield (app v213)
- Onglet Pub IA : mode « 📸 Photo → vidéo IA » (ex-« Plan unique ») + bouton « Envoyer une photo de mon téléphone » ; texte facultatif si photo.
- Testé sur le VPS : photo Clio 4 → Wan 2.2 = la voiture sort et tourne (92 s, gratuit). Sur Railway il faut HF_TOKEN dans les Variables, sinon quota anonyme minuscule → animation simple.

## 31/10 — Pub IA en 1 clic (app v212)
- Onglet 🤖 Pub IA : gros bouton « 🎬 Créer ma pub (1 clic, gratuit) » = scénario + rendu direct, toujours voix off + sous-titres + signature FIK. Idée facultative (vide = Dzaryx choisit). « ✏️ Voir et modifier le scénario avant » garde l'ancien parcours.
- Textes Autolux → FIK Conciergerie dans les types de pub.
- Vérifié en prod : montage auto de 5 photos (e93dd858) = 19 s, voix off, sous-titres, clé dorée à la fin.

## 31/10 — MONTAGE pro : éditeur façon CapCut + montage auto + signature FIK
- Méthode Replica (vidéo TikTok) appliquée à CapCut/Higgsfield : fonctions recensées + avis (CapCut : options devenues payantes, filigrane, export bloqué ; Higgsfield : crédits qui fondent, prélèvements surprises) → tout gratuit, sans filigrane, sans limite.
- App v211, page MONTAGE : onglet ✂️ Éditeur (import vidéos/photos direct vers le stockage, aperçu, timeline, couper/couper ici/déplacer/dupliquer/supprimer, vitesse ×0,25→×3, volume, textes, musique avec ducking, 6 filtres, sous-titres auto 4 styles, formats 9:16/1:1/16:9, signature on/off) + « 🪄 Dzaryx monte tout ». Onglet 🤖 Pub IA = studio existant.
- Backend montage-pro.ts : Whisper Groq mot à mot, jump cuts, zooms punch-in, fond flouté si format différent, accroche/CTA/légende écrits par Dzaryx, voix off si rushes muets. Routes /api/studio/edit, /upload-url, /edit/options ; outil video_studio action=edit.
- Signature vidéo FIK (clé dorée, filigrane CapCut retiré) ajoutée à la fin de chaque vidéo ; vidéos auto mercredi/vendredi/TikTok passent par MONTAGE gratuit.
- Testé hors ligne (auto 9:16 + manuel 1:1). Pas encore testé en vrai sur Railway ni avec un gros fichier (limite Supabase 50 Mo).

## 31/10 — MONTAGE gratuit (vidéos IA à 0 €)
- Page STUDIO VIDÉO → MONTAGE (app v210). Nouveau modèle par défaut « gratuit » : une image IA par plan (Pollinations, sans clé, 1 image / 45 s, réessais + réutilisation d'image si saturé) animée au montage façon caméra (drone, approche, travelling, zoom…), voix gratuite (Gemini TTS puis Google), sous-titres, accroche, CTA. ≈ 1 min par plan, 0 €.
- Outil video_studio : gratuit par défaut, Dzaryx enchaîne plan → rendu sans demander ; Kling/Veo/Seedance (fal.ai) seulement si Kouider les demande. Musique IA coupée en gratuit.
- Testé hors ligne : 2 plans + voix + montage = 8 s en 2 min. Pas encore de vrai mouvement vidéo (attend GPU : PC de Kouider ou Kaggle).

## 30/10 — Location 11 j, radars, appel après étude, retard salle
- Location : le jour du retour ne compte JAMAIS (29/10 → 09/11 = 11 j × 40 € = 440 €), même rendue l'après-midi (rentalDays + prompt + tests).
- RADARS (flashé à Simonis) : speed-cameras.ts — alerte Telegram + notif avant chaque radar fixe devant lui (OpenStreetMap, miroirs + pause 10 min si saturé ; + endroits où il a été flashé) ; outil `radars` flash/amende/paye/list/on/off ; job 10h rappels de paiement 7 j / 2 j / jour J et « courrier reçu ? » après 21 j.
- Usine à business : étude finie → appel avec prix, marge, premier test (8h-22h, respecte ne pas déranger).
- Salle : le retard se calcule aussi au chrono (séries dictées en retard ≠ retard réel), alerte une seule fois et seulement au-delà de 5 min.

## 30/10 — Bugs de l'échange du jour
- Thinkdiag 2 : « Oui fais-le » → usine_business a bien tourné (étude + page) mais le garde-fou anti-invention l'a pris pour une fausse action et a répondu EN ARABE. Outils Jarvis qui lancent un vrai travail ajoutés aux actions reconnues ; langue des messages de garde détectée sur SES mots seulement (sans les consignes [Contexte…]) et, pour Kouider, darija seulement s'il écrit en lettres arabes.
- Atelier : la page Thinkdiag citait Bruxelles 4 fois → règle de discrétion clients dans le prompt de l'atelier ; page corrigée (« importé d'Europe »).
- GPS : flashé par un radar à Simonis en route vers la salle → « je te vois au travail, tout va bien ? ». L'arrivée au travail attend maintenant 4 min sur place.
- Fin de séance : le modèle inventait « Épaules jeudi » (jour de repos) → op=stop renvoie la vraie prochaine séance du planning.
- Liberté : appel 12h30 « tu es descendu à 6 demis » alors qu'aujourd'hui = dose de départ → le 1er palier n'est plus compté comme une baisse (appel, message du matin, veille, « j'allège ? »).
- Départs : appel « pars pour Belgique, 3 min de route » alors qu'il était déjà au travail → trajet travail/salle à ≤ 4 min et < 1,5 km avec GPS frais = déjà arrivé ; « ✈️ Belgique » se dit « le travail ».

## 30/10 — Conscience : plus de « hier » pris pour « aujourd'hui »
- 09h20 : « Djillali t'a envoyé un message… sa location a démarré à 09h00 » alors que tout datait de la veille. La Conscience recevait des dates brutes sans la date du jour : maintenant date_du_jour + dates relatives (aujourd'hui / hier / demain), état de chaque location (EN COURS / DÉPART / RETOUR AUJOURD'HUI), heure de réception des messages WhatsApp, brouillons WhatsApp de plus de 12 h ignorés.

## 30/10 — Coach de vie+ : identités et votes, revue de vie, couple, décisions, eau, prières, rapport santé (app v209)
- Nouveau `life-plus.ts` + outil `vie` + tâche `life-plus` (*/15) + onglet app JARVIS › 🧭 Vie.
- Identités « qui je veux devenir » (4 par défaut) : votes trouvés seuls chaque soir à 21h (GPS maison le soir, séances, pas, réservations, prospects, Liberté, moments avec son fils) + micro-action pour demain ; images de vision.
- Revue de vie dimanche 19h : message (faits de la semaine + courbe récupération/charge + corrélations) + appel → 3 intentions dans l'agenda (mardi/jeudi 8h), relance 20h30 si pas notées.
- Couple : idée de soirée à deux (resto halal / activité + météo) un mercredi sur deux, boutons, réservation agenda, rappel garde J-2, Waze le jour même ; jamais de contact avec sa femme.
- Conseil avant grosse décision (chiffres, risques, « dors dessus » si fatigué / tard) + suivi à 30 jours.
- Corrélations (sport, zone 2, pas → récupération / moral le lendemain, dès 14 jours), eau du jour (poids + sport + chaleur), rapport santé du mois en PDF (le 1er), surentraînement → semaine allégée auto, heures de prière au réveil (+ rappels sur demande), énergie + récupération au réveil, « Dzaryx cœur » (zone et consigne sur le tapis).

## 30/10 — Coach sport : il suit, il ne demande plus + séance en direct avec la montre (app v208)
- Plus jamais « dis-moi kg × reps » : Kouider donne un poids s'il veut ; sinon le coach suit la séance au chrono (exercice suivant envoyé tout seul quand le temps prévu est passé).
- Nouveau `workout-live.ts` + POST /api/jarvis/workout : automatisations Raccourcis « Entraînement Apple Watch » commence / se termine → coach lancé tout seul, tapis fini → muscu, fin → durée, kcal, cœur moyen/max, minutes par zone (FC max Tanaka), comparaison avec la fois d'avant, bilan.
- Score de RÉCUPÉRATION 0-100 (VFC + cœur au repos vs ses 14 jours, façon Whoop) dans le message du réveil et au début de la séance ; CHARGE d'entraînement 7 jours (ratio aigu/chronique) ; outil `sante` lit séances + récupération.
- App JARVIS › Santé·Siri : guide des automatisations montre + séances affichées.

## 30/10 — Appels qui coupent + LIBERTÉ prise du réveil
- Appels : Gemini Live (Google) coupait 2× par appel (1011 « Internal error », 1008) → « pardon, petite coupure » en boucle, Kouider ne se sentait pas compris. Maintenant la reconnexion prend un AUTRE modèle voix (celui qui a coupé est écarté 1 h, « -latest » en dernier) et une 2e coupure en moins d'une minute passe l'appel sur le cerveau Dzaryx (l'appel continue).
- Gemini muet même après la relance → bascule sur le cerveau Dzaryx (fini les 15 s de vide).
- LIBERTÉ : une même prise dont il reparle n'est plus comptée 2× (5 demis notés à 5h25 puis 6h05 → faux dépassement, palier repoussé, appel de 8h). Nouvelle action `reveil` : sa prise du réveil (5 demis) reste groupée, le reste se répartit ; corriger le total / annuler efface le faux dépassement et remet le palier à sa date.
- Repris du 29/10 : garde « ⚠️ pas accès aux données » → le cerveau avec outils reprend le tour ; « comment tu vas » demandé une seule fois par silence ; heure de retour du sport calculée (ligne 🏠 RETOUR) ; nettoyage <think>/caractères chinois des cerveaux gratuits.

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
