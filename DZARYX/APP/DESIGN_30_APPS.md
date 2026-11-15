# Design Dzaryx + FORME — analyse de 30 applications (15/11/2026)

Demande de Kouider : « analyse 30 applications différentes, à la fin Dzaryx et FORME doivent être la meilleure app ».
Méthode : pour chaque app, ce qu'elle fait de mieux que les autres → la règle qu'on en tire → où c'est appliqué.
✅ = déjà dans l'app (v264/v265) · 🔜 = prochaine étape.

## A. Dzaryx (business, argent, assistant) — 15 apps

| # | App | Ce qu'elle fait de mieux | Règle pour Dzaryx | État |
|---|---|---|---|---|
| 1 | Revolut | Un seul gros chiffre en haut (le solde), le reste en dessous | Carte « À récupérer » géante sur Aujourd'hui | ✅ |
| 2 | Qonto | Fond clair, cartes blanches, une seule couleur d'action | Kit « clair premium » : encre noire + un bleu | ✅ |
| 3 | N26 | Mode sombre noir profond, pas gris | Sombre #09090c, cartes #15161c | ✅ |
| 4 | Apple Wallet | Cartes qui se détachent par l'ombre, pas par les bordures | Ombres douces, bordures quasi invisibles | ✅ |
| 5 | Linear | Navigation rapide, recherche partout | Recherche dans « Tous les outils » + page Chercher | ✅ |
| 6 | Things 3 | Gros titres, beaucoup d'air, une action par écran | En-têtes : sur-titre bleu + grand titre | ✅ |
| 7 | Notion | Menu rangé par thèmes avec icône couleur | Menu Plus par thème (Activité, Clients, Marketing…) | ✅ |
| 8 | Stripe Dashboard | Chiffres justes + d'où ils viennent | « Gagné / Déjà récupéré / À récupérer » même source que le site | ✅ |
| 9 | Airbnb Host | Fiche voyageur complète au toucher du nom | Fiche client partout (ClientSheet) | ✅ |
| 10 | Turo Host | Voiture = grande photo + prix + état | Cartes Parc photo pleine largeur, Houari/Client/Marge | ✅ |
| 11 | Shopify | Raccourcis d'action sous le chiffre clé | Locations / Clients / Parc / Devis sous la carte argent | ✅ |
| 12 | Superhuman | Tout au pouce, feedback immédiat | Appui qui s'enfonce, zones tactiles ≥ 40 px | ✅ |
| 13 | ChatGPT | Bulles sobres, réponses riches (titres, tableaux) | Bulles noir/blanc, Markdown + graphiques | ✅ |
| 14 | Arc / iOS 18 | Thème qui suit le téléphone | Réglages › Apparence : Clair / Sombre / Auto | ✅ |
| 15 | Monday | Statuts en couleur (ok / attention / problème) | Une seule famille ok/warn/bad partout | ✅ (🔜 vérifier pages anciennes) |

## B. FORME (sport, sèche, nutrition) — 15 apps

| # | App | Ce qu'elle fait de mieux | Règle pour FORME | État |
|---|---|---|---|---|
| 16 | Whoop | Noir total, un anneau de récup coloré | Sombre noir #000, anneau « Forme du jour » | ✅ |
| 17 | Oura | Un score du jour + explication en une phrase | « Récupération 68/100 — feu vert… » | ✅ |
| 18 | Apple Fitness | Anneaux + semaine en ronds | Bandeau L-M-M-J-V-S-D avec ✓ | ✅ |
| 19 | Strava | Course GPS live + partage | Onglet Course, suivi ?suivi= | ✅ |
| 20 | Hevy | Séance = liste d'exercices avec photo, séries rapides | Carte « Prochaine séance » + exercices en images | ✅ |
| 21 | Strong | Chrono de repos automatique | Repos dans la séance live | ✅ |
| 22 | Fitbod | Muscles en couleur sur un corps | Bibliothèque par muscle (silhouettes) | ✅ |
| 23 | Nike Training Club | Grandes photos, titres forts | Titres de séance en capitales | ✅ |
| 24 | MyFitnessPal | Calories restantes = le seul chiffre | « 1350 kcal restantes » au centre de l'anneau | ✅ |
| 25 | Cal AI | Photo du plat → calories | Repas : photo → kcal | ✅ |
| 26 | Gentler Streak | Ton bienveillant, pas culpabilisant | Bilan de semaine qui explique au lieu de juger | ✅ |
| 27 | Runna | Plan qui s'adapte | Plan de semaine adapté (coach de semaine) | ✅ |
| 28 | Ladder | Défis + objectifs visuels | Objectifs & défis avec barres | ✅ |
| 29 | Bevel | Tout le santé dans une seule vue | 🔜 Accueil FORME : sommeil + pas + récup sur une ligne |
| 30 | Future | Coach qui parle comme un humain | Coach chat FORME | ✅ (🔜 réponses plus courtes) |

## Règles communes retenues
1. Un chiffre héros par écran, le reste plus petit.
2. Clair = fond #f2f2f5 / cartes blanches / encre #0c0e1a ; Sombre = noir profond, jamais gris délavé.
3. Une seule couleur d'action (bleu #2f5bff) ; en sombre les boutons noirs deviennent bleus.
4. Couleurs = variables de thème (`--dz-*` pour Dzaryx, `--f-*` pour FORME) : ne plus jamais écrire `#ffffff` / `#0c0e1a` en dur dans un écran — utiliser `T.*` (Kit.tsx) ou `F.*` (forme/ui.tsx).
5. Thème partagé : clé `dz:theme` (light / dark / auto) ; Dzaryx et FORME suivent le même réglage.

## Prochaines étapes (🔜)
- Accueil FORME façon Bevel (sommeil + pas + récup en une ligne).
- Revue des pages anciennes (Route, PhoneCam, Carte) qui gardent leur propre style sombre.
