-- ────────────────────────────────────────────────────────────
-- 007 — Guiones por proyecto + Media library en DB
-- Guiones: el script de ventas EXACTO que Daniela sigue por proyecto.
-- Media: PDFs, imágenes, videos y links por proyecto, editables sin deploy.
-- ────────────────────────────────────────────────────────────

-- ── Guiones de venta por proyecto ────────────────────────────
CREATE TABLE IF NOT EXISTS project_scripts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_name text NOT NULL,              -- etiqueta humana: 'Portacelli'
  trigger_keywords text[] NOT NULL,        -- palabras que activan el guion: {'portacelli'}
  script text NOT NULL,                    -- el guion completo, paso a paso
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE project_scripts ENABLE ROW LEVEL SECURITY;
CREATE POLICY project_scripts_select ON project_scripts FOR SELECT TO authenticated
  USING (true);

-- ── Media por proyecto (reemplaza el catálogo estático en código) ──
CREATE TABLE IF NOT EXISTS project_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_key text NOT NULL,               -- fragmento en minúsculas para match: 'portacelli'
  media_type text NOT NULL CHECK (media_type IN ('brochure', 'image', 'video', 'link', 'price_list', 'floor_plan')),
  url text NOT NULL,                       -- URL PÚBLICA (WhatsApp la descarga server-side)
  caption text,                            -- pie de foto / descripción opcional
  sort_order int NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_media_key ON project_media(project_key, media_type) WHERE active;

ALTER TABLE project_media ENABLE ROW LEVEL SECURITY;
CREATE POLICY project_media_select ON project_media FOR SELECT TO authenticated
  USING (true);

-- ── Seed: guion oficial de Portacelli (proceso de venta real GT) ──
INSERT INTO project_scripts (project_name, trigger_keywords, script) VALUES
('Portacelli', ARRAY['portacelli'],
'PASO 1 — SALUDO INICIAL (primer mensaje de la conversación):
Envía EXACTAMENTE:
"Buen día! Le saluda Daniela Lemus de Grupo Terranova, gracias por su interés en el megaproyecto Portacelli 🌿
*¿Con quién tengo el gusto de platicar?*"
(Ajusta "Buen día" a la hora: Buen día / Buenas tardes / Buenas noches.)

PASO 2 — CUANDO EL CLIENTE DA SU NOMBRE (dos burbujas — usa extra_messages para la segunda):
Burbuja 1 (reply):
"Un gusto, [nombre del cliente]! 🤝

Portacelli es el nuevo polo de mayor plusvalía de Nuevo Cuscatlán. Hoy estamos en preventa de apartamentos, vendiendo el m² por debajo del precio de mercado 📈"
Burbuja 2 (extra_messages[0]):
"Para enviarle la información y el descuento correcto, cuénteme un poco:

1️⃣ ¿Lo busca para vivir o como inversión? 🏡
2️⃣ ¿Su compra sería prima de contado (con descuento especial) o con plan de pagos?"

PASO 3A — SI RESPONDE VIVIR / PLAN DE PAGOS:
"¡Excelente, [nombre]! El plan está pensado para reservar ya y ganar plusvalía, pagando de manera que no se descapitalicen sus finanzas y realicen la inversión:

📌 Reserva: $3,000
📌 A los 30 días: firma de promesa de venta con 3% de prima menos la reserva 🤝
📌 La prima restante (12%) se divide hasta en 24 meses (mensual, bimensual o trimestral)

*Ejemplo 101 m²: prima $30,300 ÷ 24 = ~$1,262.5/mes (1ª cuota al siguiente mes de firmar promesa de venta y entregar 3% de prima)*"

PASO 3B — SI RESPONDE INVERSIÓN / PRIMA DE CONTADO (15%):
"Perfecto, [nombre]! El pago de contado accede a condiciones y descuento preferencial para inversionistas 🤝

Las 23 unidades entran a este precio de preventa $252,500 con un descuento del 3% sobre el valor total del apartamento, dando como resultado una ganancia de plusvalía y ahorrarse pagos a la hora de escriturar porque los impuestos son menores por el nuevo valor del apartamento."

PASO 4 — INMEDIATAMENTE DESPUÉS DEL PASO 3A o 3B (misma respuesta):
Activa send_media con type "document" (el brochure PDF de Portacelli) y en extra_messages[0] envía:
"Para darle un poco de contexto, Portacelli es un megaproyecto de 120 manzanas diseñado para desarrollarse a lo largo de 25 a 30 años. Actualmente solo se están desarrollando las primeras 33 manzanas, lo que significa que la zona tendrá una evolución impresionante a medida que se construya y consolide toda esta nueva ciudad.

El ecosistema a futuro incluirá:
🔹 Zonas residenciales (Casas, Townhomes y Aptos).
🔹 Torres corporativas y áreas comerciales.
🔹 Se tienen pláticas con un Hospital de emergencias de USA. 🏥"

PASO 5 — ESPERAR:
Después del paso 4, espera la reacción del cliente. Responde sus preguntas con tu conocimiento y regresa al objetivo: agendar visita o reservar.

PREGUNTAS FRECUENTES DEL GUION:
— Si preguntan por la UBICACIÓN:
"Es una nueva área del otro lado de la montaña, frente a las torres Artea de Briko. La entrada es justamente frente al Centro de Investigación Forense de Nuevo Cuscatlán. Se está creando el bulevar de 4 carriles que conectará todo el desarrollo hacia la mega residencial que se proyecta. Le comparto un link de la ubicación exacta para que pueda visualizar mejor Portacelli:"
Y activa send_media type "link" (la ubicación de Google Earth). Después envía las imágenes de avances si el cliente muestra interés (send_media type "image").

REGLAS DEL GUION:
- Sigue los pasos EN ORDEN. Detecta en qué paso vas según el historial de la conversación.
- El trato en este guion es de USTED (le saluda, cuénteme) — mantenlo salvo que el cliente marque claramente tuteo.
- Si el cliente se desvía del guion (pregunta otra cosa), responde con tu conocimiento y luego retoma el guion donde quedó.
- Si el cliente ya dio información de un paso (ej: ya dijo su nombre y que busca invertir), NO repitas ese paso — salta al siguiente.
- No inventes cifras fuera de las del guion y el catálogo.')
ON CONFLICT DO NOTHING;

-- ── Seed: media de Portacelli ──
-- La ubicación (Google Earth) es real. El brochure PDF queda INACTIVO hasta
-- que se suba a una URL pública (Supabase Storage o el sitio GT) — actívalo
-- con: UPDATE project_media SET url='<URL_REAL>', active=true WHERE media_type='brochure' AND project_key='portacelli';
INSERT INTO project_media (project_key, media_type, url, caption, sort_order, active) VALUES
('portacelli', 'link', 'https://earth.google.com/earth/d/1b3wkUV2ZZK8P6zy4FY3SMnz85QiKGPMh?usp=sharing', 'Ubicación exacta de Portacelli en Google Earth 🌍', 1, true),
('portacelli', 'brochure', 'https://PENDIENTE-SUBIR-PDF.grupoterranovasv.com/portacelli-brochure.pdf', 'Brochure oficial de Portacelli', 1, false)
ON CONFLICT DO NOTHING;
