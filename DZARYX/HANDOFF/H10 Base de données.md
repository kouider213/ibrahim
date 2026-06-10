---
tags: [handoff, supabase, db]
---
# 🗄️ H10 — Base de données (Supabase)
[[00 HANDOFF HUB|← Hub]]

| Table | Rôle |
|---|---|
| **bookings** | Réservations (prix client/proprio, devise, `rented_by` Kouider/Houari, km/carburant, statut paiement) |
| **cars** | Parc (prix €/DZD, photos, maintenance, dates assurance/contrôle/vignette) |
| **profiles** | Utilisateurs/admins |
| **payments / payment_logs** | Paiements |
| **pricing** | Catalogue de RÉFÉRENCE (PAS pour les calculs réels → [[H08 Finance & règles métier]]) |
| **memory_facts** | Mémoire long-terme par utilisateur → [[H04 Cerveau Agents & gardes]] |
| **client_documents** | Docs clients + OCR (`extracted_data`) — scan ID auto-archivé |
| **contract_signatures** | Signatures électroniques (token, statut, signature_url) |
| **properties / vehicles_for_sale / leads / packs** | Immo, vente, demandes, packs |

## Migrations
Fichiers `supabase/*.sql`, à exécuter **manuellement** dans Supabase → SQL Editor (choisir "Run and enable RLS"). RLS bypassé par la clé service du backend.

Détail : [[DATABASE]]. Suite : [[H11 Déploiement]]
