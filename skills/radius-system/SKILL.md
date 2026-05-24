---
name: radius-system
description: Radius system management commands for daemon control, upgrades, and health checks.
---

# Radius System Management

Daemon control, automatic updates, and system health commands.

## Commands

### Health Check

```bash
radius ping                         # Check if daemon is running
```

Returns "pong" if daemon is responsive.

### Daemon Control

```bash
radius daemon stop                  # Stop the daemon
```

The daemon starts automatically on first command. Use stop only when needed.

### Upgrade

```bash
radius upgrade                      # Force immediate update check
```

Radius automatically checks for updates every 12 hours in the background. Use `upgrade` to:
- Force an immediate update check
- Install the latest version if available
- Verify binary integrity via Ed25519 signature

Output:
- `already up to date (version)` - No update needed
- `updated to version (hash)` - Successfully upgraded

### Environment Variables

```bash
RADIUS_HOME                         # Override default ~/.radius directory
RADIUS_SESSION                      # Session ID for implicit multi-command session
RADIUS_FORMAT                       # Output mode: "compact" or "json"
RADIUS_CDN_URL                      # Override update server URL (advanced)
RADIUS_DEBUG=1                      # Enable debug logging
```

| Variable | Purpose |
|----------|---------|
| `RADIUS_HOME` | Override default `~/.radius` data directory |
| `RADIUS_SESSION` | Session ID — once set, subsequent commands auto-inherit session |
| `RADIUS_FORMAT` | Output mode: `compact` suppresses tag footer; `json` for machine-readable |
| `RADIUS_CDN_URL` | Override update server URL (advanced) |
| `RADIUS_DEBUG` | Enable debug logging (`1` or `module1,module2`) |
| `RADIUS_NO_COLOR` | Disable ANSI color output |

## Guidelines

1. Use `ping` to verify daemon health before complex operations
2. `upgrade` is non-destructive - old versions are preserved in `~/.radius/bin/<hash>/`
3. Updates download in background and don't interrupt current operations
4. Signature verification ensures binary integrity
5. Set `RADIUS_SESSION` to share state across multiple radius commands without `--tag`
6. Use `RADIUS_FORMAT=compact` for LLM call contexts; `json` for machine parsing

## Examples

Check system health:

```bash
radius ping
```

Force update to latest version:

```bash
radius upgrade
```

Debug daemon issues:

```bash
RADIUS_DEBUG=1 radius ping
```
