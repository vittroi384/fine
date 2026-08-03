-- =========================================================
-- 0006_grants.sql : 테이블·함수 권한 부여
-- TODO(spec): 최신 Supabase는 새 테이블에 API 롤 기본 권한을 부여하지 않으므로
-- 명시적 GRANT가 필요하다 (§5에는 없던 운영 수정). 행 단위 접근은 계속 RLS가 통제한다.
-- =========================================================
grant usage on schema public to anon, authenticated, service_role;

grant all    on all tables    in schema public to authenticated, service_role;
grant select on all tables    in schema public to anon;
grant all    on all sequences in schema public to authenticated, service_role;
grant execute on all functions in schema public to anon, authenticated, service_role;

alter default privileges in schema public
  grant all on tables to authenticated, service_role;
alter default privileges in schema public
  grant execute on functions to anon, authenticated, service_role;

-- 분석 스키마(§18.1-4): 클라이언트 직접 접근 불가 유지, service_role 조회만 허용
grant usage on schema analytics to service_role;
grant select on all tables in schema analytics to service_role;
