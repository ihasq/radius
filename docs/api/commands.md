# Commands Reference

Complete reference for all Radius commands.

## Global Options

### --tag

Session tracking tag for conversation rewind detection.

**Usage:**
```bash
radius <command> [args] --tag <tag>
```

**Behavior:**
- If tag matches current session: proceed normally
- If tag is from an older sequence: auto-undo intervening operations
- If tag is unknown: reset session with warning

**Response includes:**
```json
{
  "ok": true,
  "data": "...",
  "tag": "e486-newTag12",
  "warnings": ["warning: conversation rewind detected..."]
}
```

**Note:** `ping` does not support `--tag`.

---

## System Commands

### ping

Check daemon connectivity.

**Request:**
```json
{ "command": "ping", "args": {} }
```

**Response:**
```json
{ "ok": true, "data": "pong" }
```

---

### shutdown

Stop the daemon.

**Request:**
```json
{ "command": "shutdown", "args": {} }
```

**Response:**
```json
{ "ok": true, "data": "shutting down" }
```

---

## File Commands

### view

Display file contents.

**Arguments:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `path` | string | yes | File path |
| `range` | string | no | Line range `start:end` |

**Request:**
```json
{
  "command": "view",
  "args": {
    "path": "/project/src/main.ts",
    "range": "10:20"
  }
}
```

**Response:**
```json
{
  "ok": true,
  "data": "   10: function main() {\n   11:   console.log('hello');\n..."
}
```

---

### str-replace

Replace text in file.

**Arguments:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `file` | string | yes | File path |
| `old` | string | yes | Text to find |
| `new` | string | yes | Replacement text |

**Request:**
```json
{
  "command": "str-replace",
  "args": {
    "file": "/project/src/main.ts",
    "old": "hello",
    "new": "world"
  }
}
```

**Response:**
```json
{
  "ok": true,
  "data": "replaced 1 occurrence in /project/src/main.ts\n\n   10: ...\n>  11:   console.log('world');\n   12: ..."
}
```

**Errors:**
- `error: multiple matches found (N). Use a more specific string.`
- `error: string not found`

---

### insert

Insert text after a line.

**Arguments:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `file` | string | yes | File path |
| `line` | number | yes | Line number (0 for beginning) |
| `text` | string | yes | Text to insert |

**Request:**
```json
{
  "command": "insert",
  "args": {
    "file": "/project/src/main.ts",
    "line": 5,
    "text": "// New comment"
  }
}
```

---

### create

Create a new file.

**Arguments:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `file` | string | yes | File path |
| `content` | string | no | File content |

**Request:**
```json
{
  "command": "create",
  "args": {
    "file": "/project/src/new.ts",
    "content": "export const VERSION = '1.0.0';"
  }
}
```

**Errors:**
- `error: file already exists.`

---

### rename-file

Rename file and update imports.

**Arguments:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `file` | string | yes | Current file path |
| `to` | string | yes | New file path |

**Request:**
```json
{
  "command": "rename-file",
  "args": {
    "file": "/project/src/utils.ts",
    "to": "/project/src/helpers.ts"
  }
}
```

---

## Variable Commands

### read-var

Find variable definition and references.

**Arguments:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `file` | string | yes | File path |
| `var` | string | yes | Variable name |

**Request:**
```json
{
  "command": "read-var",
  "args": {
    "file": "/project/src/main.ts",
    "var": "userId"
  }
}
```

**Response includes:**
- Variable name and file path
- Engine used (`lsp` or `text`)
- Occurrence count
- Definition with context
- References with context

---

### modify-var

Rename variable across references.

**Arguments:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `file` | string | yes | File path |
| `from` | string | yes | Current name |
| `to` | string | yes | New name |

**Request:**
```json
{
  "command": "modify-var",
  "args": {
    "file": "/project/src/main.ts",
    "from": "userId",
    "to": "customerId"
  }
}
```

---

## Conflict Commands

### solve-conflict

Read or resolve Git conflicts.

**Arguments (read mode):**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `file` | string | yes | File path |

**Arguments (resolve mode):**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `file` | string | yes | File path |
| `accept` | string | no | `ours` or `theirs` |
| `id` | number | no | Specific conflict ID |
| `content` | string | no | Custom resolution |

**Read mode request:**
```json
{
  "command": "solve-conflict",
  "args": { "file": "/project/src/main.ts" }
}
```

**Resolve mode request:**
```json
{
  "command": "solve-conflict",
  "args": {
    "file": "/project/src/main.ts",
    "accept": "ours"
  }
}
```

---

## History Commands

### undo

Undo last change.

**Arguments:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `cwd` | string | yes | Current working directory |

**Request:**
```json
{
  "command": "undo",
  "args": { "cwd": "/project" }
}
```

---

### redo

Redo undone change.

**Arguments:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `cwd` | string | yes | Current working directory |

**Request:**
```json
{
  "command": "redo",
  "args": { "cwd": "/project" }
}
```

---

## Extension Commands

### ext-install

Install extension.

**Arguments:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `source` | string | yes | Registry ID or local path |

**Request:**
```json
{
  "command": "ext-install",
  "args": { "source": "rust-lang.rust-analyzer" }
}
```

---

### ext-list

List installed extensions.

**Request:**
```json
{ "command": "ext-list", "args": {} }
```

---

### ext-remove

Remove extension.

**Arguments:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `extensionId` | string | yes | Extension ID |

**Request:**
```json
{
  "command": "ext-remove",
  "args": { "extensionId": "rust-lang.rust-analyzer" }
}
```

---

## LSP Commands

### lsp-list

List registered LSP servers.

**Request:**
```json
{ "command": "lsp-list", "args": {} }
```

**Response:**
```
language            command                                 source
--------------------------------------------------------------------------------
typescript          typescript-language-server --stdio      extension (...)
rust                rust-analyzer                           extension (...)
python              pylsp                                   user-config (...)
```
