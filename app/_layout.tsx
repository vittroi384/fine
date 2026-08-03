import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { Stack, useRouter, useSegments } from "expo-router";
import * as Sentry from "@sentry/react-native";
import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { Toast } from "@/components/Toast";
import { identify } from "@/lib/analytics";
import { attachNotificationRouting } from "@/lib/notifications";
import { supabase } from "@/lib/supabase";
import { useUiStore } from "@/stores/ui";

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
if (dsn) Sentry.init({ dsn });

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

const DISMISSED_ADS_KEY = "fine.dismissedHouseAds";

function useSessionGate() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (s?.user) identify(s.user.id);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!ready) return;
    const inAuth = segments[0] === "(auth)";
    const inInvite = segments[0] === "invite";
    if (!session && !inAuth && !inInvite) {
      router.replace("/(auth)/sign-in");
    } else if (session && inAuth) {
      router.replace("/");
    }
  }, [ready, session, segments, router]);

  return ready;
}

export default function RootLayout() {
  const ready = useSessionGate();
  const setDismissed = useUiStore((s) => s.setDismissedHouseAds);

  useEffect(() => attachNotificationRouting(), []);

  useEffect(() => {
    AsyncStorage.getItem(DISMISSED_ADS_KEY).then((v) => {
      if (v) setDismissed(JSON.parse(v) as string[]);
    });
  }, [setDismissed]);

  const dismissed = useUiStore((s) => s.dismissedHouseAds);
  useEffect(() => {
    AsyncStorage.setItem(DISMISSED_ADS_KEY, JSON.stringify(dismissed)).catch(
      () => {},
    );
  }, [dismissed]);

  if (!ready) return null; // 스플래시 유지

  return (
    <QueryClientProvider client={queryClient}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(app)" />
        <Stack.Screen name="invite/[code]" />
      </Stack>
      <Toast />
    </QueryClientProvider>
  );
}
