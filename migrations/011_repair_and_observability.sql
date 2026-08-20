-- ────────────────────────────────────────────────────────────
-- 011 — Reparación de esquema + observabilidad de crons
--
-- Parte A: DDL versionado para las 3 tablas "huérfanas" que el código
-- usa pero ninguna migración creaba (lead_sources, ad_campaigns,
-- activity_log). En producción probablemente ya existen (creadas a
-- mano) — todo es IF NOT EXISTS / idempotente, correr esto es seguro.
-- Una Supabase fresca ahora queda completa corriendo las migraciones
-- en orden.
--
-- Parte B: tabla cron_runs — historial de corridas de los crons para
-- que el panel pueda mostrar si el entrenamiento/secuencias corrieron
-- o fallaron (antes solo existía console.log en Vercel).
-- ────────────────────────────────────────────────────────────

-- ── A1. lead_sources — origen de cada lead (Meta Ads referral) ──
CREATE TABLE IF NOT EXISTS lead_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  source_type text NOT NULL CHECK (source_type IN ('meta_ad', 'google_ad', 'organic', 'referral', 'website', 'direct')),
  campaign_id text,
  ad_id text,
  ad_headline text,
  ad_body text,
  source_url text,
  raw_referral jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lead_sources_lead ON lead_sources(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_sources_type ON lead_sources(source_type);

-- ── A2. ad_campaigns — campañas de ads registradas en el panel ──
CREATE TABLE IF NOT EXISTS ad_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform text NOT NULL CHECK (platform IN ('meta', 'google', 'tiktok')),
  external_id text NOT NULL DEFAULT '',
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'ended')),
  objective text,
  target_project text,
  offer_details text,
  landing_url text,
  budget_daily numeric,
  start_date date,
  end_date date,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ad_campaigns_status ON ad_campaigns(status);

-- ── A3. activity_log — auditoría de acciones (bot / equipo / sistema) ──
CREATE TABLE IF NOT EXISTS activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  actor_type text NOT NULL DEFAULT 'system' CHECK (actor_type IN ('team', 'system', 'bot')),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_activity_log_created ON activity_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_entity ON activity_log(entity_type, entity_id);

-- ── B. cron_runs — historial de corridas (observabilidad del panel) ──
CREATE TABLE IF NOT EXISTS cron_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job text NOT NULL,                    -- 'daily' | 'sequences' | 'weekly' | 'manual:reflection' | ...
  started_at timestamptz NOT NULL,
  finished_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL CHECK (status IN ('ok', 'error')),
  result jsonb DEFAULT '{}'::jsonb,     -- el resumen que el cron ya arma hoy
  error text
);
CREATE INDEX IF NOT EXISTS idx_cron_runs_job ON cron_runs(job, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_cron_runs_started ON cron_runs(started_at DESC);

-- ── RLS: mismas reglas que el resto — lectura autenticada, escritura
--        solo vía service-role (que la ignora). Idempotente. ──
ALTER TABLE lead_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE cron_runs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'lead_sources' AND policyname = 'lead_sources_select') THEN
    CREATE POLICY lead_sources_select ON lead_sources FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ad_campaigns' AND policyname = 'ad_campaigns_select') THEN
    CREATE POLICY ad_campaigns_select ON ad_campaigns FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'activity_log' AND policyname = 'activity_log_select') THEN
    CREATE POLICY activity_log_select ON activity_log FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'cron_runs' AND policyname = 'cron_runs_select') THEN
    CREATE POLICY cron_runs_select ON cron_runs FOR SELECT TO authenticated USING (true);
  END IF;
END $$;
