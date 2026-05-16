# Installation

## Quick Install (Recommended)

### Linux / macOS

```bash
curl -fsSL https://radius-ai.pages.dev/install.sh | bash
```

### Windows

Open PowerShell and run:

```powershell
irm https://radius-ai.pages.dev/install.ps1 | iex
```

The installer will:
- Download the latest release for your platform
- Extract binaries to `~/.radius/bin` (or `%USERPROFILE%\.radius\bin` on Windows)
- Add to PATH automatically
- Verify installation

::: tip
After installation, restart your terminal or run:

**Linux / macOS:**
```bash
export PATH="$HOME/.radius/bin:$PATH"
```

**Windows:** Already added to PATH, just restart your terminal.
:::

## Manual Installation

Download pre-built binaries from [GitHub Releases](https://github.com/ihasq/radius/releases/latest).

### Linux

::: code-group
```bash [x64]
curl -LO https://github.com/ihasq/radius/releases/latest/download/radius-linux-x64.tar.gz
tar xzf radius-linux-x64.tar.gz
sudo mv radius-linux-x64 radiusd-linux-x64 /usr/local/bin/
sudo ln -s /usr/local/bin/radius-linux-x64 /usr/local/bin/radius
sudo ln -s /usr/local/bin/radiusd-linux-x64 /usr/local/bin/radiusd
```

```bash [arm64]
curl -LO https://github.com/ihasq/radius/releases/latest/download/radius-linux-arm64.tar.gz
tar xzf radius-linux-arm64.tar.gz
sudo mv radius-linux-arm64 radiusd-linux-arm64 /usr/local/bin/
sudo ln -s /usr/local/bin/radius-linux-arm64 /usr/local/bin/radius
sudo ln -s /usr/local/bin/radiusd-linux-arm64 /usr/local/bin/radiusd
```
:::

### macOS

::: code-group
```bash [Apple Silicon]
curl -LO https://github.com/ihasq/radius/releases/latest/download/radius-darwin-arm64.tar.gz
tar xzf radius-darwin-arm64.tar.gz
sudo mv radius-darwin-arm64 radiusd-darwin-arm64 /usr/local/bin/
sudo ln -s /usr/local/bin/radius-darwin-arm64 /usr/local/bin/radius
sudo ln -s /usr/local/bin/radiusd-darwin-arm64 /usr/local/bin/radiusd
```

```bash [Intel]
curl -LO https://github.com/ihasq/radius/releases/latest/download/radius-darwin-x64.tar.gz
tar xzf radius-darwin-x64.tar.gz
sudo mv radius-darwin-x64 radiusd-darwin-x64 /usr/local/bin/
sudo ln -s /usr/local/bin/radius-darwin-x64 /usr/local/bin/radius
sudo ln -s /usr/local/bin/radiusd-darwin-x64 /usr/local/bin/radiusd
```
:::

### Windows

1. Download [radius-win-x64.zip](https://github.com/ihasq/radius/releases/latest/download/radius-win-x64.zip)
2. Extract to a folder (e.g., `C:\Program Files\Radius`)
3. Add to PATH:

```powershell
$installPath = "C:\Program Files\Radius"
[Environment]::SetEnvironmentVariable("Path", "$installPath;$env:Path", "User")
```

## Build from Source

### Prerequisites

- [Bun](https://bun.sh/) runtime (v1.0 or later)
- Git

### Steps

```bash
# 1. Clone repository
git clone https://github.com/ihasq/radius.git
cd radius

# 2. Install dependencies
bun install

# 3. Build binaries
bun run build

# 4. Install to system (optional)
sudo cp dist/radius dist/radiusd /usr/local/bin/
```

This creates two binaries in the `dist/` directory:

| Binary | Description |
|--------|-------------|
| `radius` | CLI client |
| `radiusd` | Background daemon |

## Verify Installation

```bash
# Start daemon and check connectivity
radius ping
# Expected output: pong
```

## LSP Server Setup

For semantic features to work, you need LSP servers installed for your languages:

### TypeScript/JavaScript

```bash
npm install -g typescript-language-server typescript
```

### Rust

```bash
rustup component add rust-analyzer
```

### Python

```bash
pip install python-lsp-server
```

### Go

```bash
go install golang.org/x/tools/gopls@latest
```

## Directory Structure

Radius stores data in `~/.radius/`:

```
~/.radius/
├── daemon.sock                          # Unix socket for IPC
├── daemon.pid                           # Daemon process ID
├── extensions/                          # Installed VSCode extensions
├── <project-hash>/
│   ├── history/                         # Per-project undo/redo history
│   │   ├── state.json
│   │   ├── 0001.json
│   │   └── ...
│   └── session.json                     # Dog tag session tracking
└── lsp-servers.json                     # Custom LSP server configuration
```

## Uninstall

```bash
# Remove binaries
sudo rm /usr/local/bin/radius /usr/local/bin/radiusd

# Remove data directory (optional)
rm -rf ~/.radius
```
