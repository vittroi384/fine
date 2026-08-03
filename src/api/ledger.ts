import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { track } from "@/lib/analytics";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/types/db";

type LedgerRow = Database["public"]["Tables"]["penalty_ledger"]["Row"];

export interface LedgerMember {
  userId: string;
  nickname: string;
  avatarUrl: string | null;
  weekly: (LedgerRow | null)[]; // index 0 = W1
  total: number;
}

export interface LedgerData {
  members: LedgerMember[];
  settledWeeks: number[]; // 정산 완료된 주차 목록
  myPassesUsed: number;
}

/** 장부: 멤버 × 주차 매트릭스 (§7.7) */
export function useLedger(seasonId: string, groupId: string, weeks: number) {
  return useQuery({
    queryKey: ["ledger", seasonId],
    enabled: !!seasonId && !!groupId,
    queryFn: async (): Promise<LedgerData> => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;

      const [ledgerRes, membersRes, passesRes] = await Promise.all([
        supabase.from("penalty_ledger").select("*").eq("season_id", seasonId),
        supabase
          .from("group_members")
          .select("user_id, profiles(id, nickname, avatar_url)")
          .eq("group_id", groupId),
        supabase.from("passes").select("user_id").eq("season_id", seasonId),
      ]);
      if (ledgerRes.error) throw ledgerRes.error;
      if (membersRes.error) throw membersRes.error;
      if (passesRes.error) throw passesRes.error;

      const rows = ledgerRes.data ?? [];
      const settledWeeks = [...new Set(rows.map((r) => r.week_no))].sort(
        (a, b) => a - b,
      );

      const members: LedgerMember[] = (membersRes.data ?? []).map((m) => {
        const p = m.profiles as {
          id: string;
          nickname: string;
          avatar_url: string | null;
        } | null;
        const weekly: (LedgerRow | null)[] = [];
        for (let w = 1; w <= weeks; w++) {
          weekly.push(
            rows.find((r) => r.user_id === m.user_id && r.week_no === w) ??
              null,
          );
        }
        return {
          userId: m.user_id,
          nickname: p?.nickname ?? "?",
          avatarUrl: p?.avatar_url ?? null,
          weekly,
          total: weekly.reduce((sum, r) => sum + (r?.amount ?? 0), 0),
        };
      });

      return {
        members,
        settledWeeks,
        myPassesUsed: (passesRes.data ?? []).filter((p) => p.user_id === uid)
          .length,
      };
    },
  });
}

export function useMarkSettled(seasonId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      ledgerId,
      val,
      amount,
    }: {
      ledgerId: string;
      val: boolean;
      amount: number;
    }) => {
      const { error } = await supabase.rpc("mark_settled", {
        ledger_id: ledgerId,
        val,
      });
      if (error) throw error;
      return amount;
    },
    onSuccess: (amount) => {
      track("ledger_marked_settled", { amount });
      qc.invalidateQueries({ queryKey: ["ledger", seasonId] });
      qc.invalidateQueries({ queryKey: ["groups"] });
    },
  });
}

export function useConfirmSettled(seasonId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ledgerId: string) => {
      const { error } = await supabase.rpc("confirm_settled", {
        ledger_id: ledgerId,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ledger", seasonId] }),
  });
}

export function useUsePass(seasonId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (weekNo: number) => {
      const { error } = await supabase.rpc("use_pass", {
        sid: seasonId,
        wk: weekNo,
      });
      if (error) throw error;
      return weekNo;
    },
    onSuccess: (weekNo) => {
      track("pass_used", { week_no: weekNo });
      qc.invalidateQueries({ queryKey: ["ledger", seasonId] });
    },
  });
}
