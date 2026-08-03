-- Supabase 대시보드에서 pg_cron, pg_net 확장을 먼저 활성화할 것.
-- <PROJECT_REF>, <SERVICE_ROLE_KEY>는 배포 시 치환 (또는 Vault 사용).
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule('settle-week', '10 15 * * *',      -- 00:10 KST
  $$ select net.http_post(
       url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/settle-week',
       headers := '{"Authorization":"Bearer <SERVICE_ROLE_KEY>","Content-Type":"application/json"}'::jsonb,
       body    := '{}'::jsonb) $$);

select cron.schedule('remind-daily', '0 11 * * *',      -- 20:00 KST
  $$ select net.http_post(
       url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/remind-daily',
       headers := '{"Authorization":"Bearer <SERVICE_ROLE_KEY>","Content-Type":"application/json"}'::jsonb,
       body    := '{}'::jsonb) $$);

select cron.schedule('resolve-disputes', '5 * * * *',   -- 매시 5분
  $$ select net.http_post(
       url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/resolve-disputes',
       headers := '{"Authorization":"Bearer <SERVICE_ROLE_KEY>","Content-Type":"application/json"}'::jsonb,
       body    := '{}'::jsonb) $$);

-- §6.4 사진 파기 배치 (MVP 범위 밖 — 배포 시 활성화)
-- select cron.schedule('purge-photos', '30 16 * * *',  -- 01:30 KST
--   $$ select net.http_post(
--        url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/purge-photos',
--        headers := '{"Authorization":"Bearer <SERVICE_ROLE_KEY>","Content-Type":"application/json"}'::jsonb,
--        body    := '{}'::jsonb) $$);
