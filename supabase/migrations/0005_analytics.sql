-- =========================================================
-- 0005_analytics.sql : 이벤트 로그, KPI 일마트, 코호트 뷰, DQ, 크론 (§18)
-- =========================================================
create schema if not exists analytics;

-- ---------- 이벤트 로그 (append-only) ----------
create table analytics.events (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid,                                   -- 비로그인 이벤트 대비 null 허용
  event_name    text not null check (char_length(event_name) between 1 and 40),
  props         jsonb not null default '{}'::jsonb,
  occurred_at   timestamptz not null default now(),
  occurred_date date not null default (now() at time zone 'Asia/Seoul')::date
);
create index idx_events_name_date on analytics.events (event_name, occurred_date);
create index idx_events_user      on analytics.events (user_id, occurred_date);
alter table analytics.events enable row level security;   -- 정책 없음 = 직접 접근 차단

-- 클라이언트 수집 진입점 (fire-and-forget)
create or replace function public.track_event(name text, props jsonb default '{}'::jsonb)
returns void language sql security definer
set search_path = public, analytics as $$
  insert into analytics.events (user_id, event_name, props)
  values (auth.uid(), name, coalesce(props, '{}'::jsonb));
$$;

-- ---------- KPI 일마트 ----------
create table analytics.daily_kpis (
  kpi_date           date primary key,
  dau                int not null,
  new_users          int not null,
  checkins           int not null,
  active_seasons     int not null,
  checkin_rate       numeric(5,2),   -- 활성 시즌 대상자 중 당일 인증자 % (주간형 규칙 포함 근사치)
  invites_shared     int not null,
  invites_accepted   int not null,
  invite_accept_rate numeric(5,2),
  d7_retention       numeric(5,2),   -- 7일 전 신규 가입자 중 당일 활동 %
  built_at           timestamptz not null default now()
);

create or replace function analytics.build_daily_kpis(d date default public.kst_today() - 1)
returns void language plpgsql security definer
set search_path = analytics, public as $$
declare
  v_dau int; v_new int; v_checkins int; v_seasons int;
  v_targets int; v_checkin_users int;
  v_shared int; v_accepted int; v_prev_new int; v_ret_active int;
begin
  select count(distinct user_id) into v_checkin_users
    from checkins where checkin_date = d and status <> 'rejected';

  select count(distinct u) into v_dau from (
    select user_id as u from checkins
      where checkin_date = d and status <> 'rejected'
    union
    select user_id from analytics.events
      where occurred_date = d and user_id is not null
  ) t;

  select count(*) into v_new from profiles
    where (created_at at time zone 'Asia/Seoul')::date = d;

  select count(*) into v_checkins from checkins
    where checkin_date = d and status <> 'rejected';

  select count(*) into v_seasons from seasons
    where status <> 'draft' and d between start_date and end_date;

  select count(distinct gm.user_id) into v_targets
    from seasons s join group_members gm on gm.group_id = s.group_id
    where s.status <> 'draft' and d between s.start_date and s.end_date;

  select count(*) into v_shared from analytics.events
    where occurred_date = d and event_name = 'invite_link_shared';
  select count(*) into v_accepted from analytics.events
    where occurred_date = d and event_name = 'invite_accepted';

  select count(*) into v_prev_new from profiles
    where (created_at at time zone 'Asia/Seoul')::date = d - 7;
  select count(distinct t.u) into v_ret_active from (
    select user_id as u from checkins
      where checkin_date = d and status <> 'rejected'
    union
    select user_id from analytics.events
      where occurred_date = d and user_id is not null
  ) t join profiles p on p.id = t.u
  where (p.created_at at time zone 'Asia/Seoul')::date = d - 7;

  insert into analytics.daily_kpis
    (kpi_date, dau, new_users, checkins, active_seasons, checkin_rate,
     invites_shared, invites_accepted, invite_accept_rate, d7_retention)
  values
    (d, v_dau, v_new, v_checkins, v_seasons,
     case when v_targets  > 0 then round(100.0 * v_checkin_users / v_targets, 2) end,
     v_shared, v_accepted,
     case when v_shared   > 0 then round(100.0 * v_accepted / v_shared, 2) end,
     case when v_prev_new > 0 then round(100.0 * v_ret_active / v_prev_new, 2) end)
  on conflict (kpi_date) do update set
    dau = excluded.dau, new_users = excluded.new_users,
    checkins = excluded.checkins, active_seasons = excluded.active_seasons,
    checkin_rate = excluded.checkin_rate,
    invites_shared = excluded.invites_shared,
    invites_accepted = excluded.invites_accepted,
    invite_accept_rate = excluded.invite_accept_rate,
    d7_retention = excluded.d7_retention,
    built_at = now();
end $$;

-- ---------- 주간 코호트 (가입 주차 × 활동 주차 오프셋) ----------
create or replace view analytics.weekly_cohorts as
with firstweek as (
  select id as user_id,
         date_trunc('week', (created_at at time zone 'Asia/Seoul'))::date as cohort_week
  from public.profiles
),
activity as (
  select user_id, date_trunc('week', checkin_date::timestamp)::date as act_week
  from public.checkins where status <> 'rejected'
  union
  select user_id, date_trunc('week', occurred_date::timestamp)::date
  from analytics.events where user_id is not null
)
select f.cohort_week,
       ((a.act_week - f.cohort_week) / 7)::int as week_offset,
       count(distinct a.user_id)               as active_users
from firstweek f
join activity a using (user_id)
where a.act_week >= f.cohort_week
group by 1, 2;
-- 코호트 크기: select cohort_week, count(*) from firstweek group by 1 과 조인해 유지율 계산

-- ---------- 데이터 품질 (DQ) ----------
create table analytics.dq_results (
  id         bigint generated always as identity primary key,
  run_at     timestamptz not null default now(),
  check_name text not null,
  passed     boolean not null,
  detail     text
);

create or replace function analytics.run_dq_checks(d date default public.kst_today() - 1)
returns int language plpgsql security definer
set search_path = analytics, public as $$
declare fails int;
begin
  insert into analytics.dq_results (check_name, passed) values
    ('ledger_nonnegative',
     not exists (select 1 from penalty_ledger where amount < 0)),
    ('checkin_week_in_bounds',
     not exists (select 1 from checkins c join seasons s on s.id = c.season_id
                 where c.week_no < 1 or c.week_no > s.weeks)),
    ('no_future_events',
     not exists (select 1 from analytics.events
                 where occurred_date > public.kst_today()));
  insert into analytics.dq_results (check_name, passed, detail) values
    ('kpi_row_built',
     exists (select 1 from analytics.daily_kpis where kpi_date = d),
     'kpi_date=' || d);

  select count(*) into fails from analytics.dq_results
   where run_at > now() - interval '1 minute' and passed = false;
  return fails;   -- 0이면 전부 통과
end $$;

-- ---------- 크론 (pg_cron: 0003에서 확장 활성화됨) ----------
select cron.schedule('build-kpis', '0 16 * * *',   -- 01:00 KST
  $$ select analytics.build_daily_kpis(); $$);
select cron.schedule('dq-checks',  '10 16 * * *',  -- 01:10 KST
  $$ select analytics.run_dq_checks(); $$);
