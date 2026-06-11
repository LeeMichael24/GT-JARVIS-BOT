# Spec — Fase 2: UI pulida (responsive + Kanban) y Motor proactivo (recontactos + radar)

**Fecha:** 2026-06-11
**Estado:** Aprobado por Michael (diseño validado por secciones)
**Prerequisito:** Fase 1 en producción (panel CRM base, migración 003 aplicada).

---

## 1. Decisiones tomadas

| Decisión | Elección |
|---|---|
| Kanban | **Toggle Lista/Kanban** en el inbox (preferencia recordada en localStorage) |
| Envío de recontactos | **Cola de aprobación**: el sistema propone, un admin aprueba y envía |
| Detección de oportunidades | **Radar automático diario** contra el API de grupoterranovasv.com |
| Ejecución | Un spec, **dos planes**: 2a (secciones A+B, UI) y luego 2b (C+D, motor) |

Restricción dura: mensajes proactivos fuera de la ventana de 24h = plantillas
pre-aprobadas por Meta, con costo por mensaje (~$0.03–0.08 marketing). El panel
muestra costo estimado antes de aprobar.

---

## 2. Sección A — Chat a viewport + responsive total (plan 2a)

Problema: `app/panel/(authed)/layout.tsx` usa `min-h-screen`, permitiendo que el
contenido crezca más allá del viewport; la lista de mensajes de `ChatView` empuja
la página en vez de scrollear internamente.

Cambios:

- Layout autenticado: `h-dvh` (con fallback `h-screen`) + `overflow-hidden`;
  `<main>` con `flex-1 min-h-0 overflow-hidden`. Cadena de `min-h-0` en los flex
  hijos para que el scroll viva en los contenedores internos.
- `ChatView`: header y compositor fijos; SOLO la lista de mensajes scrollea.
- Inbox: filtros fijos arriba; la lista scrollea internamente.
- **Móvil:** la ficha del lead (`LeadSheet`) pasa de columna a **drawer overlay**
  (fixed, right-0, w-full max-w-sm, backdrop con click-para-cerrar, transición).
  En `lg+` sigue siendo columna lateral.
- Auto-scroll al fondo del chat se mantiene.

## 3. Sección B — Kanban (plan 2a)

- Toggle `[Lista] [Kanban]` arriba del inbox; preferencia en
  `localStorage('panel-vista')`. Misma data (`listInboxLeads`) para ambas vistas;
  filtros y búsqueda aplican a ambas.
- `components/panel/KanbanBoard.tsx` (client): 4 columnas por etapa
  (new/warm/hot/cold) con contador. Tarjeta: nombre/teléfono, snippet truncado,
  tags de color, asesor, ✋ si bot pausado. Click → `/panel/chat/[id]`.
- Mover etapa: **HTML5 drag & drop** en desktop (dragstart con lead id, drop en
  columna → `updateLeadStage`) + **menú "Mover a…"** en cada tarjeta (funciona en
  móvil). Sin librerías nuevas.
- Móvil: columnas en scroll horizontal con `snap-x` (una columna ~85vw).
- Errores de la acción se muestran con el patrón `ERROR_TEXT` existente.

## 4. Sección C — Motor de recontactos (plan 2b)

### 4.1 Modelo de datos — `migrations/004_proactive.sql`

```sql
-- Espejo de plantillas aprobadas en Meta (se registran manualmente en el panel)
CREATE TABLE message_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT UNIQUE NOT NULL,          -- nombre EXACTO en Meta
  language    TEXT NOT NULL DEFAULT 'es',
  category    TEXT NOT NULL CHECK (category IN ('MARKETING', 'UTILITY')),
  body_preview TEXT NOT NULL,                -- texto con {{1}}, {{2}} para previsualizar
  variables   INT NOT NULL DEFAULT 0,        -- cuántas {{n}} espera
  active      BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Reglas de cadencia
CREATE TABLE recontact_rules (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  active        BOOLEAN DEFAULT true,
  stages        TEXT[] DEFAULT NULL,         -- null = todas; valores de LeadStage
  tag_ids       UUID[] DEFAULT NULL,         -- null = sin filtro; match ANY
  days_inactive INT NOT NULL,                -- días desde el último mensaje del lead
  template_id   UUID REFERENCES message_templates(id) NOT NULL,
  max_per_run   INT NOT NULL DEFAULT 20,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Campañas (recontacto y oportunidad comparten cola)
CREATE TABLE campaigns (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind         TEXT NOT NULL CHECK (kind IN ('recontact', 'opportunity')),
  status       TEXT NOT NULL DEFAULT 'pending_approval'
               CHECK (status IN ('pending_approval','sending','done','rejected')),
  title        TEXT NOT NULL,                -- "Regla: Calientes 5 días" / "🆕 Torre X"
  reason       TEXT,                         -- explicación visible en el panel
  rule_id      UUID REFERENCES recontact_rules(id),
  listing_slug TEXT,                         -- para kind=opportunity
  template_id  UUID REFERENCES message_templates(id) NOT NULL,
  approved_by  UUID REFERENCES team_members(id),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  approved_at  TIMESTAMPTZ
);

CREATE TABLE campaign_recipients (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id   UUID REFERENCES campaigns(id) ON DELETE CASCADE NOT NULL,
  lead_id       UUID REFERENCES leads(id) ON DELETE CASCADE NOT NULL,
  included      BOOLEAN DEFAULT true,        -- admin puede desmarcar antes de aprobar
  variables     JSONB NOT NULL DEFAULT '[]', -- valores para {{1}}..{{n}} de ESTE lead
  match_reason  TEXT,                        -- por qué entró (visible en panel)
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','sent','failed','skipped')),
  wa_message_id TEXT,
  error         TEXT,
  sent_at       TIMESTAMPTZ,
  UNIQUE (campaign_id, lead_id)
);

-- Control por lead
ALTER TABLE leads ADD COLUMN opted_out BOOLEAN DEFAULT false;
ALTER TABLE leads ADD COLUMN last_proactive_at TIMESTAMPTZ;

-- Radar
CREATE TABLE known_listings (
  slug        TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  entity_type TEXT,
  first_seen  TIMESTAMPTZ DEFAULT NOW(),
  snapshot    JSONB
);
```

RLS: SELECT en las 5 tablas nuevas **solo para admin activo** (`is_active_admin()`);
sin políticas de escritura (todo por server actions con service role). `leads`
ya tiene política por rol (las columnas nuevas viajan con ella).

### 4.2 Envío de plantillas — `services/whatsapp/client.ts`

```ts
sendTemplate(to, templateName, language, bodyParams: string[]): Promise<string | null>
```
POST a Graph API `type: 'template'` con `components.body.parameters` de tipo
text. Devuelve `wa_message_id`. Sin typing delay. Reusa `postWithRetry`.

Cada envío se guarda en `conversations` como `role='assistant'` con el texto de
la plantilla **renderizado** (variables sustituidas) y su `wa_message_id` — el
historial del panel lo muestra y Daniela tiene el contexto cuando el cliente
responda. Además se actualiza `leads.last_proactive_at`.

### 4.3 Elegibilidad (compartida recontacto/oportunidad)

Un lead es elegible si: `opted_out = false` **y** `bot_active = true` (si un
humano lo atiende, no se le mete ruido) **y** `last_proactive_at` es null o
anterior a 7 días (constante `MIN_PROACTIVE_GAP_DAYS = 7`) **y** no está ya en
otra campaña `pending_approval`/`sending`.

Para reglas de recontacto además: `last_message_at` ≤ now − days_inactive, y
filtros de etapa/tags de la regla. Orden: hot → warm → new → cold; corte en
`max_per_run`.

### 4.4 Cron diario — `app/api/cron/daily/route.ts`

- `vercel.json` agrega `"crons": [{ "path": "/api/cron/daily", "schedule": "0 16 * * *" }]`
  (16:00 UTC = 10:00 El Salvador).
- GET protegido: header `Authorization: Bearer ${CRON_SECRET}` (env nueva; Vercel
  la manda automáticamente en sus crons). Sin header válido → 401.
- Pasos del job: (1) radar de inventario (sección D), (2) evaluación de reglas →
  crear campañas `pending_approval` con destinatarios y variables, (3) idempotencia:
  una regla no genera campaña nueva si ya tiene una `pending_approval` del mismo día.
- Respuesta JSON con resumen `{ newListings, campaignsCreated }` para logs.

### 4.5 Variables de plantilla por destinatario

Convención fija de variables soportadas v1 (se documenta en el panel al registrar
la plantilla): `{{1}}` = nombre del lead (fallback "¡Hola!" sin nombre),
`{{2}}` = interés/propiedad (project_interest del lead, o nombre del listing en
oportunidades; fallback "nuestras propiedades"). Plantillas con `variables ≤ 2`.

### 4.6 Aprobación y envío — server actions (admin only)

| Action | Qué hace |
|---|---|
| `approveCampaign(campaignId)` | status→sending; envía a cada recipient `included=true` vía `waitUntil` en lotes (pausa 250ms entre envíos); cada uno marca sent/failed; al final status→done. La página `/panel/campanas` exporta `maxDuration = 60` (las server actions heredan la config del segmento) — 50 envíos × ~0.55s ≈ 28s, dentro del límite |
| `rejectCampaign(campaignId)` | status→rejected |
| `toggleRecipient(recipientId, included)` | des/marcar antes de aprobar |
| `retryFailedRecipients(campaignId)` | reintenta solo los failed |
| `createTemplate/updateTemplate/deleteTemplate` | CRUD del espejo de plantillas |
| `createRecontactRule/updateRecontactRule/deleteRecontactRule` | CRUD de reglas |
| `setLeadOptOut(leadId, optedOut)` | toggle manual desde la ficha |

### 4.7 Opt-out automático

`ClaudeResponse` gana campo `opt_out: boolean` (default false). El prompt de
Daniela instruye: si el cliente pide no ser contactado / no le interesa seguir,
responder con elegancia y marcar `opt_out: true`. El webhook, al recibirlo,
ejecuta `updateLead(leadId, { opted_out: true })`. La ficha del lead muestra el
estado con toggle manual (admin y asesor con acceso).

### 4.8 Panel — pantallas nuevas

- **`/panel/campanas`** (admin): badge con pendientes en el header. Tab
  "Por aprobar": card por campaña (título, motivo, preview de plantilla,
  destinatarios con checkbox y match_reason, costo estimado = N incluidos ×
  `COST_PER_TEMPLATE_USD` (env opcional; default 0.06 en `lib/proactive/cost.ts`),
  botones Aprobar y enviar / Rechazar). Tab "Historial":
  campañas pasadas con conteos sent/failed y botón reintentar fallidos.
- **`/panel/config`** gana dos secciones (admin): **Plantillas** (registrar
  name/language/category/variables/body_preview con ayuda de la convención 4.5)
  y **Reglas de recontacto** (CRUD con selects de etapa, tags, días, plantilla,
  tope diario).

## 5. Sección D — Radar de oportunidades (plan 2b)

- En el cron diario: `getAllProjects()` (API GT ya existente) vs `known_listings`.
  Slug no conocido → insertar en `known_listings` + crear campaña
  `kind='opportunity'` con matching de leads.
- **Primera ejecución**: si `known_listings` está vacía, solo siembra el catálogo
  completo SIN crear campañas (evita inundar con todo lo existente).
- **Matching v1** (función pura `matchLeadsToListing(listing, leads)`):
  1. Excluir no-elegibles (4.3).
  2. Puntos: +3 propósito compatible (`inversion` ↔ entityType `investment`;
     `vivienda_propia` ↔ `project`/`residency`; `ambos` ↔ cualquiera),
     +2 etapa hot, +1 warm, +1 si `project_interest` coincide en tipo/ubicación
     con el listing (substring case-insensitive sobre type/location/name).
  3. Score ≥ 3 entra; orden descendente; tope 50 por campaña.
  4. `match_reason` legible: "Inversionista · etapa caliente · interesado en Portacelli".
- La campaña entra a la misma cola de aprobación de 4.6.

## 6. Manejo de errores

- Cron: cada paso en try/catch independiente; un fallo del radar no bloquea las
  reglas y viceversa; resumen con errores en la respuesta y `console.error`.
- Envío: fallo individual marca el recipient `failed` con el mensaje de Meta y
  continúa; la campaña termina `done` con conteos; botón reintentar fallidos.
- API GT caída durante el cron: el radar se salta ese día (log), sin romper nada.
- UI: acciones con el patrón `ActionResult` + `ERROR_TEXT` existente.

## 7. Seguridad

- `/panel/campanas` y las secciones nuevas de config: redirect + `requireAdmin()`
  en cada action (mismo patrón Fase 1).
- Cron protegido por `CRON_SECRET` (Bearer). Env nueva en Vercel y `.env.example`.
- RLS de las tablas nuevas: SELECT solo admin (los asesores no ven campañas).
- El costo estimado es informativo; el tope real de gasto es `max_per_run` por
  regla + aprobación manual.

## 8. Testing

- Unit (vitest, mocks como Fase 1): elegibilidad (opt-out / bot pausado / gap de
  7 días / days_inactive), matching con scores y razones, idempotencia del cron
  (no duplica campañas del día), `sendTemplate` (payload Graph + wa_message_id),
  render de variables {{1}}/{{2}} con fallbacks, autorización admin de todas las
  actions nuevas, cron 401 sin secret, primera-siembra del radar sin campañas,
  opt-out vía ClaudeResponse en el webhook.
- UI (2a y pantallas 2b): tsc + build + checklist manual (incluye probar drawer
  móvil, drag&drop, snap horizontal, y una campaña end-to-end con plantilla real).

## 9. Pasos manuales del usuario (se entregará guía tipo GUIA-ACTIVACION)

1. Crear 2-3 plantillas en Meta WhatsApp Manager (textos provistos) y esperar
   aprobación.
2. Registrarlas en Panel → Configuración → Plantillas.
3. Crear las primeras reglas de recontacto.
4. Agregar `CRON_SECRET` en Vercel (valor inventado largo) y redeploy.
5. Ejecutar `migrations/004_proactive.sql` en Supabase ANTES del deploy de 2b.

## 10. Fuera de alcance (fases futuras)

Biblioteca de media/PDFs (Fase 3), scoring 0–100 formal (Fase 4), envío de
imágenes en plantillas (v2 del motor), métricas de campañas (open/response rate),
edición de mensajes libres pre-aprobación, multi-idioma de plantillas.
