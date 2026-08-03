import { useQuery } from "@tanstack/react-query";

import {
  DEFAULT_FREE_MAX_MEMBERS,
  DEFAULT_MAX_GROUP_MEMBERS,
  DEFAULT_MIN_SEASON_MEMBERS,
} from "@/lib/constants";
import { supabase } from "@/lib/supabase";

export interface HouseAd {
  id: string;
  title: string;
  body: string;
  cta?: string;
  url?: string;
}

interface AppConfig {
  minSeasonMembers: number;
  maxGroupMembers: number;
  freeMaxMembers: number;
  paymentsEnabled: boolean;
  houseAds: HouseAd[];
}

function scalar(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value ?? "");
}

export function useAppConfig() {
  return useQuery({
    queryKey: ["app_config"],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<AppConfig> => {
      const { data, error } = await supabase.from("app_config").select("*");
      if (error) throw error;
      const map = new Map((data ?? []).map((r) => [r.key, r.value]));
      const num = (k: string, fallback: number) => {
        const n = Number(scalar(map.get(k)));
        return Number.isFinite(n) && n > 0 ? n : fallback;
      };
      return {
        minSeasonMembers: num("min_season_members", DEFAULT_MIN_SEASON_MEMBERS),
        maxGroupMembers: num("max_group_members", DEFAULT_MAX_GROUP_MEMBERS),
        freeMaxMembers: num("free_max_members", DEFAULT_FREE_MAX_MEMBERS),
        paymentsEnabled: scalar(map.get("payments_enabled")) === "true",
        houseAds: Array.isArray(map.get("house_ads"))
          ? (map.get("house_ads") as unknown as HouseAd[])
          : [],
      };
    },
  });
}

export function useHouseAds() {
  const q = useAppConfig();
  return { ...q, data: q.data?.houseAds };
}
