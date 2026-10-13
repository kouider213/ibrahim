# Journée du 13 octobre 2026 — tout ce qu'on a ajouté à Dzaryx

> Résumé en clair de la journée avec Claude. Détail technique : `02_DETAIL_TECHNIQUE.md`.
> À faire sur le PC : `03_A_FAIRE_SUR_LE_PC.md`. Ce qui est bloqué et les idées : `04_BLOQUE_ET_IDEES.md`.

## 1. Dzaryx t'appelle et tu l'appelles (Telegram)

- Vrais appels vocaux par un compte Telegram « Dzaryx » (sans Twilio ni pièce d'identité), dans les deux sens.
- Voix temps réel (réponse en ~0,4 s, tu peux lui couper la parole), voix « cedar ». Appels vidéo : il voit ta caméra.
- Pendant l'appel il peut : lire réservations, impayés, flotte, mails pro, dépenses, papiers des voitures ; créer /
  modifier / annuler une réservation, noter un paiement, faire un devis, noter une dépense ou des km, répondre à un
  mail (boîte pro seulement), t'envoyer un contrat à signer ou un lien WhatsApp client, programmer un rappel.
  Toujours avec relecture et ton « oui » avant d'agir.
- Mémoire des appels (résumé + choses à faire), message Telegram après chaque appel, appel manqué → message + 2e essai.
- Il t'appelle tout seul (max 12/jour, jamais entre 22h et 8h) : récap à 10h, réponse à un de tes mails, nouvelle
  réservation, client à risque, acompte annoncé, retard, impayé urgent, vidange proche, anniversaires clients,
  papiers qui expirent, réserve de prospects vide, et la veille de chaque départ / retour à 18h.
- Dépenses à la voix ou en photo de ticket, km → alerte vidange, avis Google par WhatsApp, alerte si le service
  d'appels tombe, secours IA réparé (si Claude tombe), démarchage : signaux d'affaires à Oran.

## 2. Nexus (ton PC) — tout le JARVIS de TechEnClair et plus

- Minuteurs, notes, liste de courses, to-do, volume, luminosité, éteindre le PC (toujours annulable), verrouiller,
  corbeille, mot de passe, pile ou face / dés, heure dans une ville, mode boulot.
- **Pilote de navigateur** : « va sur le site X et remplis / cherche / télécharge… ». Il s'arrête et te demande avant
  de payer, envoyer, réserver ou publier. Tu te connectes toi-même aux sites. (Testé sur le serveur.)
- **Outils de Dzaryx dans Claude Code / Cursor** (lecture seule, 58 outils) via `nexus/mcp_server.py`. (Testé.)
- **Mode hors ligne** : si internet ou Claude tombent, une IA locale répond (« installe le mode hors ligne »).
- **Bulle flottante** en bas à droite + raccourcis Ctrl+Alt+N (micro) et Ctrl+Alt+B (afficher / masquer).
- **Réveil local** : ton PC reconnaît « Nexus » lui-même, sans envoyer le son à Google. (8/8 au test.)
- **Garde-fou anti-boucle** : une IA qui répète 3 fois la même erreur s'arrête (Nexus + cerveau de Dzaryx).
- ⚠️ Rien de Nexus n'a encore tourné sur ton PC Windows : voir `03_A_FAIRE_SUR_LE_PC.md`.

## 3. Dzaryx plus intelligent (serveur, en ligne)

- **Il apprend tout seul** : 10 min après une conversation, il relit et retient tes corrections (« la Clio c'est 35 € »)
  et les procédures que tu lui décris. Notif « 📚 J'ai retenu … ». « oublie la règle … » pour effacer.
- **Ménage de la mémoire** chaque nuit à 3h (doublons, contradictions → garde la plus récente). « annule le ménage ».
- **Missions permanentes** : « chaque lundi à 9h regarde les prix des concurrents… ». Il lit et propose, n'envoie rien seul.
- **Objectifs** : « objectif : louer la Jumpy ce week-end ». Point chaque matin à 9h + actions du jour, jusqu'au but.
- **Rappels d'événement** : « la prochaine fois que Karim réserve, rappelle-moi la caution », « si Sonatrach répond, appelle-moi ».
- **Préparation des RDV** : 1 h avant chaque RDV de l'agenda, fiche + appel (qui, mails, historique, quoi proposer).
- **Tâches pour Houari** : « dis à Houari de préparer la Clio pour 10h ». Rappels à Houari, tu es prévenu quand c'est fait.
- **Procédures** : « quand je valide une location, fais toujours : … ». Il les suit quand le sujet revient.
- **« Qu'est-ce que je t'avais dit sur… »** : recherche dans toutes vos conversations (app, Telegram, appels).
- **Mode privé** (« mode privé ») : il ne retient rien et efface à la fin. « Montre tout ce que tu sais sur moi ».
- **Clients** : la réponse WhatsApp client garde la conversation en mémoire et propose les vrais extras (livraison
  gratuite aéroport, 7-9 places, logement, prolongation). Le chat du site aussi.

## 4. Ce qui a été comparé

TechEnClair JARVIS 10.3, bertrandmbanwi/Jarvis, Open.Jarvis, OpenClaw, Hermes Agent (Nous Research), Leon,
Gemini / ChatGPT, outils IA pour loueurs (CarCloud), standards téléphoniques IA. Copies dans `downloads/`.
