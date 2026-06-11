# Fase 2b — Motor proactivo (recontactos + radar) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Daniela recontacta leads según reglas de cadencia y detecta inventario nuevo del ecosistema, todo bajo una cola de aprobación admin con plantillas de Meta, costo estimado, opt-out automático y cron diario.

**Architecture:** Lógica pura en `lib/proactive/` (elegibilidad, render de variables, matching) + capa de datos service-role (`data.ts`) + orquestador (`engine.ts`) con inyección de dependencias para tests. Un cron diario de Vercel crea campañas `pending_approval`; un admin las aprueba en `/panel/campanas` y el envío usa `sendTemplate` (Graph API). Cada envío queda en `conversations` como assistant (Daniela tiene el contexto) y actualiza `last_proactive_at`.

**Tech Stack:** Next.js 16, Supabase (migración 004 + RLS admin), WhatsApp Cloud API templates, Vercel Cron, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-11-fase2-ui-y-motor-proactivo-design.md` §4–9.

**Reglas para el ejecutor:**
- Repo: `/Users/michaelnarvaez/Documents/CLAUDE/BOT ESPECIAL/gt-bot` (path con ESPACIOS — siempre entre comillas).
- Antes de la Task 1: `git checkout -b feature/fase2b-motor` desde `main`. Commitear ahí; NO pushear.
- Baseline: 149 tests verdes, tsc limpio, build verde. Cada task termina verde.
- READ cada archivo antes de modificarlo (hay historia de fixes). `services/claude/prompts.ts` fue modificado por el usuario — integrar con cuidado quirúrgico.
- La migración 004 y los pasos de Vercel/Meta son MANUALES del usuario — nunca ejecutarlos.
- Decisión documentada (deviación menor del spec §4.6): `approveCampaign` envía con `await` inline (no `waitUntil`) — el resultado queda visible al volver la action; `/panel/campanas` exporta `maxDuration = 60` y los topes (`max_per_run` ≤ 50) mantienen el envío < 30s.
- Fallback de `{{1}}` sin nombre: `'qué gusto saludarte'` (gramática correcta en "Hola {{1}} 👋"). El spec §4.5 se sincroniza en la Task 10.
- Deviación documentada (spec §4.6): las plantillas NO tienen hard-delete — `campaigns.template_id` y `recontact_rules.template_id` las referencian con FK NOT NULL, así que borrarlas rompería el historial. `setTemplateActive(false)` ES el borrado lógico. Las reglas sí se borran (su FK en campaigns es `ON DELETE SET NULL`).

---

### Task 1: Migración SQL 004 — motor proactivo

**Files:**
- Create: `migrations/004_proactive.sql`

- [ ] **Step 1: Crear el archivo con exactamente:**

```sql
-- Motor proactivo (Fase 2b): plantillas, reglas, campañas, radar, opt-out
-- Ejecutar en: Supabase Dashboard → SQL Editor → New Query

-- ── PLANTILLAS (espejo de las aprobadas en Meta) ──────────────────
CREATE TABLE message_templates (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT UNIQUE NOT NULL,
  language     TEXT NOT NULL DEFAULT 'es',
  category     TEXT NOT NULL CHECK (category IN ('MARKETING', 'UTILITY')),
  body_preview TEXT NOT NULL,
  variables    INT NOT NULL DEFAULT 0 CHECK (variables BETWEEN 0 AND 2),
  active       BOOLEAN DEFAULT true,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ── REGLAS DE CADENCIA ────────────────────────────────────────────
CREATE TABLE recontact_rules (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  active        BOOLEAN DEFAULT true,
  stages        TEXT[] DEFAULT NULL,
  tag_ids       UUID[] DEFAULT NULL,
  days_inactive INT NOT NULL CHECK (days_inactive >= 1),
  template_id   UUID REFERENCES message_templates(id) NOT NULL,
  max_per_run   INT NOT NULL DEFAULT 20 CHECK (max_per_run BETWEEN 1 AND 50),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── CAMPAÑAS Y DESTINATARIOS ──────────────────────────────────────
CREATE TABLE campaigns (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind         TEXT NOT NULL CHECK (kind IN ('recontact', 'opportunity')),
  status       TEXT NOT NULL DEFAULT 'pending_approval'
               CHECK (status IN ('pending_approval','sending','done','rejected')),
  title        TEXT NOT NULL,
  reason       TEXT,
  rule_id      UUID REFERENCES recontact_rules(id) ON DELETE SET NULL,
  listing_slug TEXT,
  template_id  UUID REFERENCES message_templates(id) NOT NULL,
  approved_by  UUID REFERENCES team_members(id),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  approved_at  TIMESTAMPTZ
);
CREATE INDEX idx_campaigns_status ON campaigns(status, created_at DESC);

CREATE TABLE campaign_recipients (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id   UUID REFERENCES campaigns(id) ON DELETE CASCADE NOT NULL,
  lead_id       UUID REFERENCES leads(id) ON DELETE CASCADE NOT NULL,
  included      BOOLEAN DEFAULT true,
  variables     JSONB NOT NULL DEFAULT '[]',
  match_reason  TEXT,
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','sent','failed','skipped')),
  wa_message_id TEXT,
  error         TEXT,
  sent_at       TIMESTAMPTZ,
  UNIQUE (campaign_id, lead_id)
);
CREATE INDEX idx_recipients_campaign ON campaign_recipients(campaign_id);

-- ── CONTROL POR LEAD ──────────────────────────────────────────────
ALTER TABLE leads ADD COLUMN opted_out BOOLEAN DEFAULT false;
ALTER TABLE leads ADD COLUMN last_proactive_at TIMESTAMPTZ;

-- ── RADAR ─────────────────────────────────────────────────────────
CREATE TABLE known_listings (
  slug        TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  entity_type TEXT,
  first_seen  TIMESTAMPTZ DEFAULT NOW(),
  snapshot    JSONB
);

-- ── RLS: SELECT solo admin (escrituras únicamente por service role) ─
ALTER TABLE message_templates   ENABLE ROW LEVEL SECURITY;
ALTER TABLE recontact_rules     ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns           ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE known_listings      ENABLE ROW LEVEL SECURITY;

CREATE POLICY templates_select  ON message_templates   FOR SELECT TO authenticated USING (is_active_admin());
CREATE POLICY rules_select      ON recontact_rules     FOR SELECT TO authenticated USING (is_active_admin());
CREATE POLICY campaigns_select  ON campaigns           FOR SELECT TO authenticated USING (is_active_admin());
CREATE POLICY recipients_select ON campaign_recipients FOR SELECT TO authenticated USING (is_active_admin());
CREATE POLICY listings_select   ON known_listings      FOR SELECT TO authenticated USING (is_active_admin());
```

- [ ] **Step 2: Commit**

```bash
git add migrations/004_proactive.sql
git commit -m "feat(db): migración 004 — plantillas, reglas, campañas, radar, opt-out"
```

**PASO MANUAL DEL USUARIO (documentado, NO ejecutar):** correr en Supabase SQL Editor ANTES de desplegar 2b.

---

### Task 2: Types + `sendTemplate` + costo (TDD)

**Files:**
- Modify: `types/index.ts`, `lib/supabase.ts`, `services/whatsapp/client.ts`, `.env.example`
- Modify: `tests/intent.test.ts`, `tests/prompts.test.ts` (fixtures de Lead ganan los 2 campos)
- Create: `lib/proactive/cost.ts`
- Test: `tests/whatsapp-client.test.ts` (extender)

- [ ] **Step 1: Test que falla — añadir a `tests/whatsapp-client.test.ts` (dentro de un describe nuevo al final; respetar el afterEach existente del describe de sendText):**

```ts
describe('sendTemplate', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    process.env.WA_ACCESS_TOKEN = 'token'
    process.env.WA_PHONE_NUMBER_ID = '12345'
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('envía el payload de plantilla correcto y devuelve el id', async () => {
    const calls: unknown[] = []
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: { body: string }) => {
      calls.push(JSON.parse(init.body))
      return { ok: true, json: async () => ({ messages: [{ id: 'wamid.t1' }] }), text: async () => '' }
    }))
    const id = await sendTemplate('50312345678', 'recontacto_seguimiento', 'es', ['Carlos', 'Portacelli'])
    expect(id).toBe('wamid.t1')
    expect(calls[0]).toEqual({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: '50312345678',
      type: 'template',
      template: {
        name: 'recontacto_seguimiento',
        language: { code: 'es' },
        components: [{
          type: 'body',
          parameters: [
            { type: 'text', text: 'Carlos' },
            { type: 'text', text: 'Portacelli' },
          ],
        }],
      },
    })
  })

  it('sin variables omite components', async () => {
    const calls: unknown[] = []
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: { body: string }) => {
      calls.push(JSON.parse(init.body))
      return { ok: true, json: async () => ({ messages: [{ id: 'wamid.t2' }] }), text: async () => '' }
    }))
    await sendTemplate('503', 'hola_simple', 'es', [])
    expect((calls[0] as { template: { components?: unknown } }).template.components).toBeUndefined()
  })
})
```

(Importar `sendTemplate` junto a `sendText` en la cabecera.)

Run: `npm run test:run -- tests/whatsapp-client.test.ts` → FAIL (sendTemplate no existe).

- [ ] **Step 2: Implementar en `services/whatsapp/client.ts` (al final):**

```ts
// Mensajes de plantilla (fuera de la ventana de 24h). Sin typing delay:
// son envíos programados/aprobados, no conversación en vivo.
export async function sendTemplate(
  to: string,
  templateName: string,
  language: string,
  bodyParams: string[]
): Promise<string | null> {
  const template: Record<string, unknown> = {
    name: templateName,
    language: { code: language },
  }
  if (bodyParams.length > 0) {
    template.components = [{
      type: 'body',
      parameters: bodyParams.map(text => ({ type: 'text', text })),
    }]
  }
  const response = await postWithRetry({
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'template',
    template,
  }) as { messages?: { id?: string }[] } | null
  return response?.messages?.[0]?.id ?? null
}
```

- [ ] **Step 3: Types — en `types/index.ts` añadir (y extender lo existente):**

En `interface Lead` añadir: `opted_out: boolean` y `last_proactive_at: string | null`.
En `interface ClaudeResponse` añadir: `opt_out: boolean`.
Al final del archivo:

```ts
export type TemplateCategory = 'MARKETING' | 'UTILITY'
export type CampaignKind = 'recontact' | 'opportunity'
export type CampaignStatus = 'pending_approval' | 'sending' | 'done' | 'rejected'
export type RecipientStatus = 'pending' | 'sent' | 'failed' | 'skipped'

export interface MessageTemplate {
  id: string
  name: string
  language: string
  category: TemplateCategory
  body_preview: string
  variables: number
  active: boolean
  created_at: string
}

export interface RecontactRule {
  id: string
  name: string
  active: boolean
  stages: LeadStage[] | null
  tag_ids: string[] | null
  days_inactive: number
  template_id: string
  max_per_run: number
  created_at: string
}

export interface Campaign {
  id: string
  kind: CampaignKind
  status: CampaignStatus
  title: string
  reason: string | null
  rule_id: string | null
  listing_slug: string | null
  template_id: string
  approved_by: string | null
  created_at: string
  approved_at: string | null
}

export interface CampaignRecipient {
  id: string
  campaign_id: string
  lead_id: string
  included: boolean
  variables: string[]
  match_reason: string | null
  status: RecipientStatus
  wa_message_id: string | null
  error: string | null
  sent_at: string | null
}
```

- [ ] **Step 4: `lib/supabase.ts` — ampliar el Pick de `updateLead`** a incluir `'opted_out' | 'last_proactive_at'` (queda: stage|name|qualification_data|project_interest|last_message_at|bot_active|assigned_to|opted_out|last_proactive_at).

- [ ] **Step 5: Crear `lib/proactive/cost.ts`:**

```ts
// Costo estimado por mensaje de plantilla (USD). Solo informativo en el panel;
// la tarifa real la define Meta por país/categoría.
export const COST_PER_TEMPLATE_USD = Number(process.env.COST_PER_TEMPLATE_USD ?? 0.06)
```

- [ ] **Step 6: Fixtures — `tests/intent.test.ts` y `tests/prompts.test.ts` tienen literales tipados `Lead`: añadirles `opted_out: false, last_proactive_at: null,`. (READ primero; son los mismos literales que ya ganaron `assigned_to` en Fase 1.)**

- [ ] **Step 7: `.env.example` — añadir al final:**

```bash
# ── MOTOR PROACTIVO ───────────────────────────────────
CRON_SECRET=                  # string largo inventado; Vercel lo manda como Bearer en sus crons
COST_PER_TEMPLATE_USD=        # opcional; default 0.06 (informativo en el panel)
```

- [ ] **Step 8: Verificar** — `npm run test:run && npx tsc --noEmit` → 151 tests (149+2), 0 errores. (Si otros fixtures de Lead rompen tsc, añadirles los 2 campos — reportar cuáles.)

- [ ] **Step 9: Commit**

```bash
git add types/index.ts lib/supabase.ts services/whatsapp/client.ts lib/proactive/cost.ts .env.example tests/whatsapp-client.test.ts tests/intent.test.ts tests/prompts.test.ts
git commit -m "feat(proactive): tipos del motor, sendTemplate y costo estimado"
```

---

### Task 3: Módulos puros — elegibilidad, render, matching (TDD)

**Files:**
- Create: `lib/proactive/eligibility.ts`, `lib/proactive/render.ts`, `lib/proactive/matching.ts`
- Test: `tests/proactive-pure.test.ts`

- [ ] **Step 1: Crear `tests/proactive-pure.test.ts`:**

```ts
import { describe, it, expect } from 'vitest'
import { isLeadEligible, matchesRule, rankByStage, MIN_PROACTIVE_GAP_DAYS } from '@/lib/proactive/eligibility'
import { renderTemplate, buildRecipientParams } from '@/lib/proactive/render'
import { matchLeadsToListing } from '@/lib/proactive/matching'
import type { Lead, LeadStage } from '@/types'

const NOW = Date.parse('2026-06-11T12:00:00Z')
const daysAgo = (d: number) => new Date(NOW - d * 24 * 60 * 60 * 1000).toISOString()

const baseLead: Lead = {
  id: 'l1', phone: '503', name: 'Carlos', stage: 'warm', bot_active: true,
  project_interest: null, qualification_data: null, assigned_to: null,
  opted_out: false, last_proactive_at: null,
  first_message_at: '', last_message_at: daysAgo(10), created_at: '',
} as Lead
const mk = (over: Partial<Lead> = {}): Lead => ({ ...baseLead, ...over })

describe('isLeadEligible', () => {
  it('elegible por defecto', () => {
    expect(isLeadEligible(mk(), NOW)).toBe(true)
  })
  it('opted_out nunca es elegible', () => {
    expect(isLeadEligible(mk({ opted_out: true }), NOW)).toBe(false)
  })
  it('bot pausado (atendido por humano) no es elegible', () => {
    expect(isLeadEligible(mk({ bot_active: false }), NOW)).toBe(false)
  })
  it('proactivo reciente (< gap) no es elegible; viejo sí', () => {
    expect(isLeadEligible(mk({ last_proactive_at: daysAgo(MIN_PROACTIVE_GAP_DAYS - 1) }), NOW)).toBe(false)
    expect(isLeadEligible(mk({ last_proactive_at: daysAgo(MIN_PROACTIVE_GAP_DAYS + 1) }), NOW)).toBe(true)
  })
})

describe('matchesRule', () => {
  const rule = { stages: ['hot', 'warm'] as LeadStage[], tag_ids: null, days_inactive: 5 }
  it('cumple etapa y días', () => {
    expect(matchesRule(mk({ stage: 'hot', last_message_at: daysAgo(6) }), [], rule, NOW)).toBe(true)
  })
  it('etapa fuera del filtro no cumple', () => {
    expect(matchesRule(mk({ stage: 'cold', last_message_at: daysAgo(6) }), [], rule, NOW)).toBe(false)
  })
  it('conversación reciente no cumple', () => {
    expect(matchesRule(mk({ stage: 'hot', last_message_at: daysAgo(3) }), [], rule, NOW)).toBe(false)
  })
  it('filtro de tags: basta UNA coincidencia', () => {
    const r = { stages: null, tag_ids: ['t1', 't2'], days_inactive: 1 }
    expect(matchesRule(mk({ last_message_at: daysAgo(2) }), ['t2', 'x'], r, NOW)).toBe(true)
    expect(matchesRule(mk({ last_message_at: daysAgo(2) }), ['x'], r, NOW)).toBe(false)
  })
  it('sin filtros (null) aplica a todos con los días cumplidos', () => {
    const r = { stages: null, tag_ids: null, days_inactive: 5 }
    expect(matchesRule(mk({ stage: 'cold', last_message_at: daysAgo(30) }), [], r, NOW)).toBe(true)
  })
})

describe('rankByStage', () => {
  it('ordena hot → warm → new → cold, estable', () => {
    const ls = [mk({ id: 'c', stage: 'cold' }), mk({ id: 'h1', stage: 'hot' }), mk({ id: 'n', stage: 'new' }), mk({ id: 'h2', stage: 'hot' }), mk({ id: 'w', stage: 'warm' })]
    expect(rankByStage(ls).map(l => l.id)).toEqual(['h1', 'h2', 'w', 'n', 'c'])
  })
})

describe('renderTemplate / buildRecipientParams', () => {
  it('sustituye {{1}} y {{2}}', () => {
    expect(renderTemplate('Hola {{1}}, mira {{2}}', ['Ana', 'Torre X'])).toBe('Hola Ana, mira Torre X')
  })
  it('parámetro faltante queda vacío', () => {
    expect(renderTemplate('Hola {{1}} y {{2}}', ['Ana'])).toBe('Hola Ana y ')
  })
  it('params del lead con nombre e interés', () => {
    expect(buildRecipientParams(mk({ name: ' Ana ', project_interest: 'Portacelli' }), { variables: 2 }))
      .toEqual(['Ana', 'Portacelli'])
  })
  it('fallbacks: sin nombre y sin interés', () => {
    expect(buildRecipientParams(mk({ name: null, project_interest: null }), { variables: 2 }))
      .toEqual(['qué gusto saludarte', 'nuestras propiedades'])
  })
  it('listingName tiene prioridad sobre project_interest', () => {
    expect(buildRecipientParams(mk({ project_interest: 'Portacelli' }), { variables: 2, listingName: 'Torre Nueva' }))
      .toEqual(['Carlos', 'Torre Nueva'])
  })
  it('respeta el número de variables de la plantilla', () => {
    expect(buildRecipientParams(mk({}), { variables: 1 })).toEqual(['Carlos'])
    expect(buildRecipientParams(mk({}), { variables: 0 })).toEqual([])
  })
})

describe('matchLeadsToListing', () => {
  const listing = { name: 'Torre Inversión Cuscatlán', entityType: 'investment' as const, type: 'Apartamentos', location: 'Nuevo Cuscatlán' }
  const qual = (purpose: 'inversion' | 'vivienda_propia' | 'ambos' | null) =>
    ({ purpose, budget_ok: null, timeline: null, financing_needed: null, decision_maker: null })

  it('inversionista hot con interés compatible puntúa alto y trae razón legible', () => {
    const l = mk({ id: 'a', stage: 'hot', qualification_data: qual('inversion'), project_interest: 'apartamentos en cuscatlán' })
    const out = matchLeadsToListing(listing, [l])
    expect(out).toHaveLength(1)
    expect(out[0].score).toBe(6) // 3 propósito + 2 hot + 1 interés
    expect(out[0].reason).toContain('Inversión')
  })
  it('propósito incompatible y etapa fría queda fuera (score < 3)', () => {
    const l = mk({ id: 'b', stage: 'cold', qualification_data: qual('vivienda_propia') })
    expect(matchLeadsToListing(listing, [l])).toHaveLength(0)
  })
  it('ambos cuenta como compatible', () => {
    const l = mk({ id: 'c', stage: 'new', qualification_data: qual('ambos') })
    expect(matchLeadsToListing(listing, [l])).toHaveLength(1) // 3 + 0
  })
  it('ordena por score desc y corta en 50', () => {
    const many = Array.from({ length: 60 }, (_, i) =>
      mk({ id: `l${i}`, stage: i % 2 ? 'hot' : 'warm', qualification_data: qual('inversion') }))
    const out = matchLeadsToListing(listing, many)
    expect(out).toHaveLength(50)
    expect(out[0].score).toBeGreaterThanOrEqual(out[49].score)
  })
  it('residencial: vivienda_propia compatible con project/residency', () => {
    const res = { name: 'Foresta', entityType: 'project' as const, type: 'Townhomes', location: 'El Encanto' }
    const l = mk({ id: 'd', stage: 'warm', qualification_data: qual('vivienda_propia') })
    expect(matchLeadsToListing(res, [l])).toHaveLength(1) // 3 + 1
  })
})
```

Run: `npm run test:run -- tests/proactive-pure.test.ts` → FAIL (módulos no existen).

- [ ] **Step 2: Crear `lib/proactive/eligibility.ts`:**

```ts
import type { Lead, LeadStage, RecontactRule } from '@/types'

export const MIN_PROACTIVE_GAP_DAYS = 7
const DAY_MS = 24 * 60 * 60 * 1000

// Un lead puede recibir proactivos si: no pidió silencio, no lo atiende un
// humano, y no recibió otro proactivo hace menos del gap mínimo.
export function isLeadEligible(
  lead: Pick<Lead, 'opted_out' | 'bot_active' | 'last_proactive_at'>,
  nowMs = Date.now()
): boolean {
  if (lead.opted_out) return false
  if (!lead.bot_active) return false
  if (lead.last_proactive_at) {
    const last = Date.parse(lead.last_proactive_at)
    if (!Number.isNaN(last) && nowMs - last < MIN_PROACTIVE_GAP_DAYS * DAY_MS) return false
  }
  return true
}

export function matchesRule(
  lead: Pick<Lead, 'stage' | 'last_message_at'>,
  leadTagIds: string[],
  rule: Pick<RecontactRule, 'stages' | 'tag_ids' | 'days_inactive'>,
  nowMs = Date.now()
): boolean {
  if (rule.stages && rule.stages.length > 0 && !rule.stages.includes(lead.stage)) return false
  if (rule.tag_ids && rule.tag_ids.length > 0 && !rule.tag_ids.some(t => leadTagIds.includes(t))) return false
  const lastMsg = Date.parse(lead.last_message_at)
  if (Number.isNaN(lastMsg)) return false
  return nowMs - lastMsg >= rule.days_inactive * DAY_MS
}

const STAGE_PRIORITY: Record<LeadStage, number> = { hot: 0, warm: 1, new: 2, cold: 3 }

export function rankByStage<T extends { stage: LeadStage }>(leads: T[]): T[] {
  return [...leads].sort((a, b) => STAGE_PRIORITY[a.stage] - STAGE_PRIORITY[b.stage])
}
```

- [ ] **Step 3: Crear `lib/proactive/render.ts`:**

```ts
import type { Lead } from '@/types'

// Meta no acepta parámetros vacíos en plantillas: fallbacks gramaticales.
const NAME_FALLBACK = 'qué gusto saludarte'
const INTEREST_FALLBACK = 'nuestras propiedades'

export function renderTemplate(bodyPreview: string, params: string[]): string {
  return bodyPreview.replace(/\{\{(\d+)\}\}/g, (_, n) => params[Number(n) - 1] ?? '')
}

export function buildRecipientParams(
  lead: Pick<Lead, 'name' | 'project_interest'>,
  opts: { variables: number; listingName?: string }
): string[] {
  const p1 = lead.name?.trim() || NAME_FALLBACK
  const p2 = opts.listingName ?? (lead.project_interest?.trim() || INTEREST_FALLBACK)
  return [p1, p2].slice(0, opts.variables)
}
```

- [ ] **Step 4: Crear `lib/proactive/matching.ts`:**

```ts
import type { GTProject, Lead } from '@/types'

export interface ListingMatch {
  leadId: string
  score: number
  reason: string
}

const MIN_SCORE = 3
const MAX_MATCHES = 50

type ListingLite = Pick<GTProject, 'name' | 'entityType' | 'type' | 'location'>

function purposeCompatible(purpose: string | null | undefined, entityType: string | undefined): boolean {
  if (!purpose) return false
  if (purpose === 'ambos') return true
  if (purpose === 'inversion') return entityType === 'investment'
  if (purpose === 'vivienda_propia') return entityType === 'project' || entityType === 'residency'
  return false
}

function interestOverlaps(interest: string | null, listing: ListingLite): boolean {
  if (!interest) return false
  const i = interest.toLowerCase()
  const hay = [listing.name, listing.type, listing.location].filter(Boolean).map(s => String(s).toLowerCase())
  // coincide si el interés contiene alguna palabra significativa del listing o viceversa
  return hay.some(h => i.includes(h) || h.split(/\s+/).some(w => w.length >= 4 && i.includes(w)))
}

export function matchLeadsToListing(listing: ListingLite, candidates: Lead[]): ListingMatch[] {
  const out: ListingMatch[] = []
  for (const lead of candidates) {
    let score = 0
    const reasons: string[] = []
    const purpose = lead.qualification_data?.purpose ?? null

    if (purposeCompatible(purpose, listing.entityType)) {
      score += 3
      reasons.push(purpose === 'inversion' ? 'Inversión' : purpose === 'ambos' ? 'Vivienda/Inversión' : 'Vivienda')
    }
    if (lead.stage === 'hot') { score += 2; reasons.push('etapa caliente') }
    if (lead.stage === 'warm') { score += 1; reasons.push('etapa tibia') }
    if (interestOverlaps(lead.project_interest, listing)) {
      score += 1
      reasons.push(`interesado en ${lead.project_interest}`)
    }

    if (score >= MIN_SCORE) {
      out.push({ leadId: lead.id, score, reason: reasons.join(' · ') })
    }
  }
  return out.sort((a, b) => b.score - a.score).slice(0, MAX_MATCHES)
}
```

- [ ] **Step 5: Verificar** — `npm run test:run && npx tsc --noEmit` → 172 tests (151+21), limpio.

- [ ] **Step 6: Commit**

```bash
git add lib/proactive/eligibility.ts lib/proactive/render.ts lib/proactive/matching.ts tests/proactive-pure.test.ts
git commit -m "feat(proactive): elegibilidad, render de variables y matching puros"
```

---

### Task 4: Capa de datos + engine (TDD del engine con deps inyectadas)

**Files:**
- Create: `lib/proactive/data.ts`, `lib/proactive/engine.ts`
- Test: `tests/proactive-engine.test.ts`

- [ ] **Step 1: Crear `lib/proactive/data.ts`** (lecturas/escrituras service-role; sin tests unitarios directos — patrón panel-data; el engine se testea con fakes):

```ts
import { getServiceClient } from '@/lib/supabase'
import type {
  Campaign, CampaignKind, CampaignRecipient, GTProject, Lead,
  MessageTemplate, RecontactRule,
} from '@/types'

export interface LeadWithTags {
  lead: Lead
  tagIds: string[]
  // último mensaje DEL CLIENTE (role user) — gating de days_inactive;
  // last_message_at NO sirve (lo actualizan también las respuestas del bot)
  lastUserMessageAt: string | null
}

export async function leadsWithTags(): Promise<LeadWithTags[]> {
  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from('leads')
    .select('*, lead_tags(tag_id), conversations(created_at)')
    .eq('conversations.role', 'user')
    .order('created_at', { referencedTable: 'conversations', ascending: false })
    .limit(1, { referencedTable: 'conversations' })
  if (error) throw new Error(`leadsWithTags: ${error.message}`)
  const rows = (data ?? []) as (Lead & {
    lead_tags: { tag_id: string }[] | null
    conversations: { created_at: string }[] | null
  })[]
  return rows.map(({ lead_tags, conversations, ...lead }) => ({
    lead: lead as Lead,
    tagIds: (lead_tags ?? []).map(t => t.tag_id),
    lastUserMessageAt: conversations?.[0]?.created_at ?? null,
  }))
}

export async function listActiveRules(): Promise<RecontactRule[]> {
  const { data, error } = await getServiceClient()
    .from('recontact_rules').select('*').eq('active', true)
  if (error) throw new Error(`listActiveRules: ${error.message}`)
  return (data ?? []) as RecontactRule[]
}

export async function getTemplateById(id: string): Promise<MessageTemplate | null> {
  const { data, error } = await getServiceClient()
    .from('message_templates').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(`getTemplateById: ${error.message}`)
  return (data as MessageTemplate) ?? null
}

export async function getTemplateByName(name: string): Promise<MessageTemplate | null> {
  const { data, error } = await getServiceClient()
    .from('message_templates').select('*').eq('name', name).eq('active', true).maybeSingle()
  if (error) throw new Error(`getTemplateByName: ${error.message}`)
  return (data as MessageTemplate) ?? null
}

// Leads que ya están en una campaña viva (pendiente o enviándose)
export async function leadIdsInActiveCampaigns(): Promise<Set<string>> {
  const { data, error } = await getServiceClient()
    .from('campaign_recipients')
    .select('lead_id, campaigns!inner(status)')
    .in('campaigns.status', ['pending_approval', 'sending'])
  if (error) throw new Error(`leadIdsInActiveCampaigns: ${error.message}`)
  return new Set(((data ?? []) as { lead_id: string }[]).map(r => r.lead_id))
}

export async function hasCampaignForRuleToday(ruleId: string, dayStartIso: string): Promise<boolean> {
  const { data, error } = await getServiceClient()
    .from('campaigns').select('id').eq('rule_id', ruleId).gte('created_at', dayStartIso).limit(1)
  if (error) throw new Error(`hasCampaignForRuleToday: ${error.message}`)
  return ((data ?? []) as unknown[]).length > 0
}

export async function hasCampaignForListing(slug: string): Promise<boolean> {
  const { data, error } = await getServiceClient()
    .from('campaigns').select('id').eq('listing_slug', slug).limit(1)
  if (error) throw new Error(`hasCampaignForListing: ${error.message}`)
  return ((data ?? []) as unknown[]).length > 0
}

export interface NewCampaign {
  kind: CampaignKind
  title: string
  reason: string | null
  rule_id?: string | null
  listing_slug?: string | null
  template_id: string
  recipients: { lead_id: string; variables: string[]; match_reason: string | null }[]
}

export async function createCampaign(c: NewCampaign): Promise<string> {
  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from('campaigns')
    .insert({
      kind: c.kind, title: c.title, reason: c.reason,
      rule_id: c.rule_id ?? null, listing_slug: c.listing_slug ?? null,
      template_id: c.template_id,
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(`createCampaign: ${error?.message ?? 'sin id'}`)
  const campaignId = (data as { id: string }).id
  const { error: rErr } = await supabase
    .from('campaign_recipients')
    .insert(c.recipients.map(r => ({ campaign_id: campaignId, ...r })))
  if (rErr) throw new Error(`createCampaign recipients: ${rErr.message}`)
  return campaignId
}

export async function listKnownSlugs(): Promise<Set<string>> {
  const { data, error } = await getServiceClient().from('known_listings').select('slug')
  if (error) throw new Error(`listKnownSlugs: ${error.message}`)
  return new Set(((data ?? []) as { slug: string }[]).map(r => r.slug))
}

export async function insertKnownListings(listings: GTProject[]): Promise<void> {
  if (listings.length === 0) return
  const { error } = await getServiceClient()
    .from('known_listings')
    .insert(listings.map(l => ({
      slug: l.slug, name: l.name, entity_type: l.entityType ?? null, snapshot: l,
    })))
  if (error) throw new Error(`insertKnownListings: ${error.message}`)
}

export interface CampaignForSend {
  campaign: Campaign
  template: MessageTemplate
  recipients: (CampaignRecipient & { lead: Pick<Lead, 'id' | 'phone' | 'name'> })[]
}

export async function getCampaignForSend(id: string): Promise<CampaignForSend | null> {
  const supabase = getServiceClient()
  const { data: campaign, error } = await supabase
    .from('campaigns').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(`getCampaignForSend: ${error.message}`)
  if (!campaign) return null
  const template = await getTemplateById((campaign as Campaign).template_id)
  if (!template) return null
  const { data: recipients, error: rErr } = await supabase
    .from('campaign_recipients')
    .select('*, leads(id, phone, name)')
    .eq('campaign_id', id)
  if (rErr) throw new Error(`getCampaignForSend recipients: ${rErr.message}`)
  return {
    campaign: campaign as Campaign,
    template,
    recipients: ((recipients ?? []) as (CampaignRecipient & { leads: Pick<Lead, 'id' | 'phone' | 'name'> })[])
      .map(({ leads, ...r }) => ({ ...r, lead: leads })),
  }
}

export async function setCampaignStatus(
  id: string,
  fields: Partial<Pick<Campaign, 'status' | 'approved_by' | 'approved_at'>>
): Promise<void> {
  const { error } = await getServiceClient().from('campaigns').update(fields).eq('id', id)
  if (error) throw new Error(`setCampaignStatus: ${error.message}`)
}

export async function markRecipient(
  id: string,
  fields: Partial<Pick<CampaignRecipient, 'status' | 'wa_message_id' | 'error' | 'sent_at' | 'included'>>
): Promise<void> {
  const { error } = await getServiceClient().from('campaign_recipients').update(fields).eq('id', id)
  if (error) throw new Error(`markRecipient: ${error.message}`)
}

export interface PendingCampaign {
  campaign: Campaign
  template: MessageTemplate
  recipients: (CampaignRecipient & { lead: Pick<Lead, 'id' | 'phone' | 'name'> })[]
}

export async function listPendingCampaigns(): Promise<PendingCampaign[]> {
  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from('campaigns')
    .select('*, message_templates(*), campaign_recipients(*, leads(id, phone, name))')
    .eq('status', 'pending_approval')
    .order('created_at', { ascending: false })
  if (error) throw new Error(`listPendingCampaigns: ${error.message}`)
  type Row = Campaign & {
    message_templates: MessageTemplate
    campaign_recipients: (CampaignRecipient & { leads: Pick<Lead, 'id' | 'phone' | 'name'> })[]
  }
  return ((data ?? []) as Row[]).map(({ message_templates, campaign_recipients, ...campaign }) => ({
    campaign: campaign as Campaign,
    template: message_templates,
    recipients: campaign_recipients.map(({ leads, ...r }) => ({ ...r, lead: leads })),
  }))
}

export async function listCampaignHistory(limit = 20): Promise<(Campaign & { sent: number; failed: number })[]> {
  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from('campaigns')
    .select('*, campaign_recipients(status)')
    .in('status', ['sending', 'done', 'rejected'])
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`listCampaignHistory: ${error.message}`)
  type Row = Campaign & { campaign_recipients: { status: string }[] }
  return ((data ?? []) as Row[]).map(({ campaign_recipients, ...c }) => ({
    ...(c as Campaign),
    sent: campaign_recipients.filter(r => r.status === 'sent').length,
    failed: campaign_recipients.filter(r => r.status === 'failed').length,
  }))
}

export async function countPendingCampaigns(): Promise<number> {
  const { count, error } = await getServiceClient()
    .from('campaigns')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending_approval')
  if (error) throw new Error(`countPendingCampaigns: ${error.message}`)
  return count ?? 0
}

export async function listTemplates(): Promise<MessageTemplate[]> {
  const { data, error } = await getServiceClient()
    .from('message_templates').select('*').order('name')
  if (error) throw new Error(`listTemplates: ${error.message}`)
  return (data ?? []) as MessageTemplate[]
}

export async function listRules(): Promise<RecontactRule[]> {
  const { data, error } = await getServiceClient()
    .from('recontact_rules').select('*').order('created_at')
  if (error) throw new Error(`listRules: ${error.message}`)
  return (data ?? []) as RecontactRule[]
}
```

- [ ] **Step 2: Crear `tests/proactive-engine.test.ts` (failing):**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runRecontactRules, runDailyRadar, sendCampaign, type EngineDeps } from '@/lib/proactive/engine'
import type { Lead, MessageTemplate, RecontactRule } from '@/types'

const NOW = Date.parse('2026-06-11T12:00:00Z')
const daysAgo = (d: number) => new Date(NOW - d * 86400000).toISOString()

const mkLead = (over: Partial<Lead> = {}): Lead => ({
  id: 'l1', phone: '503', name: 'Carlos', stage: 'hot', bot_active: true,
  project_interest: null, qualification_data: null, assigned_to: null,
  opted_out: false, last_proactive_at: null,
  first_message_at: '', last_message_at: daysAgo(10), created_at: '',
} as Lead)

const template: MessageTemplate = {
  id: 'tpl1', name: 'recontacto_seguimiento', language: 'es', category: 'MARKETING',
  body_preview: 'Hola {{1}}, ¿sigues interesado en {{2}}?', variables: 2, active: true, created_at: '',
}
const rule: RecontactRule = {
  id: 'r1', name: 'Calientes 5 días', active: true, stages: ['hot'], tag_ids: null,
  days_inactive: 5, template_id: 'tpl1', max_per_run: 2, created_at: '',
}

function makeDeps(over: Partial<EngineDeps> = {}): EngineDeps & { created: unknown[] } {
  const created: unknown[] = []
  return {
    created,
    leadsWithTags: vi.fn(async () => [{ lead: mkLead(), tagIds: [], lastUserMessageAt: daysAgo(10) }]),
    listActiveRules: vi.fn(async () => [rule]),
    getTemplateById: vi.fn(async () => template),
    getTemplateByName: vi.fn(async () => template),
    leadIdsInActiveCampaigns: vi.fn(async () => new Set<string>()),
    hasCampaignForRuleToday: vi.fn(async () => false),
    hasCampaignForListing: vi.fn(async () => false),
    createCampaign: vi.fn(async (c: unknown) => { created.push(c); return 'camp1' }),
    listKnownSlugs: vi.fn(async () => new Set<string>(['viejo'])),
    insertKnownListings: vi.fn(async () => {}),
    getAllProjects: vi.fn(async () => [
      { slug: 'viejo', name: 'Viejo', type: 'Casa', location: 'X', description: '', status: 'ok' },
    ]),
    getCampaignForSend: vi.fn(async () => null),
    setCampaignStatus: vi.fn(async () => {}),
    markRecipient: vi.fn(async () => {}),
    sendTemplate: vi.fn(async () => 'wamid.x'),
    saveConversation: vi.fn(async () => {}),
    updateLead: vi.fn(async () => {}),
    now: () => NOW,
    ...over,
  } as EngineDeps & { created: unknown[] }
}

beforeEach(() => vi.clearAllMocks())

describe('runRecontactRules', () => {
  it('crea campaña con destinatarios elegibles y variables renderizadas', async () => {
    const deps = makeDeps()
    const res = await runRecontactRules(deps)
    expect(res.campaignsCreated).toBe(1)
    const camp = deps.created[0] as { kind: string; recipients: { lead_id: string; variables: string[] }[] }
    expect(camp.kind).toBe('recontact')
    expect(camp.recipients[0]).toMatchObject({ lead_id: 'l1', variables: ['Carlos', 'nuestras propiedades'] })
  })

  it('excluye opted_out, bot pausado, gap reciente y leads ya en campaña activa', async () => {
    const deps = makeDeps({
      leadsWithTags: vi.fn(async () => [
        { lead: mkLead({ id: 'ok' }), tagIds: [], lastUserMessageAt: daysAgo(10) },
        { lead: mkLead({ id: 'optout', opted_out: true }), tagIds: [], lastUserMessageAt: daysAgo(10) },
        { lead: mkLead({ id: 'humano', bot_active: false }), tagIds: [], lastUserMessageAt: daysAgo(10) },
        { lead: mkLead({ id: 'reciente', last_proactive_at: daysAgo(2) }), tagIds: [], lastUserMessageAt: daysAgo(10) },
        { lead: mkLead({ id: 'encampaña' }), tagIds: [], lastUserMessageAt: daysAgo(10) },
        { lead: mkLead({ id: 'bottuvolaultima' }), tagIds: [], lastUserMessageAt: daysAgo(3) },
      ]),
      leadIdsInActiveCampaigns: vi.fn(async () => new Set(['encampaña'])),
    })
    await runRecontactRules(deps)
    const camp = deps.created[0] as { recipients: { lead_id: string }[] }
    expect(camp.recipients.map(r => r.lead_id)).toEqual(['ok'])
  })

  it('respeta max_per_run priorizando hot', async () => {
    const deps = makeDeps({
      leadsWithTags: vi.fn(async () => [
        { lead: mkLead({ id: 'w', stage: 'warm' }), tagIds: [], lastUserMessageAt: daysAgo(10) },
        { lead: mkLead({ id: 'h1' }), tagIds: [], lastUserMessageAt: daysAgo(10) },
        { lead: mkLead({ id: 'h2' }), tagIds: [], lastUserMessageAt: daysAgo(10) },
      ]),
      listActiveRules: vi.fn(async () => [{ ...rule, stages: null, max_per_run: 2 }]),
    })
    await runRecontactRules(deps)
    const camp = deps.created[0] as { recipients: { lead_id: string }[] }
    expect(camp.recipients.map(r => r.lead_id)).toEqual(['h1', 'h2'])
  })

  it('idempotencia: regla con campaña de hoy no duplica', async () => {
    const deps = makeDeps({ hasCampaignForRuleToday: vi.fn(async () => true) })
    const res = await runRecontactRules(deps)
    expect(res.campaignsCreated).toBe(0)
  })

  it('sin candidatos no crea campaña', async () => {
    const deps = makeDeps({ leadsWithTags: vi.fn(async () => []) })
    const res = await runRecontactRules(deps)
    expect(res.campaignsCreated).toBe(0)
  })
})

describe('runDailyRadar', () => {
  it('primera ejecución: siembra el catálogo SIN campañas', async () => {
    const deps = makeDeps({
      listKnownSlugs: vi.fn(async () => new Set<string>()),
      getAllProjects: vi.fn(async () => [
        { slug: 'a', name: 'A', type: 'Casa', location: 'X', description: '', status: 'ok' },
        { slug: 'b', name: 'B', type: 'Casa', location: 'X', description: '', status: 'ok' },
      ]),
    })
    const res = await runDailyRadar(deps)
    expect(res).toEqual({ newListings: 2, campaignsCreated: 0 })
    expect(deps.insertKnownListings).toHaveBeenCalledTimes(1)
    expect(deps.createCampaign).not.toHaveBeenCalled()
  })

  it('listing nuevo con matches crea campaña de oportunidad', async () => {
    const deps = makeDeps({
      getAllProjects: vi.fn(async () => [
        { slug: 'viejo', name: 'Viejo', type: 'Casa', location: 'X', description: '', status: 'ok' },
        { slug: 'nuevo', name: 'Torre Nueva', type: 'Apartamentos', location: 'Cuscatlán', description: '', status: 'ok', entityType: 'investment' as const },
      ]),
      leadsWithTags: vi.fn(async () => [{
        lead: mkLead({ qualification_data: { purpose: 'inversion', budget_ok: null, timeline: null, financing_needed: null, decision_maker: null } }),
        tagIds: [],
        lastUserMessageAt: daysAgo(10),
      }]),
    })
    const res = await runDailyRadar(deps)
    expect(res.newListings).toBe(1)
    expect(res.campaignsCreated).toBe(1)
    const camp = deps.created[0] as { kind: string; listing_slug: string; recipients: { variables: string[] }[] }
    expect(camp.kind).toBe('opportunity')
    expect(camp.listing_slug).toBe('nuevo')
    expect(camp.recipients[0].variables).toEqual(['Carlos', 'Torre Nueva'])
  })

  it('listing nuevo sin matches solo se registra', async () => {
    const deps = makeDeps({
      getAllProjects: vi.fn(async () => [
        { slug: 'viejo', name: 'Viejo', type: 'Casa', location: 'X', description: '', status: 'ok' },
        { slug: 'nuevo', name: 'Bodega', type: 'Industrial', location: 'Z', description: '', status: 'ok' },
      ]),
      leadsWithTags: vi.fn(async () => []),
    })
    const res = await runDailyRadar(deps)
    expect(res.newListings).toBe(1)
    expect(res.campaignsCreated).toBe(0)
  })
})

describe('sendCampaign', () => {
  const recipient = (over: Record<string, unknown> = {}) => ({
    id: 'rec1', campaign_id: 'camp1', lead_id: 'l1', included: true,
    variables: ['Carlos', 'Portacelli'], match_reason: null, status: 'pending' as const,
    wa_message_id: null, error: null, sent_at: null,
    lead: { id: 'l1', phone: '50312345678', name: 'Carlos' },
    ...over,
  })

  it('envía a incluidos, guarda en historial y marca last_proactive_at', async () => {
    const deps = makeDeps({
      getCampaignForSend: vi.fn(async () => ({
        campaign: { id: 'camp1', kind: 'recontact', status: 'sending', title: 't', reason: null, rule_id: null, listing_slug: null, template_id: 'tpl1', approved_by: null, created_at: '', approved_at: null },
        template,
        recipients: [recipient(), recipient({ id: 'rec2', included: false, lead_id: 'l2', lead: { id: 'l2', phone: '503', name: 'B' } })],
      })),
    })
    const res = await sendCampaign('camp1', deps)
    expect(res).toEqual({ sent: 1, failed: 0 })
    expect(deps.sendTemplate).toHaveBeenCalledTimes(1)
    expect(deps.sendTemplate).toHaveBeenCalledWith('50312345678', 'recontacto_seguimiento', 'es', ['Carlos', 'Portacelli'])
    expect(deps.saveConversation).toHaveBeenCalledWith(expect.objectContaining({
      leadId: 'l1', role: 'assistant',
      content: 'Hola Carlos, ¿sigues interesado en Portacelli?',
      waMessageId: 'wamid.x',
    }))
    expect(deps.updateLead).toHaveBeenCalledWith('l1', expect.objectContaining({ last_proactive_at: expect.any(String) }))
    expect(deps.markRecipient).toHaveBeenCalledWith('rec2', { status: 'skipped' })
    expect(deps.setCampaignStatus).toHaveBeenLastCalledWith('camp1', { status: 'done' })
  })

  it('fallo individual marca failed y continúa', async () => {
    const deps = makeDeps({
      getCampaignForSend: vi.fn(async () => ({
        campaign: { id: 'camp1', kind: 'recontact', status: 'sending', title: 't', reason: null, rule_id: null, listing_slug: null, template_id: 'tpl1', approved_by: null, created_at: '', approved_at: null },
        template,
        recipients: [
          recipient({ id: 'recA', lead_id: 'a', lead: { id: 'a', phone: '1', name: 'A' } }),
          recipient({ id: 'recB', lead_id: 'b', lead: { id: 'b', phone: '2', name: 'B' } }),
        ],
      })),
      sendTemplate: vi.fn()
        .mockRejectedValueOnce(new Error('Meta 131026'))
        .mockResolvedValueOnce('wamid.ok'),
    })
    const res = await sendCampaign('camp1', deps)
    expect(res).toEqual({ sent: 1, failed: 1 })
    expect(deps.markRecipient).toHaveBeenCalledWith('recA', expect.objectContaining({ status: 'failed', error: 'Meta 131026' }))
  })
})
```

Run → FAIL (engine no existe).

- [ ] **Step 3: Crear `lib/proactive/engine.ts`:**

```ts
import * as data from '@/lib/proactive/data'
import { getAllProjects } from '@/services/projects/gt-api'
import { sendTemplate } from '@/services/whatsapp/client'
import { saveConversation, updateLead } from '@/lib/supabase'
import { isLeadEligible, matchesRule, rankByStage } from '@/lib/proactive/eligibility'
import { buildRecipientParams, renderTemplate } from '@/lib/proactive/render'
import { matchLeadsToListing } from '@/lib/proactive/matching'
import type { GTProject } from '@/types'

// Dependencias inyectables: los tests pasan fakes, producción usa los defaults.
export interface EngineDeps {
  leadsWithTags: typeof data.leadsWithTags
  listActiveRules: typeof data.listActiveRules
  getTemplateById: typeof data.getTemplateById
  getTemplateByName: typeof data.getTemplateByName
  leadIdsInActiveCampaigns: typeof data.leadIdsInActiveCampaigns
  hasCampaignForRuleToday: typeof data.hasCampaignForRuleToday
  hasCampaignForListing: typeof data.hasCampaignForListing
  createCampaign: typeof data.createCampaign
  listKnownSlugs: typeof data.listKnownSlugs
  insertKnownListings: typeof data.insertKnownListings
  getAllProjects: typeof getAllProjects
  getCampaignForSend: typeof data.getCampaignForSend
  setCampaignStatus: typeof data.setCampaignStatus
  markRecipient: typeof data.markRecipient
  sendTemplate: typeof sendTemplate
  saveConversation: typeof saveConversation
  updateLead: typeof updateLead
  now: () => number
}

const realDeps: EngineDeps = {
  leadsWithTags: data.leadsWithTags,
  listActiveRules: data.listActiveRules,
  getTemplateById: data.getTemplateById,
  getTemplateByName: data.getTemplateByName,
  leadIdsInActiveCampaigns: data.leadIdsInActiveCampaigns,
  hasCampaignForRuleToday: data.hasCampaignForRuleToday,
  hasCampaignForListing: data.hasCampaignForListing,
  createCampaign: data.createCampaign,
  listKnownSlugs: data.listKnownSlugs,
  insertKnownListings: data.insertKnownListings,
  getAllProjects,
  getCampaignForSend: data.getCampaignForSend,
  setCampaignStatus: data.setCampaignStatus,
  markRecipient: data.markRecipient,
  sendTemplate,
  saveConversation,
  updateLead,
  now: () => Date.now(),
}

const OPPORTUNITY_TEMPLATE = 'nueva_oportunidad'
const SEND_GAP_MS = 250

function dayStartIso(nowMs: number): string {
  const d = new Date(nowMs)
  d.setUTCHours(0, 0, 0, 0)
  return d.toISOString()
}

export async function runRecontactRules(deps: EngineDeps = realDeps): Promise<{ campaignsCreated: number }> {
  const nowMs = deps.now()
  const [rules, universe, busy] = await Promise.all([
    deps.listActiveRules(),
    deps.leadsWithTags(),
    deps.leadIdsInActiveCampaigns(),
  ])
  let campaignsCreated = 0

  for (const rule of rules) {
    if (await deps.hasCampaignForRuleToday(rule.id, dayStartIso(nowMs))) continue
    const template = await deps.getTemplateById(rule.template_id)
    if (!template || !template.active) continue

    const candidates = universe
      .filter(({ lead, tagIds, lastUserMessageAt }) =>
        !busy.has(lead.id) &&
        isLeadEligible(lead, nowMs) &&
        matchesRule(lead, tagIds, rule, lastUserMessageAt, nowMs))
      .map(({ lead }) => lead)

    const chosen = rankByStage(candidates).slice(0, rule.max_per_run)
    if (chosen.length === 0) continue

    await deps.createCampaign({
      kind: 'recontact',
      title: `Regla: ${rule.name}`,
      reason: `${rule.days_inactive}+ días sin conversación`,
      rule_id: rule.id,
      template_id: template.id,
      recipients: chosen.map(lead => ({
        lead_id: lead.id,
        variables: buildRecipientParams(lead, { variables: template.variables }),
        match_reason: `Etapa ${lead.stage}`,
      })),
    })
    campaignsCreated++
  }
  return { campaignsCreated }
}

export async function runDailyRadar(deps: EngineDeps = realDeps): Promise<{ newListings: number; campaignsCreated: number }> {
  const nowMs = deps.now()
  const [projects, known] = await Promise.all([deps.getAllProjects(), deps.listKnownSlugs()])

  // Primera ejecución: memorizar el catálogo completo sin disparar campañas
  if (known.size === 0) {
    await deps.insertKnownListings(projects)
    return { newListings: projects.length, campaignsCreated: 0 }
  }

  const fresh = projects.filter(p => p.slug && !known.has(p.slug))
  if (fresh.length === 0) return { newListings: 0, campaignsCreated: 0 }
  await deps.insertKnownListings(fresh)

  let campaignsCreated = 0
  const template = await deps.getTemplateByName(OPPORTUNITY_TEMPLATE)
  if (!template) {
    console.warn(`[radar] Sin plantilla activa '${OPPORTUNITY_TEMPLATE}' — ${fresh.length} listings registrados sin campaña`)
    return { newListings: fresh.length, campaignsCreated: 0 }
  }

  const [universe, busy] = await Promise.all([deps.leadsWithTags(), deps.leadIdsInActiveCampaigns()])

  for (const listing of fresh) {
    if (await deps.hasCampaignForListing(listing.slug)) continue
    const eligible = universe
      .filter(({ lead }) => !busy.has(lead.id) && isLeadEligible(lead, nowMs))
      .map(({ lead }) => lead)
    const matches = matchLeadsToListing(listing, eligible)
    if (matches.length === 0) continue

    const byId = new Map(eligible.map(l => [l.id, l]))
    await deps.createCampaign({
      kind: 'opportunity',
      title: `🆕 ${listing.name}`,
      reason: `Nuevo en el ecosistema (${listing.entityType ?? listing.type ?? 'propiedad'})`,
      listing_slug: listing.slug,
      template_id: template.id,
      recipients: matches.map(m => ({
        lead_id: m.leadId,
        variables: buildRecipientParams(byId.get(m.leadId)!, {
          variables: template.variables,
          listingName: listing.name,
        }),
        match_reason: m.reason,
      })),
    })
    campaignsCreated++
  }
  return { newListings: fresh.length, campaignsCreated }
}

export async function sendCampaign(campaignId: string, deps: EngineDeps = realDeps): Promise<{ sent: number; failed: number }> {
  const bundle = await deps.getCampaignForSend(campaignId)
  if (!bundle) throw new Error('NOT_FOUND')
  const { template, recipients } = bundle

  let sent = 0
  let failed = 0
  for (const r of recipients) {
    if (!r.included) {
      if (r.status === 'pending') await deps.markRecipient(r.id, { status: 'skipped' })
      continue
    }
    if (r.status !== 'pending' && r.status !== 'failed') continue
    try {
      const waMessageId = await deps.sendTemplate(r.lead.phone, template.name, template.language, r.variables)
      await deps.markRecipient(r.id, {
        status: 'sent',
        wa_message_id: waMessageId,
        error: null,
        sent_at: new Date(deps.now()).toISOString(),
      })
      // El historial del chat muestra el proactivo y Daniela tiene el contexto
      await deps.saveConversation({
        leadId: r.lead_id,
        role: 'assistant',
        content: renderTemplate(template.body_preview, r.variables),
        waMessageId: waMessageId ?? undefined,
      })
      await deps.updateLead(r.lead_id, { last_proactive_at: new Date(deps.now()).toISOString() })
      sent++
    } catch (err) {
      await deps.markRecipient(r.id, {
        status: 'failed',
        error: err instanceof Error ? err.message : 'send failed',
      })
      failed++
    }
    await new Promise(res => setTimeout(res, SEND_GAP_MS))
  }
  await deps.setCampaignStatus(campaignId, { status: 'done' })
  return { sent, failed }
}
```

NOTA para el ejecutor: en los tests, `SEND_GAP_MS` de 250ms × pocos recipients es tolerable (≤1s); no usar fake timers.

- [ ] **Step 4: Verificar** — `npm run test:run && npx tsc --noEmit` → 182 tests (172+10), limpio.

- [ ] **Step 5: Commit**

```bash
git add lib/proactive/data.ts lib/proactive/engine.ts tests/proactive-engine.test.ts
git commit -m "feat(proactive): capa de datos y engine (reglas, radar, envío) con deps inyectadas"
```

---

### Task 5: Cron diario + vercel.json (TDD del route)

**Files:**
- Create: `app/api/cron/daily/route.ts`
- Modify: `vercel.json`
- Test: `tests/cron-route.test.ts`

- [ ] **Step 1: Crear `tests/cron-route.test.ts`:**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const engine = vi.hoisted(() => ({
  runDailyRadar: vi.fn(async () => ({ newListings: 1, campaignsCreated: 1 })),
  runRecontactRules: vi.fn(async () => ({ campaignsCreated: 2 })),
}))
vi.mock('@/lib/proactive/engine', () => engine)

import { GET } from '@/app/api/cron/daily/route'

process.env.CRON_SECRET = 'sec123'

const req = (auth?: string) =>
  new Request('http://localhost/api/cron/daily', { headers: auth ? { authorization: auth } : {} })

beforeEach(() => vi.clearAllMocks())

describe('cron daily', () => {
  it('401 sin Bearer correcto', async () => {
    expect((await GET(req())).status).toBe(401)
    expect((await GET(req('Bearer nope'))).status).toBe(401)
    expect(engine.runDailyRadar).not.toHaveBeenCalled()
  })

  it('ejecuta radar y reglas y devuelve resumen', async () => {
    const res = await GET(req('Bearer sec123'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      radar: { newListings: 1, campaignsCreated: 1 },
      rules: { campaignsCreated: 2 },
    })
  })

  it('un fallo del radar no bloquea las reglas', async () => {
    engine.runDailyRadar.mockRejectedValueOnce(new Error('GT API caída'))
    const res = await GET(req('Bearer sec123'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.radar).toEqual({ error: 'GT API caída' })
    expect(body.rules).toEqual({ campaignsCreated: 2 })
  })
})
```

Run → FAIL.

- [ ] **Step 2: Crear `app/api/cron/daily/route.ts`:**

```ts
import { runDailyRadar, runRecontactRules } from '@/lib/proactive/engine'

export const maxDuration = 60

// Vercel Cron manda Authorization: Bearer ${CRON_SECRET}
export async function GET(request: Request): Promise<Response> {
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const radar = await runDailyRadar().catch((e: unknown) => ({
    error: e instanceof Error ? e.message : 'radar failed',
  }))
  const rules = await runRecontactRules().catch((e: unknown) => ({
    error: e instanceof Error ? e.message : 'rules failed',
  }))

  console.log('[cron/daily]', JSON.stringify({ radar, rules }))
  return Response.json({ radar, rules })
}
```

- [ ] **Step 3: `vercel.json` — añadir crons (10:00 El Salvador = 16:00 UTC):**

```json
{
  "framework": "nextjs",
  "functions": {
    "app/api/webhook/whatsapp/route.ts": {
      "maxDuration": 60
    }
  },
  "crons": [
    { "path": "/api/cron/daily", "schedule": "0 16 * * *" }
  ]
}
```

- [ ] **Step 4: Verificar** — `npm run test:run && npx tsc --noEmit && npm run build` → 185 tests, limpio, build verde.

- [ ] **Step 5: Commit**

```bash
git add app/api/cron/daily/route.ts vercel.json tests/cron-route.test.ts
git commit -m "feat(proactive): cron diario protegido por CRON_SECRET"
```

---

### Task 6: Opt-out automático en el webhook (TDD)

**Files:**
- Modify: `services/claude/prompts.ts` (READ COMPLETO primero — modificado por el usuario), `services/claude/client.ts`, `app/api/webhook/whatsapp/route.ts`
- Test: `tests/claude.test.ts`, `tests/webhook-route.test.ts` (extender)

- [ ] **Step 1: Tests que fallan.**

a) En `tests/claude.test.ts`, dentro del describe de `parseClaudeResponse` añadir:

```ts
  it('parsea opt_out true y default false', () => {
    const base = '{"reply":"ok","stage":"warm"'
    expect(parseClaudeResponse(base + ',"opt_out":true}').opt_out).toBe(true)
    expect(parseClaudeResponse(base + '}').opt_out).toBe(false)
  })
```

b) En `tests/webhook-route.test.ts`: el mock de `parseClaudeResponse` (objeto `ai`) debe ganar `opt_out: false` en su retorno base. Añadir al describe 'webhook con bot activo':

```ts
  it('marca opted_out cuando Daniela detecta opt-out', async () => {
    db.upsertLead.mockResolvedValue({ ...baseLead, bot_active: true })
    db.getLeadById.mockResolvedValue({ ...baseLead, bot_active: true })
    db.getUnprocessedUserMessages.mockResolvedValue([
      { id: 'c1', lead_id: 'lead-1', role: 'user', content: 'Sigo interesado', wa_message_id: 'wamid.in1', sent_by: null, created_at: '' },
    ])
    ai.parseClaudeResponse.mockReturnValueOnce({
      reply: 'Entendido, no te molesto más. ¡Éxitos!', stage: 'cold', name_captured: null,
      qualification_data: { purpose: null, budget_ok: null, timeline: null, financing_needed: null, decision_maker: null },
      qualified: false, schedule_meeting: null, opt_out: true,
    })
    const res = await POST(buildRequest())
    expect(res.status).toBe(200)
    await flush()
    expect(db.updateLead).toHaveBeenCalledWith('lead-1', { opted_out: true })
  })
```

Run → FAIL (parse no devuelve opt_out; route no marca).

- [ ] **Step 2: `services/claude/client.ts` — en el objeto de retorno de `parseClaudeResponse` añadir:**

```ts
    opt_out: parsed.opt_out === true,
```

- [ ] **Step 3: `services/claude/prompts.ts` — READ COMPLETO.** Localizar la sección donde se define el contrato JSON de respuesta (donde se enumeran los campos `reply`, `stage`, `qualification_data`, etc.) y añadir, con el MISMO estilo del archivo, la instrucción del campo nuevo:

```
- "opt_out": boolean — true SOLO si el cliente pide explícitamente no ser contactado o dejar de recibir mensajes ("ya no me interesa, no me escriban", "deja de escribirme", "bórrame"). En ese caso despídete con calidez y respeto, sin insistir. En cualquier otro caso: false.
```

(Integración quirúrgica: NO reordenar ni reescribir nada más del prompt — fue afinado por el usuario.)

- [ ] **Step 4: `app/api/webhook/whatsapp/route.ts` — después del bloque del paso 11 (updateLead con stage/qualification) añadir:**

```ts
    // 11b. Opt-out: el cliente pidió no ser contactado — fuera de campañas para siempre
    if (claudeResponse.opt_out) {
      await updateLead(lead.id, { opted_out: true })
      console.log(`[processMessage] Lead ${lead.id} opted out de mensajes proactivos`)
    }
```

- [ ] **Step 5: Verificar** — `npm run test:run && npx tsc --noEmit` → 187 tests, limpio.

- [ ] **Step 6: Commit**

```bash
git add services/claude/prompts.ts services/claude/client.ts app/api/webhook/whatsapp/route.ts tests/claude.test.ts tests/webhook-route.test.ts
git commit -m "feat(bot): opt-out automático detectado por Daniela"
```

---

### Task 7: Server actions proactivas (TDD autorización)

**Files:**
- Create: `app/panel/proactive-actions.ts`
- Test: `tests/proactive-actions.test.ts`

- [ ] **Step 1: Crear `tests/proactive-actions.test.ts`:**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const state = vi.hoisted(() => ({
  member: null as { id: string; role: string } | null,
  campaign: null as Record<string, unknown> | null,
  lead: null as Record<string, unknown> | null,
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

const serviceChain = vi.hoisted(() => {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {}
  return chain
})
const db = vi.hoisted(() => ({
  getServiceClient: vi.fn(() => serviceChain),
  getLeadById: vi.fn(async () => state.lead),
  updateLead: vi.fn(async () => {}),
}))
vi.mock('@/lib/supabase', () => db)

const engine = vi.hoisted(() => ({
  sendCampaign: vi.fn(async () => ({ sent: 2, failed: 0 })),
}))
vi.mock('@/lib/proactive/engine', () => engine)

const pdata = vi.hoisted(() => ({
  // Espeja el claim real: true solo si el estado actual coincide con fromStatus
  claimCampaign: vi.fn(async (_id: string, fromStatus: string) => state.campaign?.status === fromStatus),
  markRecipient: vi.fn(async () => {}),
}))
vi.mock('@/lib/proactive/data', () => pdata)

vi.mock('next/cache', () => ({ refresh: vi.fn(), revalidatePath: vi.fn() }))

import {
  approveCampaign, rejectCampaign, setLeadOptOut, createRecontactRule,
} from '@/app/panel/proactive-actions'

const admin = { id: 'adm1', role: 'admin' }
const asesor = { id: 'ase1', role: 'asesor' }

beforeEach(() => {
  vi.clearAllMocks()
  state.member = null
  state.campaign = { status: 'pending_approval' }
  state.lead = { id: 'lead-1', assigned_to: 'ase1' }
  for (const k of Object.keys(serviceChain)) delete serviceChain[k]
  const methods = ['from', 'insert', 'update', 'delete', 'eq', 'select', 'maybeSingle'] as const
  for (const m of methods) {
    serviceChain[m] = vi.fn(() => Object.assign(Promise.resolve({ error: null, data: null, count: 0 }), serviceChain))
  }
})

describe('approveCampaign', () => {
  it('solo admin', async () => {
    state.member = asesor
    const res = await approveCampaign('camp1')
    expect(res).toEqual({ ok: false, error: 'FORBIDDEN' })
    expect(engine.sendCampaign).not.toHaveBeenCalled()
  })

  it('admin aprueba: claim atómico sending+aprobador y envía', async () => {
    state.member = admin
    const res = await approveCampaign('camp1')
    expect(res).toEqual({ ok: true })
    expect(pdata.claimCampaign).toHaveBeenCalledWith('camp1', 'pending_approval', expect.objectContaining({
      status: 'sending', approved_by: 'adm1',
    }))
    expect(engine.sendCampaign).toHaveBeenCalledWith('camp1')
  })

  it('no aprueba campañas que no están pendientes', async () => {
    state.member = admin
    state.campaign = { status: 'done' }
    const res = await approveCampaign('camp1')
    expect(res).toEqual({ ok: false, error: 'NOT_PENDING' })
    expect(engine.sendCampaign).not.toHaveBeenCalled()
  })
})

describe('rejectCampaign', () => {
  it('admin rechaza', async () => {
    state.member = admin
    const res = await rejectCampaign('camp1')
    expect(res).toEqual({ ok: true })
    expect(pdata.claimCampaign).toHaveBeenCalledWith('camp1', 'pending_approval', { status: 'rejected' })
  })
})

describe('setLeadOptOut', () => {
  it('asesor con acceso puede marcar opt-out manual', async () => {
    state.member = asesor
    const res = await setLeadOptOut('lead-1', true)
    expect(res).toEqual({ ok: true })
    expect(db.updateLead).toHaveBeenCalledWith('lead-1', { opted_out: true })
  })
  it('asesor sin acceso no puede', async () => {
    state.member = asesor
    state.lead = { id: 'lead-1', assigned_to: 'otro' }
    const res = await setLeadOptOut('lead-1', true)
    expect(res).toEqual({ ok: false, error: 'FORBIDDEN' })
  })
})

describe('createRecontactRule', () => {
  it('valida días y tope', async () => {
    state.member = admin
    expect(await createRecontactRule({ name: 'x', stages: null, tag_ids: null, days_inactive: 0, template_id: 't', max_per_run: 10 }))
      .toEqual({ ok: false, error: 'INVALID_DAYS' })
    expect(await createRecontactRule({ name: 'x', stages: null, tag_ids: null, days_inactive: 5, template_id: 't', max_per_run: 99 }))
      .toEqual({ ok: false, error: 'INVALID_MAX' })
  })
  it('solo admin', async () => {
    state.member = asesor
    expect(await createRecontactRule({ name: 'x', stages: null, tag_ids: null, days_inactive: 5, template_id: 't', max_per_run: 10 }))
      .toEqual({ ok: false, error: 'FORBIDDEN' })
  })
})
```

Run → FAIL.

- [ ] **Step 2: Crear `app/panel/proactive-actions.ts`:**

```ts
'use server'

import { refresh } from 'next/cache'
import { requireAdmin, requireMember } from '@/lib/auth'
import { getLeadById, getServiceClient, updateLead } from '@/lib/supabase'
import { sendCampaign } from '@/lib/proactive/engine'
import { claimCampaign, markRecipient } from '@/lib/proactive/data'
import type { LeadStage, TemplateCategory } from '@/types'

export type ActionResult = { ok: true } | { ok: false; error: string }

function fail(error: unknown, fallback = 'ERROR'): ActionResult {
  const msg = error instanceof Error ? error.message : fallback
  if (msg === 'UNAUTHORIZED' || msg === 'FORBIDDEN') return { ok: false, error: msg }
  console.error('[proactive action]', msg)
  return { ok: false, error: fallback }
}

export async function approveCampaign(campaignId: string): Promise<ActionResult> {
  try {
    const admin = await requireAdmin()
    // Claim atómico: si otro admin aprobó en paralelo (doble click), affected=0
    // y NO se envía dos veces — guard del camino del dinero
    const claimed = await claimCampaign(campaignId, 'pending_approval', {
      status: 'sending',
      approved_by: admin.id,
      approved_at: new Date().toISOString(),
    })
    if (!claimed) return { ok: false, error: 'NOT_PENDING' }
    await sendCampaign(campaignId)
    refresh()
    return { ok: true }
  } catch (error) {
    const msg = error instanceof Error ? error.message : ''
    if (msg === 'TEMPLATE_INACTIVE') return { ok: false, error: 'TEMPLATE_INACTIVE' }
    return fail(error, 'SEND_FAILED')
  }
}

export async function rejectCampaign(campaignId: string): Promise<ActionResult> {
  try {
    await requireAdmin()
    const claimed = await claimCampaign(campaignId, 'pending_approval', { status: 'rejected' })
    if (!claimed) return { ok: false, error: 'NOT_PENDING' }
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error)
  }
}

export async function toggleRecipient(recipientId: string, included: boolean): Promise<ActionResult> {
  try {
    await requireAdmin()
    await markRecipient(recipientId, { included })
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error)
  }
}

export async function retryFailedRecipients(campaignId: string): Promise<ActionResult> {
  try {
    await requireAdmin()
    // Solo se reintenta una campaña terminada; doble click → affected=0
    const claimed = await claimCampaign(campaignId, 'done', { status: 'sending' })
    if (!claimed) return { ok: false, error: 'NOT_PENDING' }
    await sendCampaign(campaignId)
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error, 'SEND_FAILED')
  }
}

export async function setLeadOptOut(leadId: string, optedOut: boolean): Promise<ActionResult> {
  try {
    const member = await requireMember()
    const lead = await getLeadById(leadId)
    if (!lead) throw new Error('NOT_FOUND')
    if (member.role !== 'admin' && lead.assigned_to !== member.id) throw new Error('FORBIDDEN')
    await updateLead(leadId, { opted_out: optedOut })
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error)
  }
}

// ── Plantillas (admin) ─────────────────────────────────────────────

export interface TemplateInput {
  name: string
  language: string
  category: TemplateCategory
  body_preview: string
  variables: number
}

function validTemplate(t: TemplateInput): string | null {
  if (!t.name.trim() || !/^[a-z0-9_]+$/.test(t.name.trim())) return 'INVALID_NAME'
  if (t.variables < 0 || t.variables > 2) return 'INVALID_VARIABLES'
  if (!t.body_preview.trim()) return 'EMPTY'
  return null
}

export async function createMessageTemplate(t: TemplateInput): Promise<ActionResult> {
  try {
    await requireAdmin()
    const invalid = validTemplate(t)
    if (invalid) return { ok: false, error: invalid }
    const { error } = await getServiceClient().from('message_templates').insert({
      name: t.name.trim(), language: t.language, category: t.category,
      body_preview: t.body_preview.trim(), variables: t.variables,
    })
    if (error) throw new Error(error.message)
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error)
  }
}

export async function setTemplateActive(templateId: string, active: boolean): Promise<ActionResult> {
  try {
    await requireAdmin()
    const service = getServiceClient()
    const { error } = await service.from('message_templates').update({ active }).eq('id', templateId)
    if (error) throw new Error(error.message)
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error)
  }
}

// ── Reglas (admin) ─────────────────────────────────────────────────

export interface RuleInput {
  name: string
  stages: LeadStage[] | null
  tag_ids: string[] | null
  days_inactive: number
  template_id: string
  max_per_run: number
}

function validRule(r: RuleInput): string | null {
  if (!r.name.trim()) return 'EMPTY'
  if (!Number.isInteger(r.days_inactive) || r.days_inactive < 1) return 'INVALID_DAYS'
  if (!Number.isInteger(r.max_per_run) || r.max_per_run < 1 || r.max_per_run > 50) return 'INVALID_MAX'
  if (!r.template_id) return 'NO_TEMPLATE'
  return null
}

export async function createRecontactRule(r: RuleInput): Promise<ActionResult> {
  try {
    await requireAdmin()
    const invalid = validRule(r)
    if (invalid) return { ok: false, error: invalid }
    const { error } = await getServiceClient().from('recontact_rules').insert({
      name: r.name.trim(), stages: r.stages, tag_ids: r.tag_ids,
      days_inactive: r.days_inactive, template_id: r.template_id, max_per_run: r.max_per_run,
    })
    if (error) throw new Error(error.message)
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error)
  }
}

export async function setRuleActive(ruleId: string, active: boolean): Promise<ActionResult> {
  try {
    await requireAdmin()
    const service = getServiceClient()
    const { error } = await service.from('recontact_rules').update({ active }).eq('id', ruleId)
    if (error) throw new Error(error.message)
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error)
  }
}

export async function deleteRecontactRule(ruleId: string): Promise<ActionResult> {
  try {
    await requireAdmin()
    const service = getServiceClient()
    const { error } = await service.from('recontact_rules').delete().eq('id', ruleId)
    if (error) throw new Error(error.message)
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error)
  }
}
```

- [ ] **Step 3: Verificar que `claimCampaign` y `markRecipient` ya existen en `lib/proactive/data.ts`** (llegaron con el hardening del engine en la Task 4) — las actions los importan; no crear nada nuevo en data.ts.

- [ ] **Step 4: Verificar** — `npm run test:run && npx tsc --noEmit` → 195 tests, limpio.

- [ ] **Step 5: Commit**

```bash
git add app/panel/proactive-actions.ts lib/proactive/data.ts tests/proactive-actions.test.ts
git commit -m "feat(proactive): server actions de aprobación, plantillas, reglas y opt-out manual"
```

---

### Task 8: UI — página de Campañas

**Files:**
- Create: `app/panel/(authed)/campanas/page.tsx`, `components/panel/CampaignsView.tsx`

- [ ] **Step 1: Crear `app/panel/(authed)/campanas/page.tsx`:**

```tsx
import { redirect } from 'next/navigation'
import { getSessionMember } from '@/lib/auth'
import { listCampaignHistory, listPendingCampaigns } from '@/lib/proactive/data'
import { COST_PER_TEMPLATE_USD } from '@/lib/proactive/cost'
import { CampaignsView } from '@/components/panel/CampaignsView'

// Las server actions heredan esto: aprobar envía hasta 50 plantillas (~28s)
export const maxDuration = 60

export default async function CampanasPage() {
  const member = await getSessionMember()
  if (!member) redirect('/panel/login')
  if (member.role !== 'admin') redirect('/panel')

  const [pending, history] = await Promise.all([
    listPendingCampaigns(),
    listCampaignHistory(20),
  ])

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6">
        <h1 className="text-xl font-semibold text-white">Campañas</h1>
        <CampaignsView pending={pending} history={history} costPerSend={COST_PER_TEMPLATE_USD} />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Crear `components/panel/CampaignsView.tsx`:**

```tsx
'use client'

import { useState, useTransition } from 'react'
import {
  approveCampaign, rejectCampaign, retryFailedRecipients, toggleRecipient,
} from '@/app/panel/proactive-actions'
import { renderTemplate } from '@/lib/proactive/render'
import type { PendingCampaign } from '@/lib/proactive/data'
import type { Campaign } from '@/types'

const ERROR_TEXT: Record<string, string> = {
  NOT_PENDING: 'Esta campaña ya fue procesada. Recarga la página.',
  SEND_FAILED: 'Falló el envío. Revisa el historial y reintenta los fallidos.',
  TEMPLATE_INACTIVE: 'La plantilla de esta campaña está desactivada. Reactívala en Configuración.',
  UNAUTHORIZED: 'Sesión expirada. Vuelve a entrar.',
  FORBIDDEN: 'Solo un admin puede gestionar campañas.',
}

export function CampaignsView({ pending, history, costPerSend }: {
  pending: PendingCampaign[]
  history: (Campaign & { sent: number; failed: number })[]
  costPerSend: number
}) {
  const [tab, setTab] = useState<'pendientes' | 'historial'>('pendientes')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const run = (fn: () => Promise<{ ok: boolean } & { error?: string }>) => {
    setError(null)
    startTransition(async () => {
      const res = await fn()
      if (!res.ok) setError(ERROR_TEXT[(res as { error: string }).error] ?? 'Error inesperado.')
    })
  }

  const tabCls = (active: boolean) =>
    `rounded-lg px-3 py-1.5 text-sm ${active ? 'bg-emerald-700 text-white' : 'bg-zinc-900 text-zinc-400 hover:text-white'}`

  return (
    <div className="space-y-4">
      <div className="flex gap-1">
        <button onClick={() => setTab('pendientes')} className={tabCls(tab === 'pendientes')}>
          Por aprobar ({pending.length})
        </button>
        <button onClick={() => setTab('historial')} className={tabCls(tab === 'historial')}>
          Historial
        </button>
      </div>

      {error && <p className="rounded-lg bg-red-950 px-3 py-2 text-sm text-red-300">{error}</p>}

      {tab === 'pendientes' && (
        <div className="space-y-4">
          {pending.length === 0 && (
            <p className="py-8 text-center text-sm text-zinc-500">
              Nada por aprobar. El sistema propone campañas cada mañana a las 10:00.
            </p>
          )}
          {pending.map(({ campaign, template, recipients }) => {
            const included = recipients.filter(r => r.included)
            return (
              <section key={campaign.id} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className="font-medium text-white">{campaign.title}</h2>
                    {campaign.reason && <p className="text-xs text-zinc-500">{campaign.reason}</p>}
                  </div>
                  <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-400">
                    {campaign.kind === 'recontact' ? 'Recontacto' : 'Oportunidad'}
                  </span>
                </div>

                <p className="mt-3 rounded-lg bg-zinc-950 p-3 text-sm text-zinc-300">
                  {recipients[0]
                    ? renderTemplate(template.body_preview, recipients[0].variables)
                    : template.body_preview}
                </p>

                <ul className="mt-3 max-h-56 space-y-1 overflow-y-auto">
                  {recipients.map(r => (
                    <li key={r.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={r.included}
                        disabled={isPending}
                        onChange={e => run(() => toggleRecipient(r.id, e.target.checked))}
                        aria-label={`Incluir a ${r.lead.name ?? r.lead.phone}`}
                      />
                      <span className="text-zinc-200">{r.lead.name ?? r.lead.phone}</span>
                      {r.match_reason && <span className="truncate text-xs text-zinc-500">· {r.match_reason}</span>}
                    </li>
                  ))}
                </ul>

                <div className="mt-4 flex items-center justify-between gap-2">
                  <p className="text-xs text-zinc-500">
                    {included.length} destinatario{included.length === 1 ? '' : 's'} ·
                    costo estimado <span className="text-zinc-300">${(included.length * costPerSend).toFixed(2)} USD</span>
                  </p>
                  <div className="flex gap-2">
                    <button
                      disabled={isPending}
                      onClick={() => run(() => rejectCampaign(campaign.id))}
                      className="rounded-lg bg-zinc-800 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-700"
                    >
                      Rechazar
                    </button>
                    <button
                      disabled={isPending || included.length === 0}
                      onClick={() => {
                        if (!window.confirm(`¿Enviar a ${included.length} cliente(s)? Costo estimado $${(included.length * costPerSend).toFixed(2)} USD.`)) return
                        run(() => approveCampaign(campaign.id))
                      }}
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-40"
                    >
                      {isPending ? 'Enviando…' : 'Aprobar y enviar'}
                    </button>
                  </div>
                </div>
              </section>
            )
          })}
        </div>
      )}

      {tab === 'historial' && (
        <ul className="divide-y divide-zinc-900 rounded-xl border border-zinc-900">
          {history.length === 0 && (
            <li className="py-8 text-center text-sm text-zinc-500">Sin campañas todavía</li>
          )}
          {history.map(c => (
            <li key={c.id} className="flex items-center justify-between gap-2 px-3 py-2.5 text-sm">
              <div>
                <p className="text-zinc-200">{c.title}</p>
                <p className="text-xs text-zinc-500">
                  {new Date(c.created_at).toLocaleString('es-SV', { dateStyle: 'short', timeStyle: 'short' })}
                  {' · '}{c.status === 'rejected' ? 'Rechazada' : `${c.sent} enviados${c.failed ? `, ${c.failed} fallidos` : ''}`}
                </p>
              </div>
              {c.failed > 0 && c.status === 'done' && (
                <button
                  disabled={isPending}
                  onClick={() => run(() => retryFailedRecipients(c.id))}
                  className="rounded-lg bg-zinc-800 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-700"
                >
                  Reintentar fallidos
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Verificar** — `npm run test:run && npx tsc --noEmit && npm run build` → verde (la ruta `/panel/campanas` aparece en el build).

- [ ] **Step 4: Commit**

```bash
git add "app/panel/(authed)/campanas" components/panel/CampaignsView.tsx
git commit -m "feat(panel): cola de aprobación de campañas con costo estimado e historial"
```

---

### Task 9: UI — Config (plantillas + reglas), opt-out en ficha, badge en header

**Files:**
- Create: `components/panel/ConfigTemplates.tsx`, `components/panel/ConfigRules.tsx`
- Modify: `app/panel/(authed)/config/page.tsx`, `components/panel/LeadSheet.tsx`, `app/panel/(authed)/layout.tsx`

- [ ] **Step 1: Crear `components/panel/ConfigTemplates.tsx`:**

```tsx
'use client'

import { useState, useTransition } from 'react'
import { createMessageTemplate, setTemplateActive } from '@/app/panel/proactive-actions'
import type { MessageTemplate, TemplateCategory } from '@/types'

const ERROR_TEXT: Record<string, string> = {
  INVALID_NAME: 'El nombre debe ser igual al de Meta: minúsculas, números y _',
  INVALID_VARIABLES: 'Variables: 0, 1 o 2.',
  EMPTY: 'Falta el texto de la plantilla.',
}

export function ConfigTemplates({ templates }: { templates: MessageTemplate[] }) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [category, setCategory] = useState<TemplateCategory>('MARKETING')
  const [variables, setVariables] = useState(2)
  const [body, setBody] = useState('')

  return (
    <section>
      <h2 className="text-base font-medium text-white">Plantillas de Meta</h2>
      <p className="text-sm text-zinc-500">
        Registra aquí las plantillas YA aprobadas en WhatsApp Manager (mismo nombre exacto).
        Convención: {'{{1}}'} = nombre del cliente, {'{{2}}'} = interés/propiedad.
      </p>
      <ul className="mt-3 space-y-2">
        {templates.map(t => (
          <li key={t.id} className="rounded-lg border border-zinc-900 bg-zinc-900/40 p-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <p className={t.active ? 'font-mono text-emerald-400' : 'font-mono text-zinc-600 line-through'}>
                {t.name} <span className="text-xs text-zinc-500">({t.category.toLowerCase()}, {t.variables} var)</span>
              </p>
              <button
                disabled={isPending}
                onClick={() => startTransition(async () => { await setTemplateActive(t.id, !t.active) })}
                className="rounded-lg bg-zinc-800 px-2.5 py-1 text-xs text-zinc-300 hover:bg-zinc-700"
              >
                {t.active ? 'Desactivar' : 'Activar'}
              </button>
            </div>
            <p className="mt-1 text-xs text-zinc-400">{t.body_preview}</p>
          </li>
        ))}
        {templates.length === 0 && <li className="text-sm text-zinc-600">Aún no hay plantillas registradas</li>}
      </ul>
      <form
        className="mt-3 space-y-2"
        onSubmit={e => {
          e.preventDefault()
          setError(null)
          startTransition(async () => {
            const res = await createMessageTemplate({ name, language: 'es', category, body_preview: body, variables })
            if (!res.ok) { setError(ERROR_TEXT[res.error] ?? 'No se pudo crear (¿nombre repetido?)'); return }
            setName(''); setBody('')
          })
        }}
      >
        <div className="flex flex-wrap gap-2">
          <input value={name} onChange={e => setName(e.target.value)} required placeholder="nombre_exacto_en_meta" aria-label="Nombre de la plantilla" className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 font-mono text-sm text-white outline-none focus:border-emerald-600" />
          <select value={category} onChange={e => setCategory(e.target.value as TemplateCategory)} aria-label="Categoría" className="rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-300">
            <option value="MARKETING">Marketing</option>
            <option value="UTILITY">Utility</option>
          </select>
          <select value={variables} onChange={e => setVariables(Number(e.target.value))} aria-label="Número de variables" className="rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-300">
            <option value={0}>0 variables</option>
            <option value={1}>1 variable</option>
            <option value={2}>2 variables</option>
          </select>
        </div>
        <textarea value={body} onChange={e => setBody(e.target.value)} required rows={2} placeholder="Texto exacto de la plantilla con {{1}} y {{2}}…" aria-label="Texto de la plantilla" className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-600" />
        <button type="submit" disabled={isPending} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm text-white hover:bg-emerald-500 disabled:opacity-40">
          Registrar plantilla
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
    </section>
  )
}
```

- [ ] **Step 2: Crear `components/panel/ConfigRules.tsx`:**

```tsx
'use client'

import { useState, useTransition } from 'react'
import { createRecontactRule, deleteRecontactRule, setRuleActive } from '@/app/panel/proactive-actions'
import type { LeadStage, MessageTemplate, RecontactRule, Tag } from '@/types'

const STAGE_OPTS: { value: LeadStage; label: string }[] = [
  { value: 'new', label: 'Nuevo' }, { value: 'warm', label: 'Tibio' },
  { value: 'hot', label: 'Caliente' }, { value: 'cold', label: 'Frío' },
]

const ERROR_TEXT: Record<string, string> = {
  INVALID_DAYS: 'Los días deben ser 1 o más.',
  INVALID_MAX: 'El tope diario debe estar entre 1 y 50.',
  NO_TEMPLATE: 'Elige una plantilla.',
  EMPTY: 'Falta el nombre de la regla.',
}

export function ConfigRules({ rules, templates, tags }: {
  rules: RecontactRule[]
  templates: MessageTemplate[]
  tags: Tag[]
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [stages, setStages] = useState<LeadStage[]>([])
  const [tagIds, setTagIds] = useState<string[]>([])
  const [days, setDays] = useState(7)
  const [templateId, setTemplateId] = useState('')
  const [maxRun, setMaxRun] = useState(20)

  const activeTemplates = templates.filter(t => t.active)
  const tplName = (id: string) => templates.find(t => t.id === id)?.name ?? '—'
  const toggleIn = <T,>(arr: T[], v: T) => arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]

  return (
    <section>
      <h2 className="text-base font-medium text-white">Reglas de recontacto</h2>
      <p className="text-sm text-zinc-500">
        Cada mañana el sistema propone campañas según estas reglas. Tú apruebas antes de enviar.
      </p>
      <ul className="mt-3 space-y-2">
        {rules.map(r => (
          <li key={r.id} className="flex items-center justify-between gap-2 rounded-lg border border-zinc-900 bg-zinc-900/40 p-3 text-sm">
            <div>
              <p className={r.active ? 'text-white' : 'text-zinc-600 line-through'}>{r.name}</p>
              <p className="text-xs text-zinc-500">
                {(r.stages?.length ? r.stages.join('/') : 'todas las etapas')} · {r.days_inactive}+ días ·
                plantilla {tplName(r.template_id)} · máx {r.max_per_run}/día
              </p>
            </div>
            <div className="flex gap-2">
              <button disabled={isPending} onClick={() => startTransition(async () => { await setRuleActive(r.id, !r.active) })} className="rounded-lg bg-zinc-800 px-2.5 py-1 text-xs text-zinc-300 hover:bg-zinc-700">
                {r.active ? 'Pausar' : 'Activar'}
              </button>
              <button
                disabled={isPending}
                onClick={() => {
                  if (!window.confirm(`¿Eliminar la regla "${r.name}"?`)) return
                  startTransition(async () => { await deleteRecontactRule(r.id) })
                }}
                aria-label={`Eliminar regla ${r.name}`}
                className="rounded-lg bg-zinc-800 px-2.5 py-1 text-xs text-zinc-300 hover:bg-zinc-700"
              >
                <span aria-hidden="true">✕</span>
              </button>
            </div>
          </li>
        ))}
        {rules.length === 0 && <li className="text-sm text-zinc-600">Aún no hay reglas</li>}
      </ul>

      <form
        className="mt-3 space-y-2 rounded-lg border border-zinc-900 p-3"
        onSubmit={e => {
          e.preventDefault()
          setError(null)
          startTransition(async () => {
            const res = await createRecontactRule({
              name, stages: stages.length ? stages : null, tag_ids: tagIds.length ? tagIds : null,
              days_inactive: days, template_id: templateId, max_per_run: maxRun,
            })
            if (!res.ok) { setError(ERROR_TEXT[res.error] ?? 'No se pudo crear la regla.'); return }
            setName(''); setStages([]); setTagIds([])
          })
        }}
      >
        <input value={name} onChange={e => setName(e.target.value)} required placeholder="Nombre (ej. Calientes 5 días)" aria-label="Nombre de la regla" className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm text-white outline-none focus:border-emerald-600" />
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-zinc-500">Etapas:</span>
          {STAGE_OPTS.map(s => (
            <button type="button" key={s.value} onClick={() => setStages(v => toggleIn(v, s.value))}
              className={`rounded-full px-2 py-0.5 ${stages.includes(s.value) ? 'bg-emerald-700 text-white' : 'bg-zinc-800 text-zinc-400'}`}>
              {s.label}
            </button>
          ))}
          <span className="text-zinc-600">(ninguna = todas)</span>
        </div>
        {tags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-zinc-500">Tags:</span>
            {tags.map(t => (
              <button type="button" key={t.id} onClick={() => setTagIds(v => toggleIn(v, t.id))}
                className={`rounded-full px-2 py-0.5 ${tagIds.includes(t.id) ? 'bg-emerald-700 text-white' : 'bg-zinc-800 text-zinc-400'}`}>
                {t.name}
              </button>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <label className="flex items-center gap-1 text-zinc-400">
            Días sin hablar:
            <input type="number" min={1} value={days} onChange={e => setDays(Number(e.target.value))} aria-label="Días de inactividad" className="w-16 rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1 text-white" />
          </label>
          <select value={templateId} onChange={e => setTemplateId(e.target.value)} required aria-label="Plantilla" className="rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-zinc-300">
            <option value="">Plantilla…</option>
            {activeTemplates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <label className="flex items-center gap-1 text-zinc-400">
            Máx/día:
            <input type="number" min={1} max={50} value={maxRun} onChange={e => setMaxRun(Number(e.target.value))} aria-label="Máximo por día" className="w-16 rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1 text-white" />
          </label>
          <button type="submit" disabled={isPending} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-white hover:bg-emerald-500 disabled:opacity-40">
            Crear regla
          </button>
        </div>
      </form>
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
    </section>
  )
}
```

- [ ] **Step 3: `app/panel/(authed)/config/page.tsx` — READ y ampliar:** añadir imports y data:

```tsx
import { listRules, listTemplates } from '@/lib/proactive/data'
import { ConfigTemplates } from '@/components/panel/ConfigTemplates'
import { ConfigRules } from '@/components/panel/ConfigRules'
```

cambiar el fetch a:

```tsx
  const [tags, team, templates, rules] = await Promise.all([
    listAllTags(), listTeam(), listTemplates(), listRules(),
  ])
```

y en el JSX, después de `<ConfigTeam ... />`:

```tsx
        <ConfigTemplates templates={templates} />
        <ConfigRules rules={rules} templates={templates} tags={tags} />
```

- [ ] **Step 4: `components/panel/LeadSheet.tsx` — READ y añadir el toggle de opt-out.** Import: `setLeadOptOut` desde `@/app/panel/proactive-actions`. Justo después del bloque del header (nombre/teléfono/interés), añadir:

```tsx
      <button
        disabled={isPending}
        onClick={() => run(() => setLeadOptOut(lead.id, !lead.opted_out))}
        className={`w-full rounded-lg px-3 py-1.5 text-xs ${
          lead.opted_out
            ? 'bg-red-950 text-red-300 hover:bg-red-900'
            : 'bg-zinc-900 text-zinc-400 hover:text-white'
        }`}
      >
        {lead.opted_out ? '🔕 No contactar (opt-out) — tocar para reactivar' : '🔔 Recibe campañas — tocar para silenciar'}
      </button>
```

(El `run()` de LeadSheet ya acepta `() => Promise<ActionResult>` — los tipos `ActionResult` de ambos archivos de actions son estructuralmente idénticos.)

- [ ] **Step 5: `app/panel/(authed)/layout.tsx` — READ y añadir el link con badge (solo admin), junto al link de Configuración:**

Import: `import { countPendingCampaigns } from '@/lib/proactive/data'`.
Tras obtener `member`, añadir: `const pendingCount = member.role === 'admin' ? await countPendingCampaigns() : 0`.
En el `<nav>`, ANTES del link de Configuración:

```tsx
          {member.role === 'admin' && (
            <Link href="/panel/campanas" className="relative text-zinc-400 hover:text-white">
              Campañas
              {pendingCount > 0 && (
                <span className="absolute -right-3 -top-1.5 rounded-full bg-red-600 px-1.5 text-[10px] font-semibold text-white">
                  {pendingCount}
                </span>
              )}
            </Link>
          )}
```

- [ ] **Step 6: Verificar** — `npm run test:run && npx tsc --noEmit && npm run build` → verde.

- [ ] **Step 7: Commit**

```bash
git add components/panel/ConfigTemplates.tsx components/panel/ConfigRules.tsx "app/panel/(authed)/config/page.tsx" components/panel/LeadSheet.tsx "app/panel/(authed)/layout.tsx"
git commit -m "feat(panel): config de plantillas y reglas, opt-out en ficha y badge de campañas"
```

---

### Task 10: Verificación final + docs + sincronización del spec

**Files:**
- Modify: `README.md`, `docs/GUIA-ACTIVACION-PANEL.md`, `docs/superpowers/specs/2026-06-11-fase2-ui-y-motor-proactivo-design.md`

- [ ] **Step 1: Suite completa** — `npm run test:run && npx tsc --noEmit && npm run build`. TODO verde (≈195 tests). Arreglar antes de seguir.

- [ ] **Step 2: README — añadir a la tabla de estructura:**

```markdown
| `lib/proactive/` | Motor proactivo: elegibilidad, matching, render, engine, datos |
| `app/api/cron/daily/route.ts` | Cron diario (radar + reglas) protegido por CRON_SECRET |
| `app/panel/(authed)/campanas/` | Cola de aprobación de campañas |
| `migrations/004_proactive.sql` | Plantillas, reglas, campañas, radar, opt-out |
```

Y en el Roadmap marcar la fila D de re-contacto como `✅ Fase 2b (recontactos + radar con aprobación)`.

- [ ] **Step 3: Spec §4.5 — sincronizar el fallback:** en `docs/superpowers/specs/2026-06-11-fase2-ui-y-motor-proactivo-design.md` reemplazar `fallback "¡Hola!" sin nombre` por `fallback "qué gusto saludarte" sin nombre`.

- [ ] **Step 4: `docs/GUIA-ACTIVACION-PANEL.md` — añadir al final una sección "Activar el motor proactivo (Fase 2b)":**

```markdown
## Activar el motor proactivo (Fase 2b)

1. **Supabase**: SQL Editor → ejecutar `migrations/004_proactive.sql` (ANTES del deploy).
2. **Meta**: crear las 3 plantillas de `docs/GUIA-PLANTILLAS-META.md` y esperar aprobación.
3. **Vercel**: Settings → Environment Variables → agregar `CRON_SECRET` (string largo inventado, ej. 40 caracteres aleatorios). Redeploy.
4. **Panel → Configuración → Plantillas**: registrar las 3 plantillas aprobadas (mismo nombre exacto, 2 variables las de recontacto/oportunidad).
5. **Panel → Configuración → Reglas**: crear la primera regla (ej. "Calientes 5 días", etapa Caliente, 5 días, plantilla recontacto_seguimiento, máx 10/día).
6. Al día siguiente a las 10:00 revisa **Panel → Campañas** y aprueba tu primera campaña 🎉
   (Para probar sin esperar: visita `https://TU-APP.vercel.app/api/cron/daily` con el header
   `Authorization: Bearer TU_CRON_SECRET` usando una herramienta como Postman, o pídeselo a Claude.)
```

- [ ] **Step 5: Commit**

```bash
git add README.md docs/GUIA-ACTIVACION-PANEL.md docs/superpowers/specs/2026-06-11-fase2-ui-y-motor-proactivo-design.md
git commit -m "docs: README, guía de activación 2b y sync del spec"
```

- [ ] **Step 6: CHECKLIST MANUAL DEL USUARIO** (presentar al final; NO ejecutar):

1. Migración 004 en Supabase ANTES del deploy.
2. `CRON_SECRET` en Vercel + redeploy.
3. Plantillas creadas en Meta y aprobadas → registradas en el panel.
4. Primera regla creada.
5. Disparo de prueba del cron (con el Bearer) → campaña aparece en Por aprobar.
6. Desmarcar un destinatario → Aprobar → el mensaje llega al WhatsApp de prueba → aparece en el historial del chat → `last_proactive_at` seteado.
7. Responder desde el WhatsApp de prueba → Daniela retoma normal (ventana reabierta).
8. Responder "ya no me interesa, no me escriban" → Daniela se despide y el lead queda 🔕 en la ficha.
9. Verificar que el lead 🔕 NO aparece en la siguiente campaña propuesta.

---

## Cobertura spec → tasks

| Spec | Task |
|---|---|
| §4.1 migración + RLS admin | 1 |
| §4.2 sendTemplate + registro en historial + last_proactive_at | 2, 4 |
| §4.3 elegibilidad compartida | 3, 4 |
| §4.4 cron + idempotencia + CRON_SECRET + vercel.json | 4, 5 |
| §4.5 variables {{1}}/{{2}} con fallbacks | 3 |
| §4.6 actions aprobación/rechazo/toggle/retry + CRUD plantillas/reglas + maxDuration | 7, 8 |
| §4.7 opt-out automático + toggle manual | 6, 7, 9 |
| §4.8 /panel/campanas + badge + config plantillas/reglas | 8, 9 |
| §5 radar (primera siembra, matching, misma cola) | 3, 4 |
| §6 errores (cron por pasos, fallo individual, retry) | 4, 5, 8 |
| §7 seguridad (admin-only, Bearer, RLS) | 1, 5, 7, 8, 9 |
| §8 testing | 2-7 |
| §9 pasos manuales documentados | 10 |
