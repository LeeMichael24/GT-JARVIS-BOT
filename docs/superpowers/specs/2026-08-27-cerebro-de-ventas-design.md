# Cerebro de Ventas — Design Spec

**Date:** 2026-08-27
**Status:** Approved
**Approach:** Extend existing systems (`escalation_rules`, `prompt_blocks`, `knowledge_base`, `lib/reflection.ts`) — no new subsystems.

## Problem

Mike (CEO) wants Daniela to operate as a complete, ultra-capable sales agent: she should master the active catalog, investment returns, presale conditions and negotiation/closing technique, read emotional and behavioral cues, and radiate warmth — while handing off to a human at a small, well-defined set of moments rather than attempting full autonomous legal/financial closing.

The 2026-08-27 audit (Fable 5, see `project_enterprise_audit.md` memory / published artifact) found two problems that directly shape this spec:

1. **Meetings are scheduled silently.** When Daniela books a Google Calendar event (`app/api/webhook/whatsapp/route.ts:433-453`), nothing notifies the team unless the model *also* independently emitted `escalate_ceo`/`consult_team` in the same turn. A scheduled meeting is exactly the kind of event that should always reach a human.
2. **The knowledge base hands out real banking details unsupervised.** `migrations/002_knowledge_base.sql:56` (`proceso_reserva` entry) instructs Daniela to literally share Grupo Terranova's bank account number as step 2 of the reservation process, with no human in the loop. This is the same pattern behind the most common real-estate wire-fraud vector internationally (a bot/email hands out payment instructions with no human verification) — it is being closed as part of this spec, not deferred.

## Design decisions (from user, 2026-08-27 conversation)

- **Closing boundary:** Daniela closes the *next step* (booking a call/visit, a verbal commitment to move forward) — never the legal or financial close. The team gets notified automatically the moment a hard-close signal appears, unconditionally — not dependent on the model also choosing `escalate_ceo` that turn.
- **Hard-close signals** (trigger immediate handoff notification):
  - A meeting (virtual or in-person) is requested or confirmed as scheduled.
  - Any mention of a bank account or money transfer.
  - Legal documents: reservation paperwork, *promesa de venta*, *promesa de compraventa*, *escritura*, *contrato*, *firma*, notary involvement.
  - Final price, or negotiating terms outside the published standard.
  - Existing conditions kept as-is: 3+ units, competitor mention, special financing request.
- **`'descuento'` is no longer a blind auto-escalate keyword.** The published standard discount becomes knowledge Daniela can share with confidence; she escalates only when the client asks for something beyond it.
- **Tone flexes by client read, not by a stored field:** warmer/more spontaneous for an individual buyer, equally warm but more composed and data-led for a corporate/institutional investor. Implemented as a same-turn reading instruction (see Non-goals below for why no new persisted field is used).
- **Continuous learning stays light:** extend the existing nightly reflection (`lib/reflection.ts`) to also capture tone/phrasing observations, reusing the confidence/promotion pipeline already built — no new architecture.
- **Open item, non-blocking:** the correct Portacelli down-payment discount is unconfirmed — `migrations/002_knowledge_base.sql` says 15% prima / 20% cash discount, `migrations/007_project_scripts_media.sql` (script) says 3% at 30 days / 12% in installments. This spec deactivates the ambiguous entry with a `TODO: confirmar con Mike` marker rather than guessing; Mike supplies the real number separately.

## Non-goals (deferred to the "Confiabilidad del sistema" follow-up project)

Sequence persistence-until-explicit-no (R5), per-lead summary reports beyond escalation (R8), a manual tag/button-based human handoff independent of sending a message (R9), score-driven follow-up cadence (R4), the cross-project knowledge-base contamination fix / `project_slug` scoping bug (R6), the media type-blind silent-failure bug (R10), adding `'alquiler'` as a `purpose` option (R1), and the investment-eligible-project gate (R12, blocked on Mike naming the project). None of these are touched here.

**Why tone-flex doesn't get a persisted `client_type` column:** `client_type` (`individual`/`corporate`) is currently a per-turn model output (`AgentAction.client_type`, `types/index.ts:167`), not a field on `Lead`. Persisting it and re-injecting it as a prompt placeholder would need a new migration + read/write plumbing for a purely cosmetic tone knob. Instead, the tone instruction teaches Daniela to read the same-turn cues (company name, institutional language, multi-unit interest, formal register) she already partially uses to decide `client_type`, and adjust warmth accordingly in that same response. Simpler, no schema change, consistent with how she already infers `client_type` fresh each turn.

## Architecture — three layers over the existing system

### Layer 1 — Hard-close triggers

**1a. Meetings always notify (code change).**
In `app/api/webhook/whatsapp/route.ts`, right after a calendar event is successfully created (current block ~433-453), call `sendInternalNotification` unconditionally — do not gate it on `agent_action.type`. Build a synthetic `AgentAction` for the call:
```ts
await sendInternalNotification({
  leadName: lead.name ?? claudeResponse.name_captured ?? 'Cliente',
  leadPhone: lead.phone,
  action: {
    type: 'escalate_ceo',
    reason: `Reunión agendada (${typeLabel[mtg.meeting_type]}) — ${mtg.datetime_iso}`,
    urgency: 'high',
    client_type: claudeResponse.agent_action?.client_type ?? 'individual',
    follow_up_hint: null,
  },
  botReply: claudeResponse.reply,
  dealSummary: claudeResponse.deal_summary?.summary ?? null,
})
```
Wrap in its own `try/catch` (existing pattern) so a notification failure never blocks the calendar event or the reply.

**1b. New escalation_rules keyword/topic rows (migration `013_hard_close_triggers.sql`).**
- Deactivate the blind trigger: `UPDATE escalation_rules SET active = false WHERE trigger_type = 'keyword' AND trigger_value = 'descuento';` (keep the row for history/audit rather than deleting).
- Insert new rows, `action = 'escalate_ceo'`:
  - `keyword` — `'cuenta bancaria'`, `'número de cuenta'`, `'transferencia'`, `'depósito'` (financial — money movement)
  - `keyword` — `'promesa de venta'`, `'promesa de compraventa'`, `'documento de reserva'`, `'notario'` (legal instruments)
  - Deliberately **not** adding a bare `'reserva'` keyword — Daniela's own urgency copy says things like "se están reservando rápido" constantly; a bare match would false-positive on ordinary sales talk. The specific phrases above only appear when the conversation has actually reached the paperwork stage.
- Leave `'precio final'`, `'escritura'`, `'contrato'`, `'firma'`, and the `condition`/`topic` rows (`multiple_units`, `competitor_mention`, `financiamiento_especial`) untouched.

**1c. Reinforce in the prompt (defense in depth).**
Update `decision_framework` and `communication_style` blocks in `lib/prompt-blocks.ts` so the model's own judgment matches the hard rules even when exact keywords aren't used verbatim: explicitly list "agendar una reunión", "hablar de cuenta bancaria o transferencia", and "documentos de reserva/promesa de venta/compraventa" as `escalate_ceo` conditions, alongside the existing ones. Add a line affirming the standard discount is free knowledge, not an escalation trigger.

**1d. Remove the literal bank account from the knowledge base (migration, same file as 1b).**
`UPDATE knowledge_base SET content = '...' WHERE topic = 'proceso_reserva';` — replace step 2 ("Se comparte cuenta bancaria: CUENTA BAC...") with an instruction to connect the client with the team to complete payment securely; Daniela never states account details herself. Keep the rest of the process (DUI, receipt, notarized document, signing timeline) intact.

**1e. Deactivate the ambiguous prima/discount row (migration, same file).**
Mark the `migrations/002` prima/discount entry `active = false` with an updated description noting `TODO: confirmar cifra real con Mike (15%/20% vs 3%/12%)`, so Daniela doesn't quote either figure until confirmed. Do not touch `migrations/007`'s script content (out of scope, project-specific script).

### Layer 2 — Sales methodology & emotional-reading

Two new blocks added to `PROMPT_BLOCK_DEFS` / the defaults object in `lib/prompt-blocks.ts`, following the existing per-block pattern (key, title, description, default text):

- **`emotional_intelligence`** — signal → response mapping: hesitation/long silence → give space, don't push, offer value with no ask; repeated skepticism → real social proof (units sold, transparency about the triple legal shield); short/fast messages → get to the point, propose a concrete next step; enthusiasm (emoji, caps, detail questions) → feed it, go deeper, suggest reserving; price sensitivity → lead with monthly payment before total price. A same-turn line teaching the corporate-vs-individual tone read described above lives here too, since it's the same "read the person, adapt" skill.
- **`closing_techniques`** — closing is the next correct step (booking the call/visit), never the contract. Techniques: closed alternative ("¿martes o miércoles para la videollamada con Michael?"), summary + commitment, presenting 2-3 curated options instead of a binary yes/no (unit A vs B, ROI-anual vs Airbnb model, payment plan choices), value anchor before price anchor.

The existing `investment_guide` block gets extended (not replaced) with a working glossary Daniela can use confidently with sophisticated investors: ROI, flujo de caja, plusvalía, apalancamiento, financiamiento directo del desarrollador, preventa vs. entrega, amortización, punto de equilibrio — defined in plain LatAm-investor language, consistent with the models already referenced there (ROI anual, Airbnb, plusvalía). The block's existing hardcoded-price caveat is left as-is (out of scope, tracked in the Confiabilidad project as P2).

### Layer 3 — Continuous tone-learning

Extend the nightly reflection prompt in `lib/reflection.ts` so it explicitly also looks for phrasing/tone observations ("this phrasing landed well", "the client seemed put off by X"), not only sales-fact patterns. Reuses the existing `agent_brain` write path, confidence scoring (0.5 default, `source='agent'`), dedupe-by-topic, and auto-promotion-by-convergence machinery from the 6th audit — no new tables, no new promotion logic.

## Data flow (illustrative — bank-account mention)

1. Client writes "¿a qué cuenta hago la transferencia?"
2. `matchKeywordRules` matches `'transferencia'` → `formatEscalationRulesForPrompt` injects the mandatory-escalation block into this turn's prompt.
3. Model's reply avoids stating any account details (KB no longer contains them; `decision_framework` reinforces it) and instead offers to connect the client with the team; `agent_action.type = 'escalate_ceo'`.
4. `sendInternalNotification` fires to the CEO/team with lead identity, deal summary, and Daniela's exact reply — same mechanism already in production for `escalate_ceo`/`consult_team`.

## Error handling

No new failure modes: Layer 1a reuses the existing `sendInternalNotification` try/catch (a failed notification logs and never blocks the calendar event or the client's reply, matching current behavior for `escalate_ceo`). Layer 1b/1d/1e are plain data migrations — if they fail to run, the system stays on current (audited, imperfect) behavior rather than crashing, consistent with the project's fallback-safe philosophy for `prompt_blocks`/`knowledge_base`.

## Testing

- `tests/webhook-route.test.ts` (or wherever schedule_meeting is currently covered): assert `sendInternalNotification` is called whenever `schedule_meeting.requested` is true, regardless of `agent_action.type`.
- Escalation-rules unit tests: new keyword rows match the intended phrases and do **not** match ordinary sales copy (e.g. "se están reservando rápido" must NOT match); `'descuento'` no longer matches (inactive).
- Full existing suite (395+ tests) run green before calling this done.
- Manual read-through of the updated `proceso_reserva` KB content and the new/edited prompt blocks for tone and factual consistency with the rest of the brand voice.

## Open items requiring Mike (do not block implementation)

1. Correct Portacelli down-payment discount figure (15%/20% vs 3%/12%) — ships deactivated with a TODO until he confirms.
