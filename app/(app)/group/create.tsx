import { useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, Share, StyleSheet, Text, TextInput } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAppConfig } from "@/api/config";
import { useCreateGroup, useGroup } from "@/api/groups";
import { useCreateSeason, useStartSeason } from "@/api/seasons";
import { Button } from "@/components/Button";
import {
  SeasonRuleForm,
  type SeasonRuleValues,
} from "@/components/SeasonRuleForm";
import { ko } from "@/i18n/ko";
import { track } from "@/lib/analytics";
import { INVITE_URL } from "@/lib/constants";
import { addDays, nextMonday, toDateOnlyString } from "@/lib/dates";
import { codeToMessage } from "@/lib/errors";
import { colors, spacing } from "@/lib/theme";
import { useUiStore } from "@/stores/ui";
import type { Database } from "@/types/db";

type GroupRow = Database["public"]["Tables"]["groups"]["Row"];

// §7.3 생성 위저드: Step1 그룹명 → Step2 시즌 규칙 → 완료(초대·시작)
export default function CreateGroup() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const showToast = useUiStore((s) => s.showToast);
  const { data: config } = useAppConfig();
  const createGroup = useCreateGroup();
  const createSeason = useCreateSeason();
  const startSeason = useStartSeason();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [name, setName] = useState("");
  const [group, setGroup] = useState<GroupRow | null>(null);
  const [seasonId, setSeasonId] = useState<string | null>(null);
  const [rules, setRules] = useState<SeasonRuleValues>({
    ruleType: "weekly_count",
    target: 3,
    penalty: 5000,
    passQuota: 1,
    startOffset: "today",
  });

  const { data: groupDetail, refetch: refetchGroup } = useGroup(group?.id ?? "");
  const memberCount =
    (groupDetail?.group_members as unknown[] | undefined)?.length ?? 1;
  const minMembers = config?.minSeasonMembers ?? 3;

  const submitStep1 = () => {
    createGroup.mutate(name.trim(), {
      onSuccess: (g) => {
        setGroup(g);
        setStep(2);
      },
      onError: (e) => showToast(codeToMessage(e), "error"),
    });
  };

  const startDate = () => {
    const now = new Date();
    if (rules.startOffset === "today") return toDateOnlyString(now);
    if (rules.startOffset === "tomorrow")
      return toDateOnlyString(addDays(now, 1));
    return toDateOnlyString(nextMonday(now));
  };

  const submitStep2 = () => {
    if (!group) return;
    createSeason.mutate(
      {
        groupId: group.id,
        title:
          rules.ruleType === "daily"
            ? "매일 챌린지"
            : `주${rules.target}회 챌린지`,
        ruleType: rules.ruleType,
        targetCount: rules.target,
        penaltyAmount: rules.penalty,
        passQuota: rules.passQuota,
        startDate: startDate(),
      },
      {
        onSuccess: (s) => {
          setSeasonId(s.id);
          setStep(3);
        },
        onError: (e) => showToast(codeToMessage(e), "error"),
      },
    );
  };

  const shareInvite = async () => {
    if (!group) return;
    track("invite_link_shared");
    await Share.share({
      message: `${ko.common.appName} — "${group.name}" 그룹에 초대해요!\n${INVITE_URL(group.invite_code)}\n${ko.create.inviteCode}: ${group.invite_code}`,
    });
  };

  const onStartSeason = () => {
    if (!seasonId || !group) return;
    startSeason.mutate(seasonId, {
      onSuccess: () => router.replace(`/group/${group.id}`),
      onError: (e) => {
        const msg = e instanceof Error ? e.message : "";
        if (msg.includes("PAYWALL_REQUIRED")) {
          router.push("/paywall");
          return;
        }
        showToast(codeToMessage(e), "error");
      },
    });
  };

  return (
    <ScrollView
      style={styles.wrap}
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: insets.top + spacing.lg,
          paddingBottom: insets.bottom + spacing.xl,
        },
      ]}
    >
      {step === 1 ? (
        <>
          <Text style={styles.title}>{ko.create.step1Title}</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder={ko.create.namePlaceholder}
            maxLength={30}
          />
          <Button
            label={ko.common.next}
            onPress={submitStep1}
            disabled={!name.trim()}
            loading={createGroup.isPending}
          />
        </>
      ) : step === 2 ? (
        <>
          <Text style={styles.title}>{ko.create.step2Title}</Text>
          <SeasonRuleForm
            values={rules}
            onChange={(patch) => setRules((r) => ({ ...r, ...patch }))}
            onSubmit={submitStep2}
            submitting={createSeason.isPending}
          />
        </>
      ) : (
        <>
          <Text style={styles.title}>{ko.create.doneTitle}</Text>
          <Text style={styles.label}>{ko.create.inviteCode}</Text>
          <Text style={styles.code} onPress={() => refetchGroup()}>
            {group?.invite_code}
          </Text>
          <Button label={ko.create.shareInvite} onPress={shareInvite} />
          <Text style={styles.hint}>{ko.create.memberHint(minMembers)}</Text>
          <Button
            label={ko.create.startSeason}
            onPress={onStartSeason}
            variant="secondary"
            disabled={memberCount < minMembers}
            loading={startSeason.isPending}
          />
          <Button
            label={ko.invite.goHome}
            onPress={() => router.replace("/")}
            variant="ghost"
          />
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  title: {
    fontSize: 24,
    fontWeight: "800",
    color: colors.text,
    marginBottom: spacing.md,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textSub,
    marginTop: spacing.md,
  },
  hint: { fontSize: 13, color: colors.textSub },
  input: {
    height: 52,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.md,
    fontSize: 16,
    marginBottom: spacing.md,
  },
  code: {
    fontSize: 32,
    fontWeight: "900",
    color: colors.primary,
    letterSpacing: 4,
    marginBottom: spacing.md,
  },
});
