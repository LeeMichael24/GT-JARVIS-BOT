-- ────────────────────────────────────────────────────────────
-- 008 — Origen del media (manual vs sincronizado del Ecosistema)
-- Permite que el sync desde api.grupoterranovasv.com administre SU
-- subconjunto de filas sin pisar las que se cargan a mano/panel.
-- ────────────────────────────────────────────────────────────

ALTER TABLE project_media
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual';
-- 'manual'    = sembrado por SQL o el panel (lo administra el equipo GT)
-- 'ecosystem' = sincronizado desde el Ecosistema Terranova (lo administra el sync)

-- Guardamos también el slug del listing para trazabilidad y match exacto futuro
ALTER TABLE project_media
  ADD COLUMN IF NOT EXISTS project_slug text;
