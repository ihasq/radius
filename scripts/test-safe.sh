#!/bin/bash
set -eu

LOG="test-results.log"
exec > >(tee -a "$LOG") 2>&1

FILES=(
  tests/colors.test.ts
  tests/update-crypto.test.ts
  tests/update-version.test.ts
  tests/ledger-unit.test.ts
  tests/basic.test.ts
  tests/history.test.ts
  tests/dogtag.test.ts
  tests/extension-host.test.ts
  tests/search-replace.test.ts
  tests/rename-imports.test.ts
  tests/graph.test.ts
  tests/multi-agent.test.ts
  tests/multi-agent-e2e.test.ts
  tests/change-metadata.test.ts
  tests/context-read.test.ts
  tests/context-conventions.test.ts
  tests/lsp-core.test.ts
  tests/lsp-diagnostics.test.ts
  tests/lsp-lifecycle.test.ts
  tests/diagnostics-tracking.test.ts
  tests/group-codeactions.test.ts
  tests/group-lspviews.test.ts
  tests/group-langtools.test.ts
  tests/context-write.test.ts
  tests/versioned-socket.test.ts
  tests/update-e2e.test.ts
)

TOTAL_PASS=0
TOTAL_FAIL=0
TOTAL_SKIP=0

echo "=== test-safe.sh started at $(date -Iseconds) ==="
echo ""

for f in "${FILES[@]}"; do
  pkill -f "typescript-language-server" 2>/dev/null || true
  pkill -f "daemon/main" 2>/dev/null || true
  sleep 1

  # テスト開始前のリソース状態
  CPU_BEFORE=$(ps -eo pcpu --no-headers | awk '{s+=$1}END{printf "%.0f", s}')
  MEM_BEFORE=$(free -m 2>/dev/null | awk '/Mem:/{print $7}' || echo "N/A")

  echo "--- $f ---"
  echo "  start: $(date -Iseconds)  cpu_total: ${CPU_BEFORE}%  mem_avail: ${MEM_BEFORE}MB"

  RESULT=$(timeout 120 bun test --timeout 60000 "$f" 2>&1) || true
  EXIT=$?

  # テスト完了後のリソース状態
  CPU_AFTER=$(ps -eo pcpu --no-headers | awk '{s+=$1}END{printf "%.0f", s}')
  MEM_AFTER=$(free -m 2>/dev/null | awk '/Mem:/{print $7}' || echo "N/A")
  LSPS=$(ps aux | grep "[t]ypescript-language-server" | grep -v grep | wc -l)
  DAEMONS=$(ps aux | grep "[d]aemon/main" | grep -v grep | wc -l)

  PASS=$(echo "$RESULT" | grep -oP '\d+(?= pass)' | tail -1)
  FAIL=$(echo "$RESULT" | grep -oP '\d+(?= fail)' | tail -1)
  SKIP=$(echo "$RESULT" | grep -oP '\d+(?= skip)' | tail -1)
  PASS=${PASS:-0}
  FAIL=${FAIL:-0}
  SKIP=${SKIP:-0}
  TOTAL_PASS=$((TOTAL_PASS + PASS))
  TOTAL_FAIL=$((TOTAL_FAIL + FAIL))
  TOTAL_SKIP=$((TOTAL_SKIP + SKIP))

  if [ "$FAIL" -gt 0 ] || [ "$EXIT" -ne 0 ]; then
    echo "  ❌ pass:$PASS fail:$FAIL skip:$SKIP  exit:$EXIT"
    echo "$RESULT" | grep "(fail)" || true
  else
    echo "  ✅ pass:$PASS fail:$FAIL skip:$SKIP"
  fi

  echo "  end: $(date -Iseconds)  cpu_total: ${CPU_AFTER}%  mem_avail: ${MEM_AFTER}MB  daemons:$DAEMONS lsp:$LSPS"

  if [ "$LSPS" -gt 1 ]; then
    echo "  ⚠️ LSP LEAK: $LSPS servers. Force killing."
    pkill -9 -f "typescript-language-server" 2>/dev/null || true
  fi

  # フリーズ防止: メモリ残量が200MB未満なら中断
  if [ "$MEM_AFTER" != "N/A" ] && [ "$MEM_AFTER" -lt 200 ]; then
    echo "  🛑 LOW MEMORY: ${MEM_AFTER}MB. Aborting."
    pkill -9 -f "daemon/main" 2>/dev/null || true
    pkill -9 -f "typescript-language-server" 2>/dev/null || true
    break
  fi

  echo ""
done

echo "=== TOTAL: pass:$TOTAL_PASS fail:$TOTAL_FAIL skip:$TOTAL_SKIP ==="
echo "=== finished at $(date -Iseconds) ==="
