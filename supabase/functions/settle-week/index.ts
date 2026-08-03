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
    const userIds = [...new Set((rows ?? []).map((r) => r.user_id))];
    const { data: profs } = await db
      .from("profiles").select("id, push_token").in("id", userIds);
    const tokenOf = new Map((profs ?? []).map((p) => [p.id, p.push_token]));
    await sendPush((rows ?? [])
      .filter((r) => tokenOf.get(r.user_id))
      .map((r) => ({
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
