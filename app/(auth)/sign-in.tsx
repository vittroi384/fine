import * as AppleAuthentication from "expo-apple-authentication";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/Button";
import { ko } from "@/i18n/ko";
import { track } from "@/lib/analytics";
import { codeToMessage } from "@/lib/errors";
import { supabase } from "@/lib/supabase";
import { colors, spacing } from "@/lib/theme";
import { useUiStore } from "@/stores/ui";

export default function SignIn() {
  const router = useRouter();
  const showToast = useUiStore((s) => s.showToast);
  const pendingCode = useUiStore((s) => s.pendingInviteCode);
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const insets = useSafeAreaInsets();

  const afterSignIn = (method: string) => {
    track("sign_in", { method });
    if (pendingCode) {
      router.replace(`/invite/${pendingCode}`);
    } else {
      router.replace("/");
    }
  };

  const signInApple = async () => {
    try {
      const cred = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!cred.identityToken) return;
      const { error } = await supabase.auth.signInWithIdToken({
        provider: "apple",
        token: cred.identityToken,
      });
      if (error) throw error;
      afterSignIn("apple");
    } catch (e) {
      if ((e as { code?: string }).code === "ERR_REQUEST_CANCELED") return;
      showToast(codeToMessage(e), "error");
    }
  };

  const sendOtp = async () => {
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({ email });
    setBusy(false);
    if (error) {
      showToast(codeToMessage(error), "error");
      return;
    }
    setOtpSent(true);
    showToast(ko.auth.otpSent, "success");
  };

  const verifyOtp = async () => {
    setBusy(true);
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: otp,
      type: "email",
    });
    setBusy(false);
    if (error) {
      showToast(codeToMessage(error), "error");
      return;
    }
    afterSignIn("email");
  };

  return (
    <KeyboardAvoidingView
      style={[styles.wrap, { paddingTop: insets.top + spacing.xl }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Text style={styles.logo}>{ko.common.appName}</Text>
      <Text style={styles.title}>{ko.auth.title}</Text>

      <View style={styles.buttons}>
        {Platform.OS === "ios" ? (
          <Button label={ko.auth.signInApple} onPress={signInApple} />
        ) : null}
        {/* TODO(spec): 카카오 로그인은 dev build에서 활성화 (§2, KAKAO_NATIVE_APP_KEY 필요) */}

        <Text style={styles.label}>{ko.auth.emailLabel}</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholder={ko.auth.emailPlaceholder}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        {otpSent ? (
          <>
            <TextInput
              style={styles.input}
              value={otp}
              onChangeText={setOtp}
              placeholder={ko.auth.otpPlaceholder}
              keyboardType="number-pad"
            />
            <Button
              label={ko.auth.verifyOtp}
              onPress={verifyOtp}
              loading={busy}
              disabled={otp.length < 6}
            />
          </>
        ) : (
          <Button
            label={ko.auth.sendOtp}
            onPress={sendOtp}
            loading={busy}
            disabled={!email.includes("@")}
            variant="secondary"
          />
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.lg,
  },
  logo: {
    fontSize: 40,
    fontWeight: "900",
    color: colors.primary,
    marginBottom: spacing.md,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: colors.text,
    lineHeight: 34,
    marginBottom: spacing.xl,
  },
  buttons: { gap: spacing.sm },
  label: {
    marginTop: spacing.lg,
    fontSize: 13,
    color: colors.textSub,
  },
  input: {
    height: 52,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.md,
    fontSize: 16,
  },
});
