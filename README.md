# Radius

LLM-native code editing toolkit with LSP integration.

Radius is a daemon-based code editing system designed for AI coding agents. It provides semantic code operations via Language Server Protocol (LSP) integration with efficient in-memory text buffering using a Piece Tree data structure.

## Features

- **LSP-powered semantic operations**: Variable reading and renaming with full semantic understanding
- **Undo/redo history**: Per-project change tracking with full file restoration
- **Git conflict resolution**: Parse and resolve merge conflicts programmatically
- **Import-aware file renaming**: Automatically update import statements across the project
- **VSCode extension support**: Install extensions from Open VSX registry for language support
- **External change detection**: Automatically detect and handle external file modifications
- **Memory-efficient buffering**: LRU cache with Piece Tree text buffer for large file handling
- **Configurable LSP servers**: User-defined LSP server mappings via JSON configuration

## Installation

### Prerequisites

- [Bun](https://bun.sh/) runtime (v1.0+)
- Unix-like OS (Linux, macOS)

### Build from source

```bash
# Install dependencies
bun install

# Build binaries
bun run build

# Install to system (optional)
sudo cp dist/radius dist/radiusd /usr/local/bin/
```

## Usage

### Starting the daemon

The daemon starts automatically on first command. To manually manage:

```bash
# Check daemon status
radius ping

# Stop daemon
radius daemon stop
```

### Commands

#### File viewing
```bash
radius view <file>                    # View entire file
radius view <file> --range 10:20      # View lines 10-20
```

#### Variable operations (LSP-powered)
```bash
radius read-var <file> --var <name>              # Find variable definition and references
radius modify-var <file> --from <old> --to <new> # Rename variable across file
```

#### Text editing
```bash
radius str-replace <file> --old "text" --new "replacement"
radius insert <file> --line 10 --text "new line content"
radius create <file> --content "file content"
```

#### Git conflict resolution
```bash
radius solve-conflict <file>                    # Show conflicts
radius solve-conflict <file> --accept ours      # Accept our changes
radius solve-conflict <file> --accept theirs    # Accept their changes
radius solve-conflict <file> --id 1 --content "custom resolution"
```

#### File renaming with import updates
```bash
radius rename-file <old-path> --to <new-path>
```

#### Undo/Redo
```bash
radius undo    # Undo last change
radius redo    # Redo undone change
```

#### Extension management
```bash
radius ext install <publisher.name>   # Install from Open VSX
radius ext install ./local-extension  # Install local extension
radius ext list                       # List installed extensions
radius ext remove <publisher.name>    # Remove extension
```

#### LSP server management
```bash
radius lsp list    # Show registered LSP servers and their sources
```

## Configuration

### LSP servers

Create `~/.radius/lsp-servers.json` to define custom LSP servers:

```json
{
  "servers": {
    "python": {
      "command": "pylsp",
      "args": []
    },
    "go": {
      "command": "gopls",
      "args": ["serve"]
    }
  }
}
```

LSP resolution priority:
1. Installed VSCode extensions (static extraction)
2. User configuration (`~/.radius/lsp-servers.json`)
3. Built-in fallback table

## Architecture

```
radius (CLI) ─── Unix Socket IPC ───> radiusd (Daemon)
                                          │
                    ┌─────────────────────┼─────────────────────┐
                    │                     │                     │
              BufferManager          LspManager          HistoryTracker
              (Piece Tree)           (LSP clients)       (Undo/Redo)
                    │                     │
                    │              ExtensionLoader
                    │              (VSCode extensions)
                    │
              File System
```

### Components

- **CLI (`radius`)**: Thin client that forwards commands to daemon via Unix socket
- **Daemon (`radiusd`)**: Long-running process managing buffers, LSP clients, and history
- **BufferManager**: Piece Tree-based text buffer with mtime tracking and LRU eviction
- **LspManager**: Per-project LSP client lifecycle management
- **ExtensionLoader**: VSCode extension loading with static extraction + activate() fallback
- **HistoryTracker**: Per-project changeset history for undo/redo operations

## Development

### Project structure

```
src/
  cli/           # CLI entry point and command parsing
  daemon/        # Daemon entry point and handler registry
  core/
    buffer/      # Piece Tree buffer manager
    commands/    # Command handlers
    history/     # Undo/redo tracking
    imports/     # Import statement scanning and rewriting
    conflict/    # Git conflict parsing
  lsp/           # LSP client and transport
  extension-host/# VSCode extension loading
  ipc/           # Unix socket IPC layer
  shared/        # Shared utilities
```

### Build

```bash
bun run build    # Build both radius and radiusd binaries
```

### Type checking

```bash
bunx tsc --noEmit
```

## License

MIT
