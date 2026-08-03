export const PAYMENTS_ENABLED =
  process.env.EXPO_PUBLIC_PAYMENTS_ENABLED === "true";

export const PENALTY_MAX = 50000; // §1.7 벌금 상한(원)
export const PENALTY_DEFAULT = 5000;
export const PENALTY_PRESETS = [3000, 5000, 10000];
export const PASS_QUOTA_MAX = 4;
export const TARGET_MIN = 1;
export const TARGET_MAX = 7;
export const FEED_PAGE_SIZE = 20;
export const SIGNED_URL_TTL_SEC = 3600; // §10 사진 signed URL 1h
export const PHOTO_MAX_EDGE = 1280; // §7.6 리사이즈 장변
export const PHOTO_JPEG_QUALITY = 0.7;
export const DISPUTE_WINDOW_HOURS = 24; // §1.5
export const SEASON_PASS_PRODUCT_ID = "fine_season_pass_4w"; // §11

// app_config 기본값 (서버 값 조회 실패 시 폴백)
export const DEFAULT_MIN_SEASON_MEMBERS = 3;
export const DEFAULT_MAX_GROUP_MEMBERS = 8;
export const DEFAULT_FREE_MAX_MEMBERS = 4;

export const INVITE_URL = (code: string) => `fine:///invite/${code}`;
