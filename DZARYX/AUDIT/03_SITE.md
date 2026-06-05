# 03 — Le Site (fikconciergerie.com)

> Repo : `kouider213/autolux-location` · Dossier : `C:\Users\douba\OneDrive\Bureau\rental-system`
> Techno : **Next.js 14 (Pages Router)** + Tailwind + Framer Motion · Déploiement **Vercel**
> Retour : [[🏠 HUB]]

---

## Rôle

Vitrine publique + back-office. Trois activités : **location voiture**, **immobilier**, **vente voiture**.
Pas de paiement en ligne : toute demande finit en **WhatsApp** + une ligne `bookings`/`client_leads` que
Kouider valide à la main.

---

## Arborescence

```
rental-system/
├── pages/              ← toutes les routes (Pages Router)
│   ├── api/            ← endpoints serverless
│   └── admin/          ← back-office (protégé login)
├── lib/                ← logique partagée (supabase, settings, i18n, pdf...)
├── components/         ← Navbar, Footer, Lightbox, WhatsApp flottant...
├── supabase/           ← migrations SQL 0001 → 0017 + schema.sql
└── public/             ← logos, favicons, images
```

---

## Pages publiques (`pages/*.js`)

| Page | Rôle | Détails clés |
|------|------|--------------|
| `index.js` | Accueil | Hero (photo OU vidéo via `hero_media_url`), voitures en avant, stats, CTA WhatsApp |
| `cars.js` | Catalogue location | Lit `cars`. **Mode dispo** : badge "Sur demande" + bouton "Vérifier la dispo" si `availability_mode` ON |
| `cars/[id].js` | Détail voiture | Photos (carousel `car_photos`), specs, bouton réservation |
| `reservation.js` | **Formulaire de demande** | ⭐ Cœur du tunnel. Voir section dédiée plus bas |
| `immo.js` | Catalogue immobilier | Lit `properties` (status `disponible`) |
| `immo/[id].js` | Détail bien | Photos `property_photos`, contact WhatsApp |
| `vente-voitures.js` | Voitures à vendre | Lit `vehicles_for_sale` |
| `vente-voitures/[id].js` | Détail voiture à vendre | |
| `commande-vehicule.js` | Commande sur mesure | Le client demande un véhicule précis → lead. Acompte affiché (`acompte_pct`) |
| `investir.js` | Page investisseurs | Pitch pour investir avec Douba Groupe |
| `suivi/[id].js` | Suivi réservation | Le client suit l'état de sa demande via l'ID booking |
| `reviews.js` | Avis clients | Lit `reviews` approuvées |
| `blog.js` + `blog/[slug].js` | Blog | SEO. Contenu via `lib/blog.js` |
| `faq.js` | FAQ | Via `lib/faq.js` |
| `conditions.js` | Conditions de location | Via `lib/conditions.js` |
| `contact.js` | Contact | WhatsApp(s), email, adresse, Maps |
| `login.js` | Connexion admin | Supabase Auth |
| `test-disponibilites.js` | Page de test | Outil interne (à ne pas indexer) |
| `sitemap.xml.js` | Sitemap dynamique | SEO |
| `404.js` | Page erreur | |

---

## ⭐ `reservation.js` — le tunnel de réservation

C'est LE fichier business du site. Étapes :

1. Client arrive depuis "Vérifier la dispo" (`/reservation?car=ID`).
2. **Étape 1** : calendrier (react-datepicker) → choisit dates. Les dates déjà réservées sont
   bloquées (lecture `bookings` du véhicule, lignes ~110).
3. **Étape 2** : formulaire — nom, téléphone, **âge**, email, passeport, notes.
   - 🔒 **Âge ≥ 35 obligatoire** (exigence assurance). Validé 3 fois :
     `ageTooYoung = ageNum < 35` (l.183), `validateStep2` bloque (l.193), bouton submit désactivé (l.593).
4. **Submit** (`handleSubmit`, l.199) :
   - `INSERT bookings` avec `status:'PENDING'`, `payment_status:'UNPAID'`, prix client/proprio snapshot.
   - POST `/api/notify-dzaryx` (prévient Dzaryx).
   - Ouvre **WhatsApp** pré-rempli (`buildWhatsAppUrl`) avec voiture, dates, âge, prix estimé → arrive
     sur le WhatsApp de Kouider.

> 🟢 **Pourquoi toujours PENDING ?** Kouider n'a pas les vraies dispos avant août (il bosse avec Houari).
> Le site ne confirme JAMAIS seul. Voir [[08_DECISIONS#mode-dispo]].

---

## 🔁 Le mode "disponibilité à confirmer" (toggle)

Réglage `availability_mode` dans `site_settings` (migration `0017`). Géré via [[03_SITE#admin]] → Paramètres.

- **ON (défaut, sûr)** : cartes voiture = badge "Sur demande", bouton "Vérifier la dispo".
- **OFF** : badge dispo réelle, bouton "Réserver".
- Lu dans `cars.js:17` et `cars/[id].js:18` via `settings.availability_mode !== false` (défaut ON si colonne absente).
- **Le toggle change seulement l'affichage du catalogue.** Le tunnel `reservation.js` est identique dans
  les deux modes (toujours PENDING + WhatsApp). C'est **voulu** : le form sert à collecter dates+conditions
  pour que Kouider voie tout sur son WhatsApp. Voir [[08_DECISIONS#mode-dispo]].

Logique du toggle : `lib/settings.js` (`DEFAULT_SETTINGS.availability_mode: true`) +
`admin/settings.js:95 toggleAvailMode`.

---

## Back-office `pages/admin/*` {#admin}

Protégé par login (Supabase Auth). Design premium dark/gold (redesign 2026-06-01).

| Page | Gère |
|------|------|
| `index.js` | Dashboard : KPIs (réservations, CA, bénéfice), table réservations |
| `bookings.js` | Réservations : filtres, changement de statut |
| `cars.js` | Véhicules location : CRUD + **multi-photos** (table `car_photos`, 10 max, réordonnables) |
| `immo.js` | Biens immobiliers : CRUD (schéma `title/transaction/price/city`) |
| `vehicles-sale.js` | Voitures à vendre : CRUD |
| `clients.js` | Clients : liste + détail + historique |
| `reviews.js` | Avis : approuver / supprimer |
| `analytics.js` | Stats : pages vues, voitures vues (tables `page_views`, `car_views`) |
| `calendar.js` | Calendrier des réservations |
| `settings.js` | ⚙️ Réglages site : WhatsApp(s), logo, hero, réseaux, **toggle dispo**, acompte, stats |
| `blog.js`, `faq.js`, `conditions.js` | Édition contenu éditorial |

---

## API serverless `pages/api/*`

| Endpoint | Rôle |
|----------|------|
| `notify-dzaryx.js` | Webhook → backend Dzaryx (`/api/fik-site/notify`, header `x-webhook-secret`). **Non-bloquant**. |
| `booking.js` | Création/gestion réservation côté serveur |
| `update-booking-status.js` | Admin change statut réservation |
| `availability.js` | Vérifie dispo d'une voiture sur une période |
| `calendar-event.js` | Crée un événement Google Calendar |
| `upload-car-image.js` | Upload image (base64 → Cloudinary), réutilisé pour logo/hero |
| `assistant-context.js` | Renvoie le contexte live du site (texte/JSON) — pour le chatbot (désactivé, voir plus bas) |
| `track.js` | Tracking analytics (page_views, car_views) |
| `og.js` | Génère les images Open Graph (partage réseaux) |

---

## Librairies `lib/*`

| Fichier | Rôle |
|---------|------|
| `supabase.js` | Client Supabase (clé anon, côté navigateur) |
| `settings.js` | `DEFAULT_SETTINGS`, `getSettings()`, `useSettings()`, `waLink()` — **réglages globaux** |
| `i18n.js` | Traductions **FR / AR** (le site est bilingue, darija incluse) |
| `booking.js` | Logique réservation partagée |
| `pdf.js` | Génération PDF (devis/contrat) |
| `photoUpload.js` | Upload photos |
| `date.js`, `format.js` | Helpers dates / formats |
| `blog.js`, `faq.js`, `conditions.js` | Contenu éditorial |
| `tracker.js` | Tracking analytics côté client |

---

## Composants `components/*`

`Navbar`, `Footer`, `AdminLayout` (layout back-office), `FloatingWhatsApp` (bouton WhatsApp flottant),
`AnnouncementBanner` (bandeau via `announcement`), `CookieBanner`, `Lightbox` (zoom photos), `ShareButtons`.

---

## ⚠️ Chatbot "Fik" — RETIRÉ

Un chatbot IA (widget chargé depuis le backend Railway) était embarqué sur le site. **Retiré le 2026-06-03** :
Kouider l'a jugé inutile (le site dit déjà tout) et dérangeant. Widget supprimé de `_app.js`, toggle admin retiré.
Conservé au cas où : endpoint `/api/assistant-context` + migration `0012_chatbot_toggle`. Voir [[08_DECISIONS#chatbot]].

---

## Migrations SQL — voir [[07_DATA_MODEL]]

Le site porte les migrations `0001` → `0017` (+ `schema.sql` de base). C'est **le site** qui possède le
schéma "annonces" (`properties.title/transaction/price`, `vehicles_for_sale`, `client_leads`, `client_deals`,
`site_settings`). Le backend Dzaryx lit/écrit ces mêmes tables.
