import { create } from "zustand";

type ToastKind = "info" | "error" | "success";

interface UiState {
  toast: { message: string; kind: ToastKind } | null;
  showToast: (message: string, kind?: ToastKind) => void;
  hideToast: () => void;
  /** 비로그인 상태에서 초대 링크를 탔을 때 보관하는 코드 (§7.4) */
  pendingInviteCode: string | null;
  setPendingInviteCode: (code: string | null) => void;
  /** 닫은 HouseAd id 목록 (§11.5) — AsyncStorage와 동기화 */
  dismissedHouseAds: string[];
  dismissHouseAd: (id: string) => void;
  setDismissedHouseAds: (ids: string[]) => void;
}

export const useUiStore = create<UiState>((set) => ({
  toast: null,
  showToast: (message, kind = "info") => set({ toast: { message, kind } }),
  hideToast: () => set({ toast: null }),
  pendingInviteCode: null,
  setPendingInviteCode: (code) => set({ pendingInviteCode: code }),
  dismissedHouseAds: [],
  dismissHouseAd: (id) =>
    set((s) => ({ dismissedHouseAds: [...s.dismissedHouseAds, id] })),
  setDismissedHouseAds: (ids) => set({ dismissedHouseAds: ids }),
}));
