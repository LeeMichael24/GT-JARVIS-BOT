-- ────────────────────────────────────────────────────────────
-- 006 — Escalation Rules
-- Configurable triggers that force Daniela to escalate
-- instead of relying solely on GPT-4o's judgment.
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS escalation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_type text NOT NULL CHECK (trigger_type IN ('keyword', 'topic', 'condition')),
  trigger_value text NOT NULL,
  description text,
  action text NOT NULL DEFAULT 'escalate_ceo' CHECK (action IN ('escalate_ceo', 'consult_team')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ── Default escalation rules ─────────────────────────────────

INSERT INTO escalation_rules (trigger_type, trigger_value, description, action) VALUES
  ('keyword', 'precio final',              'Cliente pregunta por precio final — listo para cerrar',         'escalate_ceo'),
  ('keyword', 'descuento',                 'Negociación de descuento requiere CEO',                        'escalate_ceo'),
  ('keyword', 'escritura',                 'Discusión legal/escrituras',                                   'escalate_ceo'),
  ('keyword', 'contrato',                  'Discusión de contrato',                                        'escalate_ceo'),
  ('keyword', 'firma',                     'Discusión de firma',                                           'escalate_ceo'),
  ('topic',   'negociacion',               'Cualquier negociación activa',                                 'escalate_ceo'),
  ('topic',   'legal',                     'Preguntas legales — consultar equipo',                         'consult_team'),
  ('topic',   'financiamiento_especial',   'Solicitudes de financiamiento especial',                       'escalate_ceo'),
  ('condition', 'multiple_units',          'Cliente interesado en 3+ unidades',                            'escalate_ceo'),
  ('condition', 'competitor_mention',      'Menciona desarrolladores competidores',                        'escalate_ceo')
ON CONFLICT DO NOTHING;
