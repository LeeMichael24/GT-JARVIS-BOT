-- Material real por proyecto, extraído del sitio público grupoterranovasv.com
-- (galerías Cloudinary propias de Grupo Terranova) el 1-sep-2026.
-- Las URLs llevan transform w_1200,q_80,f_jpg: peso acotado y formato que
-- WhatsApp siempre acepta. Ejecutar en Supabase SQL Editor.
--
-- PENDIENTE MIKE (D4): los brochures PDF oficiales. Estas imágenes activan
-- send_media ya; los PDF se agregan igual que abajo con media_type 'brochure'.

-- Fuera el placeholder que nunca fue un archivo real
UPDATE project_media SET active = false WHERE url LIKE '%PENDIENTE-SUBIR-PDF%';

INSERT INTO project_media (project_key, media_type, url, caption, sort_order)
SELECT v.k, v.t, v.u, v.c, v.o FROM (VALUES
  -- ── Portacelli Raices ──
  ('portacelli raices', 'image', 'https://res.cloudinary.com/grupoterranova/image/upload/w_1200,q_80,f_jpg/v1765481425/projects/dtuj5dyvegewbwn8vhoh.jpg', 'Portacelli Raices — vista general del proyecto', 0),
  ('portacelli raices', 'image', 'https://res.cloudinary.com/grupoterranova/image/upload/w_1200,q_80,f_jpg/v1765480003/projects/vo3x2haftiqlrs0wqttr.jpg', 'Portacelli Raices — áreas del proyecto', 1),
  ('portacelli raices', 'image', 'https://res.cloudinary.com/grupoterranova/image/upload/w_1200,q_80,f_jpg/v1765474381/models/s7to2wewtcwiq1shhzlg.jpg', 'Portacelli Raices — modelo de casa', 2),
  ('portacelli raices', 'link',  'https://grupoterranovasv.com/properties/portacelli-raices-fase-1-habitacional-en-proyecto-nuevo-cuscatlan-5a3907', 'Ficha completa de Portacelli Raices en el sitio oficial', 3),
  -- ── Portacelli Alba ──
  ('portacelli alba', 'image', 'https://res.cloudinary.com/grupoterranova/image/upload/w_1200,q_80,f_jpg/v1764543727/projects/e2xe5qxgp0sqjkro04wv.png', 'Portacelli Alba — vista general del proyecto', 0),
  ('portacelli alba', 'image', 'https://res.cloudinary.com/grupoterranova/image/upload/w_1200,q_80,f_jpg/v1764543728/projects/c0ztedej1fee9suhaknb.png', 'Portacelli Alba — áreas del proyecto', 1),
  ('portacelli alba', 'image', 'https://res.cloudinary.com/grupoterranova/image/upload/w_1200,q_80,f_jpg/v1764543730/projects/ktrhqomtepqi2b2k7ugk.png', 'Portacelli Alba — entorno y amenidades', 2),
  ('portacelli alba', 'link',  'https://grupoterranovasv.com/properties/portacelli-alba-fase-1-habitacional-en-proyecto-nuevo-cuscatlan-584516', 'Ficha completa de Portacelli Alba en el sitio oficial', 3),
  -- ── Portacelli Alta ──
  ('portacelli alta', 'image', 'https://res.cloudinary.com/grupoterranova/image/upload/w_1200,q_80,f_jpg/v1764542061/projects/ofkhvxyhrer3juvy3det.png', 'Portacelli Alta — vista general del proyecto', 0),
  ('portacelli alta', 'image', 'https://res.cloudinary.com/grupoterranova/image/upload/w_1200,q_80,f_jpg/v1765474900/projects/znlzolhr0c6dsosd7g0s.jpg', 'Portacelli Alta — áreas del proyecto', 1),
  ('portacelli alta', 'image', 'https://res.cloudinary.com/grupoterranova/image/upload/w_1200,q_80,f_jpg/v1764542068/models/qvcvpajkmz3sht2mmkre.png', 'Portacelli Alta — modelo de casa', 2),
  ('portacelli alta', 'link',  'https://grupoterranovasv.com/properties/portacelli-alta-fase-1-habitacional-en-proyecto-nuevo-cuscatlan-58448f', 'Ficha completa de Portacelli Alta en el sitio oficial', 3)
) AS v(k, t, u, c, o)
WHERE NOT EXISTS (SELECT 1 FROM project_media p WHERE p.url = v.u);

-- Verificación
SELECT project_key, media_type, count(*) FROM project_media WHERE active GROUP BY 1, 2 ORDER BY 1, 2;
