#!/usr/bin/env bash
# gh-actions-status.sh - GitHub Actions status checker (rate-limit-free)
# HTML スクレイピング経由で最新の workflow run 情報を取得

set -euo pipefail

usage() {
  cat <<EOF
Usage: $0 [OPTIONS]

Options:
  --repo OWNER/REPO       Repository (default: ihasq/radius)
  --workflow NAME         Workflow file name (default: test.yml)
  --run-id ID            Specific run ID (if not provided, fetches latest)
  --jobs                 Show jobs status
  --logs                 Download logs (requires run-id)
  --help                 Show this help

Examples:
  # Get latest run ID
  $0

  # Get jobs for latest run
  $0 --jobs

  # Download logs for specific run
  $0 --run-id 26202779500 --logs

  # Check different repo
  $0 --repo anthropics/anthropic-sdk-python --workflow test.yml
EOF
  exit 0
}

REPO="ihasq/radius"
WORKFLOW="test.yml"
RUN_ID=""
SHOW_JOBS=false
DOWNLOAD_LOGS=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo)
      REPO="$2"
      shift 2
      ;;
    --workflow)
      WORKFLOW="$2"
      shift 2
      ;;
    --run-id)
      RUN_ID="$2"
      shift 2
      ;;
    --jobs)
      SHOW_JOBS=true
      shift
      ;;
    --logs)
      DOWNLOAD_LOGS=true
      shift
      ;;
    --help)
      usage
      ;;
    *)
      echo "Unknown option: $1"
      usage
      ;;
  esac
done

# 最新の run ID を取得（HTML スクレイピング）
get_latest_run_id() {
  local repo="$1"
  local workflow="$2"
  local url="https://github.com/${repo}/actions/workflows/${workflow}"

  curl -sL "$url" | grep -oE 'runs/[0-9]+' | head -1 | cut -d/ -f2
}

# Run ID が指定されていない場合は最新を取得
if [[ -z "$RUN_ID" ]]; then
  echo "Fetching latest run ID..." >&2
  RUN_ID=$(get_latest_run_id "$REPO" "$WORKFLOW")

  if [[ -z "$RUN_ID" ]]; then
    echo "Error: Could not fetch run ID" >&2
    exit 1
  fi
fi

echo "Run ID: $RUN_ID"
echo "Web UI: https://github.com/${REPO}/actions/runs/${RUN_ID}"
echo ""

# Jobs 情報を表示
if [[ "$SHOW_JOBS" == true ]]; then
  echo "Fetching jobs status..." >&2

  # Rate limit を避けるため HTML から取得を試みる
  # API が使える場合は API を使用
  if curl -s "https://api.github.com/repos/${REPO}/actions/runs/${RUN_ID}/jobs" | grep -q "API rate limit"; then
    echo "Warning: API rate limited, showing web URL only" >&2
    echo "Jobs URL: https://github.com/${REPO}/actions/runs/${RUN_ID}"
  else
    # API が使える場合は JSON を整形して表示
    curl -s "https://api.github.com/repos/${REPO}/actions/runs/${RUN_ID}/jobs" | \
      python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    for job in data.get('jobs', []):
        status = job.get('conclusion', job.get('status', 'unknown'))
        name = job.get('name', 'unnamed')
        symbol = '✅' if status == 'success' else '❌' if status == 'failure' else '⏳' if status == 'in_progress' else '⊘'
        print(f'{symbol} {name}: {status}')
except:
    print('Error parsing JSON', file=sys.stderr)
    sys.exit(1)
"
  fi
fi

# ログをダウンロード
if [[ "$DOWNLOAD_LOGS" == true ]]; then
  OUTPUT="ci-logs-${RUN_ID}.zip"
  echo "Downloading logs to ${OUTPUT}..." >&2

  if curl -sL "https://api.github.com/repos/${REPO}/actions/runs/${RUN_ID}/logs" -o "$OUTPUT"; then
    # ZIP ファイルかどうか確認
    if file "$OUTPUT" | grep -q "Zip archive"; then
      echo "✅ Logs downloaded: ${OUTPUT}"
      echo "Extract with: unzip ${OUTPUT}"
    else
      echo "❌ Download failed (possibly rate limited or authentication required)"
      cat "$OUTPUT"
      rm -f "$OUTPUT"
      exit 1
    fi
  else
    echo "❌ Download failed"
    exit 1
  fi
fi
