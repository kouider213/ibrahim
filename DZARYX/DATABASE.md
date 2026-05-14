# DZARYX — Base de Données Supabase

## Tables principales

### `bookings` — Réservations

| Colonne | Type | Description |
|---|---|---|
| `id` | uuid | Clé primaire |
| `client_name` | text | Nom du client |
| `client_phone` | text | Téléphone client |
| `client_age` | int | Âge client |
| `car_id` | uuid | FK → cars.id |
| `start_date` | date | Date début location |
| `end_date` | date | Date fin location |
| `nb_days` | int | Durée en jours |
| `final_price` | numeric | Prix total réel facturé |
| `client_price_per_day` | numeric(10,2) | Prix négocié client/jour ← **PRIORITÉ 1** |
| `owner_price_per_day` | numeric(10,2) | Prix payé à Houari/jour ← **PROFIT** |
| `owner_total` | numeric(10,2) | owner_price_per_day × nb_days |
| `profit_kouider` | numeric(10,2) | (client_ppd - owner_ppd) × nb_days |
| `discount_applied` | numeric(10,2) | Remise accordée (0 si aucune) |
| `paid_amount` | numeric | Montant encaissé |
| `acompte_amount` | numeric | Acompte versé |
| `payment_status` | text | PENDING / PARTIAL / PAID |
| `payment_notes` | text | Notes paiement |
| `last_payment_date` | date | Date dernier paiement |
| `solde_paid` | boolean | Solde entièrement payé |
| `status` | text | CONFIRMED / ACTIVE / COMPLETED / CANCELLED / REJECTED |
| `rented_by` | text | "Kouider" ou "Houari" |
| `created_at` | timestamptz | Date création |
| `pdf_url` | text | URL reçu PDF généré |

**Index** :
- `idx_bookings_status_start` — (status, start_date DESC)
- `idx_bookings_status_end` — (status, end_date DESC)
- `idx_bookings_payment_status` — (payment_status, status)

---

### `cars` — Véhicules

| Colonne | Type | Description |
|---|---|---|
| `id` | uuid | Clé primaire |
| `name` | text | Nom du véhicule (ex: "Jumpy 9 Places") |
| `category` | text | Catégorie |
| `is_available` | boolean | Disponible |
| `plate_number` | text | Immatriculation |

**Note** : Les noms dans Supabase peuvent différer du catalogue `pricing.ts`. Exemples :
- DB : "Jumpy 9 Places" vs catalogue : "Jumpy 9p"
- DB : "Fiat 500 X" vs catalogue : "Fiat 500 XL"
- DB : "Clio 4" vs catalogue : "Clio 4 v1" / "Clio 4 v2"

---

### `profiles` — Utilisateurs / Admins

| Colonne | Type | Description |
|---|---|---|
| `id` | uuid | FK → auth.users.id |
| `role` | text | "admin" / "user" |
| `telegram_id` | text | ID Telegram |

---

### `document_access_logs` — Logs accès documents

| Colonne | Type | Description |
|---|---|---|
| `id` | bigserial | Clé primaire |
| `user_id` | bigint | ID utilisateur |
| `action` | text | view / store / refused / masked_preview |
| `doc_type` | text | Type de document |
| `client_name` | text | Nom client concerné |
| `client_phone` | text | Téléphone (masqué si non-admin) |
| `is_admin` | boolean | L'accès était-il admin ? |
| `masked` | boolean | Données masquées ? |
| `ip` | text | Adresse IP |
| `created_at` | timestamptz | Timestamp |

**RLS** : activé — seul `service_role` peut insérer/lire.

---

### `payment_logs` — Historique paiements

| Colonne | Type | Description |
|---|---|---|
| `id` | uuid | Clé primaire |
| `booking_id` | uuid | FK → bookings.id |
| `amount` | numeric | Montant |
| `payment_date` | date | Date |
| `payment_method` | text | cash / card / transfer |
| `note` | text | Note libre |

---

### `pricing` — Catalogue prix véhicules

| Colonne | Type | Description |
|---|---|---|
| `vehicle_name` | text | Nom unique véhicule (UNIQUE) |
| `houari_price` | numeric | Prix propriétaire/jour |
| `kouider_price` | numeric | Prix catalogue client/jour |
| `benefit` | numeric | Bénéfice catalogue (NE PAS utiliser pour calculs réels) |

> ⚠️ Cette table est un catalogue de RÉFÉRENCE. Les calculs financiers réels utilisent `client_price_per_day` et `owner_price_per_day` de la table `bookings`.

---

## Migrations SQL (ordre chronologique)

1. `supabase/schema-phase1.sql` — Schéma initial
2. `supabase/schema-phase2.sql` — Enrichissements Phase 2
3. `supabase/migration_phase3_4.sql` — Phase 3-4
4. `supabase/migration_p12a_memory_engine.sql` — Moteur mémoire
5. `supabase/migration_document_access_logs.sql` — ✅ Exécutée 2026-05-13
6. `supabase/migration_financial_fields.sql` — ✅ Exécutée 2026-05-13

---

## Requêtes utiles

### Réservations avec prix manquants
```sql
SELECT cars.name, bookings.start_date, bookings.client_price_per_day, bookings.owner_price_per_day
FROM bookings
JOIN cars ON bookings.car_id = cars.id
WHERE (bookings.client_price_per_day IS NULL OR bookings.owner_price_per_day IS NULL)
AND bookings.status IN ('CONFIRMED','ACTIVE','COMPLETED')
ORDER BY bookings.start_date DESC;
```

### Rapport financier rapide
```sql
SELECT
  cars.name,
  COUNT(*) as nb_reservations,
  SUM(bookings.client_price_per_day * bookings.nb_days) as ca_reel,
  SUM(bookings.owner_price_per_day * bookings.nb_days) as cout_houari,
  SUM((bookings.client_price_per_day - bookings.owner_price_per_day) * bookings.nb_days) as profit_kouider
FROM bookings
JOIN cars ON bookings.car_id = cars.id
WHERE bookings.status IN ('CONFIRMED','ACTIVE','COMPLETED')
AND bookings.client_price_per_day IS NOT NULL
AND bookings.owner_price_per_day IS NOT NULL
GROUP BY cars.name
ORDER BY ca_reel DESC;
```
