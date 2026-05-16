# API Reference

Radius communicates via Unix socket IPC using JSON-RPC style messages.

## Architecture

```
radius (CLI) ─── Unix Socket ───> radiusd (Daemon)
                ~/.radius/daemon.sock
```

## Message Format

### Request

```typescript
interface IpcRequest {
  command: string;
  args: Record<string, unknown>;
  tag?: string | null;  // Session tracking tag
  cwd?: string;         // Working directory
}
```

### Response

```typescript
interface IpcResponse {
  ok: boolean;
  data?: string;
  error?: string;
  tag?: string;         // New session tag
  warnings?: string[];  // Rewind warnings
}
```

## Wire Protocol

Messages are framed with a length prefix:

```
[4 bytes: length (big-endian)] [JSON payload]
```

## Commands Overview

| Command | Description |
|---------|-------------|
| `ping` | Health check |
| `shutdown` | Stop daemon |
| `view` | Display file contents |
| `read-var` | Find variable references |
| `modify-var` | Rename variable |
| `str-replace` | Text replacement |
| `insert` | Insert text at line |
| `create` | Create new file |
| `rename-file` | Rename with import updates |
| `solve-conflict` | Resolve Git conflicts |
| `undo` | Undo last change |
| `redo` | Redo undone change |
| `ext-install` | Install extension |
| `ext-list` | List extensions |
| `ext-remove` | Remove extension |
| `lsp-list` | List LSP servers |

## Session Tracking (Dog Tags)

Radius uses "dog tags" to detect conversation rewinds in LLM interactions.

### How It Works

1. Each command response includes a `tag` (e.g., `e486-QUrUo-Od`)
2. Pass the tag back with `--tag` on subsequent commands
3. If an old tag is received, Radius automatically undoes intervening operations

### Tag Format

```
<project-hash-4char>-<random-8char>
Example: e486-QUrUo-Od
```

### Rewind Detection

```bash
# First change
radius str-replace file.ts --old "A" --new "B"
# Output: [tag: e486-abc12345]

# Second change
radius str-replace file.ts --old "B" --new "C" --tag e486-abc12345
# Output: [tag: e486-def67890]

# Rewind: use old tag
radius view file.ts --tag e486-abc12345
# warning: conversation rewind detected. Undoing 1 operation(s).
#   undone: str-replace (file.ts) [seq:2]
# Output: [tag: e486-abc12345]
```

### Session Storage

- **Session path**: `~/.radius/<project-hash>/session.json`
- Tags map to sequence numbers
- Sequence numbers map to changeset IDs for undo

## Daemon Lifecycle

- **Auto-start**: Daemon starts on first command
- **Idle timeout**: 900 seconds (15 minutes) default
- **Socket path**: `~/.radius/daemon.sock`
- **History path**: `~/.radius/<project-hash>/history/`
- **Session path**: `~/.radius/<project-hash>/session.json`
- **Extensions path**: `~/.radius/extensions/`

See [Commands Reference](/api/commands) for detailed documentation.
