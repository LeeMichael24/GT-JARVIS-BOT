-- ────────────────────────────────────────────────────────────
-- 020 — El centro que faltaba: tabla `projects` + avisos operativos
--
-- DIAGNÓSTICO: doce tablas aparecían "volando" sin ninguna relación. La causa
-- no era descuido: NO EXISTÍA una tabla de proyectos en Postgres. El catálogo
-- vive en el API del Ecosistema, así que cada tabla lo referenciaba con texto
-- suelto — project_key, project_name, target_key, target_project — sin nada a
-- qué apuntar. Sin centro no hay integridad: un typo en el slug rompía el
-- match en silencio y nadie se enteraba.
--
-- `projects` es un REGISTRO, no una copia: guarda solo la identidad de cada
-- listing (slug, nombre, familia) más lo que el API no puede saber — si hoy
-- recibe inversión de verdad. Los precios, metrajes y disponibilidad siguen
-- viniendo vivos del API en cada mensaje. La regla no cambia: lo que cambia
-- vive en el Ecosistema, lo que no cambia vive acá.
-- ────────────────────────────────────────────────────────────

-- ── 1. El registro de proyectos ─────────────────────────────
CREATE TABLE IF NOT EXISTS projects (
  slug         TEXT PRIMARY KEY,          -- slug canónico del API — la llave de todo
  name         TEXT NOT NULL,
  project_key  TEXT,                      -- familia: 'portacelli' agrupa Alta, Alba y Raíces
  entity_type  TEXT,                      -- project | investment | residency
  type         TEXT,                      -- Apartamentos | Casa | Terreno | …
  investable   BOOLEAN NOT NULL DEFAULT false,  -- ¿recibe inversión HOY? El API dice 'active' en las 26
  active       BOOLEAN NOT NULL DEFAULT true,   -- sigue en el catálogo
  notes        TEXT,                      -- nota interna del equipo, no va al prompt
  synced_at    TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_projects_key        ON projects(project_key);
CREATE INDEX IF NOT EXISTS idx_projects_investable ON projects(investable) WHERE investable = true;

-- Semilla: lo que el radar ya vio + cualquier slug que ya estén usando las
-- tablas hijas. Sin esto las FKs de abajo fallarían con las filas existentes.
-- project_key se deriva del primer segmento del slug ('portacelli-alta-…' →
-- 'portacelli'); el panel lo deja corregir.
INSERT INTO projects (slug, name, entity_type, project_key, synced_at)
SELECT kl.slug, kl.name, kl.entity_type, split_part(kl.slug, '-', 1), now()
FROM known_listings kl
ON CONFLICT (slug) DO NOTHING;

INSERT INTO projects (slug, name, project_key)
SELECT DISTINCT pm.project_slug, pm.project_slug, split_part(pm.project_slug, '-', 1)
FROM project_media pm
WHERE pm.project_slug IS NOT NULL
ON CONFLICT (slug) DO NOTHING;

INSERT INTO projects (slug, name, project_key)
SELECT DISTINCT kb.project_slug, kb.project_slug, split_part(kb.project_slug, '-', 1)
FROM knowledge_base kb
WHERE kb.project_slug IS NOT NULL
ON CONFLICT (slug) DO NOTHING;

-- ── 2. Conectar las tablas huérfanas al centro ──────────────
-- ON DELETE SET NULL a propósito: si un listing sale del catálogo NO queremos
-- perder el conocimiento ni el material que costó escribir — queda huérfano y
-- visible en el panel para reasignarlo.

DO $$ BEGIN
  ALTER TABLE project_media
    ADD CONSTRAINT fk_project_media_project
    FOREIGN KEY (project_slug) REFERENCES projects(slug) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE knowledge_base
    ADD CONSTRAINT fk_knowledge_project
    FOREIGN KEY (project_slug) REFERENCES projects(slug) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- project_scripts identificaba el proyecto solo por un nombre humano y un
-- arreglo de keywords. Se le agrega el slug para poder anclarlo de verdad;
-- las keywords siguen sirviendo para activarlo en la conversación.
ALTER TABLE project_scripts ADD COLUMN IF NOT EXISTS project_slug TEXT;
DO $$ BEGIN
  ALTER TABLE project_scripts
    ADD CONSTRAINT fk_project_scripts_project
    FOREIGN KEY (project_slug) REFERENCES projects(slug) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- agent_objectives.target_key era texto libre (nombre O slug, según quién lo
-- escribiera). Se agrega el slug real; target_key queda para 'investment'.
ALTER TABLE agent_objectives ADD COLUMN IF NOT EXISTS project_slug TEXT;
DO $$ BEGIN
  ALTER TABLE agent_objectives
    ADD CONSTRAINT fk_objectives_project
    FOREIGN KEY (project_slug) REFERENCES projects(slug) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE ad_campaigns ADD COLUMN IF NOT EXISTS project_slug TEXT;
DO $$ BEGIN
  ALTER TABLE ad_campaigns
    ADD CONSTRAINT fk_ad_campaigns_project
    FOREIGN KEY (project_slug) REFERENCES projects(slug) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- activity_log.actor_id guardaba el uuid del miembro del equipo sin FK: se
-- podía loguear un actor inexistente. Es nullable porque el bot y el sistema
-- también escriben acá (actor_type = 'bot' | 'system').
DO $$ BEGIN
  ALTER TABLE activity_log
    ADD CONSTRAINT fk_activity_actor
    FOREIGN KEY (actor_id) REFERENCES team_members(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 3. Avisos operativos ────────────────────────────────────
-- Lo que Daniela NO puede saber ni por el cliente ni por el Ecosistema:
-- "se liberó la única unidad de 106 m²", "el precio sube el 1 de octubre",
-- "esta semana no hay visitas el sábado".
--
-- Es distinto del conocimiento a propósito: el conocimiento es permanente y
-- describe cómo se vende; un aviso es temporal, urgente y CADUCA. Por eso
-- vive aparte, entra al prompt con peso alto y desaparece solo al vencerse.
-- Sin fecha de fin nadie los limpia y Daniela termina anunciando una unidad
-- que se vendió hace tres meses.
CREATE TABLE IF NOT EXISTS agent_notices (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope        TEXT NOT NULL DEFAULT 'project' CHECK (scope IN ('global', 'project')),
  project_slug TEXT REFERENCES projects(slug) ON DELETE CASCADE,
  body         TEXT NOT NULL,             -- el aviso tal cual, en el idioma en que Daniela lo dirá
  priority     INT  NOT NULL DEFAULT 100, -- menor = se lee primero
  starts_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at      TIMESTAMPTZ,               -- null = sin vencimiento (usar con cuidado)
  active       BOOLEAN NOT NULL DEFAULT true,
  created_by   UUID REFERENCES team_members(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- un aviso de proyecto SIN proyecto no tiene a quién aplicarse
  CONSTRAINT notice_scope_coherente CHECK (scope = 'global' OR project_slug IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_notices_vigentes ON agent_notices(active, starts_at, ends_at);
CREATE INDEX IF NOT EXISTS idx_notices_project  ON agent_notices(project_slug);

-- ── 4. RLS: mismo criterio que el resto (solo service role) ──
ALTER TABLE projects      ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_notices ENABLE ROW LEVEL SECURITY;

-- ── Verificación ────────────────────────────────────────────
SELECT 'proyectos registrados' AS que, count(*)::text AS valor FROM projects
UNION ALL SELECT 'invertibles hoy', count(*)::text FROM projects WHERE investable
UNION ALL SELECT 'avisos vigentes', count(*)::text FROM agent_notices
  WHERE active AND starts_at <= now() AND (ends_at IS NULL OR ends_at > now());
