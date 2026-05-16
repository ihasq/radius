# Extensions

Radius uses VSCode extensions for language support. Extensions provide LSP server configurations and language definitions.

## Install Extensions

### From Open VSX Registry

```bash
radius ext install <publisher>.<name>
```

Example:

```bash
radius ext install rust-lang.rust-analyzer
```

This downloads the extension from [Open VSX](https://open-vsx.org/) and extracts it to `~/.radius/extensions/`.

### From Local Directory

```bash
radius ext install ./path/to/extension
```

Useful for development or custom extensions.

## List Extensions

```bash
radius ext list
```

Output:

```
Installed extensions:

  rust-lang.rust-analyzer  v0.4.2900 [ra_syntax_tree, rust]
  test.test-extension      v1.0.0    [typescript]
```

Each extension shows:
- Publisher and name
- Version
- Supported language IDs

## Remove Extensions

```bash
radius ext remove <publisher>.<name>
```

Example:

```bash
radius ext remove rust-lang.rust-analyzer
```

## How Extensions Work

### Language Detection

Extensions define file extension mappings in `package.json`:

```json
{
  "contributes": {
    "languages": [{
      "id": "rust",
      "extensions": [".rs"]
    }]
  }
}
```

When you run `radius read-var file.rs`, Radius:

1. Finds `.rs` → `rust` mapping from extensions
2. Looks up LSP server for `rust` language
3. Starts the LSP server if needed
4. Sends requests to the server

### LSP Server Detection

Radius uses **static extraction** to find LSP servers:

1. **Scans extension directories** for server binaries (`server/`, `bin/`)
2. **Falls back to PATH** using language ID → command mapping
3. **User config** in `~/.radius/lsp-servers.json`

Check detected servers:

```bash
radius lsp list
```

```
language            command                                 source
--------------------------------------------------------------------------------
typescript          typescript-language-server --stdio      extension (test.test-extension)
rust                rust-analyzer                           extension (rust-lang.rust-analyzer)
python              pylsp                                   user-config (~/.radius/lsp-servers.json)
go                  gopls                                   fallback
```

### Source Priority

1. **extension** - Extracted from installed extension
2. **user-config** - Defined in `~/.radius/lsp-servers.json`
3. **fallback** - Built-in default mapping

## Creating Extensions

For custom language support, create a minimal extension:

### Directory Structure

```
my-extension/
├── package.json
└── (optional) server/
    └── language-server
```

### package.json

```json
{
  "name": "my-language-support",
  "publisher": "my-org",
  "version": "1.0.0",
  "engines": {
    "vscode": "^1.70.0"
  },
  "contributes": {
    "languages": [{
      "id": "mylang",
      "extensions": [".mylang", ".ml"]
    }]
  }
}
```

### Install

```bash
radius ext install ./my-extension
```

### Configure LSP

If the server isn't bundled, add to `~/.radius/lsp-servers.json`:

```json
{
  "servers": {
    "mylang": {
      "command": "mylang-lsp",
      "args": ["--stdio"]
    }
  }
}
```
