# Conflict Resolution

Radius can parse and resolve Git merge conflicts programmatically.

## View Conflicts

```bash
radius solve-conflict <file>
```

### Example

Given a file with conflicts:

```typescript
function greet(name: string) {
<<<<<<< HEAD
  return "Hello, " + name;
||||||| base
  return "Hi, " + name;
=======
  return "Hey, " + name;
>>>>>>> feature-branch
}
```

Running:

```bash
radius solve-conflict src/greet.ts
```

Output:

```
file: /project/src/greet.ts
conflicts: 1

=== conflict 1 (lines 2-...) ===
--- ours (HEAD) ---
    return "Hello, " + name;
--- base ---
    return "Hi, " + name;
--- theirs (feature-branch) ---
    return "Hey, " + name;
```

## Resolve Conflicts

### Accept One Side

```bash
# Accept our changes (HEAD)
radius solve-conflict src/greet.ts --accept ours

# Accept their changes
radius solve-conflict src/greet.ts --accept theirs
```

### Resolve Specific Conflict

When multiple conflicts exist:

```bash
# Resolve only conflict 2
radius solve-conflict src/file.ts --id 2 --accept ours
```

### Custom Resolution

Provide your own merged content:

```bash
radius solve-conflict src/greet.ts --id 1 --content '  return `Hello, ${name}!`;'
```

## Output

After resolution:

```
resolved: conflict 1 → ours
file: /project/src/greet.ts
remaining conflicts: 0
```

## Conflict Format Support

Radius supports standard Git conflict markers:

### Two-way Merge

```
<<<<<<< HEAD
our changes
=======
their changes
>>>>>>> branch-name
```

### Three-way Merge (with base)

```
<<<<<<< HEAD
our changes
||||||| base
original content
=======
their changes
>>>>>>> branch-name
```

## Workflow Example

Typical conflict resolution workflow:

```bash
# 1. View all conflicts
radius solve-conflict src/file.ts

# 2. Review each conflict and decide
# For conflict 1: accept ours
radius solve-conflict src/file.ts --id 1 --accept ours

# 3. For conflict 2: custom merge
radius solve-conflict src/file.ts --id 2 --content "merged content"

# 4. Verify no conflicts remain
radius solve-conflict src/file.ts
# Output: conflicts: 0

# 5. If you made a mistake
radius undo
```

## Undo Support

Conflict resolutions are tracked:

```bash
radius solve-conflict src/file.ts --accept theirs
radius undo  # Restore conflict markers
```
