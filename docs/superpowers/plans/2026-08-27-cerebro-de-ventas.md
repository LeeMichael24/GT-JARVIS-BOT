# Cerebro de Ventas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Daniela a well-defined hand-off boundary (meetings, money, legal documents, final price always reach a human) plus a real sales-methodology/emotional-intelligence upgrade, while closing a live security gap where she currently hands out real bank details unsupervised.

**Architecture:** Three layers over the existing system — (1) hard-close triggers via `escalation_rules` + an unconditional notify-on-schedule fix in the webhook route, (2) two new editable prompt blocks (`emotional_intelligence`, `closing_techniques`) plus an extension of the existing `investment_guide` block, (3) a light extension of the nightly reflection prompt to also mine tone/phrasing observations. No new tables, no new subsystems.

**Tech Stack:** Next.js API routes, Supabase (Postgres), Vitest, GPT-4o via `services/claude`.

**Spec:** `docs/superpowers/specs/2026-08-27-cerebro-de-ventas-design.md`

## Global Constraints

- Never invent SQL columns: `knowledge_base` has exactly `id, category, topic, title, content, project_slug, priority, active, created_at, updated_at` — no `description` column. `escalation_rules` has `id, trigger_type, trigger_value, description, action, active, created_at, updated_at`.
- Do **not** add a bare `'reserva'` keyword to `escalation_rules` — Daniela's own urgency copy uses "se están reservando rápido" constantly; only the specific phrases in the spec (`'promesa de venta'`, `'promesa de compraventa'`, `'documento de reserva'`, `'notario'`) go in.
- Do **not** persist a new `client_type` column on `leads` — the corporate/individual tone read is a same-turn prompt instruction, not stored state (see spec's "Non-goals" section for why).
- The Portacelli discount/prima figure is **unconfirmed** (migration 002 says 15%/20%, migration 007's script says 3%/12%) — ship it deactivated with a `[PENDIENTE CONFIRMAR]` marker. Never pick one of the two numbers.
- `matchKeywordRules` (`lib/escalation-rules.ts`) is a pure function — new tests exercise it directly with hand-built `EscalationRule[]` fixtures, no DB needed.
- Full existing suite (395+ tests as of the last audit) must stay green; run it as the last task.

---

### Task 1: Meetings always notify the team

**Files:**
- Modify: `app/api/webhook/whatsapp/route.ts:433-453`
- Test: `tests/webhook-route.test.ts`

**Interfaces:**
- Consumes: `sendInternalNotification(params: NotificationParams)` from `@/services/whatsapp/client` (already imported in this file — `NotificationParams = { leadName: string; leadPhone: string; action: AgentAction; botReply: string; dealSummary: string | null }`), `AgentAction` type from `@/types` (`{ type: AgentActionType; reason: string | null; urgency: 'normal'|'high'|'critical'; client_type: 'individual'|'corporate'; follow_up_hint: string | null }`).
- Produces: nothing new consumed by later tasks.

- [ ] **Step 1: Write the failing test**

Add to `tests/webhook-route.test.ts`. First add the import near the top (after the existing `import { getAllProjects } from '@/services/projects/gt-api'` line):

```ts
import { createCalendarEvent } from '@/services/google/calendar'
```

Then add this new `describe` block at the end of the file:

```ts
describe('webhook agenda una reunión', () => {
  it('notifica al equipo SIEMPRE que se agenda una reunión, aunque agent_action sea "sell"', async () => {
    db.upsertLead.mockResolvedValue({ ...baseLead, bot_active: true })
    db.getLeadById.mockResolvedValue({ ...baseLead, bot_active: true })
    db.getUnprocessedUserMessages.mockResolvedValue([
      { id: 'c1', lead_id: 'lead-1', role: 'user', content: 'Sí, el viernes a las 3pm por videollamada', wa_message_id: 'wamid.in1', sent_by: null, created_at: '' },
    ])
    vi.mocked(createCalendarEvent).mockResolvedValueOnce({ eventId: 'evt1', htmlLink: 'https://calendar.google.com/evt1' })
    ai.parseClaudeResponse.mockReturnValueOnce({
      reply: 'Perfecto, agendé tu videollamada para el viernes a las 3pm.', stage: 'hot', name_captured: null,
      qualification_data: { purpose: null, budget_ok: null, timeline: null, financing_needed: null, decision_maker: null },
      qualified: false,
      schedule_meeting: { requested: true, datetime_iso: '2026-09-04T15:00:00-06:00', meeting_type: 'videollamada', project_name: 'Portacelli', notes: null },
      opt_out: false,
      agent_action: { type: 'sell', reason: null, urgency: 'normal', client_type: 'individual', follow_up_hint: null },
      deal_summary: null, brain_observations: [], interactive_buttons: [], send_media: null,
    })

    const res = await POST(buildRequest())
    expect(res.status).toBe(200)
    await flush()

    expect(createCalendarEvent).toHaveBeenCalledTimes(1)
    expect(wa.sendInternalNotification).toHaveBeenCalledTimes(1)
    const call = wa.sendInternalNotification.mock.calls[0][0]
    expect(call.leadName).toBe('Carlos')
    expect(call.action.type).toBe('escalate_ceo')
    expect(call.action.reason).toContain('videollamada')
  })

  it('NO deja de notificar si sendInternalNotification falla — el evento de Calendar ya se creó', async () => {
    db.upsertLead.mockResolvedValue({ ...baseLead, bot_active: true })
    db.getLeadById.mockResolvedValue({ ...baseLead, bot_active: true })
    db.getUnprocessedUserMessages.mockResolvedValue([
      { id: 'c1', lead_id: 'lead-1', role: 'user', content: 'El viernes a las 3pm', wa_message_id: 'wamid.in1', sent_by: null, created_at: '' },
    ])
    vi.mocked(createCalendarEvent).mockResolvedValueOnce({ eventId: 'evt1', htmlLink: 'https://calendar.google.com/evt1' })
    wa.sendInternalNotification.mockRejectedValueOnce(new Error('WA down'))
    ai.parseClaudeResponse.mockReturnValueOnce({
      reply: 'Listo, agendado.', stage: 'hot', name_captured: null,
      qualification_data: { purpose: null, budget_ok: null, timeline: null, financing_needed: null, decision_maker: null },
      qualified: false,
      schedule_meeting: { requested: true, datetime_iso: '2026-09-04T15:00:00-06:00', meeting_type: 'llamada', project_name: null, notes: null },
      opt_out: false,
      agent_action: { type: 'sell', reason: null, urgency: 'normal', client_type: 'individual', follow_up_hint: null },
      deal_summary: null, brain_observations: [], interactive_buttons: [], send_media: null,
    })

    const res = await POST(buildRequest())
    expect(res.status).toBe(200)
    await flush()

    // El reply al cliente se manda igual, la notificación fallida no lo bloquea
    expect(wa.sendText).toHaveBeenCalledWith('50312345678', 'Listo, agendado.')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/webhook-route.test.ts -t "agenda una reunión"`
Expected: FAIL — `wa.sendInternalNotification` was not called (current code only notifies for `escalate_ceo`/`consult_team`).

- [ ] **Step 3: Implement the fix**

In `app/api/webhook/whatsapp/route.ts`, replace the block at lines 433-453:

```ts
    // 10. Create Google Calendar event if Daniela scheduled a meeting
    const mtg = claudeResponse.schedule_meeting
    if (mtg?.requested && mtg.datetime_iso) {
      try {
        const event = await createCalendarEvent({
          leadName:    lead.name ?? claudeResponse.name_captured ?? 'Cliente',
          leadPhone:   lead.phone,
          datetimeIso: mtg.datetime_iso,
          meetingType: mtg.meeting_type,
          projectName: mtg.project_name ?? lead.project_interest ?? null,
          notes:       mtg.notes,
        })
        await logActivity({
          actorType: 'bot', action: 'meeting_scheduled', entityType: 'lead', entityId: lead.id,
          details: { type: mtg.meeting_type, project: mtg.project_name, datetime: mtg.datetime_iso },
        })
        console.log(`[processMessage] Calendar event created: ${event.htmlLink}`)
      } catch (err) {
        console.error('[processMessage] Failed to create calendar event:', err instanceof Error ? err.message : err)
      }
    }
```

with:

```ts
    // 10. Create Google Calendar event if Daniela scheduled a meeting
    const mtg = claudeResponse.schedule_meeting
    if (mtg?.requested && mtg.datetime_iso) {
      try {
        const event = await createCalendarEvent({
          leadName:    lead.name ?? claudeResponse.name_captured ?? 'Cliente',
          leadPhone:   lead.phone,
          datetimeIso: mtg.datetime_iso,
          meetingType: mtg.meeting_type,
          projectName: mtg.project_name ?? lead.project_interest ?? null,
          notes:       mtg.notes,
        })
        await logActivity({
          actorType: 'bot', action: 'meeting_scheduled', entityType: 'lead', entityId: lead.id,
          details: { type: mtg.meeting_type, project: mtg.project_name, datetime: mtg.datetime_iso },
        })
        console.log(`[processMessage] Calendar event created: ${event.htmlLink}`)

        // Una reunión agendada SIEMPRE avisa al equipo, sin importar qué
        // agent_action haya elegido el modelo este turno — antes el evento
        // se creaba en Calendar en silencio si el modelo no escalaba también.
        try {
          await sendInternalNotification({
            leadName: lead.name ?? claudeResponse.name_captured ?? 'Cliente',
            leadPhone: lead.phone,
            action: {
              type: 'escalate_ceo',
              reason: `Reunión agendada (${mtg.meeting_type}) — ${mtg.datetime_iso}`,
              urgency: 'high',
              client_type: claudeResponse.agent_action?.client_type ?? 'individual',
              follow_up_hint: null,
            },
            botReply: claudeResponse.reply,
            dealSummary: claudeResponse.deal_summary?.summary ?? null,
          })
        } catch (err) {
          console.error('[processMessage] Failed to notify team of scheduled meeting:', err instanceof Error ? err.message : err)
        }
      } catch (err) {
        console.error('[processMessage] Failed to create calendar event:', err instanceof Error ? err.message : err)
      }
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/webhook-route.test.ts`
Expected: PASS — all tests in the file, including the two new ones.

- [ ] **Step 5: Commit**

```bash
git add app/api/webhook/whatsapp/route.ts tests/webhook-route.test.ts
git commit -m "fix: notificar siempre al equipo cuando Daniela agenda una reunión"
```

---

### Task 2: New hard-close escalation triggers

**Files:**
- Create: `migrations/013_hard_close_triggers.sql`
- Create: `tests/escalation-rules.test.ts`

**Interfaces:**
- Consumes: `matchKeywordRules(message: string, rules: EscalationRule[]): EscalationRule[]` from `@/lib/escalation-rules` (already exists, unchanged signature). `EscalationRule` type from `@/types`: `{ id: string; trigger_type: 'keyword'|'topic'|'condition'; trigger_value: string; description: string | null; action: 'escalate_ceo'|'consult_team'; active: boolean; created_at: string; updated_at: string }`.
- Produces: nothing new consumed by later tasks (Task 3 appends to the same migration file, independently).

- [ ] **Step 1: Write the failing test**

Create `tests/escalation-rules.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { matchKeywordRules } from '@/lib/escalation-rules'
import type { EscalationRule } from '@/types'

function rule(trigger_value: string, overrides: Partial<EscalationRule> = {}): EscalationRule {
  return {
    id: 'r-' + trigger_value,
    trigger_type: 'keyword',
    trigger_value,
    description: null,
    action: 'escalate_ceo',
    active: true,
    created_at: '',
    updated_at: '',
    ...overrides,
  }
}

// Refleja el rule set activo DESPUÉS de la migración 013: sin 'descuento',
// con los disparadores nuevos de dinero y documentos legales.
const activeRules: EscalationRule[] = [
  rule('cuenta bancaria'),
  rule('número de cuenta'),
  rule('transferencia'),
  rule('depósito'),
  rule('promesa de venta'),
  rule('promesa de compraventa'),
  rule('documento de reserva'),
  rule('notario'),
  rule('precio final'),
  rule('escritura'),
  rule('contrato'),
  rule('firma'),
]

describe('matchKeywordRules — disparadores duros de traspaso', () => {
  it('detecta mención de cuenta bancaria o transferencia de dinero', () => {
    const matched = matchKeywordRules('¿A qué cuenta bancaria hago la transferencia?', activeRules)
    const values = matched.map(r => r.trigger_value)
    expect(values).toContain('cuenta bancaria')
    expect(values).toContain('transferencia')
  })

  it('detecta documentos legales de cierre', () => {
    const matched = matchKeywordRules('¿Cuándo firmamos la promesa de compraventa con el notario?', activeRules)
    const values = matched.map(r => r.trigger_value)
    expect(values).toContain('promesa de compraventa')
    expect(values).toContain('notario')
  })

  it('NO dispara con el copy normal de urgencia de Daniela ("se están reservando rápido")', () => {
    expect(matchKeywordRules('Las unidades se están reservando súper rápido esta semana', activeRules)).toEqual([])
  })

  it('"descuento" ya no es un disparador del rule set activo', () => {
    expect(matchKeywordRules('¿Tienen algún descuento por pronto pago?', activeRules)).toEqual([])
  })

  it('sigue detectando los disparadores existentes (precio final, contrato, firma, escritura)', () => {
    const matched = matchKeywordRules('Ya quiero el precio final y firmar el contrato', activeRules)
    const values = matched.map(r => r.trigger_value)
    expect(values).toContain('precio final')
    expect(values).toContain('contrato')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/escalation-rules.test.ts`
Expected: FAIL on the `'descuento'` and false-positive assertions only if `activeRules` above still included `'descuento'`/`'reserva'` — since this fixture is hand-built to represent the POST-migration state, this test actually passes immediately against the unchanged `matchKeywordRules` function (the function itself doesn't change, only the DB data does). Run it anyway to confirm the fixture-based assertions are correct and to catch any typo before moving on.
Expected: PASS (this task doesn't change `lib/escalation-rules.ts` — it only documents/locks in the intended post-migration behavior; Step 3 is the actual DB-side change).

- [ ] **Step 3: Write the migration**

Create `migrations/013_hard_close_triggers.sql`:

```sql
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
```

- [ ] **Step 4: Run the full test file once more**

Run: `npx vitest run tests/escalation-rules.test.ts`
Expected: PASS (unchanged from Step 2 — this confirms the fixture matches the migration's intent).

- [ ] **Step 5: Commit**

```bash
git add migrations/013_hard_close_triggers.sql tests/escalation-rules.test.ts
git commit -m "feat: nuevos disparadores duros de traspaso (dinero, documentos legales) y retiro de 'descuento'"
```

---

### Task 3: Close the bank-account and ambiguous-discount knowledge-base gaps

**Files:**
- Modify: `migrations/013_hard_close_triggers.sql` (append)

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new consumed by later tasks.

- [ ] **Step 1: Append the knowledge-base fixes to the migration**

Append to `migrations/013_hard_close_triggers.sql`:

```sql

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
```

- [ ] **Step 2: Verify the sensitive string isn't reintroduced**

Run: `grep -n "201614849" migrations/013_hard_close_triggers.sql`
Expected: no output — the new migration never repeats the real account number, it only removes it from what Daniela is instructed to say going forward.

- [ ] **Step 3: Commit**

```bash
git add migrations/013_hard_close_triggers.sql
git commit -m "fix: Daniela deja de compartir la cuenta bancaria ella sola; desactiva cifra de prima ambigua"
```

---

### Task 4: Reinforce the escalation boundary in the prompt (defense in depth)

**Files:**
- Modify: `lib/prompt-blocks.ts` (`DEFAULT_PROMPT_BLOCKS.decision_framework`, `.communication_style`, `.price_psychology`)
- Test: `tests/prompt-blocks.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new consumed by later tasks (Task 5 edits different blocks in the same file/array).

- [ ] **Step 1: Write the failing test**

Add to the `describe('buildSystemPrompt con bloques', ...)` block in `tests/prompt-blocks.test.ts`:

```ts
  it('el marco de decisión escala en reunión, dinero y documentos legales; el descuento estándar no escala', () => {
    const prompt = buildSystemPrompt({ lead, project: null })
    expect(prompt).toContain('Se agenda o confirma una reunión')
    expect(prompt).toContain('cuenta bancaria, transferencia')
    expect(prompt).toContain('promesa de venta, promesa de compraventa')
    expect(prompt).toContain('El descuento estándar por pago de contado SÍ es tuyo para compartir')
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/prompt-blocks.test.ts -t "marco de decisión escala"`
Expected: FAIL — none of these phrases exist yet in the default blocks.

- [ ] **Step 3: Update the blocks**

In `lib/prompt-blocks.ts`, inside `DEFAULT_PROMPT_BLOCKS.decision_framework`, replace:

```
  * Pide hablar con el CEO, dueño, director o encargado
  * Dice que tiene otra oferta y necesita respuesta urgente
```

with:

```
  * Pide hablar con el CEO, dueño, director o encargado
  * Dice que tiene otra oferta y necesita respuesta urgente
  * Se agenda o confirma una reunión, visita o llamada (esto además crea el evento en Calendar y notifica al equipo automáticamente — no lo hagas tú de otra forma)
  * El cliente menciona cuenta bancaria, transferencia o cómo enviar el dinero — NUNCA compartas datos de cuenta tú misma, eso lo hace el equipo
  * Se habla de documentos legales de cierre: promesa de venta, promesa de compraventa, escritura, notario, firma
```

In `DEFAULT_PROMPT_BLOCKS.communication_style`, replace:

```
ESCALAMIENTO: Lo que no manejas con certeza (legal, escrituración, modificaciones estructurales, contable) lo ve directamente el equipo de desarrollo — dilo con naturalidad y ofrece agendar la reunión.
```

with:

```
ESCALAMIENTO: Lo que no manejas con certeza (legal, escrituración, modificaciones estructurales, contable), cualquier dato de cuenta bancaria o transferencia, y el momento en que se agenda una reunión, lo ve directamente el equipo — dilo con naturalidad, nunca como un rechazo.
```

In `DEFAULT_PROMPT_BLOCKS.price_psychology`, find the block's closing line and replace it:

```ts
- OBJECIÓN DE PRECIO ("está caro", "en otro lado más barato"): PRIMERO valida la emoción en una frase corta ("Te entiendo, es una inversión importante"), DESPUÉS reencuadra al valor (plusvalía, zona, respaldo, cuota accesible), y cierra ofreciendo alternativa o siguiente paso. NUNCA empieces defendiendo el precio con "aunque..." — se siente a pelea.`,
```

with:

```ts
- OBJECIÓN DE PRECIO ("está caro", "en otro lado más barato"): PRIMERO valida la emoción en una frase corta ("Te entiendo, es una inversión importante"), DESPUÉS reencuadra al valor (plusvalía, zona, respaldo, cuota accesible), y cierra ofreciendo alternativa o siguiente paso. NUNCA empieces defendiendo el precio con "aunque..." — se siente a pelea.
- El descuento estándar por pago de contado SÍ es tuyo para compartir con confianza — no es tema de escalar, es información de venta. Solo escalas si el cliente pide algo FUERA de ese descuento estándar (una condición especial, un monto distinto al publicado).`,
```

Note the closing backtick+comma moves to the end of the new bullet — `price_psychology` is still a single template literal.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/prompt-blocks.test.ts`
Expected: PASS — all tests in the file.

- [ ] **Step 5: Commit**

```bash
git add lib/prompt-blocks.ts tests/prompt-blocks.test.ts
git commit -m "feat: refuerza en el prompt los disparadores de escalamiento y libera el descuento estándar"
```

---

### Task 5: Add the emotional-intelligence and closing-technique prompt blocks

**Files:**
- Modify: `lib/prompt-blocks.ts` (`PROMPT_BLOCK_DEFS`, `DEFAULT_PROMPT_BLOCKS`)
- Modify: `services/claude/prompts.ts:174-191` (the `header` array in `buildSystemPrompt`)
- Test: `tests/prompt-blocks.test.ts`

**Interfaces:**
- Consumes: `PROMPT_BLOCK_DEFS: PromptBlockDef[]`, `DEFAULT_PROMPT_BLOCKS: Record<string, string>` (existing, being extended).
- Produces: two new block keys, `'emotional_intelligence'` and `'closing_techniques'`, now valid members of `PROMPT_BLOCK_KEYS` — later tasks don't depend on this, but the panel's block editor will automatically pick them up (it iterates `PROMPT_BLOCK_DEFS`).

- [ ] **Step 1: Write the failing test**

Add to the `describe('buildSystemPrompt con bloques', ...)` block in `tests/prompt-blocks.test.ts`:

```ts
  it('incluye inteligencia emocional y técnicas de cierre en el prompt ensamblado', () => {
    const prompt = buildSystemPrompt({ lead, project: null })
    expect(prompt).toContain('INTELIGENCIA EMOCIONAL')
    expect(prompt).toContain('ESCEPTICISMO')
    expect(prompt).toContain('TÉCNICAS DE CIERRE')
    expect(prompt).toContain('ALTERNATIVA CERRADA')
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/prompt-blocks.test.ts -t "inteligencia emocional"`
Expected: FAIL — the blocks don't exist yet, so `buildSystemPrompt` output doesn't contain these strings.

- [ ] **Step 3: Register the new blocks**

In `lib/prompt-blocks.ts`, in `PROMPT_BLOCK_DEFS`, insert after the `property_questions` entry and before `decision_framework`:

```ts
  { key: 'emotional_intelligence', title: 'Inteligencia emocional', description: 'Cómo leer señales de duda, escepticismo, prisa, entusiasmo y sensibilidad al precio — y ajustar el tono entre cliente individual y corporativo.' },
  { key: 'closing_techniques', title: 'Técnicas de cierre', description: 'El cierre es el siguiente paso (agendar), nunca el contrato: alternativa cerrada, resumen+compromiso, opciones curadas, ancla de valor.' },
```

In `DEFAULT_PROMPT_BLOCKS`, insert after the `property_questions` entry (before `decision_framework`):

```ts
  emotional_intelligence: `# INTELIGENCIA EMOCIONAL — LEE ANTES DE HABLAR
Antes de decidir qué decir, lee CÓMO lo dice el cliente, no solo QUÉ dice:
- SILENCIO O DUDA ("lo voy a pensar", mensajes cortos y espaciados): dale espacio, no presiones. Un dato de valor sin pedir nada a cambio funciona mejor que insistir.
- ESCEPTICISMO (pregunta lo mismo dos veces, compara con otras opciones, duda del respaldo): responde con prueba social real — unidades vendidas, transparencia del triple blindaje legal, testimonios — nunca a la defensiva.
- PRISA (mensajes cortos, rápidos, sin rodeos): ve al grano, sin adornos, y propón un siguiente paso concreto.
- ENTUSIASMO (emojis, mayúsculas, preguntas de detalle seguidas): aliméntalo, profundiza, y sugiere el siguiente paso mientras el ánimo está alto.
- SENSIBILIDAD AL PRECIO (pregunta por descuentos, compara costos, menciona presupuesto ajustado): habla primero en pago mensual o de entrada, no en precio total.
- LEE SI ES INDIVIDUAL O CORPORATIVO/INSTITUCIONAL por cómo escribe, no solo por lo que dice: con una familia o comprador individual, sé cálida y espontánea, celebra genuinamente cada avance. Con una empresa, fondo o inversionista institucional, sé igual de cálida en el fondo pero más compuesta — menos exclamaciones, más precisión en cifras y proceso de decisión. Nunca fría, nunca acartonada — solo más medida.`,

  closing_techniques: `# TÉCNICAS DE CIERRE — EL SIGUIENTE PASO, NUNCA EL CONTRATO
Tu "cierre" es siempre el siguiente paso correcto — agendar la llamada o visita, o un compromiso verbal de avanzar. El contrato, la escritura y el dinero los ve el equipo (ver ESCALAMIENTO).
- ALTERNATIVA CERRADA: en vez de "¿cuándo te queda bien?", propone dos opciones concretas — "¿te acomoda martes o miércoles para la videollamada con Michael?".
- RESUMEN + COMPROMISO: cuando el cliente ya mostró interés real, resume en una línea lo que ganó con la conversación y proponle el paso siguiente como algo natural, no como una venta.
- OPCIONES, NO BINARIO: cuando aplique, presenta 2-3 opciones curadas en vez de un sí/no — la unidad A vs la B, el modelo ROI anual vs Airbnb, contado vs plan de pagos. Elegir entre opciones mueve más que decidir si avanzar o no.
- ANCLA DE VALOR ANTES QUE DE PRECIO: menciona primero lo que hace valiosa la propiedad (zona, plusvalía, respaldo) y solo después el número — nunca al revés.
- CIERRE SOLO CON SEÑAL DE AVANCE: todo esto aplica cuando el cliente ya dio señal de avanzar. Si pidió tiempo, no propongas nada — eso ya está en tus reglas de estilo de comunicación.`,
```

- [ ] **Step 4: Wire the new blocks into the assembled prompt**

In `services/claude/prompts.ts`, in the `header` array (currently ending with `r('property_questions'),`), add the two new lines right after it:

```ts
  const header = [
    r('identity'),
    [r('personality'), trato].filter(Boolean).join('\n'),
    r('language'),
    r('banned_phrases'),
    r('first_contact'),
    [r('communication_style'), emojiRule].filter(Boolean).join('\n'),
    r('truth_source'),
    r('anti_loop'),
    r('combined_messages'),
    r('format_rules'),
    r('anti_patterns'),
    r('pro_patterns'),
    r('price_types'),
    r('price_psychology'),
    r('investment_guide'),
    r('property_questions'),
    r('emotional_intelligence'),
    r('closing_techniques'),
  ].filter(Boolean).join('\n\n')
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/prompt-blocks.test.ts`
Expected: PASS — including the existing "cada bloque definido tiene texto default y viceversa" test, which now also validates the two new blocks automatically since it iterates `PROMPT_BLOCK_DEFS`/`DEFAULT_PROMPT_BLOCKS` generically.

- [ ] **Step 6: Commit**

```bash
git add lib/prompt-blocks.ts services/claude/prompts.ts tests/prompt-blocks.test.ts
git commit -m "feat: agrega bloques de inteligencia emocional y técnicas de cierre al prompt de Daniela"
```

---

### Task 6: Extend the investment glossary

**Files:**
- Modify: `lib/prompt-blocks.ts` (`DEFAULT_PROMPT_BLOCKS.investment_guide`)
- Test: `tests/prompt-blocks.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new consumed by later tasks.

- [ ] **Step 1: Write the failing test**

Add to the `describe('buildSystemPrompt con bloques', ...)` block in `tests/prompt-blocks.test.ts`:

```ts
  it('incluye un glosario de inversión para hablar con propiedad de retornos y financiamiento', () => {
    const prompt = buildSystemPrompt({ lead, project: null })
    expect(prompt).toContain('Flujo de caja')
    expect(prompt).toContain('Plusvalía:')
    expect(prompt).toContain('Apalancamiento')
    expect(prompt).toContain('Punto de equilibrio')
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/prompt-blocks.test.ts -t "glosario de inversión"`
Expected: FAIL — these terms aren't in `investment_guide` yet.

- [ ] **Step 3: Extend the block**

In `lib/prompt-blocks.ts`, inside `DEFAULT_PROMPT_BLOCKS`, find the `investment_guide` entry and replace its closing line:

```ts
Si NO tiene ROI estimado y el cliente pregunta un porcentaje específico → NO inventes cifras. Di: "Para proyecciones de rentabilidad personalizadas, nuestro equipo financiero prepara un análisis a tu medida. ¿Te genero esa cita?"`,
```

with:

```ts
Si NO tiene ROI estimado y el cliente pregunta un porcentaje específico → NO inventes cifras. Di: "Para proyecciones de rentabilidad personalizadas, nuestro equipo financiero prepara un análisis a tu medida. ¿Te genero esa cita?"

GLOSARIO PARA HABLAR CON INVERSIONISTAS (domínalo, no lo recites de corrido — úsalo cuando el cliente use estos términos o cuando ayude a explicar):
- ROI / retorno: cuánto gana el inversionista sobre lo que puso, normalmente anualizado.
- Flujo de caja: el dinero neto que deja la propiedad cada mes/año después de gastos.
- Plusvalía: cuánto sube el valor de la propiedad con el tiempo, sin que el inversionista haga nada más que esperar.
- Apalancamiento: usar financiamiento para invertir menos capital propio y multiplicar el retorno relativo.
- Financiamiento directo del desarrollador: el plan de pagos que da Grupo Terranova sin pasar por un banco.
- Preventa vs. entrega: preventa = precio más bajo, se paga durante construcción; entrega = el proyecto ya está terminado y listo para usar o rentar.
- Amortización: cómo se reduce una deuda con el tiempo mientras se paga capital e interés.
- Punto de equilibrio: el ingreso mínimo (renta, ocupación) que cubre los gastos de la propiedad sin perder ni ganar.
Úsalos con naturalidad cuando el cliente hable en esos términos — no le expliques la definición si ya demuestra que la conoce, solo respóndele en su mismo nivel.`,
```

Note the closing backtick+comma moves from the first line to the end of the new glossary text — `investment_guide` is still a single template literal.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/prompt-blocks.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/prompt-blocks.ts tests/prompt-blocks.test.ts
git commit -m "feat: agrega glosario de inversión a la guía de modelos de inversión"
```

---

### Task 7: Nightly reflection also learns tone and phrasing

**Files:**
- Modify: `lib/reflection.ts`
- Test: `tests/reflection.test.ts`

**Interfaces:**
- Consumes: `BrainObservation['category']` type from `@/types` (unchanged — still `'pattern'|'observation'|'correction'|'metric'`; the new raw learning category `'tone_pattern'` maps INTO the existing `'pattern'` value, same as `'objection_response'` already does).
- Produces: nothing new consumed by later tasks.

- [ ] **Step 1: Write the failing tests**

Add to `tests/reflection.test.ts`:

```ts
describe('buildReflectionPrompt — incluye tono y fraseo', () => {
  it('pide observaciones de tono, no solo hechos de venta', () => {
    const p = buildReflectionPrompt([{ leadId: 'a', transcript: 'CLIENTE: hola', userMsgs: 2 }], [])
    expect(p).toContain('Tono y fraseo')
    expect(p).toContain('tone_pattern')
  })
})
```

Add to the `describe('toBrainObservations — mapeo al cerebro', ...)` block:

```ts
  it('mapea tone_pattern a pattern', () => {
    const obs = toBrainObservations({
      learnings: [{ category: 'tone_pattern', topic: 'Frase que aterrizó bien', content: '"Fíjate que" generó buena reacción en clientes formales' }],
    })
    expect(obs).toHaveLength(1)
    expect(obs[0].category).toBe('pattern')
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/reflection.test.ts`
Expected: FAIL — `buildReflectionPrompt` doesn't mention "Tono y fraseo" or "tone_pattern" yet, and `toBrainObservations` doesn't recognize `'tone_pattern'` (falls through the filter, returns 0 observations).

- [ ] **Step 3: Implement the changes**

In `lib/reflection.ts`, in `buildReflectionPrompt`, replace:

```
QUÉ BUSCAR (en orden de valor):
1. Objeciones o dudas que se repiten y CÓMO se respondieron (¿funcionó?)
2. Preguntas que Daniela NO supo responder bien (huecos de conocimiento)
3. Frases o enfoques que movieron al cliente a interesarse o agendar
4. Motivos por los que un cliente se enfrió o se fue
5. Patrones del mercado (qué proyectos piden, qué presupuestos mencionan)
```

with:

```
QUÉ BUSCAR (en orden de valor):
1. Objeciones o dudas que se repiten y CÓMO se respondieron (¿funcionó?)
2. Preguntas que Daniela NO supo responder bien (huecos de conocimiento)
3. Frases o enfoques que movieron al cliente a interesarse o agendar
4. Motivos por los que un cliente se enfrió o se fue
5. Patrones del mercado (qué proyectos piden, qué presupuestos mencionan)
6. Tono y fraseo: frases que sonaron naturales y generaron buena reacción, y frases que sonaron forzadas, robóticas o incomodaron al cliente
```

And replace the JSON schema line:

```
Responde SOLO JSON válido:
{"learnings": [{"category": "pattern|objection_response|knowledge_gap|market_signal", "topic": "titulo corto y especifico", "content": "el aprendizaje, concreto y accionable, max 300 caracteres"}]}
```

with:

```
Responde SOLO JSON válido:
{"learnings": [{"category": "pattern|objection_response|knowledge_gap|market_signal|tone_pattern", "topic": "titulo corto y especifico", "content": "el aprendizaje, concreto y accionable, max 300 caracteres"}]}
```

In `toBrainObservations`, in `catMap`, replace:

```ts
  const catMap: Record<string, BrainObservation['category']> = {
    pattern: 'pattern',
    objection_response: 'pattern',
    knowledge_gap: 'observation',
    market_signal: 'metric',
  }
```

with:

```ts
  const catMap: Record<string, BrainObservation['category']> = {
    pattern: 'pattern',
    objection_response: 'pattern',
    knowledge_gap: 'observation',
    market_signal: 'metric',
    tone_pattern: 'pattern',
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/reflection.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/reflection.ts tests/reflection.test.ts
git commit -m "feat: la reflexión nocturna también aprende tono y fraseo, no solo hechos de venta"
```

---

### Task 8: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass (395+ pre-existing plus the ~10 new ones added across Tasks 1, 2, 4, 5, 6, 7).

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors introduced by this plan (the project has 17 pre-existing errors confined to test files per prior audits — confirm the count didn't grow).

- [ ] **Step 3: Read through the assembled prompt once, end to end**

Run: `npx vitest run tests/prompt-blocks.test.ts -t "con defaults"` and separately eyeball the new blocks' text (Tasks 4-6) for tone consistency with the rest of `lib/prompt-blocks.ts` — this is a manual read, not an automated check.

- [ ] **Step 4: Final commit (if Step 3 turned up wording fixes)**

```bash
git add -A
git commit -m "polish: ajustes de tono tras revisión final de Cerebro de Ventas"
```

(Skip this commit entirely if Step 3 found nothing to change.)
