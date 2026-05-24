---
name: radius-session
description: Manage Radius session state. Use RADIUS_SESSION env var for implicit multi-command sessions, or --tag for explicit tag-chain tracking. Handles session lifecycle and multi-agent coordination.
---

# Radius Session Management

Radius supports two session modes for tracking edit state across commands.

## Session ID Mode (Recommended for LLMs)

Set `RADIUS_SESSION` once — all commands automatically share state. No tag passing between calls.

```bash
# Start or rejoin a session
export RADIUS_SESSION=sess-abc123

# All commands inherit the session automatically
radius str-replace file.ts --old "A" --new "B"
radius view file.ts
radius undo     # Undo last edit in this session
radius redo     # Redo
```

The session ID persists via `~/.radius/active-session` and auto-resolves if `RADIUS_SESSION` is not set. A new session ID is generated automatically on first use.

### Session ID Format

```
UUID v4: d6e3a1b2-c4f5-6789-abcd-ef0123456789
```

## Tag Chain Mode (Backward Compatible)

Each command returns a tag that must be passed to the next command with `--tag`. Supports conversation rewind detection.

### How It Works

1. Every command response includes a tag: `radius-tag: f53d-abc12345`
2. Pass the tag to subsequent commands with `--tag`
3. If conversation rewinds (old tag used), Radius auto-undoes intervening changes

### Tag Format

```
<project-hash-4char>-<random-8char>
Example: f53d-QUrUo-Od
```

### Usage Pattern

```bash
# First command (no tag = new chain)
radius str-replace file.ts --old "A" --new "B"
# Response includes: radius-tag: f53d-abc12345

# Subsequent commands (pass previous tag)
radius str-replace file.ts --old "B" --new "C" --tag f53d-abc12345
# Response includes: radius-tag: f53d-def67890

# If conversation rewinds to earlier state
radius view file.ts --tag f53d-abc12345
# warning: conversation rewind detected. Undoing 1 operation(s).
```

## Guidelines

### Session ID Mode
1. Set `RADIUS_SESSION` once per session; never pass `--tag`
2. All commands (read + write) automatically share the same session
3. Undo/Redo use internal sequence tracking — no rewind detection
4. `RADIUS_SESSION` takes precedence over `--tag`

### Tag Chain Mode
1. Always capture and pass the tag from the previous response
2. Read-only commands (view, read-var) return the same tag
3. Write commands (str-replace, insert, create, modify-var) generate new tags
4. Unknown tags reset the session with a warning
5. Tags are project-specific (based on project root hash)

### Both Modes
1. Multi-agent conflict detection works identically in both modes
2. Session state is persisted per-project in `~/.radius/<project-hash>/`
3. Use `list-notifications` to check for conflicts from other agents

## Session State

Session data stored at: `~/.radius/<project-hash>/sessions/<chainId>.json`

Contains:
- Current sequence number
- Session ID to chain ID mapping (session-index.json)
- Tag to sequence mapping (tag-index.json, tag mode only)
- Sequence to changeset mapping (for undo/redo)

## Session Commands

```bash
radius session new     # Create and print new session ID
radius session list    # List active sessions
radius session use <id>  # Switch active session
radius session close   # End current session
```
