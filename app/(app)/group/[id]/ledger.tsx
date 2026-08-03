import * as Sharing from "expo-sharing";
import { useGlobalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { captureRef } from "react-native-view-shot";

import { useGroup } from "@/api/groups";
import {
  useConfirmSettled,
  useLedger,
  useMarkSettled,
  useUsePass,
} from "@/api/ledger";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Choice } from "@/components/Choice";
import { HouseAdCard } from "@/components/HouseAdCard";
import { LedgerRow } from "@/components/LedgerRow";
import { ShareCard } from "@/components/ShareCard";
import { ko } from "@/i18n/ko";
import { track } from "@/lib/analytics";
import { currentWeekNo, formatKrw } from "@/lib/dates";
import { codeToMessage } from "@/lib/errors";
import { supabase } from "@/lib/supabase";
import { colors, spacing } from "@/lib/theme";
import { useUiStore } from "@/stores/ui";
import type { Database } from "@/types/db";

type SeasonRow = Database["public"]["Tables"]["seasons"]["Row"];

export default function Ledger() {
  // 탭 전환으로 진입하면 local params에 상위 [id]가 없어 global을 쓴다
  const { id } = useGlobalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const showToast = useUiStore((s) => s.showToast);
  const shareRef = useRef<View>(null);
  const [uid, setUid] = useState<string | null>(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUid(data.user?.id ?? null));
  }, []);

  const { data: group, error: groupError } = useGroup(id);
  const seasons = ((group?.seasons as SeasonRow[] | undefined) ?? []).sort(
    (a, b) => b.created_at.localeCompare(a.created_at),
  );
  const season =
    seasons.find((s) => s.status === "active") ??
    seasons.find((s) => s.status === "closed") ??
    null;

  const weeks = season?.weeks ?? 4;
  // 기본 선택 주차 = 현재 주차 (사용자가 탭을 누르면 override)
  const [weekOverride, setWeekOverride] = useState<number | null>(null);
  const autoWeek = season
    ? Math.min(Math.max(currentWeekNo(season.start_date), 1), season.weeks)
    : 1;
  const week = weekOverride ?? autoWeek;
  const { data: ledger } = useLedger(season?.id ?? "", id, weeks);
  const markSettled = useMarkSettled(season?.id ?? "");
  const confirmSettled = useConfirmSettled(season?.id ?? "");
  const usePassMut = useUsePass(season?.id ?? "");

  if (!group || !season) {
    return (
      <View style={[styles.wrap, { paddingTop: insets.top }]}>
        <Text style={styles.title}>{ko.ledger.title}</Text>
        <Text style={styles.pendingNote}>
          {groupError ? codeToMessage(groupError) : ko.common.loading}
        </Text>
      </View>
    );
  }

  const isOwner = group.owner_id === uid;
  const isSettledWeek = (ledger?.settledWeeks ?? []).includes(week);
  const passesLeft = season.pass_quota - (ledger?.myPassesUsed ?? 0);
  const myTotalUnpaid = (ledger?.members ?? [])
    .filter((m) => m.userId === uid)
    .flatMap((m) => m.weekly)
    .filter((e) => e && !e.settled)
    .reduce((s, e) => s + (e?.amount ?? 0), 0);

  const onShare = async () => {
    try {
      const uri = await captureRef(shareRef, { format: "png", quality: 1 });
      track("share_card_created", { type: "weekly" });
      await Sharing.shareAsync(uri);
    } catch {
      showToast(ko.common.fallbackError, "error");
    }
  };

  const onUsePass = () => {
    usePassMut.mutate(week, {
      onError: (e) => showToast(codeToMessage(e), "error"),
    });
  };

  return (
    <View style={[styles.wrap, { paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{ko.ledger.title}</Text>
        <Choice
          options={Array.from({ length: weeks }, (_, i) => ({
            value: i + 1,
            label: `W${i + 1}`,
          }))}
          value={week}
          onChange={setWeekOverride}
        />
        {!isSettledWeek ? (
          <Text style={styles.pendingNote}>{ko.ledger.pending}</Text>
        ) : null}
        <Card>
          {(ledger?.members ?? []).map((m) => (
            <LedgerRow
              key={m.userId}
              member={m}
              weekIndex={week - 1}
              isSettledWeek={isSettledWeek}
              isMe={m.userId === uid}
              isOwner={isOwner}
              onToggleSettled={(ledgerId, next, amount) =>
                markSettled.mutate(
                  { ledgerId, val: next, amount },
                  { onError: (e) => showToast(codeToMessage(e), "error") },
                )
              }
              onConfirm={(ledgerId) =>
                confirmSettled.mutate(ledgerId, {
                  onError: (e) => showToast(codeToMessage(e), "error"),
                })
              }
            />
          ))}
        </Card>
        {myTotalUnpaid > 0 ? (
          <Text style={styles.unpaidNote}>
            {ko.ledger.total}: {formatKrw(myTotalUnpaid)}
            {ko.common.won}
          </Text>
        ) : null}
        {season.status === "active" && passesLeft > 0 ? (
          <Button
            label={ko.ledger.usePass(passesLeft)}
            variant="secondary"
            onPress={onUsePass}
            loading={usePassMut.isPending}
          />
        ) : null}
        <Button label={ko.ledger.shareCard} onPress={onShare} />
        <HouseAdCard />
      </ScrollView>

      {/* 캡처용 오프스크린 카드 (§7.9) */}
      <View style={styles.offscreen} pointerEvents="none">
        <ShareCard
          ref={shareRef}
          groupName={group.name}
          weekNo={week}
          members={ledger?.members ?? []}
          inviteCode={group.invite_code}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  content: {
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
    paddingBottom: 90,
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    color: colors.text,
    paddingTop: spacing.md,
  },
  pendingNote: { fontSize: 13, color: colors.textSub },
  unpaidNote: { fontSize: 15, fontWeight: "700", color: colors.danger },
  offscreen: { position: "absolute", left: -2000, top: 0 },
});
