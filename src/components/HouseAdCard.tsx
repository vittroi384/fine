import { Pressable, StyleSheet, Text, View } from "react-native";
import * as Linking from "expo-linking";

import { useHouseAds } from "@/api/config";
import { ko } from "@/i18n/ko";
import { colors, radius, spacing } from "@/lib/theme";
import { useUiStore } from "@/stores/ui";

// §11.5: 자체 홍보 카드. 배치 허용 구역(홈 리스트 하단, 장부 하단)에서만 사용.
export function HouseAdCard() {
  const { data: ads } = useHouseAds();
  const dismissed = useUiStore((s) => s.dismissedHouseAds);
  const dismiss = useUiStore((s) => s.dismissHouseAd);

  const ad = (ads ?? []).find((a) => !dismissed.includes(a.id));
  if (!ad) return null;
  const adUrl = ad.url;

  return (
    <View style={styles.card}>
      <View style={styles.body}>
        <Text style={styles.title}>{ad.title}</Text>
        <Text style={styles.text}>{ad.body}</Text>
        {ad.cta && adUrl ? (
          <Pressable onPress={() => Linking.openURL(adUrl)}>
            <Text style={styles.cta}>{ad.cta}</Text>
          </Pressable>
        ) : null}
      </View>
      <Pressable
        onPress={() => dismiss(ad.id)}
        hitSlop={8}
        accessibilityLabel={ko.common.close}
      >
        <Text style={styles.close}>✕</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    backgroundColor: "#F0F7FF",
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  body: { flex: 1, gap: 4 },
  title: { fontSize: 14, fontWeight: "700", color: colors.text },
  text: { fontSize: 13, color: colors.textSub },
  cta: { fontSize: 13, fontWeight: "600", color: colors.primary, marginTop: 4 },
  close: { fontSize: 14, color: colors.textSub, padding: 2 },
});
