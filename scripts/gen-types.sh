#!/usr/bin/env bash
# src/types/db.ts 재생성 (마지막의 수동 별칭 블록 유지)
set -e
cd "$(dirname "$0")/.."
npx supabase gen types typescript --local > src/types/db.ts
cat >> src/types/db.ts <<'EOF'

// 수동 별칭 (gen-types 재생성 시 이 블록을 유지할 것)
export type RuleType = Database["public"]["Enums"]["rule_type"];
export type SeasonStatus = Database["public"]["Enums"]["season_status"];
export type CheckinStatus = Database["public"]["Enums"]["checkin_status"];
EOF
echo "src/types/db.ts regenerated"
