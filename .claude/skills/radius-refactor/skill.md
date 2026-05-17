---
name: radius-refactor
description: Perform semantic code refactoring using Radius LSP integration
---

# Radius Refactor Skill

Use Radius commands to perform LSP-powered semantic refactoring operations.

## Variable Operations

### Read variable information
```bash
radius read-var <file> --var <name>
```

Returns the variable's definition, type, and all references in the file.

### Rename variable (semantic)
```bash
radius modify-var <file> --from <old-name> --to <new-name>
```

Renames the variable across all its references in the file, understanding scope.

## File Operations

### Rename file with import updates
```bash
radius rename-file <old-path> --to <new-path>
```

Renames the file and updates all import statements across the project that reference it.

## Code Visualization

### Generate import dependency graph
```bash
radius graph imports <file>              # Direct imports only
radius graph imports <file> --depth 3    # Up to 3 levels deep
```

Outputs a Mermaid diagram showing module dependencies.

### Generate reference graph
```bash
radius graph refs <file> <symbol>
```

Shows where a symbol is defined and all its references.

### Generate call hierarchy
```bash
radius graph calls <file> <function>
```

Shows the call hierarchy for a function.

## LSP Server Management

### View registered LSP servers
```bash
radius lsp list
```

Shows all LSP servers and their sources (extension, user config, or built-in).

## Example Refactoring Workflow

```bash
# 1. Understand the current structure
radius read-var src/api.ts --var httpClient

# 2. Visualize dependencies
radius graph imports src/api.ts --depth 2

# 3. Rename the variable with semantic understanding
radius modify-var src/api.ts --from httpClient --to apiClient --tag <tag>

# 4. Rename the file and update imports
radius rename-file src/api.ts --to src/apiClient.ts --tag <tag>
```

## Notes

- All refactoring operations track changes and can be undone with `radius undo`
- Use `--tag` to maintain your edit chain across multiple operations
- LSP servers must be available for semantic operations to work
