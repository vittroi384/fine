import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { formatCountdown } from "@/lib/dates";
import { colors, radius } from "@/lib/theme";

export function CountdownPill({ deadline }: { deadline: string }) {
  const [, forceTick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => forceTick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  return (
    <View style={styles.pill}>
      <Text style={styles.text}>⏳ {formatCountdown(deadline)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    backgroundColor: "#EEF2FF",
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: "flex-start",
  },
  text: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.primaryDark,
  },
});
