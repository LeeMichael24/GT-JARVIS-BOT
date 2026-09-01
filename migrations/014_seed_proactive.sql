-- Semilla del motor de recontacto (leído de Meta WhatsApp Manager el 1-sep-2026)
-- WABA: Grupo Terranova (1314044236741483). Ejecutar en Supabase SQL Editor.
--
-- Solo se siembra seguimiento_interes: es la plantilla de campañas.
-- alerta_lead_hot (3 variables) viaja por WA_TEMPLATE_CEO_ALERT, no por esta
-- tabla (que además tiene CHECK variables <= 2).

INSERT INTO message_templates (name, language, category, body_preview, variables)
VALUES (
  'seguimiento_interes', 'es', 'MARKETING',
  'Hola {{1}} 😊Soy Daniela de Grupo Terranova. Quedamos pendientes sobre {{2}} — ¿te comparto más detalles?',
  2
)
ON CONFLICT (name) DO NOTHING;

-- Reglas de cadencia. El cron diario las evalúa y CREA campañas en
-- pending_approval: nada sale sin aprobación de Mike en /panel.
INSERT INTO recontact_rules (name, stages, days_inactive, template_id, max_per_run)
SELECT v.nombre, v.stages, v.dias, t.id, 20
FROM (VALUES
  ('Reactivar tibios 7 días', ARRAY['new','warm'], 7),
  ('Revivir fríos 30 días',   ARRAY['cold'],       30)
) AS v(nombre, stages, dias)
CROSS JOIN (SELECT id FROM message_templates WHERE name = 'seguimiento_interes') t
WHERE NOT EXISTS (SELECT 1 FROM recontact_rules r WHERE r.name = v.nombre);

-- Verificación
SELECT 'message_templates' AS tabla, count(*) AS filas FROM message_templates
UNION ALL
SELECT 'recontact_rules', count(*) FROM recontact_rules;
