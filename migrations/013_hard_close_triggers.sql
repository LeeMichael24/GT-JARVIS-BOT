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

-- ────────────────────────────────────────────────────────────
-- La base de conocimiento le ordenaba a Daniela compartir el
-- número de cuenta bancaria real de la empresa sin supervisión
-- humana (topic 'proceso_reserva', paso 2). Es el mismo patrón
-- detrás del fraude de transferencia más común en bienes raíces:
-- un canal automatizado entrega instrucciones de pago sin que
-- ningún humano lo verifique. Se reemplaza ese paso por un
-- traspaso al equipo — el keyword 'cuenta bancaria'/'transferencia'
-- de arriba ya obliga a escalar de todas formas.
-- ────────────────────────────────────────────────────────────

UPDATE knowledge_base
SET content = '1. Cliente envía DUI (revés y derecho), dirección de residencia y correo electrónico. 2. Se conecta al cliente con el equipo para completar el pago de forma segura — Daniela nunca comparte datos de cuenta bancaria directamente. 3. Al recibir transferencia, se entrega recibo oficial. 4. Se redacta documento de reserva con notario y representante legal (3-5 días hábiles). 5. Cliente llega a firmar cuando esté listo. 6. La promesa de compraventa se firma 60-90 días después de la reserva.',
    updated_at = now()
WHERE category = 'sales_playbook' AND topic = 'proceso_reserva';

-- La cifra de prima/descuento de Portacelli es AMBIGUA: esta fila dice
-- 15% de prima con 20% de descuento de contado, pero el guion oficial
-- de Portacelli (migración 007) dice 3% a 30 días con 12% en cuotas.
-- Se desactiva hasta que el CEO confirme la cifra real — Daniela no
-- debe adivinar un número de dinero real.
UPDATE knowledge_base
SET active = false,
    title = 'Plan de pago estándar [INACTIVO — pendiente confirmar cifra con Mike]',
    updated_at = now()
WHERE category = 'sales_playbook' AND topic = 'plan_pago_estandar';
