-- ═══════════════════════════════════════════════════════════════════════════
-- 008_reportes_cron.sql — Envio automatico de reportes por correo
--
-- UN job diario llama a la Edge Function `send-report` en modo 'auto'; la
-- funcion decide si hoy toca el envio semanal y/o mensual segun app_config
-- (Configuracion > Reportes por correo), en hora de Paraguay.
--
-- NO correr tal cual: reemplazar <PROJECT_REF> y <CRON_SECRET> (el mismo valor
-- que el secret CRON_SECRET de la funcion). El secreto real NO va al repo.
-- 11:00 UTC = 08:00 en Paraguay (UTC-3, sin horario de verano).
-- ═══════════════════════════════════════════════════════════════════════════
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('send-report-daily')
where exists (select 1 from cron.job where jobname = 'send-report-daily');

select cron.schedule(
  'send-report-daily',
  '0 11 * * *',
  $$
  select net.http_post(
    url     := 'https://<PROJECT_REF>.functions.supabase.co/send-report',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', '<CRON_SECRET>'
    ),
    body    := jsonb_build_object('mode', 'auto')
  );
  $$
);
