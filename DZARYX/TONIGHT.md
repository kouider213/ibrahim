# CE SOIR — Todo liste complète (15 mai 2026)

> Fais dans l'ordre. Chaque étape a son explication + les commandes exactes.

---

## ÉTAPE 1 — Git pull (obligatoire en premier)

Ouvre PowerShell dans `C:\Users\douba\OneDrive\Bureau\ibrahim\ibrahim` et lance:

```
git pull origin main
```

Ça télécharge tous les fixes de la journée (Nexus watchdog, Obsidian routing, restart command...).

---

## ÉTAPE 2 — Relancer Nexus avec le nouveau start.bat

```
cd C:\Users\douba\OneDrive\Bureau\ibrahim\ibrahim\nexus
start.bat
```

**Ce qui change:** `start.bat` lance maintenant `nexus_watchdog.py` au lieu de `nexus.py` directement.
- Le watchdog surveille nexus.py et le relance si ça crash
- "redémarre Nexus" via Telegram envoie SIGTERM → watchdog relance automatiquement
- Plus jamais de Nexus mort sans récupération

**Vérifie:** Telegram doit afficher "NEXUS en ligne — PC connecté"

---

## ÉTAPE 3 — Tester Obsidian Brain

Envoie dans Telegram: **"trouve le vault Obsidian"**

**Ce qui doit se passer:**
1. OBSIDIAN_AGENT sélectionné (routing fixed)
2. `obsidian_find_vault` appelé
3. Nexus cherche `.obsidian` dans Documents, OneDrive, Desktop
4. Répond avec le chemin du vault

**Si ça marche:** Dzaryx connaît ton vault Obsidian → peut lire/écrire les profils clients

**Si timeout:** dis "redémarre Nexus" puis réessaie

---

## ÉTAPE 4 — Supabase backfill owner_price_per_day

**Pourquoi:** Toutes les réservations existantes ont `owner_price_per_day = NULL`
→ Dzaryx répond "❓profit inconnu" pour chaque réservation
→ Les rapports financiers n'ont pas de bénéfice réel

Ouvre: https://supabase.com/dashboard/project/febrrgqpyqqrewcohomx/sql/new

### Requête 1 — Voir les réservations sans prix Houari

```sql
SELECT b.id, c.name, b.start_date, b.owner_price_per_day
FROM bookings b
JOIN cars c ON c.id = b.car_id
WHERE b.owner_price_per_day IS NULL
  AND b.status IN ('CONFIRMED', 'ACTIVE', 'COMPLETED')
ORDER BY b.start_date DESC
LIMIT 30;
```

### Requête 2 — Backfill avec les prix Houari

⚠️ VÉRIFIE les prix avant d'exécuter — corrige si différent de la réalité

```sql
UPDATE bookings b
SET owner_price_per_day = v.houari_price
FROM (VALUES
  ('Jumpy 9p',       44),
  ('Berlingo',       44),
  ('Jogger',         37),
  ('Sandero',        22),
  ('Clio 5',         37),
  ('Clio 5 Alpine',  44),
  ('Clio 4 v1',      16),
  ('Clio 4 v2',      24),
  ('i10',            19),
  ('Fiat 500',       24),
  ('R.Duster',       31),
  ('D.Duster',       44),
  ('Creta',          24),
  ('Fiat 500 XL',    37)
) AS v(car_name, houari_price)
JOIN cars ON cars.name = v.car_name
WHERE b.car_id = cars.id
  AND b.owner_price_per_day IS NULL;
```

### Requête 3 — Vérifier le résultat

```sql
SELECT
  COUNT(*)                                AS total_bookings,
  COUNT(owner_price_per_day)              AS with_owner_price,
  COUNT(*) - COUNT(owner_price_per_day)   AS still_missing,
  ROUND(AVG(owner_price_per_day), 2)     AS avg_owner_price,
  ROUND(AVG(client_price_per_day), 2)    AS avg_client_price
FROM bookings
WHERE status IN ('CONFIRMED', 'ACTIVE', 'COMPLETED');
```

`still_missing = 0` → succès. Envoie le résultat à Claude.

---

## ÉTAPE 5 — Tester les rapports financiers

Dans Telegram: **"rapport financier mai 2026"**

Doit afficher de vrais bénéfices (plus de "❓profit inconnu").

---

## Résumé des fixes déployés aujourd'hui

| Fix | Statut |
|-----|--------|
| Anti-hallucination Gates 1-4c | ✅ Déployé |
| OBSIDIAN_AGENT routing | ✅ Déployé |
| "redémarre Nexus" via Telegram | ✅ Déployé |
| Nexus find_obsidian_vault non-bloquant | ✅ Déployé (besoin restart) |
| start.bat → watchdog | ✅ Déployé (besoin git pull) |
| Supabase owner_price_per_day | ⏳ Ce soir (étape 4) |
| Test vault Obsidian end-to-end | ⏳ Ce soir (étape 3) |
