-- ═══════════════════════════════════════════════════════════════
-- DZARYX BRAIN v2 — client intelligence + observations + actor
-- ═══════════════════════════════════════════════════════════════

-- 1. Extend client_intelligence with brain fields
ALTER TABLE client_intelligence
  ADD COLUMN IF NOT EXISTS arrival_patterns   jsonb   DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS passport_number    text,
  ADD COLUMN IF NOT EXISTS ai_insights        text,
  ADD COLUMN IF NOT EXISTS flight_patterns    text,
  ADD COLUMN IF NOT EXISTS last_analyzed_at   timestamptz,
  ADD COLUMN IF NOT EXISTS raw_notes_history  jsonb   DEFAULT '[]';

-- Index for phone lookup (disambiguation)
CREATE INDEX IF NOT EXISTS idx_client_intel_phone
  ON client_intelligence(client_phone) WHERE client_phone IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_client_intel_passport
  ON client_intelligence(passport_number) WHERE passport_number IS NOT NULL;

-- 2. Dzaryx free-form observations (memory from conversations + analysis)
CREATE TABLE IF NOT EXISTS dzaryx_observations (
  id                  uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  actor_id            text,                          -- 'kouider', 'houari', null = global
  client_phone        text,                          -- link to client if client-related
  client_name         text,                          -- denormalized for quick lookup
  obs_type            text        NOT NULL,          -- 'client_pattern', 'actor_preference', 'business_insight', 'emotion', 'manual'
  content             text        NOT NULL,
  confidence          float       DEFAULT 0.8,       -- 0-1
  source              text        DEFAULT 'conversation',  -- 'conversation', 'booking_analysis', 'job', 'manual'
  reinforcement_count integer     DEFAULT 1,
  created_at          timestamptz DEFAULT now(),
  last_reinforced     timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dzaryx_obs_actor ON dzaryx_observations(actor_id);
CREATE INDEX IF NOT EXISTS idx_dzaryx_obs_client ON dzaryx_observations(client_phone);
CREATE INDEX IF NOT EXISTS idx_dzaryx_obs_type ON dzaryx_observations(obs_type);

-- 3. Actor brain — deep behavioral profile per actor
CREATE TABLE IF NOT EXISTS actor_brain (
  actor_id              text        PRIMARY KEY,
  communication_style   jsonb       DEFAULT '{}',
  emotional_patterns    jsonb       DEFAULT '{}',
  decision_patterns     jsonb       DEFAULT '{}',
  preferences           jsonb       DEFAULT '{}',
  detected_vocab        jsonb       DEFAULT '{}',
  interaction_count     integer     DEFAULT 0,
  last_updated          timestamptz DEFAULT now()
);

-- Seed default actor brains
INSERT INTO actor_brain (actor_id, communication_style, emotional_patterns, decision_patterns, detected_vocab)
VALUES
  ('kouider',
   '{"language": "french", "tone": "direct", "style": "concise", "prefers_short_answers": true}',
   '{"stress_markers": ["urgent", "vite", "!!!"], "satisfaction": ["parfait", "nickel", "oke", "top"], "frustration": ["non", "pourquoi", "encore"]}',
   '{"approval": ["oke", "go", "parfait", "oui", "nickel", "top"], "rejection": ["non", "annule", "laisse", "stop", "pas"]}',
   '{"approval": ["oke", "parfait", "go"], "rejection": ["non", "stop"], "stress": ["urgent", "vite"]}'
  ),
  ('houari',
   '{"language": "darija", "tone": "patron", "style": "terrain", "prefers_short_answers": true}',
   '{"stress_markers": ["yallah", "3ajel"], "satisfaction": ["wakha", "mzien", "oki", "bravo"], "frustration": ["la", "3lach"]}',
   '{"approval": ["oki", "wakha", "go", "bravo"], "rejection": ["la", "annule", "ma3endi"]}',
   '{"approval": ["oki", "wakha", "mzien"], "rejection": ["la"]}'
  )
ON CONFLICT (actor_id) DO NOTHING;
