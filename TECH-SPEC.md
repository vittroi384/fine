# FINE 개발 명세서 (TECH-SPEC v1.2 — 최종)

> **이 문서의 용도**: 이 파일을 리포지토리 루트에 두고 Claude Code에게 "TECH-SPEC.md를 읽고 §14 구현 순서대로 개발해줘"라고 지시하면 MVP 초기 버전이 나오도록 작성된 실행용 명세서다.
> 사업 배경·시장 분석은 `penalty-challenge-tech-report-v2.docx` 참조. 본 문서는 **구현 결정만** 담는다.
> **v1.2 변경(최종)**: 데이터 엔지니어링 레이어 신설(§18) — 자체 이벤트 로그, 인DB KPI 마트(멱등 ELT), 코호트 뷰, DQ 자동 테스트, DW 이관 로드맵. 제작자의 DE 커리어 포트폴리오 축을 겸한다.
> **v1.1 변경**: ① 광고 전면 미도입 확정(§11.5) ② 확장성 사전 확보 — `groups.timezone`, `seasons.weeks`·`rules(jsonb)`, 인원 기준의 `app_config` 설정화, §17 확장 가이드 신설 ③ `app_config` 스칼라 캐스팅 버그 수정(`#>> '{}'`).

---

## §0. Claude Code 작업 원칙

1. **이 문서가 단일 진실 공급원(SSOT)이다.** 여기 정의된 규칙·스키마·네이밍을 임의로 변경하지 않는다. 모호하거나 충돌이 발견되면 코드에 `// TODO(spec):` 주석을 남기고 가장 보수적인 해석으로 진행한다.
2. **서버를 신뢰하고 클라이언트를 불신한다.** 정산·판정·권한은 전부 DB(RLS)와 Edge Function에서 결정한다. 클라이언트는 표시와 입력만 담당한다.
3. **모든 날짜 판정은 그룹 타임존(`groups.timezone`, 기본 `Asia/Seoul`) 기준**이며, 판정 주체는 서버다(§1.3). 클라이언트 기기 시간을 판정에 쓰지 않는다.
4. TypeScript strict 모드. `any` 금지. 파일당 250줄을 넘기면 분리한다.
5. 각 태스크(§14)는 명시된 DoD를 만족해야 완료다. 완료 시 다음 태스크로 진행한다.
6. 외부 라이브러리는 §2 목록 안에서만 사용한다. 추가가 꼭 필요하면 `// TODO(spec): needs <lib> because ...` 주석 후 최소한으로 추가한다.
7. 시크릿은 절대 커밋하지 않는다. `.env`는 `.gitignore`에 포함, `.env.example`만 커밋.

---

## §1. 도메인 규칙 (정확 정의)

### 1.1 용어
| 용어 | 정의 |
|---|---|
| 그룹(group) | 친구들의 컨테이너. 방장(owner) 1명. 시즌들을 가짐 |
| 시즌(season) | 4주(28일) 단위 챌린지 1회. 그룹당 동시 active 시즌은 최대 1개 |
| 인증(checkin) | 앱 내 카메라로 찍은 사진 1장 업로드. **하루(KST) 1회만 유효 카운트** |
| 주차(week_no) | 시즌 시작일 기준 7일 블록. `week_no = floor((date - start_date)/7) + 1`, 값 1~4 |
| 패스(pass) | 정당 사유 면제권. 시즌당 `pass_quota`개(기본 1). 사용한 주의 목표를 1 감소 |
| 벌금 장부(penalty_ledger) | 주차별 미달 × 벌금액 기록. **앱은 기록만 하고 돈은 만지지 않는다** |

### 1.2 시즌 상태 머신
```
draft ──(방장이 시작, 멤버≥min, [결제 필요 시 paid=true])──▶ active ──(정산 완료 후 end_date 경과)──▶ closed
  └──(방장이 삭제)──▶ (row delete)          active 중 규칙(target/penalty/기간) 변경 불가
```
- `active` 전이 조건: `group_members` 수 ≥ `min_season_members`(app_config, 기본 3 — 2로 낮추면 미니 모드, §17-1), `start_date` ≥ 오늘(그룹 타임존), 무료 플랜 제한(§11) 통과.
- `end_date = start_date + weeks×7 − 1`. `seasons.weeks` 기본 4(스키마는 1~8 지원, MVP UI는 4 고정 — §17-2).

### 1.3 인증 유효 규칙
1. 업로드 경로는 **앱 내 카메라 촬영만** 허용(갤러리 선택 UI 자체를 두지 않는다).
2. 판정 시각 = **서버 수신 시각**(`now()`)을 그룹 타임존으로 변환한 날짜. 클라이언트 EXIF는 참고용으로만 저장(GPS 필드 제거, §15).
3. `checkin_date`(KST 날짜)와 `week_no`는 **DB 트리거가 서버에서 계산**해 저장한다(§5.4).
4. 같은 사람이 같은 날 2회 이상 업로드하면 DB unique 제약으로 거부한다(에러 코드 `23505` → 클라에서 "오늘은 이미 인증했어요" 처리).
5. 시즌 기간(start_date~end_date) 밖의 인증은 트리거가 예외를 던져 거부한다.

### 1.4 정산 규칙 (핵심 수식)
- 주차 목표: `target_count` (rule_type이 `daily`면 target_count=7로 저장. 정산 수식은 단일화)
- 주차별 미달: `missed = max(0, target_count − valid_checkin_days − pass_used_this_week)`
- 주차별 벌금: `amount = missed × penalty_amount`
- **정산 시점**: 매일 00:10 KST 배치가 "완결 + 이의제기 버퍼 경과"한 주만 정산한다.
  조건: `week_end + 2일 < 오늘(그룹 타임존)` (48시간은 이의제기 처리 버퍼, §1.5)
- 멱등성: `penalty_ledger` unique(season_id, user_id, week_no) + `ON CONFLICT DO NOTHING`.
- 전체 `weeks`개 주차가 모두 정산되고 `end_date + 2일 < 오늘(그룹 타임존)`이면 시즌 `closed` 처리.
- `settled`(송금 완료)는 **본인이 체크**, 방장이 `confirmed_by_owner`로 최종 확인.

### 1.5 이의제기·투표 규칙
- 제기 가능: 같은 시즌 멤버, 인증 업로드 후 **24시간 이내**, 본인 인증에는 불가.
- 투표 자격: 인증 당사자를 제외한 시즌 멤버. 1인 1표(무효 찬성 true / 반대 false).
- 마감: 제기 후 **48시간** 또는 전원 투표 완료 시 즉시.
- 판정: `무효 찬성 > 반대` → checkin `rejected`. 동수 포함 그 외 → `valid` 유지. 판정은 Edge Function이 수행.
- 인증 1건당 이의제기는 1회만.

### 1.6 패스 규칙
- 시즌당 `pass_quota`개(기본 1, 0~4 설정 가능). 이월 없음.
- 사용 대상 주: 현재 주 또는 아직 정산되지 않은 과거 주. 한 주에 1개만.
- 사용은 RPC `use_pass(season_id, week_no)`로만 가능(§5.6). 취소 불가.

### 1.7 미성년자·안전 규칙
- `profiles.is_adult = false`인 유저가 방장인 시즌은 `penalty_amount`를 서버가 0으로 강제.
- 벌금 상한: `penalty_amount ≤ 50,000`(원). 생성 UI 기본값 5,000, 권장 상한 안내 10,000.
- 사진은 그룹 멤버 외 접근 불가(Storage RLS, §5.7). 시즌 `closed` 후 90일 지나면 원본 파기(§6.4).

---

## §2. 기술 스택·버전 정책

| 영역 | 선택 | 비고 |
|---|---|---|
| 앱 | **Expo SDK(최신 안정)** + React Native + TypeScript, `expo-router` | Expo Go가 아닌 **expo-dev-client**(카카오 SDK 때문) |
| 상태/데이터 | `@tanstack/react-query` + `zustand`(로컬 UI 상태만) | 서버 상태는 전부 react-query |
| 백엔드 | Supabase: Postgres, Auth, Storage, Realtime, Edge Functions(Deno), pg_cron | |
| SDK | `@supabase/supabase-js` v2 | 타입은 `supabase gen types`로 생성 |
| 로그인 | Apple: `expo-apple-authentication` / Kakao: `@react-native-seoul/kakao-login` → `supabase.auth.signInWithIdToken` | 개발 초기(T2)는 Apple + 이메일 OTP로 먼저 동작시키고 카카오는 dev build에서 활성화 |
| 카메라/이미지 | `expo-camera`(CameraView), `expo-image-manipulator`(리사이즈) | 갤러리 피커 사용 금지 |
| 푸시 | `expo-notifications` + Expo Push API | |
| 딥링크 | `expo-linking` + expo-router 라우트 `invite/[code]` | scheme: `fine://`, 웹 링크는 추후 |
| 공유 카드 | `react-native-view-shot` + `expo-sharing` | |
| 결제 | `react-native-purchases`(RevenueCat) — **feature flag `PAYMENTS_ENABLED`로 격리** | T12에서만 |
| 분석/에러 | `posthog-react-native`, `@sentry/react-native` + **자체 이벤트 로그·KPI 마트** | 이벤트 스키마 §12, 데이터 파이프라인 §18 (DE 포트폴리오 축) |

---

## §3. 리포지토리 구조

```
fine/
├── TECH-SPEC.md                  # 본 문서
├── app.config.ts                 # Expo 설정 (scheme, plugins, extra=env 주입)
├── .env.example
├── package.json  tsconfig.json  eslint.config.js
├── app/                          # expo-router
│   ├── _layout.tsx               # Providers(QueryClient, Auth, PostHog) + 세션 게이트
│   ├── (auth)/sign-in.tsx
│   ├── (app)/
│   │   ├── index.tsx             # 홈: 내 그룹 목록
│   │   ├── settings.tsx
│   │   ├── paywall.tsx           # PAYMENTS_ENABLED시에만 라우팅
│   │   └── group/
│   │       ├── create.tsx        # 그룹 생성 + 시즌 규칙 위저드
│   │       └── [id]/
│   │           ├── _layout.tsx   # 탭: 피드 | 장부
│   │           ├── index.tsx     # 그룹 홈(피드)
│   │           ├── ledger.tsx    # 정산 장부
│   │           ├── checkin.tsx   # 카메라 (modal)
│   │           └── dispute/[checkinId].tsx
│   └── invite/[code].tsx         # 초대 딥링크 랜딩(로그인 전이면 로그인 후 복귀)
├── src/
│   ├── lib/ supabase.ts  notifications.ts  analytics.ts  dates.ts  constants.ts
│   ├── api/                      # react-query 훅. 화면은 여기만 호출
│   │   ├── groups.ts  seasons.ts  checkins.ts  ledger.ts  disputes.ts  profile.ts
│   ├── components/               # Button, Card, Avatar, StreakBadge, PhotoFeedItem,
│   │                             # LedgerRow, EmptyState, CountdownPill, ShareCard, HouseAdCard
│   ├── stores/ ui.ts             # zustand: 토스트, 시트 상태 등
│   └── types/ db.ts              # supabase gen types 출력
├── supabase/
│   ├── config.toml
│   ├── migrations/0001_init.sql          # §5 전체
│   ├── migrations/0002_storage.sql       # §5.7
│   ├── migrations/0003_cron.sql          # §5.8
│   ├── migrations/0004_payments.sql      # §11 (T12)
│   ├── migrations/0005_analytics.sql     # §18 데이터 파이프라인 (T11)
│   ├── functions/
│   │   ├── settle-week/index.ts
│   │   ├── remind-daily/index.ts
│   │   ├── resolve-disputes/index.ts
│   │   └── rc-webhook/index.ts           # T12
│   └── seed.sql                          # 개발용 시드
└── scripts/ gen-types.sh
```

---

## §4. 환경 변수 (.env.example)

```bash
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
EXPO_PUBLIC_POSTHOG_KEY=            # 없으면 no-op
EXPO_PUBLIC_SENTRY_DSN=             # 없으면 no-op
EXPO_PUBLIC_PAYMENTS_ENABLED=false
EXPO_PUBLIC_RC_API_KEY_IOS=
EXPO_PUBLIC_RC_API_KEY_ANDROID=
KAKAO_NATIVE_APP_KEY=               # app.config.ts plugin에 주입
# Edge Functions 전용 (supabase secrets set 으로 관리)
SUPABASE_SERVICE_ROLE_KEY=
EXPO_ACCESS_TOKEN=                  # (선택) Expo push 보안 강화용
RC_WEBHOOK_AUTH=                    # RevenueCat 웹훅 Authorization 헤더 값
```

---

## §5. 데이터베이스 — `supabase/migrations/0001_init.sql` (전문)

> 아래 SQL을 그대로 마이그레이션 파일로 사용한다. 정산·판정 로직까지 DB 함수로 내장되어 Edge Function은 얇게 유지된다.

```sql
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
```

### §5.7 Storage — `0002_storage.sql`

```sql
insert into storage.buckets (id, name, public)
values ('checkins', 'checkins', false)
on conflict (id) do nothing;

-- 경로 규약: checkins/{season_id}/{user_id}/{uuid}.jpg
create policy checkin_photo_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'checkins'
    and (storage.foldername(name))[2] = auth.uid()::text
    and public.is_season_member(((storage.foldername(name))[1])::uuid)
  );

create policy checkin_photo_read on storage.objects for select to authenticated
  using (
    bucket_id = 'checkins'
    and public.is_season_member(((storage.foldername(name))[1])::uuid)
  );
-- update/delete 정책 없음 = 클라이언트 수정·삭제 불가 (파기는 §6.4 배치)
```

### §5.8 스케줄 — `0003_cron.sql`

```sql
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
```

### §5.9 개발 시드 — `supabase/seed.sql`
로컬(`supabase start`)에서 테스트 유저 4명을 Auth Admin API로 생성한 뒤(이메일 `t1@fine.dev`~`t4@fine.dev` / 비번 `test1234`), 아래로 그룹·시즌을 구성한다. 유저 생성은 `scripts/seed-users.ts`(supabase-js admin, service key 사용)로 작성할 것.

```sql
-- seed-users.ts 실행 후, t1의 uuid를 :owner 로 치환해 실행
insert into groups (id, name, owner_id)
values ('11111111-1111-1111-1111-111111111111', '아침런 크루', :owner);
-- t2~t4는 join_group RPC 또는 group_members 직접 insert(로컬 한정)로 합류
insert into seasons (group_id, title, target_count, penalty_amount, start_date, status)
values ('11111111-1111-1111-1111-111111111111', '주3회 러닝', 3, 5000, kst_today(), 'active');
```

---

## §6. Edge Functions (`supabase/functions/`)

공통 헬퍼 `_shared/push.ts` 를 추가한다(§3 구조에 포함).

```ts
// supabase/functions/_shared/push.ts
type PushMsg = { to: string; title: string; body: string; data?: Record<string, unknown> };

export async function sendPush(messages: PushMsg[]) {
  const valid = messages.filter(m => m.to?.startsWith("ExponentPushToken"));
  for (let i = 0; i < valid.length; i += 100) {          // Expo 권장: 100개 단위
    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(valid.slice(i, i + 100)),
    });
    if (!res.ok) console.error("expo push failed", await res.text());
  }
}

export function serviceClientEnv() {
  return {
    url: Deno.env.get("SUPABASE_URL")!,
    key: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  };
}

export function assertServiceAuth(req: Request) {
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.endsWith(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!)) {
    throw new Response("forbidden", { status: 403 });
  }
}
```

### 6.1 `settle-week/index.ts` — 매일 00:10 KST

```ts
import { createClient } from "npm:@supabase/supabase-js@2";
import { assertServiceAuth, sendPush, serviceClientEnv } from "../_shared/push.ts";

Deno.serve(async (req) => {
  try { assertServiceAuth(req); } catch (r) { return r as Response; }
  const { url, key } = serviceClientEnv();
  const db = createClient(url, key);

  const { data: inserted, error } = await db.rpc("settle_due_weeks");
  if (error) return new Response(error.message, { status: 500 });

  if ((inserted ?? 0) > 0) {
    // 방금 정산된 행의 대상자에게 "정산표 도착" 푸시 (최근 30분 내 생성분)
    const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { data: rows } = await db
      .from("penalty_ledger")
      .select("user_id, week_no, amount, season_id")
      .gte("created_at", since);
    const userIds = [...new Set((rows ?? []).map(r => r.user_id))];
    const { data: profs } = await db
      .from("profiles").select("id, push_token").in("id", userIds);
    const tokenOf = new Map((profs ?? []).map(p => [p.id, p.push_token]));
    await sendPush((rows ?? [])
      .filter(r => tokenOf.get(r.user_id))
      .map(r => ({
        to: tokenOf.get(r.user_id)!,
        title: `W${r.week_no} 정산표 도착 📒`,
        body: r.amount > 0
          ? `이번 주 벌금 ${r.amount.toLocaleString()}원 — 장부를 확인하세요`
          : "이번 주 벌금 0원! 완벽했어요 🎉",
        data: { url: `fine:///group/season/${r.season_id}/ledger` },
      })));
  }
  return Response.json({ inserted });
});
```

### 6.2 `remind-daily/index.ts` — 매일 20:00 KST

```ts
import { createClient } from "npm:@supabase/supabase-js@2";
import { assertServiceAuth, sendPush, serviceClientEnv } from "../_shared/push.ts";

Deno.serve(async (req) => {
  try { assertServiceAuth(req); } catch (r) { return r as Response; }
  const { url, key } = serviceClientEnv();
  const db = createClient(url, key);

  const { data: targets, error } = await db.rpc("get_remind_targets");
  if (error) return new Response(error.message, { status: 500 });

  await sendPush((targets ?? []).map((t: any) => ({
    to: t.push_token,
    title: "오늘 인증 아직이에요 ⏰",
    body: `${t.group_name} — 오늘 놓치면 ${Number(t.penalty).toLocaleString()}원이 쌓입니다 🔥`,
    data: { url: "fine:///" },
  })));
  return Response.json({ sent: targets?.length ?? 0 });
});
```

### 6.3 `resolve-disputes/index.ts` — 매시 5분

```ts
import { createClient } from "npm:@supabase/supabase-js@2";
import { assertServiceAuth, serviceClientEnv } from "../_shared/push.ts";

Deno.serve(async (req) => {
  try { assertServiceAuth(req); } catch (r) { return r as Response; }
  const { url, key } = serviceClientEnv();
  const db = createClient(url, key);
  const { data, error } = await db.rpc("resolve_open_disputes");
  if (error) return new Response(error.message, { status: 500 });
  return Response.json({ resolved: data });
});
```

### 6.4 사진 파기 배치 (v1.1, 참고)
`closed` 후 90일 지난 시즌의 `checkins.photo_path`를 Storage에서 삭제하고 컬럼을 `'purged'`로 치환하는 `purge-photos` 함수. MVP 범위 밖 — cron 등록만 미리 주석으로 남겨둔다.

---

## §7. 클라이언트 화면 명세

> 모든 서버 접근은 `src/api/*`의 react-query 훅으로만. 화면 파일에서 `supabase.` 직접 호출 금지.
> 에러 처리 규약: RPC/트리거의 `raise exception 'CODE'`는 supabase 에러 `message`에 포함됨 → `src/lib/errors.ts`의 `codeToMessage(code)` 매핑으로 토스트 표시. (예: `NEED_MORE_MEMBERS` → "시작 인원이 부족해요 (기본 3명)")

### 7.1 `(auth)/sign-in`
- **목적**: Apple / 카카오 / (개발용) 이메일 OTP 로그인.
- **액션**: 성공 시 `router.replace('/')`. 대기 중이던 초대 코드(§7.4)가 있으면 `invite/[code]`로 복귀.
- **AC**: 로그인 후 `profiles` 행이 존재(트리거). 로그아웃 → 재로그인 반복에도 크래시 없음.

### 7.2 `(app)/index` — 홈
- **데이터**: `useMyGroups()` = groups + 각 그룹의 active/draft 시즌 + 오늘 내 인증 여부 + 내 미납 합계.
- **UI**: 그룹 카드 리스트(그룹명, 시즌 D-day, 오늘 인증 뱃지, 미납 배지), FAB "그룹 만들기", 빈 상태(EmptyState: "첫 그룹을 만들어보세요").
- **AC**: 그룹 0개/1개/여러 개 상태 모두 정상. 당겨서 새로고침.

### 7.3 `(app)/group/create` — 생성 위저드 (2 step)
- **Step1**: 그룹 이름(≤30자). `insert groups` → 트리거로 방장 멤버 등록.
- **Step2**: 시즌 규칙 — rule_type(주 N회 | 매일), target(1~7, 매일 선택 시 7 고정), 벌금액(0~50,000, 기본 5,000, 슬라이더+프리셋 3/5/10k), 패스(0~4, 기본 1), 시작일(오늘/내일/다음 월요일). `insert seasons(status='draft')`.
- **완료 화면**: 초대 링크 `fine:///invite/[code]` + 코드 8자리 + "카톡으로 초대" 공유 버튼. "{min}명 모이면 시작할 수 있어요"(min = `min_season_members` 설정값) 안내와 [시즌 시작] 버튼(멤버<min이면 비활성) → `rpc start_season`.
- **AC**: `PAYWALL_REQUIRED` 에러 시 paywall 라우팅(플래그 on일 때). `START_DATE_PAST` 등 코드별 토스트.

### 7.4 `invite/[code]` — 딥링크 랜딩
- **로직**: 비로그인 → 코드를 zustand에 보관 후 sign-in으로; 로그인 상태 → `rpc join_group(code)` → 성공 시 그룹 홈으로 replace.
- **엣지**: `INVALID_CODE`(만료·오타), `GROUP_FULL`(8명) 각각 전용 화면. 이미 멤버면 조용히 그룹 홈으로.
- **AC**: 콜드 스타트(앱 종료 상태에서 링크 탭)에서도 동작.

### 7.5 `(app)/group/[id]/index` — 그룹 홈(피드)
- **헤더**: 시즌 타이틀, D-day, 주차 진행바, 내 스트릭(연속 인증일), [인증하기] 대형 버튼(오늘 완료 시 체크 상태로 비활성).
- **피드**: 최신순 인증 카드(아바타, 닉네임, 시간, 사진, 상태 뱃지 valid/disputed/rejected). 카드 롱프레스 → "이의제기"(본인 글 제외, 24h 이내만 노출).
- **데이터**: `useSeasonFeed(seasonId)` 페이지네이션(20개) + Realtime 구독(§10)으로 신규 인증 실시간 prepend.
- **draft 상태**: 피드 대신 멤버 리스트 + 초대 링크 + [시즌 시작](방장만).
- **AC**: 사진은 signed URL(1h)로 로드. 오프라인 시 캐시 표시 + 재시도.

### 7.6 `(app)/group/[id]/checkin` — 카메라 (모달)
- **UI**: 전면/후면 전환, 셔터, 촬영 후 미리보기 → [다시 찍기]/[인증 올리기]. 갤러리 버튼 없음.
- **업로드 파이프라인**: `expo-image-manipulator`로 장변 1280px·JPEG 0.7 압축 → `storage.upload('checkins/{seasonId}/{uid}/{uuid}.jpg')` → `insert checkins({season_id, photo_path, client_exif})`.
- **엣지**: `23505`(unique) → "오늘은 이미 인증했어요". `OUT_OF_SEASON`/`SEASON_NOT_ACTIVE` 토스트. 업로드 후 insert 실패 시 업로드 파일 삭제 시도.
- **AC**: 권한 거부 상태 안내 화면. 업로드 성공 → 피드 즉시 반영 + 햅틱.

### 7.7 `(app)/group/[id]/ledger` — 정산 장부
- **데이터**: `useLedger(seasonId)` = 주차별 매트릭스(멤버 × W1~W4 금액) + 개인별 합계 + settled/confirmed 상태.
- **UI**: 주차 탭(정산 전 주는 "집계 전" 표시), 내 행에 [보냈어요] 토글 → `rpc mark_settled`; 방장에겐 각 행 [확인] → `rpc confirm_settled`. 하단 [정산표 공유] → ShareCard 캡처(§7.9).
- **패스**: 내 카드에 "패스 사용(남은 n개)" → `rpc use_pass(season, 현재주)`; `WEEK_SETTLED`/`NO_PASS_LEFT` 코드 처리.
- **AC**: 0원 주차도 행 표시. 미납(=settled false & amount>0) 합계가 홈 배지와 일치.

### 7.8 `(app)/group/[id]/dispute/[checkinId]`
- **UI**: 대상 사진 + 사유 입력(2~200자) 제출 → `insert disputes`. 이후 동일 화면이 투표 화면으로: 남은 시간 카운트다운, [반칙이다]/[괜찮다] → `insert dispute_votes`, 현재 집계 표시, 당사자는 열람만.
- **AC**: `DISPUTE_WINDOW_CLOSED`, `TARGET_CANNOT_VOTE`, 중복 투표(23505) 코드 처리. 판정 완료 시 결과 배너.

### 7.9 공유 카드 (`components/ShareCard.tsx`)
- 주간 정산표(그룹명/주차/멤버별 금액/벌금왕 강조)를 1080×1350 뷰로 렌더 → `react-native-view-shot` 캡처 → `expo-sharing`. 하단에 앱 로고+초대 코드 워터마크(바이럴 연결).

### 7.10 `settings` / `paywall`
- settings: 닉네임 수정, 푸시 on/off(토큰 등록·해제), 로그아웃, 그룹 나가기, 약관·개인정보 링크, 계정 삭제(TODO v1.1).
- paywall: `PAYMENTS_ENABLED=true`일 때만. RevenueCat Offerings 표시 → 구매 → `rpc redeem_season_pass(seasonId)`(§11).

---

## §8. 핵심 플로우 시퀀스

**A. 인증 업로드**
`카메라 촬영 → 리사이즈(1280px) → Storage PUT(checkins/{s}/{u}/{uuid}.jpg) → INSERT checkins(트리거: 멤버·기간 검증, date/week 계산) → Realtime broadcast → 그룹 전원 피드 갱신`

**B. 초대 수락**
`카톡 링크 탭 → fine:///invite/CODE → (비로그인: 코드 보관→로그인) → rpc join_group → group_members INSERT → 그룹 홈 랜딩 → analytics invite_accepted`

**C. 주간 정산**
`cron 00:10 → settle-week fn → rpc settle_due_weeks(주말+48h 지난 주 집계, ON CONFLICT 멱등) → penalty_ledger INSERT → 시즌 4주 완료 시 closed → 대상자 푸시 "정산표 도착"`

**D. 이의제기**
`피드 롱프레스(24h 내) → disputes INSERT(트리거: checkin→disputed) → 멤버 투표 → (전원투표 or 48h) → resolve-disputes fn → 과반 무효 시 rejected + 기정산 주 재계산`

---

## §9. 푸시 알림 명세

| ID | 트리거 | 제목 | 본문 템플릿 | 탭 시 이동 |
|---|---|---|---|---|
| remind_daily | 매일 20:00 KST, 미인증자(§5 get_remind_targets) | 오늘 인증 아직이에요 ⏰ | `{group} — 오늘 놓치면 {penalty}원이 쌓입니다 🔥` | 그룹 홈 |
| ledger_ready | 주간 정산 직후 | W{n} 정산표 도착 📒 | 벌금>0: `이번 주 벌금 {amount}원 — 장부를 확인하세요` / 0원: `이번 주 벌금 0원! 완벽했어요 🎉` | 장부 탭 |
| dispute_opened (v1.1) | 이의제기 생성 시 그룹원에게 | 이의제기가 올라왔어요 ⚖️ | `{nickname}의 인증에 투표해 주세요 (48시간)` | 이의제기 화면 |

- 토큰 등록: 로그인 후 + settings 토글 on 시 `expo-notifications`의 `getExpoPushTokenAsync({ projectId })` → `profiles.push_token` 업데이트. 권한 거부 시 null 유지.
- 포그라운드 수신은 인앱 토스트로 표시, 백그라운드 탭 시 `data.url`로 라우팅(`expo-router` + `Linking`).

---

## §10. 클라이언트 데이터 규약

```ts
// src/lib/supabase.ts
import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/db";

export const supabase = createClient<Database>(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { storage: AsyncStorage, autoRefreshToken: true,
            persistSession: true, detectSessionInUrl: false } },
);
```
(의존성 추가: `@react-native-async-storage/async-storage`, `react-native-url-polyfill` — §2 목록에 포함된 것으로 간주)

- **react-query 키 규약**: `['groups']`, `['season', id]`, `['feed', seasonId]`, `['ledger', seasonId]`, `['disputes', seasonId]`. 쓰기 성공 시 관련 키 invalidate.
- **Realtime**: 그룹 홈 마운트 시 구독, 언마운트 시 해제.
```ts
supabase.channel(`season:${seasonId}`)
  .on("postgres_changes", { event: "*", schema: "public",
      table: "checkins", filter: `season_id=eq.${seasonId}` },
      () => qc.invalidateQueries({ queryKey: ["feed", seasonId] }))
  .subscribe();
```
- Realtime 활성화를 위해 마이그레이션 말미(또는 1회 실행)로: `alter publication supabase_realtime add table public.checkins;`
- **사진 표시**: `storage.from('checkins').createSignedUrl(path, 3600)`. 서명 URL은 react-query로 캐시.

---

## §11. 수익화 — 결제(T12) 및 광고 정책

- RevenueCat 앱 유저 ID = Supabase `user.id` (`Purchases.logIn(uid)` 로그인 직후 호출).
- 상품: `fine_season_pass_4w` (소모성/비갱신, ₩9,900). Offering `default`.
- 흐름: paywall 구매 성공 → RC 웹훅 → `subscriptions`에 크레딧 행 적재 → 클라가 `rpc redeem_season_pass(seasonId)` 호출 → `seasons.paid=true` → `start_season` 통과.
- 활성화 절차: `app_config.payments_enabled = 'true'` + 클라 env `EXPO_PUBLIC_PAYMENTS_ENABLED=true`.

`supabase/migrations/0004_payments.sql`:
```sql
create or replace function public.redeem_season_pass(sid uuid) returns void
language plpgsql security definer set search_path = public as $$
declare credit_id uuid;
begin
  if not exists (select 1 from seasons s join groups g on g.id = s.group_id
                 where s.id = sid and g.owner_id = auth.uid())
    then raise exception 'OWNER_ONLY'; end if;
  select id into credit_id from subscriptions
   where user_id = auth.uid() and product_id = 'fine_season_pass_4w'
     and season_id is null and status = 'paid'
   order by created_at limit 1 for update;
  if credit_id is null then raise exception 'NO_CREDIT'; end if;
  update subscriptions set season_id = sid where id = credit_id;
  update seasons set paid = true where id = sid;
end $$;
```

`rc-webhook/index.ts` 핵심:
```ts
Deno.serve(async (req) => {
  if (req.headers.get("Authorization") !== Deno.env.get("RC_WEBHOOK_AUTH"))
    return new Response("forbidden", { status: 403 });
  const { event } = await req.json();
  const ok = ["INITIAL_PURCHASE", "NON_RENEWING_PURCHASE"].includes(event?.type)
          && event?.product_id === "fine_season_pass_4w";
  if (!ok) return Response.json({ ignored: true });
  const db = createClient(url, serviceKey);
  await db.from("subscriptions").insert({
    user_id: event.app_user_id, product_id: event.product_id,
    status: "paid", rc_event_id: event.id,           // unique → 멱등
  }).select().maybeSingle();                          // 중복이면 무시(23505 캐치)
  return Response.json({ ok: true });
});
```

### 11.5 광고 정책 (v1.1 확정 — 광고 미도입)

- **광고 SDK를 도입하지 않는다.** 배너·전면·리워드형 전부 해당하며, 무료 플랜에도 광고를 노출하지 않는다. 근거: ① 무료 유저는 초대로 유입되는 성장 엔진이라 초대 수락률(§13 최우선 지표)을 광고로 훼손할 수 없고, ② 친구 간 금전(장부)을 다루는 신뢰 카테고리이며, ③ 리워드형(광고 시청→패스권 등)은 손실 회피라는 제품 핵심 가설(§1.2)을 무력화한다.
- 대신 **자체 홍보 카드(HouseAdCard)** 슬롯만 둔다: `app_config.house_ads`(jsonb 배열, 항목 `{id,title,body,cta,url}`)를 읽어 렌더하고, X 닫기 시 해당 id를 AsyncStorage에 저장해 재노출하지 않는다. 원격 교체 가능(앱 배포 불필요). 용도는 업셀·초대 유도·공지에 한정.
- **배치 허용**: 홈 그룹 리스트 최하단, 정산 장부 하단. **영구 금지 구역**: 온보딩·로그인, invite 랜딩, 카메라, 피드 상단, 이의제기 화면.
- 훗날 광고를 재검토하더라도 금지 구역과 "게임 밸런스(벌금·패스)를 광고로 건드리지 않는다"는 원칙은 유지한다.

---

## §12. 분석 이벤트 스키마 (PostHog)

`analytics.track(name, props)` 래퍼로만 호출. 로그인 시 `identify(uid)`.
래퍼는 **이중 기록**한다: ① PostHog(제품 판단용 SaaS) ② `rpc track_event(name, props)`(자체 파이프라인 §18, fire-and-forget — 실패해도 UX에 영향 없도록 에러를 삼킨다).

| 이벤트 | 프로퍼티 | 시점 |
|---|---|---|
| sign_in | method: apple\|kakao\|email | 로그인 성공 |
| group_created | — | 그룹 생성 |
| invite_link_shared | — | 공유 시트 열림 |
| invite_accepted | group_id | join_group 성공 |
| season_started | members, target, penalty, pass_quota | start_season 성공 |
| checkin_submitted | week_no, day_index | insert 성공 |
| checkin_failed | code | insert 실패 |
| dispute_raised / dispute_voted | — / vote | 각 성공 시 |
| pass_used | week_no | use_pass 성공 |
| ledger_marked_settled | amount | mark_settled |
| share_card_created | type: weekly\|king | 캡처 성공 |
| paywall_viewed / purchase_completed | — / product_id | T12 |

핵심 KPI 매핑: 초대 수락률 = invite_accepted / invite_link_shared, 활성률 = checkin_submitted DAU 기반, 완주율은 SQL로 산출(ledger 4주 보유 & 인증률).

---

## §13. 수용 기준(AC) 마스터 체크리스트

1. 신규 유저가 **초대 링크 → 로그인 → 그룹 합류 → 첫 인증**까지 3분 내 완료 가능.
2. 같은 날 두 번째 인증은 서버가 거부하고, 클라는 "오늘은 이미 인증했어요"를 띄운다.
3. 시즌 멤버가 아닌 계정으로는 해당 그룹의 어떤 데이터(행/사진)도 조회되지 않는다(RLS).
4. `settle_due_weeks`를 임의로 2회 연속 실행해도 장부가 변하지 않는다(멱등).
5. §1.4 수식 수기 계산과 장부 금액이 일치한다 — 케이스: (a) 목표3·인증1·패스0 → 2×벌금, (b) 목표3·인증2·패스1 → 0원, (c) 목표3·인증0·패스1·인증1건 rejected → 2×벌금.
6. 이의제기 과반 무효 시 인증이 rejected 되고, 이미 정산된 주라면 금액이 재계산된다.
7. 20:00 리마인더는 "오늘 미인증 + 주 목표 미달성자"에게만 발송된다.
8. 미성년(is_adult=false) 방장의 시즌은 벌금이 0으로 강제된다.
9. 앱 재시작 후에도 세션이 유지되고, 딥링크 콜드 스타트가 동작한다.
10. 기기 시간을 조작해도 인증 날짜·주차 판정이 변하지 않는다(서버 판정).
11. `analytics.build_daily_kpis(d)`를 같은 날짜로 재실행해도 `daily_kpis` 행 값이 동일하다(멱등 ELT, §18).

---

## §14. 구현 순서 (Claude Code 작업 계획)

> 각 태스크 완료 시 DoD를 자가 검증하고 결과를 요약 보고한 뒤 다음으로 진행한다.

| # | 태스크 | 내용 | DoD |
|---|---|---|---|
| T0 | 프로젝트 초기화 | Expo(TS, expo-router) 생성, §2 의존성 설치, §3 폴더 스캐폴딩, eslint/prettier, `.env.example` | `npx tsc --noEmit` 0 에러, 앱 부팅 |
| T1 | DB 구축 | `supabase init/start`, 0001~0002 적용, `scripts/seed-users.ts` + seed.sql, `supabase gen types` → `src/types/db.ts` | `supabase db reset` 성공, 타입 컴파일 통과 |
| T2 | 인증 | supabase 클라(§10), 이메일 OTP + Apple 로그인, 세션 게이트(_layout), profiles 확인 | 재시작 후 세션 유지, AC-9 전반부 |
| T3 | 그룹·초대 | 홈, 생성 위저드 Step1, invite/[code], join_group 연동, 공유 시트 | 계정 2개로 초대 E2E, INVALID_CODE/GROUP_FULL 처리 |
| T4 | 시즌 | 위저드 Step2, start_season 연동, draft 그룹 홈 | NEED_MORE_MEMBERS 등 코드별 토스트, 활성 시즌 중복 차단 |
| T5 | 인증·피드 | 카메라 모달, 리사이즈·업로드 파이프라인, 피드 + Realtime | AC-1·2, 상대 화면 5초 내 반영 |
| T6 | 정산 | settle-week 함수 배포, (테스트용 start_date 과거 시드) 수동 호출, 장부 UI, mark/confirm RPC | AC-4·5, 장부·홈 미납 배지 일치 |
| T7 | 푸시 | 토큰 등록, remind-daily 배포·수동 호출, 딥링크 라우팅 | 실기기 수신 + 탭 이동, AC-7 |
| T8 | 이의제기 | 제기·투표 화면, resolve-disputes 배포, 재계산 검증 | AC-6 |
| T9 | 패스·스트릭 | use_pass UI, 스트릭 계산(연속 checkin_date) 표시 | AC-5(b) 재확인, 패스 코드 처리 |
| T10 | 공유 카드 | ShareCard 캡처·공유 | 이미지가 OS 공유 시트로 전달 |
| T11 | 계측·데이터 파이프라인 | PostHog·Sentry 연동, §12 이벤트 이중 기록, 0005 적용 + KPI 크론 | 이벤트 도착 + 어제자 `daily_kpis` 생성 + DQ 4종 통과 (§18) |
| T12 | 결제(플래그) | 0004 적용, rc-webhook, paywall, redeem 연동 | 샌드박스 구매→paid=true, 플래그 off 시 경로 미실행 |
| T13 | QA | §13·§15 전 항목 점검, 시드 리셋 스크립트, README | 체크리스트 전 항목 ✅ |

---

## §15. 보안·QA 체크리스트

- [ ] 서비스 롤 키가 클라이언트 번들에 없음 (`grep -r SERVICE_ROLE app/ src/` 무결과)
- [ ] 타 그룹 계정으로 groups/seasons/checkins/ledger 조회 시 0행 (RLS 침투 테스트)
- [ ] Storage: 타인 season 경로 업로드 시도 → 거부, 비멤버 signed URL 발급 시도 → 실패
- [ ] `client_exif` 저장 시 GPS·위치 필드 제거 (위치정보 미수집 원칙)
- [ ] 트리거 예외 코드 전부 `codeToMessage` 매핑 존재 (미매핑 시 "잠시 후 다시 시도" 폴백)
- [ ] 기기 시간 ±3일 조작 테스트 → 판정 불변 (AC-10)
- [ ] 사진 업로드 실패/insert 실패 롤백 경로 동작
- [ ] 이미지 평균 용량 ≤ 300KB (1280px·q0.7 확인)
- [ ] 앱 심사 대비: 계정 삭제 경로(최소 문의 링크), 개인정보처리방침 URL, 카메라 권한 문구(ko)
- [ ] "베팅/내기" 문구 미사용 — "약속/벌금/정산" 언어만 (스토어 심사·§보고서 10장)
- [ ] 광고 SDK 미포함 — `grep -ri "admob\|applovin\|adfit\|ironsource" package.json app/ src/` 무결과 (§11.5)

---

## §16. Claude Code 시작 프롬프트 (복사용)

```
이 리포지토리의 TECH-SPEC.md가 단일 명세다. §0 작업 원칙을 준수하며
§14의 T0부터 순서대로 구현해라. 각 태스크 완료 시:
1) 변경 파일 목록, 2) DoD 자가검증 결과, 3) 남긴 TODO(spec) 주석
을 보고하고 다음 태스크로 진행해라. 스펙에 없는 기능을 추가하거나
스키마·규칙을 임의 변경하지 마라. 지금 T0부터 시작해.
```

---

## §17. 확장 가이드 — 미래 기능이 현재 스키마에 붙는 방법

> v1.1에서 확장 대비로 미리 심어둔 것: `groups.timezone`(판정에 이미 사용), `seasons.weeks`(1~8), `seasons.rules`(jsonb 예약), `app_config`의 인원 기준 설정화, `house_ads`. 아래는 각 미래 기능의 착륙 지점이다.

| # | 확장 | 스키마 변경 | 작업 요약 |
|---|---|---|---|
| 1 | 2인 미니 모드 | 없음 | `app_config.min_season_members = '2'` + 위저드 UI 개방. 정산·판정 로직 무수정 |
| 2 | 시즌 기간 옵션(2·6·8주) | 없음 | 위저드에서 `weeks` 선택 개방. settle은 `generate_series(1, weeks)`로 이미 대응 |
| 3 | 커스텀 요일 규칙(월·수·금 등) | 없음 (`rules` 예약) | `rules = {"type":"weekdays","days":[1,3,5]}` 저장 → settle의 주간 목표 계산과 리마인더 대상 조건에 rules 분기 추가. `rule_type` enum은 표시용으로 유지 |
| 4 | 글로벌·다중 타임존 | 없음 | 판정(인증일·주차·정산·시작일)은 이미 그룹 tz 기준. 남은 작업: `remind-daily`를 매시 실행으로 전환하고 "현지 시각 20시" 그룹만 필터 |
| 5 | 공개 챌린지 | `groups.visibility` ('private' / 'public') + `reports` 테이블 | 탐색 탭·참가 신청·신고/차단, RLS에 visibility 분기. 사행성 표현 재점검(보고서 10장) |
| 6 | B2B 사내 챌린지 | `organizations`, `org_members`, `groups.org_id uuid null` | 그룹 위 계층 1개 추가. 좌석 과금은 subscriptions에 org 스코프 확장. 개인 플로우 영향 없음 |
| 7 | 실결제(벌금 예치·이체) | 별도 `payments_*` 모듈 신설 | `penalty_ledger`는 금액의 소스오브트루스로 유지, 결제 모듈이 이를 참조해 집행. **착수 전 전금법·사행성 법률 자문 필수**(보고서 10장) |
| 8 | AI 인증 보조 | `checkins.ai_score numeric null`, `ai_labels jsonb null` | 업로드 후 비동기 함수가 스코어 기록. 판정 주체는 계속 사람(투표) — AI는 힌트만 |
| 9 | 웹 대시보드 | 없음 | 동일 Supabase에 Next.js 클라 추가. RLS·RPC 전부 재사용 |
| 10 | 다국어(i18n) | 없음 | 컨벤션: 사용자 노출 문자열은 `src/i18n/ko.ts` 상수로만 작성(화면 내 하드코딩 금지, T0부터 적용) → 로케일 파일 추가만으로 확장 |
| 11 | 외부 데이터 웨어하우스 | 없음 (수출만 추가) | 이벤트·마트가 커지면 BigQuery 일배치 수출 + dbt 이관(§18.5). 앱·판정 로직 무영향 |

**호환성 원칙**: ① 컬럼 추가는 nullable 또는 default로만, ② 판정 로직 변경은 DB 함수 내부에서만, ③ 클라이언트는 모르는 필드를 무시하도록 작성(하위 호환), ④ 마이그레이션은 forward-only.

---

## §18. 데이터 파이프라인 & DE 포트폴리오 설계 (v1.2)

> 이 장의 목적은 두 가지다. ① 제품 KPI(§보고서 9장)를 **우리가 소유한 데이터**로 계산한다 — PostHog는 제품 판단용 보조로 유지하되, 지표의 원장(源帳)은 자체 파이프라인이다. ② 이 프로젝트를 제작자의 **데이터 엔지니어링 커리어 포트폴리오**로 만든다: 이벤트 택소노미 설계 → 멱등 ELT → 마트 → 데이터 품질 테스트 → 웨어하우스 이관 판단까지, DE의 표준 사이클을 실물 서비스에서 한 바퀴 돌린 증거를 남긴다.

### 18.1 설계 원칙

1. **트랜잭션 우선(Transaction-first)**: DAU·인증률·완주율처럼 원천 테이블(checkins, profiles, seasons)에서 계산 가능한 지표는 이벤트가 아니라 트랜잭션 데이터에서 뽑는다(이벤트 유실과 무관하게 정확).
2. **이벤트는 퍼널 보강용**: 트랜잭션 흔적이 없는 행동(공유 버튼, 초대 링크 노출, 페이월 조회)만 이벤트 로그가 담당한다.
3. **멱등 ELT**: 모든 마트 빌드는 같은 날짜로 재실행해도 결과가 동일한 UPSERT(AC-11).
4. **분리된 스키마**: 분석 객체는 `analytics` 스키마에 격리한다. Supabase API 노출 스키마에 `analytics`를 추가하지 않는다(클라이언트 직접 접근 불가) — 쓰기는 `public.track_event` RPC, 읽기는 service role/SQL 콘솔만.
5. 시간 기준: 마트는 MVP에서 **KST 고정**(전사 지표의 단일 타임존). 글로벌 확장 시 §17-4와 동일하게 tz 버킷팅으로 진화.

### 18.2 `supabase/migrations/0005_analytics.sql` (전문)

```sql
-- =========================================================
-- 0005_analytics.sql : 이벤트 로그, KPI 일마트, 코호트 뷰, DQ, 크론
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
```

### 18.3 클라이언트 연동 (`src/lib/analytics.ts`)

```ts
export async function track(name: string, props: Record<string, unknown> = {}) {
  try { posthog?.capture(name, props); } catch {}
  supabase.rpc("track_event", { name, props }).then(
    () => {}, () => {});          // fire-and-forget: 어떤 실패도 UX에 전파 금지
}
```

### 18.4 조회·시각화 (MVP)

- 운영 조회는 Supabase SQL 콘솔에 저장 쿼리로 시작: `select * from analytics.daily_kpis order by kpi_date desc limit 30;` / 코호트 유지율 쿼리 / `select * from analytics.dq_results where passed = false`.
- 대시보드가 필요해지면 read-only DB 유저를 만들어 **Metabase(셀프호스팅) 또는 Looker Studio**를 붙인다 — 앱 코드 무변경.

### 18.5 진화 경로 (웨어하우스 이관 판단 기준)

인DB 마트로 시작하는 이유: 이 규모에서 외부 웨어하우스는 비용·운영만 늘린다. 아래 **신호가 2개 이상** 켜지면 이관한다 — ① events 월 1천만 행 초과, ② 마트 빌드가 5분 초과 또는 운영 DB 부하 체감, ③ 분석 협업자(2인 이상) 등장, ④ 조인 대상 외부 소스(스토어 리포트, 광고비 등) 추가.

이관 순서: `analytics.events`를 일 단위 Parquet로 GCS 수출 → BigQuery 적재 → **현재의 마트 SQL 함수를 그대로 dbt model로 이식**(build_daily_kpis가 곧 model, dq_checks가 곧 dbt test) → 오케스트레이션 pg_cron → Dagster(권장) 전환. 이 스펙의 함수형 SQL 구성은 처음부터 이 이식을 염두에 둔 형태다.

### 18.6 DE 포트폴리오 어필 포인트 (이력서·면접용 정리)

이 프로젝트 하나로 증빙 가능한 역량: ① 이벤트 택소노미 설계와 수집 SDK 래퍼(이중 기록·장애 무해화), ② 트랜잭션 원천 기반 KPI 정의와 **멱등 일배치 ELT**(UPSERT·재실행 안전), ③ 주간 코호트·리텐션·퍼널 SQL, ④ **데이터 품질 테스트 자동화**(dq_results, 실패 카운트 반환), ⑤ RLS 멀티테넌시 환경에서 분석 스키마 격리 설계, ⑥ 성장 단계별 아키텍처 판단(§18.5 — "왜 아직 BigQuery가 아닌가"를 설명할 수 있는 것 자체가 시니어 시그널).

이력서 한 줄 예시(수치는 출시 후 실측으로 채울 것): *"습관 챌린지 앱의 이벤트 파이프라인과 KPI 마트를 설계·구현 — 멱등 ELT, 주간 코호트 분석, DQ 자동 테스트 4종, 일 N만 이벤트 처리."*
