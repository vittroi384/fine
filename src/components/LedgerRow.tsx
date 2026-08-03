import { Pressable, StyleSheet, Text, View } from "react-native";

import type { LedgerMember } from "@/api/ledger";
import { Avatar } from "@/components/Avatar";
import { ko } from "@/i18n/ko";
import { formatKrw } from "@/lib/dates";
import { colors, radius, spacing } from "@/lib/theme";

interface Props {
  member: LedgerMember;
  weekIndex: number; // 0-based
  isSettledWeek: boolean;
  isMe: boolean;
  isOwner: boolean;
  onToggleSettled: (ledgerId: string, next: boolean, amount: number) => void;
  onConfirm: (ledgerId: string) => void;
}

export function LedgerRow({
  member,
  weekIndex,
  isSettledWeek,
  isMe,
  isOwner,
  onToggleSettled,
  onConfirm,
}: Props) {
  const entry = member.weekly[weekIndex] ?? null;

  return (
    <View style={styles.row}>
      <Avatar nickname={member.nickname} avatarUrl={member.avatarUrl} size={32} />
      <Text style={styles.name} numberOfLines={1}>
        {member.nickname}
      </Text>
      {!isSettledWeek ? (
        <Text style={styles.pending}>{ko.ledger.pending}</Text>
      ) : entry ? (
        <View style={styles.right}>
          <Text style={[styles.amount, entry.amount === 0 && styles.zero]}>
            {formatKrw(entry.amount)}
            {ko.common.won}
          </Text>
          {entry.amount > 0 && isMe ? (
            <Pressable
              onPress={() => onToggleSettled(entry.id, !entry.settled, entry.amount)}
              style={[styles.chip, entry.settled && styles.chipDone]}
            >
              <Text style={[styles.chipText, entry.settled && styles.chipTextDone]}>
                {entry.settled ? ko.ledger.settled : ko.ledger.markSettled}
              </Text>
            </Pressable>
          ) : null}
          {entry.amount > 0 && !isMe && isOwner && entry.settled ? (
            <Pressable
              onPress={() => onConfirm(entry.id)}
              disabled={entry.confirmed_by_owner}
              style={[styles.chip, entry.confirmed_by_owner && styles.chipDone]}
            >
              <Text
                style={[
                  styles.chipText,
                  entry.confirmed_by_owner && styles.chipTextDone,
                ]}
              >
                {entry.confirmed_by_owner ? ko.ledger.confirmed : ko.ledger.confirm}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <Text style={styles.pending}>—</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: 10,
  },
  name: { flex: 1, fontSize: 15, color: colors.text, fontWeight: "500" },
  right: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  amount: { fontSize: 15, fontWeight: "700", color: colors.danger },
  zero: { color: colors.success },
  pending: { fontSize: 13, color: colors.textSub },
  chip: {
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  chipDone: { backgroundColor: "#E6F9F1", borderColor: colors.success },
  chipText: { fontSize: 12, fontWeight: "600", color: colors.text },
  chipTextDone: { color: colors.success },
});
