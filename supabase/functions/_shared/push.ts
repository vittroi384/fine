type PushMsg = { to: string; title: string; body: string; data?: Record<string, unknown> };

export async function sendPush(messages: PushMsg[]) {
  const valid = messages.filter((m) => m.to?.startsWith("ExponentPushToken"));
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
