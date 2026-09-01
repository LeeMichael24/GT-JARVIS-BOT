# Daniela — TODO Configurado: Plan de Trabajo Completo

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar cada hallazgo de la auditoría del 31-ago-2026 (artefacto "Qué hace Daniela hoy") para que Daniela quede operando al 100%: número oficial, datos sembrados, cables reconectados y decisiones de negocio aplicadas.

**Architecture:** El trabajo se divide en 5 fases: (A) decisiones e insumos de Mike, (B) migración al número oficial de Meta, (C) datos en Supabase para copiar y pegar, (D) 7 tareas de código con TDD, (E) verificación end-to-end. Las fases A–C no tocan código; la fase D son cambios chicos y acotados sobre módulos que ya tienen tests.

**Tech Stack:** Next.js 16 App Router · Supabase (PostgreSQL) · OpenAI GPT-4o (`services/claude/` es nombre legacy) · WhatsApp Cloud API v23.0 · Vercel Hobby · Vitest.

**Spec:** Auditoría publicada en https://claude.ai/code/artifact/2c983b4a-dd87-4dee-b228-bd41d1b788c1 + `docs/ARQUITECTURA-Y-SETUP.md` (secciones 6, 9 y 13).

## Global Constraints

- Todo texto visible para clientes o para el prompt va en español salvadoreño natural.
- Convención fail-safe del repo: las lecturas a DB degradan a `[]`/defaults con `console.warn`, nunca lanzan al flujo del webhook.
- Suite verde SIEMPRE: 443 tests existentes + los nuevos. Comando: `npx vitest run`.
- `npx tsc --noEmit` se mantiene en la línea base de 17 errores pre-existentes (no agregar ninguno).
- Teléfonos SIEMPRE en solo-dígitos al llegar a la Cloud API (`to: "50362087916"`, jamás con `+` — Meta responde 200 y NO entrega).
- Nunca imprimir valores de `.env` en chat, commits ni logs.
- Vercel Hobby: crons 1×/día con ventana flexible de 1h, `maxDuration: 60`.
- Commits frecuentes con mensaje `feat:`/`fix:`/`chore:` + trailer de Claude.

---

## FASE A — Decisiones e insumos de Mike (sin código, bloquean tareas puntuales)

Cada ítem indica QUÉ tarea desbloquea. Las tareas de código que no dependen de esto pueden avanzar en paralelo.

- [ ] **D1 · Cadencia de seguimiento** (desbloquea Tarea 5). ¿Cuántos toques y hasta cuándo insiste Daniela antes de rendirse?
  - **Propuesta recomendada** (se implementa esta si Mike no indica otra): `post_conversation` 24h → 72h → 7d → 14d → 30d (5 toques); `hot_close` 4h → 24h → 48h → 96h; `nurture` 48h → 5d → 10d → 20d; `cold_reactivation` 30d → 60d → 90d. Muere solo con "no" explícito (opt-out) o al agotar los pasos.
- [ ] **D2 · Proyecto único invertible** (desbloquea el ajuste de prompt en C4). Pendiente desde la auditoría de agosto: ¿cuál es el ÚNICO proyecto que hoy acepta inversión? Hoy el prompt ofrece cuatro activamente.
- [ ] **D3 · Cifras de descuento por pronto pago** (desbloquea C4). Solo Portacelli tiene cifra; para el resto Daniela declina siempre. Por proyecto: ¿% o monto, y bajo qué condición?
- [ ] **D4 · URLs del material real** (desbloquea C3). Por proyecto: brochure PDF, 2–3 imágenes, video si hay. Si no están hosteados: subirlos a Supabase Storage (bucket público `media`, pasos en C3).
- [ ] **D5 · Nombres EXACTOS de las plantillas HSM aprobadas** (desbloquea C2). Leerlos en business.facebook.com → WhatsApp Manager → cuenta **Grupo Terranova** → Plantillas de mensajes. Copiar: nombre técnico (minúsculas con guion bajo), idioma, categoría (UTILITY/MARKETING) y cuántas variables `{{n}}` tiene el cuerpo de cada una.

---

## FASE B — Migración al número oficial (P0 · manual, en Meta y Vercel)

**Por qué primero:** el número de prueba admite máx. 5 destinatarios. Los datos de producción lo confirman: el único número registrado tiene 9/9 respuestas; los no registrados, 0/2 y 0/1. Daniela piensa, califica y gasta tokens — y Meta rechaza el envío. Nada más de este plan sirve a clientes reales sin esta fase.

> ⚠️ **Confirmar antes de empezar:** el número oficial (+503 7141 8717) es hoy el teléfono desde el que Mike hace pruebas. Al conectarlo a la Cloud API, esa línea queda tomada por Daniela: la app de WhatsApp del teléfono debe desconectarse de ese número y Mike ya no podrá escribirle a Daniela desde él. Si esa línea es personal, conseguir una línea dedicada ANTES de migrar.

- [ ] **B1.** Si el número está activo en la app WhatsApp/WhatsApp Business del teléfono: en el teléfono → Ajustes → Cuenta → Eliminar cuenta (libera el número para la Cloud API). Esperar ~3 min.
- [ ] **B2.** business.facebook.com → WhatsApp Manager → cuenta **Grupo Terranova** → Números de teléfono → **Agregar número de teléfono** → verificar por SMS o llamada al +503 7141 8717.
- [ ] **B3.** Registrar el nombre para mostrar ("Daniela — Grupo Terranova" o el aprobado por Mike) y esperar aprobación del display name (minutos a horas).
- [ ] **B4.** Copiar el **Phone number ID** nuevo (WhatsApp Manager → el número → detalles de API).
- [ ] **B5.** Vercel → proyecto `gt-jarvis-bot-qrro` → Settings → Environment Variables → actualizar `WA_PHONE_NUMBER_ID` con el ID nuevo (Production) → **Redeploy**. El webhook no cambia: está suscrito a nivel de app.
- [ ] **B6.** Limpiar el lead interno del número viejo de pruebas (ahora es Daniela misma):
```sql
UPDATE leads SET bot_active = false, opted_out = true WHERE phone = '50371418717';
```
- [ ] **B7. Verificar:** desde CUALQUIER teléfono no registrado antes, escribir "Hola, info de Portacelli". Debe: llegar respuesta de Daniela, crearse el lead en `/panel`, y en Supabase `conversations` mostrar ambos mensajes.
- [ ] **B8. Verificar alertas:** desde ese mismo teléfono escribir "quiero el precio final para firmar contrato". Debe llegar la alerta LEAD HOT al número CEO (62087916).

**Nota de límites Meta:** un número nuevo arranca con capa de 250 conversaciones iniciadas por negocio/24h y sube solo con uso + verificación del negocio. Para responder a clientes que escriben primero NO hay límite práctico.

---

## FASE C — Datos en Supabase (copiar y pegar en SQL Editor)

### C1 · Proteger números internos que ya son leads (desbloquea alta de Paola)

- [ ] **C1.1** Ejecutar:
```sql
-- Paola (77250355) y el CEO (62087916) quedaron como leads en pruebas.
-- Silencio total para internos: bot inactivo + opted_out (los crons los saltan).
UPDATE leads SET bot_active = false, opted_out = true
WHERE phone IN ('50377250355', '50362087916');
```
- [ ] **C1.2** En `/panel` → Configuración → Equipo: agregar el teléfono de Paola (`50377250355`) en su fila (el campo guarda al salir del input y muestra ✓). Desde ese momento `isInternal()` la excluye del webhook y puede recibir alertas `consult_team`.

### C2 · Sembrar el motor de recontacto (depende de D5)

Hoy `message_templates` y `recontact_rules` están vacías → el cron diario corre, reporta "ok" y no produce nada. Guardar como `migrations/014_seed_proactive.sql` y ejecutar en Supabase.

- [ ] **C2.1** Con los nombres de D5, ejecutar (sustituir SOLO los valores en `<...>` con lo leído en Meta — son datos de configuración externa, no inventarlos):
```sql
-- Espejo de las plantillas HSM aprobadas en el WABA Grupo Terranova.
-- name = nombre técnico EXACTO de Meta; variables = cuántos {{n}} tiene el cuerpo.
INSERT INTO message_templates (name, language, category, body_preview, variables) VALUES
  ('<nombre_tecnico_plantilla_utility>',   'es', 'UTILITY',   '<primera línea del cuerpo aprobado>', <n_variables>),
  ('<nombre_tecnico_plantilla_marketing>', 'es', 'MARKETING', '<primera línea del cuerpo aprobado>', <n_variables>)
ON CONFLICT (name) DO NOTHING;

-- Reglas de cadencia: qué leads revivir y con qué plantilla.
INSERT INTO recontact_rules (name, stages, days_inactive, template_id, max_per_run)
SELECT 'Reactivar tibios 7 días', ARRAY['new','warm'], 7, id, 20
  FROM message_templates WHERE name = '<nombre_tecnico_plantilla_marketing>'
UNION ALL
SELECT 'Revivir fríos 30 días', ARRAY['cold'], 30, id, 20
  FROM message_templates WHERE name = '<nombre_tecnico_plantilla_marketing>';
```
- [ ] **C2.2** Verificar: `select name, active from message_templates; select name, days_inactive from recontact_rules;` — 2 y 2 filas.
- [ ] **C2.3** Recordatorio del flujo: el cron diario CREA campañas `pending_approval`; Mike las aprueba en `/panel` antes de que salga un solo mensaje. Nada se envía solo.

### C3 · Material de venta real (depende de D4)

- [ ] **C3.1** Si los archivos no están hosteados: Supabase → Storage → **New bucket** `media` (marcar **Public**) → subir PDFs/imágenes. La URL pública queda `https://<ref-proyecto>.supabase.co/storage/v1/object/public/media/<archivo>`.
- [ ] **C3.2** Desactivar el placeholder y cargar lo real (repetir el INSERT por cada archivo de D4):
```sql
UPDATE project_media SET active = false WHERE url LIKE '%PENDIENTE-SUBIR-PDF%';

INSERT INTO project_media (project_key, media_type, url, caption, sort_order) VALUES
  ('portacelli', 'brochure', '<URL pública del PDF>',    'Brochure oficial Portacelli', 0),
  ('portacelli', 'image',    '<URL pública imagen 1>',   'Render fachada',              1);
-- media_type permitidos: brochure | image | video | link | price_list | floor_plan
-- project_key: fragmento en minúsculas que matchea el nombre del proyecto ('portacelli', 'foresta', ...)
```
- [ ] **C3.3** Verificar: `select project_key, media_type, count(*) from project_media where active group by 1,2;`
- [ ] **C3.4** Prueba en vivo: pedirle a Daniela por WhatsApp "mandame el brochure de Portacelli" → debe llegar el PDF como documento.

### C4 · Proyecto invertible y descuentos (depende de D2 y D3)

- [ ] **C4.1** Con D2 decidido, en `/panel` → Objetivos (tabla `agent_objectives`): crear objetivo activo "Inversión: SOLO ofrecer <proyecto D2>. Si preguntan por invertir en otro, redirigir a <proyecto D2> o escalar." (La sección de objetivos ya se inyecta al prompt en cada turno — `formatObjectivesForPrompt`, `route.ts:372`.)
- [ ] **C4.2** Con D3, sembrar las cifras como conocimiento por proyecto:
```sql
INSERT INTO knowledge_base (category, topic, title, content, project_slug, priority, active) VALUES
  ('sales_playbook', 'descuento_pronto_pago', 'Descuento pronto pago <proyecto>',
   'Descuento de <cifra D3> por pago de prima completa antes de <condición D3>. Ofrecerlo SOLO si el cliente menciona pago de contado o pide rebaja.',
   '<slug-del-proyecto>', 80, true);
-- Repetir por cada proyecto con cifra en D3.
```

---

## FASE D — Código (TDD estricto: RED → verificar → GREEN → verificar → commit)

### File Structure (fase D completa)

- Modificar: `services/claude/prompts.ts` (señales al dealBlock; quitar `qualified` del contrato)
- Modificar: `services/claude/client.ts` (quitar `qualified` del parser)
- Modificar: `types/index.ts` (quitar `qualified` de `ClaudeResponse`)
- Modificar: `lib/knowledge-base.ts` (nueva pura `filterPlaybookByProject`)
- Modificar: `lib/escalation-rules.ts` (nueva pura `formatConditionalRulesForPrompt`)
- Modificar: `lib/reflection.ts` (instrucción de confirmación de temas)
- Modificar: `lib/sequences.ts` (cadencia D1, `cancelSequencesForLead`, `ensureFollowUpsForSilentLeads`)
- Modificar: `app/api/webhook/whatsapp/route.ts` (cablear todo lo anterior)
- Modificar: `app/api/cron/daily/route.ts` (red de seguridad de secuencias)
- Tests: `tests/prompts.test.ts`, `tests/knowledge-base.test.ts` (nuevo), `tests/escalation-rules.test.ts`, `tests/reflection.test.ts`, `tests/sequences.test.ts`, `tests/claude.test.ts`

---

### Tarea 1: Reinyectar las señales del deal al prompt

Hoy cada turno guarda objeciones, señales de compra, presupuesto, zona y engagement (`deal_summaries.signals`) y nada vuelve al prompt: solo viajan `summary` y `next_action` (`prompts.ts:14`, `route.ts:381`). Daniela recalcula al cliente de cero.

**Files:**
- Modify: `services/claude/prompts.ts:14` (tipo) y `:57-63` (dealBlock)
- Modify: `app/api/webhook/whatsapp/route.ts:381`
- Test: `tests/prompts.test.ts`

**Interfaces:**
- Consumes: `DealSignals` de `@/types` (ya existe, `types/index.ts:171`).
- Produces: `PromptContext.dealSummary` acepta `signals?: DealSignals | null`. Ningún llamador existente se rompe (campo opcional).

- [ ] **Paso 1: Test RED** — agregar a `tests/prompts.test.ts`:

```ts
describe('dealBlock con señales', () => {
  it('inyecta objeciones y señales de compra previas al prompt', () => {
    const prompt = buildSystemPrompt({
      lead: baseLead, project: null,
      dealSummary: {
        summary: 'Cliente evaluando Portacelli',
        next_action: 'Confirmar visita',
        signals: {
          objections: ['precio alto', 'lejos del trabajo'],
          buying_signals: ['preguntó por financiamiento'],
          budget_mentioned: 85000,
          preferred_zone: 'Santa Tecla',
          engagement_level: 'high',
        },
      },
    })
    expect(prompt).toContain('precio alto')
    expect(prompt).toContain('preguntó por financiamiento')
    expect(prompt).toContain('85,000')
    expect(prompt).toContain('Santa Tecla')
  })

  it('sin señales, el dealBlock queda igual que antes', () => {
    const prompt = buildSystemPrompt({
      lead: baseLead, project: null,
      dealSummary: { summary: 'Resumen', next_action: null },
    })
    expect(prompt).toContain('Resumen')
    expect(prompt).not.toContain('Objeciones que YA planteó')
  })
})
```
(Usar el `baseLead` helper que ya existe en ese archivo de tests.)

- [ ] **Paso 2:** `npx vitest run tests/prompts.test.ts` → FAIL (signals no existe en el tipo / textos ausentes).
- [ ] **Paso 3: Implementar.** En `prompts.ts` — importar el tipo y extender:

```ts
import type { Lead, GTProject, GTSubInvestment, DealSignals } from '@/types'
// ...
dealSummary?: { summary: string; next_action: string | null; signals?: DealSignals | null } | null
```

Reemplazar el `dealBlock` (líneas 57-63) por:

```ts
  const s = dealSummary?.signals ?? null
  const signalLines = s
    ? [
        s.objections?.length ? `Objeciones que YA planteó (no las trates como nuevas; retómalas con un ángulo distinto): ${s.objections.join('; ')}` : '',
        s.buying_signals?.length ? `Señales de compra ya detectadas: ${s.buying_signals.join('; ')}` : '',
        s.budget_mentioned ? `Presupuesto mencionado: $${s.budget_mentioned.toLocaleString('en-US')}` : '',
        s.preferred_zone ? `Zona de interés: ${s.preferred_zone}` : '',
        s.engagement_level ? `Nivel de interés en la última charla: ${s.engagement_level}` : '',
      ].filter(Boolean)
    : []

  const dealBlock = dealSummary
    ? `\n# MEMORIA DEL DEAL — CONTEXTO DE CONVERSACIONES ANTERIORES
Lo siguiente es un resumen de interacciones previas con este cliente. Úsalo para continuar donde quedaste:
Resumen: ${dealSummary.summary}
${dealSummary.next_action ? `Siguiente acción pendiente: ${dealSummary.next_action}` : ''}${signalLines.length ? '\n' + signalLines.join('\n') : ''}
REGLA: No repitas lo que ya se dijo. Avanza la conversación desde este punto.\n`
    : ''
```

En `route.ts:381`:

```ts
      dealSummary: existingDeal
        ? { summary: existingDeal.summary, next_action: existingDeal.next_action, signals: existingDeal.signals ?? null }
        : null,
```

- [ ] **Paso 4:** `npx vitest run tests/prompts.test.ts` → PASS. Luego `npx vitest run` completo → verde.
- [ ] **Paso 5:** `git add -A && git commit -m "feat: reinyectar señales del deal (objeciones, presupuesto, zona) al prompt"`

---

### Tarea 2: Filtrar el playbook por proyecto

`getPlaybook(projectSlug?)` acepta filtrar y nadie le pasa el parámetro (`route.ts:289`); además el formateo ocurre en la línea 318, ANTES de detectar el proyecto (~344-369). Fix: filtrar en memoria DESPUÉS de resolver el proyecto — se conserva el fetch paralelo.

**Files:**
- Modify: `lib/knowledge-base.ts` (después de `getPlaybook`)
- Modify: `app/api/webhook/whatsapp/route.ts:318` (mover) y `:369` (nueva posición)
- Test: `tests/knowledge-base.test.ts` (crear)

**Interfaces:**
- Produces: `filterPlaybookByProject(entries: KBEntry[], projectSlug: string | null | undefined): KBEntry[]` — pura, exportada de `@/lib/knowledge-base`.
- Consumes: `project?.slug` ya resuelto en route.ts (se usa en la línea 373).

- [ ] **Paso 1: Test RED** — crear `tests/knowledge-base.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { filterPlaybookByProject, type KBEntry } from '@/lib/knowledge-base'

function entry(project_slug: string | null, title = 't'): KBEntry {
  return { category: 'faq', topic: 'x', title, content: 'c', project_slug }
}

describe('filterPlaybookByProject', () => {
  const entries = [entry(null, 'general'), entry('portacelli', 'p1'), entry('foresta', 'f1')]

  it('con proyecto: deja lo general + lo de ese proyecto, saca el resto', () => {
    const out = filterPlaybookByProject(entries, 'portacelli')
    expect(out.map(e => e.title)).toEqual(['general', 'p1'])
  })

  it('sin proyecto: devuelve todo (comportamiento actual)', () => {
    expect(filterPlaybookByProject(entries, null)).toHaveLength(3)
    expect(filterPlaybookByProject(entries, undefined)).toHaveLength(3)
  })
})
```

- [ ] **Paso 2:** `npx vitest run tests/knowledge-base.test.ts` → FAIL (`filterPlaybookByProject` no exportada).
- [ ] **Paso 3: Implementar.** En `lib/knowledge-base.ts`, después de `getPlaybook`:

```ts
/**
 * Aísla el playbook al proyecto en conversación: entradas generales (slug null)
 * + las de ESE proyecto. Evita contaminar el prompt con datos de otros proyectos.
 */
export function filterPlaybookByProject(
  entries: KBEntry[],
  projectSlug: string | null | undefined,
): KBEntry[] {
  if (!projectSlug) return entries
  return entries.filter(e => !e.project_slug || e.project_slug === projectSlug)
}
```

En `route.ts`: borrar la línea 318 (`const salesPlaybook = formatPlaybookForPrompt(playbookEntries)`) y agregar justo después del `console.log('[processMessage] Project: ...')` (~línea 369):

```ts
    const salesPlaybook = formatPlaybookForPrompt(
      filterPlaybookByProject(playbookEntries, project?.slug ?? null),
    )
```
Importar `filterPlaybookByProject` en el import de `@/lib/knowledge-base` (línea 9).

- [ ] **Paso 4:** `npx vitest run` → verde (webhook-route.test.ts no debe romperse: el mock parcial de knowledge-base debe dejar pasar la pura — si mockea el módulo completo, usar `importOriginal` como ya se hace con `@/lib/team-routing` en ese archivo).
- [ ] **Paso 5: Verificar datos.** En Supabase: `select distinct project_slug from knowledge_base where active;` — los slugs deben coincidir con los del catálogo GT (`portacelli`, etc.). Corregir con `UPDATE knowledge_base SET project_slug = '<slug-correcto>' WHERE project_slug = '<valor-viejo>';` si hay desalineados.
- [ ] **Paso 6:** `git add -A && git commit -m "feat: aislar playbook al proyecto en conversación"`

---

### Tarea 3: Hacer que las reglas topic/condition se evalúen

El panel crea reglas `topic`/`condition` y la migración 006 siembra tres — pero `matchKeywordRules` filtra solo `keyword` (`lib/escalation-rules.ts:39-47`): función completa con interfaz y datos que no hace nada. Fix: las reglas contextuales van SIEMPRE al prompt para que GPT-4o las aplique con juicio (un substring no puede detectar "negociación activa").

**Files:**
- Modify: `lib/escalation-rules.ts` (nueva función al final)
- Modify: `app/api/webhook/whatsapp/route.ts:335-339`
- Test: `tests/escalation-rules.test.ts`

**Interfaces:**
- Produces: `formatConditionalRulesForPrompt(rules: EscalationRule[]): string` — pura; `''` si no hay reglas topic/condition.
- Consumes: `escalationRules` ya cargadas en el fetch paralelo (route.ts:301-306) y la variable existente `escalationOverride`.

- [ ] **Paso 1: Test RED** — agregar a `tests/escalation-rules.test.ts`:

```ts
import { formatConditionalRulesForPrompt } from '@/lib/escalation-rules'

describe('formatConditionalRulesForPrompt', () => {
  it('formatea reglas topic y condition para el prompt', () => {
    const out = formatConditionalRulesForPrompt([
      rule('negociacion', { trigger_type: 'topic', description: 'Cualquier negociación activa' }),
      rule('legal', { trigger_type: 'topic', action: 'consult_team' }),
      rule('precio final', {}), // keyword: NO debe aparecer aquí
    ])
    expect(out).toContain('negociacion')
    expect(out).toContain('Cualquier negociación activa')
    expect(out).toContain('consult_team')
    expect(out).not.toContain('precio final')
  })

  it('sin reglas contextuales devuelve cadena vacía', () => {
    expect(formatConditionalRulesForPrompt([rule('precio final')])).toBe('')
  })
})
```

- [ ] **Paso 2:** `npx vitest run tests/escalation-rules.test.ts` → FAIL.
- [ ] **Paso 3: Implementar.** Al final de `lib/escalation-rules.ts`:

```ts
/**
 * Las reglas topic/condition no se pueden detectar por substring: van al
 * prompt para que el modelo las evalúe con contexto y fuerce el agent_action.
 */
export function formatConditionalRulesForPrompt(rules: EscalationRule[]): string {
  const conditional = rules.filter(
    r => r.trigger_type === 'topic' || r.trigger_type === 'condition',
  )
  if (conditional.length === 0) return ''
  const lines = conditional.map(r => {
    const desc = r.description ?? r.trigger_value
    return `- Si la conversación entra en "${r.trigger_value}" (${desc}) → agent_action type: "${r.action}"`
  })
  return `
# REGLAS DE ESCALAMIENTO POR CONTEXTO
Evalúa el mensaje Y el historial contra estas situaciones. Si UNA aplica, DEBES usar la acción indicada en tu agent_action:
${lines.join('\n')}
Si ninguna aplica, ignora esta sección.
`
}
```

En `route.ts`, justo después del bloque `matchedRules` (líneas 335-339):

```ts
    const conditionalBlock = formatConditionalRulesForPrompt(escalationRules)
    if (conditionalBlock) {
      escalationOverride = escalationOverride
        ? escalationOverride + '\n' + conditionalBlock
        : conditionalBlock
    }
```
Agregar `formatConditionalRulesForPrompt` al import de `@/lib/escalation-rules`.

- [ ] **Paso 4:** `npx vitest run` → verde.
- [ ] **Paso 5:** `git add -A && git commit -m "feat: reglas de escalamiento topic/condition ahora se evalúan vía prompt"`

---

### Tarea 4: Destrabar el aprendizaje nocturno

Lo aprendido nace con confianza 0.5 (umbral de uso: 0.7). La única vía automática de subir es que el tema se repita 3 veces (`lib/agent-brain.ts:54-61`) — pero el prompt de reflexión ordena "NO repitas estos temas" (`lib/reflection.ts:68-69`). El sistema se pelea consigo mismo.

**Files:**
- Modify: `lib/reflection.ts:68-69`
- Test: `tests/reflection.test.ts`

**Interfaces:**
- Consumes/Produces: nada nuevo — solo cambia el texto de `buildReflectionPrompt`, cuya firma queda igual.

- [ ] **Paso 1: Test RED** — agregar a `tests/reflection.test.ts`:

```ts
it('pide CONFIRMAR temas existentes con el mismo topic (para que suba la confianza)', () => {
  const prompt = buildReflectionPrompt([], ['objecion precio zona norte'])
  expect(prompt).toContain('INCLÚYELO otra vez usando EXACTAMENTE el mismo topic')
  expect(prompt).not.toContain('NO repitas estos temas')
})
```

- [ ] **Paso 2:** `npx vitest run tests/reflection.test.ts` → FAIL.
- [ ] **Paso 3: Implementar.** En `buildReflectionPrompt`, reemplazar:

```
TEMAS QUE YA EXISTEN EN EL CEREBRO (NO repitas estos temas, solo aporta si tienes un ángulo NUEVO):
```
por:

```
TEMAS QUE YA EXISTEN EN EL CEREBRO:
${existingTopics.length ? existingTopics.map(t => `- ${t}`).join('\n') : '- (ninguno)'}
Si las conversaciones de HOY vuelven a confirmar uno de estos temas, INCLÚYELO otra vez usando EXACTAMENTE el mismo topic — así el sistema cuenta la confirmación y sube su confianza. Para lo nuevo, no dupliques un tema existente bajo otro nombre.
```
(La línea de `existingTopics` ya existe — solo cambia el texto alrededor.)

- [ ] **Paso 4:** `npx vitest run` → verde (revisar si algún test viejo asertaba el texto anterior y actualizarlo).
- [ ] **Paso 5:** `git add -A && git commit -m "fix: la reflexión nocturna ahora confirma temas existentes en vez de evitarlos"`

---

### Tarea 5: Cadencia extendida + cancelar secuencias al opt-out (depende de D1)

Hoy el seguimiento son 2-3 pasos y muere (`lib/sequences.ts:14-46`). Mike pidió "hasta el no explícito". Además, al opt-out se marca el lead pero las secuencias quedan `active` (`route.ts:599-601`) — inofensivo (el cron salta opted_out) pero sucio.

**Files:**
- Modify: `lib/sequences.ts:14-46` y nueva función
- Modify: `app/api/webhook/whatsapp/route.ts:599-601`
- Test: `tests/sequences.test.ts`

**Interfaces:**
- Produces: `cancelSequencesForLead(leadId: string): Promise<void>` exportada de `@/lib/sequences`.
- Consumes: cadencia D1 (si Mike no responde, usar la propuesta recomendada tal cual).

- [ ] **Paso 1: Test RED** — agregar a `tests/sequences.test.ts`:

```ts
it('post_conversation tiene 5 toques y termina a los 30 días', () => {
  const def = SEQUENCE_DEFINITIONS.post_conversation
  expect(def.steps).toHaveLength(5)
  expect(def.steps[4].delay_hours).toBe(720)
})

it('cancelSequencesForLead marca cancelled solo las activas del lead', async () => {
  const update = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
  })
  // usar el patrón de mock de getServiceClient que ya usa este archivo de tests
  await cancelSequencesForLead('lead-1')
  expect(update).toHaveBeenCalledWith({ status: 'cancelled' })
})
```
(Adaptar el segundo test al helper de mock de Supabase que ya exista en `tests/sequences.test.ts` — seguir su convención, no inventar otra.)

- [ ] **Paso 2:** `npx vitest run tests/sequences.test.ts` → FAIL.
- [ ] **Paso 3: Implementar.** `SEQUENCE_DEFINITIONS` con la cadencia D1 (propuesta recomendada):

```ts
export const SEQUENCE_DEFINITIONS: Record<SequenceType, SequenceDef> = {
  post_conversation: {
    description: 'Follow up after conversation with no response',
    steps: [
      { delay_hours: 24, purpose: 'gentle_reminder' },
      { delay_hours: 72, purpose: 'add_value' },
      { delay_hours: 168, purpose: 'last_chance' },
      { delay_hours: 336, purpose: 'new_angle' },
      { delay_hours: 720, purpose: 'final_goodbye' },
    ],
  },
  nurture: {
    description: 'Nurture warm lead with relevant info',
    steps: [
      { delay_hours: 48, purpose: 'share_details' },
      { delay_hours: 120, purpose: 'social_proof' },
      { delay_hours: 240, purpose: 'check_in' },
      { delay_hours: 480, purpose: 'market_update' },
    ],
  },
  hot_close: {
    description: 'Push hot lead to close',
    steps: [
      { delay_hours: 4, purpose: 'send_details' },
      { delay_hours: 24, purpose: 'create_urgency' },
      { delay_hours: 48, purpose: 'offer_meeting' },
      { delay_hours: 96, purpose: 'last_push' },
    ],
  },
  cold_reactivation: {
    description: 'Re-engage cold leads monthly',
    steps: [
      { delay_hours: 720, purpose: 'new_offer' },
      { delay_hours: 1440, purpose: 'market_update' },
      { delay_hours: 2160, purpose: 'final_check' },
    ],
  },
}
```

Nueva función en `lib/sequences.ts`:

```ts
/** El "no" explícito apaga TODO el seguimiento pendiente del lead. */
export async function cancelSequencesForLead(leadId: string): Promise<void> {
  const { error } = await getServiceClient()
    .from('sequences')
    .update({ status: 'cancelled' })
    .eq('lead_id', leadId)
    .eq('status', 'active')
  if (error) console.warn('[sequences] No se pudieron cancelar:', error.message)
}
```

En `route.ts:599-601`:

```ts
    if (claudeResponse.opt_out) {
      await updateLead(lead.id, { opted_out: true })
      await cancelSequencesForLead(lead.id)
      console.log(`[processMessage] Lead ${lead.id} opted out — seguimientos cancelados`)
    }
```
Agregar `cancelSequencesForLead` al import de `@/lib/sequences`.

- [ ] **Paso 4:** `npx vitest run` → verde.
- [ ] **Paso 5:** `git add -A && git commit -m "feat: cadencia de seguimiento a 5 toques/30d y cancelación al opt-out"`

---

### Tarea 6: Red de seguridad — seguimiento aunque el modelo no lo pida

Las secuencias solo nacen si GPT-4o elige `follow_up_needed` (`route.ts:552`). Si no lo elige, el lead silencioso queda sin seguimiento para siempre. Red: el cron diario crea `post_conversation` para leads sin respuesta >24h que no tengan secuencia activa.

**Files:**
- Modify: `lib/sequences.ts` (nueva función)
- Modify: `app/api/cron/daily/route.ts` (llamada + conteo en el resumen)
- Test: `tests/sequences.test.ts`

**Interfaces:**
- Consumes: `createSequence` (ya existe, `lib/sequences.ts:62`); `leads.last_message_at` (existe, `types/index.ts:26`).
- Produces: `ensureFollowUpsForSilentLeads(now: Date): Promise<number>` — devuelve cuántas secuencias creó.

- [ ] **Paso 1: Test RED** — agregar a `tests/sequences.test.ts` (con el helper de mock de Supabase del archivo):

```ts
describe('ensureFollowUpsForSilentLeads', () => {
  it('crea post_conversation para leads callados >24h sin secuencia activa', async () => {
    // mock: leads → [{ id: 'l1', stage: 'warm', sequences: [] },
    //               { id: 'l2', stage: 'hot',  sequences: [{ status: 'active' }] }]
    const creadas = await ensureFollowUpsForSilentLeads(new Date('2026-08-31T18:00:00Z'))
    expect(creadas).toBe(1) // solo l1: l2 ya tiene secuencia activa
  })

  it('si la lectura falla devuelve 0 sin lanzar (convención fail-safe)', async () => {
    // mock: error en el select
    await expect(ensureFollowUpsForSilentLeads(new Date())).resolves.toBe(0)
  })
})
```

- [ ] **Paso 2:** `npx vitest run tests/sequences.test.ts` → FAIL.
- [ ] **Paso 3: Implementar.** En `lib/sequences.ts`:

```ts
/**
 * Red de seguridad: el modelo a veces no pide follow_up_needed y el lead
 * silencioso queda sin seguimiento. El cron diario crea la secuencia base
 * para todo lead activo callado >24h que no tenga ya una secuencia activa.
 */
export async function ensureFollowUpsForSilentLeads(now: Date): Promise<number> {
  const supabase = getServiceClient()
  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await supabase
    .from('leads')
    .select('id, stage, sequences(status)')
    .eq('bot_active', true)
    .eq('opted_out', false)
    .in('stage', ['new', 'warm', 'hot'])
    .not('phone', 'like', 'n_%')
    .lt('last_message_at', cutoff)
  if (error) {
    console.warn('[sequences] ensureFollowUps no pudo leer leads:', error.message)
    return 0
  }
  type Row = { id: string; stage: string; sequences: { status: string }[] | null }
  const sinSecuencia = ((data ?? []) as Row[]).filter(
    l => !(l.sequences ?? []).some(s => s.status === 'active'),
  )
  let creadas = 0
  for (const l of sinSecuencia) {
    try {
      const tipo = l.stage === 'hot' ? ('hot_close' as const) : ('post_conversation' as const)
      await createSequence(l.id, tipo, { origin: 'safety_net_daily' })
      creadas++
    } catch (err) {
      console.warn('[sequences] ensureFollowUps falló para', l.id, err instanceof Error ? err.message : err)
    }
  }
  return creadas
}
```

En `app/api/cron/daily/route.ts`: importar `ensureFollowUpsForSilentLeads` de `@/lib/sequences` y, junto a los otros pasos del cron (después de la reflexión), agregar:

```ts
  let followUpsCreated = 0
  try {
    followUpsCreated = await ensureFollowUpsForSilentLeads(new Date())
  } catch (err) {
    console.warn('[cron/daily] safety net de secuencias falló:', err instanceof Error ? err.message : err)
  }
```
e incluir `followUpsCreated` en el objeto que se pasa a `recordCronRun('daily', ...)` para verlo en `cron_runs`.

- [ ] **Paso 4:** `npx vitest run` → verde.
- [ ] **Paso 5:** `git add -A && git commit -m "feat: red de seguridad diaria crea seguimientos para leads silenciosos"`

---

### Tarea 7: Eliminar el campo muerto `qualified`

El modelo lo devuelve en cada respuesta y solo termina en un `console.log` (`route.ts:688`); el dashboard calcula "calificados" por su cuenta. Campo muerto: fuera (YAGNI).

**Files:**
- Modify: `services/claude/prompts.ts:126` · `services/claude/client.ts:71` · `types/index.ts:144` · `app/api/webhook/whatsapp/route.ts:688`
- Test: `tests/claude.test.ts`

**Interfaces:**
- Produces: `ClaudeResponse` SIN `qualified`. Verificar con grep que nadie más lo consume antes de borrar: `grep -rn "\.qualified" app lib services components --include="*.ts" --include="*.tsx" | grep -v test | grep -v qualification`

- [ ] **Paso 1:** Correr el grep del bloque anterior. Esperado: solo `route.ts:688` (el log) y `client.ts:71` (el parser). Si aparece otro consumidor, DETENERSE y reevaluar la tarea.
- [ ] **Paso 2: Test RED** — en `tests/claude.test.ts`, actualizar el test del parser para asertar que la respuesta parseada NO tiene la llave:

```ts
it('el contrato ya no incluye el campo muerto qualified', () => {
  const parsed = parseClaudeResponse(JSON.stringify({ reply: 'Hola', stage: 'warm' }))
  expect('qualified' in parsed).toBe(false)
})
```

- [ ] **Paso 3:** `npx vitest run tests/claude.test.ts` → FAIL.
- [ ] **Paso 4: Implementar.** Borrar: la línea `"qualified": false,` del contrato JSON en `prompts.ts:126`; la línea `qualified: parsed.qualified ?? false,` en `client.ts:71`; la línea `qualified: boolean` en `types/index.ts:144`. En `route.ts:688` dejar:

```ts
    console.log(`[processMessage] Done — lead ${lead.id} | stage: ${effectiveStage}`)
```

- [ ] **Paso 5:** `npx vitest run` → verde y `npx tsc --noEmit` → 17 errores (línea base; los tests viejos que asertaban `qualified` se actualizan aquí).
- [ ] **Paso 6:** `git add -A && git commit -m "chore: eliminar campo muerto qualified del contrato del modelo"`

---

### Cierre de fase D

- [ ] `npx vitest run` → TODO verde (443 + nuevos).
- [ ] `npx tsc --noEmit` → 17 errores pre-existentes, ni uno más.
- [ ] Push con `! git push origin main` (lo corre Mike si el push del agente es bloqueado) → Vercel despliega solo.

---

## FASE E — Verificación end-to-end (después de B + C + D)

- [ ] **E1 · Tablas vivas** (Supabase):
```sql
select 'project_media' as tabla, count(*) filter (where active) as activas from project_media
union all select 'message_templates', count(*) filter (where active) from message_templates
union all select 'recontact_rules',   count(*) filter (where active) from recontact_rules;
-- Esperado: todas > 0
```
- [ ] **E2 · Conversación completa** desde un teléfono NO interno: saludo → pedir info de Portacelli (playbook filtrado) → "mandame el brochure" (llega el PDF) → objeción de precio → despedirse. Al día siguiente escribir de nuevo: Daniela debe RECORDAR la objeción (Tarea 1) sin re-preguntarla.
- [ ] **E3 · Escalamiento contextual**: mensaje tipo "estoy comparando con otra constructora, ¿qué me pueden mejorar?" (negociación sin keyword) → debe llegar alerta al CEO (Tarea 3).
- [ ] **E4 · Crons** a la mañana siguiente:
```sql
select job, status, details, ran_at from cron_runs order by ran_at desc limit 6;
-- daily debe traer followUpsCreated y reflexión; sequences debe reportar sent/skipped
```
- [ ] **E5 · Seguimiento**: dejar un lead de prueba sin responder 24h → verificar en `sequences` que existe fila `active` con `next_fire_at` (Tarea 6) y que al otro día llega el toque.
- [ ] **E6 · Cerebro**: tras 2-3 días, `select source, count(*) filter (where confidence >= 0.7 and active) as en_uso from agent_brain group by source;` — `agent` debe empezar a promover solo (Tarea 4).
- [ ] **E7 · Silencio interno**: Paola y el CEO escriben al número oficial → cero respuesta, y en `activity_log` aparece `internal_message_ignored`.

---

## Self-Review (hecho al escribir el plan)

- Cobertura contra la auditoría: P0 número → Fase B · material (req 09) → C3 · recontacto → C2 · memoria emocional (req 12) → Tarea 1 · catálogo sin mezclar (req 05) → Tarea 2 · reglas topic muertas → Tarea 3 · aprender sola (req 13) → Tarea 4 · seguir hasta el no (req 04) → Tareas 5+6 y D1 · campo muerto → Tarea 7 · proyecto invertible (req 11) → D2/C4 · descuentos (req 10) → D3/C4 · Paola → C1.
- Sin consumidores ocultos de `qualified`: el grep del Paso 1 de la Tarea 7 lo confirma antes de borrar.
- Tipos consistentes: `DealSignals` viene de `types/index.ts:171`; `KBEntry` ya se exporta de `lib/knowledge-base.ts:3`; `EscalationRule` de `@/types`.
- Fuera de alcance deliberado: renombrar `services/claude/` (cosmético) y genericizar `GTProject` para clonar a otros verticales — van en `docs/ARQUITECTURA-Y-SETUP.md` §13 como mejoras de plantilla, no de Daniela.
