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
