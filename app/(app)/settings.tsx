import { useRouter } from "expo-router";
import { useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useMyProfile, useUpdateNickname } from "@/api/profile";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { ko } from "@/i18n/ko";
import { resetAnalytics } from "@/lib/analytics";
import {
  registerPushToken,
  unregisterPushToken,
} from "@/lib/notifications";
import { codeToMessage } from "@/lib/errors";
import { supabase } from "@/lib/supabase";
import { colors, spacing } from "@/lib/theme";
import { useUiStore } from "@/stores/ui";

export default function Settings() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const showToast = useUiStore((s) => s.showToast);
  const { data: profile } = useMyProfile();
  const updateNickname = useUpdateNickname();
  const [nickname, setNickname] = useState<string | null>(null);
  const [pushBusy, setPushBusy] = useState(false);

  const pushOn = !!profile?.push_token;

  const onTogglePush = async (next: boolean) => {
    setPushBusy(true);
    try {
      if (next) {
        const token = await registerPushToken();
        if (!token) showToast(ko.camera.permissionBody, "error");
      } else {
        await unregisterPushToken();
      }
    } catch (e) {
      showToast(codeToMessage(e), "error");
    } finally {
      setPushBusy(false);
    }
  };

  const onSaveNickname = () => {
    if (nickname === null || !nickname.trim()) return;
    updateNickname.mutate(nickname.trim(), {
      onSuccess: () => showToast(ko.common.confirm, "success"),
      onError: (e) => showToast(codeToMessage(e), "error"),
    });
  };

  const onSignOut = async () => {
    await supabase.auth.signOut();
    resetAnalytics();
    router.replace("/(auth)/sign-in");
  };

  return (
    <ScrollView
      style={styles.wrap}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + spacing.md },
      ]}
    >
      <Text style={styles.title}>{ko.settings.title}</Text>

      <Card style={styles.section}>
        <Text style={styles.label}>{ko.settings.nickname}</Text>
        <View style={styles.nicknameRow}>
          <TextInput
            style={styles.input}
            value={nickname ?? profile?.nickname ?? ""}
            onChangeText={setNickname}
            maxLength={20}
          />
          <Button
            label={ko.common.confirm}
            onPress={onSaveNickname}
            loading={updateNickname.isPending}
            style={styles.saveBtn}
          />
        </View>
      </Card>

      <Card style={styles.rowCard}>
        <Text style={styles.rowLabel}>{ko.settings.push}</Text>
        <Switch value={pushOn} onValueChange={onTogglePush} disabled={pushBusy} />
      </Card>

      <Card style={styles.section}>
        {/* TODO(spec): 약관·개인정보처리방침 URL 확정 후 링크 연결 (§15) */}
        <Text style={styles.linkText}>{ko.settings.terms}</Text>
        <Text style={styles.linkText}>{ko.settings.privacy}</Text>
        <Text style={styles.linkSub}>{ko.settings.deleteAccountHint}</Text>
      </Card>

      <Button label={ko.auth.signOut} variant="secondary" onPress={onSignOut} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: spacing.lg, gap: spacing.md, paddingBottom: 60 },
  title: { fontSize: 24, fontWeight: "800", color: colors.text },
  section: { gap: spacing.sm },
  label: { fontSize: 13, color: colors.textSub },
  nicknameRow: { flexDirection: "row", gap: spacing.sm },
  input: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    fontSize: 15,
  },
  saveBtn: { height: 48, paddingHorizontal: spacing.md },
  rowCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  rowLabel: { fontSize: 15, fontWeight: "600", color: colors.text },
  linkText: { fontSize: 15, color: colors.text, paddingVertical: 4 },
  linkSub: { fontSize: 13, color: colors.textSub },
});
