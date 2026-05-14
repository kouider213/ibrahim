# DZARYX — Description du Projet

## Identité

| Champ | Valeur |
|---|---|
| Nom actuel | **Dzaryx** |
| Ancien nom | Ibrahim |
| Propriétaire | Kouider |
| Entreprise | Fik Conciergerie — Oran, Algérie |
| Type | Assistant AI pour gestion de location de véhicules |
| Déployé | Railway (backend) + Supabase (DB) + Upstash (Redis) |

---

## Objectif

Dzaryx est un assistant AI complet qui permet à Kouider de gérer son activité de location de voitures via :
- **Telegram** (principal canal de travail)
- **Mobile PWA** (interface React)
- **WhatsApp** (clients)
- **PC Agent Nexus** (contrôle du PC Windows à distance)

L'assistant comprend le français, l'arabe et l'anglais. Il gère les réservations, les finances, les clients, les documents, et peut contrôler le PC de Kouider à distance.

---

## Fonctionnalités principales

### 1. Gestion des réservations
- Créer / modifier / annuler une réservation
- Vérifier disponibilité des véhicules
- Calculer prix selon durée et véhicule
- Générer reçus PDF
- Rappels automatiques clients impayés

### 2. Business Intelligence
- Rapport financier mensuel / annuel
- CA par véhicule
- Profit Kouider réel (client_price - owner_price)
- Revenus encaissés / à encaisser
- Scoring clients (VIP / Frequent / Regular / New)
- Alertes anomalies (pertes, grandes réservations)

### 3. Sécurité documents
- Masquage automatique données sensibles pour non-admins
- Log de tous les accès aux documents (table document_access_logs)
- Anti-hallucination : Gates 1/2/3 bloquants

### 4. Nexus PC Agent
- Contrôle PC Windows depuis Telegram
- Exécution commandes terminal (streaming live)
- Gestion fichiers, git, applications
- Wake on LAN (démarrer le PC à distance)
- Vision (capture écran)

### 5. Notifications proactives
- Alertes impayés automatiques
- Rappels réservations à venir
- Briefing matinal
- Pushover (iPhone) + Telegram

### 6. Multi-agent
- Finance Agent
- Booking Agent  
- Client Agent
- Document Agent
- Nexus Agent

---

## Parc véhicules (Fik Conciergerie)

| Véhicule | Prix Houari/j | Prix client catalogue |
|---|---|---|
| Jumpy 9 Places | 44€ | ~55€ |
| Berlingo | 44€ | ~55€ |
| Jogger | 37€ | ~45€ |
| Sandero | 22€ | ~30€ |
| Clio 5 | 37€ | ~45€ |
| Clio 5 Alpine | 44€ | ~55€ |
| Clio 4 v1 | 16€ | ~25€ |
| Clio 4 v2 | 24€ | ~32€ |
| i10 | 19€ | ~28€ |
| Fiat 500 | 24€ | ~32€ |
| R.Duster | 31€ | ~40€ |
| D.Duster | 44€ | ~55€ |
| Creta | 24€ | ~32€ |
| Fiat 500 XL | 37€ | ~45€ |

> Houari = propriétaire des véhicules. Kouider paie Houari le prix propriétaire et garde la différence comme profit.

---

## Règles métier importantes

- Location minimum : 2 jours
- Pas de livraison le vendredi
- Surcharge Ramadan : +20%
- Remise VIP : -10%
- Surcharge aéroport : 1 500 DZD
- Seuil validation financière : 50 000 DZD

---

## Canaux de déploiement

| Canal | URL / Identifiant |
|---|---|
| Backend API | Railway (auto-deploy sur push main) |
| Base de données | Supabase |
| Cache / Queue | Upstash Redis |
| Telegram Bot | kouiderpablo@gmail.com |
| Mobile PWA | déployé séparément |
