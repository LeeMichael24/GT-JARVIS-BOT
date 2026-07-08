# Integración de Media: Ecosistema Terranova → Daniela

Cómo lograr que los PDFs, imágenes, videos y links de cada proyecto se administren desde el **Ecosistema Terranova** (el backend del sitio, `api.grupoterranovasv.com`) y Daniela los envíe **directo en el chat del cliente, sin intervención humana**. Última actualización: 7 julio 2026.

---

## 1. Cómo funciona HOY (ya implementado en el bot)

```
Supabase tabla `project_media`  ──▶  Daniela la lee en cada mensaje  ──▶  send_media
   (project_key, media_type,          y el guion le dice CUÁNDO           ↓
    url, caption, active)             enviar qué                    WhatsApp Cloud API
                                                                    (PDF / foto / video / link
                                                                     directo al chat del cliente)
```

- La tabla `project_media` (migración 007) guarda el material por proyecto: `brochure`, `image`, `video`, `link`, `price_list`, `floor_plan`.
- GPT-4o decide el envío con el campo `send_media` — y el **guion del proyecto** le ordena exactamente en qué paso (ej: Portacelli paso 4 = enviar brochure).
- El bot envía: PDF con `sendDocument`, fotos con `sendImage` (hasta 3), video con `sendVideo`, ubicación como texto+URL.
- **Agregar material hoy = un INSERT en Supabase. Cero deploys.** Esto ya funciona sin tocar el Ecosistema.

## 2. Requisito INNEGOCIABLE de WhatsApp para el material

WhatsApp Cloud API **descarga el archivo desde la URL, server-side**. Por lo tanto:

| Regla | Detalle |
|-------|---------|
| URL pública | Sin login, sin token en header. Un `curl <url>` debe bajar el archivo |
| HTTPS | Obligatorio |
| PDF | ≤ 100 MB (`application/pdf`) |
| Imagen | JPG/PNG ≤ 5 MB |
| Video | MP4 (H.264 + AAC) ≤ 16 MB |
| Estable | Si la URL muere, Daniela ofrece algo que ya no puede enviar |

**Dónde hospedar:** Supabase Storage (bucket público — ya lo tenemos pagado), o el mismo dominio del sitio (`grupoterranovasv.com/media/...`). Ambos cumplen.

## 3. La conexión con el Ecosistema Terranova (lo que hay que construir ALLÁ)

La meta: el equipo sube el brochure/fotos/videos **una sola vez en el admin del Ecosistema** (donde ya administran las propiedades) y Daniela lo tiene automáticamente. Igual que ya pasa con el catálogo.

### Paso A — Extender el API de listings con media

Hoy `GET /listings` devuelve los proyectos (nombre, precios, descripción...). Hay que agregarle un bloque `media` a cada listing:

```jsonc
// GET https://api.grupoterranovasv.com/listings  (con x-api-secret)
[
  {
    "name": "Portacelli Alta - Fase 1 Habitacional",
    "slug": "portacelli-alta",
    // ... campos actuales ...
    "media": {
      "brochure_url": "https://grupoterranovasv.com/media/portacelli/brochure.pdf",
      "price_list_url": null,
      "location_url": "https://earth.google.com/earth/d/1b3wk.../",
      "gallery": [
        { "url": "https://.../avance-obra-1.jpg", "caption": "Avance de obra junio 2026" },
        { "url": "https://.../render-torre.jpg",  "caption": "Render de la torre" }
      ],
      "videos": [
        { "url": "https://.../recorrido.mp4", "caption": "Recorrido del proyecto" }
      ]
    }
  }
]
```

En el admin del Ecosistema esto es: **campos de subida de archivos en la ficha de cada propiedad** (brochure PDF, galería, videos, link de ubicación). Los archivos se guardan en storage público y el API devuelve las URLs.

### Paso B — Sincronización automática hacia Daniela (se construye en el bot, ~1 sesión)

Un paso de sync en el cron diario del bot:

```
/api/cron/daily → fetch listings del GT API → por cada listing con media:
  upsert en project_media (project_key = slug base, media_type, url, caption)
  → marca inactivo lo que ya no exista en el API
```

Resultado final: **subir un PDF en el admin del Ecosistema = Daniela lo envía esa misma tarde.** Nadie toca Supabase, nadie toca código, cero intervención humana en el flujo completo:

```
Equipo sube brochure en admin Ecosistema
   ↓ (API listings lo expone)
Cron diario del bot lo sincroniza a project_media
   ↓ (guion + send_media)
Cliente pregunta por Portacelli → Daniela envía el PDF en el chat
```

### Paso C — (Opcional, más adelante) Tiempo real

Si "esa misma tarde" no basta: el admin del Ecosistema hace un `POST` al bot cuando se guarda media (webhook interno con `CRON_SECRET`), y el sync corre al instante. 30 minutos de trabajo en cada lado.

## 4. Especificación para el desarrollador del Ecosistema (resumen entregable)

1. Agregar a la entidad *Property/Listing* los campos: `brochure_url`, `price_list_url`, `location_url`, `gallery[]` (url+caption), `videos[]` (url+caption).
2. UI de admin: subida de archivos → storage público → URL en esos campos.
3. Exponerlos en el `GET /listings` existente (mismo auth `x-api-secret`).
4. Validar límites de WhatsApp al subir: PDF ≤100MB, imagen ≤5MB, video MP4 ≤16MB (mostrar error si excede).
5. URLs estables (no firmadas con expiración).

Con eso publicado, el bot agrega el sync (Paso B) y el circuito queda cerrado.

## 5. Mientras tanto (sin esperar al Ecosistema)

El material se administra directo en Supabase con SQL — ejemplo real:

```sql
-- Subir el brochure de Portacelli (después de subir el PDF a Supabase Storage):
UPDATE project_media
SET url = 'https://hpszcxekqymxmjokjcdo.supabase.co/storage/v1/object/public/media/portacelli-brochure.pdf',
    active = true
WHERE project_key = 'portacelli' AND media_type = 'brochure';

-- Agregar fotos de avances de obra:
INSERT INTO project_media (project_key, media_type, url, caption, sort_order) VALUES
('portacelli', 'image', 'https://.../avance-1.jpg', 'Avance de obra — julio 2026', 1),
('portacelli', 'image', 'https://.../avance-2.jpg', 'Bulevar de 4 carriles en construcción', 2);
```

El tab **Media** del panel (`/panel/daniela`) muestra qué tiene cada proyecto.
