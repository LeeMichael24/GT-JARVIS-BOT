-- ────────────────────────────────────────────────────────────
-- 012 — TODO configurable desde el panel
--
-- 1. prompt_blocks: la personalidad/voz/tono de Daniela por bloques.
--    La tabla arranca VACÍA a propósito: el código trae el texto
--    default de cada bloque; una fila aquí lo SOBREESCRIBE. Borrar la
--    fila = volver al default. Así no hay drift entre código y BD.
-- 2. agent_objectives: objetivos del negocio — generales, por
--    proyecto y por inversión — que se inyectan al prompt.
-- 3. agent_brain: columnas para cerrar el loop de aprendizaje
--    (dedup por tema + auto-promoción por convergencia).
-- 4. agent_settings: ~14 perillas nuevas, incluida agent_enabled
--    (PAUSA GLOBAL de Daniela).
-- ────────────────────────────────────────────────────────────

-- ── 1. Bloques del prompt (personalidad editable) ──
CREATE TABLE IF NOT EXISTS prompt_blocks (
  key text PRIMARY KEY,
  content text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE prompt_blocks ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'prompt_blocks' AND policyname = 'prompt_blocks_select') THEN
    CREATE POLICY prompt_blocks_select ON prompt_blocks FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

-- ── 2. Objetivos del negocio ──
CREATE TABLE IF NOT EXISTS agent_objectives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL CHECK (scope IN ('general', 'project', 'investment')),
  target_key text,                      -- null para general; nombre/slug del proyecto o inversión
  objective text NOT NULL,
  priority int NOT NULL DEFAULT 100,    -- menor = más importante
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_agent_objectives_scope ON agent_objectives(scope, active);
ALTER TABLE agent_objectives ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'agent_objectives' AND policyname = 'agent_objectives_select') THEN
    CREATE POLICY agent_objectives_select ON agent_objectives FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

-- Objetivo general semilla (editable/borrable desde el panel)
INSERT INTO agent_objectives (scope, target_key, objective, priority)
SELECT 'general', NULL,
  'Calificar cada lead (propósito, timeline, presupuesto, financiamiento, decisor) y llevarlo al siguiente paso concreto: agendar visita o reunión. Oportunidades grandes (corporativos, 3+ unidades, presupuesto alto) se escalan al CEO.',
  10
WHERE NOT EXISTS (SELECT 1 FROM agent_objectives WHERE scope = 'general');

-- ── 3. Cerrar el loop de aprendizaje ──
ALTER TABLE agent_brain ADD COLUMN IF NOT EXISTS seen_count int NOT NULL DEFAULT 1;
ALTER TABLE agent_brain ADD COLUMN IF NOT EXISTS last_seen_at timestamptz DEFAULT now();
CREATE INDEX IF NOT EXISTS idx_agent_brain_topic ON agent_brain(topic) WHERE active = true;

-- ── 4. Perillas nuevas en agent_settings ──
INSERT INTO agent_settings (key, value, description) VALUES
('agent_enabled', 'true',
 'PAUSA GLOBAL: false = Daniela deja de responder a TODOS los leads y se detienen secuencias y campañas proactivas. Los mensajes entrantes se siguen guardando.'),
('ceo_name', 'Michael Narváez',
 'Nombre de la persona a la que Daniela escala los clientes grandes. Aparece en las frases de escalación.'),
('escalation_budget_usd', '300000',
 'Presupuesto confirmado (USD) a partir del cual Daniela escala al CEO.'),
('escalation_units', '3',
 'Número de unidades a partir del cual Daniela escala al CEO (ej: 3 = "quiere comprar 3+ unidades").'),
('reply_max_chars', '500',
 'Largo máximo (caracteres) que el prompt pide para cada respuesta de Daniela.'),
('llm_temperature', '0.85',
 'Creatividad del modelo al responder (0.0 = rígido y predecible, 1.0 = muy creativo). Default 0.85.'),
('reflection_temperature', '0.3',
 'Creatividad del modelo en la reflexión nocturna / análisis de entrenamiento. Baja (0.3) = extrae hechos sin inventar.'),
('business_hours_start', '8',
 'Hora (0-23, El Salvador) desde la que se envían seguimientos automáticos.'),
('business_hours_end', '18',
 'Hora (0-23, El Salvador) hasta la que se envían seguimientos automáticos.'),
('rental_threshold_usd', '30000',
 'Precio (USD) por debajo del cual una propiedad del catálogo se trata como ALQUILER mensual.'),
('history_window', '15',
 'Cuántos mensajes recientes de la conversación ve Daniela en cada turno.'),
('brain_min_confidence', '0.7',
 'Confianza mínima (0-1) para que un aprendizaje del cerebro entre al prompt de Daniela.'),
('auto_promote_enabled', 'true',
 'true = un aprendizaje que Daniela observa repetidas veces se promueve SOLO al prompt (cierra el loop de aprendizaje sin esperar revisión manual).'),
('auto_promote_threshold', '3',
 'Cuántas veces debe repetirse una observación (mismo tema) para auto-promoverse al prompt.')
ON CONFLICT (key) DO NOTHING;
