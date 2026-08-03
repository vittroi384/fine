import { useRouter } from "expo-router";
import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/Button";
import { ko } from "@/i18n/ko";
import { track } from "@/lib/analytics";
import { PAYMENTS_ENABLED } from "@/lib/constants";
import { colors, spacing } from "@/lib/theme";

// §7.10 / §11: PAYMENTS_ENABLED=true일 때만 의미가 있는 화면.
// TODO(spec): T12에서 react-native-purchases(RevenueCat) Offerings·구매·redeem_season_pass 연동.
export default function Paywall() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!PAYMENTS_ENABLED) {
      router.back();
      return;
    }
    track("paywall_viewed");
  }, [router]);

  if (!PAYMENTS_ENABLED) return null;

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + spacing.xl }]}>
      <Text style={styles.title}>{ko.paywall.title}</Text>
      <Text style={styles.body}>{ko.paywall.body}</Text>
      <Button
        label={ko.paywall.purchase}
        onPress={() => {
          // TODO(spec): Purchases.purchasePackage → rc-webhook → redeem_season_pass (T12)
        }}
      />
      <Button
        label={ko.common.close}
        variant="ghost"
        onPress={() => router.back()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  title: { fontSize: 26, fontWeight: "800", color: colors.text },
  body: { fontSize: 15, color: colors.textSub },
});
