// AC-2(하루 1회)·AC-3(RLS 격리) 검증 — 로컬 전용
// 실행: node --env-file=.env scripts/verify-rls.ts
import { createClient } from "@supabase/supabase-js";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function client() {
  return createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}: ${name}${detail ? ` (${detail})` : ""}`);
  if (!ok) failures += 1;
}

async function main() {
  // 외부인 계정 준비
  const { data: created } = await admin.auth.admin.createUser({
    email: "outsider@fine.dev",
    password: "test1234",
    email_confirm: true,
  });
  const outsiderId =
    created?.user?.id ??
    (await admin.auth.admin.listUsers()).data.users.find(
      (u) => u.email === "outsider@fine.dev",
    )?.id;
  if (!outsiderId) throw new Error("outsider 생성 실패");

  // 멤버(t1) 로그인
  const member = client();
  const m = await member.auth.signInWithPassword({
    email: "t1@fine.dev",
    password: "test1234",
  });
  if (m.error) throw m.error;

  // 외부인 로그인
  const outsider = client();
  const o = await outsider.auth.signInWithPassword({
    email: "outsider@fine.dev",
    password: "test1234",
  });
  if (o.error) throw o.error;

  // AC-3: 외부인은 그룹·시즌·인증·장부 0행
  for (const table of ["groups", "seasons", "checkins", "penalty_ledger"] as const) {
    const { data, error } = await outsider.from(table).select("*");
    check(`AC-3 외부인 ${table} 0행`, !error && (data ?? []).length === 0,
      error?.message ?? `rows=${data?.length}`);
  }

  // 멤버는 자기 그룹이 보인다
  const { data: myGroups } = await member.from("groups").select("*");
  check("멤버 groups 조회", (myGroups ?? []).length === 1);

  const { data: season } = await member
    .from("seasons")
    .select("id")
    .eq("status", "active")
    .single();
  if (!season) throw new Error("active 시즌 없음 (seed 먼저 실행)");

  // AC-2: 같은 날 2회 인증 → 23505
  const uid = m.data.user!.id;
  const ins = () =>
    member.from("checkins").insert({
      season_id: season.id,
      photo_path: `${season.id}/${uid}/test.jpg`,
      user_id: uid,
      checkin_date: "1970-01-01",
      week_no: 0,
    });
  const first = await ins();
  check("AC-2 첫 인증 성공", !first.error, first.error?.message);
  const second = await ins();
  check(
    "AC-2 중복 인증 거부(23505)",
    second.error?.code === "23505",
    second.error?.code ?? "no error",
  );

  // 외부인이 남의 시즌에 인증 시도 → 거부
  const intrude = await outsider.from("checkins").insert({
    season_id: season.id,
    photo_path: `${season.id}/${outsiderId}/x.jpg`,
    user_id: outsiderId,
    checkin_date: "1970-01-01",
    week_no: 0,
  });
  check("AC-3 외부인 인증 삽입 거부", !!intrude.error, intrude.error?.code);

  // 정리: 테스트 인증 삭제
  await admin.from("checkins").delete().eq("season_id", season.id).eq("user_id", uid);

  console.log(failures === 0 ? "\nALL RLS/AC TESTS PASSED" : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
