import { StyleSheet, Text, View } from "react-native";

import { colors, spacing } from "@/lib/theme";

interface Props {
  title: string;
  body?: string;
}

export function EmptyState({ title, body }: Props) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{title}</Text>
      {body ? <Text style={styles.body}>{body}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    paddingVertical: spacing.xl * 2,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  title: {
    fontSize: 17,
    fontWeight: "600",
    color: colors.text,
    textAlign: "center",
  },
  body: {
    fontSize: 14,
    color: colors.textSub,
    textAlign: "center",
  },
});
