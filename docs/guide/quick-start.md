# Quick Start

This guide walks you through common Radius operations.

## Starting the Daemon

The daemon starts automatically on your first command. Check if it's running:

```bash
radius ping
# Output: pong
```

## Viewing Files

```bash
# View entire file
radius view src/main.ts

# View specific lines
radius view src/main.ts --range 10:20
```

Output includes line numbers:

```
    1: import { helper } from './utils';
    2:
    3: function main() {
    4:   const message = 'Hello';
    5:   console.log(message);
    6: }
```

## Editing Files

### String Replacement

Replace exact text matches:

```bash
radius str-replace src/main.ts --old "Hello" --new "Hello, World"
```

### Insert Lines

Insert text after a specific line:

```bash
radius insert src/main.ts --line 3 --text "  // Entry point"
```

### Create Files

```bash
radius create src/new-file.ts --content "export const VERSION = '1.0.0';"
```

## Semantic Operations

### Read Variable References

Find where a variable is defined and used:

```bash
radius read-var src/main.ts --var message
```

Output shows definition and all references with context:

```
variable: message
file: /project/src/main.ts
engine: lsp
occurrences: 2

--- definition (line 4) ---
    1: import { helper } from './utils';
    2:
    3: function main() {
>   4:   const message = 'Hello';
    5:   console.log(message);

--- reference (line 5) ---
    3: function main() {
    4:   const message = 'Hello';
>   5:   console.log(message);
    6: }
```

### Rename Variables

Rename with semantic awareness:

```bash
radius modify-var src/main.ts --from message --to greeting
```

## Undo/Redo

Every change is tracked:

```bash
# Make a change
radius str-replace src/main.ts --old "foo" --new "bar"

# Undo it
radius undo

# Redo if needed
radius redo
```

## Session Tracking (LLM Integration)

Radius tracks conversation state with "dog tags" for LLM integration:

```bash
# Each command returns a tag
radius str-replace src/main.ts --old "A" --new "B"
# Output includes: [tag: e486-abc12345]

# Pass tag to subsequent commands
radius str-replace src/main.ts --old "B" --new "C" --tag e486-abc12345
# Output includes: [tag: e486-def67890]

# If conversation rewinds (old tag used), auto-undo occurs
radius view src/main.ts --tag e486-abc12345
# warning: conversation rewind detected. Undoing 1 operation(s).
```

This ensures file state stays synchronized with LLM conversation history.

## Conflict Resolution

When you have Git merge conflicts:

```bash
# View conflicts
radius solve-conflict src/file.ts

# Accept one side
radius solve-conflict src/file.ts --accept ours
radius solve-conflict src/file.ts --accept theirs

# Custom resolution
radius solve-conflict src/file.ts --id 1 --content "merged code here"
```

## File Renaming

Rename files with automatic import updates:

```bash
radius rename-file src/utils.ts --to src/helpers.ts
```

All files importing `./utils` will be updated to `./helpers`.

## Extension Management

Install language support:

```bash
# Install from Open VSX
radius ext install rust-lang.rust-analyzer

# List installed
radius ext list

# Remove
radius ext remove rust-lang.rust-analyzer
```

## Next Steps

- [File Operations](/guide/file-operations) - Detailed file editing commands
- [Variable Operations](/guide/variable-operations) - LSP-powered semantic operations
- [LSP Configuration](/guide/lsp-servers) - Custom language server setup
