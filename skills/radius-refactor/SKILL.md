---
name: radius-refactor
description: Refactor code semantically using Radius LSP operations. Use for renaming variables across the codebase, finding all references to a symbol, or renaming files with automatic import path updates.
---

# Radius Semantic Refactoring

Leverage LSP for intelligent code refactoring across the codebase.

## Commands

### Find Variable References

Locate definition and all usages of a variable:

```bash
radius read-var <file> --var <variable-name>
```

Output shows:
- Definition location with context
- All references with surrounding code
- Engine used (lsp or text fallback)

### Rename Variable

Rename a variable across all references:

```bash
radius modify-var <file> --from <old-name> --to <new-name>
```

### Rename File with Import Updates

Rename a file and update all imports:

```bash
radius rename-file <old-path> <new-path>
```

## Guidelines

1. Use `read-var` before `modify-var` to preview affected locations
2. LSP provides accurate results; text fallback may need manual verification
3. File rename updates relative imports automatically
4. All changes are tracked - undo with `radius undo`
5. For TypeScript/JavaScript, ensure tsconfig.json exists for best results

## Examples

Find all usages of a variable:

```bash
radius read-var src/api/handler.ts --var userId
```

Rename variable across codebase:

```bash
radius modify-var src/api/handler.ts --from userId --to customerId
```

Rename file and update imports:

```bash
radius rename-file src/utils.ts src/helpers.ts
```
