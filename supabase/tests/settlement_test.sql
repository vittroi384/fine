-- =========================================================
-- 정산·이의제기 서버 로직 검증 (§13 AC-4, AC-5, AC-6, AC-7)
-- 실행: docker exec supabase_db_fine psql -U postgres -d postgres -f - < 이 파일
-- 트리거는 auth.uid() 기반이라 과거 데이터 시드 시 일시 비활성화한다 (테스트 한정).
-- =========================================================
\set ON_ERROR_STOP on
begin;

-- 테스트 유저 4명 (auth.users 직접 생성 → 트리거로 profiles 생성)
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
select gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'ac' || i || '@fine.dev', '', now(), '{}', jsonb_build_object('name', 'AC유저' || i)
from generate_series(1,4) i
on conflict do nothing;

create temp table u as
select id, row_number() over (order by email) rn
from auth.users where email like 'ac%@fine.dev';

-- 그룹 + 5주 전 시작한 active 시즌 (목표3, 벌금 5000, 4주)
insert into public.groups (id, name, owner_id)
values ('22222222-2222-2222-2222-222222222222', 'AC테스트', (select id from u where rn=1));

insert into public.group_members (group_id, user_id)
select '22222222-2222-2222-2222-222222222222', id from u where rn > 1;

insert into public.seasons (id, group_id, title, target_count, penalty_amount, pass_quota, start_date, status)
values ('33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222',
        'AC시즌', 3, 5000, 1, current_date - 35, 'active');

-- 과거 인증·패스 시드 (트리거 우회)
alter table public.checkins disable trigger trg_checkin_before_insert;

-- W1 케이스(a): u1 목표3·인증1·패스0 → missed 2 → 10000원
insert into public.checkins (season_id, user_id, photo_path, checkin_date, week_no)
select '33333333-3333-3333-3333-333333333333', (select id from u where rn=1),
       'test.jpg', current_date - 35, 1;

-- W1 케이스(b): u2 목표3·인증2·패스1 → missed 0 → 0원
insert into public.checkins (season_id, user_id, photo_path, checkin_date, week_no)
select '33333333-3333-3333-3333-333333333333', (select id from u where rn=2),
       'test.jpg', current_date - 35 + g, 1 from generate_series(0,1) g;
insert into public.passes (season_id, user_id, week_no)
select '33333333-3333-3333-3333-333333333333', (select id from u where rn=2), 1;

-- W1 케이스(c): u3 목표3·인증2(그중 1건은 나중에 rejected 예정)·패스1 → 정산 후 재계산 검증
insert into public.checkins (id, season_id, user_id, photo_path, checkin_date, week_no)
select '44444444-4444-4444-4444-444444444444', '33333333-3333-3333-3333-333333333333',
       (select id from u where rn=3), 'test.jpg', current_date - 35, 1;
insert into public.checkins (season_id, user_id, photo_path, checkin_date, week_no)
select '33333333-3333-3333-3333-333333333333', (select id from u where rn=3),
       'test.jpg', current_date - 34, 1;
insert into public.passes (season_id, user_id, week_no)
select '33333333-3333-3333-3333-333333333333', (select id from u where rn=3), 1;

alter table public.checkins enable trigger trg_checkin_before_insert;

-- ---------- AC-4: 멱등성 (2회 실행 결과 동일) ----------
select public.settle_due_weeks() as first_run;
create temp table snap1 as select season_id, user_id, week_no, missed_count, amount
  from public.penalty_ledger where season_id = '33333333-3333-3333-3333-333333333333';
select public.settle_due_weeks() as second_run;

do $$
declare diff int;
begin
  select count(*) into diff from (
    (select season_id, user_id, week_no, missed_count, amount from public.penalty_ledger
      where season_id = '33333333-3333-3333-3333-333333333333'
     except select * from snap1)
    union all
    (select * from snap1
     except select season_id, user_id, week_no, missed_count, amount from public.penalty_ledger
      where season_id = '33333333-3333-3333-3333-333333333333')
  ) t;
  if diff <> 0 then raise exception 'AC-4 FAIL: settle_due_weeks not idempotent'; end if;
  raise notice 'AC-4 PASS: idempotent';
end $$;

-- ---------- AC-5: 수식 검증 (W1) ----------
do $$
declare a int; b int; c int;
begin
  select amount into a from public.penalty_ledger pl join u on u.id = pl.user_id
   where pl.week_no = 1 and u.rn = 1;
  select amount into b from public.penalty_ledger pl join u on u.id = pl.user_id
   where pl.week_no = 1 and u.rn = 2;
  select amount into c from public.penalty_ledger pl join u on u.id = pl.user_id
   where pl.week_no = 1 and u.rn = 3;
  if a <> 10000 then raise exception 'AC-5a FAIL: expected 10000, got %', a; end if;
  if b <> 0     then raise exception 'AC-5b FAIL: expected 0, got %', b; end if;
  if c <> 0     then raise exception 'AC-5c(pre) FAIL: expected 0, got %', c; end if;
  raise notice 'AC-5 PASS: (a)=10000 (b)=0 (c-pre)=0';
end $$;

-- ---------- AC-6: 이의제기 과반 무효 → rejected + 기정산 주 재계산 ----------
alter table public.disputes disable trigger trg_dispute_before_insert;
alter table public.dispute_votes disable trigger trg_vote_before_insert;

insert into public.disputes (id, checkin_id, raised_by, reason, deadline)
select '55555555-5555-5555-5555-555555555555', '44444444-4444-4444-4444-444444444444',
       (select id from u where rn=1), '반칙 의심', now() - interval '1 hour';
update public.checkins set status = 'disputed' where id = '44444444-4444-4444-4444-444444444444';
-- 무효 2 : 유지 1 (당사자 u3 제외)
insert into public.dispute_votes (dispute_id, voter_id, vote)
select '55555555-5555-5555-5555-555555555555', id, rn in (1,2) from u where rn <> 3;

alter table public.disputes enable trigger trg_dispute_before_insert;
alter table public.dispute_votes enable trigger trg_vote_before_insert;

select public.resolve_open_disputes() as resolved_count;

do $$
declare st public.checkin_status; c int;
begin
  select status into st from public.checkins where id = '44444444-4444-4444-4444-444444444444';
  if st <> 'rejected' then raise exception 'AC-6 FAIL: checkin status = %', st; end if;
  -- u3: 유효1 + 패스1 → missed 1 → 5000원으로 재계산되어야 함
  select amount into c from public.penalty_ledger pl join u on u.id = pl.user_id
   where pl.week_no = 1 and u.rn = 3;
  if c <> 5000 then raise exception 'AC-6 FAIL: recalculated amount = % (expected 5000)', c; end if;
  raise notice 'AC-6 PASS: rejected + ledger recalculated to 5000';
end $$;

-- ---------- 시즌 closed 전이 (4주 전부 정산 + end_date+2 경과) ----------
do $$
declare st public.season_status;
begin
  select status into st from public.seasons where id = '33333333-3333-3333-3333-333333333333';
  if st <> 'closed' then raise exception 'CLOSE FAIL: season status = %', st; end if;
  raise notice 'CLOSE PASS: season closed after full settlement';
end $$;

rollback;  -- 테스트 데이터 전부 롤백
\echo 'ALL SERVER LOGIC TESTS PASSED (rolled back)'
