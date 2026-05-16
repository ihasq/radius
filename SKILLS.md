# Radius Skills for AI Coding Assistants

Pre-built skills for using Radius with Claude Code, Codex, Cursor, and other AI coding assistants that support the [Agent Skills](https://agentskills.io) open standard.

## Installation

Copy the desired skill directory to your skills location:

```bash
# Claude Code
cp -r skills/radius-edit ~/.claude/skills/

# Or for project-specific skills
cp -r skills/radius-edit .claude/skills/
```

## Available Skills

| Skill | Description |
|-------|-------------|
| [radius-edit](#radius-edit) | Edit files using Radius str-replace, insert, and create commands |
| [radius-refactor](#radius-refactor) | Semantic refactoring with LSP-powered variable operations |
| [radius-session](#radius-session) | Manage conversation state with dog tag tracking |

---

## radius-edit

Edit files with precise string replacement and line insertion.

### SKILL.md

```markdown
---
name: radius-edit
description: Edit files using Radius commands. Use when modifying code files with str-replace, insert, or create operations.
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

## Guidelines

1. Always use `radius view <file>` first to see current content with line numbers
2. For str-replace, use enough surrounding context to ensure unique matches
3. If replacement fails with "multiple matches", add more context to --old
4. Each operation is recorded in history - use `radius undo` to revert mistakes
5. Pass `--tag` from previous response to maintain session state

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
```

---

## radius-refactor

Semantic code refactoring using LSP integration.

### SKILL.md

```markdown
---
name: radius-refactor
description: Refactor code semantically using Radius LSP operations. Use for renaming variables, finding references, or renaming files with import updates.
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
```

---

## radius-session

Manage conversation state with automatic rewind detection.

### SKILL.md

```markdown
---
name: radius-session
description: Manage Radius session state with dog tags. Use to track conversation state and handle rewinds in multi-turn interactions.
---

# Radius Session Management

Radius uses "dog tags" to synchronize file state with conversation history.

## How It Works

1. Every command response includes a tag: `[tag: e486-abc12345]`
2. Pass the tag to subsequent commands with `--tag`
3. If conversation rewinds (old tag used), Radius auto-undoes intervening changes

## Tag Format

```
<project-hash-4char>-<random-8char>
Example: e486-QUrUo-Od
```

## Usage Pattern

```bash
# First command (no tag needed)
radius str-replace file.ts --old "A" --new "B"
# Response: [tag: e486-abc12345]

# Subsequent commands (pass previous tag)
radius str-replace file.ts --old "B" --new "C" --tag e486-abc12345
# Response: [tag: e486-def67890]

# If conversation rewinds to earlier state
radius view file.ts --tag e486-abc12345
# warning: conversation rewind detected. Undoing 1 operation(s).
# Response: [tag: e486-abc12345]
```

## Guidelines

1. Always capture and pass the tag from the previous response
2. Read-only commands (view, read-var) return the same tag
3. Write commands (str-replace, insert, create, modify-var) generate new tags
4. Unknown tags reset the session with a warning
5. Tags are project-specific (based on project root hash)

## Session State

Session stored at: `~/.radius/<project-hash>/session.json`

Contains:
- Current sequence number
- Tag to sequence mapping
- Sequence to changeset mapping (for undo)
```

---

## Quick Reference

### All Radius Commands

| Command | Description | Session |
|---------|-------------|---------|
| `view` | Display file contents | read-only |
| `str-replace` | Replace text in file | advances |
| `insert` | Insert text at line | advances |
| `create` | Create new file | advances |
| `read-var` | Find variable references | read-only |
| `modify-var` | Rename variable | advances |
| `rename-file` | Rename with import updates | advances |
| `solve-conflict` | Resolve Git conflicts | advances |
| `undo` | Undo last change | advances |
| `redo` | Redo undone change | advances |
| `ext install` | Install extension | - |
| `ext list` | List extensions | - |
| `ext remove` | Remove extension | - |
| `lsp list` | List LSP servers | - |
| `ping` | Health check | - |
| `daemon stop` | Stop daemon | - |

### Common Patterns

```bash
# View before edit
radius view <file> [--range start:end]

# Edit with session tracking
radius str-replace <file> --old "..." --new "..." [--tag <tag>]

# Undo mistakes
radius undo

# Check LSP status
radius lsp list
```

## Contributing

To contribute new skills, submit a PR adding your skill definition to this file following the [Agent Skills Specification](https://agentskills.io/specification).

## License

MIT License - see [LICENSE](LICENSE) for details.
