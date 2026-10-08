-- =========================================================
-- 0007_revoke_fn_exec.sql : 함수 EXECUTE 권한 회수
-- 0006이 public 스키마 전 함수 EXECUTE를 anon·authenticated에 일괄 부여해 배치 함수
-- (get_remind_targets 등)가 anon 키로 호출 가능했다(이전 리뷰 지적). 여기서 회수한다.
-- =========================================================
-- Postgres 기본값은 함수 EXECUTE를 public(모든 롤)에 부여하므로 public도 함께 회수한다.
revoke execute on all functions in schema public from public, anon, authenticated;
alter default privileges in schema public
  revoke execute on functions from public, anon, authenticated;

-- 클라이언트(src/api, src/lib)가 .rpc()로 호출하는 함수만 authenticated에 재부여
grant execute on function public.kst_today()                      to authenticated;
grant execute on function public.join_group(text)                 to authenticated;
grant execute on function public.start_season(uuid)               to authenticated;
grant execute on function public.use_pass(uuid, smallint)         to authenticated;
grant execute on function public.mark_settled(uuid, boolean)      to authenticated;
grant execute on function public.confirm_settled(uuid)            to authenticated;
grant execute on function public.track_event(text, jsonb)         to authenticated;

-- RLS 정책식(0001·0002)이 호출자 권한으로 평가하는 헬퍼
grant execute on function public.is_group_member(uuid)            to authenticated;
grant execute on function public.is_season_member(uuid)           to authenticated;

-- 재부여하지 않음(service_role 전용 유지, 0006 부여분 그대로):
--   settle_due_weeks, resolve_open_disputes, get_remind_targets — Edge Function이 service_role로 호출
--   redeem_season_pass — T12 미연동, 클라이언트 호출 없음
--   cfg_int, local_today — security definer 함수·트리거 내부에서만 호출
--   handle_new_user, handle_new_group, checkin_before_insert, dispute_before_insert, vote_before_insert — 트리거 함수
