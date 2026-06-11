# Fase 1 — Panel CRM base Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Panel de administración en `/panel` (mismo repo Next.js) con login por roles, inbox en vivo, tags, asignación de leads, pausa del bot y takeover humano por el mismo número de WhatsApp.

**Architecture:** UI en App Router (`app/panel/`), lecturas en vivo vía Supabase Realtime con RLS por rol (anon key + sesión), escrituras exclusivamente por server actions con service role que re-validan rol. El webhook del bot mantiene su contrato; se corrige para guardar mensajes entrantes aunque el bot esté pausado.

**Tech Stack:** Next.js 16.2.6 (App Router, **`proxy.ts`** — middleware fue renombrado en Next 16), React 19, Tailwind 4, Supabase (`@supabase/supabase-js` + `@supabase/ssr`), Vitest.

**Spec:** `docs/superpowers/specs/2026-06-10-panel-crm-fase1-design.md`

**Reglas para el ejecutor:**
- Este Next.js es v16: NO existe `middleware.ts` (es `proxy.ts`); `cookies()` y `headers()` son async (`await`). Ante cualquier duda de API, leer `node_modules/next/dist/docs/`.
- Alias `@/*` apunta a la raíz del repo (tsconfig + vitest.config).
- Tests: `npm run test:run` (vitest, environment node, globals). Tipos: `npx tsc --noEmit`.
- La migración SQL y la configuración de Supabase Dashboard son pasos manuales del usuario — marcarlos como tales, nunca intentar ejecutarlos.

---

### Task 1: Migración SQL 003 — tablas del panel, RLS y realtime

**Files:**
- Create: `migrations/003_panel_crm.sql`

- [ ] **Step 1: Escribir la migración completa**

```sql
-- Panel CRM (Fase 1): equipo, tags, notas, asignación, rol 'human', RLS reales
-- Ejecutar en: Supabase Dashboard → SQL Editor → New Query

-- ── EQUIPO ────────────────────────────────────────────────────────
CREATE TABLE team_members (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  email      TEXT UNIQUE NOT NULL,
  role       TEXT NOT NULL CHECK (role IN ('admin', 'asesor')),
  wa_phone   VARCHAR(20),
  active     BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── TAGS ──────────────────────────────────────────────────────────
CREATE TABLE tags (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT UNIQUE NOT NULL,
  color      TEXT NOT NULL DEFAULT '#6b7280',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE lead_tags (
  lead_id    UUID REFERENCES leads(id) ON DELETE CASCADE,
  tag_id     UUID REFERENCES tags(id) ON DELETE CASCADE,
  source     TEXT NOT NULL DEFAULT 'human' CHECK (source IN ('bot', 'human')),
  created_by UUID REFERENCES team_members(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (lead_id, tag_id)
);

-- ── NOTAS INTERNAS ────────────────────────────────────────────────
CREATE TABLE lead_notes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id    UUID REFERENCES leads(id) ON DELETE CASCADE NOT NULL,
  author     UUID REFERENCES team_members(id) NOT NULL,
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_lead_notes_lead ON lead_notes(lead_id, created_at DESC);

-- ── ASIGNACIÓN ────────────────────────────────────────────────────
ALTER TABLE leads ADD COLUMN assigned_to UUID REFERENCES team_members(id);
CREATE INDEX idx_leads_assigned ON leads(assigned_to);

-- ── MENSAJES HUMANOS ──────────────────────────────────────────────
ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_role_check;
ALTER TABLE conversations ADD CONSTRAINT conversations_role_check
  CHECK (role IN ('user', 'assistant', 'human'));
ALTER TABLE conversations ADD COLUMN sent_by UUID REFERENCES team_members(id);

-- ── HELPERS RLS (SECURITY DEFINER evita recursión en team_members) ─
CREATE OR REPLACE FUNCTION is_active_member() RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM team_members WHERE id = auth.uid() AND active)
$$;

CREATE OR REPLACE FUNCTION is_active_admin() RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM team_members WHERE id = auth.uid() AND active AND role = 'admin')
$$;

-- ── RLS ───────────────────────────────────────────────────────────
-- Las políticas USING(true) eran innecesarias (service role ignora RLS) y riesgosas.
DROP POLICY IF EXISTS "service_role_all_leads" ON leads;
DROP POLICY IF EXISTS "service_role_all_conversations" ON conversations;

ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags         ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_tags    ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_notes   ENABLE ROW LEVEL SECURITY;

CREATE POLICY team_select ON team_members FOR SELECT TO authenticated
  USING (is_active_member());

CREATE POLICY tags_select ON tags FOR SELECT TO authenticated
  USING (is_active_member());

CREATE POLICY leads_select ON leads FOR SELECT TO authenticated
  USING (is_active_admin() OR (is_active_member() AND assigned_to = auth.uid()));

CREATE POLICY conversations_select ON conversations FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM leads l WHERE l.id = conversations.lead_id
      AND (is_active_admin() OR (is_active_member() AND l.assigned_to = auth.uid()))
  ));

CREATE POLICY lead_tags_select ON lead_tags FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM leads l WHERE l.id = lead_tags.lead_id
      AND (is_active_admin() OR (is_active_member() AND l.assigned_to = auth.uid()))
  ));

CREATE POLICY lead_notes_select ON lead_notes FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM leads l WHERE l.id = lead_notes.lead_id
      AND (is_active_admin() OR (is_active_member() AND l.assigned_to = auth.uid()))
  ));
-- Sin políticas INSERT/UPDATE/DELETE para authenticated: toda escritura va por
-- server actions con service role (que ignora RLS).

-- ── REALTIME ──────────────────────────────────────────────────────
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE conversations;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE leads;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
```

- [ ] **Step 2: Commit**

```bash
git add migrations/003_panel_crm.sql
git commit -m "feat(db): migración 003 — equipo, tags, notas, asignación, RLS del panel"
```

**PASO MANUAL DEL USUARIO (documentado aquí, NO lo ejecuta el agente):** pegar `migrations/003_panel_crm.sql` en Supabase Dashboard → SQL Editor y ejecutar. Después, crear el primer admin: Dashboard → Authentication → Users → Add user (email + password), copiar el UUID, y en SQL Editor:

```sql
INSERT INTO team_members (id, name, email, role)
VALUES ('<UUID-del-usuario>', 'Michael Narváez', 'leemichaeln24@gmail.com', 'admin');
```

---

### Task 2: Types + helpers de Supabase extendidos

**Files:**
- Modify: `types/index.ts`
- Modify: `lib/supabase.ts`
- Test: `tests/supabase-helpers.test.ts` (nuevo)

- [ ] **Step 1: Escribir tests que fallan (helpers nuevos)**

Crear `tests/supabase-helpers.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock encadenable genérico de supabase-js
const result: { data: unknown; error: unknown } = { data: null, error: null }
const chain: Record<string, ReturnType<typeof vi.fn>> = {}
const methods = ['from', 'select', 'insert', 'update', 'eq', 'order', 'limit', 'maybeSingle', 'single'] as const
for (const m of methods) {
  chain[m] = vi.fn(() => Object.assign(Promise.resolve(result), chain))
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => chain),
}))

import { saveConversation, getLatestUserMessageAt, getLeadById } from '@/lib/supabase'

beforeEach(() => {
  vi.clearAllMocks()
  result.data = null
  result.error = null
})

describe('saveConversation con rol human', () => {
  it('inserta sent_by y wa_message_id para mensajes humanos', async () => {
    await saveConversation({
      leadId: 'lead-1',
      role: 'human',
      content: 'Hola, soy del equipo',
      waMessageId: 'wamid.h1',
      sentBy: 'member-1',
    })
    expect(chain.insert).toHaveBeenCalledWith({
      lead_id: 'lead-1',
      role: 'human',
      content: 'Hola, soy del equipo',
      wa_message_id: 'wamid.h1',
      sent_by: 'member-1',
    })
  })

  it('inserta sent_by null por defecto', async () => {
    await saveConversation({ leadId: 'lead-1', role: 'assistant', content: 'Hola' })
    expect(chain.insert).toHaveBeenCalledWith({
      lead_id: 'lead-1',
      role: 'assistant',
      content: 'Hola',
      wa_message_id: null,
      sent_by: null,
    })
  })
})

describe('getLatestUserMessageAt', () => {
  it('devuelve el created_at del último mensaje del cliente', async () => {
    result.data = [{ created_at: '2026-06-10T12:00:00Z' }]
    const ts = await getLatestUserMessageAt('lead-1')
    expect(ts).toBe('2026-06-10T12:00:00Z')
    expect(chain.eq).toHaveBeenCalledWith('role', 'user')
  })

  it('devuelve null si el lead nunca escribió', async () => {
    result.data = []
    expect(await getLatestUserMessageAt('lead-1')).toBeNull()
  })
})

describe('getLeadById', () => {
  it('devuelve el lead', async () => {
    result.data = { id: 'lead-1', phone: '503', bot_active: true }
    const lead = await getLeadById('lead-1')
    expect(lead?.id).toBe('lead-1')
  })
})
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npm run test:run -- tests/supabase-helpers.test.ts`
Expected: FAIL — `getLatestUserMessageAt` / `getLeadById` no existen; `saveConversation` no acepta `sentBy`.

- [ ] **Step 3: Extender `types/index.ts`**

Cambios (mantener todo lo existente):

```ts
export type ConversationRole = 'user' | 'assistant' | 'human'
export type TeamRole = 'admin' | 'asesor'

export interface TeamMember {
  id: string
  name: string
  email: string
  role: TeamRole
  wa_phone: string | null
  active: boolean
  created_at: string
}

export interface Tag {
  id: string
  name: string
  color: string
  created_at: string
}

export interface LeadNote {
  id: string
  lead_id: string
  author: string
  content: string
  created_at: string
}
```

En `interface Lead` agregar: `assigned_to: string | null`.
En `interface Conversation` agregar: `sent_by: string | null`.

- [ ] **Step 4: Extender `lib/supabase.ts`**

1. Exportar el cliente de servicio (renombrar el privado y reutilizarlo en todos los helpers del archivo):

```ts
export function getServiceClient() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}
```

(Reemplazar las llamadas internas `getSupabase()` por `getServiceClient()` y borrar `getSupabase`.)

2. `updateLead`: ampliar el Pick a `'stage' | 'name' | 'qualification_data' | 'project_interest' | 'last_message_at' | 'bot_active' | 'assigned_to'`.

3. `saveConversation`: nueva firma e insert:

```ts
export async function saveConversation(params: {
  leadId: string
  role: ConversationRole
  content: string
  waMessageId?: string
  sentBy?: string
}): Promise<void> {
  const supabase = getServiceClient()
  const { error } = await supabase
    .from('conversations')
    .insert({
      lead_id: params.leadId,
      role: params.role,
      content: params.content,
      wa_message_id: params.waMessageId ?? null,
      sent_by: params.sentBy ?? null,
    })
  if (error && !error.message.includes('unique') && !error.code?.includes('23505')) {
    throw new Error(`saveConversation: ${error.message}`)
  }
}
```

(Importar `ConversationRole` desde `@/types`.)

4. Helpers nuevos al final del archivo:

```ts
export async function getLeadById(id: string): Promise<Lead | null> {
  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(`getLeadById: ${error.message}`)
  return (data as Lead) ?? null
}

export async function getLatestUserMessageAt(leadId: string): Promise<string | null> {
  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from('conversations')
    .select('created_at')
    .eq('lead_id', leadId)
    .eq('role', 'user')
    .order('created_at', { ascending: false })
    .limit(1)
  if (error) throw new Error(`getLatestUserMessageAt: ${error.message}`)
  const rows = (data as { created_at: string }[]) ?? []
  return rows[0]?.created_at ?? null
}
```

- [ ] **Step 5: Verificar tests y tipos**

Run: `npm run test:run && npx tsc --noEmit`
Expected: PASS (los 34 existentes + nuevos), 0 errores de tipos.

- [ ] **Step 6: Commit**

```bash
git add types/index.ts lib/supabase.ts tests/supabase-helpers.test.ts
git commit -m "feat: tipos del panel + helpers supabase (rol human, sent_by, lead por id, ventana 24h)"
```

---

### Task 3: Fix del webhook — guardar mensaje entrante aunque el bot esté pausado

**Files:**
- Modify: `app/api/webhook/whatsapp/route.ts`
- Test: `tests/webhook-route.test.ts` (nuevo)

- [ ] **Step 1: Escribir el test que falla**

Crear `tests/webhook-route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createHmac } from 'crypto'

const pending = vi.hoisted(() => ({ promises: [] as Promise<unknown>[] }))

vi.mock('@vercel/functions', () => ({
  waitUntil: (p: Promise<unknown>) => { pending.promises.push(p) },
}))

const db = vi.hoisted(() => ({
  upsertLead: vi.fn(),
  updateLead: vi.fn(async () => {}),
  saveConversation: vi.fn(async () => {}),
  getConversationHistory: vi.fn(async () => []),
  isMessageProcessed: vi.fn(async () => false),
}))
vi.mock('@/lib/supabase', () => db)

const ai = vi.hoisted(() => ({
  callClaude: vi.fn(async () => '{"reply":"¡Hola!"}'),
  parseClaudeResponse: vi.fn(() => ({
    reply: '¡Hola!', stage: 'new', name_captured: null,
    qualification_data: { purpose: null, budget_ok: null, timeline: null, financing_needed: null, decision_maker: null },
    qualified: false, schedule_meeting: null,
  })),
}))
vi.mock('@/services/claude/client', () => ai)

const wa = vi.hoisted(() => ({ sendText: vi.fn(async () => 'wamid.out1') }))
vi.mock('@/services/whatsapp/client', () => wa)

vi.mock('@/services/claude/prompts', () => ({ buildSystemPrompt: vi.fn(() => 'prompt') }))
vi.mock('@/services/claude/intent', () => ({
  classifyIntent: vi.fn(() => 'general'),
  extractLastBotMessage: vi.fn(() => null),
}))
vi.mock('@/services/projects/gt-api', () => ({
  getAllProjects: vi.fn(async () => []),
  detectProjectFromMessage: vi.fn(() => null),
}))
vi.mock('@/services/google/calendar', () => ({ createCalendarEvent: vi.fn() }))
vi.mock('@/lib/knowledge-base', () => ({
  getPlaybook: vi.fn(async () => []),
  formatPlaybookForPrompt: vi.fn(() => null),
}))

import { POST } from '@/app/api/webhook/whatsapp/route'

const SECRET = 'test_secret'
process.env.WA_APP_SECRET = SECRET

function buildRequest(): Request {
  const body = JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [{ changes: [{ value: { messages: [{
      id: 'wamid.in1', from: '50312345678', type: 'text',
      text: { body: 'Sigo interesado' }, timestamp: '1716556800',
    }] } }] }],
  })
  const sig = 'sha256=' + createHmac('sha256', SECRET).update(body).digest('hex')
  return new Request('http://localhost/api/webhook/whatsapp', {
    method: 'POST',
    body,
    headers: { 'x-hub-signature-256': sig },
  })
}

async function flush() {
  await Promise.all(pending.promises)
  pending.promises.length = 0
}

const baseLead = {
  id: 'lead-1', phone: '50312345678', name: 'Carlos', stage: 'warm',
  project_interest: null, qualification_data: null, assigned_to: null,
  first_message_at: '', last_message_at: '', created_at: '',
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('webhook con bot pausado (takeover)', () => {
  it('guarda el mensaje entrante pero NO llama al modelo ni responde', async () => {
    db.upsertLead.mockResolvedValue({ ...baseLead, bot_active: false })
    const res = await POST(buildRequest())
    expect(res.status).toBe(200)
    await flush()

    expect(db.saveConversation).toHaveBeenCalledTimes(1)
    expect(db.saveConversation).toHaveBeenCalledWith(expect.objectContaining({
      leadId: 'lead-1', role: 'user', content: 'Sigo interesado', waMessageId: 'wamid.in1',
    }))
    expect(ai.callClaude).not.toHaveBeenCalled()
    expect(wa.sendText).not.toHaveBeenCalled()
  })
})

```

(El test del flujo con bot activo y `wa_message_id` se agrega en Task 4, que es donde `sendText` empieza a devolver el id.)

- [ ] **Step 2: Correr y verificar que falla**

Run: `npm run test:run -- tests/webhook-route.test.ts`
Expected: FAIL — `saveConversation` nunca se llama con bot pausado (el código actual retorna antes de guardar).

- [ ] **Step 3: Reordenar `processMessage` en `app/api/webhook/whatsapp/route.ts`**

Reemplazar los pasos 3–4 actuales por (guardar SIEMPRE, decidir después):

```ts
    // 3. Upsert lead — create if new, update last_message_at if existing
    const lead = await upsertLead(parsed.from)

    // 4. Save the incoming user message ALWAYS (even during human takeover)
    await saveConversation({
      leadId: lead.id,
      role: 'user',
      content: parsed.body,
      waMessageId: parsed.messageId,
    })

    // 4b. If a human took over, stop here: the message is stored, Daniela stays quiet
    if (!lead.bot_active) {
      console.log(`[processMessage] Bot paused for lead ${lead.id} — message saved, no AI reply`)
      return
    }
```

(Los pasos 12–13 del flujo con bot activo NO se tocan en esta task — se reordenan en Task 4 cuando `sendText` devuelva el id.)

- [ ] **Step 4: Verificar**

Run: `npm run test:run && npx tsc --noEmit`
Expected: PASS completo y 0 errores de tipos.

- [ ] **Step 5: Commit**

```bash
git add app/api/webhook/whatsapp/route.ts tests/webhook-route.test.ts
git commit -m "fix(bot): guardar mensajes entrantes aunque el bot esté pausado (takeover)"
```

---

### Task 4: Cliente WhatsApp — devolver `wa_message_id` y envío sin delay

**Files:**
- Modify: `services/whatsapp/client.ts`
- Test: `tests/whatsapp-client.test.ts` (extender; leer el archivo antes y conservar los tests existentes)

- [ ] **Step 1: Agregar tests al archivo existente**

Añadir al final de `tests/whatsapp-client.test.ts`:

```ts
describe('sendText — wa_message_id y delay', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    process.env.WA_ACCESS_TOKEN = 'token'
    process.env.WA_PHONE_NUMBER_ID = '12345'
  })

  it('devuelve el id del mensaje que responde Meta', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ messages: [{ id: 'wamid.out99' }] }),
      text: async () => '',
    })))
    const id = await sendText('50312345678', 'Hola', { typingDelay: false })
    expect(id).toBe('wamid.out99')
  })

  it('devuelve null si Meta no incluye id', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({}),
      text: async () => '',
    })))
    const id = await sendText('50312345678', 'Hola', { typingDelay: false })
    expect(id).toBeNull()
  })

  it('con typingDelay:false no espera el delay artificial', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ messages: [{ id: 'wamid.x' }] }),
      text: async () => '',
    })))
    const promise = sendText('50312345678', 'mensaje largo de prueba para delay', { typingDelay: false })
    // Sin avanzar timers debe resolver (no hay setTimeout pendiente)
    await expect(promise).resolves.toBe('wamid.x')
    vi.useRealTimers()
  })
})
```

(Importar en la cabecera del archivo si falta: `import { describe, it, expect, vi, beforeEach } from 'vitest'` y `import { sendText, calculateTypingDelay } from '@/services/whatsapp/client'` — respetar imports ya presentes.)

- [ ] **Step 2: Correr y verificar que falla**

Run: `npm run test:run -- tests/whatsapp-client.test.ts`
Expected: FAIL — `sendText` no acepta tercer argumento y devuelve `void`.

- [ ] **Step 3: Implementar en `services/whatsapp/client.ts`**

Reemplazar `postWithRetry` y `sendText`:

```ts
async function postWithRetry(
  body: Record<string, unknown>,
  attempt = 1
): Promise<unknown> {
  try {
    const res = await fetch(messagesUrl(), {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const err = await res.text()
      throw new Error(`WhatsApp API ${res.status}: ${err}`)
    }
    return await res.json()
  } catch (error) {
    if (attempt >= 3) throw error
    await new Promise(r => setTimeout(r, 1000 * attempt))
    return postWithRetry(body, attempt + 1)
  }
}

export async function sendText(
  to: string,
  body: string,
  opts: { typingDelay?: boolean } = {}
): Promise<string | null> {
  if (opts.typingDelay !== false) {
    await new Promise(r => setTimeout(r, calculateTypingDelay(body)))
  }
  const response = await postWithRetry({
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'text',
    text: { body, preview_url: false },
  }) as { messages?: { id?: string }[] } | null
  return response?.messages?.[0]?.id ?? null
}
```

Nota: si los tests existentes de retry asumen que `postWithRetry`/`sendText` no parsean json, ajustar sus mocks de fetch agregando `json: async () => ({})` — conservar la intención de cada test.

- [ ] **Step 4: Test del webhook con bot activo (guarda el id del saliente)**

Añadir a `tests/webhook-route.test.ts` (junto al describe de bot pausado de Task 3):

```ts
describe('webhook con bot activo', () => {
  it('envía primero y guarda la respuesta con su wa_message_id', async () => {
    db.upsertLead.mockResolvedValue({ ...baseLead, bot_active: true })
    const res = await POST(buildRequest())
    expect(res.status).toBe(200)
    await flush()

    expect(ai.callClaude).toHaveBeenCalledTimes(1)
    expect(wa.sendText).toHaveBeenCalledWith('50312345678', '¡Hola!')
    expect(db.saveConversation).toHaveBeenCalledWith(expect.objectContaining({
      leadId: 'lead-1', role: 'assistant', content: '¡Hola!', waMessageId: 'wamid.out1',
    }))
  })
})
```

Run: `npm run test:run -- tests/webhook-route.test.ts`
Expected: FAIL — la respuesta del bot se guarda sin `waMessageId` (el código actual guarda antes de enviar).

- [ ] **Step 5: Reordenar pasos 12–13 del route (enviar → guardar con id)**

En `app/api/webhook/whatsapp/route.ts`, reemplazar los pasos 12–13 actuales:

```ts
    // 12. Send the reply to WhatsApp (first, so we can store its wa_message_id)
    const waMessageId = await sendText(parsed.from, claudeResponse.reply)

    // 13. Save the bot's response
    await saveConversation({
      leadId: lead.id,
      role: 'assistant',
      content: claudeResponse.reply,
      waMessageId: waMessageId ?? undefined,
    })
```

- [ ] **Step 6: Verificar TODO el suite**

Run: `npm run test:run && npx tsc --noEmit`
Expected: PASS completo, 0 errores de tipos.

- [ ] **Step 7: Commit**

```bash
git add services/whatsapp/client.ts tests/whatsapp-client.test.ts app/api/webhook/whatsapp/route.ts tests/webhook-route.test.ts
git commit -m "feat(bot): sendText devuelve wa_message_id, envío sin delay y respuesta guardada con su id"
```

---

### Task 5: `callClaude` — mapear rol `human` a `assistant`

**Files:**
- Modify: `services/claude/client.ts:12-18`
- Test: `tests/claude.test.ts` (extender; conservar lo existente)

- [ ] **Step 1: Agregar test que falla**

Añadir a `tests/claude.test.ts`. ⚠️ `vi.mock` y `vi.hoisted` se declaran a nivel raíz del archivo (no dentro de `describe`), conviviendo con los tests existentes de `parseClaudeResponse`:

```ts
const openaiSpy = vi.hoisted(() => ({
  create: vi.fn(async () => ({ choices: [{ message: { content: '{"reply":"ok"}' } }] })),
}))

vi.mock('openai', () => ({
  default: class {
    chat = { completions: { create: openaiSpy.create } }
  },
}))
```

Y el test:

```ts
describe('callClaude — mensajes humanos en el contexto', () => {
  it('mapea role human a assistant para el API', async () => {
    process.env.OPENAI_API_KEY = 'sk-test'
    const history = [
      { id: '1', lead_id: 'l', role: 'user' as const, content: 'Hola', wa_message_id: null, sent_by: null, created_at: '' },
      { id: '2', lead_id: 'l', role: 'human' as const, content: 'Le atiende Michael', wa_message_id: null, sent_by: 'm1', created_at: '' },
      { id: '3', lead_id: 'l', role: 'assistant' as const, content: 'Con gusto', wa_message_id: null, sent_by: null, created_at: '' },
    ]
    await callClaude('system', history)
    const call = openaiSpy.create.mock.calls[0][0] as { messages: { role: string }[] }
    const roles = call.messages.map(m => m.role)
    expect(roles).toEqual(['system', 'user', 'assistant', 'assistant'])
  })
})
```

(Importar `callClaude` junto al import existente de `parseClaudeResponse`.)

- [ ] **Step 2: Correr y verificar que falla**

Run: `npm run test:run -- tests/claude.test.ts`
Expected: FAIL — roles incluye `'human'` (u OpenAI lanza por rol inválido).

- [ ] **Step 3: Implementar el mapeo**

En `services/claude/client.ts`, reemplazar el map del history:

```ts
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    ...history.map(msg => ({
      // 'human' = mensaje del equipo enviado desde el panel; para el modelo es
      // indistinguible de Daniela (mismo número), así que va como assistant
      role: msg.role === 'user' ? ('user' as const) : ('assistant' as const),
      content: msg.content,
    })),
  ]
```

- [ ] **Step 4: Verificar**

Run: `npm run test:run && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/claude/client.ts tests/claude.test.ts
git commit -m "fix(bot): mensajes del equipo (role human) van como assistant al modelo"
```

---

### Task 6: Infra de auth — `@supabase/ssr`, clientes y `lib/auth.ts`

**Files:**
- Modify: `package.json` (dependencia nueva)
- Create: `lib/supabase-server.ts`, `lib/supabase-browser.ts`, `lib/auth.ts`
- Modify: `.env.example`
- Test: `tests/auth.test.ts` (nuevo)

- [ ] **Step 1: Instalar dependencia**

Run: `npm install @supabase/ssr`
Expected: agrega `@supabase/ssr` a dependencies sin errores.

- [ ] **Step 2: Test que falla para `getSessionMember`**

Crear `tests/auth.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const authState = vi.hoisted(() => ({
  user: null as { id: string } | null,
  member: null as Record<string, unknown> | null,
}))

vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: authState.user } })) },
  })),
}))

vi.mock('@/lib/supabase', () => ({
  getServiceClient: vi.fn(() => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: authState.member }),
        }),
      }),
    }),
  })),
}))

import { getSessionMember, requireMember, requireAdmin } from '@/lib/auth'

beforeEach(() => {
  authState.user = null
  authState.member = null
})

describe('getSessionMember', () => {
  it('null sin sesión', async () => {
    expect(await getSessionMember()).toBeNull()
  })

  it('null si el usuario no está en team_members', async () => {
    authState.user = { id: 'u1' }
    expect(await getSessionMember()).toBeNull()
  })

  it('null si el miembro está inactivo', async () => {
    authState.user = { id: 'u1' }
    authState.member = { id: 'u1', name: 'Ana', email: 'a@a.com', role: 'asesor', active: false }
    expect(await getSessionMember()).toBeNull()
  })

  it('devuelve el miembro activo', async () => {
    authState.user = { id: 'u1' }
    authState.member = { id: 'u1', name: 'Ana', email: 'a@a.com', role: 'asesor', active: true }
    expect(await getSessionMember()).toEqual({ id: 'u1', name: 'Ana', email: 'a@a.com', role: 'asesor' })
  })
})

describe('requireMember / requireAdmin', () => {
  it('requireMember lanza UNAUTHORIZED sin sesión', async () => {
    await expect(requireMember()).rejects.toThrow('UNAUTHORIZED')
  })

  it('requireAdmin lanza FORBIDDEN para asesor', async () => {
    authState.user = { id: 'u1' }
    authState.member = { id: 'u1', name: 'Ana', email: 'a@a.com', role: 'asesor', active: true }
    await expect(requireAdmin()).rejects.toThrow('FORBIDDEN')
  })

  it('requireAdmin devuelve al admin', async () => {
    authState.user = { id: 'u1' }
    authState.member = { id: 'u1', name: 'Michael', email: 'm@m.com', role: 'admin', active: true }
    expect((await requireAdmin()).role).toBe('admin')
  })
})
```

Run: `npm run test:run -- tests/auth.test.ts`
Expected: FAIL — módulos no existen.

- [ ] **Step 3: Crear `lib/supabase-server.ts`**

```ts
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

// Cliente con la SESIÓN del miembro del equipo (anon key + cookies).
// Solo para leer la identidad; los datos se leen con service role en el servidor.
export async function createSupabaseServerClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Llamado desde un Server Component sin response — el proxy refresca la sesión
          }
        },
      },
    }
  )
}
```

- [ ] **Step 4: Crear `lib/supabase-browser.ts`**

```ts
import { createBrowserClient } from '@supabase/ssr'

export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

- [ ] **Step 5: Crear `lib/auth.ts`**

```ts
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { getServiceClient } from '@/lib/supabase'
import type { TeamRole } from '@/types'

export interface SessionMember {
  id: string
  name: string
  email: string
  role: TeamRole
}

export async function getSessionMember(): Promise<SessionMember | null> {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const service = getServiceClient()
  const { data } = await service
    .from('team_members')
    .select('id, name, email, role, active')
    .eq('id', user.id)
    .maybeSingle()

  if (!data || !data.active) return null
  return { id: data.id, name: data.name, email: data.email, role: data.role as TeamRole }
}

export async function requireMember(): Promise<SessionMember> {
  const member = await getSessionMember()
  if (!member) throw new Error('UNAUTHORIZED')
  return member
}

export async function requireAdmin(): Promise<SessionMember> {
  const member = await requireMember()
  if (member.role !== 'admin') throw new Error('FORBIDDEN')
  return member
}
```

- [ ] **Step 6: Actualizar `.env.example`**

Añadir al bloque SUPABASE:

```bash
# Cliente del panel (navegador) — Settings → API → anon public key
NEXT_PUBLIC_SUPABASE_URL=        # mismo valor que SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=   # anon key (público por diseño, protegido por RLS)
# URL pública del panel (para links de invitación)
NEXT_PUBLIC_SITE_URL=            # e.g. https://gt-bot.vercel.app
```

- [ ] **Step 7: Verificar**

Run: `npm run test:run && npx tsc --noEmit`
Expected: PASS. (Nota: `lib/supabase-server.ts` importa `next/headers` — no se importa desde los tests directamente; `lib/auth.ts` se testea con el módulo mockeado.)

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json lib/supabase-server.ts lib/supabase-browser.ts lib/auth.ts .env.example tests/auth.test.ts
git commit -m "feat(panel): infraestructura de auth — @supabase/ssr, clientes y guards de rol"
```

---

### Task 7: `proxy.ts` + página de login + set-password + redirect raíz

**Files:**
- Create: `proxy.ts` (raíz del repo, junto a `app/`)
- Create: `app/panel/login/page.tsx`, `app/panel/set-password/page.tsx`
- Modify: `app/page.tsx`

> En Next 16 el archivo es **`proxy.ts`**, no `middleware.ts`. Hace solo el chequeo optimista de sesión; la validación real (rol + activo) vive en el layout autenticado (Task 10) y en cada server action.

- [ ] **Step 1: Crear `proxy.ts`**

```ts
import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

const PUBLIC_PANEL_PATHS = ['/panel/login', '/panel/set-password']

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  if (PUBLIC_PANEL_PATHS.includes(pathname)) return NextResponse.next()

  let response = NextResponse.next({ request })
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.redirect(new URL('/panel/login', request.url))
  }
  return response
}

export const config = {
  matcher: ['/panel/:path*'],
}
```

- [ ] **Step 2: Crear `app/panel/login/page.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const supabase = createSupabaseBrowserClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError('Correo o contraseña incorrectos')
      setLoading(false)
      return
    }
    router.replace('/panel')
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-2xl bg-zinc-900 p-8 shadow-xl">
        <h1 className="text-xl font-semibold text-white">GT Panel</h1>
        <p className="mt-1 text-sm text-zinc-400">Acceso del equipo</p>
        <label className="mt-6 block text-sm text-zinc-300">
          Correo
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white outline-none focus:border-emerald-500"
          />
        </label>
        <label className="mt-4 block text-sm text-zinc-300">
          Contraseña
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white outline-none focus:border-emerald-500"
          />
        </label>
        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="mt-6 w-full rounded-lg bg-emerald-600 py-2 font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          {loading ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 3: Crear `app/panel/set-password/page.tsx`**

(El link de invitación de Supabase aterriza aquí con la sesión en la URL; el cliente de navegador la detecta solo.)

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'

export default function SetPasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 8) {
      setError('Mínimo 8 caracteres')
      return
    }
    setLoading(true)
    setError(null)
    const supabase = createSupabaseBrowserClient()
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setError('No se pudo guardar. Abre de nuevo el link de invitación.')
      setLoading(false)
      return
    }
    router.replace('/panel')
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-2xl bg-zinc-900 p-8 shadow-xl">
        <h1 className="text-xl font-semibold text-white">Crea tu contraseña</h1>
        <p className="mt-1 text-sm text-zinc-400">Para entrar al panel de GT</p>
        <label className="mt-6 block text-sm text-zinc-300">
          Nueva contraseña
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            minLength={8}
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white outline-none focus:border-emerald-500"
          />
        </label>
        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="mt-6 w-full rounded-lg bg-emerald-600 py-2 font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          {loading ? 'Guardando…' : 'Guardar y entrar'}
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 4: Reemplazar `app/page.tsx` (boilerplate → redirect)**

```tsx
import { redirect } from 'next/navigation'

export default function Home() {
  redirect('/panel')
}
```

- [ ] **Step 5: Verificar build**

Run: `npx tsc --noEmit && npm run build`
Expected: build OK. (`npm run test:run` también debe seguir verde.)

- [ ] **Step 6: Commit**

```bash
git add proxy.ts app/panel/login/page.tsx app/panel/set-password/page.tsx app/page.tsx
git commit -m "feat(panel): proxy de sesión (Next 16), login, set-password y redirect raíz"
```

---

### Task 8: Ventana de 24h (pura) + capa de datos del panel

**Files:**
- Create: `lib/wa-window.ts`, `lib/panel-data.ts`
- Test: `tests/wa-window.test.ts` (nuevo)

- [ ] **Step 1: Test que falla para la ventana de 24h**

Crear `tests/wa-window.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { isWithin24h, WA_WINDOW_MS } from '@/lib/wa-window'

describe('isWithin24h', () => {
  const now = Date.parse('2026-06-10T12:00:00Z')

  it('true si el cliente escribió hace 1 hora', () => {
    expect(isWithin24h('2026-06-10T11:00:00Z', now)).toBe(true)
  })

  it('false si escribió hace 25 horas', () => {
    expect(isWithin24h('2026-06-09T11:00:00Z', now)).toBe(false)
  })

  it('false en el límite exacto de 24h', () => {
    expect(isWithin24h(new Date(now - WA_WINDOW_MS).toISOString(), now)).toBe(false)
  })

  it('false si nunca escribió', () => {
    expect(isWithin24h(null, now)).toBe(false)
  })
})
```

Run: `npm run test:run -- tests/wa-window.test.ts`
Expected: FAIL — módulo no existe.

- [ ] **Step 2: Crear `lib/wa-window.ts`**

```ts
export const WA_WINDOW_MS = 24 * 60 * 60 * 1000

// Meta solo permite texto libre dentro de las 24h posteriores al último
// mensaje del CLIENTE. Fuera de la ventana se requiere plantilla (Fase 5).
export function isWithin24h(lastUserMessageAt: string | null, nowMs = Date.now()): boolean {
  if (!lastUserMessageAt) return false
  const last = Date.parse(lastUserMessageAt)
  if (Number.isNaN(last)) return false
  return nowMs - last < WA_WINDOW_MS
}
```

Run: `npm run test:run -- tests/wa-window.test.ts` → PASS.

- [ ] **Step 3: Crear `lib/panel-data.ts`** (lecturas server-side con service role; el acceso por rol se aplica aquí y se re-aplica en RLS para realtime)

```ts
import { getServiceClient, getLatestUserMessageAt } from '@/lib/supabase'
import { isWithin24h } from '@/lib/wa-window'
import type { SessionMember } from '@/lib/auth'
import type { Conversation, Lead, LeadNote, Tag, TeamMember } from '@/types'

export interface InboxLead {
  lead: Lead
  snippet: string | null
  snippetRole: string | null
  tags: Tag[]
  assignedName: string | null
}

export interface LeadBundle {
  lead: Lead
  messages: Conversation[]
  tags: Tag[]
  allTags: Tag[]
  notes: (LeadNote & { author_name: string })[]
  team: TeamMember[]
  within24h: boolean
}

function leadVisible(member: SessionMember, lead: Lead): boolean {
  return member.role === 'admin' || lead.assigned_to === member.id
}

export async function listInboxLeads(member: SessionMember): Promise<InboxLead[]> {
  const supabase = getServiceClient()

  let query = supabase
    .from('leads')
    .select('*, lead_tags(tag_id, tags(*)), team_members!leads_assigned_to_fkey(name)')
    .order('last_message_at', { ascending: false })
    .limit(100)
  if (member.role !== 'admin') {
    query = query.eq('assigned_to', member.id)
  }
  const { data: leads, error } = await query
  if (error) throw new Error(`listInboxLeads: ${error.message}`)

  const rows = (leads ?? []) as (Lead & {
    lead_tags: { tag_id: string; tags: Tag }[] | null
    team_members: { name: string } | null
  })[]

  const ids = rows.map(l => l.id)
  const snippets = new Map<string, { content: string; role: string }>()
  if (ids.length > 0) {
    const { data: msgs } = await supabase
      .from('conversations')
      .select('lead_id, content, role, created_at')
      .in('lead_id', ids)
      .order('created_at', { ascending: false })
      .limit(500)
    for (const m of (msgs ?? []) as { lead_id: string; content: string; role: string }[]) {
      if (!snippets.has(m.lead_id)) snippets.set(m.lead_id, { content: m.content, role: m.role })
    }
  }

  return rows.map(row => {
    const { lead_tags, team_members, ...lead } = row
    const snip = snippets.get(lead.id)
    return {
      lead: lead as Lead,
      snippet: snip?.content ?? null,
      snippetRole: snip?.role ?? null,
      tags: (lead_tags ?? []).map(lt => lt.tags).filter(Boolean),
      assignedName: team_members?.name ?? null,
    }
  })
}

export async function getLeadBundle(leadId: string, member: SessionMember): Promise<LeadBundle | null> {
  const supabase = getServiceClient()

  const { data: lead, error } = await supabase
    .from('leads')
    .select('*')
    .eq('id', leadId)
    .maybeSingle()
  if (error) throw new Error(`getLeadBundle: ${error.message}`)
  if (!lead || !leadVisible(member, lead as Lead)) return null

  const [msgsRes, tagsRes, allTagsRes, notesRes, teamRes, lastUserAt] = await Promise.all([
    supabase.from('conversations').select('*').eq('lead_id', leadId).order('created_at', { ascending: true }).limit(500),
    supabase.from('lead_tags').select('tags(*)').eq('lead_id', leadId),
    supabase.from('tags').select('*').order('name'),
    supabase.from('lead_notes').select('*, team_members(name)').eq('lead_id', leadId).order('created_at', { ascending: false }),
    supabase.from('team_members').select('*').eq('active', true).order('name'),
    getLatestUserMessageAt(leadId),
  ])

  return {
    lead: lead as Lead,
    messages: (msgsRes.data ?? []) as Conversation[],
    tags: ((tagsRes.data ?? []) as { tags: Tag }[]).map(r => r.tags).filter(Boolean),
    allTags: (allTagsRes.data ?? []) as Tag[],
    notes: ((notesRes.data ?? []) as (LeadNote & { team_members: { name: string } | null })[])
      .map(({ team_members, ...n }) => ({ ...n, author_name: team_members?.name ?? '—' })),
    team: (teamRes.data ?? []) as TeamMember[],
    within24h: isWithin24h(lastUserAt),
  }
}

export async function listAllTags(): Promise<Tag[]> {
  const { data, error } = await getServiceClient().from('tags').select('*').order('name')
  if (error) throw new Error(`listAllTags: ${error.message}`)
  return (data ?? []) as Tag[]
}

export async function listTeam(): Promise<TeamMember[]> {
  const { data, error } = await getServiceClient().from('team_members').select('*').order('name')
  if (error) throw new Error(`listTeam: ${error.message}`)
  return (data ?? []) as TeamMember[]
}
```

Nota sobre el join `team_members!leads_assigned_to_fkey`: si Supabase reporta error de relación ambigua/inexistente en runtime, sustituir por una segunda query a `team_members` con `.in('id', assignedIds)` y mapear el nombre en JS — mantener la misma interfaz `InboxLead`.

- [ ] **Step 4: Verificar tipos y suite**

Run: `npx tsc --noEmit && npm run test:run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/wa-window.ts lib/panel-data.ts tests/wa-window.test.ts
git commit -m "feat(panel): ventana 24h pura + capa de datos del inbox y ficha de lead"
```

---

### Task 9: Server actions con re-validación de rol

**Files:**
- Create: `app/panel/actions.ts`
- Test: `tests/panel-actions.test.ts` (nuevo)

- [ ] **Step 1: Tests que fallan**

Crear `tests/panel-actions.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const state = vi.hoisted(() => ({
  member: null as { id: string; name: string; email: string; role: string } | null,
  lead: null as Record<string, unknown> | null,
  lastUserAt: null as string | null,
}))

vi.mock('@/lib/auth', () => ({
  requireMember: vi.fn(async () => {
    if (!state.member) throw new Error('UNAUTHORIZED')
    return state.member
  }),
  requireAdmin: vi.fn(async () => {
    if (!state.member) throw new Error('UNAUTHORIZED')
    if (state.member.role !== 'admin') throw new Error('FORBIDDEN')
    return state.member
  }),
}))

const db = vi.hoisted(() => ({
  getLeadById: vi.fn(async () => state.lead),
  getLatestUserMessageAt: vi.fn(async () => state.lastUserAt),
  updateLead: vi.fn(async () => {}),
  saveConversation: vi.fn(async () => {}),
  getServiceClient: vi.fn(() => serviceChain),
}))
const serviceChain = {
  from: vi.fn(() => serviceChain),
  insert: vi.fn(async () => ({ error: null })),
  update: vi.fn(() => serviceChain),
  delete: vi.fn(() => serviceChain),
  eq: vi.fn(async () => ({ error: null })),
}
vi.mock('@/lib/supabase', () => db)

const wa = vi.hoisted(() => ({ sendText: vi.fn(async () => 'wamid.h1') }))
vi.mock('@/services/whatsapp/client', () => wa)

vi.mock('next/cache', () => ({ refresh: vi.fn(), revalidatePath: vi.fn() }))

import { sendHumanMessage, assignLead, setBotActive } from '@/app/panel/actions'

const admin = { id: 'adm1', name: 'Michael', email: 'm@gt.com', role: 'admin' }
const asesor = { id: 'ase1', name: 'Ana', email: 'a@gt.com', role: 'asesor' }
const leadOfAna = {
  id: 'lead-1', phone: '50312345678', bot_active: true, assigned_to: 'ase1',
  stage: 'warm', name: 'Carlos',
}

beforeEach(() => {
  vi.clearAllMocks()
  state.member = null
  state.lead = null
  state.lastUserAt = null
})

describe('sendHumanMessage', () => {
  it('rechaza sin sesión', async () => {
    const res = await sendHumanMessage('lead-1', 'hola')
    expect(res).toEqual({ ok: false, error: 'UNAUTHORIZED' })
    expect(wa.sendText).not.toHaveBeenCalled()
  })

  it('rechaza a un asesor sin acceso al lead', async () => {
    state.member = asesor
    state.lead = { ...leadOfAna, assigned_to: 'otro' }
    state.lastUserAt = new Date().toISOString()
    const res = await sendHumanMessage('lead-1', 'hola')
    expect(res).toEqual({ ok: false, error: 'FORBIDDEN' })
    expect(wa.sendText).not.toHaveBeenCalled()
  })

  it('rechaza fuera de la ventana de 24h', async () => {
    state.member = admin
    state.lead = { ...leadOfAna }
    state.lastUserAt = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString()
    const res = await sendHumanMessage('lead-1', 'hola')
    expect(res).toEqual({ ok: false, error: 'WINDOW_EXPIRED' })
    expect(wa.sendText).not.toHaveBeenCalled()
  })

  it('pausa el bot ANTES de enviar, envía sin delay y guarda con sent_by', async () => {
    state.member = admin
    state.lead = { ...leadOfAna, assigned_to: null }
    state.lastUserAt = new Date().toISOString()
    const calls: string[] = []
    db.updateLead.mockImplementation(async () => { calls.push('pause') })
    wa.sendText.mockImplementation(async () => { calls.push('send'); return 'wamid.h1' })

    const res = await sendHumanMessage('lead-1', 'Hola, le atiende Michael')
    expect(res).toEqual({ ok: true })
    expect(calls).toEqual(['pause', 'send'])
    expect(db.updateLead).toHaveBeenCalledWith('lead-1', { bot_active: false, assigned_to: 'adm1' })
    expect(wa.sendText).toHaveBeenCalledWith('50312345678', 'Hola, le atiende Michael', { typingDelay: false })
    expect(db.saveConversation).toHaveBeenCalledWith({
      leadId: 'lead-1', role: 'human', content: 'Hola, le atiende Michael',
      waMessageId: 'wamid.h1', sentBy: 'adm1',
    })
  })

  it('no re-asigna si el lead ya tiene asesor', async () => {
    state.member = admin
    state.lead = { ...leadOfAna, assigned_to: 'ase1' }
    state.lastUserAt = new Date().toISOString()
    await sendHumanMessage('lead-1', 'hola')
    expect(db.updateLead).toHaveBeenCalledWith('lead-1', { bot_active: false })
  })

  it('rechaza texto vacío', async () => {
    state.member = admin
    state.lead = { ...leadOfAna }
    state.lastUserAt = new Date().toISOString()
    const res = await sendHumanMessage('lead-1', '   ')
    expect(res).toEqual({ ok: false, error: 'EMPTY' })
  })
})

describe('assignLead', () => {
  it('solo admin puede asignar', async () => {
    state.member = asesor
    const res = await assignLead('lead-1', 'ase1')
    expect(res).toEqual({ ok: false, error: 'FORBIDDEN' })
  })

  it('admin asigna', async () => {
    state.member = admin
    state.lead = { ...leadOfAna }
    const res = await assignLead('lead-1', 'ase1')
    expect(res).toEqual({ ok: true })
    expect(db.updateLead).toHaveBeenCalledWith('lead-1', { assigned_to: 'ase1' })
  })
})

describe('setBotActive', () => {
  it('asesor con acceso puede reactivar a Daniela', async () => {
    state.member = asesor
    state.lead = { ...leadOfAna, bot_active: false }
    const res = await setBotActive('lead-1', true)
    expect(res).toEqual({ ok: true })
    expect(db.updateLead).toHaveBeenCalledWith('lead-1', { bot_active: true })
  })

  it('asesor sin acceso no puede', async () => {
    state.member = asesor
    state.lead = { ...leadOfAna, assigned_to: 'otro' }
    const res = await setBotActive('lead-1', true)
    expect(res).toEqual({ ok: false, error: 'FORBIDDEN' })
  })
})
```

Run: `npm run test:run -- tests/panel-actions.test.ts`
Expected: FAIL — módulo no existe.

- [ ] **Step 2: Crear `app/panel/actions.ts`**

```ts
'use server'

import { refresh } from 'next/cache'
import { requireAdmin, requireMember, type SessionMember } from '@/lib/auth'
import {
  getLatestUserMessageAt,
  getLeadById,
  getServiceClient,
  saveConversation,
  updateLead,
} from '@/lib/supabase'
import { isWithin24h } from '@/lib/wa-window'
import { sendText } from '@/services/whatsapp/client'
import type { Lead, LeadStage, TeamRole } from '@/types'

export type ActionResult = { ok: true } | { ok: false; error: string }

const STAGES: LeadStage[] = ['new', 'warm', 'hot', 'cold']

function fail(error: unknown, fallback = 'ERROR'): ActionResult {
  const msg = error instanceof Error ? error.message : fallback
  if (msg === 'UNAUTHORIZED' || msg === 'FORBIDDEN') return { ok: false, error: msg }
  console.error('[panel action]', msg)
  return { ok: false, error: fallback }
}

async function getAccessibleLead(member: SessionMember, leadId: string): Promise<Lead> {
  const lead = await getLeadById(leadId)
  if (!lead) throw new Error('NOT_FOUND')
  if (member.role !== 'admin' && lead.assigned_to !== member.id) throw new Error('FORBIDDEN')
  return lead
}

export async function sendHumanMessage(leadId: string, text: string): Promise<ActionResult> {
  try {
    const member = await requireMember()
    const lead = await getAccessibleLead(member, leadId)

    const content = text.trim()
    if (!content) return { ok: false, error: 'EMPTY' }

    const lastUserAt = await getLatestUserMessageAt(leadId)
    if (!isWithin24h(lastUserAt)) return { ok: false, error: 'WINDOW_EXPIRED' }

    // Pausar a Daniela ANTES de enviar: si el cliente contesta al instante,
    // el webhook ya ve bot_active=false y no se pisan bot y humano.
    await updateLead(lead.id, {
      bot_active: false,
      ...(lead.assigned_to ? {} : { assigned_to: member.id }),
    })

    const waMessageId = await sendText(lead.phone, content, { typingDelay: false })
    await saveConversation({
      leadId: lead.id,
      role: 'human',
      content,
      waMessageId: waMessageId ?? undefined,
      sentBy: member.id,
    })

    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error, 'SEND_FAILED')
  }
}

export async function setBotActive(leadId: string, active: boolean): Promise<ActionResult> {
  try {
    const member = await requireMember()
    await getAccessibleLead(member, leadId)
    await updateLead(leadId, { bot_active: active })
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error)
  }
}

export async function updateLeadStage(leadId: string, stage: LeadStage): Promise<ActionResult> {
  try {
    const member = await requireMember()
    await getAccessibleLead(member, leadId)
    if (!STAGES.includes(stage)) return { ok: false, error: 'INVALID_STAGE' }
    await updateLead(leadId, { stage })
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error)
  }
}

export async function assignLead(leadId: string, memberId: string | null): Promise<ActionResult> {
  try {
    await requireAdmin()
    await updateLead(leadId, { assigned_to: memberId })
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error)
  }
}

export async function addLeadTag(leadId: string, tagId: string): Promise<ActionResult> {
  try {
    const member = await requireMember()
    await getAccessibleLead(member, leadId)
    const { error } = await getServiceClient()
      .from('lead_tags')
      .insert({ lead_id: leadId, tag_id: tagId, source: 'human', created_by: member.id })
    if (error && !error.message.includes('duplicate')) throw new Error(error.message)
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error)
  }
}

export async function removeLeadTag(leadId: string, tagId: string): Promise<ActionResult> {
  try {
    const member = await requireMember()
    await getAccessibleLead(member, leadId)
    const service = getServiceClient()
    const { error } = await service.from('lead_tags').delete().eq('lead_id', leadId).eq('tag_id', tagId)
    if (error) throw new Error(error.message)
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error)
  }
}

export async function addNote(leadId: string, content: string): Promise<ActionResult> {
  try {
    const member = await requireMember()
    await getAccessibleLead(member, leadId)
    const trimmed = content.trim()
    if (!trimmed) return { ok: false, error: 'EMPTY' }
    const { error } = await getServiceClient()
      .from('lead_notes')
      .insert({ lead_id: leadId, author: member.id, content: trimmed })
    if (error) throw new Error(error.message)
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error)
  }
}

export async function createTag(name: string, color: string): Promise<ActionResult> {
  try {
    await requireAdmin()
    const trimmed = name.trim()
    if (!trimmed) return { ok: false, error: 'EMPTY' }
    const { error } = await getServiceClient().from('tags').insert({ name: trimmed, color })
    if (error) throw new Error(error.message)
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error)
  }
}

export async function updateTag(tagId: string, name: string, color: string): Promise<ActionResult> {
  try {
    await requireAdmin()
    const trimmed = name.trim()
    if (!trimmed) return { ok: false, error: 'EMPTY' }
    const service = getServiceClient()
    const { error } = await service.from('tags').update({ name: trimmed, color }).eq('id', tagId)
    if (error) throw new Error(error.message)
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error)
  }
}

export async function deleteTag(tagId: string): Promise<ActionResult> {
  try {
    await requireAdmin()
    const service = getServiceClient()
    const { error } = await service.from('tags').delete().eq('id', tagId)
    if (error) throw new Error(error.message)
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error)
  }
}

export async function inviteTeamMember(email: string, name: string, role: TeamRole): Promise<ActionResult> {
  try {
    await requireAdmin()
    const service = getServiceClient()
    const site = process.env.NEXT_PUBLIC_SITE_URL ?? ''
    const { data, error } = await service.auth.admin.inviteUserByEmail(email.trim(), {
      redirectTo: `${site}/panel/set-password`,
    })
    if (error || !data.user) throw new Error(error?.message ?? 'INVITE_FAILED')
    const { error: insertError } = await service
      .from('team_members')
      .insert({ id: data.user.id, name: name.trim(), email: email.trim(), role })
    if (insertError) throw new Error(insertError.message)
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error, 'INVITE_FAILED')
  }
}

export async function setMemberActive(memberId: string, active: boolean): Promise<ActionResult> {
  try {
    const admin = await requireAdmin()
    if (memberId === admin.id) return { ok: false, error: 'CANT_DEACTIVATE_SELF' }
    const { error } = await getServiceClient()
      .from('team_members')
      .update({ active })
      .eq('id', memberId)
    if (error) throw new Error(error.message)
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error)
  }
}
```

- [ ] **Step 3: Verificar**

Run: `npm run test:run && npx tsc --noEmit`
Expected: PASS completo. Si `refresh` de `next/cache` no existe en esta versión, usar `revalidatePath('/panel', 'layout')` en su lugar (verificar en `node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md`) y ajustar el mock del test.

- [ ] **Step 4: Commit**

```bash
git add app/panel/actions.ts tests/panel-actions.test.ts
git commit -m "feat(panel): server actions con re-validación de rol (takeover, tags, asignación, equipo)"
```

---

### Task 10: Layout autenticado + Inbox

**Files:**
- Create: `app/panel/(authed)/layout.tsx`, `app/panel/(authed)/page.tsx`
- Create: `components/panel/InboxList.tsx`, `components/panel/LogoutButton.tsx`, `components/panel/RealtimeRefresher.tsx`

- [ ] **Step 1: Crear `app/panel/(authed)/layout.tsx`** (chequeo REAL de sesión + shell)

```tsx
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSessionMember } from '@/lib/auth'
import { LogoutButton } from '@/components/panel/LogoutButton'

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const member = await getSessionMember()
  if (!member) redirect('/panel/login')

  return (
    <div className="flex min-h-screen flex-col bg-zinc-950 text-zinc-100">
      <header className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
        <div className="flex items-center gap-3">
          <Link href="/panel" className="text-lg font-semibold text-white">GT Panel</Link>
          <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
            {member.role === 'admin' ? 'Admin' : 'Asesor'}
          </span>
        </div>
        <nav className="flex items-center gap-4 text-sm">
          {member.role === 'admin' && (
            <Link href="/panel/config" className="text-zinc-400 hover:text-white">Configuración</Link>
          )}
          <span className="hidden text-zinc-500 sm:inline">{member.name}</span>
          <LogoutButton />
        </nav>
      </header>
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  )
}
```

- [ ] **Step 2: Crear `components/panel/LogoutButton.tsx`**

```tsx
'use client'

import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'

export function LogoutButton() {
  const router = useRouter()
  return (
    <button
      onClick={async () => {
        await createSupabaseBrowserClient().auth.signOut()
        router.replace('/panel/login')
      }}
      className="text-zinc-400 hover:text-white"
    >
      Salir
    </button>
  )
}
```

- [ ] **Step 3: Crear `components/panel/RealtimeRefresher.tsx`** (refresca datos del server al llegar eventos; sonido y badge se completan en Task 14)

```tsx
'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'

export function RealtimeRefresher() {
  const router = useRouter()

  useEffect(() => {
    const supabase = createSupabaseBrowserClient()
    const channel = supabase
      .channel('panel-inbox')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'conversations' }, () => {
        router.refresh()
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'leads' }, () => {
        router.refresh()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [router])

  return null
}
```

- [ ] **Step 4: Crear `app/panel/(authed)/page.tsx`** (inbox, server component)

```tsx
import { getSessionMember } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { listAllTags, listInboxLeads, listTeam } from '@/lib/panel-data'
import { InboxList } from '@/components/panel/InboxList'
import { RealtimeRefresher } from '@/components/panel/RealtimeRefresher'

export default async function InboxPage() {
  const member = await getSessionMember()
  if (!member) redirect('/panel/login')

  const [leads, tags, team] = await Promise.all([
    listInboxLeads(member),
    listAllTags(),
    listTeam(),
  ])

  return (
    <>
      <RealtimeRefresher />
      <InboxList items={leads} tags={tags} team={team} isAdmin={member.role === 'admin'} />
    </>
  )
}
```

- [ ] **Step 5: Crear `components/panel/InboxList.tsx`** (client: filtros + búsqueda + lista)

```tsx
'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import type { InboxLead } from '@/lib/panel-data'
import type { Tag, TeamMember } from '@/types'

const STAGE_STYLES: Record<string, string> = {
  new: 'bg-sky-900 text-sky-300',
  warm: 'bg-amber-900 text-amber-300',
  hot: 'bg-red-900 text-red-300',
  cold: 'bg-zinc-800 text-zinc-400',
}

export function InboxList({ items, tags, team, isAdmin }: {
  items: InboxLead[]
  tags: Tag[]
  team: TeamMember[]
  isAdmin: boolean
}) {
  const [search, setSearch] = useState('')
  const [stage, setStage] = useState('')
  const [tagId, setTagId] = useState('')
  const [assigned, setAssigned] = useState('')
  const [botState, setBotState] = useState('')

  const filtered = useMemo(() => items.filter(({ lead, tags: leadTags }) => {
    const q = search.trim().toLowerCase()
    if (q && !(lead.name ?? '').toLowerCase().includes(q) && !lead.phone.includes(q)) return false
    if (stage && lead.stage !== stage) return false
    if (tagId && !leadTags.some(t => t.id === tagId)) return false
    if (assigned && lead.assigned_to !== assigned) return false
    if (botState === 'on' && !lead.bot_active) return false
    if (botState === 'off' && lead.bot_active) return false
    return true
  }), [items, search, stage, tagId, assigned, botState])

  const selectCls = 'rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-300'

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-3 py-4">
      <div className="flex flex-wrap gap-2">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar nombre o teléfono…"
          className="min-w-40 flex-1 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm text-white outline-none focus:border-emerald-600"
        />
        <select value={stage} onChange={e => setStage(e.target.value)} className={selectCls}>
          <option value="">Etapa</option>
          <option value="new">Nuevo</option>
          <option value="warm">Tibio</option>
          <option value="hot">Caliente</option>
          <option value="cold">Frío</option>
        </select>
        <select value={tagId} onChange={e => setTagId(e.target.value)} className={selectCls}>
          <option value="">Tag</option>
          {tags.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        {isAdmin && (
          <select value={assigned} onChange={e => setAssigned(e.target.value)} className={selectCls}>
            <option value="">Asesor</option>
            {team.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        )}
        <select value={botState} onChange={e => setBotState(e.target.value)} className={selectCls}>
          <option value="">Bot</option>
          <option value="on">Daniela activa</option>
          <option value="off">Pausado</option>
        </select>
      </div>

      <ul className="mt-4 divide-y divide-zinc-900">
        {filtered.map(({ lead, snippet, snippetRole, tags: leadTags, assignedName }) => (
          <li key={lead.id}>
            <Link href={`/panel/chat/${lead.id}`} className="flex flex-col gap-1 rounded-lg px-3 py-3 hover:bg-zinc-900">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-white">{lead.name ?? lead.phone}</span>
                <span className="text-xs text-zinc-500">
                  {new Date(lead.last_message_at).toLocaleString('es-SV', { dateStyle: 'short', timeStyle: 'short' })}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm text-zinc-400">
                  {snippetRole === 'user' ? '' : '↩ '}{snippet ?? 'Sin mensajes'}
                </p>
                {!lead.bot_active && <span title="Daniela pausada">✋</span>}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className={`rounded-full px-2 py-0.5 text-[11px] ${STAGE_STYLES[lead.stage] ?? STAGE_STYLES.cold}`}>
                  {lead.stage}
                </span>
                {leadTags.map(t => (
                  <span key={t.id} className="rounded-full px-2 py-0.5 text-[11px]" style={{ backgroundColor: `${t.color}33`, color: t.color }}>
                    {t.name}
                  </span>
                ))}
                {assignedName && <span className="text-[11px] text-zinc-500">→ {assignedName}</span>}
              </div>
            </Link>
          </li>
        ))}
        {filtered.length === 0 && (
          <li className="py-10 text-center text-sm text-zinc-500">Sin conversaciones que coincidan</li>
        )}
      </ul>
    </div>
  )
}
```

- [ ] **Step 6: Verificar build**

Run: `npx tsc --noEmit && npm run build`
Expected: OK.

- [ ] **Step 7: Commit**

```bash
git add app/panel/\(authed\)/ components/panel/
git commit -m "feat(panel): layout autenticado e inbox en vivo con filtros"
```

---

### Task 11: Vista de chat + compositor + banner de takeover

**Files:**
- Create: `app/panel/(authed)/chat/[leadId]/page.tsx`
- Create: `components/panel/ChatView.tsx`

- [ ] **Step 1: Crear `app/panel/(authed)/chat/[leadId]/page.tsx`**

(En Next 16 `params` es Promise — hay que `await`.)

```tsx
import { notFound, redirect } from 'next/navigation'
import { getSessionMember } from '@/lib/auth'
import { getLeadBundle } from '@/lib/panel-data'
import { ChatView } from '@/components/panel/ChatView'

export default async function ChatPage({ params }: { params: Promise<{ leadId: string }> }) {
  const member = await getSessionMember()
  if (!member) redirect('/panel/login')

  const { leadId } = await params
  const bundle = await getLeadBundle(leadId, member)
  if (!bundle) notFound()

  return <ChatView bundle={bundle} member={member} />
}
```

- [ ] **Step 2: Crear `components/panel/ChatView.tsx`**

```tsx
'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'
import { sendHumanMessage, setBotActive } from '@/app/panel/actions'
import { LeadSheet } from '@/components/panel/LeadSheet'
import type { LeadBundle } from '@/lib/panel-data'
import type { SessionMember } from '@/lib/auth'
import type { Conversation } from '@/types'

const ERROR_TEXT: Record<string, string> = {
  WINDOW_EXPIRED: 'Fuera de la ventana de 24h — se necesita plantilla (Fase 5).',
  SEND_FAILED: 'No se pudo enviar. Revisa la conexión y reintenta.',
  FORBIDDEN: 'No tienes acceso a este chat.',
  UNAUTHORIZED: 'Sesión expirada. Vuelve a entrar.',
  EMPTY: 'Escribe un mensaje.',
}

export function ChatView({ bundle, member }: { bundle: LeadBundle; member: SessionMember }) {
  const router = useRouter()
  const [messages, setMessages] = useState<Conversation[]>(bundle.messages)
  const [botActive, setBotActiveState] = useState(bundle.lead.bot_active)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [showSheet, setShowSheet] = useState(false)
  const [isPending, startTransition] = useTransition()
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  useEffect(() => {
    const supabase = createSupabaseBrowserClient()
    const channel = supabase
      .channel(`chat-${bundle.lead.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'conversations',
        filter: `lead_id=eq.${bundle.lead.id}`,
      }, payload => {
        const msg = payload.new as Conversation
        setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg])
      })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'leads',
        filter: `id=eq.${bundle.lead.id}`,
      }, payload => {
        setBotActiveState((payload.new as { bot_active: boolean }).bot_active)
        router.refresh()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [bundle.lead.id, router])

  function handleSend() {
    const text = draft.trim()
    if (!text || isPending) return
    setError(null)
    startTransition(async () => {
      const res = await sendHumanMessage(bundle.lead.id, text)
      if (!res.ok) {
        setError(ERROR_TEXT[res.error] ?? 'Error inesperado.')
        return
      }
      setDraft('')
      setBotActiveState(false)
    })
  }

  const memberName = (id: string | null) =>
    bundle.team.find(t => t.id === id)?.name ?? 'Equipo'

  return (
    <div className="flex flex-1 overflow-hidden">
      <div className="flex flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2">
          <div className="flex items-center gap-3">
            <Link href="/panel" className="text-zinc-400 hover:text-white">←</Link>
            <div>
              <p className="font-medium text-white">{bundle.lead.name ?? bundle.lead.phone}</p>
              <p className="text-xs text-zinc-500">{bundle.lead.phone}</p>
            </div>
          </div>
          <button onClick={() => setShowSheet(s => !s)} className="text-sm text-zinc-400 hover:text-white lg:hidden">
            Ficha
          </button>
        </div>

        {!botActive && (
          <div className="flex items-center justify-between gap-2 bg-amber-950 px-4 py-2 text-sm text-amber-300">
            <span>✋ Daniela pausada — atiendes tú</span>
            <button
              onClick={() => startTransition(async () => {
                const res = await setBotActive(bundle.lead.id, true)
                if (res.ok) setBotActiveState(true)
              })}
              className="rounded-lg bg-amber-800 px-3 py-1 text-amber-100 hover:bg-amber-700"
            >
              Reactivar a Daniela
            </button>
          </div>
        )}

        <div className="flex-1 space-y-2 overflow-y-auto px-4 py-4">
          {messages.map(m => (
            <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-start' : 'justify-end'}`}>
              <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${
                m.role === 'user' ? 'bg-zinc-800 text-zinc-100' : 'bg-emerald-900 text-emerald-50'
              }`}>
                {m.role !== 'user' && (
                  <p className="mb-0.5 text-[10px] font-medium uppercase tracking-wide opacity-60">
                    {m.role === 'assistant' ? 'Daniela' : memberName(m.sent_by)}
                  </p>
                )}
                {m.content}
                <p className="mt-1 text-right text-[10px] opacity-50">
                  {new Date(m.created_at).toLocaleTimeString('es-SV', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        <div className="border-t border-zinc-800 p-3">
          {!bundle.within24h && (
            <p className="mb-2 rounded-lg bg-zinc-900 px-3 py-2 text-xs text-amber-400">
              Fuera de la ventana de 24h: WhatsApp solo permite plantillas (llega en Fase 5).
            </p>
          )}
          {error && <p className="mb-2 text-sm text-red-400">{error}</p>}
          <div className="flex gap-2">
            <textarea
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
              }}
              rows={1}
              disabled={!bundle.within24h || isPending}
              placeholder={bundle.within24h ? 'Escribe como humano…' : 'Ventana de 24h cerrada'}
              className="flex-1 resize-none rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-600 disabled:opacity-50"
            />
            <button
              onClick={handleSend}
              disabled={!bundle.within24h || isPending || !draft.trim()}
              className="rounded-xl bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-40"
            >
              {isPending ? '…' : 'Enviar'}
            </button>
          </div>
          <p className="mt-1 text-[11px] text-zinc-600">Enviar un mensaje pausa a Daniela automáticamente.</p>
        </div>
      </div>

      <aside className={`${showSheet ? 'block' : 'hidden'} w-full max-w-xs border-l border-zinc-800 lg:block`}>
        <LeadSheet bundle={bundle} member={member} />
      </aside>
    </div>
  )
}
```

- [ ] **Step 3: Stub temporal de `LeadSheet`** (se implementa completo en Task 12; para que el build pase ya)

Crear `components/panel/LeadSheet.tsx`:

```tsx
'use client'

import type { LeadBundle } from '@/lib/panel-data'
import type { SessionMember } from '@/lib/auth'

export function LeadSheet({ bundle }: { bundle: LeadBundle; member: SessionMember }) {
  return (
    <div className="p-4 text-sm text-zinc-400">
      <p className="font-medium text-white">{bundle.lead.name ?? bundle.lead.phone}</p>
    </div>
  )
}
```

- [ ] **Step 4: Verificar build**

Run: `npx tsc --noEmit && npm run build`
Expected: OK.

- [ ] **Step 5: Commit**

```bash
git add app/panel/\(authed\)/chat components/panel/ChatView.tsx components/panel/LeadSheet.tsx
git commit -m "feat(panel): chat en vivo con compositor humano, banner de takeover y ventana 24h"
```

---

### Task 12: Ficha del lead completa (LeadSheet)

**Files:**
- Modify: `components/panel/LeadSheet.tsx` (reemplazar el stub)

- [ ] **Step 1: Implementar la ficha completa**

Reemplazar `components/panel/LeadSheet.tsx`:

```tsx
'use client'

import { useState, useTransition } from 'react'
import {
  addLeadTag, addNote, assignLead, removeLeadTag, updateLeadStage,
} from '@/app/panel/actions'
import type { LeadBundle } from '@/lib/panel-data'
import type { SessionMember } from '@/lib/auth'
import type { LeadStage } from '@/types'

const QUAL_LABELS: Record<string, string> = {
  vivienda_propia: 'Vivienda propia', inversion: 'Inversión', ambos: 'Ambos',
  inmediato: 'Inmediato', '3_meses': '3 meses', '6_meses': '6 meses', explorando: 'Explorando',
}

function fmt(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'boolean') return v ? 'Sí' : 'No'
  return QUAL_LABELS[String(v)] ?? String(v)
}

export function LeadSheet({ bundle, member }: { bundle: LeadBundle; member: SessionMember }) {
  const [isPending, startTransition] = useTransition()
  const [noteDraft, setNoteDraft] = useState('')
  const [tagToAdd, setTagToAdd] = useState('')
  const lead = bundle.lead
  const qual = lead.qualification_data
  const availableTags = bundle.allTags.filter(t => !bundle.tags.some(lt => lt.id === t.id))

  const run = (fn: () => Promise<unknown>) => startTransition(async () => { await fn() })

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4 text-sm">
      <div>
        <p className="text-base font-semibold text-white">{lead.name ?? 'Sin nombre'}</p>
        <p className="text-zinc-500">{lead.phone}</p>
        {lead.project_interest && (
          <p className="mt-1 text-emerald-400">Interés: {lead.project_interest}</p>
        )}
      </div>

      <label className="block text-zinc-400">
        Etapa
        <select
          value={lead.stage}
          disabled={isPending}
          onChange={e => run(() => updateLeadStage(lead.id, e.target.value as LeadStage))}
          className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-white"
        >
          <option value="new">Nuevo</option>
          <option value="warm">Tibio</option>
          <option value="hot">Caliente</option>
          <option value="cold">Frío</option>
        </select>
      </label>

      {member.role === 'admin' && (
        <label className="block text-zinc-400">
          Asesor asignado
          <select
            value={lead.assigned_to ?? ''}
            disabled={isPending}
            onChange={e => run(() => assignLead(lead.id, e.target.value || null))}
            className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-white"
          >
            <option value="">Sin asignar</option>
            {bundle.team.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
      )}

      <div>
        <p className="text-zinc-400">Tags</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {bundle.tags.map(t => (
            <button
              key={t.id}
              disabled={isPending}
              onClick={() => run(() => removeLeadTag(lead.id, t.id))}
              title="Quitar tag"
              className="rounded-full px-2 py-0.5 text-[11px] hover:opacity-70"
              style={{ backgroundColor: `${t.color}33`, color: t.color }}
            >
              {t.name} ✕
            </button>
          ))}
          {bundle.tags.length === 0 && <span className="text-xs text-zinc-600">Sin tags</span>}
        </div>
        {availableTags.length > 0 && (
          <select
            value={tagToAdd}
            disabled={isPending}
            onChange={e => {
              const id = e.target.value
              setTagToAdd('')
              if (id) run(() => addLeadTag(lead.id, id))
            }}
            className="mt-2 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-zinc-300"
          >
            <option value="">+ Agregar tag…</option>
            {availableTags.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}
      </div>

      <div>
        <p className="text-zinc-400">Calificación de Daniela</p>
        <dl className="mt-1.5 space-y-1 rounded-lg bg-zinc-900 p-3 text-xs">
          <div className="flex justify-between"><dt className="text-zinc-500">Propósito</dt><dd className="text-zinc-200">{fmt(qual?.purpose)}</dd></div>
          <div className="flex justify-between"><dt className="text-zinc-500">Presupuesto OK</dt><dd className="text-zinc-200">{fmt(qual?.budget_ok)}</dd></div>
          <div className="flex justify-between"><dt className="text-zinc-500">Timeline</dt><dd className="text-zinc-200">{fmt(qual?.timeline)}</dd></div>
          <div className="flex justify-between"><dt className="text-zinc-500">Financiamiento</dt><dd className="text-zinc-200">{fmt(qual?.financing_needed)}</dd></div>
          <div className="flex justify-between"><dt className="text-zinc-500">Decisor</dt><dd className="text-zinc-200">{fmt(qual?.decision_maker)}</dd></div>
        </dl>
      </div>

      <div className="flex-1">
        <p className="text-zinc-400">Notas internas</p>
        <div className="mt-1.5 space-y-2">
          {bundle.notes.map(n => (
            <div key={n.id} className="rounded-lg bg-zinc-900 p-2.5 text-xs">
              <p className="whitespace-pre-wrap text-zinc-200">{n.content}</p>
              <p className="mt-1 text-[10px] text-zinc-500">
                {n.author_name} · {new Date(n.created_at).toLocaleString('es-SV', { dateStyle: 'short', timeStyle: 'short' })}
              </p>
            </div>
          ))}
          {bundle.notes.length === 0 && <p className="text-xs text-zinc-600">Sin notas</p>}
        </div>
        <form
          className="mt-2 flex gap-2"
          onSubmit={e => {
            e.preventDefault()
            const text = noteDraft.trim()
            if (!text) return
            setNoteDraft('')
            run(() => addNote(lead.id, text))
          }}
        >
          <input
            value={noteDraft}
            onChange={e => setNoteDraft(e.target.value)}
            placeholder="Agregar nota…"
            className="flex-1 rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-xs text-white outline-none focus:border-emerald-600"
          />
          <button type="submit" disabled={isPending || !noteDraft.trim()} className="rounded-lg bg-zinc-800 px-3 text-xs text-zinc-200 hover:bg-zinc-700 disabled:opacity-40">
            +
          </button>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verificar build**

Run: `npx tsc --noEmit && npm run build`
Expected: OK.

- [ ] **Step 3: Commit**

```bash
git add components/panel/LeadSheet.tsx
git commit -m "feat(panel): ficha del lead — etapa, tags, asignación, calificación y notas"
```

---

### Task 13: Configuración (admin) — tags y equipo

**Files:**
- Create: `app/panel/(authed)/config/page.tsx`
- Create: `components/panel/ConfigTags.tsx`, `components/panel/ConfigTeam.tsx`

- [ ] **Step 1: Crear `app/panel/(authed)/config/page.tsx`**

```tsx
import { redirect } from 'next/navigation'
import { getSessionMember } from '@/lib/auth'
import { listAllTags, listTeam } from '@/lib/panel-data'
import { ConfigTags } from '@/components/panel/ConfigTags'
import { ConfigTeam } from '@/components/panel/ConfigTeam'

export default async function ConfigPage() {
  const member = await getSessionMember()
  if (!member) redirect('/panel/login')
  if (member.role !== 'admin') redirect('/panel')

  const [tags, team] = await Promise.all([listAllTags(), listTeam()])

  return (
    <div className="mx-auto w-full max-w-3xl space-y-8 px-4 py-6">
      <h1 className="text-xl font-semibold text-white">Configuración</h1>
      <ConfigTags tags={tags} />
      <ConfigTeam team={team} selfId={member.id} />
    </div>
  )
}
```

- [ ] **Step 2: Crear `components/panel/ConfigTags.tsx`**

```tsx
'use client'

import { useState, useTransition } from 'react'
import { createTag, deleteTag, updateTag } from '@/app/panel/actions'
import type { Tag } from '@/types'

export function ConfigTags({ tags }: { tags: Tag[] }) {
  const [isPending, startTransition] = useTransition()
  const [name, setName] = useState('')
  const [color, setColor] = useState('#10b981')
  const [error, setError] = useState<string | null>(null)

  return (
    <section>
      <h2 className="text-base font-medium text-white">Tags</h2>
      <p className="text-sm text-zinc-500">Para calificar y segmentar leads. Las reglas automáticas llegan en Fase 2.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {tags.map(t => (
          <span key={t.id} className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs" style={{ backgroundColor: `${t.color}33`, color: t.color }}>
            {t.name}
            <input
              type="color"
              defaultValue={t.color}
              disabled={isPending}
              title="Cambiar color"
              onChange={e => {
                const newColor = e.target.value
                startTransition(async () => { await updateTag(t.id, t.name, newColor) })
              }}
              className="h-4 w-4 cursor-pointer rounded-full border-0 bg-transparent p-0"
            />
            <button
              disabled={isPending}
              onClick={() => startTransition(async () => { await deleteTag(t.id) })}
              title="Eliminar tag"
              className="opacity-60 hover:opacity-100"
            >✕</button>
          </span>
        ))}
        {tags.length === 0 && <span className="text-sm text-zinc-600">Aún no hay tags</span>}
      </div>
      <form
        className="mt-3 flex items-center gap-2"
        onSubmit={e => {
          e.preventDefault()
          setError(null)
          const trimmed = name.trim()
          if (!trimmed) return
          startTransition(async () => {
            const res = await createTag(trimmed, color)
            if (!res.ok) { setError('No se pudo crear (¿nombre repetido?)'); return }
            setName('')
          })
        }}
      >
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Nuevo tag (ej. inversionista)"
          className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm text-white outline-none focus:border-emerald-600"
        />
        <input type="color" value={color} onChange={e => setColor(e.target.value)} className="h-8 w-10 cursor-pointer rounded border border-zinc-800 bg-zinc-900" />
        <button type="submit" disabled={isPending || !name.trim()} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm text-white hover:bg-emerald-500 disabled:opacity-40">
          Crear
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
    </section>
  )
}
```

- [ ] **Step 3: Crear `components/panel/ConfigTeam.tsx`**

```tsx
'use client'

import { useState, useTransition } from 'react'
import { inviteTeamMember, setMemberActive } from '@/app/panel/actions'
import type { TeamMember, TeamRole } from '@/types'

export function ConfigTeam({ team, selfId }: { team: TeamMember[]; selfId: string }) {
  const [isPending, startTransition] = useTransition()
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState<TeamRole>('asesor')
  const [msg, setMsg] = useState<string | null>(null)

  return (
    <section>
      <h2 className="text-base font-medium text-white">Equipo</h2>
      <p className="text-sm text-zinc-500">El invitado recibe un correo para crear su contraseña.</p>
      <ul className="mt-3 divide-y divide-zinc-900 rounded-lg border border-zinc-900">
        {team.map(m => (
          <li key={m.id} className="flex items-center justify-between px-3 py-2.5 text-sm">
            <div>
              <p className={m.active ? 'text-white' : 'text-zinc-600 line-through'}>{m.name}</p>
              <p className="text-xs text-zinc-500">{m.email} · {m.role === 'admin' ? 'Admin' : 'Asesor'}</p>
            </div>
            {m.id !== selfId && (
              <button
                disabled={isPending}
                onClick={() => startTransition(async () => { await setMemberActive(m.id, !m.active) })}
                className="rounded-lg bg-zinc-800 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-700"
              >
                {m.active ? 'Desactivar' : 'Reactivar'}
              </button>
            )}
          </li>
        ))}
      </ul>
      <form
        className="mt-3 flex flex-wrap items-center gap-2"
        onSubmit={e => {
          e.preventDefault()
          setMsg(null)
          startTransition(async () => {
            const res = await inviteTeamMember(email, name, role)
            setMsg(res.ok ? 'Invitación enviada ✓' : 'No se pudo invitar (¿correo ya registrado?)')
            if (res.ok) { setEmail(''); setName('') }
          })
        }}
      >
        <input value={name} onChange={e => setName(e.target.value)} required placeholder="Nombre" className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm text-white outline-none focus:border-emerald-600" />
        <input value={email} onChange={e => setEmail(e.target.value)} required type="email" placeholder="correo@equipo.com" className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm text-white outline-none focus:border-emerald-600" />
        <select value={role} onChange={e => setRole(e.target.value as TeamRole)} className="rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-300">
          <option value="asesor">Asesor</option>
          <option value="admin">Admin</option>
        </select>
        <button type="submit" disabled={isPending} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm text-white hover:bg-emerald-500 disabled:opacity-40">
          Invitar
        </button>
      </form>
      {msg && <p className="mt-2 text-sm text-zinc-400">{msg}</p>}
    </section>
  )
}
```

- [ ] **Step 4: Verificar build**

Run: `npx tsc --noEmit && npm run build`
Expected: OK.

- [ ] **Step 5: Commit**

```bash
git add app/panel/\(authed\)/config components/panel/ConfigTags.tsx components/panel/ConfigTeam.tsx
git commit -m "feat(panel): configuración admin — taxonomía de tags e invitaciones del equipo"
```

---

### Task 14: UX de realtime — sonido, badge de título y reconexión

**Files:**
- Modify: `components/panel/RealtimeRefresher.tsx`

- [ ] **Step 1: Reemplazar `RealtimeRefresher` con la versión completa**

```tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'
import type { Conversation } from '@/types'

// Beep corto generado con Web Audio (sin archivos)
function playBeep() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new Ctx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = 880
    gain.gain.setValueAtTime(0.08, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25)
    osc.start()
    osc.stop(ctx.currentTime + 0.25)
  } catch {
    // Autoplay bloqueado hasta la primera interacción — silencio aceptable
  }
}

export function RealtimeRefresher() {
  const router = useRouter()
  const [disconnected, setDisconnected] = useState(false)
  const unreadRef = useRef(0)
  const baseTitleRef = useRef('')

  useEffect(() => {
    baseTitleRef.current = document.title

    const onFocus = () => {
      unreadRef.current = 0
      document.title = baseTitleRef.current
    }
    window.addEventListener('focus', onFocus)

    const supabase = createSupabaseBrowserClient()
    const channel = supabase
      .channel('panel-inbox')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'conversations' }, payload => {
        const msg = payload.new as Conversation
        if (msg.role === 'user') {
          playBeep()
          if (!document.hasFocus()) {
            unreadRef.current += 1
            document.title = `(${unreadRef.current}) ${baseTitleRef.current}`
          }
        }
        router.refresh()
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'leads' }, () => {
        router.refresh()
      })
      .subscribe(status => {
        if (status === 'SUBSCRIBED') {
          setDisconnected(false)
          // Al reconectar pueden haberse perdido eventos: recargar del server
          router.refresh()
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setDisconnected(true)
        }
      })

    return () => {
      window.removeEventListener('focus', onFocus)
      supabase.removeChannel(channel)
    }
  }, [router])

  if (!disconnected) return null
  return (
    <div className="bg-red-950 px-4 py-1.5 text-center text-xs text-red-300">
      Reconectando con el servidor…
    </div>
  )
}
```

- [ ] **Step 2: Verificar build**

Run: `npx tsc --noEmit && npm run build`
Expected: OK.

- [ ] **Step 3: Commit**

```bash
git add components/panel/RealtimeRefresher.tsx
git commit -m "feat(panel): sonido de mensaje nuevo, badge en título y aviso de reconexión"
```

---

### Task 15: Documentación, suite completa y checklist de verificación manual

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Suite completa y build**

Run: `npm run test:run && npx tsc --noEmit && npm run build`
Expected: TODO verde. Si algo falla, arreglarlo antes de seguir.

- [ ] **Step 2: Actualizar README**

En la tabla "Estructura del código" agregar:

```markdown
| `proxy.ts` | Protege /panel/* — chequeo optimista de sesión (Next 16: ex-middleware) |
| `app/panel/` | Panel CRM: login, inbox, chat con takeover, ficha de lead, config |
| `app/panel/actions.ts` | Server actions del panel (re-validan rol en servidor) |
| `lib/auth.ts` | Sesión del equipo + guards admin/asesor |
| `lib/panel-data.ts` | Lecturas del panel (inbox, ficha) con service role |
| `lib/wa-window.ts` | Regla de ventana de 24h de WhatsApp |
| `migrations/003_panel_crm.sql` | Equipo, tags, notas, asignación, RLS del panel |
```

Y en el Roadmap, marcar la fila "E — Dashboard Next.js CRM" como `✅ Fase 1 (panel base)`.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: README — estructura y estado del panel CRM Fase 1"
```

- [ ] **Step 4: CHECKLIST MANUAL DEL USUARIO** (el agente lo presenta al final; no lo ejecuta)

1. Ejecutar `migrations/003_panel_crm.sql` en Supabase → SQL Editor.
2. Crear el primer admin (Auth → Add user + INSERT en `team_members`, SQL en Task 1).
3. Agregar a `.env.local` y a Vercel: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL`.
4. Supabase → Authentication → URL Configuration: agregar `https://<tu-app>.vercel.app/panel/set-password` a Redirect URLs (para invitaciones).
5. `npm run dev` → entrar a `/panel/login` con el admin → verificar inbox con leads reales.
6. Probar takeover: enviar mensaje desde el panel a un chat de prueba → llega por WhatsApp, Daniela queda pausada, el banner aparece.
7. Escribir desde el WhatsApp del cliente de prueba → el mensaje aparece en el panel en vivo (y se guardó pese al bot pausado).
8. "Reactivar a Daniela" → el bot vuelve a responder con contexto.
9. Crear un asesor de prueba (Config → Invitar), asignarle un lead, y verificar con su sesión que SOLO ve ese lead (prueba de RLS + realtime con rol asesor — riesgo señalado en el spec).
10. Deploy: `vercel --prod` y repetir prueba 6–7 en producción.

---

## Cobertura spec → tasks (referencia del ejecutor)

| Spec | Task |
|---|---|
| §4 Migración + RLS | 1 |
| §2/§4 tipos, sent_by, helpers | 2 |
| §6 fix webhook (guardar con bot pausado) | 3 |
| §4 wa_message_id saliente, §6 envío sin delay | 4 |
| §6 contexto del modelo con mensajes human | 5 |
| §3 auth, env vars | 6 |
| §3/§9 proxy + login + invitación set-password, redirect raíz | 7 |
| §6 ventana 24h, §5 datos de inbox/ficha | 8 |
| §7 server actions + §9 re-validación + §10 tests autorización | 9 |
| §5 inbox + realtime | 10 |
| §5/§6 chat, compositor, banner takeover | 11 |
| §5 ficha del lead | 12 |
| §5 config admin (tags, equipo) | 13 |
| §8 reconexión, notificación sonido/badge | 14 |
| §10/§11 verificación total + checklist manual (incl. prueba RLS realtime) | 15 |
