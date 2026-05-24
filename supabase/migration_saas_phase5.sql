-- Phase 5: integrations + business profile on org_configs
ALTER TABLE org_configs ADD COLUMN IF NOT EXISTS integrations     JSONB DEFAULT '{}';
ALTER TABLE org_configs ADD COLUMN IF NOT EXISTS business_profile JSONB DEFAULT '{}';
-- integrations: { whatsapp_number, google_calendar_url, business_hours: {open, close} }
-- business_profile: { address, website, description, owner_name }
