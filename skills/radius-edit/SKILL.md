---
name: radius-edit
description: Edit files using Radius commands. Use when modifying code files with str-replace, insert, or create operations. Provides precise string replacement and line insertion with automatic undo/redo support.
---

# Radius File Editing

Use Radius for precise file modifications with automatic undo/redo support.

## Commands

### String Replacement

Replace exact text matches in a file:

```bash
radius str-replace <file> --old "<exact-text>" --new "<replacement>"
```

For multiline content, use stdin:

```bash
echo '<new-content>' | radius str-replace <file> --old "<text>" --stdin
```

### Line Insertion

Insert text after a specific line (use 0 for beginning):

```bash
radius insert <file> --line <N> --text "<content>"
```

For multiline insertion:

```bash
cat << 'EOF' | radius insert <file> --line <N> --stdin
<multiline content>
EOF
```

### File Creation

Create a new file:

```bash
radius create <file> --content "<content>"
```

## Diagnostic Output

All edit commands show diagnostic tracking after changes:

```
diagnostics: ❌ 1 error
  ❌ D-001 [2322] (line 5): Type 'string' is not assignable to type 'number'

resolved:
  ✅ D-002 [2322] (line 8): Previous type error
1 issue resolved by this change.
```

- **D-NNN IDs**: Persistent identifiers for tracking specific issues
- **Emoji indicators**: ❌ Error, ⚠️ Warning, ℹ️ Info, ✅ Resolved
- **Resolution tracking**: Shows which diagnostics were fixed by the edit

## Guidelines

1. Always use `radius view <file>` first to see current content with line numbers
2. For str-replace, use enough surrounding context to ensure unique matches
3. If replacement fails with "multiple matches", add more context to --old
4. Each operation is recorded in history - use `radius undo` to revert mistakes
5. Pass `--tag` from previous response to maintain session state
6. Check diagnostic output after edits to verify no new errors were introduced

## Examples

View file before editing:

```bash
radius view src/main.ts --range 10:20
```

Replace a function name:

```bash
radius str-replace src/main.ts --old "function oldName(" --new "function newName("
```

Add import at top of file:

```bash
radius insert src/main.ts --line 0 --text "import { helper } from './utils';"
```
