import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, radius, spacing } from "@/lib/theme";
import { useUiStore } from "@/stores/ui";

export function Toast() {
  const toast = useUiStore((s) => s.toast);
  const hide = useUiStore((s) => s.hideToast);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(hide, 2500);
    return () => clearTimeout(t);
  }, [toast, hide]);

  if (!toast) return null;
  const bg =
    toast.kind === "error"
      ? colors.danger
      : toast.kind === "success"
        ? colors.success
        : colors.text;

  return (
    <View
      pointerEvents="none"
      style={[styles.wrap, { top: insets.top + spacing.sm }]}
    >
      <View style={[styles.toast, { backgroundColor: bg }]}>
        <Text style={styles.text}>{toast.message}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 100,
  },
  toast: {
    maxWidth: "88%",
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  text: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "500",
  },
});
