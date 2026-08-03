-- §5.9 개발 시드
-- 유저 생성은 Auth Admin API가 필요하므로 SQL이 아닌 스크립트로 수행한다:
--   node --env-file=.env scripts/seed-users.ts
-- (t1@fine.dev ~ t4@fine.dev / test1234, 그룹 '아침런 크루' + active 시즌 생성)
-- 이 파일은 supabase db reset 시 자동 실행되므로 비워 둔다.
select 1;
