---
name: radius-codeactions
description: Apply LSP code actions and formatting using Radius. Use when applying quick fixes, refactoring suggestions, or formatting code via the Language Server Protocol.
---

# Radius Code Actions & Formatting

Apply LSP-powered code actions (quick fixes, refactors) and document formatting.

## Commands

### List Code Actions

Show available code actions for a file:

```bash
radius fix <file> --list
radius fix <file> --list --line <N>  # Filter by line
```

Output shows:
- Action ID (for `--id` option)
- Action title and source
- Associated diagnostic line (if applicable)

### Apply Code Actions

Apply the first available action or a specific one:

```bash
radius fix <file>                    # Apply first action
radius fix <file> --line <N>         # Apply first action for line N
radius fix <file> --id <N>           # Apply specific action by ID
```

### Format Document

Apply LSP formatting to a file:

```bash
radius format <file>
```

## Guidelines

1. Use `--list` first to see available actions before applying
2. Code actions include quick fixes (unused imports, type errors) and refactors
3. Formatting follows the project's LSP configuration (tabs vs spaces, etc.)
4. All changes are tracked - use `radius undo` to revert
5. Pass `--tag` from previous response to maintain session state

## Examples

List available fixes for a file with errors:

```bash
radius fix src/api.ts --list
```

Apply a specific quick fix:

```bash
radius fix src/api.ts --id 2
```

Format a file:

```bash
radius format src/api.ts
```

Fix and format workflow:

```bash
# First fix issues
radius fix src/api.ts

# Then format
radius format src/api.ts --tag <previous-tag>
```
