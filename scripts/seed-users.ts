// 로컬 개발 시드 (§5.9): 테스트 유저 4명 + 그룹 + active 시즌 생성
// 실행: node --env-file=.env scripts/seed-users.ts  (Node 22+ 타입 스트리핑)
import { createClient } from "@supabase/supabase-js";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!serviceKey) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY가 필요합니다 (.env 참조)");
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const GROUP_ID = "11111111-1111-1111-1111-111111111111";

async function ensureUser(email: string, nickname: string): Promise<string> {
  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password: "test1234",
    email_confirm: true,
    user_metadata: { name: nickname },
  });
  if (created?.user) return created.user.id;
  if (error && !error.message.includes("already")) throw error;
  const { data: list } = await admin.auth.admin.listUsers();
  const found = list.users.find((u) => u.email === email);
  if (!found) throw new Error(`user not found: ${email}`);
  return found.id;
}

async function main() {
  const ids: string[] = [];
  for (let i = 1; i <= 4; i++) {
    ids.push(await ensureUser(`t${i}@fine.dev`, `테스터${i}`));
  }
  const [owner, ...members] = ids;

  await admin.from("groups").upsert({
    id: GROUP_ID,
    name: "아침런 크루",
    owner_id: owner,
  });
  // 방장은 트리거로 자동 등록, 나머지는 로컬 한정 직접 insert (§5.9)
  for (const uid of members) {
    await admin
      .from("group_members")
      .upsert({ group_id: GROUP_ID, user_id: uid });
  }

  const today = new Date();
  const startDate = today.toISOString().slice(0, 10);
  const { data: existing } = await admin
    .from("seasons")
    .select("id")
    .eq("group_id", GROUP_ID)
    .eq("status", "active")
    .maybeSingle();
  if (!existing) {
    const { error } = await admin.from("seasons").insert({
      group_id: GROUP_ID,
      title: "주3회 러닝",
      target_count: 3,
      penalty_amount: 5000,
      start_date: startDate,
      status: "active",
    });
    if (error) throw error;
  }

  console.log("시드 완료:");
  console.log("  유저: t1@fine.dev ~ t4@fine.dev / 비번 test1234");
  console.log(`  그룹: 아침런 크루 (${GROUP_ID})`);
  console.log("  시즌: 주3회 러닝 (active, 오늘 시작)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
