// 표시 전용 날짜 유틸 — 판정은 전부 서버(§0-3). 여기 값은 UI 힌트로만 쓴다.

/** 'YYYY-MM-DD' 문자열을 로컬 자정 Date로 파싱 */
export function parseDateOnly(d: string): Date {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day);
}

export function toDateOnlyString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** end_date까지 남은 일수 (오늘 포함 기준, 음수면 종료). null은 generated column 타입 방어 */
export function daysUntil(endDate: string | null, now = new Date()): number {
  if (!endDate) return 0;
  const end = parseDateOnly(endDate);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((end.getTime() - today.getTime()) / 86400000);
}

/** 표시용 주차 추정 (서버 계산과 동일 수식, §1.1) */
export function currentWeekNo(startDate: string, now = new Date()): number {
  const start = parseDateOnly(startDate);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.floor((today.getTime() - start.getTime()) / 86400000);
  return Math.floor(diff / 7) + 1;
}

export function nextMonday(now = new Date()): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = d.getDay(); // 0=일
  const add = day === 0 ? 1 : 8 - day;
  d.setDate(d.getDate() + add);
  return d;
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

export function formatKrw(amount: number): string {
  return amount.toLocaleString("ko-KR");
}

/** 피드 타임스탬프 표시 */
export function formatTimeAgo(iso: string, now = new Date()): string {
  const t = new Date(iso).getTime();
  const diffMin = Math.floor((now.getTime() - t) / 60000);
  if (diffMin < 1) return "방금";
  if (diffMin < 60) return `${diffMin}분 전`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}시간 전`;
  return `${Math.floor(diffH / 24)}일 전`;
}

/** 마감까지 남은 시간 카운트다운 표시 (이의제기) */
export function formatCountdown(deadlineIso: string, now = new Date()): string {
  const ms = new Date(deadlineIso).getTime() - now.getTime();
  if (ms <= 0) return "마감";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}시간 ${m}분`;
}
