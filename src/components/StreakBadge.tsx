import { StyleSheet, Text, View } from "react-native";

import { ko } from "@/i18n/ko";
import { colors, radius } from "@/lib/theme";

export function StreakBadge({ days }: { days: number }) {
  if (days <= 0) return null;
  return (
    <View style={styles.badge}>
      <Text style={styles.text}>🔥 {ko.group.streak(days)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    backgroundColor: "#FFF3E6",
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  text: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.warning,
  },
});
