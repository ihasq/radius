# Variable Operations

Variable operations use the Language Server Protocol (LSP) for semantic understanding of your code.

## Read Variable

Find the definition and all references of a variable.

```bash
radius read-var <file> --var <name>
```

### Example

```bash
radius read-var src/auth.ts --var userId
```

### Output

```
variable: userId
file: /project/src/auth.ts
engine: lsp
occurrences: 4

--- definition (line 5) ---
    2: import { db } from './database';
    3:
    4: export function getUser(id: string) {
>   5:   const userId = id;
    6:   return db.users.find(userId);
    7: }
    8:

--- reference (line 6) ---
    3:
    4: export function getUser(id: string) {
    5:   const userId = id;
>   6:   return db.users.find(userId);
    7: }
    8:

--- reference (line 12) ---
    9: export function validateUser() {
   10:   const user = getUser('123');
   11:   if (user) {
>  12:     console.log(user.userId);
   13:   }
   14: }
```

### Fields

| Field | Description |
|-------|-------------|
| `variable` | The searched variable name |
| `file` | Absolute path to the file |
| `engine` | `lsp` (semantic) or `text` (fallback) |
| `occurrences` | Number of matches found |

### Engine Fallback

If LSP is unavailable, Radius falls back to text-based search:

```
engine: text
```

Text mode uses word-boundary matching but lacks semantic understanding (won't distinguish between variables with the same name in different scopes).

## Modify Variable

Rename a variable across all its references.

```bash
radius modify-var <file> --from <old-name> --to <new-name>
```

### Example

```bash
radius modify-var src/auth.ts --from userId --to customerId
```

### Output

```
renamed: userId → customerId
engine: lsp
files modified: 1

--- /project/src/auth.ts (4 edits) ---
   5:   const customerId = id;
   6:   return db.users.find(customerId);
  12:     console.log(user.customerId);
  18:   validateCustomerId(customerId);
```

### Behavior

- Uses LSP `textDocument/rename` for semantic renaming
- Falls back to text-based replacement if LSP unavailable
- Shows warning when using text mode:

```
warning: text-based replacement was used. Semantic accuracy is not guaranteed. Review changes carefully.
```

### Cross-File Renaming

When LSP supports it, renaming can affect multiple files:

```
renamed: API_KEY → API_SECRET
engine: lsp
files modified: 3

--- /project/src/config.ts (1 edits) ---
   5: export const API_SECRET = process.env.API_KEY;

--- /project/src/client.ts (2 edits) ---
   3: import { API_SECRET } from './config';
   8:   headers: { 'X-API-Key': API_SECRET }

--- /project/src/server.ts (1 edits) ---
  12:   validateKey(API_SECRET);
```

## LSP Requirements

For semantic operations to work:

1. **LSP server installed** for the language
2. **Extension registered** in Radius
3. **Server binary in PATH**

Check registered servers:

```bash
radius lsp list
```

### Supported Languages

| Language | Server | Install |
|----------|--------|---------|
| TypeScript/JavaScript | typescript-language-server | `npm i -g typescript-language-server` |
| Rust | rust-analyzer | `rustup component add rust-analyzer` |
| Python | pylsp | `pip install python-lsp-server` |
| Go | gopls | `go install golang.org/x/tools/gopls@latest` |

### Custom Servers

Configure additional servers in `~/.radius/lsp-servers.json`:

```json
{
  "servers": {
    "cpp": {
      "command": "clangd",
      "args": ["--background-index"]
    }
  }
}
```

See [LSP Configuration](/guide/lsp-servers) for details.
