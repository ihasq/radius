#!/bin/sh
set -eu

# Radius installer / upgrader
# Usage: curl -fsSL https://radius-ai.pages.dev/install.sh | sh
#
# Installs the CDN-based auto-update wrapper (radiusd.sh) and forces an
# immediate upgrade to the latest release from latest.json.

CDN_BASE="${RADIUS_CDN_BASE:-https://radius-ai.pages.dev}"
CDN_URL="${RADIUS_CDN_URL:-$CDN_BASE/release}"
RADIUS_HOME="${RADIUS_HOME:-$HOME/.radius}"
INSTALL_DIR="${RADIUS_INSTALL_DIR:-$RADIUS_HOME/bin}"

info()  { printf "\033[1;34m[radius]\033[0m %s\n" "$1"; }
error() { printf "\033[1;31m[radius]\033[0m %s\n" "$1" >&2; exit 1; }

check_deps() {
  if ! command -v curl >/dev/null 2>&1; then
    error "curl is required but not installed. Install it with your package manager and retry."
  fi
}

detect_platform() {
  case "$(uname -s)" in
    Linux*)  OS="linux" ;;
    Darwin*) OS="darwin" ;;
    MINGW*|MSYS*|CYGWIN*)
      printf "\033[1;31m[radius]\033[0m %s\n" "Detected Windows shell. Use PowerShell instead:" >&2
      printf "\033[1;31m[radius]\033[0m %s\n" "  irm https://radius-ai.pages.dev/install.ps1 | iex" >&2
      exit 1
      ;;
    *) error "Unsupported OS: $(uname -s)" ;;
  esac

  case "$(uname -m)" in
    x86_64|amd64)  ARCH="x64" ;;
    arm64|aarch64) ARCH="arm64" ;;
    *) error "Unsupported architecture: $(uname -m)" ;;
  esac

  PLATFORM="${OS}-${ARCH}"
}

stop_daemon() {
  if [ -x "$INSTALL_DIR/radiusd" ]; then
    RADIUS_HOME="$RADIUS_HOME" "$INSTALL_DIR/radiusd" --exec daemon stop 2>/dev/null || true
    return
  fi
  if [ -x "$RADIUS_HOME/bin/current/core" ]; then
    RADIUS_HOME="$RADIUS_HOME" "$RADIUS_HOME/bin/current/core" --exec daemon stop 2>/dev/null || true
  fi
}

remove_legacy_binary() {
  # Legacy installs placed a compiled ELF/Mach-O binary directly at INSTALL_DIR/radiusd.
  if [ ! -f "$INSTALL_DIR/radiusd" ]; then
    return
  fi
  if head -n 1 "$INSTALL_DIR/radiusd" 2>/dev/null | grep -q '^#!/bin/sh'; then
    return
  fi
  info "Removing legacy flat radiusd binary..."
  rm -f "$INSTALL_DIR/radiusd"
}

install_wrapper() {
  info "Installing auto-update wrapper to ${INSTALL_DIR}..."
  mkdir -p "$INSTALL_DIR"

  if ! curl -fsSL "$CDN_BASE/radiusd.sh" -o "$INSTALL_DIR/radiusd"; then
    error "Failed to download radiusd.sh from $CDN_BASE"
  fi
  chmod +x "$INSTALL_DIR/radiusd"

  cat > "$INSTALL_DIR/radius" << 'EOF'
#!/bin/sh
DIR="$(cd "$(dirname "$0")" && pwd)"
exec "$DIR/radiusd" --exec "$@"
EOF
  chmod +x "$INSTALL_DIR/radius"
}

force_upgrade() {
  info "Upgrading to latest release from CDN..."
  if ! RADIUS_HOME="$RADIUS_HOME" RADIUS_CDN_URL="$CDN_URL" "$INSTALL_DIR/radiusd" upgrade; then
    error "Upgrade failed. Check your network connection and try again."
  fi
}

setup_path() {
  if echo "$PATH" | tr ':' '\n' | grep -qxF "$INSTALL_DIR"; then
    return
  fi

  LINE="export PATH=\"${INSTALL_DIR}:\$PATH\""
  SHELL_NAME="$(basename "${SHELL:-/bin/sh}")"

  case "$SHELL_NAME" in
    bash)
      if [ -f "$HOME/.bashrc" ]; then RC_FILE="$HOME/.bashrc"
      else RC_FILE="$HOME/.bash_profile"; fi
      ;;
    zsh)  RC_FILE="$HOME/.zshrc" ;;
    fish)
      mkdir -p "$HOME/.config/fish"
      RC_FILE="$HOME/.config/fish/config.fish"
      LINE="set -gx PATH ${INSTALL_DIR} \$PATH"
      ;;
    *)    RC_FILE="" ;;
  esac

  if [ -n "$RC_FILE" ]; then
    if ! grep -qF "$INSTALL_DIR" "$RC_FILE" 2>/dev/null; then
      echo "" >> "$RC_FILE"
      echo "# Radius" >> "$RC_FILE"
      echo "$LINE" >> "$RC_FILE"
      info "Added ${INSTALL_DIR} to PATH in ${RC_FILE}"
    fi
  fi
}

main() {
  check_deps
  detect_platform
  stop_daemon
  remove_legacy_binary
  install_wrapper
  force_upgrade
  setup_path

  info "Radius installed/upgraded successfully."
  info ""
  info "  radius --help"
  info "  radius upgrade    # force update anytime"
  info ""
  if ! command -v radius >/dev/null 2>&1; then
    info "Restart your shell or run:"
    info "  export PATH=\"${INSTALL_DIR}:\$PATH\""
  fi
}

main
