---
name: radius-edit
description: Edit files using Radius commands with LSP integration
---

# Radius Edit Skill

Use Radius commands to perform safe, tracked file editing operations.

## Available Commands

### View file content
```bash
radius view <file>                    # View entire file
radius view <file> --range 10:20      # View lines 10-20
```

### String replacement (exact match)
```bash
radius str-replace <file> --old "old text" --new "new text"
```

### Pattern replacement (regex)
```bash
radius replace <file> --pattern "pattern" --replacement "replacement"
```

### Insert text
```bash
radius insert <file> --line 10 --text "new line content"
```

### Create new file
```bash
radius create <file> --content "file content"
```

### Undo/Redo
```bash
radius undo --tag <tag>    # Undo last change in this chain
radius redo --tag <tag>    # Redo undone change
```

## Tag Chain Usage

Every write command returns a tag. Pass this tag to subsequent commands to maintain your edit chain:

```bash
# First edit (no tag needed)
radius str-replace file.ts --old "foo" --new "bar"
# Output includes: radius-tag: abc1-XXXXXXXX

# Continue with the returned tag
radius str-replace file.ts --old "baz" --new "qux" --tag abc1-XXXXXXXX
```

## Multi-Agent Conflict Handling

If another agent has edited the same lines recently, you'll need to provide a reason:

```bash
radius str-replace file.ts --old "text" --new "newtext" --reason "fixing bug #123"
```
