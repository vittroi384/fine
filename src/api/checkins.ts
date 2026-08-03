import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect } from "react";

import { track } from "@/lib/analytics";
import { FEED_PAGE_SIZE, SIGNED_URL_TTL_SEC } from "@/lib/constants";
import { base64ToUint8Array, randomId } from "@/lib/encoding";
import { supabase } from "@/lib/supabase";
import type { Database, Json } from "@/types/db";

type CheckinRow = Database["public"]["Tables"]["checkins"]["Row"];

export interface FeedItem extends CheckinRow {
  profiles: { id: string; nickname: string; avatar_url: string | null } | null;
  signedUrl: string | null;
}

async function signPhotoUrls(
  rows: (CheckinRow & {
    profiles: FeedItem["profiles"];
  })[],
): Promise<FeedItem[]> {
  const paths = rows.map((r) => r.photo_path).filter((p) => p !== "purged");
  const { data: signed } = paths.length
    ? await supabase.storage
        .from("checkins")
        .createSignedUrls(paths, SIGNED_URL_TTL_SEC)
    : { data: [] };
  const urlByPath = new Map(
    (signed ?? []).filter((s) => s.signedUrl).map((s) => [s.path, s.signedUrl]),
  );
  return rows.map((r) => ({
    ...r,
    signedUrl: urlByPath.get(r.photo_path) ?? null,
  }));
}

/** 피드: 최신순 20개 페이지네이션 (§7.5) */
export function useSeasonFeed(seasonId: string) {
  return useInfiniteQuery({
    queryKey: ["feed", seasonId],
    enabled: !!seasonId,
    initialPageParam: 0,
    getNextPageParam: (last: FeedItem[], all) =>
      last.length < FEED_PAGE_SIZE ? undefined : all.length,
    queryFn: async ({ pageParam }): Promise<FeedItem[]> => {
      const from = pageParam * FEED_PAGE_SIZE;
      const { data, error } = await supabase
        .from("checkins")
        .select("*, profiles(id, nickname, avatar_url)")
        .eq("season_id", seasonId)
        .order("taken_at", { ascending: false })
        .range(from, from + FEED_PAGE_SIZE - 1);
      if (error) throw error;
      return signPhotoUrls(data ?? []);
    },
  });
}

/** Realtime: 신규 인증 시 피드 invalidate (§10) */
export function useFeedRealtime(seasonId: string) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!seasonId) return;
    const channel = supabase
      .channel(`season:${seasonId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "checkins",
          filter: `season_id=eq.${seasonId}`,
        },
        () => qc.invalidateQueries({ queryKey: ["feed", seasonId] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [seasonId, qc]);
}

/** 오늘 내 인증 여부 (서버 KST 기준) */
export function useTodayCheckin(seasonId: string) {
  return useQuery({
    queryKey: ["todayCheckin", seasonId],
    enabled: !!seasonId,
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return null;
      const { data: today } = await supabase.rpc("kst_today");
      const { data, error } = await supabase
        .from("checkins")
        .select("id, status")
        .eq("season_id", seasonId)
        .eq("user_id", auth.user.id)
        .eq("checkin_date", typeof today === "string" ? today : "")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

/** 내 스트릭(연속 인증일) — checkin_date 연속 구간 (§14 T9) */
export function useMyStreak(seasonId: string) {
  return useQuery({
    queryKey: ["streak", seasonId],
    enabled: !!seasonId,
    queryFn: async (): Promise<number> => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return 0;
      const { data, error } = await supabase
        .from("checkins")
        .select("checkin_date")
        .eq("season_id", seasonId)
        .eq("user_id", auth.user.id)
        .neq("status", "rejected")
        .order("checkin_date", { ascending: false });
      if (error) throw error;
      const dates = (data ?? []).map((d) => d.checkin_date);
      if (!dates.length) return 0;
      const { data: today } = await supabase.rpc("kst_today");
      const todayStr = typeof today === "string" ? today : dates[0];
      // 오늘 또는 어제부터 연속된 날짜 수
      let cursor = new Date(`${todayStr}T00:00:00Z`);
      if (dates[0] !== todayStr) cursor.setUTCDate(cursor.getUTCDate() - 1);
      let streak = 0;
      for (const d of dates) {
        const expect = cursor.toISOString().slice(0, 10);
        if (d !== expect) break;
        streak += 1;
        cursor.setUTCDate(cursor.getUTCDate() - 1);
      }
      return streak;
    },
  });
}

interface SubmitCheckinInput {
  seasonId: string;
  photoBase64: string;
  clientExif: Json | null; // GPS 필드는 카메라 화면에서 제거 후 전달 (§15)
}

/** 업로드 파이프라인: Storage PUT → insert. insert 실패 시 업로드 파일 삭제 (§7.6) */
export function useSubmitCheckin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      seasonId,
      photoBase64,
      clientExif,
    }: SubmitCheckinInput) => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("NOT_FOUND");
      const uid = auth.user.id;
      const path = `${seasonId}/${uid}/${randomId()}.jpg`;

      const bytes = base64ToUint8Array(photoBase64);
      const { error: upErr } = await supabase.storage
        .from("checkins")
        .upload(path, bytes.buffer as ArrayBuffer, {
          contentType: "image/jpeg",
        });
      if (upErr) throw upErr;

      // user_id/checkin_date/week_no는 트리거가 서버에서 재계산해 덮어쓴다 (§1.3)
      const { data, error } = await supabase
        .from("checkins")
        .insert({
          season_id: seasonId,
          photo_path: path,
          client_exif: clientExif,
          user_id: uid,
          checkin_date: "1970-01-01",
          week_no: 0,
        })
        .select()
        .single();
      if (error) {
        await supabase.storage.from("checkins").remove([path]).catch(() => {});
        throw error;
      }
      return data;
    },
    onSuccess: (row) => {
      track("checkin_submitted", { week_no: row.week_no });
      qc.invalidateQueries({ queryKey: ["feed", row.season_id] });
      qc.invalidateQueries({ queryKey: ["todayCheckin", row.season_id] });
      qc.invalidateQueries({ queryKey: ["streak", row.season_id] });
      qc.invalidateQueries({ queryKey: ["groups"] });
    },
    onError: (err) => {
      console.warn("checkin upload failed:", err);
      const code = (err as { code?: string } | null)?.code ?? "unknown";
      track("checkin_failed", { code });
    },
  });
}
