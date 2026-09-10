-- ────────────────────────────────────────────────────────────
-- 019 — Alcance por FAMILIA de proyecto en knowledge_base
--
-- knowledge_base solo tenía project_slug, que apunta a UN listing. Pero los
-- hechos de Portacelli (prima, parqueos, ubicación, permisos) valen para los
-- tres listings de la familia — Alta, Alba y Raíces — y NO valen para Foresta,
-- Townhomes La Libertad ni para un alquiler en Escalón.
--
-- Se agrega project_key, exactamente la misma convención que ya usa
-- project_media (008): el key agrupa la familia, el slug ancla un listing.
-- Una fila sin key y sin slug es conocimiento universal y entra siempre.
-- ────────────────────────────────────────────────────────────

ALTER TABLE knowledge_base
  ADD COLUMN IF NOT EXISTS project_key TEXT;

CREATE INDEX IF NOT EXISTS idx_kb_project_key ON knowledge_base(project_key);

-- Las 13 entradas que afirman hechos de Portacelli. Todo lo demás
-- (técnicas de venta, objeciones, ITBR, CNR, FSV, proceso de reserva,
-- política de reembolso) sigue siendo universal aunque mencione a
-- Portacelli como EJEMPLO — ahí el ejemplo no es el dato.
UPDATE knowledge_base
SET project_key = 'portacelli',
    updated_at  = now()
WHERE project_key IS NULL
  AND topic IN (
    'descuento_contado',        -- prima 15% / 20% dcto, ejemplo 101 m²
    'descuento_dos_opciones',   -- 106 m² $265,000, dos opciones de descuento
    'plan_pago_estandar',       -- (inactiva) reserva/prima por tipología
    'ubicacion_proyecto',       -- frente al centro forense de Nuevo Cuscatlán
    'airbnb_permitido',         -- "la torre" tiene accesos separados
    'pet_friendly',             -- "Portacelli es PET friendly"
    'parqueos',                 -- 2 parqueos techados por apartamento
    'sistema_constructivo',     -- "el edificio", categoría A+
    'modificaciones_planos',    -- "el proyecto está en etapa de planos"
    'cocina_gas_electrica',     -- evaluación de la desarrolladora
    'no_modelo_fisico',         -- "estamos en etapa temprana (preventa)"
    'construccion_no_iniciada', -- fase comercial en obra, habitacional fin 2026
    'quiere_ver_permisos'       -- permisos medioambientales ya aprobados
  );

-- Verificación
SELECT coalesce(project_key, '(universal)') AS alcance, count(*)
FROM knowledge_base
WHERE active = true
GROUP BY 1 ORDER BY 2 DESC;
