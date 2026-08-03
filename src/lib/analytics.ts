import PostHog from "posthog-react-native";

import { supabase } from "@/lib/supabase";

// §12: PostHog + 자체 파이프라인(§18) 이중 기록. 어떤 실패도 UX에 전파 금지.
const key = process.env.EXPO_PUBLIC_POSTHOG_KEY;

export const posthog: PostHog | null = key
  ? new PostHog(key, { host: "https://us.i.posthog.com" })
  : null;

export function identify(userId: string): void {
  try {
    posthog?.identify(userId);
  } catch {
    // no-op
  }
}

export function track(
  name: string,
  props: Record<string, string | number | boolean | null> = {},
): void {
  try {
    posthog?.capture(name, props);
  } catch {
    // no-op
  }
  supabase
    .rpc("track_event", { name, props })
    .then(
      () => undefined,
      () => undefined, // fire-and-forget (§18.3)
    );
}

export function resetAnalytics(): void {
  try {
    posthog?.reset();
  } catch {
    // no-op
  }
}
