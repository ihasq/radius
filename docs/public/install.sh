#!/bin/sh
set -eu

# Radius installer
# Usage: curl -fsSL https://radius-ai.pages.dev/install.sh | sh

REPO="ihasq/radius"
INSTALL_DIR="${RADIUS_INSTALL_DIR:-$HOME/.radius/bin}"

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

get_latest_version() {
  VERSION=$(curl -fsSI "https://github.com/${REPO}/releases/latest" | grep -i "^location:" | grep -oE '[^/]+$' | tr -d '\r\n')
  if [ -z "$VERSION" ]; then
    error "Failed to fetch latest version from GitHub."
  fi
}

download_and_install() {
  ARCHIVE="radius-${PLATFORM}.tar.gz"
  URL="https://github.com/${REPO}/releases/download/${VERSION}/${ARCHIVE}"
  TMPDIR=$(mktemp -d)
  trap 'rm -rf "$TMPDIR"' EXIT

  info "Downloading Radius ${VERSION} for ${PLATFORM}..."
  if ! curl -fsSL "$URL" -o "${TMPDIR}/${ARCHIVE}"; then
    error "Download failed. No release found for ${PLATFORM} at ${VERSION}."
  fi

  info "Extracting..."
  tar xzf "${TMPDIR}/${ARCHIVE}" -C "$TMPDIR"

  info "Installing to ${INSTALL_DIR}..."
  mkdir -p "$INSTALL_DIR"
  cp "${TMPDIR}/radiusd-${PLATFORM}" "${INSTALL_DIR}/radiusd"
  chmod +x "${INSTALL_DIR}/radiusd"

  # Create radius shell script wrapper
  cat > "${INSTALL_DIR}/radius" << 'EOF'
#!/bin/sh
DIR="$(cd "$(dirname "$0")" && pwd)"
exec "$DIR/radiusd" --exec "$@"
EOF
  chmod +x "${INSTALL_DIR}/radius"

  # Stop existing daemon (if running)
  "$INSTALL_DIR/radiusd" --exec daemon stop 2>/dev/null || true
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
  get_latest_version
  download_and_install
  setup_path

  info "Radius ${VERSION} installed successfully."
  info ""
  info "  radius --help"
  info ""
  if ! command -v radius >/dev/null 2>&1; then
    info "Restart your shell or run:"
    info "  export PATH=\"${INSTALL_DIR}:\$PATH\""
  fi
}

main
