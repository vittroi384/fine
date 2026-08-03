import { useRouter } from "expo-router";
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useMyGroups, type GroupSummary } from "@/api/groups";
import { Card } from "@/components/Card";
import { EmptyState } from "@/components/EmptyState";
import { HouseAdCard } from "@/components/HouseAdCard";
import { ko } from "@/i18n/ko";
import { daysUntil, formatKrw } from "@/lib/dates";
import { colors, radius, spacing } from "@/lib/theme";

function GroupCard({ item }: { item: GroupSummary }) {
  const router = useRouter();
  const { group, season, checkedInToday, unpaidAmount, memberCount } = item;

  return (
    <Pressable onPress={() => router.push(`/group/${group.id}`)}>
      <Card style={styles.groupCard}>
        <View style={styles.rowBetween}>
          <Text style={styles.groupName}>{group.name}</Text>
          {season?.status === "active" ? (
            <Text style={styles.dday}>
              {ko.home.dday(daysUntil(season.end_date))}
            </Text>
          ) : season?.status === "draft" ? (
            <Text style={styles.draft}>{ko.home.draftBadge}</Text>
          ) : null}
        </View>
        {season ? <Text style={styles.seasonTitle}>{season.title}</Text> : null}
        <View style={styles.badges}>
          <Text style={styles.memberCount}>
            {ko.group.memberCount(memberCount)}
          </Text>
          {season?.status === "active" ? (
            <Text
              style={[
                styles.todayBadge,
                checkedInToday ? styles.todayDone : styles.todayPending,
              ]}
            >
              {checkedInToday ? ko.home.todayDone : ko.home.todayPending}
            </Text>
          ) : null}
          {unpaidAmount > 0 ? (
            <Text style={styles.unpaid}>
              {ko.home.unpaidBadge(formatKrw(unpaidAmount))}
            </Text>
          ) : null}
        </View>
      </Card>
    </Pressable>
  );
}

export default function Home() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data, isRefetching, refetch } = useMyGroups();

  return (
    <View style={[styles.wrap, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>{ko.home.title}</Text>
        <Pressable onPress={() => router.push("/settings")} hitSlop={8}>
          <Text style={styles.settings}>⚙️</Text>
        </Pressable>
      </View>
      <FlatList
        data={data ?? []}
        keyExtractor={(g) => g.group.id}
        renderItem={({ item }) => <GroupCard item={item} />}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
        }
        ListEmptyComponent={
          <EmptyState title={ko.home.emptyTitle} body={ko.home.emptyBody} />
        }
        ListFooterComponent={<HouseAdCard />}
      />
      <Pressable
        style={[styles.fab, { bottom: insets.bottom + spacing.lg }]}
        onPress={() => router.push("/group/create")}
      >
        <Text style={styles.fabText}>+ {ko.home.createGroup}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  title: { fontSize: 28, fontWeight: "800", color: colors.text },
  settings: { fontSize: 22 },
  list: { paddingHorizontal: spacing.lg, gap: spacing.sm, paddingBottom: 120 },
  groupCard: { gap: 6 },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  groupName: { fontSize: 18, fontWeight: "700", color: colors.text },
  dday: { fontSize: 14, fontWeight: "700", color: colors.primary },
  draft: { fontSize: 13, color: colors.textSub },
  seasonTitle: { fontSize: 14, color: colors.textSub },
  badges: {
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "center",
    flexWrap: "wrap",
  },
  memberCount: { fontSize: 13, color: colors.textSub },
  todayBadge: {
    fontSize: 12,
    fontWeight: "600",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.full,
    overflow: "hidden",
  },
  todayDone: { backgroundColor: "#E6F9F1", color: colors.success },
  todayPending: { backgroundColor: "#FFF3E6", color: colors.warning },
  unpaid: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.danger,
    backgroundColor: "#FEECEC",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.full,
    overflow: "hidden",
  },
  fab: {
    position: "absolute",
    right: spacing.lg,
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingHorizontal: 20,
    height: 52,
    justifyContent: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  fabText: { color: "#FFF", fontSize: 16, fontWeight: "700" },
});
