-- SDR Agent (Fase 3): deal memory, sequences, agent brain, metrics
-- Run in: Supabase Dashboard → SQL Editor → New Query

-- ── DEAL SUMMARIES ───────────────────────────────────────────
CREATE TABLE deal_summaries (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id     UUID REFERENCES leads(id) ON DELETE CASCADE NOT NULL,
  summary     TEXT NOT NULL,
  signals     JSONB DEFAULT '{}',
  next_action TEXT,
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(lead_id)
);
CREATE INDEX idx_deal_summaries_lead ON deal_summaries(lead_id);

-- ── SEQUENCES ────────────────────────────────────────────────
CREATE TABLE sequences (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id       UUID REFERENCES leads(id) ON DELETE CASCADE NOT NULL,
  sequence_type TEXT NOT NULL CHECK (sequence_type IN (
    'post_conversation', 'nurture', 'hot_close', 'cold_reactivation'
  )),
  current_step  INT NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'paused', 'completed', 'cancelled')),
  context       JSONB NOT NULL DEFAULT '{}',
  next_fire_at  TIMESTAMPTZ,
  last_fired_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(lead_id, sequence_type)
);
CREATE INDEX idx_sequences_next_fire ON sequences(status, next_fire_at)
  WHERE status = 'active';

-- ── AGENT BRAIN ──────────────────────────────────────────────
CREATE TABLE agent_brain (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category    TEXT NOT NULL CHECK (category IN ('observation', 'pattern', 'correction', 'metric')),
  topic       TEXT NOT NULL,
  content     TEXT NOT NULL,
  source      TEXT NOT NULL DEFAULT 'agent' CHECK (source IN ('agent', 'team')),
  lead_id     UUID REFERENCES leads(id) ON DELETE SET NULL,
  confidence  FLOAT DEFAULT 0.5 CHECK (confidence BETWEEN 0 AND 1),
  active      BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_brain_active ON agent_brain(category, active) WHERE active;

-- ── AGENT METRICS ────────────────────────────────────────────
CREATE TABLE agent_metrics (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start            DATE NOT NULL,
  period_end              DATE NOT NULL,
  total_conversations     INT DEFAULT 0,
  leads_qualified         INT DEFAULT 0,
  meetings_scheduled      INT DEFAULT 0,
  escalations             INT DEFAULT 0,
  follow_ups_sent         INT DEFAULT 0,
  follow_ups_replied      INT DEFAULT 0,
  avg_response_time_s     FLOAT,
  avg_messages_to_qualify INT,
  top_objections          JSONB DEFAULT '[]',
  top_projects_asked      JSONB DEFAULT '[]',
  conversion_by_stage     JSONB DEFAULT '{}',
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(period_start, period_end)
);

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE deal_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE sequences      ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_brain    ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_metrics  ENABLE ROW LEVEL SECURITY;

CREATE POLICY deal_summaries_admin ON deal_summaries FOR SELECT TO authenticated
  USING (is_active_admin());
CREATE POLICY sequences_admin ON sequences FOR SELECT TO authenticated
  USING (is_active_admin());
CREATE POLICY brain_admin ON agent_brain FOR SELECT TO authenticated
  USING (is_active_member());
CREATE POLICY metrics_admin ON agent_metrics FOR SELECT TO authenticated
  USING (is_active_member());
