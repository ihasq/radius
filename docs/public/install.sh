#!/usr/bin/env bash
set -euo pipefail

# Radius installer
# Usage: curl -fsSL https://radius-ai.pages.dev/install.sh | bash

REPO="ihasq/radius"
INSTALL_DIR="${RADIUS_INSTALL_DIR:-$HOME/.radius/bin}"

info()  { printf "\033[1;34m[radius]\033[0m %s\n" "$1"; }
error() { printf "\033[1;31m[radius]\033[0m %s\n" "$1" >&2; exit 1; }

check_deps() {
  if ! command -v curl &>/dev/null; then
    error "curl is required but not installed. Install it with your package manager and retry."
  fi
}

detect_platform() {
  local os arch

  case "$(uname -s)" in
    Linux*)  os="linux" ;;
    Darwin*) os="darwin" ;;
    MINGW*|MSYS*|CYGWIN*) os="win" ;;
    *) error "Unsupported OS: $(uname -s). Use install.ps1 for Windows." ;;
  esac

  case "$(uname -m)" in
    x86_64|amd64)  arch="x64" ;;
    arm64|aarch64) arch="arm64" ;;
    *) error "Unsupported architecture: $(uname -m)" ;;
  esac

  if [ "$os" = "win" ]; then
    printf "\033[1;31m[radius]\033[0m %s\n" "Detected Windows shell. Use PowerShell instead:" >&2
    printf "\033[1;31m[radius]\033[0m %s\n" '  irm https://radius-ai.pages.dev/install.ps1 | iex' >&2
    exit 1
  fi

  PLATFORM="${os}-${arch}"
}

get_latest_version() {
  local url="https://api.github.com/repos/${REPO}/releases/latest"
  VERSION=$(curl -fsSL "$url" | grep -m1 '"tag_name"' | cut -d'"' -f4)
  if [ -z "$VERSION" ]; then
    error "Failed to fetch latest version from GitHub."
  fi
}

download_and_install() {
  local archive="radius-${PLATFORM}.tar.gz"
  local url="https://github.com/${REPO}/releases/download/${VERSION}/${archive}"
  local tmpdir
  tmpdir=$(mktemp -d)
  trap 'rm -rf "$tmpdir"' EXIT

  info "Downloading Radius ${VERSION} for ${PLATFORM}..."
  if ! curl -fsSL "$url" -o "${tmpdir}/${archive}"; then
    error "Download failed. No release found for ${PLATFORM} at ${VERSION}."
  fi

  info "Extracting..."
  tar xzf "${tmpdir}/${archive}" -C "$tmpdir"

  info "Installing to ${INSTALL_DIR}..."
  mkdir -p "$INSTALL_DIR"
  cp "${tmpdir}/radius-${PLATFORM}"  "${INSTALL_DIR}/radius"
  cp "${tmpdir}/radiusd-${PLATFORM}" "${INSTALL_DIR}/radiusd"
  chmod +x "${INSTALL_DIR}/radius" "${INSTALL_DIR}/radiusd"
}

setup_path() {
  local shell_name rc_file line

  if echo "$PATH" | tr ':' '\n' | grep -qxF "$INSTALL_DIR"; then
    return
  fi

  line="export PATH=\"${INSTALL_DIR}:\$PATH\""
  shell_name="$(basename "${SHELL:-/bin/sh}")"

  case "$shell_name" in
    bash)
      if [ -f "$HOME/.bashrc" ]; then rc_file="$HOME/.bashrc"
      else rc_file="$HOME/.bash_profile"; fi
      ;;
    zsh)  rc_file="$HOME/.zshrc" ;;
    fish)
      mkdir -p "$HOME/.config/fish"
      rc_file="$HOME/.config/fish/config.fish"
      line="set -gx PATH ${INSTALL_DIR} \$PATH"
      ;;
    *)    rc_file="" ;;
  esac

  if [ -n "$rc_file" ]; then
    if ! grep -qF "$INSTALL_DIR" "$rc_file" 2>/dev/null; then
      echo "" >> "$rc_file"
      echo "# Radius" >> "$rc_file"
      echo "$line" >> "$rc_file"
      info "Added ${INSTALL_DIR} to PATH in ${rc_file}"
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
  if ! command -v radius &>/dev/null; then
    info "Restart your shell or run:"
    info "  export PATH=\"${INSTALL_DIR}:\$PATH\""
  fi
}

main
