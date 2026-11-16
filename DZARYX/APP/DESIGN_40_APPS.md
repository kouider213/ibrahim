# Design v4 « Signature » — analyse de 40 applications (16/11/2026)

Kouider (16/11) : « je vois pas de grosse différence… le but c'est que je sois choqué du changement, un vrai truc pro,
prends 40 apps, à la fin mes apps doivent être les meilleures ». La v3 (15/11) n'avait changé que les couleurs.
La v4 change la **structure** : navigation, icônes, typo, cartes, menu, identité de chaque appli.

Pour chaque app : ce qu'elle fait de mieux → la règle qu'on en tire → où c'est appliqué.

## A. Navigation, structure (10)
| # | App | Le meilleur d'elle | Règle | Où |
|---|---|---|---|---|
| 1 | iOS 26 (Liquid Glass) | Barre d'onglets en verre qui flotte au-dessus du contenu | Barre du bas = îlot de verre flottant, le contenu passe dessous | Dzaryx + FORME |
| 2 | Arc Browser | Une couleur par espace | Lueur de couleur en haut de chaque page selon son thème (Activité bleu, Ventes vert, Marketing rose…) | Dzaryx |
| 3 | Apple Home | Écran d'accueil = grille d'icônes | Menu « Plus » = grille d'icônes d'applis 4 colonnes | Dzaryx |
| 4 | iOS (écran d'accueil) | Chaque appli a sa couleur et son symbole | 37 icônes en dégradé + symbole blanc + reflet | Dzaryx › Plus |
| 5 | Raycast | « Les plus utilisés » en premier | Bloc « Les plus utilisés » (compteur local) | Dzaryx › Plus |
| 6 | Linear | Navigation instantanée, recherche partout | Recherche en tête du menu | Dzaryx |
| 7 | Things 3 | Très grands titres, beaucoup d'air | Titres 36 px serrés (-0,045 em) | Kit |
| 8 | Apple Music | Couleur d'ambiance derrière l'en-tête | Halo de couleur sous la barre du haut | Dzaryx |
| 9 | ChatGPT (app) | Bouton voix central toujours là | Orbe Dzaryx animé au centre de la barre | Dzaryx |
| 10 | Siri (iOS 18) | Lumière en dégradé vivant | Orbe = dégradé conique bleu → violet → cyan qui tourne | Dzaryx |

## B. Finance, business (10)
| # | App | Le meilleur d'elle | Règle | Où |
|---|---|---|---|---|
| 11 | Revolut | Un seul chiffre géant en haut | Carte « À récupérer » 52 px, dégradé maillé | Aujourd'hui |
| 12 | Mercury | Noir profond, typo nette, zéro décor | Fond noir OLED #000 en sombre | Kit |
| 13 | Stripe Dashboard | Chiffres tabulaires alignés | Chiffres en chasse fixe (tnum) partout | Kit |
| 14 | Ramp | Étiquettes en capitales espacées | Étiquettes en Geist Mono capitales | Kit (Eyebrow, Kpi) |
| 15 | Vercel | Bouton principal monochrome | Bouton principal blanc sur noir / noir sur blanc | Kit |
| 16 | Qonto | Une seule couleur d'action | Bleu #3d6bff seulement pour sélection / liens / données | Kit |
| 17 | Monzo | États en couleur vive avec lueur | Pastilles ok/warn/bad avec point lumineux | Badge |
| 18 | Shopify | Raccourcis sous le chiffre clé | 4 raccourcis-icônes sous la carte argent | Aujourd'hui |
| 19 | Airbnb Host | Fiche complète au toucher | Lignes avec chevron = touchable | Row |
| 20 | Turo Host | Grande photo + prix + état | Cartes Parc photo pleine largeur gardées | Parc |

## C. Matière, détails (10)
| # | App | Le meilleur d'elle | Règle | Où |
|---|---|---|---|---|
| 21 | Apple Wallet | Cartes en relief | Cartes en verre fumé + liseré lumineux en haut | Kit (glass) |
| 22 | Linear | Bordures 1 px très fines | Filet 1 px à 8 % au lieu des ombres lourdes | Kit |
| 23 | SF Symbols | Icônes au trait cohérentes | 120 icônes dessinées (Icon.tsx), plus d'emojis dans l'interface | Toutes les pages |
| 24 | Notion | Emoji = décor, pas interface | Emoji de tête des boutons / titres → icône au trait automatiquement | Kit (Label, Ico) |
| 25 | Superhuman | Retour tactile immédiat | Appui qui s'enfonce (scale .96) | Kit |
| 26 | Family (wallet) | Feuilles qui glissent, ressort | Feuilles modales en ressort, toujours au-dessus de tout | Sheet (portail) |
| 27 | Craft | Typo moderne lisible | Police Geist (Vercel) partout | Dzaryx + FORME |
| 28 | Telegram | Bulles colorées pour soi | Bulle utilisateur en dégradé bleu | Chat |
| 29 | Discord | Statut en ligne vivant | Point « En ligne » lumineux, clignote en connexion | Barre du haut |
| 30 | Revolut | Avatars carrés arrondis teintés | Avatars en carré arrondi dégradé | Kit (Avatar) |

## D. Sport, santé — FORME (10)
| # | App | Le meilleur d'elle | Règle | Où |
|---|---|---|---|---|
| 31 | Nike Run Club | Identité couleur forte | FORME = orange énergie #ff5a1f (Dzaryx reste bleu) | FORME |
| 32 | Whoop | Noir total + anneau lumineux | Anneaux avec lueur | FORME |
| 33 | Strava | Orange = effort | Boutons principaux orange → rose | FORME |
| 34 | Apple Fitness | Anneaux + semaine en ronds | Gardés, recolorés | FORME |
| 35 | Hevy | Séance = liste avec photos | Gardé | FORME |
| 36 | Oura | Un score du jour expliqué | Gardé | FORME |
| 37 | Gentler Streak | Ton bienveillant | Gardé | FORME |
| 38 | Bevel | Barre flottante en verre | Barre du bas FORME flottante | FORME |
| 39 | Ladder | Titres très gras, compacts | Titres Geist 650, serrés | FORME |
| 40 | Fitbod | Carte muscles colorée | Gardée | FORME |

## Règles retenues (v4)
1. **Structure avant couleur** : barre flottante, menu en icônes, lueur de page.
2. **Zéro emoji dans l'interface** : icônes au trait (`Icon`, `Label`, `Ico` dans `components/ui/Icon.tsx`). Les emojis restent seulement dans les textes écrits par Dzaryx et dans les jeux de Fennou.
3. **Bouton principal monochrome** : `T.ink` + texte `T.onInk` (jamais `#fff` en dur sur `T.ink` : en sombre l'encre est blanche).
4. **Feuilles modales** : toujours en portail dans `<body>`, z ≥ 1000 → jamais cachées sous la barre (bug LIBERTÉ 16/11).
5. Couleurs = variables (`--dz-*`, `--f-*`), chiffres en `tnum`, étiquettes en Geist Mono.
