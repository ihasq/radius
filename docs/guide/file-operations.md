# File Operations

## View

Display file contents with line numbers.

```bash
radius view <path> [--range <start>:<end>]
```

### Examples

```bash
# View entire file
radius view src/main.ts

# View lines 10-20
radius view src/main.ts --range 10:20

# View from line 50 to end
radius view src/main.ts --range 50:
```

### Output Format

```
    1: import { helper } from './utils';
    2:
    3: export function main() {
    4:   return helper();
    5: }
```

## String Replace

Replace exact text matches in a file.

```bash
radius str-replace <file> --old <text> --new <text>
radius str-replace <file> --stdin --new <text>   # Read --old from stdin
radius str-replace <file> --old <text> --stdin   # Read --new from stdin
```

### Examples

```bash
# Simple replacement
radius str-replace src/config.ts --old "localhost" --new "api.example.com"

# Multi-line replacement with stdin
echo "old multi-line
content here" | radius str-replace src/file.ts --stdin --new "new content"
```

### Behavior

- Requires **exact match** (not regex)
- Must match **exactly one occurrence**
- Returns error if multiple matches found (use more specific text)
- Shows context around the change

## Insert

Insert text after a specific line.

```bash
radius insert <file> --line <N> --text <text>
radius insert <file> --line <N> --stdin
```

### Examples

```bash
# Insert after line 5
radius insert src/main.ts --line 5 --text "// New comment"

# Insert at beginning (line 0)
radius insert src/main.ts --line 0 --text "// File header"

# Insert from stdin
echo "multi-line
content" | radius insert src/main.ts --line 10 --stdin
```

## Create

Create a new file with optional content.

```bash
radius create <file> [--content <text>]
radius create <file> --stdin
```

### Examples

```bash
# Create with inline content
radius create src/constants.ts --content "export const API_URL = 'https://api.example.com';"

# Create empty file
radius create src/placeholder.ts

# Create from stdin
cat template.ts | radius create src/new-module.ts --stdin
```

### Behavior

- Creates parent directories automatically
- Returns error if file already exists
- Records changeset for undo support

## Rename File

Rename a file and update all import statements.

```bash
radius rename-file <old-path> --to <new-path>
```

### Examples

```bash
# Rename file
radius rename-file src/utils.ts --to src/helpers.ts

# Move to different directory
radius rename-file src/utils.ts --to src/lib/utils.ts
```

### Behavior

1. Scans project for files importing the old path
2. Renames the file
3. Updates all import statements
4. Updates imports within the renamed file itself
5. Records all changes for undo

### Output

```
renamed: /project/src/utils.ts → /project/src/helpers.ts
engine: static
imports updated: 3

--- /project/src/main.ts (1 edit) ---
--- /project/src/app.ts (1 edit) ---
--- /project/src/index.ts (1 edit) ---
```

## Undo/Redo

Reverse or re-apply changes.

```bash
radius undo
radius redo
```

### Behavior

- History is **per-project** (based on git root)
- All file operations record changesets
- Undo restores **all files** modified by a command
- Supports multiple levels of undo

### Example Session

```bash
radius str-replace src/a.ts --old "x" --new "y"
radius str-replace src/b.ts --old "1" --new "2"
radius undo  # Reverts b.ts change
radius undo  # Reverts a.ts change
radius redo  # Re-applies a.ts change
```
