-- ────────────────────────────────────────────────────────────
-- 021 — Perilla de la revisión automática de venta (Fase 1)
--
-- Un modelo rápido juzga cada respuesta de Daniela contra la rúbrica de venta
-- ANTES de enviarla (¿respondió el dato concreto? ¿sumó algo que dé ganas?
-- ¿dejó un siguiente paso sin pregunta de trámite?) y, si falla, se reescribe.
-- Suma unos segundos por mensaje y solo se reescribe cuando hace falta.
--
-- El código ya trae el default encendido: esta fila es para que la perilla
-- aparezca en el panel con su explicación y se pueda apagar sin deploy.
-- ────────────────────────────────────────────────────────────
INSERT INTO agent_settings (key, value, description)
VALUES (
  'sales_critic_enabled',
  'true',
  'Revisión automática: un juez rápido revisa cada respuesta contra la rúbrica de venta antes de enviarla y, si falla, la reescribe. Suma unos segundos.'
)
ON CONFLICT (key) DO NOTHING;

-- Verificación
SELECT key, value FROM agent_settings WHERE key = 'sales_critic_enabled';
