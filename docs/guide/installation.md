# Installation

## Prerequisites

- [Bun](https://bun.sh/) runtime (v1.0 or later)
- Unix-like operating system (Linux, macOS)

## Build from Source

### 1. Clone the repository

```bash
git clone https://github.com/user/radius.git
cd radius
```

### 2. Install dependencies

```bash
bun install
```

### 3. Build binaries

```bash
bun run build
```

This creates two binaries in the `dist/` directory:

| Binary | Description |
|--------|-------------|
| `radius` | CLI client |
| `radiusd` | Background daemon |

### 4. Install to system (optional)

```bash
sudo cp dist/radius dist/radiusd /usr/local/bin/
```

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
├── daemon.sock      # Unix socket for IPC
├── extensions/      # Installed VSCode extensions
├── history/         # Per-project undo/redo history
└── lsp-servers.json # Custom LSP server configuration
```

## Uninstall

```bash
# Remove binaries
sudo rm /usr/local/bin/radius /usr/local/bin/radiusd

# Remove data directory (optional)
rm -rf ~/.radius
```
