-- ════════════════════════════════════════════════════════════════
-- Migration Phase 8 — Memory avancée + Phase 8 features
-- Date    : 2026-05-21
-- Tables  : assistant_profiles, learned_rules, user_behavior,
--           conversation_patterns, whatsapp_messages,
--           contracts, payment_links
-- Seed    : Houari dans user_profile + memory_facts
-- ════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════
-- TABLE 1 — assistant_profiles
-- Personnalité Dzaryx par acteur (ton, préférences de réponse)
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS assistant_profiles (
  id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_key        TEXT        UNIQUE NOT NULL,  -- 'kouider' | 'houari'
  display_name     TEXT        NOT NULL,

  -- Personnalité
  response_style   TEXT        NOT NULL DEFAULT 'concise',
  -- concise | detailed | caveman | formal | casual
  default_language TEXT        NOT NULL DEFAULT 'fr',
  -- fr | ar | darija | en
  tone             TEXT        NOT NULL DEFAULT 'professional',
  -- professional | friendly | direct | warm

  -- Préférences canal
  primary_channel  TEXT        NOT NULL DEFAULT 'telegram',
  voice_enabled    BOOLEAN     NOT NULL DEFAULT TRUE,
  tts_voice_id     TEXT,       -- ElevenLabs voice ID spécifique

  -- Contexte métier
  business_focus   TEXT[]      NOT NULL DEFAULT ARRAY['bookings', 'finance', 'clients'],
  location         TEXT        NOT NULL DEFAULT 'Oran',
  timezone         TEXT        NOT NULL DEFAULT 'Africa/Algiers',

  -- Statistiques
  total_messages   INT         NOT NULL DEFAULT 0,
  last_active_at   TIMESTAMPTZ,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE assistant_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_all_assistant_profiles" ON assistant_profiles;
CREATE POLICY "service_role_all_assistant_profiles"
  ON assistant_profiles FOR ALL USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS trg_assistant_profiles_updated_at ON assistant_profiles;
CREATE TRIGGER trg_assistant_profiles_updated_at
  BEFORE UPDATE ON assistant_profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Seed Kouider et Houari
INSERT INTO assistant_profiles (owner_key, display_name, response_style, default_language, tone, primary_channel, location, timezone)
VALUES
  ('kouider', 'Kouider',  'concise',  'fr',     'direct',     'telegram', 'Bruxelles', 'Europe/Brussels'),
  ('houari',  'Houari',   'concise',  'darija', 'friendly',   'app',      'Oran',      'Africa/Algiers')
ON CONFLICT (owner_key) DO NOTHING;

-- ════════════════════════════════════════════════════════════════
-- TABLE 2 — learned_rules
-- Règles apprises depuis les conversations (par acteur)
-- Ex: "Houari dit que le Berlingo est préféré pour les familles"
-- Ex: "Ne jamais confirmer une resa sans acompte pour les nouveaux clients"
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS learned_rules (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_key    TEXT        NOT NULL DEFAULT 'kouider',
  -- 'kouider' | 'houari' | 'global' (s'applique à tous)

  category     TEXT        NOT NULL DEFAULT 'business',
  -- business | client | pricing | communication | operations | reminder

  rule         TEXT        NOT NULL,
  -- La règle en langage naturel

  context      TEXT,       -- Contexte d'apprentissage (optionnel)
  confidence   NUMERIC     NOT NULL DEFAULT 0.9,  -- 0.0 → 1.0
  priority     INT         NOT NULL DEFAULT 5,    -- 1 (faible) → 10 (critique)
  active       BOOLEAN     NOT NULL DEFAULT TRUE,

  -- Source d'apprentissage
  source       TEXT        NOT NULL DEFAULT 'conversation',
  -- conversation | manual | inferred | migration

  -- Utilisation
  apply_count  INT         NOT NULL DEFAULT 0,
  last_applied TIMESTAMPTZ,

  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_learned_rules_owner
  ON learned_rules(owner_key, active) WHERE active = TRUE;
CREATE INDEX IF NOT EXISTS idx_learned_rules_category
  ON learned_rules(owner_key, category, priority DESC);

ALTER TABLE learned_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_all_learned_rules" ON learned_rules;
CREATE POLICY "service_role_all_learned_rules"
  ON learned_rules FOR ALL USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS trg_learned_rules_updated_at ON learned_rules;
CREATE TRIGGER trg_learned_rules_updated_at
  BEFORE UPDATE ON learned_rules
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Seed règles initiales
INSERT INTO learned_rules (owner_key, category, rule, source, priority, confidence) VALUES
  ('global',   'business',       'Acompte minimum 30% à la réservation pour les nouveaux clients', 'manual', 9, 1.0),
  ('global',   'business',       'Vérifier disponibilité voiture avant de confirmer une résa', 'manual', 10, 1.0),
  ('global',   'pricing',        'Profit = client_price_per_day - owner_price_per_day × nb_jours. Jamais utiliser les prix catalogue.', 'manual', 10, 1.0),
  ('global',   'operations',     'Employé gère remises physiques véhicules en Algérie — Kouider ne peut pas y aller depuis Bruxelles', 'manual', 8, 1.0),
  ('kouider',  'communication',  'Kouider préfère les réponses courtes et directes — style caveman quand possible', 'manual', 7, 1.0),
  ('kouider',  'business',       'Kouider est à Bruxelles, travaille pour employeur belge lundi-vendredi', 'manual', 6, 1.0),
  ('houari',   'communication',  'Houari préfère le darija oranais pour communiquer', 'manual', 9, 1.0),
  ('houari',   'operations',     'Houari gère les opérations terrain à Oran directement', 'manual', 8, 1.0)
ON CONFLICT DO NOTHING;

-- ════════════════════════════════════════════════════════════════
-- TABLE 3 — user_behavior
-- Patterns de comportement de chaque utilisateur
-- Mis à jour après chaque conversation
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS user_behavior (
  id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_key         TEXT        UNIQUE NOT NULL,

  -- Volume messages
  total_messages    INT         NOT NULL DEFAULT 0,
  messages_today    INT         NOT NULL DEFAULT 0,
  avg_messages_day  NUMERIC     NOT NULL DEFAULT 0,

  -- Heures d'activité (0-23)
  peak_hour_start   INT         DEFAULT 9,
  peak_hour_end     INT         DEFAULT 21,
  most_active_hour  INT         DEFAULT 10,

  -- Topics les plus demandés (top 10)
  top_topics        TEXT[]      NOT NULL DEFAULT ARRAY[]::TEXT[],
  -- ex: ['réservations', 'finance', 'clients', 'planning']

  -- Canal préféré
  preferred_channel TEXT        NOT NULL DEFAULT 'telegram',
  voice_usage_pct   NUMERIC     NOT NULL DEFAULT 0,

  -- Langue
  primary_language  TEXT        NOT NULL DEFAULT 'fr',
  language_mix      JSONB       NOT NULL DEFAULT '{}',
  -- ex: {"fr": 0.8, "darija": 0.15, "ar": 0.05}

  -- Engagement
  avg_response_time_s INT       DEFAULT NULL,
  last_active_at    TIMESTAMPTZ,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE user_behavior ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_all_user_behavior" ON user_behavior;
CREATE POLICY "service_role_all_user_behavior"
  ON user_behavior FOR ALL USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS trg_user_behavior_updated_at ON user_behavior;
CREATE TRIGGER trg_user_behavior_updated_at
  BEFORE UPDATE ON user_behavior
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Seed
INSERT INTO user_behavior (owner_key, preferred_channel, primary_language, top_topics)
VALUES
  ('kouider', 'telegram', 'fr',     ARRAY['réservations', 'finance', 'planning', 'clients']),
  ('houari',  'app',      'darija', ARRAY['réservations', 'clients', 'parc'])
ON CONFLICT (owner_key) DO NOTHING;

-- ════════════════════════════════════════════════════════════════
-- TABLE 4 — conversation_patterns
-- Patterns récurrents dans les conversations (question types)
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS conversation_patterns (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_key    TEXT        NOT NULL DEFAULT 'kouider',

  pattern_type TEXT        NOT NULL,
  -- daily_briefing | revenue_check | booking_create | client_lookup |
  -- fleet_status | reminder_check | document_request | weather | other

  -- Fréquence
  occurrence_count INT      NOT NULL DEFAULT 1,
  last_seen_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  first_seen_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Exemple de message déclencheur
  example_trigger  TEXT,

  -- Heure typique (0-23)
  typical_hour     INT     DEFAULT NULL,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conv_patterns_owner
  ON conversation_patterns(owner_key, occurrence_count DESC);
CREATE INDEX IF NOT EXISTS idx_conv_patterns_type
  ON conversation_patterns(owner_key, pattern_type);

ALTER TABLE conversation_patterns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_all_conv_patterns" ON conversation_patterns;
CREATE POLICY "service_role_all_conv_patterns"
  ON conversation_patterns FOR ALL USING (true) WITH CHECK (true);

-- ════════════════════════════════════════════════════════════════
-- TABLE 5 — whatsapp_messages
-- Log de tous les messages WhatsApp entrants et sortants
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  from_number  TEXT        NOT NULL,
  to_number    TEXT,
  body         TEXT        NOT NULL,
  direction    TEXT        NOT NULL DEFAULT 'inbound',
  -- inbound | outbound
  lang         TEXT        DEFAULT 'fr',
  media_count  INT         DEFAULT 0,
  media_urls   TEXT[]      DEFAULT ARRAY[]::TEXT[],
  ai_response  TEXT,       -- Réponse générée par Dzaryx
  validated    BOOLEAN     DEFAULT FALSE,
  status       TEXT        DEFAULT 'received',
  -- received | processing | sent | failed | validated
  twilio_sid   TEXT,       -- SID Twilio pour tracking
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wa_messages_from
  ON whatsapp_messages(from_number, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_messages_direction
  ON whatsapp_messages(direction, created_at DESC);

ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_all_wa_messages" ON whatsapp_messages;
CREATE POLICY "service_role_all_wa_messages"
  ON whatsapp_messages FOR ALL USING (true) WITH CHECK (true);

-- ════════════════════════════════════════════════════════════════
-- TABLE 6 — contracts
-- Contrats PDF générés pour les réservations
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS contracts (
  id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id        UUID        REFERENCES bookings(id) ON DELETE SET NULL,
  client_name       TEXT        NOT NULL,
  client_phone      TEXT,
  car_name          TEXT        NOT NULL,
  start_date        DATE        NOT NULL,
  end_date          DATE        NOT NULL,
  total_price       NUMERIC     NOT NULL,
  deposit_amount    NUMERIC     DEFAULT 0,

  -- Fichier
  file_url          TEXT,       -- URL Supabase storage
  storage_path      TEXT,       -- Path dans le bucket
  file_size_bytes   INT         DEFAULT 0,

  -- Signature
  signed_at         TIMESTAMPTZ,
  signature_url     TEXT,       -- Image signature client (futur)
  signature_ip      TEXT,

  -- Statut
  status            TEXT        NOT NULL DEFAULT 'draft',
  -- draft | sent | signed | expired
  sent_at           TIMESTAMPTZ,
  sent_via          TEXT,       -- telegram | whatsapp | email

  -- Acteur
  rented_by         TEXT        NOT NULL DEFAULT 'Kouider',
  generated_by      TEXT        DEFAULT 'dzaryx',

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contracts_booking
  ON contracts(booking_id);
CREATE INDEX IF NOT EXISTS idx_contracts_client
  ON contracts(client_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contracts_status
  ON contracts(status, created_at DESC);

ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_all_contracts" ON contracts;
CREATE POLICY "service_role_all_contracts"
  ON contracts FOR ALL USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS trg_contracts_updated_at ON contracts;
CREATE TRIGGER trg_contracts_updated_at
  BEFORE UPDATE ON contracts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ════════════════════════════════════════════════════════════════
-- TABLE 7 — payment_links
-- Liens de paiement Chargily générés pour les clients
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS payment_links (
  id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id        UUID        REFERENCES bookings(id) ON DELETE SET NULL,
  client_name       TEXT        NOT NULL,
  client_phone      TEXT,

  -- Montant
  amount            NUMERIC     NOT NULL,
  currency          TEXT        NOT NULL DEFAULT 'DZD',
  description       TEXT,

  -- Chargily
  chargily_id       TEXT,       -- ID du checkout Chargily
  payment_url       TEXT,       -- URL de paiement à envoyer au client
  status            TEXT        NOT NULL DEFAULT 'pending',
  -- pending | paid | failed | expired | refunded

  -- Réponse Chargily
  paid_at           TIMESTAMPTZ,
  paid_amount       NUMERIC,
  payment_method    TEXT,       -- edahabia | cib | cash

  -- Notification
  sent_via          TEXT,       -- whatsapp | telegram
  sent_at           TIMESTAMPTZ,

  expires_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_links_booking
  ON payment_links(booking_id);
CREATE INDEX IF NOT EXISTS idx_payment_links_status
  ON payment_links(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_links_chargily
  ON payment_links(chargily_id);

ALTER TABLE payment_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_all_payment_links" ON payment_links;
CREATE POLICY "service_role_all_payment_links"
  ON payment_links FOR ALL USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS trg_payment_links_updated_at ON payment_links;
CREATE TRIGGER trg_payment_links_updated_at
  BEFORE UPDATE ON payment_links
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ════════════════════════════════════════════════════════════════
-- SEED — Houari dans user_profile
-- ════════════════════════════════════════════════════════════════

INSERT INTO user_profile (
  user_id, name, languages,
  location_primary, location_secondary,
  timezone_primary, timezone_secondary,
  work_days, work_start, work_end, flex_hours,
  wake_time, sleep_time, family_members,
  preferred_channel, response_style, voice_mode, language_auto,
  business_name, business_role, business_partner,
  business_location, profit_split_pct
)
VALUES (
  'houari', 'Houari', ARRAY['ar', 'fr'],
  'Oran', 'Oran',
  'Africa/Algiers', 'Africa/Algiers',
  ARRAY[0,1,2,3,4,5,6], '08:00', '20:00', TRUE,
  '07:30', '00:00', '[]'::jsonb,
  'app', 'concise', TRUE, TRUE,
  'Fik Conciergerie', 'admin', 'Kouider',
  'Oran', 0.5
)
ON CONFLICT (user_id) DO NOTHING;

-- ════════════════════════════════════════════════════════════════
-- SEED — Houari dans memory_facts
-- ════════════════════════════════════════════════════════════════

INSERT INTO memory_facts (user_id, domain, key, value, value_type, source, verified, confidence)
VALUES
  ('houari', 'identity',   'full_name',       'Houari',                                               'text', 'explicit', TRUE, 1.0),
  ('houari', 'identity',   'location',        'Oran (résidence et business)',                          'text', 'explicit', TRUE, 1.0),
  ('houari', 'identity',   'languages',       'darija oranaise (principal), français, arabe',          'text', 'explicit', TRUE, 1.0),
  ('houari', 'identity',   'role',            'Associé Fik Conciergerie — opérations terrain Oran',    'text', 'explicit', TRUE, 1.0),
  ('houari', 'business',   'company_name',    'Fik Conciergerie',                                      'text', 'explicit', TRUE, 1.0),
  ('houari', 'business',   'business_type',   'Location de voitures — Oran, Algérie',                  'text', 'explicit', TRUE, 1.0),
  ('houari', 'business',   'partner',         'Kouider — PDG à Bruxelles',                            'text', 'explicit', TRUE, 1.0),
  ('houari', 'business',   'dzaryx_role',     'Dzaryx = assistant mobile de Houari pour le terrain',   'text', 'explicit', TRUE, 1.0),
  ('houari', 'preference', 'primary_channel', 'App mobile (canal principal)',                          'text', 'explicit', TRUE, 1.0),
  ('houari', 'preference', 'response_style',  'Darija oranaise, concis, direct',                       'text', 'explicit', TRUE, 1.0),
  ('houari', 'goal',       'mission',         'Gérer opérations terrain Fik Conciergerie à Oran',      'text', 'explicit', TRUE, 1.0)
ON CONFLICT (user_id, domain, key) DO NOTHING;

-- ════════════════════════════════════════════════════════════════
-- VÉRIFICATION
-- ════════════════════════════════════════════════════════════════

SELECT 'assistant_profiles'    AS table_name, COUNT(*) AS rows FROM assistant_profiles
UNION ALL
SELECT 'learned_rules',          COUNT(*) FROM learned_rules
UNION ALL
SELECT 'user_behavior',          COUNT(*) FROM user_behavior
UNION ALL
SELECT 'conversation_patterns',  COUNT(*) FROM conversation_patterns
UNION ALL
SELECT 'whatsapp_messages',      COUNT(*) FROM whatsapp_messages
UNION ALL
SELECT 'contracts',              COUNT(*) FROM contracts
UNION ALL
SELECT 'payment_links',          COUNT(*) FROM payment_links
UNION ALL
SELECT 'user_profile (total)',   COUNT(*) FROM user_profile
UNION ALL
SELECT 'memory_facts houari',    COUNT(*) FROM memory_facts WHERE user_id = 'houari';

SELECT 'Migration Phase 8 ✅' AS status;
