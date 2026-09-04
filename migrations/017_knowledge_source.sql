-- 017 — Origen del conocimiento: 'manual' (panel/seeds) vs 'ecosystem' (sync
-- diario desde Terranova GET /daniela/knowledge). El sync reemplaza SOLO sus
-- propias filas; lo manual nunca se toca. Igual que project_media (008).
ALTER TABLE knowledge_base
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual';

CREATE INDEX IF NOT EXISTS idx_kb_source ON knowledge_base(source);

-- Verificación
SELECT source, count(*) FROM knowledge_base GROUP BY source;
