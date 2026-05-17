---
name: radius-langtools
description: Use Radius language tools for comment toggling, snippets, semantic tokens, and VS Code tasks. Useful for code scaffolding and project automation.
---

# Radius Language Tools

Comment toggling, snippet insertion, semantic tokens, and task execution.

## Commands

### Comment Toggling

Toggle line or block comments:

```bash
radius comment <file> --line <N>                # Toggle single line
radius comment <file> --range <start>:<end>     # Toggle line range
radius comment <file> --line <N> --uncomment    # Remove comment
```

Uses language-appropriate syntax (// for TS/JS, /* */ for CSS, # for Python).

### Snippets

List and insert code snippets:

```bash
radius snippet --list                           # List all snippets
radius snippet --list --language typescript     # List for language
radius snippet <file> --name <snippet> --line <N>  # Insert at line
```

Built-in snippets: for, foreach, if, ifelse, function, arrow, class, interface, try, async.

### Semantic Tokens

Get syntax-highlighted token information:

```bash
radius tokens <file>                    # Full file
radius tokens <file> --range <S>:<E>    # Line range
```

Returns token types (variable, function, class, keyword) with positions.

### VS Code Tasks

Run tasks from .vscode/tasks.json:

```bash
radius task list                        # List available tasks
radius task run <name>                  # Run a task
```

## Guidelines

1. Use `comment` for quick commenting/uncommenting during debugging
2. Use `snippet` to quickly scaffold common patterns
3. Use `tokens` to understand code structure for syntax-aware operations
4. Use `task` to run build/test tasks defined in the project
5. All edit commands support undo via `radius undo`

## Examples

Comment out a block of code:

```bash
radius comment src/debug.ts --range 10:25
```

Uncomment after debugging:

```bash
radius comment src/debug.ts --range 10:25 --uncomment --tag <prev-tag>
```

Insert a for loop scaffold:

```bash
radius snippet src/main.ts --name for --line 15
```

List available snippets:

```bash
radius snippet --list --language typescript
```

Run project build:

```bash
radius task list
radius task run build
```

Get semantic tokens for analysis:

```bash
radius tokens src/api.ts --range 1:50
```
