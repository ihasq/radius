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
}
```

### Response

```typescript
interface IpcResponse {
  ok: boolean;
  data?: string;
  error?: string;
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

## Daemon Lifecycle

- **Auto-start**: Daemon starts on first command
- **Idle timeout**: 900 seconds (15 minutes) default
- **Socket path**: `~/.radius/daemon.sock`
- **History path**: `~/.radius/history/<project-hash>/`
- **Extensions path**: `~/.radius/extensions/`

See [Commands Reference](/api/commands) for detailed documentation.
