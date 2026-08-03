import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { track } from "@/lib/analytics";
import { SIGNED_URL_TTL_SEC } from "@/lib/constants";
import { supabase } from "@/lib/supabase";

/** 인증 1건 + 이의제기 + 투표 현황 (§7.8) */
export function useDisputeDetail(checkinId: string) {
  return useQuery({
    queryKey: ["dispute", checkinId],
    enabled: !!checkinId,
    queryFn: async () => {
      const { data: checkin, error: ce } = await supabase
        .from("checkins")
        .select("*, profiles(id, nickname, avatar_url)")
        .eq("id", checkinId)
        .single();
      if (ce) throw ce;

      const { data: dispute, error: de } = await supabase
        .from("disputes")
        .select("*")
        .eq("checkin_id", checkinId)
        .maybeSingle();
      if (de) throw de;

      const votes = dispute
        ? await supabase
            .from("dispute_votes")
            .select("voter_id, vote")
            .eq("dispute_id", dispute.id)
        : { data: [], error: null };
      if (votes.error) throw votes.error;

      const { data: signed } =
        checkin.photo_path !== "purged"
          ? await supabase.storage
              .from("checkins")
              .createSignedUrl(checkin.photo_path, SIGNED_URL_TTL_SEC)
          : { data: null };

      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id ?? null;

      return {
        checkin,
        dispute,
        votes: votes.data ?? [],
        signedUrl: signed?.signedUrl ?? null,
        myUserId: uid,
        isTarget: uid === checkin.user_id,
        myVote:
          (votes.data ?? []).find((v) => v.voter_id === uid)?.vote ?? null,
      };
    },
  });
}

export function useRaiseDispute(checkinId: string, seasonId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (reason: string) => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("NOT_FOUND");
      // raised_by는 트리거가 auth.uid()로 덮어쓴다 (§1.5)
      const { data, error } = await supabase
        .from("disputes")
        .insert({ checkin_id: checkinId, reason, raised_by: auth.user.id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      track("dispute_raised");
      qc.invalidateQueries({ queryKey: ["dispute", checkinId] });
      qc.invalidateQueries({ queryKey: ["feed", seasonId] });
    },
  });
}

export function useVoteDispute(checkinId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      disputeId,
      vote,
    }: {
      disputeId: string;
      vote: boolean;
    }) => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("NOT_FOUND");
      const { error } = await supabase
        .from("dispute_votes")
        .insert({ dispute_id: disputeId, voter_id: auth.user.id, vote });
      if (error) throw error;
      return vote;
    },
    onSuccess: (vote) => {
      track("dispute_voted", { vote });
      qc.invalidateQueries({ queryKey: ["dispute", checkinId] });
    },
  });
}
