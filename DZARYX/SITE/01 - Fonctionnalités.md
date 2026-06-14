---
tags: [site, fonctionnalites]
updated: 2026-06-14
---

# 🧰 Site — Fonctionnalités (quoi / pourquoi / comment)

Retour : [[SITE/00 - Vue d'ensemble]] · [[🏠 ACCUEIL]]

> [!tip] Format de chaque fiche
> **Quoi · Pourquoi (et pourquoi pas autre chose) · Comment ça marche · Comment l'utiliser**

---

## 🚗 Location de voiture
- **Quoi** : catalogue véhicules + réservation complète (dates, dispo, prix, contrat).
- **Pourquoi** : cœur du business. Pipeline pro de bout en bout.
- **Comment** : `pages/cars.js` (liste, favoris), `pages/reservation.js` (form → insert `bookings` PENDING → email + Telegram). Anti double-booking via vérif dispo.
- **Utiliser** : le client choisit voiture+dates → réserve sans compte → reçoit un n° de suivi.

## 💰 Vente de véhicules
- **Quoi** : annonces de voitures à vendre + capture de lead.
- **Pourquoi ce choix** : la vente passe par contact humain → on capte le lead AVANT WhatsApp (filet de sécurité), tout en gardant le bouton WhatsApp direct (zéro friction).
- **Comment** : `pages/vente-voitures/[id].js` + `LeadCapture` → `/api/lead` → `client_leads`.

## 🏠 Immobilier
- **Quoi** : annonces location/vente de biens + lead + suivi de dossier.
- **Comment** : `pages/immo/[id].js`, `StartDossier` → `dossiers` (kind immo). Autocomplétion adresse Google → carte précise.

## 🎫 Packs séjour
- **Quoi** : offres combinées (voiture + logement + extras), liées à l'inventaire réel.
- **Pourquoi** : différenciateur "conciergerie tout-en-un". Personne ne le fait à Oran.
- **Comment** : `pages/packs/[id].js` ; suivi via `dossiers` (kind pack, ref PCK-).

## 🛳️ Suivi d'importation véhicule (A→Z)
- **Quoi** : le client commande un véhicule à importer et suit chaque étape.
- **Pourquoi** : aucun suivi avant → angoisse client. Demande explicite Kouider.
- **Comment** : `commande-vehicule.js` → `create-import-order` → `import_orders`. Étapes `REQUESTED → SEARCHING → FOUND → PURCHASED → SHIPPING → CUSTOMS → READY → DELIVERED`. Page publique `suivi-import/[ref]` (timeline, photos, 3 langues, refresh 25s).
- **Pourquoi pas du realtime ?** La table est protégée par RLS ; on rafraîchit plutôt que d'exposer la lecture publique.

## 📋 Suivi de dossier (achat / immo / pack)
- **Quoi** : même logique que l'import, pour achat véhicule, immobilier, pack.
- **Pourquoi UN système unifié** : table `dossiers` (3 kinds) plutôt que 3 systèmes séparés → plus simple, même résultat.
- **Comment** : `lib/dossierStatus.js` (étapes par kind, FR/AR/EN), page `suivi-dossier/[ref]`.

## 🔔 Capture de leads
- **Quoi** : bouton "Être rappelé" + mini-form sur immo/vente/packs.
- **Pourquoi** : ces sections ne passaient QUE par WhatsApp → contact perdu si le client n'écrit pas.
- **Comment** : `LeadCapture` → `/api/lead` → `client_leads`. Relance auto à J+2 (cron `lead-followup`).

## ✉️ Emails pro multilingues
- **Quoi** : tous les emails (résa, statuts, import, dossier, avis, bienvenue) **FR/AR/EN + RTL**, design pro (logo, contact, footer Maps/avis).
- **Pourquoi** : emails "trop secs" et FR-only avant. Resend (domaine vérifié).
- **Comment** : `lib/email.js` helper `T(lang,{fr,ar,en})` + `wrap(lang)`.

## 📣 Newsletter
- **Quoi** : inscription (footer) + campagnes riches (photo/vidéo/CTA) **auto-traduites par langue d'abonné**.
- **Comment** : `newsletter-subscribe`, `newsletter-send` (boucle ~8/s pour Resend). Pilotable **depuis l'app** (token interne). Voir [[APP/01 - Écrans#NEWS]].

## ⭐ Avis + SEO Google
- **Quoi** : avis vérifiés (post-location) + lien avis Google + **machine à avis** (email auto le lendemain de fin de location).
- **Pourquoi #1 Oran** : le ranking local = Google Business + avis + NAP + temps. La machine à avis pousse le volume d'avis (levier n°1).
- **Comment** : `reviews`, `submit-review`, `lib/google.js`, cron `reminders` (fusionné : envoie aussi la demande d'avis — limite 2 crons Vercel Hobby).

## 🔐 Contrat + signature
- **Quoi** : contrat PDF (pdfkit) ; validation par **docs (passeport + permis)** au lieu de signature dessinée.
- **Pourquoi ce choix** : la signature dessinée était fragile (CSP) ; la validation par documents est plus robuste et juridiquement utile.
- **Comment** : backend `sign.ts` (`/sign/:token`), bucket `client-documents` public.

## 🌍 Résilience & traduction autonome
- **Quoi** : `/api/health`, keep-alive Supabase (anti-pause 7j), backup hebdo, traduction via Groq hébergée sur le site.
- **Pourquoi** : "jamais down" à €0. La traduction ne dépend plus de Railway.

## 🎁 Parrainage (côté site)
- **Quoi** : champ "code parrainage" sur réservation + commande import → incrémente `referrals.uses`.
- **Comment** : `/api/referral-use`, ou directement dans `create-import-order`/`create-dossier`. Codes créés dans l'app. Voir [[APP/01 - Écrans#PARRAINAGE]].

> [!summary] Pages SEO dédiées
> aéroport-oran, importation-algerie, occasion-oran, conciergerie-oran, location-voiture-oran… + sitemap + schema enrichi.
