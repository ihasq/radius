---
name: radius-session
description: Manage Radius session state with dog tags. Use to track conversation state and handle automatic rewinds when LLM context is regenerated or conversation branches.
---

# Radius Session Management

Radius uses "dog tags" to synchronize file state with conversation history.

## How It Works

1. Every command response includes a tag: `radius-tag: e486-abc12345`
2. Pass the tag to subsequent commands with `--tag`
3. If conversation rewinds (old tag used), Radius auto-undoes intervening changes

## Tag Format

```
<project-hash-4char>-<random-8char>
Example: e486-QUrUo-Od
```

## Usage Pattern

```bash
# First command (no tag needed)
radius str-replace file.ts --old "A" --new "B"
# Response includes: radius-tag: e486-abc12345

# Subsequent commands (pass previous tag)
radius str-replace file.ts --old "B" --new "C" --tag e486-abc12345
# Response includes: radius-tag: e486-def67890

# If conversation rewinds to earlier state
radius view file.ts --tag e486-abc12345
# warning: conversation rewind detected. Undoing 1 operation(s).
# Response includes: radius-tag: e486-abc12345
```

## Guidelines

1. Always capture and pass the tag from the previous response
2. Read-only commands (view, read-var) return the same tag
3. Write commands (str-replace, insert, create, modify-var) generate new tags
4. Unknown tags reset the session with a warning
5. Tags are project-specific (based on project root hash)

## Session State

Session stored at: `~/.radius/<project-hash>/session.json`

Contains:
- Current sequence number
- Tag to sequence mapping
- Sequence to changeset mapping (for undo)
