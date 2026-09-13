-- ────────────────────────────────────────────────────────────
-- 022 — Reloj de secuencias desde Supabase
--
-- En el plan Hobby, Vercel solo corre crons 1 vez al día (±59 min), así que
-- el seguimiento "caliente" de 4 h nunca llega a tiempo. Supabase Cron llama
-- a /api/cron/sequences cada 15 minutos de 8:00 a 17:45 (hora de El Salvador).
--
-- El cron de Vercel puede seguir existiendo: cada corrida RECLAMA la secuencia
-- antes de enviar, así que dos relojes a la vez no mandan el mensaje doble.
--
-- ANTES DE CORRER: reemplaza los dos valores marcados con <<< >>>.
--   · URL: el dominio de producción en Vercel (sin / al final)
--   · Secreto: el valor de CRON_SECRET en Vercel → Settings → Environment Variables
-- Los secretos quedan en Supabase Vault, nunca en este archivo ni en git.
-- Si ya los creaste antes, usa vault.update_secret en lugar de create_secret.
-- ────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

SELECT vault.create_secret('<<<https://TU-DOMINIO-DE-PRODUCCION>>>', 'daniela_url');
SELECT vault.create_secret('<<<VALOR-DE-CRON_SECRET>>>', 'daniela_cron_secret');

-- Re-ejecutable: si el trabajo ya existe, se reemplaza
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'daniela-secuencias';

-- 14-23 UTC = 8:00-17:45 en El Salvador (UTC-6)
SELECT cron.schedule(
  'daniela-secuencias',
  '*/15 14-23 * * *',
  $$
  SELECT net.http_get(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'daniela_url') || '/api/cron/sequences',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'daniela_cron_secret')
    ),
    timeout_milliseconds := 290000
  );
  $$
);

-- Verificación inmediata
SELECT jobid, jobname, schedule, active FROM cron.job WHERE jobname = 'daniela-secuencias';

-- Verificación a los 15-30 minutos (en horario laboral):
--   SELECT status, return_message, start_time FROM cron.job_run_details
--   WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'daniela-secuencias')
--   ORDER BY start_time DESC LIMIT 5;
--   SELECT status_code, error_msg, created FROM net._http_response ORDER BY created DESC LIMIT 5;
--   → status_code 200 y una fila nueva en cron_runs con job = 'sequences'.
--
-- Deshacer:
--   SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'daniela-secuencias';
