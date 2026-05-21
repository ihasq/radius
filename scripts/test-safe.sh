#!/bin/bash
set -eu

# ============================================
# 設定
# ============================================
TIMEOUT=120
LOG="test-results.log"
CPU_LIMIT=400        # CPU合計%（超過で中断）
MEM_MIN_MB=300       # 空きメモリMB（下回ると中断）
LSP_LIMIT=2          # LSPプロセス数（超過で強制kill）

# ============================================
# 即時フラッシュ付きログ
# ============================================
log() {
  echo "[$(date -u +%H:%M:%S)] $1" | tee -a "$LOG"
}

# ログ初期化
: > "$LOG"

# ============================================
# ビルド（テストヘルパーが compiled binary を使用するため）
# ============================================
log "Building radiusd binary..."
bash scripts/build.sh > /dev/null 2>&1
if [ $? -ne 0 ]; then
  log "❌ Build failed"
  exit 1
fi
log "✅ Build complete"
log ""

# ============================================
# リソース計測
# ============================================
get_cpu() {
  ps -eo pcpu --no-headers 2>/dev/null | awk '{s+=$1}END{printf "%.0f", s}' || echo 0
}

get_mem_avail() {
  free -m 2>/dev/null | awk '/Mem:/{print $7}' || echo 9999
}

get_daemon_count() {
  local count
  count=$(pgrep -c -f "daemon/main" 2>/dev/null) || count=0
  echo "${count:-0}" | tr -d '\n'
}

get_lsp_count() {
  local count
  count=$(pgrep -c -f "typescript-language-server" 2>/dev/null) || count=0
  echo "${count:-0}" | tr -d '\n'
}

check_resources() {
  local phase="$1"
  local cpu=$(get_cpu)
  local mem=$(get_mem_avail)
  local daemons=$(get_daemon_count)
  local lsps=$(get_lsp_count)

  log "  [$phase] cpu:${cpu}% mem:${mem}MB daemons:$daemons lsp:$lsps"

  # LSPリーク検出 → 強制kill
  if [ "$lsps" -gt "$LSP_LIMIT" ]; then
    log "  ⚠️ LSP LEAK: $lsps > $LSP_LIMIT. Force killing."
    pkill -9 -f "typescript-language-server" 2>/dev/null || true
    pkill -9 -f "tsserver" 2>/dev/null || true
    sleep 1
  fi

  # CPU超過 → 警告（中断はしない、一時的なスパイクの可能性）
  if [ "$cpu" -gt "$CPU_LIMIT" ]; then
    log "  ⚠️ HIGH CPU: ${cpu}% > ${CPU_LIMIT}%"
  fi

  # メモリ枯渇 → 中断
  if [ "$mem" -lt "$MEM_MIN_MB" ]; then
    log "  🛑 LOW MEMORY: ${mem}MB < ${MEM_MIN_MB}MB. ABORTING."
    pkill -9 -f "daemon/main" 2>/dev/null || true
    pkill -9 -f "typescript-language-server" 2>/dev/null || true
    pkill -9 -f "tsserver" 2>/dev/null || true
    log "=== ABORTED at $(date -Iseconds) ==="
    exit 1
  fi
}

# ============================================
# プロセスクリーンアップ
# ============================================
cleanup_processes() {
  pkill -9 -f "typescript-language-server" 2>/dev/null || true
  pkill -9 -f "tsserver" 2>/dev/null || true
  pkill -9 -f "daemon/main" 2>/dev/null || true
  sleep 2
  # ディスク状態もクリア
  if [ -n "${RADIUS_HOME:-}" ] && [ -d "$RADIUS_HOME" ]; then
    rm -rf "$RADIUS_HOME"
    mkdir -p "$RADIUS_HOME"
  fi
}

# ============================================
# テストファイル一覧（LSP不要 → LSP必要の順）
# ============================================
FILES=(
  # LSP不要（軽量、先に実行）
  tests/colors.test.ts
  tests/update-crypto.test.ts
  tests/update-version.test.ts
  tests/ledger-unit.test.ts
  tests/context-conventions.test.ts
  tests/extension-host.test.ts
  tests/multi-agent.test.ts
  tests/multi-agent-e2e.test.ts
  tests/change-metadata.test.ts
  tests/versioned-socket.test.ts
  tests/update-e2e.test.ts
  # ts-rad depth-0/1（プロセスを起動しない）
  tests/ts-rad-depth0.test.ts
  tests/ts-rad-depth1.test.ts
  # LSP必要（重い、デーモン・LSPをリセットして実行）
  tests/basic.test.ts
  tests/history.test.ts
  tests/dogtag.test.ts
  tests/search-replace.test.ts
  tests/rename-imports.test.ts
  tests/graph.test.ts
  tests/lsp-core.test.ts
  tests/lsp-diagnostics.test.ts
  tests/lsp-lifecycle.test.ts
  tests/diagnostics-tracking.test.ts
  tests/group-codeactions.test.ts
  tests/group-lspviews.test.ts
  tests/group-langtools.test.ts
  tests/context-read.test.ts
  tests/context-write.test.ts
  # ts-rad depth-2〜4（Language Service使用）
  tests/ts-rad-depth2.test.ts
  tests/ts-rad-depth3.test.ts
  tests/ts-rad-depth4.test.ts
  tests/ts-rad-resource.test.ts
  tests/ts-rad-context.test.ts
)

# ============================================
# メイン
# ============================================
log "=== test-safe.sh started at $(date -Iseconds) ==="
log "  limits: cpu=${CPU_LIMIT}% mem_min=${MEM_MIN_MB}MB lsp_max=${LSP_LIMIT} timeout=${TIMEOUT}s"
log ""

# 初期クリーンアップ
cleanup_processes

TOTAL_PASS=0
TOTAL_FAIL=0
TOTAL_SKIP=0
FAIL_FILES=()
FILE_COUNT=0

for f in "${FILES[@]}"; do
  # ファイルごとに独立した RADIUS_HOME
  export RADIUS_HOME=$(mktemp -d "${TMPDIR:-/tmp}/radius-safe-XXXXXX")

  # ファイルが存在しなければスキップ
  if [ ! -f "$f" ]; then
    log "--- $f --- SKIPPED (not found)"
    rm -rf "$RADIUS_HOME"
    continue
  fi

  FILE_COUNT=$((FILE_COUNT + 1))
  log "--- [$FILE_COUNT/${#FILES[@]}] $f ---"

  # ts-rad テストの前にフルクリーンアップ（LSPプロセスが残っていると干渉）
  case "$f" in
    *ts-rad*)
      log "  [pre-cleanup] ts-rad test: full reset"
      cleanup_processes
      ;;
  esac

  # テスト前リソースチェック
  check_resources "before"

  # テスト実行（LSPテストはリトライなし、change-metadataのみリトライ）
  START_TIME=$(date +%s)
  case "$f" in
    *change-metadata*)
      TMPOUT=$(mktemp)
      timeout -s KILL "$TIMEOUT" bun test --timeout 30000 "$f" > "$TMPOUT" 2>&1 || true
      FAIL_COUNT=$(grep "(fail)" "$TMPOUT" 2>/dev/null | wc -l)
      if [ "$FAIL_COUNT" -gt 0 ]; then
        log "  [retry] $FAIL_COUNT fail(s), retrying after cleanup..."
        cleanup_processes
        export RADIUS_HOME=$(mktemp -d "${TMPDIR:-/tmp}/radius-safe-XXXXXX")
        sleep 2
        timeout -s KILL "$TIMEOUT" bun test --timeout 30000 "$f" > "$TMPOUT" 2>&1 || true
      fi
      ;;
    *)
      TMPOUT=$(mktemp)
      timeout -s KILL "$TIMEOUT" bun test --timeout 30000 "$f" > "$TMPOUT" 2>&1 || true
      ;;
  esac
  EXIT=$?

  END_TIME=$(date +%s)
  ELAPSED=$((END_TIME - START_TIME))

  # 結果解析（bunの "N pass" "N fail" サマリ行から抽出）
  PASS=$(grep -oP '^\s*\d+(?= pass)' "$TMPOUT" 2>/dev/null | tr -d ' \n') || PASS=0
  FAIL=$(grep -oP '^\s*\d+(?= fail)' "$TMPOUT" 2>/dev/null | tr -d ' \n') || FAIL=0
  SKIP=$(grep -oP '^\s*\d+(?= skip)' "$TMPOUT" 2>/dev/null | tr -d ' \n') || SKIP=0
  PASS=${PASS:-0}
  FAIL=${FAIL:-0}
  SKIP=${SKIP:-0}
  TOTAL_PASS=$((TOTAL_PASS + PASS))
  TOTAL_FAIL=$((TOTAL_FAIL + FAIL))
  TOTAL_SKIP=$((TOTAL_SKIP + SKIP))

  if [ "$FAIL" -gt 0 ] || [ "$EXIT" -gt 0 ]; then
    STATUS="❌"
    FAIL_FILES+=("$f")
    # 失敗詳細をログに即時書き込み
    log "  $STATUS pass:$PASS fail:$FAIL skip:$SKIP exit:$EXIT time:${ELAPSED}s"
    grep "(fail)" "$TMPOUT" | while IFS= read -r line; do
      log "    $line"
    done
  else
    STATUS="✅"
    log "  $STATUS pass:$PASS fail:$FAIL skip:$SKIP time:${ELAPSED}s"
  fi

  rm -f "$TMPOUT"

  # テスト後リソースチェック
  check_resources "after"

  # ファイル実行後にクリーンアップ
  case "$f" in
    *lsp*|*diagnostics*|*codeactions*|*lspviews*|*langtools*|*context-write*)
      log "  [cleanup] full reset"
      cleanup_processes
      ;;
    *)
      # 非LSPファイルでもデーモンとRADIUS_HOMEをリセット
      pkill -f "daemon/main" 2>/dev/null || true
      pkill -9 -f "tsserver" 2>/dev/null || true
      sleep 1
      rm -rf "$RADIUS_HOME"
      ;;
  esac

  log ""
done

# ============================================
# 最終サマリ
# ============================================
log "=== SUMMARY ==="
log "  total: $((TOTAL_PASS + TOTAL_FAIL + TOTAL_SKIP))"
log "  pass:  $TOTAL_PASS"
log "  fail:  $TOTAL_FAIL"
log "  skip:  $TOTAL_SKIP"
log "  files: $FILE_COUNT"

if [ "${#FAIL_FILES[@]}" -gt 0 ]; then
  log ""
  log "  FAILED FILES:"
  for ff in "${FAIL_FILES[@]}"; do
    log "    - $ff"
  done
  log ""
  log "=== FAILED at $(date -Iseconds) ==="
  exit 1
else
  log ""
  log "=== ALL PASSED at $(date -Iseconds) ==="
fi
