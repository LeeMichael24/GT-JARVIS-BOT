-- ────────────────────────────────────────────────────────────
-- 013 — Disparadores duros de traspaso a humano
--
-- 'descuento' deja de escalar solo por mencionarse: el descuento
-- estándar ya es conocimiento libre de Daniela (ver knowledge_base,
-- topic 'plan_pago_estandar' — aunque esa fila queda desactivada
-- hasta confirmar la cifra real, ver 013b más abajo). Se agregan
-- disparadores de dinero y de documentos legales de cierre: el
-- momento exacto en que el CEO/equipo debe tomar la conversación.
--
-- Deliberadamente NO se agrega un keyword 'reserva' suelto: Daniela
-- usa esa palabra todo el tiempo en su propio copy de urgencia
-- ("se están reservando rápido") y un match así generaría falsos
-- positivos constantes.
-- ────────────────────────────────────────────────────────────

UPDATE escalation_rules
SET active = false,
    description = 'Retirado 2026-08-27: el descuento estándar ya es conocimiento libre de Daniela. Solo escala si el cliente pide algo fuera de lo estándar.',
    updated_at = now()
WHERE trigger_type = 'keyword' AND trigger_value = 'descuento';

INSERT INTO escalation_rules (trigger_type, trigger_value, description, action) VALUES
  ('keyword', 'cuenta bancaria',        'Cliente pide datos de cuenta para transferir dinero — Daniela nunca los comparte ella sola', 'escalate_ceo'),
  ('keyword', 'número de cuenta',       'Cliente pide datos de cuenta para transferir dinero — Daniela nunca los comparte ella sola', 'escalate_ceo'),
  ('keyword', 'transferencia',          'Mención de transferencia de dinero — requiere supervisión humana',                          'escalate_ceo'),
  ('keyword', 'depósito',               'Mención de depósito de dinero — requiere supervisión humana',                                'escalate_ceo'),
  ('keyword', 'promesa de venta',       'Documento legal de cierre — lo gestiona el equipo con notario',                              'escalate_ceo'),
  ('keyword', 'promesa de compraventa', 'Documento legal de cierre — lo gestiona el equipo con notario',                              'escalate_ceo'),
  ('keyword', 'documento de reserva',   'Documento legal de cierre — lo gestiona el equipo con notario',                              'escalate_ceo'),
  ('keyword', 'notario',                'Trámite legal — lo gestiona el equipo directamente',                                         'escalate_ceo')
ON CONFLICT DO NOTHING;
