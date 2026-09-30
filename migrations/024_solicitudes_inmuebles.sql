-- ────────────────────────────────────────────────────────────
-- 024 — Solicitudes de inmuebles (oportunidades que no son el catálogo)
--
-- Dos oportunidades llegaban por WhatsApp y se perdían:
--   captacion: un propietario quiere vender o rentar SU inmueble con nosotros
--   busqueda:  un cliente busca algo que no tenemos (después de ofrecerle
--              primero nuestros proyectos y que no le sirvieran)
-- Daniela junta los datos en la conversación, la solicitud queda aquí y el
-- equipo recibe un WhatsApp cuando está completa. Una solicitud abierta por
-- cliente y tipo: si el cliente agrega datos, se completa la misma.
--
-- Si esta migración no está aplicada, Daniela conversa igual y el equipo
-- recibe el aviso por WhatsApp; solo no queda la fila.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS solicitudes_inmuebles (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id          UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  tipo             TEXT NOT NULL CHECK (tipo IN ('captacion', 'busqueda')),
  operacion        TEXT CHECK (operacion IN ('venta', 'alquiler')),
  tipo_inmueble    TEXT,          -- casa, apartamento, terreno, local, oficina…
  zona             TEXT,
  presupuesto      TEXT,          -- búsqueda: lo que puede pagar · captación: precio que espera
  caracteristicas  TEXT,          -- m², cuartos, estado, amueblado, lo que pide o lo que tiene
  plazo            TEXT,          -- para cuándo
  notas            TEXT,
  estado           TEXT NOT NULL DEFAULT 'nueva' CHECK (estado IN ('nueva', 'en_proceso', 'cerrada', 'descartada')),
  notificada_en    TIMESTAMPTZ,   -- cuándo se avisó al equipo (una sola vez)
  creado_en        TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Una solicitud abierta por cliente y tipo
CREATE UNIQUE INDEX IF NOT EXISTS solicitudes_abierta_por_lead
  ON solicitudes_inmuebles (lead_id, tipo)
  WHERE estado IN ('nueva', 'en_proceso');

CREATE INDEX IF NOT EXISTS solicitudes_por_estado ON solicitudes_inmuebles (estado, creado_en DESC);

-- Solo el servidor (service role) la toca
ALTER TABLE solicitudes_inmuebles ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';

-- Verificación
SELECT count(*) AS solicitudes FROM solicitudes_inmuebles;
