import { Image } from "expo-image";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { FeedItem } from "@/api/checkins";
import { Avatar } from "@/components/Avatar";
import { ko } from "@/i18n/ko";
import { formatTimeAgo } from "@/lib/dates";
import { colors, radius, spacing } from "@/lib/theme";

interface Props {
  item: FeedItem;
  onLongPress?: () => void;
}

const STATUS_LABEL = {
  valid: ko.group.statusValid,
  disputed: ko.group.statusDisputed,
  rejected: ko.group.statusRejected,
} as const;

export function PhotoFeedItem({ item, onLongPress }: Props) {
  const statusStyle =
    item.status === "valid"
      ? styles.valid
      : item.status === "disputed"
        ? styles.disputed
        : styles.rejected;

  return (
    <Pressable onLongPress={onLongPress} style={styles.card}>
      <View style={styles.header}>
        <Avatar
          nickname={item.profiles?.nickname ?? "?"}
          avatarUrl={item.profiles?.avatar_url}
        />
        <View style={styles.headerText}>
          <Text style={styles.nickname}>{item.profiles?.nickname}</Text>
          <Text style={styles.time}>{formatTimeAgo(item.taken_at)}</Text>
        </View>
        <Text style={[styles.status, statusStyle]}>
          {STATUS_LABEL[item.status]}
        </Text>
      </View>
      {item.signedUrl ? (
        <Image
          source={{ uri: item.signedUrl }}
          style={styles.photo}
          contentFit="cover"
          transition={150}
        />
      ) : (
        <View style={[styles.photo, styles.photoFallback]} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    gap: spacing.sm,
  },
  headerText: { flex: 1 },
  nickname: { fontSize: 15, fontWeight: "600", color: colors.text },
  time: { fontSize: 12, color: colors.textSub },
  status: {
    fontSize: 12,
    fontWeight: "700",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.full,
    overflow: "hidden",
  },
  valid: { backgroundColor: "#E6F9F1", color: colors.success },
  disputed: { backgroundColor: "#FFF3E6", color: colors.warning },
  rejected: { backgroundColor: "#FEECEC", color: colors.danger },
  photo: { width: "100%", aspectRatio: 1 },
  photoFallback: { backgroundColor: colors.border },
});
