-- GT Bot MVP — Supabase Schema
-- Run this in: Supabase Dashboard → SQL Editor → New Query

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── LEADS: one record per WhatsApp phone number ──────────────────
CREATE TABLE leads (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone              VARCHAR(20) UNIQUE NOT NULL,
  name               VARCHAR(100),
  stage              VARCHAR(30) DEFAULT 'new',    -- new|warm|hot|cold
  bot_active         BOOLEAN DEFAULT true,
  project_interest   VARCHAR(200),
  qualification_data JSONB,
  first_message_at   TIMESTAMPTZ DEFAULT NOW(),
  last_message_at    TIMESTAMPTZ DEFAULT NOW(),
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

-- ── CONVERSATIONS: every message in the conversation ─────────────
CREATE TABLE conversations (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_id        UUID REFERENCES leads(id) ON DELETE CASCADE NOT NULL,
  role           VARCHAR(10) NOT NULL CHECK (role IN ('user', 'assistant')),
  content        TEXT NOT NULL,
  wa_message_id  VARCHAR(100),
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Prevent duplicate processing of the same WhatsApp message
CREATE UNIQUE INDEX idx_conversations_wa_message_id
  ON conversations(wa_message_id)
  WHERE wa_message_id IS NOT NULL;

CREATE INDEX idx_leads_phone ON leads(phone);
CREATE INDEX idx_conversations_lead_created ON conversations(lead_id, created_at ASC);

-- ── ROW LEVEL SECURITY ───────────────────────────────────────────
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

-- Allow service role to do everything (the bot uses service role key)
CREATE POLICY "service_role_all_leads" ON leads
  FOR ALL USING (true);

CREATE POLICY "service_role_all_conversations" ON conversations
  FOR ALL USING (true);
