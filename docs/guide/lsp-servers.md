# LSP Server Configuration

Radius uses Language Server Protocol (LSP) for semantic code operations. You can configure custom LSP servers or override defaults.

## Configuration File

Create `~/.radius/lsp-servers.json`:

```json
{
  "servers": {
    "python": {
      "command": "pylsp",
      "args": []
    },
    "go": {
      "command": "gopls",
      "args": ["serve"]
    },
    "cpp": {
      "command": "clangd",
      "args": ["--background-index"]
    }
  }
}
```

## Resolution Priority

LSP servers are resolved in this order:

1. **Extensions** - Installed VSCode extensions with bundled servers
2. **User Config** - `~/.radius/lsp-servers.json`
3. **Fallback Table** - Built-in defaults

Higher priority sources override lower ones for the same language.

## View Active Servers

```bash
radius lsp list
```

Output:

```
language            command                                 source
--------------------------------------------------------------------------------
typescript          typescript-language-server --stdio      extension (test.test-extension)
rust                rust-analyzer                           extension (rust-lang.rust-analyzer)
python              pylsp                                   user-config (~/.radius/lsp-servers.json)
go                  gopls serve                             fallback
java                jdtls                                   fallback
```

## Built-in Fallbacks

| Language | Command | Args |
|----------|---------|------|
| typescript | typescript-language-server | --stdio |
| typescriptreact | typescript-language-server | --stdio |
| javascript | typescript-language-server | --stdio |
| javascriptreact | typescript-language-server | --stdio |
| rust | rust-analyzer | |
| python | pylsp | |
| go | gopls | |
| java | jdtls | |
| csharp | omnisharp | |

## Examples

### Pyright instead of pylsp

```json
{
  "servers": {
    "python": {
      "command": "pyright-langserver",
      "args": ["--stdio"]
    }
  }
}
```

### Clangd for C/C++

```json
{
  "servers": {
    "c": {
      "command": "clangd",
      "args": ["--background-index", "--clang-tidy"]
    },
    "cpp": {
      "command": "clangd",
      "args": ["--background-index", "--clang-tidy"]
    }
  }
}
```

### Zls for Zig

```json
{
  "servers": {
    "zig": {
      "command": "zls",
      "args": []
    }
  }
}
```

## Error Handling

If the config file has invalid JSON:

- Radius logs a warning
- Daemon continues with fallback/extension servers
- No crash or interruption

```
[extension-host] Failed to parse ~/.radius/lsp-servers.json: JSON Parse error...
```

## Troubleshooting

### Server not found

```
[lsp] failed to start: Executable not found in $PATH: "my-server"
```

Ensure the server binary is in your PATH:

```bash
which my-server
```

### Server crashes

Check if the server works standalone:

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' | my-server --stdio
```

### Wrong language ID

Verify the language ID matches what extensions expect:

```bash
radius ext list
# Check language IDs in brackets: [typescript, rust, ...]
```

Language IDs are case-sensitive.
