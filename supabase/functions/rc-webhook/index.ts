import { createClient } from "npm:@supabase/supabase-js@2";
import { serviceClientEnv } from "../_shared/push.ts";

// §11: RevenueCat 웹훅 → subscriptions 크레딧 적재 (rc_event_id unique로 멱등)
Deno.serve(async (req) => {
  if (req.headers.get("Authorization") !== Deno.env.get("RC_WEBHOOK_AUTH"))
    return new Response("forbidden", { status: 403 });
  const { event } = await req.json();
  const ok = ["INITIAL_PURCHASE", "NON_RENEWING_PURCHASE"].includes(event?.type)
          && event?.product_id === "fine_season_pass_4w";
  if (!ok) return Response.json({ ignored: true });
  const { url, key } = serviceClientEnv();
  const db = createClient(url, key);
  await db.from("subscriptions").insert({
    user_id: event.app_user_id, product_id: event.product_id,
    status: "paid", rc_event_id: event.id,           // unique → 멱등
  }).select().maybeSingle();                          // 중복이면 무시(23505 캐치)
  return Response.json({ ok: true });
});
