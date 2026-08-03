-- =========================================================
-- 0001_init.sql : FINE 초기 스키마 (enums → tables → helpers
--                 → triggers → RPCs → batch functions → RLS → indexes)
-- =========================================================
create extension if not exists pgcrypto;

-- ---------- enums ----------
create type rule_type      as enum ('weekly_count','daily');
create type season_status  as enum ('draft','active','closed');
create type checkin_status as enum ('valid','disputed','rejected');

-- ---------- tables ----------
create table public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  nickname   text not null default '벌금러' check (char_length(nickname) between 1 and 20),
  avatar_url text,
  push_token text,
  is_adult   boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 30),
  owner_id    uuid not null references public.profiles(id),
  invite_code text not null unique
              default upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)),
  timezone    text not null default 'Asia/Seoul',      -- v1.1: 판정 기준 tz (§17-4)
  created_at  timestamptz not null default now()
);

create table public.group_members (
  group_id  uuid not null references public.groups(id) on delete cascade,
  user_id   uuid not null references public.profiles(id) on delete cascade,
  role      text not null default 'member' check (role in ('owner','member')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table public.seasons (
  id             uuid primary key default gen_random_uuid(),
  group_id       uuid not null references public.groups(id) on delete cascade,
  title          text not null default '4주 챌린지' check (char_length(title) <= 30),
  rule_type      rule_type not null default 'weekly_count',
  target_count   smallint  not null check (target_count between 1 and 7),
  penalty_amount integer   not null default 5000 check (penalty_amount between 0 and 50000),
  pass_quota     smallint  not null default 1 check (pass_quota between 0 and 4),
  weeks          smallint  not null default 4 check (weeks between 1 and 8),  -- v1.1 (§17-2)
  rules          jsonb     not null default '{}'::jsonb,   -- v1.1 예약: 커스텀 규칙 (§17-3)
  start_date     date not null,
  end_date       date generated always as (start_date + weeks * 7 - 1) stored,
  status         season_status not null default 'draft',
  paid           boolean not null default false,
  created_at     timestamptz not null default now()
);
create unique index one_active_season_per_group
  on public.seasons(group_id) where status = 'active';

create table public.checkins (
  id           uuid primary key default gen_random_uuid(),
  season_id    uuid not null references public.seasons(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  photo_path   text not null,                       -- storage: {season_id}/{user_id}/{uuid}.jpg
  taken_at     timestamptz not null default now(),  -- 서버 수신 시각(트리거가 재설정)
  checkin_date date not null,                       -- KST 날짜(트리거 계산)
  week_no      smallint not null,                   -- 1~4 (트리거 계산)
  status       checkin_status not null default 'valid',
  client_exif  jsonb,
  unique (season_id, user_id, checkin_date)         -- §1.3-4 하루 1회
);

create table public.passes (
  id        uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  user_id   uuid not null references public.profiles(id) on delete cascade,
  week_no   smallint not null check (week_no between 1 and 8),
  used_at   timestamptz not null default now(),
  unique (season_id, user_id, week_no)              -- §1.6 한 주 1개
);

create table public.disputes (
  id         uuid primary key default gen_random_uuid(),
  checkin_id uuid not null unique references public.checkins(id) on delete cascade,
  raised_by  uuid not null references public.profiles(id),
  reason     text not null check (char_length(reason) between 2 and 200),
  deadline   timestamptz not null default now() + interval '48 hours',
  resolved   boolean not null default false,
  outcome    checkin_status,
  created_at timestamptz not null default now()
);

create table public.dispute_votes (
  dispute_id uuid not null references public.disputes(id) on delete cascade,
  voter_id   uuid not null references public.profiles(id),
  vote       boolean not null,                      -- true = "무효" 찬성
  created_at timestamptz not null default now(),
  primary key (dispute_id, voter_id)
);

create table public.penalty_ledger (
  id                 uuid primary key default gen_random_uuid(),
  season_id          uuid not null references public.seasons(id) on delete cascade,
  user_id            uuid not null references public.profiles(id) on delete cascade,
  week_no            smallint not null,
  missed_count       smallint not null,
  amount             integer  not null,
  settled            boolean  not null default false,
  settled_at         timestamptz,
  confirmed_by_owner boolean  not null default false,
  created_at         timestamptz not null default now(),
  unique (season_id, user_id, week_no)              -- §1.4 멱등성
);

create table public.subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  product_id  text not null,
  season_id   uuid references public.seasons(id),
  rc_event_id text unique,                          -- RevenueCat 이벤트 멱등키
  status      text not null,
  created_at  timestamptz not null default now()
);

create table public.app_config (
  key   text primary key,
  value jsonb not null
);
insert into public.app_config values
  ('payments_enabled',   'false'),
  ('min_season_members', '3'),   -- 2로 낮추면 미니 모드 (§17-1)
  ('max_group_members',  '8'),
  ('free_max_members',   '4'),   -- 무료 플랜 인원 상한(결제 게이트)
  ('house_ads',          '[]');  -- §11.5 자체 홍보 카드

-- ---------- helpers ----------
create or replace function public.kst_today() returns date
language sql stable as $$ select (now() at time zone 'Asia/Seoul')::date $$;

create or replace function public.local_today(tz text) returns date
language sql stable as $$ select (now() at time zone tz)::date $$;

create or replace function public.cfg_int(k text, fallback int) returns int
language sql stable security definer set search_path = public as $$
  select coalesce((select (value #>> '{}')::int from app_config where key = k), fallback)
$$;

create or replace function public.is_group_member(gid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from group_members
                 where group_id = gid and user_id = auth.uid());
$$;

create or replace function public.is_season_member(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from seasons s
                 join group_members gm on gm.group_id = s.group_id
                 where s.id = sid and gm.user_id = auth.uid());
$$;

-- ---------- triggers ----------
-- 회원가입 → profiles 자동 생성
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, nickname)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', '벌금러'));
  return new;
end $$;
create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();

-- 그룹 생성 → 방장 자동 멤버 등록
create or replace function public.handle_new_group() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.group_members (group_id, user_id, role)
  values (new.id, new.owner_id, 'owner');
  return new;
end $$;
create trigger on_group_created
  after insert on public.groups for each row execute function public.handle_new_group();

-- 인증 검증·계산 (§1.3)
create or replace function public.checkin_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare s public.seasons%rowtype; tz text; d date;
begin
  select * into s from seasons where id = new.season_id;
  if s.id is null or s.status <> 'active' then raise exception 'SEASON_NOT_ACTIVE'; end if;
  new.user_id := auth.uid();                                    -- 위조 방지
  if not exists (select 1 from group_members
                 where group_id = s.group_id and user_id = new.user_id)
    then raise exception 'NOT_A_MEMBER'; end if;
  select g.timezone into tz from groups g where g.id = s.group_id;
  d := local_today(tz);
  if d < s.start_date or d > s.end_date then raise exception 'OUT_OF_SEASON'; end if;
  new.taken_at     := now();
  new.checkin_date := d;
  new.week_no      := ((d - s.start_date) / 7) + 1;
  new.status       := 'valid';
  return new;
end $$;
create trigger trg_checkin_before_insert
  before insert on public.checkins for each row execute function public.checkin_before_insert();

-- 이의제기 검증 (§1.5) + 대상 인증 disputed 전환
create or replace function public.dispute_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare c public.checkins%rowtype;
begin
  select * into c from checkins where id = new.checkin_id;
  if c.id is null then raise exception 'CHECKIN_NOT_FOUND'; end if;
  if c.user_id = auth.uid() then raise exception 'CANNOT_DISPUTE_SELF'; end if;
  if not is_season_member(c.season_id) then raise exception 'NOT_A_MEMBER'; end if;
  if now() > c.taken_at + interval '24 hours' then raise exception 'DISPUTE_WINDOW_CLOSED'; end if;
  update checkins set status = 'disputed' where id = new.checkin_id and status = 'valid';
  if not found then raise exception 'ALREADY_DISPUTED_OR_REJECTED'; end if;
  new.raised_by := auth.uid();
  new.deadline  := now() + interval '48 hours';
  new.resolved  := false;
  return new;
end $$;
create trigger trg_dispute_before_insert
  before insert on public.disputes for each row execute function public.dispute_before_insert();

-- 투표 검증 (§1.5)
create or replace function public.vote_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare d record;
begin
  select ds.resolved, ds.deadline, c.user_id as target_user, c.season_id
    into d
  from disputes ds join checkins c on c.id = ds.checkin_id
  where ds.id = new.dispute_id;
  if d is null or d.resolved or now() > d.deadline then raise exception 'DISPUTE_CLOSED'; end if;
  if auth.uid() = d.target_user then raise exception 'TARGET_CANNOT_VOTE'; end if;
  if not is_season_member(d.season_id) then raise exception 'NOT_A_MEMBER'; end if;
  new.voter_id := auth.uid();
  return new;
end $$;
create trigger trg_vote_before_insert
  before insert on public.dispute_votes for each row execute function public.vote_before_insert();

-- ---------- RPCs (클라이언트가 호출) ----------
create or replace function public.join_group(code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare g public.groups%rowtype; cnt int;
begin
  select * into g from groups where invite_code = upper(trim(code));
  if g.id is null then raise exception 'INVALID_CODE'; end if;
  select count(*) into cnt from group_members where group_id = g.id;
  if cnt >= cfg_int('max_group_members', 8) and not exists (select 1 from group_members
        where group_id = g.id and user_id = auth.uid())
    then raise exception 'GROUP_FULL'; end if;
  insert into group_members (group_id, user_id)
  values (g.id, auth.uid()) on conflict do nothing;
  return g.id;
end $$;

create or replace function public.start_season(sid uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare s public.seasons%rowtype; tz text; members int; owner_adult boolean; pay_on boolean;
begin
  select * into s from seasons where id = sid;
  if s.id is null then raise exception 'NOT_FOUND'; end if;
  if not exists (select 1 from groups where id = s.group_id and owner_id = auth.uid())
    then raise exception 'OWNER_ONLY'; end if;
  if s.status <> 'draft' then raise exception 'NOT_DRAFT'; end if;
  select timezone into tz from groups where id = s.group_id;
  select count(*) into members from group_members where group_id = s.group_id;
  if members < cfg_int('min_season_members', 3)
    then raise exception 'NEED_MORE_MEMBERS'; end if;
  if s.start_date < local_today(tz) then raise exception 'START_DATE_PAST'; end if;
  pay_on := coalesce((select (value #>> '{}')::boolean
                      from app_config where key = 'payments_enabled'), false);
  if pay_on and not s.paid and members > cfg_int('free_max_members', 4)
    then raise exception 'PAYWALL_REQUIRED'; end if;
  select is_adult into owner_adult from profiles where id = auth.uid();
  if owner_adult is distinct from true then
    update seasons set penalty_amount = 0 where id = sid;      -- §1.7
  end if;
  update seasons set status = 'active' where id = sid;
  return sid;
end $$;

create or replace function public.use_pass(sid uuid, wk smallint) returns void
language plpgsql security definer set search_path = public as $$
declare s public.seasons%rowtype; used int; cur_wk smallint;
begin
  select * into s from seasons where id = sid and status = 'active';
  if s.id is null then raise exception 'SEASON_NOT_ACTIVE'; end if;
  if not is_season_member(sid) then raise exception 'NOT_A_MEMBER'; end if;
  if wk not between 1 and s.weeks then raise exception 'BAD_WEEK'; end if;
  cur_wk := ((local_today((select timezone from groups where id = s.group_id))
              - s.start_date) / 7) + 1;
  if wk > cur_wk then raise exception 'FUTURE_WEEK'; end if;
  if exists (select 1 from penalty_ledger
             where season_id = sid and user_id = auth.uid() and week_no = wk)
    then raise exception 'WEEK_SETTLED'; end if;
  select count(*) into used from passes where season_id = sid and user_id = auth.uid();
  if used >= s.pass_quota then raise exception 'NO_PASS_LEFT'; end if;
  insert into passes (season_id, user_id, week_no) values (sid, auth.uid(), wk);
end $$;

create or replace function public.mark_settled(ledger_id uuid, val boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  update penalty_ledger
     set settled = val, settled_at = case when val then now() else null end
   where id = ledger_id and user_id = auth.uid();
  if not found then raise exception 'NOT_FOUND_OR_FORBIDDEN'; end if;
end $$;

create or replace function public.confirm_settled(ledger_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update penalty_ledger pl set confirmed_by_owner = true
  from seasons s join groups g on g.id = s.group_id
  where pl.id = ledger_id and s.id = pl.season_id
    and g.owner_id = auth.uid() and pl.settled = true;
  if not found then raise exception 'NOT_FOUND_OR_FORBIDDEN'; end if;
end $$;

-- ---------- 배치 함수 (Edge Function이 service role로 호출) ----------
-- 주간 정산 (§1.4): 완결 + 48h 버퍼 지난 주만, 멱등
create or replace function public.settle_due_weeks() returns integer
language plpgsql security definer set search_path = public as $$
declare inserted integer;
begin
  with due as (
    select s.id as season_id, s.group_id, s.target_count, s.penalty_amount,
           w.week_no
    from seasons s
    join groups g on g.id = s.group_id
    cross join lateral generate_series(1, s.weeks) as w(week_no)
    where s.status = 'active'
      and (s.start_date + w.week_no * 7 - 1) + 2 < local_today(g.timezone)
  ),
  valid_counts as (
    select season_id, user_id, week_no, count(*)::int as cnt
    from checkins where status = 'valid' group by 1,2,3
  ),
  pass_counts as (
    select season_id, user_id, week_no, count(*)::int as cnt
    from passes group by 1,2,3
  ),
  ins as (
    insert into penalty_ledger (season_id, user_id, week_no, missed_count, amount)
    select d.season_id, gm.user_id, d.week_no,
           greatest(0, d.target_count - coalesce(v.cnt,0) - coalesce(p.cnt,0)),
           greatest(0, d.target_count - coalesce(v.cnt,0) - coalesce(p.cnt,0)) * d.penalty_amount
    from due d
    join group_members gm on gm.group_id = d.group_id
    left join valid_counts v on v.season_id = d.season_id
         and v.user_id = gm.user_id and v.week_no = d.week_no
    left join pass_counts  p on p.season_id = d.season_id
         and p.user_id = gm.user_id and p.week_no = d.week_no
    on conflict (season_id, user_id, week_no) do nothing
    returning 1
  )
  select count(*) into inserted from ins;

  update seasons s set status = 'closed'
  from groups g
  where g.id = s.group_id
    and s.status = 'active'
    and s.end_date + 2 < local_today(g.timezone)
    and (select count(distinct pl.week_no)
           from penalty_ledger pl where pl.season_id = s.id) >= s.weeks;

  return inserted;
end $$;

-- 이의제기 자동 판정 (§1.5) + 이미 정산된 주 재계산
create or replace function public.resolve_open_disputes() returns integer
language plpgsql security definer set search_path = public as $$
declare r record; yes int; no int; done int := 0;
begin
  for r in
    select d.id, d.checkin_id, c.season_id, c.user_id, c.week_no
    from disputes d join checkins c on c.id = d.checkin_id
    where d.resolved = false
      and ( d.deadline < now()
            or (select count(*) from dispute_votes v where v.dispute_id = d.id)
               >= (select count(*) - 1 from group_members gm
                   join seasons s on s.group_id = gm.group_id
                   where s.id = c.season_id) )
  loop
    select count(*) filter (where vote), count(*) filter (where not vote)
      into yes, no from dispute_votes where dispute_id = r.id;
    if yes > no then
      update checkins set status = 'rejected' where id = r.checkin_id;
      update disputes set resolved = true, outcome = 'rejected' where id = r.id;
      update penalty_ledger pl
         set missed_count = calc.missed,
             amount       = calc.missed * s.penalty_amount
        from seasons s,
        lateral (
          select greatest(0, s.target_count
            - (select count(*) from checkins c2
               where c2.season_id = r.season_id and c2.user_id = r.user_id
                 and c2.week_no = r.week_no and c2.status = 'valid')
            - (select count(*) from passes p
               where p.season_id = r.season_id and p.user_id = r.user_id
                 and p.week_no = r.week_no)) as missed
        ) calc
       where pl.season_id = r.season_id and pl.user_id = r.user_id
         and pl.week_no = r.week_no and s.id = r.season_id;
    else
      update checkins set status = 'valid' where id = r.checkin_id;
      update disputes set resolved = true, outcome = 'valid' where id = r.id;
    end if;
    done := done + 1;
  end loop;
  return done;
end $$;

-- 오늘 미인증 리마인더 대상 (§9) — 발송 스케줄은 KST 고정(글로벌 확장 시 §17-4)
create or replace function public.get_remind_targets()
returns table (user_id uuid, push_token text, group_name text, penalty integer)
language sql security definer set search_path = public as $$
  select gm.user_id, p.push_token, g.name, s.penalty_amount
  from seasons s
  join groups g on g.id = s.group_id
  join group_members gm on gm.group_id = s.group_id
  join profiles p on p.id = gm.user_id
  where s.status = 'active'
    and kst_today() between s.start_date and s.end_date
    and p.push_token is not null
    and not exists (select 1 from checkins c
                    where c.season_id = s.id and c.user_id = gm.user_id
                      and c.checkin_date = kst_today() and c.status <> 'rejected')
    and ( s.rule_type = 'daily'
          or (select count(*) from checkins c2
              where c2.season_id = s.id and c2.user_id = gm.user_id
                and c2.week_no = ((kst_today() - s.start_date) / 7) + 1
                and c2.status = 'valid') < s.target_count );
$$;

-- ---------- RLS ----------
alter table public.profiles       enable row level security;
alter table public.groups         enable row level security;
alter table public.group_members  enable row level security;
alter table public.seasons        enable row level security;
alter table public.checkins       enable row level security;
alter table public.passes         enable row level security;
alter table public.disputes       enable row level security;
alter table public.dispute_votes  enable row level security;
alter table public.penalty_ledger enable row level security;
alter table public.subscriptions  enable row level security;
alter table public.app_config     enable row level security;

create policy profiles_select on public.profiles for select to authenticated
  using ( id = auth.uid() or exists (
    select 1 from group_members a join group_members b on a.group_id = b.group_id
    where a.user_id = auth.uid() and b.user_id = profiles.id));
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy groups_select on public.groups for select to authenticated
  using (is_group_member(id));
create policy groups_insert on public.groups for insert to authenticated
  with check (owner_id = auth.uid());
create policy groups_update on public.groups for update to authenticated
  using (owner_id = auth.uid());
create policy groups_delete on public.groups for delete to authenticated
  using (owner_id = auth.uid());

create policy gm_select on public.group_members for select to authenticated
  using (is_group_member(group_id));
create policy gm_delete on public.group_members for delete to authenticated
  using ( (user_id = auth.uid() and role <> 'owner')
          or exists (select 1 from groups g
                     where g.id = group_id and g.owner_id = auth.uid()
                       and group_members.role <> 'owner') );
-- insert는 join_group RPC로만 (직접 insert 정책 없음)

create policy seasons_select on public.seasons for select to authenticated
  using (is_group_member(group_id));
create policy seasons_insert on public.seasons for insert to authenticated
  with check ( status = 'draft' and exists
    (select 1 from groups g where g.id = group_id and g.owner_id = auth.uid()) );
create policy seasons_update_draft on public.seasons for update to authenticated
  using ( status = 'draft' and exists
    (select 1 from groups g where g.id = group_id and g.owner_id = auth.uid()) )
  with check (status = 'draft');
create policy seasons_delete_draft on public.seasons for delete to authenticated
  using ( status = 'draft' and exists
    (select 1 from groups g where g.id = group_id and g.owner_id = auth.uid()) );

create policy checkins_select on public.checkins for select to authenticated
  using (is_season_member(season_id));
create policy checkins_insert on public.checkins for insert to authenticated
  with check (is_season_member(season_id));   -- 세부 검증은 트리거

create policy passes_select on public.passes for select to authenticated
  using (is_season_member(season_id));        -- insert는 use_pass RPC로만

create policy disputes_select on public.disputes for select to authenticated
  using (exists (select 1 from checkins c
                 where c.id = checkin_id and is_season_member(c.season_id)));
create policy disputes_insert on public.disputes for insert to authenticated
  with check (exists (select 1 from checkins c
                 where c.id = checkin_id and is_season_member(c.season_id)));

create policy votes_select on public.dispute_votes for select to authenticated
  using (exists (select 1 from disputes d join checkins c on c.id = d.checkin_id
                 where d.id = dispute_id and is_season_member(c.season_id)));
create policy votes_insert on public.dispute_votes for insert to authenticated
  with check (voter_id = auth.uid());         -- 세부 검증은 트리거

create policy ledger_select on public.penalty_ledger for select to authenticated
  using (is_season_member(season_id));        -- 쓰기는 RPC/배치만

create policy subs_select on public.subscriptions for select to authenticated
  using (user_id = auth.uid());               -- 쓰기는 service role만

create policy config_select on public.app_config for select to authenticated
  using (true);

-- ---------- indexes ----------
create index idx_checkins_season_week on public.checkins (season_id, week_no)
  where status = 'valid';
create index idx_checkins_user_date on public.checkins (user_id, checkin_date);
create index idx_gm_user       on public.group_members (user_id);
create index idx_seasons_group on public.seasons (group_id);
create index idx_ledger_season on public.penalty_ledger (season_id);
create index idx_disputes_open on public.disputes (deadline) where resolved = false;

-- Realtime (§10)
alter publication supabase_realtime add table public.checkins;
