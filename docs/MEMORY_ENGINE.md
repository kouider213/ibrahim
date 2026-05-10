# MEMORY ENGINE — Architecture Dzaryx
**Version :** 1.1 — P12a Fondation  
**Date :** 2026-05-10  
**Statut :** Phase A terminée ✅

---

## Statut d'implémentation

| Phase | Scope | Statut | Branch |
|-------|-------|--------|--------|
| **P12a** | Tables SQL + migration + types TS | ✅ **DONE** | `feat/p12a-memory-engine` |
| P12b | `context-builder.ts` score-based + token budget | ⏳ À faire | — |
| P12c | `proactive-engine` BullMQ (12 triggers) | ⏳ À faire | — |
| P12d | Redis active context + auto-episode + cleanup | ⏳ À faire | — |

### P12a — Ce qui a été créé

**Fichiers SQL :**
- `supabase/migration_p12a_memory_engine.sql` — migration UP (idempotente)
- `supabase/migration_p12a_memory_engine_rollback.sql` — migration DOWN

**Tables créées :**
- `user_profile` — profil structuré Kouider (1 ligne seed)
- `memory_facts` — facts sémantiques permanents (13 seeds + migration ibrahim_memory)
- `memory_episodes` — mémoire épisodique 30j avec full-text search
- `memory_habits` — patterns comportementaux récurrents

**Enrichissement :**
- `ibrahim_rules` — 5 colonnes ajoutées (priority, trigger_type, auto_apply, last_applied, apply_count)

**TypeScript (`backend/src/integrations/supabase.ts`) :**
- Types : `MemoryFact`, `MemoryEpisode`, `MemoryHabit`, `UserProfile`, `IbrahimMemory`
- Helpers : `getUserProfile()`, `getMemoryFacts()`, `upsertMemoryFact()`, `addMemoryEpisode()`, `getRecentEpisodes()`, `getActiveHabits()`

**Non-destructif :** `ibrahim_memory` et les tools existants (`recall_memory`, `remember_info`) sont intacts.

---

## Préambule — État réel de la mémoire aujourd'hui

Avant de concevoir, voici la vérité exacte de ce qui existe :

### Ce qui existe (code audité P10/P11)

| Composant | Table | Implémentation actuelle | Limite |
|-----------|-------|------------------------|--------|
| Mémoire permanente | `ibrahim_memory` | `content TEXT + category TEXT` | Flat, non structuré |
| Règles métier | `ibrahim_rules` | `rule TEXT + conditions JSONB` | Non scorées, toutes actives |
| Historique chat | `conversations` | `role + content` par session | Compaction à 20 msgs / 8K tokens |
| Rappel mémoire | `recall_memory` tool | `ILIKE '%query%' LIMIT 20` | Pas de sémantique, FIFO |
| Injection contexte | `context-builder.ts` | 20 entrées récentes → plain text | Pas de tri par pertinence |
| Compaction | `compaction.ts` | Résumé Claude si > 20 msgs | Résumé unique par session |

### Ce qui manque

- ❌ Profil utilisateur structuré (habitudes, horaires, famille, santé)
- ❌ Recherche sémantique (pgvector ou équivalent)
- ❌ Scoring de pertinence des souvenirs
- ❌ Mémoire volatile/rapide (Redis) distincte de la mémoire longue
- ❌ Détection d'urgence et scoring
- ❌ Moteur de triggers proactifs
- ❌ Déduplication / compression mémoire
- ❌ Contexte actif (ce qui se passe EN CE MOMENT)
- ❌ Intégration géolocalisation
- ❌ Tracking santé / famille
- ❌ Budget tokens géré intelligemment

---

## Vision — Ce que doit être le cerveau Dzaryx

> Dzaryx ne doit pas être un chatbot qui répond.  
> Dzaryx doit être un co-pilote qui ANTICIPE.  
>  
> Il sait à quelle heure Kouider commence à travailler.  
> Il sait qu'une voiture doit rentrer aujourd'hui à 17h.  
> Il sait que Kouider prend sa vitamine le matin.  
> Il sait que le trajet Bruxelles prend 25 min quand il pleut.  
> Il sait que Houari doit encore confirmer la Creta.  
> Il agit avant qu'on lui demande.

---

## Architecture — 4 couches mémoire

```
┌─────────────────────────────────────────────────────────────────┐
│  COUCHE 0 — WORKING MEMORY (Redis, volatile, TTL 4h)            │
│  Contexte actuel de la session + état temps réel                │
├─────────────────────────────────────────────────────────────────┤
│  COUCHE 1 — EPISODIC MEMORY (Supabase, 30 jours)                │
│  Ce qui s'est passé récemment — événements, conversations       │
├─────────────────────────────────────────────────────────────────┤
│  COUCHE 2 — SEMANTIC MEMORY (Supabase, permanent)               │
│  Profil structuré + faits persistants + habitudes               │
├─────────────────────────────────────────────────────────────────┤
│  COUCHE 3 — PROCEDURAL MEMORY (Supabase, permanent)             │
│  Règles métier + comportements appris + politiques              │
└─────────────────────────────────────────────────────────────────┘
```

---

## Couche 0 — Working Memory (Redis)

**Objectif :** Contexte actuel, ultra-rapide, volatile. Perdu si Railway restart.  
**TTL :** 4 heures par défaut, renouvelé à chaque interaction.  
**Redis existant :** déjà utilisé pour BullMQ — même connexion.

### Clés Redis à créer

```
dzaryx:active:session          → JSON: session courante + statut (listening/idle/busy)
dzaryx:active:weather          → JSON: météo Oran + Bruxelles (cache 5min — EXISTE DÉJÀ)
dzaryx:active:nexus            → JSON: état Nexus PC (online/offline/busy) (EXISTE DÉJÀ via heartbeat)
dzaryx:active:fleet            → JSON: état flotte en temps réel (cache 2min)
dzaryx:active:geoloc           → JSON: {lat, lng, city, commute_eta_min} (FUTUR)
dzaryx:active:emotion          → JSON: {tone: 'stressed'|'calm'|'happy', detected_at: ISO}
dzaryx:active:task_in_progress → JSON: tâche en cours + progression (FUTUR)
dzaryx:urgency:queue           → ZSET scored: liste triggers urgents à notifier
dzaryx:lock:proactive:{job}    → STRING NX: anti-doublon proactif (EXISTE DÉJÀ pour crons)
```

### Ce qui doit vivre en Working Memory

| Clé | Contenu | TTL | Source |
|-----|---------|-----|--------|
| `session` | sessionId actif, canal (app/telegram), dernière interaction | 4h | processMessage() |
| `weather` | temp, condition, wind, precip | 5min | Open-Meteo API |
| `fleet` | voitures ACTIVE + retours aujourd'hui | 2min | Supabase |
| `nexus` | online/busy/hostname/uptime | mis à jour par heartbeat | ws_client.py |
| `geoloc` | position actuelle + ETA trajet | 15min | FUTUR: mobile ou Nexus |
| `emotion` | ton détecté dernier message | 1h | Claude analysis |
| `urgency_queue` | triggers en attente de notification | TTL variable | Proactive Engine |

---

## Couche 1 — Episodic Memory (Supabase, 30j)

**Objectif :** Ce qui s'est passé récemment. Queryable par date et type.  
**Rétention :** 30 jours glissants, auto-nettoyage.

### Table : `memory_episodes`

```sql
CREATE TABLE memory_episodes (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  episode_type  TEXT NOT NULL,
  -- types: conversation_summary, booking_event, calendar_event,
  --        financial_event, vehicle_event, notification_sent,
  --        user_request, proactive_trigger, document_scan
  
  summary       TEXT NOT NULL,          -- résumé 1-3 lignes max
  entities      JSONB DEFAULT '{}',     -- {client, vehicle, amount, date, ...}
  sentiment     TEXT DEFAULT 'neutral', -- positive/neutral/negative/urgent
  importance    INT DEFAULT 3,          -- 1 (low) → 5 (critical)
  session_id    TEXT,                   -- lié à une conversation si applicable
  source        TEXT NOT NULL,          -- 'telegram' | 'app' | 'cron' | 'nexus' | 'system'
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at    TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '30 days',
  
  -- Recherche
  search_vector TSVECTOR,               -- full-text search FR
  CONSTRAINT check_importance CHECK (importance BETWEEN 1 AND 5)
);

CREATE INDEX idx_episodes_type    ON memory_episodes(episode_type, occurred_at DESC);
CREATE INDEX idx_episodes_import  ON memory_episodes(importance DESC, occurred_at DESC);
CREATE INDEX idx_episodes_source  ON memory_episodes(source, occurred_at DESC);
CREATE INDEX idx_episodes_fts     ON memory_episodes USING gin(search_vector);
CREATE INDEX idx_episodes_expires ON memory_episodes(expires_at);

-- Auto-nettoyage : supprimer les épisodes expirés
-- Appelé par un job BullMQ hebdomadaire : jobMemoryCleanup
```

### Ce qui génère des épisodes

```typescript
// Exemples d'épisodes auto-générés (pas de saisie manuelle)

{
  episode_type: 'booking_event',
  summary: 'Réservation créée: Mehdi Bouali — BMW X5 — 15-20 mai',
  entities: { client: 'Mehdi Bouali', vehicle: 'BMW X5', start: '2026-05-15', amount: 450 },
  importance: 4,
  source: 'app'
}

{
  episode_type: 'vehicle_event',
  summary: 'Creta retournée avec 2h de retard par client Amira',
  entities: { vehicle: 'Creta', delay_hours: 2, client: 'Amira' },
  importance: 3,
  source: 'system'
}

{
  episode_type: 'notification_sent',
  summary: 'Morning briefing envoyé: 2 voitures actives, météo 28°C',
  entities: { active_count: 2, weather_temp: 28 },
  importance: 1,
  source: 'cron'
}

{
  episode_type: 'conversation_summary',
  summary: 'Kouider a demandé un rapport TikTok et validé la Creta pour weekend',
  entities: { topics: ['tiktok', 'reservation'], decisions: ['creta_weekend'] },
  importance: 2,
  source: 'app'
}
```

**Note :** La table `conversations` existante garde le détail brut. `memory_episodes` contient les **résumés significatifs** — ce qui mérite d'être rappelé.

---

## Couche 2 — Semantic Memory (Supabase, permanent)

**Objectif :** Qui est Kouider. Ce qu'il aime, comment il travaille, sa famille, sa santé.  
**Rétention :** Permanent, mis à jour mais jamais supprimé automatiquement.

### Table : `user_profile` (une seule ligne pour Kouider)

```sql
CREATE TABLE user_profile (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         TEXT NOT NULL DEFAULT 'kouider',  -- unique owner
  
  -- Identité
  name            TEXT DEFAULT 'Kouider',
  languages       TEXT[] DEFAULT ARRAY['fr', 'ar'],
  location_primary  TEXT DEFAULT 'Bruxelles',
  location_secondary TEXT DEFAULT 'Oran',
  timezone_primary  TEXT DEFAULT 'Europe/Brussels',
  timezone_secondary TEXT DEFAULT 'Africa/Algiers',
  
  -- Horaires travail
  work_days         INT[] DEFAULT ARRAY[1,2,3,4,5],  -- 1=lundi, 7=dimanche
  work_start        TIME DEFAULT '09:00',
  work_end          TIME DEFAULT '17:30',
  flex_hours        BOOLEAN DEFAULT TRUE,
  commute_mode      TEXT DEFAULT 'car',               -- 'car'|'transit'|'walk'
  commute_minutes_avg INT DEFAULT 25,
  
  -- Routine matin
  wake_time         TIME DEFAULT '07:00',
  morning_vitamins  BOOLEAN DEFAULT FALSE,
  morning_coffee    BOOLEAN DEFAULT TRUE,
  breakfast         BOOLEAN DEFAULT TRUE,
  
  -- Routine soir
  sleep_time        TIME DEFAULT '23:30',
  wind_down_minutes INT DEFAULT 30,
  
  -- Famille
  family_members    JSONB DEFAULT '[]',
  -- ex: [{"name":"X","relation":"partner","reminder_gap_days":3}]
  quality_time_gap_days INT DEFAULT 3,               -- alerte si pas de temps en famille depuis N jours
  
  -- Santé
  medications       TEXT[] DEFAULT ARRAY[]::TEXT[],
  supplements       TEXT[] DEFAULT ARRAY[]::TEXT[],
  health_reminders  BOOLEAN DEFAULT FALSE,
  
  -- Préférences Dzaryx
  preferred_channel  TEXT DEFAULT 'telegram',         -- 'telegram'|'app'|'both'
  response_style     TEXT DEFAULT 'concise',          -- 'concise'|'detailed'
  voice_mode        BOOLEAN DEFAULT TRUE,
  language_auto     BOOLEAN DEFAULT TRUE,             -- auto-détecte fr/ar selon message
  
  -- Business
  business_role      TEXT DEFAULT 'owner',
  business_partner   TEXT DEFAULT 'Houari',
  business_location  TEXT DEFAULT 'Oran',
  profit_split_pct   NUMERIC DEFAULT 0.5,             -- % de Kouider
  
  -- Mise à jour
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_user UNIQUE(user_id)
);
```

### Table : `memory_facts` (remplace `ibrahim_memory` avec structure)

```sql
CREATE TABLE memory_facts (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     TEXT NOT NULL DEFAULT 'kouider',
  
  -- Classification
  domain      TEXT NOT NULL,
  -- domains: identity, habit, routine, preference, goal, health,
  --           family, business, vehicle, client, finance, learning

  key         TEXT NOT NULL,    -- identifiant unique du fait dans son domaine
  -- ex: 'vitamin_brand', 'preferred_coffee', 'commute_app', 'gym_day'
  
  value       TEXT NOT NULL,    -- valeur du fait
  value_type  TEXT DEFAULT 'text', -- 'text'|'boolean'|'number'|'json'|'date'
  value_json  JSONB,            -- si value_type='json'
  
  -- Contexte
  confidence  NUMERIC DEFAULT 1.0,   -- 0.0-1.0 (1=explicite, 0.5=inféré)
  source      TEXT DEFAULT 'explicit', -- 'explicit'|'inferred'|'learned'
  verified    BOOLEAN DEFAULT FALSE,
  
  -- Temporalité
  is_current  BOOLEAN DEFAULT TRUE,  -- false = ancien/expiré
  valid_from  DATE,
  valid_until DATE,
  
  -- Mémoire
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT unique_fact UNIQUE(user_id, domain, key)
);

CREATE INDEX idx_facts_domain   ON memory_facts(user_id, domain);
CREATE INDEX idx_facts_current  ON memory_facts(user_id, is_current) WHERE is_current = TRUE;
```

### Exemples de facts structurés

```typescript
// IDENTITÉ
{ domain: 'identity', key: 'name', value: 'Kouider' }
{ domain: 'identity', key: 'location', value: 'Bruxelles (primaire) / Oran (famille/business)' }

// HABITUDES
{ domain: 'habit', key: 'wake_time', value: '07:00', value_type: 'text' }
{ domain: 'habit', key: 'vitamin_morning', value: 'true', value_type: 'boolean' }
{ domain: 'habit', key: 'coffee_cups', value: '2', value_type: 'number' }
{ domain: 'habit', key: 'gym_days', value: '["lundi","mercredi"]', value_type: 'json' }

// ROUTINES
{ domain: 'routine', key: 'commute_avg_minutes', value: '25', value_type: 'number' }
{ domain: 'routine', key: 'work_start', value: '09:00' }
{ domain: 'routine', key: 'lunch_break', value: '30min vers 13h' }

// PRÉFÉRENCES
{ domain: 'preference', key: 'response_style', value: 'direct, pas de blabla' }
{ domain: 'preference', key: 'reminder_format', value: 'courts, avec heure précise' }

// SANTÉ
{ domain: 'health', key: 'vitamin_d', value: '2000 IU le matin' }
{ domain: 'health', key: 'water_reminder', value: 'every 2h' }

// FAMILLE
{ domain: 'family', key: 'family_time_gap_alert', value: '3', value_type: 'number' }
{ domain: 'family', key: 'important_dates', value: '["2026-06-15 anniversaire"]', value_type: 'json' }

// OBJECTIFS
{ domain: 'goal', key: 'business_target_2026', value: '120k€ chiffre affaires' }
{ domain: 'goal', key: 'fleet_expansion', value: 'ajouter 2 véhicules avant juillet' }
{ domain: 'goal', key: 'tiktok_weekly', value: '2 vidéos par semaine' }

// BUSINESS
{ domain: 'business', key: 'partner_contact', value: 'Houari — confirmation requise pour remises' }
{ domain: 'business', key: 'deposit_policy', value: 'acompte 30% à la réservation' }
```

### Table : `memory_habits` (patterns comportementaux)

```sql
CREATE TABLE memory_habits (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       TEXT NOT NULL DEFAULT 'kouider',
  habit_name    TEXT NOT NULL,
  
  -- Quand
  schedule_type TEXT NOT NULL,  -- 'daily'|'weekly'|'interval'|'condition'
  schedule_cron TEXT,           -- ex: '0 8 * * 1-5' (lundi-vendredi 8h)
  interval_hours INT,           -- si interval: toutes les N heures
  condition     TEXT,           -- si condition: ex: 'before_work'|'after_meal'
  
  -- Quoi
  description   TEXT NOT NULL,
  action_type   TEXT NOT NULL,  -- 'remind'|'check'|'notify'|'auto_do'
  action_data   JSONB DEFAULT '{}',
  
  -- Suivi
  last_done_at  TIMESTAMPTZ,
  streak_days   INT DEFAULT 0,
  missed_count  INT DEFAULT 0,
  active        BOOLEAN DEFAULT TRUE,
  
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Exemples de habits

```typescript
{
  habit_name: 'vitamin_morning',
  schedule_type: 'daily',
  schedule_cron: '0 8 * * *',
  description: 'Rappel vitamine D le matin',
  action_type: 'remind',
  action_data: { message: '💊 N\'oublie pas ta vitamine D !', channel: 'telegram' }
}

{
  habit_name: 'family_quality_time',
  schedule_type: 'interval',
  interval_hours: 72,  // 3 jours
  description: 'Rappel temps famille si pas mentionné depuis 3 jours',
  action_type: 'notify',
  action_data: { message: '👨‍👩‍👧 Tu n\'as pas parlé famille depuis 3 jours.' }
}

{
  habit_name: 'morning_briefing_supplement',
  schedule_type: 'condition',
  condition: 'after_morning_briefing',
  description: 'Après briefing, ajouter état mental / priorité du jour',
  action_type: 'check',
  action_data: { prompt: 'Comment se sent Kouider ce matin ?' }
}
```

---

## Couche 3 — Procedural Memory (Supabase, permanent)

**Objectif :** Règles métier, politiques, comportements appris.  
**Table existante :** `ibrahim_rules` — à enrichir mais pas remplacer.

### Enrichissement de `ibrahim_rules`

```sql
-- Colonnes à ajouter à ibrahim_rules existant :
ALTER TABLE ibrahim_rules
  ADD COLUMN IF NOT EXISTS priority     INT DEFAULT 5,      -- 1=critique, 10=basse
  ADD COLUMN IF NOT EXISTS trigger_type TEXT DEFAULT 'any', -- 'booking'|'payment'|'client'|'vehicle'|'any'
  ADD COLUMN IF NOT EXISTS auto_apply   BOOLEAN DEFAULT FALSE, -- appliqué sans demande
  ADD COLUMN IF NOT EXISTS last_applied TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS apply_count  INT DEFAULT 0;
```

---

## Budget tokens — Gestion intelligente

**Problème :** Claude reçoit un `systemExtra` non géré → peut dépasser le budget facilement.

### Budget actuel (non géré)
```
System prompt (cached)  : ~2 000 tokens
systemExtra (non géré)  : 500-3 000 tokens (variable)
Conversation history    : 500-8 000 tokens (variable)
Total                   : 3 000-13 000 tokens (peut dépasser le max)
```

### Budget cible (P12 — géré)

```typescript
interface TokenBudget {
  total_available:     4_096;  // standard, ou 12_000 avec thinking
  system_prompt:       2_000;  // fixed, cached → 0 coût effectif
  context_available:   2_096;  // reste pour systemExtra

  // Allocation par couche (priorité décroissante)
  allocations: {
    time_locale:         100;   // heure Bruxelles + Oran + jour
    weather:              80;   // temp + condition (si pertinent)
    active_context:      200;   // session, nexus, geoloc (si pertinent)
    user_profile_key:    150;   // 5-8 facts les plus pertinents
    urgent_items:        300;   // bookings retard + paiements urgents
    upcoming_bookings:   200;   // 3-5 prochaines réservations
    calendar:            150;   // 3 prochains events Calendar
    finance_summary:     100;   // bénéfice mois (si pertinent)
    habits_active:        80;   // habitudes actives aujourd'hui
    memory_relevant:     300;   // 8-10 facts pertinents à la question
    rules_relevant:      200;   // 3-5 règles pertinentes
    // TOTAL                   : 1 860 tokens → sous le budget
  }
}
```

### Sélection intelligente des souvenirs

Actuellement : 20 entrées les plus récentes (FIFO = pas de pertinence).

**Cible :** Score de pertinence composite avant injection.

```typescript
function scoreMemoryFact(fact: MemoryFact, query: string, context: ActiveContext): number {
  let score = 0;

  // 1. Pertinence sémantique (simple TF-IDF ou keyword match pour l'instant)
  const queryWords = query.toLowerCase().split(' ');
  const factWords  = fact.value.toLowerCase().split(' ');
  const overlap    = queryWords.filter(w => factWords.includes(w)).length;
  score += overlap * 10;

  // 2. Fraîcheur (récent = plus pertinent)
  const daysSinceUpdate = (Date.now() - fact.updated_at.getTime()) / 86_400_000;
  score += Math.max(0, 30 - daysSinceUpdate);

  // 3. Domaine pertinent au contexte
  if (context.intent === 'booking' && fact.domain === 'business') score += 20;
  if (context.intent === 'health' && fact.domain === 'health')    score += 30;
  if (context.intent === 'family' && fact.domain === 'family')    score += 30;

  // 4. Importance explicite
  score += fact.confidence * 10;

  return score;
}

// Sélectionner les 10 facts les plus pertinents dans le budget
const selectedFacts = allFacts
  .map(f => ({ fact: f, score: scoreMemoryFact(f, query, ctx) }))
  .sort((a, b) => b.score - a.score)
  .slice(0, 10)
  .map(({ fact }) => fact);
```

---

## Moteur de triggers proactifs

**Principe :** Un job BullMQ `proactive-engine` tourne toutes les 15 minutes.  
Il évalue des règles de déclenchement et met les alertes dans `dzaryx:urgency:queue` Redis.

### Structure d'un trigger

```typescript
interface ProactiveTrigger {
  id:           string;      // uuid
  type:         TriggerType;
  urgency:      number;      // 0-100
  title:        string;
  message:      string;      // texte à envoyer
  channel:      'telegram' | 'pushover' | 'both';
  condition:    string;      // description lisible de la condition
  cooldown_h:   number;      // ne pas réémettre avant N heures
  auto_send:    boolean;     // envoyer automatiquement (true) ou attendre confirmation (false)
  expires_at:   Date;
  context:      Record<string, unknown>;  // données associées
}

type TriggerType =
  | 'vehicle_overdue'         // voiture pas rendue
  | 'payment_overdue'         // solde impayé
  | 'partner_no_confirm'      // Houari n'a pas confirmé
  | 'work_start_reminder'     // tu travailles dans 1h
  | 'commute_now'             // prends la route maintenant
  | 'health_reminder'         // vitamine / eau / pause
  | 'family_time'             // temps famille
  | 'traffic_alert'           // trafic élevé trajet habituel
  | 'idle_vehicle'            // voiture sans réservation >7j
  | 'booking_conflict'        // chevauchement réservations
  | 'weather_change'          // météo Oran change pour clients
  | 'low_fleet'               // <2 voitures disponibles
  | 'weekly_goal'             // suivi objectif hebdo
  | 'habit_missed';           // habitude non faite
```

### Règles de déclenchement (15 premières)

```typescript
const PROACTIVE_RULES: ProactiveRule[] = [

  // ── BUSINESS CRITIQUE ────────────────────────────────────────

  {
    id: 'vehicle_overdue',
    check: async (ctx) => {
      const now = new Date();
      const { data: overdue } = await supabase
        .from('bookings')
        .select('*, cars(name)')
        .in('status', ['ACTIVE', 'CONFIRMED'])
        .lt('end_date', now.toISOString().slice(0, 10));
      return overdue?.map(b => ({
        urgency: 90,
        title: `🚨 Véhicule en retard`,
        message: `${b.cars?.name} — ${b.client_name} devait rendre aujourd'hui. Contacte-le.`,
        cooldown_h: 3,
        auto_send: true,
      }));
    }
  },

  {
    id: 'payment_overdue',
    check: async (ctx) => {
      // Solde dû depuis >3 jours
      const { data: unpaid } = await supabase
        .from('bookings')
        .select('*, cars(name)')
        .in('payment_status', ['PENDING', 'PARTIAL'])
        .in('status', ['ACTIVE', 'COMPLETED'])
        .lt('start_date', new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10));
      return unpaid?.map(b => ({
        urgency: 85,
        title: '💰 Paiement en retard',
        message: `${b.client_name} — solde dû: ${b.final_price - b.paid_amount}€ depuis >3 jours`,
        cooldown_h: 24,
        auto_send: false,  // Kouider doit valider avant qu'on contacte le client
      }));
    }
  },

  {
    id: 'partner_no_confirm',
    check: async (ctx) => {
      // Réservation créée par Houari mais non confirmée depuis >4h
      const { data: pending } = await supabase
        .from('bookings')
        .select('*')
        .eq('status', 'PENDING')
        .eq('rented_by', 'houari')
        .lt('created_at', new Date(Date.now() - 4 * 3_600_000).toISOString());
      return pending?.map(b => ({
        urgency: 70,
        title: '⏳ Houari n\'a pas confirmé',
        message: `Réservation ${b.client_name} — ${b.cars?.name} créée il y a 4h+ et non confirmée.`,
        cooldown_h: 4,
        auto_send: true,
      }));
    }
  },

  {
    id: 'low_fleet',
    check: async (ctx) => {
      const { data: available } = await supabase
        .from('cars').select('id').eq('available', true);
      if ((available?.length ?? 0) < 2) return [{
        urgency: 65,
        title: '🚗 Flotte faible',
        message: `Seulement ${available?.length} voiture(s) disponible(s). Vérifie les retours prévus.`,
        cooldown_h: 12,
        auto_send: true,
      }];
    }
  },

  {
    id: 'idle_vehicle_7d',
    check: async (ctx) => { /* similaire à jobIdleVehicleAlert */ }
  },

  // ── WORK / SCHEDULE ──────────────────────────────────────────

  {
    id: 'work_start_reminder',
    check: async (ctx) => {
      const profile = ctx.userProfile;
      const now     = new Date();
      const workStart = profile.work_start; // '09:00'
      const minutesUntilWork = minutesUntil(workStart, profile.timezone_primary);
      if (minutesUntilWork > 0 && minutesUntilWork <= 60 && isWorkDay(now, profile.work_days)) {
        return [{
          urgency: 60,
          title: '💼 Travail dans 1h',
          message: `Tu commences dans ${minutesUntilWork} min. Tes priorités: [génère depuis bookings + calendar].`,
          cooldown_h: 24,
          auto_send: true,
        }];
      }
    }
  },

  {
    id: 'commute_now',
    check: async (ctx) => {
      // Si géoloc disponible + heure de trajet proche
      const geoloc = ctx.geoloc;
      if (!geoloc?.available) return [];
      const eta = geoloc.commute_eta_min;
      const workStart = ctx.userProfile.work_start;
      const minutesUntilWork = minutesUntil(workStart, ctx.userProfile.timezone_primary);
      if (minutesUntilWork <= eta + 10 && minutesUntilWork > 0) {
        return [{
          urgency: 75,
          title: '🚗 Prends la route maintenant',
          message: `Trajet estimé: ${eta} min. Si tu pars maintenant, tu arrives à l'heure.`,
          cooldown_h: 24,
          auto_send: true,
        }];
      }
    }
  },

  {
    id: 'traffic_alert',
    check: async (ctx) => {
      // FUTUR: Google Maps / TomTom API pour trafic temps réel
    }
  },

  // ── SANTÉ / BIEN-ÊTRE ────────────────────────────────────────

  {
    id: 'health_vitamin',
    check: async (ctx) => {
      const vitaminHabit = ctx.habits.find(h => h.habit_name === 'vitamin_morning');
      if (!vitaminHabit?.active) return [];
      const hoursSinceDone = vitaminHabit.last_done_at
        ? (Date.now() - vitaminHabit.last_done_at.getTime()) / 3_600_000
        : 25;
      if (hoursSinceDone > 24) return [{
        urgency: 50,
        title: '💊 Vitamine',
        message: `Tu n\'as pas pris ta vitamine aujourd'hui. Rappel configuré pour demain à 8h.`,
        cooldown_h: 20,
        auto_send: true,
      }];
    }
  },

  {
    id: 'water_reminder',
    check: async (ctx) => {
      // Si habit water_reminder actif + intervalle dépassé
    }
  },

  // ── FAMILLE ─────────────────────────────────────────────────

  {
    id: 'family_time',
    check: async (ctx) => {
      const gapDays = ctx.userProfile.quality_time_gap_days;
      // Chercher dans memory_episodes: dernière mention famille
      const { data } = await supabase
        .from('memory_episodes')
        .select('occurred_at')
        .eq('episode_type', 'family_moment')
        .order('occurred_at', { ascending: false })
        .limit(1);
      const daysSince = data?.[0]
        ? (Date.now() - new Date(data[0].occurred_at).getTime()) / 86_400_000
        : gapDays + 1;
      if (daysSince >= gapDays) return [{
        urgency: 55,
        title: '👨‍👩‍👧 Temps famille',
        message: `Ça fait ${Math.round(daysSince)} jours. Passe du temps en famille ce soir.`,
        cooldown_h: 48,
        auto_send: true,
      }];
    }
  },

  // ── OBJECTIFS ────────────────────────────────────────────────

  {
    id: 'weekly_goal_check',
    check: async (ctx) => {
      // Vendredi après-midi: bilan objectifs hebdo
      const now = new Date();
      if (now.getDay() !== 5 || now.getHours() < 16) return [];
      const goals = ctx.facts.filter(f => f.domain === 'goal');
      if (goals.length === 0) return [];
      return [{
        urgency: 40,
        title: '📊 Bilan semaine',
        message: `C'est vendredi — comment s'est passée la semaine par rapport à tes objectifs ?`,
        cooldown_h: 168, // 1 semaine
        auto_send: true,
      }];
    }
  }
];
```

### Scoring et priorité des triggers

```typescript
function prioritizeAndFilter(triggers: ProactiveTrigger[]): ProactiveTrigger[] {
  return triggers
    .filter(t => t.urgency >= 40)                  // seuil minimum
    .sort((a, b) => b.urgency - a.urgency)          // trier par urgence
    .slice(0, 3);                                   // max 3 triggers par cycle
    // → évite le flood de notifications
}
```

---

## Gestion privacy / sécurité

### Principes

1. **Isolation utilisateur** — `user_id = 'kouider'` sur tous les faits. Si multi-utilisateur futur → WHERE user_id enforced partout.
2. **Chiffrement sensible** — santé, données famille → `pgcrypto` ou column-level encryption (Supabase Vault future).
3. **Accès backend uniquement** — aucune API publique pour lire la mémoire brute. Tout passe par l'orchestrateur.
4. **Rétention limitée** — épisodes : 30 jours. Résumés compaction : 24h. Facts : permanent mais `is_current=false` pour désactiver sans supprimer.
5. **Audit trail** — tout `remember_info`, `learn_rule`, `recall_memory` est loggué dans la table `conversations` (déjà fait via tool_use).
6. **Pas de données tiers** — les données clients (Mehdi, Amira...) restent dans `bookings` + `client_documents`. `memory_facts` ne stocke jamais de données clients personnelles en clair.

### Ce qui NE doit PAS aller en mémoire
- Numéros de carte bancaire (jamais)
- Mots de passe (jamais)
- Données santé tiers (seulement Kouider avec consentement explicite)
- Localisations en temps réel clients WhatsApp

---

## Plan d'implémentation — 4 phases

### Phase A — Fondations (P12a) — 1-2 jours

```
1. Créer tables: memory_episodes, memory_facts, memory_habits
2. Migrer ibrahim_memory → memory_facts (script de migration)
3. Enrichir ibrahim_rules (colonnes priority, trigger_type, auto_apply)
4. Créer user_profile avec valeurs initiales de Kouider
5. Ajouter Redis keys: dzaryx:active:* (TTL 4h)
6. Modifier context-builder.ts: score-based memory selection
```

### Phase B — Profil + Habits (P12b) — 1-2 jours

```
1. Créer API endpoint POST /api/memory/profile (update profil)
2. Créer API endpoint GET /api/memory/facts (lire par domaine)
3. Créer API endpoint POST /api/memory/fact (créer/update fact)
4. Modifier remember_info tool: utiliser memory_facts au lieu de ibrahim_memory
5. Créer memory_habits avec les 3 habits initiaux (vitamine, famille, work)
6. Modifier morning-briefing job: injecter profil + habits contexte
```

### Phase C — Triggers proactifs (P12c) — 2-3 jours

```
1. Créer job BullMQ: proactive-engine (toutes 15 min)
2. Implémenter les 12 règles trigger prioritaires
3. Créer Redis ZSET: dzaryx:urgency:queue
4. Créer dispatcher: lit la queue → envoie Telegram/Pushover si cooldown OK
5. Ajouter anti-flood: max 3 notifications/heure (toutes urgences confondues)
6. Créer table: proactive_log (historique des notifications envoyées)
```

### Phase D — Context intelligence (P12d) — 1-2 jours

```
1. Modifier context-builder.ts: budget tokens strict (2096 tokens)
2. Implémenter score-based memory selection
3. Ajouter active_context dans systemExtra (Redis keys)
4. Créer auto-episode generator: bookings, payments, conversations → épisodes
5. Modifier recall_memory tool: utiliser memory_facts + memory_episodes
6. Créer memory_cleanup job (hebdo): expire episodes, deduplique facts
```

---

## Injection dans Claude — Format final cible

Le `systemExtra` assemblé après P12 (budget: ~1860 tokens) :

```
═══ CONTEXTE ACTIF [dimanche 10 mai 2026, 15:30 Bruxelles / 14:30 Oran] ═══

📍 LIEU: Bruxelles | Météo Oran: 28°C ensoleillé

👤 PROFIL: Kouider — Dimanche (jour de repos). Wake 7h. Work reprend lundi 9h.
   Routine: café du matin ✅, vitamine ❓ (à vérifier)
   Famille: dernier moment qualité: 2 jours

🚨 URGENT (2):
   • Creta — Mehdi Bouali — retour prévu hier. NON RENDU.
   • BMW X5 — solde 200€ impayé depuis 4 jours.

📅 PROCHAINS (3j):
   • Audi A6 — Amira — arrive lundi 12 mai
   • Hyundai Tucson — libre depuis jeudi
   • RDV Google Calendar: lundi 10h — appel Houari

💼 FLOTTE: 2 voitures actives / 3 dispo / 1 en retard

💰 FINANCE mai: Kouider +1,240€ | Houari +3,100€ (total 4,340€/mois en cours)

🧠 MÉMOIRE PERTINENTE:
   [business] Houari confirme les remises lui-même, ne pas promettre sans lui
   [preference] Kouider préfère les réponses courtes et directes
   [routine] Commute Bruxelles: 25 min en voiture
   [goal] Objectif: 2 TikToks/semaine — cette semaine: 1 fait

📋 RÈGLES ACTIVES:
   • Dépôt 30% requis à la réservation
   • Pas de remise >10% sans validation Houari
   • Contacter client le jour du retour si non rendu avant 12h
```

**Résultat :** Claude reçoit l'essentiel de la vie de Kouider en ~1800 tokens → peut anticiper, prioriser, agir.

---

## Ce qui manque — Roadmap complète

| Capacité | Phase | Effort | Impact |
|----------|-------|--------|--------|
| `user_profile` table + init Kouider | P12a | 2h | Haut |
| `memory_facts` + migration | P12a | 3h | Haut |
| `memory_habits` + 3 habits | P12b | 2h | Moyen |
| Sélection mémoire par score | P12b | 3h | Haut |
| Budget tokens strict context-builder | P12b | 4h | Haut |
| `memory_episodes` + auto-génération | P12c | 4h | Moyen |
| `proactive-engine` job (15min) | P12c | 6h | Critique |
| Triggers: vehicle/payment/partner | P12c | 3h | Critique |
| Triggers: work/commute/health | P12c | 3h | Moyen |
| Triggers: famille/objectifs | P12c | 2h | Moyen |
| Redis active context | P12d | 2h | Moyen |
| Géolocalisation (FUTUR) | P13 | 8h | Élevé |
| Semantic search pgvector (FUTUR) | P14 | 6h | Moyen |
| Multi-device context sync (FUTUR) | P14 | 8h | Faible |

**Effort total Phase P12 (A→D) : ~45h de développement**  
**Impact : Dzaryx passe de chatbot réactif à co-pilote proactif.**

---

*Architecture P12 — Dzaryx Memory Engine — 2026-05-10*  
*Implémentation: commencer par Phase A (tables + user_profile) après validation architecture*
