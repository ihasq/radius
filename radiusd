#!/bin/sh
set -eu

# Constants
DEFAULT_CDN_URL="https://radius-ai.pages.dev/release"
CDN_URL="${RADIUS_CDN_URL:-$DEFAULT_CDN_URL}"
RADIUS_HOME="${RADIUS_HOME:-$HOME/.radius}"
BIN_DIR="$RADIUS_HOME/bin"
CURRENT_LINK="$BIN_DIR/current"
CORE_BIN="$CURRENT_LINK/core"
LAST_CHECK="$RADIUS_HOME/last-update-check"
CHECK_INTERVAL=43200  # 12 hours (seconds)

# ---------------------
# Utilities
# ---------------------

log() { printf "[radiusd] %s\n" "$1" >&2; }
err() { printf "[radiusd] error: %s\n" "$1" >&2; exit 1; }

detect_platform() {
  case "$(uname -s)" in
    Linux*)  OS="linux" ;;
    Darwin*) OS="darwin" ;;
    *) err "Unsupported OS: $(uname -s)" ;;
  esac
  case "$(uname -m)" in
    x86_64|amd64)  ARCH="x64" ;;
    arm64|aarch64) ARCH="arm64" ;;
    *) err "Unsupported architecture: $(uname -m)" ;;
  esac
  PLATFORM="${OS}-${ARCH}"
}

# ---------------------
# Download and Verify
# ---------------------

download_and_install() {
  # Fetch latest.json
  LATEST_JSON=$(curl -fsSL "$CDN_URL/latest.json") || err "download failed: cannot fetch latest.json"

  # Parse (POSIX sh without jq)
  RELEASE_HASH=$(printf '%s' "$LATEST_JSON" | grep -o '"hash"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | cut -d'"' -f4)
  # Collapse JSON to single line for reliable parsing
  COLLAPSED_JSON=$(printf '%s' "$LATEST_JSON" | tr -d '\n' | tr -s ' ')
  ASSET_URL=$(printf '%s' "$COLLAPSED_JSON" | sed -n 's/.*"'"$PLATFORM"'"[^}]*"url"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
  ASSET_SHA256=$(printf '%s' "$COLLAPSED_JSON" | sed -n 's/.*"'"$PLATFORM"'"[^}]*"sha256"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')

  if [ -z "$RELEASE_HASH" ] || [ -z "$ASSET_URL" ]; then
    err "download failed: invalid latest.json or unsupported platform $PLATFORM"
  fi

  # Check if already installed
  RELEASE_DIR="$BIN_DIR/$RELEASE_HASH"
  if [ -f "$RELEASE_DIR/core" ]; then
    update_current_link "$RELEASE_HASH"
    return 0
  fi

  # Download binary
  TMPDIR=$(mktemp -d)
  trap 'rm -rf "$TMPDIR"' EXIT

  GZ_PATH="$TMPDIR/core.gz"
  SIG_PATH="$TMPDIR/core.gz.sig"
  PUB_PATH="$TMPDIR/pub.json"

  curl -fsSL "$CDN_URL/$ASSET_URL" -o "$GZ_PATH" || err "download failed: $ASSET_URL"
  curl -fsSL "$CDN_URL/${ASSET_URL}.sig" -o "$SIG_PATH" || err "download failed: ${ASSET_URL}.sig"
  curl -fsSL "$CDN_URL/pub.json" -o "$PUB_PATH" || err "download failed: pub.json"

  # SHA256 verification
  if command -v sha256sum >/dev/null 2>&1; then
    ACTUAL_SHA256=$(sha256sum "$GZ_PATH" | cut -d' ' -f1)
  elif command -v shasum >/dev/null 2>&1; then
    ACTUAL_SHA256=$(shasum -a 256 "$GZ_PATH" | cut -d' ' -f1)
  else
    err "no sha256 tool available"
  fi

  if [ "$ACTUAL_SHA256" != "$ASSET_SHA256" ]; then
    err "integrity check failed: SHA256 mismatch"
  fi

  # Signature verification
  verify_signature "$GZ_PATH" "$SIG_PATH" "$PUB_PATH" || err "signature verification failed"

  # Extract and install
  mkdir -p "$RELEASE_DIR"
  gunzip -c "$GZ_PATH" > "$RELEASE_DIR/core"
  chmod +x "$RELEASE_DIR/core"

  update_current_link "$RELEASE_HASH"
  log "installed: $RELEASE_HASH"
}

verify_signature() {
  GZ_FILE="$1"
  SIG_FILE="$2"
  PUB_FILE="$3"

  # Use existing core binary for verification if available
  if [ -f "$CORE_BIN" ]; then
    "$CORE_BIN" --verify-signature "$GZ_FILE" "$SIG_FILE" "$PUB_FILE"
    return $?
  fi

  # First install - no verifier available, trust the download
  # (CDN is HTTPS, SHA256 verified)
  log "warning: signature verification skipped (no verifier available)"
  return 0
}

update_current_link() {
  HASH="$1"
  mkdir -p "$BIN_DIR"
  rm -f "$CURRENT_LINK"
  ln -s "$BIN_DIR/$HASH" "$CURRENT_LINK"
}

# ---------------------
# Update Check
# ---------------------

maybe_check_update() {
  # Skip if no binary exists (initial install handled by download_and_install)
  [ -f "$CORE_BIN" ] || return 0

  # Skip if last-update-check mtime is within CHECK_INTERVAL
  if [ -f "$LAST_CHECK" ]; then
    if command -v stat >/dev/null 2>&1; then
      # Try GNU stat first, then BSD stat
      LAST_MTIME=$(stat -c %Y "$LAST_CHECK" 2>/dev/null || stat -f %m "$LAST_CHECK" 2>/dev/null || echo 0)
    else
      LAST_MTIME=0
    fi
    NOW=$(date +%s)
    ELAPSED=$((NOW - LAST_MTIME))
    if [ "$ELAPSED" -lt "$CHECK_INTERVAL" ]; then
      return 0
    fi
  fi

  # Background update check
  (background_update) &
}

background_update() {
  LATEST_JSON=$(curl -fsSL --max-time 10 "$CDN_URL/latest.json" 2>/dev/null) || return 0
  RELEASE_HASH=$(printf '%s' "$LATEST_JSON" | grep -o '"hash"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | cut -d'"' -f4)

  [ -z "$RELEASE_HASH" ] && return 0

  # Check if already installed
  if [ -d "$BIN_DIR/$RELEASE_HASH" ]; then
    touch "$LAST_CHECK"
    return 0
  fi

  # Download new version
  detect_platform
  # Collapse JSON to single line for reliable parsing
  COLLAPSED_JSON=$(printf '%s' "$LATEST_JSON" | tr -d '\n' | tr -s ' ')
  ASSET_URL=$(printf '%s' "$COLLAPSED_JSON" | sed -n 's/.*"'"$PLATFORM"'"[^}]*"url"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
  ASSET_SHA256=$(printf '%s' "$COLLAPSED_JSON" | sed -n 's/.*"'"$PLATFORM"'"[^}]*"sha256"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')

  [ -z "$ASSET_URL" ] && return 0

  TMPDIR=$(mktemp -d)
  GZ_PATH="$TMPDIR/core.gz"
  SIG_PATH="$TMPDIR/core.gz.sig"
  PUB_PATH="$TMPDIR/pub.json"

  curl -fsSL --max-time 60 "$CDN_URL/$ASSET_URL" -o "$GZ_PATH" 2>/dev/null || { rm -rf "$TMPDIR"; return 0; }
  curl -fsSL --max-time 10 "$CDN_URL/${ASSET_URL}.sig" -o "$SIG_PATH" 2>/dev/null || { rm -rf "$TMPDIR"; return 0; }
  curl -fsSL --max-time 10 "$CDN_URL/pub.json" -o "$PUB_PATH" 2>/dev/null || { rm -rf "$TMPDIR"; return 0; }

  # SHA256 verification
  if command -v sha256sum >/dev/null 2>&1; then
    ACTUAL_SHA256=$(sha256sum "$GZ_PATH" | cut -d' ' -f1)
  elif command -v shasum >/dev/null 2>&1; then
    ACTUAL_SHA256=$(shasum -a 256 "$GZ_PATH" | cut -d' ' -f1)
  else
    rm -rf "$TMPDIR"
    return 0
  fi

  if [ "$ACTUAL_SHA256" != "$ASSET_SHA256" ]; then
    rm -rf "$TMPDIR"
    return 0
  fi

  # Signature verification
  if [ -f "$CORE_BIN" ]; then
    "$CORE_BIN" --verify-signature "$GZ_PATH" "$SIG_PATH" "$PUB_PATH" 2>/dev/null || { rm -rf "$TMPDIR"; return 0; }
  fi

  # Extract and install
  RELEASE_DIR="$BIN_DIR/$RELEASE_HASH"
  mkdir -p "$RELEASE_DIR"
  gunzip -c "$GZ_PATH" > "$RELEASE_DIR/core"
  chmod +x "$RELEASE_DIR/core"

  update_current_link "$RELEASE_HASH"
  touch "$LAST_CHECK"

  rm -rf "$TMPDIR"
}

# ---------------------
# Main
# ---------------------

main() {
  # --upgrade: Force update check
  if [ "${1:-}" = "--upgrade" ] || [ "${1:-}" = "upgrade" ]; then
    detect_platform
    LATEST_JSON=$(curl -fsSL "$CDN_URL/latest.json") || err "download failed: cannot fetch latest.json"
    RELEASE_HASH=$(printf '%s' "$LATEST_JSON" | grep -o '"hash"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | cut -d'"' -f4)
    VERSION=$(printf '%s' "$LATEST_JSON" | grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | cut -d'"' -f4)

    CURRENT_HASH=""
    if [ -L "$CURRENT_LINK" ]; then
      CURRENT_HASH=$(basename "$(readlink "$CURRENT_LINK")")
    fi

    if [ "$CURRENT_HASH" = "$RELEASE_HASH" ]; then
      printf "[radiusd] already up to date (%s)\n" "$VERSION"
      exit 0
    fi

    download_and_install
    printf "[radiusd] updated to %s (%s)\n" "$VERSION" "$RELEASE_HASH"
    exit 0
  fi

  detect_platform

  # Download if binary doesn't exist
  if [ ! -f "$CORE_BIN" ]; then
    download_and_install
  fi

  # Background update check
  maybe_check_update

  # --exec mode: just run the command without daemon
  if [ "${1:-}" = "--exec" ]; then
    shift
    exec "$CORE_BIN" --exec "$@"
  fi

  # Execute binary
  exec "$CORE_BIN" "$@"
}

main "$@"
