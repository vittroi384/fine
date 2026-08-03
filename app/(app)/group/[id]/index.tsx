import { useGlobalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { FlatList, Share, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  useFeedRealtime,
  useMyStreak,
  useSeasonFeed,
  useTodayCheckin,
  type FeedItem,
} from "@/api/checkins";
import { useAppConfig } from "@/api/config";
import { useGroup } from "@/api/groups";
import { useStartSeason } from "@/api/seasons";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { EmptyState } from "@/components/EmptyState";
import { PhotoFeedItem } from "@/components/PhotoFeedItem";
import { StreakBadge } from "@/components/StreakBadge";
import { ko } from "@/i18n/ko";
import { track } from "@/lib/analytics";
import { DISPUTE_WINDOW_HOURS, INVITE_URL } from "@/lib/constants";
import { currentWeekNo, daysUntil } from "@/lib/dates";
import { codeToMessage } from "@/lib/errors";
import { supabase } from "@/lib/supabase";
import { colors, spacing } from "@/lib/theme";
import { useUiStore } from "@/stores/ui";
import type { Database } from "@/types/db";

type SeasonRow = Database["public"]["Tables"]["seasons"]["Row"];
type MemberJoin = {
  user_id: string;
  role: string;
  profiles: { id: string; nickname: string; avatar_url: string | null } | null;
};

function DraftView({
  groupId,
  season,
  members,
  isOwner,
  inviteCode,
  groupName,
}: {
  groupId: string;
  season: SeasonRow;
  members: MemberJoin[];
  isOwner: boolean;
  inviteCode: string;
  groupName: string;
}) {
  const { data: config } = useAppConfig();
  const startSeason = useStartSeason();
  const showToast = useUiStore((s) => s.showToast);
  const router = useRouter();
  const min = config?.minSeasonMembers ?? 3;

  const shareInvite = async () => {
    track("invite_link_shared");
    await Share.share({
      message: `${ko.common.appName} — "${groupName}" 그룹에 초대해요!\n${INVITE_URL(inviteCode)}\n${ko.create.inviteCode}: ${inviteCode}`,
    });
  };

  return (
    <View style={styles.draftWrap}>
      <Text style={styles.draftTitle}>{ko.group.draftTitle}</Text>
      <Text style={styles.hint}>{ko.create.memberHint(min)}</Text>
      <Card style={styles.memberList}>
        {members.map((m) => (
          <View key={m.user_id} style={styles.memberRow}>
            <Avatar
              nickname={m.profiles?.nickname ?? "?"}
              avatarUrl={m.profiles?.avatar_url}
              size={32}
            />
            <Text style={styles.memberName}>{m.profiles?.nickname}</Text>
            {m.role === "owner" ? <Text style={styles.ownerTag}>👑</Text> : null}
          </View>
        ))}
      </Card>
      <Button label={ko.create.shareInvite} onPress={shareInvite} />
      {isOwner ? (
        <Button
          label={ko.create.startSeason}
          variant="secondary"
          disabled={members.length < min}
          loading={startSeason.isPending}
          onPress={() =>
            startSeason.mutate(season.id, {
              onError: (e) => {
                const msg = e instanceof Error ? e.message : "";
                if (msg.includes("PAYWALL_REQUIRED")) {
                  router.push("/paywall");
                  return;
                }
                showToast(codeToMessage(e), "error");
              },
            })
          }
        />
      ) : null}
    </View>
  );
}

export default function GroupHome() {
  // 탭 전환·딥링크 진입 시 local params가 빌 수 있어 global을 쓴다
  const { id } = useGlobalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: group } = useGroup(id);

  const seasons = ((group?.seasons as SeasonRow[] | undefined) ?? []).sort(
    (a, b) => b.created_at.localeCompare(a.created_at),
  );
  const season =
    seasons.find((s) => s.status === "active") ??
    seasons.find((s) => s.status === "draft") ??
    null;
  const seasonId = season?.status === "active" ? season.id : "";

  const feed = useSeasonFeed(seasonId);
  useFeedRealtime(seasonId);
  const { data: todayCheckin } = useTodayCheckin(seasonId);
  const { data: streak } = useMyStreak(seasonId);
  const myUserId = useMyUserId();

  if (!group) return <View style={styles.wrap} />;

  const members = (group.group_members as MemberJoin[]) ?? [];
  const isOwner = members.some(
    (m) => m.user_id === myUserId && m.role === "owner",
  );
  const items = feed.data?.pages.flat() ?? [];

  const onLongPress = (item: FeedItem) => {
    if (!isDisputable(item, myUserId)) return;
    router.push(`/group/${id}/dispute/${item.id}`);
  };

  return (
    <View style={[styles.wrap, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.groupName}>{group.name}</Text>
        {season?.status === "active" ? (
          <View style={styles.headerMeta}>
            <Text style={styles.seasonInfo}>
              {season.title} · {ko.group.week(Math.min(Math.max(currentWeekNo(season.start_date), 1), season.weeks))} ·{" "}
              {ko.home.dday(daysUntil(season.end_date))}
            </Text>
            <StreakBadge days={streak ?? 0} />
          </View>
        ) : null}
      </View>

      {season?.status === "draft" ? (
        <DraftView
          groupId={id}
          season={season}
          members={members}
          isOwner={isOwner}
          inviteCode={group.invite_code}
          groupName={group.name}
        />
      ) : (
        <>
          <FlatList
            data={items}
            keyExtractor={(c) => c.id}
            renderItem={({ item }) => (
              <PhotoFeedItem item={item} onLongPress={() => onLongPress(item)} />
            )}
            contentContainerStyle={styles.list}
            onEndReached={() => {
              if (feed.hasNextPage && !feed.isFetchingNextPage)
                feed.fetchNextPage();
            }}
            refreshing={feed.isRefetching}
            onRefresh={() => feed.refetch()}
            ListEmptyComponent={<EmptyState title={ko.group.emptyFeed} />}
          />
          {season?.status === "active" ? (
            <View style={[styles.ctaWrap, { paddingBottom: spacing.sm }]}>
              <Button
                label={todayCheckin ? ko.group.checkinDone : ko.group.checkinCta}
                disabled={!!todayCheckin}
                onPress={() => router.push(`/group/${id}/checkin`)}
              />
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}

/** 이의제기 진입 가능 여부 (§7.5): 본인 글 제외, rejected 제외, valid는 24h 이내만 */
function isDisputable(item: FeedItem, myUserId: string | null): boolean {
  if (item.user_id === myUserId) return false;
  if (item.status === "rejected") return false;
  const ageH = (Date.now() - new Date(item.taken_at).getTime()) / 3600000;
  if (item.status === "valid" && ageH > DISPUTE_WINDOW_HOURS) return false;
  return true;
}

function useMyUserId(): string | null {
  const [uid, setUid] = useState<string | null>(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUid(data.user?.id ?? null));
  }, []);
  return uid;
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  header: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: 6,
  },
  groupName: { fontSize: 24, fontWeight: "800", color: colors.text },
  headerMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flexWrap: "wrap",
  },
  seasonInfo: { fontSize: 14, color: colors.textSub },
  list: { paddingHorizontal: spacing.lg, gap: spacing.md, paddingBottom: 90 },
  ctaWrap: { paddingHorizontal: spacing.lg },
  draftWrap: { paddingHorizontal: spacing.lg, gap: spacing.md },
  draftTitle: { fontSize: 18, fontWeight: "700", color: colors.text },
  hint: { fontSize: 14, color: colors.textSub },
  memberList: { gap: spacing.sm },
  memberRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  memberName: { fontSize: 15, color: colors.text, flex: 1 },
  ownerTag: { fontSize: 14 },
});
