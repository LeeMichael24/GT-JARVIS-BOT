-- 018 — Cooldown de alertas internas: un lead en zona de escalamiento dispara
-- el trigger en CADA mensaje; sin freno, cada respuesta = un WhatsApp al CEO.
-- El bot alerta la primera vez y suprime las repetidas por 8 horas.
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_alert_at TIMESTAMPTZ;

-- Verificación
SELECT count(*) AS leads_totales, count(last_alert_at) AS con_alerta_previa FROM leads;
