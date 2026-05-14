# DZARYX — Règles Métier Fik Conciergerie

> Ces règles gouvernent la logique de Dzaryx. Toute modification nécessite une mise à jour ici.

---

## Règles de location

| Règle | Valeur | Notes |
|---|---|---|
| Durée minimum | 2 jours | Pas de location à la journée |
| Livraison vendredi | ❌ Interdit | Jour de prière |
| Dépôt de garantie | Variable | Selon véhicule |

---

## Tarification

### Surcharges automatiques
| Condition | Surcharge |
|---|---|
| Ramadan | +20% |
| Aéroport | +1 500 DZD |

### Remises automatiques
| Client | Remise |
|---|---|
| VIP (score) | -10% |

---

## Calcul financier

### Formule profit Kouider
```
profit_kouider = (client_price_per_day - owner_price_per_day) × nb_days
```

### Priorité des prix (dans le code)
1. `client_price_per_day` stocké explicitement ← PRIORITÉ 1
2. `final_price / nb_days` calculé ← PRIORITÉ 2
3. `null` — données manquantes ← JAMAIS catalogue

### Règle absolue
- Si `owner_price_per_day` manquant → profit = **null** (jamais inventé)
- Afficher : *"Impossible de calculer sans données financières réelles"*

---

## Seuils d'alerte

| Alerte | Seuil |
|---|---|
| Validation financière manuelle | 50 000 DZD |
| Grande réservation (notification) | 2 000€ |
| Remise importante (alerte) | > 30% vs catalogue |
| Perte réelle (alerte critique) | client_ppd < owner_ppd |

---

## Scoring clients

| Score | Critères |
|---|---|
| VIP | ≥ 5 réservations OU ≥ 1 000€ dépensé |
| FREQUENT | ≥ 3 réservations OU ≥ 500€ |
| REGULAR | ≥ 2 réservations OU ≥ 200€ |
| NEW | Sinon |

---

## Statuts réservation

| Statut | Description |
|---|---|
| CONFIRMED | Réservation confirmée, pas encore active |
| ACTIVE | Location en cours |
| COMPLETED | Location terminée |
| CANCELLED | Annulée par le client |
| REJECTED | Refusée par Kouider |

---

## Statuts paiement

| Statut | Description |
|---|---|
| PENDING | Rien encaissé |
| PARTIAL | Acompte reçu, solde manquant |
| PAID | Entièrement payé |

---

## Rented_by

| Valeur | Description |
|---|---|
| "Kouider" | Réservation via Kouider → profit Kouider = (client_ppd - owner_ppd) × jours |
| "Houari" | Réservation directe Houari → profit Kouider = 0 |

---

## Impayés — Relance

| Délai | Urgence | Action |
|---|---|---|
| < 48h | 🟢 Vert | Aucune action |
| 48-72h | 🟡 Jaune | Relance normale |
| > 72h | 🔴 Rouge | Relance urgente |

---

## Recettes PDF

Générées via `pdfkit`, uploadées sur Supabase Storage bucket `client-documents`, URL stockée dans `bookings.pdf_url`.

---

## Nexus — Commandes autorisées

Le PC Agent Nexus peut exécuter des commandes terminal sur le PC Windows de Kouider. Toute commande doit passer par l'authentification Nexus (token + nonce anti-replay Redis).

Commandes typiques :
- Git (pull, push, status)
- npm (install, build, test)
- File operations (read, write, list)
- App control (open, close)
- Vision (screenshot)
