# Introduction

Radius is a daemon-based code editing toolkit designed for LLM agents. It provides semantic code operations via Language Server Protocol (LSP) integration with efficient in-memory text buffering using a Piece Tree data structure.

## Why Radius?

Traditional file editing tools treat code as plain text. Radius understands your code semantically:

- **Variable operations** know about scopes and references
- **File renames** automatically update imports
- **Conflict resolution** understands merge markers
- **All changes** are tracked with undo/redo support

## Architecture

```
radius (CLI) ─── Unix Socket IPC ───> radiusd (Daemon)
                                          │
                    ┌─────────────────────┼─────────────────────┐
                    │                     │                     │
              BufferManager          LspManager          HistoryTracker
              (Piece Tree)           (LSP clients)       (Undo/Redo)
```

### Components

| Component | Responsibility |
|-----------|----------------|
| **CLI** | Thin client forwarding commands to daemon |
| **Daemon** | Long-running process managing state |
| **BufferManager** | In-memory text editing with Piece Tree |
| **LspManager** | LSP client lifecycle management |
| **HistoryTracker** | Per-project undo/redo history |

## Key Features

### Semantic Operations

Radius uses LSP to understand your code:

```bash
# Find all references to a variable
radius read-var src/main.ts --var userName

# Rename with semantic awareness
radius modify-var src/main.ts --from userName --to customerName
```

### Efficient Buffering

The Piece Tree data structure provides:

- O(log n) insertions and deletions
- Memory-efficient representation of edits
- External change detection via mtime tracking
- LRU cache limiting memory usage

### Undo/Redo

Every change is tracked:

```bash
radius str-replace file.ts --old "foo" --new "bar"
radius undo  # Restore previous state
radius redo  # Re-apply the change
```

## Next Steps

- [Installation](/guide/installation) - Set up Radius on your system
- [Quick Start](/guide/quick-start) - Your first commands
- [Commands](/guide/file-operations) - Full command reference
