#!/bin/bash
set -eu

MAX_PARALLEL=${RADIUS_TEST_PARALLEL:-4}
TIMEOUT=60000

TEST_GROUPS=(
  "tests/update-crypto.test.ts tests/update-version.test.ts tests/ledger-unit.test.ts tests/colors.test.ts"
  "tests/basic.test.ts tests/history.test.ts tests/dogtag.test.ts"
  "tests/lsp-core.test.ts tests/lsp-diagnostics.test.ts tests/lsp-lifecycle.test.ts tests/diagnostics-tracking.test.ts"
  "tests/extension-host.test.ts tests/openvsx.test.ts"
  "tests/search-replace.test.ts tests/rename-imports.test.ts tests/graph.test.ts"
  "tests/group-codeactions.test.ts tests/group-lspviews.test.ts tests/group-langtools.test.ts"
  "tests/multi-agent.test.ts tests/multi-agent-e2e.test.ts tests/change-metadata.test.ts"
  "tests/update-e2e.test.ts"
)

GROUP_NAMES=(unit basic lsp extensions commands codeactions multiagent update-e2e)

LOGDIR=$(mktemp -d)
trap 'rm -rf "$LOGDIR"' EXIT

echo "[parallel] ${#TEST_GROUPS[@]} groups, max $MAX_PARALLEL concurrent"

# バッチ実行
i=0
while [ "$i" -lt "${#TEST_GROUPS[@]}" ]; do
  PIDS=()
  j=0

  while [ "$j" -lt "$MAX_PARALLEL" ] && [ "$((i + j))" -lt "${#TEST_GROUPS[@]}" ]; do
    idx=$((i + j))
    LOG="$LOGDIR/${GROUP_NAMES[$idx]}.log"
    bun test --timeout "$TIMEOUT" ${TEST_GROUPS[$idx]} >"$LOG" 2>&1 &
    PIDS+=($!)
    echo "[parallel]   started: ${GROUP_NAMES[$idx]} (pid $!)"
    j=$((j + 1))
  done

  for pid in "${PIDS[@]}"; do
    wait "$pid" 2>/dev/null || true
  done

  i=$((i + j))
done

# 集計
echo ""
echo "=== Results ==="

TOTAL_PASS=0
TOTAL_FAIL=0
TOTAL_SKIP=0
FAIL_LIST=()

for idx in "${!GROUP_NAMES[@]}"; do
  LOG="$LOGDIR/${GROUP_NAMES[$idx]}.log"
  # bun test summary format: " N pass", " N fail", " N skip"
  PASS=$(grep -oE '^ [0-9]+ pass' "$LOG" 2>/dev/null | awk '{print $1}' || echo 0)
  FAIL=$(grep -oE '^ [0-9]+ fail' "$LOG" 2>/dev/null | awk '{print $1}' || echo 0)
  SKIP=$(grep -oE '^ [0-9]+ skip' "$LOG" 2>/dev/null | awk '{print $1}' || echo 0)
  PASS=${PASS:-0}
  FAIL=${FAIL:-0}
  SKIP=${SKIP:-0}

  TOTAL_PASS=$((TOTAL_PASS + PASS))
  TOTAL_FAIL=$((TOTAL_FAIL + FAIL))
  TOTAL_SKIP=$((TOTAL_SKIP + SKIP))

  if [ "$FAIL" -gt 0 ]; then
    STATUS="❌"
    FAIL_LIST+=("${GROUP_NAMES[$idx]}")
  else
    STATUS="✅"
  fi

  printf "  %s %-15s pass:%3s fail:%3s skip:%3s\n" "$STATUS" "${GROUP_NAMES[$idx]}" "$PASS" "$FAIL" "$SKIP"
done

echo ""
echo "total: $((TOTAL_PASS + TOTAL_FAIL + TOTAL_SKIP))  pass: $TOTAL_PASS  fail: $TOTAL_FAIL  skip: $TOTAL_SKIP"

if [ "${#FAIL_LIST[@]}" -gt 0 ]; then
  echo ""
  echo "--- Failure details ---"
  for name in "${FAIL_LIST[@]}"; do
    echo ""
    echo "=== $name ==="
    # Show errors and test failures
    grep -E "(error|Error|FAIL|fail:)" "$LOGDIR/$name.log" | head -30 || true
  done
  exit 1
fi
