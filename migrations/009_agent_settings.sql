-- ────────────────────────────────────────────────────────────
-- 009 — Configuración viva del agente (agent_settings)
-- Perillas del comportamiento de Daniela editables SIN deploy.
-- El código trae defaults seguros: si la tabla no existe o falta una
-- clave, el bot funciona igual.
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS agent_settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  description text,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE agent_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY agent_settings_select ON agent_settings FOR SELECT TO authenticated
  USING (true);

-- Defaults iniciales (mismo valor que los defaults del código)
INSERT INTO agent_settings (key, value, description) VALUES
('emoji_policy', 'minimal',
 'minimal = casi sin emojis (máx 1 y solo si aporta) | moderate = 1-2 por mensaje | none = cero emojis'),
('learning_sensitivity', 'high',
 'high = Daniela registra aprendizajes en casi toda conversación con sustancia | normal = solo hallazgos claramente notables'),
('formality_default', 'tu',
 'tu = tutea por defecto (cambia a usted con corporativos/mayores) | usted = usted por defecto'),
('custom_instructions', '',
 'Instrucciones libres del equipo que se agregan al prompt en cada mensaje. Editar aquí = Daniela lo aplica al siguiente mensaje. Vacío = sin extra.'),
('reflection_enabled', 'true',
 'true = cada noche Daniela analiza las conversaciones del día y extrae aprendizajes al cerebro | false = apagado')
ON CONFLICT (key) DO NOTHING;
