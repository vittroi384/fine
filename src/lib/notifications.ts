import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { router } from "expo-router";
import { Platform } from "react-native";

import { supabase } from "@/lib/supabase";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true, // 포그라운드 수신 표시 (§9)
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

/** settings 토글 on 시 호출 — 토큰을 profiles.push_token에 저장 (§9) */
export async function registerPushToken(): Promise<string | null> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  let status = existing;
  if (existing !== "granted") {
    const req = await Notifications.requestPermissionsAsync();
    status = req.status;
  }
  if (status !== "granted") return null;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const projectId: string | undefined =
    Constants.expoConfig?.extra?.eas?.projectId ??
    (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId;
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;

  const { data: user } = await supabase.auth.getUser();
  if (user.user) {
    await supabase
      .from("profiles")
      .update({ push_token: token })
      .eq("id", user.user.id);
  }
  return token;
}

/** settings 토글 off 시 호출 */
export async function unregisterPushToken(): Promise<void> {
  const { data: user } = await supabase.auth.getUser();
  if (user.user) {
    await supabase
      .from("profiles")
      .update({ push_token: null })
      .eq("id", user.user.id);
  }
}

/** 백그라운드 푸시 탭 시 data.url로 라우팅 (§9) */
export function attachNotificationRouting(): () => void {
  const sub = Notifications.addNotificationResponseReceivedListener((resp) => {
    const url = resp.notification.request.content.data?.url;
    if (typeof url === "string") {
      const path = url.replace(/^fine:\/\/\/?/, "/");
      router.push(path as never);
    }
  });
  return () => sub.remove();
}
