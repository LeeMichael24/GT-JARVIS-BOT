# SDR Agent "Daniela" — Design Spec

**Date:** 2026-06-27
**Status:** Approved
**Approach:** Incremental (6 layers over existing system)

## Problem

Daniela is a reactive assistant: she only speaks when spoken to, forgets deals between conversations, can't distinguish catalog items from external requests, and never follows up autonomously. A real SDR proactively pursues leads, remembers everything, makes intelligent decisions, and only escalates when truly needed.

## Design Decisions (from user)

- Escalation target: WhatsApp to CEO directly
- Autonomy level: Autonomous with limits (max 1 follow-up/day/lead, business hours 8am-6pm, consult CEO before offering discounts or closing)
- Client types: Individual + Corporate (no referral agents for now)
- Learning system: Supabase-based "agent brain" (Obsidian concept, server-side implementation)
- Debounce: Adaptive based on conversation patterns, not fixed 4s

---

## Layer 1: Decision Engine

### What changes

The GPT-4o JSON response gets a new `"agent_action"` field. Instead of Daniela only returning text, she returns what ACTION to take.

### New response field

```json
{
  "reply": "...",
  "agent_action": {
    "type": "sell | consult_team | escalate_ceo | schedule | follow_up_needed",
    "reason": "Client asks for furnished apartment for immediate move-in, not in our catalog",
    "urgency": "normal | high | critical",
    "client_type": "individual | corporate",
    "follow_up_hint": "Send payment plan for Portacelli in 2 days if no response"
  }
}
```

### Action types

| Action | Daniela does | System does |
|--------|-------------|-------------|
| `sell` | Responds from catalog normally | Nothing extra |
| `consult_team` | Tells client "Déjame verificar con mi equipo" | Sends WhatsApp to CEO with context |
| `escalate_ceo` | Tells client "Te voy a conectar con nuestro CEO" | Sends WhatsApp to CEO marked URGENT |
| `schedule` | Confirms appointment in reply | Creates Calendar event (existing) |
| `follow_up_needed` | Responds normally | Creates a sequence entry for auto follow-up |

### Implementation

- **File:** `types/index.ts` — add `AgentAction` interface
- **File:** `services/claude/client.ts` — parse `agent_action` from response
- **File:** `services/claude/prompts.ts` — add decision framework to system prompt
- **File:** `app/api/webhook/whatsapp/route.ts` — route actions after GPT response

---

## Layer 2: Deal Memory

### What changes

After every conversation turn, GPT-4o generates a 3-line deal summary. This persists in the lead record and is injected into the next conversation, even weeks later.

### New table: `deal_summaries`

```sql
CREATE TABLE deal_summaries (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id     UUID REFERENCES leads(id) ON DELETE CASCADE NOT NULL,
  summary     TEXT NOT NULL,        -- 3-line deal context
  signals     JSONB DEFAULT '{}',   -- detected buying signals
  next_action TEXT,                 -- what Daniela should do next
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(lead_id)                   -- one summary per lead, upserted
);
```

### Signals tracked

```json
{
  "buying_signals": ["asked about payment plan", "mentioned specific unit"],
  "objections": ["price too high", "needs to consult spouse"],
  "client_profile": "corporate",
  "budget_mentioned": 400000,
  "preferred_zone": "Nuevo Cuscatlán",
  "family_mentioned": true,
  "referral_potential": false,
  "engagement_level": "high",
  "messages_per_session": 12,
  "avg_response_time_seconds": 45
}
```

### New response field

```json
{
  "deal_summary": {
    "summary": "Carlos busca inversión Airbnb $400k en zona de playa. Interesado en Foresta Townhomes modalidad ROI anual. Pidió plan de pago, pendiente enviar.",
    "signals": { ... },
    "next_action": "Enviar plan de pago de Foresta y preguntar si quiere agendar visita"
  }
}
```

### Implementation

- **File:** `types/index.ts` — add `DealSummary` interface
- **File:** `services/claude/client.ts` — parse `deal_summary`
- **File:** `services/claude/prompts.ts` — inject previous deal_summary into prompt
- **File:** `lib/supabase.ts` — `upsertDealSummary()`, `getDealSummary()`
- **File:** `app/api/webhook/whatsapp/route.ts` — save deal summary after each conversation
- **Migration:** `005_sdr_agent.sql`

---

## Layer 3: Autonomous Sequences

### What changes

When GPT-4o returns `follow_up_needed`, the system auto-enrolls the lead in a follow-up sequence. The cron (upgraded from daily to every 2 hours) checks for due follow-ups and sends them autonomously.

### Guardrails (user-approved)

- Max 1 autonomous message per lead per day
- Business hours only: 8:00 AM - 6:00 PM (America/El_Salvador)
- No discounts or closing offers without CEO consultation
- If lead responds, sequence pauses (reactive takes over)
- If lead opts out, sequence stops permanently

### New table: `sequences`

```sql
CREATE TABLE sequences (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id       UUID REFERENCES leads(id) ON DELETE CASCADE NOT NULL,
  sequence_type TEXT NOT NULL,  -- 'post_conversation' | 'nurture' | 'hot_close' | 'cold_reactivation'
  current_step  INT NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'paused', 'completed', 'cancelled')),
  context       JSONB NOT NULL DEFAULT '{}',  -- deal context for GPT to personalize
  next_fire_at  TIMESTAMPTZ,
  last_fired_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(lead_id, sequence_type)  -- one active sequence per type per lead
);
```

### Sequence definitions (in code, not DB)

```typescript
const SEQUENCES = {
  post_conversation: {
    description: 'Follow up after conversation with no response',
    steps: [
      { delay_hours: 24, purpose: 'gentle_reminder' },
      { delay_hours: 72, purpose: 'add_value' },      // share new info, urgency
      { delay_hours: 168, purpose: 'last_chance' },    // 7 days — final attempt
    ],
  },
  hot_close: {
    description: 'Push hot lead to close',
    steps: [
      { delay_hours: 4, purpose: 'send_details' },     // payment plan, specs
      { delay_hours: 24, purpose: 'create_urgency' },
      { delay_hours: 48, purpose: 'offer_meeting' },
    ],
  },
  cold_reactivation: {
    description: 'Re-engage cold leads monthly',
    steps: [
      { delay_hours: 720, purpose: 'new_offer' },      // 30 days
      { delay_hours: 1440, purpose: 'market_update' },  // 60 days
    ],
  },
}
```

### How follow-up messages are generated

NOT templates. GPT-4o generates each follow-up message using the deal_summary as context:

```
System: "Genera un mensaje de seguimiento para Carlos.
Deal: Interesado en Foresta Townhomes, pidió plan de pago hace 2 días, no respondió.
Propósito: gentle_reminder.
Reglas: máx 400 chars, tono natural, no presiones, cierra con pregunta."
```

This makes every follow-up personalized, not robotic.

### Cron upgrade

- **Current:** Runs once daily at 4PM
- **New:** Runs every 2 hours (vercel.json cron: `"0 */2 * * *"`)
- New endpoint: `/api/cron/sequences` — checks due sequences, generates and sends messages
- Existing `/api/cron/daily` stays for campaigns/radar

### Implementation

- **File:** `types/index.ts` — add `Sequence` interface
- **File:** `lib/sequences.ts` — NEW: sequence engine (getDueSequences, advanceStep, pauseSequence)
- **File:** `app/api/cron/sequences/route.ts` — NEW: cron handler
- **File:** `app/api/webhook/whatsapp/route.ts` — pause active sequences when lead responds
- **File:** `vercel.json` — add cron schedule
- **Migration:** `005_sdr_agent.sql`

---

## Layer 4: Team Notifications

### What changes

When Daniela decides `consult_team` or `escalate_ceo`, the system sends a WhatsApp message to the CEO's personal number with full context.

### Message format

**Consultation:**
```
🔔 Daniela necesita tu apoyo

Cliente: Carlos (+503 7890 1234)
Solicitud: Busca apartamento amueblado para mudarse en 1 mes. No tenemos esto en catálogo.
Deal: Interesado en inversión $400k, ya calificado como HOT.
Daniela le dijo: "Déjame verificar con mi equipo y te confirmo durante el día."

Responde a este chat para que Daniela sepa qué ofrecerle.
```

**Escalation (urgent):**
```
🚨 LEAD HOT — Acción inmediata

Cliente: María Enterprises (+503 7654 3210)
Tipo: CORPORATIVO — quiere 5 unidades en Portacelli
Presupuesto: $1.2M confirmado
Timeline: Cierre este mes
Daniela le dijo: "Te voy a conectar con nuestro CEO Mike Fuentes."

⚡ Este cliente está listo para cerrar.
```

### CEO phone config

New env var: `CEO_PHONE_NUMBER` — the WhatsApp number to receive notifications.

### Implementation

- **File:** `services/whatsapp/client.ts` — add `sendInternalNotification()` (reuses existing `sendText`)
- **File:** `app/api/webhook/whatsapp/route.ts` — trigger notification based on `agent_action.type`
- **Env:** `CEO_PHONE_NUMBER`

---

## Layer 5: Media Handling

### What changes

Daniela can now process voice notes and images, and send interactive WhatsApp messages (buttons, lists).

### Audio (voice notes)

1. Webhook receives audio message → download media from WhatsApp API
2. Send to OpenAI Whisper API for transcription
3. Feed transcription as text to GPT-4o (same flow as text messages)
4. Respond as normal

### Images

1. Webhook receives image → download media
2. Send to GPT-4o Vision as part of the conversation
3. GPT-4o can describe what it sees and respond accordingly
4. Common cases: client sends screenshot of listing, bank receipt, location photo

### Interactive messages (buttons)

After key moments, Daniela sends buttons instead of plain text:

```json
{
  "type": "interactive",
  "interactive": {
    "type": "button",
    "body": { "text": "¿Te gustaría conocer más sobre Portacelli?" },
    "action": {
      "buttons": [
        { "type": "reply", "reply": { "id": "btn_yes", "title": "Sí, cuéntame" }},
        { "type": "reply", "reply": { "id": "btn_visit", "title": "Agendar visita" }},
        { "type": "reply", "reply": { "id": "btn_other", "title": "Ver otras opciones" }}
      ]
    }
  }
}
```

GPT-4o decides when to use buttons via a new response field:
```json
{
  "interactive_buttons": [
    { "id": "btn_1", "title": "Sí, cuéntame" },
    { "id": "btn_2", "title": "Agendar visita" }
  ]
}
```

### Implementation

- **File:** `services/whatsapp/client.ts` — add `downloadMedia()`, `sendInteractiveButtons()`
- **File:** `services/whatsapp/webhook.ts` — handle audio/image message types, extract media URLs
- **File:** `services/openai/whisper.ts` — NEW: audio transcription
- **File:** `app/api/webhook/whatsapp/route.ts` — media download + transcription pipeline
- **File:** `services/claude/prompts.ts` — add button instruction to prompt
- **File:** `services/claude/client.ts` — parse `interactive_buttons`

---

## Layer 6: Agent Brain (Learning System)

### What changes

Daniela maintains a persistent "brain" — observations about what works, client patterns, and performance metrics. The team sees this in the panel and can annotate/correct.

### New table: `agent_brain`

```sql
CREATE TABLE agent_brain (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category    TEXT NOT NULL,    -- 'observation' | 'pattern' | 'correction' | 'metric'
  topic       TEXT NOT NULL,    -- 'objection_handling' | 'closing_technique' | 'client_behavior'
  content     TEXT NOT NULL,
  source      TEXT NOT NULL DEFAULT 'agent',  -- 'agent' | 'team'
  lead_id     UUID REFERENCES leads(id),      -- nullable, for lead-specific observations
  confidence  FLOAT DEFAULT 0.5,               -- 0-1, increases with confirmation
  active      BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_brain_category ON agent_brain(category, active);
```

### New table: `agent_metrics`

```sql
CREATE TABLE agent_metrics (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start    DATE NOT NULL,
  period_end      DATE NOT NULL,
  total_conversations  INT DEFAULT 0,
  leads_qualified      INT DEFAULT 0,
  meetings_scheduled   INT DEFAULT 0,
  escalations          INT DEFAULT 0,
  follow_ups_sent      INT DEFAULT 0,
  follow_ups_replied   INT DEFAULT 0,  -- response rate
  avg_response_time_s  FLOAT,
  avg_messages_to_qualify INT,
  top_objections       JSONB DEFAULT '[]',
  top_projects_asked   JSONB DEFAULT '[]',
  conversion_by_stage  JSONB DEFAULT '{}',
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(period_start, period_end)
);
```

### How Daniela learns

1. After each conversation, GPT-4o generates observations:
   ```json
   {
     "brain_observations": [
       {
         "category": "pattern",
         "topic": "closing_technique",
         "content": "Mentioning remaining units created urgency — client asked for reservation process"
       }
     ]
   }
   ```

2. Team can add corrections from the panel (source: 'team'):
   - "No ofrezcas descuento sin consultar primero"
   - "Cuando pregunten por Foresta, siempre menciona el club de golf"

3. High-confidence observations (confirmed by outcomes) get injected into the system prompt as learned behaviors.

4. Weekly metrics aggregation shows: conversations, qualification rate, meeting rate, follow-up response rate, top objections.

### Panel integration

New section in the panel: "Cerebro de Daniela"
- List of observations with confidence scores
- Team can approve/reject/edit observations
- Performance dashboard (metrics over time)
- Correction input ("Teach Daniela...")

### Implementation

- **File:** `types/index.ts` — add `BrainObservation`, `AgentMetrics` interfaces
- **File:** `lib/agent-brain.ts` — NEW: CRUD for brain entries, metrics aggregation
- **File:** `services/claude/client.ts` — parse `brain_observations`
- **File:** `services/claude/prompts.ts` — inject high-confidence learnings into prompt
- **File:** `app/api/cron/daily/route.ts` — add daily metrics aggregation
- **File:** `components/panel/BrainView.tsx` — NEW: panel UI for brain
- **Migration:** `005_sdr_agent.sql`

---

## Layer 7: Adaptive Debounce

### What changes

Replace the fixed 4-second debounce with an intelligent system that learns each client's typing pattern.

### How it works

1. Track each lead's messaging pattern in `deal_summaries.signals`:
   ```json
   {
     "avg_response_time_seconds": 45,
     "messages_per_burst": 3.2,
     "avg_gap_between_burst_msgs_ms": 2100,
     "typing_pattern": "multi_message"  // "single_message" | "multi_message" | "voice_note"
   }
   ```

2. First interaction: use default 4s debounce (current behavior)

3. After first conversation: calculate optimal debounce per lead:
   - `single_message` pattern (sends 1 complete message): debounce = 2s
   - `multi_message` pattern (sends 3-5 short messages): debounce = avg_gap * 2.5 (typically 5-8s)
   - If lead typically sends voice notes: wait longer (8s) since recording takes time

4. Implementation: `getDebounceMs(leadId)` function that checks cached pattern or falls back to 4s default.

### Data collection

Every burst, record:
- Number of messages in the burst
- Time gaps between messages
- Update rolling average in deal_summaries.signals

### Implementation

- **File:** `lib/debounce.ts` — NEW: adaptive debounce logic
- **File:** `app/api/webhook/whatsapp/route.ts` — replace fixed `DEBOUNCE_MS` with `getDebounceMs(lead.id)`
- **File:** `lib/supabase.ts` — update typing pattern stats after each burst

---

## Migration: `005_sdr_agent.sql`

Single migration file containing all new tables:
- `deal_summaries`
- `sequences`
- `agent_brain`
- `agent_metrics`
- RLS policies (service role for bot, admin read from panel)
- Indexes

---

## New Environment Variables

| Variable | Purpose |
|----------|---------|
| `CEO_PHONE_NUMBER` | WhatsApp number for CEO notifications |

No other new env vars — Whisper uses existing `OPENAI_API_KEY`, Calendar already configured.

---

## File Change Summary

| File | Change type |
|------|------------|
| `types/index.ts` | MODIFY — add AgentAction, DealSummary, Sequence, BrainObservation, AgentMetrics |
| `services/claude/prompts.ts` | MODIFY — decision framework, deal memory injection, button instructions, brain learnings |
| `services/claude/client.ts` | MODIFY — parse agent_action, deal_summary, brain_observations, interactive_buttons |
| `app/api/webhook/whatsapp/route.ts` | MODIFY — action routing, media pipeline, notification trigger, sequence management, adaptive debounce |
| `services/whatsapp/client.ts` | MODIFY — add downloadMedia(), sendInteractiveButtons(), sendInternalNotification() |
| `services/whatsapp/webhook.ts` | MODIFY — handle audio/image/interactive message types |
| `lib/supabase.ts` | MODIFY — add deal summary and sequence CRUD |
| `lib/sequences.ts` | NEW — sequence engine |
| `lib/agent-brain.ts` | NEW — brain CRUD and metrics |
| `lib/debounce.ts` | NEW — adaptive debounce |
| `services/openai/whisper.ts` | NEW — audio transcription |
| `app/api/cron/sequences/route.ts` | NEW — sequence cron handler |
| `app/api/cron/daily/route.ts` | MODIFY — add metrics aggregation |
| `vercel.json` | MODIFY — add sequence cron |
| `components/panel/BrainView.tsx` | NEW — panel UI for agent brain |
| `migrations/005_sdr_agent.sql` | NEW — all new tables |

---

## Implementation Order

1. Migration + types (foundation)
2. Decision engine (Layer 1) — immediate impact on response quality
3. Deal memory (Layer 2) — Daniela remembers everything
4. Team notifications (Layer 4) — CEO knows what's happening
5. Adaptive debounce (Layer 7) — better timing
6. Autonomous sequences (Layer 3) — proactive follow-ups
7. Media handling (Layer 5) — audio + images + buttons
8. Agent brain (Layer 6) — learning system + panel UI
