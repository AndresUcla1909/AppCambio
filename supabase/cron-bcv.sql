-- Captura automática de la tasa del BCV con Supabase Cron.
--
-- Cada 2 horas, Supabase llama a /api/cron/bcv de la app en Vercel. El
-- servidor lee bcv.org.ve y guarda la tasa en public.tasas_bcv. Si ya estaba
-- guardada no escribe nada, así que repetir la llamada no hace daño.
--
-- Requisitos ANTES de correr esto:
--   1. La app desplegada en Vercel con estas variables:
--        NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
--        SUPABASE_SERVICE_ROLE_KEY (la secret key, sb_secret_…), CRON_SECRET.
--   2. Probar a mano que responde (ver el final de este archivo).
--
-- Reemplaza los dos valores marcados con <<…>> y corre TODO el archivo una
-- sola vez en el SQL Editor.

-- 1. Extensiones: pg_cron (el reloj) y pg_net (hace peticiones HTTP).
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- 2. Secretos en el Vault, cifrados: así no quedan a la vista en cron.job.
select vault.create_secret(
  '<<CRON_SECRET: el mismo valor de .env.local y de Vercel>>',
  'cron_secret',
  'Contraseña que protege /api/cron/bcv'
);
select vault.create_secret(
  '<<URL de la app sin barra final, p. ej. https://tasas.vercel.app>>',
  'app_url',
  'Dirección de la app en Vercel'
);

-- 3. La tarea: minuto 15 de cada hora par (UTC). El BCV publica en la tarde
--    de Caracas (UTC-4) la tasa del día hábil siguiente; con 12 intentos al
--    día se captura aunque publique tarde o su sitio falle un rato.
select cron.schedule(
  'capturar-tasa-bcv',
  '15 */2 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'app_url')
           || '/api/cron/bcv',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'
      )
    ),
    body := '{}'::jsonb,
    -- El sitio del BCV es lento: se le dan 30 s en vez de los 5 por defecto.
    timeout_milliseconds := 30000
  );
  $$
);

-- ------------------------------------------------------------------------
-- Cómo revisar que funciona
-- ------------------------------------------------------------------------

-- Las últimas ejecuciones del cron (¿se disparó?):
--   select jobname, status, return_message, start_time
--   from cron.job_run_details
--   join cron.job using (jobid)
--   where jobname = 'capturar-tasa-bcv'
--   order by start_time desc limit 10;

-- Lo que respondió la app (200 = ok; 401 = secreto mal; 5xx = error):
--   select status_code, content, created
--   from net._http_response order by created desc limit 10;

-- Las últimas tasas guardadas:
--   select fecha, usd, eur, fuente, actualizado_en
--   from public.tasas_bcv order by fecha desc limit 5;

-- Disparar una captura ya, sin esperar al horario:
--   select net.http_post(
--     url := (select decrypted_secret from vault.decrypted_secrets where name = 'app_url') || '/api/cron/bcv',
--     headers := jsonb_build_object('Authorization', 'Bearer ' ||
--       (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
--     timeout_milliseconds := 30000);

-- Pausar o borrar la tarea:
--   select cron.unschedule('capturar-tasa-bcv');

-- Cambiar un secreto (p. ej. si cambias el dominio):
--   select vault.update_secret(
--     (select id from vault.secrets where name = 'app_url'), 'https://nuevo.vercel.app');
