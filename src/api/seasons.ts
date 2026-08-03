import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { track } from "@/lib/analytics";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/types/db";

type RuleType = Database["public"]["Enums"]["rule_type"];

export function useSeason(seasonId: string) {
  return useQuery({
    queryKey: ["season", seasonId],
    enabled: !!seasonId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("seasons")
        .select("*")
        .eq("id", seasonId)
        .single();
      if (error) throw error;
      return data;
    },
  });
}

interface CreateSeasonInput {
  groupId: string;
  title: string;
  ruleType: RuleType;
  targetCount: number; // daily면 7로 저장 (§1.4)
  penaltyAmount: number;
  passQuota: number;
  startDate: string; // YYYY-MM-DD
}

export function useCreateSeason() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateSeasonInput) => {
      const { data, error } = await supabase
        .from("seasons")
        .insert({
          group_id: input.groupId,
          title: input.title,
          rule_type: input.ruleType,
          target_count: input.ruleType === "daily" ? 7 : input.targetCount,
          penalty_amount: input.penaltyAmount,
          pass_quota: input.passQuota,
          start_date: input.startDate,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (season) => {
      qc.invalidateQueries({ queryKey: ["groups"] });
      qc.invalidateQueries({ queryKey: ["group", season.group_id] });
    },
  });
}

export function useStartSeason() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (seasonId: string) => {
      const { data, error } = await supabase.rpc("start_season", {
        sid: seasonId,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, seasonId) => {
      track("season_started");
      qc.invalidateQueries({ queryKey: ["groups"] });
      qc.invalidateQueries({ queryKey: ["season", seasonId] });
      qc.invalidateQueries({ queryKey: ["group"] });
    },
  });
}
