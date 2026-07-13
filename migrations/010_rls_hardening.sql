-- ────────────────────────────────────────────────────────────
-- 010 — RLS Hardening: knowledge_base + escalation_rules
-- Ambas tablas se crearon SIN Row Level Security (002 y 006). Como la
-- anon key de Supabase es pública, cualquiera podía leerlas vía la API
-- REST (PostgREST): el playbook de ventas completo y las reglas de
-- escalación quedaban expuestos. Esta migración cierra ese hueco.
--
-- Por qué es seguro aplicarla en producción:
--   · El bot y las server actions del panel usan la service_role key,
--     que IGNORA RLS → sus lecturas y escrituras no cambian en nada.
--   · Las lecturas desde el navegador del panel van con sesión de
--     Supabase Auth (rol authenticated) → la política SELECT de abajo
--     las mantiene funcionando igual.
--   · El rol anon (público, sin sesión) queda sin política → 0 filas.
--
-- Sin políticas INSERT/UPDATE/DELETE para authenticated: toda escritura
-- va por server actions con service role (igual que en 003/007/009).
--
-- Re-ejecutable: ENABLE ROW LEVEL SECURITY es no-op si ya está activo,
-- y cada CREATE POLICY va precedido de su DROP POLICY IF EXISTS.
-- Ejecutar en: Supabase Dashboard → SQL Editor → New Query
-- ────────────────────────────────────────────────────────────

-- ── knowledge_base (playbook de ventas — creada en 002) ──────
ALTER TABLE knowledge_base ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS knowledge_base_select ON knowledge_base;
CREATE POLICY knowledge_base_select ON knowledge_base FOR SELECT TO authenticated
  USING (true);

-- ── escalation_rules (reglas de escalación — creada en 006) ──
ALTER TABLE escalation_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS escalation_rules_select ON escalation_rules;
CREATE POLICY escalation_rules_select ON escalation_rules FOR SELECT TO authenticated
  USING (true);

-- ── Inventario verificado (auditoría jul 2026) ───────────────
-- Todas las demás tablas ya tienen RLS + política; no requieren cambios:
--   leads, conversations                       → schema.sql (RLS) + 003 (políticas)
--   team_members, tags, lead_tags, lead_notes  → 003
--   message_templates, recontact_rules, campaigns,
--   campaign_recipients, known_listings        → 004
--   deal_summaries, sequences, agent_brain, agent_metrics → 005
--   project_scripts, project_media             → 007
--   agent_settings                             → 009
-- (008 no crea tablas: solo agrega columnas a project_media.)
