import { ko } from "@/i18n/ko";

// §7: RPC/트리거의 raise exception 'CODE'는 supabase 에러 message에 포함된다.
// unique 위반(23505)은 컨텍스트별 별도 처리(인증=오늘 중복, 투표=중복 투표).
const CODES = Object.keys(ko.errors) as (keyof typeof ko.errors)[];

export function codeToMessage(err: unknown, uniqueViolationCode?: keyof typeof ko.errors): string {
  const message =
    err instanceof Error ? err.message : typeof err === "string" ? err : "";
  const code = (err as { code?: string } | null)?.code;

  if (code === "23505" && uniqueViolationCode) return ko.errors[uniqueViolationCode];
  if (message.includes("duplicate key") && uniqueViolationCode)
    return ko.errors[uniqueViolationCode];

  for (const c of CODES) {
    if (message.includes(c)) return ko.errors[c];
  }
  return ko.common.fallbackError;
}
