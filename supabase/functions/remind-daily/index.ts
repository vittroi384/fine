import { createClient } from "npm:@supabase/supabase-js@2";
import { assertServiceAuth, sendPush, serviceClientEnv } from "../_shared/push.ts";

type RemindTarget = {
  user_id: string;
  push_token: string;
  group_name: string;
  penalty: number;
};

Deno.serve(async (req) => {
  try { assertServiceAuth(req); } catch (r) { return r as Response; }
  const { url, key } = serviceClientEnv();
  const db = createClient(url, key);

  const { data: targets, error } = await db.rpc("get_remind_targets");
  if (error) return new Response(error.message, { status: 500 });

  await sendPush(((targets ?? []) as RemindTarget[]).map((t) => ({
    to: t.push_token,
    title: "오늘 인증 아직이에요 ⏰",
    body: `${t.group_name} — 오늘 놓치면 ${Number(t.penalty).toLocaleString()}원이 쌓입니다 🔥`,
    data: { url: "fine:///" },
  })));
  return Response.json({ sent: targets?.length ?? 0 });
});
