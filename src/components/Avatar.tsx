import { Image } from "expo-image";
import { StyleSheet, Text, View } from "react-native";

import { colors } from "@/lib/theme";

interface Props {
  nickname: string;
  avatarUrl?: string | null;
  size?: number;
}

export function Avatar({ nickname, avatarUrl, size = 36 }: Props) {
  const dim = { width: size, height: size, borderRadius: size / 2 };
  if (avatarUrl) {
    return <Image source={{ uri: avatarUrl }} style={dim} />;
  }
  return (
    <View style={[styles.fallback, dim]}>
      <Text style={[styles.initial, { fontSize: size * 0.45 }]}>
        {nickname.slice(0, 1)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  initial: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
});
