import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { useJoinGroup } from "@/api/groups";
import { Button } from "@/components/Button";
import { ko } from "@/i18n/ko";
import { supabase } from "@/lib/supabase";
import { colors, spacing } from "@/lib/theme";
import { useUiStore } from "@/stores/ui";

type FailKind = "invalid" | "full" | null;

// §7.4: 딥링크 랜딩. 비로그인 → 코드 보관 후 로그인, 로그인 → join_group
export default function InviteLanding() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const router = useRouter();
  const setPending = useUiStore((s) => s.setPendingInviteCode);
  const join = useJoinGroup();
  const [fail, setFail] = useState<FailKind>(null);
  const attempted = useRef(false);

  useEffect(() => {
    if (!code || attempted.current) return;
    attempted.current = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        setPending(code);
        router.replace("/(auth)/sign-in");
        return;
      }
      setPending(null);
      join.mutate(code, {
        onSuccess: (groupId) => router.replace(`/group/${groupId}`),
        onError: (e) => {
          const msg = e instanceof Error ? e.message : "";
          setFail(msg.includes("GROUP_FULL") ? "full" : "invalid");
        },
      });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  if (fail) {
    const isFull = fail === "full";
    return (
      <View style={styles.center}>
        <Text style={styles.failTitle}>
          {isFull ? ko.invite.fullTitle : ko.invite.invalidTitle}
        </Text>
        <Text style={styles.failBody}>
          {isFull ? ko.invite.fullBody : ko.invite.invalidBody}
        </Text>
        <Button
          label={ko.invite.goHome}
          onPress={() => router.replace("/")}
          style={styles.homeBtn}
        />
      </View>
    );
  }

  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={styles.joining}>{ko.invite.joining}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  joining: { fontSize: 15, color: colors.textSub },
  failTitle: { fontSize: 20, fontWeight: "700", color: colors.text },
  failBody: { fontSize: 14, color: colors.textSub, textAlign: "center" },
  homeBtn: { alignSelf: "stretch", marginTop: spacing.md },
});
