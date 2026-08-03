import { Image } from "expo-image";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  useDisputeDetail,
  useRaiseDispute,
  useVoteDispute,
} from "@/api/disputes";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { CountdownPill } from "@/components/CountdownPill";
import { ko } from "@/i18n/ko";
import { codeToMessage } from "@/lib/errors";
import { colors, spacing } from "@/lib/theme";
import { useUiStore } from "@/stores/ui";

// §7.8: 제기 → 투표 → 결과가 한 화면에서 상태에 따라 전환된다
export default function DisputeScreen() {
  const { checkinId } = useLocalSearchParams<{
    id: string;
    checkinId: string;
  }>();
  const insets = useSafeAreaInsets();
  const showToast = useUiStore((s) => s.showToast);
  const [reason, setReason] = useState("");

  const { data } = useDisputeDetail(checkinId);
  const raise = useRaiseDispute(checkinId, data?.checkin.season_id ?? "");
  const vote = useVoteDispute(checkinId);

  if (!data) return <View style={styles.wrap} />;

  const { checkin, dispute, votes, signedUrl, isTarget, myVote } = data;
  const yes = votes.filter((v) => v.vote).length;
  const no = votes.filter((v) => !v.vote).length;

  const onRaise = () =>
    raise.mutate(reason.trim(), {
      onError: (e) => showToast(codeToMessage(e), "error"),
    });

  const onVote = (v: boolean) => {
    if (!dispute) return;
    vote.mutate(
      { disputeId: dispute.id, vote: v },
      { onError: (e) => showToast(codeToMessage(e, "ALREADY_VOTED"), "error") },
    );
  };

  return (
    <ScrollView
      style={styles.wrap}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.xl },
      ]}
    >
      <Text style={styles.title}>{ko.dispute.title}</Text>
      {signedUrl ? (
        <Image source={{ uri: signedUrl }} style={styles.photo} contentFit="cover" />
      ) : null}

      {!dispute ? (
        <>
          <TextInput
            style={styles.input}
            value={reason}
            onChangeText={setReason}
            placeholder={ko.dispute.reasonPlaceholder}
            multiline
            maxLength={200}
          />
          <Button
            label={ko.dispute.submit}
            onPress={onRaise}
            disabled={reason.trim().length < 2}
            loading={raise.isPending}
          />
        </>
      ) : (
        <Card style={styles.voteCard}>
          <Text style={styles.reason}>“{dispute.reason}”</Text>
          {dispute.resolved ? (
            <Text
              style={[
                styles.resultBanner,
                dispute.outcome === "rejected"
                  ? styles.resultRejected
                  : styles.resultValid,
              ]}
            >
              {dispute.outcome === "rejected"
                ? ko.dispute.resolvedRejected
                : ko.dispute.resolvedValid}
            </Text>
          ) : (
            <>
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>{ko.dispute.remaining}</Text>
                <CountdownPill deadline={dispute.deadline} />
              </View>
              <Text style={styles.tally}>{ko.dispute.tallied(yes, no)}</Text>
              {isTarget ? (
                <Text style={styles.readonly}>{ko.dispute.targetReadOnly}</Text>
              ) : myVote === null && checkin.status === "disputed" ? (
                <View style={styles.voteRow}>
                  <Button
                    label={ko.dispute.voteYes}
                    variant="danger"
                    onPress={() => onVote(true)}
                    style={styles.flex1}
                  />
                  <Button
                    label={ko.dispute.voteNo}
                    variant="secondary"
                    onPress={() => onVote(false)}
                    style={styles.flex1}
                  />
                </View>
              ) : null}
            </>
          )}
        </Card>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: spacing.lg, gap: spacing.md },
  title: { fontSize: 24, fontWeight: "800", color: colors.text },
  photo: { width: "100%", aspectRatio: 1, borderRadius: 16 },
  input: {
    minHeight: 90,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    padding: spacing.md,
    fontSize: 15,
    textAlignVertical: "top",
  },
  voteCard: { gap: spacing.md },
  reason: { fontSize: 16, color: colors.text, fontStyle: "italic" },
  metaRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  metaLabel: { fontSize: 14, color: colors.textSub },
  tally: { fontSize: 18, fontWeight: "700", color: colors.text },
  voteRow: { flexDirection: "row", gap: spacing.sm },
  flex1: { flex: 1 },
  readonly: { fontSize: 13, color: colors.textSub },
  resultBanner: {
    fontSize: 15,
    fontWeight: "700",
    padding: spacing.md,
    borderRadius: 12,
    overflow: "hidden",
    textAlign: "center",
  },
  resultRejected: { backgroundColor: "#FEECEC", color: colors.danger },
  resultValid: { backgroundColor: "#E6F9F1", color: colors.success },
});
