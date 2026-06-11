# Spec — Fase 1: Panel CRM base (gt-bot)

**Fecha:** 2026-06-10
**Estado:** Aprobado por Michael (diseño validado por secciones)
**Alcance:** Primera de 6 fases del sistema CRM + panel de administración para el bot "Daniela".

---

## 1. Contexto y decisiones tomadas

El bot "Daniela" (WhatsApp Cloud API + GPT-4o + Supabase + Next.js 16 en Vercel) ya califica
leads, guarda conversaciones, agenda citas y usa un playbook de ventas. No existe interfaz de
administración: la página principal es boilerplate.

Decisiones validadas con el usuario:

| Decisión | Elección |
|---|---|
| ¿CRM externo gratis o propio? | **Panel propio** en el mismo repo Next.js + Supabase. Cero infra nueva. (Chatwoot y SaaS descartados: datos divididos, costo, o no-gratis.) |
| Usuarios del panel | **Equipo con roles**: `admin` (control total) y `asesor` (solo sus leads asignados). |
| Respuesta humana al cliente | **Desde el panel**, por el mismo número del bot. El cliente no nota el cambio de canal. |

Restricción técnica que motiva el panel propio: las etiquetas de la app WhatsApp Business
**no son accesibles vía Cloud API**; las tags deben vivir en nuestra base de datos.

### Roadmap completo (este spec cubre solo la Fase 1)

1. **Panel CRM base** ← este documento
2. Handoff + notificaciones al equipo por WhatsApp + motor de reglas (tag/score → acción)
3. Biblioteca de media (PDFs, imágenes por proyecto; Daniela los envía)
4. Scoring formal 0–100
5. Campañas de recontacto con plantillas de Meta (segmentación, programación, opt-out)
6. Matching de inventario (subir contenido → extraer tipo/precio/zona → cruzar con intereses → campaña aprobada)

---

## 2. Qué entrega la Fase 1

Un panel en `/panel` (misma URL de Vercel) con:

- Login por email + contraseña (Supabase Auth), solo cuentas invitadas por el admin.
- Inbox en vivo estilo WhatsApp Web: lista de chats → conversación → ficha del lead.
- Tags manuales con taxonomía configurable (nombre + color), origen `bot`/`human` registrado.
- Asignación de leads a asesores; admin ve todo, asesor ve solo lo suyo.
- Pausar/reactivar a Daniela por chat.
- **Takeover**: el asesor escribe desde el panel; el mensaje sale por el mismo número vía
  Cloud API. Enviar un mensaje humano pausa a Daniela automáticamente.
- Notas internas por lead (invisibles para el cliente).
- Edición de etapa (`new/warm/hot/cold`) y visualización de los datos de calificación.

---

## 3. Arquitectura

- **Rutas**: `app/(panel)/panel/...` con route group propio (layout independiente del sitio).
  El webhook `app/api/webhook/whatsapp/route.ts` no cambia de contrato (200 OK inmediato,
  procesamiento en background).
- **Auth**: Supabase Auth. Tabla `team_members` con PK = `auth.users.id`. Middleware de
  Next.js protege `/panel/*`: requiere sesión válida y `team_members.active = true`.
- **Lecturas en vivo**: el navegador usa el cliente Supabase con **anon key** + sesión del
  usuario; Supabase Realtime (postgres_changes) empuja mensajes/cambios. RLS gobierna qué
  recibe cada rol.
- **Escrituras**: exclusivamente vía **server actions** con service role key. Cada action
  re-valida el rol del solicitante antes de ejecutar. No hay políticas de escritura para
  el cliente anon (default deny).
- **Variables de entorno nuevas**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  (las actuales `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` siguen siendo solo de servidor).
- **UI**: Tailwind 4, componentes propios (sin librería de componentes nueva). Layout de 3
  columnas en desktop; en móvil navegación apilada (lista → chat; ficha como drawer).
  Textos de UI en español.

---

## 4. Modelo de datos — `migrations/003_panel_crm.sql`

```sql
-- Equipo
CREATE TABLE team_members (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  email      TEXT UNIQUE NOT NULL,
  role       TEXT NOT NULL CHECK (role IN ('admin', 'asesor')),
  wa_phone   VARCHAR(20),            -- para notificaciones de Fase 2
  active     BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Taxonomía de tags (configurable por admin)
CREATE TABLE tags (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       TEXT UNIQUE NOT NULL,
  color      TEXT NOT NULL DEFAULT '#6b7280',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tags aplicadas a leads
CREATE TABLE lead_tags (
  lead_id    UUID REFERENCES leads(id) ON DELETE CASCADE,
  tag_id     UUID REFERENCES tags(id) ON DELETE CASCADE,
  source     TEXT NOT NULL DEFAULT 'human' CHECK (source IN ('bot', 'human')),
  created_by UUID REFERENCES team_members(id),  -- NULL si la puso el bot
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (lead_id, tag_id)
);

-- Notas internas
CREATE TABLE lead_notes (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_id    UUID REFERENCES leads(id) ON DELETE CASCADE NOT NULL,
  author     UUID REFERENCES team_members(id) NOT NULL,
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Asignación de leads
ALTER TABLE leads ADD COLUMN assigned_to UUID REFERENCES team_members(id);

-- Mensajes humanos en el historial
ALTER TABLE conversations DROP CONSTRAINT conversations_role_check;
ALTER TABLE conversations ADD CONSTRAINT conversations_role_check
  CHECK (role IN ('user', 'assistant', 'human'));
ALTER TABLE conversations ADD COLUMN sent_by UUID REFERENCES team_members(id);
```

Notas:

- `role = 'assistant'` es Daniela; `'human'` es el equipo (con `sent_by`). Para el cliente
  ambos salen por el mismo número; la distinción es solo interna.
- El nombre real del constraint de `role` se verifica en la migración (puede haber sido
  autogenerado); la migración usa `DO $$ ... $$` defensivo si hace falta.
- Los mensajes salientes (assistant y human) **guardan su `wa_message_id`** devuelto por
  Meta (hoy se descarta), habilitando estados enviado/entregado/leído en fase futura.

### RLS (reemplaza las políticas `USING (true)` actuales)

- Se eliminan las políticas permisivas existentes de `leads` y `conversations` (el service
  role ignora RLS, así que nada se rompe para el bot).
- Función helper `is_active_admin()` (`SECURITY DEFINER`) para evitar recursión al
  consultar `team_members` desde sus propias políticas.
- `leads`, `conversations`, `lead_tags`, `lead_notes` — SELECT para `authenticated`:
  admin activo ve todo; asesor activo ve filas cuyo lead tiene `assigned_to = auth.uid()`.
- `tags`, `team_members` — SELECT para cualquier miembro activo (necesario para filtros y
  para mostrar nombres de asesores).
- Sin políticas INSERT/UPDATE/DELETE para `authenticated`: toda escritura pasa por server
  actions con service role.
- Realtime (postgres_changes) respeta estas mismas políticas con el token del usuario.

---

## 5. Pantallas

1. **`/panel/login`** — email + contraseña. Sin registro público: el admin invita
   (Supabase invite por email; el invitado define su contraseña).
2. **`/panel` (Inbox)** — lista ordenada por `last_message_at` desc. Cada fila: nombre o
   teléfono, snippet del último mensaje, chip de etapa, tags, asesor asignado, indicador
   bot activo/pausado, hora. Filtros: etapa, tag, asesor, estado del bot. Búsqueda por
   nombre/teléfono. Admin ve todos los leads; asesor solo los asignados.
3. **Conversación** (columna central) — historial completo en burbujas: cliente a la
   izquierda; Daniela y humanos a la derecha (mensaje humano muestra el nombre del asesor,
   solo visible internamente). Compositor abajo. Banner de estado cuando Daniela está
   pausada con botón "Reactivar a Daniela".
4. **Ficha del lead** (columna derecha / drawer en móvil) — etapa editable, datos de
   calificación (propósito, presupuesto, timeline, financiamiento, decisor), proyecto de
   interés, tags (agregar/quitar de la taxonomía), asesor asignado (solo admin reasigna),
   notas internas con autor y fecha.
5. **`/panel/config`** (solo admin) — CRUD de tags (nombre, color) y gestión del equipo
   (invitar por email con rol, desactivar miembro).

Notificación in-app de mensaje nuevo: sonido + badge en el título del documento.

---

## 6. Flujo del takeover

1. Asesor escribe en el compositor y envía →
2. Server action `sendHumanMessage`:
   - Valida sesión, rol y acceso al lead (asesor: solo leads asignados a él; admin: todos).
   - Verifica **ventana de 24h**: último mensaje con `role='user'` del lead; si > 24h,
     rechaza con `WINDOW_EXPIRED` y la UI muestra "Fuera de ventana de 24h — requiere
     plantilla (Fase 5)". El compositor consulta este estado al abrir el chat para
     deshabilitarse proactivamente.
   - Envía por Cloud API **sin delay de tipeo artificial**.
   - Guarda en `conversations` (`role='human'`, `sent_by`, `wa_message_id`).
   - Pausa a Daniela: `bot_active = false`. Si el lead no tenía asesor, `assigned_to =`
     quien envió.
3. Banner "Daniela pausada — atiendes tú" aparece (Realtime) para todo el equipo.
4. "Reactivar a Daniela" → `bot_active = true`. Daniela retoma con contexto completo: el
   historial que recibe ya incluye los mensajes `human` (se mapean como mensajes del
   asistente al construir el contexto del modelo, para que sepa qué se dijo).

### Corrección obligatoria en el webhook (bug actual)

Hoy, si `bot_active = false`, el webhook retorna **antes de guardar** el mensaje entrante:
en takeover, lo que el cliente escribe no quedaría en la base. Cambio: guardar siempre el
mensaje del usuario y actualizar `last_message_at`; solo después decidir si Daniela procesa
y responde.

---

## 7. Server actions (todas re-validan rol en servidor)

| Action | Quién | Qué hace |
|---|---|---|
| `sendHumanMessage(leadId, text)` | admin, asesor con acceso | Flujo de takeover (sección 6) |
| `setBotActive(leadId, active)` | admin, asesor con acceso | Pausar/reactivar a Daniela |
| `updateLeadStage(leadId, stage)` | admin, asesor con acceso | Cambiar etapa |
| `assignLead(leadId, memberId)` | solo admin | Asignar/reasignar asesor |
| `addLeadTag(leadId, tagId)` / `removeLeadTag` | admin, asesor con acceso | Tags del lead (`source='human'`) |
| `addNote(leadId, content)` | admin, asesor con acceso | Nota interna |
| `createTag` / `updateTag` / `deleteTag` | solo admin | Taxonomía |
| `inviteTeamMember(email, name, role)` | solo admin | Invitación Supabase + fila en `team_members` |
| `setMemberActive(memberId, active)` | solo admin | Desactivar/activar cuenta |

"Asesor con acceso" = lead asignado a él (la RLS no le muestra otros). Los leads sin asignar
solo los ve el admin: los atiende él o los asigna. Si el admin escribe en un lead sin
asignar, queda asignado al admin (visible y reversible desde la ficha).

---

## 8. Manejo de errores

- **Envío fallido** (tras los 3 retries existentes del cliente WA): el mensaje no se
  guarda como enviado; la UI lo marca en rojo con "Reintentar".
- **Realtime desconectado**: indicador "Reconectando…"; al reconectar se recargan los
  mensajes del chat abierto desde la base (la fuente de verdad es Postgres, no el socket).
- **Sesión expirada**: redirect a `/panel/login`.
- **Ventana de 24h cerrada**: estado explícito en el compositor, nunca un fallo silencioso.
- El webhook mantiene su manejo actual: log de errores sin re-lanzar (ya respondió 200).

## 9. Seguridad

- Middleware bloquea `/panel/*` sin sesión activa o con `team_members.active = false`.
- Cada server action re-valida rol y acceso al lead en servidor.
- Service role key solo en servidor; el navegador usa anon key + RLS por rol.
- Sin registro público de cuentas; solo invitación del admin.
- Se eliminan las políticas RLS `USING (true)` (hoy innecesarias y riesgosas si el anon
  key se usara).

## 10. Testing

Extender la suite vitest existente (34 tests):

- Webhook: mensaje entrante **se guarda** con bot pausado; Daniela no responde en ese caso.
- `sendHumanMessage`: rechaza sin sesión, rechaza asesor sin acceso, rechaza fuera de
  ventana de 24h, pausa el bot y asigna al enviar.
- Autorización: asesor no puede reasignar leads, ni tocar config, ni leads ajenos.
- Helpers nuevos de Supabase: tags, notas, asignación.
- Cliente WA: `sendText` devuelve y propaga `wa_message_id`; variante sin typing delay.
- Construcción de contexto del modelo con mensajes `human` incluidos.

## 11. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Next.js 16 tiene breaking changes vs. conocimiento previo | Leer `node_modules/next/dist/docs/` antes de escribir código del panel (mandato de AGENTS.md) |
| Recursión RLS en `team_members` | Función `SECURITY DEFINER` `is_active_admin()` |
| Bot y humano respondiendo a la vez | Enviar mensaje humano pausa a Daniela atómicamente antes del envío |
| Realtime no entrega eventos (RLS mal configurada) | Test manual con cuenta asesor y admin en el checklist de verificación del plan |
| Política de Meta sobre automatización | Daniela no niega ser automatizada si se le pregunta directamente; el handoff humano fácil es la vía segura (protege el número, el activo principal) |

## 12. Fuera de alcance (fases 2–6)

Notificaciones por WhatsApp al equipo, motor de reglas tag/score→acción, envío de
media/PDFs, biblioteca de contenido, scoring 0–100, campañas con plantillas (y su costo
por mensaje), matching de inventario, estados entregado/leído en la UI.
