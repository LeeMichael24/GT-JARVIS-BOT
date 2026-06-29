# Graph Report - .  (2026-06-11)

## Corpus Check
- 86 files · ~60,709 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 414 nodes · 857 edges · 24 communities (15 shown, 9 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 14 edges (avg confidence: 0.91)
- Token cost: 120,902 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Claude AI Client & Intent|Claude AI Client & Intent]]
- [[_COMMUNITY_Docs & Activation Guides|Docs & Activation Guides]]
- [[_COMMUNITY_Panel Lead Data & Chat|Panel Lead Data & Chat]]
- [[_COMMUNITY_Auth & Panel Actions|Auth & Panel Actions]]
- [[_COMMUNITY_Proactive Eligibility & Cron|Proactive Eligibility & Cron]]
- [[_COMMUNITY_Package Dependencies|Package Dependencies]]
- [[_COMMUNITY_Proactive Data Layer|Proactive Data Layer]]
- [[_COMMUNITY_Panel Layout & Pages|Panel Layout & Pages]]
- [[_COMMUNITY_Prompt Building|Prompt Building]]
- [[_COMMUNITY_TypeScript Config|TypeScript Config]]
- [[_COMMUNITY_Projects Catalog & Cache|Projects Catalog & Cache]]
- [[_COMMUNITY_Webhook Tests|Webhook Tests]]
- [[_COMMUNITY_App Root Layout|App Root Layout]]
- [[_COMMUNITY_Proxy & Public Paths|Proxy & Public Paths]]
- [[_COMMUNITY_ESLint Config|ESLint Config]]
- [[_COMMUNITY_Next.js Config|Next.js Config]]
- [[_COMMUNITY_PostCSS Config|PostCSS Config]]
- [[_COMMUNITY_Proactive Cost Parsing|Proactive Cost Parsing]]
- [[_COMMUNITY_Brand Logos|Brand Logos]]
- [[_COMMUNITY_File Icon|File Icon]]
- [[_COMMUNITY_Globe Icon|Globe Icon]]
- [[_COMMUNITY_Window Icon|Window Icon]]

## God Nodes (most connected - your core abstractions)
1. `getServiceClient()` - 46 edges
2. `processMessage()` - 22 edges
3. `Lead` - 18 edges
4. `compilerOptions` - 16 edges
5. `fail()` - 13 edges
6. `getSessionMember()` - 13 edges
7. `Spec Fase 2 — UI pulida y Motor proactivo` - 12 edges
8. `sendHumanMessage()` - 11 edges
9. `requireMember()` - 11 edges
10. `updateLead()` - 11 edges

## Surprising Connections (you probably didn't know these)
- `Roadmap CRM de 6 fases` --semantically_similar_to--> `Roadmap post-MVP (fases B-F)`  [INFERRED] [semantically similar]
  docs/superpowers/specs/2026-06-10-panel-crm-fase1-design.md → README.md
- `processMessage()` --calls--> `buildSystemPrompt()`  [EXTRACTED]
  app/api/webhook/whatsapp/route.ts → services/claude/prompts.ts
- `processMessage()` --calls--> `detectProjectFromMessage()`  [EXTRACTED]
  app/api/webhook/whatsapp/route.ts → services/projects/gt-api.ts
- `ChatPage()` --calls--> `getSessionMember()`  [EXTRACTED]
  app/panel/(authed)/chat/[leadId]/page.tsx → lib/auth.ts
- `PanelLayout()` --calls--> `getSessionMember()`  [EXTRACTED]
  app/panel/(authed)/layout.tsx → lib/auth.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Flujo del motor proactivo: cron → radar/reglas → cola de aprobación → envío de plantillas** — specs_2026_06_11_fase2_ui_y_motor_proactivo_design_cron_diario, specs_2026_06_11_fase2_ui_y_motor_proactivo_design_radar_oportunidades, specs_2026_06_11_fase2_ui_y_motor_proactivo_design_reglas_recontacto, specs_2026_06_11_fase2_ui_y_motor_proactivo_design_cola_aprobacion, plans_2026_06_11_fase2b_motor_proactivo_send_template, specs_2026_06_11_fase2_ui_y_motor_proactivo_design_elegibilidad [EXTRACTED 1.00]
- **Takeover humano: guards de rol + ventana 24h + pausa del bot + rol human** — specs_2026_06_10_panel_crm_fase1_design_takeover_flow, plans_2026_06_10_panel_crm_fase1_takeover, plans_2026_06_10_panel_crm_fase1_ventana_24h, plans_2026_06_10_panel_crm_fase1_auth_guards, plans_2026_06_10_panel_crm_fase1_rol_human [EXTRACTED 1.00]
- **Roadmap CRM por fases: Fase 1 panel base → Fase 2a UI → Fase 2b motor proactivo** — specs_2026_06_10_panel_crm_fase1_design_roadmap_6_fases, plans_2026_06_10_panel_crm_fase1_plan, plans_2026_06_11_fase2a_ui_plan, plans_2026_06_11_fase2b_motor_proactivo_plan [EXTRACTED 1.00]
- **Default Next.js create-next-app starter template assets in public/** — public_file, public_globe, public_next, public_vercel, public_window [INFERRED 0.95]

## Communities (24 total, 9 thin omitted)

### Community 0 - "Claude AI Client & Intent"
Cohesion: 0.06
Nodes (49): callClaude(), parseClaudeResponse(), parseMeetingRequest(), CATALOG_SIGNALS, classifyIntent(), CONTINUATION_EXACT, CONTINUATION_STARTS, extractLastBotMessage() (+41 more)

### Community 1 - "Docs & Activation Guides"
Cohesion: 0.07
Nodes (44): Next.js 16 Breaking Changes Mandate, CLAUDE.md Project Instructions, Guía de activación del Panel CRM (Fase 1), Migración 003 (paso manual Supabase), Guía: plantillas de recontacto en Meta, Plantilla novedades_inversion, Plantilla nueva_oportunidad (radar), Plantilla recontacto_seguimiento (+36 more)

### Community 2 - "Panel Lead Data & Chat"
Cohesion: 0.11
Nodes (31): ChatPage(), getLeadBundle(), InboxLead, LeadBundle, leadVisible(), isWithin24h(), ChatView(), ERROR_TEXT (+23 more)

### Community 3 - "Auth & Panel Actions"
Cohesion: 0.12
Nodes (34): requireAdmin(), requireMember(), SessionMember, createSupabaseServerClient(), ActionResult, addLeadTag(), addNote(), assignLead() (+26 more)

### Community 4 - "Proactive Eligibility & Cron"
Cohesion: 0.09
Nodes (28): GET(), LeadWithTags, isLeadEligible(), matchesRule(), rankByStage(), STAGE_PRIORITY, dayStartIso(), realDeps (+20 more)

### Community 5 - "Package Dependencies"
Cohesion: 0.05
Nodes (36): dependencies, googleapis, next, openai, react, react-dom, @supabase/ssr, @supabase/supabase-js (+28 more)

### Community 6 - "Proactive Data Layer"
Cohesion: 0.14
Nodes (28): getServiceClient(), CampaignForSend, claimCampaign(), claimRecipient(), countPendingCampaigns(), createCampaign(), getCampaignForSend(), getTemplateById() (+20 more)

### Community 7 - "Panel Layout & Pages"
Cohesion: 0.14
Nodes (13): PanelLayout(), InboxPage(), ConfigPage(), getSessionMember(), listAllTags(), listInboxLeads(), listTeam(), createSupabaseBrowserClient() (+5 more)

### Community 8 - "Prompt Building"
Cohesion: 0.17
Nodes (19): MessageIntent, buildCatalogSection(), buildIntentInstruction(), buildQualSection(), buildSystemPrompt(), formatPriceRange(), formatProjectFull(), formatProjectLine() (+11 more)

### Community 9 - "TypeScript Config"
Cohesion: 0.10
Nodes (19): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+11 more)

### Community 10 - "Projects Catalog & Cache"
Cohesion: 0.16
Nodes (9): Cache, CacheEntry, createCache(), detectProjectFromMessage(), normalise(), projectCache, projectsCache, SYNONYMS (+1 more)

### Community 11 - "Webhook Tests"
Cohesion: 0.25
Nodes (5): ai, baseLead, db, pending, wa

### Community 12 - "App Root Layout"
Cohesion: 0.40
Nodes (3): geistMono, geistSans, metadata

## Knowledge Gaps
- **126 isolated node(s):** `DEBOUNCE_MS`, `geistSans`, `geistMono`, `metadata`, `STAGES` (+121 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `getServiceClient()` connect `Proactive Data Layer` to `Claude AI Client & Intent`, `Panel Lead Data & Chat`, `Auth & Panel Actions`, `Panel Layout & Pages`?**
  _High betweenness centrality (0.048) - this node is a cross-community bridge._
- **Why does `Lead` connect `Proactive Eligibility & Cron` to `Claude AI Client & Intent`, `Panel Lead Data & Chat`, `Auth & Panel Actions`, `Proactive Data Layer`, `Prompt Building`?**
  _High betweenness centrality (0.026) - this node is a cross-community bridge._
- **Why does `updateLead()` connect `Claude AI Client & Intent` to `Auth & Panel Actions`, `Proactive Eligibility & Cron`, `Proactive Data Layer`?**
  _High betweenness centrality (0.013) - this node is a cross-community bridge._
- **What connects `DEBOUNCE_MS`, `geistSans`, `geistMono` to the rest of the system?**
  _128 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Claude AI Client & Intent` be split into smaller, more focused modules?**
  _Cohesion score 0.06144393241167435 - nodes in this community are weakly interconnected._
- **Should `Docs & Activation Guides` be split into smaller, more focused modules?**
  _Cohesion score 0.06976744186046512 - nodes in this community are weakly interconnected._
- **Should `Panel Lead Data & Chat` be split into smaller, more focused modules?**
  _Cohesion score 0.10520487264673312 - nodes in this community are weakly interconnected._