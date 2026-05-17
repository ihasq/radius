---
name: radius-lspviews
description: Get LLM-readable code information using Radius LSP views. Use for symbol outlines, hover info, diagnostics, type hierarchies, diffs, and code lenses.
---

# Radius LSP Views

Query LSP for structured, LLM-readable code information.

## Commands

### Symbol Outline

Get the symbol tree for a file:

```bash
radius outline <file>
```

Shows functions, classes, variables with their kinds and line numbers.

### Hover Information

Get type and documentation at a position:

```bash
radius hover <file> --line <N> --col <N>
```

Returns type signature and JSDoc/documentation if available.

### Diagnostics

Get errors and warnings:

```bash
radius problems                    # Current directory
radius problems <file>             # Single file
radius problems <dir>              # Directory
```

Shows errors, warnings with line numbers and diagnostic codes.

### Type Hierarchy

Show class/interface inheritance:

```bash
radius typehierarchy <file> --symbol <class-or-interface>
```

Returns supertypes (extends) and subtypes (implementations).

### Git Diff

Show file changes:

```bash
radius diff <file>                 # Unstaged changes
radius diff <file> --ref HEAD~1    # Against specific ref
```

### Code Lens

Show reference and implementation counts:

```bash
radius codelens <file>
```

## Guidelines

1. Use `outline` to understand file structure before editing
2. Use `hover` to check types when debugging type errors
3. Use `problems` after edits to verify no new errors
4. Use `typehierarchy` to understand class relationships
5. Use `diff` to review changes before committing
6. Use `codelens` to find heavily-used symbols

## Examples

Get file structure:

```bash
radius outline src/api/handler.ts
```

Check type at cursor position:

```bash
radius hover src/utils.ts --line 15 --col 10
```

Check for errors after editing:

```bash
radius problems src/
```

Understand class hierarchy:

```bash
radius typehierarchy src/services.ts --symbol UserService
```

Review changes:

```bash
radius diff src/api.ts --ref main
```
