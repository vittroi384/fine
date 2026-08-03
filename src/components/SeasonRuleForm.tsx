import { StyleSheet, Text } from "react-native";

import { Button } from "@/components/Button";
import { Choice } from "@/components/Choice";
import { ko } from "@/i18n/ko";
import { PENALTY_MAX, PENALTY_PRESETS } from "@/lib/constants";
import { formatKrw } from "@/lib/dates";
import { colors, spacing } from "@/lib/theme";
import type { RuleType } from "@/types/db";

export interface SeasonRuleValues {
  ruleType: RuleType;
  target: number;
  penalty: number;
  passQuota: number;
  startOffset: "today" | "tomorrow" | "monday";
}

interface Props {
  values: SeasonRuleValues;
  onChange: (patch: Partial<SeasonRuleValues>) => void;
  onSubmit: () => void;
  submitting: boolean;
}

// §7.3 Step2: 시즌 규칙 폼
export function SeasonRuleForm({ values, onChange, onSubmit, submitting }: Props) {
  return (
    <>
      <Text style={styles.label}>{ko.create.ruleTypeLabel}</Text>
      <Choice
        options={[
          { value: "weekly_count", label: ko.create.ruleWeekly },
          { value: "daily", label: ko.create.ruleDaily },
        ]}
        value={values.ruleType}
        onChange={(ruleType) => onChange({ ruleType })}
      />

      {values.ruleType === "weekly_count" ? (
        <>
          <Text style={styles.label}>{ko.create.targetLabel}</Text>
          <Choice
            options={[1, 2, 3, 4, 5, 6, 7].map((n) => ({
              value: n,
              label: `${n}회`,
            }))}
            value={values.target}
            onChange={(target) => onChange({ target })}
          />
        </>
      ) : null}

      <Text style={styles.label}>
        {ko.create.penaltyLabel} — {formatKrw(values.penalty)}
        {ko.common.won}
      </Text>
      <Choice
        options={[
          ...PENALTY_PRESETS.map((p) => ({
            value: p,
            label: `${formatKrw(p)}원`,
          })),
          { value: 0, label: "0원" },
          { value: PENALTY_MAX, label: `${formatKrw(PENALTY_MAX)}원` },
        ]}
        value={values.penalty}
        onChange={(penalty) => onChange({ penalty })}
      />
      <Text style={styles.hint}>{ko.create.penaltyHint}</Text>

      <Text style={styles.label}>{ko.create.passLabel}</Text>
      <Choice
        options={[0, 1, 2, 3, 4].map((n) => ({ value: n, label: `${n}개` }))}
        value={values.passQuota}
        onChange={(passQuota) => onChange({ passQuota })}
      />

      <Text style={styles.label}>{ko.create.startDateLabel}</Text>
      <Choice
        options={[
          { value: "today", label: ko.create.startToday },
          { value: "tomorrow", label: ko.create.startTomorrow },
          { value: "monday", label: ko.create.startNextMonday },
        ]}
        value={values.startOffset}
        onChange={(startOffset) => onChange({ startOffset })}
      />

      <Button
        label={ko.create.createSeason}
        onPress={onSubmit}
        loading={submitting}
        style={styles.cta}
      />
    </>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textSub,
    marginTop: spacing.md,
  },
  hint: { fontSize: 13, color: colors.textSub },
  cta: { marginTop: spacing.lg },
});
