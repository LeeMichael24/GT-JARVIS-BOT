-- Motor proactivo (Fase 2b): plantillas, reglas, campañas, radar, opt-out
-- Ejecutar en: Supabase Dashboard → SQL Editor → New Query

-- ── PLANTILLAS (espejo de las aprobadas en Meta) ──────────────────
CREATE TABLE message_templates (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT UNIQUE NOT NULL,
  language     TEXT NOT NULL DEFAULT 'es',
  category     TEXT NOT NULL CHECK (category IN ('MARKETING', 'UTILITY')),
  body_preview TEXT NOT NULL,
  variables    INT NOT NULL DEFAULT 0 CHECK (variables BETWEEN 0 AND 2),
  active       BOOLEAN DEFAULT true,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ── REGLAS DE CADENCIA ────────────────────────────────────────────
CREATE TABLE recontact_rules (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  active        BOOLEAN DEFAULT true,
  stages        TEXT[] DEFAULT NULL,
  tag_ids       UUID[] DEFAULT NULL,
  days_inactive INT NOT NULL CHECK (days_inactive >= 1),
  template_id   UUID REFERENCES message_templates(id) NOT NULL,
  max_per_run   INT NOT NULL DEFAULT 20 CHECK (max_per_run BETWEEN 1 AND 50),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── CAMPAÑAS Y DESTINATARIOS ──────────────────────────────────────
CREATE TABLE campaigns (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind         TEXT NOT NULL CHECK (kind IN ('recontact', 'opportunity')),
  status       TEXT NOT NULL DEFAULT 'pending_approval'
               CHECK (status IN ('pending_approval','sending','done','rejected')),
  title        TEXT NOT NULL,
  reason       TEXT,
  rule_id      UUID REFERENCES recontact_rules(id) ON DELETE SET NULL,
  listing_slug TEXT,
  template_id  UUID REFERENCES message_templates(id) NOT NULL,
  approved_by  UUID REFERENCES team_members(id),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  approved_at  TIMESTAMPTZ
);
CREATE INDEX idx_campaigns_status ON campaigns(status, created_at DESC);

CREATE TABLE campaign_recipients (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id   UUID REFERENCES campaigns(id) ON DELETE CASCADE NOT NULL,
  lead_id       UUID REFERENCES leads(id) ON DELETE CASCADE NOT NULL,
  included      BOOLEAN DEFAULT true,
  variables     JSONB NOT NULL DEFAULT '[]',
  match_reason  TEXT,
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','sending','sent','failed','skipped')),
  wa_message_id TEXT,
  error         TEXT,
  sent_at       TIMESTAMPTZ,
  UNIQUE (campaign_id, lead_id)
);
CREATE INDEX idx_recipients_campaign ON campaign_recipients(campaign_id);
CREATE INDEX idx_recipients_lead ON campaign_recipients(lead_id);

-- Idempotencia dura contra crons solapados: una campaña por regla por día,
-- y una campaña por listing para siempre
CREATE UNIQUE INDEX uniq_campaign_rule_day ON campaigns(rule_id, (created_at::date)) WHERE rule_id IS NOT NULL;
CREATE UNIQUE INDEX uniq_campaign_listing ON campaigns(listing_slug) WHERE listing_slug IS NOT NULL;

-- ── CONTROL POR LEAD ──────────────────────────────────────────────
ALTER TABLE leads ADD COLUMN opted_out BOOLEAN DEFAULT false;
ALTER TABLE leads ADD COLUMN last_proactive_at TIMESTAMPTZ;
-- Índice para leadsWithTags: último mensaje del cliente por lead
CREATE INDEX idx_conversations_lead_role_created ON conversations(lead_id, role, created_at DESC);

-- ── RADAR ─────────────────────────────────────────────────────────
CREATE TABLE known_listings (
  slug        TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  entity_type TEXT,
  first_seen  TIMESTAMPTZ DEFAULT NOW(),
  snapshot    JSONB
);

-- ── RLS: SELECT solo admin (escrituras únicamente por service role) ─
ALTER TABLE message_templates   ENABLE ROW LEVEL SECURITY;
ALTER TABLE recontact_rules     ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns           ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE known_listings      ENABLE ROW LEVEL SECURITY;

CREATE POLICY templates_select  ON message_templates   FOR SELECT TO authenticated USING (is_active_admin());
CREATE POLICY rules_select      ON recontact_rules     FOR SELECT TO authenticated USING (is_active_admin());
CREATE POLICY campaigns_select  ON campaigns           FOR SELECT TO authenticated USING (is_active_admin());
CREATE POLICY recipients_select ON campaign_recipients FOR SELECT TO authenticated USING (is_active_admin());
CREATE POLICY listings_select   ON known_listings      FOR SELECT TO authenticated USING (is_active_admin());
