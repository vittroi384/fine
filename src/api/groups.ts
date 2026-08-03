import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { track } from "@/lib/analytics";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/types/db";

type GroupRow = Database["public"]["Tables"]["groups"]["Row"];
type SeasonRow = Database["public"]["Tables"]["seasons"]["Row"];

export interface GroupSummary {
  group: GroupRow;
  season: SeasonRow | null; // active 우선, 없으면 draft
  checkedInToday: boolean;
  unpaidAmount: number;
  memberCount: number;
}

/** 홈: 내 그룹 목록 + 시즌·오늘 인증·미납 합계 (§7.2) */
export function useMyGroups() {
  return useQuery({
    queryKey: ["groups"],
    queryFn: async (): Promise<GroupSummary[]> => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) return [];

      const { data: groups, error } = await supabase
        .from("groups")
        .select("*, seasons(*), group_members(user_id)")
        .order("created_at", { ascending: false });
      if (error) throw error;

      const { data: today } = await supabase.rpc("kst_today");
      const todayStr = typeof today === "string" ? today : "";

      const activeSeasonIds = (groups ?? [])
        .flatMap((g) => (g.seasons as SeasonRow[]) ?? [])
        .filter((s) => s.status === "active")
        .map((s) => s.id);

      const [checkinsRes, ledgerRes] = await Promise.all([
        activeSeasonIds.length
          ? supabase
              .from("checkins")
              .select("season_id")
              .eq("user_id", uid)
              .eq("checkin_date", todayStr)
              .neq("status", "rejected")
              .in("season_id", activeSeasonIds)
          : Promise.resolve({ data: [], error: null }),
        supabase
          .from("penalty_ledger")
          .select("season_id, amount, settled")
          .eq("user_id", uid)
          .eq("settled", false)
          .gt("amount", 0),
      ]);
      if (checkinsRes.error) throw checkinsRes.error;
      if (ledgerRes.error) throw ledgerRes.error;

      const checkedSeasonIds = new Set(
        (checkinsRes.data ?? []).map((c) => c.season_id),
      );

      return (groups ?? []).map((g) => {
        const seasons = ((g.seasons as SeasonRow[]) ?? []).sort((a, b) =>
          b.created_at.localeCompare(a.created_at),
        );
        const season =
          seasons.find((s) => s.status === "active") ??
          seasons.find((s) => s.status === "draft") ??
          null;
        const seasonIds = new Set(seasons.map((s) => s.id));
        const unpaid = (ledgerRes.data ?? [])
          .filter((l) => seasonIds.has(l.season_id))
          .reduce((sum, l) => sum + l.amount, 0);
        return {
          group: g,
          season,
          checkedInToday: season ? checkedSeasonIds.has(season.id) : false,
          unpaidAmount: unpaid,
          memberCount: (g.group_members as { user_id: string }[])?.length ?? 0,
        };
      });
    },
  });
}

/** 그룹 상세: 멤버 프로필 포함 (§7.5) */
export function useGroup(groupId: string) {
  return useQuery({
    queryKey: ["group", groupId],
    enabled: !!groupId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("groups")
        .select(
          "*, seasons(*), group_members(user_id, role, profiles(id, nickname, avatar_url))",
        )
        .eq("id", groupId)
        .single();
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("NOT_FOUND");
      const { data, error } = await supabase
        .from("groups")
        .insert({ name, owner_id: auth.user.id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      track("group_created");
      qc.invalidateQueries({ queryKey: ["groups"] });
    },
  });
}

export function useJoinGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (code: string) => {
      const { data, error } = await supabase.rpc("join_group", { code });
      if (error) throw error;
      return data; // group id
    },
    onSuccess: (groupId) => {
      track("invite_accepted", { group_id: groupId });
      qc.invalidateQueries({ queryKey: ["groups"] });
    },
  });
}

export function useLeaveGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (groupId: string) => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("NOT_FOUND");
      const { error } = await supabase
        .from("group_members")
        .delete()
        .eq("group_id", groupId)
        .eq("user_id", auth.user.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["groups"] }),
  });
}
