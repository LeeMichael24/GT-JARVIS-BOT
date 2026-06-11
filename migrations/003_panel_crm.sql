-- Panel CRM (Fase 1): equipo, tags, notas, asignación, rol 'human', RLS reales
-- Ejecutar en: Supabase Dashboard → SQL Editor → New Query

-- ── EQUIPO ────────────────────────────────────────────────────────
CREATE TABLE team_members (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  email      TEXT UNIQUE NOT NULL,
  role       TEXT NOT NULL CHECK (role IN ('admin', 'asesor')),
  wa_phone   VARCHAR(20),
  active     BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── TAGS ──────────────────────────────────────────────────────────
CREATE TABLE tags (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT UNIQUE NOT NULL,
  color      TEXT NOT NULL DEFAULT '#6b7280',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE lead_tags (
  lead_id    UUID REFERENCES leads(id) ON DELETE CASCADE,
  tag_id     UUID REFERENCES tags(id) ON DELETE CASCADE,
  source     TEXT NOT NULL DEFAULT 'human' CHECK (source IN ('bot', 'human')),
  created_by UUID REFERENCES team_members(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (lead_id, tag_id)
);

-- ── NOTAS INTERNAS ────────────────────────────────────────────────
CREATE TABLE lead_notes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id    UUID REFERENCES leads(id) ON DELETE CASCADE NOT NULL,
  author     UUID REFERENCES team_members(id) NOT NULL,
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_lead_notes_lead ON lead_notes(lead_id, created_at DESC);

-- ── ASIGNACIÓN ────────────────────────────────────────────────────
ALTER TABLE leads ADD COLUMN assigned_to UUID REFERENCES team_members(id);
CREATE INDEX idx_leads_assigned ON leads(assigned_to);

-- ── MENSAJES HUMANOS ──────────────────────────────────────────────
ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_role_check;
ALTER TABLE conversations ADD CONSTRAINT conversations_role_check
  CHECK (role IN ('user', 'assistant', 'human'));
ALTER TABLE conversations ADD COLUMN sent_by UUID REFERENCES team_members(id);

-- ── HELPERS RLS (SECURITY DEFINER evita recursión en team_members) ─
CREATE OR REPLACE FUNCTION is_active_member() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM team_members WHERE id = auth.uid() AND active)
$$;

CREATE OR REPLACE FUNCTION is_active_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM team_members WHERE id = auth.uid() AND active AND role = 'admin')
$$;

-- ── RLS ───────────────────────────────────────────────────────────
-- Las políticas USING(true) eran innecesarias (service role ignora RLS) y riesgosas.
DROP POLICY IF EXISTS "service_role_all_leads" ON leads;
DROP POLICY IF EXISTS "service_role_all_conversations" ON conversations;

ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags         ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_tags    ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_notes   ENABLE ROW LEVEL SECURITY;

CREATE POLICY team_select ON team_members FOR SELECT TO authenticated
  USING (is_active_member());

CREATE POLICY tags_select ON tags FOR SELECT TO authenticated
  USING (is_active_member());

CREATE POLICY leads_select ON leads FOR SELECT TO authenticated
  USING (is_active_admin() OR (is_active_member() AND assigned_to = auth.uid()));

CREATE POLICY conversations_select ON conversations FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM leads l WHERE l.id = conversations.lead_id
      AND (is_active_admin() OR (is_active_member() AND l.assigned_to = auth.uid()))
  ));

CREATE POLICY lead_tags_select ON lead_tags FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM leads l WHERE l.id = lead_tags.lead_id
      AND (is_active_admin() OR (is_active_member() AND l.assigned_to = auth.uid()))
  ));

CREATE POLICY lead_notes_select ON lead_notes FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM leads l WHERE l.id = lead_notes.lead_id
      AND (is_active_admin() OR (is_active_member() AND l.assigned_to = auth.uid()))
  ));
-- Sin políticas INSERT/UPDATE/DELETE para authenticated: toda escritura va por
-- server actions con service role (que ignora RLS).

-- ── REALTIME ──────────────────────────────────────────────────────
-- UPDATEs de leads (asignación, bot_active) necesitan el row completo
-- para que Realtime + RLS filtren correctamente por asesor
ALTER TABLE leads REPLICA IDENTITY FULL;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE conversations;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE leads;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
