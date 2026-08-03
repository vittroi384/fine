import { forwardRef } from "react";
import { StyleSheet, Text, View } from "react-native";

import type { LedgerMember } from "@/api/ledger";
import { ko } from "@/i18n/ko";
import { formatKrw } from "@/lib/dates";
import { colors } from "@/lib/theme";

interface Props {
  groupName: string;
  weekNo: number;
  members: LedgerMember[];
  inviteCode: string;
}

// §7.9: 1080×1350 정산표 카드. 캡처(view-shot) 대상이므로 화면 밖에 렌더한다.
export const ShareCard = forwardRef<View, Props>(function ShareCard(
  { groupName, weekNo, members, inviteCode },
  ref,
) {
  const wIdx = weekNo - 1;
  const rows = [...members].sort(
    (a, b) => (b.weekly[wIdx]?.amount ?? 0) - (a.weekly[wIdx]?.amount ?? 0),
  );
  const kingAmount = rows[0]?.weekly[wIdx]?.amount ?? 0;

  return (
    <View ref={ref} collapsable={false} style={styles.card}>
      <Text style={styles.appName}>{ko.common.appName}</Text>
      <Text style={styles.title}>{groupName}</Text>
      <Text style={styles.subtitle}>{ko.group.week(weekNo)} 정산표</Text>
      <View style={styles.table}>
        {rows.map((m) => {
          const amount = m.weekly[wIdx]?.amount ?? 0;
          const isKing = kingAmount > 0 && amount === kingAmount;
          return (
            <View key={m.userId} style={[styles.row, isKing && styles.kingRow]}>
              <Text style={[styles.name, isKing && styles.kingText]}>
                {isKing ? `👑 ${m.nickname} (${ko.ledger.penaltyKing})` : m.nickname}
              </Text>
              <Text style={[styles.amount, isKing && styles.kingText]}>
                {formatKrw(amount)}
                {ko.common.won}
              </Text>
            </View>
          );
        })}
      </View>
      <Text style={styles.watermark}>
        {ko.common.appName} · {ko.create.inviteCode} {inviteCode}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    width: 1080,
    height: 1350,
    backgroundColor: colors.primary,
    padding: 80,
    justifyContent: "space-between",
  },
  appName: { fontSize: 56, fontWeight: "900", color: "rgba(255,255,255,0.85)" },
  title: { fontSize: 88, fontWeight: "900", color: "#FFFFFF" },
  subtitle: { fontSize: 52, fontWeight: "600", color: "rgba(255,255,255,0.9)" },
  table: {
    backgroundColor: "#FFFFFF",
    borderRadius: 48,
    padding: 56,
    gap: 28,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 12,
  },
  kingRow: {
    backgroundColor: "#FFF3E6",
    borderRadius: 24,
    paddingHorizontal: 24,
  },
  name: { fontSize: 44, fontWeight: "600", color: colors.text },
  amount: { fontSize: 44, fontWeight: "800", color: colors.danger },
  kingText: { color: colors.warning },
  watermark: {
    fontSize: 36,
    color: "rgba(255,255,255,0.8)",
    textAlign: "center",
  },
});
