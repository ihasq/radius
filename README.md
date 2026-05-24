# Radius

LLM-native code editing toolkit with LSP integration.

Radius is a daemon-based code editing system designed for AI coding agents. It provides semantic code operations via Language Server Protocol (LSP) integration with efficient in-memory text buffering using a Piece Tree data structure.

## Features

- **LSP-powered semantic operations**: Variable reading and renaming with full semantic understanding
- **TypeScript Language Service (ts-rad)**: Direct TypeScript compiler API integration for enhanced TypeScript support
  - Depth-aware context resolution (0-4 levels): single file → imports → cross-file refs → project-wide → new file detection
  - Optimized for large projects with file limit safeguards (MAX_PROJECT_FILES = 200)
  - Smart truncation that preserves operation target files
  - Stress-tested up to 451 files with stable performance
- **Code actions and formatting**: Apply LSP quick fixes, refactors, and document formatting
- **LLM-readable views**: Outline, hover info, diagnostics, type hierarchy, and code lens
- **Code visualization**: Generate Mermaid graphs for imports, references, and call hierarchies
- **Language tools**: Comment toggling, snippet insertion, semantic tokens, and VS Code task runner
- **Undo/redo history**: Per-project change tracking with full file restoration
- **Git integration**: Conflict resolution and diff viewing
- **Import-aware file renaming**: Automatically update import statements across the project
- **Diagnostic tracking**: Persistent diagnostic IDs (D-NNN) with resolution detection and emoji indicators
- **Multi-agent support**: Session-based agent identification with conflict detection and resolution
- **Session management**: Implicit session tracking via `RADIUS_SESSION` env var or explicit `--tag` chains
- **LLM-optimized output**: `RADIUS_FORMAT=compact|json` for minimal or machine-readable responses
- **VSCode extension support**: Install extensions from Open VSX registry for language support
- **External change detection**: Automatically detect and handle external file modifications
- **Memory-efficient buffering**: LRU cache with Piece Tree text buffer for large file handling
- **Configurable LSP servers**: User-defined LSP server mappings via JSON configuration
- **Debug logging**: Comprehensive logging via RADIUS_DEBUG environment variable
- **Automatic updates**: Self-updating system with Ed25519 signature verification (12-hour check interval)

## Installation

### Quick Install

**Linux / macOS:**
```bash
curl -fsSL https://radius-ai.pages.dev/install.sh | bash
```

**Windows (PowerShell):**
```powershell
irm https://radius-ai.pages.dev/install.ps1 | iex
```

The installer will:
- Download the latest release for your platform
- Extract binaries to `~/.radius/bin` (customizable with `$RADIUS_INSTALL_DIR`)
- Add to PATH automatically

### Manual Installation

Download pre-built binaries from [GitHub Releases](https://github.com/ihasq/radius/releases):

```bash
# Linux x64
curl -LO https://github.com/ihasq/radius/releases/latest/download/radius-linux-x64.tar.gz
tar xzf radius-linux-x64.tar.gz
sudo mv radius-linux-x64 radiusd-linux-x64 /usr/local/bin/
sudo ln -s /usr/local/bin/radius-linux-x64 /usr/local/bin/radius
sudo ln -s /usr/local/bin/radiusd-linux-x64 /usr/local/bin/radiusd
```

### Build from Source

**Prerequisites:**
- [Bun](https://bun.sh/) runtime (v1.0+)
- Unix-like OS (Linux, macOS) or Windows

```bash
# Clone repository
git clone https://github.com/ihasq/radius.git
cd radius

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

### Upgrading

Radius automatically checks for updates every 12 hours and installs them in the background. To manually upgrade:

```bash
# Force immediate update check and installation
radius upgrade
```

The update system uses Ed25519 signature verification to ensure binary integrity. Old versions are preserved in `~/.radius/bin/<hash>/` for rollback if needed.

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

#### Code actions and formatting (Phase 17)
```bash
radius fix <file> --list                # List available code actions
radius fix <file> [--line N] [--id N]   # Apply code action
radius format <file>                    # Apply LSP formatting
```

#### Diagnostic Tracking

All write commands (str-replace, insert, create, etc.) automatically track diagnostics:

```
diagnostics: ❌ 2 errors, ⚠️ 1 warning
  ❌ D-001 [2322] (line 5): Type 'string' is not assignable to type 'number'
  ❌ D-002 [2322] (line 10): Property 'x' does not exist on type 'Foo'
  ⚠️ D-003 [6133] (line 3): 'unused' is declared but never used

resolved:
  ✅ D-004 [2322] (line 8): Type error was fixed
1 issue resolved by this change.
```

Features:
- **Persistent IDs**: Each diagnostic gets a unique D-NNN ID that persists across edits
- **Emoji indicators**: ❌ Error, ⚠️ Warning, ℹ️ Info/Hint, ✅ Resolved
- **Resolution detection**: Tracks which diagnostics were fixed by each edit
- **Project-scoped**: IDs are unique per project and survive daemon restarts

#### LLM-readable views (Phase 18)
```bash
radius outline <file>                        # Symbol tree
radius hover <file> --line N --col N         # Type and docs at position
radius problems [<file-or-dir>]              # Diagnostics (errors/warnings)
radius typehierarchy <file> --symbol <name>  # Class/interface hierarchy
radius diff <file> [--ref <git-ref>]         # Git diff
radius codelens <file>                       # Reference/implementation counts
```

#### Language tools (Phase 19)
```bash
radius comment <file> --line N [--uncomment]       # Toggle line comment
radius comment <file> --range S:E [--uncomment]    # Toggle block comment
radius snippet --list [--language <lang>]          # List snippets
radius snippet <file> --name <name> --line N       # Insert snippet
radius tokens <file> [--range S:E]                 # Semantic tokens
radius task list                                   # List VS Code tasks
radius task run <name>                             # Run task
```

#### Code visualization (Mermaid graphs)
```bash
radius graph imports <file> [--depth=N]      # Module dependency graph
radius graph refs <file> <symbol>            # Variable reference graph
radius graph calls <file> <function>         # Function call hierarchy
```

#### Extension management
```bash
radius ext install <publisher.name>   # Install from Open VSX
radius ext install ./local-extension  # Install local extension
radius ext list                       # List installed extensions
radius ext remove <publisher.name>    # Remove extension
```

#### Session management
```bash
radius session new                    # Create new session (prints session ID)
radius session list                   # List active sessions
radius session use <id>               # Switch active session
radius session close                  # End current session
```

#### LSP server management
```bash
radius lsp list    # Show registered LSP servers and their sources
```

### Multi-Agent Support

Radius supports multiple AI agents working on the same project concurrently. Each agent can operate in one of two modes:

#### Session ID Mode (recommended for LLMs)

Set `RADIUS_SESSION` once — all subsequent commands inherit the session automatically. No tag passing needed.

```bash
# Start a session
export RADIUS_SESSION=$(radius session new)

# All commands automatically belong to this session
radius str-replace file.ts --old "foo" --new "bar"
radius view file.ts
radius undo        # Undo last edit in this session
```

The session ID is persisted in `~/.radius/active-session` and auto-resolved on every command.

#### Tag Chain Mode (backward compatible)

Each command returns a tag that identifies the agent's chain of operations. Useful for explicit multi-agent scenarios.

```bash
# Agent A starts working (no tag = new chain)
radius str-replace file.ts --old "foo" --new "bar"
# Returns: radius-tag: abc1-XXXXXXXX

# Agent A continues with returned tag
radius str-replace file.ts --old "baz" --new "qux" --tag abc1-XXXXXXXX

# Agent B starts working concurrently (no tag = new chain)
# If editing same lines as Agent A, will require --reason flag
radius str-replace file.ts --old "bar" --new "newbar" --reason "fixing typo"
```

#### Conflict Detection and Resolution

When agents edit overlapping regions, Radius detects conflicts and notifies affected sessions:

```bash
# List pending notifications for your session
radius list-notifications

# Accept another agent's changes
radius accept-change --conflict <conflict-id>

# Challenge another agent's changes
radius challenge-change --conflict <conflict-id> --reason "breaks tests"
```

### Output Format

Control output verbosity via `RADIUS_FORMAT`:

```bash
# Minimal output — suppresses tag footer and welcome messages
RADIUS_FORMAT=compact radius str-replace file.ts --old "A" --new "B"

# Machine-readable JSON — use for LLM tool parsing
RADIUS_FORMAT=json radius ping
# → {"ok":true,"data":"pong"}

# Default (human-readable)
radius ping
```

### Debug Logging

Enable debug output via the `RADIUS_DEBUG` environment variable:

```bash
# Enable all debug output
RADIUS_DEBUG=1 radius ping

# Enable specific modules only
RADIUS_DEBUG=ipc,session radius view file.ts

# Available modules: ipc, cmd, session, lsp, buffer, history, conflict
```

Debug output goes to stderr. For daemon-side logs, check `~/.radius/daemon-debug.log`.

### Environment Variables

| Variable | Purpose |
|----------|---------|
| `RADIUS_SESSION` | Session ID for implicit session tracking (no `--tag` needed) |
| `RADIUS_FORMAT` | Output mode: `compact` (minimal) or `json` (machine-readable) |
| `RADIUS_HOME` | Override default `~/.radius` data directory |
| `RADIUS_DEBUG` | Enable debug logging (`1` or `module1,module2`) |
| `RADIUS_NO_COLOR` | Disable ANSI color output |

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
                    │                     │                     │
              File Watcher          ExtensionLoader      SessionManager
              (fs.watch)            (VSCode extensions)  (Session/Tag)
                    │                                         │
              ChangeLedger                              ConflictManager
              (Edit tracking)                           (Multi-agent)
```

### Components

- **CLI (`radius`)**: Thin client that forwards commands to daemon via Unix socket with session resolution
- **Daemon (`radiusd`)**: Long-running process managing buffers, LSP clients, sessions, and history
- **BufferManager**: Piece Tree-based text buffer with mtime tracking, external change detection, and LRU eviction
- **LspManager**: Per-project LSP client lifecycle management
- **ExtensionLoader**: VSCode extension loading with static extraction + activate() fallback
- **HistoryTracker**: Per-project changeset history for undo/redo operations
- **SessionManager**: Session-based state tracking with implicit session ID (`RADIUS_SESSION`) or explicit tag-chain (`--tag`) mode
- **ChangeLedger**: Records all changes with timestamps for multi-agent conflict detection
- **ConflictManager**: Detects overlapping edits across sessions and external modifications, manages notifications

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
    graph/       # Mermaid graph generation (imports, refs, calls)
    session/     # Session tracking with implicit session ID or tag-chain mode
    agent/       # Multi-agent support (ledger, conflict detection)
  lsp/           # LSP client and transport
  extension-host/# VSCode extension loading
  ipc/           # Unix socket IPC layer
  shared/        # Shared utilities, colors, debug logging
```

### Build

```bash
bun run build    # Build both radius and radiusd binaries
```

### Testing

```bash
bun run test       # Run all tests (CI mode)
bun run test:dev   # Run tests, stop on first failure (development mode)
```

Tests run in parallel with isolated `RADIUS_HOME` directories for each test file.

### Type checking

```bash
bunx tsc --noEmit
```

## License

MIT
