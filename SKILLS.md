# Radius Skills

Pre-built [Agent Skills](https://agentskills.io) for using Radius with Claude Code, Cursor, and other AI coding assistants.

## Installation

Copy the desired skill directory to your skills location:

```bash
# Claude Code (user-wide)
cp -r skills/radius-edit ~/.claude/skills/
cp -r skills/radius-refactor ~/.claude/skills/
cp -r skills/radius-visualize ~/.claude/skills/
cp -r skills/radius-session ~/.claude/skills/

# Or for project-specific skills
cp -r skills/radius-edit .claude/skills/
```

## Available Skills

| Skill | Description |
|-------|-------------|
| [`radius-edit`](skills/radius-edit/SKILL.md) | Edit files using str-replace, insert, and create commands |
| [`radius-refactor`](skills/radius-refactor/SKILL.md) | Semantic refactoring with LSP-powered variable and file operations |
| [`radius-visualize`](skills/radius-visualize/SKILL.md) | Generate Mermaid diagrams for module dependencies, references, and call graphs |
| [`radius-session`](skills/radius-session/SKILL.md) | Manage conversation state with dog tag tracking |

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
| `graph imports` | Module dependency graph | read-only |
| `graph refs` | Variable reference graph | read-only |
| `graph calls` | Function call graph | read-only |
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

## Skill Development

Skills follow the [Agent Skills Specification](https://agentskills.io/specification). Each skill is a directory containing a `SKILL.md` file with YAML frontmatter and Markdown instructions.

## License

MIT License - see [LICENSE](LICENSE) for details.
