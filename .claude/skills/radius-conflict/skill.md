---
name: radius-conflict
description: Resolve git merge conflicts and multi-agent edit conflicts using Radius
---

# Radius Conflict Resolution Skill

Use Radius commands to resolve both git merge conflicts and multi-agent edit conflicts.

## Git Merge Conflicts

### View conflicts in a file
```bash
radius solve-conflict <file>
```

Output shows numbered conflict regions with "ours" and "theirs" versions.

### Resolve all conflicts
```bash
radius solve-conflict <file> --accept ours      # Accept our changes
radius solve-conflict <file> --accept theirs    # Accept their changes
```

### Resolve specific conflict
```bash
radius solve-conflict <file> --id 1 --accept ours
radius solve-conflict <file> --id 2 --accept theirs
```

### Custom resolution
```bash
radius solve-conflict <file> --id 1 --content "custom merged content"
```

## Multi-Agent Edit Conflicts

When multiple AI agents work on the same project, Radius tracks overlapping edits.

### List pending notifications
```bash
radius list-notifications --tag <your-tag>
```

Shows conflicts where other agents have modified code you also edited.

### Accept another agent's changes
```bash
radius accept-change --conflict <conflict-id> --tag <your-tag>
```

This acknowledges that their changes are acceptable and clears the notification.

### Challenge another agent's changes
```bash
radius challenge-change --conflict <conflict-id> --reason "breaks tests" --tag <your-tag>
```

This sends a notification to the other agent explaining why their change is problematic.

## Workflow Example

```bash
# Agent A edits a function
radius str-replace api.ts --old "fetchData" --new "getData"
# Returns tag: abc1-XXXXXXXX

# Agent B edits the same function (creates conflict)
radius str-replace api.ts --old "getData" --new "loadData" --reason "better naming"

# Agent A checks notifications
radius list-notifications --tag abc1-XXXXXXXX
# Shows: your changes were overwritten by another agent

# Agent A accepts the change
radius accept-change --conflict conflict-xxxxx --tag abc1-XXXXXXXX
```
